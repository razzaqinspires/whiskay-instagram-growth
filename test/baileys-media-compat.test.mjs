import test from 'node:test';
import assert from 'node:assert/strict';
import { sendViewOnceMedia } from '../src/lib/baileys-media-compat.mjs';
import { patchBaileysViewOnceSource } from '../scripts/patch-baileys-view-once.mjs';
import { patchBaileysMediaStreamSource } from '../scripts/patch-baileys-media-stream.mjs';

const sourceFixture = `import { normalizeMessageContent } from '../Utils';\nconst mediaType = getMediaType(message);\n`;

test('Baileys View Once source patch normalizes wrapped message before selecting mediatype', () => {
  const patched = patchBaileysViewOnceSource(sourceFixture);
  assert.equal(patched.changed, true);
  assert.match(patched.source, /getMediaType\(normalizeMessageContent\(message\) \|\| message\)/);
  const again = patchBaileysViewOnceSource(patched.source);
  assert.equal(again.changed, false);
  assert.equal(again.reason, 'already-patched');
});

test('Baileys View Once source patch refuses unknown or ambiguous dependency code', () => {
  assert.throws(() => patchBaileysViewOnceSource('const mediaType = getMediaType(message);'), /normalizeMessageContent tidak diimpor/);
  assert.throws(() => patchBaileysViewOnceSource(`${sourceFixture}${sourceFixture}`), /tepat satu/);
});

test('View Once transport relays generated media with the meta view_once node and preserves quoted WAMessage', async () => {
  const calls = [];
  const quoted = { key: { id: 'quoted-1', remoteJid: '6281111111111@s.whatsapp.net' }, message: { imageMessage: { caption: 'source' } } };
  const sock = {
    user: { id: '6281234567890@s.whatsapp.net' },
    waUploadToServer: async () => ({ url: 'https://upload.invalid/media' }),
    relayMessage: async (...args) => calls.push(args)
  };
  const baileys = {
    generateMessageIDV2: () => 'view-once-1',
    generateWAMessage: async (jid, content, options) => {
      assert.equal(content.viewOnce, true);
      assert.equal(options.quoted, quoted);
      return { key: { id: 'view-once-1' }, message: { viewOnceMessage: { message: { imageMessage: { url: 'encrypted' } } } } };
    }
  };
  const result = await sendViewOnceMedia(sock, '6281111111111@s.whatsapp.net', { image: '/tmp/demo.jpg', viewOnce: true }, quoted, { baileys });
  assert.equal(result.transport, 'View Once relay + meta:view_once');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2].additionalNodes[0].tag, 'meta');
  assert.deepEqual(calls[0][2].additionalNodes[0].attrs, { view_once: 'true' });
});


test('Baileys media patch forwards source stream errors to the decrypting output stream', () => {
  const source = `const output = new Transform({ transform(chunk, enc, callback) { callback(null, chunk); } });\n\treturn fetched.pipe(output, { end: true });`;
  const patched = patchBaileysMediaStreamSource(source);
  assert.equal(patched.changed, true);
  assert.match(patched.source, /fetched\.on\('error', error => output\.destroy\(error\)\)/);
  assert.match(patched.source, /return fetched\.pipe\(output, \{ end: true \}\)/);
  const again = patchBaileysMediaStreamSource(patched.source);
  assert.equal(again.changed, false);
  assert.equal(again.reason, 'already-patched');
});

test('Baileys media patch refuses missing or ambiguous source targets', () => {
  assert.throws(() => patchBaileysMediaStreamSource('return output;'), /ditemukan 0 target/i);
  assert.throws(() => patchBaileysMediaStreamSource('return fetched.pipe(output, { end: true });\nreturn fetched.pipe(output, { end: true });'), /ditemukan 2 target/i);
});
