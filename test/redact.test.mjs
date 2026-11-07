import test from 'node:test';
import assert from 'node:assert/strict';
import { redactObject, sanitizeError } from '../src/security/redact.mjs';

test('redacts secret-shaped object keys recursively', () => {
  const result = redactObject({ username: 'owner', auth: { password: 'secret', token: 'abc' }, session: 'cookie-data' });
  assert.equal(result.auth.password, '[REDACTED]');
  assert.equal(result.auth.token, '[REDACTED]');
  assert.equal(result.session, '[REDACTED]');
  assert.equal(result.username, 'owner');
});

test('sanitizes credential assignments from errors', () => {
  const result = sanitizeError(new Error('login failed password=hunter2 token=abc123'));
  assert.doesNotMatch(result.message, /hunter2|abc123/);
});

test('sanitizes bearer, query-string, URL userinfo and JWT credentials', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signaturepayload1234';
  const result = sanitizeError(new Error(
    `request failed Authorization: Bearer bearer-secret-token token=opaque-secret https://user:pass@provider.example/path?access_token=query-secret ${jwt}`
  ));
  for (const secret of ['bearer-secret-token', 'opaque-secret', 'user:pass', 'query-secret', jwt]) {
    assert.equal(result.message.includes(secret), false, `secret leaked: ${secret}`);
  }
  assert.match(result.message, /REDACTED/);
});

test('sanitizes unsafe error labels and bounds stored error text', () => {
  const result = sanitizeError({ name: 'Bad Name\n', code: 'TOKEN=secret', message: 'x'.repeat(800) });
  assert.equal(result.name, 'Error');
  assert.equal(result.code, 'UNKNOWN');
  assert.ok(result.message.length <= 520);
  assert.match(result.message, /TRUNCATED/);
});
