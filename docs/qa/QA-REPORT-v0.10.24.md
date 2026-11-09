# QA Report v0.10.24 — AI Scrape Gateway

Date: 8 November 2026

## Scope

Tested the new opt-in HTTPS gateway adapter and owner-only `.aiscrape` plugin. No live provider was configured or contacted.

## Focused tests

- `test/irfan-scrape-adapter.test.mjs`: 16 tests covering configuration, default-disabled behavior, endpoint allowlist, URL/SSRF filters, DNS checks, prompt limits, exact request contract, secret-field exclusion, result normalization, response-size cap, HTTP auth/rate-limit handling, timeout, and setting validation.
- `test/ai-scrape-plugin.test.mjs`: 9 tests covering command registration, local help/status/info, CONFIRM gating, explicit URL/prompt handoff, per-sender/chat cooldown, safe provider errors, and WhatsApp output truncation.

Result: **25/25 focused tests passed**.

## Static and documentation checks

| Check | Result |
|---|---:|
| `npm run check` | 117 JavaScript files passed syntax validation |
| `npm run docs:check` | 115 Markdown documents indexed; links, version docs, scripts, and source-tree hygiene valid |
| Focused AI gateway tests | 25 passed, 0 failed |
| Full `npm test` suite | 273 passed, 2 failed, 275 total |

## Existing full-suite failures outside this change

The two full-suite failures are in the Growth order/queue subsystem, not the AI gateway:

1. `test/order-engine.test.mjs` cannot import `createOrder` because `src/growth/store.mjs` does not export it.
2. `test/sqlite-queue.test.mjs` cannot initialize because `config.growth.queue.databaseFile` is undefined in the current configuration contract.

These were already recorded as open failures during Part 2 and were not modified in Part 3. Their source modules are outside this change scope.

## Limitations

- `irfan-cpp` was not installed; its source, license, repository, maintainers, lifecycle scripts, transitive dependency tree, and npm provenance could not be verified from available sources. An `npm view` attempt timed out. The separate source URL supplied by the requester was unavailable to the build environment.
- The adapter contract is a WHISKAY-owned HTTP JSON gateway contract, not a claim that the supplied `Scrape.build()` package accepts the same wire format.
- Tests use mocked DNS and `fetch`; no live provider, API pricing, model output, or gateway retention policy was tested.
- Remote gateway SSRF defenses must be reviewed separately; local URL filtering cannot prove how a remote server resolves and fetches a target URL.
