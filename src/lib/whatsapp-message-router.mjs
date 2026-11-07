import {
  sendNativeFlow,
  sendNativeCarousel,
  sendRichCard,
  sendTemplateButtons,
  sendPollMessage
} from './native-flow.mjs';

const MEDIA_TYPES = new Set(['image', 'video', 'ptv', 'audio', 'voice', 'document', 'sticker', 'gif']);
const CTA_TYPES = new Set(['quick_reply', 'cta_url', 'webview_url', 'cta_copy', 'cta_call', 'cta_catalog', 'single_select']);
const DISABLED_TYPES = new Set(['product', 'live_location', 'status', 'payment', 'fake_reply', 'ai_forwarded']);

export const WHATSAPP_MESSAGE_GUIDE = Object.freeze([
  { type: 'quick_reply', transport: 'Native Flow', use: 'Pilihan singkat yang menjalankan command WHISKAY.' },
  { type: 'cta_url', transport: 'Native Flow CTA', use: 'Membuka URL HTTPS di browser/client.' },
  { type: 'webview_url', transport: 'Native Flow CTA', use: 'URL HTTPS dengan webview_interaction; dukungan bergantung client.' },
  { type: 'cta_copy', transport: 'Native Flow CTA', use: 'Menyalin ID/kode publik non-rahasia.' },
  { type: 'cta_call', transport: 'Native Flow CTA', use: 'Membuka dialer untuk nomor dukungan yang valid.' },
  { type: 'cta_catalog', transport: 'Native Flow CTA', use: 'Membuka katalog bisnis yang memang terhubung.' },
  { type: 'single_select', transport: 'Native Flow list', use: 'Menu panjang, kategori, dan submenu.' },
  { type: 'template', transport: 'Hydrated Template', use: 'Kompatibilitas client lama; quick reply/URL/call saja.' },
  { type: 'rich_card', transport: 'Native Flow card', use: 'Satu ringkasan dengan header, body, footer, dan CTA.' },
  { type: 'carousel', transport: 'Native Flow carousel', use: 'Dua sampai sepuluh kartu; gambar lokal opsional.' },
  { type: 'poll', transport: 'Poll native', use: 'Voting dan multi-select yang perlu dihitung WhatsApp.' },
  { type: 'media', transport: 'Baileys sendMessage', use: 'Image, video, PTV, audio/PTT, document, sticker, dan GIF.' },
  { type: 'contact', transport: 'Contact message', use: 'Kirim satu atau beberapa vCard valid.' },
  { type: 'location', transport: 'Location message', use: 'Kirim satu titik koordinat statis.' },
  { type: 'table/code/link/latex', transport: 'Text fallback', use: 'Format teks biasa; bukan rich payload proprietary.' }
]);

function cleanText(value, label, max = 3000, required = false) {
  const text = String(value ?? '').trim();
  if (required && !text) throw new TypeError(`${label} wajib diisi.`);
  if (text.length > max) throw new RangeError(`${label} maksimal ${max} karakter.`);
  return text;
}

function quoteFor(options, defaultQuote) {
  if (options?.quote === false) return null;
  return options?.quoted ?? defaultQuote ?? null;
}

function normalizePhone(value, label = 'Nomor kontak') {
  const raw = cleanText(value, label, 24, true);
  const phone = raw.replace(/[\s().-]/g, '');
  if (!/^\+?[1-9]\d{6,14}$/.test(phone)) throw new TypeError(`${label} harus berformat internasional, misalnya +6281234567890.`);
  return phone.startsWith('+') ? phone : `+${phone}`;
}

function escapeVCard(value) {
  return cleanText(value, 'Nama kontak', 80, true)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/[\r\n]/g, ' ');
}

export function buildContactPayload(input = {}) {
  const items = Array.isArray(input.contacts) ? input.contacts : [input.contact || input];
  if (items.length < 1 || items.length > 10) throw new RangeError('Kirim 1–10 kontak dalam satu pesan.');
  const contacts = items.map((item, index) => {
    const displayName = cleanText(item?.displayName || item?.name, `Nama kontak ${index + 1}`, 80, true);
    const phone = normalizePhone(item?.phone || item?.number, `Nomor kontak ${index + 1}`);
    const safeName = escapeVCard(displayName);
    const vcard = [
      'BEGIN:VCARD', 'VERSION:3.0', `FN:${safeName}`, `TEL;TYPE=CELL:${phone}`, 'END:VCARD'
    ].join('\n');
    return { displayName, vcard };
  });
  return { contacts: { displayName: contacts.length === 1 ? contacts[0].displayName : 'Kontak', contacts } };
}

export function buildLocationPayload(input = {}) {
  const latitude = Number(input.latitude ?? input.degreesLatitude);
  const longitude = Number(input.longitude ?? input.degreesLongitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new RangeError('Latitude harus berada pada rentang -90 sampai 90.');
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new RangeError('Longitude harus berada pada rentang -180 sampai 180.');
  return {
    location: {
      degreesLatitude: latitude,
      degreesLongitude: longitude,
      ...(input.name ? { name: cleanText(input.name, 'Nama lokasi', 100) } : {}),
      ...(input.address ? { address: cleanText(input.address, 'Alamat lokasi', 300) } : {})
    }
  };
}

export function resolveOutgoingMessageType(input) {
  if (typeof input === 'string' || typeof input === 'number') return 'text';
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('send() menerima teks atau object options.');
  const explicit = String(input.type || input.kind || '').trim().toLowerCase().replace(/[ -]+/g, '_');
  const aliases = {
    nativebuttons: 'interactive', native_buttons: 'interactive', buttons: 'interactive', button: 'interactive',
    button_list: 'list', single_select: 'single_select', quick_reply: 'quick_reply', quick_replies: 'interactive',
    url: 'cta_url', webview: 'webview_url', open_webview: 'webview_url', copy: 'cta_copy', call: 'cta_call', catalog: 'cta_catalog',
    card: 'rich_card', rich: 'rich_card', ai_rich_card: 'rich_card', ai_card: 'rich_card',
    template_buttons: 'template', list_message: 'list', native_poll: 'poll',
    contacts: 'contact', static_location: 'location'
  };
  if (explicit) return aliases[explicit] || explicit;
  if (input.poll) return 'poll';
  if (input.cards) return 'carousel';
  if (input.richCard || input.richMessage || input.submessages) return 'rich_card';
  if (input.buttons) return 'interactive';
  if (input.list || input.items) return 'list';
  if (input.media !== undefined) return 'media';
  if (input.contacts || input.contact) return 'contact';
  if (input.location) return 'location';
  if (input.product) return 'product';
  if (input.table) return 'table';
  if (input.code !== undefined) return 'code';
  if (input.url) return 'link';
  for (const mediaType of MEDIA_TYPES) if (Object.hasOwn(input, mediaType)) return mediaType;
  if (Object.hasOwn(input, 'text') || Object.hasOwn(input, 'body')) return 'text';
  return 'unknown';
}

function formatTable(options) {
  const table = options.table || options;
  const headers = Array.isArray(table.headers) ? table.headers.slice(0, 12) : [];
  const rows = Array.isArray(table.rows) ? table.rows.slice(0, 40) : [];
  const lines = [cleanText(options.title || table.title || 'Informasi', 'Judul tabel', 120)];
  if (headers.length) lines.push(headers.join(' | '), headers.map(() => '---').join(' | '));
  for (const row of rows) lines.push((Array.isArray(row) ? row : [row]).slice(0, 12).map(value => cleanText(value, 'Isi tabel', 180)).join(' | '));
  return lines.join('\n').slice(0, 4000);
}

export function createWhatsAppMessageRouter({ sock, jid, quoted = null, reply, rememberPoll = () => {} } = {}) {
  if (!sock || typeof sock.sendMessage !== 'function') throw new TypeError('Socket Baileys tidak menyediakan sendMessage.');
  if (typeof jid !== 'string' || !jid.trim()) throw new TypeError('JID tujuan pesan tidak tersedia.');
  if (typeof reply !== 'function') throw new TypeError('Callback reply wajib tersedia.');

  const sendInteractive = options => sendNativeFlow(sock, jid, options, quoteFor(options, quoted));
  const sendCarousel = options => sendNativeCarousel(sock, jid, options, quoteFor(options, quoted));
  const sendRichCardMessage = options => sendRichCard(sock, jid, options, quoteFor(options, quoted));
  const sendTemplate = options => sendTemplateButtons(sock, jid, options, quoteFor(options, quoted));
  const sendPoll = async options => {
    const sent = await sendPollMessage(sock, jid, options, quoteFor(options, quoted));
    await rememberPoll(sent);
    return sent;
  };
  const sendMedia = async (type, media, options = {}) => {
    let mediaType = String(type || options.mediaType || 'image').toLowerCase();
    const content = {};
    if (mediaType === 'ptv') { mediaType = 'video'; content.ptv = true; }
    if (mediaType === 'voice') { mediaType = 'audio'; content.ptt = true; }
    if (!MEDIA_TYPES.has(mediaType)) throw new TypeError(`Tipe media tidak didukung: ${mediaType}`);
    if (media === undefined || media === null || media === '') throw new TypeError('Sumber media wajib diisi.');
    if (typeof media === 'string' && /^(?:https?|data|blob|file):/i.test(media.trim())) throw new TypeError('Media keluar hanya menerima Buffer atau path lokal; URL remote tidak diunduh otomatis.');
    if (media && typeof media === 'object' && typeof media.url === 'string' && /^(?:https?|data|blob|file):/i.test(media.url.trim())) throw new TypeError('Media keluar hanya menerima Buffer atau path lokal; URL remote tidak diunduh otomatis.');
    const key = mediaType === 'gif' ? 'video' : mediaType;
    content[key] = media;
    if (mediaType === 'gif') content.gifPlayback = true;
    if (mediaType === 'video' && options.ptv) content.ptv = true;
    if (options.caption && ['image', 'video', 'document', 'gif'].includes(mediaType)) content.caption = cleanText(options.caption, 'Caption media', 3000);
    if (options.fileName && mediaType === 'document') content.fileName = cleanText(options.fileName, 'Nama file', 180);
    if (options.mimetype) content.mimetype = cleanText(options.mimetype, 'MIME type', 120);
    if (mediaType === 'audio' && options.ptt !== undefined) content.ptt = Boolean(options.ptt);
    return sock.sendMessage(jid, content, quoteFor(options, quoted) ? { quoted: quoteFor(options, quoted) } : {});
  };
  const sendContact = async options => sock.sendMessage(jid, buildContactPayload(options), quoteFor(options, quoted) ? { quoted: quoteFor(options, quoted) } : {});
  const sendLocation = async options => sock.sendMessage(jid, buildLocationPayload(options.location || options), quoteFor(options, quoted) ? { quoted: quoteFor(options, quoted) } : {});

  const sendCTA = (type, options) => {
    const button = {
      type,
      title: options.buttonTitle || options.title || ({ cta_url: 'Buka tautan', webview_url: 'Buka aplikasi', cta_copy: 'Salin kode', cta_call: 'Telepon', cta_catalog: 'Lihat katalog', quick_reply: 'Pilih' }[type] || 'Pilih')
    };
    if (type === 'quick_reply') button.id = cleanText(options.id || options.action, 'Quick reply ID', 120, true);
    if (type === 'cta_url' || type === 'webview_url') { button.url = options.url || options.link; if (options.merchant_url) button.merchant_url = options.merchant_url; }
    if (type === 'cta_copy') {
      const copyCode = cleanText(options.copy_code ?? options.value, 'Kode yang akan disalin', 256, true);
      if (/(password|passwd|secret|api[_-]?key|access[_-]?token|bearer|private[_-]?key)/i.test(copyCode)) throw new TypeError('CTA Copy tidak boleh berisi password, token, API key, atau rahasia.');
      button.copy_code = copyCode; button.id = options.id || 'copy_public_value';
    }
    if (type === 'cta_call') button.phone = options.phone || options.phone_number;
    if (type === 'single_select') { button.sections = options.sections; button.listTitle = options.listTitle || options.title; }
    return sendInteractive({
      title: options.headerTitle || (type === 'single_select' ? 'Pilih salah satu' : 'WHISKAY'),
      subtitle: options.subtitle || '', body: options.text || options.body || 'Pilih tindakan berikut.', footer: options.footer || 'WHISKAY',
      buttons: [button]
    });
  };

  const send = async input => {
    const options = typeof input === 'string' || typeof input === 'number' ? { text: String(input) } : input;
    const type = resolveOutgoingMessageType(options);
    if (DISABLED_TYPES.has(type)) throw new TypeError(`${type} tidak diaktifkan sebagai payload generik. Gunakan data bisnis/lokasi resmi bila tersedia; WHISKAY tidak membuat metadata palsu.`);
    if (type === 'text') return reply(options.text ?? options.body ?? '');
    if (type === 'interactive') return sendInteractive(options);
    if (CTA_TYPES.has(type)) return sendCTA(type, options);
    if (type === 'carousel') return sendCarousel(options);
    if (type === 'rich_card') {
      const card = options.richCard || options;
      return sendRichCard({ ...card, title: card.title || (String(options.type || options.kind).toLowerCase().includes('ai') ? 'Ringkasan berbantuan AI' : 'Informasi') });
    }
    if (type === 'template') return sendTemplate(options);
    if (type === 'poll') return sendPoll(options.poll || options);
    if (type === 'list') {
      const source = options.list || options;
      const sections = Array.isArray(source) ? source : source.sections;
      if (Array.isArray(sections) && sections.length) {
        return sendInteractive({ ...options, buttons: [{ type: 'single_select', title: options.listTitle || options.title || 'Pilih', sections }] });
      }
      if (Array.isArray(options.items) && options.items.length) {
        const rows = options.items.slice(0, 20).map((item, index) => ({
          title: cleanText(item.title || item.label || `Pilihan ${index + 1}`, `Pilihan ${index + 1}`, 80, true),
          ...(item.description ? { description: cleanText(item.description, 'Deskripsi pilihan', 120) } : {}),
          id: cleanText(item.id || item.value, `ID pilihan ${index + 1}`, 120, true)
        }));
        return sendInteractive({ ...options, buttons: [{ type: 'single_select', title: options.listTitle || options.title || 'Pilih', sections: [{ title: options.sectionTitle || 'Pilihan', rows }] }] });
      }
      throw new TypeError('List memerlukan options.list.sections atau options.items.');
    }
    if (type === 'media' || MEDIA_TYPES.has(type)) {
      const mediaType = MEDIA_TYPES.has(type) ? type : options.mediaType || 'image';
      return sendMedia(mediaType, options.media ?? options[type], options);
    }
    if (type === 'contact') return sendContact(options);
    if (type === 'location') return sendLocation(options);
    if (type === 'table') return reply(formatTable(options));
    if (type === 'code') {
      const language = cleanText(options.language || 'text', 'Bahasa kode', 30).replace(/[^a-z0-9_+-]/gi, '') || 'text';
      const code = cleanText(options.code, 'Kode', 3000, true);
      return reply(`\`\`\`${language}\n${code}\n\`\`\``);
    }
    if (type === 'link') {
      const url = cleanText(options.url || options.link, 'URL', 2048, true);
      let parsed;
      try { parsed = new URL(url); } catch { throw new TypeError('URL tidak valid.'); }
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new TypeError('Link wajib HTTPS tanpa kredensial.');
      return reply(`${cleanText(options.text || options.body || 'Tautan', 'Teks tautan', 1000)}\n${parsed.toString()}`);
    }
    if (type === 'latex') return reply(cleanText(options.text || options.latex, 'Ekspresi matematika', 3000, true));
    throw new TypeError('Format tidak dikenal. Gunakan text, quick_reply, cta_url, webview_url, cta_copy, cta_call, cta_catalog, list, template, rich_card, carousel, poll, media, contact, location, table, code, link, atau latex.');
  };

  return {
    send, sendInteractive, sendNativeButtons: sendInteractive, sendCarousel, sendRichCard: sendRichCardMessage,
    sendTemplateButtons: sendTemplate, sendPoll, sendMedia, sendContact, sendLocation
  };
}
