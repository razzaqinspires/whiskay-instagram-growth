import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import plugin, { KATABG_DEFAULTS, normalizeKatabgConfig, splitKatabgLines, createImageCanvasEngine, createKatabgConfigStore } from '../src/library/adapters/katabangwaindah.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const contributedPath = path.join(root, 'library/contributed/cjs/katabangwaindah.canvas.cjs');

test('contributed source stays byte-identical to the declared upstream blob snapshot', async () => {
  const source = await readFile(contributedPath, 'utf8');
  const bytes = Buffer.from(source);
  const gitBlobSha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  assert.equal(gitBlobSha, 'ef6164ab816c475df465f75582f9be043396d5c7');
  assert.match(source, /const creator = "Rizkyrohan"/);
  assert.match(source, /FontDownload/);
  assert.match(source, /await import\('@napi-rs\/canvas'\)/);
  assert.match(source, /conn\.sendMessage\(m\.chat/);
  assert.match(source, /const source = "https:\/\/whatsapp\.com\/channel/);
  assert.equal(require(path.join(root, 'library/contributed/cjs/package.json')).type, 'commonjs');
});

test('adapter exposes one command with documented aliases and no upstream edits', () => {
  assert.equal(plugin.name, 'contributed-katabg-adapter');
  const command = plugin.commands.find(item => item.name === 'katabg');
  assert.deepEqual(command.aliases, ['katabangwaindah', 'windahcanvas']);
  assert.equal(KATABG_DEFAULTS.responseStyle, 'compact');
});

test('configuration accepts controlled visual and response overrides', () => {
  const value = normalizeKatabgConfig({ width: 1200, height: 2400, color: '#aabbcc', boldMode: 'normal', responseStyle: 'detailed' });
  assert.equal(value.width, 1200);
  assert.equal(value.height, 2400);
  assert.equal(value.color, '#aabbcc');
  assert.equal(value.boldMode, 'normal');
  assert.equal(value.responseStyle, 'detailed');
});

test('configuration rejects unsafe dimensions, colors and remote hosts', () => {
  assert.throws(() => normalizeKatabgConfig({ width: 100000 }), /width/);
  assert.throws(() => normalizeKatabgConfig({ color: 'red' }), /color/);
  assert.throws(() => normalizeKatabgConfig({ backgroundUrl: 'https://example.com/image.jpg' }), /host/);
  assert.throws(() => normalizeKatabgConfig({ responseStyle: 'html' }), /responseStyle/);
});

test('line splitter handles max words, max chars and oversized tokens', () => {
  assert.deepEqual(splitKatabgLines('aku suka bot whatsapp', 10, 2), ['aku suka', 'bot', 'whatsapp']);
  assert.deepEqual(splitKatabgLines('abcdefghijklmnop', 5, 2), ['abcde', 'fghij', 'klmno', 'p']);
  assert.deepEqual(splitKatabgLines('one two three', 10, 1), ['one', 'two', 'three']);
});

test('render pipeline can be exercised with an injected canvas API and no native package', async () => {
  const operations = [];
  const ctx = {
    font: '', fillStyle: '', strokeStyle: '', lineJoin: '', lineWidth: 0, textAlign: '', textBaseline: '',
    measureText: text => ({ width: String(text).length * 20 }),
    drawImage: (...args) => operations.push(['drawImage', ...args]),
    fillRect: (...args) => operations.push(['fillRect', ...args]),
    save: () => operations.push(['save']), restore: () => operations.push(['restore']),
    translate: (...args) => operations.push(['translate', ...args]), scale: (...args) => operations.push(['scale', ...args]),
    strokeText: (...args) => operations.push(['strokeText', ...args]), fillText: (...args) => operations.push(['fillText', ...args])
  };
  const injected = {
    GlobalFonts: { has: () => true, register: () => true },
    loadImage: async data => ({ data }),
    createCanvas: (width, height) => ({ width, height, getContext: () => ctx, encode: async (format, quality) => Buffer.from(`${format}:${quality}`) })
  };
  const engine = createImageCanvasEngine({ canvasApi: injected });
  const result = await engine.render({ text: 'uji canvas', backgroundBuffer: Buffer.from('fake-image') });
  assert.equal(result.mimetype, 'image/jpeg');
  assert.equal(result.width, KATABG_DEFAULTS.width);
  assert.ok(result.buffer.length > 0);
  assert.ok(operations.some(([name]) => name === 'fillText'));
});


test('renderer falls back to a local canvas background when the upstream asset is unavailable', async () => {
  const operations = [];
  const ctx = {
    font: '', fillStyle: '', strokeStyle: '', lineJoin: '', lineWidth: 0, textAlign: '', textBaseline: '',
    measureText: text => ({ width: String(text).length * 10 }),
    fillRect: (...args) => operations.push(['fillRect', ...args]),
    save() {}, restore() {}, translate() {}, scale() {}, strokeText() {}, fillText() {}
  };
  const injected = {
    GlobalFonts: { has: () => true, register: () => true },
    loadImage: async () => { throw new Error('asset unavailable'); },
    createCanvas: (width, height) => ({ width, height, getContext: () => ctx, encode: async () => Buffer.from('jpeg') })
  };
  const engine = createImageCanvasEngine({ canvasApi: injected, fetchImpl: async () => { throw new Error('offline'); } });
  const result = await engine.render({ text: 'fallback test' });
  assert.equal(result.fallbackUsed, true);
  assert.ok(operations.some(([name]) => name === 'fillRect'));
});

test('plugin loader discovers the bridge and exposes help/config without a canvas install', async () => {
  const { PluginLoader } = await import('../src/lib/plugin-loader.mjs');
  const directory = fileURLToPath(new URL('../src/plugins/', import.meta.url));
  const loader = new PluginLoader({ directory, logger: { info() {}, warn() {}, error() {} } });
  try {
    await loader.start({ watchFiles: false });
    const commands = loader.listCommands();
    const command = commands.find(item => item.name === 'katabg');
    assert.ok(command);
    assert.ok(command.aliases.includes('katabangwaindah'));
    const replies = [];
    assert.equal((await loader.execute('katabg', { args: ['help'], rawArgs: 'help', reply: async text => replies.push(text) })).found, true);
    assert.match(replies.join('\n'), /Rizkyrohan/);
    assert.equal((await loader.execute('katabg', { args: ['config'], rawArgs: 'config', reply: async text => replies.push(text) })).found, true);
    assert.match(replies.join('\n'), /Fallback background: ON/);
  } finally {
    loader.close();
  }
});

test('persistent configuration store validates, serializes concurrent writes and resets safely', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'katabg-config-test-'));
  const filePath = path.join(projectRoot, 'data', 'contributed-config', 'katabg.json');
  const store = createKatabgConfigStore({ filePath, projectRoot });
  try {
    assert.equal((await store.get()).responseStyle, 'compact');
    await Promise.all([
      store.set('responseStyle', 'detailed'),
      store.set('width', 1800),
      store.set('fallbackBackground', false)
    ]);
    const current = await store.get();
    assert.equal(current.responseStyle, 'detailed');
    assert.equal(current.width, 1800);
    assert.equal(current.fallbackBackground, false);
    await assert.rejects(() => store.set('fontPath', '/etc/passwd'), /Key tidak dapat diubah/);
    const stat = await import('node:fs/promises').then(fs => fs.stat(filePath));
    assert.equal(stat.mode & 0o777, 0o600);
    await store.reset();
    assert.equal((await store.get()).width, KATABG_DEFAULTS.width);
    assert.equal((await store.get()).responseStyle, 'compact');
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
