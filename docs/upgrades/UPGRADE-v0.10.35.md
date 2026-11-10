# Upgrade WHISKAY v0.10.35

## Perubahan

Pengaturan notifikasi unknown command kini dapat diubah dari WhatsApp oleh owner.

## Langkah

1. Hentikan bot.
2. Backup `.env`, `config/app.json`, `session/`, `auth_ig/`, dan data runtime.
3. Ekstrak `whiskay-instagram-growth-v0.10.35.zip` ke direktori baru.
4. Salin konfigurasi/session/data privat secara selektif.
5. Pastikan `commands.unknownCommandNotificationsFile` tidak menunjuk ke luar area data privat. Default: `./data/unknown-command-notifications.json`.
6. Jalankan `npm install`, `npm run version:check`, `npm run check`, `npm run docs:check`, `npm test`.
7. Start bot dan kirim `.unknownnotice status`.

## Command

- `.unknownnotice status`
- `.unknownnotice on`
- `.unknownnotice off`

Alias:
- `.unknowncmd`
- `.unknowncommandnotice`

OFF adalah default. ON akan membalas command prefix yang tidak terdaftar. Setting hanya bisa diubah oleh owner, termasuk saat runtime mode PUBLIC, dan tidak tersedia di group.

## Rollback

Kembali ke direktori release sebelumnya. Jika ingin mempertahankan pengaturan, simpan `data/unknown-command-notifications.json`; release lama akan mengabaikan file tersebut.
