import test from 'node:test';
import assert from 'node:assert/strict';
import { getReconnectDelay } from '../src/lib/reconnect-policy.mjs';

test('reconnect policy applies exponential delays with bounded jitter', () => {
  assert.equal(getReconnectDelay(1, () => 0.5), 3000);
  assert.equal(getReconnectDelay(2, () => 0.5), 6000);
  assert.equal(getReconnectDelay(3, () => 0.5), 12000);
  assert.equal(getReconnectDelay(7, () => 0.5), 120000);
  assert.equal(getReconnectDelay(100, () => 0.5), 120000);
});

test('reconnect policy jitter stays within +/-20 percent', () => {
  assert.equal(getReconnectDelay(1, () => 0), 2400);
  assert.equal(getReconnectDelay(1, () => 0.999), 3599);
});

test('reconnect policy rejects invalid attempts and random sources', () => {
  assert.throws(() => getReconnectDelay(0), /integer/);
  assert.throws(() => getReconnectDelay(1, 0.5), /function/);
  assert.throws(() => getReconnectDelay(1, () => 1), RangeError);
});
