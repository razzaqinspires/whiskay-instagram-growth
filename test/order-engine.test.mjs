import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { config } from '../src/config.mjs';

if (!process.env.NODE_TEST_CONTEXT) throw new Error('Jalankan test menggunakan `node --test`; jangan eksekusi file test langsung.');
const dbFile = config.growth.databaseFile;
const dir = path.dirname(dbFile);
await (await import('node:fs/promises')).mkdir(dir, { recursive: true });
await (await import('node:fs/promises')).rm(dbFile, { force: true });
const engine = await import('../src/growth/order-engine.mjs');
const store = await import('../src/growth/store.mjs');

test('target normalization accepts username and profile URL', () => {
  assert.equal(engine.normalizeInstagramTarget('@razzaqventures'), 'https://www.instagram.com/razzaqventures/');
  assert.equal(engine.normalizeInstagramTarget('https://www.instagram.com/razzaqventures/'), 'https://www.instagram.com/razzaqventures/');
  assert.throws(() => engine.normalizeInstagramTarget('not a username!'));
  assert.throws(() => engine.normalizeInstagramTarget('https://evil.example/razzaqventures'));
  assert.throws(() => engine.normalizeInstagramTarget('https://instagram.com.evil.example/razzaqventures'));
  assert.throws(() => engine.normalizeInstagramTarget('https://www.instagram.com/a/reels/'));
  assert.throws(() => engine.parseBudget('1e6'));
  assert.throws(() => engine.parseBudget('10.5'));
  assert.equal(engine.parseBudget('150,000'), 150000);
});

test('catalog order is created in pending review and transitions are enforced', async () => {
  const { order, providerResult } = await engine.submitGrowthOrder({ serviceId: 'creator-collab', target: 'razzaqventures', budget: 100000, notes: 'test' });
  assert.equal(order.status, 'PENDING_REVIEW');
  assert.equal(providerResult.accepted, false);
  const updated = await engine.setGrowthOrderStatus(order.id, 'APPROVED', 'reviewed');
  assert.equal(updated.status, 'APPROVED');
  await assert.rejects(() => engine.setGrowthOrderStatus(order.id, 'COMPLETED'), /Transisi status tidak valid/);
});

test('internal credit ledger validates and records balances', async () => {
  const entry = await store.addCredit(25000, 'test credit');
  assert.equal(entry.balance, 25000);
  assert.equal((await store.getGrowthOverview()).balance, 25000);
  await assert.rejects(() => store.addCredit(-1, 'invalid'));
});

test.after(async () => { await rm(dbFile, { force: true }); });


test('order history supports bounded pagination and status filtering', async () => {
  const page1 = await store.getOrdersPage({ page: 1, limit: 1, status: 'ALL' });
  assert.equal(page1.limit, 1);
  assert.equal(page1.total, 1);
  assert.equal(page1.items.length, 1);
  assert.equal(page1.items[0].status, 'APPROVED');
  const empty = await store.getOrdersPage({ page: 1, limit: 5, status: 'FAILED' });
  assert.equal(empty.total, 0);
  await assert.rejects(() => store.getOrdersPage({ page: 0 }), /Nomor halaman/);
  await assert.rejects(() => store.getOrdersPage({ limit: 100 }), /Limit halaman/);
  await assert.rejects(() => store.getOrdersPage({ status: 'UNKNOWN' }), /Filter status/);
});

test('wallet reservation is idempotent and cancellation refunds full reserved amount', async () => {
  const balanceBefore = (await store.getGrowthOverview()).balance;
  await store.addCredit(100000, 'wallet test');
  const args = { service: 'creator-collab', target: 'https://www.instagram.com/razzaqventures/', budget: 40000, chargeAmount: 40000, idempotencyKey: 'wallet-test-key-0001' };
  const first = await store.createOrder(args);
  const second = await store.createOrder(args);
  assert.equal(first.id, second.id);
  assert.equal((await store.getGrowthOverview()).balance, balanceBefore + 60000);
  await store.updateOrderStatus(first.id, 'CANCELED', 'test refund');
  assert.equal((await store.getGrowthOverview()).balance, balanceBefore + 100000);
  const canceled = await store.getOrder(first.id);
  assert.equal(canceled.refundedAmount, 40000);
});

test('partial refund uses delivered ratio and cancellation refunds remainder', async () => {
  const order = await store.createOrder({ service: 'creator-collab', target: 'https://www.instagram.com/razzaqventures/', budget: 20000, chargeAmount: 20000 });
  await store.updateOrderStatus(order.id, 'APPROVED');
  await store.updateOrderStatus(order.id, 'IN_PROGRESS');
  await store.updateOrderStatus(order.id, 'PARTIAL', 'partial delivery', { deliveredUnits: 4, totalUnits: 10 });
  const partial = await store.getOrder(order.id);
  assert.equal(partial.refundedAmount, 12000);
  await store.updateOrderStatus(order.id, 'CANCELED', 'cancel remaining');
  assert.equal((await store.getOrder(order.id)).refundedAmount, 20000);
});
