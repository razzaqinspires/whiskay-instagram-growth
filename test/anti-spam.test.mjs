import test from 'node:test';
import assert from 'node:assert/strict';
import { AntiSpamGuard } from '../src/security/anti-spam.mjs';

test('allows first command and blocks rapid same-command repeat', () => {
  const guard = new AntiSpamGuard({ cooldownMs: 1500, warningCooldownMs: 1000 });
  const first = guard.check({ sender: '123@s.whatsapp.net', command: 'ping', messageId: 'a', now: 10_000 });
  assert.equal(first.allowed, true);
  first.release();
  const second = guard.check({ sender: '123@s.whatsapp.net', command: 'ping', messageId: 'b', now: 10_500 });
  assert.equal(second.allowed, false);
  assert.equal(second.reason, 'COMMAND_COOLDOWN');
});

test('blocks duplicate message IDs and throttles warnings', () => {
  const guard = new AntiSpamGuard({ cooldownMs: 0, warningCooldownMs: 30_000 });
  const first = guard.check({ sender: 'owner', command: 'menu', messageId: 'same', now: 100_000 });
  first.release();
  const duplicate = guard.check({ sender: 'owner', command: 'menu', messageId: 'same', now: 100_100 });
  assert.equal(duplicate.reason, 'DUPLICATE_MESSAGE');
  assert.equal(duplicate.warn, true);
  const duplicateAgain = guard.check({ sender: 'owner', command: 'menu', messageId: 'same', now: 100_200 });
  assert.equal(duplicateAgain.warn, false);
});

test('enforces burst, per-minute and concurrency limits', () => {
  const guard = new AntiSpamGuard({ cooldownMs: 0, windowMs: 10_000, maxHits: 2, perMinute: 3, maxConcurrent: 1 });
  const first = guard.check({ sender: 'owner', command: 'one', messageId: '1', now: 1_000 });
  const concurrent = guard.check({ sender: 'owner', command: 'two', messageId: '2', now: 1_001 });
  assert.equal(concurrent.reason, 'CONCURRENCY_LIMIT');
  first.release();
  const second = guard.check({ sender: 'owner', command: 'two', messageId: '3', now: 1_002 });
  assert.equal(second.allowed, true);
  second.release();
  const burst = guard.check({ sender: 'owner', command: 'three', messageId: '4', now: 1_003 });
  assert.equal(burst.reason, 'BURST_LIMIT');
});

test('rejects unsafe limiter configuration', () => {
  assert.throws(() => new AntiSpamGuard({ maxHits: 0 }));
});

test('enforces per-minute cap independently from short burst window', () => {
  const guard = new AntiSpamGuard({ cooldownMs: 0, windowMs: 1000, maxHits: 10, perMinute: 2, maxConcurrent: 2 });
  const first = guard.check({ sender: 'owner', command: 'one', messageId: 'm1', now: 10_000 });
  first.release();
  const second = guard.check({ sender: 'owner', command: 'two', messageId: 'm2', now: 10_100 });
  second.release();
  const third = guard.check({ sender: 'owner', command: 'three', messageId: 'm3', now: 12_000 });
  assert.equal(third.allowed, false);
  assert.equal(third.reason, 'MINUTE_LIMIT');
});
