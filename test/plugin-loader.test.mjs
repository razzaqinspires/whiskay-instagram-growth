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
    const instagramProfile = loader.listCommands().find(item => item.name === 'igprofile');
    assert.ok(instagramProfile.aliases.includes('profile'), 'the menu Profile action must resolve to the active Instagram profile command');
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
    assert.equal(names.has('acad'), true);
    assert.equal(names.has('hotreload'), true);
    assert.equal(names.has('remini'), true);
    assert.equal(names.has('igdl'), true);
    assert.equal(names.has('poll'), true);
    assert.equal(names.has('mediainfo'), true);
    assert.equal(names.has('waform'), true);
    assert.equal(names.has('ytmusic'), true);
    assert.equal(names.has('wacapabilities'), true);
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


test('dependency-aware watcher reloads a library imported by a plugin', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'whiskay-plugin-deps-'));
  const sourceRoot = path.join(root, 'src');
  const pluginDir = path.join(sourceRoot, 'plugins');
  const libDir = path.join(sourceRoot, 'lib');
  const logLines = [];
  const logger = { info(message) { logLines.push(message); }, warn(message) { logLines.push(message); }, error(message) { logLines.push(message); } };
  const loader = new PluginLoader({ directory: pluginDir, sourceRoot, runtimeDirectory: path.join(root, '.runtime', 'hot'), logger });
  const waitFor = async predicate => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (await predicate()) return true;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return false;
  };
  try {
    await mkdir(pluginDir, { recursive: true });
    await mkdir(libDir, { recursive: true });
    await writeFile(path.join(libDir, 'value.mjs'), `export const currentValue = 'library-one';\n`);
    await writeFile(path.join(pluginDir, 'demo.mjs'), `import { currentValue } from '../lib/value.mjs';\nexport default { name: 'demo', commands: [{ name: 'libraryvalue', execute: async ({ reply }) => reply(currentValue) }] };\n`);
    await loader.start({ watchFiles: true });
    assert.equal(loader.status().mode, 'dependency-aware-source-snapshot');
    assert.equal(loader.status().plugins, 1);
    assert.ok(loader.status().watchedDirectories >= 2);
    const replies = [];
    await loader.execute('libraryvalue', { reply: async value => replies.push(value) });
    assert.equal(replies.at(-1), 'library-one');

    await writeFile(path.join(libDir, 'value.mjs'), `export const currentValue = 'library-two';\n`);
    assert.equal(await waitFor(async () => {
      const seen = [];
      await loader.execute('libraryvalue', { reply: async value => seen.push(value) });
      return seen[0] === 'library-two';
    }), true, 'library edit should reload plugin dependency graph');
    assert.equal(logLines.some(line => String(line).includes('source snapshot') && String(line).includes('value.mjs')), true);
  } finally {
    loader.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('dependency-aware watcher retries a plugin when a missing library file is added', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'whiskay-plugin-missing-dep-'));
  const sourceRoot = path.join(root, 'src');
  const pluginDir = path.join(sourceRoot, 'plugins');
  const libDir = path.join(sourceRoot, 'academic');
  const logLines = [];
  const logger = { info(message) { logLines.push(message); }, warn(message) { logLines.push(message); }, error(message) { logLines.push(message); } };
  const loader = new PluginLoader({ directory: pluginDir, sourceRoot, runtimeDirectory: path.join(root, '.runtime', 'hot'), logger });
  const waitFor = async predicate => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (await predicate()) return true;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return false;
  };
  try {
    await mkdir(pluginDir, { recursive: true });
    await mkdir(libDir, { recursive: true });
    await writeFile(path.join(pluginDir, 'academic.mjs'), `import { libraryReady } from '../academic/client.mjs';\nexport default { name: 'academic-test', commands: [{ name: 'academicready', execute: async ({ reply }) => reply(libraryReady) }] };\n`);
    await loader.start({ watchFiles: true });
    assert.equal((await loader.execute('academicready', {})).found, false);

    await writeFile(path.join(libDir, 'client.mjs'), `export const libraryReady = 'dependency-present';\n`);
    assert.equal(await waitFor(async () => {
      const seen = [];
      await loader.execute('academicready', { reply: async value => seen.push(value) });
      return seen[0] === 'dependency-present';
    }), true, 'adding the previously missing library should retry and load its plugin');
    assert.equal(logLines.some(line => String(line).includes('gagal memuat academic.mjs')), true);
    assert.equal(logLines.some(line => String(line).includes('loaded academic-test')), true);
  } finally {
    loader.close();
    await rm(root, { recursive: true, force: true });
  }
});


test('plugin registry exposes every loaded command for button-directory pagination', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'whiskay-plugin-section-cap-'));
  const runtime = await mkdtemp(path.join(os.tmpdir(), 'whiskay-plugin-section-runtime-'));
  const dir = path.join(root, 'plugins');
  const logger = { info() {}, warn() {}, error() {} };
  const loader = new PluginLoader({ directory: dir, sourceRoot: root, runtimeDirectory: runtime, logger });
  try {
    await mkdir(dir, { recursive: true });
    const commands = Array.from({ length: 36 }, (_, i) => `{ name: 'command${i + 1}', category: 'Category ${i + 1}', description: 'Description ${i + 1}', execute: async () => {} }`).join(',');
    await writeFile(path.join(dir, 'many.mjs'), `export default { name: 'many', commands: [${commands}] };`);
    await loader.start({ watchFiles: false });
    const list = loader.listCommands();
    assert.equal(list.length, 36);
    const rows = list.map(item => item.name);
    assert.equal(new Set(rows).size, 36);
  } finally { loader.close(); await Promise.all([rm(root, { recursive: true, force: true }), rm(runtime, { recursive: true, force: true })]); }
});
