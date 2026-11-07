import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config.mjs';

let connection;
let queue;
function getConnection() {
  if (!connection) connection = new IORedis(config.growth.queue.redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: true, lazyConnect: true, password: config.growth.queue.redisPassword || undefined });
  return connection;
}
export async function getGrowthQueue() {
  if (config.growth.queue.driver !== 'redis') throw new Error('Queue driver bukan Redis.');
  if (!queue) {
    connection = getConnection();
    if (connection.status === 'wait') await connection.connect();
    queue = new Queue(config.growth.queue.name, { connection, defaultJobOptions: { attempts: config.growth.queue.attempts, backoff: { type: 'exponential', delay: config.growth.queue.backoffMs }, removeOnComplete: 1000, removeOnFail: 5000 } });
  }
  return queue;
}
export async function enqueueApprovedOrder(order) {
  if (!order?.id || order.status !== 'APPROVED') throw new TypeError('Hanya order APPROVED yang boleh masuk antrean.');
  const q = await getGrowthQueue();
  return q.add('submit-promotion', { orderId: order.id }, { jobId: `submit-${order.id}` });
}
export async function closeGrowthQueue() {
  if (queue) await queue.close();
  if (connection) await connection.quit();
  queue = undefined; connection = undefined;
}
