import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createMessageDeliveryTracker } from '../src/lib/message-delivery-tracker.mjs';

const silent = { debug() {}, info() {}, warn() {} };

function makeSocket() {
  const sock = {
    ev: new EventEmitter(),
    async sendMessage(jid, content) { return { key: { id: 'SEND-1', remoteJid: jid, fromMe: true }, message: content }; },
    async relayMessage(jid, message, options = {}) { return options.messageId || 'RELAY-1'; }
  };
  return sock;
}

test('sendMessage and relayMessage are tracked without changing their return values', async () => {
  const sock = makeSocket();
  const tracker = createMessageDeliveryTracker({ logger: silent });
  tracker.attach(sock);
  const sent = await sock.sendMessage('628123@s.whatsapp.net', { text: 'hello' });
  const relayId = await sock.relayMessage('628123@s.whatsapp.net', {}, { messageId: 'RELAY-2' });
  assert.equal(sent.key.id, 'SEND-1');
  assert.equal(relayId, 'RELAY-2');
  assert.equal(tracker.get('SEND-1').status, 'PENDING');
  assert.equal(tracker.get('RELAY-2').source, 'relayMessage');
  assert.equal(tracker.stats().trackedSends, 2);
});

test('messages.update advances status monotonically and ignores inbound keys', () => {
  const tracker = createMessageDeliveryTracker({ logger: silent });
  tracker.onMessagesUpdate([
    { key: { id: 'A', remoteJid: '6281@s.whatsapp.net', fromMe: true }, update: { status: 2 } },
    { key: { id: 'B', remoteJid: '6282@s.whatsapp.net', fromMe: false }, update: { status: 4 } }
  ]);
  tracker.onMessagesUpdate([{ key: { id: 'A', remoteJid: '6281@s.whatsapp.net', fromMe: true }, update: { status: 4 } }]);
  tracker.onMessagesUpdate([{ key: { id: 'A', remoteJid: '6281@s.whatsapp.net', fromMe: true }, update: { status: 3 } }]);
  assert.equal(tracker.get('A').status, 'READ');
  assert.equal(tracker.get('B'), null);
});

test('receipt updates capture per-recipient delivered/read/played timestamps', () => {
  const tracker = createMessageDeliveryTracker({ logger: silent });
  const key = { id: 'GROUP-1', remoteJid: '123@g.us', fromMe: true };
  tracker.onReceiptUpdate([{ key, receipt: { userJid: '6281@s.whatsapp.net', receiptTimestamp: 100 } }]);
  assert.equal(tracker.get('GROUP-1').status, 'DELIVERY_ACK');
  tracker.onReceiptUpdate([{ key, receipt: { userJid: '6281@s.whatsapp.net', readTimestamp: 110 } }]);
  tracker.onReceiptUpdate([{ key, receipt: { userJid: '6282@s.whatsapp.net', playedTimestamp: 120 } }]);
  const record = tracker.get('GROUP-1');
  assert.equal(record.status, 'PLAYED');
  assert.equal(record.receipts['6281@s.whatsapp.net'].readAt, 110);
  assert.equal(record.receipts['6282@s.whatsapp.net'].playedAt, 120);
});

test('relay rejection is marked ambiguous and never triggers an automatic resend', async () => {
  const sock = makeSocket();
  let calls = 0;
  sock.relayMessage = async () => { calls += 1; throw new Error('socket timeout'); };
  const tracker = createMessageDeliveryTracker({ logger: silent });
  tracker.attach(sock);
  await assert.rejects(sock.relayMessage('6281@s.whatsapp.net', {}, { messageId: 'AMB-1' }), /socket timeout/);
  assert.equal(calls, 1);
  assert.equal(tracker.get('AMB-1').status, 'RELAY_UNCONFIRMED');
  assert.equal(tracker.stats().relayErrors, 1);
});

test('tracker prunes old entries and bounds cache size', () => {
  let now = 1000;
  const tracker = createMessageDeliveryTracker({ logger: silent, maxEntries: 2, ttlMs: 100, now: () => now });
  tracker.trackSent({ id: '1', fromMe: true });
  tracker.trackSent({ id: '2', fromMe: true });
  tracker.trackSent({ id: '3', fromMe: true });
  assert.equal(tracker.get('1'), null);
  assert.equal(tracker.stats().tracked, 2);
  now = 1200;
  assert.equal(tracker.stats().tracked, 0);
});


test('late ambiguous relay error never downgrades a status already confirmed by Baileys', async () => {
  const tracker = createMessageDeliveryTracker({ logger: silent });
  tracker.trackRelayStart('6281@s.whatsapp.net', 'CONFIRMED-1');
  tracker.onMessagesUpdate([{
    key: { id: 'CONFIRMED-1', remoteJid: '6281@s.whatsapp.net', fromMe: true },
    update: { status: 3 }
  }]);
  tracker.markRelayError('CONFIRMED-1', new Error('late socket timeout'));
  const record = tracker.get('CONFIRMED-1');
  assert.equal(record.status, 'DELIVERY_ACK');
  assert.equal(record.relayOutcome, 'UNCONFIRMED');
  assert.match(record.relayError, /late socket timeout/);
});

test('get() enforces TTL instead of returning an expired record', () => {
  let now = 1000;
  const tracker = createMessageDeliveryTracker({ logger: silent, ttlMs: 50, now: () => now });
  tracker.trackSent({ id: 'EXPIRED-1', fromMe: true });
  now = 1051;
  assert.equal(tracker.get('EXPIRED-1'), null);
});
