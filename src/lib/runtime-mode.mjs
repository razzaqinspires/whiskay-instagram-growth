import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const VALID_MODES = new Set(['self', 'public']);

function normalizeState(value, fallback) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('File runtime mode harus berupa object JSON.');
  }
  const mode = String(value.mode ?? fallback.mode).toLowerCase();
  if (!VALID_MODES.has(mode)) throw new TypeError('Mode runtime harus self atau public.');
  const allowGroups = value.allowGroups ?? fallback.allowGroups;
  if (typeof allowGroups !== 'boolean') throw new TypeError('allowGroups runtime harus boolean.');
  return { version: 1, mode, allowGroups, updatedAt: value.updatedAt ?? null };
}

/**
 * Durable, atomic runtime access-mode state. Group access is a separate switch
 * and is enforced by the command router only while mode === "self".
 */
export function createRuntimeModeStore({
  filePath = path.resolve(process.cwd(), 'data/runtime-mode.json'),
  initialMode = 'self',
  initialAllowGroups = false
} = {}) {
  const fallback = normalizeState({ mode: initialMode, allowGroups: initialAllowGroups }, { mode: 'self', allowGroups: false });
  let cache = null;
  let writeQueue = Promise.resolve();

  async function load() {
    if (cache) return structuredClone(cache);
    try {
      const raw = JSON.parse(await readFile(filePath, 'utf8'));
      cache = normalizeState(raw, fallback);
    } catch (error) {
      if (error.code === 'ENOENT') cache = { ...fallback, updatedAt: null };
      else throw new Error(`Runtime mode tidak dapat dibaca: ${error.message}`);
    }
    return structuredClone(cache);
  }

  async function update(patch = {}) {
    const operation = writeQueue.then(async () => {
      const current = await load();
      const next = normalizeState({
        ...current,
        ...patch,
        version: 1,
        updatedAt: new Date().toISOString()
      }, fallback);
      const directory = path.dirname(filePath);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const temporary = `${filePath}.${process.pid}.tmp`;
      await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'w' });
      await chmod(temporary, 0o600);
      await rename(temporary, filePath);
      await chmod(filePath, 0o600);
      cache = next;
      return structuredClone(next);
    });
    writeQueue = operation.catch(() => {});
    return operation;
  }

  return Object.freeze({ get: load, update, filePath });
}
