# QA Report — WHISKAY v0.10.6

**Tanggal:** 6 November 2026  
**Node:** v22.16.0  
**npm:** 10.9.2

## Status

Laporan ini diisi setelah test suite dan pemeriksaan source dijalankan terhadap source tree v0.10.6. Hasil akhir, angka aktual, serta batasan dicatat di bawah.

## Pemeriksaan

| Pemeriksaan | Hasil | Catatan |
|---|---|---|
| `npm test` | Akan dicatat setelah eksekusi final | Seluruh unit dan integration tests Node.js |
| `npm run check` | Akan dicatat setelah eksekusi final | Syntax check source/script/test `.mjs`, `.js`, `.cjs` |
| `npm run docs:check` | Akan dicatat setelah eksekusi final | Index README, link, versi docs, script targets, archive check |
| `npm run validate` | Akan dicatat setelah eksekusi final | Memerlukan file konfigurasi lokal dengan owner/pairing valid |
| `npm run security:permissions` | Akan dicatat setelah eksekusi final | Menyentuh permission direktori privat lokal |
| `npm run package:release` | Akan dicatat setelah eksekusi final | ZIP source ditulis di luar root proyek |
| `npm run security:check` | Tidak dijalankan kecuali registry tersedia | Membutuhkan koneksi npm registry |

## Cakupan test tambahan

`test/referral-conversion-batch.test.mjs` menguji jalur processor aktif: sequential submission, idempotency conflict, retry 429/Retry-After, validasi seluruh batch sebelum network, abort sebelum dispatch, redaksi token pada network/backend error, dan ketahanan terhadap exception progress callback.

Test menggunakan mock fetch dan injected `sleepImpl`; tidak ada endpoint eksternal yang dihubungi.

## Batasan verifikasi

- Tidak ada pengujian live WhatsApp/Native Flow.
- Tidak ada login atau request profil Instagram.
- Tidak ada order/provider atau pembayaran sungguhan.
- Tidak ada backend referral eksternal yang dihubungi.
- Audit dependency dengan `npm audit` memerlukan akses registry.
