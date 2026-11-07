# Upgrade WHISKAY to v0.9.0

> **Dokumen historis:** instruksi ini merekam prosedur untuk versi lama. Script updater yang disebutkan mungkin sudah dihapus dan tidak tersedia pada source v0.10.6. Jangan jalankan command lama dari dokumen ini pada instalasi sekarang. Untuk upgrade saat ini, gunakan [UPGRADE v0.10.6](UPGRADE-v0.10.6.md).


This release overlays the complete source tree from the supplied `wbself.zip` and replaces only the Instagram integration. It does not require deleting WhatsApp sessions, local data, order history, or the SQLite queue.

## Before replacing source

1. Stop WHISKAY with Ctrl+C and wait for graceful shutdown.
2. Make a backup of the whole current `/root/wbself` directory.
3. Keep the existing `.env`, `session/`, `auth_ig/`, and `data/` directories.

## Apply release

1. Extract the release ZIP.
2. Copy/overlay its project contents into `/root/wbself`.
3. Do not overwrite `.env` if your extraction tool offers that option. The release ZIP intentionally excludes `.env`.
4. The updated `config/app.json` points Instagram to `./auth_ig/instagrapi-session.json`. The old `auth_ig/session.json` is not deleted or converted.
5. Run:

```bash
cd /root/wbself
npm install
bash scripts/install-instagram-python.sh
npm run validate
npm run check
npm test
```

## First Instagram connection

Put `IG_PASSWORD` in the existing `.env` file only for the first explicit login. Do not paste it into chat or WhatsApp. Then start WHISKAY:

```bash
npm start
```

Send `.igcheck` to the bot. It must show Python and instagrapi versions. If no session exists, send `.iglogin` once. When successful, remove `IG_PASSWORD` from `.env` and restart the bot.

After that:
- `.igprofile` reads the saved session only.
- `.igsync` reads profile counters and appends the existing local statistics history.
- `.igcheck` never attempts login.
- If a checkpoint/challenge or rate limit appears, stop retrying and complete verification in the official Instagram app.

## Notes

- Python 3.11+ is required.
- The new Python session format is not compatible with the old `instagram-private-api` session.
- The old session file is preserved as a backup.
- This integration uses an unofficial private API. Successful authentication is not guaranteed and has not been tested against the user's live account.


## v0.9.2 safety update
Apply the release while preserving `.env`, `config/app.json`, `auth_ig/`, `data/`, `session/`, and local databases. Existing Instagram session files must not be deleted or replaced. `.iglogin` is now first-login-only and is rejected when a session exists.
