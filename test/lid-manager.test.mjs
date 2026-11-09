import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { attachLidManager, pairFromKey } from '../src/lib/lid-manager.mjs';

const silentLogger = { info() {}, warn() {}, debug() {} };

test('LID events received while the persisted map loads are buffered and applied afterward', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'whiskay-lid-test-'));
  const file = path.join(directory, 'lid-map.json');
  const eventEmitter = new EventEmitter();
  const storedMappings = [];
  const sock = {
    ev: eventEmitter,
    signalRepository: {
      lidMapping: {
        async storeLIDPNMappings(rows) { storedMappings.push(...rows); },
        async getPNForLID() { return null; }
      }
    }
  };

  try {
    const managerPromise = attachLidManager(sock, { file, logger: silentLogger });
    eventEmitter.emit('messages.upsert', {
      type: 'notify',
      messages: [{ key: {
        remoteJid: '59206778490968@lid',
        remoteJidAlt: '6281234567890@s.whatsapp.net'
      } }]
    });

    const manager = await managerPromise;
    assert.equal(await manager.sameUser('59206778490968@lid', '6281234567890@s.whatsapp.net'), true);

    const saved = JSON.parse(await readFile(file, 'utf8'));
    assert.deepEqual(saved.pairs, [{ lid: '59206778490968@lid', pn: '6281234567890@s.whatsapp.net' }]);
    assert.equal(storedMappings.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('LID manager does not rewrite or re-store an unchanged mapping', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'whiskay-lid-test-'));
  const file = path.join(directory, 'lid-map.json');
  const eventEmitter = new EventEmitter();
  let writes = 0;
  const sock = {
    ev: eventEmitter,
    signalRepository: {
      lidMapping: {
        async storeLIDPNMappings() { writes += 1; },
        async getPNForLID() { return null; }
      }
    }
  };

  try {
    const manager = await attachLidManager(sock, { file, logger: silentLogger });
    const pair = { lid: '59206778490968@lid', pn: '6281234567890@s.whatsapp.net' };
    await manager.rememberPairs([pair], 'test-first');
    await manager.rememberPairs([pair], 'test-duplicate');
    assert.equal(writes, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('broadcast status author can be cross-paired from participant LID and remoteJidAlt PN', () => {
  const pairs = pairFromKey({
    remoteJid: 'status@broadcast',
    remoteJidAlt: '6281234567890@s.whatsapp.net',
    participant: '123456789012345@lid'
  }, 'test-broadcast');
  assert.deepEqual(pairs, [{
    lid: '123456789012345@lid',
    pn: '6281234567890@s.whatsapp.net',
    source: 'test-broadcast:broadcast-cross-pair'
  }]);
});
