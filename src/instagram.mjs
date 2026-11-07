import { chmod, lstat, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { ensurePrivateDirectory } from './security/filesystem.mjs';
import { config, PROJECT_ROOT } from './config.mjs';
import {
  assertNoInstagramHold,
  readInstagramSafetyState,
  writeInstagramSafetyState,
  withInstagramSafetyLock,
  remaining,
  recordInstagramRisk,
  INSTAGRAM_SAFETY_LIMITS
} from './instagram-safety.mjs';

const SESSION_FILE = config.instagram.sessionFile;
const STATS_FILE = config.instagram.statsFile;
const PYTHON_BRIDGE = path.join(PROJECT_ROOT, 'python', 'instagram_bridge.py');
let profileRequest;
let syncRequest;

function runPython(action) {
  return new Promise((resolve, reject) => {
    const env = {
      PATH: process.env.PATH || '',
      HOME: process.env.HOME || '',
      LANG: process.env.LANG || 'C.UTF-8',
      IG_USERNAME: config.instagram.username,
      IG_SESSION_FILE: SESSION_FILE
    };
    if (action === 'login') env.IG_PASSWORD = process.env.IG_PASSWORD || '';

    const child = spawn(config.instagram.pythonBin, [PYTHON_BRIDGE, action], {
      cwd: PROJECT_ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let outputExceeded = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(reject, new Error('Python Instagram adapter melewati batas waktu 45 detik; operasi dihentikan.'));
    }, 45_000);
    timer.unref?.();

    child.stdout.setEncoding('utf8').on('data', chunk => {
      if (settled) return;
      stdout += chunk;
      if (stdout.length > 65536) {
        outputExceeded = true;
        child.kill('SIGKILL');
        finish(reject, new Error('Output adapter melebihi batas keamanan.'));
      }
    });
    child.stderr.setEncoding('utf8').on('data', chunk => {
      stderr += chunk;
      if (stderr.length > 8192) stderr = stderr.slice(-8192);
    });
    child.once('error', error => finish(reject, new Error(`Python Instagram adapter tidak dapat dijalankan: ${error.message}`)));
    child.once('close', code => {
      if (settled || outputExceeded) return;
      let payload;
      try { payload = JSON.parse(stdout.trim()); }
      catch {
        const detail = (stderr || stdout || `Python adapter exit ${code}`).trim().slice(0, 700);
        return finish(reject, new Error(detail || `Python adapter gagal (${code}).`));
      }
      if (code !== 0 || !payload.ok) return finish(reject, new Error(payload.error || `Python adapter gagal (${code}).`));
      finish(resolve, payload.data);
    });
  });
}

function normalizeProfile(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Respons profil Instagram kosong atau tidak valid.');
  }
  const username = String(data.username ?? '').trim().toLowerCase();
  if (!username || username !== config.instagram.username.toLowerCase()) {
    throw new Error('Username session tidak cocok dengan instagram.username. Operasi dihentikan.');
  }
  const counts = ['followers', 'following', 'posts'];
  for (const key of counts) {
    const value = Number(data[key]);
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`Data profil ${key} tidak valid; snapshot tidak disimpan.`);
    }
  }
  return {
    userId: String(data.userId ?? ''),
    username,
    fullName: String(data.fullName ?? '').slice(0, 150),
    followers: Number(data.followers),
    following: Number(data.following),
    posts: Number(data.posts),
    fetchedAt: data.fetchedAt && Number.isFinite(Date.parse(data.fetchedAt))
      ? data.fetchedAt : new Date().toISOString()
  };
}

async function inspectSessionFile() {
  try {
    const info = await lstat(SESSION_FILE);
    const regularFile = info.isFile() && !info.isSymbolicLink() && info.size > 0;
    return {
      exists: true,
      regularFile,
      private: regularFile && (info.mode & 0o077) === 0,
      size: info.size
    };
  } catch (error) {
    if (error.code === 'ENOENT') return { exists: false, regularFile: false, private: false, size: 0 };
    throw error;
  }
}

export async function assertInstagramSessionMissing(sessionFile = SESSION_FILE) {
  try {
    const info = await lstat(sessionFile);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new Error('Path session Instagram sudah ada tetapi bukan file reguler yang aman. Login ditolak.');
    }
    throw new Error('Session Instagram sudah tersedia. .iglogin ditolak untuk mencegah login ulang. Gunakan .igprofile; jangan hapus session untuk memaksa login.');
  } catch (error) {
    if (error.code === 'ENOENT') return true;
    throw error;
  }
}

export function deriveInstagramSetupStatus({ usernameConfigured, pythonAvailable, instagrapiAvailable, sessionExists, regularFile, sessionPrivate }) {
  if (!usernameConfigured) return 'USERNAME_MISSING';
  if (!pythonAvailable) return 'PYTHON_UNAVAILABLE';
  if (!instagrapiAvailable) return 'INSTAGRAPI_UNAVAILABLE';
  if (!sessionExists) return 'SESSION_MISSING';
  if (!regularFile) return 'SESSION_FILE_UNSAFE';
  if (!sessionPrivate) return 'SESSION_PERMISSION_UNSAFE';
  return 'SESSION_PRESENT_UNVERIFIED';
}

export async function inspectInstagramSetup() {
  const localSession = await inspectSessionFile();
  let pythonAvailable = false;
  let adapterVersion = null;
  let pythonVersion = null;
  let pythonError = null;
  try {
    const result = await runPython('doctor');
    pythonAvailable = true;
    adapterVersion = result.instagrapi;
    pythonVersion = result.python;
  } catch (error) {
    pythonError = error.message;
  }

  const usernameConfigured = Boolean(config.instagram.username);
  const status = deriveInstagramSetupStatus({
    usernameConfigured,
    pythonAvailable,
    instagrapiAvailable: Boolean(adapterVersion),
    sessionExists: localSession.exists,
    regularFile: localSession.regularFile,
    sessionPrivate: localSession.private
  });

  return {
    usernameConfigured,
    username: config.instagram.username || null,
    pythonBin: config.instagram.pythonBin,
    pythonAvailable,
    instagrapiAvailable: Boolean(adapterVersion),
    pythonVersion,
    adapterVersion,
    sessionExists: localSession.exists && localSession.regularFile,
    sessionPrivate: localSession.private,
    sessionSize: localSession.size,
    sessionFile: SESSION_FILE,
    ready: status === 'SESSION_PRESENT_UNVERIFIED',
    status,
    authenticationVerified: false,
    note: 'Pemeriksaan lokal tidak menghubungi Instagram dan tidak membuktikan session masih diterima server.',
    error: pythonError
  };
}

/** Explicit first login only. Existing session files are never overwritten. */
export async function initInstagramReadOnly() {
  return withInstagramSafetyLock(async () => {
    await assertNoInstagramHold();
    await assertInstagramSessionMissing();
    const state = await readInstagramSafetyState();
    const waitMs = remaining(state.loginBlockedUntil);
    if (waitMs) throw new Error(`Login ditahan oleh cooldown keamanan selama ${Math.ceil(waitMs / 3600000)} jam lagi.`);
    if (!process.env.IG_PASSWORD) throw new Error('IG_PASSWORD tidak tersedia. Login pertama tidak dapat dilakukan.');

    state.lastLoginAttemptAt = new Date().toISOString();
    state.loginBlockedUntil = new Date(Date.now() + INSTAGRAM_SAFETY_LIMITS.loginCooldownMs).toISOString();
    await writeInstagramSafetyState(state);
    try {
      const data = normalizeProfile(await runPython('login'));
      const next = await readInstagramSafetyState();
      next.lastProfileSuccessAt = data.fetchedAt;
      next.cachedProfile = data;
      await writeInstagramSafetyState(next);
      return { profile: data };
    } catch (error) {
      await recordInstagramRisk(error);
      throw error;
    } finally {
      // The bot process must not retain the first-login password in memory.
      delete process.env.IG_PASSWORD;
    }
  });
}

export async function getConnectedInstagramProfile({ refresh = false } = {}) {
  if (profileRequest) return profileRequest;
  profileRequest = withInstagramSafetyLock(async () => {
    await assertNoInstagramHold();
    const session = await inspectSessionFile();
    if (!session.regularFile) throw new Error(`Session Instagram belum ditemukan atau bukan file reguler: ${SESSION_FILE}. Periksa config/app.json dan jangan login ulang jika file session sebenarnya berada di lokasi lain.`);
    if (!session.private) throw new Error('Permission session Instagram terlalu terbuka. Perbaiki menjadi 600 sebelum digunakan.');

    const state = await readInstagramSafetyState();
    const cached = state.cachedProfile;
    const cachedAt = Date.parse(cached?.fetchedAt || '');
    const cacheAge = Number.isFinite(cachedAt) ? Date.now() - cachedAt : Number.POSITIVE_INFINITY;
    if (!refresh && cached && cacheAge >= 0 && cacheAge < INSTAGRAM_SAFETY_LIMITS.profileCooldownMs) {
      return normalizeProfile(cached);
    }

    const nextAllowed = state.lastProfileAttemptAt
      ? Date.parse(state.lastProfileAttemptAt) + INSTAGRAM_SAFETY_LIMITS.profileCooldownMs : 0;
    const waitMs = remaining(nextAllowed ? new Date(nextAllowed).toISOString() : null);
    if (waitMs) throw new Error(`Pembacaan profil ditunda demi keamanan. Coba lagi dalam ${Math.ceil(waitMs / 60000)} menit.`);

    state.lastProfileAttemptAt = new Date().toISOString();
    await writeInstagramSafetyState(state);
    try {
      const data = normalizeProfile(await runPython('profile'));
      const next = await readInstagramSafetyState();
      next.lastProfileSuccessAt = data.fetchedAt;
      next.cachedProfile = data;
      await writeInstagramSafetyState(next);
      return data;
    } catch (error) {
      await recordInstagramRisk(error);
      throw error;
    }
  });
  try { return await profileRequest; }
  finally { profileRequest = undefined; }
}

async function readHistory(statsFile = STATS_FILE) {
  try {
    const data = JSON.parse(await readFile(statsFile, 'utf8'));
    if (!Array.isArray(data) || data.length > 2000) throw new Error('Format/ukuran riwayat statistik tidak valid.');
    for (const [index, row] of data.entries()) {
      if (!row || typeof row !== 'object' || !Number.isFinite(Date.parse(row.date || ''))
        || !Number.isSafeInteger(row.followers) || row.followers < 0
        || !Number.isSafeInteger(row.following) || row.following < 0
        || !Number.isSafeInteger(row.posts) || row.posts < 0) {
        throw new Error(`Snapshot statistik nomor ${index + 1} tidak valid.`);
      }
    }
    return data;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw new Error(`Gagal membaca statistik Instagram: ${error.message}`);
  }
}

async function writeHistory(history, statsFile = STATS_FILE) {
  await ensurePrivateDirectory(path.dirname(statsFile));
  const temporary = `${statsFile}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(history.slice(-2000), null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await chmod(temporary, 0o600);
    await rename(temporary, statsFile);
    await chmod(statsFile, 0o600);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

async function appendSnapshot({ followers, following, posts, source = 'manual' }, statsFile = STATS_FILE) {
  for (const [key, value] of Object.entries({ followers, following, posts })) {
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${key} harus bilangan bulat >= 0`);
  }
  if (!['manual', 'instagrapi-session-readonly'].includes(source)) {
    throw new TypeError('Source snapshot statistik tidak diizinkan.');
  }
  const history = await readHistory(statsFile);
  const previous = history.at(-1) || null;
  const current = { date: new Date().toISOString(), followers, following, posts, source };
  history.push(current);
  await writeHistory(history, statsFile);
  return { current, previous, growth: previous ? followers - previous.followers : null };
}

export async function recordInstagramStats(snapshot) {
  return withInstagramSafetyLock(() => appendSnapshot(snapshot));
}

export async function syncConnectedProfileStats() {
  if (syncRequest) throw new Error('Sinkronisasi Instagram sedang berjalan. Tunggu sampai selesai.');
  syncRequest = withInstagramSafetyLock(async () => {
    await assertNoInstagramHold();
    const session = await inspectSessionFile();
    if (!session.regularFile) throw new Error(`Session Instagram belum ditemukan: ${SESSION_FILE}. Sinkronisasi dibatalkan.`);
    if (!session.private) throw new Error('Permission session Instagram terlalu terbuka. Perbaiki menjadi 600 sebelum digunakan.');

    const state = await readInstagramSafetyState();
    const history = await readHistory();
    const lastRemote = [...history].reverse().find(row => row.source === 'instagrapi-session-readonly');
    const snapshotWait = remaining(lastRemote?.date
      ? new Date(Date.parse(lastRemote.date) + INSTAGRAM_SAFETY_LIMITS.syncCooldownMs).toISOString() : null);
    if (snapshotWait) throw new Error(`Sinkronisasi ditunda demi keamanan. Coba lagi dalam ${Math.ceil(snapshotWait / 60000)} menit (batas minimal 6 jam).`);
    const attemptWait = remaining(state.lastSyncAttemptAt
      ? new Date(Date.parse(state.lastSyncAttemptAt) + INSTAGRAM_SAFETY_LIMITS.syncCooldownMs).toISOString() : null);
    if (attemptWait) throw new Error(`Sinkronisasi ditunda demi keamanan. Coba lagi dalam ${Math.ceil(attemptWait / 60000)} menit (batas 6 jam).`);

    state.lastSyncAttemptAt = new Date().toISOString();
    await writeInstagramSafetyState(state);
    try {
      let normalized = state.cachedProfile;
      const cachedAt = Date.parse(normalized?.fetchedAt || '');
      if (!normalized || !Number.isFinite(cachedAt) || Date.now() - cachedAt >= INSTAGRAM_SAFETY_LIMITS.profileCooldownMs) {
        normalized = normalizeProfile(await runPython('profile'));
      } else {
        normalized = normalizeProfile(normalized);
      }
      const result = await appendSnapshot({
        followers: normalized.followers,
        following: normalized.following,
        posts: normalized.posts,
        source: 'instagrapi-session-readonly'
      });
      const next = await readInstagramSafetyState();
      next.lastSyncAt = new Date().toISOString();
      next.lastProfileSuccessAt = normalized.fetchedAt;
      next.cachedProfile = normalized;
      await writeInstagramSafetyState(next);
      return result;
    } catch (error) {
      await recordInstagramRisk(error);
      throw error;
    }
  });
  try { return await syncRequest; }
  finally { syncRequest = undefined; }
}

export async function getInstagramHistory() {
  const history = await readHistory();
  return history.map(row => ({ ...row }));
}

export async function getInstagramStats() {
  const history = await readHistory();
  const current = history.at(-1) || null;
  const currentSource = current?.source || 'manual';
  const previous = [...history].reverse().find(row => row !== current && (row.source || 'manual') === currentSource) || null;
  return {
    current,
    previous,
    growth: current && previous ? current.followers - previous.followers : null,
    snapshots: history.length
  };
}
