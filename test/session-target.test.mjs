import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSessionCampaignTarget } from '../src/growth/session-target.mjs';

test('campaign target is derived from normalized active-session username', () => {
  assert.deepEqual(buildSessionCampaignTarget({ username: '@Ar.ZZQ' }), {
    username: 'ar.zzq',
    target: 'https://www.instagram.com/ar.zzq/',
    identitySource: 'active-instagram-session'
  });
});

test('campaign target rejects missing or malformed session identity', () => {
  for (const profile of [null, {}, { username: '' }, { username: 'https://evil.example' }, { username: 'bad/name' }]) {
    assert.throws(() => buildSessionCampaignTarget(profile), /Identitas akun dari session/);
  }
});
