const TIKWM_API_URL = 'https://www.tikwm.com/api/';
const USER_AGENT = 'WHISKAY-TikTok-Downloader/1.0 (+https://whiskay.local)';
const MAX_URL_LENGTH = 2048;
const MAX_JSON_BYTES = 1024 * 1024;
const MAX_MEDIA_BYTES = 40 * 1024 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_MEDIA_ITEMS = 10;
const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_BODY_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 4;
const DEFAULT_MEDIA_HOSTS = Object.freeze([
  'tikwm.com',
  'tiktok.com',
  'tiktokcdn.com',
  'tiktokcdn-us.com',
  'tiktokcdn-eu.com',
  'tiktokv.com',
  'byteoversea.com',
  'ibyteimg.com',
  'ibytedtos.com',
  'muscdn.com'
]);
const SAFE_DOWNLOAD_HEADERS = new Set(['accept', 'accept-language', 'user-agent', 'referer', 'origin']);

const text = (value, max = 500) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const firstValue = (...values) => values.find(value => value !== undefined && value !== null && value !== '');
const asObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

function isPrivateHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':')) return true;
  return false;
}

function hostMatches(hostname, allowedHosts) {
  const host = String(hostname || '').toLowerCase().replace(/^www\./, '');
  return allowedHosts.some(allowed => host === allowed || host.endsWith(`.${allowed}`));
}

function normalizeHostList(value) {
  const entries = Array.isArray(value) ? value : String(value || '').split(/[;,\n]/);
  return [...new Set(entries.map(item => String(item || '').trim().toLowerCase().replace(/^\*\./, '')).filter(item => /^[a-z0-9.-]+$/.test(item) && !item.startsWith('.') && !item.endsWith('.') && !item.includes('..')))];
}

export function classifyTikTokUrl(value) {
  const parsed = new URL(value);
  const segments = parsed.pathname.split('/').filter(Boolean);
  const lower = segments.map(segment => segment.toLowerCase());
  if (lower.includes('story')) return 'story';
  if (lower.includes('photo')) return 'photo';
  if (lower.includes('video') || /\/t\//i.test(parsed.pathname)) return 'video';
  return 'post';
}

export function normalizeTikTokUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.length > MAX_URL_LENGTH) throw new TypeError('Link TikTok kosong atau terlalu panjang.');
  let parsed;
  try { parsed = new URL(raw); } catch { throw new TypeError('Link TikTok tidak valid. Sertakan URL lengkap HTTPS.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) {
    throw new TypeError('Link TikTok harus HTTPS tanpa kredensial atau port khusus.');
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const allowed = ['tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com', 'm.tiktok.com', 'v.tiktok.com'];
  if (!allowed.includes(host) && host !== 'tiktok.com') {
    throw new TypeError('Hanya URL TikTok yang didukung.');
  }
  if (isPrivateHost(host)) throw new TypeError('Host TikTok tidak valid.');
  if (!parsed.pathname || parsed.pathname === '/') throw new TypeError('URL harus menunjuk post, video, foto, atau story TikTok.');
  parsed.hash = '';
  return parsed.toString();
}

export function sanitizeDownloadHeaders(input = {}) {
  const output = {
    accept: '*/*',
    'user-agent': USER_AGENT,
    referer: 'https://www.tiktok.com/'
  };
  const source = asObject(input);
  for (const [rawName, rawValue] of Object.entries(source)) {
    const name = String(rawName).trim().toLowerCase();
    if (!SAFE_DOWNLOAD_HEADERS.has(name)) continue;
    const value = String(rawValue ?? '').trim();
    if (!value || value.length > 500 || /[\r\n\0]/.test(value)) continue;
    if (name === 'referer' || name === 'origin') {
      try {
        const parsed = new URL(value);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !hostMatches(parsed.hostname, ['tiktok.com'])) continue;
        output[name] = name === 'origin' ? parsed.origin : parsed.toString();
      } catch { continue; }
    } else {
      output[name] = value;
    }
  }
  return output;
}

function normalizeEndpointList(value) {
  const list = [...new Set(String(value || '').split(/[;,\n]/).map(item => item.trim()).filter(Boolean))].slice(0, 3);
  return list.map(item => {
    let parsed;
    try { parsed = new URL(item); } catch { throw new TypeError(`TIKTOK_SCRAPER_API_URLS berisi endpoint tidak valid: ${text(item, 100)}`); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash || isPrivateHost(parsed.hostname)) {
      throw new TypeError('Endpoint scraper TikTok harus HTTPS publik, tanpa kredensial, hash, atau IP privat.');
    }
    return parsed.toString();
  });
}

function normalizeMediaUrl(value, { provider = 'custom', allowedHosts = DEFAULT_MEDIA_HOSTS } = {}) {
  let raw = String(value || '').trim();
  if (!raw) throw new TypeError('Provider tidak memberikan URL media.');
  if (raw.startsWith('//')) raw = `https:${raw}`;
  if (raw.startsWith('/') && provider === 'tikwm') raw = new URL(raw, 'https://www.tikwm.com').toString();
  let parsed;
  try { parsed = new URL(raw); } catch { throw new TypeError('Provider mengembalikan URL media tidak valid.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || parsed.hash || isPrivateHost(parsed.hostname)) {
    throw new TypeError('URL media wajib HTTPS dan tidak boleh mengarah ke host privat.');
  }
  if (!hostMatches(parsed.hostname, allowedHosts)) {
    throw new Error(`Host media tidak diizinkan: ${parsed.hostname.toLowerCase()}`);
  }
  return parsed.toString();
}

function mediaTypeFrom(item, url) {
  const declared = text(item?.type || item?.mimeType || item?.mimetype || item?.mime || '').toLowerCase();
  if (declared.includes('image') || declared === 'photo' || declared === 'slide') return 'image';
  if (declared.includes('audio') || declared === 'music') return 'audio';
  if (declared.includes('video')) return 'video';
  const extension = new URL(url).pathname.toLowerCase().split('.').pop();
  if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'avif'].includes(extension)) return 'image';
  if (['mp3', 'm4a', 'aac', 'ogg', 'wav'].includes(extension)) return 'audio';
  return 'video';
}

function nestedPayload(payload) {
  let root = asObject(payload);
  for (let depth = 0; depth < 3; depth += 1) {
    const next = firstValue(root.data, root.result, root.item);
    if (!next || typeof next !== 'object' || Array.isArray(next)) break;
    root = next;
  }
  return root;
}

function normalizeStats(root) {
  const stats = asObject(firstValue(root.stats, root.statistics, root.statsV2, root.stats_v2));
  const map = {
    views: ['views', 'play_count', 'playCount', 'view_count'],
    likes: ['likes', 'digg_count', 'like_count', 'likeCount'],
    comments: ['comments', 'comment_count', 'commentCount'],
    shares: ['shares', 'share_count', 'shareCount'],
    downloads: ['downloads', 'download_count', 'downloadCount'],
    saves: ['saves', 'collect_count', 'save_count', 'collectCount']
  };
  return Object.fromEntries(Object.entries(map).map(([key, candidates]) => {
    const value = firstValue(...candidates.map(candidate => stats[candidate]), ...candidates.map(candidate => root[candidate]));
    const number = Number(value);
    return [key, Number.isFinite(number) && number >= 0 ? number : null];
  }));
}

function normalizeMediaItems(root, provider, allowedHosts, headers) {
  const rawItems = firstValue(root.media, root.medias, root.items, root.slides, root.images, root.image_urls, root.imageUrls, root.photos, root.image, root.imageUrl);
  const media = [];
  const items = Array.isArray(rawItems) ? rawItems : (typeof rawItems === 'string' ? [rawItems] : []);
  if (items.length) {
    for (const item of items.slice(0, MAX_MEDIA_ITEMS)) {
      const candidate = typeof item === 'string' ? item : firstValue(item?.url, item?.src, item?.downloadUrl, item?.download_url, item?.play, item?.image_url, item?.imageUrl);
      if (!candidate) continue;
      const url = normalizeMediaUrl(candidate, { provider, allowedHosts });
      media.push({ type: mediaTypeFrom(item, url), url, headersDownload: sanitizeDownloadHeaders(firstValue(item?.headersDownload, item?.headers_download, item?.headers, headers)) });
    }
  }

  if (!media.length) {
    const video = firstValue(root.hdplay, root.hdPlay, root.hd_url, root.hdUrl, root.video_url, root.videoUrl, root.downloadUrl, root.download_url, root.playbackUrl, root.playback_url, root.play, root.url, root.video?.url, root.video?.play, root.video?.download_url, typeof root.video === 'string' ? root.video : null, root.download?.url);
    if (video) {
      const url = normalizeMediaUrl(video, { provider, allowedHosts });
      media.push({ type: 'video', url, headersDownload: sanitizeDownloadHeaders(firstValue(root.headersDownload, root.headers_download, root.headers, headers)) });
    }
  }

  return media;
}

function normalizeMusic(root, provider, allowedHosts, headers) {
  const raw = asObject(firstValue(root.music_info, root.musicInfo, root.music, root.sound, root.audioInfo));
  const musicUrl = firstValue(raw.play, raw.url, raw.audio, raw.music_url, raw.musicUrl, root.music_url, root.musicUrl, root.audio_url, root.audioUrl, root.audio);
  let url = null;
  if (typeof musicUrl === 'string' && musicUrl.trim()) {
    try { url = normalizeMediaUrl(musicUrl, { provider, allowedHosts }); } catch { url = null; }
  }
  const rawAuthor = firstValue(raw.author, raw.artist, raw.owner);
  return {
    id: text(firstValue(raw.id, raw.music_id, raw.musicId), 100) || null,
    title: text(firstValue(raw.title, raw.name, root.music_title, root.musicTitle), 160) || null,
    author: text(typeof rawAuthor === 'object' ? firstValue(rawAuthor.nickname, rawAuthor.name, rawAuthor.unique_id) : rawAuthor, 120) || null,
    original: Boolean(firstValue(raw.original, raw.is_original, raw.isOriginal, false)),
    coverUrl: (() => { const value = firstValue(raw.cover, raw.cover_url, raw.coverUrl); if (!value) return null; try { return normalizeMediaUrl(value, { provider, allowedHosts }); } catch { return null; } })(),
    url,
    headersDownload: sanitizeDownloadHeaders(firstValue(raw.headersDownload, raw.headers_download, raw.headers, headers))
  };
}

export function normalizeTikTokResult(payload, originalUrl, { provider = 'custom', allowedHosts = DEFAULT_MEDIA_HOSTS } = {}) {
  const outer = asObject(payload);
  if (outer.success === false || (outer.code !== undefined && Number(outer.code) !== 0)) {
    const message = text(firstValue(outer.message, outer.msg, outer.error?.message, outer.error), 300) || 'Provider menolak permintaan.';
    throw new Error(message);
  }
  const root = nestedPayload(outer);
  if (root.success === false || root.status === 'failed' || root.status === 'error') {
    throw new Error(text(firstValue(root.message, root.msg, root.error?.message, root.error), 300) || 'Ekstraksi TikTok gagal.');
  }
  const providerHeaders = firstValue(root.headersDownload, root.headers_download, root.downloadHeaders, root.download_headers, outer.headersDownload, outer.headers_download);
  const media = normalizeMediaItems(root, provider, allowedHosts, providerHeaders);
  if (!media.length) throw new Error('Provider tidak mengembalikan media publik yang dapat diunduh.');
  const author = asObject(firstValue(root.author, root.user, root.creator));
  const stats = normalizeStats(root);
  const coverValue = firstValue(root.cover, root.cover_url, root.coverUrl, root.thumbnail, root.thumbnail_url, root.thumbnailUrl, root.origin_cover);
  let coverUrl = null;
  if (coverValue) { try { coverUrl = normalizeMediaUrl(coverValue, { provider, allowedHosts }); } catch { coverUrl = null; } }
  const music = normalizeMusic(root, provider, allowedHosts, providerHeaders);
  const inferredType = media.length > 1 && media.every(item => item.type === 'image') ? 'slide' : media[0].type === 'image' ? 'photo' : 'video';
  const postTypeRaw = text(firstValue(root.type, root.media_type, root.mediaType, root.aweme_type), 30).toLowerCase();
  const requestedType = (() => { try { return classifyTikTokUrl(originalUrl); } catch { return 'post'; } })();
  const postType = requestedType === 'story' || /story/.test(postTypeRaw) ? 'story' : /photo|image|slide|album/.test(postTypeRaw) ? (media.length > 1 ? 'slide' : 'photo') : (media.length > 1 ? 'slide' : inferredType);
  const duration = Number(firstValue(root.duration, root.duration_seconds, root.durationSeconds, root.video?.duration));
  const width = Number(firstValue(root.width, root.video?.width));
  const height = Number(firstValue(root.height, root.video?.height));
  const publishedAtRaw = firstValue(root.create_time, root.createTime, root.created_at, root.createdAt, root.timestamp);
  let publishedAt = null;
  if (publishedAtRaw !== undefined) {
    const date = typeof publishedAtRaw === 'number' ? new Date(publishedAtRaw < 10_000_000_000 ? publishedAtRaw * 1000 : publishedAtRaw) : new Date(publishedAtRaw);
    if (Number.isFinite(date.getTime())) publishedAt = date.toISOString();
  }
  const username = text(firstValue(author.unique_id, author.uniqueId, author.username, root.author_username, root.authorUsername), 80).replace(/^@/, '');
  return {
    provider,
    originalUrl,
    canonicalUrl: text(firstValue(root.share_url, root.shareUrl, root.canonical_url, root.canonicalUrl), 2048) || originalUrl,
    id: text(firstValue(root.id, root.aweme_id, root.awemeId, root.video_id, root.videoId), 100) || null,
    type: postType,
    title: text(firstValue(root.title, root.desc, root.description, root.caption, root.text), 1200) || '(tanpa caption)',
    author: {
      id: text(firstValue(author.id, author.uid, root.author_id, root.authorId), 100) || null,
      username: username || null,
      name: text(firstValue(author.nickname, author.name, author.display_name, author.displayName, root.author_name, root.authorName), 120) || username || null,
      avatarUrl: (() => { const value = firstValue(author.avatar, author.avatar_url, author.avatarUrl); if (!value) return null; try { return normalizeMediaUrl(value, { provider, allowedHosts }); } catch { return null; } })()
    },
    stats,
    durationSeconds: Number.isFinite(duration) && duration >= 0 ? duration : null,
    dimensions: Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0 ? { width, height } : null,
    publishedAt,
    music,
    coverUrl,
    media: media.slice(0, MAX_MEDIA_ITEMS)
  };
}

async function readBoundedResponse(response, maxBytes, label) {
  const declaredLength = Number(response.headers?.get?.('content-length') || 0);
  if (declaredLength > maxBytes) throw new RangeError(`${label} melebihi batas ${Math.ceil(maxBytes / 1048576)} MiB.`);
  if (!response.body?.getReader) {
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > maxBytes) throw new RangeError(`${label} melebihi batas ${Math.ceil(maxBytes / 1048576)} MiB.`);
    if (!body.length) throw new Error(`${label} kosong.`);
    return body;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new RangeError(`${label} melebihi batas ${Math.ceil(maxBytes / 1048576)} MiB.`);
      }
      chunks.push(chunk);
    }
  } finally { reader.releaseLock?.(); }
  if (!total) throw new Error(`${label} kosong.`);
  return Buffer.concat(chunks, total);
}

function isProtectedContentError(message) {
  return /age.?restrict|age.?gate|under.?18|adult|mature content|strict age|private account|account is private|login required|sign in to view|not authorized|http 401|http 403|access denied/i.test(String(message || ''));
}

function publicError(message) {
  const clean = text(message, 260);
  if (/age.?restrict|age.?gate|under.?18|adult|mature content|strict age/i.test(clean)) {
    return 'TikTok membatasi konten ini berdasarkan usia. WHISKAY tidak melewati pembatasan usia atau akses akun.';
  }
  if (/private|not.?found|deleted|unavailable|not.?available|does not exist|http 401|http 403|access denied|not authorized/i.test(clean)) {
    return 'Konten tidak tersedia untuk diakses secara publik, mungkin privat, dihapus, atau dibatasi pemiliknya. WHISKAY tidak melewati pembatasan akses.';
  }
  if (/429|rate.?limit|too many/i.test(clean)) return 'Provider sedang membatasi permintaan. Coba lagi setelah beberapa saat.';
  return clean || 'Provider TikTok tidak berhasil memproses tautan.';
}

export class TikTokScraper {
  constructor({
    fetchImpl = globalThis.fetch,
    providerUrls = process.env.TIKTOK_SCRAPER_API_URLS || '',
    apiToken = process.env.TIKTOK_SCRAPER_API_TOKEN || '',
    allowedMediaHosts = process.env.TIKTOK_MEDIA_HOST_ALLOWLIST || '',
    timeoutMs = DEFAULT_TIMEOUT_MS,
    bodyTimeoutMs = DEFAULT_BODY_TIMEOUT_MS,
    maxMediaBytes = MAX_MEDIA_BYTES,
    maxTotalBytes = MAX_TOTAL_BYTES,
    minTikwmIntervalMs = 1000,
    now = () => Date.now(),
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
  } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('Fetch API tidak tersedia.');
    this.fetch = fetchImpl;
    this.providerUrls = normalizeEndpointList(providerUrls);
    this.apiToken = String(apiToken || '').trim().slice(0, 2048);
    this.allowedMediaHosts = [...new Set([...DEFAULT_MEDIA_HOSTS, ...normalizeHostList(allowedMediaHosts)])];
    this.timeoutMs = Math.max(2000, Math.min(60000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));
    this.bodyTimeoutMs = Math.max(2000, Math.min(60000, Number(bodyTimeoutMs) || DEFAULT_BODY_TIMEOUT_MS));
    this.maxMediaBytes = Math.max(1024, Math.min(MAX_MEDIA_BYTES, Number(maxMediaBytes) || MAX_MEDIA_BYTES));
    this.maxTotalBytes = Math.max(this.maxMediaBytes, Math.min(MAX_TOTAL_BYTES, Number(maxTotalBytes) || MAX_TOTAL_BYTES));
    this.minTikwmIntervalMs = Math.max(0, Math.min(10000, Number(minTikwmIntervalMs) || 0));
    this.now = now;
    this.sleep = sleep;
  }

  getStatus() {
    return {
      customProviders: this.providerUrls.length,
      customProviderReady: this.providerUrls.length > 0,
      tikwmFallback: true,
      maxMediaItems: MAX_MEDIA_ITEMS,
      maxMediaBytes: this.maxMediaBytes,
      maxTotalBytes: this.maxTotalBytes
    };
  }

  async #fetchJson(url, init, providerLabel) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('timeout')), this.timeoutMs);
    timer.unref?.();
    try {
      const response = await this.fetch(url, { ...init, redirect: 'error', signal: controller.signal });
      if (!response.ok) throw new Error(`${providerLabel} HTTP ${response.status}${response.status === 429 ? ' rate limit' : ''}.`);
      const body = await readBoundedResponse(response, MAX_JSON_BYTES, `Respons ${providerLabel}`);
      try { return JSON.parse(body.toString('utf8')); }
      catch { throw new Error(`${providerLabel} tidak mengembalikan JSON valid.`); }
    } catch (error) {
      if (error?.name === 'AbortError' || controller.signal.aborted) throw new Error(`${providerLabel} timeout.`);
      throw error;
    } finally { clearTimeout(timer); }
  }

  async #fetchCustomProvider(endpoint, originalUrl, index) {
    const headers = { accept: 'application/json', 'content-type': 'application/json', 'user-agent': USER_AGENT };
    if (this.apiToken) headers.authorization = `Bearer ${this.apiToken}`;
    const payload = await this.#fetchJson(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url: originalUrl })
    }, `Scraper custom ${index + 1}`);
    return normalizeTikTokResult(payload, originalUrl, { provider: `custom-${index + 1}`, allowedHosts: this.allowedMediaHosts });
  }

  async #fetchTikwm(originalUrl) {
    const wait = Math.max(0, this.minTikwmIntervalMs - (this.now() - lastTikwmRequestAt));
    if (wait > 0) await this.sleep(wait);
    lastTikwmRequestAt = this.now();
    const body = new URLSearchParams({ url: originalUrl, hd: '1' }).toString();
    const payload = await this.#fetchJson(TIKWM_API_URL, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'user-agent': USER_AGENT },
      body
    }, 'TikWM');
    return normalizeTikTokResult(payload, originalUrl, { provider: 'tikwm', allowedHosts: this.allowedMediaHosts });
  }

  async *#providerResults(originalUrl, errors) {
    for (const [index, endpoint] of this.providerUrls.entries()) {
      try {
        yield await this.#fetchCustomProvider(endpoint, originalUrl, index);
      } catch (error) {
        if (isProtectedContentError(error?.message)) throw new Error(publicError(error.message));
        errors.push(`custom-${index + 1}: ${publicError(error.message)}`);
      }
    }
    try {
      yield await this.#fetchTikwm(originalUrl);
    } catch (error) {
      if (isProtectedContentError(error?.message)) throw new Error(publicError(error.message));
      errors.push(`tikwm: ${publicError(error.message)}`);
    }
  }

  async #providerFailure(errors) {
    return new Error(`Semua provider TikTok gagal. ${errors.join(' | ') || 'Tidak ada hasil media publik.'}`.slice(0, 900));
  }

  async fetchMediaInfo(inputUrl) {
    const originalUrl = normalizeTikTokUrl(inputUrl);
    const errors = [];
    for await (const result of this.#providerResults(originalUrl, errors)) {
      result.providerFallback = errors.length > 0;
      result.providerErrors = errors.slice();
      return result;
    }
    throw await this.#providerFailure(errors);
  }

  async fetchAndDownload(inputUrl, { audioOnly = false } = {}) {
    const originalUrl = normalizeTikTokUrl(inputUrl);
    const errors = [];
    for await (const result of this.#providerResults(originalUrl, errors)) {
      try {
        const items = await this.downloadResult(result, { audioOnly });
        result.providerFallback = errors.length > 0;
        result.providerErrors = errors.slice();
        return { result, items };
      } catch (error) {
        if (isProtectedContentError(error?.message)) throw new Error(publicError(error.message));
        errors.push(`${result.provider}: ${publicError(error.message)}`);
      }
    }
    throw await this.#providerFailure(errors);
  }

  async downloadMedia(media, { remainingBytes = this.maxTotalBytes } = {}) {
    if (!media?.url) throw new TypeError('Item media tidak memiliki URL.');
    const initial = normalizeMediaUrl(media.url, { allowedHosts: this.allowedMediaHosts });
    let current = new URL(initial);
    const headers = sanitizeDownloadHeaders(media.headersDownload);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('media timeout')), this.bodyTimeoutMs);
    timer.unref?.();
    try {
      let response;
      for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
        if (!hostMatches(current.hostname, this.allowedMediaHosts) || current.protocol !== 'https:' || isPrivateHost(current.hostname)) {
          throw new Error('Redirect CDN ke host yang tidak diizinkan ditolak.');
        }
        response = await this.fetch(current, { method: 'GET', headers, redirect: 'manual', signal: controller.signal });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const location = response.headers.get('location');
        if (!location || hop === MAX_REDIRECTS) throw new Error('Redirect CDN tidak lengkap atau melewati batas.');
        current = new URL(location, current);
      }
      if (!response?.ok) throw new Error(`Download CDN gagal (HTTP ${response?.status || 'unknown'}).`);
      const mime = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const expected = media.type === 'image' ? 'image/' : media.type === 'audio' ? 'audio/' : 'video/';
      if (mime && !mime.startsWith(expected) && !(media.type === 'audio' && mime === 'application/octet-stream')) {
        throw new Error(`CDN memberikan tipe file tidak cocok (${mime}).`);
      }
      const maxBytes = Math.min(this.maxMediaBytes, Math.max(0, Number(remainingBytes) || 0));
      if (maxBytes < 1) throw new RangeError('Batas total ukuran unduhan sudah tercapai.');
      const buffer = await readBoundedResponse(response, maxBytes, `Media TikTok (${media.type})`);
      return { buffer, mimetype: mime || (media.type === 'image' ? 'image/jpeg' : media.type === 'audio' ? 'audio/mpeg' : 'video/mp4'), size: buffer.length, finalUrl: current.toString() };
    } catch (error) {
      if (error?.name === 'AbortError' || controller.signal.aborted) throw new Error('Download media TikTok timeout.');
      throw error;
    } finally { clearTimeout(timer); }
  }

  async downloadResult(result, { includeAudio = false, audioOnly = false } = {}) {
    if (!result || !Array.isArray(result.media) || result.media.length > MAX_MEDIA_ITEMS) throw new TypeError('Hasil TikTok tidak valid atau melebihi batas jumlah media.');
    let queue = audioOnly ? [] : [...result.media];
    if (audioOnly) {
      if (!result.music?.url) throw new Error('Provider tidak menyediakan URL track musik untuk konten ini.');
      queue = [{ type: 'audio', url: result.music.url, headersDownload: result.music.headersDownload, musicTrack: true }];
    } else if (includeAudio && result.music?.url) {
      queue.push({ type: 'audio', url: result.music.url, headersDownload: result.music.headersDownload, musicTrack: true });
    }
    if (!queue.length) throw new Error('Provider tidak mengembalikan item media yang dapat diunduh.');
    const output = [];
    let total = 0;
    for (const media of queue) {
      const remaining = this.maxTotalBytes - total;
      if (remaining < 1) throw new RangeError(`Total unduhan melebihi batas ${Math.ceil(this.maxTotalBytes / 1048576)} MiB.`);
      const item = await this.downloadMedia(media, { remainingBytes: remaining });
      total += item.size;
      output.push({ ...media, ...item });
    }
    return output;
  }
}

let lastTikwmRequestAt = 0;
export const TIKTOK_LIMITS = Object.freeze({
  maxUrlLength: MAX_URL_LENGTH,
  maxJsonBytes: MAX_JSON_BYTES,
  maxMediaBytes: MAX_MEDIA_BYTES,
  maxTotalBytes: MAX_TOTAL_BYTES,
  maxMediaItems: MAX_MEDIA_ITEMS,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  tikwmApiUrl: TIKWM_API_URL
});
export { publicError, isProtectedContentError };
export default TikTokScraper;
