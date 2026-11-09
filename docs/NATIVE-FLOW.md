# WHISKAY Native Flow and WhatsApp message formats

Native Flow is one family of WhatsApp interactive messages; it is not the correct transport for every other message shape. WHISKAY uses separate builders for Native Flow, CarouselMessage, AIRichResponse, legacy Template Buttons, ButtonsMessage, Poll, Event, Product and media.

## Recommended mapping

| User intent | Correct command/format | Important distinction |
|---|---|---|
| One quick bot action | `quick_reply` | Returns a command action ID to normal authorization. |
| Many command options | `single_select` | Use `.menu`, `.plugins`, `.waform`, or `.igcampaign` menus. |
| External link | `cta_url` | Normal HTTPS URL. |
| Embedded webpage request | `webview_url` | Still a CTA URL, with `webview_interaction: true`; client may fall back to browser. |
| Copy public code | `cta_copy` | Public identifier only; no secrets. |
| Call a phone number | `cta_call` | Opens device dialer. It does not place a WhatsApp call. |
| Open Business catalogue | `cta_catalog` | Requires a connected catalogue. Uses the dedicated Native Flow binary descriptor; not a ProductMessage. |
| Request user location | `send_location` | Explicit user action through WhatsApp UI; experimental and client-dependent. It does not read device location silently. |
| Backward compatibility | Hydrated Template Buttons | Up to three quick reply/URL/call actions. |
| Old response buttons | `ButtonsMessage` | Separate legacy protobuf, up to three quick replies only. |
| Card with normal interactive actions | Native Flow card | Header/body/footer plus buttons. Not AI Rich. |
| Structured rich AI response | AIRichResponse protobuf | `botForwardedMessage.message.richResponseMessage`; experimental client rendering; no fake Meta AI identity. |
| Horizontal cards | `InteractiveMessage.carouselMessage` | Two to ten cards; context metadata is on the root InteractiveMessage. |
| Votes | Baileys Poll | Native poll create/update flow. |
| Timed event/call | EventMessage | Schedule event; optional audio/video call join-link creation. Not a direct call. |
| Product listing | ProductMessage | Real Business catalog identity and product fields only. |

## Main `.menu`

Three Mixed Native Flow buttons: `.profile` quick reply (alias of `.igprofile`), WHISKAY Channel WebView CTA, and a ten-row recommendation Single Select. The main menu body now includes the full active command catalogue when it fits the safe body budget; otherwise the full catalogue follows as bounded text messages. `.plugins` remains the paginated command picker. Recommendations are a discovery view, not the complete command list. The original inbound WAMessage is quoted through Baileys; `pushName` is preserved in the greeting. The external-ad preview uses an attached WHISKAY thumbnail and the channel title/description/source URL. That bundled thumbnail is a designed preview, not the WhatsApp Channel's verified profile image. To use a genuine thumbnail, set `WHISKAY_CHANNEL_THUMBNAIL_URL` to an HTTPS image you control.

## Command menu

`.waform` opens a Single Select Message Lab with the complete list of demos. Each sample command now has a deterministic default payload, so `.waform ai-rich`, `.waform code`, `.waform contact`, `.waform location`, `.waform media`, `.waform event`, `.waform call`, `.waform url`, `.waform webview`, `.waform copy`, and `.waform dialer` can be run without manually supplying sample arguments. `.plugins` opens a paginated Single Select directory of all registered commands; `.plugins text` remains available for compatibility. `.igcampaign` opens a campaign operation menu. `.remini help` and `.acad help` are button-based command guides. A button whose command needs an ID/file/text leads to a normal format/confirmation prompt—it must not fabricate missing arguments or bypass confirmation.

## Carousel implementation notes

- Root message shape is `messageContextInfo` plus `interactiveMessage`.
- Root `interactiveMessage.contextInfo` includes empty `mentionedJid`/`groupMentions` arrays and forwarding context defaults; it is not put only inside individual cards.
- `carouselMessage` uses `cards`, `messageVersion: 1`, and `carouselCardType: HSCROLL_CARDS` (numeric value 1 in current Baileys WAProto).
- A card uses an InteractiveMessage-style header/body/optional footer and its own NativeFlowMessage button data. Each card can contain one local image or video; image and video cannot be set together.
- Card media is prepared via `prepareWAMessageMedia` and Baileys `waUploadToServer`; arbitrary remote media URLs are refused.
- Root envelope is relayed using the `biz`/`interactive`/`native_flow` nodes. Carousel defaults to a normal interactive message, not View Once.

A relay transport error is now propagated instead of triggering an automatic text fallback, because a timeout can happen after WhatsApp has already accepted the message and a fallback could duplicate it. Text fallback is reserved for local validation/build/media-preparation errors. The protocol shape matches Baileys' current WAProto schema, but a correctly serialized message is not proof of mobile rendering. Test card image, body, action, and fallback on the recipient's WhatsApp build.

## AIRichResponse implementation notes

AIRichResponse is **not** a title/body Native Flow card. The payload contains:
- `messageContextInfo` with thread/device metadata, a 32-byte message secret, and WHISKAY's neutral `botMetadata` disclaimer/capabilities;
- `botForwardedMessage.message.richResponseMessage`;
- `messageType: 1`;
- typed submessages (`TEXT`, `CODE`, `TABLE` as supported by the current protobuf enum);
- `unifiedResponse.data`, which carries JSON UI sections as base64. Each ordinary Single layout uses `{ view_model: { primitive, __typename: 'GenAISingleLayoutViewModel' } }`; do not wrap every primitive in `GenAIUnifiedResponseSection`;
- `contextInfo` with the actual quoted WAMessage when the caller supplied one. The payload is relayed directly with `sock.relayMessage`, matching the working AIRich builder transport rather than routing it through regular message generation.

The user-supplied helper used a fixed `botJid` and forwarded-AI metadata; WHISKAY intentionally omits these identity fields. Do not set a fictitious Meta AI bot name/JID or forward origin. AIRichResponse is an experimental/private protocol surface and may render as a raw/unsupported message on some WhatsApp versions.

## Product, call and view-once

- `ProductMessage` uses the Baileys `product` content, not a generic interactive list. WHISKAY requires explicit `WHISKAY_WHATSAPP_BUSINESS_CATALOG_ENABLED=true`, valid owner JID, actual product/catalog identifiers, currency, `priceAmount1000`, and a local product image. `.waform product` without arguments selects the first real product returned by `sock.getCatalog()` and uses `assets/whatsapp-media-demo/whiskay-demo-viewonce-image.jpg` as its sample image. It never invents product IDs or prices. `getCatalog()` can time out or return an empty result in some sessions (upstream issue #2717); the sample reports that state instead of fabricating a product.
- `EventMessage` uses the Baileys `event` content. When `event.call` is `audio` or `video`, Baileys asks `sock.createCallLink`; this is an invitation/link for a scheduled event, not an instant one-to-one call.
- PTV is a video payload with `ptv: true`. View Once is `viewOnce: true` on supported image/video sends. Neither should be treated as a delivery/render guarantee; test on the real client.

## Commands

```text
.waform
.waform help
.waform mixed
.waform quick
.waform list
.waform card
.waform ai-rich
.waform code
.waform contact
.waform location
.waform media
.waform event
.waform call
.waform carousel
.waform template
.waform legacy-buttons
.waform catalog
.waform call audio | Project demo | 2026-12-01T18:00
.waform event | Meetup | 2026-12-01T18:00 | 2026-12-01T19:00
.waform media ptv | sample.mp4
.waform media viewonce-video | sample.mp4
.wacapabilities
```

For the complete router API and limits, see [WhatsApp Message Router](WHATSAPP-MESSAGE-ROUTER.md).


## Special Native Flow actions

- `cta_catalog` and `send_location` are normalized as explicit special flow names. The binary `native_flow` descriptor uses version 2 and the corresponding name, rather than always sending the generic `mixed` version 9 descriptor.
- `.waform send-location` is a tester sample. It asks the recipient to share their location via WhatsApp UI; WHISKAY does not read GPS/device location without the recipient's action.
- Payment/order flows (`review_and_pay`, `payment_info`, `mpm`) remain deliberately unavailable in the generic builder because they require server-validated business/payment structures.
- Caller-supplied `additionalNodes` cannot add duplicate reserved `biz` or `bot` nodes; the serializer owns those nodes.
