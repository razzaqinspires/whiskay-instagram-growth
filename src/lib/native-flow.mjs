import { randomBytes, randomUUID } from 'node:crypto';

/**
 * WHISKAY Native Flow transport for Baileys v7 (ESM runtime).
 *
 * This module deliberately does not import the supplied CommonJS serializer:
 * Baileys v7 is ESM-only, while that serializer and helpers use require().
 * Only user-initiated actions are emitted; every command action is routed back
 * through the normal owner-authenticated command handler.
 */

const ACTION_PREFIX = 'wsk:cmd:';
const BUTTON_TYPES = new Set(['quick_reply', 'cta_url', 'webview_url', 'open_webview', 'url', 'cta_call', 'cta_copy', 'cta_catalog', 'single_select', 'list']);
const TEXT_LIMIT = 1024;

function httpsUrl(rawValue, label) {
  const raw = cleanText(rawValue, label, 2048, true);
  let url;
  try { url = new URL(raw); } catch { throw new TypeError(`${label} tidak valid.`); }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new TypeError(`${label} wajib HTTPS tanpa kredensial.`);
  }
  return url.toString();
}

function localMediaSource(input, label) {
  if (Buffer.isBuffer(input) || input instanceof Uint8Array) return input;
  if (typeof input === 'string') {
    if (/^(?:https?|data|blob|file):/i.test(input.trim())) {
      throw new TypeError(`${label} hanya menerima Buffer atau path lokal; URL remote tidak diunduh.`);
    }
    if (!input.trim()) throw new TypeError(`${label} kosong.`);
    return { url: input };
  }
  if (input && typeof input === 'object') {
    const url = typeof input.url === 'string' ? input.url.trim() : '';
    if (/^(?:https?|data|blob|file):/i.test(url)) {
      throw new TypeError(`${label} hanya menerima media lokal; URL remote tidak diunduh.`);
    }
    return input;
  }
  throw new TypeError(`${label} harus berupa Buffer atau path lokal.`);
}

function cleanText(value, field, max = TEXT_LIMIT, required = false) {
  const result = String(value ?? '').trim();
  if (required && !result) throw new TypeError(`${field} wajib diisi.`);
  if (result.length > max) throw new RangeError(`${field} maksimal ${max} karakter.`);
  return result;
}

export function commandActionId(commandText) {
  const command = cleanText(commandText, 'command action', 120, true);
  if (!/^[.!/#][a-z0-9][a-z0-9_-]*(?:\s+[a-z0-9][a-z0-9_-]*)*$/i.test(command)) {
    throw new TypeError('Command action harus berupa command WHISKAY tanpa karakter kontrol.');
  }
  return `${ACTION_PREFIX}${command}`;
}

export function extractCommandActionId(id) {
  const value = typeof id === 'string' ? id : '';
  if (!value.startsWith(ACTION_PREFIX)) return null;
  const command = value.slice(ACTION_PREFIX.length).trim();
  if (!command || command.length > 120 || !/^[.!/#][a-z0-9][a-z0-9_-]*(?:\s+[a-z0-9][a-z0-9_-]*)*$/i.test(command)) return null;
  return command;
}

function normalizeSections(sections = []) {
  if (!Array.isArray(sections) || sections.length < 1 || sections.length > 10) {
    throw new RangeError('single_select membutuhkan 1–10 sections.');
  }
  return sections.map((section, sectionIndex) => {
    const rows = Array.isArray(section?.rows) ? section.rows : [];
    if (rows.length < 1 || rows.length > 20) throw new RangeError(`Section ${sectionIndex + 1} harus memiliki 1–20 rows.`);
    return {
      title: cleanText(section.title || `Pilihan ${sectionIndex + 1}`, 'section title', 80, true),
      ...(section.highlight_label ? { highlight_label: cleanText(section.highlight_label, 'highlight_label', 40) } : {}),
      rows: rows.map((row, rowIndex) => {
        const id = cleanText(row.id, `row ${rowIndex + 1} id`, 120, true);
        return {
          ...(row.header ? { header: cleanText(row.header, 'row header', 60) } : {}),
          title: cleanText(row.title, 'row title', 80, true),
          ...(row.description ? { description: cleanText(row.description, 'row description', 120) } : {}),
          id
        };
      })
    };
  });
}

export function normalizeNativeButtons(buttons = []) {
  if (!Array.isArray(buttons) || buttons.length < 1 || buttons.length > 10) {
    throw new RangeError('Native Flow membutuhkan 1–10 tombol.');
  }
  return buttons.map((button, index) => {
    let name = String(button?.type || button?.name || 'quick_reply').toLowerCase();
    if (!BUTTON_TYPES.has(name)) throw new TypeError(`Jenis tombol tidak didukung: ${name}`);
    const label = cleanText(button.title || button.display_text || button.label, `button ${index + 1} label`, 30, true);
    let params;
    if (name === 'quick_reply') {
      const id = cleanText(button.id, `button ${index + 1} id`, 120, true);
      params = { display_text: label, id };
    } else if (['cta_url', 'webview_url', 'open_webview', 'url'].includes(name)) {
      const wantsWebview = ['webview_url', 'open_webview'].includes(name) || button.webview_interaction === true;
      name = 'cta_url';
      const rawUrl = cleanText(button.url || button.link, `button ${index + 1} url`, 2048, true);
      const normalizedUrl = httpsUrl(rawUrl, `URL tombol ${index + 1}`);
      const merchantUrl = httpsUrl(button.merchant_url || normalizedUrl, `Merchant URL tombol ${index + 1}`);
      params = { display_text: label, url: normalizedUrl, merchant_url: merchantUrl, ...(wantsWebview ? { webview_interaction: true } : {}) };
    } else if (name === 'cta_call') {
      const phone = cleanText(button.phone, `button ${index + 1} phone`, 20, true).replace(/[\s()-]/g, '');
      if (!/^\+?[1-9]\d{6,14}$/.test(phone)) throw new TypeError('Nomor CTA Call harus dalam format internasional.');
      params = { display_text: label, phone, phone_number: phone };
    } else if (name === 'cta_copy') {
      const copyCode = cleanText(button.copy_code, `button ${index + 1} copy_code`, 256, true);
      if (/(password|passwd|secret|api[_-]?key|access[_-]?token|bearer|private[_-]?key)/i.test(copyCode)) {
        throw new TypeError('CTA Copy tidak boleh berisi password, token, API key, atau rahasia.');
      }
      params = { display_text: label, id: cleanText(button.id || `copy_${index + 1}`, 'copy id', 120), copy_code: copyCode };
    } else if (name === 'cta_catalog') {
      params = { display_text: label };
    } else {
      name = 'single_select';
      params = { title: cleanText(button.listTitle || label, 'single_select title', 80, true), sections: normalizeSections(button.sections) };
    }
    return { name, buttonParamsJson: JSON.stringify(params) };
  });
}

export function buildNativeFlowTextFallback({ title = '', subtitle = '', body = '', footer = '', buttons = [] } = {}) {
  const lines = [];
  if (title) lines.push(`*${String(title)}*`);
  if (subtitle) lines.push(`_${String(subtitle)}_`);
  if (body) lines.push(String(body));
  const choices = [];
  for (const button of Array.isArray(buttons) ? buttons : []) {
    const name = String(button?.type || button?.name || 'quick_reply').toLowerCase();
    if (name === 'single_select' || name === 'list') {
      for (const section of button.sections || []) {
        if (section.title) choices.push(`— ${section.title} —`);
        for (const row of section.rows || []) choices.push(`• ${row.title}: ${row.id}`);
      }
    } else if (name === 'cta_copy') {
      choices.push(`• ${button.title || button.display_text || 'Salin'}: ${button.copy_code || '[kode tidak tersedia]'}`);
    } else if (['cta_url', 'webview_url', 'open_webview', 'url'].includes(name)) {
      choices.push(`• ${button.title || button.display_text || 'Buka tautan'}: ${button.url || button.link || ''}`);
    } else if (name === 'cta_call') {
      choices.push(`• ${button.title || button.display_text || 'Telepon'}: ${button.phone || ''}`);
    } else {
      choices.push(`• ${button.title || button.display_text || button.label || button.id || 'Pilihan'}${button.id ? ` (${button.id})` : ''}`);
    }
  }
  if (choices.length) lines.push('', ...choices);
  if (footer) lines.push('', `_${String(footer)}_`);
  return lines.join('\n').slice(0, 4000);
}

function makeBizNodes(targetJid, flowName = 'mixed', { quality = true, botNode = true } = {}) {
  // Match the complete envelope used by the supplied serializer: WHISKAY's
  // earlier adapter omitted quality_control and the biz attributes. A relay
  // ACK alone does not prove that the recipient client can render the payload.
  const qualityControl = {
    tag: 'quality_control',
    attrs: {
      decision_id: randomBytes(20).toString('hex'),
      source_type: 'third_party'
    },
    content: [{ tag: 'decision_source', attrs: { value: 'df' } }]
  };
  const nodes = [{
    tag: 'biz',
    attrs: {
      actual_actors: '2',
      host_storage: '2',
      privacy_mode_ts: String(Math.floor(Date.now() / 1000))
    },
    content: [{
      tag: 'interactive',
      attrs: { type: 'native_flow', v: '1' },
      content: [{ tag: 'native_flow', attrs: { v: '9', name: flowName } }]
    }, ...(quality ? [qualityControl] : [])]
  }];
  if (botNode && !String(targetJid).endsWith('@g.us')) nodes.push({ tag: 'bot', attrs: { biz_bot: '1' } });
  return nodes;
}

async function loadBaileys(injected) {
  return injected || import('@whiskeysockets/baileys');
}

async function relayInteractive(sock, jid, messageContent, quoted, baileys, { additionalNodes } = {}) {
  const targetJid = typeof sock.decodeJid === 'function' ? sock.decodeJid(jid) : jid;
  if (!targetJid || typeof sock.relayMessage !== 'function') throw new TypeError('Socket tidak menyediakan relayMessage/JID tujuan.');
  const userJid = sock.user?.id || sock.authState?.creds?.me?.id;
  const proto = baileys.proto;
  const messageId = typeof baileys.generateMessageIDV2 === 'function' && userJid
    ? baileys.generateMessageIDV2(userJid)
    : undefined;
  const generated = baileys.generateWAMessageFromContent(targetJid, messageContent, {
    userJid,
    messageId,
    timestamp: new Date(),
    quoted: quoted || undefined,
    logger: sock.logger
  });
  if (!generated?.message || !generated?.key?.id) throw new Error('Baileys tidak menghasilkan WAMessage yang valid.');
  const requiredNodes = makeBizNodes(targetJid);
  const nodes = [...requiredNodes, ...(Array.isArray(additionalNodes) ? additionalNodes : [])];
  await sock.relayMessage(targetJid, generated.message, { messageId: generated.key.id, additionalNodes: nodes });
  return generated;
}

export async function sendNativeFlow(sock, jid, options = {}, quoted = null, { baileys: injectedBaileys } = {}) {
  const fallback = buildNativeFlowTextFallback(options);
  try {
    const buttons = normalizeNativeButtons(options.buttons);
    const baileys = await loadBaileys(injectedBaileys);
    let preparedHeaderMedia = {};
    const mediaInput = options.image || options.media;
    const mediaType = ['image', 'video', 'document'].includes(options.mediaType) ? options.mediaType : 'image';
    if (mediaInput) {
      if (typeof baileys.prepareWAMessageMedia !== 'function' || typeof sock?.waUploadToServer !== 'function') {
        throw new Error('Upload media untuk interactive header tidak tersedia pada socket ini.');
      }
      const mediaSource = localMediaSource(mediaInput, 'Interactive header media');
      preparedHeaderMedia = await baileys.prepareWAMessageMedia({ [mediaType]: mediaSource }, { upload: sock.waUploadToServer });
    }
    const hasHeader = Boolean(options.title || options.subtitle || mediaInput);
    const interactiveMessage = {
      ...(hasHeader ? { header: { ...(options.title ? { title: cleanText(options.title, 'title', 80) } : {}), ...(options.subtitle ? { subtitle: cleanText(options.subtitle, 'subtitle', 120) } : {}), hasMediaAttachment: Boolean(mediaInput), ...preparedHeaderMedia } } : {}),
      body: { text: cleanText(options.body, 'body', 3000) },
      ...(options.footer ? { footer: { text: cleanText(options.footer, 'footer', 200) } } : {}),
      ...(options.contextInfo ? { contextInfo: options.contextInfo } : {}),
      nativeFlowMessage: { buttons, messageParamsJson: '' }
    };
    const messageContextInfo = typeof baileys.proto?.MessageContextInfo?.create === 'function'
      ? baileys.proto.MessageContextInfo.create({ deviceListMetadata: {}, deviceListMetadataVersion: 2 })
      : { deviceListMetadata: {}, deviceListMetadataVersion: 2 };
    const payload = options.wrapper === 'none'
      ? { messageContextInfo, interactiveMessage }
      : { viewOnceMessage: { message: { messageContextInfo, interactiveMessage } } };
    return await relayInteractive(sock, jid, payload, quoted, baileys, { additionalNodes: options.additionalNodes });
  } catch (error) {
    if (typeof sock?.sendMessage !== 'function') throw error;
    const result = await sock.sendMessage(jid, { text: fallback || 'Interactive message tidak tersedia pada koneksi ini.' }, quoted ? { quoted } : {});
    return { ...result, interactiveFallback: true, fallbackReason: error?.message || 'native-flow-unavailable' };
  }
}

export function buildCarouselCards(cards = []) {
  if (!Array.isArray(cards) || cards.length < 2 || cards.length > 10) throw new RangeError('Carousel membutuhkan 2–10 cards.');
  return cards.map((card, index) => ({
    header: {
      title: cleanText(card.title, `card ${index + 1} title`, 80, true),
      ...(card.subtitle ? { subtitle: cleanText(card.subtitle, `card ${index + 1} subtitle`, 120) } : {}),
      hasMediaAttachment: Boolean(card.image)
    },
    body: { text: cleanText(card.body, `card ${index + 1} body`, 900, true) },
    footer: { text: cleanText(card.footer, `card ${index + 1} footer`, 120) },
    nativeFlowMessage: { messageParamsJson: '', buttons: normalizeNativeButtons(card.buttons) }
  }));
}

export async function sendNativeCarousel(sock, jid, options = {}, quoted = null, { baileys: injectedBaileys } = {}) {
  const fallback = [options.title, options.body, ...(options.cards || []).map(card => `\n*${card.title}*\n${card.body}`), options.footer].filter(Boolean).join('\n').slice(0, 4000);
  try {
    const cards = buildCarouselCards(options.cards);
    const baileys = await loadBaileys(injectedBaileys);
    for (let index = 0; index < options.cards.length; index += 1) {
      const card = options.cards[index];
      if (!card.image) continue;
      if (typeof baileys.prepareWAMessageMedia !== 'function' || typeof sock?.waUploadToServer !== 'function') {
        throw new Error(`Upload image carousel card ${index + 1} tidak tersedia.`);
      }
      const image = localMediaSource(card.image, `Carousel image card ${index + 1}`);
      const prepared = await baileys.prepareWAMessageMedia({ image }, { upload: sock.waUploadToServer });
      cards[index].header = { ...cards[index].header, hasMediaAttachment: true, ...prepared };
    }
    const contextInfo = {
      mentionedJid: [], groupMentions: [], forwardingScore: 0, isForwarded: false,
      ...(options.contextInfo || {})
    };
    const messageContextInfo = typeof baileys.proto?.MessageContextInfo?.create === 'function'
      ? baileys.proto.MessageContextInfo.create({ deviceListMetadata: {}, deviceListMetadataVersion: 2 })
      : { deviceListMetadata: {}, deviceListMetadataVersion: 2 };
    const carouselMessage = {
      header: { title: cleanText(options.title, 'carousel title', 80), hasMediaAttachment: false },
      body: { text: cleanText(options.body, 'carousel body', 1000) },
      ...(options.footer ? { footer: { text: cleanText(options.footer, 'carousel footer', 200) } } : {}),
      contextInfo,
      carouselMessage: { cards, messageVersion: 1, carouselCardType: 1 }
    };
    const content = options.wrapper === 'view-once'
      ? { viewOnceMessage: { message: { messageContextInfo, interactiveMessage: carouselMessage } } }
      : { messageContextInfo, interactiveMessage: carouselMessage };
    const targetJid = typeof sock.decodeJid === 'function' ? sock.decodeJid(jid) : jid;
    return await relayInteractive(sock, jid, content, quoted, baileys, { additionalNodes: options.additionalNodes });
  } catch (error) {
    if (typeof sock?.sendMessage !== 'function') throw error;
    const result = await sock.sendMessage(jid, { text: fallback || 'Carousel tidak tersedia pada koneksi ini.' }, quoted ? { quoted } : {});
    return { ...result, interactiveFallback: true, fallbackReason: error?.message || 'carousel-unavailable' };
  }
}


/** Legacy hydrated-template button payload for compatibility-only deployments. */
export function buildTemplateButtonsPayload({ text = '', footer = '', buttons = [], headerMessage = null } = {}) {
  if (!Array.isArray(buttons) || buttons.length < 1 || buttons.length > 3) throw new RangeError('Template Buttons memerlukan 1–3 tombol.');
  const hydratedButtons = buttons.map((button, index) => {
    const label = cleanText(button.title || button.display_text || button.label, `template button ${index + 1}`, 25, true);
    const type = String(button.type || 'quick_reply').toLowerCase();
    if (type === 'quick_reply') {
      return { quickReplyButton: { displayText: label, id: cleanText(button.id, 'quick reply id', 120, true) } };
    }
    if (type === 'cta_url' || type === 'webview_url' || type === 'open_webview') {
      const url = httpsUrl(button.url || button.link, 'Template URL');
      return { urlButton: { displayText: label, url } };
    }
    if (type === 'cta_call') {
      const phoneNumber = cleanText(button.phone || button.phone_number, 'template phone', 20, true).replace(/[\s()-]/g, '');
      if (!/^\+?[1-9]\d{6,14}$/.test(phoneNumber)) throw new TypeError('Nomor template call harus format internasional.');
      return { callButton: { displayText: label, phoneNumber } };
    }
    throw new TypeError(`Template Buttons tidak mendukung jenis ${type}; gunakan Native Flow.`);
  });
  return {
    templateMessage: {
      hydratedTemplate: {
        hydratedContentText: cleanText(text, 'template text', 3000, true),
        ...(footer ? { hydratedFooterText: cleanText(footer, 'template footer', 200) } : {}),
        ...(headerMessage ? { ...headerMessage } : {}),
        hydratedButtons
      }
    }
  };
}

export async function sendTemplateButtons(sock, jid, options = {}, quoted = null, { baileys: injectedBaileys } = {}) {
  const payload = buildTemplateButtonsPayload(options);
  const baileys = await loadBaileys(injectedBaileys);
  const targetJid = typeof sock.decodeJid === 'function' ? sock.decodeJid(jid) : jid;
  if (!targetJid || typeof sock?.relayMessage !== 'function' || typeof baileys.generateWAMessageFromContent !== 'function') {
    throw new TypeError('Hydrated Template memerlukan generateWAMessageFromContent dan relayMessage.');
  }
  const userJid = sock.user?.id || sock.authState?.creds?.me?.id;
  const messageId = typeof baileys.generateMessageIDV2 === 'function' && userJid ? baileys.generateMessageIDV2(userJid) : undefined;
  const generated = baileys.generateWAMessageFromContent(targetJid, payload, {
    userJid, messageId, timestamp: new Date(), quoted: quoted || undefined, logger: sock.logger
  });
  if (!generated?.message || !generated?.key?.id) throw new Error('Baileys tidak menghasilkan hydrated template WAMessage yang valid.');
  await sock.relayMessage(targetJid, generated.message, {
    messageId: generated.key.id,
    ...(Array.isArray(options.additionalNodes) && options.additionalNodes.length ? { additionalNodes: options.additionalNodes } : {})
  });
  return { ...generated, experimental: true, transport: 'Hydrated Template Buttons' };
}

/** Legacy ButtonsMessage transport. This is distinct from Native Flow and
 * hydrated templates; only RESPONSE/quick-reply buttons are supported. */
export function buildLegacyButtonsContent({ text = '', footer = '', buttons = [], contextInfo = {} } = {}) {
  if (!Array.isArray(buttons) || buttons.length < 1 || buttons.length > 3) throw new RangeError('Legacy ButtonsMessage menerima 1–3 tombol.');
  const normalized = buttons.map((button, index) => {
    const type = String(button.type || 'quick_reply').toLowerCase();
    if (type !== 'quick_reply') throw new TypeError('Legacy ButtonsMessage hanya mendukung quick_reply; gunakan Native Flow untuk URL, copy, catalog, atau list.');
    return {
      buttonId: cleanText(button.id, `legacy button ${index + 1} id`, 120, true),
      buttonText: { displayText: cleanText(button.title || button.displayText, `legacy button ${index + 1} title`, 25, true) },
      type: 1
    };
  });
  return { buttonsMessage: {
    contentText: cleanText(text, 'legacy button content', 3000, true),
    ...(footer ? { footerText: cleanText(footer, 'legacy button footer', 200) } : {}),
    headerType: 1,
    contextInfo: { forwardingScore: 0, isForwarded: false, ...(contextInfo || {}) },
    buttons: normalized
  } };
}

export async function sendLegacyButtons(sock, jid, options = {}, quoted = null, { baileys: injectedBaileys } = {}) {
  const baileys = await loadBaileys(injectedBaileys);
  const content = buildLegacyButtonsContent(options);
  const targetJid = typeof sock.decodeJid === 'function' ? sock.decodeJid(jid) : jid;
  if (!targetJid || typeof sock.relayMessage !== 'function' || typeof baileys.generateWAMessageFromContent !== 'function') throw new TypeError('Legacy ButtonsMessage memerlukan generateWAMessageFromContent dan relayMessage.');
  const userJid = sock.user?.id || sock.authState?.creds?.me?.id;
  const messageId = typeof baileys.generateMessageIDV2 === 'function' && userJid ? baileys.generateMessageIDV2(userJid) : undefined;
  const generated = baileys.generateWAMessageFromContent(targetJid, content, { userJid, messageId, timestamp: new Date(), quoted: quoted || undefined, logger: sock.logger });
  if (!generated?.message || !generated?.key?.id) throw new Error('Baileys tidak menghasilkan ButtonsMessage yang valid.');
  await sock.relayMessage(targetJid, generated.message, { messageId: generated.key.id });
  return { ...generated, experimental: true, transport: 'Legacy ButtonsMessage' };
}

export async function sendRichCard(sock, jid, options = {}, quoted = null, dependencies = {}) {
  return sendNativeFlow(sock, jid, {
    ...options,
    title: options.title || 'Informasi',
    footer: options.footer || 'WHISKAY',
    buttons: Array.isArray(options.buttons) ? options.buttons : []
  }, quoted, dependencies);
}

/**
 * Experimental generic AIRichResponse protobuf transport. It deliberately does
 * not set forwardedAiBotMessageInfo/botJid/persona metadata; those fields can
 * impersonate a platform-owned bot and are not required for a normal WHISKAY
 * response. Rendering is client/protocol-dependent and must be verified live.
 */
export function buildAIRichResponseContent({ title = '', text = '', code = '', language = 'text', table = null, html = '', htmlTitle = 'WHISKAY HTML Preview', trustedSources = [], forwardedContext = false, contextInfo = {}, quoted = null } = {}) {
  const submessages = [];
  const sections = [];
  const addUnifiedSection = primitive => sections.push({ __typename: 'GenAIUnifiedResponseSection', view_model: { primitive, __typename: 'GenAISingleLayoutViewModel' } });
  const heading = cleanText(title, 'AI rich heading', 160);
  if (heading) {
    submessages.push({ messageType: 2, messageText: heading });
    addUnifiedSection({ text: heading, __typename: 'GenAIMetadataTextPrimitive' });
  }
  const body = cleanText(text, 'AI rich text', 3000);
  if (body) {
    submessages.push({ messageType: 2, messageText: body });
    addUnifiedSection({ text: body, __typename: 'GenAIMarkdownTextUXPrimitive' });
  }
  if (code) {
    const source = cleanText(code, 'code', 6000, true);
    const codeLanguage = cleanText(language, 'code language', 30) || 'text';
    submessages.push({ messageType: 5, codeMetadata: { codeLanguage, codeBlocks: [{ codeContent: source, highlightType: 0 }] } });
    addUnifiedSection({ language: codeLanguage, code_blocks: [{ text: source, type: 'DEFAULT' }], __typename: 'GenAICodeUXPrimitive' });
  }
  if (table) {
    const headers = Array.isArray(table.headers) ? table.headers : [];
    const rows = Array.isArray(table.rows) ? table.rows : [];
    if (!headers.length || rows.length > 39) throw new RangeError('AIRich table membutuhkan header dan maksimal 39 baris data.');
    const cleanHeaders = headers.slice(0, 8).map(value => cleanText(value, 'table header', 100, true));
    const cleanRows = rows.map(row => (Array.isArray(row) ? row : [row]).slice(0, 8).map(value => cleanText(value, 'table cell', 100)));
    const tableRows = [{ items: cleanHeaders, isHeading: true }, ...cleanRows.map(items => ({ items, isHeading: false }))];
    submessages.push({ messageType: 4, tableMetadata: { title: cleanText(table.title || 'Data', 'table title', 120), rows: tableRows } });
    const unifiedRows = [{ is_header: true, cells: cleanHeaders }, ...cleanRows.map(cells => ({ is_header: false, cells }))];
    addUnifiedSection({ rows: unifiedRows, __typename: 'GenATableUXPrimitive' });
  }
  let htmlPayload = '';
  let safeTrustedSources = [];
  if (html) {
    htmlPayload = cleanText(html, 'HTML payload', 18_000, true);
    if (!/^\s*<(?:!doctype\s+html|html|body|main|section|div)/i.test(htmlPayload)) throw new TypeError('HTML harus berupa dokumen/fragmen HTML yang dimulai dengan elemen HTML.');
    safeTrustedSources = Array.isArray(trustedSources) ? trustedSources.map(value => cleanText(value, 'trusted source', 253, true).toLowerCase()) : [];
    if (safeTrustedSources.some(value => !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(value))) throw new TypeError('trusted_sources harus berupa domain valid tanpa skema/path.');
    safeTrustedSources = [...new Set(safeTrustedSources)];
  }
  if (!submessages.length && !html) throw new TypeError('AIRichResponse membutuhkan title, text, code, table, atau html.');
  const quoteContext = quoted?.key ? {
    stanzaId: quoted.key.id,
    participant: quoted.key.participant || quoted.key.remoteJid,
    quotedType: 0,
    quotedMessage: quoted.message
  } : {};
  const richContext = {
    forwardingScore: 0,
    isForwarded: false,
    ...quoteContext,
    ...(forwardedContext ? { forwardingScore: 1, isForwarded: true } : {}),
    ...(contextInfo || {})
  };
  return {
    messageContextInfo: {
      deviceListMetadata: {},
      deviceListMetadataVersion: 2,
      botMetadata: {
        messageDisclaimerText: 'WHISKAY · Structured response',
        richResponseSourcesMetadata: { sources: [] },
        botResponseId: randomUUID(),
        capabilityMetadata: { capabilities: [8, 34, ...(code ? [7] : []), ...(table ? [6] : [])] }
      }
    },
    botForwardedMessage: {
      message: {
        richResponseMessage: {
          messageType: 1,
          submessages,
          unifiedResponse: { data: Buffer.from(JSON.stringify({ response_id: randomUUID(), sections, ...(html ? { embedded_screens: [{ title: cleanText(htmlTitle, 'HTML screen title', 100, true), content: [{ __typename: 'FOAEmbeddedScreenContentTabbed', tabs: [{ id: 'tab_0', tab_header: 'Preview', sections: [{ __typename: 'GenAIUnifiedResponseSection', view_model: { __typename: 'GenAISingleLayoutViewModel', primitive: { __typename: 'GenAIaeacdsnwHtmlPrimitive', payload: html, ...(safeTrustedSources.length ? { trusted_sources: safeTrustedSources } : {}) } } }] }] }] }] } : {}) })).toString('base64') },
          contextInfo: richContext
        }
      }
    }
  };
}

export async function sendAIRichResponse(sock, jid, options = {}, quoted = null, { baileys: injectedBaileys } = {}) {
  const baileys = await loadBaileys(injectedBaileys);
  const content = buildAIRichResponseContent({ ...options, quoted });
  const targetJid = typeof sock.decodeJid === 'function' ? sock.decodeJid(jid) : jid;
  if (!targetJid || typeof sock.relayMessage !== 'function') throw new TypeError('Socket tidak menyediakan relayMessage/JID tujuan.');
  const userJid = sock.user?.id || sock.authState?.creds?.me?.id;
  const messageId = typeof baileys.generateMessageIDV2 === 'function' && userJid ? baileys.generateMessageIDV2(userJid) : undefined;
  const generated = baileys.generateWAMessageFromContent(targetJid, content, { userJid, messageId, timestamp: new Date(), quoted: quoted || undefined, logger: sock.logger });
  if (!generated?.message || !generated?.key?.id) throw new Error('Baileys tidak menghasilkan AIRichResponse WAMessage.');
  await sock.relayMessage(targetJid, generated.message, {
    messageId: generated.key.id,
    ...(Array.isArray(options.additionalNodes) && options.additionalNodes.length ? { additionalNodes: options.additionalNodes } : {})
  });
  return { ...generated, experimental: true, transport: 'AIRichResponse protobuf' };
}

export async function sendPollMessage(sock, jid, { name, values, selectableCount = 1 } = {}, quoted = null) {
  const question = cleanText(name, 'poll question', 255, true);
  if (!Array.isArray(values) || values.length < 2 || values.length > 12) throw new RangeError('Poll memerlukan 2–12 opsi.');
  const choices = values.map((value, index) => cleanText(value, `poll option ${index + 1}`, 100, true));
  if (new Set(choices.map(value => value.toLowerCase())).size !== choices.length) throw new TypeError('Opsi polling tidak boleh duplikat.');
  const count = Number(selectableCount);
  if (!Number.isInteger(count) || count < 0 || count > choices.length) throw new RangeError('selectableCount harus 0 (multi-select) sampai jumlah opsi.');
  if (typeof sock?.sendMessage !== 'function') throw new TypeError('Socket tidak menyediakan sendMessage.');
  return sock.sendMessage(jid, { poll: { name: question, values: choices, selectableCount: count } }, quoted ? { quoted } : {});
}

export function extractInteractiveResponseId(message = {}) {
  let content = message;
  for (let depth = 0; depth < 8 && content; depth += 1) {
    const native = content.interactiveResponseMessage?.nativeFlowResponseMessage;
    if (native) {
      const raw = native.paramsJson;
      if (typeof raw === 'string' && raw.length > 4096) return null;
      let params = {};
      try { params = raw && typeof raw === 'object' ? raw : JSON.parse(String(raw || '{}')); } catch { return null; }
      const id = params?.id || params?.row_id || params?.rowId || params?.selected_id || params?.selectedId || params?.selectedRowId;
      return typeof id === 'string' && id.length <= 160 ? id : null;
    }
    const buttonId = content.buttonsResponseMessage?.selectedButtonId ||
      content.templateButtonReplyMessage?.selectedId ||
      content.listResponseMessage?.singleSelectReply?.selectedRowId ||
      content.interactiveResponseMessage?.nativeFlowResponseMessage?.selectedRowId ||
      content.interactiveResponseMessage?.nativeFlowResponseMessage?.selected_row_id;
    if (typeof buttonId === 'string' && buttonId.length <= 160) return buttonId;
    const wrapper = content.ephemeralMessage?.message || content.viewOnceMessage?.message ||
      content.viewOnceMessageV2?.message || content.viewOnceMessageV2Extension?.message ||
      content.documentWithCaptionMessage?.message || content.deviceSentMessage?.message ||
      content.associatedChildMessage?.message || content.editedMessage?.message ||
      content.protocolMessage?.editedMessage;
    if (wrapper) { content = wrapper; continue; }
    break;
  }
  return null;
}

export function extractCommandFromInteractiveResponse(message = {}) {
  return extractCommandActionId(extractInteractiveResponseId(message));
}
