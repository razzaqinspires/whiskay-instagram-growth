# QA Report v0.10.23 — TikTok Native Downloader

Tanggal: 8 November 2026

## Cakupan

- URL TikTok HTTPS dan host validation.
- Provider custom primary/backup dan TikWM fallback.
- Fallback ketika CDN primary gagal diunduh.
- Video, photo slides, statistik, creator metadata, music track dan `headersDownload`.
- Header allowlist, host CDN, redirect validation, byte cap, MIME validation dan timeout.
- HTTP 401/403, private content, dan age restriction tidak dilewati.
- Plugin command/action parsing dan dispatch Buffer melalui `sendMedia`.

## Hasil tes fokus

- `test/tiktok-scraper.test.mjs`: 14 tes lulus.
- `test/tiktok-plugin.test.mjs`: 5 tes lulus.
- Total: 19 tes fokus lulus.

## Batas verifikasi

Seluruh pengujian di atas menggunakan fixture `fetch`; tidak ada request live ke TikTok atau TikWM dalam QA ini. DNS jaringan build tidak dapat menyelesaikan host scraper teman `code.jhx.my.id`, dan halaman tersebut juga tidak dapat diambil oleh fetch web. Oleh karena itu source teman belum diinspeksi atau ditransplantasi. Integrasi provider kustom memakai kontrak JSON lokal yang harus dipenuhi endpoint operator.

Tes fixture tidak menjamin ketersediaan provider publik, validitas CDN yang sedang berlaku, kualitas HD, dukungan story, atau rendering media di semua versi WhatsApp. Live smoke test masih diperlukan pada akun kontrol dan URL publik yang diizinkan.

## Known limitations

- TikTok dapat mengubah bentuk respons, domain CDN, atau pembatasan akses.
- Story age-gated/private tidak diakses dan tidak akan dicoba melalui jalur bypass.
- Metadata/statistik yang tidak diberikan provider tidak dapat diisi secara akurat.
- `TIKTOK_MEDIA_HOST_ALLOWLIST` memerlukan penilaian operator; jangan menambahkan domain umum yang tidak dipercaya.

## Hasil pemeriksaan repository

- `npm run validate`: lulus; konfigurasi lokal valid (nilai rahasia tidak dicetak).
- `npm run check`: lulus; 113 file JavaScript `.mjs/.js/.cjs` lolos syntax check.
- `npm run docs:check`: lulus; 111 dokumen `docs/` terindeks di README dan tautan/script target valid.
- `npm run security:permissions`: lulus; permission sumber/data kerja dinormalisasi oleh script.
- `npm test`: 248 lulus, 2 gagal, dari 250 tes. Kedua kegagalan ada di subsistem growth/order yang tidak disentuh Part 2: `test/order-engine.test.mjs` gagal karena `src/growth/store.mjs` tidak mengekspor `createOrder`; `test/sqlite-queue.test.mjs` gagal karena `config.growth.queue` tidak tersedia. Keduanya bukan kegagalan TikTok dan perlu ditangani pada part perbaikan terpisah.

Part 2 tidak membuat klaim bahwa seluruh test suite lulus. Hasil downloader tetap 19/19 lulus.
- Runtime plugin-loader smoke test: lulus; memuat 10 plugin dan 62 command dari source, `.tiktok` terdaftar dengan alias `.tt`, `.ttdl`, `.tiktokdl`, tanpa konflik atau warning load.
