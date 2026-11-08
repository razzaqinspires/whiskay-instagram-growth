# WHISKAY WhatsApp Message Router

Unified transport is implemented in `src/lib/whatsapp-message-router.mjs` and `src/lib/native-flow.mjs`. Plugins call the same `send()`/typed helpers; the router selects a Baileys message shape based on the intended user action. A successful `relayMessage()` only confirms the local relay operation, not delivery or rendering on every WhatsApp client.

## Format selection matrix

| Requirement | WHISKAY transport | Correct use |
|---|---|---|
| One or a few bot actions | Native Flow `quick_reply` | Short commands routed back through owner authorization and anti-spam. |
| Long command/category directory | Native Flow `single_select` | Grouped rows; max 10 sections × 20 rows per section in WHISKAY. |
| Open ordinary HTTPS site | Native Flow `cta_url` | External page in client/browser. |
| Open HTTPS site with WebView request | Native Flow `cta_url` + `webview_interaction: true` | Client may still open a browser if its WebView support differs. |
| Copy a public identifier | Native Flow `cta_copy` | Public IDs/codes only; never secrets. |
| Open device phone dialer | Native Flow `cta_call` | Opens a dialer, not an in-app WhatsApp voice call. |
| Open a connected Business catalog | Native Flow `cta_catalog` | Opens a real connected catalog; it does not create products. |
| Older button UI | Hydrated Template Buttons | Up to three quick reply, URL, or call buttons. Legacy compatibility only. |
| Old `ButtonsMessage` | Protobuf `buttonsMessage` | Up to three response buttons only; separate from Template Buttons and Native Flow. |
| One compact interactive card | Native Flow interactive header/body/footer | Ordinary interactive card, not AI Rich Response. |
| AI Rich Response / rich code or table | `botForwardedMessage.message.richResponseMessage` | Protobuf-based structured response. Rendering is experimental and no Meta AI identity is asserted. |
| Horizontal interactive cards | `InteractiveMessage.carouselMessage` | Two to ten cards, each with its own content/actions; root context metadata is included. |
| Vote collection | Baileys native `poll` | Single/multi-select options, stored creation WAMessage for vote decryption. |
| Timed event / scheduled audio-video call link | Baileys `event` | Creates an EventMessage; audio/video call links use Baileys `createCallLink` when supported. This is not a direct call. |
| Product from actual Business catalog | Baileys `product` / `ProductMessage` | Requires owner-enabled Business configuration and real product fields/image. |
| Video / PTV / View Once / voice / GIF | Baileys `sendMessage` media payload | PTV uses `video` + `ptv: true`; View Once uses `viewOnce: true`; voice uses audio + PTT. |
| Contact or static location | Contact/vCard or location message | Real user-supplied contact/coordinate data only. |

## `.menu` main screen

`.menu` remains a three-button Mixed Native Flow screen:

1. `quick_reply` → `.profile` (alias of `.igprofile`, reads the active Instagram session).
2. `cta_url` with `webview_interaction` → the configured WHISKAY WhatsApp Channel.
3. `single_select` → ten recommendations with hit count and recommendation share.

The menu body now also includes the complete active command catalogue (canonical command, aliases, usage, and description) when it fits within a conservative body budget. If the catalogue is longer, the same complete catalogue is sent as bounded ordinary-text messages immediately after the interactive menu. The recommendations are not a replacement for the command directory. `.plugins` remains the paginated interactive directory. The incoming user message is supplied to Baileys as the actual `quoted` WAMessage, while `pushName` is used for the greeting. `.profile` is an alias of the session-bound `.igprofile` command. `externalAdReply` provides the channel preview/title/body below the quote block. The bundled thumbnail is a WHISKAY-designed preview, not a downloaded or verified copy of the channel avatar; an HTTPS `WHISKAY_CHANNEL_THUMBNAIL_URL` can override it.

## API examples

```js
await send({ type: 'quick_reply', title: 'Open profile', id: 'wsk:cmd:.profile' });
await send({ type: 'cta_url', title: 'Documentation', url: 'https://example.com/docs' });
await send({ type: 'webview_url', title: 'Open app', url: 'https://example.com/app' });
await send({ type: 'cta_copy', title: 'Copy ID', copy_code: 'PUBLIC-ID-123' });
await send({ type: 'cta_call', title: 'Call support', phone: '+6281234567890' });
await send({ type: 'list', title: 'Command', items: [{ title: 'Profile', id: 'wsk:cmd:.profile' }] });
await send({ type: 'carousel', cards: [cardA, cardB] });
await send({ type: 'ai_rich_response', title: 'Summary', text: 'Structured summary' });
await send({ type: 'event', event: { name: 'Meetup', startDate: new Date('2026-12-01T12:00:00Z'), call: 'audio' } });
await send({ type: 'media', mediaType: 'video', media: videoBuffer, caption: 'Result' });
await send({ type: 'media', mediaType: 'ptv', media: videoBuffer });
await send({ type: 'media', mediaType: 'video', media: videoBuffer, viewOnce: true });
```

## `.waform` command catalogue

```text
.waform                    open button-based Message Lab
.waform help               command syntax and cautions
.waform quick              three quick replies
.waform mixed              quick reply + WebView CTA + recommendation list
.waform list               live ten-command recommendation list
.waform url <https://...>  external URL CTA
.waform webview <https://...> WebView-request CTA
.waform copy <public-code> CTA Copy
.waform dialer <+628...>   opens phone dialer only
.waform call audio|video | <name> | <YYYY-MM-DDTHH:mm> | [description]
.waform event <name> | <start ISO> | <end ISO> | [description]
.waform catalog             open connected Business catalog
.waform template            Hydrated Template Buttons (legacy)
.waform legacy-buttons      ButtonsMessage response-only legacy format
.waform card                Native Flow card
.waform ai-rich <title> | <summary> AIRichResponse protobuf
.waform carousel            2-card CarouselMessage test
.waform poll                native poll
.waform contact <name> | <+phone>
.waform location <lat> | <lon> [| name] [| address]
.waform table               AIRichResponse table (fallback text)
.waform code <language> | <source> AIRichResponse code (fallback fenced text)
.waform product <productId> | <title> | <description> | <currency> | <price> | <retailerId> | <image>
.waform media <ptv|voice|gif|viewonce-image|viewonce-video> | <filename>
```

Product demo files must be in `data/whatsapp-products/`; media files must be in `data/whatsapp-media/`. Product sending stays disabled unless `WHISKAY_WHATSAPP_BUSINESS_CATALOG_ENABLED=true` and uses real Business product data. Never use demo/fabricated IDs, prices, product images, or catalog owners.

## AI Rich Response is not a normal card

AIRichResponse is a protobuf branch: `Message.botForwardedMessage.message.richResponseMessage`. The message may include `messageContextInfo.botMetadata`, `messageType`, typed `submessages`, `unifiedResponse.data` (JSON data encoded as base64), and a `contextInfo` with the real quoted message. WHISKAY adds a neutral disclaimer/capability metadata, does not set a static bot JID, and does not claim to be Meta AI. It remains protocol/client-dependent; if a client does not render it, use `.waform card` or ordinary text fallback.

## Carousel context and envelope

Carousel payload is `interactiveMessage.carouselMessage` with two to ten card-level `InteractiveMessage` objects. Each card owns a header/body/footer and nativeFlowMessage actions. WHISKAY adds root `contextInfo` (`mentionedJid`, `groupMentions`, forwarding fields) and `messageContextInfo` device-list metadata, then relays with the Business/Native Flow node envelope (`biz`, `interactive`/`native_flow` and version metadata). This follows the Baileys serialization approach; it does not guarantee all clients render card media/actions consistently.

## Additional nodes and call distinction

Native Flow relay attaches the `biz` and `interactive`/`native_flow` nodes through Baileys `relayMessage` options. Old `ButtonsMessage` is a separate message type and has no external CTA support here. `cta_call` opens the phone dialer. `.waform call audio|video` creates a timed EventMessage only when `sock.createCallLink` exists; it never places a direct call to another person.

## Incoming media and `.remini`

The serializer unwraps Baileys message wrappers (ephemeral, view-once, document-with-caption, device-sent and supported associated wrappers), detects video/PTV and media in quoted messages, and extracts captions from image/video/PTV/document/audio payloads. `.remini` prefers a direct attached video; if the command message is text and quotes a video, it uses the quoted descriptor. Media bytes are downloaded only by the plugin that needs them and under that plugin's size limits.

## Limits and safety

- Native Flow: 1–10 buttons; list: up to 10 sections and 20 rows/section.
- Carousel: 2–10 cards. Hydrated Template/legacy ButtonsMessage: max 3 buttons.
- Poll: 2–12 options. Contact: 1–10 vCards.
- CTA and WebView URLs must be HTTPS. CTA Copy refuses common secret/token patterns.
- Media sending accepts Buffer, Uint8Array, or a local path, not arbitrary remote URLs. Local paths are checked as regular files, capped at 64 MiB, and converted to Buffer before Baileys receives them; raw path strings are not passed into Baileys' stream resolver. Incoming media uses bounded Baileys download streams.
- Product Message requires real Business/catalog data; generic fabricated products are rejected.
- View Once/Ptv/Event/Carousel/AIRichResponse must be checked on the actual WhatsApp clients in use. A local relay acknowledgement is not proof of client rendering or delivery.
- Fake quote/sender identity, fake Meta AI forwarding attribution, fake payment/order, fake status, and live-location spoofing are not supported.

## Useful diagnostics

`.wacapabilities` describes supported formats. `.waform` and `.waform help` open the same Single Select Message Lab; the help variant includes the full syntax reference in the body. `.plugins` browses the active command registry. `.mediainfo` describes the current attachment or quoted media.

## Source basis

The serializer adapts the owner's supplied Baileys helper files but does not import their CommonJS runtime directly. Baileys v7 source types/serialization are used for `event`, `product`, `ptv`, `viewOnce`, InteractiveMessage carousel and AIRichResponse protobuf fields. Client rendering remains an integration test, not a unit-test claim.
