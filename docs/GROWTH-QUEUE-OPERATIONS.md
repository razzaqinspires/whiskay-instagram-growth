# Arsip Historis — Growth Queue Operations

> **Bukan runbook aktif.** Dokumen ini menjelaskan subsistem promotion-order/queue yang pernah ada pada versi lama. Keputusan produk v0.10.12 menghapus saldo, wallet, order, provider delivery, dan queue dari WHISKAY. Pada v0.10.25 source worker dan script queue telah dihapus. Jangan jalankan perintah atau prosedur pemulihan dari isi historis di bawah.

Runtime aktif hanya menggunakan `src/growth/store.mjs` untuk campaign organik dan content analytics. `config.growth` hanya mengekspos `databaseFile`. File `data/growth-queue.sqlite` yang mungkin tertinggal tidak dibuka atau dihapus otomatis. Backup privat sebelum penghapusan manual.

---

# Growth Queue Operations — WHISKAY v0.10.7

Dokumen ini menjelaskan kontrak antrean SQLite growth, retry, retensi terminal, redaksi error, metrik health, serta batas operasional worker. Antrean ini hanya memproses order kampanye yang sudah berstatus `APPROVED`; perubahan di v0.10.7 tidak mengubah sumber approval maupun mengaktifkan provider secara otomatis.

## 1. Komponen dan kepemilikan

| File | Tanggung jawab | Perubahan v0.10.7 |
|---|---|---|
| `src/growth/sqlite-queue.mjs` | Persistensi job, claim transaksional, retry, stale recovery, statistik, dan retensi | Error disanitasi; riwayat terminal dibatasi; statistik umur queue ditambahkan |
| `src/growth/worker.mjs` | Memproses job yang sudah di-claim dan mengelola status order | Log kegagalan menggunakan error yang sudah disanitasi |
| `src/growth/provider-adapter.mjs` | Validasi layanan kampanye dan HTTP provider | Pesan error yang berasal dari provider disanitasi sebelum dilempar ke caller |
| `src/security/redact.mjs` | Redaksi object dan error | Menangani assignment secret, Bearer/Basic, query sensitif, URL userinfo, JWT, dan label error yang tidak aman |
| `scripts/queue-health.mjs` | Ringkasan operasional queue | Menampilkan jumlah, umur pending/running/failed, jadwal retry berikutnya, serta waktu completed/failed terakhir |
| `test/sqlite-queue.test.mjs` | Uji queue SQLite | Uji redaksi, age metrics, dan batas retensi |
| `test/provider-adapter.test.mjs` | Uji provider adapter | Memastikan pesan error provider tidak memantulkan kredensial |
| `test/redact.test.mjs` | Uji redaksi | Menambah format credential yang wajib disamarkan |

## 2. Alur job

```mermaid
flowchart TD
  A[Order dibuat] --> B{Status APPROVED?}
  B -- Tidak --> C[Ditolak sebelum enqueue]
  B -- Ya --> D[SQLite: pending]
  D --> E[Claim dengan BEGIN IMMEDIATE]
  E --> F[Worker memeriksa order/provider policy]
  F --> G{Provider menerima?}
  G -- Ya --> H[completed]
  G -- Tidak / network error --> I[Sanitize error]
  I --> J{Attempt tersisa?}
  J -- Ya --> K[Pending + bounded exponential backoff]
  J -- Tidak --> L[failed + sanitized last_error]
  H --> M[Prune completed, simpan 1000 terbaru]
  L --> N[Prune failed, simpan 1000 terbaru]
```

`enqueueApprovedOrder()` tetap memvalidasi `order.status === 'APPROVED'` sebelum menulis job. ID `submit-<order.id>` menjaga enqueue idempotent. `claimNextJob()` memakai transaksi `BEGIN IMMEDIATE` agar dua worker tidak mengklaim job yang sama secara bersamaan pada satu database lokal.

## 3. Retry dan pemulihan stale job

- `growth.queue.attempts` mengatur maksimum percobaan (default konfigurasi tetap 3; rentang valid 1–10).
- `growth.queue.backoffMs` mengatur dasar exponential backoff (default tetap 5.000 ms; rentang valid 1.000–300.000 ms).
- Delay dihitung sebagai `backoffMs * 2^(attempt-1)` dan dibatasi maksimal 60 menit.
- Job `running` yang memiliki `locked_at` lebih lama dari 10 menit dipulihkan menjadi `pending` saat worker mulai.
- Worker tidak mengirim order apabila provider nonaktif. Order yang belum `APPROVED` atau sudah memiliki provider reference tidak dikirim ulang sebagai order baru.

Nilai retry dan concurrency tetap berasal dari `config/app.json`; tidak ada variabel environment baru pada v0.10.7.

## 4. Redaksi pesan error

Sebelum v0.10.7, `failOrRetryJob()` menyimpan `error.message` langsung ke kolom `jobs.last_error`, dan worker menulis pesan error mentah ke stderr. Pesan yang berasal dari provider bisa saja memantulkan token, header otorisasi, query credential, URL userinfo, atau JWT.

Sekarang `sanitizeError()` dari `src/security/redact.mjs` digunakan pada batas masuk:

- `src/growth/provider-adapter.mjs` menyamarkan pesan rejection dari provider sebelum `throw`.
- `src/growth/sqlite-queue.mjs` menyamarkan kembali pesan error sebelum menyimpan `last_error`.
- `src/growth/worker.mjs` menyamarkan pesan sebelum mencetak log.

Pola yang disamarkan mencakup `password=`, `token=`, `api_key=`, `Authorization: Bearer ...`, `Basic ...`, query seperti `?access_token=...`, URL userinfo `https://user:pass@host/`, dan token berbentuk JWT. Teks disimpan maksimal 500 karakter; label `name` dan `code` hanya diterima bila berupa token identifier sederhana.

Redaksi adalah defense-in-depth, bukan izin untuk memasukkan secret ke pesan error. Adapter provider tetap harus menghindari mencetak request header, request body, response body mentah, atau credential.

## 5. Retensi riwayat terminal

Database sebelumnya sudah membatasi job `completed` menjadi maksimal 1.000, tetapi job `failed` bisa tumbuh tanpa batas. v0.10.7 membatasi masing-masing status terminal:

- Maksimal 1.000 job `completed` terbaru.
- Maksimal 1.000 job `failed` terbaru.
- Job `pending` dan `running` tidak dipangkas oleh kebijakan terminal ini.

Pembersihan dilakukan setelah job selesai atau gagal permanen. Baris yang dihapus hanya catatan terminal tertua; tidak ada penghapusan order/ledger, file data lain, atau job aktif. Tidak ada perubahan schema SQLite.

## 6. Queue health

Jalankan:

```bash
npm run queue:health
```

Output meliputi:

- Jumlah `pending`, `running`, `completed`, dan `failed`.
- Umur job pending tertua dan waktu `run_at` paling awal.
- Umur job running tertua berdasarkan `locked_at`.
- Umur job failed tertua.
- Waktu job completed dan failed terakhir diperbarui.

Fungsi `getQueueStats({ now })` juga menerima waktu referensi untuk test deterministik. Hasil diagnostik hanya berisi angka, timestamp, dan lokasi database; payload order, target URL, API key, dan isi job tidak dikembalikan.

## 7. Interpretasi operasional

| Indikator | Arti | Tindakan |
|---|---|---|
| Pending bertambah dan oldest age meningkat | Worker berhenti, provider nonaktif, atau retry dijadwalkan jauh ke depan | Periksa `npm run doctor`, `npm run queue:health`, dan status provider |
| Running terus menua | Proses worker terhenti ketika job sedang di-claim | Tunggu stale recovery saat worker restart; periksa kemungkinan order provider sudah diterima sebelum worker berhenti |
| Failed bertambah | Seluruh retry habis | Periksa alasan aman di log/order history; koreksi endpoint/katalog melalui review owner sebelum retry bisnis |
| Next due berada di masa depan | Exponential backoff aktif | Jangan menghapus database untuk memaksa retry; tunggu jadwal atau lakukan tindakan operator yang tercatat |

Job stale tidak selalu berarti provider belum menerima order. Jika provider telah menerima order namun proses mati sebelum reference disimpan, lakukan pemeriksaan manual pada provider sebelum mengulang pekerjaan agar tidak membuat duplikasi.

## 8. Verifikasi

```bash
npm test -- test/sqlite-queue.test.mjs test/provider-adapter.test.mjs test/redact.test.mjs
npm run queue:health
npm run qa
```

Unit test menggunakan database temporary yang diarahkan oleh Node Test Runner. `npm run queue:health` pada source operator membaca database lokal aktif, sehingga jalankan hanya ketika ingin memeriksa state tersebut. Tidak ada provider eksternal yang dihubungi oleh test suite.

## 9. Dampak upgrade dan rollback

- Tidak ada migrasi schema, konfigurasi baru, perubahan provider mapping, atau perubahan lokasi database.
- Backup opsional hanya diperlukan untuk kebutuhan rollback operator; simpan di luar root proyek dengan permission privat.
- Rollback source ke v0.10.6 tidak memerlukan transformasi database. Pesan error yang sudah disanitasi akan tetap tersimpan dalam bentuk aman; informasi yang sudah disamarkan tidak dapat dipulihkan.
- Riwayat `failed` yang terpangkas di v0.10.7 tidak bisa dipulihkan tanpa backup. Kebijakan ini membatasi pertumbuhan database pada 1.000 failed rows terbaru.
