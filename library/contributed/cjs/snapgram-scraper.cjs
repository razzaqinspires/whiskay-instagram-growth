/**
 * Snapgram.io Instagram Scraper with Turnstile Captcha Solver & UA Customization
 * Engine: Node.js (v18+ native fetch & node:crypto / zero external dependencies)
 */

const fs = require('node:fs');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { Readable } = require('node:stream');

// Target Site & API Endpoints
const SITE_URL = 'https://www.snapgram.io/';
const API_BASE = 'https://api.sssgram.com';
const SOLVER_ENDPOINT = 'https://insartis.insjay.biz.id/v1/solve';

// Snapgram Configuration
const TURNSTILE_SITEKEY = '0x4AAAAAAFIiskADhxSmiNXx';
const TURNSTILE_ACTION = 'media_download';
const DEFAULT_API_KEY = 'ins_live_nGUjfvYRKPbjnPWDr6LOrkcCgF-5p-RjhpikpHud';

// Snapgram Public RSA Key for X-Secure-Message handshake
const RSA_PUBLIC_KEY =
  '-----BEGIN PUBLIC KEY-----\n' +
  'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDCAdf/EyIbLBxjGqmh7qLU6/CP\n' +
  'Czru+75+82OSPZ+nf4BFvg88drpZ6KigNW0J8TNgxe6Yms1irCZNVDyu+RXsl4y/\n' +
  '7c2KOHc4OGTzHB5fUMiMasFUvcEs2P70e6yA/sKHZfBLG1XPhlb84Ibs3nhD3W5e\n' +
  '2SuC+4EuVkaqzN08LQIDAQAB\n' +
  '-----END PUBLIC KEY-----';

// Preset User-Agents
const USER_AGENTS = {
  android:
    'Mozilla/5.0 (Linux; Android 12; CPH2043) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
  desktop:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  macos:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  ios:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
};

const DEFAULT_USER_AGENT = USER_AGENTS.android;

/**
 * Derives Client Hints headers (sec-ch-ua, sec-ch-ua-mobile, sec-ch-ua-platform)
 * matching the provided User-Agent string.
 * @param {string} ua
 * @returns {Record<string, string>}
 */
function getClientHints(ua = DEFAULT_USER_AGENT) {
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const hints = {
    'sec-ch-ua-mobile': isMobile ? '?1' : '?0'
  };

  if (/Android/i.test(ua)) {
    hints['sec-ch-ua-platform'] = '"Android"';
    const match = ua.match(/Chrome\/(\d+)/i);
    const ver = match ? match[1] : '112';
    hints['sec-ch-ua'] = `"Not:A-Brand";v="99", "Chromium";v="${ver}"`;
  } else if (/Windows/i.test(ua)) {
    hints['sec-ch-ua-platform'] = '"Windows"';
    const match = ua.match(/Chrome\/(\d+)/i);
    const ver = match ? match[1] : '130';
    hints['sec-ch-ua'] = `"Chromium";v="${ver}", "Google Chrome";v="${ver}", "Not?A_Brand";v="99"`;
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    hints['sec-ch-ua-platform'] = '"macOS"';
    if (/Chrome/i.test(ua)) {
      const match = ua.match(/Chrome\/(\d+)/i);
      const ver = match ? match[1] : '130';
      hints['sec-ch-ua'] = `"Chromium";v="${ver}", "Google Chrome";v="${ver}", "Not?A_Brand";v="99"`;
    }
  } else if (/Linux/i.test(ua)) {
    hints['sec-ch-ua-platform'] = '"Linux"';
    const match = ua.match(/Chrome\/(\d+)/i);
    const ver = match ? match[1] : '130';
    hints['sec-ch-ua'] = `"Chromium";v="${ver}", "Google Chrome";v="${ver}", "Not?A_Brand";v="99"`;
  }

  return hints;
}

/**
 * Encrypts current timestamp using RSA PKCS#1 v1.5 padding
 * @param {number|string} timestamp
 * @returns {string} Base64 encoded signature
 */
function encryptSecureMessage(timestamp) {
  return crypto.publicEncrypt(
    {
      key: RSA_PUBLIC_KEY,
      padding: crypto.constants.RSA_PKCS1_PADDING
    },
    Buffer.from(String(timestamp), 'utf8')
  ).toString('base64');
}

/**
 * Generates Snapgram compliant session ID
 * @param {number} timestamp
 * @returns {string}
 */
function generateSessionID(timestamp) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let rand = '';
  for (let i = 0; i < 10; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `common_${rand}_${timestamp}`;
}

/**
 * Solves Cloudflare Turnstile token via insartis API
 * @param {string} [apiKey]
 * @param {object} [options]
 * @param {string} [options.userAgent]
 * @param {string} [options.sitekey]
 * @param {string} [options.siteUrl]
 * @param {string} [options.action]
 * @returns {Promise<string>} Turnstile token
 */
async function solveTurnstile(apiKey = DEFAULT_API_KEY, options = {}) {
  const params = new URLSearchParams({
    gate: 'turnstile',
    sitekey: options.sitekey || TURNSTILE_SITEKEY,
    url: options.siteUrl || SITE_URL,
    action: options.action || TURNSTILE_ACTION
  });

  const ua = options.userAgent || DEFAULT_USER_AGENT;

  const res = await fetch(SOLVER_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': ua
    },
    body: params.toString()
  });

  if (!res.ok) {
    throw new Error(`Solver service returned HTTP ${res.status}: ${res.statusText}`);
  }

  const json = await res.json();
  const token = json.token || json.result || json.data?.token || json.data?.result;

  if (!token) {
    throw new Error(json.message || 'Turnstile solver returned empty token.');
  }

  return token;
}

/**
 * Formats media URL (handles token routes or raw CDN paths)
 * @param {string} uri
 * @returns {string}
 */
function resolveMediaUrl(uri) {
  if (!uri) return '';
  if (/^https?:\/\//i.test(uri)) return uri;
  return `${API_BASE}/st-tik/token/${uri}`;
}

/**
 * Scrapes Instagram media from snapgram.io using Turnstile solver
 * @param {string} instagramUrl - Instagram post, reel, story, or profile link
 * @param {object} [options]
 * @param {string} [options.apiKey] - Solver API key
 * @param {string} [options.userAgent] - Custom User-Agent string
 * @param {string} [options.preset] - 'android' | 'desktop' | 'macos' | 'ios'
 * @param {number} [options.maxRetries=3]
 * @returns {Promise<{
 *   success: boolean,
 *   type: 'media' | 'profile',
 *   media: Array<{
 *     id: string,
 *     type: 'video' | 'image',
 *     caption: string,
 *     thumbnail: string,
 *     downloadUrl: string,
 *     proxyUrl: string
 *   }>,
 *   raw: object
 * }>}
 */
async function scrapeSnapgram(instagramUrl, options = {}) {
  if (!instagramUrl || typeof instagramUrl !== 'string') {
    throw new Error('A valid Instagram URL must be provided.');
  }

  const cleanUrl = instagramUrl.trim();
  const apiKey = options.apiKey || DEFAULT_API_KEY;
  const maxRetries = options.maxRetries || 3;

  const ua =
    options.userAgent ||
    (options.preset && USER_AGENTS[options.preset.toLowerCase()]) ||
    DEFAULT_USER_AGENT;
  const clientHints = getClientHints(ua);

  const isProfile = !/instagram\.com\/(p|tv|reel(s?)|stories|s)\//i.test(cleanUrl);
  const endpoint = isProfile
    ? `${API_BASE}/st-tik/ins/dlprofile`
    : `${API_BASE}/st-tik/ins/dl`;

  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const captchaToken = await solveTurnstile(apiKey, { userAgent: ua });

      const now = Date.now();
      const secureMessage = encryptSecureMessage(now);
      const sessionId = generateSessionID(now);

      const queryParams = new URLSearchParams({
        url: cleanUrl,
        sessionid: sessionId,
        hostname: 'www.snapgram.io'
      });

      const res = await fetch(`${endpoint}?${queryParams.toString()}`, {
        method: 'GET',
        headers: {
          'User-Agent': ua,
          'Accept': 'application/json, text/plain, */*',
          'Origin': 'https://www.snapgram.io',
          'Referer': 'https://www.snapgram.io/',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'cross-site',
          ...clientHints,
          'X-Secure-Message': secureMessage,
          's-time': String(now),
          'CF-Turnstile-Token': captchaToken
        }
      });

      if (!res.ok) {
        throw new Error(`Snapgram API returned HTTP ${res.status}`);
      }

      const payload = await res.json();

      if (payload.code === 400 && String(payload.msg).toLowerCase().includes('turnstile')) {
        lastError = new Error(`Attempt ${attempt}: Turnstile token rejected by upstream.`);
        continue;
      }

      if (payload.code !== 200 || !payload.result) {
        throw new Error(payload.msg || 'Snapgram API request failed.');
      }

      const result = payload.result;
      const mediaList = [];

      if (Array.isArray(result.insBos)) {
        for (const item of result.insBos) {
          const directCdn = item.originalUrl || item.originalThumb || '';
          const proxyUrl = resolveMediaUrl(item.url || item.sourceUri);
          const thumbUrl = item.originalCover || item.originalThumb || resolveMediaUrl(item.cover || item.thumbnail || item.thumb);

          mediaList.push({
            id: item.id || item.pk || '',
            type: item.type === 'mp4' || item.videoUrl || item.isVideo ? 'video' : 'image',
            caption: item.desc || '',
            thumbnail: thumbUrl,
            downloadUrl: directCdn || proxyUrl,
            proxyUrl
          });
        }
      }

      return {
        success: true,
        type: isProfile ? 'profile' : 'media',
        media: mediaList,
        raw: result
      };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Failed to scrape media after retries.');
}

/**
 * Downloads a resolved media file to disk.
 * @param {string} mediaUrl
 * @param {string} outputPath
 * @param {object} [options]
 * @param {string} [options.userAgent]
 */
async function downloadMedia(mediaUrl, outputPath, options = {}) {
  const ua = options.userAgent || DEFAULT_USER_AGENT;
  const clientHints = getClientHints(ua);

  const res = await fetch(mediaUrl, {
    headers: {
      'User-Agent': ua,
      'Referer': 'https://www.snapgram.io/',
      ...clientHints
    }
  });

  if (!res.ok) {
    throw new Error(`Media download failed with HTTP ${res.status}`);
  }

  const destination = fs.createWriteStream(outputPath);
  await pipeline(Readable.fromWeb(res.body), destination);
  return outputPath;
}

module.exports = {
  scrapeSnapgram,
  solveTurnstile,
  encryptSecureMessage,
  generateSessionID,
  downloadMedia,
  getClientHints,
  USER_AGENTS,
  DEFAULT_USER_AGENT
};

// CLI Execution
if (require.main === module) {
  let target = null;
  let shouldSave = false;
  let selectedUA = DEFAULT_USER_AGENT;

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--save') {
      shouldSave = true;
    } else if ((arg === '--user-agent' || arg === '-u') && process.argv[i + 1]) {
      selectedUA = process.argv[++i];
    } else if ((arg === '--preset' || arg === '-p') && process.argv[i + 1]) {
      const presetKey = process.argv[++i].toLowerCase();
      selectedUA = USER_AGENTS[presetKey] || DEFAULT_USER_AGENT;
    } else if (!arg.startsWith('-') && !target) {
      target = arg;
    }
  }

  if (!target) {
    console.error('Usage: node snapgram_scraper.js <instagram-url> [--preset android|desktop|macos|ios] [--user-agent "<ua>"] [--save]');
    process.exit(1);
  }

  (async () => {
    try {
      console.log(`[+] Target: ${target}`);
      console.log(`[+] User-Agent: ${selectedUA}`);
      console.log('[+] Solving Turnstile & scraping Snapgram...');
      const info = await scrapeSnapgram(target, { userAgent: selectedUA });
      console.log(JSON.stringify(info, null, 2));

      if (shouldSave && info.media.length > 0) {
        const item = info.media[0];
        const ext = item.type === 'video' ? 'mp4' : 'jpg';
        const outName = `snapgram_${item.id || Date.now()}.${ext}`;

        console.log(`[+] Downloading first media item to: ${outName}`);
        await downloadMedia(item.downloadUrl, outName, { userAgent: selectedUA });
        console.log('[+] Saved successfully.');
      }
    } catch (err) {
      console.error(`[-] Error: ${err.message}`);
      process.exit(1);
    }
  })();
}
