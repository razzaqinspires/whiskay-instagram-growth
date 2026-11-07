import test from 'node:test';
import assert from 'node:assert/strict';
import { processReferralAttributions } from './referral-attribution-worker.mjs';

const endpoint = 'https://api.example.test/v1/referrals/attribute';
const serviceToken = 'test-service-token-123456';
const sample = [
  { signupEventId: 'signup_00000001', referralToken: 'referral-token-01' },
  { signupEventId: 'signup_00000002', referralToken: 'referral-token-02' },
];

test('posts sequentially and returns aggregate results', async () => {
  const calls = [];
  const delays = [];
  const result = await processReferralAttributions(sample, {
    endpoint, serviceToken,
    fetchImpl: async (_url, init) => {
      calls.push({ body: JSON.parse(init.body), idempotencyKey: init.headers['idempotency-key'] });
      return { ok: true, status: 200 };
    },
    sleepImpl: async (ms) => delays.push(ms),
  });

  assert.equal(result.total, 2);
  assert.equal(result.succeeded, 2);
  assert.equal(result.failed, 0);
  assert.deepEqual(calls.map((call) => call.idempotencyKey), sample.map((item) => item.signupEventId));
  assert.deepEqual(delays, [1000]);
});

test('records API rejection without logging or returning referral tokens', async () => {
  const result = await processReferralAttributions(sample.slice(0, 1), {
    endpoint, serviceToken,
    fetchImpl: async () => ({ ok: false, status: 422 }),
    sleepImpl: async () => {},
  });
  assert.equal(result.failed, 1);
  assert.equal(result.results[0].error, 'api_rejected');
  assert.equal('referralToken' in result.results[0], false);
});

test('rejects account-registration endpoints', async () => {
  await assert.rejects(
    processReferralAttributions(sample, {
      endpoint: 'https://api.example.test/v1/accounts/register', serviceToken,
    }),
    /endpoint registrasi akun tidak didukung/,
  );
});

test('rejects duplicate signup event IDs', async () => {
  await assert.rejects(
    processReferralAttributions([sample[0], sample[0]], { endpoint, serviceToken }),
    /duplikat/,
  );
});

test('rejects batches larger than 1000', async () => {
  const items = Array.from({ length: 1001 }, (_, i) => ({
    signupEventId: `signup_${String(i).padStart(8, '0')}`,
    referralToken: 'referral-token-01',
  }));
  await assert.rejects(
    processReferralAttributions(items, { endpoint, serviceToken }),
    /Maksimal 1000/,
  );
});
