# Upgrade WHISKAY v0.10.5 → v0.10.6

## Cakupan dan kompatibilitas

v0.10.6 adalah maintenance/security release. Tidak ada migrasi schema SQLite, perubahan format session Baileys/Instagram, perubahan struktur order/ledger, atau perubahan endpoint referral aktif. Source legacy yang tidak digunakan dihapus: `src/selfbot.js`, `src/lib/lid-manager.js`, dan `referral-module/`.

## Sebelum upgrade

1. Hentikan runtime dengan `Ctrl+C` satu kali dan tunggu graceful shutdown.
2. Pastikan tidak ada proses bot/worker kedua yang memakai direktori session atau data yang sama.
3. Buat backup operator di luar folder proyek, misalnya `cp -a /path/whiskay /path/whiskay-backup-v0.10.5`. Pastikan backup privat dan jangan masukkan ke source ZIP.
4. Catat path `.env`, `config/app.json`, `session/`, `auth_ig/`, dan `data/`. Source release tidak berisi data tersebut.

## Terapkan source

1. Ekstrak ZIP v0.10.6 ke direktori source baru.
2. Salin hanya state lokal operator dari instalasi lama: `.env`, `config/app.json`, `session/`, `auth_ig/`, dan `data/`. Jangan salin `node_modules/`, `.venv-instagram/`, arsip ZIP, atau backup source lama ke root baru.
3. Dari root source baru, jalankan:

```bash
npm install
npm run validate
npm run check
npm run docs:check
npm test
npm run doctor
npm run queue:health
```

4. Jika seluruh pemeriksaan sesuai, jalankan `npm start`.
5. Periksa pairing/session WhatsApp, kirim `.menu`, lalu gunakan command diagnosis yang dibutuhkan. Jangan menjalankan `.iglogin` jika session sudah ada.

## File yang ditambah, diubah, dan dihapus

**Ditambahkan**

- `docs/PROJECT-STRUCTURE.md`
- `docs/releases/RELEASE-NOTES-v0.10.6.md`
- `docs/upgrades/UPGRADE-v0.10.6.md`
- `docs/qa/QA-REPORT-v0.10.6.md`
- `test/referral-conversion-batch.test.mjs`

**Diubah**

- `README.md`, `package.json`, `docs/CHANGELOG.md`, `docs/CHANGE-POLICY.md`
- `docs/guides/SCRIPTS-REFERENCE.md`, `docs/guides/REFERRAL-MODULE.md`
- `scripts/check-docs.mjs`, `scripts/package-release.mjs`, `scripts/merge-platform-config.mjs`
- `src/referral/referral-conversion-batch.mjs`
- Dokumen upgrade lama diberi peringatan historis.

**Dihapus**

- `src/selfbot.js`
- `src/lib/lid-manager.js`
- `referral-module/referral-attribution-worker.mjs`
- `referral-module/referral-attribution-worker.test.mjs`

Tidak ada perubahan pada `src/lib/lid-manager.mjs`, `src/wa.mjs`, `index.mjs`, database schema, atau file runtime operator.

## Perubahan migrasi config

Jika operator menjalankan `node scripts/merge-platform-config.mjs`, nilai konfigurasi lama tetap dipertahankan dan hanya key yang hilang ditambahkan. Backup konfigurasi kini disimpan di direktori sibling privat `<nama-proyek>-private-config-backups/`, bukan di dalam `config/`. Tidak perlu menjalankan migrasi config jika `config/app.json` sudah sesuai dan lolos `npm run validate`.

## Verifikasi pasca upgrade

```bash
npm run qa
npm run security:check
npm run package:release
```

`npm run security:check` memerlukan registry npm. Source ZIP harus disimpan di luar root proyek dan diperiksa isinya. QA unit tidak menggantikan verifikasi live WhatsApp/Instagram/backend.

## Rollback

1. Hentikan v0.10.6 dengan `Ctrl+C`.
2. Arahkan kembali ke source backup v0.10.5.
3. Gunakan kembali file `.env`, `config/app.json`, `session/`, `auth_ig/`, dan `data/` yang sama hanya setelah memastikan tidak ada proses yang memakai data tersebut.
4. Tidak ada migrasi DB yang perlu dibatalkan. Jika ada perubahan config manual setelah upgrade, gunakan backup config dari direktori sibling privat sebelum mengganti `config/app.json`.

Jangan menghidupkan kembali `src/selfbot.js`, `src/lib/lid-manager.js`, atau worker referral lama. Entry point aktif adalah `index.mjs` dan referral aktif berada di `src/referral/`.
