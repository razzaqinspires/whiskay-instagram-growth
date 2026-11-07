# WHISKAY v0.10.8 — Follower Growth Funnel & Organic Goals

**Release date:** 2026-11-06  
**Base version:** v0.10.7  
**Runtime:** Node.js 22.5–22.x, npm 10+

## Summary

v0.10.8 improves the measurement and planning side of authentic follower growth. It adds funnel conversion diagnostics, explicit organic follower goals, and bounded per-campaign Insights history. It does not add Instagram write operations or any mechanism that manufactures followers.

## Added

- `src/growth/funnel.mjs`: pure calculations for reach-to-profile-visit, profile-visit-to-follow, reach-to-follow, impressions per reached account, and follows per 1,000 reach.
- `.igfunnel <campaign-id>` / `.igconversion`: shows funnel metrics and diagnosis of the current zero-conversion stage.
- `.igcampaign goal <ID> <target_followers> <YYYY-MM-DD>`: stores an organic net-follower target and deadline.
- Campaign progress now displays funnel conversion, snapshot count, goal progress, days remaining, and required daily net follower pace.
- Up to 90 Insights snapshots are kept per campaign; the latest remains at `campaign.insights` for compatibility.
- The first campaign checkpoint can serve as a fallback baseline when a creation-time snapshot was unavailable.
- `docs/FOLLOWER-GROWTH-PLAYBOOK.md` documents commands, formulas, operating workflow, and interpretation limits.

## Changed files

| Path | Change | Purpose / benefit |
|---|---|---|
| `package.json` | Version `0.10.7` → `0.10.8`; description updated | Identifies the new release and feature scope |
| `src/growth/funnel.mjs` | New pure helper | Reusable, testable conversion calculations and diagnostics |
| `src/growth/store.mjs` | Insights history, goal storage, goal progress, fallback baseline | Preserves historical observations and quantifies goal pace |
| `src/plugins/instagram-growth.mjs` | New `.igfunnel` and `.igcampaign goal`; richer progress output | Makes the feature available over the existing owner-authenticated command path |
| `test/follower-funnel.test.mjs` | New formula and diagnostic tests | Guards division-by-zero, validation, and recommendation behavior |
| `test/growth-campaigns.test.mjs` | Expanded campaign store tests | Covers goal and history persistence |
| `test/plugin-loader.test.mjs` | Asserts new commands register | Detects plugin load regressions |
| `docs/GROWTH-CAMPAIGNS.md` | Updated command and data contract | Keeps operational documentation aligned |
| `docs/FOLLOWER-GROWTH-PLAYBOOK.md` | New feature guide | Provides workflow, formulas, and safety boundary |
| `docs/CHANGELOG.md` | Added v0.10.8 entry | Records release history |
| `README.md` | Updated version, command index, and docs links | Maintains central documentation index |
| `docs/releases/RELEASE-NOTES-v0.10.8.md` | New | Detailed release record |
| `docs/upgrades/UPGRADE-v0.10.8.md` | New | Upgrade/rollback instructions |
| `docs/qa/QA-REPORT-v0.10.8.md` | New | QA evidence and known limits |

## Data compatibility

No schema migration is required. Existing campaign records remain readable. Existing `campaign.insights` remains the latest snapshot. New history and goal properties are optional. No credential, session, or config format changes.

## Behavior and security

- All command entry still passes through the existing owner-authenticated command router.
- Insights values remain manually entered from Instagram Insights.
- Goal pace is arithmetic planning information, not a prediction or guarantee.
- No Instagram follow action, follower delivery, auto-like, mass DM, mass unfollow, or external provider behavior was added.
- Baileys remains isolated to WhatsApp command transport.

## QA

The complete `npm run qa` gate passed: config validation, 74 JavaScript syntax checks, 55 indexed Markdown documents, 16 maintained scripts, 127/127 tests, and private permission audit. The ZIP passed `unzip -t`; the extracted source also passed syntax check, docs check, and 127/127 tests. `npm run security:check` (npm audit) was not run and remains a separate release check. Full evidence is recorded in [QA Report v0.10.8](../qa/QA-REPORT-v0.10.8.md).
