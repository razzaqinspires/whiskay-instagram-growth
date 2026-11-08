import { createRequire } from 'node:module';
import { readFile, writeFile, rename, chmod, lstat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const EXPECTED_VERSION = '7.0.0-rc14';
const ORIGINAL = /const\s+mediaType\s*=\s*getMediaType\(message\)\s*;/g;
const PATCHED = 'const mediaType = getMediaType(normalizeMessageContent(message) || message);';

export function patchBaileysViewOnceSource(source) {
  if (typeof source !== 'string') throw new TypeError('Baileys source harus berupa string.');
  if (/getMediaType\(normalizeMessageContent\(message\)\s*\|\|\s*message\)/.test(source)) {
    return { source, changed: false, reason: 'already-patched' };
  }
  if (!source.includes('normalizeMessageContent')) {
    throw new Error('normalizeMessageContent tidak diimpor pada messages-send.js; patch dibatalkan demi keamanan.');
  }
  const matches = [...source.matchAll(ORIGINAL)];
  if (matches.length !== 1) {
    throw new Error(`Ditemukan ${matches.length} target getMediaType(message); diharapkan tepat satu. Patch dibatalkan.`);
  }
  return { source: source.replace(ORIGINAL, PATCHED), changed: true, reason: 'patched' };
}

async function main() {
  let entry;
  try { entry = require.resolve('@whiskeysockets/baileys'); }
  catch { throw new Error('Baileys belum terpasang; jalankan npm install terlebih dahulu.'); }
  const libDir = path.dirname(entry);
  const packageRoot = path.resolve(libDir, '..');
  const packageJson = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  if (packageJson.version !== EXPECTED_VERSION) {
    throw new Error(`Versi Baileys ${packageJson.version} tidak cocok dengan pin ${EXPECTED_VERSION}; patch tidak diterapkan.`);
  }
  const target = path.join(libDir, 'Socket', 'messages-send.js');
  const info = await lstat(target);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Target Baileys bukan regular file; patch dibatalkan.');
  const source = await readFile(target, 'utf8');
  const result = patchBaileysViewOnceSource(source);
  if (!result.changed) {
    console.log('[BAILEYS PATCH] View Once mediatype normalization sudah tersedia.');
    return;
  }
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, result.source, { mode: info.mode & 0o777 });
    await chmod(temporary, info.mode & 0o777);
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
  console.log('[BAILEYS PATCH] View Once mediatype normalization diterapkan pada node_modules/@whiskeysockets/baileys/lib/Socket/messages-send.js.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(`[BAILEYS PATCH ERROR] ${error.message}`);
    process.exitCode = 1;
  });
}
