import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { acquireProcessLock } from '../src/lib/process-lock.mjs';

test('runtime lock rejects a second process in the same process', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-lock-'));
  const file = path.join(dir, 'runtime.lock');
  try {
    const release = await acquireProcessLock(file);
    await assert.rejects(acquireProcessLock(file), error => error.code === 'EALREADY');
    await release();
    const releaseAgain = await acquireProcessLock(file);
    await releaseAgain();
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('runtime lock reclaims a stale PID lock', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-lock-stale-'));
  const file = path.join(dir, 'runtime.lock');
  const { writeFile } = await import('node:fs/promises');
  try {
    await writeFile(file, JSON.stringify({ pid: 2147483647, token: 'stale' }));
    const release = await acquireProcessLock(file);
    await release();
  } finally { await rm(dir, { recursive: true, force: true }); }
});
