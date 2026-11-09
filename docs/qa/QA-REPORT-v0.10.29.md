# QA Report — v0.10.29

## Scope
Native Flow, special flow descriptors, message router, `.waform`, carousel image/video preparation, and relay error handling.

## Targeted tests

- `test/native-flow.test.mjs`
- `test/plugin-button-help.test.mjs`
- `test/whatsapp-message-router.test.mjs`

Result after the final regression addition: **56/56 passed**.

Covered: command action IDs; quick reply/CTA/list normalization; `send_location`; dynamic `biz > interactive > native_flow` descriptors; private/group `bot` node; carousel card constraints; image/video media preparation; no duplicate fallback on relay errors; no caller duplicate `biz`/`bot` nodes; AIRich separation; legacy button transports; message router integration.

## Full project test suite

`npm test`: **316 passed / 3 failed / 319 total**. The three failures are pre-existing legacy Growth/SQLite integration mismatches in `test/order-engine.test.mjs`, `test/part4-integration.test.mjs` (expects retired promotion-order/queue entrypoints absent), and `test/sqlite-queue.test.mjs` (imports removed `config.growth.queue`). They are unrelated to Native Flow changes and are deferred to the cleanup/integration part.
- `npm ci` / actual Baileys rc14 runtime installation not repeated here.
- No live WhatsApp relay, server ACK, or recipient-side Android/iOS/Web rendering test was performed.
- Community iOS issue reports show media carousel rendering can vary by client build.

## Status

Payload construction and mock relay paths pass targeted regression tests. Live compatibility remains unverified.
