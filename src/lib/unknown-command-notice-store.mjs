import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_STATE = Object.freeze({ enabled: false, updatedAt: null });

export function createUnknownCommandNoticeStore({ filePath, logger = console } = {}) {
  if (!filePath) throw new TypeError('filePath wajib diisi.');
  let cache = null;
  let writeQueue = Promise.resolve();

  async function read() {
    if (cache) return { ...cache };
    try {
      const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
      cache = { enabled: raw.enabled === true, updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : null };
    } catch (error) {
      if (error.code !== 'ENOENT') logger.warn?.('[UNKNOWN NOTICE] state read failed:', error.message);
      cache = { ...DEFAULT_STATE };
    }
    return { ...cache };
  }

  async function setEnabled(enabled) {
    if (typeof enabled !== 'boolean') throw new TypeError('enabled harus boolean.');
    const next = { enabled, updatedAt: Date.now() };
    writeQueue = writeQueue.then(async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
      const temporary = `${filePath}.${process.pid}.tmp`;
      await fs.writeFile(temporary, `${JSON.stringify(next, null, 2)}\\n`, { mode: 0o600 });
      await fs.rename(temporary, filePath);
      cache = next;
    });
    await writeQueue;
    return { ...next };
  }

  return Object.freeze({ get: read, setEnabled });
}

