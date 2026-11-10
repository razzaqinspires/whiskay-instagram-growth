import fs from 'node:fs/promises';
import path from 'node:path';

function encode(value) {
  return JSON.parse(JSON.stringify(value, (_key, item) => {
    if (Buffer.isBuffer(item)) return { __whiskayBuffer: item.toString('base64') };
    if (item?.type === 'Buffer' && Array.isArray(item.data)) return { __whiskayBuffer: Buffer.from(item.data).toString('base64') };
    if (item instanceof Uint8Array) return { __whiskayBuffer: Buffer.from(item).toString('base64') };
    return item;
  }));
}
function decode(value) {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === 'object') {
    if (typeof value.__whiskayBuffer === 'string') return Buffer.from(value.__whiskayBuffer, 'base64');
    for (const key of Object.keys(value)) value[key] = decode(value[key]);
  }
  return value;
}

function appendQueueFooter(payload, footer) {
  if (!payload || typeof payload !== 'object') return false;
  if (typeof payload.text === 'string') {
    payload.text = `${payload.text.slice(0, Math.max(0, 3900 - footer.length))}${footer}`;
    return true;
  }
  const interactiveBody = payload.viewOnceMessage?.message?.interactiveMessage?.body
    || payload.message?.interactiveMessage?.body
    || payload.interactiveMessage?.body;
  if (interactiveBody && typeof interactiveBody.text === 'string') {
    interactiveBody.text = `${interactiveBody.text.slice(0, 900 - footer.length)}${footer}`;
    return true;
  }
  const extended = payload.viewOnceMessage?.message?.extendedTextMessage
    || payload.message?.extendedTextMessage
    || payload.extendedTextMessage;
  if (extended && typeof extended.text === 'string') {
    extended.text = `${extended.text.slice(0, 3900 - footer.length)}${footer}`;
    return true;
  }
  if (typeof payload.conversation === 'string') {
    payload.conversation = `${payload.conversation.slice(0, 3900 - footer.length)}${footer}`;
    return true;
  }
  return false;
}

export function createOutboundMessageQueue({ filePath, logger = console, getSettings, now = Date.now } = {}) {
  if (!filePath || typeof getSettings !== 'function') throw new TypeError('filePath dan getSettings wajib diisi.');
  let state;
  let ready = false;
  let busy = false;
  let timer;
  let lastSentAt = 0;
  let baseSend;
  let baseRelay;
  let writeQueue = Promise.resolve();
  let directSendTail = Promise.resolve();
  const waiters = new Map();

  async function persist() {
    const snapshot = JSON.stringify(state, null, 2) + '\n';
    writeQueue = writeQueue.catch(() => {}).then(async () => {
      const temporary = `${filePath}.${process.pid}.tmp`;
      await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
      await fs.writeFile(temporary, snapshot, { mode: 0o600 });
      await fs.rename(temporary, filePath);
      try { await fs.chmod(filePath, 0o600); } catch {}
    });
    await writeQueue;
  }
  async function load() {
    if (state) return state;
    try {
      state = JSON.parse(await fs.readFile(filePath, 'utf8'));
      if (!Array.isArray(state.jobs)) state.jobs = [];
      state.nextId = Number.isSafeInteger(state.nextId) ? state.nextId : 1;
    } catch (error) {
      if (error.code !== 'ENOENT') logger.warn?.({ error: error.message }, '[OUTBOUND QUEUE] Invalid queue file; starting empty');
      state = { schemaVersion: 1, nextId: 1, jobs: [] };
    }
    for (const job of state.jobs) {
      if (job.status === 'SENDING') {
        job.status = 'UNKNOWN';
        job.payload = null;
        job.finishedAt = now();
        job.error = 'Process berhenti ketika status SENDING; hasil relay tidak dapat dipastikan, tidak dikirim ulang otomatis.';
      }
    }
    state.jobs = state.jobs.slice(-2000);
    await persist();
    return state;
  }
  function activeJobs() { return state.jobs.filter(job => ['PENDING', 'SENDING'].includes(job.status)); }
  function summarize() {
    const counts = {};
    for (const job of state.jobs) counts[job.status] = (counts[job.status] || 0) + 1;
    return { pending: counts.PENDING || 0, sending: counts.SENDING || 0, sent: counts.SENT || 0, failed: counts.FAILED || 0, unknown: counts.UNKNOWN || 0, total: state.jobs.length };
  }
  function schedule(delayMs = 0) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = undefined; pump().catch(error => logger.error?.({ error: error.message }, '[OUTBOUND QUEUE] Worker failed')); }, Math.max(0, delayMs));
  }
  async function pump() {
    await load();
    if (!ready || busy) return;
    const settings = await getSettings();
    const queueEnabled = settings.queue?.enabled !== false;
    const transportEnabled = settings.transport?.enabled !== false;
    if (!queueEnabled && activeJobs().length === 0) return;
    const job = state.jobs.find(item => item.status === 'PENDING');
    if (!job) return;
    const interval = transportEnabled ? settings.transport.minIntervalMs : 0;
    const wait = Math.max(0, interval - (now() - lastSentAt));
    if (wait > 0) return schedule(wait);
    busy = true;
    job.status = 'SENDING'; job.startedAt = now();
    await persist();
    try {
      const payload = decode(job.payload);
      const position = job.queuePosition || (activeJobs().findIndex(item => item.id === job.id) + 1);
      const eta = Number.isSafeInteger(job.estimatedWaitMs) ? job.estimatedWaitMs : Math.max(0, (position - 1) * interval);
      const footer = `\\n\\n[Antrean posisi #${position} · ID ${job.queueNo} · estimasi tunggu ${eta} ms · cooldown transport ${interval} ms]`;
      appendQueueFooter(payload, footer);
      const send = job.method === 'relayMessage' ? baseRelay : baseSend;
      if (typeof send !== 'function') throw new Error(`Transport ${job.method} tidak tersedia.`);
      const result = await send(job.jid, payload, decode(job.options || {}));
      job.status = 'SENT'; job.finishedAt = now(); job.messageId = typeof result === 'string' ? result : (result?.key?.id || null);
      job.payload = null; job.options = null;
      lastSentAt = now();
      const waiter = waiters.get(job.id);
      if (waiter) { waiter.resolve(result); waiters.delete(job.id); }
      logger.debug?.({ queueNo: job.queueNo, messageId: job.messageId }, '[OUTBOUND QUEUE] Message sent');
    } catch (error) {
      job.status = 'UNKNOWN'; job.finishedAt = now();
      job.error = `Relay outcome uncertain: ${String(error?.message || error).slice(0, 200)}`;
      job.payload = null; job.options = null;
      const waiter = waiters.get(job.id);
      if (waiter) { waiter.reject(error); waiters.delete(job.id); }
      logger.warn?.({ queueNo: job.queueNo, error: job.error }, '[OUTBOUND QUEUE] Send failed; no blind retry');
    } finally {
      busy = false;
      const completed = state.jobs.filter(item => !['PENDING', 'SENDING'].includes(item.status));
      if (completed.length > 500) {
        const remove = new Set(completed.slice(0, completed.length - 500).map(item => item.id));
        state.jobs = state.jobs.filter(item => !remove.has(item.id));
      }
      await persist();
      if (state.jobs.some(item => item.status === 'PENDING')) schedule(interval);
    }
  }

  async function attach(sock) {
    if (!sock || typeof sock.sendMessage !== 'function') throw new TypeError('Socket sendMessage wajib tersedia.');
    await load();
    if (sock.sendMessage.__whiskayOutboundQueue) return sock.whiskayOutboundQueue;
    baseSend = sock.sendMessage.bind(sock);
    baseRelay = typeof sock.relayMessage === 'function' ? sock.relayMessage.bind(sock) : null;
    const wrapped = function (jid, content, options = {}) {
      return enqueue(jid, content, options, 'sendMessage');
    };
    Object.defineProperty(wrapped, '__whiskayOutboundQueue', { value: true });
    Object.defineProperty(sock, 'sendMessage', { configurable: true, writable: true, value: wrapped });
    if (baseRelay) {
      const wrappedRelay = function (jid, content, options = {}) {
        return enqueue(jid, content, options, 'relayMessage');
      };
      Object.defineProperty(wrappedRelay, '__whiskayOutboundQueue', { value: true });
      Object.defineProperty(sock, 'relayMessage', { configurable: true, writable: true, value: wrappedRelay });
    }
    Object.defineProperty(sock, 'whiskayOutboundQueue', { configurable: true, value: Object.freeze({ setReady, stats, drain }) });
    return sock.whiskayOutboundQueue;
  }
  async function enqueue(jid, content, options = {}, method = 'sendMessage') {
    await load();
    const settings = await getSettings();
    if (settings.queue?.enabled === false) {
      const direct = method === 'relayMessage' ? baseRelay : baseSend;
      if (settings.transport?.enabled === false) return direct(jid, content, options);
      const paced = directSendTail.then(async () => {
        const interval = settings.transport.minIntervalMs || 0;
        const wait = Math.max(0, interval - (now() - lastSentAt));
        if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
        const result = await direct(jid, content, options);
        lastSentAt = now();
        return result;
      });
      directSendTail = paced.catch(() => {});
      return paced;
    }
    const limit = settings.transport?.maxQueueSize || 1000;
    if (activeJobs().length >= limit) throw new Error(`Antrean pengiriman penuh (${limit}); tidak ada pesan yang dihapus diam-diam.`);
    const id = state.nextId++;
    const queueNo = id;
    const queuePosition = activeJobs().length + 1;
    const interval = settings.transport?.enabled === false ? 0 : (settings.transport?.minIntervalMs || 0);
    const job = {
      id, queueNo, queuePosition, estimatedWaitMs: Math.max(0, (queuePosition - 1) * interval), method,
      jid: String(jid).slice(0, 160), payload: encode(content),
      options: encode(options), status: 'PENDING', createdAt: now(), startedAt: null, finishedAt: null,
      messageId: null, error: null
    };
    state.jobs.push(job);
    await persist();
    const promise = new Promise((resolve, reject) => waiters.set(id, { resolve, reject }));
    if (ready) schedule();
    return promise;
  }
  async function setReady(value) {
    ready = Boolean(value);
    if (ready) schedule();
    else if (timer) { clearTimeout(timer); timer = undefined; }
  }
  async function drain(timeoutMs = 3000) {
    const deadline = now() + timeoutMs;
    while (busy || activeJobs().length) {
      if (now() >= deadline) return false;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return true;
  }
  async function stats() { await load(); return { ...summarize(), ready, minIntervalMs: (await getSettings()).transport.minIntervalMs }; }

  return Object.freeze({ attach, enqueue, setReady, stats, drain });
}
