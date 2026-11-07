import { spawn, spawnSync } from 'node:child_process';
import { access, chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MAX_INPUT_BYTES = 64 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 300;
const MAX_SOURCE_DIMENSION = 3840;
const MAX_OUTPUT_BYTES = 128 * 1024 * 1024;
const PROCESS_TIMEOUT_MS = 15 * 60 * 1000;

function executableCandidates(name, envValue) {
  const candidates = [];
  if (envValue) candidates.push(path.resolve(envValue));
  const lookup = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], {
    encoding: 'utf8', timeout: 3000, windowsHide: true
  });
  if (lookup.status === 0) candidates.push(...String(lookup.stdout || '').split(/\r?\n/).map(value => value.trim()).filter(Boolean));
  if (process.env.PREFIX) candidates.push(path.join(process.env.PREFIX, 'bin', name));
  candidates.push(...(process.platform === 'android' ? ['/data/data/com.termux/files/usr/bin'] : ['/usr/bin', '/usr/local/bin', '/bin']).map(dir => path.join(dir, name)));
  return [...new Set(candidates)];
}

export async function resolveMediaBinary(name) {
  if (!['ffmpeg', 'ffprobe'].includes(name)) throw new TypeError('Binary media tidak dikenal.');
  const envKey = name === 'ffmpeg' ? 'FFMPEG_PATH' : 'FFPROBE_PATH';
  for (const candidate of executableCandidates(name, process.env[envKey])) {
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {}
  }
  return null;
}

function runProcess(binary, args, { timeoutMs = 60_000, outputLimit = 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, shell: false });
    let stdout = Buffer.alloc(0);
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      if (!settled) { settled = true; reject(new Error(`${path.basename(binary)} timeout setelah ${Math.ceil(timeoutMs / 1000)} detik.`)); }
    }, timeoutMs);
    timer.unref?.();
    const append = (current, chunk) => {
      const next = Buffer.concat([current, Buffer.from(chunk)]);
      return next.length > outputLimit ? next.subarray(next.length - outputLimit) : next;
    };
    child.stdout.on('data', chunk => { stdout = append(stdout, chunk); });
    child.stderr.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-16_000); });
    child.once('error', error => {
      clearTimeout(timer);
      if (!settled) { settled = true; reject(error); }
    });
    child.once('close', code => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code !== 0) return reject(new Error(`${path.basename(binary)} keluar dengan kode ${code}: ${stderr.trim().slice(-700) || 'tidak ada detail error'}`));
      resolve({ stdout, stderr, code });
    });
  });
}

export async function getVideoToolStatus() {
  const [ffmpeg, ffprobe] = await Promise.all([resolveMediaBinary('ffmpeg'), resolveMediaBinary('ffprobe')]);
  const result = { ffmpeg: null, ffprobe: null, ready: Boolean(ffmpeg && ffprobe) };
  if (ffmpeg) {
    try { result.ffmpeg = (await runProcess(ffmpeg, ['-version'], { timeoutMs: 5000, outputLimit: 4096 })).stdout.toString().split(/\r?\n/)[0]; }
    catch (error) { result.ffmpegError = error.message; }
  }
  if (ffprobe) {
    try { result.ffprobe = (await runProcess(ffprobe, ['-version'], { timeoutMs: 5000, outputLimit: 4096 })).stdout.toString().split(/\r?\n/)[0]; }
    catch (error) { result.ffprobeError = error.message; }
  }
  result.ready = Boolean(result.ffmpeg && result.ffprobe);
  return result;
}

export const VIDEO_HD_PRESETS = Object.freeze({
  balanced: {
    label: 'Balanced',
    description: 'Lanczos 2x, denoise ringan, sharpen dan koreksi warna.',
    filter: "scale=w='min(iw*2,3840)':h='min(ih*2,3840)':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,hqdn3d=1:0.8:6:6,unsharp=5:5:0.8:5:5:0.4,eq=contrast=1.04:saturation=1.06:brightness=0.01"
  },
  sharp: {
    label: 'Detail / Sharp',
    description: 'Penajaman lebih kuat; noise sumber dapat ikut terlihat.',
    filter: "scale=w='min(iw*2,3840)':h='min(ih*2,3840)':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,hqdn3d=0.7:0.6:4:4,unsharp=5:5:1.05:5:5:0.55,eq=contrast=1.05:saturation=1.05:brightness=0"
  },
  clean: {
    label: 'Clean / Soft',
    description: 'Denoise lebih kuat dan sharpening rendah.',
    filter: "scale=w='min(iw*2,3840)':h='min(ih*2,3840)':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,hqdn3d=1.4:1.2:8:8,unsharp=5:5:0.45:5:5:0.2"
  },
  fast: {
    label: 'Fast',
    description: 'Resize bicubic lebih ringan tanpa rangkaian denoise/sharpen.',
    filter: "scale=w='min(iw*2,3840)':h='min(ih*2,3840)':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=bicubic"
  }
});

const FALLBACK_FILTERS = [
  "scale=w='min(iw*2,3840)':h='min(ih*2,3840)':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,unsharp=5:5:0.55:5:5:0.25",
  "scale=w='min(iw*2,3840)':h='min(ih*2,3840)':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=bicubic"
];

export function buildVideoEnhancementFilter(preset = 'balanced') {
  const selected = VIDEO_HD_PRESETS[String(preset || 'balanced').toLowerCase()];
  if (!selected) throw new TypeError(`Preset video tidak dikenal: ${preset}. Pilih ${Object.keys(VIDEO_HD_PRESETS).join(', ')}.`);
  return selected.filter;
}

function validateVideoBuffer(inputBuffer) {
  if (!Buffer.isBuffer(inputBuffer) || inputBuffer.length < 1024) throw new TypeError('Buffer video kosong atau terlalu kecil.');
  if (inputBuffer.length > MAX_INPUT_BYTES) throw new RangeError('Video melebihi batas input 64 MiB.');
}

function safeInputName(inputName = 'video.mp4') {
  const basename = path.basename(String(inputName || 'video.mp4')).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 90) || 'video.mp4';
  return basename.toLowerCase().endsWith('.mp4') ? basename : `${basename}.mp4`;
}

async function createPrivateWorkDir() {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-videohd-'));
  await chmod(workDir, 0o700);
  return workDir;
}

export async function inspectVideoBuffer(inputBuffer, { inputName = 'video.mp4' } = {}) {
  validateVideoBuffer(inputBuffer);
  const ffprobe = await resolveMediaBinary('ffprobe');
  if (!ffprobe) throw new Error('ffprobe tidak ditemukan. Pasang FFmpeg terlebih dahulu.');
  const workDir = await createPrivateWorkDir();
  const inputPath = path.join(workDir, safeInputName(inputName));
  try {
    await writeFile(inputPath, inputBuffer, { mode: 0o600, flag: 'wx' });
    const metadata = await probeVideoFile(inputPath, ffprobe);
    if (metadata.duration > MAX_VIDEO_SECONDS) throw new RangeError(`Durasi video maksimal ${MAX_VIDEO_SECONDS / 60} menit.`);
    if (metadata.width > MAX_SOURCE_DIMENSION || metadata.height > MAX_SOURCE_DIMENSION) throw new RangeError('Dimensi sumber terlalu besar untuk proses lokal yang aman.');
    const maxScale = Math.min(2, MAX_SOURCE_DIMENSION / metadata.width, MAX_SOURCE_DIMENSION / metadata.height);
    return {
      ...metadata,
      size: inputBuffer.length,
      maxScale: Math.round(maxScale * 100) / 100,
      canEnhance: maxScale > 1.001
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function probeVideoFile(filePath, ffprobePath = null) {
  const binary = ffprobePath || await resolveMediaBinary('ffprobe');
  if (!binary) throw new Error('ffprobe tidak ditemukan. Pasang FFmpeg terlebih dahulu.');
  const { stdout } = await runProcess(binary, [
    '-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,avg_frame_rate',
    '-show_entries', 'format=format_name,duration,size', '-of', 'json', filePath
  ], { timeoutMs: 60_000, outputLimit: 256 * 1024 });
  const parsed = JSON.parse(stdout.toString('utf8') || '{}');
  const video = (parsed.streams || []).find(stream => stream.codec_type === 'video');
  if (!video) throw new Error('File tidak memiliki video stream yang valid.');
  const duration = Number(parsed.format?.duration || 0);
  const width = Number(video.width || 0);
  const height = Number(video.height || 0);
  if (!Number.isFinite(duration) || duration <= 0 || !width || !height) throw new Error('Metadata video tidak lengkap.');
  const fpsParts = String(video.avg_frame_rate || '').split('/').map(Number);
  const fps = fpsParts.length === 2 && fpsParts[1] ? fpsParts[0] / fpsParts[1] : Number(video.avg_frame_rate) || null;
  return { width, height, duration, fps: Number.isFinite(fps) ? Math.round(fps * 100) / 100 : null, codec: video.codec_name || 'unknown', format: parsed.format?.format_name || 'unknown', hasAudio: (parsed.streams || []).some(stream => stream.codec_type === 'audio') };
}

async function encodeWithFilter(ffmpeg, inputPath, outputPath, filter, hasAudio) {
  const args = [
    '-y', '-hide_banner', '-nostdin', '-loglevel', 'error', '-i', inputPath,
    '-map', '0:v:0', '-map', '0:a?', '-vf', filter, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21',
    '-pix_fmt', 'yuv420p', ...(hasAudio ? ['-c:a', 'aac', '-b:a', '128k'] : ['-an']),
    '-movflags', '+faststart', '-max_muxing_queue_size', '2048', outputPath
  ];
  await runProcess(ffmpeg, args, { timeoutMs: PROCESS_TIMEOUT_MS, outputLimit: 16_000 });
}

export async function enhanceVideoBuffer(inputBuffer, { inputName = 'video.mp4', preset = 'balanced' } = {}) {
  validateVideoBuffer(inputBuffer);
  const selectedPreset = String(preset || 'balanced').toLowerCase();
  const primaryFilter = buildVideoEnhancementFilter(selectedPreset);
  const [ffmpeg, ffprobe] = await Promise.all([resolveMediaBinary('ffmpeg'), resolveMediaBinary('ffprobe')]);
  if (!ffmpeg || !ffprobe) throw new Error('FFmpeg dan FFprobe belum terpasang. Termux: pkg install ffmpeg | Debian/Ubuntu: apt install ffmpeg.');

  const workDir = await createPrivateWorkDir();
  const inputPath = path.join(workDir, safeInputName(inputName));
  const outputPath = path.join(workDir, 'enhanced-hd.mp4');
  const started = Date.now();
  try {
    await writeFile(inputPath, inputBuffer, { mode: 0o600, flag: 'wx' });
    const original = await probeVideoFile(inputPath, ffprobe);
    if (original.duration > MAX_VIDEO_SECONDS) throw new RangeError(`Durasi video maksimal ${MAX_VIDEO_SECONDS / 60} menit.`);
    if (original.width > MAX_SOURCE_DIMENSION || original.height > MAX_SOURCE_DIMENSION) throw new RangeError('Dimensi sumber terlalu besar untuk proses lokal yang aman.');
    const maxScale = Math.min(2, MAX_SOURCE_DIMENSION / original.width, MAX_SOURCE_DIMENSION / original.height);
    if (maxScale <= 1.001) throw new RangeError('Video sudah berada pada batas resolusi output WHISKAY; upscale 2x tidak akan memperbesar dimensi.');
    const filters = [primaryFilter, ...FALLBACK_FILTERS.filter(filter => filter !== primaryFilter)];
    let lastEncodeError = null;
    let usedFilter = null;
    for (const filter of filters) {
      try {
        await encodeWithFilter(ffmpeg, inputPath, outputPath, filter, original.hasAudio);
        usedFilter = filter;
        break;
      } catch (error) {
        lastEncodeError = error;
      }
    }
    if (!usedFilter) throw new Error(`Semua filter FFmpeg gagal: ${String(lastEncodeError?.message || 'error tidak diketahui').slice(0, 500)}`);
    const outputStat = await stat(outputPath);
    if (outputStat.size < 1024 || outputStat.size > MAX_OUTPUT_BYTES) throw new RangeError('Hasil video tidak valid atau melebihi batas output 128 MiB.');
    const enhanced = await probeVideoFile(outputPath, ffprobe);
    if (enhanced.width <= original.width || enhanced.height <= original.height) throw new Error('Resolusi tidak meningkat; sumber mungkin sudah mencapai batas 4K output.');
    const output = await readFile(outputPath);
    return {
      buffer: output,
      input: { ...original, size: inputBuffer.length },
      output: { ...enhanced, size: output.length },
      scale: `${(enhanced.width / original.width).toFixed(2)}x`,
      processingMs: Date.now() - started,
      preset: selectedPreset,
      filter: usedFilter,
      engine: 'FFmpeg local video upscale/filter pipeline'
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

export const VIDEO_HD_LIMITS = Object.freeze({ maxInputBytes: MAX_INPUT_BYTES, maxOutputBytes: MAX_OUTPUT_BYTES, maxDurationSeconds: MAX_VIDEO_SECONDS, maxDimension: MAX_SOURCE_DIMENSION });
