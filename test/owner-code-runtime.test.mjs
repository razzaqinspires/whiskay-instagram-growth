import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyMessageUpsert } from '../src/lib/message-ingress.mjs';
import { spawnSync } from 'node:child_process';
import { handleMessage } from '../src/commands.mjs';
import { createOwnerCodeAuditStore } from '../src/lib/owner-code-audit.mjs';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  parseOwnerCodeRequest,
  executeOwnerCodeRequest,
  formatOwnerCodeResult,
  isOwnerPrivateSelfChat,
  inspectOwnerPrivateSelfChat
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


test('empty runtime prefixes return actionable usage instead of a generic empty-code error', async () => {
  for (const [input, expected] of [['>>', 'print("python-ok")'], ['>>>', 'package main'], ['$', '$ ls']]) {
    const request = parseOwnerCodeRequest(input);
    const result = await executeOwnerCodeRequest(request, { config: ownerConfig });
    assert.equal(result.ok, false);
    assert.match(result.output, /Contoh penggunaan/);
    assert.match(result.output, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('owner eval clears outstanding timers when the snippet returns', async () => {
  const started = Date.now();
  const result = await executeOwnerCodeRequest(
    parseOwnerCodeRequest('> setInterval(() => console.log("should-not-repeat"), 5); return "timer-cleaned"'),
    { config: ownerConfig }
  );
  assert.equal(result.ok, true);
  assert.match(result.output, /timer-cleaned/);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(Date.now() - started < 2000, true);
  assert.equal(result.output.includes('should-not-repeat'), false);
});

test('parser strips a leading Unicode BOM before recognizing a special prefix', () => {
  assert.equal(parseOwnerCodeRequest('\uFEFF=> "bom-ok"').runtime, 'eval-return');
});


test('owner private self-chat gate returns precise diagnostics for common failures', async () => {
  const ownerNumber = '6281234567890';
  const base = { ownerNumber, sessionPn: `${ownerNumber}@s.whatsapp.net` };
  assert.equal((await inspectOwnerPrivateSelfChat({ ...base, key: { fromMe: false, remoteJid: `${ownerNumber}@s.whatsapp.net` } })).reason, 'FROM_ME_REQUIRED');
  assert.equal((await inspectOwnerPrivateSelfChat({ ...base, key: { fromMe: true, remoteJid: '120@g.us' } })).reason, 'GROUP_CHAT_FORBIDDEN');
  assert.equal((await inspectOwnerPrivateSelfChat({ ...base, sessionPn: undefined, key: { fromMe: true, remoteJid: `${ownerNumber}@s.whatsapp.net` } })).reason, 'SESSION_PN_UNAVAILABLE');
  assert.equal((await inspectOwnerPrivateSelfChat({ ...base, key: { fromMe: true, remoteJid: '6289999999999@s.whatsapp.net' } })).reason, 'CHAT_NOT_OWNER_SELF_CHAT');
});


test('parser tolerates a terminal WhatsApp copy backslash and balanced code fences', () => {
  assert.equal(parseOwnerCodeRequest('=> 1 + 1\\').source, '1 + 1');
  assert.equal(parseOwnerCodeRequest('>>\\').source, '');
  assert.equal(parseOwnerCodeRequest('>>>\\').source, '');
  assert.equal(parseOwnerCodeRequest('=> ```js\n1 + 1\n```').source, '1 + 1');
  assert.equal(parseOwnerCodeRequest('>> ```python\nprint("ok")\n```').source, 'print("ok")');
});

test('owner self-chat authorization does not mistake remoteJidAlt sender identity for destination', async () => {
  const ownerNumber = '6281234567890';
  const session = { ownerNumber, sessionPn: `${ownerNumber}@s.whatsapp.net` };
  assert.equal(await isOwnerPrivateSelfChat({
    ...session,
    key: {
      fromMe: true,
      remoteJid: '6289999999999@s.whatsapp.net',
      remoteJidAlt: `${ownerNumber}@s.whatsapp.net`
    }
  }), false);
  assert.equal(await isOwnerPrivateSelfChat({
    ...session,
    sessionLid: '123456789@lid',
    key: { fromMe: true, remoteJid: '123456789@lid' }
  }), true);
  assert.equal(await isOwnerPrivateSelfChat({
    ...session,
    key: { fromMe: true, remoteJid: '123456789@lid', remoteJidPn: `${ownerNumber}@s.whatsapp.net` }
  }), true);
});

test('full handleMessage path executes owner Eval Master prefixes and replies with results', async t => {
  const ownerNumber = '6281234567890';
  const sent = [];
  const sock = {
    user: { id: `${ownerNumber}@s.whatsapp.net` },
    sendMessage: async (jid, payload) => {
      sent.push({ jid, text: payload.text });
      return { key: { id: `reply-${sent.length}` } };
    }
  };
  const modeStore = { get: async () => ({ mode: 'self', allowGroups: false, updatedAt: 1 }) };
  const trafficSafety = {
    updateIngressDecision: async () => true,
    inspectIncoming: async () => ({ status: 'ACCEPTED' })
  };
  const antiSpam = { check: () => ({ allowed: true, release() {} }) };
  const pluginLoader = { listCommands: () => [], execute: async () => ({ found: false }) };
  const common = {
    ownerNumber,
    lidManager: { getPNForLID: async () => null },
    pluginLoader,
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    modeStore,
    trafficSafety,
    antiSpam
  };
  const cases = [
    ['=> 1 + 1', /EVAL RETURN[\s\S]*SUCCESS[\s\S]*2/],
    ['> return await Promise.resolve("async-pass")', /EVAL ASYNC[\s\S]*SUCCESS[\s\S]*async-pass/],
    ['$ printf cli-pass', /CLI EXEC[\s\S]*SUCCESS[\s\S]*cli-pass/],
    ['>> print("python-pass")', /PYTHON[\s\S]*SUCCESS[\s\S]*python-pass/],
    ['>>> package main\nimport "fmt"\nfunc main() { fmt.Println("go-pass") }', /GO[\s\S]*SUCCESS[\s\S]*go-pass/]
  ];
  for (const [text, expected] of cases) {
    const before = sent.length;
    await handleMessage(sock, {
      key: { id: `owner-${before}`, fromMe: true, remoteJid: `${ownerNumber}@s.whatsapp.net` },
      message: { conversation: text }
    }, common);
    assert.equal(sent.length, before + 1, `missing response for prefix ${text.slice(0, 3)}`);
    assert.match(sent.at(-1).text, expected);
  }
});

test('full handleMessage path rejects Eval Master sent to another private chat', async () => {
  const ownerNumber = '6281234567890';
  const sent = [];
  const sock = {
    user: { id: `${ownerNumber}@s.whatsapp.net` },
    sendMessage: async (_jid, payload) => { sent.push(payload.text); return { key: { id: 'reply' } }; }
  };
  await handleMessage(sock, {
    key: {
      id: 'not-self',
      fromMe: true,
      remoteJid: '6289999999999@s.whatsapp.net',
      remoteJidAlt: `${ownerNumber}@s.whatsapp.net`
    },
    message: { conversation: '=> 1 + 1' }
  }, {
    ownerNumber,
    lidManager: { getPNForLID: async () => null },
    pluginLoader: { listCommands: () => [] },
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    modeStore: { get: async () => ({ mode: 'self', allowGroups: false, updatedAt: 1 }) }
  });
  assert.equal(sent.length, 0);
});


test('owner runtime audit persists hashes and execution metadata without raw source or output', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-owner-audit-'));
  const filePath = path.join(dir, 'owner-code-audit.json');
  const audit = createOwnerCodeAuditStore({ filePath, retention: 10, now: () => 123456 });
  try {
    const entry = await audit.record({
      runtime: 'eval-return',
      source: '=> process.env.SECRET',
      messageId: 'msg-owner-1',
      ok: true,
      durationMs: 12
    });
    assert.equal(entry.runtime, 'eval-return');
    assert.equal(entry.ok, true);
    const raw = await readFile(filePath, 'utf8');
    assert.doesNotMatch(raw, /process\\.env\\.SECRET/);
    assert.match(raw, /sourceHash/);
    assert.equal((await audit.list()).length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
