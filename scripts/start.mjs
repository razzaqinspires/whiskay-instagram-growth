process.umask(0o077);
import { spawn } from 'node:child_process';
import { lstat } from 'node:fs/promises';
import { config, assertRuntimeConfig, PROJECT_ROOT } from '../src/config.mjs';
import { acquireProcessLock } from '../src/lib/process-lock.mjs';
import { waitForPromisesOrTimeout } from '../src/lib/process-supervisor.mjs';
import { migrateGrowthState } from '../src/growth/store.mjs';
import './check-permissions.mjs';

assertRuntimeConfig(config);
if (process.env.pm_id !== undefined || process.env.PM2_HOME) {
  throw new Error('WHISKAY sekarang berjalan langsung di terminal. Hapus aplikasi lama dari PM2, lalu jalankan npm start dari shell biasa.');
}
const releaseLock = await acquireProcessLock(config.growth.databaseFile.replace(/[^/]+$/, '.whiskay-runtime.lock'));
const root = PROJECT_ROOT;
const children = new Map();
let instagramSessionPathOccupied = false;
try { await lstat(config.instagram.sessionFile); instagramSessionPathOccupied = true; }
catch (error) { if (error.code !== 'ENOENT') throw error; }
let stopping = false;
let exitCode = 0;
let shutdownPromise;
let signalCount = 0;

console.log('[startup] Mode eksperimental privat; satu sesi Instagram aktif; pertumbuhan organik.');
console.log(`[startup] IG_PASSWORD hanya diteruskan ke proses bot saat path session belum ada: ${!instagramSessionPathOccupied ? 'eligible for explicit first login' : 'disabled because session path exists'}.`);
console.log('[startup] Menjalankan satu proses WhatsApp bot pada terminal ini.');
console.log('[startup] Tekan Ctrl+C satu kali untuk berhenti dengan graceful shutdown. Sinyal terminal ditangani launcher, lalu diteruskan ke child process.');

function childExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise(resolve => child.once('exit', resolve));
}

function launch(name, script) {
  const childEnv = { ...process.env };
  // Only the bot process can receive the first-login password. If any session
  // path object already exists (including an unsafe symlink), it receives no
  // password: an existing session must never trigger a password fallback.
  if (name !== 'bot' || instagramSessionPathOccupied) delete childEnv.IG_PASSWORD;
  const child = spawn(process.execPath, [script], {
    cwd: root,
    env: childEnv,
    stdio: 'inherit',
    windowsHide: true,
    detached: process.platform !== 'win32'
  });
  if (name === 'bot') delete process.env.IG_PASSWORD;
  children.set(name, child);
  child.once('error', error => {
    console.error(`[startup] ${name} gagal dijalankan: ${error.message}`);
    void shutdown(1);
  });
  child.once('exit', (code, signal) => {
    children.delete(name);
    if (!stopping) {
      exitCode = code && code !== 0 ? code : (signal ? 1 : 0);
      console.error(`[startup] ${name} berhenti${signal ? ` (${signal})` : ` dengan kode ${code}`}; menghentikan proses lainnya.`);
      void shutdown(exitCode);
    }
  });
  return child;
}

async function stopChildren() {
  const running = [...children.values()].filter(child => child.exitCode === null && child.signalCode === null);
  if (!running.length) return;
  const exits = running.map(childExit);
  for (const child of running) {
    try { child.kill('SIGTERM'); } catch { /* process already exited */ }
  }

  // The timeout is cleared as soon as all children exit. The old Promise.race
  // left its 10-second timer alive, which made a completed shutdown look stuck.
  const graceful = await waitForPromisesOrTimeout(exits, 15_000);
  if (graceful) return;

  console.error('[shutdown] Grace period ended; force-stopping remaining child processes...');
  for (const child of running) {
    if (child.exitCode === null && child.signalCode === null) {
      try { child.kill('SIGKILL'); } catch { /* process already exited */ }
    }
  }
  await waitForPromisesOrTimeout(exits, 2000);
}

async function shutdown(code = 0) {
  if (shutdownPromise) return shutdownPromise;
  stopping = true;
  exitCode = code;
  shutdownPromise = (async () => {
    console.log('\n[shutdown] Menghentikan bot...');
    try {
      await stopChildren();
      const remaining = [...children.values()].filter(child => child.exitCode === null && child.signalCode === null);
      if (remaining.length) console.error(`[shutdown] ${remaining.length} child process masih belum mengirim event exit.`);
      else console.log('[shutdown] Semua proses WHISKAY dihentikan.');
    } finally {
      await releaseLock().catch(error => console.error(`[shutdown] Gagal melepas runtime lock: ${error.message}`));
      process.exitCode = exitCode;
    }
  })();
  return shutdownPromise;
}

function handleSignal(signal) {
  signalCount += 1;
  if (signalCount === 1) {
    void shutdown(0);
    return;
  }
  console.warn(`[shutdown] Sinyal ${signal} kedua diterima; mempercepat penghentian child process.`);
  for (const child of children.values()) {
    if (child.exitCode === null && child.signalCode === null) {
      try { child.kill('SIGKILL'); } catch { /* process already exited */ }
    }
  }
}

process.on('SIGINT', () => handleSignal('SIGINT'));
process.on('SIGTERM', () => handleSignal('SIGTERM'));
process.on('SIGTSTP', () => handleSignal('SIGTSTP'));

const migration = await migrateGrowthState();
console.log(`[startup] Growth data v5: ${migration.campaigns} campaign(s), ${migration.contentPosts} content post(s); legacy fields outside the active organic schema discarded.`);
launch('bot', 'index.mjs');
