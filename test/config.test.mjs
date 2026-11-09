import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { validateConfig, config as runtimeConfig, PROJECT_ROOT } from '../src/config.mjs';

const base = {
  app: { logLevel: 'info' },
  whatsapp: { pairingNumber: '6281234567890', ownerNumber: '6281234567890', sessionDir: './session/self', syncFullHistory: false },
  commands: { prefixes: ['!', '.'], mode: 'self', allowGroups: false, runtimeModeFile: './data/runtime-mode.json', maxMessageChars: 3000, maxCommandArgs: 24 },
  plugins: { directory: './src/plugins', hotReload: true },
  antiSpam: { enabled: true, windowMs: 10000, maxHits: 5, cooldownMs: 1500, commandsPerMinute: 20, duplicateTtlMs: 60000, warningCooldownMs: 30000, maxConcurrent: 2 },
  instagram: { username: 'razzaqventures', sessionFile: './auth_ig/session.json', statsFile: './data/instagram-stats.json', currency: 'IDR' },
  growth: { databaseFile: './data/instagram-growth.json', provider: 'MANUAL_REVIEW', requireProviderApproval: true, allowUnverifiedProviders: false },
  identity: { lidMapFile: './data/lid-map.json' }
};

test('validates separated JSON settings and returns normalized runtime config', () => {
  const config = validateConfig(base, {});
  assert.deepEqual(config.commands.prefixes, ['!', '.']);
  assert.equal(config.commands.allowGroups, false);
  assert.equal(config.commands.mode, 'self');
  assert.match(config.commands.runtimeModeFile, /runtime-mode\.json$/);
  assert.equal(config.antiSpam.enabled, true);
  assert.equal(config.instagram.username, 'razzaqventures');
  assert.equal(config.instagram.pythonBin.endsWith('.venv-instagram/bin/python'), true);
  assert.equal(config.whatsapp.pairingNumber, '6281234567890');
});

test('rejects mismatched owner and pairing account', () => {
  assert.throws(() => validateConfig({ ...base, whatsapp: { ...base.whatsapp, ownerNumber: '6281111111111' } }, {}), /harus sama untuk self-bot/);
});

test('rejects invalid runtime access modes', () => {
  assert.throws(() => validateConfig({ ...base, commands: { ...base.commands, mode: 'everyone' } }, {}), /commands.mode harus self atau public/);
});

test('rejects malformed prefixes and numeric anti-spam settings', () => {
  assert.throws(() => validateConfig({ ...base, commands: { ...base.commands, prefixes: ['abc'] }, antiSpam: { ...base.antiSpam, maxHits: 0 } }, {}), /Konfigurasi tidak valid/);
});

test('rejects overlapping WhatsApp and Instagram session paths', () => {
  assert.throws(() => validateConfig({ ...base, whatsapp: { ...base.whatsapp, sessionDir: './auth_ig' } }, {}), /Path session WhatsApp dan Instagram tidak boleh bertumpang tindih/);
});

test('rejects obsolete Instagram authMode to prevent stale configuration conflicts', () => {
  assert.throws(() => validateConfig({ ...base, instagram: { ...base.instagram, authMode: 'password' } }, {}), /instagram.authMode sudah tidak digunakan/);
});

test('Instagram password remains outside application config and Python adapter is configurable', () => {
  const result = validateConfig({ ...base, instagram: { ...base.instagram, pythonBin: './.venv-instagram/bin/python' } }, { IG_PASSWORD: 'secret-value' });
  assert.equal(result.instagram.pythonBin.endsWith('.venv-instagram/bin/python'), true);
  assert.equal(Object.hasOwn(result.instagram, 'password'), false);
});

test('ownerCode runtime defaults are bounded and temporary files stay under private data', () => {
  const result = validateConfig(base, {});
  assert.equal(result.ownerCode.enabled, true);
  assert.equal(result.ownerCode.timeoutMs, 15000);
  assert.equal(result.ownerCode.maxCodeChars, 8000);
  assert.equal(result.ownerCode.maxOutputBytes, 16000);
  assert.match(result.ownerCode.workDir, /data[\\/]owner-runtime$/);
  assert.equal(result.ownerCode.goBin, 'go');
  assert.throws(() => validateConfig({ ...base, ownerCode: { workDir: './src' } }, {}), /ownerCode.workDir harus berada di dalam direktori data/);
  assert.throws(() => validateConfig({ ...base, ownerCode: { timeoutMs: 90000 } }, {}), /ownerCode.timeoutMs harus bilangan bulat/);
});

test('ordinary config rejects string booleans and growth config contains no financial/provider settings', () => {
  assert.throws(() => validateConfig({ ...base, whatsapp: { ...base.whatsapp, syncFullHistory: 'false' } }, {}), /harus boolean/);
  const result = validateConfig({ ...base, growth: { ...base.growth, providerEnabled: true, requireWallet: true, providerApiUrl: 'https://unused.invalid' } }, {});
  assert.deepEqual(Object.keys(result.growth), ['databaseFile']);
  assert.equal(Object.hasOwn(result.instagram, 'currency'), false);
});

test('legacy financial/provider fields are ignored and no payment config is exposed', () => {
  const legacy = validateConfig({
    ...base,
    instagram: { ...base.instagram, currency: 'IDR' },
    growth: { ...base.growth, balance: 100, providerEnabled: true, requireWallet: true, providerApiUrl: 'https://unused.invalid' }
  }, { META_ACCESS_TOKEN: 'ignored-token', PROMOTION_PROVIDER_API_KEY: 'legacy-token' });
  assert.deepEqual(Object.keys(legacy.growth), ['databaseFile']);
  assert.equal(Object.hasOwn(legacy.instagram, 'currency'), false);
  assert.equal(Object.hasOwn(legacy, 'secrets'), false);
});



test('Node test runner redirects all private state paths to isolated temporary storage', () => {
  assert.ok(process.env.NODE_TEST_CONTEXT, 'test runner context must be active');
  for (const value of [runtimeConfig.whatsapp.sessionDir, runtimeConfig.instagram.sessionFile, runtimeConfig.instagram.statsFile, runtimeConfig.instagram.guardFile, runtimeConfig.growth.databaseFile, runtimeConfig.commands.runtimeModeFile]) {
    assert.equal(value.startsWith(PROJECT_ROOT + path.sep), false, `test path must not point into project: ${value}`);
  }
});
