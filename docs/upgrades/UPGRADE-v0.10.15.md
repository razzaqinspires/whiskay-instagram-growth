# Upgrade WHISKAY v0.10.14 → v0.10.15

## Apa yang berubah

v0.10.15 menambahkan plugin `.acad` untuk integrasi document review Academi.cx dan menu separator Instagram/non-Instagram. Single-session Instagram, mode self, group access, database Growth, dan session WhatsApp tidak dimigrasikan.

## Persiapan

1. Hentikan WHISKAY dengan `Ctrl+C`.
2. Buat backup privat di luar source tree: `.env`, `config/app.json`, `session/`, `auth_ig/`, dan `data/`.
3. Ekstrak `WHISKAY_v0.10.15_SOURCE.zip` ke direktori baru `whiskay-v0.10.15/`.
4. Salin `.env` serta konfigurasi pribadi dari instalasi v0.10.14. Jangan menimpa file pribadi dengan template kosong.
5. Tambahkan key Academi.cx hanya jika integrasi ini akan digunakan:

```env
ACADEMICX_KEY=acx_your_private_api_key
```

6. Tambahkan blok berikut ke root `config/app.json` jika belum ada. Sesuaikan batas/path hanya jika perlu:

```json
"academix": {
  "enabled": true,
  "apiKeyEnv": "ACADEMICX_KEY",
  "timeoutMs": 30000,
  "maxFileBytes": 52428800,
  "maxTextChars": 2500,
  "inboxDir": "./data/academic-inputs"
}
```

7. Siapkan direktori privat untuk input dokumen bila ingin memakai file:

```bash
mkdir -p data/academic-inputs
chmod 700 data/academic-inputs
```

8. Instal dan verifikasi:

```bash
npm install
npm run version:check
npm run validate
npm run check
npm run docs:check
npm test
npm run security:permissions
```

## Uji tanpa mengirim dokumen

Setelah start, jalankan:

```text
.menu
.plugins
.acad help
.acad info
```

`.acad info` hanya menampilkan status konfigurasi/key tersedia atau tidak; tidak memanggil endpoint pemeriksaan dan tidak mengirim dokumen. Pastikan separator `━━━━━━━━━━━━━━━━━━━━━━━━` berada setelah seluruh kategori Instagram dan sebelum Academi.cx.

## Uji dengan dokumen

Gunakan dokumen uji yang memang boleh dikirim ke layanan eksternal dan pahami tarif provider sebelum submit. Simpan file di `data/academic-inputs/`, lalu gunakan salah satu:

```text
.acad ai CONFIRM sample.txt
.acad similarity CONFIRM sample.docx
.acad full CONFIRM sample.pdf
.acad status CHECK_ID
.acad list 20
.acad report CHECK_ID similarity
```

Setiap submit memakai kuota/biaya akun API provider, sehingga token `CONFIRM` wajib. Jangan mengulang submit setelah timeout sebelum mencari check ID melalui `.acad list`.

## Privasi dan rollback

- Jangan meletakkan API key pada `config/app.json`, pesan WhatsApp, source, README, atau log.
- Dokumen di `data/academic-inputs/` dikirim ke Academi.cx saat submit; jangan gunakan dokumen rahasia atau dokumen pihak lain tanpa izin.
- Source ZIP tidak menyertakan `.env`, `config/app.json`, session, database, atau dokumen input.
- Rollback: hentikan v0.10.15 lalu jalankan source v0.10.14 dari direktori lama. Tidak ada migrasi Growth DB yang diwajibkan oleh plugin Academi.cx.
