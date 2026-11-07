# Upgrade to v0.10.4

> **Dokumen historis:** instruksi ini merekam prosedur untuk versi lama. Script updater yang disebutkan mungkin sudah dihapus dan tidak tersedia pada source v0.10.6. Jangan jalankan command lama dari dokumen ini pada instalasi sekarang. Untuk upgrade saat ini, gunakan [UPGRADE v0.10.6](UPGRADE-v0.10.6.md).


1. Stop WHISKAY.
2. Back up your current installation.
3. Extract this release over a separate staging copy first.
4. Run `node scripts/merge-platform-config.mjs` from the project root. Existing `config/app.json` values are preserved; a timestamped backup is created.
5. Add OAuth/service secrets to `.env` only. Never put tokens in JSON.
6. Keep `instagram.platformApi.enabled=false` until Meta OAuth scopes and token lifecycle are configured.
7. Run `npm test`, then `npm start`.

This release does not include your private `config/app.json`, `.env`, sessions, or databases.
