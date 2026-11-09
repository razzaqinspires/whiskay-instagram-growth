import { stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { commandActionId } from '../lib/native-flow.mjs';
import { pollCacheStats } from '../lib/poll-store.mjs';
import { commandUsageStore } from '../lib/command-recommender.mjs';
import { WHATSAPP_MESSAGE_GUIDE } from '../lib/whatsapp-message-router.mjs';

const CHANNEL_URL = 'https://whatsapp.com/channel/0029Vb8vHDB5PO0v7xAQL33e';

function parsePollInput(rawInput) {
  let raw = String(rawInput || '').trim();
  let selectableCount = 1;
  if (/^multi\s+/i.test(raw)) { selectableCount = 0; raw = raw.replace(/^multi\s+/i, ''); }
  const parts = raw.split('|').map(part => part.trim()).filter(Boolean);
  if (parts.length < 3) throw new Error('Format: .poll "Pertanyaan" | Opsi A | Opsi B. Tambahkan multi setelah .poll untuk multi-select.');
  const question = parts.shift().replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, (_, a, b) => a ?? b);
  if (!question || parts.length < 2) throw new Error('Pertanyaan dan minimal dua opsi wajib diisi.');
  return { name: question, values: parts, selectableCount };
}

function parsePipeArgs(raw, minParts, usage) {
  const parts = String(raw || '').split('|').map(part => part.trim());
  if (parts.length < minParts || parts.some(part => !part)) throw new Error(`Format: ${usage}`);
  return parts;
}

function safePrice(value) {
  const normalized = String(value).replace(/,/g, '.').trim();
  if (!/^\d+(?:\.\d{1,3})?$/.test(normalized)) throw new Error('Harga harus angka desimal positif/non-negatif.');
  const priceAmount1000 = Math.round(Number(normalized) * 1000);
  if (!Number.isSafeInteger(priceAmount1000)) throw new Error('Harga terlalu besar.');
  return priceAmount1000;
}

async function localMediaPath(rootNames, filename, allowedExtensions) {
  const clean = String(filename || '').trim().replace(/^['"]|['"]$/g, '');
  if (!clean || path.isAbsolute(clean) || clean.includes('..') || /^(?:https?|file|data):/i.test(clean) || clean.includes('\0')) {
    throw new Error('Gunakan nama file lokal relatif dari assets/, tanpa URL atau path traversal.');
  }
  const roots = (Array.isArray(rootNames) ? rootNames : [rootNames]).map(name => String(name || '').trim());
  let lastError;
  for (const rootName of roots) {
    const root = path.resolve(process.cwd(), 'assets', rootName);
    let realRoot;
    try { realRoot = await realpath(root); }
    catch (error) { lastError = error; if (error.code === 'ENOENT') continue; throw error; }
    const resolved = path.resolve(realRoot, clean);
    const relativeCandidate = path.relative(realRoot, resolved);
    if (!relativeCandidate || relativeCandidate.startsWith('..') || path.isAbsolute(relativeCandidate)) {
      throw new Error('Path file keluar dari direktori assets yang diizinkan.');
    }
    try {
      const actual = await realpath(resolved);
      const relative = path.relative(realRoot, actual);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Symlink/path file keluar dari direktori assets yang diizinkan.');
      const info = await stat(actual);
      if (!info.isFile() || info.size < 1 || info.size > 40 * 1024 * 1024) throw new Error('File harus file reguler 1 byte–40 MiB.');
      const ext = path.extname(actual).toLowerCase();
      if (!allowedExtensions.includes(ext)) throw new Error(`Ekstensi file tidak didukung: ${allowedExtensions.join(', ')}`);
      return actual;
    } catch (error) {
      lastError = error;
      if (error.code !== 'ENOENT') throw error;
    }
  }
  if (lastError?.code === 'ENOENT') throw new Error(`File ${clean} tidak ditemukan di assets/${roots.filter(Boolean).join(', assets/') || 'root'}/.`);
  throw lastError || new Error(`File ${clean} tidak ditemukan di assets/.`);
}

async function ensureWhatsAppMediaDemo() {
  const sourceRoot = path.resolve(process.cwd(), 'assets', 'whatsapp-media-demo');
  const names = [
    'whiskay-demo-ptv.mp4', 'whiskay-demo-voice.ogg', 'whiskay-demo-gif.mp4',
    'whiskay-demo-viewonce-image.jpg', 'whiskay-demo-viewonce-video.mp4'
  ];
  for (const name of names) {
    const file = await localMediaPath('whatsapp-media-demo', name, [path.extname(name).toLowerCase()]);
    if (!file.startsWith(`${sourceRoot}${path.sep}`)) throw new Error('Media demo berada di luar assets/whatsapp-media-demo/.');
  }
  return sourceRoot;
}

function withTimeout(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function parseMediaArguments(value) {
  const raw = String(value || '').trim();
  if (!raw) return { action: 'ptv', filename: null };
  if (raw.includes('|')) {
    const [action, ...fileParts] = raw.split('|').map(part => part.trim());
    return { action: action.toLowerCase(), filename: fileParts.join('|').trim() || null };
  }
  const match = raw.match(/^(\S+)(?:\s+([\s\S]+))?$/);
  return { action: String(match?.[1] || '').toLowerCase(), filename: match?.[2]?.trim() || null };
}

function makeCommandRows(items, prefix) {
  return items.map(item => ({
    title: `${prefix}${item.name}`.slice(0, 80),
    description: `${item.totalHits ?? 0} hit · ${(item.recommendationPercent ?? 0).toFixed(1)}% rec · ${item.category || 'General'}`.slice(0, 120),
    id: commandActionId(`${prefix}${item.name}`)
  }));
}

const interfaceHelp = [
  '━━ WHISKAY · WHATSAPP MESSAGE LAB ━━',
  '.waform mixed — 3 tombol: quick_reply + CTA WebView + single_select rekomendasi',
  '.waform quick — quick_reply command buttons',
  '.waform list — daftar command live, single_select',
  '.waform url <https://...> — CTA URL eksternal',
  '.waform webview <https://...> — CTA URL + webview_interaction',
  '.waform copy [kode publik] — CTA Copy; default demo code, jangan salin rahasia/token',
  '.waform dialer [+nomor] — CTA Call, default nomor demo reserved; membuka dialer telepon',
  '.waform call audio|video | nama acara | YYYY-MM-DDTHH:mm | [deskripsi] — EventMessage dengan join-link call',
  '.waform event <nama> | <start ISO> | <end ISO> | <deskripsi> — EventMessage native',
  '.waform catalog — CTA Catalog; bukan katalog produk palsu',
  '.waform send-location — Native Flow meminta lokasi pengguna (eksperimental)',
  '.waform template — legacy Hydrated Template Buttons (maks. 3 tombol; quick reply/URL/call)',
  '.waform legacy-buttons — ButtonsMessage lama, 1–3 quick_reply saja; tidak sama dengan Native Flow',
  '.waform card — Native Flow card interaktif biasa',
  '.waform ai-rich [<judul> | <ringkasan>] — AIRichResponse protobuf eksperimental, default sample',
  '.waform ai-card — alias ai-rich; bukan identitas Meta AI',
  '.waform carousel — InteractiveMessage.carouselMessage + contextInfo + biz/bot additionalNodes',
  '.waform carousel forwarded — uji indikator forwarded context (tanpa identitas bot pihak ketiga)',
  '.waform ai-rich html — AIRichResponse + embedded_screens HTML untuk WhatsApp Android/iOS',
  '.waform poll — native WhatsApp poll',
  '.waform contact [<nama> | <+nomor>] — vCard demo default',
  '.waform location [<lat> | <lon> [| nama] [| alamat]] — lokasi demo default',
  '.waform table — AIRichResponse table (fallback teks jika tidak dirender client)',
  '.waform code [<language> | <source>] — code block AIRichResponse, default JavaScript sample',
  '.waform product catalog — baca 10 item katalog Business yang benar-benar terhubung',
  '.waform product info <id> — lihat metadata produk katalog',
  '.waform product — otomatis memilih produk pertama dari katalog Business riil dan memakai gambar demo dari assets/',
  '.waform product <id> | <nama> | <deskripsi> | <currency> | <harga> | <retailer-id> | <gambar> — metadata manual (tetap perlu katalog riil)',
  '.waform media <ptv|viewonce-image|viewonce-video|voice|gif> [filename] — filename opsional, memakai demo assets bila kosong',
  '',
  'Media demo dibaca langsung dari assets/whatsapp-media-demo/ dan tidak disalin ke data/. Product image dicari di assets/whatsapp-products/, assets/whatsapp-media-demo/, atau assets/.' ,
  'Product perlu akun/metadata Business yang valid dan data katalog nyata. Call audio/video memakai EventMessage; CTA Call hanya membuka dialer.',
  'AIRichResponse dan carousel adalah payload eksperimental/tergantung client. Relay ACK bukan bukti render atau delivery.'
].join('\n');

export default {
  name: 'whatsapp-tools',
  commands: [
    {
      name: 'wadelivery', aliases: ['wa-delivery', 'delivery-status'], category: 'WhatsApp Diagnostics',
      usage: '[messageId]',
      description: 'Periksa status relay, server ACK, delivery, read, dan played dari pesan keluar WHISKAY',
      async execute({ args = [], sock, reply }) {
        const tracker = sock?.whiskayDelivery;
        if (!tracker) return reply('Delivery tracker belum terpasang pada socket aktif.');
        const messageId = String(args[0] || '').trim();
        if (messageId) {
          const record = tracker.get(messageId);
          if (!record) return reply(`Message ID ${messageId} tidak ditemukan pada cache 24 jam terakhir.`);
          const receiptLines = Object.entries(record.receipts || {}).map(([jid, receipt]) =>
            `• ${jid}: delivered=${receipt.receivedAt ? 'yes' : 'no'}, read=${receipt.readAt ? 'yes' : 'no'}, played=${receipt.playedAt ? 'yes' : 'no'}`
          );
          return reply([
            '━━ WHISKAY DELIVERY DETAIL ━━',
            `ID: ${record.id}`,
            `Status: ${record.status}`,
            `Transport: ${record.source}`,
            `Updated: ${new Date(record.updatedAt).toISOString()}`,
            `Receipts: ${Object.keys(record.receipts || {}).length}`,
            ...receiptLines,
            record.relayError ? `Relay note: ${record.relayError}` : '',
            '',
            'SERVER_ACK hanya berarti server WhatsApp menerima relay; DELIVERY_ACK/READ/PLAYED adalah status lanjutan.'
          ].filter(Boolean).join('\n'));
        }
        const stats = tracker.stats();
        const recent = tracker.recent(8);
        return reply([
          '━━ WHISKAY DELIVERY MONITOR ━━',
          `Tracked: ${stats.tracked}`,
          `Events: updates=${stats.updates}, receipts=${stats.receipts}`,
          `Transport errors: ${stats.relayErrors}`,
          `Status: ${Object.entries(stats.byStatus).map(([name, count]) => `${name}=${count}`).join(' · ') || 'belum ada'}`,
          '',
          'Pesan terbaru:',
          ...(recent.length ? recent.map(item => `${item.status} · ${item.id}`) : ['Belum ada pesan keluar tercatat.']),
          '',
          'Detail: .wadelivery <messageId>',
          'Status bersifat best-effort; tidak semua chat mengirim receipt individual.'
        ].join('\n'));
      }
    },
    {
      name: 'poll', aliases: ['polling'], category: 'WhatsApp Interfaces',
      usage: '[multi] "pertanyaan" | opsi 1 | opsi 2 [| opsi 3]',
      description: 'Kirim polling native WhatsApp (single atau multi-select)',
      async execute({ rawArgs, sendPoll, reply }) {
        try {
          const poll = parsePollInput(rawArgs);
          const sent = await sendPoll(poll);
          await reply(`Polling native WhatsApp terkirim.\nID: ${sent?.key?.id || 'terkirim'}\nOpsi: ${poll.values.length}\nMode: ${poll.selectableCount === 0 ? 'multi-select' : 'single-select'}`);
        } catch (error) { await reply(`Polling gagal: ${error.message}`); }
      }
    },
    {
      name: 'mediainfo', aliases: ['media-info'], category: 'Media Tools', usage: '',
      description: 'Deteksi jenis media, ukuran, durasi dan metadata lampiran/kutipan',
      async execute({ messageInfo, reply }) {
        const media = messageInfo?.media || messageInfo?.quotedMedia;
        if (!media) return reply('Tidak ditemukan lampiran media. Lampirkan file dengan caption .mediainfo atau balas pesan media.');
        return reply([
          '━━ WHISKAY MEDIA INSPECTOR ━━',
          `Jenis: ${media.type || '-'}`,
          `Message type: ${media.messageType || '-'}`,
          `Nama: ${media.fileName || '-'}`,
          `MIME: ${media.mimetype || '-'}`,
          `Ukuran: ${media.fileLength ? `${(media.fileLength / 1048576).toFixed(2)} MiB` : 'metadata tidak tersedia'}`,
          `Dimensi: ${media.width && media.height ? `${media.width}×${media.height}` : '-'}`,
          `Durasi: ${media.seconds ? `${media.seconds}s` : '-'}`,
          `Animasi: ${media.isAnimated ? 'ya' : 'tidak'}`,
          `View Once: ${media.viewOnce ? 'ya (akses ulang dibatasi)' : 'tidak'}`,
          `Sumber: ${messageInfo.media === media ? 'lampiran langsung' : 'pesan kutipan'}`,
          '', 'Download media dilakukan hanya oleh command yang membutuhkannya.'
        ].join('\n'));
      }
    },
    {
      name: 'waform', aliases: ['waui', 'wabuttons'], category: 'WhatsApp Interfaces',
      usage: '[menu|quick|mixed|list|url|webview|copy|dialer|send-location|call|event|catalog|template|legacy-buttons|card|ai-rich|carousel|poll|contact|location|table|code|product|media]',
      description: 'Uji format pesan resmi Baileys: Native Flow, list, carousel, AIRichResponse, template, event/call, product dan media',
      async execute({ args = [], rawArgs = '', reply, send, sendInteractive, sendNativeButtons, sendCarousel, sendRichCard, sendAIRich, sendTemplateButtons, sendLegacyButtonMessage, sendPoll, sendContact, sendLocation, sendProduct, sendEvent, sendMedia, pluginLoader, sock }) {
        const kind = String(args[0] || '').toLowerCase();
        const value = String(rawArgs || '').replace(/^\S+\s*/, '').trim();
        if (!kind || kind === 'menu' || kind === 'help') {
          const entries = [
            ['quick', '3 Quick Reply'], ['mixed', 'Mixed Native Flow'], ['list', 'Single Select List'],
            ['url', 'CTA URL'], ['webview', 'CTA WebView'], ['copy', 'CTA Copy'], ['dialer', 'CTA Call / dialer'], ['send-location', 'Request user location'],
            ['call', 'EventMessage + scheduled call'], ['event', 'EventMessage'], ['catalog', 'WhatsApp Catalog CTA'],
            ['template', 'Hydrated Template (legacy)'], ['legacy-buttons', 'ButtonsMessage (legacy)'],
            ['card', 'Native Flow card'], ['ai-rich', 'AIRichResponse protobuf'], ['carousel', 'CarouselMessage'],
            ['poll', 'Native Poll'], ['contact', 'Contact / vCard'], ['location', 'Static location'],
            ['table', 'AIRichResponse table'], ['code', 'AIRichResponse code'], ['product', 'ProductMessage'], ['media', 'PTV / View Once / voice / GIF']
          ];
          const sections = [];
          for (let i = 0; i < entries.length; i += 20) sections.push({ title: `WhatsApp Message Lab ${Math.floor(i / 20) + 1}`, rows: entries.slice(i, i + 20).map(([action, label]) => ({ title: label, description: `.waform ${action}`, id: commandActionId(`.waform ${action}`) })) });
          return sendInteractive({ title: kind === 'help' ? 'WHISKAY · MESSAGE LAB HELP' : 'WHISKAY · MESSAGE LAB', body: kind === 'help' ? interfaceHelp : 'Pilih jenis pesan untuk demo. Setiap pilihan memakai transport yang berbeda; format eksperimental diberi keterangan. Gunakan .waform help untuk sintaks lengkap.', footer: 'Single Select · WhatsApp Message Lab', buttons: [{ type: 'single_select', title: 'Pilih format pesan', sections }] });
        }

        if (kind === 'quick') {
          return sendNativeButtons({
            title: 'WHISKAY · QUICK REPLY', body: 'Tiga tindakan pendek. Respons tombol kembali melalui router command dan otorisasi owner.', footer: 'Native Flow · quick_reply',
            buttons: [
              { type: 'quick_reply', title: 'Profile IG', id: commandActionId('.profile') },
              { type: 'quick_reply', title: 'Menu', id: commandActionId('.menu') },
              { type: 'quick_reply', title: 'Plugins', id: commandActionId('.plugins') }
            ]
          });
        }

        if (kind === 'mixed' || kind === 'buttons' || kind === 'native') {
          const commands = pluginLoader?.listCommands?.() || [];
          const ranked = await commandUsageStore.rank(commands, { limit: 10 });
          await commandUsageStore.recordExposure(ranked.map(item => item.name));
          return sendInteractive({
            title: 'WHISKAY · MIXED MENU', subtitle: 'Quick Reply + WebView CTA + Single Select',
            body: 'Pilih profil Instagram, buka saluran WHISKAY, atau telusuri command yang direkomendasikan berdasarkan penggunaan aktual dan eksplorasi command yang jarang dipakai.',
            footer: '3 buttons · Native Flow mixed',
            contextInfo: { externalAdReply: { title: 'Saluran WhatsApp WHISKAY', body: 'Info rilis dan pengumuman', sourceUrl: CHANNEL_URL, mediaType: 1, renderLargerThumbnail: true, showAdAttribution: false } },
            buttons: [
              { type: 'quick_reply', title: 'Profil IG', id: commandActionId('.profile') },
              { type: 'webview_url', title: 'Saluran WHISKAY', url: CHANNEL_URL, webview_interaction: true },
              { type: 'single_select', title: '10 Command', sections: [{ title: 'Rekomendasi berbasis data', rows: makeCommandRows(ranked, '.') }] }
            ]
          });
        }

        if (kind === 'list') {
          const commands = pluginLoader?.listCommands?.() || [];
          const ranked = await commandUsageStore.rank(commands, { limit: 10 });
          await commandUsageStore.recordExposure(ranked.map(item => item.name));
          return sendInteractive({ title: 'WHISKAY · COMMAND PICKER', body: '10 command teratas berdasarkan total hit, tren 7 hari, eksplorasi, rotasi, dan keragaman kategori.', footer: 'Single Select · Live registry', buttons: [{ type: 'single_select', title: 'Pilih command', sections: [{ title: 'Recommended', rows: makeCommandRows(ranked, '.') }] }] });
        }

        if (kind === 'url' || kind === 'webview') {
          const target = value || 'https://github.com/razzaqinspires';
          let url;
          try { url = new URL(target); } catch { return reply('Format: .waform url|webview <https://example.com>'); }
          if (url.protocol !== 'https:' || url.username || url.password) return reply('URL harus HTTPS dan tidak boleh menyertakan username/password.');
          return sendNativeButtons({ title: kind === 'webview' ? 'CTA · WEBVIEW' : 'CTA · URL', body: kind === 'webview' ? 'Mengirim webview_interaction. Sebagian client dapat membuka browser biasa jika WebView tidak didukung.' : 'Membuka URL HTTPS melalui client WhatsApp.', buttons: [{ type: kind === 'webview' ? 'webview_url' : 'cta_url', title: 'Buka URL', url: url.toString(), webview_interaction: kind === 'webview' }] });
        }

        if (kind === 'copy') {
          const copyCode = value || 'WHISKAY-DEMO-2026';
          if (copyCode.length > 120 || /(password|passwd|secret|api[_-]?key|access[_-]?token|bearer|private[_-]?key)/i.test(copyCode)) return reply('Format: .waform copy <kode/ID publik maksimal 120 karakter>. Token/rahasia ditolak.');
          return sendNativeButtons({ title: 'CTA · COPY', body: 'Menyalin kode publik contoh.', buttons: [{ type: 'cta_copy', title: 'Salin kode', id: 'whiskay-copy-demo', copy_code: copyCode }] });
        }

        if (kind === 'dialer') {
          const phone = value || '+19995550123';
          return sendNativeButtons({ title: 'CTA · PHONE DIALER', body: `Contoh CTA yang membuka dialer perangkat untuk ${phone}; tidak membuat panggilan otomatis.`, buttons: [{ type: 'cta_call', title: 'Buka dialer', phone }] });
        }

        if (kind === 'call') {
          try {
            const defaultStart = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
            const [callType, name, startISO, description = ''] = value ? parsePipeArgs(value, 3, '.waform call audio|video | nama acara | YYYY-MM-DDTHH:mm [| deskripsi]') : ['audio', 'WHISKAY Demo Call', defaultStart, 'Contoh scheduled call EventMessage dari WHISKAY.'];
            if (!['audio', 'video'].includes(callType.toLowerCase())) throw new Error('Jenis call harus audio atau video.');
            const sent = await sendEvent({ name, startDate: startISO, description, call: callType.toLowerCase() });
            return reply(`Event call ${callType.toUpperCase()} dibuat sebagai EventMessage.\nID: ${sent?.key?.id || 'terkirim'}\nBaileys createCallLink berhasil diminta untuk membuat join token acara.`);
          } catch (error) { return reply(error.message); }
        }

        if (kind === 'event') {
          try {
            const defaultStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const defaultEnd = new Date(defaultStart.getTime() + 60 * 60 * 1000);
            const [name, startISO, endISO, description = ''] = value ? parsePipeArgs(value, 3, '.waform event <nama> | <start ISO> | <end ISO> | [deskripsi]') : ['WHISKAY Demo Event', defaultStart.toISOString(), defaultEnd.toISOString(), 'Contoh event terjadwal dari WHISKAY.'];
            const sent = await sendEvent({ name, startDate: startISO, endDate: endISO, description });
            return reply(`EventMessage dibuat.\nID: ${sent?.key?.id || 'terkirim'}\nStart: ${startISO}\nEnd: ${endISO}`);
          } catch (error) { return reply(error.message); }
        }

        if (kind === 'catalog') {
          return sendNativeButtons({ title: 'WHATSAPP BUSINESS CATALOG', body: 'CTA Catalog meminta client membuka katalog Business yang benar-benar terhubung. Ini bukan product message dan tidak menciptakan katalog/produk baru.', buttons: [{ type: 'cta_catalog', title: 'Buka katalog' }] });
        }

        if (kind === 'send-location' || kind === 'request-location') {
          return sendNativeButtons({ title: 'WHISKAY · REQUEST LOCATION', body: 'Contoh Native Flow khusus untuk meminta pengguna membagikan lokasi melalui antarmuka WhatsApp. Tidak mengambil lokasi secara diam-diam.', footer: 'Native Flow · send_location · experimental', buttons: [{ type: 'send_location', title: 'Bagikan lokasi' }] });
        }

        if (kind === 'legacy-buttons' || kind === 'button-message') {
          try {
            const sent = await sendLegacyButtonMessage({ text: 'Legacy ButtonsMessage · quick replies only. Use Native Flow for URL, WebView, Copy, Catalog and list actions.', footer: 'ButtonsMessage · legacy compatibility', buttons: [
              { type: 'quick_reply', title: 'Profile IG', id: commandActionId('.profile') },
              { type: 'quick_reply', title: 'Menu', id: commandActionId('.menu') },
              { type: 'quick_reply', title: 'Plugins', id: commandActionId('.plugins') }
            ] });
            return reply(`Legacy ButtonsMessage diserahkan ke Baileys. ID: ${sent?.key?.id || 'terkirim'}. Transport ini berbeda dari Native Flow dan tidak menyediakan CTA URL/WebView.`);
          } catch (error) { return reply(`Legacy ButtonsMessage gagal: ${error.message}`); }
        }

        if (kind === 'template') {
          try {
            return await sendTemplateButtons({ text: 'HYDRATED TEMPLATE BUTTONS · LEGACY TRANSPORT\nFormat pesan tombol lama untuk kompatibilitas. Maksimal 3 tombol: quick reply, URL, atau call. Ini bukan Native Flow mixed.', footer: 'Legacy compatibility · 3 buttons max', buttons: [
              { type: 'quick_reply', title: 'Profile IG', id: commandActionId('.profile') },
              { type: 'cta_url', title: 'GitHub', url: 'https://github.com/razzaqinspires' },
              { type: 'quick_reply', title: 'Buka Menu', id: commandActionId('.menu') }
            ] });
          } catch (error) { return reply(`Hydrated Template relay gagal: ${error.message}. Native Flow modern tersedia melalui .waform mixed.`); }
        }

        if (kind === 'card') {
          return sendRichCard({ title: 'WHISKAY · NATIVE FLOW CARD', subtitle: 'Interactive card, bukan AIRichResponse', body: 'Kartu sederhana dengan header/body/footer dan tindakan. Gunakan .waform ai-rich untuk protobuf AIRichResponse yang berbeda.', footer: 'Native Flow card', buttons: [{ type: 'quick_reply', title: 'Menu', id: commandActionId('.menu') }, { type: 'cta_url', title: 'GitHub', url: 'https://github.com/razzaqinspires' }] });
        }

        if (kind === 'ai-rich' || kind === 'ai-card') {
          try {
            if (/^html(?:\s|$)/i.test(value)) {
              const trustedDomain = String(process.env.WHISKAY_RICH_HTML_TRUSTED_DOMAIN || '').trim().toLowerCase();
              const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WHISKAY</title></head><body style="margin:0;padding:24px;background:#101827;color:#f4f7fb;font-family:Arial,sans-serif"><main style="max-width:640px;margin:auto;padding:24px;border:1px solid #34445f;border-radius:18px;background:#172338"><h1 style="margin-top:0">WHISKAY HTML Preview</h1><p>Embedded HTML screen untuk uji AIRichResponse pada WhatsApp Android/iOS.</p><p>HTML ini hanya contoh lokal tanpa script eksternal.</p><small>WHISKAY · Experimental renderer</small></main></body></html>';
              const sent = await sendAIRich({ title: 'WHISKAY · HTML RESPONSE', text: 'Buka preview untuk melihat embedded HTML screen.', htmlTitle: 'WHISKAY Preview', html, trustedSources: trustedDomain ? [trustedDomain] : [], forwardedContext: /\bforwarded\b/i.test(value) });
              return reply(`AIRichResponse HTML diserahkan ke Baileys. ID: ${sent?.key?.id || 'terkirim'}.\nEmbedded screen hanya didukung pada client WhatsApp mobile yang kompatibel; WA Web desktop dapat menampilkan fallback.\nTrusted domain: ${trustedDomain || '(belum diatur; HTML tetap eksperimental)'}. Tidak ada botJid, signature, atau atribusi Meta AI palsu.`);
            }
            const [title = 'WHISKAY · AI RICH RESPONSE', summary = 'Ini adalah contoh AIRichResponse terstruktur dari WHISKAY. Pesan ini memakai protobuf richResponseMessage dan unified response sections; tampilan akhir bergantung pada versi WhatsApp penerima.'] = value ? parsePipeArgs(value, 2, '.waform ai-rich <judul> | <ringkasan>') : [];
            return await sendAIRich({ title, text: summary });
          } catch (error) { return reply(`AIRichResponse gagal: ${error.message}\nPayload ini eksperimental dan tidak memakai botJid/identitas Meta AI palsu.`); }
        }

        if (kind === 'carousel') {
          try {
            const forwardedCompat = /^forwarded$/i.test(value);
            return await sendCarousel({
              title: 'WHISKAY · CAROUSEL', body: 'InteractiveMessage.carouselMessage · contextInfo aktif · card action terpisah.', footer: '2 cards · HSCROLL',
              cards: [
                { title: 'CORE TOOLS', subtitle: 'Command runtime', body: 'Diagnostics, hot reload, command list dan rekomendasi command.', footer: 'Core', buttons: [{ type: 'quick_reply', title: 'Plugins', id: commandActionId('.plugins') }] },
                { title: 'VIDEO HD', subtitle: 'Local FFmpeg', body: 'Analisis metadata dan upscale video secara lokal dengan preset balanced/sharp/clean/fast.', footer: 'Media', buttons: [{ type: 'quick_reply', title: 'Video HD', id: commandActionId('.remini info') }] }
              ],
              contextInfo: { mentionedJid: [], groupMentions: [], forwardingScore: forwardedCompat ? 1 : 0, isForwarded: forwardedCompat }
            });
          } catch (error) { return reply(`Carousel gagal dibuat: ${error.message}. Payload carousel memerlukan client yang mendukung InteractiveMessage.carouselMessage.`); }
        }

        if (kind === 'poll') {
          const poll = await sendPoll({ name: 'WHISKAY Poll Demo', values: ['Quick Reply', 'Single Select', 'Carousel', 'AIRichResponse'], selectableCount: 1 });
          return reply(`Native poll dibuat. ID: ${poll?.key?.id || 'terkirim'}`);
        }

        if (kind === 'contact') {
          try { const [name, phone] = value ? parsePipeArgs(value, 2, '.waform contact <nama> | <+nomor>') : ['WHISKAY Demo Contact', '+19995550123']; return sendContact({ name, phone }); }
          catch (error) { return reply(error.message); }
        }

        if (kind === 'location') {
          try { const [latitude, longitude, name = '', address = ''] = value ? parsePipeArgs(value, 2, '.waform location <latitude> | <longitude> [| nama] [| alamat]') : ['3.5952', '98.6722', 'WHISKAY Demo Point', 'Medan, Sumatera Utara']; return sendLocation({ latitude, longitude, name, address }); }
          catch (error) { return reply(error.message); }
        }

        if (kind === 'table') {
          const table = { title: 'WHISKAY · FORMAT SELECTION', headers: ['Kebutuhan', 'Format', 'Catatan'], rows: [
            ['Command cepat', 'quick_reply', 'Aksi bot'], ['Banyak pilihan', 'single_select', 'Menu panjang'], ['Link', 'cta_url/webview', 'HTTPS'], ['Voting', 'poll', 'Native vote'], ['Kartu horizontal', 'carouselMessage', 'Interactive carousel']
          ] };
          try { return await sendAIRich({ title: 'Native rich table', table }); }
          catch { return send({ type: 'table', title: table.title, headers: table.headers, rows: table.rows }); }
        }

        if (kind === 'code') {
          if (!value || value.toLowerCase() === 'sample') {
            return sendAIRich({ title: 'WHISKAY · CODE RESPONSE DEMO', language: 'javascript', code: 'const profile = {\n  platform: "WHISKAY",\n  mode: "owner-only"\n};\nconsole.log(profile);' });
          }
          try {
            const [language = 'javascript', code = ''] = parsePipeArgs(value, 2, '.waform code <language> | <source code>');
            return await sendAIRich({ title: `Code sample · ${language}`, language, code });
          } catch (error) {
            const usage = '.waform code javascript | const answer = 42;\nconsole.log(answer);';
            if (/Format:/.test(error.message) && typeof sendInteractive === 'function') {
              return sendInteractive({ title: 'WHISKAY · CODE RESPONSE', body: `AIRichResponse Code menampilkan blok kode protobuf terstruktur jika client mendukungnya.\n\nSintaks: ${usage}\n\nUntuk contoh yang bisa langsung dikirim, pilih Sample.`, footer: 'AIRichResponse · experimental', buttons: [{ type: 'quick_reply', title: 'Sample code', id: commandActionId('.waform code sample') }, { type: 'quick_reply', title: 'Message Lab', id: commandActionId('.waform help') }] });
            }
            if (/Format:/.test(error.message)) return reply(`${error.message}\nContoh:\n${usage}`);
            const [language = 'javascript', code = ''] = value ? value.split('|', 2).map(part => part.trim()) : ['javascript', ''];
            return reply(`AIRichResponse Code tidak dirender pada client ini: ${error.message}\nFallback teks biasa:\n\`\`\`${language || 'text'}\n${code}\n\`\`\``);
          }
        }

        if (kind === 'product') {
          try {
            const businessOwnerJid = process.env.WHISKAY_BUSINESS_OWNER_JID || sock?.user?.id;
            if (/^(?:catalog|list)$/i.test(value) || /^info\s+/i.test(value)) {
              if (!businessOwnerJid || typeof sock?.getCatalog !== 'function') throw new Error('Socket ini tidak menyediakan getCatalog atau JID Business belum tersedia.');
              const catalogResult = await withTimeout(
                sock.getCatalog({ jid: businessOwnerJid, limit: 10 }),
                20_000,
                'getCatalog timeout setelah 20 detik. Baileys issue #2717 melaporkan timeout/empty response pada sebagian sesi Business.'
              );
              const products = Array.isArray(catalogResult?.products) ? catalogResult.products : Array.isArray(catalogResult) ? catalogResult : [];
              if (!products.length) return reply('Katalog Business tidak mengembalikan produk. Tidak ada data buatan yang dipakai. Periksa katalog di aplikasi WhatsApp Business dan coba lagi; getCatalog memiliki laporan timeout/empty response di Baileys #2717.');
              if (/^info\s+/i.test(value)) {
                const wanted = value.replace(/^info\s+/i, '').trim();
                const product = products.find(item => String(item.productId || item.id || item.retailerId || '') === wanted);
                if (!product) return reply(`Produk ID ${wanted} tidak ditemukan dalam 10 item katalog yang dikembalikan.`);
                const safe = Object.fromEntries(['productId', 'id', 'name', 'title', 'description', 'currency', 'currencyCode', 'price', 'priceAmount1000', 'retailerId', 'url'].filter(key => product[key] !== undefined && typeof product[key] !== 'object').map(key => [key, product[key]]));
                return reply(`━━ BUSINESS PRODUCT INFO ━━\n${JSON.stringify(safe, null, 2).slice(0, 3000)}\n\nUntuk mengirim, gunakan metadata katalog asli dan gambar lokal yang cocok: .waform product <id> | <nama> | <deskripsi> | <currency> | <harga> | <retailer-id> | <gambar>`);
              }
              const rows = products.slice(0, 10).map((item, index) => {
                const id = String(item.productId || item.id || item.retailerId || '').trim();
                const name = String(item.name || item.title || `Product ${index + 1}`).slice(0, 80);
                const priceLabel = [item.currency || item.currencyCode, item.price].filter(Boolean).join(' ');
                return { title: name, description: `${id || 'ID tidak tersedia'}${priceLabel ? ` · ${priceLabel}` : ''}`.slice(0, 120), id: commandActionId(`.waform product info ${id || 'unknown'}`) };
              }).filter(row => !row.id.endsWith('unknown'));
              if (rows.length && typeof sendInteractive === 'function') return sendInteractive({ title: 'WHISKAY · BUSINESS CATALOG', body: `Ditemukan ${products.length} produk dari katalog yang dikembalikan Baileys. Pilih item untuk melihat metadata.`, footer: 'Read-only · Real catalog data', buttons: [{ type: 'single_select', title: 'Produk Business', sections: [{ title: 'Catalog items', rows }] }] });
              return reply(`Ditemukan ${products.length} produk katalog. Gunakan .waform product info <id> untuk detail.`);
            }
            if (process.env.WHISKAY_WHATSAPP_BUSINESS_CATALOG_ENABLED !== 'true') throw new Error('ProductMessage belum diaktifkan. Set WHISKAY_WHATSAPP_BUSINESS_CATALOG_ENABLED=true setelah memastikan akun pengirim adalah WhatsApp Business dan katalog produk tersedia.');
            if (!businessOwnerJid) throw new Error('Identitas socket WhatsApp Business belum tersedia.');
            let product;
            let imageName = 'whiskay-demo-viewonce-image.jpg';
            if (value) {
              const [productId, title, description, currencyCode, price, retailerId, suppliedImageName] = parsePipeArgs(value, 7, '.waform product <productId> | <title> | <description> | <currency> | <price> | <retailerId> | <image filename>');
              imageName = suppliedImageName;
              product = { productId, title, description, currencyCode, priceAmount1000: safePrice(price), retailerId };
            } else {
              if (typeof sock?.getCatalog !== 'function') throw new Error('Socket tidak menyediakan getCatalog; sample otomatis membutuhkan katalog WhatsApp Business yang nyata.');
              const catalogResult = await withTimeout(
                sock.getCatalog({ jid: businessOwnerJid, limit: 10 }),
                20_000,
                'getCatalog timeout setelah 20 detik. Periksa koneksi dan katalog Business.'
              );
              const first = (Array.isArray(catalogResult?.products) ? catalogResult.products : Array.isArray(catalogResult) ? catalogResult : [])[0];
              if (!first) throw new Error('Katalog Business kosong. Tambahkan minimal satu produk di WhatsApp Business; WHISKAY tidak membuat ID produk fiktif.');
              const productId = String(first.productId || first.id || '').trim();
              const title = String(first.title || first.name || '').trim();
              const currencyCode = String(first.currencyCode || first.currency || '').trim().toUpperCase();
              const rawPrice = first.priceAmount1000 ?? (first.price !== undefined ? safePrice(first.price) : null);
              if (!productId || !title || !/^[A-Z]{3}$/.test(currencyCode) || !Number.isSafeInteger(Number(rawPrice))) {
                throw new Error('Produk katalog pertama tidak memiliki productId, title, currencyCode, atau priceAmount1000 yang valid. Gunakan .waform product catalog untuk memeriksa metadata.');
              }
              product = {
                productId, title, description: String(first.description || ''), currencyCode,
                priceAmount1000: Number(rawPrice), retailerId: String(first.retailerId || '')
              };
            }
            const image = await localMediaPath(['whatsapp-products', 'whatsapp-media-demo', ''], imageName, ['.jpg', '.jpeg', '.png', '.webp']);
            const sent = await sendProduct({ catalogEnabled: true, product: { ...product, productImage: image }, businessOwnerJid, body: 'WHISKAY ProductMessage sample · catalog-backed', footer: 'WhatsApp Business Product' });
            return reply(`ProductMessage diserahkan ke Baileys.\nProduk: ${product.title} (${product.productId})\nGambar: ${path.basename(image)}\nID: ${sent?.key?.id || 'terkirim'}\nACK bukan bukti delivery atau render.`);
          } catch (error) { return reply(`Product Message gagal: ${error.message}\nWHISKAY tidak membuat ID katalog, harga, atau data produk fiktif.`); }
        }

        if (kind === 'media') {
          try {
            const { action: mediaAction, filename: suppliedFilename } = parseMediaArguments(value);
            const mapping = {
              ptv: { type: 'ptv', ext: ['.mp4'], sample: 'whiskay-demo-ptv.mp4' },
              voice: { type: 'voice', ext: ['.ogg', '.opus'], sample: 'whiskay-demo-voice.ogg' },
              gif: { type: 'gif', ext: ['.mp4'], sample: 'whiskay-demo-gif.mp4' },
              'viewonce-image': { type: 'image', viewOnce: true, ext: ['.jpg', '.jpeg', '.png', '.webp'], sample: 'whiskay-demo-viewonce-image.jpg' },
              'viewonce-video': { type: 'video', viewOnce: true, ext: ['.mp4', '.mov'], sample: 'whiskay-demo-viewonce-video.mp4' }
            };
            const selected = mapping[mediaAction];
            if (!selected) throw new Error('Aksi media harus ptv, voice, gif, viewonce-image, atau viewonce-video.');
            await ensureWhatsAppMediaDemo();
            const localPath = await localMediaPath('whatsapp-media-demo', suppliedFilename || selected.sample, selected.ext);
            const sent = await sendMedia(selected.type, localPath, {
              ptv: selected.type === 'ptv', viewOnce: Boolean(selected.viewOnce), ptt: selected.type === 'voice',
              mimetype: selected.type === 'voice' ? 'audio/ogg; codecs=opus' : undefined,
              caption: 'WHISKAY media test'
            });
            return reply(`Media ${mediaAction.toUpperCase()} diserahkan ke Baileys.\nFile: ${path.basename(localPath)}\nID: ${sent?.key?.id || 'terkirim'}\nPeriksa hasil pada WhatsApp penerima; View Once/voice note/PTV/GIF tetap bergantung client.`);
          } catch (error) { return reply(`Media test gagal: ${error.message}`); }
        }

        return reply(interfaceHelp);
      }
    },
    {
      name: 'wacapabilities', aliases: ['wabuttonhelp'], category: 'WhatsApp Interfaces', usage: '',
      description: 'Matriks format pesan dan batas kompatibilitas Baileys',
      async execute({ reply, sendInteractive }) {
        const cache = pollCacheStats();
        const rows = WHATSAPP_MESSAGE_GUIDE.map(item => `${item.type.toUpperCase()} · ${item.transport}\n  ${item.use}`);
        const matrix = [
          '━━ WHISKAY BAILEYS MESSAGE MATRIX ━━', ...rows, '',
          'PEMILIHAN FORMAT',
          'quick_reply: command pendek; single_select: daftar panjang; CTA URL/WebView: link; CTA Copy: ID publik; CTA Call: buka dialer.',
          'EventMessage + event.call audio/video: undangan terjadwal dan meminta call link Baileys. Bukan direct call.',
          'Hydrated Template dan ButtonsMessage adalah format legacy; Native Flow mixed, carousel, AIRichResponse, dan card adalah transport berbeda.',
          'Carousel: InteractiveMessage.carouselMessage + root contextInfo + MessageContextInfo + biz/native_flow metadata; render tetap bergantung client.',
          'AIRichResponse: botForwardedMessage.message.richResponseMessage; protobuf eksperimental, tanpa botJid/forwarded identity buatan.',
          'PTV: video + ptv:true. View Once: viewOnce:true; dukungan/delivery harus diuji di WhatsApp client.',
          'Product: productImage + productId/title/currency/priceAmount1000/businessOwnerJid; tidak membuat katalog/ID/harga fiktif.',
          `Poll cache: ${cache.storedPolls}/${cache.limit}`, '', 'Gunakan .waform help untuk sintaks demo.'
        ].join('\n');
        if (typeof sendInteractive === 'function') {
          const actions = [
            ['.waform quick', 'Quick Reply'], ['.waform mixed', 'Mixed Native Flow'], ['.waform template', 'Hydrated Template'],
            ['.waform card', 'Native Flow Card'], ['.waform ai-rich', 'AIRichResponse'], ['.waform carousel', 'CarouselMessage'],
            ['.waform poll', 'Native Poll'], ['.waform call', 'EventMessage Call'], ['.waform product', 'ProductMessage'], ['.waform media', 'PTV / View Once / Voice']
          ];
          return sendInteractive({ title: 'WHISKAY · BAILEYS CAPABILITIES', body: matrix, footer: 'Pilih contoh transport', buttons: [{ type: 'single_select', title: 'Message formats', sections: [{ title: 'Demonstrasi', rows: actions.map(([command, title]) => ({ title, description: command, id: commandActionId(command) })) }] }] });
        }
        return reply(matrix);
      }
    }
  ]
};
