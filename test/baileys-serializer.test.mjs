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



test('recognizes newer Baileys structured message types from current WAProto', () => {
  const cases = [
    [{ albumMessage: { expectedImageCount: 2 } }, 'album'],
    [{ requestPhoneNumberMessage: {} }, 'request_phone_number'],
    [{ stickerPackMessage: {} }, 'sticker_pack'],
    [{ pollResultSnapshotMessage: {} }, 'poll_result'],
    [{ scheduledCallCreationMessage: {} }, 'scheduled_call'],
    [{ questionResponseMessage: {} }, 'question_response'],
    [{ botForwardedMessage: { message: { richResponseMessage: {} } } }, 'ai_rich_response']
  ];
  for (const [message, expected] of cases) assert.equal(describeMessageMedia(message).type, expected);
});

test('reads AIRichResponse text and quoted context nested under botForwardedMessage', () => {
  const raw = {
    key: { remoteJid: '6280000000000@s.whatsapp.net', fromMe: true },
    message: {
      botForwardedMessage: { message: { richResponseMessage: {
        submessages: [{ messageType: 2, messageText: 'WHISKAY rich text' }],
        contextInfo: {
          stanzaId: 'quoted-rich-1',
          participant: '6281111111111@s.whatsapp.net',
          quotedMessage: { imageMessage: { mimetype: 'image/jpeg', fileName: 'quoted.jpg' } }
        }
      } } }
    }
  };
  const inspected = inspectIncomingMessage(raw);
  assert.equal(inspected.text, 'WHISKAY rich text');
  assert.equal(inspected.media.type, 'ai_rich_response');
  assert.equal(inspected.quotedMedia.type, 'image');
  assert.equal(inspected.quotedMedia.stanzaId, 'quoted-rich-1');
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

test('finds video captions through nested wrappers and interactive media containers', () => {
  const raw = {
    key: { remoteJid: '6280000000000@s.whatsapp.net', fromMe: true },
    message: {
      ephemeralMessage: { message: {
        viewOnceMessageV2Extension: { message: {
          interactiveMessage: { header: { videoMessage: { mimetype: 'video/mp4', caption: '.remini inspect', fileLength: 4096 } } }
        } }
      } }
    }
  };
  const inspected = inspectIncomingMessage(raw);
  assert.equal(inspected.media.type, 'video');
  assert.equal(inspected.text, '.remini inspect');
  assert.equal(inspected.media.viewOnce, true);
});

test('resolves quoted video through wrapped quotedMessage and keeps video downloader type', async () => {
  const raw = {
    key: { id: 'command-1', remoteJid: '6280000000000@s.whatsapp.net', fromMe: true },
    message: { extendedTextMessage: { text: '.remini enhance sharp', contextInfo: {
      stanzaId: 'quoted-1',
      quotedMessage: { viewOnceMessageV2: { message: { ptvMessage: { mimetype: 'video/mp4', fileLength: 1200, seconds: 4 } } } }
    } } }
  };
  const inspected = inspectIncomingMessage(raw);
  assert.equal(inspected.text, '.remini enhance sharp');
  assert.equal(inspected.quotedMedia.type, 'video');
  assert.equal(inspected.quotedMedia.messageType, 'ptvMessage');
  const mock = { downloadContentFromMessage: async function* (payload, type) { assert.equal(type, 'video'); yield Buffer.from([9, 8, 7]); } };
  const result = await downloadMediaPayload(inspected.quotedMedia, { baileys: mock });
  assert.deepEqual([...result], [9, 8, 7]);
});


test('retries a failed media download once after Baileys updateMediaMessage refreshes the payload', async () => {
  const raw = { key: { id: 'media-1', remoteJid: '6280000000000@s.whatsapp.net' }, message: { imageMessage: { mimetype: 'image/jpeg', fileLength: 4, mediaKey: Buffer.from('old') } } };
  const descriptor = describeMessageMedia(raw);
  const calls = [];
  let attempts = 0;
  const baileys = { downloadContentFromMessage: async function* (payload, type) {
    attempts += 1; calls.push({ payload, type });
    if (attempts === 1) throw new Error('HTTP 404 media expired');
    yield Buffer.from([1, 2, 3, 4]);
  } };
  const sock = { updateMediaMessage: async message => {
    assert.equal(message.key.id, 'media-1');
    return { ...message, message: { imageMessage: { mimetype: 'image/jpeg', fileLength: 4, mediaKey: Buffer.from('new') } } };
  } };
  const result = await downloadMediaPayload(descriptor, { baileys, sock, logger: { warn() {} } });
  assert.deepEqual([...result], [1, 2, 3, 4]);
  assert.equal(attempts, 2);
  assert.equal(calls[1].payload.mediaKey.toString(), 'new');
});

test('does not request media re-upload when the declared/streamed size exceeds the configured limit', async () => {
  const raw = { key: { id: 'media-large', remoteJid: '6280000000000@s.whatsapp.net' }, message: { imageMessage: { mimetype: 'image/jpeg' } } };
  const descriptor = describeMessageMedia(raw);
  let reuploads = 0;
  const baileys = { downloadContentFromMessage: async function* () { yield Buffer.alloc(8); } };
  const sock = { updateMediaMessage: async () => { reuploads += 1; return raw; } };
  await assert.rejects(downloadMediaPayload(descriptor, { maxBytes: 4, baileys, sock }), /melebihi batas/);
  assert.equal(reuploads, 0);
});

test('quoted media descriptor retains a synthetic WAMessage key for one re-upload attempt', () => {
  const raw = { key: { remoteJid: '6280000000000@s.whatsapp.net' }, message: { extendedTextMessage: { text: '.save', contextInfo: {
    stanzaId: 'quoted-media-1', participant: '6281111111111@s.whatsapp.net',
    quotedMessage: { imageMessage: { mimetype: 'image/jpeg' } }
  } } } };
  const quoted = inspectIncomingMessage(raw).quotedMedia;
  assert.equal(quoted.sourceMessage.key.id, 'quoted-media-1');
  assert.equal(quoted.sourceMessage.key.remoteJid, raw.key.remoteJid);
  assert.equal(quoted.sourceMessage.key.fromMe, undefined);
  assert.equal(quoted.sourceMessage.isQuoted, true);
  assert.equal(quoted.sourceMessage.message.imageMessage.mimetype, 'image/jpeg');
});

test('rejects invalid media timeout and byte-limit options', async () => {
  const media = describeMessageMedia({ imageMessage: { mimetype: 'image/jpeg' } });
  const mock = { downloadContentFromMessage: async function* () { yield Buffer.from([1]); } };
  await assert.rejects(downloadMediaPayload(media, { maxBytes: 0, baileys: mock }), /maxBytes/);
  await assert.rejects(downloadMediaPayload(media, { timeoutMs: 500, baileys: mock }), /timeoutMs/);
});


test('aborts a stalled media stream after the configured timeout', async () => {
  const { PassThrough } = await import('node:stream');
  const media = describeMessageMedia({ imageMessage: { mimetype: 'image/jpeg' } });
  const mock = { downloadContentFromMessage: async () => new PassThrough() };
  await assert.rejects(downloadMediaPayload(media, { timeoutMs: 1000, baileys: mock }), /melewati batas waktu 1 detik/);
});


test('does not request re-upload for quoted media when sender direction cannot be determined', async () => {
  const raw = { key: { remoteJid: '6280000000000@s.whatsapp.net' }, message: { extendedTextMessage: { text: '.save', contextInfo: {
    stanzaId: 'quoted-private-1', quotedMessage: { imageMessage: { mimetype: 'image/jpeg' } }
  } } } };
  const quoted = inspectIncomingMessage(raw).quotedMedia;
  const baileys = { downloadContentFromMessage: async function* () { throw new Error('HTTP 404 media expired'); } };
  let reuploads = 0;
  const sock = { user: { id: '6280000000000@s.whatsapp.net' }, updateMediaMessage: async () => { reuploads += 1; } };
  await assert.rejects(downloadMediaPayload(quoted, { baileys, sock }), /arah pesan.*tidak dapat dipastikan/);
  assert.equal(reuploads, 0);
});
