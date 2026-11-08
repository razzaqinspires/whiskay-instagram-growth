import { spawn } from 'node:child_process';
import { access, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = 'https://music.youtube.com';
const DEFAULT_API_KEY = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30'; // Public WEB_REMIX client key; override through env when it rotates.
const DEFAULT_CLIENT_VERSION = '1.20261031.09.00';
const DEFAULT_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';
const SEARCH_FILTERS = Object.freeze({
  songs: 'Eg-KAQwIABAAGAAgACgAMABqChAEEAMQCRAFEAo=',
  videos: 'Eg-KAQwIABABGAAgACgAMABqChAEEAMQCRAFEAo=',
  albums: 'Eg-KAQwBAhABGAAgACgAMABqChAEEAMQCRAFEAo=',
  artists: 'Eg-KAQwIABAAGAAgASgAMABqChAEEAMQCRAFEAo=',
  playlists: 'EgeKAQQoAEABagoQAxAEEAkQBRAL'
});
const ID_RE = /^[A-Za-z0-9_-]{11}$/;

function textOf(runs = []) { return Array.isArray(runs) ? runs.map(run => run?.text || '').join('').trim() : ''; }
function firstThumbnail(renderer) {
  const thumbnails = renderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails
    || renderer?.thumbnail?.thumbnails || [];
  return thumbnails.at(-1)?.url || null;
}
function getVideoId(renderer) {
  return renderer?.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId
    || renderer?.playlistItemData?.videoId
    || renderer?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId
    || renderer?.navigationEndpoint?.watchEndpoint?.videoId
    || null;
}

export function parseYouTubeMusicResults(data) {
  const results = [];
  const seen = new Set();
  const add = item => {
    if (!item?.videoId || !ID_RE.test(item.videoId) || seen.has(item.videoId)) return;
    seen.add(item.videoId);
    results.push({ ...item, url: `${BASE_URL}/watch?v=${item.videoId}` });
  };
  const tab = data?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer
    || data?.contents?.singleColumnSearchResultsRenderer?.tabs?.[0]?.tabRenderer;
  const sections = tab?.content?.sectionListRenderer?.contents || [];
  for (const section of sections) {
    const shelf = section?.musicCardShelfRenderer;
    if (shelf) {
      const run = shelf.title?.runs?.[0];
      add({ category: 'Top Result', title: run?.text || '', videoId: run?.navigationEndpoint?.watchEndpoint?.videoId, meta: textOf(shelf.subtitle?.runs), thumbnail: firstThumbnail(shelf) });
    }
    const rows = section?.itemSectionRenderer?.contents || section?.musicShelfRenderer?.contents || [];
    for (const item of rows) {
      const renderer = item?.musicResponsiveListItemRenderer;
      if (!renderer) continue;
      const columns = (renderer.flexColumns || []).map(column => column?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []);
      const title = textOf(columns[0]);
      if (!title) continue;
      const videoId = getVideoId(renderer);
      const metadata = [...columns[1] || [], ...columns[2] || []];
      const duration = metadata.find(run => /^\d{1,2}:\d{2}(?::\d{2})?$/.test(String(run?.text || '').trim()))?.text?.trim() || null;
      add({
        category: columns[1]?.[0]?.text || 'Track', title, videoId, duration,
        meta: [textOf(columns[1]), textOf(columns[2])].filter(Boolean).join(' · '),
        thumbnail: firstThumbnail(renderer)
      });
    }
  }
  // Some InnerTube responses nest renderers differently; collect only known music list renderers.
  const walk = (node, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 24 || results.length >= 30) return;
    if (node.musicResponsiveListItemRenderer) {
      const renderer = node.musicResponsiveListItemRenderer;
      const columns = (renderer.flexColumns || []).map(column => column?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []);
      const title = textOf(columns[0]);
      if (title) add({ category: columns[1]?.[0]?.text || 'Track', title, videoId: getVideoId(renderer), meta: [textOf(columns[1]), textOf(columns[2])].filter(Boolean).join(' · '), thumbnail: firstThumbnail(renderer) });
    }
    for (const value of Object.values(node)) if (value && typeof value === 'object') walk(value, depth + 1);
  };
  if (results.length < 1) walk(data);
  return results.slice(0, 30);
}

export class YouTubeMusicClient {
  static BASE_URL = BASE_URL;
  static SEARCH_FILTERS = SEARCH_FILTERS;

  constructor(options = {}) {
    this.baseUrl = String(options.baseUrl || BASE_URL).replace(/\/+$/, '');
    this.apiKey = options.apiKey || process.env.YOUTUBE_MUSIC_API_KEY || DEFAULT_API_KEY;
    this.clientVersion = options.clientVersion || process.env.YOUTUBE_MUSIC_CLIENT_VERSION || DEFAULT_CLIENT_VERSION;
    this.userAgent = options.userAgent || DEFAULT_UA;
    this.hl = options.hl || 'id';
    this.gl = options.gl || 'ID';
    this.timeoutMs = Math.min(45_000, Math.max(3_000, Number(options.timeoutMs) || 20_000));
    this.fetch = options.fetchImpl || globalThis.fetch;
    if (typeof this.fetch !== 'function') throw new TypeError('Fetch API tidak tersedia. Gunakan Node.js 22+.');
  }

  async search(query, { filter = 'songs', limit = 10 } = {}) {
    const cleanQuery = String(query || '').trim();
    if (!cleanQuery || cleanQuery.length > 180) throw new TypeError('Kata pencarian wajib diisi (maksimal 180 karakter).');
    const normalizedFilter = String(filter || 'songs').toLowerCase();
    if (!['all', ...Object.keys(SEARCH_FILTERS)].includes(normalizedFilter)) throw new TypeError(`Filter harus all, ${Object.keys(SEARCH_FILTERS).join(', ')}.`);
    const body = { context: { client: { clientName: 'WEB_REMIX', clientVersion: this.clientVersion, hl: this.hl, gl: this.gl } }, query: cleanQuery };
    if (normalizedFilter !== 'all') body.params = SEARCH_FILTERS[normalizedFilter];
    const endpoint = `${this.baseUrl}/youtubei/v1/search?key=${encodeURIComponent(this.apiKey)}&prettyPrint=false`;
    const response = await this.fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json', origin: this.baseUrl, referer: `${this.baseUrl}/`,
        'user-agent': this.userAgent, 'x-youtube-client-name': '67', 'x-youtube-client-version': this.clientVersion
      },
      body: JSON.stringify(body), signal: AbortSignal.timeout(this.timeoutMs)
    });
    if (!response.ok) throw new Error(`YouTube Music InnerTube HTTP ${response.status}.`);
    const data = await response.json();
    if (data?.error) throw new Error(`YouTube Music API: ${String(data.error.message || 'request rejected').slice(0, 180)}`);
    return parseYouTubeMusicResults(data).slice(0, Math.max(1, Math.min(20, Number(limit) || 10)));
  }
}

function resolveYtDlpBinary() {
  const configured = process.env.YT_DLP_PATH?.trim();
  if (configured) return configured;
  return process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
}

function runProcess(binary, args, { timeoutMs = 120_000, maxOutput = 24_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, shell: false });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`yt-dlp timeout setelah ${Math.round(timeoutMs / 1000)} detik.`)); }, timeoutMs);
    timer.unref?.();
    child.stdout.on('data', chunk => { if (stdout.length < maxOutput) stdout += chunk.toString().slice(0, maxOutput - stdout.length); });
    child.stderr.on('data', chunk => { if (stderr.length < maxOutput) stderr += chunk.toString().slice(0, maxOutput - stderr.length); });
    child.once('error', error => { clearTimeout(timer); reject(new Error(`Tidak dapat menjalankan ${binary}: ${error.message}. Pasang yt-dlp dan pastikan ada di PATH.`)); });
    child.once('close', code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`yt-dlp keluar dengan kode ${code}: ${(stderr || stdout).trim().slice(-700)}`));
      resolve({ stdout, stderr });
    });
  });
}

export class YouTubeMusicAudio {
  constructor(options = {}) {
    this.searchClient = options.searchClient || new YouTubeMusicClient(options);
    this.ytdlpPath = options.ytdlpPath || resolveYtDlpBinary();
    this.defaultFormat = options.defaultFormat || 'ba[ext=m4a]/140/ba';
    this.timeoutMs = Math.min(240_000, Math.max(30_000, Number(options.timeoutMs) || 150_000));
    this.maxBytes = Math.min(64 * 1024 * 1024, Math.max(5 * 1024 * 1024, Number(options.maxBytes) || 32 * 1024 * 1024));
  }

  async status() {
    try {
      const { stdout } = await runProcess(this.ytdlpPath, ['--version'], { timeoutMs: 8_000, maxOutput: 500 });
      return { available: true, binary: this.ytdlpPath, version: stdout.trim() };
    } catch (error) { return { available: false, binary: this.ytdlpPath, error: error.message }; }
  }

  validateTarget(videoIdOrUrl) {
    const value = String(videoIdOrUrl || '').trim();
    if (ID_RE.test(value)) return `${BASE_URL}/watch?v=${value}`;
    let url;
    try { url = new URL(value); } catch { throw new TypeError('Masukkan video ID 11 karakter atau URL YouTube Music/YouTube yang valid.'); }
    if (url.protocol !== 'https:' || url.username || url.password || !['youtube.com', 'www.youtube.com', 'music.youtube.com', 'youtu.be'].includes(url.hostname.toLowerCase())) throw new TypeError('Host URL YouTube tidak diizinkan.');
    const id = url.hostname === 'youtu.be' ? url.pathname.split('/').filter(Boolean)[0] : url.searchParams.get('v');
    if (!id || !ID_RE.test(id)) throw new TypeError('URL harus menunjuk satu video, bukan playlist atau halaman pencarian.');
    return `${BASE_URL}/watch?v=${id}`;
  }

  async downloadToFile(videoIdOrUrl, outputPath) {
    const targetUrl = this.validateTarget(videoIdOrUrl);
    const output = path.resolve(outputPath);
    await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
    await runProcess(this.ytdlpPath, [
      '--no-warnings', '--no-progress', '--no-playlist', '--no-part', '--restrict-filenames',
      '--socket-timeout', '20', '--retries', '2', '--max-filesize', `${Math.floor(this.maxBytes / 1048576)}M`,
      '-f', this.defaultFormat, '-x', '--audio-format', 'm4a', '--audio-quality', '5', '-o', output, targetUrl
    ], { timeoutMs: this.timeoutMs });
    await access(output);
    const info = await stat(output);
    if (!info.isFile() || info.size < 1024 || info.size > this.maxBytes) throw new Error(`Audio hasil unduhan tidak valid atau melewati batas ${Math.floor(this.maxBytes / 1048576)} MiB.`);
    return { path: output, size: info.size, url: targetUrl };
  }
}

export default YouTubeMusicClient;
