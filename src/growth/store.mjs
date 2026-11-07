import { chmod, mkdir, readFile, rename, writeFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { ensurePrivateDirectory } from '../security/filesystem.mjs';
import { config } from '../config.mjs';
import { calculateFollowerFunnel, recommendFollowerFunnelActions } from './funnel.mjs';
import { normalizeContentMetrics } from './content-intelligence.mjs';

const DB_FILE = config.growth.databaseFile;
const EMPTY = { version: 5, campaigns: [], contentPosts: [] };
const MAX_CAMPAIGNS = 2000;
const MAX_CONTENT_POSTS = 500;
let queue = Promise.resolve();

async function readDb() {
  try {
    const parsed = JSON.parse(await readFile(DB_FILE, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Format database bukan object.');
    if (parsed.version !== undefined && ![1, 2, 3, 4, 5].includes(parsed.version)) throw new Error(`Versi database tidak didukung: ${parsed.version}`);
    for (const field of ['campaigns', 'contentPosts']) {
      if (parsed[field] !== undefined && !Array.isArray(parsed[field])) throw new Error(`Field database ${field} harus berupa array.`);
    }
    if ((parsed.campaigns?.length || 0) > MAX_CAMPAIGNS || (parsed.contentPosts?.length || 0) > MAX_CONTENT_POSTS) throw new Error('Database melewati batas record yang diizinkan.');
    const campaigns = (Array.isArray(parsed.campaigns) ? parsed.campaigns : []).map(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Campaign tersimpan bukan object.');
      const extracted = /^https:\/\/www\.instagram\.com\/([a-zA-Z0-9._]{1,30})\/?$/i.exec(String(item.target || ''));
      const accountUsername = String(item.accountUsername || extracted?.[1] || '').replace(/^@/, '').toLowerCase();
      const campaign = {};
      for (const key of ['id', 'name', 'target', 'status', 'baselineSnapshot', 'checkpoints', 'insights', 'insightsHistory', 'followerGoal', 'createdAt', 'updatedAt']) {
        if (Object.hasOwn(item, key)) campaign[key] = item[key];
      }
      campaign.accountUsername = /^[a-z0-9._]{1,30}$/.test(accountUsername) ? accountUsername : null;
      return campaign;
    });
    const campaignOwners = new Map(campaigns.map(item => [item.id, item.accountUsername]));
    const contentPosts = (Array.isArray(parsed.contentPosts) ? parsed.contentPosts : []).map(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Konten tersimpan bukan object.');
      const owner = item.accountUsername || (item.campaignId ? campaignOwners.get(item.campaignId) : null) || null;
      const content = {};
      for (const key of ['id', 'label', 'url', 'format', 'theme', 'publishedAt', 'campaignId', 'metrics', 'snapshots', 'createdAt', 'updatedAt']) {
        if (Object.hasOwn(item, key)) content[key] = item[key];
      }
      content.accountUsername = owner;
      return content;
    });
    return { version: 5, campaigns, contentPosts };
  } catch (error) {
    if (error.code === 'ENOENT') return structuredClone(EMPTY);
    throw new Error(`Growth database tidak bisa dibaca: ${error.message}`);
  }
}

async function writeDb(db) {
  await ensurePrivateDirectory(path.dirname(DB_FILE));
  const temp = `${DB_FILE}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(db, null, 2), { encoding: 'utf8', mode: 0o600 });
  await chmod(temp, 0o600);
  await rename(temp, DB_FILE);
  await chmod(DB_FILE, 0o600);
}

async function acquireStoreLock() {
  const lockDir = `${DB_FILE}.lock`;
  await ensurePrivateDirectory(path.dirname(DB_FILE));
  const deadline = Date.now() + 30_000;
  while (true) {
    try {
      await mkdir(lockDir, { mode: 0o700 });
      await writeFile(path.join(lockDir, 'owner.json'), JSON.stringify({ pid: process.pid, at: Date.now() }), { mode: 0o600 });
      return async () => rm(lockDir, { recursive: true, force: true });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const owner = JSON.parse(await readFile(path.join(lockDir, 'owner.json'), 'utf8'));
        const age = Date.now() - Number(owner.at || 0);
        let alive = true;
        try { process.kill(Number(owner.pid), 0); } catch (probe) { alive = probe.code === 'EPERM'; }
        if (age > 60_000 && !alive) { await rm(lockDir, { recursive: true, force: true }); continue; }
      } catch (readError) {
        if (readError.code === 'ENOENT') {
          try { if (Date.now() - (await stat(lockDir)).mtimeMs > 60_000) await rm(lockDir, { recursive: true, force: true }); } catch {}
        }
      }
      if (Date.now() >= deadline) throw new Error('Timeout menunggu lock database growth. Periksa proses bot/worker yang sedang berjalan.');
      await delay(40 + Math.floor(Math.random() * 60));
    }
  }
}

function mutate(fn) {
  const operation = queue.then(async () => {
    const release = await acquireStoreLock();
    try {
      const db = await readDb();
      const result = await fn(db);
      await writeDb(db);
      return result;
    } finally { await release(); }
  });
  queue = operation.catch(() => {});
  return operation;
}

/** Rewrite growth records into the v5 single-session organic schema using explicit allowlists; every unknown legacy field is discarded. */
export async function migrateGrowthState() {
  return mutate(db => ({ version: db.version, campaigns: db.campaigns.length, contentPosts: db.contentPosts.length }));
}

export async function getGrowthOverview() {
  await queue;
  const db = await readDb();
  return {
    campaignCount: db.campaigns.length,
    activeCampaigns: db.campaigns.filter(x => x.status === 'ACTIVE').length,
    contentCount: db.contentPosts.length
  };
}

export async function getCampaigns() { await queue; return (await readDb()).campaigns.slice().reverse(); }

export async function getCampaign(id) {
  const wanted = String(id || '').trim().toLowerCase();
  if (!wanted || wanted.length > 80) throw new TypeError('Campaign ID tidak valid.');
  await queue;
  return (await readDb()).campaigns.find(item => item.id.toLowerCase() === wanted) || null;
}

function normalizeCampaignSnapshot(snapshot, label = 'snapshot') {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new TypeError(`${label} harus object.`);
  const normalized = {
    date: String(snapshot.date || snapshot.fetchedAt || new Date().toISOString()),
    followers: snapshot.followers,
    following: snapshot.following,
    posts: snapshot.posts,
    source: String(snapshot.source || 'instagrapi-session-readonly')
  };
  if (!Number.isFinite(Date.parse(normalized.date))) throw new TypeError(`${label}.date tidak valid.`);
  for (const key of ['followers', 'following', 'posts']) {
    if (!Number.isSafeInteger(normalized[key]) || normalized[key] < 0) throw new TypeError(`${label}.${key} harus integer >= 0.`);
  }
  if (!['manual', 'instagrapi-session-readonly'].includes(normalized.source)) throw new TypeError(`${label}.source tidak diizinkan.`);
  return normalized;
}

export async function recordCampaignCheckpoint(id, snapshot) {
  const normalized = normalizeCampaignSnapshot(snapshot, 'checkpoint');
  return mutate(db => {
    const campaign = db.campaigns.find(item => item.id.toLowerCase() === String(id || '').trim().toLowerCase());
    if (!campaign) throw new Error(`Campaign ${id} tidak ditemukan.`);
    if (['COMPLETED', 'CANCELED'].includes(campaign.status)) throw new Error(`Campaign sudah terminal: ${campaign.status}`);
    campaign.checkpoints = Array.isArray(campaign.checkpoints) ? campaign.checkpoints : [];
    campaign.checkpoints.push(normalized);
    if (campaign.checkpoints.length > 500) campaign.checkpoints.splice(0, campaign.checkpoints.length - 500);
    campaign.updatedAt = new Date().toISOString();
    return campaign;
  });
}

export async function recordCampaignInsights(id, metrics) {
  const funnel = calculateFollowerFunnel(metrics);
  return mutate(db => {
    const campaign = db.campaigns.find(item => item.id.toLowerCase() === String(id || '').trim().toLowerCase());
    if (!campaign) throw new Error(`Campaign ${id} tidak ditemukan.`);
    if (['COMPLETED', 'CANCELED'].includes(campaign.status)) throw new Error(`Campaign sudah terminal: ${campaign.status}`);
    const snapshot = { reach: funnel.reach, impressions: funnel.impressions, profileVisits: funnel.profileVisits,
      follows: funnel.follows, source: 'manual-instagram-insights', recordedAt: new Date().toISOString() };
    campaign.insightsHistory = Array.isArray(campaign.insightsHistory) ? campaign.insightsHistory : (campaign.insights ? [campaign.insights] : []);
    campaign.insightsHistory.push(snapshot);
    if (campaign.insightsHistory.length > 90) campaign.insightsHistory.splice(0, campaign.insightsHistory.length - 90);
    campaign.insights = snapshot;
    campaign.updatedAt = snapshot.recordedAt;
    return campaign;
  });
}

function normalizeGoalDeadline(value) {
  const deadline = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) throw new TypeError('Deadline harus berformat YYYY-MM-DD.');
  const parsed = new Date(`${deadline}T23:59:59.999Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== deadline) throw new TypeError('Tanggal deadline tidak valid.');
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const deadlineUtc = new Date(`${deadline}T00:00:00.000Z`);
  const daysFromToday = Math.ceil((deadlineUtc.getTime() - todayUtc.getTime()) / 86_400_000);
  if (daysFromToday < 1 || daysFromToday > 730) throw new RangeError('Deadline harus 1–730 hari dari hari ini (UTC).');
  return deadline;
}

export async function setCampaignFollowerGoal(id, targetFollowers, deadline) {
  if (!Number.isSafeInteger(targetFollowers) || targetFollowers < 1 || targetFollowers > 1_000_000_000) {
    throw new TypeError('Target followers harus integer 1–1.000.000.000.');
  }
  const normalizedDeadline = normalizeGoalDeadline(deadline);
  return mutate(db => {
    const campaign = db.campaigns.find(item => item.id.toLowerCase() === String(id || '').trim().toLowerCase());
    if (!campaign) throw new Error(`Campaign ${id} tidak ditemukan.`);
    if (['COMPLETED', 'CANCELED'].includes(campaign.status)) throw new Error(`Campaign sudah terminal: ${campaign.status}`);
    const baseline = campaign.baselineSnapshot || (Array.isArray(campaign.checkpoints) ? campaign.checkpoints[0] : null);
    if (!baseline) throw new Error('Campaign memerlukan baseline follower. Jalankan .igsync sebelum membuat campaign atau catat checkpoint pertama.');
    if (targetFollowers <= baseline.followers) throw new RangeError('Target followers harus lebih tinggi dari baseline campaign.');
    campaign.followerGoal = { targetFollowers, deadline: normalizedDeadline, updatedAt: new Date().toISOString() };
    campaign.updatedAt = campaign.followerGoal.updatedAt;
    return campaign;
  });
}

function buildFollowerGoalProgress(goal, baseline, latest, now = new Date()) {
  if (!goal || !baseline) return null;
  const currentFollowers = latest?.followers ?? baseline.followers;
  const targetFollowers = goal.targetFollowers;
  const requiredFollowers = Math.max(0, targetFollowers - currentFollowers);
  const deadlineAt = new Date(`${goal.deadline}T23:59:59.999Z`).getTime();
  const remainingMs = deadlineAt - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(remainingMs / 86_400_000));
  const achieved = currentFollowers >= targetFollowers;
  const overdue = !achieved && remainingMs < 0;
  const plannedIncrease = targetFollowers - baseline.followers;
  const achievedIncrease = currentFollowers - baseline.followers;
  return {
    targetFollowers, currentFollowers, requiredFollowers, deadline: goal.deadline, daysRemaining,
    requiredNetFollowersPerDay: achieved || overdue ? null : requiredFollowers / Math.max(1, daysRemaining),
    progressPct: plannedIncrease > 0 ? (achievedIncrease / plannedIncrease) * 100 : null,
    status: achieved ? 'ACHIEVED' : overdue ? 'OVERDUE' : 'IN_PROGRESS'
  };
}

export function buildCampaignProgress(campaign, now = new Date()) {
  if (!campaign) return null;
  const checkpoints = Array.isArray(campaign.checkpoints) ? campaign.checkpoints : [];
  const baseline = campaign.baselineSnapshot || checkpoints[0] || null;
  const latest = checkpoints.at(-1) || baseline;
  const followerDelta = baseline && latest ? latest.followers - baseline.followers : null;
  const growthPercent = baseline && latest && baseline.followers > 0
    ? (followerDelta / baseline.followers) * 100 : null;
  const funnel = campaign.insights ? calculateFollowerFunnel(campaign.insights) : null;
  return {
    campaign, baseline, latest, checkpoints: checkpoints.length, followerDelta, growthPercent,
    insights: campaign.insights || null,
    insightsHistoryCount: Array.isArray(campaign.insightsHistory) ? campaign.insightsHistory.length : (campaign.insights ? 1 : 0),
    funnel,
    funnelRecommendations: recommendFollowerFunnelActions(funnel),
    followerGoal: buildFollowerGoalProgress(campaign.followerGoal, baseline, latest, now)
  };
}

const CONTENT_FORMATS = new Set(['reel', 'post', 'story', 'video', 'carousel', 'live']);

function normalizeContentUrl(value) {
  const raw = String(value || '').trim();
  let parsed;
  try { parsed = new URL(raw); } catch { throw new TypeError('URL konten harus URL HTTPS Instagram yang valid.'); }
  const mediaPath = /^\/(?:p|reel|tv)\/[a-zA-Z0-9._-]{1,120}\/?$/.test(parsed.pathname);
  const storyPath = /^\/stories\/[a-zA-Z0-9._]{1,30}\/\d{1,30}\/?$/.test(parsed.pathname);
  if (parsed.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(parsed.hostname)
    || parsed.username || parsed.password || (!mediaPath && !storyPath)) {
    throw new TypeError('URL harus berupa tautan konten Instagram HTTPS (/p/, /reel/, /tv/, atau /stories/).');
  }
  return `https://www.instagram.com${parsed.pathname.endsWith('/') ? parsed.pathname : `${parsed.pathname}/`}`;
}

function normalizeContentPost(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Data konten harus object.');
  const label = String(input.label || '').trim();
  if (label.length < 2 || label.length > 80) throw new TypeError('Label konten harus 2–80 karakter.');
  const format = String(input.format || '').trim().toLowerCase();
  if (!CONTENT_FORMATS.has(format)) throw new TypeError(`Format konten harus salah satu: ${[...CONTENT_FORMATS].join(', ')}.`);
  const theme = String(input.theme || '').trim();
  if (theme.length < 2 || theme.length > 60) throw new TypeError('Tema konten harus 2–60 karakter.');
  const publishedAt = String(input.publishedAt || new Date().toISOString().slice(0, 10));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(publishedAt) || !Number.isFinite(Date.parse(`${publishedAt}T00:00:00.000Z`))
    || new Date(`${publishedAt}T00:00:00.000Z`).toISOString().slice(0, 10) !== publishedAt) {
    throw new TypeError('Tanggal publikasi harus YYYY-MM-DD yang valid.');
  }
  const campaignId = input.campaignId ? String(input.campaignId).trim() : null;
  if (campaignId && (campaignId.length > 80 || !/^CMP[a-z0-9]+$/i.test(campaignId))) throw new TypeError('Campaign ID tidak valid.');
  const accountUsername = String(input.accountUsername || '').trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(accountUsername)) throw new TypeError('Identitas konten harus berasal dari satu session Instagram aktif.');
  return { accountUsername, label, url: normalizeContentUrl(input.url), format, theme, publishedAt, campaignId,
    metrics: normalizeContentMetrics(input.metrics) };
}

export async function recordContentPerformance(input) {
  const normalized = normalizeContentPost(input);
  return mutate(db => {
    if (normalized.campaignId) {
      const linked = db.campaigns.find(item => item.id.toLowerCase() === normalized.campaignId.toLowerCase());
      if (!linked) throw new Error(`Campaign ${normalized.campaignId} tidak ditemukan.`);
      if (linked.accountUsername !== normalized.accountUsername) throw new Error('Campaign dan konten harus berasal dari session Instagram yang sama.');
    }
    const now = new Date().toISOString();
    let content = db.contentPosts.find(item => item.url === normalized.url);
    const snapshot = { metrics: normalized.metrics, recordedAt: now, source: 'manual-instagram-content-insights' };
    if (!content) {
      if (db.contentPosts.length >= MAX_CONTENT_POSTS) throw new Error(`Batas ${MAX_CONTENT_POSTS} konten tercapai.`);
      content = {
        id: `CNT${Date.now().toString(36).toUpperCase()}${randomUUID().slice(0, 4).toUpperCase()}`,
        ...normalized,
        metrics: normalized.metrics,
        snapshots: [snapshot],
        createdAt: now,
        updatedAt: now
      };
      db.contentPosts.push(content);
    } else {
      if (content.accountUsername !== normalized.accountUsername) throw new Error('Konten sudah terikat ke identitas session Instagram lain.');
      if (content.campaignId && normalized.campaignId && content.campaignId.toLowerCase() !== normalized.campaignId.toLowerCase()) {
        throw new Error('Konten sudah terhubung ke campaign berbeda. Gunakan campaign yang sama.');
      }
      Object.assign(content, {
        accountUsername: normalized.accountUsername, label: normalized.label, format: normalized.format, theme: normalized.theme,
        publishedAt: normalized.publishedAt, campaignId: normalized.campaignId || content.campaignId,
        metrics: normalized.metrics, updatedAt: now
      });
      content.snapshots = Array.isArray(content.snapshots) ? content.snapshots : [];
      content.snapshots.push(snapshot);
      if (content.snapshots.length > 90) content.snapshots.splice(0, content.snapshots.length - 90);
    }
    return content;
  });
}

export async function getContentPosts({ limit = 100, campaignId = null, accountUsername = null } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new TypeError('Limit konten harus integer 1–500.');
  await queue;
  let items = (await readDb()).contentPosts.slice().reverse();
  if (campaignId) items = items.filter(item => item.campaignId?.toLowerCase() === String(campaignId).toLowerCase());
  if (accountUsername) items = items.filter(item => item.accountUsername === String(accountUsername).replace(/^@/, '').toLowerCase());
  return items.slice(0, limit);
}

export async function getContentPost(id) {
  const wanted = String(id || '').trim().toLowerCase();
  if (!wanted || wanted.length > 80) throw new TypeError('Content ID tidak valid.');
  await queue;
  return (await readDb()).contentPosts.find(item => item.id.toLowerCase() === wanted) || null;
}

export async function createCampaign({ name, target, accountUsername, baselineSnapshot = null }) {
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) throw new TypeError('Nama campaign harus 2–80 karakter.');
  if (typeof target !== 'string' || target.trim().length < 8 || target.trim().length > 240 || !/^https:\/\//i.test(target.trim())) throw new TypeError('Target campaign harus URL HTTPS.');
  const username = String(accountUsername || '').trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(username)) throw new TypeError('Identitas campaign harus berasal dari single session Instagram aktif.');
  if (target.trim().replace(/\/$/, '').toLowerCase() !== `https://www.instagram.com/${username}`) throw new TypeError('Target campaign tidak cocok dengan identitas session Instagram aktif.');
  return mutate(db => {
    if (db.campaigns.length >= MAX_CAMPAIGNS) throw new Error('Batas penyimpanan campaign tercapai.');
    const campaign = {
      id: `CMP${Date.now().toString(36).toUpperCase()}${randomUUID().slice(0, 4).toUpperCase()}`,
      name: String(name).trim().slice(0, 80),
      target: String(target).trim().slice(0, 240),
      accountUsername: username,
      status: 'ACTIVE',
      baselineSnapshot: baselineSnapshot ? normalizeCampaignSnapshot(baselineSnapshot, 'baselineSnapshot') : null,
      checkpoints: [],
      insights: null,
      insightsHistory: [],
      followerGoal: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.campaigns.push(campaign);
    return campaign;
  });
}

export async function updateCampaignStatus(id, status) {
  if (!String(id || '').trim() || String(id).length > 80) throw new TypeError('Campaign ID tidak valid.');
  const next = String(status).toUpperCase();
  if (!['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELED'].includes(next)) throw new Error('Status campaign tidak dikenal.');
  return mutate(db => {
    const campaign = db.campaigns.find(x => x.id.toLowerCase() === String(id).toLowerCase());
    if (!campaign) throw new Error(`Campaign ${id} tidak ditemukan.`);
    if (['COMPLETED', 'CANCELED'].includes(campaign.status)) throw new Error(`Campaign sudah terminal: ${campaign.status}`);
    campaign.status = next;
    campaign.updatedAt = new Date().toISOString();
    return campaign;
  });
}
