import test from 'node:test';
import assert from 'node:assert/strict';
import plugin, { TIKTOK_HELP, formatTikTokMetadata, parseTikTokAction } from '../src/plugins/tiktok-downloader.mjs';

const postUrl = 'https://www.tiktok.com/@creator/video/1234567890123456789';

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } });
}

test('TikTok downloader is registered as one command with stable aliases and help', () => {
  assert.equal(plugin.name, 'tiktok-downloader');
  assert.equal(plugin.commands.length, 1);
  assert.equal(plugin.commands[0].name, 'tiktok');
  assert.deepEqual(plugin.commands[0].aliases, ['tt', 'ttdl', 'tiktokdl']);
  assert.match(plugin.commands[0].usage, /audio/);
  assert.match(TIKTOK_HELP, /slide/);
  assert.match(TIKTOK_HELP, /story/);
});

test('TikTok action parser supports download, info, audio, status and help', () => {
  assert.deepEqual(parseTikTokAction([postUrl]), { action: 'download', url: postUrl });
  assert.deepEqual(parseTikTokAction(['info', postUrl]), { action: 'info', url: postUrl });
  assert.deepEqual(parseTikTokAction(['audio', postUrl]), { action: 'audio', url: postUrl });
  assert.deepEqual(parseTikTokAction(['status']), { action: 'status', url: '' });
  assert.deepEqual(parseTikTokAction(['help']), { action: 'help', url: '' });
});

test('TikTok metadata formatter includes creator, statistics and music summary', () => {
  const output = formatTikTokMetadata({
    provider: 'tikwm', type: 'video', title: 'Public caption', id: '123',
    author: { name: 'Creator', username: 'creator' },
    stats: { views: 1000, likes: 200, comments: 12, shares: 8, saves: 9, downloads: null },
    media: [{}], durationSeconds: 65, dimensions: { width: 1080, height: 1920 },
    publishedAt: '2026-11-07T00:00:00.000Z',
    music: { title: 'Original Sound', author: 'Artist', id: 'm1', original: true, url: 'https://music.example.invalid/track.mp3' }
  });
  assert.match(output, /Public caption/);
  assert.match(output, /@creator/);
  assert.match(output, /1\.080×1\.920|1080×1920/);
  assert.match(output, /Original Sound/);
  assert.match(output, /Original sound: Ya/);
  assert.doesNotMatch(output, /music\.example\.invalid/);
});

test('TikTok command downloads a public video and passes a Buffer to WhatsApp media transport', async t => {
  const previousFetch = globalThis.fetch;
  const previousEndpoints = process.env.TIKTOK_SCRAPER_API_URLS;
  const previousToken = process.env.TIKTOK_SCRAPER_API_TOKEN;
  process.env.TIKTOK_SCRAPER_API_URLS = '';
  delete process.env.TIKTOK_SCRAPER_API_TOKEN;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('tikwm.com/api/')) {
      assert.equal(init.method, 'POST');
      return jsonResponse({ code: 0, data: {
        id: '123', title: 'Example public clip', play: 'https://v16.tiktokcdn.com/video.mp4',
        author: { unique_id: 'creator', nickname: 'Creator' },
        music_info: { title: 'Original sound', author: 'Creator', play: 'https://sf16-ies-music-va.tiktokcdn.com/audio.mp3' }
      } });
    }
    assert.equal(String(url), 'https://v16.tiktokcdn.com/video.mp4');
    return new Response(Buffer.from('fake-video'), { headers: { 'content-type': 'video/mp4' } });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousEndpoints === undefined) delete process.env.TIKTOK_SCRAPER_API_URLS;
    else process.env.TIKTOK_SCRAPER_API_URLS = previousEndpoints;
    if (previousToken === undefined) delete process.env.TIKTOK_SCRAPER_API_TOKEN;
    else process.env.TIKTOK_SCRAPER_API_TOKEN = previousToken;
  });
  const replies = [];
  const media = [];
  await plugin.commands[0].execute({
    args: [postUrl],
    reply: async value => replies.push(String(value)),
    sendMedia: async (type, buffer, options) => media.push({ type, buffer, options }),
    logger: { warn() {} }
  });
  assert.equal(replies.length, 2);
  assert.match(replies[0], /Example public clip/);
  assert.match(replies[0], /Original sound/);
  assert.equal(media.length, 1);
  assert.equal(media[0].type, 'video');
  assert.ok(Buffer.isBuffer(media[0].buffer));
  assert.equal(media[0].buffer.toString(), 'fake-video');
});

test('TikTok info action does not download or send media', async t => {
  const previousFetch = globalThis.fetch;
  const previousEndpoints = process.env.TIKTOK_SCRAPER_API_URLS;
  process.env.TIKTOK_SCRAPER_API_URLS = '';
  globalThis.fetch = async () => jsonResponse({ code: 0, data: { id: '1', play: 'https://v16.tiktokcdn.com/video.mp4', title: 'Info only' } });
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousEndpoints === undefined) delete process.env.TIKTOK_SCRAPER_API_URLS;
    else process.env.TIKTOK_SCRAPER_API_URLS = previousEndpoints;
  });
  const replies = [];
  let sent = 0;
  await plugin.commands[0].execute({
    args: ['info', postUrl],
    reply: async value => replies.push(String(value)),
    sendMedia: async () => { sent += 1; },
    logger: { warn() {} }
  });
  assert.equal(sent, 0);
  assert.equal(replies.length, 1);
  assert.match(replies[0], /Info only/);
});
