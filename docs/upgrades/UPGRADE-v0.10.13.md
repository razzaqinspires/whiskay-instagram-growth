# Upgrade WHISKAY v0.10.12 → v0.10.13

## Perubahan

- Tambahkan integrasi `.acad` untuk pemeriksaan dokumen owner-only.
- Tambahkan optional `ACADEMICX_KEY` ke `.env`.
- Buat folder `data/academic-inputs/` untuk dokumen lokal yang akan diperiksa.
- Menu menampilkan kategori Academic Review Tools sebelum garis pemisah dan seluruh kategori Instagram sesudah garis pemisah.
- Tidak ada migrasi database, perubahan session WhatsApp/Instagram, atau perubahan schema growth.

## Langkah

1. Hentikan WHISKAY dengan `Ctrl+C`.
2. Backup privat `.env`, `config/app.json`, `session/`, `auth_ig/`, dan `data/` di luar source tree.
3. Ekstrak source v0.10.13 ke direktori baru.
4. Pulihkan file runtime privat dari instalasi sebelumnya tanpa menimpa file source baru.
5. Tambahkan `ACADEMICX_KEY` ke `.env` hanya jika fitur academic review akan digunakan. Jangan memasukkan key ke command chat.
6. Letakkan file uji yang memang boleh dibagikan ke pihak ketiga di `data/academic-inputs/`.
7. Jalankan:

```bash
npm install
npm run validate
npm run check
npm run docs:check
npm test
npm run security:permissions
```

8. Start dengan `npm start`, lalu uji `.acad help` dan `.menu`.

## Rollback

Hentikan runtime, pulihkan source v0.10.12, dan pulihkan `.env`/config/session/data privat dari backup. Tidak ada migrasi database yang harus dibalik.
