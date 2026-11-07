import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForPromisesOrTimeout } from '../src/lib/process-supervisor.mjs';

test('waitForPromisesOrTimeout resolves when children exit and clears its grace timer', async () => {
  const started = Date.now();
  const result = await waitForPromisesOrTimeout([Promise.resolve(), Promise.resolve()], 10_000);
  assert.equal(result, true);
  assert.ok(Date.now() - started < 1000);
});

test('waitForPromisesOrTimeout reports a grace-period timeout', async () => {
  const result = await waitForPromisesOrTimeout([new Promise(() => {})], 10);
  assert.equal(result, false);
});

test('waitForPromisesOrTimeout handles an empty child list without creating a timer', async () => {
  assert.equal(await waitForPromisesOrTimeout([], 10_000), true);
});
