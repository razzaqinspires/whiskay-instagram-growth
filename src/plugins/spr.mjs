import { config } from '../config.mjs';
import { normalizeUserJid } from '../lib/lid-manager.mjs';
import { sprMessageStore } from '../lib/spr-message-store.mjs';

const MAX_TEXT = 1500;
const GROUP_JID_RE = /^\d[\d-]{4,40}@g\.us$/;

function ownerNumber(value) {
  return String(value || '').replace(/\D/g, '');
}

function isOwnerMessage({ key, sock }) {
  if (key?.fromMe !== true) return false;
  const configured = ownerNumber(config.whatsapp?.ownerNumber);
  const session = normalizeUserJid(sock?.whiskayIdentity?.pn || sock?.user?.id || '');
  return Boolean(configured && session?.endsWith('@s.whatsapp.net') &&
    ownerNumber(session) === configured);
}

function contextInfo(msg) {
  const message = msg?.message || {};
  const node = message.extendedTextMessage || message.imageMessage ||
    message.videoMessage || message.documentMessage || {};
  return node.contextInfo || {};
}

function parsePipeInput(raw) {
  const parts = String(raw || '').split('|').map(part => part.trim());
  if (parts.length >= 3) {
    const groupJid = parts.slice(2).join('|').trim();
    return { target: parts[0], text: parts[1], groupJid };
  }
  if (parts.length === 2) return { target: parts[0], text: parts[1], groupJid: null };
  return null;
}

function formatHelp() {
  return [
    'WHISKAY · SEND PRIVATE RELAY',
    '',
    '.spr <pesan> — reply pesan target di grup.',
    '.spr @mention | <pesan> — target berdasarkan mention.',
    '.spr nomor | <pesan> | <id_grup> — cari pesan terakhir target di grup.',
    '.spr2 nomor | <pesan> | <id_grup> — mode relay privat alternatif.',
    '.sprstatus — statistik penyimpanan pesan sementara.',
    '.sprclear — bersihkan indeks pesan sementara.',
    '.sprdmsg <messageId> CONFIRM — minta penghapusan pesan SPR milik bot yang tercatat.',
    '',
    'Catatan: SPR WHISKAY mengirim DM WhatsApp normal kepada target.',
    'Tidak menggunakan manipulasi stanzaId untuk menyamarkan pesan grup.',
    'DMSG hanya dapat menghapus pesan keluar milik bot yang tercatat; tidak menghapus riwayat target.'
  ].join('\n');
}

function safeText(value) {
  const text = String(value || '').trim();
  if (!text) throw new TypeError('Isi pesan wajib diisi.');
  if (text.length > MAX_TEXT) throw new RangeError(`Isi pesan maksimal ${MAX_TEXT} karakter.`);
  return text;
}

async function resolveTargetJid(target, record, lidManager) {
  const raw = String(target || '').trim();
  const direct = normalizeUserJid(raw) || (/^\+?\d{7,15}$/.test(raw) ? `${raw.replace(/\D/g, '')}@s.whatsapp.net` : null);
  const candidates = [record?.senderAlt, record?.senderJid, direct]
    .map(normalizeUserJid)
    .filter(Boolean);
  const pn = candidates.find(jid => jid.endsWith('@s.whatsapp.net'));
  if (pn) return pn;
  for (const jid of candidates.filter(value => value.endsWith('@lid'))) {
    const mapped = normalizeUserJid(await lidManager?.getPNForLID?.(jid));
    if (mapped?.endsWith('@s.whatsapp.net')) return mapped;
  }
  return candidates.find(jid => jid.endsWith('@lid')) || null;
}

async function resolveRequest({ command, rawArgs, msg, lidManager }) {
  const currentChat = normalizeUserJid(msg?.key?.remoteJid) || String(msg?.key?.remoteJid || '');
  const parsed = parsePipeInput(rawArgs);
  const mentions = contextInfo(msg).mentionedJid || [];

  if (parsed?.groupJid && parsed.text) {
    const groupJid = parsed.groupJid;
    if (!GROUP_JID_RE.test(groupJid)) throw new TypeError('ID grup tidak valid. Gunakan ID berakhiran @g.us.');
    const record = sprMessageStore.getLatest(parsed.target, groupJid);
    if (!record) throw new Error(`Pesan target tidak ditemukan di indeks grup ${groupJid}. Target harus pernah mengirim pesan saat WHISKAY online.`);
    const jid = await resolveTargetJid(parsed.target, record, lidManager);
    return { jid, text: safeText(parsed.text), record, groupJid, mode: command };
  }

  if (parsed?.text && mentions.length) {
    const targetJid = normalizeUserJid(mentions[0]);
    const record = sprMessageStore.getLatest(targetJid, currentChat);
    if (!record) throw new Error('Pesan terakhir target tidak ditemukan di chat ini. Pastikan target sudah mengirim pesan setelah SPR store aktif.');
    const jid = await resolveTargetJid(targetJid, record, lidManager);
    return { jid, text: safeText(parsed.text), record, groupJid: currentChat, mode: command };
  }

  if (parsed?.text && parsed.target) {
    const record = sprMessageStore.getLatest(parsed.target, currentChat);
    if (!record) throw new Error('Pesan terakhir target tidak ditemukan di chat ini. Gunakan format nomor | pesan | id_grup jika target berada di grup lain.');
    const jid = await resolveTargetJid(parsed.target, record, lidManager);
    return { jid, text: safeText(parsed.text), record, groupJid: currentChat, mode: command };
  }

  const quoted = contextInfo(msg);
  const stanzaId = String(quoted.stanzaId || '').trim();
  if (!stanzaId) throw new Error('Reply pesan target terlebih dahulu, atau gunakan format nomor | pesan | id_grup.');
  const quotedParticipant = normalizeUserJid(quoted.participant || quoted.participantAlt || '');
  const directChat = normalizeUserJid(msg?.key?.remoteJid || '');
  const isGroupChat = String(msg?.key?.remoteJid || '').endsWith('@g.us');
  const targetIdentity = quotedParticipant || (!isGroupChat ? directChat : null);
  const record = targetIdentity ? sprMessageStore.getLatest(targetIdentity, currentChat) : null;
  const jid = await resolveTargetJid(targetIdentity, record || { senderJid: targetIdentity }, lidManager);
  if (!jid) throw new Error('Identitas pengirim pesan yang direply tidak dapat dipetakan ke PN/LID.');
  return { jid, text: safeText(rawArgs), record, groupJid: currentChat, stanzaId, mode: command };
}

function isSelfTarget(jid, sock) {
  const session = normalizeUserJid(sock?.whiskayIdentity?.pn || sock?.user?.id || '');
  const target = normalizeUserJid(jid);
  return Boolean(session && target && session === target);
}

async function sendPrivateRelay({ sock, reply, key, msg, rawArgs, command, lidManager }) {
  if (!isOwnerMessage({ key, sock })) return reply('SPR ditolak: fitur ini hanya dapat digunakan dari akun owner WHISKAY.');
  const request = await resolveRequest({ command, rawArgs, msg, lidManager });
  if (!request.jid || !request.jid.endsWith('@s.whatsapp.net') && !request.jid.endsWith('@lid')) {
    throw new Error('JID target tidak valid.');
  }
  if (isSelfTarget(request.jid, sock)) throw new Error('Target tidak boleh akun bot sendiri.');

  const sent = await sock.sendMessage(request.jid, { text: request.text });
  const sentId = sent?.key?.id;
  if (sentId) sprMessageStore.recordOutbound({
    id: sentId,
    chatJid: request.jid,
    senderJid: sock?.whiskayIdentity?.pn || sock?.user?.id,
    mode: request.mode
  });

  await reply([
    'SPR · PRIVATE DELIVERY QUEUED',
    `Mode: ${request.mode.toUpperCase()}`,
    `Target: ${request.jid}`,
    `Source: ${request.groupJid || 'reply context'}`,
    `Message ID: ${sentId || 'not returned'}`,
    'Transport: direct private WhatsApp message',
    'Privacy: not a hidden group message; recipient receives a normal DM.'
  ].join('\n'));
}

export default {
  name: 'spr',
  commands: [
    {
      name: 'spr',
      category: 'WhatsApp Interfaces',
      usage: '<reply text> | <mention> | <number> | <groupJid>',
      description: 'Kirim pesan privat normal ke pengirim pesan yang direply/mention atau target terindeks di grup',
      async execute(context) {
        try {
          await sendPrivateRelay({ ...context, command: 'spr' });
        } catch (error) {
          await context.reply(`SPR gagal: ${error.message}\n\n${formatHelp()}`);
        }
      }
    },
    {
      name: 'spr2',
      category: 'WhatsApp Interfaces',
      usage: '<number> | <text> | <groupJid>',
      description: 'Mode relay privat alternatif menggunakan indeks pesan grup; pengiriman DM normal',
      async execute(context) {
        try {
          await sendPrivateRelay({ ...context, command: 'spr2' });
        } catch (error) {
          await context.reply(`SPR2 gagal: ${error.message}\n\n${formatHelp()}`);
        }
      }
    },
    {
      name: 'sprstatus',
      aliases: ['sprinfo'],
      category: 'WhatsApp Interfaces',
      usage: '',
      description: 'Lihat jumlah indeks pesan dan pesan SPR keluar yang masih tercatat',
      async execute({ key, sock, reply }) {
        if (!isOwnerMessage({ key, sock })) return reply('SPR status hanya dapat dilihat owner.');
        const stats = sprMessageStore.stats();
        return reply([
          'SPR · STORE STATUS',
          `Incoming message index: ${stats.messages}`,
          `Tracked outgoing SPR: ${stats.outbound}`,
          `TTL: ${Math.round(stats.ttlMs / 3600000)} jam`,
          `Maximum index: ${stats.maxRecords}`,
          'Payload pesan tidak disimpan; hanya JID, stanza ID, dan timestamp.'
        ].join('\n'));
      }
    },
    {
      name: 'sprclear',
      category: 'WhatsApp Interfaces',
      usage: '',
      description: 'Bersihkan indeks pesan masuk sementara SPR',
      async execute({ key, sock, reply }) {
        if (!isOwnerMessage({ key, sock })) return reply('SPR clear hanya dapat digunakan owner.');
        const count = sprMessageStore.clearMessages();
        return reply(`SPR store dibersihkan. ${count} indeks pesan dihapus dari memori.`);
      }
    },
    {
      name: 'sprdmsg',
      aliases: ['sprdelete'],
      category: 'WhatsApp Interfaces',
      usage: '<messageId> CONFIRM',
      description: 'Minta penghapusan satu pesan SPR milik bot yang tercatat; tidak menghapus pesan target',
      async execute({ args = [], key, sock, reply }) {
        if (!isOwnerMessage({ key, sock })) return reply('SPR DMSG hanya dapat digunakan owner.');
        const id = String(args[0] || '').trim();
        if (!id || String(args[1] || '').toUpperCase() !== 'CONFIRM') {
          return reply('Format: .sprdmsg <messageId> CONFIRM\\nPerintah ini hanya menghapus pesan SPR milik bot yang tercatat.');
        }
        const record = sprMessageStore.getOutbound(id);
        if (!record) return reply('Message ID tidak ditemukan atau sudah kedaluwarsa. Hanya pesan SPR milik bot yang tercatat yang dapat dihapus.');
        const result = await sock.sendMessage(record.chatJid, {
          delete: { remoteJid: record.chatJid, id: record.id, fromMe: true }
        });
        return reply(`Permintaan penghapusan pesan SPR ${id} telah dikirim ke WhatsApp. Hasil akhir bergantung pada dukungan dan kebijakan WhatsApp.`);
      }
    }
  ]
};
