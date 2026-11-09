# Release Notes — WHISKAY v0.10.25

Date: 8 November 2026

## Integration

- Integrates the completed `.menu` catalogue and WhatsApp media router from Part 1 with the TikTok multi-provider downloader from Part 2 and the opt-in AI scrape gateway from Part 3.
- Keeps `.tiktok` aliases, metadata/media handling, custom provider chain, CDN download headers, and final TikWM fallback in one active plugin/service path.
- Keeps `.aiscrape` and its aliases behind the global owner authorization path and explicit `CONFIRM`; gateway remains disabled by default.
- Keeps `.waform` transports distinct: Native Flow, AIRichResponse/table, carousel, Legacy Buttons, ProductMessage, and PTV/media do not share an assumed payload format.

## Legacy Growth cleanup

- Removes the stale promotion-order engine, provider adapter, and SQLite/Redis queue/worker source modules; retains the organic strategy catalog.
- Removes `scripts/worker.mjs`, `scripts/queue-health.mjs`, and tests for the retired order/wallet/provider/queue behavior.
- Retains `src/growth/store.mjs` campaign/content schema v5. No wallet, balance, credit, ledger, budget, order, payment, or engagement-provider subsystem is reintroduced.
- The old `data/growth-queue.sqlite` file and operator `config/app.json` are not modified or packaged by this patch. Legacy Growth keys are ignored by normalized runtime configuration.

## Validation boundary

Unit/integration tests use local fixtures. This release does not claim live WhatsApp rendering, TikTok/TikWM uptime, or a live AI gateway connection. See the v0.10.25 QA report and upgrade guide.
