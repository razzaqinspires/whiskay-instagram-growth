import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync, existsSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config.mjs';
import { sanitizeError } from '../security/redact.mjs';

process.umask(0o077);
const DB_FILE = config.growth.queue.databaseFile;
let db;

function openDb() {
  if (db) return db;
  mkdirSync(path.dirname(DB_FILE), { recursive: true, mode: 0o700 });
  db = new DatabaseSync(DB_FILE);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      data TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','running','completed','failed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL,
      backoff_ms INTEGER NOT NULL,
      run_at INTEGER NOT NULL,
      locked_at INTEGER,
      last_error TEXT,
      result TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS jobs_ready_idx ON jobs(state, run_at, created_at);
  `);
  chmodSync(DB_FILE, 0o600);
  const wal = `${DB_FILE}-wal`;
  const shm = `${DB_FILE}-shm`;
  if (existsSync(wal)) chmodSync(wal, 0o600);
  if (existsSync(shm)) chmodSync(shm, 0o600);
  return db;
}

export function enqueueApprovedOrder(order) {
  if (!order?.id || order.status !== 'APPROVED') throw new TypeError('Hanya order APPROVED yang boleh masuk antrean.');
  const database = openDb();
  const now = Date.now();
  const id = `submit-${order.id}`;
  database.prepare(`INSERT OR IGNORE INTO jobs (id,name,data,max_attempts,backoff_ms,run_at,created_at,updated_at)
    VALUES (?, 'submit-promotion', ?, ?, ?, ?, ?, ?)`)
    .run(id, JSON.stringify({ orderId: order.id }), config.growth.queue.attempts, config.growth.queue.backoffMs, now, now, now);
  const row = database.prepare('SELECT id,state FROM jobs WHERE id = ?').get(id);
  return { id: row.id, state: row.state };
}

export function recoverStaleJobs(staleMs = 10 * 60 * 1000) {
  const now = Date.now();
  const result = openDb().prepare(`UPDATE jobs SET state='pending', locked_at=NULL, run_at=?, updated_at=?
    WHERE state='running' AND locked_at < ?`).run(now, now, now - staleMs);
  return Number(result.changes || 0);
}

export function claimNextJob() {
  const database = openDb();
  database.exec('BEGIN IMMEDIATE');
  try {
    const now = Date.now();
    const job = database.prepare(`SELECT * FROM jobs WHERE state='pending' AND run_at <= ? ORDER BY created_at ASC LIMIT 1`).get(now);
    if (!job) { database.exec('COMMIT'); return null; }
    const update = database.prepare(`UPDATE jobs SET state='running', attempts=attempts+1, locked_at=?, updated_at=? WHERE id=? AND state='pending'`).run(now, now, job.id);
    database.exec('COMMIT');
    if (!update.changes) return null;
    return { ...job, attempts: job.attempts + 1, data: JSON.parse(job.data) };
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function pruneTerminalJobs(database) {
  database.prepare(`DELETE FROM jobs WHERE state='completed'
    AND id NOT IN (SELECT id FROM jobs WHERE state='completed' ORDER BY updated_at DESC LIMIT 1000)`).run();
  database.prepare(`DELETE FROM jobs WHERE state='failed'
    AND id NOT IN (SELECT id FROM jobs WHERE state='failed' ORDER BY updated_at DESC LIMIT 1000)`).run();
}

export function completeJob(id, result = {}) {
  const database = openDb();
  const now = Date.now();
  database.prepare(`UPDATE jobs SET state='completed', result=?, locked_at=NULL, updated_at=? WHERE id=?`)
    .run(JSON.stringify(result), now, id);
  pruneTerminalJobs(database);
}

export function failOrRetryJob(job, error) {
  const database = openDb();
  const now = Date.now();
  const message = sanitizeError(error).message;
  if (job.attempts < job.max_attempts) {
    const delay = Math.min(60 * 60 * 1000, job.backoff_ms * (2 ** Math.max(0, job.attempts - 1)));
    database.prepare(`UPDATE jobs SET state='pending', run_at=?, locked_at=NULL, last_error=?, updated_at=? WHERE id=?`)
      .run(now + delay, message, now, job.id);
    return { retried: true, delay, error: message };
  }
  database.prepare(`UPDATE jobs SET state='failed', locked_at=NULL, last_error=?, updated_at=? WHERE id=?`)
    .run(message, now, job.id);
  pruneTerminalJobs(database);
  return { retried: false, delay: 0, error: message };
}

export function getQueueStats({ now = Date.now() } = {}) {
  if (!Number.isFinite(now) || now < 0) throw new TypeError('Waktu diagnostik queue tidak valid.');
  const rows = openDb().prepare(`SELECT state, COUNT(*) AS count,
    MIN(created_at) AS oldest_created_at,
    MIN(run_at) AS next_run_at,
    MIN(locked_at) AS oldest_locked_at,
    MAX(updated_at) AS latest_updated_at
    FROM jobs GROUP BY state`).all();
  const stats = {
    pending: 0, running: 0, completed: 0, failed: 0,
    oldestPendingAt: null, nextPendingAt: null,
    oldestRunningAt: null, oldestFailedAt: null,
    lastCompletedAt: null, lastFailedAt: null,
  };
  for (const row of rows) {
    stats[row.state] = Number(row.count);
    if (row.state === 'pending') {
      stats.oldestPendingAt = row.oldest_created_at === null ? null : Number(row.oldest_created_at);
      stats.nextPendingAt = row.next_run_at === null ? null : Number(row.next_run_at);
    } else if (row.state === 'running') {
      stats.oldestRunningAt = row.oldest_locked_at === null ? null : Number(row.oldest_locked_at);
    } else if (row.state === 'failed') {
      stats.oldestFailedAt = row.oldest_created_at === null ? null : Number(row.oldest_created_at);
      stats.lastFailedAt = row.latest_updated_at === null ? null : Number(row.latest_updated_at);
    } else if (row.state === 'completed') {
      stats.lastCompletedAt = row.latest_updated_at === null ? null : Number(row.latest_updated_at);
    }
  }
  const age = timestamp => timestamp === null ? null : Math.max(0, now - timestamp);
  return {
    databaseFile: DB_FILE,
    ...stats,
    oldestPendingAgeMs: age(stats.oldestPendingAt),
    oldestRunningAgeMs: age(stats.oldestRunningAt),
    oldestFailedAgeMs: age(stats.oldestFailedAt),
    nextPendingInMs: stats.nextPendingAt === null ? null : Math.max(0, stats.nextPendingAt - now),
  };
}

export function closeQueueDatabase() {
  if (!db) return;
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();
  db = undefined;
}
