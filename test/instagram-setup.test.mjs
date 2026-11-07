import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveInstagramSetupStatus } from '../src/instagram.mjs';

if (!process.env.NODE_TEST_CONTEXT) throw new Error('Jalankan test menggunakan `node --test`; jangan eksekusi file test langsung.');

const base = {
  usernameConfigured: true,
  pythonAvailable: true,
  instagrapiAvailable: true,
  sessionExists: true,
  regularFile: true,
  sessionPrivate: true
};

test('Instagram setup status fails closed for missing configuration and runtimes', () => {
  assert.equal(deriveInstagramSetupStatus({ ...base, usernameConfigured: false }), 'USERNAME_MISSING');
  assert.equal(deriveInstagramSetupStatus({ ...base, pythonAvailable: false }), 'PYTHON_UNAVAILABLE');
  assert.equal(deriveInstagramSetupStatus({ ...base, instagrapiAvailable: false }), 'INSTAGRAPI_UNAVAILABLE');
});

test('Instagram setup status distinguishes missing and unsafe session files', () => {
  assert.equal(deriveInstagramSetupStatus({ ...base, sessionExists: false }), 'SESSION_MISSING');
  assert.equal(deriveInstagramSetupStatus({ ...base, regularFile: false }), 'SESSION_FILE_UNSAFE');
  assert.equal(deriveInstagramSetupStatus({ ...base, sessionPrivate: false }), 'SESSION_PERMISSION_UNSAFE');
  assert.equal(deriveInstagramSetupStatus(base), 'SESSION_PRESENT_UNVERIFIED');
});
