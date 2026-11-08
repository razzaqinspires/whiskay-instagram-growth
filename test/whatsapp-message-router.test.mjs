import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  buildContactPayload,
  buildLocationPayload,
  createWhatsAppMessageRouter,
  resolveOutgoingMessageType,
  WHATSAPP_MESSAGE_GUIDE,
  normalizeOutgoingMedia
} from '../src/lib/whatsapp-message-router.mjs';

function createMockRouter() {
  const sent = [];
  const replies = [];
  const sock = {
    sendMessage: async (jid, payload, options) => {
      sent.push({ jid, payload, options });
      return { key: { id: `sent-${sent.length}` }, message: payload };
    },
    createCallLink: async (type, event) => `${type}-call-token`
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
  assert.equal(resolveOutgoingMessageType({ type: 'ai_rich_card' }), 'ai_rich_response');
  assert.equal(resolveOutgoingMessageType({ richMessage: [{ type: 'text', text: 'Summary' }] }), 'ai_rich_response');
  assert.equal(resolveOutgoingMessageType({ richCard: { title: 'Card' } }), 'rich_card');
  assert.equal(resolveOutgoingMessageType({ type: 'card' }), 'rich_card');
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

test('generic send rejects incomplete product, secret-bearing copy codes, and blocks remote media URLs', async () => {
  const { router } = createMockRouter();
  await assert.rejects(router.send({ type: 'product', product: {} }), /Business/);
  await assert.rejects(router.send({ type: 'cta_copy', title: 'Copy', value: 'API_KEY=secret' }), /rahasia/);
  await assert.rejects(router.send({ type: 'media', mediaType: 'image', media: 'https://127.0.0.1/private' }), /URL remote/);
});

test('maps event and native AIRichResponse as distinct outgoing message formats', () => {
  assert.equal(resolveOutgoingMessageType({ event: { name: 'Meeting', startDate: new Date() } }), 'event');
  assert.equal(resolveOutgoingMessageType({ type: 'ai_rich_response' }), 'ai_rich_response');
  assert.ok(WHATSAPP_MESSAGE_GUIDE.some(item => item.type === 'ai_rich_response'));
});

test('sends EventMessage, a valid ProductMessage and View Once/PTV through Baileys relay compatibility', async () => {
  const sent = [];
  const relayed = [];
  const sock = {
    user: { id: '6281234567890@s.whatsapp.net' },
    waUploadToServer: async () => ({ url: 'https://upload.invalid/media' }),
    sendMessage: async (jid, payload, options) => { sent.push({ jid, payload, options }); return { key: { id: `sent-${sent.length}` } }; },
    relayMessage: async (...args) => relayed.push(args),
    createCallLink: async () => 'call-token'
  };
  const baileys = {
    generateMessageIDV2: () => 'viewonce-test-id',
    generateWAMessage: async (jid, content, options) => ({ key: { id: 'viewonce-test-id' }, message: { viewOnceMessage: { message: { videoMessage: { ptv: content.ptv, url: 'encrypted' } } } } })
  };
  const router = createWhatsAppMessageRouter({ sock, jid: '6281111111111@s.whatsapp.net', reply: async () => {}, baileys });
  await router.send({ type: 'event', event: { name: 'Project Review', startDate: '2030-01-01T10:00:00.000Z', endDate: '2030-01-01T11:00:00.000Z', description: 'Review' } });
  await router.send({ type: 'event', event: { name: 'Voice Room', startDate: '2030-01-01T10:00:00.000Z', call: 'audio' } });
  await router.send({ type: 'product', catalogEnabled: true, businessOwnerJid: '6281234567890@s.whatsapp.net', product: {
    productImage: Buffer.from([1, 2]), productId: 'CATALOG-01', title: 'Sample Product', description: 'Valid owner supplied data', currencyCode: 'IDR', priceAmount1000: 125000000, retailerId: 'SKU-01'
  } });
  await router.send({ type: 'media', mediaType: 'video', media: Buffer.from([1, 2]), ptv: true, viewOnce: true });
  assert.equal(sent[0].payload.event.name, 'Project Review');
  assert.ok(sent[0].payload.event.startDate instanceof Date);
  assert.equal(sent[1].payload.event.call, 'audio');
  assert.equal(sent[2].payload.product.productId, 'CATALOG-01');
  assert.equal(sent[2].payload.businessOwnerJid, '6281234567890@s.whatsapp.net');
  assert.equal(relayed.length, 1);
  assert.equal(relayed[0][1].viewOnceMessage.message.videoMessage.ptv, true);
  assert.deepEqual(relayed[0][2].additionalNodes[0].attrs, { view_once: 'true' });
});

test('scheduled call EventMessage refuses to send without Baileys createCallLink', async () => {
  const sent = [];
  const sock = { sendMessage: async (jid, payload) => { sent.push(payload); return { key: { id: 'event-1' } }; } };
  const router = createWhatsAppMessageRouter({ sock, jid: '6281234567890@s.whatsapp.net', reply: async () => {} });
  await assert.rejects(router.send({ type: 'event', event: { name: 'Call', startDate: '2030-01-01T10:00:00Z', call: 'audio' } }), /createCallLink/);
  assert.equal(sent.length, 0);
});

test('ProductMessage validates real catalog fields and rejects arbitrary remote product images', async () => {
  const { router } = createMockRouter();
  const base = { catalogEnabled: true, businessOwnerJid: '6281234567890@s.whatsapp.net', product: { productImage: Buffer.from([1]), productId: 'id', title: 'title', currencyCode: 'IDR', priceAmount1000: 1000 } };
  await assert.rejects(router.send({ type: 'product', ...base, product: { ...base.product, productImage: 'https://example.com/photo.jpg' } }), /path lokal/);
  await assert.rejects(router.send({ type: 'product', ...base, product: { ...base.product, currencyCode: 'rupiah' } }), /ISO 4217/);
  await assert.rejects(router.send({ type: 'product', businessOwnerJid: base.businessOwnerJid, product: base.product }), /Business/);
  await assert.rejects(router.send({ type: 'event', event: { name: 'Invalid', startDate: 'not-a-date' } }), /tanggal ISO/);
});


test('normalizes a local media path to Buffer before handing it to Baileys', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-media-path-'));
  const file = path.join(dir, 'whiskay-demo-ptv.mp4');
  const source = Buffer.from('fake-mp4-bytes');
  try {
    await writeFile(file, source);
    const normalized = await normalizeOutgoingMedia(file);
    assert.ok(Buffer.isBuffer(normalized));
    assert.deepEqual(normalized, source);

    const { router, sent } = createMockRouter();
    await router.send({ type: 'ptv', media: file, caption: 'PTV test' });
    assert.ok(Buffer.isBuffer(sent[0].payload.video));
    assert.equal(sent[0].payload.ptv, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('local media path normalizer rejects missing files, symlinks, remote URLs, and oversized files', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-media-invalid-'));
  const file = path.join(dir, 'too-large.bin');
  const target = path.join(dir, 'target.bin');
  const link = path.join(dir, 'link.bin');
  try {
    await writeFile(file, Buffer.alloc(16));
    await writeFile(target, Buffer.from('target'));
    await import('node:fs/promises').then(fs => fs.symlink(target, link));
    await assert.rejects(normalizeOutgoingMedia(path.join(dir, 'missing.mp4')), /tidak ditemukan/);
    await assert.rejects(normalizeOutgoingMedia(link), /symlink/);
    await assert.rejects(normalizeOutgoingMedia('https://example.com/video.mp4'), /URL remote/);
    await assert.rejects(normalizeOutgoingMedia(file, { maxBytes: 8 }), /melebihi batas/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
