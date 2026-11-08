const BASE_URL = 'https://kol.id';
const PAGE_URL = `${BASE_URL}/download-video/instagram`;
const API_DOWNLOADER = `${BASE_URL}/api/v2/downloader/instagram`;
const USER_AGENT = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36';
const MAX_MEDIA_BYTES = 40 * 1024 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_SLIDES = 10;

function htmlDecode(value) {
  return String(value || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function extractAttr(html, regex) {
  const match = String(html).match(regex);
  return match ? htmlDecode(match[1].trim()) : null;
}

function allowedInstagramUrl(raw) {
  let url;
  try { url = new URL(String(raw || '').trim()); } catch { throw new TypeError('URL Instagram tidak valid.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new TypeError('Instagram URL harus HTTPS tanpa kredensial atau port khusus.');
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'instagram.com') throw new TypeError('Hanya URL instagram.com yang diterima.');
  const segments = url.pathname.split('/').filter(Boolean);
  const kind = String(segments[0] || '').toLowerCase();
  const isStory = kind === 'stories';
  const pathMatch = isStory
    ? segments.length >= 3 && /^[A-Za-z0-9._-]+$/.test(segments[1]) && /^[A-Za-z0-9._-]+$/.test(segments[2])
    : ['p', 'reel', 'reels', 'tv'].includes(kind) && segments.length >= 2 && /^[A-Za-z0-9._-]+$/.test(segments[1]);
  if (!pathMatch) throw new TypeError('URL harus menunjuk post, reel, TV, atau story Instagram dengan identifier yang lengkap.');
  url.pathname = `/${segments.slice(0, isStory ? 3 : 2).join('/')}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function allowedStatusUrl(raw) {
  let url;
  try { url = new URL(raw, BASE_URL); } catch { throw new TypeError('status_url dari KOL.ID tidak valid.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'kol.id' || url.port || url.username || url.password || !/^\/api\/v2\/downloader\/status\/[A-Za-z0-9_-]{4,160}\/?$/.test(url.pathname)) {
    throw new Error('KOL.ID mengembalikan status_url di luar endpoint status yang diizinkan.');
  }
  url.hash = '';
  return url.toString();
}

function allowedMediaUrl(raw) {
  let url;
  try { url = new URL(String(raw || '')); } catch { throw new TypeError('URL media dari KOL.ID tidak valid.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new TypeError('URL media wajib HTTPS tanpa kredensial atau port khusus.');
  const host = url.hostname.toLowerCase();
  const allowed = host === 'kol.id' || host === 'instagram.com' || host.endsWith('.instagram.com') || host === 'cdninstagram.com' || host.endsWith('.cdninstagram.com') || host === 'fbcdn.net' || host.endsWith('.fbcdn.net');
  if (!allowed) throw new Error(`Host media tidak diizinkan: ${host}`);
  return url.toString();
}

function contentType(url, declared = '') {
  const mime = String(declared || '').toLowerCase();
  if (mime.includes('video')) return 'video';
  if (mime.includes('image')) return 'image';
  const ext = new URL(url).pathname.toLowerCase().split('.').pop();
  return ['mp4', 'mov', 'webm'].includes(ext) ? 'video' : 'image';
}

async function readBoundedBody(response, maxBytes, timeoutMs, label) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new RangeError(`${label} melebihi batas ${Math.ceil(maxBytes / 1048576)} MiB.`);
  if (!response.body) throw new Error(`${label} tidak memiliki response body.`);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reader.cancel().catch(() => {});
      reject(new Error(`${label} body timeout.`));
    }, timeoutMs);
    timer.unref?.();
  });
  const consume = (async () => {
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
    if (!total) throw new Error(`${label} kosong.`);
    return Buffer.concat(chunks, total);
  })();
  try { return await Promise.race([consume, timeout]); }
  finally { clearTimeout(timer); reader.releaseLock?.(); }
}

async function readJsonBounded(response, label = 'Respons KOL.ID') {
  const body = await readBoundedBody(response, 1024 * 1024, 12_000, label);
  try { return JSON.parse(body.toString('utf8')); }
  catch { throw new Error(`${label} bukan JSON valid.`); }
}

function cookieHeader(response) {
  const cookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie') || ''];
  return cookies.map(value => String(value).split(';')[0].trim()).filter(Boolean).join('; ');
}

function parseFaqs(html) {
  const questions = [...String(html).matchAll(/<div class="faq-question"[^>]*>([\s\S]*?)<\/div>/gi)].map(match => htmlDecode(match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()));
  const answers = [...String(html).matchAll(/<div class="faq-answer"[^>]*>([\s\S]*?)<\/div>/gi)].map(match => htmlDecode(match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()));
  return questions.slice(0, 30).filter(Boolean).map((question, index) => ({ question, answer: answers[index] || '' }));
}

export class KolInstagramScraper {
  static BASE_URL = BASE_URL;
  static PAGE_URL = PAGE_URL;
  static API_DOWNLOADER = API_DOWNLOADER;

  constructor({ fetchImpl = globalThis.fetch, timeoutMs = 40_000, maxWaitSec = 40, userAgent = USER_AGENT } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('Fetch API tidak tersedia.');
    this.fetch = fetchImpl;
    this.timeoutMs = Math.min(60_000, Math.max(2_000, Number(timeoutMs) || 40_000));
    this.maxWaitSec = Math.min(60, Math.max(5, Number(maxWaitSec) || 40));
    this.userAgent = String(userAgent).slice(0, 300);
  }

  headers(extra = {}) {
    return { 'user-agent': this.userAgent, 'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7', ...extra };
  }

  async request(url, options = {}, { allowedOrigins = [BASE_URL], allowUrl = null, maxRedirects = 3, timeoutMs = this.timeoutMs } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('request timeout')), timeoutMs);
    timer.unref?.();
    try {
      let current = new URL(url);
      for (let hop = 0; hop <= maxRedirects; hop += 1) {
        const validTarget = allowUrl ? allowUrl(current) : allowedOrigins.includes(current.origin);
        if (current.protocol !== 'https:' || !validTarget || current.username || current.password || current.port) throw new Error('Redirect ke host di luar allowlist ditolak.');
        const response = await this.fetch(current, { ...options, redirect: 'manual', signal: controller.signal });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get('location');
          if (!location || hop === maxRedirects) throw new Error('Redirect KOL.ID tidak lengkap atau melewati batas.');
          current = new URL(location, current);
          continue;
        }
        return response;
      }
      throw new Error('Redirect KOL.ID terlalu banyak.');
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Koneksi ke KOL.ID timeout.');
      throw error;
    } finally { clearTimeout(timer); }
  }

  async getPage() {
    const response = await this.request(PAGE_URL, { headers: this.headers({ accept: 'text/html,application/xhtml+xml' }) });
    if (!response.ok) throw new Error(`Halaman KOL.ID gagal dibaca (HTTP ${response.status}).`);
    const htmlBuffer = await readBoundedBody(response, 2 * 1024 * 1024, 12_000, 'Halaman KOL.ID');
    const html = htmlBuffer.toString('utf8');
    if (htmlBuffer.length < 1000) throw new Error('Ukuran halaman KOL.ID tidak wajar.');
    return { response, html };
  }

  async getSession() {
    const { response, html } = await this.getPage();
    const scriptToken = html.match(/_token\s*:\s*['"]([^'"]+)['"]/i)?.[1];
    const formToken = html.match(/name=["']_token["'][^>]*value=["']([^"']+)["']/i)?.[1]
      || html.match(/value=["']([^"']+)["'][^>]*name=["']_token["']/i)?.[1];
    const token = scriptToken || formToken;
    if (!token || token.length > 512) throw new Error('Token CSRF tidak ditemukan pada halaman KOL.ID. Layout mungkin berubah.');
    return { cookieHeader: cookieHeader(response), token, html };
  }

  async scrapePageInfo() {
    const { response, html } = await this.getPage();
    const title = extractAttr(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const features = [...html.matchAll(/<h[234][^>]*class=["'][^"']*feature[^"']*["'][^>]*>([\s\S]*?)<\/h[234]>/gi)]
      .map(match => htmlDecode(match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())).filter(Boolean).slice(0, 30);
    const platforms = [...new Set([...html.matchAll(/href=["']https:\/\/kol\.id\/download-video\/([a-z0-9_-]+)["']/gi)].map(match => match[1]))].slice(0, 30);
    return {
      success: true,
      url: PAGE_URL,
      httpStatus: response.status,
      seo: {
        title,
        description: extractAttr(html, /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i),
        ogTitle: extractAttr(html, /<meta\s+property=["']og:title["']\s+content=["']([^"']*)["']/i),
        ogDescription: extractAttr(html, /<meta\s+property=["']og:description["']\s+content=["']([^"']*)["']/i),
        ogImage: extractAttr(html, /<meta\s+property=["']og:image["']\s+content=["']([^"']*)["']/i),
        canonical: extractAttr(html, /<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/i)
      },
      downloaderConfig: { apiEndpoint: API_DOWNLOADER, supportedTypes: ['video', 'reels', 'photos', 'slides', 'stories'], supportedDownloadersOnSite: platforms },
      faqs: parseFaqs(html),
      features
    };
  }

  normalizeResult(data, originalUrl) {
    if (!data || typeof data !== 'object') throw new Error('Payload hasil KOL.ID kosong.');
    const slides = Array.isArray(data.slides) ? data.slides.slice(0, MAX_SLIDES) : [];
    const media = [];
    if (String(data.type || '').toLowerCase() === 'slide' && slides.length) {
      slides.forEach((slide, index) => {
        if (!slide?.url) return;
        const url = allowedMediaUrl(slide.url);
        media.push({ index: index + 1, type: contentType(url, slide.type), url, thumbnail: slide.thumbnail ? allowedMediaUrl(slide.thumbnail) : null });
      });
    } else if (data.video_url) {
      const url = allowedMediaUrl(data.video_url);
      media.push({ index: 1, type: contentType(url, data.type), url, thumbnail: data.thumbnail ? allowedMediaUrl(data.thumbnail) : null });
    }
    if (!media.length) throw new Error('KOL.ID tidak mengembalikan media publik yang dapat diunduh.');
    return {
      success: true, originalUrl, requestId: String(data.request_id || '').slice(0, 160) || null,
      type: String(data.type || (slides.length ? 'slide' : 'video')).slice(0, 30),
      title: String(data.title || '').slice(0, 300), author: String(data.author || '').slice(0, 100),
      thumbnail: data.thumbnail ? allowedMediaUrl(data.thumbnail) : null,
      totalMedia: media.length, media
    };
  }

  async fetchMediaInfo(instagramUrl, { maxWaitSec = this.maxWaitSec } = {}) {
    const originalUrl = allowedInstagramUrl(instagramUrl);
    const { cookieHeader, token } = await this.getSession();
    const submit = await this.request(API_DOWNLOADER, {
      method: 'POST',
      headers: this.headers({
        accept: 'application/json, text/javascript, */*; q=0.01',
        'x-requested-with': 'XMLHttpRequest', 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        origin: BASE_URL, referer: PAGE_URL, ...(cookieHeader ? { cookie: cookieHeader } : {})
      }),
      body: new URLSearchParams({ url: originalUrl, _token: token }).toString()
    });
    if (!submit.ok) throw new Error(`KOL.ID submit gagal (HTTP ${submit.status}).`);
    const submitted = await readJsonBounded(submit, 'Respons submit KOL.ID');
    if (!submitted || typeof submitted !== 'object') throw new Error('KOL.ID mengembalikan JSON submit yang tidak valid.');
    const immediate = submitted.data;
    if (immediate?.status === 'completed') return this.normalizeResult(immediate, originalUrl);
    if (submitted.meta?.success === false && immediate?.error) throw new Error(String(immediate.error.message || submitted.meta.message || 'Ekstraksi Instagram gagal.').slice(0, 300));
    if (!immediate?.status_url) throw new Error(String(submitted.meta?.message || 'KOL.ID tidak mengembalikan status_url.').slice(0, 300));
    const statusUrl = allowedStatusUrl(immediate.status_url);
    const deadline = Date.now() + Math.min(60, Math.max(5, Number(maxWaitSec) || this.maxWaitSec)) * 1000;
    let pollMs = Math.max(2000, Math.min(8000, Number(immediate.poll_after || 4) * 1000));
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, pollMs));
      const statusResponse = await this.request(statusUrl, {
        headers: this.headers({ accept: 'application/json, text/javascript, */*; q=0.01', 'x-requested-with': 'XMLHttpRequest', referer: PAGE_URL, ...(cookieHeader ? { cookie: cookieHeader } : {}) })
      });
      if (!statusResponse.ok) throw new Error(`KOL.ID status gagal (HTTP ${statusResponse.status}).`);
      const statusPayload = await readJsonBounded(statusResponse, 'Respons status KOL.ID');
      const current = statusPayload?.data;
      if (!current) continue;
      if (current.status === 'completed') return this.normalizeResult(current, originalUrl);
      if (current.status === 'failed') throw new Error(String(current.error?.message || statusPayload.meta?.message || 'Media tidak ditemukan atau post privat.').slice(0, 300));
      pollMs = Math.max(2000, Math.min(8000, Number(current.poll_after || pollMs / 1000) * 1000));
    }
    throw new Error(`Batas polling status terlampaui (${maxWaitSec} detik).`);
  }

  async downloadMedia(mediaUrl, { maxBytes = MAX_MEDIA_BYTES } = {}) {
    const initial = allowedMediaUrl(mediaUrl);
    // Validate every redirect hop against the CDN allowlist to prevent SSRF.
    const response = await this.request(initial, { headers: this.headers({ accept: '*/*', referer: BASE_URL }) }, { allowUrl: candidate => { try { allowedMediaUrl(candidate.toString()); return true; } catch { return false; } }, maxRedirects: 4, timeoutMs: 30_000 });
    if (!response.ok) throw new Error(`Download media gagal (HTTP ${response.status}).`);
    const mime = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (mime && !mime.startsWith('image/') && !mime.startsWith('video/')) throw new Error(`KOL.ID memberikan tipe media yang tidak didukung: ${mime}`);
    const buffer = await readBoundedBody(response, maxBytes, 30_000, 'Media Instagram');
    return { buffer, mimetype: response.headers.get('content-type') || '', size: buffer.length };
  }

  async downloadResult(result, { maxTotalBytes = MAX_TOTAL_BYTES } = {}) {
    if (!result?.media?.length || result.media.length > MAX_SLIDES) throw new TypeError('Hasil media tidak valid atau melebihi batas slide.');
    const downloaded = [];
    let total = 0;
    for (const media of result.media) {
      const remaining = maxTotalBytes - total;
      if (remaining < 1) throw new RangeError(`Total media melebihi batas ${Math.max(1, Math.ceil(maxTotalBytes / 1048576))} MiB.`);
      const item = await this.downloadMedia(media.url, { maxBytes: Math.min(MAX_MEDIA_BYTES, remaining) });
      total += item.size;
      if (total > maxTotalBytes) throw new RangeError(`Total media melebihi batas ${Math.max(1, Math.ceil(maxTotalBytes / 1048576))} MiB.`);
      downloaded.push({ ...media, ...item });
    }
    return downloaded;
  }
}

export const KOL_LIMITS = Object.freeze({ maxMediaBytes: MAX_MEDIA_BYTES, maxTotalBytes: MAX_TOTAL_BYTES, maxSlides: MAX_SLIDES, maxWaitSec: 60 });
export { allowedInstagramUrl, allowedMediaUrl, allowedStatusUrl };
export default KolInstagramScraper;
