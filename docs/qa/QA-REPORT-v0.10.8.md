# QA Report — WHISKAY v0.10.8

**Date:** 2026-11-06  
**Scope:** Follower funnel analytics, organic follower goals, campaign store compatibility, plugin registration, source governance, and release packaging.

## Full QA result

<badge>QA gate passed</badge>

The complete `npm run qa` command finished successfully.

| Gate | Result | Evidence |
|---|---|---|
| Config validation | PASS | `[CONFIG] valid` |
| JavaScript syntax | PASS | 74 `.mjs` / `.js` / `.cjs` files |
| Documentation governance | PASS | 55 Markdown documents indexed; all local links valid |
| Maintained script inventory | PASS | 16 `.mjs` / `.sh` files documented |
| Unit and integration tests | PASS | 127 passed, 0 failed |
| Private permission audit | PASS | `[SECURITY] Permission aman` |

The focused feature tests cover:

| Test file | Coverage |
|---|---|
| `test/follower-funnel.test.mjs` | Formula, zero denominators, stage diagnostics, malformed and out-of-range metrics |
| `test/growth-campaigns.test.mjs` | Insights snapshots, history compatibility, baseline, in-progress/achieved/overdue goals, invalid deadline/target, terminal campaign guard |
| `test/instagram-growth-commands.test.mjs` | Real plugin command execution for `.igfunnel` and `.igcampaign goal` |
| `test/plugin-loader.test.mjs` | Registration of `igfunnel` and existing growth commands |

## Release archive verification

The source archive was created using the maintained `scripts/package-release.mjs` workflow. `unzip -t` reported no errors. The archive was extracted into a temporary directory and the extracted source passed syntax check, docs check, and all 127 tests. Verify archives on subsequent rebuilds with:

```bash
unzip -t WHISKAY_v0.10.8_SOURCE.zip
unzip -l WHISKAY_v0.10.8_SOURCE.zip
```

The archive contains only empty `.gitkeep` placeholders under `session/`, `auth_ig/`, and `data/`; it does not contain `.env`, `config/app.json`, session credentials, runtime state, SQLite databases, archives, backups, or logs. `.git`, `node_modules`, and Python virtual environments are excluded. The README, `docs/`, configuration template, maintained scripts, source, and tests are present.

## Test boundaries and items not covered

- The Instagram metrics used by the funnel are manually entered test values.
- No live Instagram write operation is performed; no auto-follow, follower delivery, like, mass DM, or unfollow worker was added.
- No live WhatsApp pairing, Instagram authentication/session, provider payment, ad delivery, or creator collaboration is covered by automated QA.
- `npm run security:check` (`npm audit`) was not run as part of this QA gate; it requires registry access and is a separate release check.
- QA does not demonstrate that a target follower count will be reached. Goal pace is arithmetic planning information, not a prediction or guarantee.

## Known runtime note

Node.js 22.16.0 printed its standard experimental SQLite warning during tests. The test suites passed. This warning does not represent a test failure.

## Files changed

See [Release Notes v0.10.8](../releases/RELEASE-NOTES-v0.10.8.md) for the path-by-path change inventory and [Upgrade v0.10.8](../upgrades/UPGRADE-v0.10.8.md) for data compatibility and rollback notes.
