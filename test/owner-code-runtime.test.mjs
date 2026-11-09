import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyMessageUpsert } from '../src/lib/message-ingress.mjs';
import { spawnSync } from 'node:child_process';
import {
  parseOwnerCodeRequest,
  executeOwnerCodeRequest,
  formatOwnerCodeResult,
  isOwnerPrivateSelfChat
} from '../src/lib/owner-code-runtime.mjs';

const ownerConfig = {
  enabled: true,
  timeoutMs: 30000,
  maxCodeChars: 8000,
  maxOutputBytes: 4096,
  workDir: './data/owner-runtime-test',
  pythonBin: 'python3',
  goBin: 'go',
  shellBin: '/bin/bash'
};

test('owner runtime parser recognizes every dedicated prefix in safe order', () => {
  assert.deepEqual(parseOwnerCodeRequest('> return 2 + 2'), {
    runtime: 'eval-async', label: 'EVAL ASYNC', prefix: '>', source: 'return 2 + 2'
  });
  assert.equal(parseOwnerCodeRequest('=> 40 + 2').runtime, 'eval-return');
  assert.equal(parseOwnerCodeRequest('$ printf cli-ok').runtime, 'shell');
  assert.equal(parseOwnerCodeRequest('>> print("python-ok")').runtime, 'python');
  assert.equal(parseOwnerCodeRequest('>>> package main\nfunc main() {}').runtime, 'golang');
  assert.equal(parseOwnerCodeRequest('.menu'), null);
  assert.equal(parseOwnerCodeRequest('ordinary text'), null);
  assert.equal(parseOwnerCodeRequest(null), null);
});


test('special owner prefixes pass only the live WhatsApp notify ingress', () => {
  const message = { key: { remoteJid: '6281234567890@s.whatsapp.net', fromMe: true }, message: { conversation: '>>> package main' } };
  const isOwnerRuntime = item => Boolean(parseOwnerCodeRequest(item.message?.conversation));
  const live = classifyMessageUpsert({ type: 'notify', messages: [message] }, { isCommand: isOwnerRuntime });
  const history = classifyMessageUpsert({ type: 'append', messages: [message] }, { isCommand: isOwnerRuntime });
  assert.equal(live.commandLikeCount, 1);
  assert.equal(live.messages.length, 1);
  assert.equal(history.commandLikeCount, 0);
  assert.equal(history.messages.length, 0);
});

test('owner code gate permits only authenticated owner self-chat messages', async () => {
  const ownerNumber = '6281234567890';
  const ownerJid = `${ownerNumber}@s.whatsapp.net`;
  const shared = { ownerNumber, sessionPn: `${ownerNumber}:12@s.whatsapp.net`, sessionLid: '123456789@lid' };
  assert.equal(await isOwnerPrivateSelfChat({ ...shared, key: { fromMe: true, remoteJid: ownerJid } }), true);
  assert.equal(await isOwnerPrivateSelfChat({ ...shared, key: { fromMe: false, remoteJid: ownerJid } }), false);
  assert.equal(await isOwnerPrivateSelfChat({ ...shared, key: { fromMe: true, remoteJid: '6289999999999@s.whatsapp.net' } }), false);
  assert.equal(await isOwnerPrivateSelfChat({ ...shared, key: { fromMe: true, remoteJid: '123456789-0@g.us' } }), false);
  assert.equal(await isOwnerPrivateSelfChat({ ...shared, sessionPn: '6289999999999@s.whatsapp.net', key: { fromMe: true, remoteJid: ownerJid } }), false);
  assert.equal(await isOwnerPrivateSelfChat({
    ...shared,
    key: { fromMe: true, remoteJid: '123456789@lid' },
    lidManager: { getPNForLID: async () => ownerJid }
  }), true);
});

test('eval async awaits a Promise and returns an explicit value', async () => {
  const request = parseOwnerCodeRequest('> return await Promise.resolve("async-ok")');
  const result = await executeOwnerCodeRequest(request, { config: ownerConfig, context: { args: ['x'] } });
  assert.equal(result.ok, true);
  assert.match(result.output, /async-ok/);
});

test('JavaScript console output is returned to the owner chat', async () => {
  const result = await executeOwnerCodeRequest(parseOwnerCodeRequest('> console.log("console-ok"); return 7'), { config: ownerConfig });
  assert.equal(result.ok, true);
  assert.match(result.output, /console-ok/);
  assert.match(result.output, /7/);
});

test('eval return evaluates an expression and an explicit return statement', async () => {
  const expression = await executeOwnerCodeRequest(parseOwnerCodeRequest('=> 40 + 2'), { config: ownerConfig });
  const explicit = await executeOwnerCodeRequest(parseOwnerCodeRequest('=> return "returned"'), { config: ownerConfig });
  assert.equal(expression.ok, true);
  assert.match(expression.output, /42/);
  assert.equal(explicit.ok, true);
  assert.match(explicit.output, /returned/);
});

test('JavaScript synchronous loops are stopped by VM execution timeout', async () => {
  const result = await executeOwnerCodeRequest(parseOwnerCodeRequest('=> (() => { while (true) {} })()'), {
    config: { ...ownerConfig, timeoutMs: 100 }
  });
  assert.equal(result.ok, false);
  assert.match(result.output, /timed out|Script execution timed out/i);
});

test('JavaScript async requests that never settle are stopped by the Promise timeout', async () => {
  const result = await executeOwnerCodeRequest(parseOwnerCodeRequest('> await new Promise(() => {})'), {
    config: { ...ownerConfig, timeoutMs: 100 }
  });
  assert.equal(result.ok, false);
  assert.match(result.output, /timeout|Execution timeout/i);
});

test('CLI execution uses a process without shell interpolation by the Node spawn API', async () => {
  const result = await executeOwnerCodeRequest(parseOwnerCodeRequest('$ printf "cli-ok\\n"'), { config: ownerConfig });
  assert.equal(result.ok, true);
  assert.match(result.output, /cli-ok/);
});

test('CLI process timeout terminates the child process', async () => {
  const result = await executeOwnerCodeRequest(parseOwnerCodeRequest('$ sleep 3'), {
    config: { ...ownerConfig, timeoutMs: 100 }
  });
  assert.equal(result.ok, false);
  assert.equal(result.timedOut, true);
});

test('Python runner executes a temporary source file', async () => {
  const probe = spawnSync('python3', ['--version'], { encoding: 'utf8' });
  if (probe.error) return; // runtime is optional on a development workstation
  const result = await executeOwnerCodeRequest(parseOwnerCodeRequest('>> print("python-ok")'), { config: ownerConfig });
  assert.equal(result.ok, true, result.output);
  assert.match(result.output, /python-ok/);
});

test('Go runner executes a temporary main.go without downloading modules', async () => {
  const probe = spawnSync('go', ['version'], { encoding: 'utf8' });
  if (probe.error) return; // runtime is optional on a development workstation
  const source = 'package main\nimport "fmt"\nfunc main() { fmt.Println("golang-ok") }';
  const result = await executeOwnerCodeRequest(parseOwnerCodeRequest(`>>> ${source}`), { config: ownerConfig });
  assert.equal(result.ok, true, result.output);
  assert.match(result.output, /golang-ok/);
});

test('formatted result is bounded for WhatsApp payload size', () => {
  const request = parseOwnerCodeRequest('=> 1');
  const message = formatOwnerCodeResult(request, { ok: true, durationMs: 1, output: 'x'.repeat(9000) });
  assert.ok(message.length <= 3900);
  assert.match(message, /EVAL RETURN/);
});
