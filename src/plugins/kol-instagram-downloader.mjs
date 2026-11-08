import { commandActionId } from '../lib/native-flow.mjs';
import KolInstagramScraper from '../media/kol-instagram-downloader.mjs';

const HELP = [
  '━━ WHISKAY · KOL.ID INSTAGRAM DOWNLOADER ━━',
  '.igdl <instagram_url> — ekstrak dan kirim video/reel/foto/slide publik',
  '.igdl extract <instagram_url> — tampilkan hasil ekstraksi dan link media',
  '.igdl info — metadata halaman downloader KOL.ID',
  '.igdl help — bantuan',
  '',
  'Hanya URL publik instagram.com untuk post/reel/TV/story. Tidak dapat mengakses akun privat, tidak login ke Instagram, dan tidak mengelola engagement.',
  'Batas: 10 slide, 40 MiB per item, 64 MiB total; waktu antre maksimum 60 detik.',
  'Media berasal dari KOL.ID dan CDN publik. Hormati hak cipta dan izin pemilik konten.'
].join('\n');

function safeError(error) { return String(error?.message || error || 'unknown error').replace(/[\r\n\t]+/g, ' ').slice(0, 450); }

export default {
  name: 'kol-instagram-downloader',
  commands: [{
    name: 'igdl', aliases: ['kolig', 'igdownload'], category: 'Instagram Downloader',
    usage: '<instagram_url>|extract <url>|info|help',
    description: 'Unduh Reel, video, post foto, dan slide publik melalui KOL.ID dengan validasi URL dan batas ukuran',
    async execute({ args = [], rawArgs = '', reply, sendMedia, sendInteractive, logger = console }) {
      const first = String(args[0] || '').toLowerCase();
      const rest = String(rawArgs || '').replace(/^\S+\s*/, '').trim();
      if (!first || first === 'help') {
        if (typeof sendInteractive === 'function') {
          return sendInteractive({
            title: 'WHISKAY · INSTAGRAM DOWNLOADER',
            body: HELP,
            footer: 'KOL.ID · public posts only',
            buttons: [{ type: 'single_select', title: 'Pilih tindakan', sections: [{ title: 'Downloader', rows: [
              { title: 'Info KOL.ID', description: 'Lihat status halaman dan format yang terdeteksi', id: commandActionId('.igdl info') },
              { title: 'Panduan penggunaan', description: 'Bantuan, batas file, dan ketentuan', id: commandActionId('.igdl help') },
              { title: 'Daftar plugin', description: 'Lihat seluruh command WHISKAY', id: commandActionId('.plugins') }
            ] }] }]
          });
        }
        return reply(HELP);
      }
      const client = new KolInstagramScraper();
      if (first === 'info') {
        try {
          const info = await client.scrapePageInfo();
          return reply([
            '━━ KOL.ID DOWNLOADER INFO ━━',
            `Halaman: ${info.seo.title || info.url}`,
            `HTTP: ${info.httpStatus}`,
            `Deskripsi: ${(info.seo.description || '-').slice(0, 300)}`,
            `Jenis fitur: ${info.downloaderConfig.supportedTypes.join(', ')}`,
            `FAQ: ${info.faqs.length}`,
            `Platform downloader di situs: ${info.downloaderConfig.supportedDownloadersOnSite.join(', ') || '-'}`,
            '', 'Token dan cookie tidak ditampilkan.'
          ].join('\n'));
        } catch (error) { return reply(`KOL.ID info gagal: ${safeError(error)}`); }
      }
      const extractOnly = first === 'extract';
      const url = extractOnly ? rest : String(rawArgs || '').trim();
      if (!url) {
        if (typeof sendInteractive === 'function') {
          return sendInteractive({ title: 'WHISKAY · IGDL INPUT', body: 'Format: .igdl <instagram_url> atau .igdl extract <instagram_url>. Gunakan post/reel publik yang kamu punya izin untuk unduh.', footer: 'KOL.ID · public Instagram URL', buttons: [{ type: 'quick_reply', title: 'Info KOL.ID', id: commandActionId('.igdl info') }, { type: 'quick_reply', title: 'Plugins', id: commandActionId('.plugins') }] });
        }
        return reply(HELP);
      }
      try {
        await reply('Permintaan dikirim ke KOL.ID. Memeriksa post publik dan menunggu status ekstraksi.');
        const result = await client.fetchMediaInfo(url);
        const summary = [
          '━━ KOL.ID · EXTRACTION RESULT ━━',
          `Tipe: ${result.type}`,
          `Author: ${result.author || '-'}`,
          `Judul: ${result.title || '-'}`,
          `Media: ${result.totalMedia} item`,
          `Request ID: ${result.requestId || '-'}`
        ];
        if (extractOnly) {
          for (const item of result.media) summary.push(`\n#${item.index} ${item.type.toUpperCase()}\n${item.url}`);
          return reply(summary.join('\n').slice(0, 3900));
        }
        const mediaItems = await client.downloadResult(result);
        await reply(`${summary.join('\n')}\n\nDownload selesai. Mengirim ${mediaItems.length} media ke chat.`);
        for (let index = 0; index < mediaItems.length; index += 1) {
          const item = mediaItems[index];
          const caption = [
            `KOL.ID · ${item.type.toUpperCase()} ${index + 1}/${mediaItems.length}`,
            result.author ? `Author: ${result.author}` : '',
            result.title ? `Title: ${result.title.slice(0, 150)}` : '',
            `Source: ${result.originalUrl}`
          ].filter(Boolean).join('\n');
          await sendMedia(item.type === 'video' ? 'video' : 'image', item.buffer, {
            caption: index === 0 ? caption : `KOL.ID · ${index + 1}/${mediaItems.length}`,
            mimetype: item.mimetype || (item.type === 'video' ? 'video/mp4' : 'image/jpeg')
          });
        }
        return reply(`Pengiriman selesai: ${mediaItems.length} item. Cek hasil pada chat penerima; server media dapat menolak URL atau payload yang berubah.`);
      } catch (error) {
        logger.warn?.({ error: safeError(error) }, '[IGDL] KOL.ID extraction failed');
        return reply(`IGDL gagal: ${safeError(error)}\nCoba URL post/reel publik lain atau .igdl info.`);
      }
    }
  }]
};
