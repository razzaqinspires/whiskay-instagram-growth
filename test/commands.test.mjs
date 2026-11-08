import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, getCommandPrefixes, extractMessageText, isAuthorizedSelfOrOwner, inspectOwnerAuthorization, handleMessage } from '../src/commands.mjs';

test('interactive responses are converted to command text', () => {
  assert.equal(extractMessageText({ interactiveResponseMessage: { nativeFlowResponseMessage: { paramsJson: JSON.stringify({ id: 'wsk:cmd:.igstats' }) } } }), '.igstats');
  assert.equal(extractMessageText({ listResponseMessage: { singleSelectReply: { selectedRowId: 'wsk:cmd:.igcampaign list' } } }), '.igcampaign list');
});

test('multi-prefix parser handles configured prefixes', () => {
  const prefixes = getCommandPrefixes(['!', '.', '#', '/']);
  assert.equal(parseCommand('.igpanel', prefixes).command, 'igpanel');
  assert.equal(parseCommand('hello', prefixes), null);
});

test('extracts command text from wrapped image, video, PTV and document captions', () => {
  assert.equal(extractMessageText({ ephemeralMessage: { message: { imageMessage: { caption: '.igpanel' } } } }), '.igpanel');
  assert.equal(extractMessageText({ videoMessage: { caption: '.remini sharp' } }), '.remini sharp');
  assert.equal(extractMessageText({ ptvMessage: { caption: '.remini inspect' } }), '.remini inspect');
  assert.equal(extractMessageText({ documentWithCaptionMessage: { message: { message: { documentMessage: { caption: '.acad help' } } } } }), '.acad help');
});

test('menu command is parsed with its actual prefix and arguments', () => {
  const parsed = parseCommand('!menu now', getCommandPrefixes(['!', '.']));
  assert.equal(parsed.prefix, '!');
  assert.equal(parsed.command, 'menu');
  assert.deepEqual(parsed.args, ['now']);
});

test('self-bot authorization accepts only owner identity in owner private chat', async () => {
  const options = { ownerNumber: '6281234567890', allowGroups: false };
  assert.equal(await isAuthorizedSelfOrOwner({ remoteJid: '6281234567890@s.whatsapp.net' }, null, options), true);
  assert.equal(await isAuthorizedSelfOrOwner({ remoteJid: '6289999999999@s.whatsapp.net', participant: '6281234567890@s.whatsapp.net' }, null, options), false);
  assert.equal(await isAuthorizedSelfOrOwner({ remoteJid: '6289999999999@s.whatsapp.net' }, null, options), false);
  assert.equal(await isAuthorizedSelfOrOwner({ remoteJid: '12345-678@g.us', participant: '6281234567890@s.whatsapp.net' }, null, options), false);
  assert.equal(await isAuthorizedSelfOrOwner({ remoteJid: '12345-678@g.us', participant: '6281234567890@s.whatsapp.net' }, null, { ...options, allowGroups: true }), true);
});



test('self-bot authorizes owner commands sent to another private chat using authenticated session PN', async () => {
  const options = {
    ownerNumber: '6281234567890',
    allowGroups: false,
    sessionPn: '6281234567890:4@s.whatsapp.net',
    sessionLid: '59206778490968:4@lid'
  };
  const key = {
    fromMe: true,
    remoteJid: '6289999999999@s.whatsapp.net',
    remoteJidAlt: '59206778490969@lid'
  };
  const decision = await inspectOwnerAuthorization(key, null, options);
  assert.deepEqual(decision, { authorized: true, reason: 'AUTHORIZED_FROM_ME', sessionOwnerMatches: true });
});

test('self-bot authorizes owner command to another private LID chat and replies to that LID', async () => {
  const options = {
    ownerNumber: '6281234567890',
    allowGroups: false,
    sessionPn: '6281234567890:4@s.whatsapp.net',
    sessionLid: '59206778490968:4@lid'
  };
  const decision = await inspectOwnerAuthorization({
    fromMe: true,
    remoteJid: '78123456789012@lid',
    remoteJidAlt: '6289999999999@s.whatsapp.net'
  }, null, options);
  assert.equal(decision.authorized, true);
  assert.equal(decision.reason, 'AUTHORIZED_FROM_ME');

  const sent = [];
  const sock = {
    user: { id: options.sessionPn, lid: options.sessionLid },
    sendMessage: async (jid, payload) => { sent.push({ jid, payload }); }
  };
  const handled = await handleMessage(sock, {
    key: { id: 'TEST-MENU-TO-OTHER-LID', fromMe: true, remoteJid: '78123456789012@lid', remoteJidAlt: '6289999999999@s.whatsapp.net' },
    message: { conversation: '.menu' }
  }, {
    lidManager: null,
    pluginLoader: { listCommands: () => [] },
    logger: { info() {}, warn() {}, error() {} },
    ownerNumber: '6281234567890',
    allowGroups: false
  });
  assert.equal(handled, true);
  assert.equal(sent[0].jid, '78123456789012@lid');
});

test('self-bot rejects commands from a different authenticated session even when fromMe is true', async () => {
  const decision = await inspectOwnerAuthorization({
    fromMe: true,
    remoteJid: '6289999999999@s.whatsapp.net'
  }, null, {
    ownerNumber: '6281234567890',
    allowGroups: false,
    sessionPn: '6289999999999@s.whatsapp.net'
  });
  assert.equal(decision.authorized, false);
  assert.equal(decision.reason, 'SESSION_OWNER_MISMATCH');
});

test('handleMessage replies in the recipient private chat for owner fromMe commands', async () => {
  const sent = [];
  const sock = {
    user: { id: '6281234567890:4@s.whatsapp.net', lid: '59206778490968:4@lid' },
    sendMessage: async (jid, payload) => { sent.push({ jid, payload }); }
  };
  const pluginLoader = { listCommands: () => [] };
  const msg = {
    key: { id: 'TEST-MENU-TO-OTHER', fromMe: true, remoteJid: '6289999999999@s.whatsapp.net' },
    message: { conversation: '.menu' }
  };
  const handled = await handleMessage(sock, msg, {
    lidManager: null,
    pluginLoader,
    logger: { info() {}, warn() {}, error() {} },
    ownerNumber: '6281234567890',
    allowGroups: false
  });
  assert.equal(handled, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].jid, '6289999999999@s.whatsapp.net');
});

test('self-bot accepts owner self-chat when remoteJid is LID and remoteJidAlt is owner PN', async () => {
  const options = { ownerNumber: '6281234567890', allowGroups: false };
  const key = {
    fromMe: true,
    remoteJid: '59206778490968:4@lid',
    remoteJidAlt: '6281234567890:4@s.whatsapp.net'
  };
  assert.equal(await isAuthorizedSelfOrOwner(key, null, options), true);
});

test('self-bot does not infer owner identity from a recipient alternate JID without socket identity', async () => {
  const options = { ownerNumber: '6281234567890', allowGroups: false };
  const key = {
    fromMe: true,
    remoteJid: '59206778490968:4@lid',
    remoteJidAlt: '6289999999999:4@s.whatsapp.net'
  };
  assert.equal(await isAuthorizedSelfOrOwner(key, null, options), false);
});



test('self-bot resolves the socket own LID to its canonical @s.whatsapp.net PN', async () => {
  const options = {
    ownerNumber: '6281234567890',
    allowGroups: false,
    sessionPn: '6281234567890:4@s.whatsapp.net',
    sessionLid: '59206778490968:4@lid'
  };
  const decision = await inspectOwnerAuthorization({
    fromMe: true,
    remoteJid: '59206778490968:4@lid'
  }, null, options);
  assert.deepEqual(decision, { authorized: true, reason: 'AUTHORIZED_FROM_ME', sessionOwnerMatches: true });
});

test('self-bot rejects a session whose logged-in phone JID differs from configured owner PN', async () => {
  const decision = await inspectOwnerAuthorization({
    fromMe: true,
    remoteJid: '59206778490968@lid',
    remoteJidAlt: '6281234567890@s.whatsapp.net'
  }, null, {
    ownerNumber: '6281234567890',
    sessionPn: '6289999999999@s.whatsapp.net',
    sessionLid: '59206778490968@lid'
  });
  assert.deepEqual(decision, { authorized: false, reason: 'SESSION_OWNER_MISMATCH', sessionOwnerMatches: false });
});

test('self-bot uses only a PN-resolved destination and rejects another account chat', async () => {
  const lidManager = {
    getPNForLID: async jid => jid === '59206778490968@lid' ? '6281234567890@s.whatsapp.net' : '6289999999999@s.whatsapp.net'
  };
  const options = { ownerNumber: '6281234567890', allowGroups: false };
  assert.equal(await isAuthorizedSelfOrOwner({ fromMe: true, remoteJid: '59206778490968@lid' }, lidManager, options), true);
  assert.equal(await isAuthorizedSelfOrOwner({ fromMe: true, remoteJid: '59206778490969@lid' }, lidManager, options), false);
});

test('handleMessage uses the authenticated socket PN and own LID for owner self-chat', async () => {
  const sent = [];
  const sock = {
    user: { id: '6281234567890:4@s.whatsapp.net', lid: '59206778490001:4@lid' },
    sendMessage: async (jid, payload) => { sent.push({ jid, payload }); }
  };
  const pluginLoader = { listCommands: () => [] };
  const msg = {
    key: { id: 'TEST-MENU-SESSION-PN', fromMe: true, remoteJid: '59206778490001:4@lid' },
    message: { conversation: '.menu' }
  };
  const handled = await handleMessage(sock, msg, {
    lidManager: null,
    pluginLoader,
    logger: { info() {}, warn() {}, error() {} },
    ownerNumber: '6281234567890',
    allowGroups: false
  });
  assert.equal(handled, true);
  assert.equal(sent.length, 1);
  assert.match(sent[0].payload.text, /Daftar Command|Command/i);
});

test('handleMessage routes .menu from owner self-chat using alternate PN addressing', async () => {
  const sent = [];
  const sock = { sendMessage: async (jid, payload) => { sent.push({ jid, payload }); } };
  const pluginLoader = {
    listCommands: () => [
      { name: 'igpanel', aliases: [], category: 'Growth', usage: '', description: 'Dashboard', plugin: 'instagram-growth' },
      { name: 'igprofile', aliases: [], category: 'Instagram', usage: '', description: 'Profile', plugin: 'instagram-growth' }
    ]
  };
  const msg = {
    key: { id: 'TEST-MENU-LID-001', fromMe: true, remoteJid: '59206778490968:4@lid', remoteJidAlt: '6281234567890:4@s.whatsapp.net' },
    message: { conversation: '.menu' }
  };
  const handled = await handleMessage(sock, msg, {
    lidManager: null,
    pluginLoader,
    logger: { info() {}, warn() {}, error() {} },
    ownerNumber: '6281234567890',
    allowGroups: false
  });
  assert.equal(handled, true);
  assert.equal(sent.length, 1);
  assert.match(sent[0].payload.text, /igpanel/);
  assert.match(sent[0].payload.text, /igprofile/);
});

test('handleMessage executes .igprofile plugin for owner self-chat LID key', async () => {
  const sent = [];
  const executed = [];
  const sock = { sendMessage: async (jid, payload) => { sent.push({ jid, payload }); } };
  const pluginLoader = {
    execute: async (name, context) => {
      executed.push(name);
      await context.reply('profile ok');
      return { found: true, plugin: 'instagram-growth' };
    }
  };
  const msg = {
    key: { id: 'TEST-IGPROFILE-LID-002', fromMe: true, remoteJid: '59206778490968:4@lid', remoteJidAlt: '6281234567890:4@s.whatsapp.net' },
    message: { conversation: '.igprofile' }
  };
  const handled = await handleMessage(sock, msg, {
    lidManager: null,
    pluginLoader,
    logger: { info() {}, warn() {}, error() {} },
    ownerNumber: '6281234567890',
    allowGroups: false
  });
  assert.equal(handled, true);
  assert.deepEqual(executed, ['igprofile']);
  assert.equal(sent[0].payload.text, 'profile ok');
});


test('handleMessage executes .igpanel plugin for owner self-chat LID key', async () => {
  const sent = [];
  const executed = [];
  const sock = { sendMessage: async (jid, payload) => { sent.push({ jid, payload }); } };
  const pluginLoader = {
    execute: async (name, context) => {
      executed.push(name);
      await context.reply('panel ok');
      return { found: true, plugin: 'instagram-growth' };
    }
  };
  const msg = {
    key: { id: 'TEST-IGPANEL-LID-003', fromMe: true, remoteJid: '59206778490968:4@lid', remoteJidAlt: '6281234567890:4@s.whatsapp.net' },
    message: { conversation: '.igpanel' }
  };
  const handled = await handleMessage(sock, msg, {
    lidManager: null,
    pluginLoader,
    logger: { info() {}, warn() {}, error() {} },
    ownerNumber: '6281234567890',
    allowGroups: false
  });
  assert.equal(handled, true);
  assert.deepEqual(executed, ['igpanel']);
  assert.equal(sent[0].payload.text, 'panel ok');
});


test('handleMessage routes a native-flow button through owner authorization and plugin registry', async () => {
  const sent = [];
  const executed = [];
  const sock = {
    user: { id: '6281234567890@s.whatsapp.net' },
    sendMessage: async (jid, payload) => { sent.push({ jid, payload }); }
  };
  const pluginLoader = {
    execute: async (name, context) => { executed.push(name); await context.reply('stats opened'); return { found: true }; },
    listCommands: () => []
  };
  const handled = await handleMessage(sock, {
    key: { id: 'NATIVE-FLOW-RESPONSE-1', fromMe: true, remoteJid: '6281234567890@s.whatsapp.net' },
    message: { interactiveResponseMessage: { nativeFlowResponseMessage: { paramsJson: JSON.stringify({ id: 'wsk:cmd:.igstats' }) } } }
  }, {
    lidManager: null,
    pluginLoader,
    logger: { info() {}, warn() {}, error() {} },
    ownerNumber: '6281234567890',
    allowGroups: false
  });
  assert.equal(handled, true);
  assert.deepEqual(executed, ['igstats']);
  assert.equal(sent[0].payload.text, 'stats opened');
});


test('handleMessage dispatches .remini on attached-video caption and quoted-video reply', async () => {
  const executions = [];
  const sock = { user: { id: '6281234567890@s.whatsapp.net' }, sendMessage: async () => ({ key: { id: 'reply' } }) };
  const pluginLoader = {
    listCommands: () => [{ name: 'remini', aliases: [], category: 'Media Processing' }],
    execute: async (name, context) => { executions.push({ name, context }); return { found: true }; }
  };
  const common = { lidManager: null, pluginLoader, logger: { info() {}, warn() {}, error() {} }, ownerNumber: '6281234567890', allowGroups: false };
  const attached = { key: { id: 'CAPTION-VIDEO', fromMe: true, remoteJid: '6289999999999@s.whatsapp.net' }, message: { videoMessage: { mimetype: 'video/mp4', caption: '.remini sharp', fileLength: 1000 } } };
  assert.equal(await handleMessage(sock, attached, common), true);
  assert.equal(executions[0].name, 'remini');
  assert.equal(executions[0].context.messageInfo.media.type, 'video');
  assert.equal(executions[0].context.args[0], 'sharp');

  const quoted = { key: { id: 'QUOTED-VIDEO', fromMe: true, remoteJid: '6289999999998@s.whatsapp.net' }, message: { extendedTextMessage: { text: '.remini inspect', contextInfo: { quotedMessage: { videoMessage: { mimetype: 'video/mp4', fileName: 'quoted.mp4', fileLength: 1000 } }, stanzaId: 'video-id' } } } };
  assert.equal(await handleMessage(sock, quoted, common), true);
  assert.equal(executions[1].context.messageInfo.media, null);
  assert.equal(executions[1].context.messageInfo.quotedMedia.type, 'video');
  assert.equal(executions[1].context.messageInfo.quotedMedia.quoted, true);
});


test('main menu emits exactly three Mixed Native Flow buttons and preserves the real reply context', async () => {
  const relayed = [];
  let quotedAtGeneration;
  const baileysMock = {
    proto: { MessageContextInfo: { create: value => value } },
    generateMessageIDV2: () => 'MENU-MIXED-GENERATED',
    generateWAMessageFromContent: (jid, message, options) => { quotedAtGeneration = options.quoted; return { key: { remoteJid: jid, id: 'MENU-MIXED-GENERATED' }, message }; }
  };
  const sock = {
    user: { id: '6281234567890:1@s.whatsapp.net' },
    sendMessage: async (jid, payload) => { relayed.push({ jid, fallback: payload }); },
    relayMessage: async (jid, message, options) => relayed.push({ jid, message, options })
  };
  const commands = Array.from({ length: 14 }, (_, index) => ({ name: `feature${index + 1}`, category: index % 2 ? 'Core' : 'Media', plugin: 'qa' }));
  const msg = {
    key: { id: 'MENU-MIXED-TEST-0001', fromMe: true, remoteJid: '6281234567890@s.whatsapp.net' },
    pushName: 'Sky',
    message: { conversation: '.menu' }
  };
  const handled = await handleMessage(sock, msg, {
    lidManager: null,
    pluginLoader: { listCommands: () => commands },
    logger: { info() {}, warn() {}, error() {} },
    ownerNumber: '6281234567890',
    allowGroups: false,
    baileys: baileysMock
  });
  assert.equal(handled, true);
  assert.equal(relayed.length, 1);
  assert.equal(quotedAtGeneration, msg, 'the original inbound WAMessage must be used as the actual quote');
  const root = relayed[0].message.viewOnceMessage.message;
  const interactive = root.interactiveMessage;
  assert.equal(interactive.nativeFlowMessage.buttons.length, 3);
  const parsed = interactive.nativeFlowMessage.buttons.map(button => ({ name: button.name, params: JSON.parse(button.buttonParamsJson) }));
  assert.equal(parsed[0].name, 'quick_reply');
  assert.equal(parsed[0].params.id, 'wsk:cmd:.profile');
  assert.equal(parsed[1].name, 'cta_url');
  assert.equal(parsed[1].params.webview_interaction, true);
  assert.equal(parsed[1].params.url, 'https://whatsapp.com/channel/0029Vb8vHDB5PO0v7xAQL33e');
  assert.equal(parsed[2].name, 'single_select');
  assert.equal(parsed[2].params.sections[0].rows.length, 10);
  assert.match(interactive.body.text, /Halo Sky/);
  assert.match(interactive.body.text, /COMMAND CATALOG · 14 command aktif/);
  assert.match(interactive.body.text, /\.feature14/);
  assert.equal(interactive.contextInfo.externalAdReply.sourceUrl, 'https://whatsapp.com/channel/0029Vb8vHDB5PO0v7xAQL33e');
  assert.ok(interactive.contextInfo.stanzaId || root.messageContextInfo, 'menu keeps quote context or Baileys message context');
});


test('main menu sends oversized complete command catalog in bounded text chunks', async () => {
  const relayed = [];
  const textMessages = [];
  const baileysMock = {
    proto: { MessageContextInfo: { create: value => value } },
    generateMessageIDV2: () => 'MENU-LONG-CATALOG',
    generateWAMessageFromContent: (jid, message) => ({ key: { remoteJid: jid, id: 'MENU-LONG-CATALOG' }, message })
  };
  const sock = {
    user: { id: '6281234567890@s.whatsapp.net' },
    sendMessage: async (jid, payload) => { textMessages.push(payload.text); return { key: { id: `text-${textMessages.length}` } }; },
    relayMessage: async (jid, message, options) => relayed.push({ jid, message, options })
  };
  const commands = Array.from({ length: 45 }, (_, index) => ({
    name: `longfeature${index + 1}`,
    aliases: [`lf${index + 1}`],
    category: index % 3 ? 'Core' : 'Media',
    usage: '<value>',
    description: `Long description ${index + 1} · ${'additional metadata '.repeat(5)}`,
    plugin: 'qa'
  }));
  const msg = {
    key: { id: 'MENU-LONG-CATALOG-TEST', fromMe: true, remoteJid: '6281111111111@s.whatsapp.net' },
    pushName: 'Sky',
    message: { conversation: '.menu' }
  };
  const handled = await handleMessage(sock, msg, {
    lidManager: null,
    pluginLoader: { listCommands: () => commands },
    logger: { info() {}, warn() {}, error() {} },
    ownerNumber: '6281234567890',
    allowGroups: false,
    baileys: baileysMock
  });
  assert.equal(handled, true);
  assert.equal(relayed.length, 1, 'the mixed Native Flow menu is still sent once');
  assert.ok(textMessages.length > 1, 'the full catalogue is split into follow-up text messages');
  assert.ok(textMessages.every(value => value.length <= 3600));
  const joined = textMessages.join('\n');
  assert.match(joined, /longfeature1/);
  assert.match(joined, /longfeature45/);
  assert.match(joined, /alias: \.lf45/);
});
