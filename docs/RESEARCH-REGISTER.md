> **Arsip historis — bukan spesifikasi fitur aktif.** Dokumen ini memuat riset rancangan layanan promosi/order/provider yang dihentikan pada v0.10.12. WHISKAY v0.10.25 tidak memiliki saldo, wallet, order, SMM delivery, atau provider engagement. Gunakan hanya untuk memahami keputusan sejarah; jangan mengaktifkan konfigurasi atau mengembalikan command yang dijelaskan di sini.

---

# Research Register — SMM Panel Architecture

## Source

User-provided research text: **Analisis Arsitektur Rekayasa Sistem SMM Panel dan Mekanisme Otomasi Pertumbuhan Media Sosial**. Domains named in the source: takipcimx.net, takipcikrali.com, takipciking.com, takipcipanelin.com, and takipcimx.com.

The document is treated as a technical research hypothesis and design input, not as independently verified evidence about the named websites. Claims about their actual internals (Havuz pools, stored session tokens, exact API usage, AMP, provider hierarchy, and worker operations) require direct technical evidence before being stated as facts.

## Findings transcribed from the supplied research

1. The source describes two broad commercial models: centralized account pools (`Havuz Sistemi`) and reseller panels that route orders to upstream providers using an SMM API v2-like contract.
2. It describes a multi-tier stack: web/backend, relational database, Redis/RabbitMQ queue, background workers, payment gateway, scheduler, and provider adapter.
3. It proposes an order lifecycle: Submitted → Pending → In Progress → Completed / Partial / Canceled, with pro-rata refunds for partial completion and full refunds for cancellation.
4. It documents common SMM API v2 actions: `services`, `add`, `status`, `balance`, and `refill`; typical `add` fields are service, link, quantity; status can accept one or multiple order IDs.
5. It recommends idempotency to prevent duplicate orders after network interruptions.
6. It discusses direct private mobile API automation, session/cookie pooling, HMAC signing, device fingerprint headers, residential proxy rotation, telemetry simulation, and automated follow/like/view/DM actions.
7. It lists `instagrapi`, `aiograpi`, `instagram-private-api`, and BullMQ-adjacent queue concepts/Laravel Horizon as relevant ecosystem components.

## Evidence and confidence

| Research statement | Treatment in this codebase | Confidence |
|---|---|---|
| Reseller API pattern and actions | Implemented as an explicit SMM API v2-compatible adapter for reviewed legitimate promotion services | Design pattern; provider-specific compatibility unverified |
| Queue and workers | Built-in SQLite queue and foreground-supervised worker process implemented; Redis and PM2 dependencies removed | Code-level implementation; live WhatsApp not tested here |
| Order state machine | Existing states retained and transitions enforced; provider submit only after owner approval | Implemented locally |
| Idempotency | Stable queue job IDs and local order idempotency key support | Implemented locally; external provider must support its own idempotency for end-to-end guarantees |
| Wallet reservation/refunds | Optional wallet reservation, partial refund arithmetic, full refund on cancel/failure | Implemented locally; payment settlement is not integrated |
| Named panel internals | Not inferred from public brand names or this research text | Unverified |
| Havuz token/session collection | Not implemented | Excluded: credential pooling/collection and use of other people's sessions creates account compromise and unauthorized action risks |
| Private endpoint signing, device spoofing, telemetry deception, proxy evasion | Not implemented | Excluded: bypass/evasion and deceptive automation |
| Follower/like/view/comment artificial delivery | Not supported by this provider adapter | Excluded: artificial engagement and metric manipulation |

## Implementation map (introduced in v0.8.3; current runtime v0.9.3)

- `src/growth/provider-adapter.mjs`: HTTPS form-encoded SMM API v2 transport (`services`, `add`, `status`, `balance`). Only `creator-collab` and `audience-promotion` are eligible; no fake follower/like/view/comment service IDs are accepted.
- `src/growth/sqlite-queue.mjs`: built-in SQLite queue with stable job IDs, transactional claim, bounded exponential retry, stale-job recovery, and bounded completed-job retention.
- `src/growth/worker.mjs`: local SQLite polling worker that submits approved orders and polls provider statuses.
- `src/growth/store.mjs`: local idempotency map, wallet reservation, order event history and partial/full refunds.
- `src/wa.mjs`: single-socket lifecycle, live message dispatch, reconnect/backoff and graceful close.
- `src/lib/lid-manager.mjs`: persistent LID↔PN mappings and safe event buffering while the map loads.
- `src/commands.mjs`: owner-only command parsing; `fromMe: true` is authorized from the authenticated socket PN, while `remoteJid` is treated as the destination and used for reply routing.
- `src/lib/process-supervisor.mjs` and `src/lib/reconnect-policy.mjs`: bounded process shutdown and reconnect timing.
- `config/app.example.json`: ordinary queue/provider settings. `.env` contains only secret credentials (`IG_PASSWORD`, `PROMOTION_PROVIDER_API_KEY`).

## Operational prerequisites and limitations

- A provider's actual endpoint, API key, terms, service catalog, and allowed service mapping must be reviewed by the owner. Do not use unknown provider endpoints or submit Instagram credentials to providers.
- Set `growth.providerEnabled` to `true` only after review; set `growth.providerServiceMap` only for legitimate campaign services.
- Node.js 22.5+ is required for built-in `node:sqlite`. No Redis server or Redis password is required. `npm start` launches bot and worker in the foreground in one terminal; Ctrl+C stops both. Use `npm run queue:health` for diagnostics.
- The local JSON ledger is single-process and is not safe as a shared multi-instance transactional database. For multi-instance production, migrate orders and wallet to PostgreSQL with database transactions/unique idempotency constraints before scaling workers.
- Provider status vocabularies vary. Unknown states are logged/left unchanged. Partial status is not automatically refunded until verified delivered/total quantities are available.
- This build does not include payment gateway callbacks, automatic top-up, provider refill, nor live production credentials.


## External technical research — Baileys runtime (5 November 2026)

This section is separate from the user-provided SMM-panel research above. It records upstream library documentation and an open issue relevant to the observed WhatsApp logs.

| Claim | External source | Treatment in WHISKAY | Confidence / limitation |
|---|---|---|---|
| `messages.upsert` contains an array and distinguishes live `notify` messages from older/backfill `append` messages. | Baileys event documentation: https://github.com/WhiskeySockets/docs/blob/main/quickstart.mdx and https://github.com/WhiskeySockets/Baileys/blob/master/src/Types/Events.ts | Dispatch only explicit `notify` batches; iterate all messages in each batch. | Documented event contract; exact user's live packet still needs runtime confirmation. |
| Baileys requires application-managed reconnect in `connection.update`; a logged-out `401` should not be retried as a normal network failure. | Baileys troubleshooting: https://github.com/WhiskeySockets/docs/blob/main/advanced/troubleshooting.mdx | `401` is terminal; transient disconnects use one bounded reconnect timer. | Official project documentation. |
| `440` is connection-replaced, `503` unavailable service, and `515` restart-required. | Baileys `DisconnectReason` definitions: https://github.com/WhiskeySockets/Baileys/blob/master/src/Types/index.ts | `440` stops this process to prevent competing sessions; `503`/`515` use reconnect handling. | Codes can differ for unlisted upstream or protocol errors; do not infer a corrupt session solely from `503`. |
| A report against Baileys 7.0.0-rc9 and master describes local pre-key files accumulating with repeated uploads/reconnects; it includes examples of `503 Service Unavailable Stream Errored (unknown)`. | Open upstream issue #2797: https://github.com/WhiskeySockets/Baileys/issues/2797 | Reduce avoidable reconnect churn; never prune local pre-key files from the application. | Community bug report, not proof of the cause of this user's particular disconnect. The report itself says deleting unused-looking pre-keys from outside the library is unsafe. |
| `Stream Errored (ack)` tied to a missing acknowledgment for status stanzas has also been reported for rc14. | Upstream issue #2858: https://github.com/WhiskeySockets/Baileys/issues/2858 | Keep this as a separate diagnostic possibility only when the actual error details match; no protocol bypass or ad-hoc acknowledgment patch is applied. | Open community report; not equivalent to the supplied `503` log. |

### Engineering decision

- Do not delete `pre-key-*.json`, `creds.json`, or any auth-state file to treat a transient `503`.
- Do not run recursive `stat`/`chmod` sweeps during `creds.update`; Baileys rotates pre-key files during normal operation.
- Keep a single socket lifecycle, one reconnect timer, jittered exponential delays, and only reset retries after a stable connection interval.
- Keep `fromMe: true` owner-authenticated messages eligible for dispatch, including commands sent to another private chat; the normal Baileys sample filters them because it demonstrates a reply-bot, whereas WHISKAY intentionally operates as an owner self-bot.
- Automated test success does not verify an account-specific live WhatsApp connection or delivery.


## External AI scraping package request — `irfan-cpp`

The requested CommonJS snippet describes `Scrape.build().scrape({ prompt, url, voucher, settings })`, with a model alias plus `token_router` and `light_house` domain fields. The source package identity, registry metadata, repository, license, lifecycle scripts, transitive dependencies, and actual request destinations could not be independently verified during this implementation. The code-host URL supplied for the TikTok scraper is a separate source and was also unavailable to the build environment.

**Decision:** do not add `irfan-cpp` to `package.json`, do not execute its install scripts, and do not send the supplied voucher/routing fields to any third party. Add only an opt-in owner-configured HTTPS gateway adapter with a documented request schema. This is a WHISKAY-owned integration boundary, not a claim of API compatibility with the uninspected npm package. Before adopting the package itself, obtain its exact tarball/source and verify the npm publisher/provenance, repository, license, scripts, dependencies, and runtime egress. npm documents provenance verification and `npm audit signatures`; a clean signature check is provenance evidence, not a guarantee that package code is safe.

Implementation: `src/ai/irfan-scrape-adapter.mjs`, `src/plugins/ai-scrape.mjs`, `test/irfan-scrape-adapter.test.mjs`, and `test/ai-scrape-plugin.test.mjs`.
