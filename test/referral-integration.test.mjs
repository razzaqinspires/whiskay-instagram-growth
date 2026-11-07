import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { ReferralQueueProcessor } from '../src/referral/queue-processor.mjs';
import { handleVerifiedReferralWebhook } from '../src/referral/trigger.mjs';
import { submitReferralConversionBatch } from '../src/referral/referral-conversion-batch.mjs';
import { startReferralWebhookServer } from '../src/referral/webhook-server.mjs';

const secret = 'test-webhook-secret-that-is-longer-than-32-chars';
function signed(body, timestamp = Math.floor(Date.now() / 1000)) {
  const rawBody = JSON.stringify(body);
  const signature = `sha256=${createHmac('sha256', secret).update(String(timestamp)).update('.').update(rawBody).digest('hex')}`;
  return { rawBody, signature, timestamp };
}
async function fixture(submitBatch) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-referral-test-'));
  const queue = new ReferralQueueProcessor({
    filePath: path.join(dir, 'pending.json'),
    env: {
      REFERRAL_CLAIM_ENDPOINT: 'https://api-staging.example.test/v1/referrals/claims',
      REFERRAL_CLAIM_ALLOWED_HOSTS: 'api-staging.example.test',
      REFERRAL_SERVICE_TOKEN: 'staging-service-token-123456',
    },
    logger: { info() {} },
    submitBatch,
  });
  return { dir, queue };
}

test('accepts only backend-signed verified signup webhook', async () => {
  const { dir, queue } = await fixture(async () => ({ results: [], submitted: 0, succeeded: 0, alreadyClaimed: 0, failed: 0, aborted: false }));
  try {
    const payload = { type: 'referral.signup.verified', data: { eventId: 'signup_evt_0001', claimToken: 'backend-issued-token-abcdefghijkl', verifiedAt: new Date().toISOString() } };
    const req = signed(payload);
    const result = await handleVerifiedReferralWebhook({ ...req, queue, secret });
    assert.equal(result.queued, true);
    assert.equal((await queue.status()).pending, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('rejects wrong signature and unverified event type', async () => {
  const { dir, queue } = await fixture(async () => ({}));
  try {
    const payload = { type: 'referral.signup.pending', data: { eventId: 'signup_evt_0002', claimToken: 'backend-issued-token-abcdefghijkl', verifiedAt: new Date().toISOString() } };
    const req = signed(payload);
    await assert.rejects(() => handleVerifiedReferralWebhook({ ...req, signature: `sha256=${'0'.repeat(64)}`, queue, secret }), /signature verification failed/i);
    await assert.rejects(() => handleVerifiedReferralWebhook({ ...req, queue, secret }), /only referral\.signup\.verified/i);
    assert.equal((await queue.status()).pending, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('rejects expired webhook timestamp and replayed event IDs', async () => {
  const { dir, queue } = await fixture(async () => ({}));
  try {
    const payload = { type: 'referral.signup.verified', data: { eventId: 'signup_evt_0003', claimToken: 'backend-issued-token-abcdefghijkl', verifiedAt: new Date().toISOString() } };
    const old = signed(payload, Math.floor(Date.now() / 1000) - 600);
    await assert.rejects(() => handleVerifiedReferralWebhook({ ...old, queue, secret }), /replay window/i);
    const req = signed(payload);
    assert.equal((await handleVerifiedReferralWebhook({ ...req, queue, secret })).queued, true);
    assert.equal((await handleVerifiedReferralWebhook({ ...req, queue, secret })).duplicate, true);
    assert.equal((await queue.status()).pending, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('processes only the claim token from verified webhook and persists completion', async () => {
  const received = [];
  const { dir, queue } = await fixture(async (claims, options) => {
    received.push({ claims, options });
    return {
      submitted: 1, succeeded: 1, alreadyClaimed: 0, failed: 0, aborted: false,
      results: [{ eventId: claims[0].eventId, status: 'succeeded' }],
    };
  });
  try {
    const payload = { type: 'referral.signup.verified', data: { eventId: 'signup_evt_0004', claimToken: 'backend-issued-token-abcdefghijkl', verifiedAt: new Date().toISOString() } };
    await handleVerifiedReferralWebhook({ ...signed(payload), queue, secret });
    const report = await queue.processPending({ limit: 1 });
    assert.equal(received.length, 1);
    assert.equal(received[0].claims[0].claimToken, payload.data.claimToken);
    assert.equal(received[0].options.maxAttempts, 1);
    assert.equal(report.pending, 0);
    assert.equal((await queue.status()).completed, 1);
    const saved = JSON.parse(await readFile(path.join(dir, 'pending.json'), 'utf8'));
    assert.equal(saved.claims.length, 0);
    assert.ok(saved.completedEventIds.includes('signup_evt_0004'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('rejects endpoint not pinned to referral claims route and caps process size', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-referral-test-'));
  try {
    const queue = new ReferralQueueProcessor({
      filePath: path.join(dir, 'pending.json'),
      env: { REFERRAL_CLAIM_ENDPOINT: 'https://example.test/unrestricted', REFERRAL_CLAIM_ALLOWED_HOSTS: 'example.test', REFERRAL_SERVICE_TOKEN: 'service-token-123456789' },
      logger: { info() {} },
      submitBatch: async () => { throw new Error('should not be invoked'); },
    });
    await assert.rejects(() => queue.processPending({ limit: 26 }), /between 1 and 25/i);
    await queue.enqueueVerifiedClaim({ eventId: 'signup_evt_0005', claimToken: 'backend-issued-token-abcdefghijkl', verifiedAt: new Date().toISOString() });
    await assert.rejects(() => queue.processPending({ limit: 1 }), /endpoint path must be/i);
  } finally { await rm(dir, { recursive: true, force: true }); }
});


test('POSTs one backend-issued claim only to the allowlisted dedicated endpoint', async () => {
  let call;
  const report = await submitReferralConversionBatch([
    { eventId: 'signup_evt_0006', claimToken: 'opaque-backend-claim-token-123456' },
  ], {
    endpoint: 'https://api-staging.example.test/v1/referrals/claims',
    allowedHosts: 'api-staging.example.test',
    serviceToken: 'staging-service-token-123456',
    maxAttempts: 1,
    fetchImpl: async (url, options) => {
      call = { url, options };
      return { ok: true, status: 202, headers: { get: () => null }, text: async () => '{"accepted":true}' };
    },
  });
  assert.equal(report.succeeded, 1);
  assert.equal(call.url, 'https://api-staging.example.test/v1/referrals/claims');
  assert.equal(call.options.method, 'POST');
  assert.equal(call.options.redirect, 'error');
  assert.equal(call.options.headers.authorization, 'Bearer staging-service-token-123456');
  assert.equal(call.options.headers['idempotency-key'], 'signup_evt_0006');
  assert.deepEqual(JSON.parse(call.options.body), { claimToken: 'opaque-backend-claim-token-123456' });
});

 test('rejects non-allowlisted endpoint host before sending any request', async () => {
  let called = false;
  await assert.rejects(() => submitReferralConversionBatch([
    { eventId: 'signup_evt_0007', claimToken: 'opaque-backend-claim-token-123456' },
  ], {
    endpoint: 'https://elsewhere.example.test/v1/referrals/claims',
    allowedHosts: 'api-staging.example.test',
    serviceToken: 'staging-service-token-123456',
    fetchImpl: async () => { called = true; return { ok: true, status: 200, headers: { get: () => null }, text: async () => '' }; },
  }), /not in REFERRAL_CLAIM_ALLOWED_HOSTS/i);
  assert.equal(called, false);
});


test('HTTP webhook listener accepts signed verified events on the configured route', async () => {
  const { dir, queue } = await fixture(async () => ({ results: [], submitted: 0, succeeded: 0, alreadyClaimed: 0, failed: 0, aborted: false }));
  const configuredPath = '/internal/hooks/referral/verified';
  const server = await startReferralWebhookServer({ host: '127.0.0.1', port: 0, path: configuredPath, secret, queue, logger: { info() {}, warn() {} } });
  try {
    const payload = { type: 'referral.signup.verified', data: { eventId: 'signup_evt_0008', claimToken: 'backend-issued-token-abcdefghijkl', verifiedAt: new Date().toISOString() } };
    const req = signed(payload);
    const url = `http://127.0.0.1:${server.port}${configuredPath}`;
    const send = () => fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-whiskay-signature': req.signature, 'x-whiskay-timestamp': String(req.timestamp) },
      body: req.rawBody,
    });
    const wrongRoute = await fetch(`http://127.0.0.1:${server.port}/webhooks/referral/verified`, { method: 'POST' });
    assert.equal(wrongRoute.status, 404);
    const first = await send();
    assert.equal(first.status, 202);
    assert.equal((await first.json()).queued, true);
    const second = await send();
    assert.equal(second.status, 200);
    assert.equal((await second.json()).duplicate, true);
    assert.equal((await queue.status()).pending, 1);
  } finally {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }
});


test('auto-process option triggers one queued verified claim asynchronously', async () => {
  let processCalls = 0;
  const queue = {
    async enqueueVerifiedClaim() { return { queued: true, duplicate: false, pending: 1 }; },
    async processPending({ limit }) { processCalls += 1; assert.equal(limit, 1); return {}; },
  };
  const payload = { type: 'referral.signup.verified', data: { eventId: 'signup_evt_0009', claimToken: 'backend-issued-token-abcdefghijkl', verifiedAt: new Date().toISOString() } };
  const req = signed(payload);
  await handleVerifiedReferralWebhook({ ...req, queue, secret, autoProcess: true, logger: { error() {} } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(processCalls, 1);
});
