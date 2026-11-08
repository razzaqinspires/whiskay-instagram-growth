import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYouTubeMusicResults, YouTubeMusicAudio, YouTubeMusicClient } from '../src/media/youtube-music.mjs';

function makeRenderer(videoId, title = 'Song') {
  return { musicResponsiveListItemRenderer: {
    flexColumns: [
      { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: title, navigationEndpoint: { watchEndpoint: { videoId } } }] } } },
      { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Song' }, { text: ' · ' }, { text: '3:21' }] } } },
      { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Artist' }] } } }
    ],
    thumbnail: { musicThumbnailRenderer: { thumbnail: { thumbnails: [{ url: 'https://example.com/thumb.jpg' }] } } }
  } };
}

test('parses YouTube Music track results from tabbed search renderer', () => {
  const data = { contents: { tabbedSearchResultsRenderer: { tabs: [{ tabRenderer: { content: { sectionListRenderer: { contents: [{ musicShelfRenderer: { contents: [makeRenderer('abcdefghijk', 'Track A')] } }] } } } }] } } };
  const results = parseYouTubeMusicResults(data);
  assert.equal(results.length, 1);
  assert.equal(results[0].title, 'Track A');
  assert.equal(results[0].videoId, 'abcdefghijk');
  assert.equal(results[0].url, 'https://music.youtube.com/watch?v=abcdefghijk');
});

test('YouTube Music parser rejects invalid ids and deduplicates repeated track entries', () => {
  const item = makeRenderer('abcdefghijk', 'Track A');
  const data = { contents: { tabbedSearchResultsRenderer: { tabs: [{ tabRenderer: { content: { sectionListRenderer: { contents: [{ musicShelfRenderer: { contents: [item, item, makeRenderer('bad', 'Bad')] } }] } } } }] } } };
  assert.equal(parseYouTubeMusicResults(data).length, 1);
});

test('YouTube Music search validates filter and parses mocked InnerTube response', async () => {
  let request;
  const client = new YouTubeMusicClient({ fetchImpl: async (url, options) => {
    request = { url: String(url), options };
    return { ok: true, json: async () => ({ contents: { tabbedSearchResultsRenderer: { tabs: [{ tabRenderer: { content: { sectionListRenderer: { contents: [{ musicShelfRenderer: { contents: [makeRenderer('abcdefghijk')] } }] } } } }] } } }) };
  } });
  const results = await client.search('sample track', { filter: 'songs' });
  assert.equal(results[0].videoId, 'abcdefghijk');
  assert.match(request.url, /youtubei\/v1\/search/);
  assert.equal(JSON.parse(request.options.body).query, 'sample track');
  await assert.rejects(client.search('x', { filter: 'unknown' }), /Filter harus/);
});

test('YouTube downloader accepts only one valid YouTube video target', () => {
  const audio = new YouTubeMusicAudio({ ytdlpPath: 'yt-dlp' });
  assert.equal(audio.validateTarget('abcdefghijk'), 'https://music.youtube.com/watch?v=abcdefghijk');
  assert.equal(audio.validateTarget('https://youtu.be/abcdefghijk'), 'https://music.youtube.com/watch?v=abcdefghijk');
  assert.throws(() => audio.validateTarget('https://example.com/watch?v=abcdefghijk'), /Host URL/);
  assert.throws(() => audio.validateTarget('https://youtube.com/playlist?list=abc'), /satu video/);
});
