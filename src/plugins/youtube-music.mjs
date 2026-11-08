import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { commandActionId } from '../lib/native-flow.mjs';
import { YouTubeMusicAudio, YouTubeMusicClient } from '../media/youtube-music.mjs';

const HELP = [
  '━━ WHISKAY · YOUTUBE MUSIC ━━',
  '.ytmusic <query> — cari lagu dan tampilkan pilihan',
  '.ytmusic search <query> — pencarian eksplisit',
  '.ytmusic songs|videos|albums|artists|playlists <query> — filter hasil',
  '.ytmusic play <videoId> — unduh audio satu track dan kirim ke chat',
  '.ytmusic status — cek yt-dlp dan konfigurasi',
  '.ytmusic help — bantuan',
  '',
  'Menggunakan YouTube Music InnerTube WEB_REMIX dan yt-dlp. Tidak mengunduh playlist secara massal.',
  'Gunakan hanya konten yang kamu miliki atau punya izin untuk diunduh. Hormati hak cipta dan ketentuan YouTube.'
].join('\n');

function safeText(value, max = 120) { return String(value || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max); }
function outputRoot() { return path.resolve(process.cwd(), 'data', 'youtube-music'); }

export default {
  name: 'youtube-music',
  commands: [{
    name: 'ytmusic', aliases: ['ytm', 'musicsearch'], category: 'Media & Music',
    usage: '<query>|search <query>|songs <query>|play <videoId>|status|help',
    description: 'Cari YouTube Music, filter kategori, dan kirim audio satu track melalui yt-dlp',
    async execute({ args = [], rawArgs = '', reply, sendInteractive, sendMedia, logger = console }) {
      const action = String(args[0] || '').toLowerCase();
      const remainder = String(rawArgs || '').replace(/^\S+\s*/, '').trim();
      const client = new YouTubeMusicClient();
      const audio = new YouTubeMusicAudio({ searchClient: client });

      if (!action || action === 'help') {
        if (typeof sendInteractive === 'function') return sendInteractive({
          title: 'WHISKAY · YOUTUBE MUSIC', body: HELP, footer: 'Search · Filter · Audio download',
          buttons: [{ type: 'single_select', title: 'Music tools', sections: [{ title: 'Actions', rows: [
            { title: 'Status yt-dlp', description: 'Cek binary downloader', id: commandActionId('.ytmusic status') },
            { title: 'Panduan', description: 'Sintaks dan batas penggunaan', id: commandActionId('.ytmusic help') },
            { title: 'Panduan pencarian', description: 'Kirim .ytmusic diikuti judul/artist', id: commandActionId('.ytmusic help') }
          ] }] }]
        });
        return reply(HELP);
      }
      if (action === 'status') {
        const status = await audio.status();
        return reply([
          '━━ YOUTUBE MUSIC STATUS ━━',
          `yt-dlp: ${status.available ? 'tersedia' : 'tidak ditemukan'}`,
          `Binary: ${status.binary}`,
          `Versi: ${status.version || '-'}`,
          `API key: ${process.env.YOUTUBE_MUSIC_API_KEY ? 'override env aktif' : 'public WEB_REMIX fallback'}`,
          status.error || 'Siap mencari. Download memerlukan yt-dlp di PATH.'
        ].join('\n'));
      }
      if (action === 'play' || action === 'download') {
        const videoId = String(args[1] || '').trim();
        if (!videoId) return reply('Format: .ytmusic play <videoId>. Pilih lagu dari hasil pencarian atau masukkan ID video YouTube yang valid.');
        if (typeof sendMedia !== 'function') return reply('Transport audio WhatsApp tidak tersedia pada handler ini.');
        const id = videoId.length === 11 ? videoId : (() => { try { return new URL(videoId).searchParams.get('v') || ''; } catch { return ''; } })();
        if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return reply('Video ID tidak valid. Gunakan ID 11 karakter dari hasil pencarian.');
        const target = path.join(outputRoot(), `${id}-${randomUUID()}.m4a`);
        try {
          await reply('Menyiapkan audio dari satu video YouTube Music. Proses dapat memerlukan waktu.');
          const result = await audio.downloadToFile(id, target);
          await sendMedia('audio', result.path, { mimetype: 'audio/mp4', ptt: false, caption: `YouTube Music · ${id}\nSumber: ${result.url}` });
          return reply(`Audio diserahkan ke WhatsApp. Ukuran ${(result.size / 1048576).toFixed(2)} MiB. Periksa hasil di chat penerima.`);
        } catch (error) {
          logger.warn?.({ error: error.message, videoId: id }, '[YTMUSIC] download failed');
          return reply(`Download audio gagal: ${safeText(error.message, 420)}\nCek .ytmusic status dan instal yt-dlp/ffmpeg bila diperlukan.`);
        } finally { await rm(target, { force: true }).catch(() => {}); }
      }

      const filters = new Set(['songs', 'videos', 'albums', 'artists', 'playlists']);
      let filter = 'songs';
      let query = remainder;
      if (action === 'search') query = remainder;
      else if (filters.has(action)) { filter = action; query = remainder; }
      else query = String(rawArgs || '').trim();
      if (!query) return reply('Masukkan kata pencarian. Contoh: .ytmusic Nadin Amizah - Bertaut atau .ytmusic songs Coldplay.');
      try {
        await reply(`Mencari YouTube Music: ${safeText(query, 140)} · filter ${filter}.`);
        const results = await client.search(query, { filter, limit: 10 });
        if (!results.length) return reply('Tidak ada hasil track yang memiliki videoId valid. Coba kata kunci lain atau filter videos.');
        const rows = results.slice(0, 10).map((item, index) => ({
          title: `${index + 1}. ${safeText(item.title, 65)}`.slice(0, 80),
          description: safeText([item.category, item.duration, item.meta].filter(Boolean).join(' · '), 120) || 'YouTube Music track',
          id: commandActionId(`.ytmusic play ${item.videoId}`)
        }));
        if (typeof sendInteractive === 'function') return sendInteractive({
          title: 'WHISKAY · YOUTUBE MUSIC RESULTS',
          body: `Query: ${safeText(query, 100)}\nFilter: ${filter}\nHasil: ${results.length}. Pilih satu track untuk menyiapkan audio.`,
          footer: 'Satu track per permintaan · No playlist batch',
          buttons: [{ type: 'single_select', title: 'Pilih track', sections: [{ title: 'Search results', rows }] }]
        });
        return reply(results.map((item, index) => `${index + 1}. ${item.title}\n${item.meta || ''}\n${item.videoId}`).join('\n\n').slice(0, 3800));
      } catch (error) {
        logger.warn?.({ error: error.message }, '[YTMUSIC] search failed');
        return reply(`Pencarian YouTube Music gagal: ${safeText(error.message, 400)}\nCoba lagi nanti atau atur YOUTUBE_MUSIC_API_KEY pada .env.`);
      }
    }
  }]
};
