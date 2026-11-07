# Upgrade WHISKAY v0.10.4 → v0.10.5

> **Dokumen historis:** instruksi ini merekam prosedur untuk versi lama. Script updater yang disebutkan mungkin sudah dihapus dan tidak tersedia pada source v0.10.6. Jangan jalankan command lama dari dokumen ini pada instalasi sekarang. Untuk upgrade saat ini, gunakan [UPGRADE v0.10.6](UPGRADE-v0.10.6.md).


## Cakupan

Rilis ini adalah maintenance upgrade. Tidak ada migrasi schema SQLite/JSON, perubahan credential, atau penggantian format session WhatsApp/Instagram. Satu perubahan yang tampak di filesystem adalah penghapusan script legacy PM2/versi lama dan modul antrean Redis yang tidak digunakan.

## Sebelum upgrade

1. Hentikan WHISKAY menggunakan `Ctrl+C` satu kali dan tunggu pesan graceful shutdown.
2. Pastikan proses bot/worker lama telah berhenti. Jangan jalankan instance kedua terhadap direktori session/data yang sama.
3. Buat backup di luar folder proyek: `cp -a /path/whiskay /path/whiskay-backup-v0.10.4`. Jaga permission backup tetap privat.
4. Jangan menyalin `.env`, `config/app.json`, `session/`, `auth_ig/`, atau `data/` ke source archive yang dibagikan. Saat mengganti instalasi aktif, pertahankan file state tersebut secara lokal.

## Cara menerapkan

Untuk instalasi baru, ekstrak release ZIP ke folder baru. Untuk upgrade instalasi v0.10.4, salin source v0.10.5 ke folder kerja baru, lalu pindahkan hanya file runtime milik operator (`.env`, `config/app.json`, `session/`, `auth_ig/`, dan `data/`) setelah memastikan instance lama berhenti. Jangan menimpa file runtime dengan template.

```bash
# di direktori source v0.10.5
cp .env.example .env   # hanya jika .env belum tersedia
cp config/app.example.json config/app.json  # hanya jika config/app.json belum tersedia
npm install
npm run validate
npm run check
npm run docs:check
npm test
```

Tinjau `config/app.json` sebelum startup. Isi nomor pairing/owner yang sama. Jangan mengaktifkan referral atau provider eksternal hanya untuk melengkapi konfigurasi.

## File yang ditambahkan/diubah/dihapus

- Ditambahkan: `.env.example`, `scripts/check-docs.mjs`, `docs/CHANGE-POLICY.md`, dokumen rilis/upgrade/QA v0.10.5.
- Diubah: `package.json`, `scripts/check-source.mjs`, `scripts/package-release.mjs`, `.gitignore`, dan root `README.md`.
- Dipindahkan: semua Markdown selain root `README.md` ke `docs/` dengan subfolder `releases/`, `upgrades/`, `qa/`, dan `guides/`.
- Dihapus: `scripts/stop.mjs`, `scripts/upgrade-v0.9.4.sh`, `scripts/upgrade-v0.10.0.sh` sampai `scripts/upgrade-v0.10.3.sh`, `ecosystem.config.cjs`, dan `src/growth/redis-queue.mjs`.

Script upgrade versi lama tidak lagi dipakai. Dokumen historisnya dipertahankan di `docs/upgrades/`; gunakan prosedur maintenance ini untuk v0.10.5.

## Verifikasi setelah upgrade

```bash
npm run doctor
npm run queue:health
npm start
```

Setelah bot hidup, periksa koneksi WhatsApp, kirim `.menu`, jalankan `.igcheck`, dan pastikan worker SQLite aktif. Jalankan `.igprofile` hanya bila session Instagram operator sudah tersedia dan akun tidak sedang dalam safety hold.

## Rollback

Jika QA gagal, jangan hapus source lama. Hentikan proses v0.10.5, arahkan kembali ke folder backup v0.10.4, dan pastikan hanya satu proses menggunakan session/data yang sama. Karena rilis ini tidak memigrasikan data, file runtime v0.10.4 dapat digunakan kembali. Jangan mengembalikan script legacy ke source v0.10.5 hanya untuk menutup error tanpa memahami penyebabnya.
