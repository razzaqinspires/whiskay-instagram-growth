import test from 'node:test';
import assert from 'node:assert/strict';
import { submitReferralConversionBatch } from '../src/referral/referral-conversion-batch.mjs';

const endpoint = 'https://referrals.example.test/v1/referrals/claims';
const allowedHosts = 'referrals.example.test';
const serviceToken = 'qa-service-token-123456789';
const claims = [
  { eventId: 'signup_evt_00000001', claimToken: 'opaque-claim-token-alpha-123456' },
  { eventId: 'signup_evt_00000002', claimToken: 'opaque-claim-token-beta-123456' },
];

function response(status, body = {}, retryAfter = null) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name === 'retry-after' ? retryAfter : null },
    text: async () => JSON.stringify(body),
  };
}

function options(overrides = {}) {
  return {
    endpoint,
    allowedHosts,
    serviceToken,
    delayMs: 1_000,
    maxAttempts: 1,
    sleepImpl: async () => {},
    fetchImpl: async () => response(202, { accepted: true }),
    ...overrides,
  };
}

test('active referral batch submits verified claims sequentially and keeps results token-free', async () => {
  const calls = [];
  const delays = [];
  const report = await submitReferralConversionBatch(claims, options({
    fetchImpl: async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return response(202, { accepted: true, echoedClaimToken: claims[0].claimToken });
    },
    sleepImpl: async (ms) => delays.push(ms),
  }));

  assert.equal(report.submitted, 2);
  assert.equal(report.succeeded, 2);
  assert.equal(report.failed, 0);
  assert.deepEqual(calls.map(call => call.init.headers['idempotency-key']), claims.map(claim => claim.eventId));
  assert.deepEqual(calls.map(call => call.body), claims.map(({ claimToken }) => ({ claimToken })));
  assert.deepEqual(delays, [1_000]);
  assert.equal(JSON.stringify(report).includes('opaque-claim-token'), false);
  assert.equal('response' in report.results[0], false);
});

test('already-claimed responses are treated as an idempotent terminal result', async () => {
  const report = await submitReferralConversionBatch(claims.slice(0, 1), options({
    fetchImpl: async () => response(409, { code: 'ALREADY_CLAIMED' }),
  }));

  assert.equal(report.alreadyClaimed, 1);
  assert.equal(report.failed, 0);
  assert.equal(report.results[0].status, 'already_claimed');
});

test('429 responses retry with bounded Retry-After delay and preserve the idempotency key', async () => {
  const delays = [];
  const keys = [];
  let attempts = 0;
  const report = await submitReferralConversionBatch(claims.slice(0, 1), options({
    maxAttempts: 2,
    fetchImpl: async (_url, init) => {
      attempts += 1;
      keys.push(init.headers['idempotency-key']);
      return attempts === 1
        ? response(429, { code: 'RATE_LIMITED' }, '3')
        : response(202, { accepted: true });
    },
    sleepImpl: async (ms) => delays.push(ms),
  }));

  assert.equal(report.succeeded, 1);
  assert.equal(report.results[0].attempts, 2);
  assert.deepEqual(delays, [3_000]);
  assert.deepEqual(keys, [claims[0].eventId, claims[0].eventId]);
});

test('the complete batch is validated before the first network call', async () => {
  let calls = 0;
  await assert.rejects(() => submitReferralConversionBatch([
    claims[0], claims[0],
  ], options({ fetchImpl: async () => { calls += 1; return response(202); } })), /Duplicate eventId/);
  assert.equal(calls, 0);
});

test('an already-aborted signal stops before dispatching a claim', async () => {
  const controller = new AbortController();
  controller.abort(new Error('QA cancellation'));
  let calls = 0;
  const report = await submitReferralConversionBatch(claims, options({
    signal: controller.signal,
    fetchImpl: async () => { calls += 1; return response(202); },
  }));

  assert.equal(report.aborted, true);
  assert.equal(report.submitted, 0);
  assert.equal(calls, 0);
});

test('network errors and backend rejection bodies never echo opaque tokens', async () => {
  const secret = claims[0].claimToken;
  const networkReport = await submitReferralConversionBatch(claims.slice(0, 1), options({
    fetchImpl: async () => { throw new Error(`network failure containing ${secret}`); },
  }));
  const rejectedReport = await submitReferralConversionBatch(claims.slice(0, 1), options({
    fetchImpl: async () => response(422, { message: `invalid claim ${secret}` }),
  }));

  assert.equal(networkReport.results[0].error, 'network_error');
  assert.equal(rejectedReport.results[0].error, 'referral_claim_rejected');
  assert.equal(JSON.stringify(networkReport).includes(secret), false);
  assert.equal(JSON.stringify(rejectedReport).includes(secret), false);
});

test('progress callback failures do not interrupt a verified claim batch', async () => {
  const report = await submitReferralConversionBatch(claims.slice(0, 1), options({
    onProgress() { throw new Error('progress sink unavailable'); },
  }));
  assert.equal(report.succeeded, 1);
});
