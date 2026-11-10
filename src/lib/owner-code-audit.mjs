import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export function createOwnerCodeAuditStore({ filePath, retention = 1000, logger = console, now = Date.now } = {}) {
  if (!filePath) throw new TypeError('owner-code audit filePath wajib diisi.');
  let state;
  let writes = Promise.resolve();

  async function persist() {
    const snapshot = JSON.stringify(state, null, 2) + '\n';
    writes = writes.catch(() => {}).then(async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
      const temp = `${filePath}.${process.pid}.tmp`;
      await fs.writeFile(temp, snapshot, { mode: 0o600 });
      await fs.rename(temp, filePath);
      await fs.chmod(filePath, 0o600).catch(() => {});
    });
    await writes;
  }

  async function load() {
    if (state) return;
    try {
      state = JSON.parse(await fs.readFile(filePath, 'utf8'));
      if (!Array.isArray(state.records)) state.records = [];
    } catch (error) {
      if (error.code !== 'ENOENT') logger.warn?.({ error: error.message }, '[OWNER RUNTIME AUDIT] Invalid audit file; creating new state');
      state = { schemaVersion: 1, records: [] };
      await persist();
    }
  }

  async function record({ runtime, source, messageId, ok, durationMs, exitCode, errorCode } = {}) {
    await load();
    const sourceHash = createHash('sha256').update(String(source || '')).digest('hex');
    const item = {
      id: state.records.length ? state.records.at(-1).id + 1 : 1,
      at: now(),
      runtime: String(runtime || 'unknown').slice(0, 32),
      messageId: String(messageId || '').slice(0, 160) || null,
      sourceHash,
      sourceChars: String(source || '').length,
      ok: Boolean(ok),
      durationMs: Number.isFinite(durationMs) ? Math.max(0, Math.floor(durationMs)) : 0,
      exitCode: Number.isInteger(exitCode) ? exitCode : null,
      errorCode: String(errorCode || '').slice(0, 64) || null
    };
    state.records.push(item);
    state.records = state.records.slice(-retention);
    await persist();
    return { ...item };
  }

  async function list(limit = 20) {
    await load();
    return state.records.slice(-Math.max(1, Math.min(100, limit))).reverse().map(item => ({ ...item }));
  }

  return Object.freeze({ record, list });
}
