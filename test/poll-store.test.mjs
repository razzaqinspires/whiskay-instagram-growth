import test from 'node:test';
import assert from 'node:assert/strict';
import { getPollCreationMessage, pollCacheStats, rememberPollCreationMessage } from '../src/lib/poll-store.mjs';

test('stores only poll creation messages for Baileys vote decryption', () => {
  const message = { key: { id: 'POLL-1', remoteJid: '123@g.us' }, message: { pollCreationMessage: { name: 'Question', options: [] } } };
  assert.equal(rememberPollCreationMessage(message), true);
  assert.deepEqual(getPollCreationMessage(message.key), message.message);
  assert.equal(rememberPollCreationMessage({ key: { id: 'not-poll' }, message: { conversation: 'text' } }), false);
  assert.equal(pollCacheStats().storedPolls >= 1, true);
});
