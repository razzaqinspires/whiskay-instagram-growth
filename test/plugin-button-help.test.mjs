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
  assert.ok(rows.some(row => row.id === 'wsk:cmd:.waform send-location'));
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

test('.waform code sends a default code sample and accepts explicit custom code', async () => {
  let sample = null;
  await command(whatsappTools, 'waform').execute({
    args: ['code'], rawArgs: 'code', reply: async () => {},
    sendAIRich: async value => { sample = value; return 'rich-sent'; }
  });
  assert.equal(sample.language, 'javascript');
  assert.match(sample.code, /console\.log/);

  let custom = null;
  await command(whatsappTools, 'waform').execute({
    args: ['code', 'javascript', '|', 'const answer = 42;'], rawArgs: 'code javascript | const answer = 42;', reply: async () => {},
    sendAIRich: async value => { custom = value; return 'rich-sent'; }
  });
  assert.equal(custom.language, 'javascript');
  assert.match(custom.code, /answer = 42/);
});

test('.waform ai-rich sends a default structured sample without requiring arguments', async () => {
  let sample = null;
  const replies = [];
  await command(whatsappTools, 'waform').execute({
    args: ['ai-rich'], rawArgs: 'ai-rich', reply: async value => replies.push(String(value)),
    sendAIRich: async value => { sample = value; return { key: { id: 'rich-sample-1' } }; }
  });
  assert.equal(replies.length, 0);
  assert.equal(sample.title, 'WHISKAY · AI RICH RESPONSE');
  assert.match(sample.text, /AIRichResponse terstruktur/);
});

test('.waform contact, location, code and media use local demo defaults without arguments', async () => {
  const calls = [];
  const base = {
    reply: async value => calls.push(['reply', String(value)]),
    sendContact: async value => calls.push(['contact', value]),
    sendLocation: async value => calls.push(['location', value]),
    sendAIRich: async value => calls.push(['rich', value]),
    sendMedia: async (...value) => calls.push(['media', ...value])
  };
  await command(whatsappTools, 'waform').execute({ ...base, args: ['contact'], rawArgs: 'contact' });
  await command(whatsappTools, 'waform').execute({ ...base, args: ['location'], rawArgs: 'location' });
  await command(whatsappTools, 'waform').execute({ ...base, args: ['code'], rawArgs: 'code' });
  await command(whatsappTools, 'waform').execute({ ...base, args: ['media'], rawArgs: 'media', sock: {} });
  assert.equal(calls.find(item => item[0] === 'contact')[1].name, 'WHISKAY Demo Contact');
  assert.equal(calls.find(item => item[0] === 'location')[1].name, 'WHISKAY Demo Point');
  assert.match(calls.find(item => item[0] === 'rich')[1].code, /console\.log/);
  assert.equal(calls.find(item => item[0] === 'media')[1], 'ptv');
  assert.match(calls.find(item => item[0] === 'media')[2], /assets[\/]whatsapp-media-demo[\/]whiskay-demo-ptv\.mp4$/);
});


test('.waform product selects a real catalog product and resolves its demo image from assets', async () => {
  const previousFlag = process.env.WHISKAY_WHATSAPP_BUSINESS_CATALOG_ENABLED;
  process.env.WHISKAY_WHATSAPP_BUSINESS_CATALOG_ENABLED = 'true';
  let productSample = null;
  try {
    await command(whatsappTools, 'waform').execute({
      args: ['product'], rawArgs: 'product',
      sock: {
        user: { id: '6281234567890@s.whatsapp.net' },
        getCatalog: async () => ({ products: [{ productId: 'real-product-1', title: 'Catalog Product', description: 'Real catalog item', currencyCode: 'IDR', priceAmount1000: 125000, retailerId: 'retailer-1' }] })
      },
      reply: async () => {},
      sendProduct: async value => { productSample = value; return { key: { id: 'product-demo-1' } }; }
    });
    assert.equal(productSample.product.productId, 'real-product-1');
    assert.match(productSample.product.productImage, /assets[\/]whatsapp-media-demo[\/]whiskay-demo-viewonce-image\.jpg$/);
    assert.doesNotMatch(productSample.product.productImage, /data[\/]whatsapp-products/);
  } finally {
    if (previousFlag === undefined) delete process.env.WHISKAY_WHATSAPP_BUSINESS_CATALOG_ENABLED;
    else process.env.WHISKAY_WHATSAPP_BUSINESS_CATALOG_ENABLED = previousFlag;
  }
});

test('.waform send-location sends the explicit experimental location-request Native Flow', async () => {
  let sample = null;
  await command(whatsappTools, 'waform').execute({
    args: ['send-location'], rawArgs: 'send-location', reply: async () => {},
    sendNativeButtons: async value => { sample = value; return 'sent'; }
  });
  assert.equal(sample.buttons[0].type, 'send_location');
  assert.match(sample.body, /tidak mengambil lokasi secara diam-diam/i);
});

test('.waform URL, WebView, Copy and dialer samples have safe defaults', async () => {
  const sent = [];
  const base = { args: [], rawArgs: '', reply: async () => {}, sendNativeButtons: async value => { sent.push(value); } };
  for (const kind of ['url', 'webview', 'copy', 'dialer']) {
    await command(whatsappTools, 'waform').execute({ ...base, args: [kind], rawArgs: kind });
  }
  assert.equal(sent.length, 4);
  assert.match(sent[0].buttons[0].url, /^https:\/\/github\.com\//);
  assert.equal(sent[2].buttons[0].copy_code, 'WHISKAY-DEMO-2026');
  assert.equal(sent[3].buttons[0].phone, '+19995550123');
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

test('.wadelivery reports status and per-recipient receipts without exposing message content', async () => {
  const replies = [];
  const tracker = {
    stats: () => ({ tracked: 1, updates: 2, receipts: 1, relayErrors: 0, byStatus: { READ: 1 } }),
    recent: () => [{ status: 'READ', id: 'MSG-1' }],
    get: () => ({ id: 'MSG-1', status: 'READ', source: 'sendMessage', updatedAt: 1000, receipts: { '6281@s.whatsapp.net': { receivedAt: 900, readAt: 950, playedAt: null } } })
  };
  await command(whatsappTools, 'wadelivery').execute({ sock: { whiskayDelivery: tracker }, args: [], reply: async value => replies.push(String(value)) });
  assert.match(replies[0], /Status: READ|READ=1/);
  assert.match(replies[0], /MSG-1/);
  replies.length = 0;
  await command(whatsappTools, 'wadelivery').execute({ sock: { whiskayDelivery: tracker }, args: ['MSG-1'], reply: async value => replies.push(String(value)) });
  assert.match(replies[0], /Status: READ/);
  assert.match(replies[0], /read=yes/);
  assert.doesNotMatch(replies[0], /text|caption|message body/i);
});
