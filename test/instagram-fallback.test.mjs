import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInstagramFallbackEngine, BLOCKED_PROVIDERS } from '../src/library/adapters/instagram-fallback.mjs';

test('provider engine falls through from a failing provider to the next enabled provider', async () => {
  const calls = [];
  const engine = createInstagramFallbackEngine({
    providers: [
      { id: 'primary', enabled: true, async extract() { calls.push('primary'); throw new Error('temporary upstream failure'); } },
      { id: 'secondary', enabled: true, async extract() { calls.push('secondary'); return { result: { media: [{ type: 'video' }] }, media: [{ buffer: Buffer.from('ok') }] }; } }
    ]
  });
  const result = await engine.extract('https://www.instagram.com/reel/ABC123');
  assert.equal(result.provider, 'secondary');
  assert.deepEqual(calls, ['primary', 'secondary']);
  assert.equal(result.attempts[0].outcome, 'failed');
  assert.equal(result.attempts[1].outcome, 'success');
});

test('provider engine records failures and reports all-provider failure without leaking secrets', async () => {
  const engine = createInstagramFallbackEngine({
    providers: [{ id: 'broken', enabled: true, async extract() { throw new Error('api_key=secret-value'); } }]
  });
  await assert.rejects(() => engine.extract('https://www.instagram.com/p/ABC123'), error => {
    assert.equal(error.code, 'ALL_PROVIDERS_FAILED');
    assert.equal(JSON.stringify(error.attempts).includes('secret-value'), false);
    return true;
  });
  assert.equal(engine.getStatus().active[0].failures, 1);
});

test('contributed Snapgram and iGram source entries remain quarantined, not executable', () => {
  assert.deepEqual(BLOCKED_PROVIDERS.map(item => item.id), ['snapgram-contributed', 'igram-contributed']);
  assert.ok(BLOCKED_PROVIDERS.every(item => item.state === 'quarantined'));
});

test('contributed CJS source files match immutable manifest SHA-256 fingerprints', async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const manifest = JSON.parse(await readFile(path.join(root, 'library/CONTRIBUTION-MANIFEST.json'), 'utf8'));
  for (const id of ['snapgram-io-instagram-scraper', 'igram-world-instagram-scraper']) {
    const entry = manifest.entries.find(item => item.id === id);
    assert.ok(entry, `missing manifest entry ${id}`);
    const bytes = await readFile(path.join(root, entry.path));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
  }
});
