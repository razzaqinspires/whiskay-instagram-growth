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
  pollCreationMessageV2: 'poll', pollCreationMessageV3: 'poll', pollCreationMessageV4: 'poll', pollCreationMessageV5: 'poll',
  pollUpdateMessage: 'poll_vote', pollResultSnapshotMessage: 'poll_result', pollResultSnapshotMessageV3: 'poll_result',
  productMessage: 'product', orderMessage: 'order', eventMessage: 'event', invoiceMessage: 'invoice',
  buttonsMessage: 'legacy_buttons', templateMessage: 'template',
  listMessage: 'legacy_list', interactiveMessage: 'interactive',
  interactiveResponseMessage: 'interactive_response', reactionMessage: 'reaction',
  protocolMessage: 'protocol', stickerPackMessage: 'sticker_pack', stickerSyncRmrMessage: 'sticker_sync',
  newsletterAdminInviteMessage: 'newsletter_invite', newsletterFollowerInviteMessageV2: 'newsletter_follower_invite',
  buttonsResponseMessage: 'button_response', templateButtonReplyMessage: 'template_button_response',
  listResponseMessage: 'list_response', requestPaymentMessage: 'payment_request', paymentInviteMessage: 'payment_invite',
  requestPhoneNumberMessage: 'request_phone_number', albumMessage: 'album',
  scheduledCallCreationMessage: 'scheduled_call', scheduledCallEditMessage: 'scheduled_call_edit',
  pinInChatMessage: 'pin', keepInChatMessage: 'keep_in_chat', placeholderMessage: 'placeholder',
  botForwardedMessage: 'ai_rich_response', richResponseMessage: 'ai_rich_response', botInvokeMessage: 'bot_invoke',
  botTaskMessage: 'bot_task', questionMessage: 'question', questionReplyMessage: 'question_reply',
  questionResponseMessage: 'question_response', statusQuestionAnswerMessage: 'status_question_answer',
  statusQuotedMessage: 'status_quoted', statusStickerInteractionMessage: 'status_sticker_interaction',
  statusNotificationMessage: 'status_notification', groupMentionedMessage: 'group_mentioned',
  groupStatusMentionMessage: 'group_status_mention', groupStatusMessage: 'group_status', groupStatusMessageV2: 'group_status',
  statusMentionMessage: 'status_mention', limitSharingMessage: 'limit_sharing',
  messageHistoryNotice: 'history_notice', messageHistoryBundle: 'history_bundle',
  sendPaymentMessage: 'payment', declinePaymentRequestMessage: 'payment_decline', cancelPaymentRequestMessage: 'payment_cancel',
  encReactionMessage: 'encrypted_reaction', encEventResponseMessage: 'encrypted_event_response',
  commentMessage: 'comment', encCommentMessage: 'encrypted_comment', bcallMessage: 'business_call',
  lottieStickerMessage: 'lottie_sticker', highlyStructuredMessage: 'highly_structured',
  secretEncryptedMessage: 'secret_encrypted'
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
    // AIRichResponse nests its quoted context under FutureProofMessage.message.
    if (isObject(value.botForwardedMessage?.message)) queue.push({ value: value.botForwardedMessage.message, depth: depth + 1 });
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
    content?.botForwardedMessage?.message?.richResponseMessage?.submessages?.map(item => item?.messageText).filter(Boolean).join('\n'),
    content?.richResponseMessage?.submessages?.map(item => item?.messageText).filter(Boolean).join('\n'),
    content?.questionMessage?.question?.text,
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
      viewOnce: hasViewOnceWrapper(message) || Boolean(payload.viewOnce), downloadable: true, payload, content,
      sourceMessage: message?.message && message?.key ? message : null
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
    remoteJid: contextInfo.remoteJid || message?.key?.remoteJid || null,
    sourceMessage: contextInfo.stanzaId ? {
      key: {
        remoteJid: contextInfo.remoteJid || message?.key?.remoteJid || null,
        id: contextInfo.stanzaId,
        participant: contextInfo.participant || undefined,
        fromMe: undefined
      },
      message: contextInfo.quotedMessage,
      isQuoted: true
    } : null
  } : null;
}

async function collectMediaStream(stream, { maxBytes, timeoutMs }) {
  if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') {
    throw new TypeError('Baileys tidak mengembalikan readable media stream.');
  }
  const chunks = [];
  let total = 0;
  let timeout;
  try {
    const timeoutError = new Error(`Download media melewati batas waktu ${Math.round(timeoutMs / 1000)} detik.`);
    const timeoutPromise = new Promise((_, reject) => {
      timeout = setTimeout(() => {
        stream.destroy?.(timeoutError);
        reject(timeoutError);
      }, timeoutMs);
    });
    const readPromise = (async () => {
      for await (const chunk of stream) {
        const buffer = Buffer.from(chunk);
        total += buffer.length;
        if (total > maxBytes) {
          const error = new RangeError(`Media melebihi batas ${Math.round(maxBytes / 1048576)} MiB.`);
          stream.destroy?.(error);
          throw error;
        }
        chunks.push(buffer);
      }
      if (!total) throw new Error('Baileys mengembalikan media kosong.');
      return Buffer.concat(chunks, total);
    })();
    return await Promise.race([readPromise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function downloadMediaPayload(media, {
  maxBytes = 64 * 1024 * 1024,
  timeoutMs = 45_000,
  sock = null,
  logger = null,
  retryReupload = true,
  baileys: injectedBaileys
} = {}) {
  const descriptor = media?.payload ? media : describeMessageMedia(media);
  if (!descriptor?.payload || !['image', 'video', 'audio', 'document', 'sticker'].includes(descriptor.type)) {
    throw new TypeError('Pesan tidak berisi media yang dapat diunduh.');
  }
  const byteLimit = Number(maxBytes);
  const timeoutLimit = Number(timeoutMs);
  if (!Number.isSafeInteger(byteLimit) || byteLimit < 1) throw new RangeError('maxBytes harus bilangan bulat positif.');
  if (!Number.isSafeInteger(timeoutLimit) || timeoutLimit < 1000 || timeoutLimit > 300_000) {
    throw new RangeError('timeoutMs harus berada di antara 1000 dan 300000.');
  }
  if (descriptor.fileLength > byteLimit) throw new RangeError(`Media melebihi batas ${Math.round(byteLimit / 1048576)} MiB.`);
  const baileys = injectedBaileys || await import('@whiskeysockets/baileys');
  if (typeof baileys.downloadContentFromMessage !== 'function') throw new Error('Baileys media downloader tidak tersedia pada versi terpasang.');

  const download = async current => {
    const stream = await baileys.downloadContentFromMessage(current.payload, current.downloadType || current.type);
    return collectMediaStream(stream, { maxBytes: byteLimit, timeoutMs: timeoutLimit });
  };

  try {
    return await download(descriptor);
  } catch (firstError) {
    if (firstError instanceof RangeError) throw firstError;
    const sourceMessage = descriptor.sourceMessage;
    if (!retryReupload || typeof sock?.updateMediaMessage !== 'function' || !sourceMessage?.key?.id || !sourceMessage?.message) {
      throw firstError;
    }
    if (sourceMessage.isQuoted && typeof sourceMessage.key.fromMe !== 'boolean') {
      const participant = sourceMessage.key.participant;
      const selfJid = sock.user?.id || sock.authState?.creds?.me?.id;
      if (!participant || !selfJid) {
        throw new Error('Re-upload quoted media dilewati karena arah pesan (fromMe) tidak dapat dipastikan.', { cause: firstError });
      }
      const normalizeJid = value => String(value).split(':', 1)[0].toLowerCase();
      sourceMessage.key.fromMe = normalizeJid(participant) === normalizeJid(selfJid);
      delete sourceMessage.isQuoted;
    }
    logger?.warn?.({ error: firstError, messageId: sourceMessage.key.id }, '[MEDIA] Download gagal; meminta re-upload media satu kali.');
    let refreshed;
    try {
      refreshed = await sock.updateMediaMessage(sourceMessage);
    } catch (reuploadError) {
      const combined = new Error(`Download media gagal dan permintaan re-upload juga gagal: ${reuploadError.message || reuploadError}`);
      combined.cause = firstError;
      combined.reuploadError = reuploadError;
      throw combined;
    }
    const refreshedDescriptor = describeMessageMedia(refreshed);
    if (!refreshedDescriptor?.payload) {
      throw new Error('WhatsApp tidak mengembalikan payload media baru setelah re-upload.', { cause: firstError });
    }
    return download(refreshedDescriptor);
  }
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
