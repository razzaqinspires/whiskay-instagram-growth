# WHISKAY v0.10.14 — Native Flow, Media Adapter, Polls, and Video HD

Tanggal: 7 November 2026

## Ringkasan

Rilis ini mengadaptasi serializer Baileys dan helpers yang diberikan pemilik ke runtime WHISKAY ESM. Empat file sumber dipertahankan utuh sebagai referensi vendor. Runtime memakai adapter terpisah yang kompatibel dengan struktur project WHISKAY dan Baileys 7.

## Perubahan utama

- Native Flow validator dan sender diperluas untuk quick reply, single select/list, CTA URL, WebView URL, CTA Copy, CTA Call, dan CTA Catalog.
- Legacy hydrated Template Buttons disediakan sebagai jalur kompatibilitas; Native Flow tetap pilihan utama.
- Menambahkan rich card normal, carousel dua sampai sepuluh kartu, polling native, dan cache poll creation melalui `getMessage`.
- Adapter serializer masuk memahami wrapper pesan dan media image, video/PTV, audio, document, sticker/GIF, serta jenis pesan terstruktur seperti contact, location, poll, product, order, event, dan interactive response.
- Menambahkan `.mediainfo`, `.poll`, `.waform`, `.wacapabilities`.
- Menambahkan `.remini`, `.videohd`, `.enhancevideo` untuk local FFmpeg/FFprobe.
- Menjaga separator menu Instagram, mode owner-only, satu sesi Instagram, dan tidak menambahkan fitur finansial.
- Memperbaiki urutan validasi path input Academi.cx: path di luar inbox ditolak sebelum pemeriksaan ekstensi.

## Keputusan keselamatan/kompatibilitas

AI Rich Response proprietary dari helper tidak diaktifkan karena payload menyisipkan metadata AI/forwarded identity yang tidak dapat diverifikasi. Product Message generik dan fake product/payment quote tidak diaktifkan. CTA Catalog hanya membuka katalog WhatsApp Business yang memang sudah terhubung. `review_and_pay`, `payment_info`, fake payment, call control, dan call-music tidak diaktifkan.

Remini source melakukan scraping Play Store lalu proses lokal FFmpeg; implementasi WHISKAY tidak menyebutnya cloud AI Remini. Tidak ada arbitrary URL input sehingga risiko SSRF dari URL fetch upstream tidak dipindahkan ke bot.

## Command baru

- `.poll` / `.polling`
- `.mediainfo` / `.media-info`
- `.waform` / `.waui` / `.wabuttons`
- `.wacapabilities` / `.wabuttonhelp`
- `.remini` / `.videohd` / `.enhancevideo`

Lihat [Native Flow](../NATIVE-FLOW.md), [Video HD](../VIDEO-HD.md), dan [Serializer Reference](../BAILEYS-SERIALIZER-REFERENCE.md).
