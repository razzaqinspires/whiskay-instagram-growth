# Peta Struktur Proyek WHISKAY v0.10.7

Dokumen ini menjelaskan fungsi direktori dan entrypoint yang dipertahankan. File yang tidak terdaftar sebagai runtime, test, konfigurasi, dokumentasi, atau utilitas operasional bukan bagian dari source release.

## Peta direktori

| Path | Peran | Data yang boleh disimpan | Catatan |
|---|---|---|---|
| `README.md` | Pintu masuk tunggal proyek dan indeks seluruh dokumen | Informasi source yang boleh dibagikan | Satu-satunya Markdown di root |
| `docs/` | Arsitektur, keamanan, konfigurasi, panduan, release notes, upgrade notes, dan QA | Dokumentasi teknis | Seluruh Markdown selain README wajib berada di sini |
| `config/` | Template konfigurasi aplikasi | `app.example.json` pada source release; `app.json` lokal bersifat privat | Jangan commit `app.json` |
| `scripts/` | Launcher, validasi, diagnosa, permission, setup, migrasi config, dan packaging | Tidak menyimpan state permanen | Inventaris dikendalikan `docs/guides/SCRIPTS-REFERENCE.md` |
| `src/` | Runtime Node.js ESM | Tidak menyimpan credential | Dibagi menjadi adapters, growth, lib, plugins, referral, security |
| `src/adapters/` | Adapter HTTP yang hanya ditujukan untuk loopback QA | Tidak ada credential bisnis | Bukan integrasi Instagram atau generic external bulk sender |
| `src/growth/` | Order, campaign, content intelligence, provider safety, SQLite queue, dan worker | `data/instagram-growth.json` memuat campaigns dan contentPosts | Content Insights manual, weighted reporting, snapshots 90/item; order tetap review/approval |
| `src/referral/` | Webhook terverifikasi, queue, dan claim conversion | Queue privat di `data/referral-claims/` | Hanya claim token dari backend setelah signup terverifikasi |
| `src/plugins/` | Command WhatsApp yang dimuat plugin loader | Tidak menyimpan sesi | Semua command tetap melewati owner authorization dan anti-spam |
| `src/lib/` | Utility runtime seperti LID manager, runtime mode store, menu, message ingress, locks dan supervision | State mode privat di `data/runtime-mode.json` | `runtime-mode.mjs` atomically persists self/public and group switch |
| `src/security/` | Permission, redaction, anti-spam dan filesystem guard | State keamanan di direktori privat | Jangan melemahkan guard untuk mempermudah test |
| `test/` | Node Test Runner suites | State test sementara di OS temp | Jalankan dengan `npm test`, bukan file test secara langsung |
| `python/` | Bridge Instagram Python | Session disimpan di `auth_ig/`, bukan di source | Adapter Python terisolasi dari Baileys |
| `requirements-instagram.txt` | Versi dependensi Python yang dipatok | — | Dipasang ke `.venv-instagram/` |
| `.env.example` | Nama variabel rahasia tanpa nilai | — | Salin menjadi `.env` lokal dan isi secara privat |
| `.env` | Secret runtime | Password/login dan API credentials | Dikecualikan dari ZIP, permission `0600` |
| `session/self/` | Session autentikasi Baileys WhatsApp | File credentials/key | Privat, permission direktori `0700` |
| `auth_ig/` | Session adapter Python Instagram | File session | Terpisah dari WhatsApp dan privat |
| `data/` | Database, snapshot, ledger, queue, map, safety state dan lock | Data runtime privat | Tidak dimasukkan dalam source release |
| `.venv-instagram/` | Virtual environment Python lokal | Paket terpasang | Tidak dikirim dalam source release |

## Entry point dan alur runtime

1. `npm start` menjalankan `scripts/start.mjs`.
2. Launcher memvalidasi config, menjalankan permission audit, memperoleh runtime lock, lalu menjalankan `index.mjs` dan `src/growth/worker.mjs` sebagai child process.
3. `index.mjs` memulai webhook referral opsional, memuat plugin dari `src/plugins/`, lalu membuka koneksi WhatsApp melalui `src/wa.mjs`.
4. `src/wa.mjs` mengatur pairing/session Baileys, pemetaan LID, reconnect policy, dan penerimaan pesan `notify` yang benar-benar live.
5. `src/commands.mjs` mempertahankan satu jalur parser, owner authorization, anti-spam, dan plugin dispatch.
6. Growth worker memproses order yang sudah melalui approval menggunakan antrean SQLite lokal.
7. Instagram Python adapter melakukan operasi yang secara eksplisit diizinkan; startup hanya memeriksa status lokal dan tidak melakukan login atau pembacaan profil remote.
8. Referral listener hanya menerima webhook HMAC bertipe `referral.signup.verified` dan claim token sekali pakai dari backend.

## Batas pemisahan

- Baileys adalah transport WhatsApp, bukan worker Instagram.
- Instagram Platform API konfigurasi read-only dan nonaktif secara default; mode automatic hanya menyusun shortlist lokal dan tetap membutuhkan persetujuan owner.
- `ConcreteHttpAdapter` hanya menerima host loopback dan route tetap `/__whiskay_qa__/batch`.
- `src/referral/referral-conversion-batch.mjs` hanya mengirim klaim referral terverifikasi ke `/v1/referrals/claims` pada host HTTPS allowlist.
- Tidak ada auto-follow, fake follower delivery, auto-like, mass unfollow, mass DM, atau bypass challenge.

## Penghapusan legacy pada v0.10.6

| Path yang dihapus | Alasan | Pengganti |
|---|---|---|
| `src/selfbot.js` | Entrypoint lama tidak direferensikan; menggunakan konfigurasi environment lama dan menjalankan koneksi terpisah | `index.mjs` + `src/wa.mjs` |
| `src/lib/lid-manager.js` | Duplikat lama yang hanya diimpor entrypoint lama | `src/lib/lid-manager.mjs` |
| `referral-module/` | Worker dan test referral generasi sebelumnya tidak digunakan oleh runtime saat ini; endpoint `/v1/referrals/attribute` bukan kontrak aktif | `src/referral/` + `test/referral-integration.test.mjs` + `test/referral-conversion-batch.test.mjs` |

Penghapusan ini tidak mengubah format session, file database SQLite, ledger JSON, konfigurasi operator, ataupun kontrak runtime aktif.

## Operasional antrean v0.10.7

- `src/security/redact.mjs` menjadi boundary redaction untuk pesan error eksternal dan queue worker.
- `src/growth/provider-adapter.mjs` tidak meneruskan pesan rejection provider dalam bentuk mentah.
- `src/growth/sqlite-queue.mjs` menyimpan error yang telah disanitasi dan membatasi riwayat `completed` serta `failed` masing-masing menjadi 1.000 row terbaru. Tidak ada perubahan schema.
- `scripts/queue-health.mjs` menampilkan jumlah status, umur job tertua, jadwal pending paling awal, dan waktu penyelesaian/kegagalan terakhir tanpa menampilkan payload job.
- Detail keputusan, interpretasi metrik, dan prosedur pemulihan ada di `docs/GROWTH-QUEUE-OPERATIONS.md`.

Pada v0.10.7 tidak ada source legacy atau script aktif yang dihapus. Semua 16 `.mjs`/`.sh` di `scripts/` telah diaudit dan tetap mempunyai pemanggil atau peran operasional terdokumentasi.


## Mode control and content intelligence — v0.10.9

| File | Fungsi | Manfaat / batasan |
|---|---|---|
| `src/lib/runtime-mode.mjs` | Factory durable mode-state store | Validates `self`/`public`, boolean `allowGroups`, atomic writes, restrictive permissions |
| `src/commands.mjs` | Access decision, `.mode`, public allowlist, group routing | Group access only in self mode and owner only; public never opens groups |
| `src/growth/content-intelligence.mjs` | Pure content metrics and weighted comparisons | Computes profile-visit, visit-to-follow, reach-to-follow, engagement, save/share rates and per-thousand reach |
| `src/growth/store.mjs` | `contentPosts` persistence and snapshot history | Adds backward-compatible v3 envelope; max 500 unique content URLs and 90 snapshots each |
| `src/plugins/instagram-growth.mjs` | `.igcontent add/list/report/compare` commands | Owner-entered per-content Insights; no scraping or follow automation |
| `test/runtime-mode.test.mjs` | Access-mode integration tests | Tests owner-only groups, public group denial, public private read-only allowlist and persistence |
| `test/content-intelligence.test.mjs` | Content analytics/store/command tests | Tests weighted aggregation, validation, URL normalization, snapshots, and command output |
