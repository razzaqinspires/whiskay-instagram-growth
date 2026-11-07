import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRuntimeModeStore } from '../src/lib/runtime-mode.mjs';
import { handleMessage } from '../src/commands.mjs';

const owner = '6281234567890';
const sessionPn = `${owner}:4@s.whatsapp.net`;
const logger = { info() {}, warn() {}, error() {} };
const quietPlugin = {
  listCommands: () => [
    { name: 'igstats', description: 'private stats' },
    { name: 'igservices', description: 'public service catalogue' }
  ],
  execute: async name => ({ found: name === 'igservices' })
};

async function createFixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'whiskay-mode-test-'));
  const store = createRuntimeModeStore({ filePath: path.join(directory, 'runtime-mode.json'), initialMode: 'self', initialAllowGroups: false });
  const sent = [];
  const sock = { user: { id: sessionPn }, sendMessage: async (jid, payload) => { sent.push({ jid, payload }); } };
  return { directory, store, sent, sock };
}

function message(text, key) {
  return { key: { id: `MODE-${Math.random().toString(36).slice(2)}`, ...key }, message: { conversation: text } };
}

test('runtime mode store persists only valid self/public mode and group switch', async () => {
  const fixture = await createFixture();
  try {
    assert.deepEqual(await fixture.store.get(), { version: 1, mode: 'self', allowGroups: false, updatedAt: null });
    const saved = await fixture.store.update({ mode: 'public', allowGroups: true });
    assert.equal(saved.mode, 'public');
    assert.equal(saved.allowGroups, true);
    const reloaded = createRuntimeModeStore({ filePath: fixture.store.filePath, initialMode: 'self', initialAllowGroups: false });
    assert.deepEqual(await reloaded.get(), saved);
    const raw = JSON.parse(await readFile(fixture.store.filePath, 'utf8'));
    assert.equal(raw.version, 1);
    await assert.rejects(() => fixture.store.update({ mode: 'admin' }), /Mode runtime harus self atau public/);
  } finally { await rm(fixture.directory, { recursive: true, force: true }); }
});

test('self mode allows owner in group only after owner turns group access on', async () => {
  const fixture = await createFixture();
  try {
    const groupKey = { remoteJid: '120363012345678901@g.us', participant: sessionPn, fromMe: true };
    let handled = await handleMessage(fixture.sock, message('.igservices', groupKey), {
      modeStore: fixture.store, pluginLoader: quietPlugin, logger, ownerNumber: owner
    });
    assert.equal(handled, false);

    handled = await handleMessage(fixture.sock, message('.mode groups on', {
      remoteJid: `${owner}@s.whatsapp.net`, fromMe: true
    }), { modeStore: fixture.store, pluginLoader: quietPlugin, logger, ownerNumber: owner });
    assert.equal(handled, true);
    assert.match(fixture.sent.at(-1).payload.text, /Group access: ON/);

    handled = await handleMessage(fixture.sock, message('.igservices', groupKey), {
      modeStore: fixture.store, pluginLoader: quietPlugin, logger, ownerNumber: owner
    });
    assert.equal(handled, true);
  } finally { await rm(fixture.directory, { recursive: true, force: true }); }
});

test('public mode blocks every group command and permits only the private read-only allowlist', async () => {
  const fixture = await createFixture();
  try {
    await handleMessage(fixture.sock, message('.mode groups on', {
      remoteJid: `${owner}@s.whatsapp.net`, fromMe: true
    }), { modeStore: fixture.store, pluginLoader: quietPlugin, logger, ownerNumber: owner });
    await handleMessage(fixture.sock, message('.mode public', {
      remoteJid: `${owner}@s.whatsapp.net`, fromMe: true
    }), { modeStore: fixture.store, pluginLoader: quietPlugin, logger, ownerNumber: owner });
    assert.equal((await fixture.store.get()).mode, 'public');

    const groupResult = await handleMessage(fixture.sock, message('.igservices', {
      remoteJid: '120363012345678901@g.us', participant: '6289999999999@s.whatsapp.net', fromMe: false
    }), { modeStore: fixture.store, pluginLoader: quietPlugin, logger, ownerNumber: owner });
    assert.equal(groupResult, false);

    const privateReadOnly = await handleMessage(fixture.sock, message('.igservices', {
      remoteJid: '6289999999999@s.whatsapp.net', fromMe: false
    }), { modeStore: fixture.store, pluginLoader: quietPlugin, logger, ownerNumber: owner });
    assert.equal(privateReadOnly, true);

    const privateSensitive = await handleMessage(fixture.sock, message('.igstats', {
      remoteJid: '6289999999999@s.whatsapp.net', fromMe: false
    }), { modeStore: fixture.store, pluginLoader: quietPlugin, logger, ownerNumber: owner });
    assert.equal(privateSensitive, false);

    const publicMenu = await handleMessage(fixture.sock, message('.menu', {
      remoteJid: '6289999999999@s.whatsapp.net', fromMe: false
    }), { modeStore: fixture.store, pluginLoader: quietPlugin, logger, ownerNumber: owner });
    assert.equal(publicMenu, true);
    assert.match(fixture.sent.at(-1).payload.text, /igservices/);
    assert.doesNotMatch(fixture.sent.at(-1).payload.text, /igstats/);
  } finally { await rm(fixture.directory, { recursive: true, force: true }); }
});

test('non-owner cannot invoke mode command in self or public mode', async () => {
  const fixture = await createFixture();
  try {
    const attempt = await handleMessage(fixture.sock, message('.mode public', {
      remoteJid: '6289999999999@s.whatsapp.net', participant: '6289999999999@s.whatsapp.net', fromMe: false
    }), { modeStore: fixture.store, pluginLoader: quietPlugin, logger, ownerNumber: owner });
    assert.equal(attempt, false);
    assert.equal((await fixture.store.get()).mode, 'self');
  } finally { await rm(fixture.directory, { recursive: true, force: true }); }
});
