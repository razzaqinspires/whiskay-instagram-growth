import { normalizeUserJid } from './lib/lid-manager.mjs';
import { renderCommandMenu, renderCommandCatalog, chunkCommandCatalog } from './lib/menu-renderer.mjs';
import { AntiSpamGuard } from './security/anti-spam.mjs';
import { sanitizeError } from './security/redact.mjs';
import { config, PROJECT_ROOT } from './config.mjs';
import { parseOwnerCodeRequest, executeOwnerCodeRequest, formatOwnerCodeResult, isOwnerPrivateSelfChat } from './lib/owner-code-runtime.mjs';
import { extractCommandFromInteractiveResponse } from './lib/native-flow.mjs';
import { createWhatsAppMessageRouter } from './lib/whatsapp-message-router.mjs';
import { inspectIncomingMessage, downloadMediaPayload, describeMessageMedia, unwrapMessageContent } from './lib/baileys-serializer.mjs';
import { rememberPollCreationMessage } from './lib/poll-store.mjs';
import { createRuntimeModeStore } from './lib/runtime-mode.mjs';
import { commandActionId } from './lib/native-flow.mjs';
import { commandUsageStore } from './lib/command-recommender.mjs';
import { readFile } from 'node:fs/promises';

export const runtimeModeStore = createRuntimeModeStore({
  filePath: config.commands.runtimeModeFile,
  initialMode: config.commands.mode,
  initialAllowGroups: config.commands.allowGroups
});
const PUBLIC_PRIVATE_COMMANDS = new Set(['help', 'menu', 'igservices', 'igservice']);

function buildCommandMenuSections(commands, prefix) {
  const valid = commands.filter(item => item && typeof item.name === 'string');
  const isInstagram = item => /^ig/i.test(item.name) || /instagram|growth|organic|follower|content intelligence/i.test(item.category || '');
  const isAddon = item => /academic|document review|external tools|media processing/i.test(item.category || '');
  const groups = [
    { title: 'CORE · WHATSAPP TOOLS', rows: valid.filter(item => !isInstagram(item) && !isAddon(item)) },
    { title: '━━━━━━━━ INSTAGRAM COMMANDS ━━━━━━━━', rows: valid.filter(isInstagram) },
    { title: '━━━━━━━━ DOCUMENTS & MEDIA ━━━━━━━━', rows: valid.filter(item => !isInstagram(item) && isAddon(item)) }
  ];
  const sections = [];
  for (const group of groups) {
    const items = group.rows;
    for (let offset = 0; offset < items.length; offset += 20) {
      const chunk = items.slice(offset, offset + 20);
      if (!chunk.length) continue;
      sections.push({
        title: offset ? `${group.title.slice(0, 62)} · ${Math.floor(offset / 20) + 1}` : group.title.slice(0, 80),
        rows: chunk.map(item => ({
          title: `${prefix}${item.name}`.slice(0, 80),
          description: String(item.description || item.category || '').slice(0, 120),
          id: commandActionId(`${prefix}${item.name}`)
        }))
      });
    }
  }
  return sections;
}

let antiSpamGuard;
export function getAntiSpamStats() { return getAntiSpamGuard().stats(); }

function getAntiSpamGuard() {
  if (!antiSpamGuard) {
    antiSpamGuard = new AntiSpamGuard({
      enabled: config.antiSpam.enabled,
      windowMs: config.antiSpam.windowMs,
      maxHits: config.antiSpam.maxHits,
      cooldownMs: config.antiSpam.cooldownMs,
      perMinute: config.antiSpam.commandsPerMinute,
      duplicateTtlMs: config.antiSpam.duplicateTtlMs,
      warningCooldownMs: config.antiSpam.warningCooldownMs,
      maxConcurrent: config.antiSpam.maxConcurrent
    });
  }
  return antiSpamGuard;
}

export function extractMessageText(message = {}) {
  const interactiveCommand = extractCommandFromInteractiveResponse(message);
  if (interactiveCommand) return interactiveCommand;
  const content = unwrapMessageContent(message);
  const media = describeMessageMedia(message);
  const candidates = [
    content?.conversation,
    content?.extendedTextMessage?.text,
    content?.imageMessage?.caption,
    content?.videoMessage?.caption,
    content?.ptvMessage?.caption,
    content?.documentMessage?.caption,
    content?.audioMessage?.caption,
    media?.caption
  ];
  const text = candidates.find(value => typeof value === 'string' && value.trim());
  return text ? String(text).trim() : '';
}

export function getCommandPrefixes(prefixes = config.commands.prefixes) {
  if (typeof prefixes === 'string') return [...new Set(prefixes)].sort((a, b) => b.length - a.length);
  return [...prefixes];
}

export function parseCommand(text, prefixes = getCommandPrefixes()) {
  if (typeof text !== 'string') return null;
  if (text.length > config.commands.maxMessageChars) return null;
  const trimmed = text.trimStart();
  const prefix = prefixes.find(item => trimmed.startsWith(item));
  if (!prefix) return null;
  const body = trimmed.slice(prefix.length).trim();
  if (!body) return null;
  const [commandRaw, ...args] = body.split(/\s+/);
  if (args.length > config.commands.maxCommandArgs) return null;
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(commandRaw)) return null;
  return { prefix, command: commandRaw.toLowerCase(), args, rawArgs: body.slice(commandRaw.length).trim() };
}

const PN_SERVER = 's.whatsapp.net';
const LID_SERVER = 'lid';

function candidateJids(key) {
  const values = [key.participant, key.remoteJid, key.participantAlt, key.participantPn, key.senderPn, key.remoteJidAlt, key.remoteJidPn];
  return [...new Set(values.map(normalizeUserJid).filter(Boolean))];
}

function phoneJid(value) {
  const jid = normalizeUserJid(value);
  return jid?.endsWith(`@${PN_SERVER}`) ? jid : null;
}

function jidServer(value) {
  const jid = normalizeUserJid(value);
  return jid?.slice(jid.lastIndexOf('@') + 1) || 'missing';
}

async function resolvePhoneJid(value, lidManager, sessionPn, sessionLid) {
  const jid = normalizeUserJid(value);
  if (!jid) return null;
  if (jid.endsWith(`@${PN_SERVER}`)) return jid;
  if (!jid.endsWith(`@${LID_SERVER}`)) return null;

  // The authenticated socket identity is the authoritative PN↔LID pair for
  // this process. This covers the account's own self-chat even when Baileys
  // omits remoteJidAlt on a particular message key.
  if (sessionPn && sessionLid && jid === sessionLid) return sessionPn;

  const mapped = phoneJid(await lidManager?.getPNForLID?.(jid));
  return mapped || null;
}

async function resolvePhoneJids(values, lidManager, sessionPn, sessionLid) {
  const resolved = await Promise.all(values.map(value => resolvePhoneJid(value, lidManager, sessionPn, sessionLid)));
  return [...new Set(resolved.filter(Boolean))];
}

/**
 * Return an authorization decision with a stable reason code. Phone-number
 * JIDs (@s.whatsapp.net) are canonical; LIDs are resolved to PN through the
 * authenticated socket identity or Baileys' LID mapping before comparison.
 */
export async function inspectOwnerAuthorization(key, lidManager, options = {}) {
  const ownerNumber = options.ownerNumber ?? config.whatsapp.ownerNumber;
  const ownerPn = phoneJid(`${String(ownerNumber || '').replace(/\D/g, '')}@${PN_SERVER}`);
  if (!ownerPn) return { authorized: false, reason: 'OWNER_NUMBER_MISSING' };

  const sessionPn = phoneJid(options.sessionPn);
  const sessionLidRaw = normalizeUserJid(options.sessionLid);
  const sessionLid = sessionLidRaw?.endsWith(`@${LID_SERVER}`) ? sessionLidRaw : null;
  if (sessionPn && sessionPn !== ownerPn) {
    return { authorized: false, reason: 'SESSION_OWNER_MISMATCH', sessionOwnerMatches: false };
  }

  const effectiveOwnerPn = sessionPn || ownerPn;
  const chatRaw = String(key?.remoteJid || '');
  if (chatRaw.endsWith('@g.us')) {
    const allowGroups = options.allowGroups ?? config.commands.allowGroups;
    if (!allowGroups) return { authorized: false, reason: 'GROUPS_DISABLED', sessionOwnerMatches: !sessionPn || sessionPn === ownerPn };

    const authorValues = [key.participantAlt, key.participantPn, key.senderPn, key.participant];
    const authorPns = await resolvePhoneJids(authorValues, lidManager, sessionPn, sessionLid);
    const senderMatches = key.fromMe === true
      ? Boolean(sessionPn && sessionPn === ownerPn)
      : authorPns.includes(ownerPn);
    return { authorized: senderMatches, reason: senderMatches ? 'AUTHORIZED' : 'SENDER_NOT_OWNER', sessionOwnerMatches: !sessionPn || sessionPn === ownerPn };
  }

  // In self-bot mode, `fromMe: true` means this message was sent by the
  // authenticated WhatsApp account. In a one-to-one chat, remoteJid identifies
  // the RECIPIENT, not the bot owner. Therefore it must not be compared with
  // ownerPn: doing so rejects every command the owner sends to another person.
  // The authenticated socket PN is the authority; destination PN/LID is only
  // used to route the reply. Group commands remain controlled by allowGroups.
  if (key.fromMe === true) {
    if (sessionPn) {
      return {
        authorized: sessionPn === ownerPn,
        reason: sessionPn === ownerPn ? 'AUTHORIZED_FROM_ME' : 'SESSION_OWNER_MISMATCH',
        sessionOwnerMatches: sessionPn === ownerPn
      };
    }

    // Compatibility for isolated callers/tests without a socket identity:
    // authorize only an explicitly resolved owner self-chat, never an arbitrary
    // recipient chat. Runtime handleMessage always supplies sock.user.id.
    const selfChatValues = [key.remoteJid, key.remoteJidAlt, key.remoteJidPn];
    const selfChatPns = await resolvePhoneJids(selfChatValues, lidManager, sessionPn, sessionLid);
    if (selfChatPns.includes(ownerPn)) {
      return { authorized: true, reason: 'AUTHORIZED', sessionOwnerMatches: true };
    }
    return {
      authorized: false,
      reason: 'SESSION_IDENTITY_UNAVAILABLE',
      sessionOwnerMatches: false,
      chatJidServers: [...new Set(selfChatValues.map(jidServer))]
    };
  }

  // Messages not marked fromMe can only be commands in the owner's own
  // private chat, where both sender identity and destination resolve to owner.
  const senderPns = await resolvePhoneJids(candidateJids(key), lidManager, sessionPn, sessionLid);
  if (!senderPns.includes(ownerPn)) {
    return { authorized: false, reason: 'SENDER_NOT_OWNER', sessionOwnerMatches: !sessionPn || sessionPn === ownerPn };
  }

  const chatValues = [key.remoteJid, key.remoteJidAlt, key.remoteJidPn];
  const chatPns = await resolvePhoneJids(chatValues, lidManager, sessionPn, sessionLid);
  if (!chatPns.includes(effectiveOwnerPn)) {
    return {
      authorized: false,
      reason: 'CHAT_NOT_OWNER_PN',
      sessionOwnerMatches: !sessionPn || sessionPn === ownerPn,
      chatJidServers: [...new Set(chatValues.map(jidServer))]
    };
  }

  return { authorized: true, reason: 'AUTHORIZED', sessionOwnerMatches: !sessionPn || sessionPn === ownerPn };
}

export async function isAuthorizedSelfOrOwner(key, lidManager, options = {}) {
  return (await inspectOwnerAuthorization(key, lidManager, options)).authorized;
}

export async function handleMessage(sock, msg, { lidManager, pluginLoader, logger = console, ownerNumber = config.whatsapp.ownerNumber, allowGroups = config.commands.allowGroups, modeStore = runtimeModeStore, baileys } = {}) {
  if (!msg?.message) return false;
  const key = msg.key || {};
  if (!key.remoteJid || key.remoteJid === 'status@broadcast') return false;
  const messageText = extractMessageText(msg.message);
  const ownerCodeRequest = parseOwnerCodeRequest(messageText);
  const parsed = parseCommand(messageText);
  if (!parsed && !ownerCodeRequest) return false;

  let runtimeMode = await modeStore.get();
  if (modeStore === runtimeModeStore && runtimeMode.updatedAt === null) runtimeMode = { ...runtimeMode, allowGroups };
  const isGroup = String(key.remoteJid).endsWith('@g.us');
  const modeCommand = parsed?.command === 'mode';
  const logCommand = parsed?.command || ownerCodeRequest?.runtime || 'unknown';
  logger.info?.({ command: logCommand, fromMe: Boolean(key.fromMe), mode: runtimeMode.mode }, '[COMMAND] Incoming command');

  let authorization;
  if (ownerCodeRequest || modeCommand || runtimeMode.mode === 'self') {
    authorization = await inspectOwnerAuthorization(key, lidManager, {
      ownerNumber,
      allowGroups: !ownerCodeRequest && runtimeMode.mode === 'self' && runtimeMode.allowGroups,
      sessionPn: sock?.user?.id,
      sessionLid: sock?.user?.lid
    });
  } else {
    // Public mode is deliberately restricted to direct chats and a tiny,
    // read-only allowlist. It never opens group commands to all participants.
    const privateJid = /@(s\.whatsapp\.net|lid)$/.test(String(key.remoteJid));
    authorization = {
      authorized: !isGroup && privateJid && PUBLIC_PRIVATE_COMMANDS.has(parsed.command),
      reason: isGroup ? 'PUBLIC_GROUPS_DISABLED' : 'PUBLIC_COMMAND_NOT_ALLOWED'
    };
  }

  if (authorization.authorized && ownerCodeRequest) {
    const ownerSelfChat = await isOwnerPrivateSelfChat({
      key,
      lidManager,
      ownerNumber,
      sessionPn: sock?.user?.id,
      sessionLid: sock?.user?.lid
    });
    if (!ownerSelfChat) authorization = { authorized: false, reason: 'OWNER_CODE_REQUIRES_PRIVATE_SELF_CHAT' };
  }

  if (!authorization.authorized) {
    logger.warn?.({
      command: logCommand,
      fromMe: Boolean(key.fromMe),
      mode: runtimeMode.mode,
      reason: authorization.reason,
      sessionOwnerMatches: authorization.sessionOwnerMatches,
      chatJidServers: authorization.chatJidServers
    }, '[COMMAND] Ignored: authorization policy rejected message');
    return false;
  }
  if (isGroup && (runtimeMode.mode !== 'self' || !runtimeMode.allowGroups)) return false;

  const reply = async text => sock.sendMessage(key.remoteJid, { text: String(text).slice(0, 4000) }, { quoted: msg });
  const messageInfo = inspectIncomingMessage(msg);
  const messageRouter = createWhatsAppMessageRouter({
    sock,
    jid: key.remoteJid,
    quoted: msg,
    reply,
    rememberPoll: rememberPollCreationMessage,
    baileys
  });
  const {
    send, sendInteractive, sendNativeButtons, sendCarousel, sendRichCard, sendAIRich,
    sendTemplateButtons: sendTemplate, sendPoll, sendMedia, sendContact, sendLocation, sendProduct, sendEvent
  } = messageRouter;
  const downloadMedia = async ({ quoted = false, maxBytes, descriptor: explicitDescriptor } = {}) => {
    const descriptor = explicitDescriptor || (quoted ? messageInfo.quotedMedia : messageInfo.media);
    if (!descriptor) throw new Error(quoted ? 'Pesan kutipan tidak memiliki media.' : 'Pesan ini tidak memiliki lampiran media.');
    return downloadMediaPayload(descriptor, { maxBytes });
  };
  const sender = key.participant || key.remoteJid;
  const antiSpamCommandKey = ownerCodeRequest
    ? `owner-code:${ownerCodeRequest.runtime}`
    : parsed.command === 'mode' ? `mode:${parsed.args.join(':') || 'status'}` : parsed.command;
  const gate = getAntiSpamGuard().check({ sender, command: antiSpamCommandKey, messageId: key.id });
  if (!gate.allowed) {
    if (gate.warn) {
      const notice = gate.reason === 'DUPLICATE_MESSAGE'
        ? 'Pesan duplikat diabaikan.'
        : `Anti-spam aktif (${gate.reason}). Tunggu ${Math.max(1, Math.ceil(gate.retryAfterMs / 1000))} detik sebelum mengirim command lagi.`;
      await reply(notice);
    }
    return false;
  }
  const context = {
    sock, msg, key, lidManager, pluginLoader, command: parsed?.command || ownerCodeRequest?.runtime, prefix: parsed?.prefix || ownerCodeRequest?.prefix, args: parsed?.args || [], rawArgs: parsed?.rawArgs || ownerCodeRequest?.source,
    reply, send, sendInteractive, sendNativeButtons, sendCarousel, sendRichCard, sendAIRich, sendTemplateButtons: sendTemplate, sendLegacyButtonMessage: messageRouter.sendLegacyButtonMessage,
    sendPoll, sendMedia, sendContact, sendLocation, sendProduct, sendEvent, downloadMedia, messageInfo, isPollUpdate: messageInfo.isPollUpdate,
    pollUpdate: messageInfo.pollUpdate, pollCreationMessageKey: messageInfo.pollCreationMessageKey, logger, runtimeMode
  };
  try {
    if (ownerCodeRequest) {
      if (!config.ownerCode.enabled) {
        await reply('Owner runtime sedang dinonaktifkan melalui config/app.json ownerCode.enabled.');
        return true;
      }
      const result = await executeOwnerCodeRequest(ownerCodeRequest, {
        config: config.ownerCode,
        projectRoot: PROJECT_ROOT,
        context: { ...context, config }
      });
      await reply(formatOwnerCodeResult(ownerCodeRequest, result));
      logger.info?.({ runtime: ownerCodeRequest.runtime, ok: result.ok, durationMs: result.durationMs }, '[OWNER RUNTIME] Execution completed');
      return true;
    }

    if (parsed.command === 'mode') {
      await commandUsageStore.recordHit('mode').catch(error => logger.warn?.('[COMMAND] hit counter write failed:', error.message));
      const action = String(parsed.args[0] || 'status').toLowerCase();
      if (action === 'status') {
        const state = await modeStore.get();
        await reply([
          '━━ WHISKAY ACCESS MODE ━━',
          `Mode: ${state.mode.toUpperCase()}`,
          `Group access: ${state.mode === 'self' && state.allowGroups ? 'ON (owner only)' : 'OFF'}`,
          state.mode === 'self' ? 'Self mode: hanya owner yang dapat menjalankan command.' : 'Public mode: hanya private chat dan command read-only yang diizinkan.',
          '',
          'Perintah:',
          '.mode self',
          '.mode public',
          '.mode groups on|off'
        ].join('\n'));
        return true;
      }
      if (action === 'self' || action === 'public') {
        const state = await modeStore.update({ mode: action });
        await reply(`Mode berhasil diubah: ${state.mode.toUpperCase()}\nGroup access: ${state.mode === 'self' && state.allowGroups ? 'ON (owner only)' : 'OFF'}.`);
        return true;
      }
      if (action === 'groups') {
        const value = String(parsed.args[1] || '').toLowerCase();
        if (!['on', 'off'].includes(value) || parsed.args.length !== 2) {
          await reply('Format: .mode groups on|off');
          return true;
        }
        const state = await modeStore.update({ allowGroups: value === 'on' });
        await reply(`Group access: ${state.allowGroups ? 'ON' : 'OFF'}\nEfektif hanya saat mode SELF; semua peserta tetap tidak dapat menggunakan command, hanya owner.`);
        return true;
      }
      await reply('Format: .mode [status|self|public|groups on|off]');
      return true;
    }

    if (parsed.command === 'menu') {
      await commandUsageStore.recordHit('menu').catch(error => logger.warn?.('[COMMAND] hit counter write failed:', error.message));
      let commands = pluginLoader?.listCommands?.() || [];
      if (runtimeMode.mode === 'public') commands = commands.filter(item => PUBLIC_PRIVATE_COMMANDS.has(item.name));
      const recommendations = await commandUsageStore.rank(commands, { limit: 10 });
      await commandUsageStore.recordExposure(recommendations.map(item => item.name));
      const rows = recommendations.map(item => ({
        title: `${parsed.prefix}${item.name}`.slice(0, 80),
        description: `${item.totalHits} hit · ${item.recommendationPercent.toFixed(1)}% rekomendasi · ${item.category}`.slice(0, 120),
        id: commandActionId(`${parsed.prefix}${item.name}`)
      }));
      const catalog = renderCommandCatalog(commands, { prefix: parsed.prefix });
      const pushName = String(msg.pushName || msg.verifiedBizName || 'kamu').trim().slice(0, 50);
      const channelUrl = 'https://whatsapp.com/channel/0029Vb8vHDB5PO0v7xAQL33e';
      let channelThumbnail = null;
      try { channelThumbnail = await readFile(new URL('../assets/whiskay-channel-preview.jpg', import.meta.url)); } catch {}
      const externalAdReply = {
        title: 'Saluran WhatsApp WHISKAY',
        body: 'Info pembaruan, rilis, dan pengumuman WHISKAY.',
        sourceUrl: channelUrl,
        mediaType: 1,
        renderLargerThumbnail: true,
        showAdAttribution: false,
        ...(channelThumbnail ? { jpegThumbnail: channelThumbnail } : {})
      };
      const thumbnailUrl = process.env.WHISKAY_CHANNEL_THUMBNAIL_URL;
      if (thumbnailUrl) {
        try {
          const parsedThumb = new URL(thumbnailUrl);
          if (parsedThumb.protocol === 'https:' && !parsedThumb.username && !parsedThumb.password) externalAdReply.thumbnailUrl = parsedThumb.toString();
        } catch {}
      }
      const menuIntro = `Halo ${pushName}. Ada ${commands.length} command aktif pada registry ini. Menu menampilkan 10 rekomendasi berdasarkan hit aktual, tren 7 hari, kebaruan, pemerataan kategori, dan rotasi command yang jarang digunakan.`;
      // Native Flow body stays deliberately short. When the full directory fits,
      // show it in the same menu body; otherwise send the complete catalogue as
      // bounded ordinary-text messages after the interactive menu.
      const inlineBody = `${menuIntro}\n\n${catalog}`;
      const includeCatalogInline = inlineBody.length <= 900;
      await sendInteractive({
        title: 'WHISKAY · MENU UTAMA',
        subtitle: 'Mixed Native Flow · 3 jenis tindakan',
        body: includeCatalogInline
          ? inlineBody
          : `${menuIntro}\n\nDaftar lengkap command, alias, penggunaan, dan deskripsi dikirim setelah menu agar body Native Flow tetap ringkas.`,
        footer: 'WHISKAY · Command Discovery Engine · Katalog lengkap',
        contextInfo: { externalAdReply },
        buttons: [
          { type: 'quick_reply', title: 'Profile', id: commandActionId(`${parsed.prefix}profile`) },
          { type: 'webview_url', title: 'Saluran WHISKAY', url: channelUrl, webview_interaction: true },
          { type: 'single_select', title: '10 Rekomendasi', listTitle: 'Command rekomendasi', sections: [{ title: 'Personalized command picks', rows }] }
        ]
      });
      if (!includeCatalogInline) {
        const chunks = chunkCommandCatalog(catalog, 3500);
        for (let index = 0; index < chunks.length; index += 1) {
          const heading = `KATALOG COMMAND · ${index + 1}/${chunks.length}\n`;
          await reply(`${heading}${chunks[index]}`);
        }
      }
      return true;
    }

    if (parsed.command === 'help') {
      await commandUsageStore.recordHit('help').catch(error => logger.warn?.('[COMMAND] hit counter write failed:', error.message));
      let commands = pluginLoader?.listCommands?.() || [];
      if (runtimeMode.mode === 'public') commands = commands.filter(item => PUBLIC_PRIVATE_COMMANDS.has(item.name));
      else commands = [...commands, { name: 'mode', aliases: [], description: 'Atur mode self/public dan akses grup owner-only', category: 'Runtime Access', usage: 'status|self|public|groups on|off' }];
      const menu = renderCommandMenu(commands, { prefix: parsed.prefix, prefixes: getCommandPrefixes() });
      const sections = buildCommandMenuSections(commands, parsed.prefix);
      if (sections.length > 0 && sections.length <= 10) {
        const rows = sections.reduce((count, section) => count + section.rows.length, 0);
        await sendInteractive({
          title: 'WHISKAY COMMAND DIRECTORY',
          body: `Daftar lengkap ${rows} command aktif. Instagram dipisahkan ke section tersendiri. Gunakan .menu untuk menu Mixed dengan rekomendasi dinamis.`,
          footer: 'Single Select · Command Directory',
          buttons: [{ type: 'single_select', title: 'Browse all commands', sections }]
        });
      } else {
        await reply(menu);
      }
      return true;
    }
    const result = await pluginLoader?.execute(parsed.command, context);
    if (!result?.found) await reply(`Command tidak dikenal: ${parsed.prefix}${parsed.command}\nKetik ${parsed.prefix}help untuk daftar command.`);
    else {
      const canonical = (pluginLoader?.listCommands?.() || []).find(item => item.name === parsed.command || item.aliases?.includes(parsed.command))?.name || parsed.command;
      await commandUsageStore.recordHit(canonical).catch(error => logger.warn?.('[COMMAND] hit counter write failed:', error.message));
    }
    return Boolean(result?.found);
  } catch (error) {
    logger.error?.(`[COMMAND] ${parsed?.command || ownerCodeRequest?.runtime || 'unknown'}:`, sanitizeError(error));
    await reply(`Command error: ${sanitizeError(error).message}`);
    return false;
  } finally {
    gate.release?.();
  }
}
