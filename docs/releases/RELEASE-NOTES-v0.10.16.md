# WHISKAY v0.10.16 — Unified WhatsApp Message Router & Video HD Presets

Tanggal: 7 November 2026

## Ringkasan

v0.10.16 memusatkan jalur pengiriman pesan plugin WHISKAY melalui satu message router. Empat file serializer yang diunggah kembali diverifikasi identik byte-per-byte dengan vendor reference di project; file referensi tetap dipertahankan utuh, sementara runtime menggunakan adapter ESM yang teruji.

## WhatsApp message router

- Tambahkan `src/lib/whatsapp-message-router.mjs` sebagai pengarah format untuk `send()` di seluruh plugin.
- Perluas API `send()` ke Native Flow buttons/CTA, single-select list, template compatibility, rich card, carousel, native poll, image/video/PTV/audio/voice/document/sticker/GIF, contact/vCard, static location, table, code, link, dan LaTeX text fallback.
- Tambah validasi nomor vCard, koordinat, URL HTTPS, media lokal, dan pemblokiran kata credential umum pada CTA Copy.
- Perluas `.waform` dengan mixed native buttons, AI-assisted standard card, contact, location, table, code, product explanation, dan media instructions.
- Perluas `.wacapabilities` untuk menjelaskan pilihan transport, batas item, dan fitur yang sengaja tidak aktif.
- Perluas incoming serializer untuk response buttons/list/template dan contextInfo lintas tipe pesan.
- Quick reply tetap masuk ke router command biasa; otorisasi owner dan anti-spam tidak dilewati.

## Video HD

- Tambah `.remini inspect` untuk metadata tanpa encoding.
- Tambah preset `balanced`, `sharp`, `clean`, dan `fast`.
- Tambah beberapa filter fallback (Lanczos sederhana kemudian Bicubic) dan deteksi sumber yang sudah mencapai batas upscale 4K.
- Pertahankan pengolahan lokal, limit 64 MiB input, 128 MiB output, 5 menit, dimensi 3.840 px, timeout encoding 15 menit, serta cleanup temp.
- Tidak menambahkan arbitrary URL downloader, scraping Play Store runtime, axios/cheerio dependency, atau API cloud Remini.

## Perilaku yang sengaja dibatasi

- Tidak membuat Product Message dengan metadata katalog fiktif.
- Tidak mengaktifkan proprietary AI Rich Response yang menyematkan fake bot/forwarded identity. AI content memakai kartu Native Flow standar.
- Tidak mengaktifkan fake quote, payment, call control, status, live location, atau fake sender.
- Template Buttons hanya fallback client lama; Native Flow menjadi pilihan default.

## Kompatibilitas dan migrasi

- Node.js 22.5–22.x; Baileys tetap dipatok `7.0.0-rc14`.
- Tidak ada migrasi WhatsApp/Instagram session, config, atau Growth database.
- Tidak ada dependency baru untuk message router maupun Video HD.
- Live rendering pada perangkat WhatsApp belum dapat dibuktikan oleh automated tests; perlu uji pada perangkat owner.
