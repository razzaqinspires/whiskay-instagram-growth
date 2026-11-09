import TikTokScraper, { publicError } from '../media/tiktok-scraper.mjs';

const HELP = [
  '━━ WHISKAY · TIKTOK NATIVE DOWNLOADER ━━',
  '.tiktok <url> — unduh video atau album foto/slide publik',
  '.tiktok info <url> — tampilkan metadata lengkap tanpa mengunduh media',
  '.tiktok audio <url> — unduh track musik yang tersedia',
  '.tiktok status — status provider dan batas unduhan',
  '.tiktok help — bantuan penggunaan',
  '',
  'Format: video, foto, album/slide, dan story publik jika provider memang dapat mengaksesnya.',
  'Story privat, dibatasi usia, atau tidak tersedia tidak akan dilewati.',
  'Batas: 10 item media, 40 MiB per item, 64 MiB total per permintaan.',
  'Gunakan hanya media yang kamu miliki atau berhak untuk simpan.'
].join('\n');

function safeText(value, max = 2500) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function formatCount(value) {
  return value == null ? '—' : Number(value).toLocaleString('id-ID');
}

function formatDuration(value) {
  if (!Number.isFinite(Number(value)) || Number(value) < 0) return '—';
  const seconds = Math.floor(Number(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function formatTikTokMetadata(result) {
  const author = result.author || {};
  const music = result.music || {};
  const stats = result.stats || {};
  const lines = [
    '━━ WHISKAY · TIKTOK METADATA ━━',
    `Judul: ${safeText(result.title || '(tanpa caption)', 1000)}`,
    `Jenis: ${String(result.type || 'post').toUpperCase()} · ${result.media?.length || 0} media`,
    `Kreator: ${safeText(author.name || author.username || '—', 120)}${author.username ? ` (@${safeText(author.username, 80)})` : ''}`,
    `ID: ${safeText(result.id || '—', 100)}`,
    `Durasi: ${formatDuration(result.durationSeconds)}`,
    `Resolusi: ${result.dimensions ? `${result.dimensions.width}×${result.dimensions.height}` : '—'}`,
    `Tanggal: ${result.publishedAt ? new Date(result.publishedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false }) : '—'}`,
    '',
    '*STATISTIK*',
    `Views: ${formatCount(stats.views)} · Likes: ${formatCount(stats.likes)}`,
    `Komentar: ${formatCount(stats.comments)} · Share: ${formatCount(stats.shares)}`,
    `Simpan: ${formatCount(stats.saves)} · Download: ${formatCount(stats.downloads)}`,
    '',
    '*MUSIK*',
    `Judul: ${safeText(music.title || 'Tidak tersedia', 160)}`,
    `Artis: ${safeText(music.author || '—', 120)}`,
    `Music ID: ${safeText(music.id || '—', 100)}`,
    `Original sound: ${music.original ? 'Ya' : 'Tidak diketahui'}`,
    `Audio URL: ${music.url ? 'Tersedia' : 'Tidak tersedia'}`,
    '',
    `Provider: ${safeText(result.provider || 'unknown', 40)}${result.providerFallback ? ' (fallback)' : ''}`,
    'WHISKAY tidak menyimpan URL CDN sementara di chat.'
  ];
  return lines.join('\n').slice(0, 3600);
}

function parseAction(args = []) {
  const first = String(args[0] || '').toLowerCase();
  if (['help', 'status', 'info', 'audio'].includes(first)) {
    return { action: first, url: args.slice(1).join(' ').trim() };
  }
  return { action: 'download', url: args.join(' ').trim() };
}

function statusText(scraper) {
  const status = scraper.getStatus();
  return [
    '━━ WHISKAY · TIKTOK DOWNLOADER STATUS ━━',
    `Custom scraper: ${status.customProviderReady ? `${status.customProviders} endpoint terkonfigurasi` : 'tidak dikonfigurasi'}`,
    'TikWM fallback: siap (endpoint publik, ketersediaan eksternal tidak dijamin)',
    `Maksimum item: ${status.maxMediaItems}`,
    `Maksimum per item: ${Math.ceil(status.maxMediaBytes / 1048576)} MiB`,
    `Maksimum total: ${Math.ceil(status.maxTotalBytes / 1048576)} MiB`,
    '',
    'Status ini memeriksa konfigurasi lokal, bukan melakukan ping provider.'
  ].join('\n');
}

async function sendDownloadedMedia(sendMedia, items, reply) {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const total = items.length;
    const caption = item.type === 'image' ? `WHISKAY · TikTok ${index + 1}/${total}` : `WHISKAY · TikTok ${item.type.toUpperCase()}`;
    const mime = item.mimetype || (item.type === 'image' ? 'image/jpeg' : item.type === 'audio' ? 'audio/mpeg' : 'video/mp4');
    await sendMedia(item.type, item.buffer, {
      caption,
      mimetype: mime,
      fileName: `whiskay-tiktok-${index + 1}.${item.type === 'image' ? 'jpg' : item.type === 'audio' ? 'mp3' : 'mp4'}`
    });
    if (index + 1 < items.length) await new Promise(resolve => setTimeout(resolve, 350));
  }
  await reply(`Selesai. ${items.length} media TikTok berhasil dikirim.`);
}

export default {
  name: 'tiktok-downloader',
  commands: [{
    name: 'tiktok',
    aliases: ['tt', 'ttdl', 'tiktokdl'],
    category: 'Media Downloader',
    usage: '<url>|info <url>|audio <url>|status|help',
    description: 'Unduh video, foto/slide, story publik, metadata dan musik TikTok',
    async execute({ args = [], reply, sendMedia, logger = console }) {
      const { action, url } = parseAction(args);
      const scraper = new TikTokScraper();
      if (action === 'help') return reply(HELP);
      if (action === 'status') return reply(statusText(scraper));
      if (!url) return reply(HELP);
      if (typeof sendMedia !== 'function') return reply('Transport media WHISKAY tidak tersedia pada konteks ini.');

      if (action === 'info') {
        try {
          const result = await scraper.fetchMediaInfo(url);
          return reply(formatTikTokMetadata(result));
        } catch (error) {
          logger.warn?.({ error: safeText(error?.message, 350) }, '[TIKTOK] metadata resolve failed');
          return reply(`TikTok tidak berhasil diproses. ${publicError(error?.message || error)}`);
        }
      }

      try {
        const { result, items } = await scraper.fetchAndDownload(url, { audioOnly: action === 'audio' });
        await reply(formatTikTokMetadata(result));
        if (action === 'audio') {
          const item = items[0];
          await sendMedia('audio', item.buffer, { mimetype: item.mimetype || 'audio/mpeg', ptt: false });
          return reply('Audio TikTok berhasil dikirim.');
        }
        await sendDownloadedMedia(sendMedia, items, reply);
      } catch (error) {
        logger.warn?.({ error: safeText(error?.message, 350) }, `[TIKTOK] ${action} failed`);
        return reply(`TikTok tidak berhasil diunduh. ${publicError(error?.message || error)}`);
      }
    }
  }]
};

export { HELP as TIKTOK_HELP, statusText as formatTikTokStatus, parseAction as parseTikTokAction };
