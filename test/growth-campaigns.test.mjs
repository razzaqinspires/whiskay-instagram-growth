import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { config } from '../src/config.mjs';
import {
  createCampaign, getCampaign, getCampaigns, buildCampaignProgress,
  recordCampaignCheckpoint, recordCampaignInsights, updateCampaignStatus, setCampaignFollowerGoal
} from '../src/growth/store.mjs';

if (!process.env.NODE_TEST_CONTEXT) throw new Error('Jalankan test menggunakan `node --test`; jangan eksekusi file test langsung.');
const dbFile = config.growth.databaseFile;

 test('campaign stores a baseline, read-only checkpoints and manual insights without losing existing fields', async () => {
  const campaign = await createCampaign({
    name: 'Campaign test',
    target: 'https://www.instagram.com/test_account/',
    accountUsername: 'test_account',
    baselineSnapshot: { date: '2026-11-01T00:00:00.000Z', followers: 100, following: 25, posts: 12, source: 'manual' }
  });
  assert.equal(campaign.status, 'ACTIVE');
  assert.equal(campaign.baselineSnapshot.followers, 100);
  assert.deepEqual(campaign.checkpoints, []);

  await recordCampaignCheckpoint(campaign.id, {
    date: '2026-11-02T00:00:00.000Z', followers: 108, following: 26, posts: 13, source: 'instagrapi-session-readonly'
  });
  await recordCampaignInsights(campaign.id, { reach: 900, impressions: 1300, profileVisits: 80, follows: 12 });
  await recordCampaignInsights(campaign.id, { reach: 1000, impressions: 1450, profileVisits: 90, follows: 15 });
  const deadline = new Date(Date.now() + (30 * 86_400_000)).toISOString().slice(0, 10);
  await setCampaignFollowerGoal(campaign.id, 150, deadline);

  const saved = await getCampaign(campaign.id);
  const progress = buildCampaignProgress(saved);
  assert.equal(progress.followerDelta, 8);
  assert.equal(progress.growthPercent, 8);
  assert.equal(progress.checkpoints, 1);
  assert.equal(progress.insights.reach, 1000);
  assert.equal(progress.insightsHistoryCount, 2);
  assert.equal(progress.funnel.profileVisitToFollowRatePct, (15 / 90) * 100);
  assert.equal(progress.followerGoal.targetFollowers, 150);
  assert.equal(progress.followerGoal.currentFollowers, 108);
  assert.equal(progress.followerGoal.status, 'IN_PROGRESS');
  assert.ok(progress.followerGoal.requiredNetFollowersPerDay > 0);
  assert.equal(progress.insights.source, 'manual-instagram-insights');
  assert.equal((await getCampaigns()).length, 1);

  await updateCampaignStatus(campaign.id, 'PAUSED');
  assert.equal((await getCampaign(campaign.id)).status, 'PAUSED');
  await recordCampaignCheckpoint(campaign.id, { date: new Date().toISOString(), followers: 150, following: 27, posts: 14, source: 'manual' });
  assert.equal(buildCampaignProgress(await getCampaign(campaign.id)).followerGoal.status, 'ACHIEVED');
});

test('campaign checkpoints and insights validate input and reject terminal campaigns', async () => {
  const campaign = await createCampaign({ name: 'Validation test', target: 'https://www.instagram.com/test_account/', accountUsername: 'test_account', baselineSnapshot: { date: new Date().toISOString(), followers: 80, following: 20, posts: 10, source: 'manual' } });
  await assert.rejects(() => recordCampaignCheckpoint(campaign.id, { followers: -1, following: 0, posts: 0 }), /followers/);
  await assert.rejects(() => recordCampaignInsights(campaign.id, { reach: -1, impressions: 0, profileVisits: 0, follows: 0 }), /reach/);
  await assert.rejects(() => setCampaignFollowerGoal(campaign.id, 100, '2026-02-30'), /Tanggal deadline/);
  await assert.rejects(() => setCampaignFollowerGoal(campaign.id, 70, new Date(Date.now() + 86400000).toISOString().slice(0, 10)), /lebih tinggi/);
  await updateCampaignStatus(campaign.id, 'COMPLETED');
  await assert.rejects(() => recordCampaignInsights(campaign.id, { reach: 0, impressions: 0, profileVisits: 0, follows: 0 }), /terminal/);
});


test('follower goal becomes overdue after deadline and first checkpoint can become baseline', async () => {
  const campaign = await createCampaign({ name: 'First checkpoint baseline', target: 'https://www.instagram.com/test_account/', accountUsername: 'test_account' });
  await recordCampaignCheckpoint(campaign.id, { date: new Date().toISOString(), followers: 300, following: 45, posts: 30, source: 'manual' });
  const deadline = new Date(Date.now() + (2 * 86_400_000)).toISOString().slice(0, 10);
  await setCampaignFollowerGoal(campaign.id, 350, deadline);
  const overdueTime = new Date(`${deadline}T23:59:59.999Z`);
  overdueTime.setTime(overdueTime.getTime() + 1);
  const progress = buildCampaignProgress(await getCampaign(campaign.id), overdueTime);
  assert.equal(progress.baseline.followers, 300);
  assert.equal(progress.followerGoal.status, 'OVERDUE');
  assert.equal(progress.followerGoal.requiredNetFollowersPerDay, null);
});

test.after(async () => { await rm(dbFile, { force: true }); });


test('campaign creation is organic-only and bound to exactly one session identity', async () => {
  await assert.rejects(() => createCampaign({ name: 'Missing identity', target: 'https://www.instagram.com/test_account/' }), /single session/);
  await assert.rejects(() => createCampaign({ name: 'Mismatched identity', target: 'https://www.instagram.com/other_account/', accountUsername: 'test_account' }), /tidak cocok/);
  const campaign = await createCampaign({ name: 'No budget field', target: 'https://www.instagram.com/test_account/', accountUsername: 'test_account' });
  assert.equal(campaign.accountUsername, 'test_account');
  assert.equal(Object.hasOwn(campaign, 'budget'), false);
});
