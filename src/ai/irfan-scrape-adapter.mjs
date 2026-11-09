import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 90_000;
const DEFAULT_DNS_TIMEOUT_MS = 5_000;
const MAX_PROMPT_CHARS = 5_000;
const MAX_URL_CHARS = 2_048;
const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_RESULT_CHARS = 8_000;
const THINKING_LEVELS = new Set(['low', 'medium', 'max']);

export class AiScrapeError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = 'AiScrapeError';
    this.code = code;
  }
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  throw new AiScrapeError('CONFIG_INVALID', 'IRFAN_SCRAPE_USE_FAST harus true atau false.');
}

function parseTimeout(value) {
  if (value === undefined || value === '') return DEFAULT_TIMEOUT_MS;
  const timeout = Number(value);
  if (!Number.isSafeInteger(timeout) || timeout < 1_000 || timeout > MAX_TIMEOUT_MS) {
    throw new AiScrapeError('CONFIG_INVALID', `IRFAN_SCRAPE_TIMEOUT_MS harus 1000–${MAX_TIMEOUT_MS}.`);
  }
  return timeout;
}

function parseAllowedHosts(value) {
  return [...new Set(String(value || '')
    .split(/[;,\s]+/)
    .map(host => host.trim().toLowerCase().replace(/\.$/, ''))
    .filter(Boolean))];
}

function isBlockedIpv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b, c] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 0 || b === 168))
    || (a === 192 && b === 88 && c === 99)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113);
}

function ipv6Hextets(address) {
  let value = String(address).toLowerCase().replace(/^\[|\]$/g, '');
  if (value.includes('.')) {
    const lastColon = value.lastIndexOf(':');
    const dotted = value.slice(lastColon + 1);
    if (!isIP(dotted) || isIP(dotted) !== 4) return null;
    const octets = dotted.split('.').map(Number);
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    value = `${value.slice(0, lastColon + 1)}${high}:${low}`;
  }
  const halves = value.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  const parts = halves.length === 2 ? [...left, ...Array(Math.max(0, missing)).fill('0'), ...right] : left;
  if (parts.length !== 8 || parts.some(part => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  return parts.map(part => Number.parseInt(part, 16));
}

function isBlockedIpv6(address) {
  const host = String(address).toLowerCase().replace(/^\[|\]$/g, '');
  if (host === '::' || host === '::1' || host.startsWith('fc') || host.startsWith('fd')
    || /^fe[89ab]/.test(host) || host.startsWith('ff') || host.startsWith('2001:db8:')) return true;
  const parts = ipv6Hextets(host);
  if (!parts) return true;
  const mappedIpv4 = parts.slice(0, 5).every(part => part === 0) && parts[5] === 0xffff;
  if (mappedIpv4) {
    const v4 = [parts[6] >> 8, parts[6] & 255, parts[7] >> 8, parts[7] & 255].join('.');
    return isBlockedIpv4(v4);
  }
  return false;
}

function isPublicAddress(address) {
  const family = isIP(String(address));
  if (family === 4) return !isBlockedIpv4(address);
  if (family === 6) return !isBlockedIpv6(address);
  return false;
}

function normalizeHttpUrl(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_URL_CHARS) {
    throw new AiScrapeError('INPUT_INVALID', `${label} wajib berupa URL dan maksimal ${MAX_URL_CHARS} karakter.`);
  }
  let parsed;
  try { parsed = new URL(value.trim()); }
  catch { throw new AiScrapeError('INPUT_INVALID', `${label} tidak valid.`); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) {
    throw new AiScrapeError('INPUT_INVALID', `${label} harus HTTP/HTTPS publik tanpa kredensial atau fragment.`);
  }
  if (parsed.port && !['80', '443'].includes(parsed.port)) {
    throw new AiScrapeError('INPUT_INVALID', `${label} menggunakan port yang tidak diizinkan.`);
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')
    || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new AiScrapeError('INPUT_BLOCKED', `${label} mengarah ke host lokal yang tidak diizinkan.`);
  }
  parsed.hostname = hostname.includes(':') ? `[${hostname}]` : hostname;
  return parsed;
}

async function assertPublicHost(hostname, lookup, timeoutMs = DEFAULT_DNS_TIMEOUT_MS) {
  const literalFamily = isIP(hostname);
  if (literalFamily) {
    if (!isPublicAddress(hostname)) throw new AiScrapeError('INPUT_BLOCKED', 'Alamat IP privat atau reserved tidak diizinkan.');
    return;
  }
  let records;
  let timeout;
  try {
    records = await Promise.race([
      lookup(hostname, { all: true, verbatim: true }),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new AiScrapeError('DNS_TIMEOUT', 'Pemeriksaan DNS melewati batas waktu.')), timeoutMs); })
    ]);
  } catch (error) {
    if (error instanceof AiScrapeError && error.code === 'DNS_TIMEOUT') throw error;
    throw new AiScrapeError('INPUT_BLOCKED', 'Hostname tidak dapat diverifikasi sebagai alamat publik.');
  } finally { clearTimeout(timeout); }
  if (!Array.isArray(records) || records.length === 0 || records.some(record => !isPublicAddress(record.address))) {
    throw new AiScrapeError('INPUT_BLOCKED', 'Hostname memiliki alamat IP privat, reserved, atau tidak dapat diverifikasi.');
  }
}

function readRuntimeConfig(env) {
  const enabled = String(env.IRFAN_SCRAPE_ENABLED || '').trim().toLowerCase() === 'true';
  const endpointValue = String(env.IRFAN_SCRAPE_API_URL || '').trim();
  const token = String(env.IRFAN_SCRAPE_API_TOKEN || '').trim();
  if (token.length > 4_096 || /[\u0000-\u0020\u007f]/.test(token)) {
    throw new AiScrapeError('CONFIG_INVALID', 'IRFAN_SCRAPE_API_TOKEN mengandung karakter kontrol/spasi atau melebihi 4096 karakter.');
  }
  const allowedHosts = parseAllowedHosts(env.IRFAN_SCRAPE_ALLOWED_HOSTS);
  const timeoutMs = parseTimeout(env.IRFAN_SCRAPE_TIMEOUT_MS);
  const thinking = String(env.IRFAN_SCRAPE_THINKING || 'medium').trim().toLowerCase();
  if (!THINKING_LEVELS.has(thinking)) {
    throw new AiScrapeError('CONFIG_INVALID', 'IRFAN_SCRAPE_THINKING harus low, medium, atau max.');
  }
  const useFast = parseBoolean(env.IRFAN_SCRAPE_USE_FAST, true);
  const model = String(env.IRFAN_SCRAPE_MODEL || 'default').trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/.test(model)) {
    throw new AiScrapeError('CONFIG_INVALID', 'IRFAN_SCRAPE_MODEL berisi karakter yang tidak diizinkan.');
  }

  let endpoint = null;
  if (endpointValue) {
    try { endpoint = new URL(endpointValue); }
    catch { throw new AiScrapeError('CONFIG_INVALID', 'IRFAN_SCRAPE_API_URL bukan URL valid.'); }
    const hostname = endpoint.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash
      || (endpoint.port && endpoint.port !== '443') || !allowedHosts.includes(hostname)) {
      throw new AiScrapeError('CONFIG_INVALID', 'Endpoint wajib HTTPS, tanpa kredensial/query/fragment, port standar, dan host harus cocok persis dengan IRFAN_SCRAPE_ALLOWED_HOSTS.');
    }
    if (endpoint.pathname === '/') endpoint.pathname = '/';
  }

  const configured = Boolean(enabled && endpoint && token.length >= 16);
  const missing = [];
  if (!enabled) missing.push('IRFAN_SCRAPE_ENABLED=true');
  if (!endpoint) missing.push('IRFAN_SCRAPE_API_URL');
  if (token.length < 16) missing.push('IRFAN_SCRAPE_API_TOKEN (minimal 16 karakter)');
  if (endpoint && !allowedHosts.includes(endpoint.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, ''))) {
    missing.push('IRFAN_SCRAPE_ALLOWED_HOSTS (hostname endpoint harus cocok persis)');
  }

  return { enabled, endpoint, endpointHost: endpoint?.hostname || '', token, allowedHosts, timeoutMs, thinking, useFast, model, configured, missing };
}

async function readBoundedBody(response, maxBytes = MAX_RESPONSE_BYTES) {
  const declared = Number(response.headers?.get?.('content-length') || 0);
  if (declared > maxBytes) throw new AiScrapeError('RESPONSE_TOO_LARGE', 'Respons AI scraper melebihi batas ukuran.');
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new AiScrapeError('RESPONSE_TOO_LARGE', 'Respons AI scraper melebihi batas ukuran.');
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new AiScrapeError('RESPONSE_TOO_LARGE', 'Respons AI scraper melebihi batas ukuran.');
      }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size).toString('utf8');
}

function extractText(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  if (Array.isArray(value)) {
    return value.map(item => typeof item === 'string' ? item : item?.text || item?.content || '').filter(Boolean).join('\n');
  }
  const direct = [value.output_text, value.text, value.content, value.output, value.result, value.answer, value.response, value.message];
  for (const item of direct) {
    if (typeof item === 'string' && item.trim()) return item;
    if (item && typeof item === 'object') {
      const nested = extractText(item);
      if (nested) return nested;
    }
  }
  const choice = value.choices?.[0]?.message?.content ?? value.choices?.[0]?.text;
  if (typeof choice === 'string') return choice;
  if (Array.isArray(choice)) return extractText(choice);
  if (typeof value.data === 'string') return value.data;
  if (value.data && typeof value.data === 'object') return extractText(value.data);
  return '';
}

function sanitizeResult(value) {
  const text = String(value || '')
    .replace(/\u0000/g, '')
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
  if (!text) throw new AiScrapeError('EMPTY_RESULT', 'Provider tidak mengembalikan teks hasil yang dapat dibaca.');
  return text.slice(0, MAX_RESULT_CHARS);
}

export function createIrfanScrapeAdapter({ env = process.env, fetchImpl = globalThis.fetch, lookup = dnsLookup, dnsTimeoutMs = DEFAULT_DNS_TIMEOUT_MS } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation wajib tersedia.');
  if (!Number.isSafeInteger(dnsTimeoutMs) || dnsTimeoutMs < 100 || dnsTimeoutMs > 30_000) throw new RangeError('dnsTimeoutMs harus 100–30000.');

  function getStatus() {
    try {
      const cfg = readRuntimeConfig(env);
      return {
        enabled: cfg.enabled,
        configured: cfg.configured,
        endpointHost: cfg.endpointHost || null,
        timeoutMs: cfg.timeoutMs,
        model: cfg.model,
        thinking: cfg.thinking,
        useFast: cfg.useFast,
        missing: cfg.missing
      };
    } catch (error) {
      return { enabled: false, configured: false, endpointHost: null, error: error.message, missing: [] };
    }
  }

  async function scrape({ url, prompt, settings = {} } = {}) {
    const cfg = readRuntimeConfig(env);
    if (!cfg.enabled) throw new AiScrapeError('DISABLED', 'AI scraper nonaktif. Aktifkan secara eksplisit setelah endpoint diaudit.');
    if (!cfg.endpoint || cfg.token.length < 16 || !cfg.configured) {
      throw new AiScrapeError('NOT_CONFIGURED', `Konfigurasi AI scraper belum lengkap: ${cfg.missing.join(', ')}.`);
    }

    const target = normalizeHttpUrl(url, 'URL target');
    const userPrompt = typeof prompt === 'string' ? prompt.trim() : '';
    if (!userPrompt || userPrompt.length > MAX_PROMPT_CHARS) {
      throw new AiScrapeError('INPUT_INVALID', `Prompt wajib diisi dan maksimal ${MAX_PROMPT_CHARS} karakter.`);
    }
    if (settings && (typeof settings !== 'object' || Array.isArray(settings))) {
      throw new AiScrapeError('INPUT_INVALID', 'Settings harus berupa object.');
    }

    await Promise.all([
      assertPublicHost(cfg.endpoint.hostname.replace(/^\[|\]$/g, ''), lookup, dnsTimeoutMs),
      assertPublicHost(target.hostname.replace(/^\[|\]$/g, ''), lookup, dnsTimeoutMs)
    ]);

    // Only the documented, non-secret controls are sent to the configured gateway.
    // voucher, token_router and light_house from the sample are deliberately excluded:
    // their ownership, purpose and credential semantics have not been verified.
    const payload = {
      url: target.toString(),
      prompt: userPrompt,
      settings: {
        model: cfg.model,
        thinking: cfg.thinking,
        use_fast: cfg.useFast
      }
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('timeout')), cfg.timeoutMs);
    let response;
    let raw;
    try {
      response = await fetchImpl(cfg.endpoint.toString(), {
        method: 'POST',
        redirect: 'error',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          accept: 'application/json, text/plain;q=0.9',
          'content-type': 'application/json',
          authorization: `Bearer ${cfg.token}`
        },
        body: JSON.stringify(payload)
      });
      if (!response?.ok) {
        await response?.body?.cancel?.().catch(() => {});
        if (response?.status === 401 || response?.status === 403) {
          throw new AiScrapeError('AUTH_FAILED', 'Gateway menolak autentikasi (401/403). Periksa token server; token tidak ditampilkan.');
        }
        if (response?.status === 429) throw new AiScrapeError('RATE_LIMITED', 'Gateway membatasi permintaan (429). Tunggu sebelum mencoba lagi.');
        throw new AiScrapeError('HTTP_ERROR', `Gateway mengembalikan HTTP ${Number(response?.status) || 'unknown'}.`);
      }
      // Keep the same timeout active while the response stream is read, not just until headers arrive.
      raw = await readBoundedBody(response);
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') {
        throw new AiScrapeError('TIMEOUT', `AI scraper melewati batas waktu ${cfg.timeoutMs} ms.`);
      }
      if (error instanceof AiScrapeError) throw error;
      throw new AiScrapeError('NETWORK_ERROR', 'Tidak dapat menghubungi endpoint AI scraper. Periksa jaringan dan status gateway.');
    } finally { clearTimeout(timer); }
    const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
    let resultValue;
    if (contentType.includes('json')) {
      try { resultValue = JSON.parse(raw); }
      catch { throw new AiScrapeError('RESPONSE_INVALID', 'Gateway mengembalikan JSON yang tidak valid.'); }
    } else if (/^[\s]*[\[{]/.test(raw)) {
      try { resultValue = JSON.parse(raw); }
      catch { resultValue = raw; }
    } else {
      resultValue = raw;
    }
    return {
      text: sanitizeResult(extractText(resultValue)),
      truncated: extractText(resultValue).length > MAX_RESULT_CHARS,
      endpointHost: cfg.endpoint.hostname,
      model: cfg.model
    };
  }

  return Object.freeze({ getStatus, scrape });
}

export const IRFAN_SCRAPE_LIMITS = Object.freeze({
  maxPromptChars: MAX_PROMPT_CHARS,
  maxUrlChars: MAX_URL_CHARS,
  maxResponseBytes: MAX_RESPONSE_BYTES,
  maxResultChars: MAX_RESULT_CHARS,
  defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
  maxTimeoutMs: MAX_TIMEOUT_MS
});
