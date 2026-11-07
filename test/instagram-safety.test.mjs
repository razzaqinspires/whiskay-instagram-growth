import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { readInstagramSafetyState, writeInstagramSafetyState, classifyInstagramRisk, remaining } from '../src/instagram-safety.mjs';

test('safety state persists with schema and default values', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-ig-safe-'));
  const file = path.join(dir, 'guard.json');
  try {
    const state = await readInstagramSafetyState(file);
    state.lastSyncAt = new Date().toISOString();
    await writeInstagramSafetyState(state, file);
    assert.equal((await readInstagramSafetyState(file)).lastSyncAt, state.lastSyncAt);
    assert.equal(JSON.parse(await readFile(file, 'utf8')).schemaVersion, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('corrupt safety state fails closed', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-ig-safe-'));
  const file = path.join(dir, 'guard.json');
  try {
    await (await import('node:fs/promises')).writeFile(file, '{broken');
    await assert.rejects(readInstagramSafetyState(file), /rusak/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('risk classifier detects checkpoint, challenge and rate limits', () => {
  for (const message of ['checkpoint_required', 'challenge_required', 'Too many requests', 'feedback_required']) assert.equal(classifyInstagramRisk(message), true);
  assert.equal(classifyInstagramRisk('temporary local file missing'), false);
});
test('remaining never returns negative duration', () => {
  assert.equal(remaining('2000-01-01T00:00:00.000Z'), 0);
});
