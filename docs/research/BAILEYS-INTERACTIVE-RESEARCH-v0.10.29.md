# Baileys Interactive & Native Flow Research — v0.10.29

Date: 2026-11-09  
Pinned dependency: `@whiskeysockets/baileys@7.0.0-rc14`

## Scope

This review covers WHISKAY outgoing Native Flow, Single Select, CTA, CarouselMessage, legacy template/buttons, response parsing, and `relayMessage({ additionalNodes })`. It does not claim live delivery or rendering.

## Upstream and community findings

1. The official WhiskeySockets repository warns that Baileys 7 introduced breaking changes and directs users to the v7 migration guide. The npm `latest` tag still resolves to `7.0.0-rc14` during this review; no dependency bump was made.
2. The current WAProto schema models `InteractiveMessage` as a oneof containing `nativeFlowMessage` or `carouselMessage`. Carousel cards are repeated `InteractiveMessage` values. `Header` supports document, image, video, JPEG thumbnail, location, and product media. `NativeFlowMessage` has repeated buttons and optional `messageParamsJson` / `messageVersion`.
3. A community helper for WhiskeySockets documents injecting `biz > interactive(type=native_flow) > native_flow` and adding `bot biz_bot=1` only for private chats. Its generic descriptor is `v=9,name=mixed`; special names such as `cta_catalog` and `send_location` use `v=2` with the special flow name. This is community-observed behavior, not a guarantee from WhatsApp or official Baileys docs.
4. A community compatibility report found text-only carousel and interactive messages behaved better than image-attached versions on iOS; native list had broader compatibility in that test. The report was closed as not planned, so it is evidence of observed client variance, not a confirmed protocol defect.

## WHISKAY changes

- `src/lib/native-flow.mjs`: dynamic binary flow descriptor, special `send_location`/`cta_catalog` handling, private-vs-group `bot` node decision, reserved node duplicate protection, relay-error propagation, and image/video carousel card preparation.
- `src/lib/whatsapp-message-router.mjs`: generic outgoing message type accepts `send_location`; guide and aliases updated.
- `src/plugins/whatsapp-tools.mjs`: `.waform send-location` sample and Message Lab entry.
- `test/native-flow.test.mjs`: descriptor selection, relay error semantics, reserved-node validation, and image/video carousel preparation.
- `test/whatsapp-message-router.test.mjs`: generic `send_location` route.
- `test/plugin-button-help.test.mjs`: Message Lab and sample command coverage.

## Important transport behavior

The old implementation caught both build and `relayMessage` failures and sent a text fallback. A relay timeout is ambiguous: WhatsApp may have accepted the message before the client observed the timeout. Sending a fallback in that case can duplicate a message and obscure the actual transport failure. v0.10.29 only falls back for local validation/build/media-preparation failures; relay failures propagate to the command handler.

`send_location` asks the recipient to share location through WhatsApp UI. It is not a silent location read. Payment and order flows are intentionally not exposed because they require real business/payment state.

## Validation limits

Unit tests validate the generated JavaScript payload shape and relay options with mocks. They do not validate WhatsApp server acceptance, message ACK state, or Android/iOS/Web rendering. Live device testing remains necessary, especially for carousel cards with image/video attachments.

## External references

- WhiskeySockets/Baileys repository and v7 breaking-change notice: https://github.com/WhiskeySockets/Baileys
- Baileys npm package/version listing: https://www.npmjs.com/package/@whiskeysockets/baileys
- WAProto interactive schema: https://github.com/WhiskeySockets/Baileys/blob/master/WAProto/WAProto.proto
- Community helper binary-node notes: https://github.com/zqdevelopers/zq_baileys_helper
- Cross-client interactive/carousel observations: https://github.com/itsliaaa/baileys/issues/25
