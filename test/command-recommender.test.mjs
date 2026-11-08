import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CommandUsageStore } from '../src/lib/command-recommender.mjs';

test('tracks total hits, recent demand, and recommendation exposures persistently', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-recommender-'));
  let now = Date.UTC(2026, 10, 8);
  const store = new CommandUsageStore({ filePath: path.join(dir, 'usage.json'), now: () => now });
  try {
    await store.recordHit('igprofile');
    await store.recordHit('igprofile');
    await store.recordHit('igstats');
    const stats = await store.getStats('igprofile');
    assert.equal(stats.totalHits, 2);
    assert.equal(stats.recent7d, 2);
    await store.recordExposure(['igprofile', 'igstats']);
    assert.equal((await store.getStats('igprofile')).exposures, 1);
    const info = await store.status();
    assert.equal(info.trackedCommands, 2);
    assert.equal(info.recommendationsShown, 1);
    const permissions = await stat(path.join(dir, 'usage.json'));
    assert.equal(permissions.mode & 0o077, 0);
    now += 8 * 86_400_000;
    assert.equal((await store.getStats('igprofile')).recent7d, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('ranking is deterministic, demand-aware, category-diverse, and reserves discovery slots', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-recommender-rank-'));
  const store = new CommandUsageStore({ filePath: path.join(dir, 'usage.json'), now: () => Date.UTC(2026, 10, 8) });
  try {
    for (let i = 0; i < 40; i += 1) await store.recordHit('igprofile');
    for (let i = 0; i < 20; i += 1) await store.recordHit('igstats');
    const commands = [
      { name: 'igprofile', category: 'Instagram' },
      { name: 'igstats', category: 'Instagram' },
      { name: 'ping', category: 'Core' },
      { name: 'remini', category: 'Media' },
      { name: 'acad', category: 'Documents' },
      { name: 'igdl', category: 'Instagram' },
      { name: 'waform', category: 'WhatsApp' },
      { name: 'plugins', category: 'Core' },
      { name: 'jidstats', category: 'Core' },
      { name: 'hotreload', category: 'Core' },
      { name: 'mediainfo', category: 'Media' },
      { name: 'poll', category: 'WhatsApp' }
    ];
    const rankedA = await store.rank(commands, { limit: 10 });
    const rankedB = await store.rank(commands, { limit: 10 });
    assert.deepEqual(rankedA.map(item => item.name), rankedB.map(item => item.name));
    assert.equal(rankedA.length, 10);
    assert.ok(rankedA.some(item => item.name === 'igprofile' && item.totalHits === 40));
    assert.ok(rankedA.some(item => ['remini', 'acad', 'igdl', 'waform', 'jidstats', 'hotreload', 'mediainfo', 'poll'].includes(item.name)));
    assert.ok(Math.abs(rankedA.reduce((sum, item) => sum + item.recommendationPercent, 0) - 100) < 1e-8);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
