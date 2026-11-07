# WHISKAY v0.10.13 — Academic Document Review & Menu Separation

Tanggal: 7 November 2026

## Ringkasan

Rilis ini menambahkan command owner-only untuk pemeriksaan dokumen melalui Academi.cx berdasarkan contoh API komunitas yang diberikan owner. Fitur terpisah dari Instagram dan tidak menambahkan subsistem finansial WHISKAY.

## Perubahan source

- `package.json`: versi `0.10.13`.
- `src/academic/client.mjs`: HTTP client untuk submit text/file, status, list, dan URL report; API key hanya dari environment.
- `src/plugins/academic-review.mjs`: command `.acad` dengan mode AI, similarity, full, status, report, list, dan help.
- `src/lib/menu-renderer.mjs`: seluruh kategori Instagram dan growth ditempatkan setelah separator `━━━━━━━━━━━━━━━━━━━━━━━━`, terpisah dari kategori umum/academic.
- `.env.example`: menambahkan `ACADEMICX_KEY` sebagai konfigurasi opsional.
- `data/academic-inputs/`: folder input lokal yang aman; runtime directory tidak disertakan dalam ZIP.
- `test/academic-review.test.mjs`: pengujian client, auth header, check ID, list limit, signed URL, format hasil, dan help.
- `test/menu-renderer.test.mjs`: verifikasi section Instagram terpisah.
- `test/plugin-loader.test.mjs`: verifikasi plugin `.acad` terdaftar.

## Command

Lihat [Academic Document Review](../ACADEMIC-DOCUMENT-REVIEW.md). Tidak ada `.acad balance`, wallet, credit, ledger, budget, payment, atau order.

## Batas dan QA

API Academi.cx pada contoh komunitas bersifat reverse-engineered/tidak diverifikasi sebagai kontrak resmi. Tes lokal memakai mock fetch; tidak ada dokumen nyata yang dikirim. Skor AI bersifat probabilistik. Tidak ada fitur humanizer atau pengelakan deteksi.
