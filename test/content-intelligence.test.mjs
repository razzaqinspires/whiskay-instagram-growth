import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../src/config.mjs';
import { calculateContentMetrics, buildContentIntelligence } from '../src/growth/content-intelligence.mjs';
import { createCampaign, recordContentPerformance, getContentPosts, getContentPost, migrateGrowthState } from '../src/growth/store.mjs';

if (!process.env.NODE_TEST_CONTEXT) throw new Error('Jalankan test menggunakan `node --test`; jangan eksekusi file test langsung.');
const dbFile = config.growth.databaseFile;

const metrics = { reach: 1000, impressions: 1400, profileVisits: 100, follows: 20, likes: 80, comments: 10, shares: 8, saves: 12 };

test('content metrics calculate weighted funnel and engagement rates', () => {
  const result = calculateContentMetrics(metrics);
  assert.equal(result.profileVisitRatePct, 10);
  assert.equal(result.profileVisitToFollowRatePct, 20);
  assert.equal(result.reachToFollowRatePct, 2);
  assert.equal(result.engagements, 110);
  assert.equal(result.engagementRatePct, 11);
  assert.equal(result.followsPerThousandReach, 20);
});

test('content intelligence aggregates by format and theme using summed counts', () => {
  const report = buildContentIntelligence([
    { id: 'a', label: 'A', format: 'reel', theme: 'coding', metrics },
    { id: 'b', label: 'B', format: 'reel', theme: 'coding', metrics: { ...metrics, reach: 3000, profileVisits: 120, follows: 15 } },
    { id: 'c', label: 'C', format: 'carousel', theme: 'tutorial', metrics: { ...metrics, reach: 500, profileVisits: 70, follows: 14 } }
  ]);
  assert.equal(report.contentCount, 3);
  assert.equal(report.totals.reach, 4500);
  assert.equal(report.byFormat.length, 2);
  assert.equal(report.byTheme.length, 2);
  assert.equal(report.topContent[0].id, 'c');
  assert.ok(report.recommendations.some(item => item.includes('follows per 1.000 reach')));
});

test('growth store migrates legacy financial data out and preserves session-bound organic records', async () => {
  await mkdir(path.dirname(dbFile), { recursive: true });
  const legacy = {
    version: 3, balance: 123, ledger: [{ id: 'legacy-ledger' }], orders: [{ id: 'legacy-order' }],
    campaigns: [{ id: 'CMPLEGACY001', name: 'Legacy', target: 'https://www.instagram.com/test_account/', budget: 0, status: 'ACTIVE', checkpoints: [] }],
    idempotency: { legacy: 'legacy-order' }
  };
  await writeFile(dbFile, JSON.stringify(legacy));
  const migration = await migrateGrowthState();
  assert.equal(migration.version, 5);
  assert.equal(migration.campaigns, 1);
  assert.equal(migration.contentPosts, 0);
  await recordContentPerformance({
    accountUsername: 'test_account', label: 'Version migration post', url: 'https://www.instagram.com/p/VERSION2/', format: 'post', theme: 'migration', metrics
  });
  const upgraded = JSON.parse(await readFile(dbFile, 'utf8'));
  assert.equal(upgraded.version, 5);
  assert.equal(Object.hasOwn(upgraded, 'balance'), false);
  assert.equal(Object.hasOwn(upgraded, 'ledger'), false);
  assert.equal(Object.hasOwn(upgraded, 'orders'), false);
  assert.equal(Object.hasOwn(upgraded, 'idempotency'), false);
  assert.equal(upgraded.campaigns[0].id, 'CMPLEGACY001');
  assert.equal(upgraded.campaigns[0].accountUsername, 'test_account');
  assert.equal(Object.hasOwn(upgraded.campaigns[0], 'budget'), false);
  assert.deepEqual(Object.keys(upgraded.campaigns[0]).sort(), ['accountUsername', 'checkpoints', 'id', 'name', 'status', 'target'].sort());
  assert.equal(upgraded.contentPosts.length, 1);
});

test('content store keeps snapshots, associates campaigns and normalizes shared URLs', async () => {
  const campaign = await createCampaign({
    name: 'Content attribution test', target: 'https://www.instagram.com/test_account/', accountUsername: 'test_account',
    baselineSnapshot: { date: new Date().toISOString(), followers: 100, following: 25, posts: 10, source: 'manual' }
  });
  const first = await recordContentPerformance({
    accountUsername: 'test_account', campaignId: campaign.id, label: 'Tutorial reels', url: 'https://www.instagram.com/reel/ABC123/?igsh=tracking',
    format: 'reel', theme: 'tutorial coding', metrics
  });
  assert.match(first.id, /^CNT/);
  assert.equal(first.url, 'https://www.instagram.com/reel/ABC123/');
  const updated = await recordContentPerformance({
    accountUsername: 'test_account', campaignId: campaign.id, label: 'Tutorial reels', url: 'https://instagram.com/reel/ABC123/',
    format: 'reel', theme: 'tutorial coding', metrics: { ...metrics, follows: 25 }
  });
  assert.equal(updated.id, first.id);
  assert.equal(updated.snapshots.length, 2);
  assert.equal(updated.metrics.follows, 25);
  assert.equal((await getContentPost(first.id)).campaignId, campaign.id);
  assert.equal((await getContentPosts({ campaignId: campaign.id })).length, 1);
});

test('content store rejects external URLs, invalid metrics and unknown campaign IDs', async () => {
  const base = { accountUsername: 'test_account', label: 'Test content', url: 'https://www.instagram.com/p/ABCD/', format: 'post', theme: 'test', metrics };
  await assert.rejects(() => recordContentPerformance({ ...base, url: 'https://example.com/p/ABCD/' }), /URL harus berupa tautan konten Instagram/);
  await assert.rejects(() => recordContentPerformance({ ...base, metrics: { ...metrics, reach: -1 } }), /reach harus integer/);
  await assert.rejects(() => recordContentPerformance({ ...base, campaignId: 'CMPNOTFOUND123' }), /Campaign .* tidak ditemukan/);
  await recordContentPerformance({ ...base, label: 'Session-bound post' });
  await assert.rejects(() => recordContentPerformance({ ...base, accountUsername: 'other_account', label: 'Session-bound post' }), /session Instagram lain/);
});

test('content store can filter existing records by their stored account identity', async () => {
  await recordContentPerformance({ accountUsername: 'other_account', label: 'Other account post', url: 'https://www.instagram.com/p/OTHER1/', format: 'post', theme: 'other', metrics });
  assert.equal((await getContentPosts({ accountUsername: 'test_account' })).length, 3);
  assert.equal((await getContentPosts({ accountUsername: 'other_account' })).length, 1);
});

test.after(async () => { await rm(dbFile, { force: true }); });
