import test from 'node:test';
import assert from 'node:assert/strict';
import { ConcreteHttpAdapter } from '../src/adapters/ConcreteHttpAdapter.js';

const TARGET = 'http://127.0.0.1:43127/__whiskay_qa__/batch';

async function withEnv(values, callback) {
  const previous = new Map();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('ConcreteHttpAdapter performs sequential POSTs to the fixed local QA route', async () => {
  await withEnv({ NODE_ENV: 'development', MAX_BATCH_SIZE: '100' }, async () => {
    const calls = [];
    let inFlight = 0;
    const axiosClient = {
      async post(url, payload, config) {
        inFlight += 1;
        assert.equal(inFlight, 1, 'requests must not overlap');
        calls.push({ url, payload, config });
        await new Promise((resolve) => setTimeout(resolve, 10));
        inFlight -= 1;
        return { status: 202, data: { accepted: payload.id } };
      },
    };

    const adapter = new ConcreteHttpAdapter({ axiosClient });
    const result = await adapter.dispatchBatch(TARGET, [{ id: 'a' }, { id: 'b' }], {
      delayMs: 1_000,
    });

    assert.equal(result.submitted, 2);
    assert.equal(result.succeeded, 2);
    assert.deepEqual(calls.map((call) => call.payload.id), ['a', 'b']);
    assert.ok(calls.every((call) => call.url === TARGET));
    assert.ok(calls.every((call) => call.config.maxRedirects === 0));
    assert.ok(calls.every((call) => call.config.proxy === false));
    assert.ok(calls.every((call) => call.config.timeout <= 15_000));
  });
});

test('development auto-attestation is restricted to the fixed loopback QA endpoint', async () => {
  await withEnv({ NODE_ENV: 'development', MAX_BATCH_SIZE: undefined }, async () => {
    let count = 0;
    const adapter = new ConcreteHttpAdapter({
      axiosClient: { async post() { count += 1; return { status: 200, data: { ok: true } }; } },
    });

    await assert.rejects(
      adapter.dispatchBatch('https://example.invalid/api', [{}]),
      /loopback destinations/,
    );
    await assert.rejects(
      adapter.dispatchBatch('http://127.0.0.1:43127/other', [{}]),
      /exact .* route/,
    );
    assert.equal(count, 0);
  });
});

test('MAX_BATCH_SIZE can increase to 1000 only in development', async () => {
  await withEnv({ NODE_ENV: 'development', MAX_BATCH_SIZE: '1000' }, async () => {
    const adapter = new ConcreteHttpAdapter({ axiosClient: { async post() { throw new Error('must not send'); } } });
    assert.equal(adapter.getMaxBatchSize(), 1_000);
    await assert.rejects(
      adapter.dispatchBatch(TARGET, Array.from({ length: 1_001 }, () => ({}))),
      /at most 1000 items/,
    );
  });

  await withEnv({ NODE_ENV: 'production', MAX_BATCH_SIZE: '1000' }, async () => {
    const adapter = new ConcreteHttpAdapter({ axiosClient: { async post() { throw new Error('must not send'); } } });
    assert.equal(adapter.getMaxBatchSize(), 100);
  });
});

test('production requires explicit trusted owner approval metadata', async () => {
  await withEnv({ NODE_ENV: 'production', MAX_BATCH_SIZE: '1000' }, async () => {
    let count = 0;
    const adapter = new ConcreteHttpAdapter({
      axiosClient: { async post() { count += 1; return { status: 200, data: {} }; } },
    });

    await assert.rejects(adapter.dispatchBatch(TARGET, [{}]), /Explicit owner approval metadata is required/);
    assert.equal(count, 0);
  });
});

test('invalid development batch-size configuration fails closed', async () => {
  await withEnv({ NODE_ENV: 'development', MAX_BATCH_SIZE: '1001' }, async () => {
    const adapter = new ConcreteHttpAdapter({ axiosClient: { async post() { throw new Error('must not send'); } } });
    assert.throws(() => adapter.getMaxBatchSize(), /between 1 and 1000/);
  });
});
