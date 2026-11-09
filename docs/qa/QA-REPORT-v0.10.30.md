# QA Report v0.10.30

## Scope

- Delivery tracker: outbound method instrumentation.
- `messages.update` status mapping.
- `message-receipt.update` per-recipient timestamps.
- Ambiguous relay failure behavior.
- TTL and bounded cache.
- `.wadelivery` command surface.
- Broadcast/status LID-to-PN cross-pair restricted to `@broadcast`.

## Targeted tests

`node --test test/message-delivery-tracker.test.mjs test/lid-manager.test.mjs test/plugin-button-help.test.mjs`

**21/21 tests passed.**

## Source and documentation checks

- `npm run check`: 124 JavaScript files passed syntax validation.
- `npm run docs:check`: 140 Markdown documents indexed; links, active release docs, script inventory (19 scripts), and source-tree archive checks passed.

## Full project suite

`npm test`: **318 passed, 3 failed, 321 total**.

The 3 remaining failures are pre-existing legacy Growth order/queue inconsistencies in the uploaded v0.10.29 source:

1. `test/order-engine.test.mjs` — legacy order engine import/config incompatibility.
2. `test/part4-integration.test.mjs` — expects retired Growth order/queue entrypoints to be absent while those legacy source files remain in this archive.
3. `test/sqlite-queue.test.mjs` — `config.growth.queue` is undefined in the active config.

These are not failures in the delivery tracker, LID mapping, or `.wadelivery` tests. They remain explicitly unresolved and are scheduled for the integration/cleanup part rather than being hidden or marked as passed.

## Runtime limitations

No live WhatsApp session or recipient-device rendering test was run. Unit tests use a mocked socket/event emitter. Baileys delivery events are best-effort; privacy settings and chat type can limit receipt visibility. No live `messages.update`/receipt sequence was captured from the user's account.
