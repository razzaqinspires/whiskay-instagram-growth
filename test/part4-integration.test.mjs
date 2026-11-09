import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PluginLoader } from '../src/lib/plugin-loader.mjs';
import { config } from '../src/config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const pluginDirectory = fileURLToPath(new URL('../src/plugins/', import.meta.url));

test('active registry integrates WhatsApp Message Lab, TikTok and AI scrape commands', async () => {
  const loader = new PluginLoader({ directory: pluginDirectory, logger: { info() {}, warn() {}, error() {} } });
  try {
    await loader.start({ watchFiles: false });
    const commands = loader.listCommands();
    const names = new Set(commands.map(command => command.name));
    assert.ok(names.has('waform'));
    assert.ok(names.has('tiktok'));
    assert.ok(names.has('aiscrape'));
    assert.ok(commands.find(command => command.name === 'tiktok').aliases.includes('tt'));
    assert.ok(commands.find(command => command.name === 'aiscrape').aliases.includes('scrapeai'));

    const replies = [];
    const interactive = [];
    assert.equal((await loader.execute('tt', { args: ['help'], reply: async text => replies.push(text) })).found, true);
    assert.match(replies.join('\n'), /TIKTOK NATIVE DOWNLOADER/);

    assert.equal((await loader.execute('scrapeai', {
      args: ['help'],
      reply: async text => replies.push(text),
      sendInteractive: async payload => interactive.push(payload)
    })).found, true);
    assert.equal(interactive.length, 1);
    assert.match(interactive[0].body, /AI SCRAPE GATEWAY/);
  } finally {
    loader.close();
  }
});

test('normalized Growth config stays organic-only', () => {
  assert.deepEqual(Object.keys(config.growth), ['databaseFile']);
  assert.equal(Object.hasOwn(config.growth, 'queue'), false);
  assert.equal(Object.hasOwn(config.growth, 'providerEnabled'), false);
  assert.equal(Object.hasOwn(config.growth, 'requireWallet'), false);
});

test('retired promotion-order and queue entrypoints are absent from runtime source', () => {
  const retired = [
    'src/growth/order-engine.mjs',
    'src/growth/provider-adapter.mjs',
    'src/growth/redis-queue.mjs',
    'src/growth/sqlite-queue.mjs',
    'src/growth/worker.mjs',
    'scripts/worker.mjs',
    'scripts/queue-health.mjs'
  ];
  for (const file of retired) assert.equal(existsSync(`${root}/${file}`), false, `${file} should not be present`);
});

test('launcher starts the bot only and does not spawn a Growth worker', () => {
  const source = readFileSync(`${root}/scripts/start.mjs`, 'utf8');
  assert.match(source, /launch\('bot', 'index\.mjs'\)/);
  assert.doesNotMatch(source, /launch\(['"]worker['"]|growth\/worker\.mjs/);
});
