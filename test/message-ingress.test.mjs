import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyMessageUpsert } from '../src/lib/message-ingress.mjs';

const command = (text, overrides = {}) => ({
  key: { remoteJid: '59206778490968@lid', fromMe: true, remoteJidAlt: '6281234567890@s.whatsapp.net', ...overrides },
  message: { conversation: text }
});

test('dispatch classifier accepts live notify commands and retains owner fromMe metadata', () => {
  const msg = command('.menu');
  const batch = classifyMessageUpsert({ type: 'notify', messages: [msg] }, {
    isCommand: item => item.message.conversation.startsWith('.')
  });
  assert.equal(batch.type, 'notify');
  assert.equal(batch.commandLikeCount, 1);
  assert.equal(batch.fromMeCount, 1);
  assert.equal(batch.alternateAddressCount, 1);
  assert.deepEqual(batch.messages, [msg]);
});

test('dispatch classifier discards append/history without parsing old command text', () => {
  const msg = command('.menu');
  let parsed = false;
  const batch = classifyMessageUpsert({ type: 'append', messages: [msg] }, {
    isCommand: () => { parsed = true; return true; }
  });
  assert.equal(parsed, false);
  assert.equal(batch.commandLikeCount, 0);
  assert.deepEqual(batch.messages, []);
});

test('dispatch classifier handles batches and ignores empty or malformed messages', () => {
  const batch = classifyMessageUpsert({ type: 'notify', messages: [
    command('.igprofile'),
    command('hello', { fromMe: false }),
    { key: { remoteJid: '6281234567890@s.whatsapp.net' }, message: null },
    { key: {}, message: { conversation: '.menu' } }
  ] }, { isCommand: item => item.message.conversation.startsWith('.') });
  assert.equal(batch.total, 4);
  assert.equal(batch.withContent, 2);
  assert.equal(batch.commandLikeCount, 1);
  assert.equal(batch.messages.length, 1);
});
