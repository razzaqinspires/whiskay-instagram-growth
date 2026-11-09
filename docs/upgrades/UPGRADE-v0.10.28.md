# Upgrade Guide — v0.10.28

## Langkah upgrade

1. Backup folder `session/`, `auth_ig/`, `data/`, `.env`, dan `config/app.json` secara terpisah. Jangan mengunggah file tersebut ke repository atau membagikan arsipnya.
2. Ekstrak `whiskay-instagram-growth-v0.10.28.zip` ke direktori rilis baru.
3. Salin konfigurasi dan state runtime dari instalasi lama secara selektif; jangan menimpa file contoh dengan file kosong.
4. Pastikan Node.js sesuai batas engine package (`>=22.5.0 <23`) dan npm 10+.
5. Jalankan `npm install`. Postinstall menjalankan patch View Once dan media stream untuk Baileys rc14. Jika dependency tidak dapat diunduh, jangan lanjutkan startup sebelum dependency tersedia.
6. Jalankan pemeriksaan berikut:

```bash
npm run version:check
npm run validate
npm run check
npm run docs:check
node --test test/baileys-serializer.test.mjs test/baileys-media-compat.test.mjs
npm test
```

## Operasional

- Unduhan media sekarang timeout default 45 detik dan maksimum 64 MiB pada jalur `downloadMediaPayload`.
- Saat unduhan gagal, WHISKAY dapat meminta re-upload satu kali bila WAMessage sumber dan `sock.updateMediaMessage()` tersedia.
- Untuk quoted media, recovery bergantung pada stanza ID, remote JID, dan participant yang dapat dibentuk dari quoted context.
- Patch dependency hanya menargetkan Baileys `7.0.0-rc14`. Jika versi berubah atau bentuk source upstream berbeda, postinstall akan gagal dan memerlukan audit manual.

## Rollback

Jika ada masalah setelah upgrade, hentikan proses, kembali ke folder rilis sebelumnya, dan pulihkan hanya konfigurasi/session/data dari backup. Jangan menghapus session WhatsApp untuk mengatasi kegagalan download media. Bila perlu menonaktifkan patch, kembalikan dependency tree dengan instalasi versi rilis sebelumnya; jangan mengedit `node_modules` secara manual sebagai solusi permanen.
