# Upgrade — v0.9.4

> **Dokumen historis:** instruksi ini merekam prosedur untuk versi lama. Script updater yang disebutkan mungkin sudah dihapus dan tidak tersedia pada source v0.10.6. Jangan jalankan command lama dari dokumen ini pada instalasi sekarang. Untuk upgrade saat ini, gunakan [UPGRADE v0.10.6](UPGRADE-v0.10.6.md).


## Why this release is required

A critical test-isolation bug was found in v0.9.3. Running `npm test` against an active project could remove:

- `auth_ig/instagrapi-session.json`
- `data/instagram-stats.json`
- `data/instagram-growth.json` (orders, campaigns, credits, ledger)
- `data/growth-queue.sqlite` plus WAL/SHM files

v0.9.4 redirects private-state paths to isolated temporary storage under Node Test Runner and adds a regression assertion. The test files also refuse direct execution outside the runner.

## Safe upgrade

1. Stop WHISKAY with `Ctrl+C` and confirm the bot/worker have stopped.
2. Extract this source ZIP to a temporary directory, not over the live project. For example, if extracted under `/root/wbself-v094/`, the release root will be `/root/wbself-v094/wbself/`.
3. From Debian, run the included upgrade script:

   ```bash
   bash /root/wbself-v094/wbself/scripts/upgrade-v0.9.4.sh /root/wbself
   ```

   Adjust the source path if the ZIP was extracted elsewhere. The script makes a full backup beside the target, copies only source/docs/example config, removes the duplicate statistics plugin, runs `npm install`, and executes `npm run qa`.
4. The script refuses to upgrade if the runtime lock exists or `.env` is missing. It does not overwrite `.env`, `config/app.json`, `session/`, `auth_ig/`, or `data/`.
5. After the script succeeds, run `npm run doctor`, then `npm start`. Run `.igcheck`; if the session exists, use `.igprofile`. Do not run `.iglogin` unless `.igcheck` reports `SESSION_MISSING` and you have confirmed the account is not under a checkpoint/challenge or safety hold.

## Configuration conflicts

- Keep `instagram.username`, `pythonBin`, `sessionFile`, `statsFile`, and `guardFile` in `config/app.json`.
- Keep `IG_PASSWORD` and optional verified provider API key in `.env` only.
- `instagram.authMode` is rejected by v0.9.4 validation; remove any old `authMode` entry from `config/app.json`.
- `IG_USERNAME` and `IG_SESSION_FILE` are runtime bridge variables; do not duplicate them in `.env`.
- `REDIS_PASSWORD` is obsolete because the queue uses SQLite; remove it.
- Relative paths now resolve from the project root, irrespective of the terminal's current directory.

## Session recovery

If `.igcheck` reports `SESSION_MISSING`, first inspect the exact `instagram.sessionFile` path and your private backup. Do not use files in `session/self/`; those belong to WhatsApp Baileys. If no Instagram session backup exists, perform one deliberate first login only after reviewing Instagram account security notifications and confirming there is no checkpoint/challenge.
