# WHISKAY v0.10.9 — Owner-Only Group Mode & Content-to-Follower Intelligence

**Release date:** 7 November 2026  
**Version:** 0.10.9  
**Runtime:** Node.js 22.5–22.x, npm 10+

## Summary

v0.10.9 adds explicit runtime access modes and per-content Instagram Insights analysis. Group command handling can now be enabled for the owner's self-bot account without making group commands public to every participant. The next stage of organic growth reporting connects per-content reach, profile visits, follows and engagement to format/theme comparisons.

## Added — access mode

- Added `src/lib/runtime-mode.mjs`, a durable runtime mode store with schema validation, atomic state writes and private permissions.
- Added built-in owner-only `.mode status`, `.mode self`, `.mode public`, and `.mode groups on|off` commands.
- `self` mode retains strict owner identity checks; `allowGroups` on accepts only the owner identity in a group.
- `public` mode denies all group commands and exposes only `help`, `menu`, `igservices`, and `igservice` in private chat.
- Public menu output is filtered; account stats, campaign mutations, orders, credits, referral controls and mode controls are not exposed.
- Mode updates persist to `data/runtime-mode.json` and survive restart.

## Added — content intelligence

- Added `src/growth/content-intelligence.mjs` with pure calculations for profile visit rate, visit-to-follow conversion, reach-to-follow, engagement, save/share rate and follows per 1,000 reach.
- Added `.igcontent add`, `.igcontent list`, `.igcontent report`, and `.igcontent compare`.
- Added weighted comparison by content format and theme; ranking is based on follows per 1,000 reach with follows as tie-breaker.
- Added normalized URL deduplication and up to 90 metric snapshots per content URL.
- Added optional campaign association for each piece of content.

## Changed

- Growth JSON store envelope moves from version 2 to version 3. Existing ledger, order, campaign, and idempotency fields are retained; `contentPosts` is added and defaults to an empty array.
- The sample configuration bootstraps `mode: self`, `runtimeModeFile`, and `allowGroups: true`. Existing operator config remains unchanged; current `allowGroups` becomes the bootstrap default until runtime state exists.
- Startup displays effective runtime mode and owner-only group availability.
- Anti-spam keys distinguish `.mode` subcommands so separate mode settings can be applied consecutively without disabling anti-spam protection.

## Files added

- `src/lib/runtime-mode.mjs`
- `src/growth/content-intelligence.mjs`
- `test/runtime-mode.test.mjs`
- `test/content-intelligence.test.mjs`
- `docs/MODE-AND-GROUP-ACCESS.md`
- `docs/CONTENT-TO-FOLLOWER-INTELLIGENCE.md`
- `docs/releases/RELEASE-NOTES-v0.10.9.md`
- `docs/upgrades/UPGRADE-v0.10.9.md`
- `docs/qa/QA-REPORT-v0.10.9.md`

## Files changed

- `src/config.mjs`, `src/commands.mjs`, `src/growth/store.mjs`, `src/plugins/instagram-growth.mjs`, `index.mjs`
- `config/app.example.json`, `package.json`
- `README.md`, `docs/CHANGELOG.md`, `docs/ARCHITECTURE.md`, `docs/BAILEYS-RUNTIME.md`, `docs/CONFIGURATION.md`, `docs/SECURITY.md`, `docs/PROJECT-STRUCTURE.md`, `docs/FOLLOWER-GROWTH-PLAYBOOK.md`, `docs/GROWTH-CAMPAIGNS.md`

## Security and limitations

- Admin status in a WhatsApp group is not sufficient authorization; group commands require the configured owner identity.
- Public mode is deliberately private-chat-only and read-only. It does not permit public group usage.
- All content metrics are manually supplied from per-content Insights. This release does not add Meta OAuth, scraping, auto-follow, or artificial follower delivery.
- Per-content follows are indicative as reported by Instagram Insights; they are not guaranteed causal attribution.

## Data and migration

- Existing growth DB v1/v2 files are read compatibly and written in v3 format on the next mutation.
- New content records live in the same private growth JSON database; no separate database is introduced.
- Runtime mode is stored separately in `data/runtime-mode.json`.
- WhatsApp/Instagram sessions, `.env`, `config/app.json`, and database files are not included in the source ZIP.

See [Upgrade v0.10.9](../upgrades/UPGRADE-v0.10.9.md) and [QA Report v0.10.9](../qa/QA-REPORT-v0.10.9.md).
