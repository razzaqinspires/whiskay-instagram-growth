const WRAPPER_KEYS = [
  'ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2',
  'viewOnceMessageV2Extension', 'documentWithCaptionMessage', 'deviceSentMessage',
  'editedMessage', 'associatedChildMessage'
];

const MEDIA_TYPES = Object.freeze({
  imageMessage: 'image', videoMessage: 'video', ptvMessage: 'video',
  audioMessage: 'audio', documentMessage: 'document', stickerMessage: 'sticker'
});

const STRUCTURED_MESSAGE_TYPES = Object.freeze({
  contactMessage: 'contact', contactsArrayMessage: 'contacts', locationMessage: 'location',
  liveLocationMessage: 'live_location', pollCreationMessage: 'poll',
  pollCreationMessageV2: 'poll', pollCreationMessageV3: 'poll', pollUpdateMessage: 'poll_vote',
  productMessage: 'product', orderMessage: 'order', eventMessage: 'event',
  buttonsMessage: 'legacy_buttons', templateMessage: 'template',
  listMessage: 'legacy_list', interactiveMessage: 'interactive',
  interactiveResponseMessage: 'interactive_response', reactionMessage: 'reaction',
  protocolMessage: 'protocol', stickerPackMessage: 'sticker_pack',
  newsletterAdminInviteMessage: 'newsletter_invite',
  buttonsResponseMessage: 'button_response', templateButtonReplyMessage: 'template_button_response',
  listResponseMessage: 'list_response', requestPaymentMessage: 'payment_request'
});

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Buffer.isBuffer(value) && !(value instanceof Uint8Array));
}

export function unwrapMessageContent(message) {
  let content = message?.message || message || null;
  let depth = 0;
  const seen = new Set();
  while (isObject(content) && depth < 16 && !seen.has(content)) {
    seen.add(content);
    depth += 1;
    let next = null;
    for (const key of WRAPPER_KEYS) {
      const candidate = content[key]?.message;
      if (isObject(candidate)) { next = candidate; break; }
    }
    if (!next && content.protocolMessage?.editedMessage) next = content.protocolMessage.editedMessage;
    if (!next && content.templateMessage) {
      const hydrated = content.templateMessage.hydratedTemplate || content.templateMessage.hydratedFourRowTemplate || content.templateMessage.fourRowTemplate;
      if (hydrated?.imageMessage) next = { imageMessage: hydrated.imageMessage };
      else if (hydrated?.videoMessage) next = { videoMessage: hydrated.videoMessage };
      else if (hydrated?.documentMessage) next = { documentMessage: hydrated.documentMessage };
      else if (hydrated?.locationMessage) next = { locationMessage: hydrated.locationMessage };
      else if (hydrated?.hydratedContentText || hydrated?.contentText) next = { conversation: hydrated.hydratedContentText || hydrated.contentText };
    }
    if (!next) break;
    content = next;
  }
  return isObject(content) ? content : {};
}

function firstPayload(content, keys) {
  for (const key of keys) {
    if (content?.[key]) return { key, payload: content[key] };
  }
  return null;
}

function findContextInfo(root, maxDepth = 8) {
  const queue = [{ value: root, depth: 0 }];
  const seen = new Set();
  while (queue.length) {
    const { value, depth } = queue.shift();
    if (!isObject(value) || seen.has(value) || depth > maxDepth) continue;
    seen.add(value);
    if (isObject(value.contextInfo)) return value.contextInfo;
    if (isObject(value.messageContextInfo?.contextInfo)) return value.messageContextInfo.contextInfo;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'quotedMessage' || key === 'messageSecret' || key === 'message') continue;
      if (isObject(child)) queue.push({ value: child, depth: depth + 1 });
    }
  }
  return null;
}

function hasViewOnceWrapper(root) {
  const queue = [{ value: root, depth: 0 }];
  const seen = new Set();
  while (queue.length) {
    const { value, depth } = queue.shift();
    if (!isObject(value) || seen.has(value) || depth > 12) continue;
    seen.add(value);
    if (value.viewOnceMessage || value.viewOnceMessageV2 || value.viewOnceMessageV2Extension || value.key?.isViewOnce) return true;
    for (const child of Object.values(value)) if (isObject(child)) queue.push({ value: child, depth: depth + 1 });
  }
  return false;
}

function findMediaPayload(content, maxDepth = 10) {
  const queue = [{ value: content, depth: 0 }];
  const seen = new Set();
  while (queue.length) {
    const { value, depth } = queue.shift();
    if (!isObject(value) || seen.has(value) || depth > maxDepth) continue;
    seen.add(value);
    const found = firstPayload(value, Object.keys(MEDIA_TYPES));
    if (found) return found;
    for (const [key, child] of Object.entries(value)) {
      if (['contextInfo', 'messageContextInfo', 'quotedMessage', 'messageSecret', 'key'].includes(key)) continue;
      if (isObject(child)) queue.push({ value: child, depth: depth + 1 });
    }
  }
  return null;
}

function findMessageText(content, media = null) {
  const candidates = [
    content?.conversation,
    content?.extendedTextMessage?.text,
    content?.interactiveMessage?.body?.text,
    content?.interactiveResponseMessage?.body?.text,
    content?.buttonsResponseMessage?.selectedDisplayText,
    content?.templateButtonReplyMessage?.selectedDisplayText,
    media?.caption
  ];
  return String(candidates.find(value => typeof value === 'string' && value.trim()) || '');
}

export function describeMessageMedia(message) {
  const content = unwrapMessageContent(message);
  const found = findMediaPayload(content);
  if (found) {
    const { key, payload } = found;
    const fileLength = Number(payload.fileLength?.toNumber?.() ?? payload.fileLength ?? 0);
    const type = MEDIA_TYPES[key];
    return {
      type, messageType: key, downloadType: type === 'video' ? 'video' : type,
      mimetype: String(payload.mimetype || ''),
      fileName: String(payload.fileName || (type === 'video' ? 'video.mp4' : type === 'image' ? 'image.jpg' : type === 'audio' ? 'audio.bin' : 'media.bin')),
      fileLength: Number.isFinite(fileLength) && fileLength >= 0 ? fileLength : 0,
      caption: String(payload.caption || ''),
      seconds: Number(payload.seconds || 0), width: Number(payload.width || 0), height: Number(payload.height || 0),
      isAnimated: Boolean(payload.isAnimated || payload.gifPlayback),
      viewOnce: hasViewOnceWrapper(message) || Boolean(payload.viewOnce), downloadable: true, payload, content
    };
  }
  const type = Object.keys(content).find(key => Object.hasOwn(STRUCTURED_MESSAGE_TYPES, key));
  return type ? { type: STRUCTURED_MESSAGE_TYPES[type], messageType: type, payload: content[type], content, viewOnce: hasViewOnceWrapper(message), downloadable: false } : null;
}

export function describeQuotedMedia(message) {
  const content = unwrapMessageContent(message);
  const contextInfo = findContextInfo(content);
  if (!contextInfo?.quotedMessage) return null;
  const media = describeMessageMedia(contextInfo.quotedMessage);
  return media ? {
    ...media, quoted: true,
    stanzaId: contextInfo.stanzaId || null,
    participant: contextInfo.participant || null,
    remoteJid: contextInfo.remoteJid || message?.key?.remoteJid || null
  } : null;
}

export async function downloadMediaPayload(media, { maxBytes = 64 * 1024 * 1024, baileys: injectedBaileys } = {}) {
  const descriptor = media?.payload ? media : describeMessageMedia(media);
  if (!descriptor?.payload || !['image', 'video', 'audio', 'document', 'sticker'].includes(descriptor.type)) {
    throw new TypeError('Pesan tidak berisi media yang dapat diunduh.');
  }
  if (descriptor.fileLength > maxBytes) throw new RangeError(`Media melebihi batas ${Math.round(maxBytes / 1048576)} MiB.`);
  const baileys = injectedBaileys || await import('@whiskeysockets/baileys');
  if (typeof baileys.downloadContentFromMessage !== 'function') throw new Error('Baileys media downloader tidak tersedia pada versi terpasang.');
  const stream = await baileys.downloadContentFromMessage(descriptor.payload, descriptor.downloadType || descriptor.type);
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) throw new RangeError(`Media melebihi batas ${Math.round(maxBytes / 1048576)} MiB.`);
    chunks.push(buffer);
  }
  if (!total) throw new Error('Baileys mengembalikan media kosong.');
  return Buffer.concat(chunks, total);
}

export function inspectIncomingMessage(raw) {
  const content = unwrapMessageContent(raw);
  const media = describeMessageMedia(raw);
  const quotedMedia = describeQuotedMedia(raw);
  const contextInfo = findContextInfo(content) || {};
  const pollUpdate = content?.pollUpdateMessage || content?.protocolMessage?.editedMessage?.pollUpdateMessage || null;
  const decryptedVote = Array.isArray(pollUpdate?.vote?.selectedOptions) ? pollUpdate : null;
  const pollCreationMessageKey = decryptedVote?.pollCreationMessageKey ? {
    ...decryptedVote.pollCreationMessageKey,
    remoteJid: decryptedVote.pollCreationMessageKey.remoteJid || raw?.key?.remoteJid
  } : null;
  return {
    key: raw?.key || null,
    chat: raw?.key?.remoteJid || null,
    sender: raw?.key?.participant || raw?.key?.remoteJid || null,
    fromMe: Boolean(raw?.key?.fromMe),
    isGroup: String(raw?.key?.remoteJid || '').endsWith('@g.us'),
    content, media, quotedMedia,
    isPollUpdate: Boolean(decryptedVote), pollUpdate: decryptedVote, pollCreationMessageKey,
    mentionedJid: Array.isArray(contextInfo.mentionedJid) ? contextInfo.mentionedJid : [],
    text: findMessageText(content, media)
  };
}
