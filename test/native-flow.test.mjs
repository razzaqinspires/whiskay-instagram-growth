import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCarouselCards,
  buildAIRichResponseContent,
  buildLegacyButtonsContent,
  buildNativeFlowTextFallback,
  buildTemplateButtonsPayload,
  commandActionId,
  extractCommandActionId,
  extractCommandFromInteractiveResponse,
  extractInteractiveResponseId,
  normalizeNativeButtons,
  sendNativeCarousel,
  sendLegacyButtons,
  sendTemplateButtons,
  sendNativeFlow,
  sendAIRichResponse,
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

test('normalizes send_location as a special Native Flow action', () => {
  const [button] = normalizeNativeButtons([{ type: 'send_location', title: 'Share location' }]);
  assert.equal(button.name, 'send_location');
  assert.deepEqual(JSON.parse(button.buttonParamsJson), { display_text: 'Share location' });
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

test('carousel cards support one local image or video attachment and omit empty footers', () => {
  const cards = buildCarouselCards([
    { title: 'Image', body: 'Image card', image: Buffer.from('image'), buttons: [{ type: 'quick_reply', title: 'Open', id: 'wsk:cmd:.menu' }] },
    { title: 'Video', body: 'Video card', video: Buffer.from('video'), buttons: [{ type: 'quick_reply', title: 'Open', id: 'wsk:cmd:.menu' }] }
  ]);
  assert.equal(cards[0].header.hasMediaAttachment, true);
  assert.equal(cards[1].header.hasMediaAttachment, true);
  assert.equal(Object.hasOwn(cards[0], 'footer'), false);
  assert.throws(() => buildCarouselCards([
    { title: 'Both', body: 'invalid', image: Buffer.from('i'), video: Buffer.from('v'), buttons: [{ type: 'quick_reply', title: 'Open', id: 'x' }] },
    { title: 'Second', body: 'ok', buttons: [{ type: 'quick_reply', title: 'Open', id: 'y' }] }
  ]), /image atau video/);
});

test('carousel media uses Baileys prepareWAMessageMedia with the matching image/video field', async () => {
  const preparedTypes = [];
  const relayed = [];
  const baileys = {
    ...baileysMock,
    prepareWAMessageMedia: async payload => {
      const key = Object.keys(payload)[0];
      preparedTypes.push(key);
      return { [`${key}Message`]: { mimetype: key === 'image' ? 'image/jpeg' : 'video/mp4', fileLength: 4 } };
    }
  };
  const sock = {
    user: { id: '6281234567890@s.whatsapp.net' },
    waUploadToServer: async () => ({}),
    relayMessage: async (...args) => relayed.push(args)
  };
  await sendNativeCarousel(sock, '6281234567890@s.whatsapp.net', { title: 'Media', body: 'Cards', cards: [
    { title: 'Image', body: 'Image card', image: Buffer.from('img'), buttons: [{ type: 'quick_reply', title: 'Open', id: 'wsk:cmd:.menu' }] },
    { title: 'Video', body: 'Video card', video: Buffer.from('vid'), buttons: [{ type: 'quick_reply', title: 'Open', id: 'wsk:cmd:.menu' }] }
  ] }, null, { baileys });
  assert.deepEqual(preparedTypes, ['image', 'video']);
  const cards = relayed[0][1].interactiveMessage.carouselMessage.cards;
  assert.ok(cards[0].header.imageMessage);
  assert.ok(cards[1].header.videoMessage);
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
  assert.deepEqual(relayed[0].message.interactiveMessage.contextInfo.mentionedJid, []);
  assert.equal(relayed[0].message.interactiveMessage.carouselMessage.carouselCardType, 1);
  assert.equal(Boolean(relayed[0].message.viewOnceMessage), false, 'carousel must not be wrapped in view-once by default');
  assert.ok(relayed[0].options.additionalNodes.some(node => node.tag === 'bot'), 'carousel includes private-chat bot node');
  assert.ok(relayed[0].options.additionalNodes.find(node => node.tag === 'biz')?.content.some(node => node.tag === 'quality_control'));
  const fallback = await sendNativeCarousel(sock, '6281234567890@s.whatsapp.net', { title: 'Bad', cards: [] }, null, { baileys: baileysMock });
  assert.equal(fallback.interactiveFallback, true);
  assert.equal(sent.length, 1);
  assert.match(buildNativeFlowTextFallback({ body: 'Fallback', buttons: [{ title: 'Stats', id: 'wsk:cmd:.igstats' }] }), /Fallback/);
});


test('carousel relay errors propagate without sending a second text message', async () => {
  let fallbackCount = 0;
  const sock = {
    relayMessage: async () => { throw new Error('carousel relay timeout'); },
    sendMessage: async () => { fallbackCount += 1; return { key: { id: 'text-fallback' } }; }
  };
  await assert.rejects(sendNativeCarousel(sock, '6281234567890@s.whatsapp.net', {
    title: 'Carousel', body: 'Cards', cards: [
      { title: 'One', body: 'First', buttons: [{ type: 'quick_reply', title: 'Open', id: 'wsk:cmd:.menu' }] },
      { title: 'Two', body: 'Second', buttons: [{ type: 'quick_reply', title: 'Open', id: 'wsk:cmd:.menu' }] }
    ]
  }, null, { baileys: baileysMock }), /carousel relay timeout/);
  assert.equal(fallbackCount, 0);
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

test('special Native Flow actions use their dedicated binary node descriptor', async () => {
  const relayed = [];
  const sock = {
    user: { id: '6281234567890@s.whatsapp.net' },
    relayMessage: async (...args) => { relayed.push(args); return 'ACK-SPECIAL'; }
  };
  await sendNativeFlow(sock, '6281234567890@s.whatsapp.net', {
    body: 'Share your location',
    buttons: [{ type: 'send_location', title: 'Share location' }]
  }, null, { baileys: baileysMock });
  const biz = relayed[0][2].additionalNodes.find(node => node.tag === 'biz');
  const nativeFlow = biz.content.find(node => node.tag === 'interactive').content[0];
  assert.deepEqual(nativeFlow.attrs, { v: '2', name: 'send_location' });
  assert.deepEqual(JSON.parse(relayed[0][1].viewOnceMessage.message.interactiveMessage.nativeFlowMessage.buttons[0].buttonParamsJson), { display_text: 'Share location' });
});

test('CTA catalog selects the catalog special flow while ordinary quick replies remain mixed', async () => {
  const relayed = [];
  const sock = { user: { id: '6281234567890@s.whatsapp.net' }, relayMessage: async (...args) => relayed.push(args) };
  await sendNativeFlow(sock, '6281234567890@s.whatsapp.net', { body: 'Catalog', buttons: [{ type: 'cta_catalog', title: 'Open catalog' }] }, null, { baileys: baileysMock });
  let node = relayed[0][2].additionalNodes.find(item => item.tag === 'biz').content.find(item => item.tag === 'interactive').content[0];
  assert.deepEqual(node.attrs, { v: '2', name: 'cta_catalog' });
  relayed.length = 0;
  await sendNativeFlow(sock, '6281234567890@s.whatsapp.net', { body: 'Menu', buttons: [{ type: 'quick_reply', title: 'Menu', id: 'wsk:cmd:.menu' }] }, null, { baileys: baileysMock });
  node = relayed[0][2].additionalNodes.find(item => item.tag === 'biz').content.find(item => item.tag === 'interactive').content[0];
  assert.deepEqual(node.attrs, { v: '9', name: 'mixed' });
});

test('relay errors propagate and never trigger a duplicate text fallback', async () => {
  let fallbackCount = 0;
  const sock = {
    user: { id: '6281234567890@s.whatsapp.net' },
    relayMessage: async () => { throw new Error('network timeout after relay'); },
    sendMessage: async () => { fallbackCount += 1; return { key: { id: 'fallback' } }; }
  };
  await assert.rejects(sendNativeFlow(sock, '6281234567890@s.whatsapp.net', {
    body: 'Menu', buttons: [{ type: 'quick_reply', title: 'Menu', id: 'wsk:cmd:.menu' }]
  }, null, { baileys: baileysMock }), /network timeout/);
  assert.equal(fallbackCount, 0);
});

test('reserved biz/bot binary nodes cannot be duplicated by caller-supplied extras', async () => {
  const sock = {
    user: { id: '6281234567890@s.whatsapp.net' },
    relayMessage: async () => { throw new Error('should not relay'); },
    sendMessage: async () => ({ key: { id: 'fallback' } })
  };
  await assert.rejects(sendNativeFlow(sock, '6281234567890@s.whatsapp.net', {
    body: 'Menu', buttons: [{ type: 'quick_reply', title: 'Menu', id: 'wsk:cmd:.menu' }],
    additionalNodes: [{ tag: 'biz', attrs: { fake: '1' } }]
  }, null, { baileys: baileysMock }), /reserved biz\/bot/);
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


test('sends hydrated Template Buttons through raw proto relay instead of sendMessage media detection', async () => {
  const relayed = [];
  const sock = {
    user: { id: '6281234567890@s.whatsapp.net' },
    relayMessage: async (...args) => relayed.push(args),
    sendMessage: async () => { throw new Error('sendMessage must not parse templateMessage as media'); }
  };
  const result = await sendTemplateButtons(sock, '6281234567890@s.whatsapp.net', {
    text: 'Template legacy', buttons: [{ type: 'quick_reply', title: 'Menu', id: 'wsk:cmd:.menu' }]
  }, null, { baileys: baileysMock });
  assert.equal(result.transport, 'Hydrated Template Buttons');
  assert.equal(relayed.length, 1);
  assert.ok(relayed[0][1].templateMessage.hydratedTemplate.hydratedButtons.length === 1);
});

test('builds a genuine generic AIRichResponse shape without impersonation metadata', () => {
  const content = buildAIRichResponseContent({ title: 'WHISKAY Code', code: 'const x = 1;', language: 'javascript' });
  const rich = content.botForwardedMessage.message.richResponseMessage;
  assert.equal(rich.messageType, 1);
  assert.equal(rich.submessages[0].messageType, 2);
  assert.equal(rich.submessages[1].messageType, 5);
  assert.ok(rich.unifiedResponse.data.length > 10);
  const unified = JSON.parse(Buffer.from(rich.unifiedResponse.data, 'base64').toString('utf8'));
  assert.ok(unified.sections.every(section => section.view_model?.__typename === 'GenAISingleLayoutViewModel'));
  assert.ok(unified.sections.every(section => section.__typename === undefined));
  assert.ok(content.messageContextInfo.botMetadata.capabilityMetadata.capabilities.includes(8));
  assert.ok(content.messageContextInfo.botMetadata.capabilityMetadata.capabilities.includes(7));
  assert.equal(content.messageContextInfo.botMetadata.messageDisclaimerText, 'WHISKAY · Structured response');
  assert.equal(rich.contextInfo.forwardingScore, 0);
  assert.equal(rich.contextInfo.forwardedAiBotMessageInfo, undefined);
});


test('AIRichResponse uses direct relayMessage payload and the AIRich single-layout section shape', async () => {
  const relayed = [];
  const sock = {
    user: { id: '6281234567890@s.whatsapp.net' },
    relayMessage: async (...args) => { relayed.push(args); return 'AIRICH-RELAY-ID'; }
  };
  const result = await sendAIRichResponse(sock, '6281234567890@s.whatsapp.net', { title: 'WHISKAY', text: 'AI Rich sample' }, null, { baileys: baileysMock });
  assert.equal(relayed.length, 1);
  assert.equal(relayed[0][2].messageId, 'GENERATED-MESSAGE-ID');
  assert.ok(relayed[0][1].botForwardedMessage.message.richResponseMessage);
  const unified = JSON.parse(Buffer.from(relayed[0][1].botForwardedMessage.message.richResponseMessage.unifiedResponse.data, 'base64').toString('utf8'));
  assert.equal(unified.sections[0].view_model.__typename, 'GenAISingleLayoutViewModel');
  assert.equal(result.key.id, 'AIRICH-RELAY-ID');
  assert.equal(result.transport, 'AIRichResponse protobuf');
});

test('builds an AIRich HTML embedded screen with valid nested tab sections and optional trusted source', () => {
  const html = '<!doctype html><html><body><h1>WHISKAY</h1></body></html>';
  const content = buildAIRichResponseContent({ title: 'HTML demo', text: 'Open preview', html, htmlTitle: 'Preview', trustedSources: ['razzaq.example'], forwardedContext: true });
  const rich = content.botForwardedMessage.message.richResponseMessage;
  const unified = JSON.parse(Buffer.from(rich.unifiedResponse.data, 'base64').toString('utf8'));
  const screen = unified.embedded_screens[0];
  const tab = screen.content[0].tabs[0];
  const primitive = tab.sections[0].view_model.primitive;
  assert.equal(primitive.__typename, 'GenAIaeacdsnwHtmlPrimitive');
  assert.equal(primitive.payload, html);
  assert.deepEqual(primitive.trusted_sources, ['razzaq.example']);
  assert.equal(rich.contextInfo.isForwarded, true);
  assert.equal(rich.contextInfo.forwardedAiBotMessageInfo, undefined);
  assert.ok(content.messageContextInfo.botMetadata.capabilityMetadata.capabilities.includes(34));
  assert.throws(() => buildAIRichResponseContent({ html: '<div>safe</div>', trustedSources: ['https://not-a-domain'] }), /trusted_sources/);
});

test('builds a separate legacy ButtonsMessage transport with response-only buttons', () => {
  const content = buildLegacyButtonsContent({ text: 'Legacy choices', buttons: [
    { type: 'quick_reply', title: 'Menu', id: 'wsk:cmd:.menu' },
    { type: 'quick_reply', title: 'Plugins', id: 'wsk:cmd:.plugins' }
  ] });
  assert.equal(content.buttonsMessage.buttons.length, 2);
  assert.equal(content.buttonsMessage.buttons[0].type, 1);
  assert.equal(content.buttonsMessage.buttons[0].buttonId, 'wsk:cmd:.menu');
  assert.throws(() => buildLegacyButtonsContent({ text: 'bad', buttons: [{ type: 'cta_url', title: 'Go', url: 'https://example.com' }] }), /hanya mendukung quick_reply/);
});

test('sends legacy ButtonsMessage through generateWAMessageFromContent and relayMessage', async () => {
  const relayed = [];
  const sock = { user: { id: '6281234567890@s.whatsapp.net' }, relayMessage: async (...args) => relayed.push(args) };
  const result = await sendLegacyButtons(sock, '6281234567890@s.whatsapp.net', { text: 'Choose', buttons: [{ type: 'quick_reply', title: 'Menu', id: 'wsk:cmd:.menu' }] }, null, { baileys: baileysMock });
  assert.equal(result.transport, 'Legacy ButtonsMessage');
  assert.equal(relayed.length, 1);
  assert.ok(relayed[0][1].buttonsMessage);
});
