import { getQueueStats, closeQueueDatabase } from '../src/growth/sqlite-queue.mjs';

function formatDuration(milliseconds) {
  if (milliseconds === null || milliseconds === undefined) return '—';
  const totalSeconds = Math.floor(milliseconds / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatTimestamp(timestamp) {
  return timestamp === null || timestamp === undefined ? '—' : new Date(timestamp).toISOString();
}

try {
  const stats = getQueueStats();
  console.log('[QUEUE] SQLite queue siap');
  console.log(`Database: ${stats.databaseFile}`);
  console.log(`Jobs: pending=${stats.pending} | running=${stats.running} | completed=${stats.completed} | failed=${stats.failed}`);
  console.log(`Oldest pending: ${formatDuration(stats.oldestPendingAgeMs)} | next due: ${formatTimestamp(stats.nextPendingAt)}`);
  console.log(`Oldest running: ${formatDuration(stats.oldestRunningAgeMs)} | oldest failed: ${formatDuration(stats.oldestFailedAgeMs)}`);
  console.log(`Last completed: ${formatTimestamp(stats.lastCompletedAt)} | last failed: ${formatTimestamp(stats.lastFailedAt)}`);
} catch (error) {
  console.error(`[QUEUE] Diagnostik gagal: ${error?.code || 'UNKNOWN'} ${error?.message || 'Unknown error'}`);
  process.exitCode = 1;
} finally {
  closeQueueDatabase();
}
