# Referensi Scripts WHISKAY v0.10.22

`npm start` adalah entrypoint utama. Direktori `scripts/` hanya menyimpan utilitas yang benar-benar ada dan digunakan. Tidak ada updater versi lama, script duplikat, atau backup source.

## Inventaris aktual

| File | Tanggung jawab | Cara menjalankan |
|---|---|---|
| `scripts/start.mjs` | Startup foreground, process lock, lifecycle bot/worker, graceful shutdown | `npm start` |
| `scripts/validate-config.mjs` | Validasi `config/app.json` dan environment | `npm run validate` |
| `scripts/check-source.mjs` | Syntax check seluruh source, test, dan scripts | `npm run check` |
| `scripts/check-docs.mjs` | README index, link docs, version docs, npm script targets, script inventory, archive scan | `npm run docs:check` |
| `scripts/check-permissions.mjs` | Audit dan perbaikan permission private state | `npm run security:permissions` |
| `scripts/doctor.mjs` | Diagnostik gabungan runtime/config | `npm run doctor` |
| `scripts/instagram-doctor.mjs` | Diagnostik Python adapter dan satu session Instagram | `npm run instagram:doctor` |
| `scripts/instagram-login.mjs` | Login Instagram pertama secara eksplisit | `npm run instagram:login` |
| `scripts/instagram-profile.mjs` | Membaca profil dari session aktif | `npm run instagram:profile` |
| `scripts/install-instagram-python.sh` | Membuat virtualenv dan memasang dependency Python yang dipatok | `bash scripts/install-instagram-python.sh` |
| `scripts/setup-debian-proot.sh` | Menyiapkan paket OS pada Debian proot | `bash scripts/setup-debian-proot.sh` |
| `scripts/merge-platform-config.mjs` | Migrasi config lama secara eksplisit; mempertahankan nilai operator | Jalankan hanya jika panduan migrasi meminta |
| `scripts/show-config.mjs` | Menampilkan config tersanitasi | `npm run config:show` |
| `scripts/package-release.mjs` | Membuat source ZIP bersih di luar root proyek | `npm run package:release` |
| `scripts/patch-baileys-view-once.mjs` | Patch terkontrol Baileys rc14 agar mediatype membaca isi pesan View Once yang telah dinormalisasi | Otomatis melalui `npm install`; manual `npm run baileys:patch-viewonce` |
| `scripts/queue-health.mjs` | Membaca statistik antrean SQLite Growth dan menutup koneksi diagnostik | `node scripts/queue-health.mjs` |
| `scripts/worker.mjs` | Entrypoint worker antrean Growth; memuat `.env` dan tidak meneruskan `IG_PASSWORD` ke worker | `node --env-file=.env scripts/worker.mjs` |

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
| `npm run instagram:doctor` | Diagnostik session Instagram |
| `npm run instagram:login` | Login pertama eksplisit |
| `npm run instagram:profile` | Baca profil session aktif |
| `npm run package:release` | Paket source ZIP |
| `npm run baileys:patch-viewonce` | Terapkan ulang patch kompatibilitas View Once Baileys rc14 |

## Aturan pemeliharaan

Setiap file `.mjs` atau `.sh` baru harus memiliki pemanggil yang jelas, dokumentasi di tabel ini, dan tes jika memuat logika. Jangan menambahkan script untuk sekadar menyimpan arsip atau menyalin source lama. `npm run docs:check` memastikan seluruh script terinventarisasi.
