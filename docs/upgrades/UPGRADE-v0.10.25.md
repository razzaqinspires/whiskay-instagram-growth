# Upgrade Guide — WHISKAY v0.10.25

## Before applying

1. Stop WHISKAY with one `Ctrl+C` and confirm the supervisor has exited.
2. Back up `.env`, `config/app.json`, `session/`, `auth_ig/`, and `data/` to a private location outside the project. Do not upload these backups to a public repository.
3. If `data/growth-queue.sqlite` or its `-wal`/`-shm` files exist, retain a private copy before deciding whether to remove them. v0.10.25 no longer opens these queue files.
4. Keep the active `data/instagram-growth.json`; it contains organic campaigns and content analytics.

## Apply source package

Gunakan source ZIP lengkap yang dihasilkan oleh `npm run package:release`. Nama arsip mengikuti metadata paket: `whiskay-instagram-growth-v0.10.25.zip`. Ekstrak ke direktori source baru atau terapkan perubahan setelah backup; jangan mengekstrak arsip parsial Part 1/2/3 di atas source yang lebih baru. Source ZIP tidak memuat `.env`, `config/app.json`, session, atau database runtime.

```bash
npm run validate
npm run check
npm run docs:check
npm test
npm run security:permissions
```

## Growth legacy behavior

- The active `config.growth` object exposes only `databaseFile`.
- Legacy `provider`, `providerEnabled`, `providerServiceMap`, `requireWallet`, and `queue` keys in an existing `config/app.json` are ignored by normalized runtime config. Remove these stale keys manually only after backing up the config; this source patch does not overwrite operator config.
- The old queue database is not automatically deleted. It is no longer read or written by WHISKAY. Retain it as an archive or delete it manually after review.
- Organic campaigns/content remain active in `src/growth/store.mjs`; no migration to an order schema is performed.

## Runtime checks

```text
.menu
.help
.waform help
.tiktok status
.aiscrape status
```

`.aiscrape status` must report disabled unless the operator deliberately configures and audits a gateway. TikTok status checks local provider configuration only; it does not ping external services.

## Rollback

Stop the bot, restore the previous source snapshot dan matching source release, lalu pulihkan config/data privat hanya bila memang berubah. Jangan mengembalikan atau menjalankan worker legacy yang telah dihapus pada v0.10.25. Existing queue data remains untouched by this patch.
