import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../src/config.mjs';

if (!process.env.NODE_TEST_CONTEXT) throw new Error('Jalankan test menggunakan `node --test`; jangan eksekusi file test langsung.');
const statsFile = config.instagram.statsFile;
const sessionFile = config.instagram.sessionFile;
await mkdir(path.dirname(statsFile), { recursive: true });
await rm(statsFile, { force: true });
const instagram = await import('../src/instagram.mjs');

test('records follower snapshots and computes delta in isolated test storage', async () => {
  const first = await instagram.recordInstagramStats({ followers: 100, following: 50, posts: 10 });
  assert.equal(first.growth, null);
  const second = await instagram.recordInstagramStats({ followers: 112, following: 51, posts: 11 });
  assert.equal(second.growth, 12);
  assert.equal((await instagram.getInstagramStats()).growth, 12);
});

test('refuses login when an isolated session already exists', async () => {
  const { assertInstagramSessionMissing } = await import('../src/instagram.mjs');
  await mkdir(path.dirname(sessionFile), { recursive: true });
  await writeFile(sessionFile, '{"test":"session-present"}', { mode: 0o600 });
  try {
    await assert.rejects(() => assertInstagramSessionMissing(), /Session Instagram sudah tersedia/);
  } finally {
    await rm(sessionFile, { force: true });
  }
});

test.after(async () => {
  await rm(statsFile, { force: true });
  await rm(sessionFile, { force: true });
});
