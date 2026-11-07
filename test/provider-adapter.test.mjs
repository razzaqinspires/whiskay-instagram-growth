import test from 'node:test';
import assert from 'node:assert/strict';
import { PromotionProviderAdapter } from '../src/growth/provider-adapter.mjs';

const settings = { provider: 'TEST_PROVIDER', providerEnabled: true, providerApiUrl: 'https://provider.example/api/v2', providerApiKey: 'test-secret', providerServiceMap: { 'creator-collab': '77' } };

test('SMM API v2 adapter submits only approved legitimate campaign category', async () => {
  let sent;
  let calls = 0;
  const adapter = new PromotionProviderAdapter({ settings, fetchImpl: async (url, options) => {
    sent = { url, options, body: new URLSearchParams(options.body) };
    calls++;
    const action = sent.body.get('action');
    const data = action === 'services' ? [{ service: 77, name: 'Creator collaboration campaign', min: 1, max: 10, rate: '100' }] : action === 'balance' ? { balance: '5000', currency: 'USD' } : { order: 12345 };
    return { ok: true, json: async () => data };
  } });
  const result = await adapter.submitPromotionOrder({ id: 'IGTEST123', service: 'creator-collab', target: 'https://www.instagram.com/example/', budget: 100000 });
  assert.equal(result.accepted, true);
  assert.equal(result.providerOrderId, '12345');
  assert.equal(sent.body.get('action'), 'add');
  assert.equal(calls, 3);
  assert.equal(sent.body.get('service'), '77');
  assert.equal(sent.body.get('link'), 'https://www.instagram.com/example/');
  assert.equal(sent.body.get('quantity'), '1');
  assert.equal(sent.body.get('key'), 'test-secret');
});

test('SMM API adapter blocks artificial engagement categories before network call', async () => {
  let called = false;
  const adapter = new PromotionProviderAdapter({ settings, fetchImpl: async () => { called = true; throw new Error('must not call'); } });
  const result = await adapter.submitPromotionOrder({ id: 'IGTEST124', service: 'fake-followers', target: 'https://www.instagram.com/example/' });
  assert.equal(result.accepted, false);
  assert.equal(result.status, 'REJECTED_POLICY');
  assert.equal(called, false);
});

test('SMM API adapter refuses redirects and HTTP errors', async () => {
  const adapter = new PromotionProviderAdapter({ settings, fetchImpl: async () => ({ ok: false, status: 302 }) });
  await assert.rejects(() => adapter.listServices(), /Provider HTTP 302/);
});

test('services action accepts the SMM API v2 array response', async () => {
  const adapter = new PromotionProviderAdapter({ settings, fetchImpl: async () => ({ ok: true, json: async () => [{ service: 77, name: 'Creator campaign' }] }) });
  const rows = await adapter.listServices();
  assert.equal(Array.isArray(rows), true);
  assert.equal(rows[0].service, 77);
});


test('provider preflight rejects a mapped service whose provider catalog describes fake followers', async () => {
  let addCalled = false;
  const adapter = new PromotionProviderAdapter({ settings, fetchImpl: async (url, options) => {
    const action = new URLSearchParams(options.body).get('action');
    const data = action === 'services' ? [{ service: 77, name: 'Instagram Followers' }] : action === 'balance' ? { balance: '100' } : (addCalled = true, { order: 7 });
    return { ok: true, json: async () => data };
  } });
  await assert.rejects(() => adapter.submitPromotionOrder({ id: 'IGTEST125', service: 'creator-collab', target: 'https://www.instagram.com/example/' }), /metadata layanan provider tidak lolos filter/i);
  assert.equal(addCalled, false);
});


test('provider preflight scans description and category, not just service name', async () => {
  let addCalled = false;
  const adapter = new PromotionProviderAdapter({ settings, fetchImpl: async (url, options) => {
    const action = new URLSearchParams(options.body).get('action');
    const data = action === 'services'
      ? [{ service: 77, name: 'Creator collaboration', category: 'Instagram followers', description: 'Guaranteed 500 followers' }]
      : action === 'balance' ? { balance: '100' } : (addCalled = true, { order: 8 });
    return { ok: true, json: async () => data };
  } });
  await assert.rejects(() => adapter.submitPromotionOrder({ id: 'IGTEST126', service: 'creator-collab', target: 'https://www.instagram.com/example/' }), /metadata layanan provider/i);
  assert.equal(addCalled, false);
});

test('provider rejection messages are sanitized before reaching callers', async () => {
  const adapter = new PromotionProviderAdapter({
    settings,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ error: 'invalid api_key=provider-secret Authorization: Bearer bearer-secret' }),
    }),
  });
  await assert.rejects(
    () => adapter.listServices(),
    error => {
      assert.equal(error.message.includes('provider-secret'), false);
      assert.equal(error.message.includes('bearer-secret'), false);
      assert.match(error.message, /REDACTED/);
      return true;
    },
  );
});

test('provider transport exceptions are sanitized before reaching callers', async () => {
  const adapter = new PromotionProviderAdapter({
    settings,
    fetchImpl: async () => {
      throw new Error('socket failed Authorization: Bearer transport-secret token=query-secret');
    },
  });
  await assert.rejects(
    () => adapter.listServices(),
    error => {
      assert.equal(error.message.includes('transport-secret'), false);
      assert.equal(error.message.includes('query-secret'), false);
      assert.match(error.message, /REDACTED/);
      return true;
    },
  );
});
