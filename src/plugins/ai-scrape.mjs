import { commandActionId } from '../lib/native-flow.mjs';
import { createIrfanScrapeAdapter } from '../ai/irfan-scrape-adapter.mjs';

const HELP = [
  '━━ WHISKAY · AI SCRAPE GATEWAY ━━',
  '.aiscrape help — panduan dan batas',
  '.aiscrape info — privasi dan cara kerja adapter',
  '.aiscrape status — konfigurasi endpoint tanpa melakukan request',
  '.aiscrape run CONFIRM <url> | <prompt> — kirim URL dan prompt ke gateway yang kamu konfigurasi',
  '',
  'Satu URL per permintaan. Prompt maksimal 5.000 karakter; hasil dibatasi 8.000 karakter.',
  'Setiap run mengirim URL dan prompt ke endpoint eksternal yang kamu konfigurasi. Pastikan endpoint dan kebijakan datanya sudah kamu audit.',
  'Kata CONFIRM wajib karena request dapat memakai kuota atau menimbulkan biaya pada provider.',
  'WHISKAY tidak memasang irfan-cpp dan tidak meneruskan voucher, token_router, atau light_house dari snippet yang belum terverifikasi.'
].join('\n');

const COOLDOWN_MS = 30_000;
const MAX_CHAT_RESULT = 3_500;

function clean(value, max = 240) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function parseRunRequest(rawArgs) {
  const match = String(rawArgs || '').trim().match(/^run\s+CONFIRM\s+(https?:\/\/[^\s|]+)\s*\|\s*([\s\S]+)$/i);
  if (!match) return null;
  return { url: match[1].trim(), prompt: match[2].trim() };
}

function publicFailure(error) {
  const messages = {
    DISABLED: 'Gateway belum diaktifkan oleh owner.',
    NOT_CONFIGURED: 'Konfigurasi gateway belum lengkap.',
    CONFIG_INVALID: 'Konfigurasi gateway tidak valid. Periksa environment lokal.',
    INPUT_INVALID: 'URL atau prompt tidak memenuhi validasi.',
    INPUT_BLOCKED: 'URL target diblokir karena host tidak dapat dipastikan publik.',
    TIMEOUT: 'Gateway melewati batas waktu.',
    AUTH_FAILED: 'Gateway menolak autentikasi. Periksa token lokal.',
    RATE_LIMITED: 'Gateway menerapkan rate limit; tunggu sebelum mencoba lagi.',
    RESPONSE_TOO_LARGE: 'Respons gateway melebihi batas ukuran.',
    RESPONSE_INVALID: 'Format respons gateway tidak valid.',
    EMPTY_RESULT: 'Gateway tidak mengembalikan hasil teks.'
  };
  return messages[error?.code] || `Gateway gagal memproses permintaan (${clean(error?.code || 'UNKNOWN', 50)}).`;
}

function formatStatus(status) {
  return [
    '━━ IRFAN SCRAPE GATEWAY STATUS ━━',
    `Aktif: ${status.enabled ? 'ya' : 'tidak'}`,
    `Konfigurasi lengkap: ${status.configured ? 'ya' : 'tidak'}`,
    `Endpoint host: ${status.endpointHost || '-'}`,
    `Timeout: ${status.timeoutMs || '-'} ms`,
    `Model alias: ${status.model || '-'}`,
    `Thinking: ${status.thinking || '-'}`,
    `Fast mode: ${status.useFast === undefined ? '-' : status.useFast ? 'on' : 'off'}`,
    status.missing?.length ? `Belum diatur: ${status.missing.join(', ')}` : '',
    status.error ? `Konfigurasi: ${clean(status.error, 300)}` : '',
    'Status ini hanya membaca konfigurasi lokal; tidak menghubungi provider.'
  ].filter(Boolean).join('\n');
}

export function createAiScrapePlugin({ adapterFactory = () => createIrfanScrapeAdapter(), now = () => Date.now() } = {}) {
  const lastRunByChat = new Map();
  return {
    name: 'ai-scrape-gateway',
    commands: [{
      name: 'aiscrape',
      aliases: ['irfanscrape', 'scrapeai'],
      category: 'External AI Tools',
      usage: 'help|info|status|run CONFIRM <url> | <prompt>',
      description: 'Kirim satu URL dan prompt ke gateway AI eksternal yang dikonfigurasi owner',
      async execute({ args = [], rawArgs = '', reply, sendInteractive, key, sock, logger = console }) {
        const action = String(args[0] || 'help').toLowerCase();
        const adapter = adapterFactory();

        if (action === 'help' || action === '-h' || action === '--help') {
          if (typeof sendInteractive === 'function') {
            return sendInteractive({
              title: 'WHISKAY · AI SCRAPE',
              body: HELP,
              footer: 'Owner-only · Explicit CONFIRM · One URL per request',
              buttons: [{ type: 'single_select', title: 'AI scrape actions', sections: [{ title: 'Gateway', rows: [
                { title: 'Status gateway', description: 'Baca konfigurasi lokal, tanpa request keluar', id: commandActionId('.aiscrape status') },
                { title: 'Info & privasi', description: 'Lihat data yang dikirim dan batas keamanan', id: commandActionId('.aiscrape info') },
                { title: 'Bantuan', description: 'Format perintah dan aturan CONFIRM', id: commandActionId('.aiscrape help') }
              ] }] }]
            });
          }
          return reply(HELP);
        }

        if (action === 'info') {
          return reply([
            '━━ AI SCRAPE · PRIVACY & SECURITY ━━',
            'WHISKAY hanya mengirim URL dan prompt yang dimasukkan secara eksplisit pada command run.',
            'Bearer token hanya dikirim ke endpoint HTTPS yang host-nya cocok persis dengan IRFAN_SCRAPE_ALLOWED_HOSTS.',
            'Redirect endpoint ditolak. Respons dibatasi 512 KiB dan timeout maksimal 90 detik.',
            'Host target lokal/private/reserved ditolak sebelum request.',
            'Tidak ada session WhatsApp/Instagram, isi chat lain, cookie, voucher, token_router, atau light_house yang dikirim.',
            'Penyimpanan, logging, dan penghapusan data di sisi gateway berada di luar kendali WHISKAY; audit kebijakan gateway sebelum mengaktifkan.',
            'Paket npm irfan-cpp belum diverifikasi dan tidak dipasang sebagai dependency.'
          ].join('\n'));
        }

        if (action === 'status') return reply(formatStatus(adapter.getStatus()));

        if (action !== 'run') return reply('Format: .aiscrape help | info | status | run CONFIRM <url> | <prompt>');
        const localStatus = adapter.getStatus();
        if (!localStatus.enabled) return reply('AI scrape gateway nonaktif. Aktifkan IRFAN_SCRAPE_ENABLED=true hanya setelah endpoint diaudit.');
        if (!localStatus.configured) return reply(`Konfigurasi AI scrape belum lengkap: ${(localStatus.missing || []).join(', ') || localStatus.error || 'periksa environment lokal'}.`);
        const request = parseRunRequest(rawArgs);
        if (!request) {
          return reply('Format: .aiscrape run CONFIRM https://example.com/page | Ringkas isi halaman dan sebutkan poin utamanya.\nCONFIRM wajib karena URL dan prompt dikirim ke gateway eksternal.');
        }
        const destination = String(key?.remoteJid || 'unknown');
        const sender = String(key?.participant || sock?.user?.id || 'owner');
        const cooldownKey = `${sender}|${destination}`;
        const current = now();
        const lastRun = lastRunByChat.get(cooldownKey) || 0;
        if (current - lastRun < COOLDOWN_MS) {
          const wait = Math.ceil((COOLDOWN_MS - (current - lastRun)) / 1000);
          return reply(`AI scraper cooldown aktif. Coba lagi dalam ${wait} detik.`);
        }
        lastRunByChat.set(cooldownKey, current);
        if (lastRunByChat.size > 2_000) {
          for (const [entry, timestamp] of lastRunByChat) if (current - timestamp > COOLDOWN_MS * 2) lastRunByChat.delete(entry);
        }

        let targetOrigin = 'URL target';
        try { targetOrigin = new URL(request.url).origin; }
        catch { return reply('URL target tidak valid. Gunakan URL HTTPS publik.'); }
        await reply([
          'Permintaan AI scrape dikirim setelah CONFIRM.',
          `Target: ${clean(targetOrigin, 160)}`,
          `Panjang prompt: ${request.prompt.length} karakter (isi prompt tidak diulang di log).`,
          'Memproses satu URL. Tunggu respons provider.'
        ].join('\n'));
        try {
          const result = await adapter.scrape(request);
          const output = result.text.slice(0, MAX_CHAT_RESULT);
          const suffix = result.truncated || result.text.length > MAX_CHAT_RESULT ? '\n\n[Hasil dipotong oleh batas tampilan WHISKAY.]' : '';
          await reply(`━━ AI SCRAPE RESULT ━━\nModel alias: ${clean(result.model, 80)}\nHost: ${clean(result.endpointHost, 120)}\n\n${output}${suffix}`);
          return true;
        } catch (error) {
          lastRunByChat.delete(cooldownKey);
          logger.warn?.({ code: error?.code || 'UNKNOWN' }, '[AI SCRAPE] request failed');
          return reply(`AI scrape gagal: ${publicFailure(error)}\nPeriksa .aiscrape status dan konfigurasi lokal.`);
        }
      }
    }]
  };
}

export default createAiScrapePlugin();
