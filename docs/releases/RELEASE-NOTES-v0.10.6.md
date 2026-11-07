# WHISKAY v0.10.6 — Source Hygiene, Referral Safety & Documentation Governance

**Tanggal:** 6 November 2026  
**Basis:** source v0.10.5  
**Jenis:** maintenance, security hardening, testability, dan dokumentasi.

## Ringkasan

v0.10.6 menghapus modul runtime lama yang tidak diimpor oleh entrypoint aktif, memindahkan cakupan test referral lama ke modul claim yang digunakan runtime sekarang, memperketat sanitasi hasil referral, serta menjadikan tata kelola dokumentasi dan inventaris script sebagai gerbang otomatis. Tidak ada migrasi database, perubahan format session, atau perubahan pada protokol WhatsApp.

## Perubahan terperinci

| Lokasi | Perubahan | Tujuan dan manfaat |
|---|---|---|
| `package.json` | Versi menjadi `0.10.6`; deskripsi diperbarui; `start:check` mencakup validate, syntax, docs, seluruh tes lalu start; alias `lint` dan `config:validate` dihapus | Satu nama kanonis untuk pemeriksaan dan menghindari duplikasi command |
| `src/selfbot.js` | Dihapus | Entrypoint lama tidak direferensikan; memakai environment config lama dan dapat membuka jalur koneksi WhatsApp kedua |
| `src/lib/lid-manager.js` | Dihapus | Implementasi LID lama hanya digunakan oleh entrypoint lama; runtime aktif memakai `src/lib/lid-manager.mjs` |
| `referral-module/` | Worker dan test generasi lama dihapus | Bukan bagian runtime; endpoint `/v1/referrals/attribute` tidak sama dengan kontrak aktif `/v1/referrals/claims` |
| `test/referral-conversion-batch.test.mjs` | Ditambahkan 7 test untuk processor aktif | Menguji success, idempotency conflict, retry, batch pre-validation, abort, redaction, dan progress callback |
| `src/referral/referral-conversion-batch.mjs` | Menambahkan `sleepImpl` yang dapat diinjeksi untuk test; tidak mengembalikan raw response body atau raw error text | Test retry deterministik dan mengurangi risiko token opaque muncul pada hasil/log pemanggil |
| `scripts/check-docs.mjs` | Memvalidasi seluruh tautan README, link lokal, version docs, package script targets, daftar script aktif, dan arsip/backup usang | Mendeteksi dokumentasi yatim, command rusak, dan file release lama yang tertinggal |
| `scripts/package-release.mjs` | Menolak output non-ZIP, output di dalam root proyek, dan target symlink/non-file; tidak mengemas referral legacy | Mencegah output release merusak source tree dan menghindari file dead code masuk ZIP |
| `scripts/merge-platform-config.mjs` | Backup config dipindah ke direktori privat di luar root; merge menggunakan temporary file dan rename atomik; file dibatasi `0600` | Migrasi config tetap dapat dipulihkan tanpa menumpuk backup dalam source tree |
| `docs/PROJECT-STRUCTURE.md` | Ditambahkan peta direktori, alur runtime, data privat, boundary subsistem, dan file yang dihapus | Membuat kepemilikan modul dapat ditelusuri |
| `docs/guides/SCRIPTS-REFERENCE.md` | Diperbarui menjadi inventaris seluruh script yang dipertahankan | Tiap script punya tujuan dan pemanggil yang jelas |
| `README.md`, `docs/CHANGELOG.md`, `docs/CHANGE-POLICY.md` | Diperbarui | README menjadi indeks lengkap dan kebijakan perubahan menjadi pemeriksaan rutin |
| `docs/upgrades/UPGRADE-v0.9.x.md` dan `UPGRADE-v0.10.0`–`v0.10.5` | Ditandai sebagai panduan historis | Mencegah operator menjalankan updater lama yang sudah tidak tersedia |

## Perubahan perilaku

- Referral claim tetap hanya dikirim ke `/v1/referrals/claims` dengan HTTPS, host allowlist, service token, dan `idempotency-key` berbasis event ID.
- Respons sukses tidak lagi mengembalikan response body backend. Ini mencegah body yang tidak terkontrol memantulkan claim token ke pemanggil.
- Penolakan backend menjadi error generik `referral_claim_rejected`; kesalahan jaringan menjadi `network_error` atau `request_timeout`; kegagalan pemrosesan menjadi `claim_processing_failed`.
- `sleepImpl` merupakan injection seam untuk test dan tetap default ke timer bawaan Node.js ketika digunakan runtime.
- Tidak ada perubahan pada batas approval owner, provider growth, Instagram mode, Baileys, webhook HMAC, schema SQLite, atau lokasi file session.
- Tidak ada script upgrade versi lama yang ditambahkan kembali.

## Konfigurasi

Tidak ada key konfigurasi baru yang wajib diisi. Variabel `sleepImpl` hanya opsi programatik untuk dependency injection pada `submitReferralConversionBatch`. Secret dan path tetap mengikuti `config/app.json` serta `.env`.

## Keamanan dan data

`npm run package:release` wajib menyimpan source ZIP di luar root proyek. `scripts/merge-platform-config.mjs` menyimpan backup pada direktori sibling privat bernama `<nama-proyek>-private-config-backups/`; backup tidak disimpan di `config/` atau ikut masuk ke source release.

Penghapusan legacy tidak menyentuh `.env`, `config/app.json`, `session/`, `auth_ig/`, `data/`, database SQLite, order/ledger, atau claim queue operator.

## Batasan

Unit test tidak memvalidasi penerimaan endpoint backend nyata, tampilan Native Flow pada aplikasi WhatsApp live, autentikasi Instagram, maupun perilaku provider eksternal. Audit registry dependency perlu dijalankan terpisah dengan `npm run security:check` saat registry npm dapat diakses.
