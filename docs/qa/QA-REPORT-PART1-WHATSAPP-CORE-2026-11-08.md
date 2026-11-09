# Part 1 QA — WhatsApp Menu and Media Core

Date: 2026-11-08
Source: uploaded `wbself.zip`, package version `0.10.22`

## Scope

Part 1 repairs two confirmed runtime defects in the active WhatsApp source: the `.menu` command catalogue being omitted from the menu body, and local media paths being passed directly to Baileys as strings. TikTok scraper integration and `irfan-cpp` evaluation are intentionally deferred to later parts.

## Findings

1. `.menu` was intentionally implemented as a three-button discovery screen: Profile, channel WebView, and ten recommendations. The recommendation engine already uses lifetime hits, seven-day activity, freshness, exposure rotation, discovery boosts, and category diversity. The complete catalogue existed separately in `.plugins`; the menu did not render it.
2. `.waform media ptv` resolved a safe local path correctly, but `createWhatsAppMessageRouter().sendMedia()` assigned that path string directly to `content.video`. Baileys expects bytes or a media/stream descriptor, so the stream resolver attempted an `in` property lookup on a primitive string and raised the reported error.
3. AIRichResponse, table fallback, carousel, legacy ButtonsMessage, and ProductMessage are distinct transport paths. They should not be collapsed into a single Native Flow builder.
4. `getCatalog()` timeout is a separate upstream/session limitation. The existing 20-second timeout reports the problem without fabricating catalog items. No fake product IDs or prices were introduced.

## Changes

| File | Change | Purpose |
|---|---|---|
| `src/lib/menu-renderer.mjs` | Added `renderCommandCatalog()` and `chunkCommandCatalog()` | Render all canonical commands, aliases, usage and descriptions; split long catalogues on line boundaries. |
| `src/commands.mjs` | Added complete catalogue to `.menu` body when it fits; otherwise send bounded text chunks after the 3-button menu. | Preserve the three-button Native Flow design while making the entire command set visible. |
| `src/lib/whatsapp-message-router.mjs` | Added `normalizeOutgoingMedia()` and normalized media before `sendMessage()`. | Convert local file paths to Buffer; enforce regular file, no symlink, non-empty and 64 MiB maximum; continue rejecting remote URLs. |
| `test/menu-renderer.test.mjs` | Added catalogue metadata and chunk-bound tests. | Ensure aliases/usages/descriptions are not silently omitted and chunks fit limits. |
| `test/commands.test.mjs` | Added inline and overflow menu catalogue assertions. | Ensure all active commands appear either in the menu body or following messages. |
| `test/whatsapp-message-router.test.mjs` | Added local-path PTV regression and invalid-path tests. | Reproduce and prevent the original `stream` path error. |
| `docs/WHATSAPP-MESSAGE-ROUTER.md`, `docs/NATIVE-FLOW.md` | Updated transport and menu behavior docs. | Record the correct transport boundaries and new menu/media behavior. |

## Verification

Passed: **42/42 targeted tests** across `menu-renderer`, `whatsapp-message-router`, `command-recommender`, and `commands.test.mjs`. This includes the existing three-button menu and quote-context tests, full-catalog overflow/chunking, and local PTV media normalization.

Passed: `node scripts/check-source.mjs` — 109 JavaScript files (`.mjs`, `.js`, `.cjs`) passed syntax validation.

Passed: `node scripts/check-docs.mjs` — 107 documentation files are directly indexed in `README.md`; links, version docs, script targets, the 17-script inventory and source-tree hygiene checks passed.

The full repository test run is **not fully green**: 229/231 tests pass; `test/order-engine.test.mjs` and `test/sqlite-queue.test.mjs` fail during module import because `src/config.mjs` currently returns `config.growth` without the `queue` object, while `src/growth/sqlite-queue.mjs` and `src/growth/worker.mjs` expect `config.growth.queue`. This pre-existing growth-queue/config integration defect is outside the Part 1 menu/media patch and is recorded as an open finding; it has not been represented as a successful test.

Live WhatsApp delivery/rendering was not tested from this isolated source archive. Native Flow, PTV, AIRichResponse, carousel and ProductMessage client rendering remain dependent on the active WhatsApp client and session.

## Operational impact

- `.menu` can emit one or more additional plain-text catalogue messages only when the full command catalogue exceeds the inline body budget. The interactive menu remains three buttons.
- `.waform media` now reads a local path into memory and rejects files larger than 64 MiB. The `.waform` path validator currently imposes a stricter 40 MiB file cap.
- No database schema, WhatsApp session, Instagram session, environment secret, or third-party dependency was changed.

## Rollback

Restore the previous versions of the changed source files from the server backup or prior release. No runtime data migration is required.


## Superseding finding — Part 4

The two previously open Growth tests were traced to orphaned order/wallet/queue modules that contradicted the active v0.10.12 organic-only schema. Part 4 removed these obsolete modules/tests instead of restoring financial functionality. Campaign/content storage remains active. See `QA-REPORT-v0.10.25.md`.
