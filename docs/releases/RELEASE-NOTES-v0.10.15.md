# WHISKAY v0.10.15 — Academi.cx Document Review Integration

Tanggal: 7 November 2026

## Ringkasan

Rilis ini menambahkan plugin document-review Academi.cx sebagai komponen independen dari fitur Instagram. Implementasi mengikuti API resmi Academi.cx dan menata ulang menu agar semua command Instagram/Growth berada sebelum satu separator yang jelas, sementara Academi.cx berada setelah separator.

## Command baru

| Command | Fungsi |
|---|---|
| `.acad help` | Bantuan command dan batas input |
| `.acad info` | Status konfigurasi integrasi tanpa mengirim dokumen |
| `.acad ai CONFIRM <teks|file>` | Pemeriksaan indikator AI-writing |
| `.acad similarity CONFIRM <teks|file>` | Pemeriksaan similarity |
| `.acad full CONFIRM <teks|file>` | Pemeriksaan AI dan similarity |
| `.acad status <check_id>` | Status serta skor ringkas |
| `.acad list [1-100] [starting_after_id]` | Riwayat check berpaginasi |
| `.acad report <check_id> [similarity|pdf|original]` | Unduh report yang tersedia |
| `.acad delete <check_id> CONFIRM` | Penghapusan permanen check provider |

Alias plugin: `.acx` dan `.academix`.

## Implementasi dan lokasi file

- `src/academic/client.mjs`: client ESM untuk API host resmi, auth Bearer, create check, multipart, signed upload, status, list, report, dan delete.
- `src/plugins/academic-review.mjs`: command owner-only, `CONFIRM` gate, pesan bantuan, dan pengiriman report melalui WhatsApp.
- `src/config.mjs`: validasi konfigurasi plugin, API key env name, timeout, ukuran file, text cap, dan input folder.
- `config/app.example.json`: contoh blok `academix`.
- `.env.example`: placeholder `ACADEMICX_KEY` tanpa secret.
- `.gitignore`: mengecualikan `data/academic-inputs/` dari Git.
- `src/lib/menu-renderer.mjs`: menempatkan semua command Instagram/Growth sebelum separator dan Academi.cx setelahnya.
- `test/academic-review.test.mjs`: mock test untuk API, upload, validasi file, report, delete, confirmation, dan redaction.
- `test/menu-renderer.test.mjs`: test pemisahan menu.
- `test/plugin-loader.test.mjs`: verifikasi plugin `.acad` terdaftar.
- `docs/ACADEMIC-DOCUMENT-REVIEW.md`: referensi operasional lengkap.
- `docs/guides/MENU-EXAMPLE.md`: contoh susunan menu runtime.

## Batas fitur

- Tidak ada command balance, usage, wallet, credit, ledger, payment, billing, top-up, atau provider order dalam WHISKAY.
- API provider dapat mengenakan biaya pada akun API eksternal. Submit wajib menyertakan `CONFIRM` dan dokumentasi menjelaskan tarif minimum/limit yang tercantum pada provider.
- Plugin tidak memakai session Instagram dan tidak mengubah command Instagram.
- Tidak ada scraping browser, pencurian cookie, bypass autentikasi, atau integrasi langsung ke endpoint Turnitin.
- Hasil AI adalah indikator probabilistik, bukan bukti pasti kepengarangan.

## Batas dan privasi input

- Teks provider: 125–50.000 kata.
- Teks langsung dari chat: default 2.500 karakter lokal.
- Dokumen: PDF, DOC, DOCX, TXT; maksimum 50 MiB.
- Multipart langsung: maksimum 4 MiB; lebih besar menggunakan signed upload resmi.
- Folder input: `data/academic-inputs/`; file di luar folder, symbolic link, dan jenis tak didukung ditolak.
- Report download: maksimum 20 MiB.
- API key hanya dibaca dari environment `.env`; jangan pernah kirim melalui chat.

## Kompatibilitas

- Node.js 22.5–22.x.
- Tidak ada dependency tambahan untuk Academi.cx; client memakai native `fetch`, `FormData`, `Blob`, dan `AbortSignal.timeout`.
- Tidak mengubah Instagram single-session atau schema Growth store.
- Tidak perlu migrasi session WhatsApp/Instagram.

## Pengujian

Rangkaian otomatis menggunakan mock `fetch` dan tidak mengirim dokumen ke provider. QA final, syntax check, docs check, permission audit, serta pengujian hasil ekstraksi ZIP dilaporkan pada `docs/qa/QA-REPORT-v0.10.15.md`.
