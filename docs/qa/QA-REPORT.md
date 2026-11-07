# WHISKAY v0.9.4 — QA Report

## Source-derived critical finding
The uploaded v0.9.3 source contained destructive tests that targeted the configured production paths:

- `test/instagram-stats.test.mjs` removed `config.instagram.sessionFile` and `config.instagram.statsFile`.
- `test/order-engine.test.mjs` removed `config.growth.databaseFile` (orders, campaigns, credits, ledger).
- `test/sqlite-queue.test.mjs` removed the configured SQLite queue file and its WAL/SHM sidecars.

When run against the active project, these tests could delete real application state. This is the strongest source-supported explanation for the missing Instagram session after a test run. It is not evidence that the configured path changed: `instagram.sessionFile` remains `./auth_ig/instagrapi-session.json`.

## Automated results
- `npm test`: PASS — 77 tests, 0 failed.
- `npm run check`: PASS — 54 ESM files passed syntax validation.
- `npm run validate`: PASS — runtime config schema valid.
- `python3 -m py_compile python/instagram_bridge.py`: PASS — Python 3.13.5.
- `npm run security:permissions`: PASS — private file/directory permission audit.
- `bash -n scripts/upgrade-v0.9.4.sh`: PASS.
- Release ZIP: integrity and exclusion checks passed (99 archive entries; private-state directories contain placeholders only).

## Additional regression coverage
- All private session/data/queue/LID paths are redirected to disposable test-worker storage under Node Test Runner.
- Destructive test modules reject direct execution outside Node Test Runner.
- Obsolete `instagram.authMode` is rejected rather than silently ignored.
- `.igcheck` distinguishes `PYTHON_UNAVAILABLE`, `INSTAGRAPI_UNAVAILABLE`, `SESSION_MISSING`, unsafe session path/permissions, and `SESSION_PRESENT_UNVERIFIED`.
- Config paths are anchored to project root rather than current working directory.
- Instagram session save and statistics writes are atomic; login refuses an existing session path.
- Worker never receives `IG_PASSWORD`; first-login password is cleared from bot process environment after one attempt.

## Environment and live validation limits
- The uploaded ZIP did not contain an Instagram `auth_ig/instagrapi-session.json` session file. The user runtime's session is therefore not recoverable from this source archive.
- Review sandbox did not contain the project's `.venv-instagram`; the doctor correctly reported the Python adapter/session as setup items. Python syntax compilation did pass using installed Python 3.13.5.
- No live Instagram login/profile/sync, WhatsApp pairing, or provider request was performed.
- No `npm audit` was run; dependency audit requires registry access and was outside this offline source QA.
- Automated tests cannot guarantee Instagram account safety or prevent platform restrictions.

## Release handling
Release archive excludes `.env`, `config/app.json`, session directories, Instagram credentials, local data, SQLite databases, dependencies, virtual environments, and Git metadata. Keep provider disabled until the provider and its service catalog have been independently reviewed.
