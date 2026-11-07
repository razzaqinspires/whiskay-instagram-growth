import { CATALOG } from '../growth/catalog.mjs';
import {
  getCampaigns, getCampaign, buildCampaignProgress, recordCampaignCheckpoint, recordCampaignInsights, getGrowthOverview,
  createCampaign, updateCampaignStatus, setCampaignFollowerGoal,
  recordContentPerformance, getContentPosts, getContentPost
} from '../growth/store.mjs';
import { sanitizeError } from '../security/redact.mjs';
import { config } from '../config.mjs';
import { commandActionId } from '../lib/native-flow.mjs';
import { formatFollowerFunnel } from '../growth/funnel.mjs';
import { buildContentIntelligence, calculateContentMetrics, formatContentMetric } from '../growth/content-intelligence.mjs';
import { buildSessionCampaignTarget } from '../growth/session-target.mjs';
import {
  getConnectedInstagramProfile, getInstagramStats, initInstagramReadOnly,
  inspectInstagramSetup, recordInstagramStats, syncConnectedProfileStats
} from '../instagram.mjs';

const signed = value => `${value > 0 ? '+' : ''}${value}`;
const safeError = error => sanitizeError(error).message;

async function getActiveSessionIdentity() {
  return buildSessionCampaignTarget(await getConnectedInstagramProfile());
}

async function getActiveSessionCampaign(id) {
  const identity = await getActiveSessionIdentity();
  const campaign = await getCampaign(id);
  if (!campaign) return { identity, campaign: null };
  if (campaign.accountUsername !== identity.username) {
    throw new Error('Campaign ini terikat ke akun Instagram berbeda atau identitas legacy. WHISKAY hanya mendukung satu session Instagram aktif.');
  }
  return { identity, campaign };
}

export default {
  name: 'instagram-growth',
  commands: [
    {
      name: 'igpanel', aliases: ['igmenu'], category: 'Growth Dashboard', usage: '', description: 'Dashboard Instagram Growth Panel',
      async execute({ reply, sendInteractive }) {
        const [overview, stats] = await Promise.all([getGrowthOverview(), getInstagramStats()]);
        const lines = [
          '━━ WHISKAY IG GROWTH ━━',
          `Followers: ${stats.current?.followers ?? 'belum ada data'}`,
          `Growth terakhir: ${stats.growth === null ? 'belum ada pembanding' : signed(stats.growth)}`,
          `Campaign aktif: ${overview.activeCampaigns}`,
          `Konten dianalisis: ${overview.contentCount}`, 
          '',
          'Kelola pertumbuhan secara organik melalui konten, optimasi profil, komunitas, dan kolaborasi yang kamu kendalikan.',
          '',
          'Perintah cadangan jika tombol tidak muncul:',
          '.igstats  ·  .igservices  ·  .igcampaign list',
          '.igcheck  ·  .iggrowth  ·  .igfunnel',
          '.igcontent list  ·  .igcontent compare'
        ].join('\n');
        if (typeof sendInteractive === 'function') {
          await sendInteractive({
            title: 'WHISKAY · IG GROWTH',
            subtitle: 'Dashboard kampanye Instagram',
            body: lines,
            footer: 'Pilih menu. Respons tombol tetap melewati validasi owner.',
            buttons: [
              { type: 'quick_reply', title: 'Statistik', id: commandActionId('.igstats') },
              { type: 'quick_reply', title: 'Layanan', id: commandActionId('.igservices') },
              { type: 'quick_reply', title: 'Campaign', id: commandActionId('.igcampaign list') }
            ]
          });
        } else await reply(lines);
      }
    },
    {
      name: 'igservices', aliases: ['igcatalog'], category: 'Organic Growth', usage: '', description: 'Lihat daftar strategi pertumbuhan organik',
      async execute({ reply, sendInteractive }) {
        const body = 'Pilih strategi organik untuk melihat panduan praktis. Semua aktivitas dijalankan owner secara manual dan tetap berada dalam kendali satu akun Instagram aktif.\n\nJika pilihan interaktif tidak tersedia, gunakan .igservice <strategy-id>.';
        if (typeof sendInteractive === 'function') {
          await sendInteractive({
            title: 'IG ORGANIC PLAYBOOK',
            subtitle: 'Strategi pertumbuhan organik',
            body: body + '\n' + CATALOG.map(item => `• ${item.id}`).join('\n'),
            footer: 'Pilih satu strategi dari daftar.',
            buttons: [{
              type: 'single_select',
              title: 'Pilih strategi',
              listTitle: 'Strategi organik',
              sections: [{
                title: 'Pertumbuhan organik',
                rows: CATALOG.map(item => ({
                  id: commandActionId(`.igservice ${item.id}`),
                  title: item.name,
                  description: item.description.slice(0, 70)
                }))
              }]
            }]
          });
          return;
        }
        await reply(['━━ IG ORGANIC PLAYBOOK ━━', ...CATALOG.map(item => `${item.id}\n${item.name}\n${item.description}`), '', body].join('\n\n'));
      }
    },
    {
      name: 'igservice', category: 'Organic Growth', usage: '<strategy-id>', description: 'Lihat detail satu strategi organik',
      async execute({ args, reply }) {
        if (args.length !== 1) {
          return reply(`Format: .igservice <strategy-id>\nID tersedia: ${CATALOG.map(item => item.id).join(', ')}`);
        }
        const item = CATALOG.find(entry => entry.id === String(args[0]).toLowerCase());
        if (!item) return reply(`Strategi tidak ditemukan. ID tersedia: ${CATALOG.map(entry => entry.id).join(', ')}`);
        await reply([
          `━━ ${item.name.toUpperCase()} ━━`,
          item.description,
          '',
          'Ini adalah panduan aktivitas organik. Tidak ada tindakan follow otomatis; owner tetap mengendalikan pelaksanaan strategi.',
          'Lihat kampanye organik: .igcampaign list'
        ].join('\n'));
      }
    },
    {
      name: 'igcheck', aliases: ['igdiagnose'], category: 'Instagram Account', usage: '', description: 'Periksa Python adapter, versi instagrapi, dan session tanpa login',
      async execute({ reply }) {
        try {
          const status = await inspectInstagramSetup();
          await reply([
            '━━ INSTAGRAM ADAPTER CHECK ━━',
            `Username: ${status.usernameConfigured ? '@' + status.username : 'belum diisi'}`,
            `Python: ${status.pythonAvailable ? status.pythonVersion : 'tidak tersedia'}`,
            `instagrapi: ${status.adapterVersion || 'belum terpasang'}`,
            `Session: ${status.sessionExists ? 'tersedia' : 'belum ada'}`,
            `Session path: ${status.sessionFile}`,
            status.error ? `Detail: ${status.error}` : '',
            `Status: ${status.status}`,
            status.note ? `Catatan: ${status.note}` : ''
          ].filter(Boolean).join('\n'));
        } catch (error) { await reply(`Pemeriksaan Instagram gagal: ${safeError(error)}`); }
      }
    },
    {
      name: 'iglogin', aliases: ['igconnect'], category: 'Instagram Account', usage: '', description: 'Login pertama secara eksplisit; ditolak jika session lokal sudah ada',
      async execute({ reply }) {
        try {
          const { profile } = await initInstagramReadOnly();
          await reply([
            '━━ INSTAGRAM MODULE CONNECTED ━━',
            `Username: @${profile.username}`,
            `Followers: ${profile.followers}`,
            `Following: ${profile.following}`,
            `Posts: ${profile.posts}`,
            `Session: ${config.instagram.sessionFile}`,
            'Engine: Python instagrapi; session tersimpan privat.',
            'Login berikutnya menggunakan session; tidak ada login otomatis saat startup.'
          ].join('\n'));
        } catch (error) { await reply(`Koneksi Instagram gagal: ${safeError(error)}\nJangan mengulang login terus-menerus jika Instagram meminta checkpoint atau membatasi akses.`); }
      }
    },
    {
      name: 'igprofile', aliases: ['igme'], category: 'Instagram Account', usage: '', description: 'Baca profil akun dari session Instagram (read-only)',
      async execute({ reply }) {
        try {
          const profile = await getConnectedInstagramProfile();
          await reply([
            '━━ CONNECTED INSTAGRAM ━━',
            `Username: @${profile.username}`,
            `Nama: ${profile.fullName || '-'}`,
            `Followers: ${profile.followers}`,
            `Following: ${profile.following}`,
            `Posts: ${profile.posts}`,
            `Fetched: ${profile.fetchedAt}`,
            'Mode: SESSION-ONLY / READ-ONLY'
          ].join('\n'));
        } catch (error) {
          await reply(`Instagram belum terhubung: ${safeError(error)}\nPeriksa instagram.username, instagram.sessionFile, dan instagram.pythonBin pada config/app.json. IG_PASSWORD hanya diperlukan untuk login pertama saat session belum ada.`);
        }
      }
    },
    {
      name: 'igsync', category: 'Instagram Account', usage: '', description: 'Sinkronkan statistik profil dari session read-only',
      async execute({ reply }) {
        try {
          const result = await syncConnectedProfileStats();
          await reply(`Snapshot Instagram tersimpan.\nFollowers: ${result.current.followers}\nGrowth: ${result.growth === null ? 'belum ada pembanding' : signed(result.growth)}`);
        } catch (error) { await reply(`Gagal sinkron: ${safeError(error)}`); }
      }
    },
    {
      name: 'igsetstats', category: 'Instagram Account', usage: '<followers> <following> <posts>', description: 'Simpan statistik manual: followers following posts',
      async execute({ args, reply }) {
        if (args.length !== 3) return reply('Format: .igsetstats <followers> <following> <posts>');
        const values = args.map(Number);
        if (values.some(x => !Number.isSafeInteger(x) || x < 0)) return reply('Semua nilai harus bilangan bulat >= 0.');
        const result = await recordInstagramStats({ followers: values[0], following: values[1], posts: values[2] });
        await reply(`Snapshot disimpan. Followers: ${result.current.followers}\nGrowth: ${result.growth === null ? 'belum ada pembanding' : signed(result.growth)}`);
      }
    },
    {
      name: 'igstats', category: 'Instagram Analytics', usage: '', description: 'Statistik dan pertumbuhan follower',
      async execute({ reply }) {
        const data = await getInstagramStats();
        if (!data.current) return reply('Belum ada data. Gunakan .igsync atau .igsetstats.');
        await reply([
          '━━ INSTAGRAM STATISTICS ━━',
          `Followers: ${data.current.followers}`,
          `Following: ${data.current.following}`,
          `Posts: ${data.current.posts}`,
          `Growth: ${data.growth === null ? 'belum ada pembanding' : signed(data.growth)}`,
          `Snapshots: ${data.snapshots}`,
          `Source: ${data.current.source || 'manual'}`,
          `Updated: ${data.current.date}`
        ].join('\n'));
      }
    },
    {
      name: 'igcampaign', aliases: ['igcamp'], category: 'Growth Campaigns', usage: '<create|list|progress|goal|checkpoint|insights|pause|resume|complete|cancel> ...', description: 'Kelola campaign organik pada satu akun Instagram aktif dan analisis progresnya',
      async execute({ args, rawArgs, reply }) {
        const [action, ...rest] = args;
        if (action === 'create') {
          const name = rawArgs.slice('create'.length).trim();
          if (!name || name.includes('|')) {
            return reply('Format: .igcampaign create <nama campaign>\nContoh: .igcampaign create Organic Follower Growth\nAkun dan URL profil otomatis berasal dari satu session Instagram aktif.');
          }
          try {
            // One authenticated Instagram session is the only account identity source.
            const identity = await getActiveSessionIdentity();
            const currentStats = await getInstagramStats();
            const baselineSnapshot = currentStats.current ? {
              date: currentStats.current.date,
              followers: currentStats.current.followers,
              following: currentStats.current.following,
              posts: currentStats.current.posts,
              source: currentStats.current.source || 'manual'
            } : null;
            const campaign = await createCampaign({ name, target: identity.target, accountUsername: identity.username, baselineSnapshot });
            return reply([
              `Campaign dibuat: ${campaign.id}`,
              campaign.name,
              `Akun session: @${identity.username}`,
              `Target: ${campaign.target}`,
              `Identitas: session Instagram aktif`,
              'Mode: organic-only / single-session',
              `Status: ${campaign.status}`,
              baselineSnapshot ? `Baseline followers: ${baselineSnapshot.followers}` : 'Baseline belum tersedia; jalankan .igsync setelah membuat baseline awal.'
            ].join('\n'));
          } catch (error) { return reply(`Campaign gagal dibuat: ${safeError(error)}`); }
        }
        if (action === 'goal') {
          if (rest.length !== 3) return reply('Format: .igcampaign goal <ID> <target_followers> <YYYY-MM-DD>\nTarget harus lebih tinggi dari baseline campaign.');
          const targetFollowers = /^\d{1,10}$/.test(rest[1]) ? Number(rest[1]) : NaN;
          if (!Number.isSafeInteger(targetFollowers)) return reply('Target followers harus bilangan bulat positif.');
          try {
            const { campaign: existing } = await getActiveSessionCampaign(rest[0]);
            if (!existing) return reply('Campaign tidak ditemukan.');
            const campaign = await setCampaignFollowerGoal(rest[0], targetFollowers, rest[2]);
            const report = buildCampaignProgress(campaign);
            return reply([
              '━━ FOLLOWER GOAL SAVED ━━',
              `Campaign: ${campaign.id}`,
              `Baseline: ${report.baseline.followers}`,
              `Target: ${report.followerGoal.targetFollowers}`,
              `Tambahan bersih yang direncanakan: ${report.followerGoal.targetFollowers - report.baseline.followers}`,
              `Deadline: ${report.followerGoal.deadline}`,
              'Target adalah sasaran perencanaan, bukan jaminan atau instruksi follow otomatis.'
            ].join('\n'));
          } catch (error) { return reply(`Follower goal gagal disimpan: ${safeError(error)}`); }
        }
        if (action === 'list') {
          const identity = await getActiveSessionIdentity();
          const campaigns = (await getCampaigns()).filter(c => c.accountUsername === identity.username);
          return reply(campaigns.length ? [`━━ CAMPAIGNS · @${identity.username} ━━`, ...campaigns.slice(0, 20).map(c => {
            const report = buildCampaignProgress(c);
            const growth = report.followerDelta === null ? 'belum ada baseline' : `${report.followerDelta > 0 ? '+' : ''}${report.followerDelta} follower`;
            const goal = report.followerGoal ? `\nGoal: ${report.followerGoal.currentFollowers}/${report.followerGoal.targetFollowers} | ${report.followerGoal.status}` : '';
            return `${c.id} | ${c.status}\n${c.name} (@${c.accountUsername || 'unbound'})\n${growth} | checkpoint: ${report.checkpoints}${goal}`;
          })].join('\n\n') : 'Belum ada campaign.');
        }
        if (action === 'progress' || action === 'show') {
          if (!rest[0]) return reply('Format: .igcampaign progress <ID>');
          const { campaign } = await getActiveSessionCampaign(rest[0]);
          if (!campaign) return reply('Campaign tidak ditemukan.');
          const report = buildCampaignProgress(campaign);
          const delta = report.followerDelta === null ? 'belum tersedia' : `${report.followerDelta > 0 ? '+' : ''}${report.followerDelta}`;
          const pct = report.growthPercent === null ? 'belum dapat dihitung' : `${report.growthPercent > 0 ? '+' : ''}${report.growthPercent.toFixed(2)}%`;
          const insights = report.insights;
          return reply([
            '━━ CAMPAIGN PROGRESS ━━',
            `ID: ${campaign.id}`,
            `Nama: ${campaign.name}`,
            `Status: ${campaign.status}`,
            `Target: ${campaign.target}`,
            `Akun session: @${campaign.accountUsername}`,
            `Baseline followers: ${report.baseline?.followers ?? 'belum tersedia'}`,
            `Followers terakhir: ${report.latest?.followers ?? 'belum tersedia'}`,
            `Perubahan followers: ${delta}`,
            `Pertumbuhan relatif: ${pct}`,
            `Checkpoint: ${report.checkpoints}`,
            insights ? [
              'Instagram Insights (input manual):',
              `Reach: ${insights.reach}`,
              `Impressions: ${insights.impressions}`,
              `Profile visits: ${insights.profileVisits}`,
              `Follows: ${insights.follows}`,
              `Dicatat: ${insights.recordedAt}`,
              `Snapshot tersimpan: ${report.insightsHistoryCount}`
            ].join('\n') : 'Instagram Insights: belum dicatat.',
            report.funnel ? (() => {
              const rates = formatFollowerFunnel(report.funnel);
              return [
                'Conversion funnel:',
                `Reach → profile visit: ${rates.reachToProfileVisit}`,
                `Profile visit → follow: ${rates.profileVisitToFollow}`,
                `Reach → follow: ${rates.reachToFollow}`,
                `Follows / 1.000 reach: ${rates.followsPerThousandReach}`
              ].join('\n');
            })() : 'Conversion funnel: belum tersedia.',
            report.followerGoal ? [
              'Follower goal:',
              `${report.followerGoal.currentFollowers} / ${report.followerGoal.targetFollowers}`,
              `Sisa: ${report.followerGoal.requiredFollowers} | deadline ${report.followerGoal.deadline}`,
              `Hari tersisa: ${report.followerGoal.daysRemaining}`,
              `Progress terhadap target: ${report.followerGoal.progressPct === null ? 'n/a' : report.followerGoal.progressPct.toFixed(2) + '%'}`,
              `Pace bersih yang dibutuhkan: ${report.followerGoal.requiredNetFollowersPerDay === null ? 'tidak tersedia' : report.followerGoal.requiredNetFollowersPerDay.toFixed(2) + '/hari'}`,
              `Status: ${report.followerGoal.status}`
            ].join('\n') : 'Follower goal: belum diatur. Gunakan .igcampaign goal.',
            'Catatan: angka Instagram Insights dimasukkan manual. Perubahan follower akun tidak membuktikan atribusi campaign secara kausal.'
          ].join('\n'));
        }
        if (action === 'checkpoint') {
          if (!rest[0]) return reply('Format: .igcampaign checkpoint <ID>');
          try {
            const { campaign } = await getActiveSessionCampaign(rest[0]);
            if (!campaign) return reply('Campaign tidak ditemukan.');
            const snapshot = await syncConnectedProfileStats();
            await recordCampaignCheckpoint(campaign.id, snapshot.current);
            return reply(`Checkpoint campaign tersimpan.\nCampaign: ${campaign.id}\nFollowers: ${snapshot.current.followers}\nGrowth sejak baseline dapat dilihat dengan .igcampaign progress ${campaign.id}\nSinkronisasi tetap mengikuti cooldown keamanan Instagram.`);
          } catch (error) { return reply(`Checkpoint gagal: ${safeError(error)}`); }
        }
        if (action === 'insights') {
          if (rest.length !== 5) return reply('Format: .igcampaign insights <ID> <reach> <impressions> <profile_visits> <follows>');
          const [id, ...values] = rest;
          const numbers = values.map(value => /^\d{1,10}$/.test(value) ? Number(value) : NaN);
          if (numbers.some(value => !Number.isSafeInteger(value) || value < 0)) return reply('Semua metrik harus bilangan bulat >= 0. Salin angka dari Instagram Insights.');
          try {
            const { campaign: existing } = await getActiveSessionCampaign(id);
            if (!existing) return reply('Campaign tidak ditemukan.');
            const campaign = await recordCampaignInsights(id, {
              reach: numbers[0], impressions: numbers[1], profileVisits: numbers[2], follows: numbers[3]
            });
            return reply(`Metrik Instagram Insights tersimpan untuk ${campaign.id}.\nGunakan .igcampaign progress ${campaign.id} untuk melihat laporan.`);
          } catch (error) { return reply(`Metrik gagal disimpan: ${safeError(error)}`); }
        }
        const status = ({ pause: 'PAUSED', resume: 'ACTIVE', complete: 'COMPLETED', cancel: 'CANCELED' })[action];
        if (!status || !rest[0]) return reply([
          'Perintah campaign:',
          '.igcampaign create <nama campaign>  (target otomatis dari session Instagram aktif)',
          '.igcampaign list',
          '.igcampaign progress <ID>',
          '.igcampaign goal <ID> <target_followers> <YYYY-MM-DD>',
          '.igcampaign checkpoint <ID>',
          '.igcampaign insights <ID> <reach> <impressions> <profile_visits> <follows>',
          '.igcampaign pause|resume|complete|cancel <ID>'
        ].join('\n'));
        try {
          const { campaign: existing } = await getActiveSessionCampaign(rest[0]);
          if (!existing) return reply('Campaign tidak ditemukan.');
          const campaign = await updateCampaignStatus(rest[0], status);
          await reply(`Campaign ${campaign.id}: ${campaign.status}`);
        } catch (error) { await reply(`Campaign gagal diperbarui: ${safeError(error)}`); }
      }
    },
    {
      name: 'igfunnel', aliases: ['igconversion'], category: 'Follower Growth', usage: '<campaign-id>', description: 'Analisis funnel reach → profile visits → follows dan rekomendasi',
      async execute({ args, reply }) {
        if (args.length !== 1) return reply('Format: .igfunnel <campaign-id>\nCatat data lebih dulu dengan .igcampaign insights.');
        try {
          const { campaign } = await getActiveSessionCampaign(args[0]);
          if (!campaign) return reply('Campaign tidak ditemukan.');
          const report = buildCampaignProgress(campaign);
          if (!report.funnel) return reply(`Belum ada data Insights untuk ${campaign.id}.\nFormat: .igcampaign insights ${campaign.id} <reach> <impressions> <profile_visits> <follows>`);
          const rates = formatFollowerFunnel(report.funnel);
          return reply([
            '━━ FOLLOWER CONVERSION FUNNEL ━━',
            `Campaign: ${campaign.name} (${campaign.id})`,
            `Reach: ${report.funnel.reach}`,
            `Impressions: ${report.funnel.impressions}`,
            `Profile visits: ${report.funnel.profileVisits}`,
            `Follows: ${report.funnel.follows}`,
            '',
            `Reach → profile visit: ${rates.reachToProfileVisit}`,
            `Profile visit → follow: ${rates.profileVisitToFollow}`,
            `Reach → follow: ${rates.reachToFollow}`,
            `Impressions / reached account: ${rates.impressionsPerReach}`,
            `Follows / 1.000 reach: ${rates.followsPerThousandReach}`,
            '',
            'Rekomendasi:',
            ...report.funnelRecommendations.map((item, index) => `${index + 1}. ${item}`),
            '',
            `Riwayat snapshot: ${report.insightsHistoryCount} (maksimal 90)`,
            'Data berasal dari input owner. Funnel adalah diagnostik, bukan atribusi kausal atau jaminan follower.'
          ].join('\n'));
        } catch (error) { await reply(`Analisis funnel gagal: ${safeError(error)}`); }
      }
    },
    {
      name: 'igcontent', aliases: ['igpostinsights'], category: 'Content Intelligence',
      usage: '<add|list|report|compare> ...', description: 'Hubungkan performa konten dengan profile visits dan follows dari Instagram Insights',
      async execute({ args, rawArgs = '', reply }) {
        const action = String(args[0] || 'help').toLowerCase();
        if (action === 'add') {
          const fields = String(rawArgs).slice(4).trim().split('|').map(value => value.trim());
          if (fields.length !== 13) return reply([
            'Format: .igcontent add <campaign-id|->|<label>|<url>|<format>|<tema>|<reach>|<impressions>|<profile_visits>|<follows>|<likes>|<comments>|<shares>|<saves>',
            'Gunakan tanda | sebagai pemisah. Format: reel, post, story, video, carousel, live.',
            'Semua metrik harus disalin dari Insights konten untuk periode yang sama.'
          ].join('\n'));
          const [campaign, label, url, format, theme, ...rawMetrics] = fields;
          const numbers = rawMetrics.map(value => /^\d{1,10}$/.test(value) ? Number(value) : NaN);
          if (numbers.some(value => !Number.isSafeInteger(value) || value < 0)) return reply('Metrik reach, impressions, profile visits, follows, likes, comments, shares, dan saves harus integer >= 0.');
          try {
            const identity = await getActiveSessionIdentity();
            if (campaign !== '-') {
              const { campaign: linkedCampaign } = await getActiveSessionCampaign(campaign);
              if (!linkedCampaign) return reply('Campaign tidak ditemukan.');
            }
            const content = await recordContentPerformance({
              accountUsername: identity.username,
              campaignId: campaign === '-' ? null : campaign,
              label, url, format, theme,
              metrics: {
                reach: numbers[0], impressions: numbers[1], profileVisits: numbers[2], follows: numbers[3],
                likes: numbers[4], comments: numbers[5], shares: numbers[6], saves: numbers[7]
              }
            });
            const calculated = calculateContentMetrics(content.metrics);
            return reply([
              '━━ CONTENT INSIGHTS SAVED ━━',
              `ID: ${content.id}`,
              `Konten: ${content.label} (${content.format})`,
              `Tema: ${content.theme}`,
              `Snapshots: ${content.snapshots.length}`,
              `Profile visit rate: ${formatContentMetric(calculated.profileVisitRatePct)}`,
              `Visit → follow: ${formatContentMetric(calculated.profileVisitToFollowRatePct)}`,
              `Follow / 1.000 reach: ${formatContentMetric(calculated.followsPerThousandReach, '')}`,
              `Engagement rate: ${formatContentMetric(calculated.engagementRatePct)}`,
              'Data disimpan sebagai input manual Instagram Insights; bukan bukti atribusi kausal.'
            ].join('\n'));
          } catch (error) { return reply(`Data konten gagal disimpan: ${safeError(error)}`); }
        }

        if (action === 'list') {
          const limit = args[1] === undefined ? 15 : Number(args[1]);
          if (!Number.isSafeInteger(limit) || limit < 1 || limit > 30) return reply('Format: .igcontent list [1–30]');
          try {
            const identity = await getActiveSessionIdentity();
            const rows = await getContentPosts({ limit, accountUsername: identity.username });
            return reply(rows.length ? ['━━ TRACKED CONTENT ━━', ...rows.map(item => {
              const metrics = calculateContentMetrics(item.metrics);
              return `${item.id} | ${item.format.toUpperCase()} | ${item.theme}\n${item.label}\nReach ${metrics.reach} | Visits ${metrics.profileVisits} | Follows ${metrics.follows}\nVisit→Follow ${formatContentMetric(metrics.profileVisitToFollowRatePct)}`;
            })].join('\n\n') : 'Belum ada konten tercatat. Gunakan .igcontent add.');
          } catch (error) { return reply(`Daftar konten gagal dibaca: ${safeError(error)}`); }
        }

        if (action === 'report') {
          if (!args[1]) return reply('Format: .igcontent report <content-id>');
          try {
            const identity = await getActiveSessionIdentity();
            const content = await getContentPost(args[1]);
            if (!content || content.accountUsername !== identity.username) return reply('Content ID tidak ditemukan pada session Instagram aktif.');
            const metrics = calculateContentMetrics(content.metrics);
            return reply([
              '━━ CONTENT PERFORMANCE ━━',
              `ID: ${content.id}`,
              `Label: ${content.label}`,
              `Format / tema: ${content.format} / ${content.theme}`,
              `Campaign: ${content.campaignId || 'tidak ditautkan'}`,
              `URL: ${content.url}`,
              `Reach: ${metrics.reach} | Impressions: ${metrics.impressions}`,
              `Profile visits: ${metrics.profileVisits} | Follows: ${metrics.follows}`,
              `Likes: ${metrics.likes} | Comments: ${metrics.comments} | Shares: ${metrics.shares} | Saves: ${metrics.saves}`,
              `Profile visit rate: ${formatContentMetric(metrics.profileVisitRatePct)}`,
              `Visit → follow: ${formatContentMetric(metrics.profileVisitToFollowRatePct)}`,
              `Reach → follow: ${formatContentMetric(metrics.reachToFollowRatePct)}`,
              `Engagement rate: ${formatContentMetric(metrics.engagementRatePct)}`,
              `Saves / reach: ${formatContentMetric(metrics.saveRatePct)} | Shares / reach: ${formatContentMetric(metrics.shareRatePct)}`,
              `Snapshots: ${content.snapshots.length} | Terakhir diperbarui: ${content.updatedAt}`,
              'Catatan: metrik per konten dicatat manual dari Insights; bandingkan periode pelaporan yang setara.'
            ].join('\n'));
          } catch (error) { return reply(`Laporan konten gagal: ${safeError(error)}`); }
        }

        if (action === 'compare') {
          try {
            const identity = await getActiveSessionIdentity();
            const posts = await getContentPosts({ limit: 500, accountUsername: identity.username });
            const report = buildContentIntelligence(posts);
            const pct = value => formatContentMetric(value);
            const renderGroups = rows => rows.length ? rows.slice(0, 8).map(item =>
              `${item.label}: ${item.count} konten | ${item.follows} follows | Visit→Follow ${pct(item.profileVisitToFollowRatePct)} | Follow/1.000 reach ${formatContentMetric(item.followsPerThousandReach, '')}`
            ) : ['Belum ada data.'];
            const byFormat = renderGroups(report.byFormat);
            const byTheme = renderGroups(report.byTheme);
            const top = report.topContent.slice(0, 5).map((item, index) =>
              `${index + 1}. ${item.label || item.id} (${item.format}/${item.theme}) | ${item.metrics.follows} follows | ${formatContentMetric(item.metrics.followsPerThousandReach, '')}/1.000 reach`
            );
            return reply([
              '━━ CONTENT-TO-FOLLOWER INTELLIGENCE ━━',
              `Konten terpantau: ${report.contentCount}`,
              report.totals ? `Reach ${report.totals.reach} | Profile visits ${report.totals.profileVisits} | Follows ${report.totals.follows} | Engagements ${report.totals.engagements}` : 'Belum ada aggregate metrics.',
              '', 'Perbandingan format (weighted):', ...byFormat,
              '', 'Perbandingan tema (weighted):', ...byTheme,
              '', 'Konten dengan efisiensi follow tertinggi:', ...(top.length ? top : ['Belum cukup data reach untuk ranking.']),
              '', 'Rekomendasi:', ...report.recommendations.map((item, index) => `${index + 1}. ${item}`),
              '', 'Peringkat bersifat diagnostik dari data manual. Volume reach dan periode yang berbeda dapat mengubah perbandingan.'
            ].join('\n'));
          } catch (error) { return reply(`Analisis konten gagal: ${safeError(error)}`); }
        }

        return reply([
          '━━ CONTENT INTELLIGENCE COMMANDS ━━',
          '.igcontent add <campaign-id|->|<label>|<url>|<format>|<tema>|<reach>|<impressions>|<profile_visits>|<follows>|<likes>|<comments>|<shares>|<saves>',
          '.igcontent list [limit]',
          '.igcontent report <content-id>',
          '.igcontent compare',
          'Sumber data: Instagram Insights per konten, dimasukkan manual oleh owner.'
        ].join('\n'));
      }
    },
  ]
};
