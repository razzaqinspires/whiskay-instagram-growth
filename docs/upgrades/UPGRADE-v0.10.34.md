# Upgrade WHISKAY v0.10.34

## Tujuan

Memastikan `.menu` mengirim seluruh katalog di teks/caption satu pesan Native Flow dan tidak membuat dua pesan katalog tambahan.

## Langkah upgrade

1. Hentikan semua proses/instance WHISKAY lama. Pastikan tidak ada supervisor kedua yang menjalankan direktori lama.
2. Backup `.env`, `config/app.json`, `session/`, `auth_ig/`, dan data runtime secara terpisah.
3. Ekstrak `whiskay-instagram-growth-v0.10.34.zip` ke direktori release baru.
4. Salin konfigurasi dan session privat secara selektif; jangan menyalin file source lama di atas release baru.
5. Dari direktori release baru, jalankan `npm install`.
6. Jalankan `npm run version:check`, `npm run check`, `npm run docs:check`, dan `npm test`.
7. Jalankan `npm start`.
8. Kirim `.menu` pada private self-chat owner dan periksa log `[MENU] v0.10.34 single-message dispatch`.

## Ekspektasi

- Tepat satu pesan Native Flow.
- Body/caption pesan memuat seluruh katalog command.
- Tiga tombol tetap tersedia.
- Tidak ada pesan `KATALOG COMMAND · 1/2` atau `2/2`.
- Log harus menunjukkan `transport=native-flow` jika relay Native Flow sukses.

Jika log v0.10.34 tidak muncul, periksa direktori kerja proses, supervisor/service manager, dan pastikan instance lama sudah dihentikan. `npm run version:check` harus dijalankan dari direktori yang sama dengan proses yang akan dijalankan.

## Rollback

Hentikan v0.10.34 dan jalankan direktori release sebelumnya. Tidak ada migrasi database atau session.
