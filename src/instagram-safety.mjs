import { chmod, mkdir, open, readFile, rename, writeFile, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from './config.mjs';

export const INSTAGRAM_SAFETY_LIMITS = Object.freeze({
  loginCooldownMs: 24 * 60 * 60 * 1000,
  profileCooldownMs: 15 * 60 * 1000,
  syncCooldownMs: 6 * 60 * 60 * 1000,
  operationLockMs: 2 * 60 * 1000
});

const DEFAULT_STATE = Object.freeze({
  schemaVersion: 1,
  lastLoginAttemptAt: null,
  loginBlockedUntil: null,
  lastProfileAttemptAt: null,
  lastProfileSuccessAt: null,
  lastSyncAttemptAt: null,
  lastSyncAt: null,
  safetyHold: null,
  cachedProfile: null
});
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function validTimestamp(value) {
  return value === null || value === undefined || (typeof value === 'string' && Number.isFinite(Date.parse(value)));
}

function validate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 1) {
    const error = new Error('File pengaman Instagram rusak/tidak valid. Semua operasi Instagram diblokir sampai diperiksa.');
    error.code = 'IG_SAFETY_STATE_INVALID';
    throw error;
  }
  for (const field of ['lastLoginAttemptAt', 'loginBlockedUntil', 'lastProfileAttemptAt', 'lastProfileSuccessAt', 'lastSyncAttemptAt', 'lastSyncAt']) {
    if (!validTimestamp(value[field])) {
      const error = new Error(`Field ${field} pada file pengaman Instagram tidak valid. Operasi diblokir.`);
      error.code = 'IG_SAFETY_STATE_INVALID';
      throw error;
    }
  }
  if (value.safetyHold !== null && value.safetyHold !== undefined
    && (typeof value.safetyHold !== 'object' || typeof value.safetyHold.reason !== 'string')) {
    const error = new Error('Status safety hold pada file pengaman tidak valid. Operasi diblokir.');
    error.code = 'IG_SAFETY_STATE_INVALID';
    throw error;
  }
  if (value.cachedProfile !== null && value.cachedProfile !== undefined
    && (typeof value.cachedProfile !== 'object' || typeof value.cachedProfile.username !== 'string')) {
    const error = new Error('Cache profil pada file pengaman tidak valid. Operasi diblokir.');
    error.code = 'IG_SAFETY_STATE_INVALID';
    throw error;
  }
  return { ...DEFAULT_STATE, ...value };
}

export async function readInstagramSafetyState(filePath = config.instagram.guardFile) {
  try {
    return validate(JSON.parse(await readFile(filePath, 'utf8')));
  } catch (error) {
    if (error.code === 'ENOENT') return { ...DEFAULT_STATE };
    if (error instanceof SyntaxError) {
      const invalid = new Error('File pengaman Instagram rusak. Jangan hapus atau reset otomatis.');
      invalid.code = 'IG_SAFETY_STATE_INVALID';
      throw invalid;
    }
    throw error;
  }
}

export async function writeInstagramSafetyState(state, filePath = config.instagram.guardFile) {
  const safe = validate({ ...state, schemaVersion: 1 });
  const absolute = path.resolve(filePath);
  const directory = path.dirname(absolute);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const temporary = `${absolute}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(safe, null, 2), { mode: 0o600, flag: 'wx' });
    await rename(temporary, absolute);
    await chmod(absolute, 0o600);
  } finally {
    await unlink(temporary).catch(() => {});
  }
  return safe;
}

async function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === 'EPERM'; }
}

async function isStaleLock(lockPath) {
  let before;
  try { before = await stat(lockPath); }
  catch (error) { if (error.code === 'ENOENT') return true; throw error; }
  let owner = null;
  try { owner = JSON.parse(await readFile(lockPath, 'utf8')); } catch { /* incomplete/corrupt locks are reclaimed only after age threshold */ }
  const age = Date.now() - before.mtimeMs;
  if (age < INSTAGRAM_SAFETY_LIMITS.operationLockMs) return false;
  if (owner?.pid && await processIsAlive(Number(owner.pid))) return false;
  try {
    const current = await stat(lockPath);
    if (current.ino !== before.ino || current.mtimeMs !== before.mtimeMs) return false;
    await unlink(lockPath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return true;
    throw error;
  }
}

export async function withInstagramSafetyLock(task, { guardFile = config.instagram.guardFile } = {}) {
  const absoluteGuard = path.resolve(guardFile);
  const lockPath = `${absoluteGuard}.lock`;
  await mkdir(path.dirname(lockPath), { recursive: true, mode: 0o700 });
  let handle;
  let token;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      token = randomUUID();
      handle = await open(lockPath, 'wx', 0o600);
      await handle.writeFile(JSON.stringify({ pid: process.pid, token, createdAt: new Date().toISOString() }));
      await handle.sync();
      break;
    } catch (error) {
      await handle?.close().catch(() => {});
      handle = undefined;
      if (error.code !== 'EEXIST') throw error;
      if (await isStaleLock(lockPath)) continue;
      await wait(100);
    }
  }
  if (!handle) {
    const error = new Error('Operasi Instagram lain sedang berjalan atau lock masih aktif. Operasi ditolak; jangan hapus lock secara manual tanpa memeriksa proses.');
    error.code = 'IG_OPERATION_LOCKED';
    throw error;
  }
  await chmod(lockPath, 0o600);
  try {
    return await task();
  } finally {
    await handle.close().catch(() => {});
    try {
      const owner = JSON.parse(await readFile(lockPath, 'utf8'));
      if (owner.token === token && owner.pid === process.pid) await unlink(lockPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

export function remaining(until, now = Date.now()) {
  const timestamp = Date.parse(until || '');
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : 0;
}

export function classifyInstagramRisk(message = '') {
  return /checkpoint|challenge|rate.?limit|too many|feedback_required|login_required|challenge_required|blocked|suspended|temporar(il)?y unavailable|authentication|session.*(invalid|expired)|login.*(fail|reject)/i.test(String(message));
}

export async function assertNoInstagramHold() {
  const state = await readInstagramSafetyState();
  if (state.safetyHold) {
    throw new Error(`Instagram sedang dalam SAFETY HOLD: ${state.safetyHold.reason}. Hentikan permintaan dan periksa akun melalui aplikasi resmi. Jangan reset hold otomatis.`);
  }
  return state;
}

export async function recordInstagramRisk(error) {
  if (!classifyInstagramRisk(error?.message || error)) return;
  const state = await readInstagramSafetyState();
  state.safetyHold = {
    reason: String(error?.message || error).slice(0, 240),
    createdAt: new Date().toISOString(),
    manualReviewRequired: true
  };
  await writeInstagramSafetyState(state);
}
