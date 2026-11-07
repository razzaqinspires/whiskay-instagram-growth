import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildContactPayload,
  buildLocationPayload,
  createWhatsAppMessageRouter,
  resolveOutgoingMessageType,
  WHATSAPP_MESSAGE_GUIDE
} from '../src/lib/whatsapp-message-router.mjs';

function createMockRouter() {
  const sent = [];
  const replies = [];
  const sock = {
    sendMessage: async (jid, payload, options) => {
      sent.push({ jid, payload, options });
      return { key: { id: `sent-${sent.length}` }, message: payload };
    }
  };
  const router = createWhatsAppMessageRouter({
    sock, jid: '6281234567890@s.whatsapp.net', quoted: { key: { id: 'quoted-1' } },
    reply: async value => replies.push(String(value)),
    rememberPoll: async () => {}
  });
  return { router, sent, replies };
}

test('message type resolver maps aliases and structured intents', () => {
  assert.equal(resolveOutgoingMessageType('hello'), 'text');
  assert.equal(resolveOutgoingMessageType({ type: 'nativeButtons', buttons: [] }), 'interactive');
  assert.equal(resolveOutgoingMessageType({ type: 'webview' }), 'webview_url');
  assert.equal(resolveOutgoingMessageType({ type: 'ai_rich_card' }), 'rich_card');
  assert.equal(resolveOutgoingMessageType({ type: 'ptv' }), 'ptv');
  assert.equal(resolveOutgoingMessageType({ type: 'voice' }), 'voice');
  assert.equal(resolveOutgoingMessageType({ type: 'single_select' }), 'single_select');
  assert.equal(resolveOutgoingMessageType({ video: Buffer.from('x') }), 'video');
  assert.ok(WHATSAPP_MESSAGE_GUIDE.some(item => item.type === 'carousel'));
});

test('builds valid contacts and rejects invalid contact phone numbers', () => {
  const payload = buildContactPayload({ name: 'Support Desk', phone: '+6281234567890' });
  assert.equal(payload.contacts.displayName, 'Support Desk');
  assert.match(payload.contacts.contacts[0].vcard, /BEGIN:VCARD/);
  assert.match(payload.contacts.contacts[0].vcard, /TEL;TYPE=CELL:\+6281234567890/);
  assert.throws(() => buildContactPayload({ name: 'Bad', phone: 'not-a-number' }), /format internasional/);
  assert.throws(() => buildContactPayload({ contacts: [] }), /1–10/);
});

test('builds static location payload and validates coordinate boundaries', () => {
  assert.deepEqual(buildLocationPayload({ latitude: '-6.2', longitude: '106.8', name: 'Test' }), {
    location: { degreesLatitude: -6.2, degreesLongitude: 106.8, name: 'Test' }
  });
  assert.throws(() => buildLocationPayload({ latitude: 91, longitude: 106 }), /Latitude/);
  assert.throws(() => buildLocationPayload({ latitude: -6, longitude: 181 }), /Longitude/);
});

test('generic send router emits contact, location, media and formatted text through proper transports', async () => {
  const { router, sent, replies } = createMockRouter();
  await router.send({ type: 'contact', name: 'Support', phone: '+6281234567890' });
  await router.send({ type: 'location', latitude: -6.2, longitude: 106.8, name: 'Office' });
  await router.send({ type: 'media', mediaType: 'video', media: Buffer.from([1, 2, 3]), caption: 'Preview' });
  await router.send({ type: 'ptv', media: Buffer.from([4, 5, 6]) });
  await router.send({ type: 'voice', media: Buffer.from([7, 8, 9]) });
  await router.send({ type: 'code', language: 'js', code: 'const ok = true;' });
  await router.send({ type: 'table', title: 'Status', headers: ['Key', 'Value'], rows: [['ready', 'yes']] });
  assert.ok(sent[0].payload.contacts);
  assert.ok(sent[1].payload.location);
  assert.ok(sent[2].payload.video);
  assert.equal(sent[2].payload.caption, 'Preview');
  assert.equal(sent[3].payload.ptv, true);
  assert.equal(sent[4].payload.ptt, true);
  assert.match(replies[0], /```js/);
  assert.match(replies[1], /ready \| yes/);
});

test('generic CTA send falls back to text if Native Flow module is unavailable', async () => {
  const { router, sent } = createMockRouter();
  const result = await router.send({ type: 'cta_url', title: 'Docs', url: 'https://example.com/docs', body: 'Open docs' });
  assert.equal(result.interactiveFallback, true);
  assert.equal(sent.length, 1);
  assert.match(sent[0].payload.text, /https:\/\/example.com\/docs/);
});

test('generic send rejects product and secret-bearing copy codes, and blocks remote media URLs', async () => {
  const { router } = createMockRouter();
  await assert.rejects(router.send({ type: 'product', product: {} }), /tidak diaktifkan/);
  await assert.rejects(router.send({ type: 'cta_copy', title: 'Copy', value: 'API_KEY=secret' }), /rahasia/);
  await assert.rejects(router.send({ type: 'media', mediaType: 'image', media: 'https://127.0.0.1/private' }), /URL remote/);
});
