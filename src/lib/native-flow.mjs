import { randomBytes } from 'node:crypto';

/**
 * WHISKAY Native Flow transport for Baileys v7 (ESM runtime).
 *
 * This module deliberately does not import the supplied CommonJS serializer:
 * Baileys v7 is ESM-only, while that serializer and helpers use require().
 * Only user-initiated actions are emitted; every command action is routed back
 * through the normal owner-authenticated command handler.
 */

const ACTION_PREFIX = 'wsk:cmd:';
const BUTTON_TYPES = new Set(['quick_reply', 'cta_url', 'cta_call', 'cta_copy', 'single_select']);
const TEXT_LIMIT = 1024;

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
    const name = String(button?.type || button?.name || 'quick_reply').toLowerCase();
    if (!BUTTON_TYPES.has(name)) throw new TypeError(`Jenis tombol tidak didukung: ${name}`);
    const label = cleanText(button.title || button.display_text || button.label, `button ${index + 1} label`, 30, true);
    let params;
    if (name === 'quick_reply') {
      const id = cleanText(button.id, `button ${index + 1} id`, 120, true);
      params = { display_text: label, id };
    } else if (name === 'cta_url') {
      const rawUrl = cleanText(button.url, `button ${index + 1} url`, 2048, true);
      let url;
      try { url = new URL(rawUrl); } catch { throw new TypeError(`URL tombol ${index + 1} tidak valid.`); }
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new TypeError('CTA URL hanya boleh menggunakan HTTP/HTTPS.');
      params = { display_text: label, url: url.toString(), merchant_url: url.toString(), webview_interaction: button.webview_interaction !== false };
    } else if (name === 'cta_call') {
      const phone = cleanText(button.phone, `button ${index + 1} phone`, 20, true).replace(/[\s()-]/g, '');
      if (!/^\+?[1-9]\d{6,14}$/.test(phone)) throw new TypeError('Nomor CTA Call harus dalam format internasional.');
      params = { display_text: label, phone, phone_number: phone };
    } else if (name === 'cta_copy') {
      const copyCode = cleanText(button.copy_code, `button ${index + 1} copy_code`, 256, true);
      params = { display_text: label, id: cleanText(button.id || `copy_${index + 1}`, 'copy id', 120), copy_code: copyCode };
    } else {
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
    } else {
      choices.push(`• ${button.title || button.display_text || button.label || button.id || 'Pilihan'}${button.id ? ` (${button.id})` : ''}`);
    }
  }
  if (choices.length) lines.push('', ...choices);
  if (footer) lines.push('', `_${String(footer)}_`);
  return lines.join('\n').slice(0, 4000);
}

function makeBizNodes(targetJid) {
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
      content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }]
    }, qualityControl]
  }];
  if (!String(targetJid).endsWith('@g.us')) nodes.push({ tag: 'bot', attrs: { biz_bot: '1' } });
  return nodes;
}

async function loadBaileys(injected) {
  return injected || import('@whiskeysockets/baileys');
}

async function relayInteractive(sock, jid, messageContent, quoted, baileys) {
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
  const additionalNodes = makeBizNodes(targetJid);
  await sock.relayMessage(targetJid, generated.message, { messageId: generated.key.id, additionalNodes });
  return generated;
}

export async function sendNativeFlow(sock, jid, options = {}, quoted = null, { baileys: injectedBaileys } = {}) {
  const fallback = buildNativeFlowTextFallback(options);
  try {
    const buttons = normalizeNativeButtons(options.buttons);
    const baileys = await loadBaileys(injectedBaileys);
    const interactiveMessage = {
      ...(options.title || options.subtitle ? { header: { title: cleanText(options.title, 'title', 80), subtitle: cleanText(options.subtitle, 'subtitle', 120), hasMediaAttachment: false } } : {}),
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
    return await relayInteractive(sock, jid, payload, quoted, baileys);
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
      subtitle: cleanText(card.subtitle, `card ${index + 1} subtitle`, 120),
      hasMediaAttachment: false
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
    const content = {
      interactiveMessage: {
        header: { title: cleanText(options.title, 'carousel title', 80), hasMediaAttachment: false },
        body: { text: cleanText(options.body, 'carousel body', 1000) },
        ...(options.footer ? { footer: { text: cleanText(options.footer, 'carousel footer', 200) } } : {}),
        carouselMessage: { cards }
      }
    };
    return await relayInteractive(sock, jid, content, quoted, baileys);
  } catch (error) {
    if (typeof sock?.sendMessage !== 'function') throw error;
    const result = await sock.sendMessage(jid, { text: fallback || 'Carousel tidak tersedia pada koneksi ini.' }, quoted ? { quoted } : {});
    return { ...result, interactiveFallback: true, fallbackReason: error?.message || 'carousel-unavailable' };
  }
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
      content.documentWithCaptionMessage?.message || content.editedMessage?.message ||
      content.protocolMessage?.editedMessage;
    if (wrapper) { content = wrapper; continue; }
    break;
  }
  return null;
}

export function extractCommandFromInteractiveResponse(message = {}) {
  return extractCommandActionId(extractInteractiveResponseId(message));
}
