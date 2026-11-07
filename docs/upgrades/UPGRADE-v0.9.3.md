# WHISKAY v0.9.3 — Persistent Safety & Architecture Hardening

> **Dokumen historis:** instruksi ini merekam prosedur untuk versi lama. Script updater yang disebutkan mungkin sudah dihapus dan tidak tersedia pada source v0.10.6. Jangan jalankan command lama dari dokumen ini pada instalasi sekarang. Untuk upgrade saat ini, gunakan [UPGRADE v0.10.6](UPGRADE-v0.10.6.md).


## Highlights
- Persistent Instagram safety state at `config.instagram.guardFile`.
- Exclusive cross-process lock for Instagram login/profile/sync operations; lock contention fails closed.
- Existing Instagram session always blocks `.iglogin`.
- 24-hour first-login attempt cooldown is persisted before the request.
- Profile reads are cached and rate-limited across process restarts (15 minutes).
- Remote sync has a durable six-hour cooldown and checks the newest remote snapshot independently of manual snapshots.
- Checkpoint/challenge/rate-limit/authentication errors trigger a persistent manual-review hold.
- Python child process receives only a small environment allowlist; password is passed only to explicit login.
- Python adapter has a 45-second timeout and bounded output.
- `.igcheck` now distinguishes Python readiness and session-file presence; it does not claim to validate a live session.
- Statistics growth comparisons use snapshots from the same source.

## Important behavior
- Do not delete `auth_ig/instagrapi-session.json` to bypass a guard.
- Do not clear `data/instagram-safety.json` to bypass a cooldown or hold.
- A lock file left after a crash intentionally blocks operations. Inspect running processes and lock metadata before manual recovery; never remove it while an operation may still be active.
- A safety hold requires manual account review in the official Instagram app and an intentional operator recovery procedure. This release does not provide automatic hold clearing.
- No automated likes, follows, unfollows, comments, DMs, scraping loops, proxy rotation, or challenge bypass are implemented.

## Upgrade safety
Back up the project. Apply source files while preserving `.env`, `config/app.json`, `auth_ig/`, `session/`, and `data/`. Do not extract the archive over personal data without a backup. Node >=22.5 <23 and Python >=3.11 are expected.

## QA scope
Automated tests and syntax checks are local only. They do not prove Instagram will never restrict an account and do not replace a live account test. No live Instagram login is performed by QA.
