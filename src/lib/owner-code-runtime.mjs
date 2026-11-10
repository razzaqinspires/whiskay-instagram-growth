import vm from 'node:vm';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, chmod } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { normalizeUserJid } from './lid-manager.mjs';
import { inspect } from 'node:util';
import { PROJECT_ROOT } from '../config.mjs';

const require = createRequire(import.meta.url);
const RUNTIME_PREFIXES = Object.freeze([
  { prefix: '>>>', runtime: 'golang', label: 'GO' },
  { prefix: '>>', runtime: 'python', label: 'PYTHON' },
  { prefix: '=>', runtime: 'eval-return', label: 'EVAL RETURN' },
  { prefix: '>', runtime: 'eval-async', label: 'EVAL ASYNC' },
  { prefix: '$', runtime: 'shell', label: 'CLI EXEC' }
]);


function toPhoneJid(value) {
  const jid = normalizeUserJid(value);
  return jid?.endsWith('@s.whatsapp.net') ? jid : null;
}

async function resolveOwnerChatPhone(value, lidManager, sessionPn, sessionLid) {
  const jid = normalizeUserJid(value);
  if (!jid) return null;
  if (jid.endsWith('@s.whatsapp.net')) return jid;
  if (!jid.endsWith('@lid')) return null;
  if (sessionLid && jid === sessionLid) return sessionPn;
  const mapped = toPhoneJid(await lidManager?.getPNForLID?.(jid));
  return mapped || null;
}

/** Explain why the high-privilege runtime gate accepted or rejected a message. */
export async function inspectOwnerPrivateSelfChat({ key, lidManager, ownerNumber, sessionPn: sessionPnRaw, sessionLid: sessionLidRaw } = {}) {
  if (key?.fromMe !== true) return { authorized: false, reason: 'FROM_ME_REQUIRED' };
  if (!key?.remoteJid) return { authorized: false, reason: 'CHAT_JID_MISSING' };
  if (String(key.remoteJid).endsWith('@g.us')) return { authorized: false, reason: 'GROUP_CHAT_FORBIDDEN' };
  const ownerPn = toPhoneJid(`${String(ownerNumber || '').replace(/\D/g, '')}@s.whatsapp.net`);
  if (!ownerPn) return { authorized: false, reason: 'OWNER_NUMBER_MISSING' };
  const sessionPn = toPhoneJid(sessionPnRaw);
  if (!sessionPn) return { authorized: false, reason: 'SESSION_PN_UNAVAILABLE' };
  if (sessionPn !== ownerPn) return { authorized: false, reason: 'SESSION_OWNER_MISMATCH' };
  const sessionLidValue = normalizeUserJid(sessionLidRaw);
  const sessionLid = sessionLidValue?.endsWith('@lid') ? sessionLidValue : null;
  // remoteJid is the destination chat. remoteJidAlt can describe the sender's alternate identity on outgoing messages, so it must never prove that the destination is the owner's self-chat.
  const chatValues = [key.remoteJid, key.remoteJidPn];
  const resolved = await Promise.all(chatValues.map(async value => {
    try {
      return await resolveOwnerChatPhone(value, lidManager, sessionPn, sessionLid);
    } catch {
      return null;
    }
  }));
  if (resolved.includes(ownerPn)) return { authorized: true, reason: 'OWNER_PRIVATE_SELF_CHAT' };
  return {
    authorized: false,
    reason: 'CHAT_NOT_OWNER_SELF_CHAT',
    chatJidServers: [...new Set(chatValues.map(value => {
      const jid = normalizeUserJid(value);
      return jid?.slice(jid.lastIndexOf('@') + 1) || 'missing';
    }))]
  };
}

/** Strict execution gate: code tools only run from the authenticated owner's own private self-chat. */
export async function isOwnerPrivateSelfChat(options = {}) {
  return (await inspectOwnerPrivateSelfChat(options)).authorized;
}

export function parseOwnerCodeRequest(text) {
  if (typeof text !== 'string') return null;
  let input = text.replace(/^\uFEFF/, '').trimStart();
  // Some WhatsApp copy/export paths append a terminal backslash as a line-continuation marker.
  // Strip exactly one terminal marker; do not alter backslashes inside source code.
  if (input.endsWith('\\')) input = input.slice(0, -1).trimEnd();
  const match = RUNTIME_PREFIXES.find(item => input.startsWith(item.prefix));
  if (!match) return null;
  let source = input.slice(match.prefix.length).trim();
  const fenced = source.match(/^```(?:javascript|js|python|py|bash|sh|shell|go)?\s*\n([\s\S]*?)\n```$/i);
  if (fenced) source = fenced[1].trim();
  return {
    runtime: match.runtime,
    label: match.label,
    prefix: match.prefix,
    source
  };
}

function normalizeOutput(value) {
  if (typeof value === 'string') return value;
  if (value === undefined) return '(undefined)';
  if (value === null) return 'null';
  try {
    return inspect(value, { depth: 4, colors: false, compact: false, maxArrayLength: 100, maxStringLength: 12000, breakLength: 100 });
  } catch {
    try { return String(value); } catch { return '[unprintable result]'; }
  }
}

function boundedText(value, maxChars) {
  const text = String(value ?? '');
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n… output dipotong pada batas ${maxChars} karakter.`;
}

function createTrackedTimers() {
  const handles = new Set();
  const track = (kind, callback, delay, ...args) => {
    let handle;
    const wrapped = (...callbackArgs) => {
      if (kind !== 'interval') handles.delete(handle);
      return callback(...callbackArgs);
    };
    handle = kind === 'interval'
      ? setInterval(wrapped, delay, ...args)
      : kind === 'immediate'
        ? setImmediate(wrapped, ...args)
        : setTimeout(wrapped, delay, ...args);
    handles.add(handle);
    return handle;
  };
  return {
    setTimeout: (callback, delay, ...args) => track('timeout', callback, delay, ...args),
    setInterval: (callback, delay, ...args) => track('interval', callback, delay, ...args),
    setImmediate: (callback, ...args) => track('immediate', callback, undefined, ...args),
    clearTimeout: handle => { clearTimeout(handle); handles.delete(handle); },
    clearInterval: handle => { clearInterval(handle); handles.delete(handle); },
    clearImmediate: handle => { clearImmediate(handle); handles.delete(handle); },
    clearAll: () => {
      for (const handle of handles) {
        clearTimeout(handle);
        clearInterval(handle);
        clearImmediate(handle);
      }
      handles.clear();
    }
  };
}

function createVmContext(context = {}, runtimeConsole = console, timers = createTrackedTimers()) {
  const sandbox = {
    sock: context.sock,
    conn: context.sock,
    msg: context.msg,
    m: context.msg,
    key: context.key,
    ctx: context,
    config: context.config,
    pluginLoader: context.pluginLoader,
    lidManager: context.lidManager,
    command: context.command,
    prefix: context.prefix,
    args: context.args || [],
    rawArgs: context.rawArgs || '',
    reply: context.reply,
    send: context.send,
    sendMedia: context.sendMedia,
    sendInteractive: context.sendInteractive,
    logger: context.logger || console,
    process,
    Buffer,
    require,
    console: runtimeConsole,
    fetch: globalThis.fetch,
    URL,
    URLSearchParams,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval,
    setImmediate: timers.setImmediate,
    clearImmediate: timers.clearImmediate
  };
  return vm.createContext(sandbox, {
    name: 'WHISKAY owner eval runtime',
    codeGeneration: { strings: true, wasm: false }
  });
}

async function runJavaScript(request, { timeoutMs, maxOutputBytes, context }) {
  const consoleLines = [];
  const runtimeConsole = Object.fromEntries(['log', 'info', 'warn', 'error', 'debug'].map(level => [level, (...values) => {
    consoleLines.push(`[${level}] ${values.map(normalizeOutput).join(' ')}`);
  }]));
  const timers = createTrackedTimers();
  const vmContext = createVmContext(context, runtimeConsole, timers);
  const scriptText = request.runtime === 'eval-async'
    ? `(async () => {\n${request.source}\n})()`
    : request.source.trimStart().startsWith('return')
      ? `(async () => {\n${request.source}\n})()`
      : `(${request.source}\n)`;
  const script = new vm.Script(scriptText, {
    filename: `whiskay-owner-${request.runtime}.mjs`,
    displayErrors: true,
    importModuleDynamically: specifier => import(specifier)
  });

  const startedAt = Date.now();
  let value;
  try {
    value = script.runInContext(vmContext, { timeout: timeoutMs, displayErrors: true });
    if (value && typeof value.then === 'function') {
      value = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(
          `Batas tunggu ${timeoutMs} ms tercapai. Promise JavaScript tidak otomatis dibatalkan; operasi eksternal yang sudah dimulai dapat tetap berjalan.`
        )), timeoutMs);
        Promise.resolve(value).then(resolve, reject).finally(() => clearTimeout(timer));
      });
    }
    const outputParts = [...consoleLines];
    if (value !== undefined) outputParts.push(normalizeOutput(value));
    return {
      ok: true,
      runtime: request.runtime,
      durationMs: Date.now() - startedAt,
      output: boundedText(outputParts.join('\n') || '(tidak ada output)', Math.min(maxOutputBytes, 12000))
    };
  } catch (error) {
    return {
      ok: false,
      runtime: request.runtime,
      durationMs: Date.now() - startedAt,
      output: boundedText(error?.stack || error?.message || String(error), Math.min(maxOutputBytes, 12000))
    };
  } finally {
    timers.clearAll();
  }
}

function killProcessTree(child, signal = 'SIGTERM') {
  if (!child?.pid) return;
  try {
    if (process.platform !== 'win32' && child.spawnargs && child.pid) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch (error) {
    if (error.code !== 'ESRCH') child.kill(signal);
  }
}

async function runProcess(binary, args, {
  cwd,
  timeoutMs,
  maxOutputBytes,
  env = process.env
}) {
  const startedAt = Date.now();
  return new Promise(resolve => {
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let totalBytes = 0;
    let timedOut = false;
    let outputLimitReached = false;
    let settled = false;
    let errorMessage = '';
    let hardKillTimer;
    let timer;

    const child = spawn(binary, args, {
      cwd,
      env,
      shell: false,
      detached: process.platform !== 'win32',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(hardKillTimer);
      resolve({ ...result, durationMs: Date.now() - startedAt });
    };

    const kill = () => {
      killProcessTree(child, 'SIGTERM');
      hardKillTimer = setTimeout(() => killProcessTree(child, 'SIGKILL'), 350);
      hardKillTimer.unref?.();
    };

    const append = (stream, chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = Math.max(0, maxOutputBytes - totalBytes);
      const kept = buffer.subarray(0, remaining);
      totalBytes += kept.length;
      if (stream === 'stdout') stdout = Buffer.concat([stdout, kept]);
      else stderr = Buffer.concat([stderr, kept]);
      if (kept.length < buffer.length && !outputLimitReached) {
        outputLimitReached = true;
        kill();
      }
    };

    child.stdout.on('data', chunk => append('stdout', chunk));
    child.stderr.on('data', chunk => append('stderr', chunk));
    child.once('error', error => {
      errorMessage = error.code === 'ENOENT'
        ? `Runtime tidak ditemukan: ${binary}. Pasang runtime atau atur binary di config/app.json.`
        : error.message;
    });
    child.once('close', (code, signal) => {
      const pieces = [];
      if (stdout.length) pieces.push(stdout.toString('utf8'));
      if (stderr.length) pieces.push(`[stderr]\n${stderr.toString('utf8')}`);
      if (errorMessage) pieces.push(errorMessage);
      if (timedOut) pieces.push(`\n[timeout setelah ${timeoutMs} ms]`);
      if (outputLimitReached) pieces.push(`\n[output dibatasi ${maxOutputBytes} byte]`);
      finish({
        ok: code === 0 && !timedOut && !outputLimitReached && !errorMessage,
        runtime: binary,
        exitCode: Number.isInteger(code) ? code : null,
        signal: signal || null,
        timedOut,
        output: boundedText(pieces.join('\n').trim() || '(tidak ada output)', maxOutputBytes),
        error: errorMessage || undefined
      });
    });

    timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, timeoutMs);
    timer.unref?.();
  });
}

async function withTempSource(workDir, extension, source, callback) {
  const root = path.resolve(workDir || path.join(PROJECT_ROOT, 'data', 'owner-runtime'));
  await mkdir(root, { recursive: true, mode: 0o700 });
  await chmod(root, 0o700).catch(() => {});
  const directory = await mkdtemp(path.join(root, 'run-'));
  await chmod(directory, 0o700).catch(() => {});
  const sourcePath = path.join(directory, `main.${extension}`);
  try {
    await writeFile(sourcePath, source, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    return await callback({ directory, sourcePath });
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

let ownerCodeExecutionActive = false;

export async function executeOwnerCodeRequest(request, options = {}) {
  if (ownerCodeExecutionActive) {
    return { ok: false, runtime: request?.runtime || 'unknown', durationMs: 0, output: 'Owner runtime sedang menjalankan proses lain. Tunggu sampai proses sebelumnya selesai.' };
  }
  ownerCodeExecutionActive = true;
  try {
    return await executeOwnerCodeRequestInternal(request, options);
  } finally {
    ownerCodeExecutionActive = false;
  }
}

async function executeOwnerCodeRequestInternal(request, {
  config = {},
  context = {},
  projectRoot = PROJECT_ROOT
} = {}) {
  if (!request || !RUNTIME_PREFIXES.some(item => item.runtime === request.runtime)) {
    throw new TypeError('Jenis runtime owner-code tidak dikenal.');
  }
  const source = String(request.source ?? '').trim();
  if (!source) {
    const usage = {
      'eval-async': '> return "hasil"\n> const response = await fetch(url); return await response.text()',
      'eval-return': '=> "helo"\n=> 1 + 2\n=> return sock.user',
      shell: '$ ls\n$ pwd\n$ node --version',
      python: '>> print("python-ok")\n>> import os; print(os.getcwd())',
      golang: '>>> package main\nimport "fmt"\nfunc main() { fmt.Println("go-ok") }'
    };
    return {
      ok: false,
      runtime: request.label || request.runtime,
      durationMs: 0,
      output: `Kode ${request.label || request.runtime} kosong. Contoh penggunaan:\n${usage[request.runtime] || 'Masukkan kode setelah prefix.'}`
    };
  }

  const maxCodeChars = config.maxCodeChars ?? 8000;
  const timeoutMs = config.timeoutMs ?? 15000;
  const maxOutputBytes = config.maxOutputBytes ?? 16000;
  if (source.length > maxCodeChars) {
    return { ok: false, runtime: request.runtime, durationMs: 0, output: `Kode terlalu panjang (${source.length} karakter). Batas: ${maxCodeChars}.` };
  }

  if (request.runtime === 'eval-async' || request.runtime === 'eval-return') {
    return runJavaScript({ ...request, source }, { timeoutMs, maxOutputBytes, context });
  }

  if (request.runtime === 'shell') {
    const shell = config.shellBin || (process.platform === 'win32' ? 'bash.exe' : '/bin/bash');
    return runProcess(shell, ['--noprofile', '--norc', '-c', source], {
      cwd: projectRoot,
      timeoutMs,
      maxOutputBytes,
      env: process.env
    });
  }

  if (request.runtime === 'python') {
    const python = config.pythonBin || 'python3';
    return withTempSource(config.workDir, 'py', source, ({ sourcePath }) => runProcess(python, ['-I', sourcePath], {
      cwd: projectRoot,
      timeoutMs,
      maxOutputBytes,
      env: process.env
    }));
  }

  if (request.runtime === 'golang') {
    const go = config.goBin || 'go';
    const goEnv = {
      ...process.env,
      GOTOOLCHAIN: 'local',
      GOPROXY: 'off',
      GOSUMDB: 'off',
      GOWORK: 'off'
    };
    return withTempSource(config.workDir, 'go', source, ({ sourcePath }) => runProcess(go, ['run', sourcePath], {
      cwd: projectRoot,
      timeoutMs,
      maxOutputBytes,
      env: goEnv
    }));
  }

  throw new TypeError(`Runtime tidak didukung: ${request.runtime}`);
}

export function formatOwnerCodeResult(request, result) {
  const status = result.ok ? 'SUCCESS' : 'FAILED';
  const runtimeLabel = request?.label || String(request?.runtime || 'OWNER RUNTIME').toUpperCase();
  const output = boundedText(result.output || '(tidak ada output)', 3400);
  const details = [
    `WHISKAY OWNER RUNTIME · ${runtimeLabel}`,
    `Status: ${status}`,
    `Durasi: ${result.durationMs ?? 0} ms`,
    result.exitCode !== undefined && result.exitCode !== null ? `Exit code: ${result.exitCode}` : null,
    '',
    output
  ].filter(value => value !== null);
  return details.join('\n').slice(0, 3900);
}

export const OWNER_CODE_PREFIXES = RUNTIME_PREFIXES.map(item => item.prefix);
