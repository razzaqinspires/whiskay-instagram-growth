import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVideoEnhancementFilter, enhanceVideoBuffer, getVideoToolStatus, inspectVideoBuffer, VIDEO_HD_LIMITS, VIDEO_HD_PRESETS } from '../src/media/video-hd.mjs';

test('video enhancer applies a bounded 2x FFmpeg filter chain and exposes explicit limits', () => {
  const filter = buildVideoEnhancementFilter();
  assert.match(filter, /lanczos/);
  assert.match(filter, /hqdn3d/);
  assert.match(filter, /unsharp/);
  assert.match(filter, /3840/);
  assert.match(buildVideoEnhancementFilter('sharp'), /unsharp/);
  assert.match(buildVideoEnhancementFilter('clean'), /hqdn3d/);
  assert.match(buildVideoEnhancementFilter('fast'), /bicubic/);
  assert.equal(Object.keys(VIDEO_HD_PRESETS).length, 4);
  assert.throws(() => buildVideoEnhancementFilter('unknown'), /Preset video tidak dikenal/);
  assert.equal(VIDEO_HD_LIMITS.maxInputBytes, 64 * 1024 * 1024);
  assert.equal(VIDEO_HD_LIMITS.maxDurationSeconds, 300);
});

test('rejects invalid media buffers before invoking FFmpeg', async () => {
  await assert.rejects(enhanceVideoBuffer(Buffer.from('small')), /kosong atau terlalu kecil/);
  await assert.rejects(enhanceVideoBuffer('not-a-buffer'), /Buffer video/);
  await assert.rejects(inspectVideoBuffer(Buffer.from('small')), /kosong atau terlalu kecil/);
});

test('reports FFmpeg and FFprobe availability without crashing if absent', async () => {
  const status = await getVideoToolStatus();
  assert.equal(typeof status.ready, 'boolean');
  assert.ok(Object.hasOwn(status, 'ffmpeg'));
  assert.ok(Object.hasOwn(status, 'ffprobe'));
});
