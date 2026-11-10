import { normalizeUserJid } from './lid-manager.mjs';

const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000;
const DEFAULT_MAX_RECORDS = 20000;
const DEFAULT_MAX_OUTBOUND = 2000;

function cleanJid(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (/^\d[\d-]{4,40}@g\.us$/.test(raw)) return raw;
  return normalizeUserJid(raw) || null;
}

function numericPart(value) {
  const jid = cleanJid(value);
  return jid ? jid.split('@')[0].split(':')[0].replace(/\D/g, '') : '';
}

export class SprMessageStore {
  #messages = new Map();
  #outbound = new Map();
  #ttlMs;
  #maxRecords;
  #maxOutbound;
  #now;

  constructor({ ttlMs = DEFAULT_TTL_MS, maxRecords = DEFAULT_MAX_RECORDS, maxOutbound = DEFAULT_MAX_OUTBOUND, now = Date.now } = {}) {
    this.#ttlMs = Math.max(60_000, Number(ttlMs) || DEFAULT_TTL_MS);
    this.#maxRecords = Math.max(100, Number(maxRecords) || DEFAULT_MAX_RECORDS);
    this.#maxOutbound = Math.max(50, Number(maxOutbound) || DEFAULT_MAX_OUTBOUND);
    this.#now = now;
  }

  save(message) {
    const key = message?.key || {};
    const chatJid = cleanJid(key.remoteJid);
    const senderJid = cleanJid(key.participant || key.remoteJid);
    const senderAlt = cleanJid(key.participantAlt || key.remoteJidAlt || key.participantPn || key.remoteJidPn);
    const id = String(key.id || '').trim();
    if (!chatJid || !senderJid || !id || key.fromMe === true) return null;
    const record = Object.freeze({
      id,
      chatJid,
      senderJid,
      senderAlt,
      senderNumber: numericPart(senderJid),
      senderAltNumber: numericPart(senderAlt),
      timestamp: this.#now()
    });
    this.#messages.set(`${chatJid}:${senderJid}:${id}`, record);
    this.prune();
    return record;
  }

  getLatest(target, chatJid) {
    const targetJid = cleanJid(target);
    const targetNumber = /^\+?\d[\d\s().-]{5,}$/.test(String(target || ''))
      ? String(target).replace(/\D/g, '')
      : numericPart(targetJid);
    const group = cleanJid(chatJid);
    if (!targetJid && !targetNumber) return null;
    if (group && !group.endsWith('@g.us')) return null;
    this.prune();
    const rows = [...this.#messages.values()].filter(row => {
      if (group && row.chatJid !== group) return false;
      return row.senderJid === targetJid || row.senderAlt === targetJid ||
        Boolean(targetNumber && (row.senderNumber === targetNumber || row.senderAltNumber === targetNumber));
    });
    rows.sort((a, b) => b.timestamp - a.timestamp);
    return rows[0] || null;
  }

  recordOutbound({ id, chatJid, senderJid, mode = 'spr' } = {}) {
    const messageId = String(id || '').trim();
    const chat = cleanJid(chatJid);
    if (!messageId || !chat || !(chat.endsWith('@s.whatsapp.net') || chat.endsWith('@lid'))) return null;
    const row = Object.freeze({ id: messageId, chatJid: chat, senderJid: cleanJid(senderJid), mode, timestamp: this.#now() });
    this.#outbound.set(messageId, row);
    while (this.#outbound.size > this.#maxOutbound) this.#outbound.delete(this.#outbound.keys().next().value);
    return row;
  }

  getOutbound(id) {
    const row = this.#outbound.get(String(id || '').trim());
    if (!row || this.#now() - row.timestamp > this.#ttlMs) {
      if (row) this.#outbound.delete(row.id);
      return null;
    }
    return row;
  }

  prune() {
    const cutoff = this.#now() - this.#ttlMs;
    for (const [key, row] of this.#messages) if (row.timestamp < cutoff) this.#messages.delete(key);
    for (const [key, row] of this.#outbound) if (row.timestamp < cutoff) this.#outbound.delete(key);
    while (this.#messages.size > this.#maxRecords) this.#messages.delete(this.#messages.keys().next().value);
    while (this.#outbound.size > this.#maxOutbound) this.#outbound.delete(this.#outbound.keys().next().value);
  }

  clearMessages() {
    const count = this.#messages.size;
    this.#messages.clear();
    return count;
  }

  stats() {
    this.prune();
    return { messages: this.#messages.size, outbound: this.#outbound.size, ttlMs: this.#ttlMs, maxRecords: this.#maxRecords };
  }
}

export const sprMessageStore = new SprMessageStore();
