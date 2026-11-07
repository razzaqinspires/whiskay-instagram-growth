import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCarouselCards,
  buildNativeFlowTextFallback,
  commandActionId,
  extractCommandActionId,
  extractCommandFromInteractiveResponse,
  extractInteractiveResponseId,
  normalizeNativeButtons,
  sendNativeCarousel,
  sendNativeFlow
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
