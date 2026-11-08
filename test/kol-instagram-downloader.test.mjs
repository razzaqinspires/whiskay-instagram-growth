import test from 'node:test';
import assert from 'node:assert/strict';
import KolInstagramScraper, { allowedInstagramUrl, allowedMediaUrl, allowedStatusUrl } from '../src/media/kol-instagram-downloader.mjs';

const pageHtml = `<!doctype html><html><head>
<title>Instagram Downloader | KOL.ID</title>
<meta name="description" content="Download public Instagram video and slides">
<meta property="og:title" content="KOL.ID Instagram Downloader">
</head><body><script>_token: 'csrf-test-token'</script>
<div class="faq-question">Supported formats?</div><div class="faq-answer">Reels and slides</div>
<a href="https://kol.id/download-video/tiktok">TikTok</a>
</body></html>`.padEnd(1200, " ");

function responseJson(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });
}

test('accepts only canonical public Instagram post/reel/TV/story URLs', () => {
  assert.equal(allowedInstagramUrl('https://www.instagram.com/reel/ABC123/?igsh=anything'), 'https://www.instagram.com/reel/ABC123');
  assert.throws(() => allowedInstagramUrl('https://evilinstagram.com/reel/ABC123'), /instagram.com/);
  assert.throws(() => allowedInstagramUrl('https://instagram.com/accounts/login/'), /post, reel/);
  assert.throws(() => allowedInstagramUrl('http://instagram.com/p/ABC123'), /HTTPS/);
  assert.throws(() => allowedInstagramUrl('https://user:pass@instagram.com/p/ABC123'), /HTTPS/);
});

test('restricts status polling and media URLs to known HTTPS hosts', () => {
  assert.equal(allowedStatusUrl('/api/v2/downloader/status/request_123'), 'https://kol.id/api/v2/downloader/status/request_123');
  assert.throws(() => allowedStatusUrl('https://attacker.example/status/request_123'), /di luar endpoint/);
  assert.throws(() => allowedStatusUrl('https://127.0.0.1/api/v2/downloader/status/request_123'), /di luar endpoint/);
  assert.equal(allowedMediaUrl('https://scontent.cdninstagram.com/media.mp4'), 'https://scontent.cdninstagram.com/media.mp4');
  assert.throws(() => allowedMediaUrl('https://evil.example/video.mp4'), /tidak diizinkan/);
  assert.throws(() => allowedMediaUrl('https://127.0.0.1/private'), /tidak diizinkan/);
});

test('scrapes page metadata and fetches completed result using CSRF token + cookies', async () => {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(url);
    requests.push({ url: parsed.toString(), init });
    if (parsed.pathname === '/download-video/instagram') {
      return new Response(pageHtml, { status: 200, headers: { 'set-cookie': 'kol_session=session123; Path=/; HttpOnly' } });
    }
    if (parsed.pathname === '/api/v2/downloader/instagram') {
      assert.equal(init.method, 'POST');
      assert.match(init.body, /_token=csrf-test-token/);
      assert.match(init.body, /https%3A%2F%2Fwww.instagram.com%2Freel%2FABC123/);
      assert.match(init.headers.cookie, /kol_session=session123/);
      return responseJson({ meta: { success: true }, data: { status: 'completed', type: 'video', video_url: 'https://scontent.cdninstagram.com/video.mp4', title: 'Demo reel', author: 'creator', request_id: 'job-1' } });
    }
    throw new Error(`Unexpected route ${parsed.pathname}`);
  };
  const scraper = new KolInstagramScraper({ fetchImpl });
  const info = await scraper.scrapePageInfo();
  assert.equal(info.seo.title, 'Instagram Downloader | KOL.ID');
  assert.equal(info.faqs.length, 1);
  assert.equal(info.downloaderConfig.supportedDownloadersOnSite[0], 'tiktok');
  const result = await scraper.fetchMediaInfo('https://www.instagram.com/reel/ABC123/');
  assert.equal(result.requestId, 'job-1');
  assert.equal(result.totalMedia, 1);
  assert.equal(result.media[0].type, 'video');
  assert.equal(requests.filter(item => item.init.method === 'POST').length, 1);
});

test('polls a queued request and accepts only KOL.ID fixed status endpoint', async () => {
  let polls = 0;
  const fetchImpl = async url => {
    const parsed = new URL(url);
    if (parsed.pathname === '/download-video/instagram') return new Response(pageHtml, { status: 200 });
    if (parsed.pathname === '/api/v2/downloader/instagram') return responseJson({ data: { status: 'queued', status_url: '/api/v2/downloader/status/request_123', poll_after: 2 } });
    if (parsed.pathname === '/api/v2/downloader/status/request_123') {
      polls += 1;
      return responseJson({ data: { status: 'completed', type: 'slide', slides: [
        { type: 'image', url: 'https://scontent.cdninstagram.com/a.jpg' },
        { type: 'image', url: 'https://scontent.cdninstagram.com/b.jpg' }
      ] } });
    }
    throw new Error(`Unexpected route ${parsed.pathname}`);
  };
  const scraper = new KolInstagramScraper({ fetchImpl, maxWaitSec: 5 });
  const result = await scraper.fetchMediaInfo('https://instagram.com/p/POST123/', { maxWaitSec: 5 });
  assert.equal(polls, 1);
  assert.equal(result.type, 'slide');
  assert.equal(result.totalMedia, 2);
});

test('download stream enforces byte limits and revalidates redirects against CDN allowlist', async () => {
  const redirectClient = new KolInstagramScraper({ fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/private' } }) });
  await assert.rejects(redirectClient.downloadMedia('https://scontent.cdninstagram.com/video.mp4'), /Redirect ke host/);

  const largeClient = new KolInstagramScraper({ fetchImpl: async () => new Response(new Uint8Array(32), { status: 200, headers: { 'content-type': 'image/jpeg' } }) });
  await assert.rejects(largeClient.downloadMedia('https://scontent.cdninstagram.com/photo.jpg', { maxBytes: 16 }), /melebihi batas/);
});

test('downloads a media Buffer after extraction with no user-controlled local output path', async () => {
  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(url);
    if (parsed.pathname === '/media.mp4') return new Response(Buffer.from([1, 2, 3, 4]), { status: 200, headers: { 'content-type': 'video/mp4' } });
    throw new Error('unexpected fetch');
  };
  const scraper = new KolInstagramScraper({ fetchImpl });
  const result = await scraper.downloadMedia('https://scontent.cdninstagram.com/media.mp4');
  assert.deepEqual([...result.buffer], [1, 2, 3, 4]);
  assert.equal(result.mimetype, 'video/mp4');
});
