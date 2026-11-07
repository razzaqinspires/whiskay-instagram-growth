# QA Report — WHISKAY v0.10.15

Tanggal: 7 November 2026  
Rilis: `0.10.15`  
Runtime QA: Node.js `v22.16.0`, npm `10.9.2`

## 1. Ringkasan hasil

| Pemeriksaan | Hasil |
|---|---:|
| Unit + integration test | **162 PASS / 0 FAIL** |
| Source syntax check | **82 file PASS** (`.mjs`, `.js`, `.cjs`) |
| README/docs integrity | **74 dokumen Markdown terindeks** (setelah laporan ini ditambahkan) |
| Script inventory | **14 script** `.mjs`/`.sh` tercatat |
| Config validation | PASS dengan file config fixture dan nomor dummy lokal |
| Release archive | **205 entries; 0 forbidden files; ZIP integrity PASS** |
| Extracted ZIP syntax/docs/tests | **82 syntax PASS; 74 docs PASS; 162 tests PASS** |
| Actual plugin menu render | **27 commands; exactly one divider line; Academi.cx below; no finance command** |
| Live provider request | Tidak dijalankan |
| Live WhatsApp/Instagram login | Tidak dijalankan |

## 2. Ruang lingkup pengujian

### Academi.cx document review

- API key hanya dibaca dari environment variable yang dikonfigurasi.
- Host API tetap `https://academi.cx/api/v1`; tidak dapat diubah dari command.
- Pemilihan produk `ai`, `similarity`, dan `full` tervalidasi.
- Batas 125–50.000 kata dan batas karakter lokal diperiksa sebelum request.
- Pengiriman teks memakai JSON dan idempotency key.
- File kecil menggunakan multipart `POST /checks`.
- File di atas 4 MiB menggunakan signed-upload flow `POST /uploads` → `PUT` signed URL → `POST /checks` dengan `upload_id`.
- Pembatasan folder input, path traversal, symlink, tipe file, ukuran file, dan file regular diperiksa.
- Signed URL harus HTTPS publik tanpa credential atau host lokal.
- Signed upload tidak menerima header Authorization API.
- Status menggunakan summary detail secara default; daftar mendukung halaman 1–100 dan cursor.
- Pengunduhan report dibatasi maksimum 20 MiB dan redirect ditolak.
- Penghapusan menggunakan endpoint check resmi dan membutuhkan token konfirmasi pada plugin.
- Error provider, signed URL, dan secret tidak boleh bocor ke output command.
- Submit tanpa literal `CONFIRM` ditolak; tidak ada command balance/usage/wallet/payment di plugin.

### Menu dan pemisahan plugin

- Menu mengelompokkan seluruh kategori Instagram/Growth sebelum garis `━━━━━━━━━━━━━━━━━━━━━━━━`.
- Academi.cx muncul setelah garis dan tidak menggunakan session Instagram.
- Plugin `.acad` terdaftar bersama alias `.acx` dan `.academix`.
- Real plugin loader memuat command `.acad`.

### Regression suite proyek

Seluruh suite `node --test` menjalankan 162 tes, mencakup anti-spam, media dan message classification, command parsing, owner authorization, runtime mode, Instagram session-bound campaign, Growth/content intelligence, plugin loader, security redaction, referral queue, Native Flow, poll, local video enhancer, dan Academi.cx client/plugin.

## 3. Perintah yang dijalankan

```bash
npm run version:check
npm run validate
npm run check
npm run docs:check
npm test
npm run security:permissions
npm run package:release -- /mnt/data/WHISKAY_v0.10.15_SOURCE.zip
```

`npm run validate` memakai config sementara berbasis `config/app.example.json` dan nomor dummy `6280000000000` untuk memeriksa schema; fixture `.env` dan `config/app.json` tersebut tidak disertakan dalam source ZIP dan dibersihkan setelah release dibuat. Nilai tersebut bukan nomor owner atau kredensial produksi.

## 4. Batas verifikasi

- Tidak ada API key Academi.cx aktif pada lingkungan QA; tidak ada teks atau dokumen yang dikirim ke provider.
- Tidak ada saldo API provider yang dibaca atau diubah.
- Tidak ada login WhatsApp, pairing, login Instagram, atau pengambilan Insights live.
- Tidak ada pemeriksaan terhadap hasil deteksi AI atau similarity pada naskah nyata.
- Harga, saldo, dan kuota berada pada akun/provider Academi.cx; WHISKAY tidak menyajikan atau mengubahnya.
- Koneksi internet/registry dan dependensi provider tetap harus diuji pada perangkat instalasi owner.

## 5. Kesimpulan

Secara otomatis, source v0.10.15 lolos test suite dan pemeriksaan statis yang tercantum di atas. Rilis siap untuk pengujian lokal terkontrol setelah owner mengatur `ACADEMICX_KEY` sendiri, memahami kebijakan pemrosesan dokumen dan tarif provider, serta hanya mengirim dokumen yang berhak dikirim. Hasil QA ini bukan klaim bahwa layanan live telah berhasil diakses.
