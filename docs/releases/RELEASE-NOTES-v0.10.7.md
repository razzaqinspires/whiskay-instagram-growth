# WHISKAY v0.10.7 — Queue Observability & Secret-Safe Failure Handling

**Tanggal:** 6 November 2026  
**Jenis:** maintenance/security release  
**Basis:** v0.10.6  
**Runtime:** Node.js 22.5–22.x, npm 10+

## Ringkasan

v0.10.7 memperkuat operasional antrean growth SQLite. Pesan error eksternal sekarang disanitasi sebelum dilempar ke caller, disimpan sebagai `last_error`, atau dicetak oleh worker. Statistik queue melaporkan umur job dan waktu retry terdekat. Riwayat terminal dibatasi supaya tabel tidak terus bertambah tanpa batas.

Rilis ini tidak menambahkan Instagram action, tidak mengubah integrasi Baileys, tidak menghapus approval owner, tidak mengaktifkan provider eksternal, dan tidak menambah konfigurasi baru.

## Perubahan file

### Diubah

| Path | Perubahan | Tujuan dan manfaat |
|---|---|---|
| `package.json` | Versi dinaikkan dari `0.10.6` ke `0.10.7`; deskripsi menambahkan queue diagnostics dan secret-safe failure | Menandai rilis dan metadata aplikasi secara konsisten |
| `src/security/redact.mjs` | Menambah `redactText()`; redaksi assignment secret, Bearer/Basic, query credential, URL userinfo, JWT; sanitasi label error | Mengurangi risiko token atau credential masuk log/database |
| `src/growth/provider-adapter.mjs` | Error transport, JSON response, dan rejection provider disanitasi sebelum dilempar | Error upstream tidak memantulkan credential ke caller |
| `src/growth/sqlite-queue.mjs` | `last_error` disanitasi; retensi 1.000 completed + 1.000 failed; `getQueueStats()` menambah timestamp dan age metrics | Melindungi error yang dipersistenkan serta membatasi pertumbuhan riwayat |
| `src/growth/worker.mjs` | Error status polling, kegagalan job, dan exception tak terduga disanitasi sebelum dicetak | Log operasional tidak menerima pesan mentah dari provider |
| `scripts/queue-health.mjs` | Output umur job, retry due, dan waktu terminal terakhir | Membantu operator menemukan antrean macet tanpa membuka payload job |
| `test/redact.test.mjs` | Uji credential assignment, Bearer/Basic, URL/query, JWT, dan batas panjang | Regression coverage redaction |
| `test/provider-adapter.test.mjs` | Uji pesan error provider | Menjamin sanitasi berada di batas adapter |
| `test/sqlite-queue.test.mjs` | Uji redaksi DB, age metrics, dan retensi terminal | Menjamin aturan queue pada database temporary |
| `README.md` | Versi, quick start, command, riwayat, dan indeks dokumentasi diperbarui | Menjaga dokumentasi utama sinkron |
| `docs/CHANGELOG.md` | Catatan kronologis v0.10.7 | Audit perubahan lintas rilis |
| `docs/ARCHITECTURE.md` | Menjelaskan batas dan observability queue | Dokumentasi arsitektur aktual |
| `docs/PROJECT-STRUCTURE.md` | Peta versi dan path queue diperbarui | Menjelaskan kepemilikan file aktif |
| `docs/SECURITY.md` | Menambahkan kebijakan error redaction dan retensi | Menjelaskan data yang disimpan dan batas redaction |
| `docs/guides/SCRIPTS-REFERENCE.md` | Diagnostik queue diperbarui | Memetakan utilitas script aktif |
| `docs/GROWTH-QUEUE-OPERATIONS.md` | Dokumen operasi queue baru | Runbook retry, retention, age metrics, dan rollback |
| `docs/releases/RELEASE-NOTES-v0.10.7.md` | Dokumen ini | Ringkasan rilis |
| `docs/upgrades/UPGRADE-v0.10.7.md` | Prosedur upgrade | Penerapan dan rollback |
| `docs/qa/QA-REPORT-v0.10.7.md` | Catatan QA | Hasil test dan batas verifikasi |

### Dihapus atau dipindahkan

- Tidak ada file runtime yang dihapus pada v0.10.7.
- Tidak ada Markdown yang dipindahkan pada v0.10.7 karena seluruh dokumentasi selain `README.md` sudah berada di `docs/` sejak baseline v0.10.6.
- Audit `scripts/` menemukan 16 file `.mjs`/`.sh`; semuanya mempunyai pemanggil npm, import runtime, atau penggunaan manual yang tercatat di `docs/guides/SCRIPTS-REFERENCE.md`. Tidak ada script tambahan yang aman dihapus tanpa menghilangkan fungsi operasional.
- Penghapusan legacy pada v0.10.6 tetap berlaku: `src/selfbot.js`, `src/lib/lid-manager.js`, `referral-module/`, `scripts/stop.mjs`, updater lama, konfigurasi PM2, dan adapter Redis tidak dikembalikan.

## Perilaku baru

1. Error provider melewati `sanitizeError()` sebelum diteruskan.
2. Error queue disanitasi lagi sebelum ditulis ke `jobs.last_error`.
3. Worker mencetak error name/code yang aman beserta pesan terpotong maksimal 500 karakter.
4. Queue mempertahankan maksimal 1.000 job completed dan 1.000 job failed terbaru.
5. `getQueueStats()` menyediakan jumlah status, timestamp tertua/terbaru, umur job, dan waktu retry terdekat.
6. `npm run queue:health` menampilkan ringkasan tanpa menampilkan isi job atau credential.

## Kompatibilitas dan konfigurasi

- Tidak ada key `.env` atau `config/app.json` baru.
- Nilai `growth.queue.attempts`, `backoffMs`, `concurrency`, dan database path tidak berubah.
- Tidak ada migrasi schema SQLite.
- `getQueueStats()` lama tetap kompatibel; parameter opsional `{ now }` ditambahkan untuk test deterministik.
- `failOrRetryJob()` tetap menerima `job` dan `error`; hasilnya menambahkan field `error` yang sudah disanitasi.

## Keamanan dan batasan

Redaction adalah defense-in-depth, bukan jaminan bahwa semua string arbitrary aman. Jangan mengirim header, credential, raw request/response body, atau session ke error message. History `failed` yang lebih tua dari 1.000 record akan terpangkas pada saat job gagal permanen berikutnya. Tidak ada provider/API eksternal yang dipanggil oleh test otomatis.

## QA

Hasil final dan angka aktual tercatat di [QA Report v0.10.7](../qa/QA-REPORT-v0.10.7.md). `npm test`, `npm run check`, `npm run docs:check`, `npm run validate`, permission audit, dan release integrity dibedakan dari live WhatsApp/provider testing.
