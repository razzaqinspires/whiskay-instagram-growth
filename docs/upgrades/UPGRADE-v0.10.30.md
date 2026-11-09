# Upgrade Guide v0.10.30

1. Backup folder `config/`, `.env`, `session/`, `data/`, `auth_ig/` secara privat sebelum mengganti source.
2. Extract source `whiskay-instagram-growth-v0.10.30.zip` ke folder baru.
3. Pindahkan konfigurasi dan state privat secara selektif; jangan menimpa config aktif dengan contoh.
4. Jalankan `npm install`, `npm run validate`, `npm run check`, `npm run docs:check`, `npm test`, dan `npm run security:permissions`.
5. Start hanya satu proses WHISKAY yang memakai session WhatsApp tersebut.
6. Gunakan `.wadelivery` untuk ringkasan dan `.wadelivery <messageId>` untuk detail.

## Dampak operasional

- Tidak ada migrasi database atau file session.
- Delivery tracker berada di memori; riwayat status hilang ketika proses restart.
- Cache maksimum 2.000 pesan dengan TTL 24 jam.
- Tidak ada retry otomatis. Jika relay gagal dengan timeout, periksa `.wadelivery` dan chat sebelum mengirim ulang manual agar tidak terjadi duplikasi.
- Dependency Baileys tetap `7.0.0-rc14`.

## Rollback

Hentikan WHISKAY, kembalikan source rilis sebelumnya, lalu jalankan validasi. Tidak ada data persisten tracker yang perlu dimigrasikan atau dihapus.
