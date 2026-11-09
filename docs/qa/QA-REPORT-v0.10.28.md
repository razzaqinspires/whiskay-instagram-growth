# QA Report — v0.10.28

**Tanggal:** 9 November 2026  
**Fokus:** Baileys media download reliability dan recovery.

## Hasil pengujian lokal

- [x] Serializer/media tests.
- [x] Re-upload satu kali setelah download gagal.
- [x] Batas byte mencegah re-upload ketika ukuran melebihi limit.
- [x] Quoted media membentuk WAMessage key untuk recovery.
- [x] Timeout dan validasi opsi downloader.
- [x] Patch Baileys media stream idempotent.
- [x] Patch menolak source target hilang atau ambigu.
- [ ] Integrasi dengan dependency Baileys terpasang: belum dijalankan karena `node_modules` tidak tersedia pada source workspace ini.
- [ ] Full WhatsApp live download/re-upload: belum dijalankan.
- [ ] SOCKS5 media download: belum didukung/diverifikasi.

## Catatan

Patch dependency menargetkan hasil build `lib/Utils/messages-media.js` dan diverifikasi melalui fixture yang mencerminkan baris upstream `return fetched.pipe(output, { end: true })`. Pemasangan aktual baru terverifikasi ketika `npm install` berjalan pada instalasi pengguna dengan Baileys rc14. Jangan menganggap unit test patch fixture sebagai bukti postinstall pada server produksi.

## Hasil eksekusi akhir

- `node --test test/baileys-serializer.test.mjs test/baileys-media-compat.test.mjs`: **21/21 passed**.
- `node scripts/check-source.mjs`: **122 JavaScript files passed syntax validation**.
- `node scripts/check-docs.mjs`: **132 dokumen**, semua link, npm script target, script inventory (19 scripts), dan archive scan valid.
- `npm test`: **306 passed, 3 failed, 0 cancelled** dari 309 test. Tiga kegagalan sudah ada pada legacy Growth code yang tidak terkait media: `test/order-engine.test.mjs` (export `createOrder` tidak tersedia), `test/part4-integration.test.mjs` (test mengharapkan file legacy `src/growth/order-engine.mjs` tidak ada), dan `test/sqlite-queue.test.mjs` (`config.growth.queue` tidak tersedia). Tidak ada kegagalan pada test media/serializer Part 2.
- `node_modules` tidak tersedia pada workspace release, sehingga postinstall tidak diuji terhadap file Baileys hasil instalasi aktual. Patch target diuji dengan fixture source dan strict version gate pada script.

**Status:** Part 2 media unit/regression QA lulus; full suite masih merah karena tiga masalah legacy yang dicatat terpisah. Belum layak dinyatakan production-verified atau live-tested.
