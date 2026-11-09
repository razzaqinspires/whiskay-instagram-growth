# Upgrade Guide v0.10.23

## 1. Source

Salin patch v0.10.23 ke working tree WHISKAY yang sesuai. Jangan menimpa `.env`, `config/app.json`, `session/`, `auth_ig/`, atau direktori `data/`.

## 2. Konfigurasi opsional

TikTok downloader dapat dipakai tanpa custom provider karena TikWM menjadi fallback terakhir. Jika operator sudah mengaudit scraper sendiri dan menyediakan endpoint HTTPS yang menerima POST JSON `{ "url": "..." }`, tambahkan ke `.env`:

```dotenv
TIKTOK_SCRAPER_API_URLS=https://primary.example/api/tiktok/resolve,https://backup.example/api/tiktok/resolve
TIKTOK_SCRAPER_API_TOKEN=
TIKTOK_MEDIA_HOST_ALLOWLIST=cdn.example.net
```

Jangan mengisi endpoint dengan URL yang belum diketahui kontrak, lisensi, dan pengelolaannya. Kontrak response dan host allowlist dijelaskan di `docs/TIKTOK-NATIVE-DOWNLOADER.md`.

`.env` dibaca saat startup. Restart WHISKAY setelah menambahkan atau mengubah variabel.

## 3. Verifikasi

```bash
node --test test/tiktok-scraper.test.mjs test/tiktok-plugin.test.mjs
npm run check
npm run docs:check
```

Tes live hanya dengan tautan TikTok publik yang pengguna berhak unduh. Mulai dengan `.tiktok status`, lalu `.tiktok info <url>`, kemudian `.tiktok <url>`.

## 4. Rollback

Hapus `src/plugins/tiktok-downloader.mjs` dan `src/media/tiktok-scraper.mjs`, hapus entri TikTok di `.env` bila ada, lalu restart. Tidak ada database/session migration yang perlu dibalik. Jika rollback source, pulihkan `package.json`, README, changelog, konfigurasi contoh, dan dokumen rilis ke versi sebelum v0.10.23.
