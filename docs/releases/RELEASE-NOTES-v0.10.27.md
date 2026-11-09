# Release Notes — WHISKAY v0.10.27

**Tanggal:** 9 November 2026  
**Fokus:** WhatsApp Message Lab, AIRichResponse, ProductMessage media resolver, Baileys incoming serializer.

## Perubahan utama

1. AIRichResponse kini memakai direct SingleLayout `view_model.primitive` sections yang sesuai dengan helper AIRich referensi dan dikirim langsung melalui `sock.relayMessage`.
2. Envelope AIRich menambahkan thread/device metadata dan 32-byte `messageSecret`, tetap memakai disclaimer WHISKAY dan tidak memakai fixed `botJid` atau identitas Meta AI palsu.
3. `.waform` menyediakan payload default untuk AI Rich, code, contact, location, media PTV, event, scheduled call, URL, WebView, Copy, dan dialer.
4. `.waform product` tanpa argumen mengambil produk pertama dari katalog Business nyata; gambar sample dibaca dari `assets/whatsapp-media-demo/`.
5. Resolver aset menggunakan `realpath`, validasi symlink/path traversal, batas ukuran/ekstensi, dan tidak lagi menyalin demo media ke `data/`.
6. ProductMessage local image path dikonversi menjadi `Buffer` sebelum diberikan ke Baileys.
7. Incoming serializer mengenali message types terbaru dari WAProto dan membaca teks/quoted context AIRich yang berada di bawah `botForwardedMessage.message`.
8. Riset upstream, issue, security advisory, dan repository pembanding dicatat di [Baileys Upstream Research](../research/BAILEYS-UPSTREAM-RESEARCH-v0.10.27.md).

## Compatibility

- Dependency tetap `@whiskeysockets/baileys@7.0.0-rc14`; tidak ada dependency upgrade.
- Tidak ada perubahan format session, database schema, atau migrasi database.
- ProductMessage tetap membutuhkan `WHISKAY_WHATSAPP_BUSINESS_CATALOG_ENABLED=true`, identitas Business yang benar, dan katalog produk nyata.
- AIRichResponse, Carousel, Native Flow, dan ProductMessage tetap bergantung pada dukungan server/client WhatsApp. Relay return/ACK bukan bukti delivery atau render.

## QA summary

- Source syntax validation: 121 JavaScript files passed.
- Focused WhatsApp serializer/router/waform regression tests: 56 passed.
- Full test suite: 298 passed, 3 failed. Tiga kegagalan berasal dari legacy Growth order/SQLite queue files yang masih ada di source archive upload, bukan dari test WhatsApp Part 1. Rincian di [QA Report](../qa/QA-REPORT-v0.10.27.md).
- Live WhatsApp send/render test: not performed.
