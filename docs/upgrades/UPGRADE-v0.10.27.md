# Upgrade Guide — WHISKAY v0.10.27

## 1. Backup dan persiapan

1. Hentikan WHISKAY sebelum mengganti source.
2. Backup `.env`, `config/app.json`, folder sesi WhatsApp, folder sesi Instagram, `data/`, dan database secara terpisah. Jangan mengirim file-file tersebut ke chat atau memasukkannya ke source ZIP.
3. Simpan folder `assets/` karena `.waform media` dan `.waform product` membaca aset demo dari sana.
4. Pastikan Node.js 22.x dan npm 10+ sesuai baseline project.

## 2. Instalasi source

Ekstrak `whiskay-instagram-growth-v0.10.27.zip` ke folder release baru. Salin hanya file konfigurasi dan runtime data yang memang dibutuhkan dari instalasi sebelumnya. Jangan menyalin `node_modules/` atau `.git/` dari folder lama.

```bash
cp /path/backup/.env .env
cp /path/backup/config/app.json config/app.json
npm install
npm run check
npm run docs:check
```

## 3. Perilaku baru `.waform`

Contoh berikut menggunakan sample default dan tidak membutuhkan input manual:

```text
.waform ai-rich
.waform code
.waform contact
.waform location
.waform media
.waform event
.waform call
.waform url
.waform webview
.waform copy
.waform dialer
```

`.waform` tanpa argumen tetap membuka Message Lab. `.waform product` otomatis membaca katalog Business, tetapi hanya jika `WHISKAY_WHATSAPP_BUSINESS_CATALOG_ENABLED=true`, `WHISKAY_BUSINESS_OWNER_JID` benar/tersedia, dan katalog Business memiliki minimal satu produk.

## 4. Perubahan lokasi media

- Demo media: `assets/whatsapp-media-demo/`.
- Product image custom: `assets/whatsapp-products/`, `assets/whatsapp-media-demo/`, atau root `assets/`.
- Tidak ada lagi copy otomatis dari `assets/` ke `data/whatsapp-media/`.
- File harus regular file, berada di dalam assets root yang diizinkan, ekstensi sesuai jenis media, dan maksimal 40 MiB.

Jika file sample tidak ada setelah deploy, salin folder `assets/whatsapp-media-demo/` dari source release. Jangan membuat folder `data/whatsapp-products/` untuk mengatasi ENOENT lama.

## 5. Konfigurasi ProductMessage

Jika akun bukan WhatsApp Business atau katalog belum tersedia, biarkan feature flag tetap `false`. Jangan membuat product ID, retailer ID, harga, atau katalog dummy. `getCatalog()` dapat timeout/empty pada sebagian sesi; WHISKAY akan mengembalikan error eksplisit.

## 6. Rollback

Jika terjadi masalah, hentikan proses dan kembalikan source release sebelumnya. Kembalikan `.env`, `config/app.json`, sesi, dan `data/` dari backup hanya bila memang diperlukan. Tidak ada migrasi database pada v0.10.27. Jangan downgrade dependency Baileys secara terpisah dari source karena serializer dan message adapters ditargetkan ke `7.0.0-rc14`.
