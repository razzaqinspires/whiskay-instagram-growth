import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PluginLoader } from '../src/lib/plugin-loader.mjs';

test('loads plugin and hot-reloads changed command implementation', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-plugins-'));
  const file = path.join(dir, 'demo.mjs');
  const logger = { info() {}, warn() {}, error() {} };
  const loader = new PluginLoader({ directory: dir, logger });
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(file, `export default { name: 'demo', commands: [{ name: 'hello', aliases: ['hi'], execute: async ({ reply }) => reply('one') }] };`);
    await loader.start({ watchFiles: false });
    const replies = [];
    const first = await loader.execute('hi', { reply: async value => replies.push(value) });
    assert.equal(first.found, true);
    assert.deepEqual(replies, ['one']);

    await writeFile(file, `export default { name: 'demo', commands: [{ name: 'hello', aliases: ['hi'], execute: async ({ reply }) => reply('two') }] };`);
    await loader.loadFile('demo.mjs');
    const second = await loader.execute('hello', { reply: async value => replies.push(value) });
    assert.equal(second.found, true);
    assert.deepEqual(replies, ['one', 'two']);
  } finally {
    loader.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('normalizes category and usage metadata and lists commands by category then A-Z', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-plugin-menu-'));
  const logger = { info() {}, warn() {}, error() {} };
  const loader = new PluginLoader({ directory: dir, logger });
  try {
    await writeFile(path.join(dir, 'menu.mjs'), `export default { name: 'menu-test', commands: [
      { name: 'zeta', category: 'Tools', usage: '<value>', execute: async () => {} },
      { name: 'beta', category: 'Core', execute: async () => {} },
      { name: 'alpha', category: 'Core', usage: '[text]', execute: async () => {} }
    ] };`);
    await loader.start({ watchFiles: false });
    const list = loader.listCommands();
    assert.deepEqual(list.map(item => `${item.category}:${item.name}`), [
      'Core:alpha', 'Core:beta', 'Tools:zeta'
    ]);
    assert.equal(list[0].usage, '[text]');
    assert.equal(list[1].usage, '');
  } finally {
    loader.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('skips only duplicate commands and keeps other commands from the plugin', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-plugin-conflict-'));
  const warnings = [];
  const logger = { info() {}, warn(message) { warnings.push(message); }, error() {} };
  const loader = new PluginLoader({ directory: dir, logger });
  try {
    await writeFile(path.join(dir, 'a-primary.mjs'), `export default { name: 'primary', commands: [
      { name: 'igstats', execute: async ({ reply }) => reply('primary stats') }
    ] };`);
    await writeFile(path.join(dir, 'b-extra.mjs'), `export default { name: 'extra', commands: [
      { name: 'igstats', execute: async ({ reply }) => reply('duplicate stats') },
      { name: 'igreport', execute: async ({ reply }) => reply('extra report') }
    ] };`);
    await loader.start({ watchFiles: false });
    const replies = [];
    assert.equal((await loader.execute('igstats', { reply: async value => replies.push(value) })).found, true);
    assert.equal((await loader.execute('igreport', { reply: async value => replies.push(value) })).found, true);
    assert.deepEqual(replies, ['primary stats', 'extra report']);
    assert.match(warnings.join('\n'), /igstats/);
    assert.equal(loader.listCommands().length, 2);
  } finally {
    loader.close();
    await rm(dir, { recursive: true, force: true });
  }
});


test('real plugin set registers Instagram and verified-referral commands', async () => {
  const directory = fileURLToPath(new URL('../src/plugins/', import.meta.url));
  const loader = new PluginLoader({ directory, logger: { info() {}, warn() {}, error() {} } });
  try {
    await loader.start({ watchFiles: false });
    const names = new Set(loader.listCommands().map(item => item.name));
    assert.equal(names.has('igpanel'), true);
    assert.equal(names.has('igprofile'), true);
    assert.equal(names.has('igcheck'), true);
    assert.equal(names.has('iglogin'), true);
    assert.equal(names.has('igsync'), true);
    assert.equal(names.has('igstats'), true);
    assert.equal(names.has('iggrowth'), true);
    assert.equal(names.has('ighistory'), true);
    assert.equal(names.has('igcampaign'), true);
    assert.equal(names.has('igfunnel'), true);
    assert.equal(names.has('referralstatus'), true);
    assert.equal(names.has('referralprocess'), true);
  } finally {
    loader.close();
  }
});


test('closing plugin loader during startup prevents a watcher from being installed later', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-plugin-shutdown-'));
  const loader = new PluginLoader({ directory: dir, logger: { info() {}, warn() {}, error() {} } });
  try {
    const starting = loader.start({ watchFiles: true });
    loader.close();
    await starting;
    assert.equal((await loader.execute('any-command', {})).found, false);
  } finally {
    loader.close();
    await rm(dir, { recursive: true, force: true });
  }
});
