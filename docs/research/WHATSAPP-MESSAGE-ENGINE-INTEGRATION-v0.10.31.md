# WhatsApp Message Engine Integration Research — v0.10.31

Tanggal: 9 November 2026  
Target dependency: `@whiskeysockets/baileys@7.0.0-rc14`

## Cakupan

Part 5 mengintegrasikan hasil Part 1–4 dan menutup inkonsistensi source yang muncul kembali pada source ZIP v0.10.30. Fokusnya bukan menambah tipe pesan spekulatif, tetapi memastikan satu jalur ingress, serializer, relay, dan delivery diagnostics yang terdokumentasi.

## Riset upstream Baileys

Sumber primer:

- Release/tag Baileys: https://github.com/WhiskeySockets/Baileys/releases
- Package npm: https://www.npmjs.com/package/@whiskeysockets/baileys
- README dan dokumentasi migrasi: https://github.com/WhiskeySockets/Baileys dan https://baileys.wiki
- Issue index: https://github.com/WhiskeySockets/Baileys/issues
- Issue #2858 top-level status stanza ACK: https://github.com/WhiskeySockets/Baileys/issues/2858
- Issue #2726 messageTimestamp tertimpa receipt timestamp: https://github.com/WhiskeySockets/Baileys/issues/2726
- Issue #2781 retry resend 1:1 LID menghasilkan smax-invalid: https://github.com/WhiskeySockets/Baileys/issues/2781
- Issue #2884 group sender-key recovery setelah relink: https://github.com/WhiskeySockets/Baileys/issues/2884

Pemeriksaan pada 9 November 2026 menemukan npm `latest` masih `7.0.0-rc14`; versi ini release candidate, bukan stable major. Karena source WHISKAY sudah ditargetkan pada rc14, dependency tidak dinaikkan ke branch master tanpa rilis npm dan tes kompatibilitas.

Issue #2726 melaporkan `messageTimestamp` pada pesan offline dapat tertimpa timestamp receipt dalam event buffer. Ini adalah masalah upstream di Baileys. WHISKAY tidak memodifikasi internal `node_modules` untuk mengubah event timestamp karena patch semacam itu dapat menyimpang dari API resmi dan belum diuji terhadap event buffer rc14 di lingkungan live. Masalah ini dicatat sebagai risiko timestamp pada diagnosa; timestamp receipt tidak boleh diperlakukan sebagai waktu asli pesan.

Issue #2858 melaporkan top-level `<status>` stanza yang belum di-ACK pada sebagian rollout server. Ini berada pada parser stanza internal Baileys. WHISKAY tidak menambahkan listener raw `CB:status` atau ACK manual karena dapat menggandakan ACK atau mengganggu parser internal. Pantau upstream sampai fix masuk rilis resmi.

Issue #2781 memperlihatkan risiko retry resend 1:1 LID menghasilkan stanza malformed pada rc14. WHISKAY tidak menambahkan retry manual. Relay timeout diperlakukan sebagai hasil ambigu; automatic resend dinonaktifkan untuk mencegah duplikasi.

Issue #2884 membahas pemulihan sender key group inbound setelah relink. Delivery tracker tidak dapat memperbaiki dekripsi Signal/group sender key; lakukan relink hanya sesuai prosedur resmi dan jangan menghapus key/session files secara manual.

## Kontrak internal WHISKAY

1. Ingress: hanya event `messages.upsert` bertipe `notify` yang dapat menjalankan command. `append`/history tidak menjalankan ulang command.
2. Interactive response: ID tindakan diekstrak oleh `native-flow.mjs`, kemudian diproses melalui otorisasi dan command dispatcher normal.
3. Serializer: WhatsApp tools menggunakan `whatsapp-message-router.mjs`, `native-flow.mjs`, `baileys-serializer.mjs`, dan `baileys-media-compat.mjs` sesuai tipe payload.
4. Media: media lokal dibatasi path root, ukuran, dan tipe; remote URL tidak otomatis diunduh untuk menghindari SSRF.
5. Relay: pesan Native Flow memakai `relayMessage` dengan messageId yang dibuat Baileys. Node `biz`/`bot` dibuat satu kali oleh transport.
6. Delivery: tracker hanya metadata outbound; cache 2.000 record/24 jam; tidak menyimpan isi pesan.
7. Ambiguous transport: timeout/rejection tidak memicu retry otomatis. Jika ACK sudah diketahui, late error tidak boleh menurunkan status konfirmasi.
8. Growth: campaign organik/content store tetap aktif. Order/provider/queue worker bukan bagian kontrak aktif dan orphan source yang tersisa dihapus.

## Batasan yang belum ditangani

- Tidak ada live-device matrix untuk Android, iOS, WhatsApp Web/Desktop.
- Tidak ada raw stanza-level regression untuk top-level `<status>`.
- Baileys rc14 upstream issue #2726, #2858, #2781, dan #2884 tetap dipantau.
- In-memory delivery tracker hilang saat restart dan tidak menjamin receipt selalu dikirim oleh client.
- Native Flow/AIRich/Product rendering tetap bergantung pada dukungan client WhatsApp dan kelayakan metadata Business.

## Keputusan versi

Tetap menggunakan `7.0.0-rc14`. Upgrade hanya setelah release baru dipublikasikan, breaking changes ditinjau, patch kompatibilitas WHISKAY diverifikasi ulang, serta regression tests dan live smoke test tersedia.
