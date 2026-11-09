import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiScrapePlugin } from '../src/plugins/ai-scrape.mjs';

function makeAdapter({ result = 'Summary result', error = null, status = {} } = {}) {
  const calls = [];
  return {
    calls,
    getStatus() { return { enabled: true, configured: true, endpointHost: 'gateway.example.org', timeoutMs: 30_000, model: 'test-model', thinking: 'medium', useFast: true, missing: [], ...status }; },
    async scrape(input) {
      calls.push(input);
      if (error) throw error;
      return { text: result, endpointHost: 'gateway.example.org', model: 'test-model', truncated: false };
    }
  };
}

async function execute(plugin, rawArgs, { replies = [], interactive = null, key = { remoteJid: 'owner@s.whatsapp.net' }, sock = {} } = {}) {
  const command = plugin.commands[0];
  const args = String(rawArgs).trim().split(/\s+/).slice(0, 2);
  return command.execute({
    rawArgs,
    args,
    reply: async value => { replies.push(String(value)); return true; },
    sendInteractive: async value => { interactive = value; return true; },
    key,
    sock,
    logger: { warn() {} }
  }).then(value => ({ value, replies, interactive }));
}

test('AI scrape plugin registers owner-operated command and aliases', () => {
  const adapter = makeAdapter();
  const plugin = createAiScrapePlugin({ adapterFactory: () => adapter });
  assert.equal(plugin.commands[0].name, 'aiscrape');
  assert.deepEqual(plugin.commands[0].aliases, ['irfanscrape', 'scrapeai']);
  assert.match(plugin.commands[0].usage, /CONFIRM/);
});

test('AI scrape help does not make a provider request', async () => {
  const adapter = makeAdapter();
  const plugin = createAiScrapePlugin({ adapterFactory: () => adapter });
  const output = await execute(plugin, 'help');
  assert.match(output.interactive.body, /CONFIRM/);
  assert.equal(adapter.calls.length, 0);
});

test('AI scrape info and status are local-only and do not call the provider', async () => {
  const adapter = makeAdapter();
  const plugin = createAiScrapePlugin({ adapterFactory: () => adapter });
  const info = await execute(plugin, 'info');
  assert.match(info.replies[0], /tidak dipasang sebagai dependency/);
  const status = await execute(plugin, 'status');
  assert.match(status.replies[0], /gateway.example.org/);
  assert.equal(adapter.calls.length, 0);
});

test('AI scrape run requires CONFIRM and a URL/prompt separator', async () => {
  const adapter = makeAdapter();
  const plugin = createAiScrapePlugin({ adapterFactory: () => adapter });
  const output = await execute(plugin, 'run https://example.org | Summarize this');
  assert.match(output.replies[0], /Format:/);
  assert.equal(adapter.calls.length, 0);
});


test('AI scrape does not claim to send when the gateway is disabled', async () => {
  const adapter = makeAdapter({ status: { enabled: false, configured: false, missing: ['IRFAN_SCRAPE_ENABLED=true'] } });
  const plugin = createAiScrapePlugin({ adapterFactory: () => adapter });
  const output = await execute(plugin, 'run CONFIRM https://example.org | Summarize');
  assert.match(output.replies[0], /gateway nonaktif/);
  assert.equal(adapter.calls.length, 0);
});

test('AI scrape sends only the explicitly confirmed URL and prompt', async () => {
  const adapter = makeAdapter({ result: 'A tested summary.' });
  const plugin = createAiScrapePlugin({ adapterFactory: () => adapter, now: () => 100_000 });
  const output = await execute(plugin, 'run CONFIRM https://example.org/article | Summarize the main points.', {
    key: { remoteJid: 'owner@s.whatsapp.net', participant: 'owner@s.whatsapp.net' },
    sock: { user: { id: 'owner@s.whatsapp.net' } }
  });
  assert.deepEqual(adapter.calls, [{ url: 'https://example.org/article', prompt: 'Summarize the main points.' }]);
  assert.match(output.replies[0], /Panjang prompt/);
  assert.match(output.replies[1], /A tested summary/);
});

test('AI scrape cooldown is applied per sender and destination', async () => {
  const adapter = makeAdapter();
  const plugin = createAiScrapePlugin({ adapterFactory: () => adapter, now: () => 100_000 });
  const options = { key: { remoteJid: 'owner@s.whatsapp.net', participant: 'owner@s.whatsapp.net' }, sock: { user: { id: 'owner@s.whatsapp.net' } } };
  await execute(plugin, 'run CONFIRM https://example.org | Summarize', options);
  const second = await execute(plugin, 'run CONFIRM https://example.org | Summarize', options);
  assert.match(second.replies[0], /cooldown aktif/);
  assert.equal(adapter.calls.length, 1);
});

test('AI scrape releases cooldown after a provider error and does not expose provider tokens', async () => {
  const adapter = makeAdapter({ error: Object.assign(new Error('Gateway rejected API key=secret'), { code: 'AUTH_FAILED' }) });
  const plugin = createAiScrapePlugin({ adapterFactory: () => adapter, now: () => 100_000 });
  const output = await execute(plugin, 'run CONFIRM https://example.org | Summarize');
  assert.match(output.replies.at(-1), /AI scrape gagal/);
  assert.equal(output.replies.at(-1).includes('secret'), false);
  assert.match(output.replies.at(-1), /Periksa token lokal/);
});

test('AI scrape response is capped before sending to WhatsApp', async () => {
  const adapter = makeAdapter({ result: 'X'.repeat(4_000) });
  const plugin = createAiScrapePlugin({ adapterFactory: () => adapter, now: () => 100_000 });
  const output = await execute(plugin, 'run CONFIRM https://example.org | Summarize');
  assert.ok(output.replies.at(-1).length < 3_700);
  assert.match(output.replies.at(-1), /dipotong/);
});
