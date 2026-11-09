const STATUS = Object.freeze({
  0: 'ERROR',
  1: 'PENDING',
  2: 'SERVER_ACK',
  3: 'DELIVERY_ACK',
  4: 'READ',
  5: 'PLAYED'
});
const STATUS_RANK = Object.freeze({ ERROR: -1, PENDING: 0, SERVER_ACK: 1, DELIVERY_ACK: 2, READ: 3, PLAYED: 4, RELAY_UNCONFIRMED: -1 });
const DEFAULT_MAX = 2000;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

function asTimestamp(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  if (typeof value === 'object' && typeof value.toNumber === 'function') {
    const number = value.toNumber();
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

function normalizeStatus(value) {
  if (typeof value === 'string' && STATUS_RANK[value] !== undefined) return value;
  const numeric = Number(value);
  return Number.isInteger(numeric) ? STATUS[numeric] || null : null;
}

function keyId(key) {
  return typeof key?.id === 'string' && key.id.trim() ? key.id.trim() : null;
}

function safeJid(value) {
  return typeof value === 'string' && value.length <= 160 ? value : null;
}

export function createMessageDeliveryTracker({ logger = console, maxEntries = DEFAULT_MAX, ttlMs = DEFAULT_TTL_MS, now = Date.now } = {}) {
  const records = new Map();
  let eventCounts = { updates: 0, receipts: 0, trackedSends: 0, relayErrors: 0 };

  function prune() {
    const cutoff = now() - ttlMs;
    for (const [id, record] of records) {
      if (record.updatedAt < cutoff) records.delete(id);
    }
    while (records.size > maxEntries) records.delete(records.keys().next().value);
  }

  function ensure(key, source = 'event') {
    const id = keyId(key);
    if (!id) return null;
    let record = records.get(id);
    if (!record) {
      record = {
        id,
        chatJid: safeJid(key.remoteJid),
        fromMe: key.fromMe === true,
        participant: safeJid(key.participant),
        status: 'PENDING',
        statusCode: 1,
        receipts: {},
        source,
        createdAt: now(),
        updatedAt: now(),
        relayError: null
      };
      records.set(id, record);
    } else {
      if (!record.chatJid && safeJid(key.remoteJid)) record.chatJid = safeJid(key.remoteJid);
      if (key.fromMe === true) record.fromMe = true;
      if (!record.participant && safeJid(key.participant)) record.participant = safeJid(key.participant);
      record.updatedAt = now();
    }
    prune();
    return record;
  }

  function applyStatus(record, nextStatus, statusCode = null) {
    if (!record || !nextStatus) return false;
    const currentRank = STATUS_RANK[record.status] ?? -1;
    const nextRank = STATUS_RANK[nextStatus] ?? -1;
    if (nextRank >= currentRank || nextStatus === 'ERROR') {
      record.status = nextStatus;
      if (statusCode != null) record.statusCode = statusCode;
      record.updatedAt = now();
      return true;
    }
    return false;
  }

  function trackSent(key, { source = 'sendMessage' } = {}) {
    const id = keyId(key);
    const alreadyTracked = id ? records.has(id) : false;
    const record = ensure(key, source);
    if (!record) return null;
    record.fromMe = true;
    record.source = source;
    record.updatedAt = now();
    if (!alreadyTracked) eventCounts.trackedSends += 1;
    logger.debug?.({ messageId: record.id, source }, '[WHATSAPP DELIVERY] Outbound message registered');
    return record;
  }

  function trackRelayStart(jid, messageId, source = 'relayMessage') {
    if (!messageId) return null;
    return trackSent({ id: messageId, remoteJid: jid, fromMe: true }, { source });
  }

  function markRelayError(messageId, error) {
    const record = records.get(messageId);
    if (!record) return;
    // A rejected promise does not prove WhatsApp did not accept the message.
    // Keep this explicitly ambiguous; never retry automatically here.
    const currentRank = STATUS_RANK[record.status] ?? -1;
    record.relayOutcome = 'UNCONFIRMED';
    record.relayError = String(error?.message || error || 'unknown').slice(0, 240);
    // A late timeout must not downgrade a status already confirmed by Baileys.
    if (currentRank <= STATUS_RANK.PENDING) record.status = 'RELAY_UNCONFIRMED';
    record.updatedAt = now();
    eventCounts.relayErrors += 1;
    logger.warn?.({ messageId, error: record.relayError }, '[WHATSAPP DELIVERY] Relay outcome is unknown; automatic resend suppressed');
  }

  function onMessagesUpdate(updates = []) {
    for (const item of updates || []) {
      const key = item?.key;
      if (!keyId(key) || key.fromMe !== true) continue;
      const record = ensure(key, 'messages.update');
      const raw = item?.update?.status;
      const status = normalizeStatus(raw);
      if (!status) continue;
      if (applyStatus(record, status, Number(raw))) {
        eventCounts.updates += 1;
        logger.info?.({ messageId: record.id, status, statusCode: Number(raw) }, '[WHATSAPP DELIVERY] Message status updated');
      }
    }
  }

  function onReceiptUpdate(updates = []) {
    for (const item of updates || []) {
      const key = item?.key;
      const receipt = item?.receipt || {};
      if (!keyId(key) || key.fromMe !== true) continue;
      const record = ensure(key, 'message-receipt.update');
      const userJid = safeJid(receipt.userJid || receipt.participant || receipt.user || 'unknown');
      const receivedAt = asTimestamp(receipt.receiptTimestamp);
      const readAt = asTimestamp(receipt.readTimestamp);
      const playedAt = asTimestamp(receipt.playedTimestamp);
      record.receipts[userJid] = {
        receivedAt: receivedAt ?? record.receipts[userJid]?.receivedAt ?? null,
        readAt: readAt ?? record.receipts[userJid]?.readAt ?? null,
        playedAt: playedAt ?? record.receipts[userJid]?.playedAt ?? null
      };
      const next = playedAt ? 'PLAYED' : readAt ? 'READ' : receivedAt ? 'DELIVERY_ACK' : null;
      if (applyStatus(record, next)) {
        eventCounts.receipts += 1;
        logger.info?.({ messageId: record.id, status: next, receiptCount: Object.keys(record.receipts).length }, '[WHATSAPP DELIVERY] User receipt updated');
      }
    }
  }

  function get(messageId) {
    prune();
    const record = records.get(String(messageId || ''));
    if (!record) return null;
    return structuredClone(record);
  }

  function recent(limit = 10) {
    prune();
    return [...records.values()].slice(-Math.max(1, Math.min(50, Number(limit) || 10))).reverse().map(record => structuredClone(record));
  }

  function stats() {
    prune();
    const byStatus = {};
    for (const record of records.values()) byStatus[record.status] = (byStatus[record.status] || 0) + 1;
    return { tracked: records.size, byStatus, ...eventCounts };
  }

  function attach(sock) {
    if (!sock?.ev) throw new TypeError('Baileys socket event emitter is required.');
    sock.ev.on('messages.update', onMessagesUpdate);
    sock.ev.on('message-receipt.update', onReceiptUpdate);

    const wrap = (methodName, getMessageId, source) => {
      const original = sock[methodName];
      if (typeof original !== 'function' || original.__whiskayDeliveryWrapped) return;
      const wrapped = async function (...args) {
        const jid = args[0];
        const options = args[2] || {};
        const preId = getMessageId === 'relay' ? options.messageId : null;
        if (preId) trackRelayStart(jid, preId, source);
        try {
          const result = await original.apply(this, args);
          const id = getMessageId === 'relay'
            ? (typeof result === 'string' ? result : result?.key?.id || preId)
            : result?.key?.id;
          if (id) trackSent({ id, remoteJid: jid, fromMe: true }, { source });
          return result;
        } catch (error) {
          if (preId) markRelayError(preId, error);
          throw error;
        }
      };
      Object.defineProperty(wrapped, '__whiskayDeliveryWrapped', { value: true });
      try {
        Object.defineProperty(sock, methodName, { configurable: true, writable: true, value: wrapped });
      } catch (error) {
        logger.warn?.({ methodName, error: error.message }, '[WHATSAPP DELIVERY] Could not instrument socket method');
      }
    };
    wrap('sendMessage', 'message', 'sendMessage');
    wrap('relayMessage', 'relay', 'relayMessage');

    Object.defineProperty(sock, 'whiskayDelivery', {
      configurable: true,
      enumerable: false,
      value: Object.freeze({ get, recent, stats })
    });
    return sock.whiskayDelivery;
  }

  return Object.freeze({ attach, trackSent, trackRelayStart, markRelayError, onMessagesUpdate, onReceiptUpdate, get, recent, stats });
}

export { STATUS as BAILEYS_MESSAGE_STATUS };
