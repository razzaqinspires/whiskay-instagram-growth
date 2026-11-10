import test from 'node:test';
import assert from 'node:assert/strict';
import { SprMessageStore } from '../src/lib/spr-message-store.mjs';
import sprPlugin from '../src/plugins/spr.mjs';

test('SPR store indexes only metadata for incoming group messages and resolves latest target message', () => {
  let now = 1000;
  const store = new SprMessageStore({ now: () => now, ttlMs: 60_000, maxRecords: 100 });
  store.save({
    key: {
      remoteJid: '120363123456789@g.us',
      participant: '6281111111111@s.whatsapp.net',
      participantAlt: '111111@lid',
      id: 'message-1',
      fromMe: false
    },
    message: { conversation: 'sensitive body must not be stored' }
  });
  now += 100;
  store.save({
    key: {
      remoteJid: '120363123456789@g.us',
      participant: '6282222222222@s.whatsapp.net',
      id: 'message-2',
      fromMe: false
    },
    message: { conversation: 'another body' }
  });
  assert.equal(store.getLatest('6281111111111', '120363123456789@g.us')?.id, 'message-1');
  assert.equal(store.getLatest('111111@lid', '120363123456789@g.us')?.id, 'message-1');
  assert.equal(store.getLatest('6281111111111', '120363999999999@g.us'), null);
  assert.deepEqual(store.stats().messages, 2);
});

test('SPR store rejects own outgoing messages and expires old message indexes', () => {
  let now = 10_000;
  const store = new SprMessageStore({ now: () => now, ttlMs: 60_000, maxRecords: 100 });
  assert.equal(store.save({
    key: { remoteJid: '120363123456789@g.us', participant: '6281111111111@s.whatsapp.net', id: 'own', fromMe: true },
    message: { conversation: 'not inbound' }
  }), null);
  store.save({
    key: { remoteJid: '120363123456789@g.us', participant: '6281111111111@s.whatsapp.net', id: 'old', fromMe: false },
    message: { conversation: 'body omitted' }
  });
  now += 60_001;
  assert.equal(store.getLatest('6281111111111', '120363123456789@g.us'), null);
  assert.equal(store.stats().messages, 0);
});

test('SPR outbound delete registry accepts only a recorded private message ID', () => {
  const store = new SprMessageStore();
  assert.equal(store.recordOutbound({ id: 'g1', chatJid: '120363123456789@g.us' }), null);
  assert.ok(store.recordOutbound({ id: 'p1', chatJid: '6281111111111@s.whatsapp.net', mode: 'spr' }));
  assert.equal(store.getOutbound('p1')?.chatJid, '6281111111111@s.whatsapp.net');
  assert.equal(store.getOutbound('unknown'), null);
});

test('SPR plugin exposes the original modes plus safe management commands', () => {
  const names = sprPlugin.commands.map(command => command.name);
  assert.deepEqual(names, ['spr', 'spr2', 'sprstatus', 'sprclear', 'sprdmsg']);
  assert.ok(sprPlugin.commands.find(command => command.name === 'sprdmsg').aliases.includes('sprdelete'));
});
