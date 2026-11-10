# Upgrade WHISKAY v0.10.33

## Perubahan perilaku

1. `.menu` mengirim satu Native Flow yang body-nya memuat seluruh katalog command, alias, usage, dan deskripsi. Pesan katalog susulan telah dihapus.
2. Command prefix yang tidak dikenal tidak lagi membalas di chat. Diagnostik hanya dicatat pada logger debug.

## Upgrade

1. Hentikan WHISKAY.
2. Backup `.env`, `config/app.json`, `session/`, `auth_ig/`, dan data runtime secara terpisah.
3. Ekstrak `whiskay-instagram-growth-v0.10.33.zip` ke direktori release baru.
4. Salin konfigurasi/session/data privat secara selektif.
5. Jalankan `npm install`, `npm run check`, `npm run docs:check`, dan `npm test`.
6. Jalankan `npm start`, kemudian uji `.menu`, `.westmanga`, `.wmhomd`, dan `.wmhome` pada chat self.

## Ekspektasi

- `.menu`: satu pesan interaktif, tanpa pesan teks susulan.
- `.westmanga`/`.wmhomd`/`.wmhome`: tidak ada balasan WhatsApp.
- Command valid: tetap berfungsi normal.

## Rollback

Hentikan v0.10.33 dan jalankan direktori v0.10.32. Tidak ada migrasi database atau perubahan session. Backup konfigurasi dan runtime tetap berlaku.
