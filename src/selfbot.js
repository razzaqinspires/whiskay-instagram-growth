import makeWASocket, {
  Browsers,
  DisconnectReason,
  useMultiFileAuthState
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { attachLidManager } from './lib/lid-manager.js';

const phoneNumber = (process.env.WA_PAIRING_NUMBER || '').replace(/\D/g, '');
const sessionDir = process.env.WA_SESSION_DIR || './session/self';
const syncFullHistory = process.env.WA_SYNC_FULL_HISTORY === 'true';
const logger = pino({ level: process.env.LOG_LEVEL || 'silent' });

let reconnectTimer = null;
let shuttingDown = false;

async function startSocket() {
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  if (!state.creds.registered && !phoneNumber) {
    throw new Error('WA_PAIRING_NUMBER wajib diisi saat pairing pertama. Gunakan nomor akun WhatsApp yang sama.');
  }

  const sock = makeWASocket({
    auth: state,
    browser: Browsers.windows('Chrome'),
    logger,
    markOnlineOnConnect: false,
    syncFullHistory
  });

  sock.ev.on('creds.update', saveCreds);
  const lidManager = await attachLidManager(sock, {
    file: process.env.LID_MAP_FILE || './data/lid-map.json',
    logger
  });

  let pairingRequested = false;

  sock.ev.on('connection.update', async ({ connection, qr, lastDisconnect }) => {
    if (qr && !state.creds.registered && !pairingRequested) {
      pairingRequested = true;
      try {
        const code = await sock.requestPairingCode(phoneNumber);
        console.log('\n=== WHATSAPP PAIRING CODE ===');
        console.log(code);
        console.log('Masukkan di WhatsApp: Perangkat tertaut > Tautkan perangkat > Tautkan dengan nomor telepon.');
        console.log('Gunakan akun/nomor yang sama dengan WA_PAIRING_NUMBER.\n');
      } catch (error) {
        console.error('[PAIRING] Gagal meminta pairing code:', error.message);
        console.error('[PAIRING] Jangan meminta berulang kali; periksa nomor/koneksi dan coba lagi nanti.');
      }
    }

    if (connection === 'open') {
      console.log('[WHISKAY SELF] Connected.');
      console.log(`[LID] local mapping cache: ${lidManager ? 'ready' : 'unavailable'}`);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.error('[WHISKAY SELF] Connection closed:', statusCode ?? 'unknown');

      if (shuttingDown || statusCode === DisconnectReason.loggedOut) {
        console.error('[WHISKAY SELF] Session logged out or shutdown requested; no automatic re-pair.');
        return;
      }

      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          startSocket().catch(error => console.error('[WHISKAY SELF] Reconnect failed:', error));
        }, 3000);
      }
    }
  });

  // Self-bot note:
  // Do NOT discard `message.key.fromMe === true` if your command system is
  // supposed to accept commands typed by you from the primary WhatsApp phone.
  // Keep key.remoteJid unchanged when replying; it may legitimately be @lid.
  sock.ev.on('messages.upsert', ({ messages = [], type } = {}) => {
    for (const message of messages) {
      if (!message?.message) continue;
      const key = message.key || {};
      const chatJid = key.remoteJid;
      const senderJid = key.participant || key.remoteJid;

      // Hook this into your existing Whiskay command handler.
      // Do not force @lid to @s.whatsapp.net here.
      if (key.fromMe) {
        logger.debug({ type, chatJid, senderJid }, 'self message received');
      }
    }
  });

  return sock;
}

process.once('SIGINT', () => {
  shuttingDown = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  console.log('\n[WHISKAY SELF] Shutdown requested.');
  process.exit(0);
});

process.once('SIGTERM', () => {
  shuttingDown = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  process.exit(0);
});

startSocket().catch(error => {
  console.error('[WHISKAY SELF] Startup failed:', error);
  process.exitCode = 1;
});
