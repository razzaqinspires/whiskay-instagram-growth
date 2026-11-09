import test from 'node:test';
import assert from 'node:assert/strict';
import { createIrfanScrapeAdapter, AiScrapeError, IRFAN_SCRAPE_LIMITS } from '../src/ai/irfan-scrape-adapter.mjs';

const PUBLIC_DNS = async () => [{ address: '93.184.216.34', family: 4 }];
const baseEnv = {
  IRFAN_SCRAPE_ENABLED: 'true',
  IRFAN_SCRAPE_API_URL: 'https://gateway.example.org/v1/scrape',
  IRFAN_SCRAPE_API_TOKEN: 'test-token-value-0123456789',
  IRFAN_SCRAPE_ALLOWED_HOSTS: 'gateway.example.org',
  IRFAN_SCRAPE_TIMEOUT_MS: '5000',
  IRFAN_SCRAPE_MODEL: 'gateway-default',
  IRFAN_SCRAPE_THINKING: 'medium',
  IRFAN_SCRAPE_USE_FAST: 'true'
};

function jsonResponse(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  });
}

test('AI scraper fails closed when the adapter is not explicitly enabled', async () => {
  const adapter = createIrfanScrapeAdapter({ env: {}, lookup: PUBLIC_DNS, fetchImpl: async () => { throw new Error('must not call'); } });
  assert.equal(adapter.getStatus().enabled, false);
  await assert.rejects(adapter.scrape({ url: 'https://example.org', prompt: 'Summarize' }), error => error.code === 'DISABLED');
});

test('AI scraper requires endpoint token and an exact host allowlist entry', async () => {
  const noToken = createIrfanScrapeAdapter({ env: { ...baseEnv, IRFAN_SCRAPE_API_TOKEN: '' }, lookup: PUBLIC_DNS });
  assert.equal(noToken.getStatus().configured, false);
  await assert.rejects(noToken.scrape({ url: 'https://example.org', prompt: 'Summarize' }), error => error.code === 'NOT_CONFIGURED');

  const noAllowlist = createIrfanScrapeAdapter({ env: { ...baseEnv, IRFAN_SCRAPE_ALLOWED_HOSTS: '' }, lookup: PUBLIC_DNS });
  assert.equal(noAllowlist.getStatus().configured, false);
  assert.equal(noAllowlist.getStatus().configured, false);
  assert.ok(noAllowlist.getStatus().error || noAllowlist.getStatus().missing?.length);
});

test('AI scraper rejects insecure, credentialed, query-bearing or non-allowlisted gateway URLs', () => {
  for (const endpoint of [
    'http://gateway.example.org/v1/scrape',
    'https://user:pass@gateway.example.org/v1/scrape',
    'https://gateway.example.org/v1/scrape?token=leak',
    'https://other.example.org/v1/scrape'
  ]) {
    const adapter = createIrfanScrapeAdapter({ env: { ...baseEnv, IRFAN_SCRAPE_API_URL: endpoint }, lookup: PUBLIC_DNS });
    assert.equal(adapter.getStatus().configured, false, endpoint);
  }
});

test('AI scraper rejects local, private and reserved target hosts before calling provider', async () => {
  let calls = 0;
  const adapter = createIrfanScrapeAdapter({
    env: baseEnv,
    lookup: PUBLIC_DNS,
    fetchImpl: async () => { calls += 1; return jsonResponse({ text: 'never' }); }
  });
  for (const url of [
    'http://localhost/private',
    'http://127.0.0.1/admin',
    'http://10.0.0.1/',
    'http://192.168.1.10/',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/'
  ]) {
    await assert.rejects(adapter.scrape({ url, prompt: 'Summarize this page' }), error => error.code === 'INPUT_BLOCKED');
  }
  assert.equal(calls, 0);
});

test('AI scraper rejects a public-looking hostname if DNS returns any private/reserved address', async () => {
  let calls = 0;
  const adapter = createIrfanScrapeAdapter({
    env: baseEnv,
    lookup: async () => [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.5', family: 4 }],
    fetchImpl: async () => { calls += 1; return jsonResponse({ text: 'never' }); }
  });
  await assert.rejects(adapter.scrape({ url: 'https://mixed-dns.example.org', prompt: 'Summarize' }), /privat, reserved/);
  assert.equal(calls, 0);
});


test('AI scraper blocks private IPv4-mapped IPv6 addresses', async () => {
  const adapter = createIrfanScrapeAdapter({
    env: baseEnv,
    lookup: PUBLIC_DNS,
    fetchImpl: async () => { throw new Error('must not call'); }
  });
  await assert.rejects(adapter.scrape({ url: 'http://[::ffff:7f00:1]/', prompt: 'Summarize' }), error => error.code === 'INPUT_BLOCKED');
  await assert.rejects(adapter.scrape({ url: 'http://[::ffff:127.0.0.1]/', prompt: 'Summarize' }), error => error.code === 'INPUT_BLOCKED');
});

test('AI scraper treats malformed JSON-looking text as plain text when provider declares text/plain', async () => {
  const adapter = createIrfanScrapeAdapter({
    env: baseEnv,
    lookup: PUBLIC_DNS,
    fetchImpl: async () => new Response('{unclosed JSON response', { headers: { 'content-type': 'text/plain' } })
  });
  const result = await adapter.scrape({ url: 'https://example.org', prompt: 'Summarize' });
  assert.equal(result.text, '{unclosed JSON response');
});

test('AI scraper validates prompt length, URL protocol, port and settings shape', async () => {
  const adapter = createIrfanScrapeAdapter({ env: baseEnv, lookup: PUBLIC_DNS, fetchImpl: async () => jsonResponse({ text: 'unused' }) });
  await assert.rejects(adapter.scrape({ url: 'ftp://example.org/file', prompt: 'Summarize' }), error => error.code === 'INPUT_INVALID');
  await assert.rejects(adapter.scrape({ url: 'https://example.org:9443/', prompt: 'Summarize' }), error => error.code === 'INPUT_INVALID');
  await assert.rejects(adapter.scrape({ url: 'https://example.org/', prompt: 'x'.repeat(IRFAN_SCRAPE_LIMITS.maxPromptChars + 1) }), error => error.code === 'INPUT_INVALID');
  await assert.rejects(adapter.scrape({ url: 'https://example.org/', prompt: 'Summarize', settings: [] }), error => error.code === 'INPUT_INVALID');
});

test('AI scraper posts only the reviewed request fields to the pinned gateway', async () => {
  let request;
  const adapter = createIrfanScrapeAdapter({
    env: baseEnv,
    lookup: PUBLIC_DNS,
    fetchImpl: async (url, options) => {
      request = { url, options, payload: JSON.parse(options.body) };
      return jsonResponse({ choices: [{ message: { content: 'A concise summary.' } }] });
    }
  });
  const result = await adapter.scrape({ url: 'https://example.org/article', prompt: 'Summarize the article.' });
  assert.equal(result.text, 'A concise summary.');
  assert.equal(request.url, baseEnv.IRFAN_SCRAPE_API_URL);
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.cache, 'no-store');
  assert.equal(request.options.headers.authorization, `Bearer ${baseEnv.IRFAN_SCRAPE_API_TOKEN}`);
  assert.deepEqual(request.payload, {
    url: 'https://example.org/article',
    prompt: 'Summarize the article.',
    settings: { model: 'gateway-default', thinking: 'medium', use_fast: true }
  });
  assert.equal(JSON.stringify(request.payload).includes('voucher'), false);
  assert.equal(JSON.stringify(request.payload).includes('token_router'), false);
  assert.equal(JSON.stringify(request.payload).includes('light_house'), false);
});

test('AI scraper normalizes plain-text response and caps the displayed result', async () => {
  const adapter = createIrfanScrapeAdapter({
    env: baseEnv,
    lookup: PUBLIC_DNS,
    fetchImpl: async () => new Response(`\u001b[31m${'A'.repeat(9_000)}\u001b[0m`, { status: 200, headers: { 'content-type': 'text/plain' } })
  });
  const result = await adapter.scrape({ url: 'https://example.org', prompt: 'Summarize' });
  assert.equal(result.text.length, IRFAN_SCRAPE_LIMITS.maxResultChars);
  assert.equal(result.truncated, true);
  assert.equal(result.text.includes('\u001b'), false);
});

test('AI scraper rejects oversized response bodies before parsing', async () => {
  const adapter = createIrfanScrapeAdapter({
    env: baseEnv,
    lookup: PUBLIC_DNS,
    fetchImpl: async () => jsonResponse({ text: 'too large' }, 200, { 'content-length': String(IRFAN_SCRAPE_LIMITS.maxResponseBytes + 1) })
  });
  await assert.rejects(adapter.scrape({ url: 'https://example.org', prompt: 'Summarize' }), error => error.code === 'RESPONSE_TOO_LARGE');
});


test('AI scraper bounds DNS lookup duration before contacting provider', async () => {
  let calls = 0;
  const adapter = createIrfanScrapeAdapter({
    env: baseEnv,
    dnsTimeoutMs: 100,
    lookup: async () => new Promise(() => {}),
    fetchImpl: async () => { calls += 1; return jsonResponse({ text: 'never' }); }
  });
  await assert.rejects(adapter.scrape({ url: 'https://slow-dns.example.org', prompt: 'Summarize' }), error => error.code === 'DNS_TIMEOUT');
  assert.equal(calls, 0);
});

test('AI scraper timeout remains active while the response body is streamed', async () => {
  const adapter = createIrfanScrapeAdapter({
    env: { ...baseEnv, IRFAN_SCRAPE_TIMEOUT_MS: '1000' },
    lookup: PUBLIC_DNS,
    fetchImpl: async (_url, options) => {
      const stream = new ReadableStream({
        start(controller) {
          options.signal.addEventListener('abort', () => controller.error(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
        }
      });
      return new Response(stream, { status: 200, headers: { 'content-type': 'text/plain' } });
    }
  });
  await assert.rejects(adapter.scrape({ url: 'https://example.org', prompt: 'Summarize' }), error => error.code === 'TIMEOUT');
});

test('AI scraper maps auth and rate-limit failures without exposing provider response bodies', async () => {
  for (const [status, code] of [[401, 'AUTH_FAILED'], [403, 'AUTH_FAILED'], [429, 'RATE_LIMITED']]) {
    const adapter = createIrfanScrapeAdapter({
      env: baseEnv,
      lookup: PUBLIC_DNS,
      fetchImpl: async () => new Response('private token echo must not be surfaced', { status })
    });
    await assert.rejects(adapter.scrape({ url: 'https://example.org', prompt: 'Summarize' }), error => {
      assert.equal(error.code, code);
      assert.equal(error.message.includes('private token echo'), false);
      return true;
    });
  }
});

test('AI scraper maps request timeout into a stable error code', async () => {
  const adapter = createIrfanScrapeAdapter({
    env: { ...baseEnv, IRFAN_SCRAPE_TIMEOUT_MS: '1000' },
    lookup: PUBLIC_DNS,
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
    })
  });
  await assert.rejects(adapter.scrape({ url: 'https://example.org', prompt: 'Summarize' }), error => error.code === 'TIMEOUT');
});

test('configuration rejects invalid thinking, timeout and model identifiers', () => {
  const invalids = [
    { IRFAN_SCRAPE_THINKING: 'turbo' },
    { IRFAN_SCRAPE_TIMEOUT_MS: '999999' },
    { IRFAN_SCRAPE_MODEL: 'model name with spaces' },
    { IRFAN_SCRAPE_USE_FAST: 'sometimes' },
    { IRFAN_SCRAPE_API_TOKEN: 'token-with-line\nbreak-0123456789' }
  ];
  for (const patch of invalids) {
    const adapter = createIrfanScrapeAdapter({ env: { ...baseEnv, ...patch }, lookup: PUBLIC_DNS });
    assert.equal(adapter.getStatus().configured, false);
    assert.ok(adapter.getStatus().error);
  }
});
