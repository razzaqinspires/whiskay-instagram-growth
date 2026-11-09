import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TikTokScraper,
  normalizeTikTokUrl,
  classifyTikTokUrl,
  normalizeTikTokResult,
  sanitizeDownloadHeaders,
  TIKTOK_LIMITS
} from '../src/media/tiktok-scraper.mjs';

const videoUrl = 'https://www.tiktok.com/@creator/video/1234567890123456789';
const videoCdn = 'https://v16.tiktokcdn.com/video/test.mp4';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

test('TikTok URL normalization accepts public TikTok hosts and rejects arbitrary or insecure URLs', () => {
  assert.equal(normalizeTikTokUrl(videoUrl), videoUrl);
  assert.equal(normalizeTikTokUrl('https://vm.tiktok.com/ZM123abc/'), 'https://vm.tiktok.com/ZM123abc/');
  assert.equal(normalizeTikTokUrl('https://www.tiktok.com/@creator/story/12345?lang=id#fragment'), 'https://www.tiktok.com/@creator/story/12345?lang=id');
  assert.throws(() => normalizeTikTokUrl('http://www.tiktok.com/@creator/video/123'), /HTTPS/);
  assert.throws(() => normalizeTikTokUrl('https://tiktok.com.evil.example/@creator/video/123'), /Hanya URL TikTok/);
  assert.throws(() => normalizeTikTokUrl('https://localhost/@creator/video/123'), /Hanya URL TikTok/);
  assert.throws(() => normalizeTikTokUrl('not a url'), /tidak valid/);
});

test('TikTok post classifier identifies video, photo and story URL shapes', () => {
  assert.equal(classifyTikTokUrl(videoUrl), 'video');
  assert.equal(classifyTikTokUrl('https://www.tiktok.com/@creator/photo/123'), 'photo');
  assert.equal(classifyTikTokUrl('https://www.tiktok.com/@creator/story/123'), 'story');
});

test('download header sanitizer keeps safe headers and removes cookies, authorization and unsafe origins', () => {
  const headers = sanitizeDownloadHeaders({
    'User-Agent': 'Mozilla/5.0 Test',
    Referer: 'https://www.tiktok.com/',
    Cookie: 'sessionid=secret',
    Authorization: 'Bearer secret',
    'X-Forwarded-For': '127.0.0.1',
    Origin: 'https://evil.example'
  });
  assert.equal(headers['user-agent'], 'Mozilla/5.0 Test');
  assert.equal(headers.referer, 'https://www.tiktok.com/');
  assert.equal(headers.origin, undefined);
  assert.equal(headers.cookie, undefined);
  assert.equal(headers.authorization, undefined);
  assert.equal(headers['x-forwarded-for'], undefined);
});

test('TikWM video response normalizes metadata, statistics, music and download headers', () => {
  const result = normalizeTikTokResult({
    code: 0,
    msg: 'success',
    data: {
      id: '1234567890123456789',
      title: 'A public clip',
      play: '/video/media/play.mp4',
      hdplay: '/video/media/hdplay.mp4',
      cover: 'https://www.tikwm.com/video/cover.jpg',
      duration: 12,
      width: 1080,
      height: 1920,
      create_time: 1700000000,
      author: { id: '77', unique_id: 'creator', nickname: 'Creator Name' },
      stats: { play_count: 1000, digg_count: 200, comment_count: 15, share_count: 3 },
      music_info: { id: 'music-1', title: 'Original Sound', author: 'Artist', play: 'https://sf16-ies-music-va.tiktokcdn.com/track.mp3', original: true },
      headersDownload: { referer: 'https://www.tiktok.com/', cookie: 'not-forwarded' }
    }
  }, videoUrl, { provider: 'tikwm' });
  assert.equal(result.provider, 'tikwm');
  assert.equal(result.type, 'video');
  assert.equal(result.title, 'A public clip');
  assert.equal(result.author.username, 'creator');
  assert.equal(result.author.name, 'Creator Name');
  assert.equal(result.stats.views, 1000);
  assert.equal(result.stats.likes, 200);
  assert.equal(result.durationSeconds, 12);
  assert.equal(result.media[0].url, 'https://www.tikwm.com/video/media/hdplay.mp4');
  assert.equal(result.media[0].headersDownload.cookie, undefined);
  assert.equal(result.music.title, 'Original Sound');
  assert.equal(result.music.url, 'https://sf16-ies-music-va.tiktokcdn.com/track.mp3');
  assert.equal(result.music.original, true);
  assert.ok(result.publishedAt);
});

test('TikTok photo album normalizes all slide URLs within the ten-item cap', () => {
  const result = normalizeTikTokResult({
    code: 0,
    data: {
      type: 'photo',
      images: Array.from({ length: 12 }, (_, index) => `https://p16-common-sign.tiktokcdn.com/image-${index}.jpeg`),
      music_info: { title: 'Album sound', play: 'https://sf16-ies-music-va.tiktokcdn.com/album.mp3' }
    }
  }, videoUrl, { provider: 'tikwm' });
  assert.equal(result.type, 'slide');
  assert.equal(result.media.length, TIKTOK_LIMITS.maxMediaItems);
  assert.ok(result.media.every(item => item.type === 'image'));
});

test('custom provider is tried first and TikWM is the final fallback', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('custom.example')) return new Response('unavailable', { status: 503 });
    return jsonResponse({ code: 0, data: { id: '1', play: videoCdn, title: 'TikWM fallback' } });
  };
  const scraper = new TikTokScraper({
    fetchImpl,
    providerUrls: 'https://api.custom.example/resolve',
    minTikwmIntervalMs: 0
  });
  const result = await scraper.fetchMediaInfo(videoUrl);
  assert.equal(result.provider, 'tikwm');
  assert.equal(result.providerFallback, true);
  assert.match(result.providerErrors[0], /HTTP 503/);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].init.body), { url: videoUrl });
  assert.equal(calls[1].init.method, 'POST');
  assert.match(calls[1].init.body, /hd=1/);
});

test('custom provider accepts a normalized result and forwards safe headers to its allowlisted CDN', async () => {
  let downloadHeaders;
  const fetchImpl = async (url, init) => {
    if (String(url).includes('api.custom.example')) {
      return jsonResponse({
        success: true,
        data: {
          type: 'video',
          title: 'Custom scraper result',
          video_url: videoCdn,
          headersDownload: { 'User-Agent': 'ProviderAgent/1.0', Referer: 'https://www.tiktok.com/', Cookie: 'never-forward' },
          author: { username: 'creator' }
        }
      });
    }
    downloadHeaders = init.headers;
    return new Response(Buffer.from('fake-mp4'), { headers: { 'content-type': 'video/mp4' } });
  };
  const scraper = new TikTokScraper({ fetchImpl, providerUrls: 'https://api.custom.example/resolve', minTikwmIntervalMs: 0 });
  const result = await scraper.fetchMediaInfo(videoUrl);
  const [downloaded] = await scraper.downloadResult(result);
  assert.equal(result.provider, 'custom-1');
  assert.equal(downloaded.buffer.toString(), 'fake-mp4');
  assert.equal(downloadHeaders['user-agent'], 'ProviderAgent/1.0');
  assert.equal(downloadHeaders.referer, 'https://www.tiktok.com/');
  assert.equal(downloadHeaders.cookie, undefined);
});

test('CDN redirects are checked at every hop and cannot reach unapproved hosts', async () => {
  let calls = 0;
  const scraper = new TikTokScraper({
    fetchImpl: async () => {
      calls += 1;
      return new Response(null, { status: 302, headers: { location: 'https://evil.example/file.mp4' } });
    }
  });
  await assert.rejects(() => scraper.downloadMedia({ type: 'video', url: videoCdn }), /host yang tidak diizinkan/);
  assert.equal(calls, 1);
});

test('download response enforces byte limit and content type', async () => {
  const tooLarge = new TikTokScraper({
    maxMediaBytes: 1024,
    maxTotalBytes: 1024,
    minTikwmIntervalMs: 0,
    fetchImpl: async () => new Response(Buffer.alloc(1500), { headers: { 'content-type': 'video/mp4' } })
  });
  await assert.rejects(() => tooLarge.downloadMedia({ type: 'video', url: videoCdn }), /melebihi batas/);

  const wrongMime = new TikTokScraper({
    fetchImpl: async () => new Response(Buffer.from('not-video'), { headers: { 'content-type': 'text/html' } })
  });
  await assert.rejects(() => wrongMime.downloadMedia({ type: 'video', url: videoCdn }), /tipe file tidak cocok/);
});

test('age-restricted provider errors are not bypassed or reworded as success', async () => {
  const fetchImpl = async () => jsonResponse({ code: -1, msg: 'Age restricted video is unavailable' });
  const scraper = new TikTokScraper({ fetchImpl, minTikwmIntervalMs: 0 });
  await assert.rejects(() => scraper.fetchMediaInfo('https://www.tiktok.com/@creator/story/12345'), /membatasi konten ini berdasarkan usia/);
});

test('private/invalid media hosts are rejected even when returned by a provider', () => {
  assert.throws(() => normalizeTikTokResult({ data: { play: 'https://127.0.0.1/private.mp4' } }, videoUrl), /host privat/);
  assert.throws(() => normalizeTikTokResult({ data: { play: 'http://cdn.example/video.mp4' } }, videoUrl), /wajib HTTPS/);
});

test('download failure on primary provider proceeds to backup before TikWM', async () => {
  const calls = [];
  const backupCdn = 'https://p16-common-sign.tiktokcdn.com/backup.mp4';
  const fetchImpl = async (url, init) => {
    const target = String(url);
    calls.push({ target, method: init.method || 'GET' });
    if (target.includes('primary.example')) {
      return jsonResponse({ success: true, data: { video_url: videoCdn, title: 'Primary result' } });
    }
    if (target.includes('backup.example')) {
      return jsonResponse({ success: true, data: { video_url: backupCdn, title: 'Backup result' } });
    }
    if (target === videoCdn) return new Response('not found', { status: 404 });
    if (target === backupCdn) return new Response(Buffer.from('backup-video'), { headers: { 'content-type': 'video/mp4' } });
    throw new Error(`Unexpected request ${target}`);
  };
  const scraper = new TikTokScraper({
    fetchImpl,
    providerUrls: 'https://primary.example/resolve,https://backup.example/resolve',
    minTikwmIntervalMs: 0
  });
  const { result, items } = await scraper.fetchAndDownload(videoUrl);
  assert.equal(result.provider, 'custom-2');
  assert.equal(result.providerFallback, true);
  assert.match(result.providerErrors[0], /custom-1/);
  assert.equal(items[0].buffer.toString(), 'backup-video');
  assert.deepEqual(calls.map(call => call.target.includes('primary.example') ? 'primary' : call.target.includes('backup.example') ? 'backup' : call.target === videoCdn ? 'primary-cdn' : 'backup-cdn'), ['primary', 'primary-cdn', 'backup', 'backup-cdn']);
});

test('explicit HTTP 403 access restriction stops resolver fallback', async () => {
  let calls = 0;
  const scraper = new TikTokScraper({
    fetchImpl: async () => { calls += 1; return new Response('forbidden', { status: 403 }); },
    providerUrls: 'https://primary.example/resolve',
    minTikwmIntervalMs: 0
  });
  await assert.rejects(() => scraper.fetchAndDownload(videoUrl), /tidak melewati pembatasan akses/);
  assert.equal(calls, 1);
});

test('audio-only download uses the normalized music track and no video item', async () => {
  const audioUrl = 'https://sf16-ies-music-va.tiktokcdn.com/track.mp3';
  const fetchImpl = async (url, init) => {
    if (String(url).includes('api.custom.example')) {
      return jsonResponse({ success: true, data: { video_url: videoCdn, music_info: { title: 'Song', play: audioUrl } } });
    }
    assert.equal(String(url), audioUrl);
    return new Response(Buffer.from('audio-data'), { headers: { 'content-type': 'audio/mpeg' } });
  };
  const scraper = new TikTokScraper({ fetchImpl, providerUrls: 'https://api.custom.example/resolve', minTikwmIntervalMs: 0 });
  const { items } = await scraper.fetchAndDownload(videoUrl, { audioOnly: true });
  assert.equal(items.length, 1);
  assert.equal(items[0].type, 'audio');
  assert.equal(items[0].buffer.toString(), 'audio-data');
});
