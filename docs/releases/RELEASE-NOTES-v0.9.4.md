# WHISKAY v0.9.4 — Release Notes

This release corrects critical data-loss risks in the prior test suite and hardens configuration/session behavior.

## Critical fixes

- `npm test` no longer targets live session, statistics, order/ledger, or SQLite queue files. The release includes an upgrade script that backs up the project before copying source and leaves private runtime state untouched. Node Test Runner private-state paths are isolated under the OS temp directory.
- Test modules refuse direct execution outside Node Test Runner.
- Configured relative paths resolve from project root, not the current working directory.
- `.igcheck` no longer reports READY when an Instagram session is missing.
- Session settings are saved atomically only after profile validation succeeds. The first-login password is stripped from the bot environment after one attempt; the worker never receives it.

## Additional fixes

- Startup performs local-only session detection; no automatic password login or Instagram network probe. `.igprofile` and `.igsync` lazily load the saved session. A missing `instagrapi` package is distinguished from a missing Python interpreter.
- Safety lock can reclaim only old locks whose PID is no longer alive; locks held by live processes are retained.
- Duplicate statistics plugin removed.
- `doctor` and `config:show` output corrected; stale `authMode` references removed.
- Provider service filters check multiple upstream metadata fields.
- Obsolete `instagram.authMode` is rejected; old environment overrides are reported as obsolete. README and all operational docs updated.

## Packaging safety

`npm run package:release` produces a source archive that excludes real `.env`, personal `config/app.json`, WhatsApp/Instagram sessions, local data and databases, virtual environments, dependencies, and Git metadata.

## QA results

- 77/77 Node.js tests passed.
- 54 ESM files passed syntax validation.
- Config validation, Python bridge compilation, permission audit, and upgrade-script shell syntax passed.

## Validation boundary

Automated tests and static checks do not prove that Instagram will accept a session or that WhatsApp can pair on the user's device. No live Instagram login/profile request was run as part of release QA.
