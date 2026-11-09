# Peta Struktur Proyek WHISKAY v0.10.26

Dokumen ini adalah peta source aktif. Release notes lama tetap disimpan sebagai sejarah dan tidak berarti modul pada versi lama masih berjalan.

## Direktori aktif

| Path | Peran | Batasan |
|---|---|---|
| `index.mjs`, `scripts/start.mjs` | Foreground supervisor, process lock, shutdown, dan startup bot | Satu bot; tidak memulai worker order/queue |
| `src/wa.mjs`, `src/commands.mjs` | Baileys lifecycle, ingress, owner authorization, anti-spam, parser, plugin dispatch | Semua command melewati satu jalur akses |
| `src/lib/` | Plugin loader, Native Flow, serializer, media router, menu renderer, LID/session utilities | Shared state hanya di modul runtime yang ditentukan |
| `src/plugins/` | WhatsApp commands untuk core tools, WhatsApp Message Lab, TikTok, Instagram, Academi.cx, referral, YouTube Music, AI scrape | Tidak ada order/wallet/provider engagement commands |
| `src/media/` | KOL.ID/Instagram, TikTok multi-provider, YouTube Music, dan media normalization | Provider eksternal dibatasi allowlist/timeout/byte caps |
| `src/ai/` | Adapter AI scrape HTTPS yang dikonfigurasi owner | Nonaktif secara default; bukan SDK irfan-cpp |
| `src/growth/` | Campaign organik, session identity, funnel dan content intelligence | Store hanya schema v5 campaign/content; tanpa wallet/order/queue |
| `src/referral/` | Claim referral yang diverifikasi backend dan webhook HMAC opsional | Terpisah dari growth campaign dan downloader |
| `src/security/` | Anti-spam, redaction, filesystem/permission guards | Jangan melemahkan guard untuk melewati validasi |
| `python/` | Bridge Instagram | Satu session aktif di `auth_ig/` |
| `scripts/` | Launcher, validator, doctor, permission audit, setup, migrasi platform config, packaging | Setiap script aktif ada di `docs/guides/SCRIPTS-REFERENCE.md` |
| `test/` | Node Test Runner | State privat diarahkan ke OS temp; tidak menghapus session live |
| `docs/` | Arsitektur, security, guide, release, upgrade, QA, dan arsip sejarah | README root mengindeks setiap dokumen |

## Entrypoint runtime

1. `npm start` menjalankan `scripts/start.mjs`.
2. Launcher memvalidasi config, permission, dan process lock; memanggil migrasi allowlist campaign/content; lalu menjalankan `index.mjs`.
3. `index.mjs` menyiapkan komponen WhatsApp/referral sesuai konfigurasi.
4. `src/wa.mjs` mengelola pairing/session Baileys dan message ingress.
5. `src/commands.mjs` melakukan otorisasi owner, runtime mode, anti-spam, parsing, lalu plugin dispatch.
6. Owner Code Runtime memeriksa owner-session dan private self-chat secara terpisah sebelum menjalankan JavaScript/CLI/Python/Go; jalur ini tidak mendaftar ke PluginLoader.
7. Plugin TikTok dan AI memakai adapter/service terpisah dan batas request masing-masing.

Tidak ada lagi `scripts/worker.mjs`, `scripts/queue-health.mjs`, `src/growth/worker.mjs`, `src/growth/sqlite-queue.mjs`, atau provider-order runtime pada v0.10.25.

## Penghapusan legacy Growth pada v0.10.25

| Path yang dihapus | Alasan |
|---|---|
| `src/growth/order-engine.mjs` | Order promosi tidak termasuk fitur Growth organik |
| `src/growth/provider-adapter.mjs` | Tidak ada layanan SMM/provider engagement yang diaktifkan |
| `src/growth/redis-queue.mjs`, `sqlite-queue.mjs`, `worker.mjs` | Tidak ada job order yang diproses; config aktif hanya `growth.databaseFile` |
| `scripts/worker.mjs`, `scripts/queue-health.mjs` | Entrypoint dan diagnostik queue tidak lagi memiliki runtime target |
| `test/order-engine.test.mjs`, `test/provider-adapter.test.mjs`, `test/sqlite-queue.test.mjs` | Tes lama menegaskan fitur yang sudah dihapus dan menimbulkan kegagalan pada kontrak baru |

`src/growth/store.mjs` tetap dipertahankan untuk campaign, content post, dan katalog playbook strategi organik. `config.growth` hasil normalisasi hanya mengekspos `databaseFile`. Field legacy di `config/app.json` tidak dibaca sebagai konfigurasi runtime.

Database `data/growth-queue.sqlite` yang mungkin tertinggal tidak dihapus oleh patch. Simpan backup di lokasi privat di luar proyek sebelum penghapusan manual; aplikasi v0.10.25 tidak lagi membuka file itu.

## Catatan versi sebelumnya

Penghapusan `src/selfbot.js`, referral worker lama, dan pembatasan storage pada v0.10.6–v0.10.12 tetap dijelaskan pada release/upgrade notes historis. Referensi order/queue pada dokumen v0.10.7 adalah catatan implementasi masa lalu, bukan instruksi runtime aktif.
