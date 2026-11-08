# Upgrade WHISKAY v0.10.17

## Perubahan runtime

v0.10.17 menambahkan dependency-aware hot reload dan command `.hotreload`. Upgrade dari v0.10.13 atau v0.10.16 disarankan menggunakan source ZIP baru, bukan menyalin satu file plugin.

## Langkah

1. Hentikan instance WHISKAY aktif dengan satu `Ctrl+C` dan tunggu graceful shutdown.
2. Ekstrak `WHISKAY_v0.10.17_SOURCE.zip` ke direktori baru.
3. Salin `.env`, `config/app.json`, `session/`, `auth_ig/`, dan data lokal privat dari instalasi lama. Jangan menyalin `node_modules/` atau `.whiskay-runtime/`.
4. Pastikan file `src/academic/client.mjs` tersedia bila memakai `.acad`; source ZIP v0.10.17 menyertakan file ini dan plugin yang mengimpornya.
5. Jalankan `npm install`, kemudian `npm run qa`.
6. Jalankan `npm start`, periksa versi pada log, lalu kirim `.hotreload status`.

Contoh pemeriksaan dari shell:

```bash
node -p "require('./package.json').version"
test -f src/academic/client.mjs && echo 'academic client: OK'
test -d src/plugins && echo 'plugin directory: OK'
npm run qa
npm start
```

Expected: versi `0.10.17`, plugin Academic Review berhasil dimuat, dan `.hotreload status` melaporkan `dependency-aware-source-snapshot`.

## Konfigurasi dan data privat

Jangan mengganti `.env` atau `config/app.json` dengan template kosong. Jangan menimpa session WhatsApp, session Instagram, Growth store, referral queue, atau data akademik lokal. Snapshot hot reload berada di `.whiskay-runtime/` dan dapat dibangun ulang otomatis; jangan menyalin snapshot antar mesin.

Jika mengubah `config/app.json`, `.env`, dependency npm, `index.mjs`, `scripts/`, atau file loader utama, lakukan restart penuh. Perubahan modul library/plugin di bawah `src/` dipantau otomatis saat `plugins.hotReload=true`.
