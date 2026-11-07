# Upgrade WHISKAY v0.10.6 → v0.10.7

## 1. Cakupan

v0.10.7 adalah maintenance/security upgrade untuk queue observability dan secret-safe failure handling. Tidak ada migrasi schema SQLite, perubahan session Baileys/Instagram, perubahan format order/ledger, perubahan endpoint referral, atau perubahan key konfigurasi.

## 2. Sebelum upgrade

1. Hentikan WHISKAY v0.10.6 dengan `Ctrl+C` dan tunggu graceful shutdown.
2. Pastikan tidak ada worker lain yang menggunakan database dan session yang sama.
3. Simpan backup privat bila diperlukan ke direktori di luar root proyek. Backup tidak boleh dimasukkan ke ZIP source.
4. Simpan state operator berikut: `.env`, `config/app.json`, `session/`, `auth_ig/`, dan `data/`.
5. Jangan menyalin `node_modules/`, `.venv-instagram/`, ZIP lama, file log, atau backup lama ke source baru.

## 3. Terapkan source baru

1. Ekstrak `WHISKAY_v0.10.7_SOURCE.zip` ke direktori baru.
2. Salin file state operator yang diperlukan dari v0.10.6: `.env`, `config/app.json`, `session/`, `auth_ig/`, dan `data/`.
3. Pastikan tidak ada dua proses WHISKAY yang berjalan terhadap state yang sama.
4. Jalankan:

```bash
npm install
npm run validate
npm run check
npm run docs:check
npm test
npm run security:permissions
npm run doctor
npm run queue:health
```

5. Jika pemeriksaan sesuai, jalankan `npm start`.
6. Periksa output diagnostik dan command `.menu` pada chat owner.

## 4. File berubah

Rincian file ditambah/diubah/dihapus ada pada [Release Notes v0.10.7](../releases/RELEASE-NOTES-v0.10.7.md). File runtime utama yang berubah:

- `src/security/redact.mjs`
- `src/growth/provider-adapter.mjs`
- `src/growth/sqlite-queue.mjs`
- `src/growth/worker.mjs`
- `scripts/queue-health.mjs`
- Test di `test/redact.test.mjs`, `test/provider-adapter.test.mjs`, dan `test/sqlite-queue.test.mjs`

Dokumen operasi baru: `docs/GROWTH-QUEUE-OPERATIONS.md`.

## 5. Perubahan data dan konfigurasi

- Tidak ada migrasi schema SQLite atau konversi data.
- Kolom `jobs.last_error` yang baru ditulis akan berisi pesan tersanitasi; row lama tidak diubah retroaktif.
- Ketika terjadi kegagalan permanen setelah upgrade, retensi akan menjaga maksimal 1.000 row `failed` terbaru dan 1.000 row `completed` terbaru.
- Retensi terminal tidak memengaruhi row `pending` atau `running`.
- Tidak ada environment variable atau key config baru.
- Error yang telah disamarkan tidak dapat direkonstruksi dari database; ini disengaja untuk mencegah credential leakage.

## 6. Verifikasi pasca-upgrade

```bash
npm run qa
npm run queue:health
npm run security:check
npm run package:release
```

`npm run security:check` memerlukan registry npm. Unit tests memakai database temporary. Periksa isi source ZIP: harus memuat `README.md`, `docs/`, `src/`, `scripts/`, `test/`, template config, dan tidak memuat `.env`, `config/app.json`, session, runtime data, database, dependency, atau arsip lama.

## 7. Rollback

1. Hentikan v0.10.7 dengan `Ctrl+C`.
2. Arahkan kembali ke source backup v0.10.6.
3. Gunakan `.env`, `config/app.json`, `session/`, `auth_ig/`, dan `data/` yang sama setelah memastikan tidak ada proses lain yang aktif.
4. Tidak ada schema migration yang perlu di-rollback.
5. Perlu diperhatikan: error yang sudah disanitasi tetap tersimpan dalam bentuk tersanitasi; rollback tidak dapat mengembalikan token yang sengaja dihapus dari pesan.
6. Riwayat terminal yang telah dipangkas tidak dapat dipulihkan kecuali tersedia backup SQLite sebelum retensi berjalan.

## 8. Batasan rollback dan operasional

Jangan menghidupkan lagi file legacy yang sudah dihapus pada v0.10.6. Jangan menjalankan worker tambahan pada database yang sama untuk mempercepat antrean. Bila job `running` tampak stale, periksa provider order reference secara manual sebelum memaksa pengiriman ulang.
