# Release Notes v0.10.23 — Native TikTok Multi-Provider Downloader

Tanggal: 8 November 2026

## Fitur

- Menambahkan `.tiktok` dengan alias `.tt`, `.ttdl`, dan `.tiktokdl`.
- Mendukung video publik, photo post/slide, metadata kreator/statistik, dan track musik jika provider menyediakannya.
- Menambahkan `.tiktok info`, `.tiktok audio`, `.tiktok status`, dan `.tiktok help`.
- Menambahkan provider utama/backup HTTPS JSON opsional dan TikWM sebagai fallback terakhir.
- Jika CDN primary gagal untuk error non-access, download dicoba ulang melalui provider berikutnya.
- Menyaring `headersDownload`, memvalidasi CDN dan setiap redirect, membatasi JSON/media response, serta mengirim media melalui Buffer ke router Baileys.

## Kompatibilitas dan batasan

- Tidak menambah dependency npm, tabel database, atau migrasi session.
- Tidak menjalankan headless browser atau browser automation.
- HTTP 401/403, konten privat, dan age restriction menghentikan fallback.
- Story hanya tersedia bila provider mengembalikan media publik yang dapat diakses tanpa bypass pembatasan.
- Source pada `https://code.jhx.my.id/rbpf` tidak dapat diinspeksi dalam sesi ini; integrasi source tersebut belum diklaim. Endpoint custom memakai kontrak JSON yang didokumentasikan pada `docs/TIKTOK-NATIVE-DOWNLOADER.md`.

## Pengujian

- `test/tiktok-scraper.test.mjs`: provider order, TikWM, metadata, musik, slide, headersDownload, CDN redirects, byte cap, MIME dan access restriction.
- `test/tiktok-plugin.test.mjs`: command registration, action parser, metadata display, video send dan info-only.
