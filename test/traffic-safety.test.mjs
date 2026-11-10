import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { createTrafficSafetyManager } from '../src/security/traffic-safety-manager.mjs';
import { createOutboundMessageQueue } from '../src/lib/outbound-message-queue.mjs';
import corePlugin from '../src/plugins/core.mjs';
import { handleMessage } from '../src/commands.mjs';

test('live inbound audit stores metadata without persisting message bodies', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-ingress-audit-'));
  const file = path.join(dir, 'state.json');
  const manager = createTrafficSafetyManager({ filePath: file });
  try {
    const result = await manager.recordInboundEvent({
      sender: '628444@s.whatsapp.net', messageId: 'msg-audit-1', messageType: 'conversation'
    });
    assert.equal(result.status, 'RECORDED');
    const raw = await readFile(file, 'utf8');
    assert.match(raw, /RECEIVED_AUDITED/);
    assert.match(raw, /msg-audit-1/);
    assert.doesNotMatch(raw, /secret chat body/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('traffic safety persists cooldown and emits only one notice per cooldown window', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-traffic-'));
  let now = 100000;
  const manager = createTrafficSafetyManager({
    filePath: path.join(dir, 'state.json'), now: () => now,
    defaults: { cooldown: { enabled: true, perCommandMs: 1800, notifyOnce: true } }
  });
  try {
    assert.equal((await manager.inspectIncoming({ sender: '628111@s.whatsapp.net', command: 'menu', messageId: '1' })).status, 'ACCEPTED');
    const second = await manager.inspectIncoming({ sender: '628111@s.whatsapp.net', command: 'menu', messageId: '2' });
    const third = await manager.inspectIncoming({ sender: '628111@s.whatsapp.net', command: 'menu', messageId: '3' });
    assert.equal(second.status, 'COOLDOWN');
    assert.equal(second.notify, true);
    assert.equal(third.status, 'COOLDOWN');
    assert.equal(third.notify, false);
    now += 1801;
    assert.equal((await manager.inspectIncoming({ sender: '628111@s.whatsapp.net', command: 'menu', messageId: '4' })).status, 'ACCEPTED');
    const raw = JSON.parse(await readFile(path.join(dir, 'state.json'), 'utf8'));
    assert.equal(raw.ingress.length, 4);
    assert.equal(raw.ingress[1].decision, 'HELD_COOLDOWN');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('traffic safety escalates repeated burst episodes to warning then temporary ban', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-spam-'));
  let now = 100000;
  const manager = createTrafficSafetyManager({
    filePath: path.join(dir, 'state.json'), now: () => now,
    defaults: { cooldown: { enabled: false }, antiSpam: {
      enabled: true, windowMs: 1000, burstLimit: 2, warningThreshold: 2,
      banThreshold: 3, warningWindowMs: 10000, banDurationMs: 60000
    } }
  });
  try {
    const sender = '628222@s.whatsapp.net';
    await manager.inspectIncoming({ sender, command: 'menu', messageId: 'a1' });
    await manager.inspectIncoming({ sender, command: 'menu', messageId: 'a2' });
    assert.equal((await manager.inspectIncoming({ sender, command: 'menu', messageId: 'a3' })).status, 'SPAM_HOLD');
    now += 1100;
    await manager.inspectIncoming({ sender, command: 'menu', messageId: 'b1' });
    await manager.inspectIncoming({ sender, command: 'menu', messageId: 'b2' });
    assert.equal((await manager.inspectIncoming({ sender, command: 'menu', messageId: 'b3' })).status, 'SPAM_WARNING');
    now += 1100;
    await manager.inspectIncoming({ sender, command: 'menu', messageId: 'c1' });
    await manager.inspectIncoming({ sender, command: 'menu', messageId: 'c2' });
    const banned = await manager.inspectIncoming({ sender, command: 'menu', messageId: 'c3' });
    assert.equal(banned.status, 'BANNED');
    assert.equal((await manager.listBans()).length, 1);
    assert.equal((await manager.inspectIncoming({ sender, command: 'help', messageId: 'd1' })).notify, false);
    await manager.unbanUser(sender);
    assert.equal((await manager.listBans()).length, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('traffic safety settings are persisted and validated', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-settings-'));
  const file = path.join(dir, 'state.json');
  const manager = createTrafficSafetyManager({ filePath: file });
  try {
    const updated = await manager.updateSettings('transport', { minIntervalMs: 2500, enabled: false });
    assert.equal(updated.minIntervalMs, 2500);
    assert.equal(updated.enabled, false);
    const restored = createTrafficSafetyManager({ filePath: file });
    assert.equal((await restored.getSettings()).transport.minIntervalMs, 2500);
    await assert.rejects(() => manager.updateSettings('transport', { minIntervalMs: 20 }), /500–60000/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('outbound queue serializes sends and adds queue position and pacing metadata', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-outbound-'));
  const sent = [];
  const settings = {
    queue: { enabled: true },
    transport: { enabled: true, minIntervalMs: 0, maxQueueSize: 20 }
  };
  const queue = createOutboundMessageQueue({
    filePath: path.join(dir, 'queue.json'), getSettings: async () => settings,
    logger: { debug() {}, warn() {}, error() {} }
  });
  const sock = { sendMessage: async (jid, content) => {
    sent.push({ jid, content });
    return { key: { id: `out-${sent.length}` } };
  } };
  try {
    await queue.attach(sock);
    await queue.setReady(true);
    const a = sock.sendMessage('628333@s.whatsapp.net', { text: 'first response' });
    const b = sock.sendMessage('628333@s.whatsapp.net', { text: 'second response' });
    const [ra, rb] = await Promise.all([a, b]);
    assert.equal(ra.key.id, 'out-1');
    assert.equal(rb.key.id, 'out-2');
    assert.match(sent[0].content.text, /Antrean posisi #1/);
    assert.match(sent[1].content.text, /Antrean posisi #2/);
    const stats = await queue.stats();
    assert.equal(stats.pending, 0);
    assert.equal(stats.sent, 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});


test('owner safety controls are protected even when runtime is PUBLIC', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'whiskay-safety-owner-'));
  const replies = [];
  const changes = [];
  const settings = {
    cooldown: { enabled: true, perCommandMs: 1800, notifyOnce: true },
    antiSpam: { enabled: true, windowMs: 10000, burstLimit: 5, warningThreshold: 3, banThreshold: 5, warningWindowMs: 3600000, banDurationMs: 900000 },
    transport: { enabled: true, minIntervalMs: 1200, maxQueueSize: 1000 },
    queue: { enabled: true, auditRetention: 5000 }
  };
  const trafficSafety = {
    getSettings: async () => structuredClone(settings),
    updateSettings: async (section, patch) => { changes.push({ section, patch }); Object.assign(settings[section], patch); return structuredClone(settings[section]); },
    stats: async () => ({ settings: structuredClone(settings), activeBans: 0, ingressRecorded: 0 }),
    listBans: async () => [],
    banUser: async () => ({ sender: '6281234567890@s.whatsapp.net', bannedUntil: Date.now() + 60000 }),
    unbanUser: async () => ({ unbanned: true })
  };
  const safetyCommand = corePlugin.commands.find(item => item.name === 'safety');
  const pluginLoader = {
    listCommands: () => [{ name: 'safety', aliases: ['trafficguard'] }],
    execute: async (name, context) => {
      if (name !== 'safety') return { found: false };
      await safetyCommand.execute({ args: context.args, reply: context.reply, trafficSafety, sock: context.sock });
      return { found: true };
    }
  };
  const sock = {
    user: { id: '6281234567890@s.whatsapp.net' },
    sendMessage: async (_jid, payload) => { replies.push(payload.text); return { key: { id: `reply-${replies.length}` } }; }
  };
  const modeStore = { get: async () => ({ mode: 'public', allowGroups: false, updatedAt: 1 }) };
  const common = {
    lidManager: null, pluginLoader, logger: { info() {}, warn() {}, error() {}, debug() {} },
    ownerNumber: '6281234567890', modeStore, trafficSafety,
    antiSpam: { check: () => ({ allowed: true, release() {} }) }
  };
  try {
    await handleMessage(sock, {
      key: { id: 'owner-safety', fromMe: true, remoteJid: '6281234567890@s.whatsapp.net' },
      message: { conversation: '.safety spam off' }
    }, common);
    assert.deepEqual(changes.at(-1), { section: 'antiSpam', patch: { enabled: false } });
    assert.match(replies.at(-1), /NONAKTIF/);

    const before = changes.length;
    await handleMessage(sock, {
      key: { id: 'nonowner-safety', fromMe: false, remoteJid: '6289999999999@s.whatsapp.net' },
      message: { conversation: '.safety spam on' }
    }, common);
    assert.equal(changes.length, before, 'non-owner must not mutate safety settings');
  } finally { await rm(directory, { recursive: true, force: true }); }
});


test('outbound queue also serializes direct relayMessage traffic', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-relay-queue-'));
  const relayed = [];
  const queue = createOutboundMessageQueue({
    filePath: path.join(dir, 'queue.json'),
    getSettings: async () => ({ queue: { enabled: true }, transport: { enabled: true, minIntervalMs: 0, maxQueueSize: 10 } }),
    logger: { debug() {}, warn() {}, error() {} }
  });
  const sock = {
    sendMessage: async () => ({ key: { id: 'unused' } }),
    relayMessage: async (jid, content, options) => {
      relayed.push({ jid, content, options });
      return options.messageId;
    }
  };
  try {
    await queue.attach(sock);
    await queue.setReady(true);
    const result = await sock.relayMessage('628666@s.whatsapp.net', {
      interactiveMessage: { body: { text: 'Menu interactive' } }
    }, { messageId: 'relay-id-1' });
    assert.equal(result, 'relay-id-1');
    assert.equal(relayed.length, 1);
    assert.match(relayed[0].content.interactiveMessage.body.text, /Antrean posisi #1/);
    assert.equal((await queue.stats()).sent, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('outbound queue does not replay ambiguous SENDING jobs after restart', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-outbound-recovery-'));
  const file = path.join(dir, 'queue.json');
  const interrupted = {
    schemaVersion: 1, nextId: 2,
    jobs: [{
      id: 1, queueNo: 1, queuePosition: 1, jid: '628555@s.whatsapp.net',
      payload: { text: 'possibly already sent' }, options: {}, status: 'SENDING',
      createdAt: Date.now(), startedAt: Date.now(), finishedAt: null
    }]
  };
  await (await import('node:fs/promises')).writeFile(file, JSON.stringify(interrupted));
  let sendCount = 0;
  const queue = createOutboundMessageQueue({
    filePath: file,
    getSettings: async () => ({ queue: { enabled: true }, transport: { enabled: true, minIntervalMs: 500, maxQueueSize: 10 } }),
    logger: { debug() {}, warn() {}, error() {} }
  });
  const sock = { sendMessage: async () => { sendCount += 1; return { key: { id: 'unexpected' } }; } };
  try {
    await queue.attach(sock);
    const stats = await queue.stats();
    assert.equal(stats.unknown, 1);
    await queue.setReady(true);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(sendCount, 0, 'ambiguous sends must not be replayed automatically');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
