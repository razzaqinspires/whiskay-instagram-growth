# WHISKAY — Mandatory Change & Documentation Policy

**Status:** wajib untuk setiap perbaikan, refactor, patch keamanan, dan peningkatan versi.

Dokumentasi adalah bagian dari hasil engineering, bukan pekerjaan opsional setelah kode selesai. Setiap perubahan kode harus dapat ditelusuri dari `README.md` ke dokumen yang menjelaskan keputusan, lokasi file, perilaku, dampak, dan cara verifikasinya.

## 1. Artefak yang wajib diperbarui

Untuk setiap perubahan, perbarui semua artefak yang relevan berikut. Jangan menambah dokumen kosong hanya untuk memenuhi daftar; isi dengan detail yang benar-benar sesuai dengan perubahan.

1. `docs/CHANGELOG.md` — catatan kronologis perubahan.
2. `docs/releases/RELEASE-NOTES-vX.Y.Z.md` — ringkasan rilis, fitur, perubahan perilaku, batasan, dan hasil QA.
3. `docs/upgrades/UPGRADE-vX.Y.Z.md` — prasyarat, file yang berubah, migrasi, langkah upgrade, verifikasi, dan rollback.
4. `docs/qa/QA-REPORT-vX.Y.Z.md` — command yang benar-benar dijalankan, jumlah tes, hasil pass/fail, lingkungan, dan hal yang belum diuji.
5. Dokumen komponen di `docs/` — arsitektur, konfigurasi, keamanan, worker, adapter, command, atau integrasi yang terdampak.
6. `README.md` — versi terbaru, quick start, peta file, command utama, dan tautan ke seluruh dokumen Markdown di `docs/`.

## 2. Informasi minimum per perubahan

Setiap entri harus mencatat:

- **Perubahan:** apa yang dibuat, diubah, dihapus, atau dipindahkan.
- **Lokasi:** path file yang tepat, termasuk file test dan konfigurasi.
- **Tujuan:** masalah yang diselesaikan dan alasan teknis.
- **Manfaat:** dampak pada operasi, keandalan, keamanan, performa, atau kemudahan pemeliharaan.
- **Perilaku:** alur sebelum/sesudah dan kontrak API atau CLI yang berubah.
- **Konfigurasi:** nama environment/config key, default, rentang valid, dan apakah perlu diubah operator.
- **Keamanan/data:** kredensial, izin file, sesi, database, host allowlist, approval, dan potensi data loss.
- **Verifikasi:** perintah QA, jumlah test, hasil nyata, dan keterbatasan pengujian.
- **Upgrade/rollback:** urutan deployment, file state yang dipertahankan, backup, dan cara membatalkan perubahan jika dibutuhkan.

Jangan menyatakan tes lulus, kompatibilitas live, atau deployment berhasil kecuali benar-benar dijalankan dan hasilnya diamati. Pisahkan hasil mock/unit test dari verifikasi terhadap layanan eksternal.

## 3. Struktur Markdown

- `README.md` di root adalah satu-satunya file Markdown yang boleh berada di root.
- Semua Markdown lainnya wajib berada di `docs/`, termasuk changelog, QA report, release notes, upgrade notes, contoh menu, dan panduan modul.
- Dokumen versi dikelompokkan: `docs/releases/`, `docs/upgrades/`, dan `docs/qa/`. Panduan operasional ditempatkan di `docs/guides/`.
- Setiap dokumen di `docs/` harus terindeks sebagai tautan lokal dari root `README.md`.
- `npm run docs:check` harus lulus sebelum rilis.

## 4. Kebijakan scripts dan arsip

- `scripts/` hanya berisi script aktif yang dipanggil oleh `package.json`, dokumentasi operasional, atau proses startup/QA yang masih dipertahankan.
- Script migrasi sekali pakai untuk versi lama dihapus setelah instruksi historisnya dipindahkan ke `docs/upgrades/`. Jangan mempertahankan beberapa updater lama yang saling bertentangan.
- `npm run package:release` menghasilkan arsip ke luar root proyek dan mengecualikan `.env`, `config/app.json`, sesi, data runtime, database, backup, arsip lama, dependency, dan metadata Git.
- Arsip/backup lokal bukan source code; jangan memasukkannya ke source ZIP. Backup upgrade operator harus berada di luar direktori release.

## 5. Gerbang rilis

Sebelum mengemas versi baru, jalankan paling sedikit:

```bash
npm run validate
npm run check
npm run docs:check
npm test
npm run security:permissions
```

Lakukan `npm audit --omit=dev --audit-level=high` secara terpisah ketika registry npm tersedia. Catat kegagalan jaringan atau tool sebagai keterbatasan, bukan sebagai hasil lulus. Setelah semua catatan diperbarui, jalankan `npm run package:release` dan periksa isi ZIP.


## 6. Pemeriksaan penghapusan dan inventaris script

- Sebelum menghapus file, telusuri import, `package.json`, launcher, test, README, serta seluruh dokumentasi. File baru boleh disebut tidak terpakai jika tidak ada pemanggil aktif atau fungsinya sudah mempunyai pengganti yang jelas.
- Setiap file `scripts/*.mjs` dan `scripts/*.sh` harus tercatat di `docs/guides/SCRIPTS-REFERENCE.md` serta mempunyai pemanggil, peran manual yang dijelaskan, atau fungsi migrasi yang masih diperlukan.
- Setiap target script pada `package.json` harus benar-benar ada. Jangan menyimpan alias npm yang hanya menduplikasi command kanonis.
- Source tree tidak boleh berisi arsip ZIP/TAR, log lama, backup, file hasil build, atau salinan proyek. Arsip release dibuat di luar root proyek.
- Penghapusan source harus dicatat pada release notes dan peta struktur proyek, termasuk path pengganti dan dampaknya terhadap data runtime. Jangan menghapus file session, konfigurasi operator, ledger, database, atau queue saat membersihkan source.
- `npm run docs:check` menegakkan indeks README, link lokal, version docs, target command npm, inventaris script, dan kebersihan source tree. Rilis tidak boleh dikemas bila pemeriksaan ini gagal.
