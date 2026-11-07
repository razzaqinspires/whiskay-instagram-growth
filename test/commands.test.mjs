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

test('extracts text from ephemeral and image caption messages', () => {
  assert.equal(extractMessageText({ ephemeralMessage: { message: { imageMessage: { caption: '.igpanel' } } } }), '.igpanel');
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
