/**
 * iGram.world Instagram Media Scraper & Downloader
 * Integrated Cloudflare Turnstile Solver & Request Signing Engine
 * Runtime: Node.js (v18+ native fetch, node:vm, node:crypto / zero external npm packages)
 */

const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { Readable } = require('node:stream');

// Core Targets & Endpoints
const SITE_URL = 'https://igram.world/';
const MSEC_ENDPOINT = 'https://igram.world/msec';
const CHUNK_LINK_URL = 'https://igram.world/js/link.chunk.js?ch=a6c7861ca8434a41.js';
const API_BASE = 'https://api-wh.igram.world';
const MEDIA_BASE = 'https://media.igram.world';

// Cloudflare Turnstile Defaults
const DEFAULT_SITEKEY = '0x4AAAAAABidZPD0BFP2LVxa';
const SOLVER_ENDPOINT = 'https://insartis.insjay.biz.id/v1/solve';
const DEFAULT_API_KEY = 'ins_live_nGUjfvYRKPbjnPWDr6LOrkcCgF-5p-RjhpikpHud';

// Preset User-Agents
const USER_AGENTS = {
  desktop:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  android:
    'Mozilla/5.0 (Linux; Android 12; CPH2043) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
  macos:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  ios:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
};

const DEFAULT_USER_AGENT = USER_AGENTS.desktop;

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
 * Solves Cloudflare Turnstile token via insartis solver API
 * @param {string} [siteKey]
 * @param {object} [options]
 * @param {string} [options.apiKey]
 * @param {string} [options.siteUrl]
 * @returns {Promise<string>} Turnstile token
 */
async function solveTurnstile(siteKey = DEFAULT_SITEKEY, options = {}) {
  const apiKey = options.apiKey || DEFAULT_API_KEY;
  const siteUrl = options.siteUrl || SITE_URL;

  const form = new URLSearchParams({
    gate: 'turnstile',
    sitekey: siteKey,
    url: siteUrl
  });

  const res = await fetch(SOLVER_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form.toString()
  });

  if (!res.ok) {
    throw new Error(`Turnstile solver failed with HTTP ${res.status}`);
  }

  const data = await res.json();
  const token = data.token || data.result || (data.data && (data.data.token || data.data.result));
  if (!token) {
    throw new Error('Failed to extract token from solver response: ' + JSON.stringify(data));
  }

  return token;
}

/**
 * Validates Turnstile token against iGram Worker Hub to receive authorized wh-cf-token
 * @param {string} cfToken
 * @param {object} [options]
 * @returns {Promise<string>} wh-cf-token
 */
async function validateCfToken(cfToken, options = {}) {
  const userAgent = options.userAgent || DEFAULT_USER_AGENT;

  const form = new URLSearchParams({ cfToken });
  const res = await fetch(`${API_BASE}/api/cf`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent,
      'Origin': 'https://igram.world',
      'Referer': 'https://igram.world/'
    },
    body: form.toString()
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`wh-cf-token validation failed with HTTP ${res.status}: ${errText}`);
  }

  const data = await res.json();
  if (!data || !data.result) {
    throw new Error('Invalid response from /api/cf: ' + JSON.stringify(data));
  }

  return data.result;
}

let cachedSignFn = null;

/**
 * Initializes the VM-isolated request body signer extracted from link.chunk.js
 * @param {object} [options]
 * @returns {Promise<Function>}
 */
async function getSigner(options = {}) {
  if (cachedSignFn) return cachedSignFn;

  const userAgent = options.userAgent || DEFAULT_USER_AGENT;
  const chunkRes = await fetch(CHUNK_LINK_URL, {
    headers: {
      'User-Agent': userAgent,
      'Referer': SITE_URL
    }
  });

  if (!chunkRes.ok) {
    throw new Error(`Failed to download link.chunk.js: HTTP ${chunkRes.status}`);
  }

  const chunkCode = await chunkRes.text();

  const sandbox = {
    document: {
      createElement: (tag) => ({
        tagName: tag.toUpperCase(),
        style: {},
        setAttribute: () => {},
        getAttribute: () => null,
        appendChild: () => {}
      }),
      head: { appendChild: () => {} },
      body: { appendChild: () => {} },
      addEventListener: () => {},
      removeEventListener: () => {}
    },
    navigator: {
      userAgent: userAgent,
      platform: 'Win32',
      languages: ['en-US', 'en'],
      language: 'en-US',
      hardwareConcurrency: 8,
      deviceMemory: 8
    },
    location: {
      href: SITE_URL,
      origin: 'https://igram.world',
      hostname: 'igram.world',
      host: 'igram.world',
      protocol: 'https:',
      port: '',
      pathname: '/'
    },
    fetch: async (resource, opt = {}) => {
      const fetchUrl = resource.startsWith('http') ? resource : `https://igram.world${resource}`;
      const r = await fetch(fetchUrl, {
        ...opt,
        headers: {
          'User-Agent': userAgent,
          'Referer': SITE_URL,
          ...(opt.headers || {})
        }
      });
      return {
        ok: r.ok,
        status: r.status,
        json: async () => r.json(),
        text: async () => r.text()
      };
    },
    crypto: {
      subtle: crypto.webcrypto.subtle,
      getRandomValues: (arr) => crypto.webcrypto.getRandomValues(arr)
    },
    TextEncoder: TextEncoder,
    TextDecoder: TextDecoder,
    AbortController: AbortController,
    console: { log: () => {}, warn: () => {}, error: () => {} },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: () => {},
    clearInterval: () => {},
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    Date: Date,
    Math: Math,
    performance: performance
  };

  sandbox.self = sandbox;
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  sandbox.top = sandbox;
  sandbox.window.top = sandbox;
  sandbox.window.location = sandbox.location;
  sandbox.webpackChunk = [];

  const context = vm.createContext(sandbox);
  vm.runInContext('this.top = this; this.self = this; this.window = this; this.global = this;', context);
  vm.runInContext(chunkCode, context);

  const chunkModules = sandbox.webpackChunk[0][1];
  const installedModules = {};

  function webpackRequire(moduleId) {
    if (installedModules[moduleId]) return installedModules[moduleId].exports;
    const module = (installedModules[moduleId] = { exports: {} });

    // Environment sanity mock (module 3298 evaluateEnvironment)
    if (moduleId === 3298 || moduleId === '3298') {
      module.exports = {
        evaluateEnvironment: () => ({
          hardFail: false,
          hardReasons: [],
          score: 0,
          flags: 0,
          signals: { languages: ['en-US', 'en'] }
        })
      };
      return module.exports;
    }

    chunkModules[moduleId](<module, module.exports, webpackRequire>);
    return module.exports;
  }

  webpackRequire.r = (exp) => Object.defineProperty(exp, '__esModule', { value: true });
  webpackRequire.d = (exp, def) => {
    for (const k in def) {
      if (webpackRequire.o(def, k) && !webpackRequire.o(exp, k)) {
        Object.defineProperty(exp, k, { enumerable: true, get: def[k] });
      }
    }
  };
  webpackRequire.o = (obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop);

  const signExports = webpackRequire(7027);
  cachedSignFn = await signExports.default;
  return cachedSignFn;
}

/**
 * Classifies an Instagram query into type and target
 * @param {string} inputUrl
 * @returns {{ queryType: string, target: string, username?: string }}
 */
function parseInstagramQuery(inputUrl) {
  const trimmed = inputUrl.trim();

  // Username directly: e.g. "instagram" or "@instagram"
  const cleanUsername = trimmed.replace(/^@/, '');
  if (/^[\w](?!.*?\.{2})[\w.]{0,28}[\w]?$/i.test(cleanUsername)) {
    return { queryType: 'username', target: cleanUsername, username: cleanUsername };
  }

  // Profile URL: https://www.instagram.com/instagram/
  const profileMatch = trimmed.match(
    /(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am)\/([A-Za-z0-9-_.]+)\/?(?:reels|tagged)?\/?(?:\?.*)?$/i
  );
  if (profileMatch && !['p', 'reel', 'reels', 'tv', 'stories', 'explore'].includes(profileMatch[1].toLowerCase())) {
    return { queryType: 'username', target: profileMatch[1], username: profileMatch[1] };
  }

  // Story URL: https://www.instagram.com/stories/username/123456/
  if (/(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am)\/stories\/([A-Za-z0-9-_.]+)/i.test(trimmed)) {
    return { queryType: 'story', target: trimmed };
  }

  // Reels: https://www.instagram.com/reel/DCeX783SgU3/
  if (/(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am)\/(?:reel|reels)\/([A-Za-z0-9-_.]+)/i.test(trimmed)) {
    return { queryType: 'reel', target: trimmed };
  }

  // Posts: https://www.instagram.com/p/DFzL1r4N4s7/ or /tv/
  if (/(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am)\/(?:p|tv)\/([A-Za-z0-9-_.]+)/i.test(trimmed)) {
    return { queryType: 'post', target: trimmed };
  }

  return { queryType: 'convert', target: trimmed };
}

/**
 * Wraps raw CDN links with signed media.igram.world proxy URLs
 * @param {string} rawUri
 * @param {string} [filename]
 * @returns {string}
 */
function wrapMediaUrl(rawUri, filename = '') {
  if (!rawUri) return '';
  if (rawUri.includes('__sig=')) return rawUri;
  const encodedUri = encodeURIComponent(rawUri);
  const filePart = filename ? `&filename=${encodeURIComponent(filename)}` : '';
  return `${MEDIA_BASE}/get?uri=${encodedUri}${filePart}&referer=https%3A%2F%2Fwww.instagram.com%2F`;
}

/**
 * Adapts raw convert/media response from worker hub into normalized structure
 * @param {any} data
 * @returns {Array<object>}
 */
function adaptMediaResponse(data) {
  if (!data) return [];
  const list = Array.isArray(data) ? data : [data];

  return list.map((item, idx) => {
    const urls = item.url || [];
    const videoObj = urls.find((u) => /mp4|video/i.test(u.type || u.ext || u.name || ''));
    const imageObj = urls.find((u) => /jpeg|jpg|image/i.test(u.type || u.ext || u.name || ''));
    const audioObj = urls.find((u) => /mp3|audio/i.test(u.type || u.ext || u.name || ''));

    const directVideoUrl = videoObj ? videoObj.url : null;
    const directImageUrl = imageObj ? imageObj.url : (item.thumb || null);
    const directAudioUrl = audioObj ? audioObj.url : null;

    const mediaType = directVideoUrl ? 'video' : 'image';
    const primaryUrl = directVideoUrl || directImageUrl;

    return {
      id: item.id || `media_${idx + 1}`,
      type: mediaType,
      quality: item.video_quality || item.quality || 'HD',
      thumbnail: item.thumb || directImageUrl || '',
      downloadUrl: primaryUrl ? wrapMediaUrl(primaryUrl, `igram_${idx + 1}.${mediaType === 'video' ? 'mp4' : 'jpg'}`) : '',
      directUrl: primaryUrl || '',
      videoUrl: directVideoUrl ? wrapMediaUrl(directVideoUrl, `igram_${idx + 1}.mp4`) : null,
      imageUrl: directImageUrl ? wrapMediaUrl(directImageUrl, `igram_${idx + 1}.jpg`) : null,
      audioUrl: directAudioUrl ? wrapMediaUrl(directAudioUrl, `igram_${idx + 1}.mp3`) : null,
      duration: item.meta?.duration || null,
      caption: item.meta?.title || item.caption || '',
      author: item.meta?.author?.unique_id ? `@${item.meta.author.unique_id}` : null,
      timestamp: item.timestamp ? new Date(item.timestamp * 1000).toISOString() : null
    };
  });
}

/**
 * Scrapes Instagram media or user profile via iGram.world
 * Automatically fulfills Cloudflare Turnstile when challenged
 * @param {string} instagramUrl
 * @param {object} [options]
 * @param {string} [options.userAgent]
 * @param {string} [options.apiKey]
 * @param {string} [options.whCfToken]
 * @returns {Promise<object>}
 */
async function scrapeIgram(instagramUrl, options = {}) {
  const userAgent = options.userAgent || DEFAULT_USER_AGENT;
  const clientHints = getClientHints(userAgent);
  const parsed = parseInstagramQuery(instagramUrl);
  const signer = await getSigner({ userAgent });

  let whCfToken = options.whCfToken || null;

  async function ensureTurnstile(siteKey = DEFAULT_SITEKEY) {
    if (!whCfToken) {
      const turnstileToken = await solveTurnstile(siteKey, { apiKey: options.apiKey });
      whCfToken = await validateCfToken(turnstileToken, { userAgent });
    }
    return whCfToken;
  }

  // Handle User Profile / Avatar requests
  if (parsed.queryType === 'username') {
    await ensureTurnstile();
    const signedBody = await signer({ username: parsed.username });

    const userRes = await fetch(`${API_BASE}/api/v2/instagram/userInfo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': userAgent,
        'Origin': 'https://igram.world',
        'Referer': SITE_URL,
        'wh-cf-token': whCfToken,
        ...clientHints
      },
      body: JSON.stringify(signedBody)
    });

    if (userRes.status === 422) {
      const errJson = await userRes.json();
      const siteKey = errJson.challenge?.siteKey || DEFAULT_SITEKEY;
      whCfToken = null;
      await ensureTurnstile(siteKey);
      return scrapeIgram(instagramUrl, { ...options, whCfToken });
    }

    const userData = await userRes.json();
    if (!userData || !userData.result) {
      throw new Error('Failed to retrieve user information: ' + JSON.stringify(userData));
    }

    const u = userData.result;
    return {
      source: 'igram.world',
      type: 'user_profile',
      status: 'success',
      user: {
        userId: u.userId,
        username: u.username,
        fullName: u.fullName,
        biography: u.biography,
        isPrivate: u.isPrivate,
        isVerified: u.isVerified,
        postsCount: u.postsCount,
        followersCount: u.followersCount,
        followingCount: u.followingCount,
        avatar: {
          directUrl: u.avatarUrl,
          downloadUrl: u.avatarUrlDownloadable || wrapMediaUrl(u.avatarUrl, `${u.username}_avatar.jpg`),
          previewUrl: u.avatarUrlWrapped || u.avatarUrl
        }
      }
    };
  }

  // Handle Media Posts / Reels / Stories
  const endpoint = parsed.queryType === 'story'
    ? `${API_BASE}/api/v2/instagram/story`
    : `${API_BASE}/api/convert`;

  const requestPayload = parsed.queryType === 'story'
    ? { url: parsed.target }
    : { target_url: parsed.target };

  let signedBody = await signer(requestPayload);

  let headers = {
    'Content-Type': 'application/json',
    'User-Agent': userAgent,
    'Origin': 'https://igram.world',
    'Referer': SITE_URL,
    ...clientHints
  };
  if (whCfToken) {
    headers['wh-cf-token'] = whCfToken;
  }

  let res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(signedBody)
  });

  // Handle Turnstile challenge (HTTP 422 with CAPTCHA_REQUIRED)
  if (res.status === 422) {
    const challengeData = await res.json();
    const siteKey = challengeData.challenge?.siteKey || DEFAULT_SITEKEY;

    whCfToken = null;
    await ensureTurnstile(siteKey);

    // Regenerate fresh signature with valid timestamp
    signedBody = await signer(requestPayload);

    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        ...headers,
        'wh-cf-token': whCfToken
      },
      body: JSON.stringify(signedBody)
    });
  }

  const resText = await res.text();
  let resultJson;
  try {
    resultJson = JSON.parse(resText);
  } catch {
    throw new Error(`iGram returned non-JSON response (HTTP ${res.status}): ${resText.slice(0, 200)}`);
  }

  if (resultJson.success === false) {
    return {
      source: 'igram.world',
      type: parsed.queryType,
      status: 'error',
      responseCode: resultJson.response,
      responseType: resultJson.response_type,
      message: resultJson.message || 'Media not found or link expired.'
    };
  }

  const rawMedia = resultJson.result || resultJson.data || resultJson;
  const mediaList = adaptMediaResponse(rawMedia);

  return {
    source: 'igram.world',
    type: parsed.queryType,
    status: 'success',
    target: parsed.target,
    count: mediaList.length,
    media: mediaList
  };
}

/**
 * Downloads media from remote URL directly to disk
 * @param {string} mediaUrl
 * @param {string} outputPath
 * @param {object} [options]
 * @returns {Promise<string>} outputPath
 */
async function downloadMedia(mediaUrl, outputPath, options = {}) {
  const ua = options.userAgent || DEFAULT_USER_AGENT;
  const clientHints = getClientHints(ua);

  const res = await fetch(mediaUrl, {
    headers: {
      'User-Agent': ua,
      'Referer': SITE_URL,
      ...clientHints
    }
  });

  if (!res.ok) {
    throw new Error(`Download failed with HTTP ${res.status}`);
  }

  const dest = fs.createWriteStream(outputPath);
  await pipeline(Readable.fromWeb(res.body), dest);
  return outputPath;
}

module.exports = {
  scrapeIgram,
  solveTurnstile,
  validateCfToken,
  getSigner,
  parseInstagramQuery,
  downloadMedia,
  getClientHints,
  wrapMediaUrl,
  USER_AGENTS,
  DEFAULT_USER_AGENT,
  DEFAULT_SITEKEY
};

// CLI Execution Interface
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
    console.error('Usage: node igram_scraper.js <instagram-url-or-username> [--preset desktop|android|macos|ios] [--user-agent "<ua>"] [--save]');
    process.exit(1);
  }

  (async () => {
    try {
      console.log(`[+] Target: ${target}`);
      console.log(`[+] User-Agent: ${selectedUA}`);
      console.log('[+] Initializing Turnstile solver & request signing pipeline...');
      const info = await scrapeIgram(target, { userAgent: selectedUA });
      console.log(JSON.stringify(info, null, 2));

      if (shouldSave) {
        if (info.type === 'user_profile' && info.user?.avatar?.downloadUrl) {
          const outName = `igram_${info.user.username}_avatar.jpg`;
          console.log(`[+] Saving avatar to: ${outName}`);
          await downloadMedia(info.user.avatar.downloadUrl, outName, { userAgent: selectedUA });
          console.log('[+] Saved successfully.');
        } else if (info.media && info.media.length > 0) {
          const item = info.media[0];
          const ext = item.type === 'video' ? 'mp4' : 'jpg';
          const outName = `igram_${item.id || Date.now()}.${ext}`;
          console.log(`[+] Saving media to: ${outName}`);
          await downloadMedia(item.downloadUrl || item.directUrl, outName, { userAgent: selectedUA });
          console.log('[+] Saved successfully.');
        }
      }
    } catch (err) {
      console.error(`[-] Error: ${err.message}`);
      process.exit(1);
    }
  })();
}