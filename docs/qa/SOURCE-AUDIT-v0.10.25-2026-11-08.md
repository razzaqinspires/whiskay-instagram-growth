# Source Audit & Cleanup — WHISKAY v0.10.25

Date: 8 November 2026  
Input: user-supplied `wbself.zip`  
Package metadata: `whiskay-instagram-growth@0.10.25`

## Scope and handling

The archive was inventoried across the runtime entrypoint, `src/`, plugins, adapters, media services, scripts, tests, configuration templates, documentation, assets, and vendor references. The uploaded archive also contained operator/runtime material (`.env`, `config/app.json`, and a SQLite file). Their contents were not included in this audit report and those files were excluded from the cleaned source release. `.env.example` and `config/app.example.json` remain.

The cleanup was limited to code that was already documented as retired or had no active runtime role. No active WhatsApp, Instagram, referral, TikTok, AI-scrape, academic-review, YouTube Music, media, or organic Growth feature was removed based only on low test coverage.

## Inventory and structural findings

- The original ZIP contained 305 archive entries.
- The active project has a single foreground entry flow: `npm start` → `scripts/start.mjs` → `index.mjs` → `src/wa.mjs` and the dynamic plugin registry.
- The plugin loader discovers files under `src/plugins/` dynamically. A plugin having no static import from `index.mjs` is therefore not evidence that the plugin is unused.
- `src/growth/catalog.mjs` is used by the organic Instagram Growth plugin and was retained. `src/growth/store.mjs`, `funnel.mjs`, `content-intelligence.mjs`, and `session-target.mjs` remain active organic-growth modules.
- `src/adapters/` remains as a loopback QA adapter, referenced by its regression test and QA documentation; it is not an Instagram transport.
- `vendor/baileys-serializer-reference/` remains as audit/reference material documented as owner-provided source. It is not imported by the active runtime.
- Empty `src/analytics/` and `src/instagram/` directories were removed.

## Removed files

| Removed path | Reason |
|---|---|
| `src/growth/order-engine.mjs` | Retired promotion-order behavior; also imported store exports that no longer exist. |
| `src/growth/provider-adapter.mjs` | Retired SMM/provider-delivery behavior. |
| `src/growth/redis-queue.mjs` | Retired queue adapter; required packages are not project dependencies. |
| `src/growth/sqlite-queue.mjs` | Retired order queue; normalized `config.growth` has no queue configuration. |
| `src/growth/worker.mjs` | Worker for retired order/queue flow. |
| `scripts/worker.mjs`, `scripts/queue-health.mjs` | Entrypoints/diagnostics with no supported current runtime target. |
| `test/order-engine.test.mjs`, `test/provider-adapter.test.mjs`, `test/sqlite-queue.test.mjs` | Tests for retired functionality; two suites failed at import time against the current organic-only config/store contract. |
| `src/selfbot.js` | Legacy second WhatsApp entrypoint that could create another socket outside the active supervisor. |
| `src/lib/lid-manager.js` | Old LID manager used only by the retired self-bot; active runtime uses `src/lib/lid-manager.mjs`. |
| `referral-module/` | Old referral attribution worker generation; current referral contract lives under `src/referral/`. |

The historical queue documents remain for traceability and are marked as archives, not active procedures.

## Maintained structure

- `index.mjs`: application entrypoint.
- `scripts/`: 16 maintained operational, validation, packaging, and setup scripts; all are indexed in `docs/guides/SCRIPTS-REFERENCE.md`.
- `src/plugins/`: 11 dynamically discovered plugins exposing 32 commands in the inspected runtime registry.
- `src/lib/`, `src/media/`, `src/ai/`, `src/academic/`, `src/referral/`, `src/security/`, `src/growth/`: shared runtime logic grouped by responsibility.
- `test/`: active Node Test Runner suites, including integration regression checks for the retired-file boundary.
- `docs/`: historical and current documentation, indexed from root `README.md`.

## Release packaging convention

`npm run package:release` now derives both the archive file name and the top-level folder from `package.json`:

```text
<package.json.name>-v<package.json.version>.zip
```

For this package, the expected output is `whiskay-instagram-growth-v0.10.25.zip`. The release packager excludes `.env`, `config/app.json`, sessions, `auth_ig/`, `data/`, databases, archives, backups, `node_modules/`, Python virtualenvs, and Git metadata. It includes the example configuration files.

## Verification

| Check | Result |
|---|---|
| `npm run check` | PASS — 107 JavaScript files syntax-checked. |
| `npm run docs:check` | PASS — 119 Markdown documents indexed; all 16 maintained scripts documented. |
| `npm test` | PASS — 264 tests passed, 0 failed. |
| `npm run validate` | PASS — tested with a temporary config using dummy owner/pairing numbers; no real account values used. |
| `npm run runtime:smoke` | PASS — 11 plugins, 32 commands, required commands/aliases, and no duplicate command keys. |
| `npm run security:permissions` | PASS — isolated workspace permissions normalized. |
| `npm run version:check` | PASS — reports `whiskay-instagram-growth@0.10.25`. |
| `npm run test:coverage` | PASS — 68.93% statements, 72.33% branches, 75.25% functions overall. |

The coverage report shows low execution coverage for some command-handler modules, especially Instagram and the interactive WhatsApp plugins. This is not proof that those functions are unused; they are retained because the plugin loader loads them dynamically and they are active product features. Additional handler-level tests should be added before refactoring those paths.

An `npm install --ignore-scripts` attempt timed out in the audit environment, so dependency installation and `npm audit` could not be completed here. The test suite ran using Node's built-in test runner and the available environment. The archive has no `package-lock.json`; dependency graph reproducibility remains an open maintenance item.

## Not verified

- No live WhatsApp pairing, connection, outbound message, or cross-device rendering test was performed.
- No Instagram login or API request was performed.
- No external TikTok resolver/CDN or AI scrape gateway was contacted.
- No production server files or sessions were modified.

These checks require the operator's server, credentials, and controlled test accounts and are deliberately outside this source-only cleanup.
