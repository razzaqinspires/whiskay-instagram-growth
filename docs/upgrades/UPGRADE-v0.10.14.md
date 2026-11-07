# Upgrade WHISKAY v0.10.13 → v0.10.14

## Persiapan

1. Hentikan WHISKAY dengan `Ctrl+C`.
2. Buat backup privat di luar source tree untuk `.env`, `config/app.json`, `session/`, `auth_ig/`, dan `data/`.
3. Ekstrak `WHISKAY_v0.10.14_SOURCE.zip` ke direktori baru `whiskay-v0.10.14/`.
4. Salin konfigurasi privat dan session dari instalasi sebelumnya. Jangan menyalin `node_modules` atau menggantikan source baru dengan source lama.
5. Pertahankan `ACADEMICX_KEY` hanya bila integrasi Academi.cx digunakan. `FFMPEG_PATH` dan `FFPROBE_PATH` opsional.
6. Pasang FFmpeg/FFprobe bila ingin memakai `.remini`:

Termux:

```bash
pkg update && pkg install ffmpeg
```

Debian/Ubuntu:

```bash
sudo apt update && sudo apt install ffmpeg
```

7. Instal dependency dan validasi:

```bash
cp .env.example .env
cp config/app.example.json config/app.json
nvim .env
nvim config/app.json
npm install
npm run validate
npm run check
npm run docs:check
npm test
npm run security:permissions
```

Jangan menimpa konfigurasi lama sebelum menggabungkan nilai owner, pairing, Instagram session, Academi.cx, dan identitas lainnya. Jika config lama telah lengkap, pertahankan file tersebut dan hanya tambahkan variabel `FFMPEG_PATH`/`FFPROBE_PATH` bila diperlukan.

## Pengujian awal setelah start

```text
.menu
.wacapabilities
.waform help
.remini status
.mediainfo
```

Tes `.poll` hanya pada chat yang memang ingin menerima polling. Tes tombol Native Flow pada perangkat WhatsApp aktual; beberapa bentuk seperti WebView, CTA Catalog, Template Buttons, dan carousel dipengaruhi versi client.

## Rollback

Hentikan runtime v0.10.14 dan jalankan source v0.10.13 dari direktori lama. Pulihkan `.env`, `config/app.json`, `session/`, `auth_ig/`, dan `data/` dari backup bila diperlukan. Rilis ini tidak mengubah schema Growth database dan tidak mewajibkan migrasi sesi Instagram.
