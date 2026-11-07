import { open, readFile, unlink, mkdir, chmod, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

async function pidIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === 'EPERM'; }
}

/** Acquire an exclusive, crash-recoverable single-instance lock. */
export async function acquireProcessLock(file) {
  const absolute = path.resolve(file);
  await mkdir(path.dirname(absolute), { recursive: true, mode: 0o700 });
  const token = randomUUID();
  const payload = JSON.stringify({ pid: process.pid, token, startedAt: new Date().toISOString() });

  for (let attempt = 0; attempt < 6; attempt += 1) {
    let handle;
    try {
      handle = await open(absolute, 'wx', 0o600);
      await handle.writeFile(`${payload}\n`, 'utf8');
      await handle.sync();
      await handle.close();
      await chmod(absolute, 0o600);
      let released = false;
      return async () => {
        if (released) return;
        released = true;
        try {
          const current = JSON.parse(await readFile(absolute, 'utf8'));
          if (current.token === token && current.pid === process.pid) await unlink(absolute);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      };
    } catch (error) {
      await handle?.close().catch(() => {});
      if (error.code !== 'EEXIST') throw error;

      let existing;
      try { existing = JSON.parse(await readFile(absolute, 'utf8')); }
      catch (readError) {
        if (readError.code === 'ENOENT') continue;
        // The creator may have opened the file but not written its JSON yet.
        let age = 0;
        try { age = Date.now() - (await stat(absolute)).mtimeMs; }
        catch (statError) { if (statError.code === 'ENOENT') continue; throw statError; }
        if (age < 5000) {
          await new Promise(resolve => setTimeout(resolve, 50));
          continue;
        }
        existing = null;
      }
      if (existing && await pidIsAlive(Number(existing.pid))) {
        const conflict = new Error(`WHISKAY sudah berjalan (PID ${existing.pid}). Hentikan proses yang lama sebelum menjalankan npm start lagi.`);
        conflict.code = 'EALREADY';
        throw conflict;
      }
      try { await unlink(absolute); }
      catch (unlinkError) { if (unlinkError.code !== 'ENOENT') throw unlinkError; }
    }
  }
  const error = new Error('Tidak dapat memperoleh runtime lock setelah beberapa percobaan.');
  error.code = 'ELOCKED';
  throw error;
}
