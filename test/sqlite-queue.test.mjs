import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../src/config.mjs';

if (!process.env.NODE_TEST_CONTEXT) throw new Error('Jalankan test menggunakan `node --test`; jangan eksekusi file test langsung.');
import { enqueueApprovedOrder, claimNextJob, completeJob, failOrRetryJob, getQueueStats, recoverStaleJobs, closeQueueDatabase } from '../src/growth/sqlite-queue.mjs';

test('SQLite queue persists, deduplicates, claims and completes approved jobs', () => {
  closeQueueDatabase();
  for (const suffix of ['', '-wal', '-shm']) rmSync(`${config.growth.queue.databaseFile}${suffix}`, { force: true });
  const order = { id: 'TEST-ORDER-001', status: 'APPROVED' };
  const first = enqueueApprovedOrder(order);
  const duplicate = enqueueApprovedOrder(order);
  assert.equal(first.id, 'submit-TEST-ORDER-001');
  assert.equal(duplicate.id, first.id);
  const job = claimNextJob();
  assert.equal(job.id, first.id);
  assert.equal(job.data.orderId, order.id);
  completeJob(job.id, { ok: true });
  assert.equal(getQueueStats().completed, 1);
  assert.equal(getQueueStats().pending, 0);
  closeQueueDatabase();
});

test('SQLite queue applies bounded exponential retry and stale-job recovery', () => {
  const order = { id: 'TEST-ORDER-002', status: 'APPROVED' };
  enqueueApprovedOrder(order);
  const job = claimNextJob();
  const retry = failOrRetryJob(job, new Error('temporary'));
  assert.equal(retry.retried, true);
  assert.ok(retry.delay >= config.growth.queue.backoffMs);
  enqueueApprovedOrder({ id: 'TEST-ORDER-003', status: 'APPROVED' });
  const crashed = claimNextJob();
  assert.equal(crashed.data.orderId, 'TEST-ORDER-003');
  const raw = new DatabaseSync(config.growth.queue.databaseFile);
  raw.prepare('UPDATE jobs SET locked_at=?, run_at=? WHERE id=?').run(Date.now() - 600_000, Date.now() - 1000, crashed.id);
  raw.close();
  assert.equal(recoverStaleJobs(300_000), 1);
  const recoveredJob = claimNextJob();
  assert.equal(recoveredJob.id, crashed.id);
  completeJob(recoveredJob.id, { recovered: true });
  closeQueueDatabase();
});

test('queue failure diagnostics are redacted and expose bounded queue age metrics', () => {
  closeQueueDatabase();
  for (const suffix of ['', '-wal', '-shm']) rmSync(`${config.growth.queue.databaseFile}${suffix}`, { force: true });

  enqueueApprovedOrder({ id: 'TEST-ORDER-REDACTION', status: 'APPROVED' });
  const job = claimNextJob();
  const secretMessage = 'Provider rejected authorization: Bearer queue-secret token=opaque-secret https://provider.example/?access_token=query-secret';
  const outcome = failOrRetryJob({ ...job, attempts: job.max_attempts }, new Error(secretMessage));
  assert.equal(outcome.retried, false);

  const database = new DatabaseSync(config.growth.queue.databaseFile);
  const row = database.prepare('SELECT last_error FROM jobs WHERE id=?').get(job.id);
  database.close();
  assert.ok(row.last_error.includes('[REDACTED]'));
  for (const secret of ['queue-secret', 'opaque-secret', 'query-secret']) {
    assert.equal(row.last_error.includes(secret), false);
  }

  const stats = getQueueStats({ now: Date.now() + 5000 });
  assert.equal(stats.failed, 1);
  assert.equal(stats.pending, 0);
  assert.ok(stats.oldestFailedAgeMs >= 5000);
  assert.ok(stats.lastFailedAt > 0);
  assert.equal(stats.oldestRunningAgeMs, null);
  closeQueueDatabase();
});

test('queue retains at most 1000 completed and 1000 failed terminal jobs', () => {
  closeQueueDatabase();
  for (const suffix of ['', '-wal', '-shm']) rmSync(`${config.growth.queue.databaseFile}${suffix}`, { force: true });
  getQueueStats();
  closeQueueDatabase();

  const now = Date.now();
  const database = new DatabaseSync(config.growth.queue.databaseFile);
  const insert = database.prepare(`INSERT INTO jobs
    (id,name,data,state,attempts,max_attempts,backoff_ms,run_at,created_at,updated_at,last_error)
    VALUES (?,'retention-test','{}',?,1,3,5000,?,?,?,'old test row')`);
  for (let index = 0; index < 1001; index += 1) {
    const timestamp = now - (1001 - index);
    insert.run(`seed-completed-${index}`, 'completed', timestamp, timestamp, timestamp);
    insert.run(`seed-failed-${index}`, 'failed', timestamp, timestamp, timestamp);
  }
  database.close();

  enqueueApprovedOrder({ id: 'TEST-ORDER-RETENTION-COMPLETE', status: 'APPROVED' });
  const completedJob = claimNextJob();
  completeJob(completedJob.id, { ok: true });

  enqueueApprovedOrder({ id: 'TEST-ORDER-RETENTION-FAILED', status: 'APPROVED' });
  const failedJob = claimNextJob();
  failOrRetryJob({ ...failedJob, attempts: failedJob.max_attempts }, new Error('permanent test failure'));

  const verify = new DatabaseSync(config.growth.queue.databaseFile);
  const completed = verify.prepare("SELECT COUNT(*) AS count FROM jobs WHERE state='completed'").get().count;
  const failed = verify.prepare("SELECT COUNT(*) AS count FROM jobs WHERE state='failed'").get().count;
  verify.close();
  assert.equal(completed, 1000);
  assert.equal(failed, 1000);
  closeQueueDatabase();
});
