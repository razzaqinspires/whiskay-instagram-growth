# QA Report — WHISKAY v0.10.9

**Release:** 0.10.9  
**Date:** 7 November 2026  
**Environment:** Node.js 22.16.0, npm 10.9.2  
**Test runner:** Node.js built-in `node:test`

## Test suite

| Suite | Coverage |
|---|---|
| `test/runtime-mode.test.mjs` | Runtime mode validation/persistence; owner-only group authorization; group block in public; private read-only public allowlist; non-owner mode-command denial |
| `test/content-intelligence.test.mjs` | Metric formulas; weighted format/theme comparison; normalized media URL; campaign association; snapshot history; input validation; `.igcontent add` and `.igcontent compare` |
| Existing test suites | WhatsApp PN/LID owner authorization, Baileys runtime, anti-spam, plugins, native flow, Instagram safety/read-only bridge, campaigns/goals/funnel, provider adapter, SQLite queue, referrals and redaction |

## Results

**139 tests passed, 0 failed** in the completed `npm test` run.

The 12 new tests are:

- 4 runtime mode and group-policy integration tests.
- 7 content intelligence, storage, migration, validation, and command tests.
- 1 configuration validation test for the runtime mode setting.

The run also reports Node's standard experimental warning for `node:sqlite`; it is not a failing test.

## Focused behavior verified

- Self mode starts with group access off unless bootstrap/runtime state turns it on.
- Turning groups on allows a command from the authenticated owner in a group.
- The same path does not permit non-owner group participants.
- Public mode rejects group messages even if `allowGroups` is true.
- Public mode permits only the defined private read-only command allowlist.
- Public menu output does not expose owner-only commands.
- A non-owner cannot run `.mode public` or alter stored mode.
- Runtime mode survives store recreation/reload and rejects invalid mode values.
- Content ratios handle normal metrics and zero denominators in the calculation module.
- Same media URL updates a single content record and appends a snapshot.
- Media URLs normalize away share tracking query values and reject non-Instagram hosts.
- Campaign association must refer to a real campaign.
- Format/theme rollups use sums before ratio calculation.

## Static and documentation checks

- `npm run check`: 78 JavaScript files passed syntax validation.
- `npm run docs:check`: 60 Markdown documents directly indexed by README; all local links resolve; 16 maintained scripts are inventoried; no archive/backup/log remains in the source tree.
- Package installation was attempted but the network operation timed out; this environment did not complete a fresh `npm install`. The test suite itself completed using Node.js built-in modules and test doubles.

## Scope not covered

- No live WhatsApp account was paired by this test run.
- No real group message was sent through the production Baileys socket.
- No live Instagram Insights fetch or Meta OAuth operation was performed.
- No causal attribution experiment was performed; analytics input is manual.
- No dependency vulnerability audit was run as part of this test report.

## Conclusion

The local automated test suite passes. Owner-only group handling and per-content analytics are verified by deterministic tests. Production WhatsApp delivery, account-specific JID variations and live Instagram Insights values must still be checked by the operator in their own environment.
