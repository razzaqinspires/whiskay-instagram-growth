import makeWASocket, { Browsers, DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { mkdir, chmod } from 'node:fs/promises';
import pino from 'pino';
import { attachLidManager, normalizeUserJid } from './lib/lid-manager.mjs';
import { getReconnectDelay } from './lib/reconnect-policy.mjs';
import { classifyMessageUpsert } from './lib/message-ingress.mjs';
import { extractMessageText, parseCommand, trafficSafetyManager } from './commands.mjs';
import { parseOwnerCodeRequest } from './lib/owner-code-runtime.mjs';
import { config } from './config.mjs';
import { getPollCreationMessage } from './lib/poll-store.mjs';
import { createMessageDeliveryTracker } from './lib/message-delivery-tracker.mjs';
import { createOutboundMessageQueue } from './lib/outbound-message-queue.mjs';
import { sprMessageStore } from './lib/spr-message-store.mjs';

const { pairingNumber: phoneNumber, sessionDir } = config.whatsapp;
const logger = pino({
  level: config.app.logLevel,
  redact: { paths: ['password', 'token', 'cookie', 'authorization', 'session', 'creds', '*.password', '*.token', '*.cookie', '*.authorization', '*.session', '*.creds'], censor: '[REDACTED]' }
});

const STABLE_CONNECTION_MS = 60_000;
const SOCKET_CLOSE_TIMEOUT_MS = 5000;
const MESSAGE_DRAIN_TIMEOUT_MS = 3000;

let shuttingDown = false;
let reconnectTimer;
let stableConnectionTimer;
let activeSocket;
let startTask;
let closeTask;
let reconnectAttempts = 0;
let onMessageHandler;
const inFlightMessages = new Set();

function withTimeout(promise, timeoutMs, label) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs);
    })
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function endSocket(sock, reason = new Error('WHISKAY socket cleanup')) {
  if (!sock?.end) return;
  try {
    await withTimeout(sock.end(reason), SOCKET_CLOSE_TIMEOUT_MS, '[WHATSAPP] Socket close');
  } catch (error) {
    logger.warn({ err: error }, '[WHATSAPP] Socket close did not finish cleanly');
  }
}

function scheduleReconnect() {
  if (shuttingDown || reconnectTimer) return;
  reconnectAttempts += 1;
  const delayMs = getReconnectDelay(reconnectAttempts);
  logger.info({ attempt: reconnectAttempts, delayMs }, '[WHISKAY SELF] Scheduling reconnect with backoff');

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = undefined;
    if (shuttingDown || activeSocket) return;
    try {
      if (startTask) await startTask.catch(() => {});
      if (!shuttingDown && !activeSocket) await startSocket();
    } catch (error) {
      logger.error({ err: error }, '[WHISKAY SELF] Reconnect failed');
      scheduleReconnect();
    }
  }, delayMs);
  reconnectTimer.unref?.();
}

function trackMessage(sock, msg, lidManagerPromise, eventType, ingressPromise) {
  if (typeof onMessageHandler !== 'function') return;
  const task = (async () => {
    try {
      const [lidManager, ingress] = await Promise.all([
        lidManagerPromise,
        Promise.resolve(ingressPromise).catch(error => {
          logger.warn({ err: error }, '[TRAFFIC SAFETY] Inbound audit write failed');
          return null;
        })
      ]);
      if (shuttingDown) return;
      await onMessageHandler(sock, msg, { lidManager, logger, eventType, ingressId: ingress?.ingressId });
    } catch (error) {
      logger.error({ err: error }, '[COMMAND] message handler failed');
    }
  })();
  inFlightMessages.add(task);
  task.finally(() => inFlightMessages.delete(task));
}

async function startSocketInternal() {
  if (shuttingDown) return null;

  await mkdir(sessionDir, { recursive: true, mode: 0o700 });
  await chmod(sessionDir, 0o700);
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  if (shuttingDown) return null;

  const sock = makeWASocket({
    auth: state,
    browser: Browsers.windows('Chrome'),
    logger,
    markOnlineOnConnect: false,
    syncFullHistory: config.whatsapp.syncFullHistory,
    getMessage: async key => getPollCreationMessage(key)
  });
  const credentialIdentity = state.creds?.me || {};
  Object.defineProperty(sock, 'whiskayIdentity', {
    configurable: false,
    enumerable: false,
    value: Object.freeze({
      pn: credentialIdentity.id || sock.user?.id || null,
      lid: credentialIdentity.lid || sock.user?.lid || null
    })
  });
  activeSocket = sock;

  // Observe outbound send results plus Baileys status/receipt events. This is
  // diagnostics only: no automatic resend is performed for ambiguous outcomes.
  const deliveryTracker = createMessageDeliveryTracker({ logger });
  deliveryTracker.attach(sock);
  const outboundQueue = createOutboundMessageQueue({
    filePath: config.trafficSafety.queueFile,
    logger,
    getSettings: () => trafficSafetyManager.getSettings()
  });
  await outboundQueue.attach(sock);

  // Persist credentials without scanning the key directory. Baileys rotates
  // pre-key files itself; a concurrent stat/chmod sweep can race with that.
  sock.ev.on('creds.update', () => {
    if (shuttingDown) return;
    saveCreds().catch(error => {
      if (error.code === 'ENOENT') logger.debug({ err: error }, '[SESSION] Credential file rotated during save; latest state will be persisted by Baileys.');
      else logger.error({ err: error }, '[SESSION] Failed to persist WhatsApp credentials');
    });
  });

  let pairingRequested = false;
  sock.ev.on('connection.update', async ({ connection, qr, lastDisconnect } = {}) => {
    if (shuttingDown) return;

    if ((qr || connection === 'connecting') && !state.creds.registered && !pairingRequested) {
      pairingRequested = true;
      try {
        const code = await sock.requestPairingCode(phoneNumber);
        if (shuttingDown) return;
        console.log('\n=== WHISKAY PAIRING CODE ===\n' + code);
        console.log('WhatsApp utama → Perangkat tertaut → Tautkan dengan nomor telepon.\n');
      } catch (error) {
        logger.error({ err: error }, '[PAIRING] Gagal meminta pairing code. Periksa nomor/koneksi; tidak akan meminta kode berulang otomatis.');
      }
    }

    if (connection === 'open') {
      await outboundQueue.setReady(true);
      if (stableConnectionTimer) clearTimeout(stableConnectionTimer);
      logger.info('[WHISKAY SELF] WhatsApp connection opened.');
      const sessionPn = normalizeUserJid(sock.user?.id);
      const ownerPn = normalizeUserJid(`${config.whatsapp.ownerNumber}@s.whatsapp.net`);
      if (sessionPn?.endsWith('@s.whatsapp.net')) {
        const ownerMatchesSession = sessionPn === ownerPn;
        logger.info({ ownerMatchesSession, sessionPnAvailable: true }, '[WHATSAPP] Canonical owner PN identity check');
        if (!ownerMatchesSession) {
          logger.warn('[WHATSAPP] Logged-in account PN differs from config/app.json whatsapp.ownerNumber and pairingNumber. Update both fields to the logged-in account phone number (digits only).');
        }
      } else {
        logger.warn('[WHATSAPP] Baileys socket did not expose a canonical @s.whatsapp.net user.id; owner commands will use configured PN plus the available LID mapping.');
      }
      // Do not reset the retry counter immediately: an unstable socket that
      // opens and closes within seconds must continue backing off instead of
      // reconnecting every time at the shortest delay.
      stableConnectionTimer = setTimeout(() => {
        stableConnectionTimer = undefined;
        if (!shuttingDown && activeSocket === sock) {
          reconnectAttempts = 0;
          logger.debug('[WHISKAY SELF] Connection remained stable; reconnect backoff reset.');
        }
      }, STABLE_CONNECTION_MS);
      stableConnectionTimer.unref?.();
      return;
    }

    if (connection !== 'close') return;
    await outboundQueue.setReady(false);

    if (stableConnectionTimer) {
      clearTimeout(stableConnectionTimer);
      stableConnectionTimer = undefined;
    }
    if (activeSocket === sock) activeSocket = undefined;
    const code = lastDisconnect?.error?.output?.statusCode;
    logger.warn({ statusCode: code, reason: lastDisconnect?.error?.message }, '[WHISKAY SELF] Connection closed');

    if (shuttingDown || code === DisconnectReason.loggedOut) {
      logger.warn('[WHISKAY SELF] Logout/shutdown terdeteksi. Tidak melakukan pairing atau reconnect otomatis.');
      return;
    }

    if (code === DisconnectReason.connectionReplaced || code === 440) {
      logger.error('[WHISKAY SELF] Sesi WhatsApp digantikan koneksi lain (440). Reconnect dihentikan untuk mencegah dua sesi saling menggusur. Pastikan hanya satu proses memakai folder session ini.');
      process.kill(process.pid, 'SIGTERM');
      return;
    }

    // 503/unavailable, 515/restart-required, network drops, and unknown
    // transient closes use one bounded exponential reconnect timer.
    scheduleReconnect();
  });

  // Attach the command listener immediately. It waits for the LID map to load,
  // so a slow read of thousands of mappings cannot make early commands vanish.
  const lidManagerPromise = attachLidManager(sock, {
    file: config.identity.lidMapFile,
    logger
  });
  sock.ev.on('messages.upsert', event => {
    const rawMessages = Array.isArray(event?.messages) ? event.messages : [];
    const ownerRuntimeCandidates = rawMessages.flatMap(message => {
      const text = extractMessageText(message?.message);
      const request = parseOwnerCodeRequest(text);
      return request ? [{ message, request }] : [];
    });
    if (ownerRuntimeCandidates.length) {
      logger.info({
        eventType: event?.type || 'unknown',
        candidates: ownerRuntimeCandidates.length,
        fromMeCount: ownerRuntimeCandidates.filter(item => item.message?.key?.fromMe === true).length,
        runtimes: [...new Set(ownerRuntimeCandidates.map(item => item.request.runtime))],
        ownerCodeEnabled: config.ownerCode.enabled
      }, '[OWNER RUNTIME] Prefix detected at WhatsApp ingress');
    }

    // Keep `notify` as the only executable event class. Baileys uses `append`
    // for history/backfill, which must never replay old owner commands.
    const batch = classifyMessageUpsert(event, {
      isCommand: message => {
        const text = extractMessageText(message.message);
        return Boolean(parseCommand(text) || parseOwnerCodeRequest(text));
      }
    });

    if (batch.type !== 'notify') {
      if (ownerRuntimeCandidates.length) {
        logger.warn({
          eventType: batch.type,
          candidates: ownerRuntimeCandidates.length,
          fromMeCount: ownerRuntimeCandidates.filter(item => item.message?.key?.fromMe === true).length
        }, '[OWNER RUNTIME] Prefix not executed: non-live/history event');
      }
      if (batch.total > 0) {
        logger.debug({ eventType: batch.type, batchSize: batch.total }, '[WHATSAPP] Non-live message batch ignored');
      }
      return;
    }

    const commandMessages = new Set(batch.messages);
    for (const incoming of batch.liveMessages || []) {
      // SPR stores only sender/chat identifiers, stanza ID, and timestamp.
      // Message bodies and media are never retained.
      sprMessageStore.save(incoming);
      const sender = incoming.key?.participant || incoming.key?.remoteJid;
      const messageType = Object.keys(incoming.message || {})[0] || 'message';
      const ingressPromise = trafficSafetyManager.recordInboundEvent({
        sender, messageId: incoming.key?.id, messageType
      });
      if (commandMessages.has(incoming)) {
        // The same durable ingress row is updated by command policy evaluation.
        trackMessage(sock, incoming, lidManagerPromise, batch.type, ingressPromise);
      } else {
        ingressPromise.catch(error => logger.warn({ error: error.message }, '[TRAFFIC SAFETY] Inbound audit write failed'));
      }
    }

    if (batch.messages.length > 0) {
      logger.info({
        eventType: batch.type,
        batchSize: batch.total,
        commandCandidates: batch.commandLikeCount,
        fromMeCount: batch.fromMeCount,
        alternateAddressCount: batch.alternateAddressCount
      }, '[WHATSAPP] Live command message received');
    }

  });

  try {
    await lidManagerPromise;
    logger.info('[LID] Manager ready; incoming owner commands can be processed.');
  } catch (error) {
    if (activeSocket === sock) activeSocket = undefined;
    await endSocket(sock, error);
    throw error;
  }

  if (shuttingDown) {
    if (activeSocket === sock) activeSocket = undefined;
    await endSocket(sock, new Error('Shutdown requested during socket startup'));
    return null;
  }

  return sock;
}

function startSocket() {
  if (shuttingDown) return Promise.resolve(null);
  if (activeSocket) return Promise.resolve(activeSocket);
  if (startTask) return startTask;
  startTask = startSocketInternal().finally(() => {
    startTask = undefined;
  });
  return startTask;
}

export async function connectWA({ onMessage } = {}) {
  if (!phoneNumber) throw new Error('whatsapp.pairingNumber wajib diisi di config/app.json dengan nomor akun WhatsApp utama.');
  if (closeTask) throw new Error('WhatsApp runtime sudah ditutup; mulai ulang proses WHISKAY untuk membuka koneksi baru.');
  if (activeSocket) return activeSocket;
  shuttingDown = false;
  onMessageHandler = onMessage;
  return startSocket();
}

export async function closeWA() {
  if (closeTask) return closeTask;
  shuttingDown = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  if (stableConnectionTimer) {
    clearTimeout(stableConnectionTimer);
    stableConnectionTimer = undefined;
  }

  closeTask = (async () => {
    // If shutdown arrives while auth/LID startup is still reading from disk,
    // wait for it to settle. startSocketInternal checks `shuttingDown` again
    // before leaving and closes any socket created during that interval.
    if (startTask) {
      try { await withTimeout(startTask, SOCKET_CLOSE_TIMEOUT_MS, '[WHATSAPP] Socket startup'); }
      catch (error) { logger.warn({ err: error }, '[WHATSAPP] Startup did not settle before shutdown'); }
    }

    const sock = activeSocket;
    if (sock?.whiskayOutboundQueue) {
      const drained = await sock.whiskayOutboundQueue.drain(MESSAGE_DRAIN_TIMEOUT_MS);
      if (!drained) logger.warn('[OUTBOUND QUEUE] Shutdown grace period elapsed; pending messages remain persisted.');
      await sock.whiskayOutboundQueue.setReady(false);
    }
    if (sock) await endSocket(sock, new Error('WHISKAY graceful shutdown'));
    if (activeSocket === sock) activeSocket = undefined;

    if (inFlightMessages.size) {
      try {
        await withTimeout(Promise.allSettled([...inFlightMessages]), MESSAGE_DRAIN_TIMEOUT_MS, '[COMMAND] Drain');
      } catch (error) {
        logger.warn({ pending: inFlightMessages.size, err: error }, '[COMMAND] Pending handlers exceeded shutdown grace period');
      }
    }
    onMessageHandler = undefined;
    logger.info('[WHISKAY SELF] WhatsApp runtime closed.');
  })();

  return closeTask;
}
