import test from 'node:test';
import assert from 'node:assert/strict';
import whatsappTools from '../src/plugins/whatsapp-tools.mjs';
import kolDownloader from '../src/plugins/kol-instagram-downloader.mjs';
import youtubeMusic from '../src/plugins/youtube-music.mjs';

function command(plugin, name) {
  const found = plugin.commands.find(item => item.name === name);
  assert.ok(found, `command ${name} should exist`);
  return found;
}

test('.waform help opens the live Single Select Message Lab, not a text-only response', async () => {
  let interactive = null;
  const replies = [];
  await command(whatsappTools, 'waform').execute({
    args: ['help'], rawArgs: 'help',
    reply: async value => replies.push(String(value)),
    sendInteractive: async value => { interactive = value; return 'sent'; }
  });
  assert.equal(replies.length, 0);
  assert.equal(interactive.buttons[0].type, 'single_select');
  const rows = interactive.buttons[0].sections.flatMap(section => section.rows);
  assert.ok(rows.some(row => row.id === 'wsk:cmd:.waform ai-rich'));
  assert.ok(rows.some(row => row.id === 'wsk:cmd:.waform carousel'));
  assert.ok(rows.some(row => row.id === 'wsk:cmd:.waform product'));
  assert.match(interactive.body, /AIRichResponse protobuf/);
});

test('.igdl help opens a button menu and uses valid command action ids', async () => {
  let interactive = null;
  const replies = [];
  await command(kolDownloader, 'igdl').execute({
    args: ['help'], rawArgs: 'help',
    reply: async value => replies.push(String(value)),
    sendInteractive: async value => { interactive = value; return 'sent'; }
  });
  assert.equal(replies.length, 0);
  const rows = interactive.buttons[0].sections[0].rows;
  assert.deepEqual(rows.map(row => row.id), ['wsk:cmd:.igdl info', 'wsk:cmd:.igdl help', 'wsk:cmd:.plugins']);
  assert.match(interactive.body, /10 slide/);
});

test('.igdl without an argument gives an interactive input prompt with fallback navigation', async () => {
  let interactive = null;
  await command(kolDownloader, 'igdl').execute({
    args: [], rawArgs: '', reply: async () => {},
    sendInteractive: async value => { interactive = value; }
  });
  assert.equal(interactive.buttons[0].type, 'single_select');
  assert.match(interactive.body, /instagram_url/);
});

test('.wacapabilities opens a button directory with ten transport demonstrations', async () => {
  let interactive = null;
  await command(whatsappTools, 'wacapabilities').execute({
    reply: async () => {},
    sendInteractive: async value => { interactive = value; }
  });
  assert.equal(interactive.buttons[0].type, 'single_select');
  const rows = interactive.buttons[0].sections[0].rows;
  assert.equal(rows.length, 10);
  assert.ok(rows.some(row => row.id === 'wsk:cmd:.waform ai-rich'));
  assert.ok(rows.some(row => row.id === 'wsk:cmd:.waform carousel'));
  assert.match(interactive.body, /EventMessage/);
});

test('.waform code provides a buttonized usage prompt and a real sample action', async () => {
  let prompt = null;
  await command(whatsappTools, 'waform').execute({
    args: ['code'], rawArgs: 'code', reply: async () => {},
    sendInteractive: async value => { prompt = value; }, sendAIRich: async () => 'rich-sent'
  });
  assert.equal(prompt.buttons.length, 2);
  assert.equal(prompt.buttons[0].id, 'wsk:cmd:.waform code sample');

  let sample = null;
  await command(whatsappTools, 'waform').execute({
    args: ['code', 'sample'], rawArgs: 'code sample', reply: async () => {},
    sendAIRich: async value => { sample = value; return 'rich-sent'; }
  });
  assert.equal(sample.language, 'javascript');
  assert.match(sample.code, /console\.log/);
});

test('.waform card and ai-card call different message transports', async () => {
  let card = false;
  let aiRich = false;
  const context = {
    args: ['card'], rawArgs: 'card', reply: async () => {},
    sendRichCard: async () => { card = true; }, sendAIRich: async () => { aiRich = true; }
  };
  await command(whatsappTools, 'waform').execute(context);
  assert.equal(card, true);
  assert.equal(aiRich, false);
  await command(whatsappTools, 'waform').execute({ ...context, args: ['ai-card'], rawArgs: 'ai-card' });
  assert.equal(aiRich, true);
});


test('.ytmusic help opens a button menu with valid action IDs', async () => {
  let interactive = null;
  await command(youtubeMusic, 'ytmusic').execute({
    args: ['help'], rawArgs: 'help', reply: async () => {},
    sendInteractive: async value => { interactive = value; }
  });
  assert.equal(interactive.buttons[0].type, 'single_select');
  const rows = interactive.buttons[0].sections[0].rows;
  assert.ok(rows.every(row => /^wsk:cmd:\./.test(row.id)));
  assert.ok(rows.some(row => row.id === 'wsk:cmd:.ytmusic status'));
});
