process.umask(0o077);
import { setTimeout as delay } from 'node:timers/promises';
import { config } from '../config.mjs';
import { sanitizeError } from '../security/redact.mjs';
import { PromotionProviderAdapter } from './provider-adapter.mjs';
import { getOrder, getOrdersPage, setProviderOrderReference, updateOrderStatus } from './store.mjs';
import { claimNextJob, completeJob, failOrRetryJob, recoverStaleJobs, closeQueueDatabase } from './sqlite-queue.mjs';

const provider = new PromotionProviderAdapter();
let stopping = false;
let active = 0;
const stopController = new AbortController();
const requestStop = () => {
  if (stopping) return;
  stopping = true;
  stopController.abort();
};
const waitWhileRunning = ms => delay(ms, undefined, { signal: stopController.signal })
  .catch(error => { if (error.name !== 'AbortError') throw error; });
process.on('SIGINT', requestStop);
process.on('SIGTERM', requestStop);
process.on('SIGTSTP', requestStop);
let lastPoll = 0;
const concurrency = config.growth.queue.concurrency;

async function pollProviderStatuses() {
  if (!config.growth.providerEnabled || Date.now() - lastPoll < 60_000) return;
  lastPoll = Date.now();
  const page = await getOrdersPage({ page: 1, limit: 25, status: 'IN_PROGRESS' });
  for (const order of page.items.filter(x => x.providerOrderId)) {
    try {
      const result = await provider.getOrderStatus(order.providerOrderId);
      const raw = String(result.status || '').toLowerCase();
      const mapped = ({ pending: 'APPROVED', processing: 'IN_PROGRESS', 'in progress': 'IN_PROGRESS', completed: 'COMPLETED', partial: 'PARTIAL', canceled: 'CANCELED', cancelled: 'CANCELED', failed: 'FAILED' })[raw];
      if (mapped && mapped !== order.status && mapped !== 'APPROVED' && mapped !== 'PARTIAL') {
        await updateOrderStatus(order.id, mapped, `Provider status: ${raw}`);
      }
    } catch (error) {
      const safeError = sanitizeError(error);
      console.error(`[growth-worker] status poll ${order.id} [${safeError.code}]: ${safeError.message}`);
    }
  }
}

async function processJob(job) {
  try {
    if (!config.growth.providerEnabled) {
      completeJob(job.id, { skipped: true, reason: 'provider-disabled' });
      return;
    }
    if (job.name !== 'submit-promotion') throw new Error(`Unknown job: ${job.name}`);
    const order = await getOrder(job.data.orderId);
    if (!order || order.status !== 'APPROVED') {
      completeJob(job.id, { skipped: true, reason: 'order-not-approved-or-missing' });
      return;
    }
    if (order.providerOrderId) {
      await updateOrderStatus(order.id, 'IN_PROGRESS', 'Melanjutkan order yang sudah memiliki provider reference.');
      completeJob(job.id, { duplicate: true, providerOrderId: order.providerOrderId });
      return;
    }
    const result = await provider.submitPromotionOrder(order);
    if (!result.accepted) throw new Error(result.message || 'Provider tidak menerima order.');
    await setProviderOrderReference(order.id, result.provider, result.providerOrderId);
    await updateOrderStatus(order.id, 'IN_PROGRESS', 'Provider menerima order.');
    completeJob(job.id, result);
  } catch (error) {
    const safeError = sanitizeError(error);
    const outcome = failOrRetryJob(job, error);
    console.error(`[growth-worker] ${job.id} ${outcome.retried ? 'retry dijadwalkan' : 'gagal permanen'} [${safeError.code}]: ${safeError.message}`);
    if (!outcome.retried && job.name === 'submit-promotion') {
      const order = await getOrder(job.data.orderId).catch(() => null);
      if (order?.status === 'APPROVED') await updateOrderStatus(order.id, 'FAILED', 'Provider gagal setelah seluruh retry worker.').catch(() => {});
    }
  }
}

recoverStaleJobs();
console.log(config.growth.providerEnabled
  ? `[growth-worker] SQLite queue aktif; concurrency=${concurrency}`
  : '[growth-worker] Provider nonaktif; worker standby. Tidak ada order eksternal yang dikirim.');

while (!stopping) {
  if (!config.growth.providerEnabled) {
    await waitWhileRunning(3000);
    continue;
  }
  await pollProviderStatuses();
  while (!stopping && active < concurrency) {
    const job = claimNextJob();
    if (!job) break;
    active += 1;
    processJob(job).catch(error => {
      const safeError = sanitizeError(error);
      console.error(`[growth-worker] unhandled job error [${safeError.code}]: ${safeError.message}`);
    }).finally(() => { active -= 1; });
  }
  await waitWhileRunning(active ? 250 : 1000);
}

while (active > 0) await delay(100);
closeQueueDatabase();
console.log('[growth-worker] stopped');
