import { chmod, lstat, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config, PROJECT_ROOT } from '../src/config.mjs';

process.umask(0o077);
// Full recursive repair is performed once. Runtime uses umask 077, so
// files created after the marker are owner-only without rescanning thousands
// of existing WhatsApp key files on every startup.
const totals = { filesFixed: 0, directoriesFixed: 0, missing: 0, symlinksSkipped: 0 };
const marker = path.join(path.dirname(config.growth.databaseFile), '.permissions-v1');
let alreadyAudited = false;
try { const info = await lstat(marker); alreadyAudited = info.isFile() && !info.isSymbolicLink(); } catch {}

async function secureFile(file) {
  let info;
  try { info = await lstat(file); }
  catch (error) { if (error.code === 'ENOENT') { totals.missing += 1; return; } throw error; }
  if (info.isSymbolicLink()) { totals.symlinksSkipped += 1; return; }
  if (!info.isFile()) return;
  if ((info.mode & 0o777) !== 0o600) { await chmod(file, 0o600); totals.filesFixed += 1; }
}

async function secureDirectory(directory, recursive = true) {
  let info;
  try { info = await lstat(directory); }
  catch (error) { if (error.code === 'ENOENT') { totals.missing += 1; return; } throw error; }
  if (info.isSymbolicLink()) { totals.symlinksSkipped += 1; return; }
  if (!info.isDirectory()) throw new Error(`Path privat bukan direktori: ${directory}`);
  if ((info.mode & 0o777) !== 0o700) { await chmod(directory, 0o700); totals.directoriesFixed += 1; }
  if (!recursive) return;

  const entries = await readdir(directory, { withFileTypes: true });
  for (let i = 0; i < entries.length; i += 64) {
    const batch = entries.slice(i, i + 64);
    await Promise.all(batch.map(async entry => {
      const full = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) { totals.symlinksSkipped += 1; return; }
      if (entry.isDirectory()) return secureDirectory(full, true);
      if (entry.isFile()) return secureFile(full);
    }));
  }
}

try {
  await secureFile(path.join(PROJECT_ROOT, '.env'));
  if (alreadyAudited) await secureFile(marker);
  const privateDirectories = new Set([
    config.whatsapp.sessionDir,
    path.dirname(config.instagram.sessionFile),
    path.dirname(config.identity.lidMapFile),
    path.dirname(config.instagram.statsFile),
    path.dirname(config.instagram.guardFile),
    path.dirname(config.growth.databaseFile)
  ].map(value => path.resolve(value)));
  for (const directory of privateDirectories) await secureDirectory(directory, !alreadyAudited);

  if (!alreadyAudited) {
    const dataDir = path.dirname(config.growth.databaseFile);
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    await chmod(dataDir, 0o700);
    await writeFile(marker, `audited=${new Date().toISOString()}\n`, { mode: 0o600 });
    await chmod(marker, 0o600);
  }

  const changed = totals.filesFixed + totals.directoriesFixed;
  if (changed) console.log(`[SECURITY] Izin otomatis diperbaiki: ${totals.filesFixed} file (600), ${totals.directoriesFixed} direktori (700).`);
  else console.log(alreadyAudited ? '[SECURITY] Permission aman; audit penuh sebelumnya tersimpan.' : '[SECURITY] Izin file rahasia dan direktori privat sudah aman.');
  if (totals.symlinksSkipped) console.log(`[SECURITY] ${totals.symlinksSkipped} symlink dilewati (tidak diubah).`);
} catch (error) {
  console.error(`[SECURITY] Gagal mengamankan permission: ${error.message}`);
  process.exitCode = 1;
}
