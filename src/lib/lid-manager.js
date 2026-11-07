import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const PN_SERVER = 's.whatsapp.net';
const LID_SERVER = 'lid';

export function normalizeUserJid(value) {
  if (typeof value !== 'string') return null;

  const raw = value.trim();
  if (!raw) return null;

  // Contact.phoneNumber may arrive as digits instead of a full JID.
  if (/^\+?\d{5,20}$/.test(raw)) {
    return `${raw.replace(/\D/g, '')}@${PN_SERVER}`;
  }

  const at = raw.lastIndexOf('@');
  if (at <= 0 || at === raw.length - 1) return null;

  // Remove device suffixes, e.g. 628xxx:12@s.whatsapp.net.
  const user = raw.slice(0, at).split(':', 1)[0];
  const server = raw.slice(at + 1).toLowerCase();
  if (!user) return null;

  if (server === 'c.us') return `${user}@${PN_SERVER}`;
  if (server !== PN_SERVER && server !== LID_SERVER) return null;

  return `${user}@${server}`;
}

const isPn = jid => typeof jid === 'string' && jid.endsWith(`@${PN_SERVER}`);
const isLid = jid => typeof jid === 'string' && jid.endsWith(`@${LID_SERVER}`);
const isGroup = jid => typeof jid === 'string' && jid.endsWith('@g.us');

function addPair(output, left, right, source) {
  const a = normalizeUserJid(left);
  const b = normalizeUserJid(right);
  if (!a || !b) return;

  if (isLid(a) && isPn(b)) output.push({ lid: a, pn: b, source });
  else if (isPn(a) && isLid(b)) output.push({ lid: b, pn: a, source });
}

export function pairFromKey(key = {}, source = 'message-key') {
  const pairs = [];
  const remote = normalizeUserJid(key.remoteJid);
  const participant = normalizeUserJid(key.participant);

  // Direct chats: remoteJidAlt is the documented alternate address.
  // remoteJidPn is accepted defensively if a build exposes that alias.
  if (remote && !isGroup(remote)) {
    addPair(pairs, remote, key.remoteJidAlt, source);
    addPair(pairs, remote, key.remoteJidPn, source);

    // senderPn is the counterpart PN in a direct chat when supplied.
    if (!participant) {
      addPair(pairs, remote, key.senderPn, source);
      addPair(pairs, remote, key.participantPn, source);
    }
  }

  // Groups: never pair the group remoteJid with a person's PN.
  // The participant and its alternate/PN fields identify the same author.
  if (participant) {
    addPair(pairs, participant, key.participantAlt, source);
    addPair(pairs, participant, key.participantPn, source);
    addPair(pairs, participant, key.senderPn, source);
  }

  return pairs;
}

function pairsFromContact(contact = {}, source = 'contact') {
  const pairs = [];
  const id = contact.id ?? contact.jid;
  addPair(pairs, id, contact.phoneNumber, source);
  addPair(pairs, id, contact.lid, source);
  addPair(pairs, contact.lid, contact.phoneNumber, source);
  return pairs;
}

function pairsFromMapping(row = {}, source = 'mapping-event') {
  const pairs = [];
  const lid = row.lid ?? row.lidJid;
  const pn = row.pn ?? row.pnJid ?? row.phoneNumber;
  addPair(pairs, lid, pn, source);
  return pairs;
}

export class LidManager {
  #sock;
  #file;
  #logger;
  #lidToPn = new Map();
  #writeQueue = Promise.resolve();

  constructor(sock, { file = process.env.LID_MAP_FILE || './data/lid-map.json', logger = console } = {}) {
    this.#sock = sock;
    this.#file = resolve(file);
    this.#logger = logger;
  }

  async load() {
    try {
      const parsed = JSON.parse(await readFile(this.#file, 'utf8'));
      const rows = Array.isArray(parsed) ? parsed : parsed?.pairs;
      for (const row of rows || []) {
        const pair = pairsFromMapping(row, 'disk');
        for (const item of pair) this.#lidToPn.set(item.lid, item.pn);
      }
      this.#logger.info?.(`[LID] loaded ${this.#lidToPn.size} mapping(s)`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.#logger.warn?.('[LID] failed to load local map:', error.message);
      }
    }
    return this;
  }

  async rememberPairs(input, source = 'unknown') {
    const cleaned = [];
    const seen = new Set();

    for (const raw of input || []) {
      const pairs = pairsFromMapping(raw, raw.source || source);
      for (const pair of pairs) {
        const signature = `${pair.lid}|${pair.pn}`;
        if (seen.has(signature)) continue;
        seen.add(signature);
        this.#lidToPn.set(pair.lid, pair.pn);
        cleaned.push({ lid: pair.lid, pn: pair.pn });
      }
    }

    if (!cleaned.length) return 0;

    await this.#persist();

    // Keep Baileys' own SignalRepository mapping cache in sync when available.
    try {
      await this.#sock.signalRepository?.lidMapping?.storeLIDPNMappings?.(cleaned);
    } catch (error) {
      this.#logger.warn?.('[LID] Baileys mapping-store update failed:', error.message);
    }

    this.#logger.debug?.(`[LID] stored ${cleaned.length} mapping(s) from ${source}`);
    return cleaned.length;
  }

  async rememberKey(key, source = 'message-key') {
    return this.rememberPairs(pairFromKey(key, source), source);
  }

  async rememberContact(contact, source = 'contact') {
    return this.rememberPairs(pairsFromContact(contact, source), source);
  }

  async getPNForLID(value) {
    const lid = normalizeUserJid(value);
    if (!isLid(lid)) return isPn(lid) ? lid : null;

    const local = this.#lidToPn.get(lid);
    if (local) return local;

    try {
      const fromBaileys = normalizeUserJid(
        await this.#sock.signalRepository?.lidMapping?.getPNForLID?.(lid)
      );
      if (isPn(fromBaileys)) {
        await this.rememberPairs([{ lid, pn: fromBaileys }], 'signalRepository');
        return fromBaileys;
      }
    } catch (error) {
      this.#logger.debug?.('[LID] Baileys lookup miss:', error.message);
    }

    // No reverse network lookup exists. Keep the original LID as the stable ID.
    return null;
  }

  async sameUser(left, right) {
    const a = normalizeUserJid(left);
    const b = normalizeUserJid(right);
    if (!a || !b) return false;
    if (a === b) return true;

    if (isLid(a) && isPn(b)) return (await this.getPNForLID(a)) === b;
    if (isPn(a) && isLid(b)) return (await this.getPNForLID(b)) === a;
    return false;
  }

  async #persist() {
    const snapshot = {
      updatedAt: new Date().toISOString(),
      pairs: [...this.#lidToPn.entries()].map(([lid, pn]) => ({ lid, pn }))
    };

    this.#writeQueue = this.#writeQueue
      .catch(() => {})
      .then(async () => {
        await mkdir(dirname(this.#file), { recursive: true });
        const temp = `${this.#file}.${process.pid}.tmp`;
        await writeFile(temp, JSON.stringify(snapshot, null, 2), 'utf8');
        await rename(temp, this.#file);
      });

    return this.#writeQueue;
  }
}

export async function attachLidManager(sock, options = {}) {
  const manager = await new LidManager(sock, options).load();
  const logger = options.logger || console;

  const safely = (promise, label) => {
    Promise.resolve(promise).catch(error => {
      logger.warn?.(`[LID] ${label} failed:`, error.message);
    });
  };

  sock.ev.on('messages.upsert', ({ messages = [] } = {}) => {
    for (const message of messages) {
      if (message?.key) safely(manager.rememberKey(message.key, 'messages.upsert'), 'messages.upsert');
    }
  });

  sock.ev.on('messages.update', updates => {
    for (const update of updates || []) {
      if (update?.key) safely(manager.rememberKey(update.key, 'messages.update'), 'messages.update');
    }
  });

  sock.ev.on('messaging-history.set', ({ messages = [], contacts = [], chats = [], lidPnMappings = [] } = {}) => {
    const pairs = [];

    for (const row of lidPnMappings) pairs.push(...pairsFromMapping(row, 'history.lidPnMappings'));
    for (const message of messages) pairs.push(...pairFromKey(message?.key, 'history.message'));
    for (const contact of contacts) pairs.push(...pairsFromContact(contact, 'history.contact'));
    for (const chat of chats) {
      addPair(pairs, chat?.id, chat?.pnJid, 'history.chat');
      addPair(pairs, chat?.id, chat?.lidJid, 'history.chat');
    }

    safely(manager.rememberPairs(pairs, 'messaging-history.set'), 'history sync');
  });

  sock.ev.on('lid-mapping.update', update => {
    const rows = Array.isArray(update) ? update : [update];
    const pairs = rows.flatMap(row => pairsFromMapping(row, 'lid-mapping.update'));
    safely(manager.rememberPairs(pairs, 'lid-mapping.update'), 'mapping event');
  });

  sock.ev.on('contacts.upsert', contacts => {
    const pairs = (contacts || []).flatMap(contact => pairsFromContact(contact, 'contacts.upsert'));
    safely(manager.rememberPairs(pairs, 'contacts.upsert'), 'contacts.upsert');
  });

  sock.ev.on('contacts.update', contacts => {
    const pairs = (contacts || []).flatMap(contact => pairsFromContact(contact, 'contacts.update'));
    safely(manager.rememberPairs(pairs, 'contacts.update'), 'contacts.update');
  });

  sock.ev.on('group-participants.update', update => {
    const pairs = [];
    addPair(pairs, update?.author, update?.authorPn, 'group-participants.update');
    for (const participant of update?.participants || []) {
      pairs.push(...pairsFromContact(participant, 'group-participants.update'));
    }
    safely(manager.rememberPairs(pairs, 'group-participants.update'), 'group participant map');
  });

  return manager;
}
