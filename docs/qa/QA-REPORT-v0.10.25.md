# QA Report — WHISKAY v0.10.25

Date: 8 November 2026

## Source baseline

QA was run against the user-supplied `wbself.zip` after reconciling its contents with the v0.10.25 release records. The archive initially still contained retired promotion order/provider/queue files, the old self-bot/LID manager, and the old referral worker folder. Those files contradicted the documented active architecture and were removed. The cleanup preserves the active WhatsApp supervisor, dynamic plugin registry, organic Growth catalog/store, current referral implementation, QA adapter, and vendor reference material.

The full file-by-file removal rationale and source-package boundaries are recorded in [Source Audit & Cleanup](SOURCE-AUDIT-v0.10.25-2026-11-08.md).

## Automated results

**Final result: 264/264 tests passed.**

| Check | Result |
|---|---|
| `npm run validate` | PASS — temporary config with dummy owner/pairing numbers; no real account data. |
| `npm run check` | PASS — 107 JavaScript files syntax-validated. |
| `npm run docs:check` | PASS — 119 docs indexed; 16 maintained scripts catalogued. |
| `npm test` | PASS — 264 passed, 0 failed. |
| `npm run runtime:smoke` | PASS — 11 plugins, 32 commands, required aliases and no duplicate command keys. |
| `npm run security:permissions` | PASS — isolated workspace permissions normalized. |
| `npm run test:coverage` | PASS — 68.93% statements, 72.33% branches, 75.25% functions overall. |

Runtime smoke was also checked against a clean source tree without operator config: missing WhatsApp owner/pairing numbers are classified as `SETUP`, not a plugin-registry failure. Strict setup validation remains `npm run validate`.

## Issues corrected

The pre-cleanup full suite had 3 failing test-file entries: `test/order-engine.test.mjs` failed because the current organic Growth store no longer exports `createOrder`; `test/sqlite-queue.test.mjs` failed because the current normalized config no longer has `config.growth.queue`; and the Part 4 boundary test failed because the supposedly retired source files were still present in the uploaded archive. The stale tests and implementation were removed instead of restoring obsolete order, wallet, provider, or queue behavior.

`npm run docs:check` also initially failed because `scripts/worker.mjs` and `scripts/queue-health.mjs` remained in the source but were not listed as maintained utilities. Both orphan scripts were removed, bringing the source tree and documentation back into agreement.

## Coverage interpretation

Coverage is not a dead-code detector. The dynamic plugin loader registers all 11 plugins and 32 commands. Several interactive command handler modules show low statement execution coverage because tests focus on their service contracts, payload builders, and registry, not every owner-driven WhatsApp interaction. These active modules were retained. More handler-level tests are recommended before refactoring their internals.

## Dependency and live-test boundaries

The `npm install --ignore-scripts` attempt timed out in this environment. No `npm audit` result is claimed, and no `package-lock.json` was present in the supplied archive. The Node built-in test suite completed successfully, but production dependency installation remains an operator-side verification step.

No live WhatsApp, Instagram, TikTok provider/CDN, or AI gateway requests were made. No production server, credentials, sessions, or runtime data were modified.
