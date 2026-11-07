import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { config } from '../config.mjs';

export const API_BASE = 'https://academi.cx/api/v1';
export const INPUT_ROOT = config.academix.inboxDir;
export const INLINE_UPLOAD_LIMIT = 4 * 1024 * 1024;
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_REPORT_BYTES = 20 * 1024 * 1024;
export const MIN_WORDS = 125;
export const MAX_WORDS = 50_000;

const ALLOWED_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'txt']);
const MIME_TYPES = Object.freeze({
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain'
});
const PRODUCT_MAP = Object.freeze({
  ai: ['ai'],
  similarity: ['similarity'],
  full: ['ai', 'similarity']
});
const STATUS_VALUES = new Set(['processing', 'complete', 'partial', 'failed']);

export function countWords(value) {
  return (String(value ?? '').match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || []).length;
}

export function productsForMode(mode) {
  const products = PRODUCT_MAP[String(mode || '').toLowerCase()];
  if (!products) throw new TypeError('Mode harus ai, similarity, atau full.');
  return [...products];
}

export function apiKeyFromEnv(env = process.env) {
  const configuredName = /^[A-Z][A-Z0-9_]{2,80}$/.test(config.academix.apiKeyEnv || '')
    ? config.academix.apiKeyEnv
    : 'ACADEMICX_KEY';
  const key = String(env[configuredName] || env.ACADEMICX_KEY || env.ACX_KEY || '').trim();
  return key || null;
}

function redactText(value, secret = '') {
  let text = String(value || 'Permintaan Academi.cx gagal.');
  if (secret) text = text.split(secret).join('[REDACTED]');
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:acx|sk|pk)_[A-Za-z0-9_-]{8,}\b/gi, '[REDACTED]')
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[URL]')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .slice(0, 240);
}

function safeCheckId(value) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(id)) throw new TypeError('Check ID tidak valid.');
  return id;
}

function safeLabel(value, fallback = 'WHISKAY document review') {
  return String(value || fallback).replace(/[\u0000-\u001f\u007f<>]/g, ' ').trim().slice(0, 120) || fallback;
}

function validatePublicHttpsUrl(value, label) {
  let url;
  try { url = new URL(String(value || '')); }
  catch { throw new Error(`${label} tidak valid.`); }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (url.protocol !== 'https:' || url.username || url.password || !host || isIP(host)
    || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')
    || host.endsWith('.internal') || host.endsWith('.test') || host.endsWith('.invalid')) {
    throw new Error(`${label} harus menggunakan HTTPS publik tanpa credential atau host lokal.`);
  }
  return url;
}

export function validateSignedUploadUrl(value) {
  return validatePublicHttpsUrl(value, 'Signed upload URL');
}

async function boundedBuffer(response, maxBytes) {
  const announced = Number(response.headers?.get?.('content-length') || 0);
  if (announced > maxBytes) throw new RangeError(`Report melebihi batas unduh ${maxBytes} byte.`);
  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new RangeError(`Report melebihi batas unduh ${maxBytes} byte.`);
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new RangeError(`Report melebihi batas unduh ${maxBytes} byte.`);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock?.();
  }
  return Buffer.concat(chunks, total);
}

async function parseResponse(response) {
  const raw = await response.text();
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch { return { message: raw.slice(0, 500) }; }
}

function errorFromResponse(response, data, key) {
  const code = typeof data?.error?.code === 'string' ? data.error.code : '';
  const known = {
    400: 'Permintaan ditolak. Periksa input dan format dokumen.',
    401: 'API key Academi.cx tidak valid atau sudah dicabut.',
    403: 'API key tidak memiliki hak akses untuk operasi ini.',
    404: 'Check tidak ditemukan pada akun API tersebut.',
    409: 'Laporan belum siap atau status check belum memungkinkan operasi ini.',
    422: 'Dokumen tidak memenuhi validasi provider.',
    429: 'Batas pemeriksaan yang berjalan bersamaan tercapai. Tunggu check lain selesai.',
    500: 'Layanan Academi.cx mengalami gangguan sementara.'
  };
  const message = known[response.status] || `Academi.cx API error HTTP ${response.status}.`;
  const error = new Error(redactText(`${message}${code ? ` (${code})` : ''}`, key));
  error.status = response.status;
  error.code = code || 'ACADEMIX_API_ERROR';
  return error;
}

async function apiRequest(endpoint, {
  method = 'GET', headers = {}, body, env = process.env,
  fetchImpl = globalThis.fetch, timeoutMs = config.academix.timeoutMs
} = {}) {
  const key = apiKeyFromEnv(env);
  if (!key) throw new Error('API key belum diatur. Tambahkan ACADEMICX_KEY ke .env.');
  if (typeof fetchImpl !== 'function') throw new Error('Fetch API tidak tersedia. Gunakan Node.js 22.');
  const url = new URL(`${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`);
  if (url.origin !== 'https://academi.cx' || !url.pathname.startsWith('/api/v1/')) throw new Error('Endpoint API tidak diizinkan.');
  let response;
  try {
    response = await fetchImpl(url, {
      method, body, redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: 'application/json', Authorization: `Bearer ${key}`, ...headers }
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new Error(`Koneksi Academi.cx timeout setelah ${timeoutMs} ms.`);
    throw new Error(redactText(error.message, key));
  }
  const data = await parseResponse(response);
  if (!response.ok) throw errorFromResponse(response, data, key);
  return data;
}

async function resolveInput(input, {
  maxFileBytes = config.academix.maxFileBytes,
  maxTextChars = config.academix.maxTextChars,
  inputRoot = INPUT_ROOT
} = {}) {
  const value = String(input || '').trim();
  if (!value) throw new TypeError('Teks atau nama file tidak boleh kosong.');
  const looksLikeFile = Boolean(path.extname(value)) || value.startsWith('./') || value.startsWith('../') || path.isAbsolute(value);
  if (!looksLikeFile) {
    if (value.length > maxTextChars) throw new RangeError(`Teks melebihi batas lokal ${maxTextChars} karakter. Gunakan file pada data/academic-inputs/.`);
    const words = countWords(value);
    if (words < MIN_WORDS) throw new RangeError(`Teks minimal ${MIN_WORDS} kata; terdeteksi ${words} kata.`);
    if (words > MAX_WORDS) throw new RangeError(`Teks melebihi batas ${MAX_WORDS} kata.`);
    return { kind: 'text', text: value, words };
  }

  const root = path.resolve(inputRoot);
  const candidate = path.resolve(root, value);
  const prefix = `${root}${path.sep}`;
  if (!candidate.startsWith(prefix)) throw new Error('File hanya boleh diambil dari direktori input Academi.cx yang dikonfigurasi.');
  const extension = path.extname(value).slice(1).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) throw new TypeError('Format file harus PDF, DOC, DOCX, atau TXT.');

  let rootReal;
  try { rootReal = await fs.realpath(root); }
  catch (error) {
    if (error.code === 'ENOENT') throw new Error('Folder data/academic-inputs/ belum tersedia. Buat folder tersebut lalu salin dokumen ke dalamnya.');
    throw error;
  }
  const linkInfo = await fs.lstat(candidate).catch(error => {
    if (error.code === 'ENOENT') throw new Error(`File tidak ditemukan di data/academic-inputs/: ${path.basename(value)}`);
    throw error;
  });
  if (linkInfo.isSymbolicLink() || !linkInfo.isFile()) throw new Error('Input harus regular file dan bukan symbolic link.');
  const candidateReal = await fs.realpath(candidate).catch(error => {
    if (error.code === 'ENOENT') throw new Error(`File tidak ditemukan di data/academic-inputs/: ${path.basename(value)}`);
    throw error;
  });
  if (!candidateReal.startsWith(`${rootReal}${path.sep}`)) throw new Error('Path file berada di luar direktori input yang diizinkan.');

  const handle = await fs.open(candidateReal, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error('Input harus regular file.');
    if (info.size < 1 || info.size > Math.min(maxFileBytes, MAX_FILE_BYTES)) {
      throw new RangeError(`Ukuran file harus 1 byte sampai ${Math.min(maxFileBytes, MAX_FILE_BYTES)} byte.`);
    }
    const buffer = await handle.readFile();
    if (buffer.length !== info.size) throw new Error('File berubah saat dibaca. Ulangi setelah file stabil.');
    return {
      kind: 'file', buffer, fileName: path.basename(candidateReal),
      size: info.size, extension
    };
  } finally {
    await handle.close();
  }
}

export async function submitCheck(input, products = ['ai', 'similarity'], {
  env = process.env,
  fetchImpl = globalThis.fetch,
  name,
  maxFileBytes = config.academix.maxFileBytes,
  maxTextChars = config.academix.maxTextChars,
  timeoutMs = config.academix.timeoutMs,
  inputRoot = INPUT_ROOT,
  idempotencyKey = randomUUID()
} = {}) {
  const key = apiKeyFromEnv(env);
  if (!key) throw new Error('API key belum diatur. Tambahkan ACADEMICX_KEY ke .env.');
  const allowed = new Set(['ai', 'similarity']);
  if (!Array.isArray(products) || !products.length || products.length > 2
    || products.some(item => !allowed.has(item)) || new Set(products).size !== products.length) {
    throw new TypeError('Produk pemeriksaan hanya boleh ai dan/atau similarity.');
  }
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(String(idempotencyKey))) throw new TypeError('Idempotency key tidak valid.');
  const resolved = await resolveInput(input, { maxFileBytes, maxTextChars, inputRoot });
  const label = safeLabel(name || (resolved.kind === 'file' ? resolved.fileName : 'WHISKAY document review'));

  if (resolved.kind === 'text') {
    const result = await apiRequest('/checks', {
      method: 'POST', env, fetchImpl, timeoutMs,
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ text: resolved.text, products, name: label })
    });
    return { ...result, submittedWords: resolved.words, products };
  }

  const mime = MIME_TYPES[resolved.extension];
  let result;
  if (resolved.size <= INLINE_UPLOAD_LIMIT) {
    const form = new FormData();
    form.append('file', new Blob([resolved.buffer], { type: mime }), resolved.fileName);
    for (const product of products) form.append('products', product);
    form.append('name', label);
    result = await apiRequest('/checks', {
      method: 'POST', env, fetchImpl, timeoutMs,
      headers: { 'Idempotency-Key': idempotencyKey }, body: form
    });
  } else {
    const upload = await apiRequest('/uploads', {
      method: 'POST', env, fetchImpl, timeoutMs,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: resolved.fileName, content_type: mime, size_bytes: resolved.size })
    });
    const signedUrl = validateSignedUploadUrl(upload.upload_url);
    if (!upload.upload_id || !upload.content_type) throw new Error('Metadata signed upload Academi.cx tidak lengkap.');
    let put;
    try {
      put = await fetchImpl(signedUrl, {
        method: 'PUT', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
        headers: { 'Content-Type': upload.content_type }, body: resolved.buffer
      });
    } catch {
      throw new Error('Upload ke temporary storage Academi.cx gagal atau timeout. Signed URL tidak ditampilkan demi keamanan.');
    }
    if (!put.ok) throw new Error(`Upload dokumen ke storage gagal (HTTP ${put.status}).`);
    result = await apiRequest('/checks', {
      method: 'POST', env, fetchImpl, timeoutMs,
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ upload_id: upload.upload_id, products, name: label })
    });
  }
  return { ...result, products, submittedBytes: resolved.size };
}

export async function getCheck(id, {
  env = process.env, fetchImpl = globalThis.fetch,
  timeoutMs = config.academix.timeoutMs, detail = 'summary'
} = {}) {
  const safeId = encodeURIComponent(safeCheckId(id));
  if (!['summary', 'full'].includes(detail)) throw new TypeError('Detail check harus summary atau full.');
  const suffix = detail === 'summary' ? '?detail=summary' : '';
  return apiRequest(`/checks/${safeId}${suffix}`, { env, fetchImpl, timeoutMs });
}

export async function listChecks(limit = 10, {
  env = process.env, fetchImpl = globalThis.fetch,
  timeoutMs = config.academix.timeoutMs, startingAfter
} = {}) {
  const numeric = Number(limit);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 100) throw new RangeError('Limit list harus 1–100.');
  const query = new URLSearchParams({ limit: String(numeric) });
  if (startingAfter) query.set('starting_after', safeCheckId(startingAfter));
  return apiRequest(`/checks?${query}`, { env, fetchImpl, timeoutMs });
}

export async function getReportInfo(id, kind = 'similarity', {
  env = process.env, fetchImpl = globalThis.fetch, timeoutMs = config.academix.timeoutMs
} = {}) {
  if (!['similarity', 'pdf', 'original'].includes(kind)) throw new TypeError('Report kind harus similarity, pdf, atau original.');
  const safeId = encodeURIComponent(safeCheckId(id));
  const data = await apiRequest(`/checks/${safeId}/report?kind=${kind}`, { env, fetchImpl, timeoutMs });
  const url = validatePublicHttpsUrl(data?.url, 'URL report');
  return { ...data, url: url.toString() };
}

export async function downloadReport(id, kind = 'similarity', {
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = config.academix.timeoutMs,
  maxBytes = MAX_REPORT_BYTES
} = {}) {
  const report = await getReportInfo(id, kind, { env, fetchImpl, timeoutMs });
  let response;
  try {
    response = await fetchImpl(report.url, {
      headers: { Accept: '*/*' }, signal: AbortSignal.timeout(timeoutMs), redirect: 'error'
    });
  } catch {
    throw new Error('Unduhan report dari temporary storage gagal atau timeout. Signed URL tidak ditampilkan demi keamanan.');
  }
  if (!response.ok) throw new Error(`Unduhan report gagal (HTTP ${response.status}).`);
  const buffer = await boundedBuffer(response, maxBytes);
  if (!buffer.length) throw new RangeError('Report kosong.');
  const filename = String(report.filename || `${id}-${kind}.${kind === 'original' ? 'bin' : 'pdf'}`)
    .replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 140);
  const contentType = response.headers?.get?.('content-type') || (kind === 'original' ? 'application/octet-stream' : 'application/pdf');
  return { buffer, filename, contentType, bytes: buffer.length, expiresIn: report.expires_in || 600 };
}

export async function deleteCheck(id, {
  env = process.env, fetchImpl = globalThis.fetch, timeoutMs = config.academix.timeoutMs
} = {}) {
  const safeId = encodeURIComponent(safeCheckId(id));
  return apiRequest(`/checks/${safeId}`, { method: 'DELETE', env, fetchImpl, timeoutMs });
}

export function formatCheck(check) {
  const clean = value => String(value ?? '-').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 160);
  const status = STATUS_VALUES.has(check?.status) ? check.status : clean(check?.status);
  const lines = [
    '━━ ACADEMI.CX DOCUMENT REVIEW ━━',
    `Check ID: ${clean(check?.id)}`,
    `Nama: ${clean(check?.name)}`,
    `Status: ${status}`,
    `Kata: ${Number(check?.words || 0).toLocaleString('id-ID')}`
  ];
  if (check?.ai) lines.push('', 'ACADEMI.CX AI-WRITING INDICATOR', `Score: ${check.ai.score ?? '-'}%`, `Status: ${clean(check.ai.status)}`, `Verdict: ${clean(check.ai.verdict)}`);
  if (check?.similarity) {
    lines.push('', 'TURNITIN SIMILARITY', `Score: ${check.similarity.score ?? '-'}%`, `Status: ${clean(check.similarity.status)}`);
    const sources = Array.isArray(check.similarity.sources) ? check.similarity.sources.slice(0, 5) : [];
    for (const [index, source] of sources.entries()) {
      lines.push(`${index + 1}. ${source.percent ?? source.percent_display ?? 0}% — ${clean(source.title || source.url || 'Sumber tidak diketahui')}`);
    }
  }
  lines.push('', 'Skor AI adalah indikator, bukan bukti pasti kepengarangan. Tinjau kutipan, sumber, dan konteks secara manual.');
  return lines.join('\n').slice(0, 3700);
}

export function getFileInputRoot() {
  return INPUT_ROOT;
}
