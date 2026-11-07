import { commandActionId } from '../lib/native-flow.mjs';
import { pollCacheStats } from '../lib/poll-store.mjs';
import { WHATSAPP_MESSAGE_GUIDE } from '../lib/whatsapp-message-router.mjs';

function parsePollInput(rawInput) {
  let raw = String(rawInput || '').trim();
  let selectableCount = 1;
  if (/^multi\s+/i.test(raw)) { selectableCount = 0; raw = raw.replace(/^multi\s+/i, ''); }
  const parts = raw.split('|').map(part => part.trim()).filter(Boolean);
  if (parts.length < 3) throw new Error('Format: .poll "Pertanyaan" | Opsi A | Opsi B. Tambahkan `multi` setelah .poll untuk multi-select.');
  const question = parts.shift().replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, (_, a, b) => a ?? b);
  if (!question || parts.length < 2) throw new Error('Pertanyaan dan minimal dua opsi wajib diisi.');
  return { name: question, values: parts, selectableCount };
}

const interfaceHelp = [
  '━━ WHISKAY · WHATSAPP MESSAGE ROUTER ━━',
  '.waform quick — 3 quick-reply command actions',
  '.waform mixed — Native Flow: quick_reply + cta_url + cta_copy',
  '.waform list — Single Select / button list',
  '.waform url <https://...> — CTA URL external',
  '.waform webview <https://...> — CTA URL with webview_interaction',
  '.waform copy <kode/id-publik> — CTA Copy (non-secret only)',
  '.waform call <+628...> — CTA Call',
  '.waform catalog — CTA Catalog pada akun Business yang terhubung',
  '.waform template — legacy hydrated Template Buttons',
  '.waform card — Native Flow rich card',
  '.waform ai-card — AI-assisted content in normal rich card (no fake AI identity)',
  '.waform carousel — 2–10 cards with separate actions',
  '.waform poll — native WhatsApp poll',
  '.waform contact <nama> | <+nomor> — kirim satu vCard',
  '.waform location <lat> | <lon> [| nama] [| alamat] — lokasi statis',
  '.waform table — table text fallback',
  '.waform code — code-block text fallback',
  '.waform product — explain real catalog/product restrictions',
  '.waform media — daftar media dan cara uji media masuk',
  '',
  'Shortcut tombol hanya menjalankan command yang kembali melewati autentikasi owner.',
  'URL harus HTTPS. CTA Copy hanya untuk ID/kode publik, bukan password, token, API key, atau data pribadi.',
  'Product Message hanya layak dengan catalog/product ID dan metadata bisnis nyata. AI Rich Card proprietary dari serializer sumber tidak diaktifkan karena memalsukan forwarded-AI identity.'
].join('\n');

function parsePipeArgs(raw, minParts, usage) {
  const parts = String(raw || '').split('|').map(part => part.trim());
  if (parts.length < minParts || parts.some(part => !part)) throw new Error(`Format: ${usage}`);
  return parts;
}

export default {
  name: 'whatsapp-tools',
  commands: [
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
        const lines = [
          '━━ WHISKAY MEDIA INSPECTOR ━━',
          `Jenis: ${media.type || '-'}`,
          `Message type: ${media.messageType || '-'}`,
          `Nama: ${media.fileName || '-'}`,
          `MIME: ${media.mimetype || '-'}`,
          `Ukuran: ${media.fileLength ? `${(media.fileLength / 1048576).toFixed(2)} MiB` : 'metadata tidak tersedia'}`,
          `Dimensi: ${media.width && media.height ? `${media.width}×${media.height}` : '-'}`,
          `Durasi: ${media.seconds ? `${media.seconds}s` : '-'}`,
          `Animasi: ${media.isAnimated ? 'ya' : 'tidak'}`,
          `Sumber: ${messageInfo.media ? 'lampiran langsung' : 'pesan kutipan'}`,
          '',
          'Download media hanya dilakukan oleh command yang membutuhkannya.'
        ];
        await reply(lines.join('\n'));
      }
    },
    {
      name: 'waform', aliases: ['waui', 'wabuttons'], category: 'WhatsApp Interfaces',
      usage: '[quick|mixed|list|url|webview|copy|call|catalog|template|card|ai-card|carousel|poll|contact|location|table|code|product|media]',
      description: 'Uji pemilihan format Native Flow, CTA, template, cards, list, poll, contacts, locations dan media',
      async execute({ args = [], rawArgs = '', reply, send, sendInteractive, sendNativeButtons, sendCarousel, sendRichCard, sendTemplateButtons, sendPoll, sendContact, sendLocation }) {
        const kind = String(args[0] || '').toLowerCase();
        const value = String(rawArgs || '').replace(/^\S+\s*/, '').trim();
        if (!kind || kind === 'help') return reply(interfaceHelp);
        if (kind === 'quick') {
          return sendNativeButtons({
            title: 'WHISKAY Quick Reply', body: 'Pilihan pendek untuk tindakan command. Semua respons diperiksa kembali oleh router owner.',
            footer: 'Native Flow · Quick Reply',
            buttons: [
              { type: 'quick_reply', title: 'Menu', id: commandActionId('.menu') },
              { type: 'quick_reply', title: 'Plugins', id: commandActionId('.plugins') },
              { type: 'quick_reply', title: 'Capabilities', id: commandActionId('.wacapabilities') }
            ]
          });
        }
        if (kind === 'mixed' || kind === 'buttons' || kind === 'native') {
          return sendInteractive({
            title: 'WHISKAY Native Buttons', body: 'Satu Native Flow boleh menggabungkan command quick reply dan CTA eksternal.', footer: 'Mixed Native Flow',
            buttons: [
              { type: 'quick_reply', title: 'Menu', id: commandActionId('.menu') },
              { type: 'quick_reply', title: 'Media', id: commandActionId('.mediainfo') },
              { type: 'cta_url', title: 'GitHub', url: 'https://github.com/razzaqinspires' },
              { type: 'cta_copy', title: 'Copy Version', id: 'whiskay-version', copy_code: 'WHISKAY-v0.10.16' }
            ]
          });
        }
        if (kind === 'list') {
          return sendInteractive({
            title: 'WHISKAY Command List', body: 'Single Select sesuai untuk banyak pilihan dalam beberapa kategori.', footer: 'Pilih satu command',
            buttons: [{ type: 'single_select', title: 'Buka command', sections: [
              { title: 'Core & WhatsApp', rows: [
                { title: 'Menu', description: 'Browse seluruh command', id: commandActionId('.menu') },
                { title: 'Diagnostics', description: 'Daftar plugin', id: commandActionId('.plugins') },
                { title: 'Capabilities', description: 'Panduan format pesan', id: commandActionId('.wacapabilities') },
                { title: 'Media Inspector', description: 'Periksa lampiran', id: commandActionId('.mediainfo') }
              ] },
              { title: 'Instagram', rows: [
                { title: 'IG Dashboard', description: 'Ringkasan pertumbuhan', id: commandActionId('.igpanel') },
                { title: 'IG Stats', description: 'Statistik akun', id: commandActionId('.igstats') }
              ] },
              { title: 'Dokumen & Media', rows: [
                { title: 'Academi Help', description: 'Document review', id: commandActionId('.acad help') },
                { title: 'Video HD', description: 'FFmpeg local enhancer', id: commandActionId('.remini info') }
              ] }
            ] }]
          });
        }
        if (kind === 'url' || kind === 'webview') {
          let url;
          try { url = new URL(value); } catch { return reply('Format: .waform url <https://example.com> atau .waform webview <https://example.com>'); }
          if (url.protocol !== 'https:' || url.username || url.password) return reply('URL harus HTTPS dan tidak boleh menyertakan username/password.');
          return sendNativeButtons({ title: kind === 'webview' ? 'Open WebView' : 'Open Link', body: `Tujuan: ${url.origin}\n${kind === 'webview' ? 'Meminta webview_interaction; client dapat mengabaikan dan membuka browser.' : 'Membuka URL melalui browser/client.'}`, buttons: [{ type: kind === 'webview' ? 'webview_url' : 'cta_url', title: 'Buka URL', url: url.toString() }] });
        }
        if (kind === 'copy') {
          if (!value || value.length > 120 || /(password|passwd|secret|api[_-]?key|access[_-]?token|bearer|private[_-]?key)/i.test(value)) return reply('Format: .waform copy <kode/ID publik maksimal 120 karakter>. Rahasia dan token ditolak.');
          return sendNativeButtons({ title: 'CTA Copy', body: 'Tombol menyalin kode publik yang diberikan.', buttons: [{ type: 'cta_copy', title: 'Salin kode', id: 'whiskay-copy-demo', copy_code: value }] });
        }
        if (kind === 'call') {
          if (!value) return reply('Format: .waform call <nomor-internasional>, contoh +6281234567890');
          return sendNativeButtons({ title: 'CTA Call', body: `Tombol membuka dialer untuk ${value}.`, buttons: [{ type: 'cta_call', title: 'Telepon', phone: value }] });
        }
        if (kind === 'catalog') {
          return sendNativeButtons({ title: 'WhatsApp Business Catalog', body: 'CTA ini hanya membuka katalog WhatsApp Business yang benar-benar terhubung pada akun. Ketersediaan bergantung pada tipe akun dan client.', buttons: [{ type: 'cta_catalog', title: 'Lihat katalog' }] });
        }
        if (kind === 'template') {
          try {
            return await sendTemplateButtons({ text: 'Hydrated Template Buttons untuk kompatibilitas client lama. Native Flow tetap menjadi pilihan utama.', footer: 'Template compatibility', buttons: [
              { type: 'quick_reply', title: 'Menu', id: commandActionId('.menu') },
              { type: 'cta_url', title: 'GitHub', url: 'https://github.com/razzaqinspires' }
            ] });
          } catch (error) {
            await reply(`Template tidak tersedia: ${error.message}\nMengirim fallback Native Flow.`);
            return sendNativeButtons({ title: 'Template Fallback', body: 'Template Buttons tidak berhasil; ini fallback Native Flow.', buttons: [{ type: 'quick_reply', title: 'Menu', id: commandActionId('.menu') }] });
          }
        }
        if (kind === 'card' || kind === 'ai-card') {
          return sendRichCard({
            title: kind === 'ai-card' ? 'AI-assisted Summary Card' : 'WHISKAY Rich Card',
            subtitle: 'Native Flow structured message',
            body: kind === 'ai-card'
              ? 'Ini format kartu terstruktur untuk menampilkan ringkasan yang dibuat oleh fitur AI. Kartu ini tidak menyatakan verified Meta AI atau forwarded identity.'
              : 'Gunakan satu kartu untuk ringkasan status, hasil, atau rekomendasi dengan tindakan yang jelas.',
            footer: 'Interactive card',
            buttons: [
              { type: 'quick_reply', title: 'Menu', id: commandActionId('.menu') },
              { type: 'cta_copy', title: 'Copy ID', id: 'whiskay-card-id', copy_code: 'WHISKAY-CARD-001' }
            ]
          });
        }
        if (kind === 'carousel') {
          return sendCarousel({ title: 'WHISKAY Carousel', body: 'Gunakan carousel untuk dua sampai sepuluh fitur/produk nyata; setiap card mempunyai aksi sendiri.', cards: [
            { title: 'Core Tools', body: 'Diagnostics, command routing dan status runtime.', buttons: [{ type: 'quick_reply', title: 'Plugins', id: commandActionId('.plugins') }] },
            { title: 'Media Tools', body: 'Metadata media dan pemrosesan video HD lokal.', buttons: [{ type: 'quick_reply', title: 'Video HD', id: commandActionId('.remini info') }] }
          ] });
        }
        if (kind === 'poll') {
          const poll = await sendPoll({ name: 'WHISKAY Poll Demo', values: ['Quick Reply', 'Single Select', 'Carousel'], selectableCount: 1 });
          return reply(`Native poll terkirim. ID: ${poll?.key?.id || '-'}`);
        }
        if (kind === 'contact') {
          try {
            const [name, phone] = parsePipeArgs(value, 2, '.waform contact <nama> | <+nomor>');
            return sendContact({ name, phone });
          } catch (error) { return reply(error.message); }
        }
        if (kind === 'location') {
          try {
            const [latitude, longitude, name = '', address = ''] = parsePipeArgs(value, 2, '.waform location <latitude> | <longitude> [| nama] [| alamat]');
            return sendLocation({ latitude, longitude, name, address });
          } catch (error) { return reply(error.message); }
        }
        if (kind === 'table') {
          return send({ type: 'table', title: 'Format teks tabel', headers: ['Jenis', 'Pilihan'], rows: [['Menu singkat', 'Quick Reply'], ['Menu panjang', 'Single Select'], ['Voting', 'Poll']] });
        }
        if (kind === 'code') {
          return send({ type: 'code', language: 'javascript', code: 'const message = { type: "interactive", buttons: [] };\nawait send(message);' });
        }
        if (kind === 'product') {
          return reply('Product Message bukan generator generik. Perlu akun WhatsApp Business, product/catalog ID valid, dan metadata bisnis asli. WHISKAY tidak membuat harga, stok, gambar, atau product ID fiktif. Untuk CTA katalog gunakan .waform catalog.');
        }
        if (kind === 'media') {
          return reply([
            '━━ MEDIA SEND / RECEIVE ━━',
            'Image · Video · PTV/video note · Audio · Voice/PTT · Document · Sticker · GIF',
            'Media masuk: .mediainfo; balas media dengan command yang memerlukannya untuk bounded download.',
            'Media keluar dari plugin: send({ type: "media", mediaType: "image|video|audio|document|sticker|gif", media: Buffer atau path lokal }).',
            'Jangan kirim URL remote ke sendMedia; WHISKAY tidak mengunduh arbitrary media URL.'
          ].join('\n'));
        }
        return reply(interfaceHelp);
      }
    },
    {
      name: 'wacapabilities', aliases: ['wabuttonhelp'], category: 'WhatsApp Interfaces', usage: '',
      description: 'Matriks pemilihan format pesan, tombol, polling, kartu, kontak, lokasi dan media Baileys',
      async execute({ reply }) {
        const cache = pollCacheStats();
        const rows = WHATSAPP_MESSAGE_GUIDE.map(item => `${item.type.toUpperCase()} · ${item.transport}\n  ${item.use}`);
        await reply([
          '━━ WHISKAY BAILEYS MESSAGE MATRIX ━━',
          ...rows,
          '',
          'KEPUTUSAN KHUSUS',
          'AI RICH RESPONSE proprietary dari source helper mengandung forwardedAiBotMessageInfo / botJid bawaan. Tidak dipakai sebagai identitas AI Meta. Gunakan rich_card Native Flow biasa untuk konten yang memang dihasilkan AI.',
          'PRODUCT MESSAGE dibatasi pada product ID dan catalog metadata riil. Tidak ada kartu produk sintetis.',
          'LIVE LOCATION, STATUS, PAYMENT, fake quote, fake call, fake contact dan fake sender metadata tidak menjadi command WHISKAY.',
          'Carousel: 2–10 cards. Native Flow: maksimal 10 buttons. Template: maksimal 3 tombol legacy. Poll: 2–12 opsi.',
          `Poll creation cache: ${cache.storedPolls}/${cache.limit}`,
          '',
          'Uji format: .waform help'
        ].join('\n'));
      }
    }
  ]
};
