import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, mkdir, lstat, writeFile, rename, chmod, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { config, PROJECT_ROOT } from '../../config.mjs';

const require = createRequire(import.meta.url);
const ADAPTER_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULTS = Object.freeze({
  enabled: true,
  width: 1594,
  height: 3200,
  offsetY: -650,
  offsetX: -300,
  zoom: 1,
  textZoom: 1,
  areaWidth: 650,
  areaHeight: 800,
  lineSpacing: 1,
  boldMode: 'tebal',
  boldSize: 1,
  stretchY: 2,
  stretchX: 1,
  maxChars: 10,
  maxWords: 2,
  maxFontSize: 400,
  minFontSize: 20,
  color: '#18362F',
  fallbackBackground: true,
  fallbackBackgroundColor: '#F3EEE5',
  quality: 96,
  backgroundUrl: 'https://raw.githubusercontent.com/rzkrohan/image-canvas/refs/heads/main/IMG-20261110-WA0238.jpg',
  fontPath: './library/assets/fonts/arialnarrow.ttf',
  fontFamily: 'Arial Narrow',
  maxBackgroundBytes: 12 * 1024 * 1024,
  timeoutMs: 15000,
  responseStyle: 'compact'
});

const SAFE_FONT = /^[\w -]{1,48}$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const ALLOWED_RESPONSE_STYLES = new Set(['compact', 'standard', 'detailed', 'minimal']);
const MUTABLE_CONFIG_KEYS = new Set([
  'enabled', 'width', 'height', 'offsetY', 'offsetX', 'zoom', 'textZoom',
  'areaWidth', 'areaHeight', 'lineSpacing', 'boldMode', 'boldSize',
  'stretchY', 'stretchX', 'maxChars', 'maxWords', 'maxFontSize', 'minFontSize',
  'color', 'fallbackBackground', 'fallbackBackgroundColor', 'quality',
  'maxBackgroundBytes', 'timeoutMs', 'responseStyle', 'backgroundUrl', 'fontFamily'
]);
const MIN_DIMENSION = 256;
const MAX_DIMENSION = 4096;

function finiteNumber(value, fallback, min, max, label) {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new RangeError(`${label} harus berada pada rentang ${min}–${max}.`);
  }
  return number;
}

function normalizeConfig(input = {}) {
  for (const key of Object.keys(input || {})) {
    if (!Object.hasOwn(DEFAULTS, key)) throw new TypeError(`Konfigurasi tidak dikenal: ${key}.`);
  }
  const value = { ...DEFAULTS, ...input };
  if (typeof value.enabled !== 'boolean') throw new TypeError('enabled harus boolean.');
  for (const key of ['width', 'height']) value[key] = finiteNumber(value[key], DEFAULTS[key], MIN_DIMENSION, MAX_DIMENSION, key);
  for (const key of ['areaWidth', 'areaHeight']) value[key] = finiteNumber(value[key], DEFAULTS[key], 64, MAX_DIMENSION, key);
  for (const key of ['offsetX', 'offsetY']) value[key] = finiteNumber(value[key], DEFAULTS[key], -MAX_DIMENSION, MAX_DIMENSION, key);
  for (const key of ['zoom', 'textZoom', 'stretchX', 'stretchY']) value[key] = finiteNumber(value[key], DEFAULTS[key], 0.1, 4, key);
  value.lineSpacing = finiteNumber(value.lineSpacing, DEFAULTS.lineSpacing, 0.5, 3, 'lineSpacing');
  value.boldSize = finiteNumber(value.boldSize, DEFAULTS.boldSize, 0, 12, 'boldSize');
  value.maxChars = finiteNumber(value.maxChars, DEFAULTS.maxChars, 1, 40, 'maxChars');
  value.maxWords = finiteNumber(value.maxWords, DEFAULTS.maxWords, 1, 8, 'maxWords');
  value.maxFontSize = finiteNumber(value.maxFontSize, DEFAULTS.maxFontSize, 24, 512, 'maxFontSize');
  value.minFontSize = finiteNumber(value.minFontSize, DEFAULTS.minFontSize, 8, 128, 'minFontSize');
  value.quality = Math.round(finiteNumber(value.quality, DEFAULTS.quality, 60, 100, 'quality'));
  value.maxBackgroundBytes = Math.round(finiteNumber(value.maxBackgroundBytes, DEFAULTS.maxBackgroundBytes, 1024, 20 * 1024 * 1024, 'maxBackgroundBytes'));
  value.timeoutMs = Math.round(finiteNumber(value.timeoutMs, DEFAULTS.timeoutMs, 1000, 30000, 'timeoutMs'));
  if (!['tebal', 'normal'].includes(value.boldMode)) throw new TypeError('boldMode hanya tebal atau normal.');
  if (!HEX_COLOR.test(value.color)) throw new TypeError('color harus hex #RRGGBB.');
  if (typeof value.fallbackBackground !== 'boolean') throw new TypeError('fallbackBackground harus boolean.');
  if (!HEX_COLOR.test(value.fallbackBackgroundColor)) throw new TypeError('fallbackBackgroundColor harus hex #RRGGBB.');
  if (!SAFE_FONT.test(value.fontFamily)) throw new TypeError('fontFamily tidak valid.');
  if (typeof value.fontPath !== 'string' || path.isAbsolute(value.fontPath) || value.fontPath.includes('..') || !value.fontPath.startsWith('./library/assets/fonts/')) {
    throw new TypeError('fontPath harus berada di library/assets/fonts/ dan tidak boleh memakai path traversal.');
  }
  if (!ALLOWED_RESPONSE_STYLES.has(value.responseStyle)) throw new TypeError('responseStyle tidak dikenal.');
  const background = new URL(value.backgroundUrl);
  if (background.protocol !== 'https:' || !['raw.githubusercontent.com'].includes(background.hostname)) {
    throw new TypeError('backgroundUrl harus HTTPS pada host aset yang disetujui.');
  }
  return Object.freeze(value);
}

export function createKatabgConfigStore({
  filePath = path.join(PROJECT_ROOT, 'data', 'contributed-config', 'katabg.json'),
  projectRoot = PROJECT_ROOT
} = {}) {
  const target = path.resolve(filePath);
  const dataRoot = path.resolve(projectRoot, 'data');
  if (!target.startsWith(`${dataRoot}${path.sep}`)) {
    throw new TypeError('File config kontribusi harus berada di dalam data/ privat.');
  }
  let cached = null;
  let writeQueue = Promise.resolve();

  async function readCurrent() {
    if (cached) return cached;
    try {
      const info = await lstat(target);
      if (info.isSymbolicLink() || !info.isFile()) throw new TypeError('File config KATABG harus file reguler, bukan symlink/direktori.');
      const raw = JSON.parse(await readFile(target, 'utf8'));
      cached = normalizeConfig(raw);
    } catch (error) {
      if (error.code === 'ENOENT') cached = normalizeConfig();
      else throw error;
    }
    return cached;
  }

  async function persist(next) {
    const normalized = normalizeConfig(next);
    const body = `${JSON.stringify(normalized, null, 2)}\n`;
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    const temp = `${target}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temp, body, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    try {
      await rename(temp, target);
      await chmod(target, 0o600);
      cached = normalized;
      return cached;
    } catch (error) {
      await rm(temp, { force: true }).catch(() => {});
      throw error;
    }
  }

  return {
    async get() { return readCurrent(); },
    async set(key, value) {
      if (!MUTABLE_CONFIG_KEYS.has(key)) throw new TypeError(`Key tidak dapat diubah: ${key}.`);
      const operation = async () => persist({ ...(await readCurrent()), [key]: value });
      const result = writeQueue.then(operation, operation);
      writeQueue = result.catch(() => {});
      return result;
    },
    async reset() {
      const operation = () => persist({ ...DEFAULTS });
      const result = writeQueue.then(operation, operation);
      writeQueue = result.catch(() => {});
      return result;
    },
    path: target
  };
}

function splitLines(content, maxChars, maxWords) {
  const words = String(content).trim().split(/\s+/u).filter(Boolean);
  if (!words.length) throw new TypeError('Teks gambar wajib diisi.');
  const lines = [];
  let line = [];
  for (const word of words) {
    if (word.length > maxChars) {
      if (line.length) lines.push(line.join(' '));
      line = [];
      for (let offset = 0; offset < word.length; offset += maxChars) lines.push(word.slice(offset, offset + maxChars));
      continue;
    }
    const projected = line.length ? `${line.join(' ')} ${word}` : word;
    if (line.length >= maxWords || projected.length > maxChars) {
      if (line.length) lines.push(line.join(' '));
      line = [word];
    } else line.push(word);
  }
  if (line.length) lines.push(line.join(' '));
  return lines;
}

async function fetchBackground(url, { maxBytes, timeoutMs, fetchImpl = fetch }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Waktu unduh background habis.')), timeoutMs);
  timer.unref?.();
  try {
    const response = await fetchImpl(url, { signal: controller.signal, redirect: 'error', headers: { accept: 'image/jpeg,image/png,image/webp' } });
    if (!response.ok) throw new Error(`Background gagal diunduh (HTTP ${response.status}).`);
    const type = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) throw new TypeError(`Content-Type background tidak diizinkan: ${type || 'missing'}.`);
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > maxBytes) throw new RangeError('Background melebihi batas ukuran.');
    const data = Buffer.from(await response.arrayBuffer());
    if (!data.length || data.length > maxBytes) throw new RangeError('Ukuran background kosong atau melewati batas.');
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function loadFont(canvasApi, fontPath, family) {
  try {
    const font = await readFile(fontPath);
    if (!canvasApi.GlobalFonts.has(family)) canvasApi.GlobalFonts.register(font, family);
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return false;
  }
}

function renderText(ctx, content, options) {
  const lines = splitLines(content, options.maxChars, options.maxWords);
  let fontSize = options.maxFontSize;
  const minFontSize = Math.min(options.minFontSize, fontSize);
  let fits = false;
  while (fontSize >= minFontSize) {
    const currentSize = fontSize * options.textZoom;
    ctx.font = `${currentSize}px "${options.fontFamily}"`;
    const extra = options.boldMode === 'tebal' ? options.boldSize * 2 : 0;
    const lineHeight = currentSize * options.lineSpacing * options.stretchY;
    const widthFits = lines.every(line => ctx.measureText(line).width * options.stretchX + extra * options.stretchX <= options.areaWidth);
    const heightFits = lines.length * lineHeight <= options.areaHeight;
    if (widthFits && heightFits) { fits = true; break; }
    fontSize -= 2;
  }
  if (!fits) throw new RangeError('Teks terlalu panjang untuk area canvas. Pendekkan teks atau sesuaikan area/font di adapter.');
  const finalFontSize = fontSize * options.textZoom;
  ctx.font = `${finalFontSize}px "${options.fontFamily}"`;
  ctx.fillStyle = options.color;
  ctx.strokeStyle = options.color;
  ctx.lineJoin = 'round';
  ctx.lineWidth = options.boldMode === 'tebal' ? options.boldSize * 2 : 0;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const centerX = options.width / 2 + options.offsetX;
  const centerY = options.height / 2 + options.offsetY;
  const lineHeight = finalFontSize * options.lineSpacing * options.stretchY;
  const totalHeight = lines.length * lineHeight;
  const startY = centerY - totalHeight / 2 + lineHeight / 2;
  lines.forEach((line, index) => {
    ctx.save();
    ctx.translate(centerX, startY + index * lineHeight);
    ctx.scale(options.stretchX, options.stretchY);
    if (options.boldMode === 'tebal') ctx.strokeText(line, 0, 0);
    ctx.fillText(line, 0, 0);
    ctx.restore();
  });
  return { lines: lines.length, fontSize: finalFontSize };
}

export function createImageCanvasEngine({ canvasApi = null, fetchImpl = fetch, fontPath = null } = {}) {
  let apiPromise;
  const getCanvasApi = async () => {
    if (canvasApi) return canvasApi;
    apiPromise ||= import('@napi-rs/canvas');
    return apiPromise;
  };

  return {
    async render({ text, config: inputConfig = {}, backgroundBuffer = null } = {}) {
      const options = normalizeConfig(inputConfig);
      if (!options.enabled) throw new Error('Fitur Image Canvas sedang dinonaktifkan.');
      const content = String(text ?? '').trim();
      if (!content || content.length > 500) throw new RangeError('Teks wajib diisi dan maksimal 500 karakter.');
      const api = await getCanvasApi();
      const resolvedFont = fontPath || path.resolve(PROJECT_ROOT, options.fontPath);
      await loadFont(api, resolvedFont, options.fontFamily);
      let bg = null;
      let fallbackUsed = false;
      try {
        const background = backgroundBuffer || await fetchBackground(options.backgroundUrl, {
          maxBytes: options.maxBackgroundBytes,
          timeoutMs: options.timeoutMs,
          fetchImpl
        });
        bg = await api.loadImage(background);
      } catch (error) {
        if (!options.fallbackBackground) throw error;
        fallbackUsed = true;
      }
      const canvas = api.createCanvas(options.width, options.height);
      const ctx = canvas.getContext('2d');
      if (bg) {
        const bgWidth = options.width * options.zoom;
        const bgHeight = options.height * options.zoom;
        ctx.drawImage(bg, (options.width - bgWidth) / 2, (options.height - bgHeight) / 2, bgWidth, bgHeight);
      } else {
        ctx.fillStyle = options.fallbackBackgroundColor;
        ctx.fillRect(0, 0, options.width, options.height);
      }
      const textLayout = renderText(ctx, content, options);
      const buffer = await canvas.encode('jpeg', options.quality);
      return { buffer, mimetype: 'image/jpeg', width: options.width, height: options.height, textLayout, fallbackUsed, options };
    }
  };
}

const engine = createImageCanvasEngine();
const configStore = createKatabgConfigStore();

function formatHelp(prefix) {
  return [
    '━━ KATA BANG WINDAH · IMAGE CANVAS ━━',
    `${prefix}katabg <teks> — buat gambar quote`,
    `${prefix}katabg config — lihat konfigurasi adapter`,
    `${prefix}katabg set <key> <value> — ubah konfigurasi secara persisten`,
    `${prefix}katabg reset — kembalikan konfigurasi default`,
    `${prefix}katabg preview <teks> — alias render`,
    '',
    'Layout/warna/font/ukuran/response style diatur oleh control plane WHISKAY, bukan source kontributor.',
    'Sumber dan credit: Rizkyrohan · WhatsApp channel 0029VbDWBmtA89MamPba8q3f'
  ].join('\n');
}

function formatResult(result, responseStyle) {
  if (responseStyle === 'minimal') return 'Canvas selesai dibuat.';
  if (responseStyle === 'compact') return `Canvas selesai · ${result.width}×${result.height} · ${result.buffer.length.toLocaleString('id-ID')} byte${result.fallbackUsed ? ' · background fallback' : ''}`;
  const lines = [
    '━━ IMAGE CANVAS RESULT ━━',
    `Resolusi: ${result.width}×${result.height}`,
    `Baris teks: ${result.textLayout.lines}`,
    `Ukuran: ${result.buffer.length.toLocaleString('id-ID')} byte`,
    `Background: ${result.fallbackUsed ? 'fallback lokal' : 'asset kontribusi'}`
  ];
  if (responseStyle === 'detailed') lines.push(`Ukuran font: ${result.textLayout.fontSize.toFixed(1)}px`, 'Renderer: @napi-rs/canvas');
  return lines.join('\n');
}

const plugin = {
  name: 'contributed-katabg-adapter',
  commands: [{
    name: 'katabg',
    aliases: ['katabangwaindah', 'windahcanvas'],
    category: 'Media Processing',
    usage: '<teks|config|help>',
    description: 'Buat gambar quote Kata Bang Windah melalui kontribusi canvas terisolasi',
    async execute({ args = [], rawArgs = '', reply, sock, key, msg, prefix = '.' }) {
      const action = String(args[0] || '').toLowerCase();
      if (!rawArgs.trim() || ['help', '-h', '--help'].includes(action)) return reply(formatHelp(prefix));
      if (action === 'config') {
        const current = await configStore.get();
        return reply([
          '━━ KATABG ADAPTER CONFIG ━━',
          `Enabled: ${current.enabled}`,
          `Canvas: ${current.width}×${current.height}`,
          `Offset: ${current.offsetX}, ${current.offsetY}`,
          `Area: ${current.areaWidth}×${current.areaHeight}`,
          `Font: ${current.fontFamily}`,
          `Bold: ${current.boldMode} (${current.boldSize})`,
          `Color: ${current.color}`,
          `Fallback background: ${current.fallbackBackground ? 'ON' : 'OFF'}`,
          `Response: ${current.responseStyle}`,
          `Config file: ${configStore.path}`,
          'Gunakan .katabg set <key> <value> untuk mengubah pengaturan.',
          'Key: width, height, offsetX, offsetY, areaWidth, areaHeight, zoom, textZoom, lineSpacing, boldMode, boldSize, stretchX, stretchY, maxChars, maxWords, maxFontSize, minFontSize, color, quality, responseStyle, fallbackBackground, fallbackBackgroundColor, backgroundUrl, fontFamily, enabled.'
        ].join('\n'));
      }
      if (action === 'set') {
        const keyName = String(args[1] || '').trim();
        const rawValue = args.slice(2).join(' ').trim();
        if (!keyName || !rawValue) return reply(`Format: ${prefix}katabg set <key> <value>\nContoh: ${prefix}katabg set responseStyle detailed`);
        let value;
        try { value = JSON.parse(rawValue); } catch { value = rawValue; }
        try {
          const updated = await configStore.set(keyName, value);
          return reply(`Config ${keyName} berhasil disimpan.\nGunakan .katabg config untuk melihat pengaturan.`);
        } catch (error) {
          return reply(`Config ditolak: ${String(error?.message || error).slice(0, 300)}`);
        }
      }
      if (action === 'reset') {
        try { await configStore.reset(); return reply('Konfigurasi KATABG dikembalikan ke default.'); }
        catch (error) { return reply(`Reset config gagal: ${String(error?.message || error).slice(0, 300)}`); }
      }
      const text = action === 'preview' ? rawArgs.trim().slice(args[0].length).trim() : rawArgs.trim();
      if (!text) return reply(`Teks belum diisi.\n${formatHelp(prefix)}`);
      if (typeof sock?.sendMessage !== 'function' || !key?.remoteJid) return reply('Socket WhatsApp belum siap mengirim media.');
      await reply('Membuat image canvas…');
      try {
        const result = await engine.render({ text, config: await configStore.get() });
        await sock.sendMessage(key.remoteJid, {
          image: result.buffer,
          mimetype: result.mimetype,
          caption: formatResult(result, result.options.responseStyle)
        }, { quoted: msg });
      } catch (error) {
        const detail = String(error?.message || error).slice(0, 500);
        await reply(`Image Canvas gagal: ${detail}`);
      }
    }
  }]
};

export { DEFAULTS as KATABG_DEFAULTS, normalizeConfig as normalizeKatabgConfig, splitLines as splitKatabgLines, MUTABLE_CONFIG_KEYS };
export const katabgConfigStore = configStore;
export default plugin;
