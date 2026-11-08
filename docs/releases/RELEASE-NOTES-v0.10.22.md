# WHISKAY v0.10.22 — Release Notes

**Tanggal:** 8 November 2026  
**Base:** v0.10.21  
**Baileys:** 7.0.0-rc14

## Perubahan

- Hydrated Template Buttons dialihkan ke `generateWAMessageFromContent()` + `relayMessage()` untuk menghindari jalur `sendMessage()` yang menghasilkan `Invalid media type` pada sesi pengguna.
- Carousel memperkuat relay envelope dengan node `biz` dan `bot`; tersedia varian forwarded-context eksplisit untuk pengujian kompatibilitas.
- AIRichResponse mendapat builder embedded HTML screen dengan `embedded_screens`, nested tab content, HTML primitive payload, trusted domain opsional, dan compatibility forwarded hint tanpa Meta AI bot identity palsu.
- `.waform media` menerima filename opsional dan menyediakan aset demo PTV, voice OGG/Opus, GIF-as-MP4, View Once image, dan View Once video. View Once memakai raw `generateWAMessage()`/`relayMessage()`, stanza meta `view_once=true`, dan patch mediatype idempotent untuk Baileys rc14.
- ProductMessage menambahkan `.waform product catalog` dan `.waform product info <id>` untuk membaca data Business nyata; batas 20 detik diterapkan pada getCatalog.
- Plugin baru `.ytmusic` untuk mencari track YouTube Music dan mengirim satu audio M4A melalui yt-dlp.
- Dokumentasi, konfigurasi, dan pengujian diperbarui.

## Perubahan kompatibilitas

- `.waform media ptv` kini valid tanpa filename; aset demo akan disalin ke `data/whatsapp-media/` pada pemakaian pertama.
- `.waform media <type> | <filename>` tetap didukung; format `.waform media <type> <filename>` juga didukung.
- `.waform template` memakai raw proto relay, bukan `sock.sendMessage()`.
- `.ytmusic` adalah command baru; perlu `yt-dlp` dan `ffmpeg` di lingkungan pengguna untuk download/konversi audio.

## Batas

WhatsApp tidak menjamin rendering format eksperimental. Relay ACK bukan bukti delivery atau render. ProductMessage memerlukan katalog Business riil. AIRich HTML embedded screens terutama ditujukan ke client mobile yang mendukungnya; WA Web desktop dapat mengabaikannya. Pencarian YouTube Music bergantung pada InnerTube web endpoint yang dapat berubah.
