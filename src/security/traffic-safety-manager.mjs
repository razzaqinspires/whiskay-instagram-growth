import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULTS = Object.freeze({
  cooldown: { enabled: true, perCommandMs: 1800, notifyOnce: true },
  antiSpam: {
    enabled: true, windowMs: 10000, burstLimit: 5,
    warningThreshold: 3, banThreshold: 5, warningWindowMs: 3600000,
    banDurationMs: 900000
  },
  transport: { enabled: true, minIntervalMs: 1200, maxQueueSize: 1000 },
  queue: { enabled: true, auditRetention: 5000 }
});

function clone(value) { return structuredClone(value); }
function boundedInt(value, min, max, name) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} harus bilangan bulat ${min}–${max}.`);
  }
  return value;
}

export function createTrafficSafetyManager({ filePath, defaults = {}, logger = console, now = Date.now } = {}) {
  if (!filePath) throw new TypeError('traffic safety filePath wajib diisi.');
  const initial = {
    cooldown: { ...DEFAULTS.cooldown, ...(defaults.cooldown || {}) },
    antiSpam: { ...DEFAULTS.antiSpam, ...(defaults.antiSpam || {}) },
    transport: { ...DEFAULTS.transport, ...(defaults.transport || {}) },
    queue: { ...DEFAULTS.queue, ...(defaults.queue || {}) }
  };
  let state;
  let writes = Promise.resolve();

  async function persist() {
    const snapshot = JSON.stringify(state, null, 2) + '\n';
    writes = writes.catch(() => {}).then(async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
      const temporary = `${filePath}.${process.pid}.tmp`;
      await fs.writeFile(temporary, snapshot, { mode: 0o600 });
      await fs.rename(temporary, filePath);
      try { await fs.chmod(filePath, 0o600); } catch {}
    });
    await writes;
  }

  async function load() {
    if (state) return state;
    try {
      const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
      state = {
        schemaVersion: 1,
        settings: {
          cooldown: { ...initial.cooldown, ...(parsed.settings?.cooldown || {}) },
          antiSpam: { ...initial.antiSpam, ...(parsed.settings?.antiSpam || {}) },
          transport: { ...initial.transport, ...(parsed.settings?.transport || {}) },
          queue: { ...initial.queue, ...(parsed.settings?.queue || {}) }
        },
        users: parsed.users && typeof parsed.users === 'object' ? parsed.users : {},
        ingress: Array.isArray(parsed.ingress) ? parsed.ingress.slice(-initial.queue.auditRetention) : [],
        nextIngressId: Number.isSafeInteger(parsed.nextIngressId) ? parsed.nextIngressId : 1
      };
    } catch (error) {
      if (error.code !== 'ENOENT') logger.warn?.({ error: error.message }, '[TRAFFIC SAFETY] State file invalid; safe defaults loaded');
      state = { schemaVersion: 1, settings: clone(initial), users: {}, ingress: [], nextIngressId: 1 };
      await persist();
    }
    return state;
  }

  function senderKey(value) { return String(value || 'unknown').slice(0, 160); }
  function getUser(sender) {
    const key = senderKey(sender);
    state.users[key] ||= {
      lastCommandAt: {}, cooldownNotifiedUntil: {}, burstTimes: [],
      warningTimes: [], lastBurstAt: null, bannedUntil: 0, banNotified: false
    };
    return state.users[key];
  }

  async function recordInboundEvent({ sender, messageId, messageType = 'message', now: at = now() } = {}) {
    await load();
    const ingressId = state.nextIngressId++;
    state.ingress.push({
      id: ingressId, sender: senderKey(sender),
      command: null, messageId: String(messageId || '').slice(0, 160),
      messageType: String(messageType || 'message').slice(0, 48),
      receivedAt: at, decision: 'RECEIVED_AUDITED'
    });
    state.ingress = state.ingress.slice(-state.settings.queue.auditRetention);
    await persist();
    return { ingressId, queueNo: ingressId, status: 'RECORDED' };
  }

  async function inspectIncoming({ sender, command, messageId, ingressId: existingIngressId, now: at = now() } = {}) {
    await load();
    const key = senderKey(sender);
    const cmd = String(command || 'unknown').toLowerCase().slice(0, 64);
    const user = getUser(key);
    const existingRecord = Number.isSafeInteger(existingIngressId)
      ? state.ingress.find(item => item.id === existingIngressId)
      : null;
    const ingressId = existingRecord?.id || state.nextIngressId++;
    const record = existingRecord || { id: ingressId, sender: key, command: cmd, messageId: String(messageId || '').slice(0, 160), receivedAt: at, decision: 'QUEUED_FOR_PROCESSING' };
    record.sender = key;
    record.command = cmd;
    record.messageId = String(messageId || record.messageId || '').slice(0, 160);
    record.decision = 'QUEUED_FOR_PROCESSING';
    const saveRecord = () => {
      if (!existingRecord) state.ingress.push(record);
      state.ingress = state.ingress.slice(-state.settings.queue.auditRetention);
    };

    if (user.bannedUntil > at) {
      record.decision = 'BLOCKED_TEMP_BAN';
      const notify = !user.banNotified;
      user.banNotified = true;
      saveRecord();
      await persist();
      return { status: 'BANNED', notify, bannedUntil: user.bannedUntil, ingressId, queueNo: ingressId };
    }
    if (user.bannedUntil && user.bannedUntil <= at) {
      user.bannedUntil = 0;
      user.banNotified = false;
      user.warningTimes = [];
      user.burstTimes = [];
    }

    const spam = state.settings.antiSpam;
    if (spam.enabled) {
      user.burstTimes = user.burstTimes.filter(time => at - time < spam.windowMs);
      user.warningTimes = user.warningTimes.filter(time => at - time < spam.warningWindowMs);
      user.burstTimes.push(at);
      if (user.burstTimes.length > spam.burstLimit) {
        // Count one warning per burst episode, not one per message in the same burst.
        if (user.lastBurstAt == null || at - user.lastBurstAt >= spam.windowMs) {
          user.lastBurstAt = at;
          user.warningTimes.push(at);
        }
        const warningCount = user.warningTimes.length;
        if (warningCount >= spam.banThreshold) {
          user.bannedUntil = at + spam.banDurationMs;
          user.banNotified = true;
          record.decision = 'BLOCKED_TEMP_BAN';
          saveRecord();
          await persist();
          return { status: 'BANNED', notify: true, bannedUntil: user.bannedUntil, warningCount, ingressId, queueNo: ingressId };
        }
        record.decision = warningCount >= spam.warningThreshold ? 'BLOCKED_SPAM_WARNING' : 'HELD_SPAM_THRESHOLD';
        saveRecord();
        await persist();
        return {
          status: warningCount >= spam.warningThreshold ? 'SPAM_WARNING' : 'SPAM_HOLD',
          notify: warningCount >= spam.warningThreshold,
          warningCount, warningThreshold: spam.warningThreshold,
          retryAfterMs: Math.max(0, spam.windowMs - (at - user.burstTimes[0])),
          ingressId, queueNo: ingressId
        };
      }
    }

    const cooldown = state.settings.cooldown;
    const last = user.lastCommandAt[cmd];
    if (cooldown.enabled && last !== undefined && at - last < cooldown.perCommandMs) {
      const until = last + cooldown.perCommandMs;
      const notified = user.cooldownNotifiedUntil[cmd] === until;
      user.cooldownNotifiedUntil[cmd] = until;
      record.decision = 'HELD_COOLDOWN';
      saveRecord();
      await persist();
      return {
        status: 'COOLDOWN', notify: cooldown.notifyOnce ? !notified : true,
        retryAfterMs: until - at, ingressId, queueNo: ingressId
      };
    }

    user.lastCommandAt[cmd] = at;
    delete user.cooldownNotifiedUntil[cmd];
    record.decision = 'QUEUED_FOR_PROCESSING';
    saveRecord();
    await persist();
    return { status: 'ACCEPTED', notify: false, ingressId, queueNo: ingressId };
  }

  async function updateIngressDecision(ingressId, decision) {
    await load();
    if (!Number.isSafeInteger(ingressId)) return false;
    const record = state.ingress.find(item => item.id === ingressId);
    if (!record) return false;
    record.decision = String(decision || 'UPDATED').slice(0, 64);
    record.updatedAt = now();
    await persist();
    return true;
  }

  async function getSettings() { await load(); return clone(state.settings); }
  async function updateSettings(section, patch) {
    await load();
    if (!['cooldown', 'antiSpam', 'transport', 'queue'].includes(section)) throw new Error('Section safety tidak dikenal.');
    const current = state.settings[section];
    for (const [key, value] of Object.entries(patch || {})) {
      if (key === 'enabled' || key === 'notifyOnce') {
        if (typeof value !== 'boolean') throw new TypeError(`${section}.${key} harus boolean.`);
        current[key] = value;
      } else if (key === 'perCommandMs') current[key] = boundedInt(value, 0, 60000, key);
      else if (key === 'windowMs') current[key] = boundedInt(value, 1000, 300000, key);
      else if (key === 'burstLimit') current[key] = boundedInt(value, 2, 100, key);
      else if (key === 'warningThreshold') current[key] = boundedInt(value, 1, 20, key);
      else if (key === 'banThreshold') current[key] = boundedInt(value, 2, 50, key);
      else if (key === 'warningWindowMs') current[key] = boundedInt(value, 60000, 86400000, key);
      else if (key === 'banDurationMs') current[key] = boundedInt(value, 60000, 604800000, key);
      else if (key === 'minIntervalMs') current[key] = boundedInt(value, 500, 60000, key);
      else if (key === 'maxQueueSize') current[key] = boundedInt(value, 10, 10000, key);
      else if (key === 'auditRetention') current[key] = boundedInt(value, 100, 20000, key);
      else throw new Error(`Setting ${section}.${key} tidak didukung.`);
    }
    if (state.settings.antiSpam.warningThreshold >= state.settings.antiSpam.banThreshold) {
      throw new RangeError('warningThreshold harus lebih kecil dari banThreshold.');
    }
    await persist();
    return clone(state.settings[section]);
  }

  async function banUser(sender, durationMs, reason = 'owner_manual') {
    await load();
    const user = getUser(sender);
    user.bannedUntil = now() + boundedInt(durationMs, 60000, 604800000, 'durationMs');
    user.banNotified = true;
    user.banReason = String(reason).slice(0, 100);
    await persist();
    return { sender: senderKey(sender), bannedUntil: user.bannedUntil, reason: user.banReason };
  }
  async function unbanUser(sender) {
    await load();
    const user = getUser(sender);
    user.bannedUntil = 0; user.banNotified = false; user.warningTimes = []; user.burstTimes = [];
    await persist();
    return { sender: senderKey(sender), unbanned: true };
  }
  async function listBans() {
    await load();
    const at = now();
    return Object.entries(state.users)
      .filter(([, user]) => user.bannedUntil > at)
      .map(([sender, user]) => ({ sender, bannedUntil: user.bannedUntil, reason: user.banReason || 'anti_spam' }))
      .sort((a, b) => a.bannedUntil - b.bannedUntil);
  }
  async function stats() {
    await load();
    const at = now();
    const users = Object.values(state.users);
    return {
      ingressRecorded: state.ingress.length,
      activeBans: users.filter(user => user.bannedUntil > at).length,
      usersTracked: users.length,
      recentIngress: state.ingress.slice(-10).reverse().map(({ id, command, decision, receivedAt }) => ({ id, command, decision, receivedAt })),
      settings: clone(state.settings)
    };
  }

  return Object.freeze({ recordInboundEvent, inspectIncoming, updateIngressDecision, getSettings, updateSettings, banUser, unbanUser, listBans, stats });
}
