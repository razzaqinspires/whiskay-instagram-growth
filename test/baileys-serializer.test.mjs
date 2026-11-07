import test from 'node:test';
import assert from 'node:assert/strict';
import {
  describeMessageMedia, describeQuotedMedia, downloadMediaPayload,
  inspectIncomingMessage, unwrapMessageContent
} from '../src/lib/baileys-serializer.mjs';

test('unwraps ephemeral/view-once/document wrappers for all common media payloads', () => {
  const raw = { message: { ephemeralMessage: { message: { viewOnceMessageV2: { message: { videoMessage: { mimetype: 'video/mp4', fileLength: 1234, seconds: 8, width: 1280, height: 720, caption: '.remini' } } } } } } };
  const content = unwrapMessageContent(raw);
  assert.ok(content.videoMessage);
  const media = describeMessageMedia(raw);
  assert.equal(media.type, 'video');
  assert.equal(media.fileLength, 1234);
  assert.equal(media.width, 1280);
  assert.equal(media.caption, '.remini');
});

test('detects image, audio, document, sticker and PTV video types', () => {
  const cases = [
    [{ imageMessage: { mimetype: 'image/jpeg' } }, 'image'],
    [{ audioMessage: { mimetype: 'audio/ogg' } }, 'audio'],
    [{ documentMessage: { mimetype: 'application/pdf', fileName: 'a.pdf' } }, 'document'],
    [{ stickerMessage: { mimetype: 'image/webp', isAnimated: true } }, 'sticker'],
    [{ ptvMessage: { mimetype: 'video/mp4' } }, 'video']
  ];
  for (const [message, expected] of cases) assert.equal(describeMessageMedia(message).type, expected);
});

test('extracts quoted media metadata and message context', () => {
  const raw = { key: { remoteJid: '6280000000000@s.whatsapp.net', fromMe: true }, message: { extendedTextMessage: { text: '.remini', contextInfo: { quotedMessage: { videoMessage: { mimetype: 'video/mp4', fileName: 'quoted.mp4' } }, stanzaId: 'quoted-id' } } } };
  const inspected = inspectIncomingMessage(raw);
  assert.equal(inspected.text, '.remini');
  assert.equal(inspected.quotedMedia.type, 'video');
  assert.equal(inspected.quotedMedia.fileName, 'quoted.mp4');
  assert.equal(inspected.quotedMedia.stanzaId, 'quoted-id');
});

test('downloads media streams with strict byte limits', async () => {
  const media = describeMessageMedia({ videoMessage: { mimetype: 'video/mp4' } });
  const mock = { downloadContentFromMessage: async function* () { yield Buffer.from([1, 2]); yield Buffer.from([3, 4]); } };
  const buffer = await downloadMediaPayload(media, { maxBytes: 8, baileys: mock });
  assert.deepEqual([...buffer], [1, 2, 3, 4]);
  await assert.rejects(downloadMediaPayload(media, { maxBytes: 3, baileys: mock }), /melebihi batas/);
});


test('distinguishes structured WhatsApp messages from media and plain text', () => {
  assert.equal(describeMessageMedia({ conversation: 'hello' }), null);
  assert.equal(describeMessageMedia({ contactMessage: { displayName: 'Contact' } }).type, 'contact');
  assert.equal(describeMessageMedia({ locationMessage: { degreesLatitude: -6.2, degreesLongitude: 106.8 } }).type, 'location');
  assert.equal(describeMessageMedia({ pollCreationMessage: { name: 'Poll' } }).type, 'poll');
  assert.equal(describeMessageMedia({ pollUpdateMessage: { vote: {} } }).type, 'poll_vote');
  assert.equal(describeMessageMedia({ productMessage: { product: {} } }).type, 'product');
});


test('exposes only decrypted poll update payloads as poll events', () => {
  const decrypted = inspectIncomingMessage({
    key: { id: 'vote-1', remoteJid: '6280000000000@s.whatsapp.net' },
    message: { pollUpdateMessage: {
      pollCreationMessageKey: { id: 'poll-1' },
      vote: { selectedOptions: [Buffer.from('option-a')] }
    } }
  });
  assert.equal(decrypted.isPollUpdate, true);
  assert.equal(decrypted.pollCreationMessageKey.remoteJid, '6280000000000@s.whatsapp.net');
  const encrypted = inspectIncomingMessage({ message: { pollUpdateMessage: { encPayload: Buffer.from('cipher'), encIv: Buffer.from('iv') } } });
  assert.equal(encrypted.isPollUpdate, false);
  assert.equal(encrypted.pollUpdate, null);
});
