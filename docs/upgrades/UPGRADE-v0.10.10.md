# Upgrade ke v0.10.10

1. Cadangkan database dan folder session secara privat.
2. Pertahankan `.env`, `config/app.json`, `auth_ig/`, `session/`, dan `data/` lama.
3. Pastikan `instagram.username` di `config/app.json` adalah username akun yang benar-benar terkait dengan `instagram.sessionFile`.
4. Jalankan `npm install`.
5. Jalankan `npm run validate`, `npm run check`, `npm run docs:check`, dan `npm test`.
6. Jalankan `npm run instagram:doctor` dan periksa status session.
7. Buat campaign baru dengan `.igcampaign create Reels-November|0`.

## Perubahan command
Sebelumnya: `.igcampaign create <nama>|<target URL>|<budget>`.
Sekarang: `.igcampaign create <nama>|<budget opsional>`.

Target profil ditentukan dari session aktif. Username/URL manual tidak lagi diterima.

## Rollback
Hentikan bot, simpan database/session, lalu kembalikan source v0.10.9. Tidak ada migrasi database sehingga rollback tidak memerlukan downgrade schema. Jangan menghapus atau memindahkan file session saat rollback.
