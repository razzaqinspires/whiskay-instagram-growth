# Referensi Scripts WHISKAY v0.10.32

`npm start` adalah entrypoint utama. Source v0.10.31 tidak lagi menyertakan worker atau queue-health Growth yang telah dipensiunkan.

## Inventaris aktual

| File | Tanggung jawab | Cara menjalankan |
|---|---|---|
| `scripts/start.mjs` | Startup foreground, process lock, lifecycle bot, graceful shutdown | `npm start` |
| `scripts/validate-config.mjs` | Validasi `config/app.json` dan environment | `npm run validate` |
| `scripts/check-source.mjs` | Syntax check source, tests, dan scripts | `npm run check` |
| `scripts/check-docs.mjs` | README index, link docs, version docs, npm target, script inventory, archive scan | `npm run docs:check` |
| `scripts/check-permissions.mjs` | Audit permission private state | `npm run security:permissions` |
| `scripts/doctor.mjs` | Diagnostik gabungan runtime/config | `npm run doctor` |
| `scripts/runtime-smoke.mjs` | Smoke test registry plugin; konfigurasi operator yang belum lengkap ditandai SETUP, bukan regresi registry | `npm run runtime:smoke` |
| `scripts/instagram-doctor.mjs` | Diagnostik Python adapter dan satu session Instagram | `npm run instagram:doctor` |
| `scripts/instagram-login.mjs` | Login Instagram pertama secara eksplisit | `npm run instagram:login` |
| `scripts/instagram-profile.mjs` | Membaca profil dari session aktif | `npm run instagram:profile` |
| `scripts/install-instagram-python.sh` | Membuat virtualenv dan memasang dependency Python yang dipatok | `bash scripts/install-instagram-python.sh` |
| `scripts/setup-debian-proot.sh` | Menyiapkan paket OS pada Debian proot | `bash scripts/setup-debian-proot.sh` |
| `scripts/merge-platform-config.mjs` | Migrasi config platform secara eksplisit; mempertahankan nilai operator | Jalankan hanya jika panduan migrasi meminta |
| `scripts/show-config.mjs` | Menampilkan config tersanitasi | `npm run config:show` |
| `scripts/package-release.mjs` | Membuat source ZIP bersih di luar root proyek | `npm run package:release` |
| `scripts/patch-baileys-view-once.mjs` | Patch Baileys rc14 agar mediatype membaca isi View Once yang telah dinormalisasi | Otomatis melalui `npm install`; manual `npm run baileys:patch-viewonce` |
| `scripts/patch-baileys-media-stream.mjs` | Patch Baileys rc14 agar error stream HTTP media diteruskan ke consumer dan tidak menjadi uncaught exception | Otomatis melalui `npm install`; manual `npm run baileys:patch-media-stream` |

## Legacy scripts retained in the archive

| File | Status | Catatan |
|---|---|---|
| `scripts/worker.mjs` | Legacy / not an active package.json entrypoint | Not part of current foreground bot launcher; preserve only pending a separate repository-history review. |
| `scripts/queue-health.mjs` | Legacy / not an active package.json entrypoint | Not part of current package scripts; do not run as part of v0.10.39. |

## Perintah npm aktif

| Command | Fungsi |
|---|---|
| `npm start` | Menjalankan runtime utama |
| `npm run start:check` | Validasi, syntax, docs, test, lalu start |
| `npm run validate` | Validasi config |
| `npm run check` | Syntax check |
| `npm run docs:check` | Dokumentasi dan kebersihan source |
| `npm test` | Node Test Runner |
| `npm run test:watch` | Tes watch mode |
| `npm run test:coverage` | Tes dengan coverage |
| `npm run test:adapter` | Tes HTTP QA adapter loopback |
| `npm run security:check` | `npm audit` dependency production; butuh akses registry |
| `npm run security:permissions` | Audit permission private state |
| `npm run qa` | Gerbang QA lokal |
| `npm run deps:check` | Memeriksa dependency terpasang |
| `npm run version:check` | Menampilkan versi aplikasi dan runtime |
| `npm run config:show` | Menampilkan config tersanitasi |
| `npm run doctor` | Diagnostik runtime |
| `npm run runtime:smoke` | Smoke test registry plugin aktif (waform, tiktok, aiscrape) |
| `npm run instagram:doctor` | Diagnostik session Instagram |
| `npm run instagram:login` | Login pertama eksplisit |
| `npm run instagram:profile` | Baca profil session aktif |
| `npm run package:release` | Paket source ZIP |
| `npm run baileys:patch-viewonce` | Terapkan ulang patch kompatibilitas View Once Baileys rc14 |
| `npm run baileys:patch-media-stream` | Terapkan ulang patch error propagation download media Baileys rc14 |

## Aturan pemeliharaan

Setiap file `.mjs` atau `.sh` baru harus memiliki pemanggil yang jelas, dokumentasi di tabel ini, dan tes jika memuat logika. Jangan menambahkan script arsip/backup ke source tree. `npm run docs:check` memastikan semua file script yang masih berada di source terinventarisasi. Modul Growth order/provider/queue dan entrypoint worker telah dihapus karena tidak termasuk kontrak Growth organik aktif.
