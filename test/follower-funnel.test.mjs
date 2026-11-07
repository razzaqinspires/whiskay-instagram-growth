import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateFollowerFunnel,
  formatFollowerFunnel,
  recommendFollowerFunnelActions
} from '../src/growth/funnel.mjs';

test('follower funnel calculates conversion rates with explicit denominators', () => {
  const funnel = calculateFollowerFunnel({ reach: 1000, impressions: 1500, profileVisits: 100, follows: 20 });
  assert.equal(funnel.reachToProfileVisitRatePct, 10);
  assert.equal(funnel.profileVisitToFollowRatePct, 20);
  assert.equal(funnel.reachToFollowRatePct, 2);
  assert.equal(funnel.impressionsPerReachedAccount, 1.5);
  assert.equal(funnel.followsPerThousandReach, 20);
  assert.deepEqual(formatFollowerFunnel(funnel), {
    reachToProfileVisit: '10.00%',
    profileVisitToFollow: '20.00%',
    reachToFollow: '2.00%',
    impressionsPerReach: '1.50',
    followsPerThousandReach: '20.00'
  });
});

test('follower funnel returns null for zero denominators instead of NaN or Infinity', () => {
  const funnel = calculateFollowerFunnel({ reach: 0, impressions: 0, profileVisits: 0, follows: 0 });
  assert.equal(funnel.reachToProfileVisitRatePct, null);
  assert.equal(funnel.profileVisitToFollowRatePct, null);
  assert.equal(funnel.reachToFollowRatePct, null);
  assert.equal(funnel.impressionsPerReachedAccount, null);
  assert.equal(funnel.followsPerThousandReach, null);
  assert.match(formatFollowerFunnel(funnel).reachToProfileVisit, /denominator 0/);
  assert.match(recommendFollowerFunnelActions(funnel)[0], /Belum ada reach/);
});

test('funnel recommendations diagnose the stage with zero conversion', () => {
  const exposure = recommendFollowerFunnelActions(calculateFollowerFunnel({ reach: 500, impressions: 700, profileVisits: 0, follows: 0 }));
  assert.match(exposure[0], /hook dan ajakan melihat profil/);
  const profile = recommendFollowerFunnelActions(calculateFollowerFunnel({ reach: 500, impressions: 700, profileVisits: 40, follows: 0 }));
  assert.match(profile[0], /bio, konsistensi niche, pinned posts/);
  const converted = recommendFollowerFunnelActions(calculateFollowerFunnel({ reach: 500, impressions: 700, profileVisits: 40, follows: 5 }));
  assert.match(converted[0], /Follows sudah tercatat/);
});

test('follower funnel rejects absent, negative, unsafe and malformed metrics', () => {
  assert.throws(() => calculateFollowerFunnel(null), /object/);
  assert.throws(() => calculateFollowerFunnel({ reach: -1, impressions: 0, profileVisits: 0, follows: 0 }), /reach/);
  assert.throws(() => calculateFollowerFunnel({ reach: Number.MAX_SAFE_INTEGER + 1, impressions: 0, profileVisits: 0, follows: 0 }), /reach/);
  assert.throws(() => calculateFollowerFunnel({ reach: 1, impressions: 1, profileVisits: 0, follows: '1' }), /follows/);
});
