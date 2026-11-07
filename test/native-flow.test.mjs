import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCarouselCards,
  buildNativeFlowTextFallback,
  buildTemplateButtonsPayload,
  commandActionId,
  extractCommandActionId,
  extractCommandFromInteractiveResponse,
  extractInteractiveResponseId,
  normalizeNativeButtons,
  sendNativeCarousel,
  sendNativeFlow,
  sendPollMessage
} from '../src/lib/native-flow.mjs';

const baileysMock = {
  proto: { MessageContextInfo: { create: value => value } },
  generateMessageIDV2: () => 'GENERATED-MESSAGE-ID',
  generateWAMessageFromContent: (jid, message) => ({ key: { remoteJid: jid, id: 'GENERATED-MESSAGE-ID' }, message })
};

test('command action ids are namespaced and validated', () => {
  assert.equal(commandActionId('.igstats'), 'wsk:cmd:.igstats');
  assert.equal(extractCommandActionId('wsk:cmd:.igcampaign list'), '.igcampaign list');
  assert.equal(extractCommandActionId('wsk:cmd:igstats'), null);
  assert.throws(() => commandActionId('.igstats\n.evil'), /Command action/);
});

test('normalizes supported native buttons and rejects unsafe URL/call defaults', () => {
  const buttons = normalizeNativeButtons([
    { type: 'quick_reply', title: 'Stats', id: 'wsk:cmd:.igstats' },
    { type: 'cta_url', title: 'Site', url: 'https://example.com' },
    { type: 'cta_call', title: 'Call', phone: '+6281234567890' },
    { type: 'cta_copy', title: 'Copy', copy_code: 'RV-CODE' },
    { type: 'single_select', title: 'Menu', sections: [{ title: 'Growth', rows: [{ title: 'Campaign', id: 'wsk:cmd:.igcampaign list' }] }] }
  ]);
  assert.equal(buttons.length, 5);
  assert.equal(JSON.parse(buttons[0].buttonParamsJson).id, 'wsk:cmd:.igstats');
  assert.equal(JSON.parse(buttons[1].buttonParamsJson).url, 'https://example.com/');
  assert.throws(() => normalizeNativeButtons([{ type: 'cta_url', title: 'Open' }]), /url wajib/);
  assert.throws(() => normalizeNativeButtons([{ type: 'cta_call', title: 'Call' }]), /phone wajib/);
});

test('extracts native-flow, list, button, and wrapped responses safely', () => {
  const msg = { viewOnceMessage: { message: { interactiveResponseMessage: { nativeFlowResponseMessage: { paramsJson: JSON.stringify({ id: 'wsk:cmd:.igstats' }) } } } } };
  assert.equal(extractInteractiveResponseId(msg), 'wsk:cmd:.igstats');
  assert.equal(extractCommandFromInteractiveResponse(msg), '.igstats');
  assert.equal(extractInteractiveResponseId({ listResponseMessage: { singleSelectReply: { selectedRowId: 'row-1' } } }), 'row-1');
  assert.equal(extractInteractiveResponseId({ buttonsResponseMessage: { selectedButtonId: 'btn-1' } }), 'btn-1');
  assert.equal(extractInteractiveResponseId({ interactiveResponseMessage: { nativeFlowResponseMessage: { paramsJson: '{bad json' } } }), null);
});

test('single-select service rows preserve namespaced service-detail commands', () => {
  const id = commandActionId('.igservice creator-collab-plan');
  assert.equal(extractCommandActionId(id), '.igservice creator-collab-plan');
  const [button] = normalizeNativeButtons([{
    type: 'single_select',
    title: 'Pilih layanan',
    listTitle: 'Katalog layanan',
    sections: [{ title: 'Layanan', rows: [{ title: 'Creator Collaboration', description: 'Kampanye kreator', id }] }]
  }]);
  const params = JSON.parse(button.buttonParamsJson);
  assert.equal(button.name, 'single_select');
  assert.equal(params.sections[0].rows[0].id, id);
});

test('builds carousel cards from validated buttons', () => {
  const cards = buildCarouselCards([
    { title: 'One', body: 'First card', buttons: [{ type: 'quick_reply', title: 'Open', id: 'wsk:cmd:.igpanel' }] },
    { title: 'Two', body: 'Second card', buttons: [{ type: 'quick_reply', title: 'Open', id: 'wsk:cmd:.igpanel' }] }
  ]);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].nativeFlowMessage.buttons.length, 1);
  assert.throws(() => buildCarouselCards([{ title: 'Only one', body: 'not enough', buttons: [{ title: 'Go', id: 'x' }] }]), /2–10/);
});

test('sendNativeFlow relays an interactive payload with required envelope nodes', async () => {
  const relayed = [];
  const sock = {
    user: { id: '6281234567890@s.whatsapp.net' },
    relayMessage: async (jid, message, options) => relayed.push({ jid, message, options }),
    sendMessage: async () => { throw new Error('fallback should not run'); }
  };
  const result = await sendNativeFlow(sock, '6281234567890@s.whatsapp.net', {
    title: 'WHISKAY', body: 'Choose', buttons: [{ type: 'quick_reply', title: 'Stats', id: 'wsk:cmd:.igstats' }]
  }, null, { baileys: baileysMock });
  assert.equal(result.key.id, 'GENERATED-MESSAGE-ID');
  assert.equal(relayed.length, 1);
  assert.ok(relayed[0].message.viewOnceMessage.message.interactiveMessage.nativeFlowMessage);
  assert.ok(relayed[0].options.additionalNodes.some(node => node.tag === 'bot'));
  const biz = relayed[0].options.additionalNodes.find(node => node.tag === 'biz');
  assert.equal(biz.attrs.actual_actors, '2');
  assert.equal(biz.attrs.host_storage, '2');
  assert.match(biz.attrs.privacy_mode_ts, /^\d+$/);
  assert.ok(biz.content.some(node => node.tag === 'quality_control'));
  assert.match(biz.content.find(node => node.tag === 'quality_control').attrs.decision_id, /^[a-f0-9]{40}$/);
});

test('sendNativeCarousel relays a carousel and falls back to text on invalid content', async () => {
  const relayed = [];
  const sent = [];
  const sock = {
    relayMessage: async (jid, message, options) => relayed.push({ jid, message, options }),
    sendMessage: async (jid, content) => { sent.push({ jid, content }); return { key: { id: 'TEXT-FALLBACK' } }; }
  };
  await sendNativeCarousel(sock, '6281234567890@s.whatsapp.net', {
    title: 'Catalog', body: 'Services', cards: [
      { title: 'One', body: 'First', buttons: [{ type: 'quick_reply', title: 'Open', id: 'wsk:cmd:.igpanel' }] },
      { title: 'Two', body: 'Second', buttons: [{ type: 'quick_reply', title: 'Open', id: 'wsk:cmd:.igpanel' }] }
    ]
  }, null, { baileys: baileysMock });
  assert.equal(relayed.length, 1);
  assert.equal(relayed[0].message.interactiveMessage.carouselMessage.cards.length, 2);
  const fallback = await sendNativeCarousel(sock, '6281234567890@s.whatsapp.net', { title: 'Bad', cards: [] }, null, { baileys: baileysMock });
  assert.equal(fallback.interactiveFallback, true);
  assert.equal(sent.length, 1);
  assert.match(buildNativeFlowTextFallback({ body: 'Fallback', buttons: [{ title: 'Stats', id: 'wsk:cmd:.igstats' }] }), /Fallback/);
});


test('Native Flow group envelope includes biz quality metadata but omits private bot node', async () => {
  const relayed = [];
  const sock = {
    user: { id: '6281234567890@s.whatsapp.net' },
    relayMessage: async (jid, message, options) => relayed.push({ jid, message, options }),
    sendMessage: async () => { throw new Error('fallback should not run'); }
  };
  await sendNativeFlow(sock, '123456789-123456@g.us', {
    title: 'WHISKAY', body: 'Choose', buttons: [{ type: 'quick_reply', title: 'Stats', id: 'wsk:cmd:.igstats' }]
  }, null, { baileys: baileysMock });
  const nodes = relayed[0].options.additionalNodes;
  assert.ok(nodes.some(node => node.tag === 'biz'));
  assert.ok(!nodes.some(node => node.tag === 'bot'));
});


test('normalizes WebView aliases and requires HTTPS for every CTA URL', () => {
  const [webview, external] = normalizeNativeButtons([
    { type: 'webview_url', title: 'Open App', url: 'https://example.com/app' },
    { type: 'url', title: 'Website', url: 'https://example.com' }
  ]);
  assert.equal(webview.name, 'cta_url');
  assert.equal(JSON.parse(webview.buttonParamsJson).webview_interaction, true);
  assert.equal(JSON.parse(external.buttonParamsJson).url, 'https://example.com/');
  assert.throws(() => normalizeNativeButtons([{ type: 'webview_url', title: 'Open', url: 'http://example.com' }]), /HTTPS/);
  assert.throws(() => normalizeNativeButtons([{ type: 'cta_url', title: 'Open', url: 'javascript:alert(1)' }]), /HTTPS/);
  assert.throws(() => normalizeNativeButtons([{ type: 'cta_url', title: 'Open', url: 'https://example.com', merchant_url: 'http://example.com' }]), /HTTPS/);
});

test('builds legacy hydrated Template Buttons only for supported, bounded action types', () => {
  const payload = buildTemplateButtonsPayload({ text: 'Choose', footer: 'WHISKAY', buttons: [
    { type: 'quick_reply', title: 'Menu', id: 'wsk:cmd:.menu' },
    { type: 'cta_url', title: 'Docs', url: 'https://example.com/docs' },
    { type: 'cta_call', title: 'Call', phone: '+6281234567890' }
  ] });
  const buttons = payload.templateMessage.hydratedTemplate.hydratedButtons;
  assert.equal(buttons.length, 3);
  assert.equal(buttons[0].quickReplyButton.id, 'wsk:cmd:.menu');
  assert.equal(buttons[1].urlButton.url, 'https://example.com/docs');
  assert.equal(buttons[2].callButton.phoneNumber, '+6281234567890');
  assert.throws(() => buildTemplateButtonsPayload({ text: 'x', buttons: [{ type: 'cta_url', title: 'bad', url: 'javascript:alert(1)' }] }), /HTTPS/);
  assert.throws(() => buildTemplateButtonsPayload({ text: 'x', buttons: [] }), /1–3/);
});


test('normalizes WhatsApp Business catalog CTA without inventing product metadata', () => {
  const [button] = normalizeNativeButtons([{ type: 'cta_catalog', title: 'Lihat katalog' }]);
  assert.equal(button.name, 'cta_catalog');
  assert.deepEqual(JSON.parse(button.buttonParamsJson), { display_text: 'Lihat katalog' });
});

test('sends a native poll with validated options and selectable count', async () => {
  const sent = [];
  const sock = { sendMessage: async (jid, payload, options) => { sent.push({ jid, payload, options }); return { key: { id: 'poll-1' }, message: { pollCreationMessage: payload.poll } }; } };
  const result = await sendPollMessage(sock, '6281234567890@s.whatsapp.net', { name: 'Pilih fitur', values: ['Quick Reply', 'Carousel'], selectableCount: 1 });
  assert.equal(result.key.id, 'poll-1');
  assert.deepEqual(sent[0].payload.poll, { name: 'Pilih fitur', values: ['Quick Reply', 'Carousel'], selectableCount: 1 });
  await assert.rejects(sendPollMessage(sock, '6281234567890@s.whatsapp.net', { name: 'Duplikat', values: ['A', 'a'] }), /duplikat/);
});

test('extracts interactive response from all Baileys wrapper variants used by the adapter', () => {
  const variants = [
    { deviceSentMessage: { message: { buttonsResponseMessage: { selectedButtonId: 'wsk:cmd:.menu' } } } },
    { associatedChildMessage: { message: { listResponseMessage: { singleSelectReply: { selectedRowId: 'wsk:cmd:.plugins' } } } } },
    { documentWithCaptionMessage: { message: { interactiveResponseMessage: { nativeFlowResponseMessage: { paramsJson: '{"id":"wsk:cmd:.ping"}' } } } } }
  ];
  assert.deepEqual(variants.map(extractCommandFromInteractiveResponse), ['.menu', '.plugins', '.ping']);
});


test('text fallback preserves public copy codes and CTA destinations', () => {
  const text = buildNativeFlowTextFallback({ buttons: [
    { type: 'cta_copy', title: 'Copy ID', copy_code: 'PUBLIC-42' },
    { type: 'cta_url', title: 'Docs', url: 'https://example.com/docs' },
    { type: 'cta_call', title: 'Call', phone: '+6281234567890' }
  ] });
  assert.match(text, /PUBLIC-42/);
  assert.match(text, /https:\/\/example.com\/docs/);
  assert.match(text, /\+6281234567890/);
});

test('interactive media refuses remote URLs instead of fetching arbitrary hosts', async () => {
  let prepared = 0;
  const sent = [];
  const baileys = {
    ...baileysMock,
    prepareWAMessageMedia: async () => { prepared += 1; return {}; }
  };
  const sock = {
    relayMessage: async () => {},
    sendMessage: async (jid, content) => { sent.push(content); return { key: { id: 'fallback' } }; },
    waUploadToServer: async () => ({})
  };
  const result = await sendNativeFlow(sock, '6281234567890@s.whatsapp.net', {
    title: 'Remote image', body: 'Unsafe URL', image: 'https://127.0.0.1/admin',
    buttons: [{ type: 'quick_reply', title: 'OK', id: 'wsk:cmd:.menu' }]
  }, null, { baileys });
  assert.equal(result.interactiveFallback, true);
  assert.equal(prepared, 0);
  assert.equal(sent.length, 1);
});


test('rejects secret-bearing CTA Copy even when Native Flow is called directly', async () => {
  assert.throws(() => normalizeNativeButtons([
    { type: 'cta_copy', title: 'Copy', id: 'copy', copy_code: 'API_KEY=private-value' }
  ]), /rahasia/);
});
