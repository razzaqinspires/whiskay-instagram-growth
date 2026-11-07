# Academi.cx Document Review — WHISKAY v0.10.15

## 1. Tujuan dan batas integrasi

Plugin `academic-review` menambahkan pemeriksaan dokumen melalui API Academi.cx. Integrasi ini berdiri sendiri; ia tidak memakai session Instagram, Growth store, WhatsApp session internals, atau worker Instagram. WHISKAY hanya menyediakan antarmuka command owner-only, validasi input lokal, pemanggilan API, pembacaan status, dan pengiriman report kembali ke chat.

Fitur yang didukung:

- indikator AI-writing Academi.cx (`ai`);
- pemeriksaan similarity melalui report Turnitin yang disediakan Academi.cx (`similarity`);
- satu check gabungan (`full`);
- status check, riwayat dengan cursor, download report, dan penghapusan check.

WHISKAY tidak mengklaim sebagai aplikasi resmi Turnitin dan tidak menghubungi endpoint Turnitin secara langsung. Nama produk dan jenis output mengikuti dokumentasi API Academi.cx. Hasil AI bersifat indikator; skor tidak membuktikan kepengarangan atau niat seseorang. Hasil similarity memerlukan peninjauan kutipan, daftar pustaka, sumber, dan konteks secara manual.

## 2. Referensi dan sumber implementasi

Implementasi memakai API resmi yang dipublikasikan pada dokumentasi Academi.cx, bukan reverse-engineering endpoint web, browser scraping, atau menyalin cookie/session browser. Skrip contoh yang dibagikan owner (Creator: Jerexd) digunakan sebagai referensi kebutuhan CLI dan daftar operasi; kode runtime WHISKAY ditulis ulang sebagai client ESM dan plugin terisolasi.

- API overview: <https://academi.cx/docs/api>
- Authentication: <https://academi.cx/docs/api/authentication>
- Create check: <https://academi.cx/docs/api/checks>
- Retrieve check: <https://academi.cx/docs/api/get-check>
- List checks: <https://academi.cx/docs/api/list-checks>
- Delete check: <https://academi.cx/docs/api/delete-check>
- Create upload: <https://academi.cx/docs/api/uploads>
- Download report: <https://academi.cx/docs/api/reports>
- Community reference supplied by owner: <https://dpaste.org/ONN49/raw>
- Creator channel supplied by owner: <https://whatsapp.com/channel/0029VbAo3iNAjPXTxx0Luv33>

Dokumentasi provider dapat berubah; periksa kembali batas dan tarif di situs resminya sebelum mengirim dokumen.

## 3. Arsitektur dan lokasi file

| Lokasi | Tanggung jawab | Manfaat / batas |
|---|---|---|
| `src/academic/client.mjs` | Client API, auth Bearer, submit text/file, upload bertanda tangan, status, list, report, delete | Endpoint API tetap ke host resmi; tidak ada endpoint balance/usage |
| `src/plugins/academic-review.mjs` | Command `.acad`, konfirmasi biaya, output WhatsApp, pengiriman PDF | Owner-only mengikuti authorization global; tidak bercampur dengan plugin Instagram |
| `src/config.mjs` | Validasi flag, nama env key, timeout, ukuran dan path input | Konfigurasi terpusat dan path privat |
| `config/app.example.json` | Contoh blok `academix` | Operator dapat mengatur integrasi tanpa mengubah source |
| `.env.example` | Placeholder `ACADEMICX_KEY` | Secret tidak disimpan pada JSON, chat, atau source |
| `.gitignore` | Mengabaikan folder input dokumen lokal | Naskah tidak masuk commit/source archive |
| `src/lib/menu-renderer.mjs` | Memisahkan seluruh kategori Instagram dari tool Academi.cx | Menu tetap terbaca dan sesuai urutan yang diminta |
| `test/academic-review.test.mjs` | Mock test client/plugin | Tidak mengirim naskah nyata ke provider |
| `test/menu-renderer.test.mjs` | Tes posisi divider | Menjaga separator tepat satu kali |
| `docs/ACADEMIC-DOCUMENT-REVIEW.md` | Referensi operasi lengkap | Satu sumber dokumentasi fitur |

### Alur request

1. Command dipanggil oleh owner pada mode self.
2. Plugin memeriksa `academix.enabled` dan API key dari environment.
3. Untuk submit, owner harus menulis token `CONFIRM` pada command.
4. Client memvalidasi jumlah kata, tipe file, batas ukuran, dan folder input.
5. Teks dikirim ke `POST /checks`. File hingga 4 MiB dikirim sebagai multipart ke endpoint yang sama. File lebih besar dari 4 MiB sampai 50 MiB memakai `POST /uploads`, signed `PUT`, lalu `POST /checks` dengan `upload_id`.
6. Provider mengembalikan check ID dan status asinkron.
7. Owner dapat membaca status, melihat daftar check, atau mengunduh report yang sudah tersedia.

## 4. Konfigurasi

`config/app.example.json`:

```json
{
  "academix": {
    "enabled": true,
    "apiKeyEnv": "ACADEMICX_KEY",
    "timeoutMs": 30000,
    "maxFileBytes": 52428800,
    "maxTextChars": 2500,
    "inboxDir": "./data/academic-inputs"
  }
}
```

`.env` lokal:

```env
ACADEMICX_KEY=acx_your_private_api_key
```

Nama environment dapat diubah melalui `academix.apiKeyEnv`, default `ACADEMICX_KEY`. `ACX_KEY` tersedia sebagai alias kompatibilitas. Jangan letakkan key pada `config/app.json`, command chat, README, log, test fixture, atau screenshot. File `.env` tidak disertakan source ZIP.

Buat folder input sebelum menggunakan dokumen:

```bash
mkdir -p data/academic-inputs
chmod 700 data/academic-inputs
```

Salin hanya dokumen yang boleh dikirim ke layanan eksternal. Command menerima nama file relatif di folder tersebut, bukan arbitrary absolute path.

## 5. Command WhatsApp

Semua command mengikuti prefix aktif WHISKAY dan dijalankan pada akses owner-only. Dalam rilis ini command plugin adalah:

| Command | Fungsi |
|---|---|
| `.acad help` | Bantuan dan daftar perintah |
| `.acad info` | Status konfigurasi dan batas lokal tanpa request check |
| `.acad ai CONFIRM <teks\|file>` | Hanya indikator AI-writing |
| `.acad similarity CONFIRM <teks\|file>` | Pemeriksaan similarity |
| `.acad full CONFIRM <teks\|file>` | Kedua produk dalam satu check |
| `.acad CONFIRM <teks\|file>` | Alias untuk mode `full` |
| `.acad status <check_id>` | Status dan ringkasan skor (`detail=summary`) |
| `.acad list [1–100] [starting_after_id]` | Daftar check API; argumen kedua meneruskan halaman |
| `.acad report <check_id> [similarity\|pdf\|original]` | Mengunduh report yang tersedia dan mengirim file ke chat |
| `.acad delete <check_id> CONFIRM` | Menghapus check dan file provider secara permanen |

`CONFIRM` wajib pada semua command submit untuk membedakan permintaan help/typo dari request yang dapat memakai kuota atau menimbulkan biaya provider. `CONFIRM` pada delete wajib karena penghapusan tidak dapat dibatalkan. Tidak ada `.acad balance`, `.acad usage`, wallet, credit, ledger, budget, payment, atau billing command di WHISKAY.

### Contoh teks

```text
.acad ai CONFIRM "<tempel naskah minimal 125 kata di sini>"
```

Teks command dibatasi oleh `academix.maxTextChars` (default 2.500 karakter). Untuk naskah panjang, gunakan file.

### Contoh file

```text
.acad full CONFIRM draft-skripsi.docx
.acad status CHECK_ID_DARI_PROVIDER
.acad report CHECK_ID_DARI_PROVIDER similarity
```

Simpan file di `data/academic-inputs/`. Nama ekstensi harus `.pdf`, `.doc`, `.docx`, atau `.txt`.

### Riwayat dan penghapusan

```text
.acad list 20
.acad list 20 CHECK_ID_TERAKHIR
.acad delete CHECK_ID_DARI_PROVIDER CONFIRM
```

`starting_after_id` harus merupakan check ID milik akun API yang sedang digunakan. Penghapusan di sisi provider menghapus dokumen dan report terkait secara permanen. Download report yang perlu dipertahankan terlebih dahulu.

## 6. Batas file, teks, dan report

| Item | Batas |
|---|---:|
| Panjang teks provider | 125–50.000 kata |
| Teks langsung via WhatsApp | `academix.maxTextChars`, default 2.500 karakter |
| Multipart file langsung | Maksimal 4 MiB |
| Signed upload | Lebih dari 4 MiB hingga 50 MiB |
| Jenis file | PDF, DOC, DOCX, TXT |
| Ukuran report lokal | Maksimal 20 MiB pada client |
| `list` | 1–100 item per halaman |
| Timeout | 30.000 ms default; konfigurasi 1.000–120.000 ms |

AI check pada dokumentasi provider memiliki minimum billable 1.000 kata. Karena itu naskah lebih pendek dapat tetap dikenai biaya minimum tersebut ketika produk AI dipilih. Batas teks API 125 kata tidak sama dengan minimum penagihan AI.

## 7. Biaya eksternal dan no-finance policy WHISKAY

WHISKAY tidak mempunyai balance, wallet, pembayaran, saldo, ledger, atau perhitungan tarif internal. Namun, **API Academi.cx sendiri adalah layanan eksternal yang menggunakan API account/prepaid balance**. Dokumentasi provider yang diperiksa pada 7 November 2026 menampilkan tarif AI detection sebesar USD 0,02 per 100 kata (minimum billable 1.000 kata) dan Turnitin similarity sebesar USD 1,25 per dokumen. Nilai dapat berubah; selalu cek halaman API pricing sebelum mengirim.

Karena penggunaan provider dapat menimbulkan biaya pada akun API eksternal:

- perintah submit wajib memakai `CONFIRM`;
- jangan menjalankan ulang request setelah timeout sebelum memeriksa `.acad list` atau `.acad status`, karena request pertama mungkin sudah diterima provider;
- hapus check tidak mengembalikan biaya check yang berhasil;
- WHISKAY tidak memeriksa atau menampilkan saldo provider dan tidak mengelola top-up;
- gunakan API key milik sendiri dan pahami pemakaian pada dashboard provider.

Informasi tarif resmi: <https://academi.cx/docs/api> dan <https://academi.cx/docs/api/pricing>.

## 8. Keamanan, privasi, dan integritas hasil

- API key hanya dari environment variable.
- API base URL ditetapkan pada source sebagai `https://academi.cx/api/v1`; command tidak dapat mengganti host.
- API redirects ditolak; signed upload/report URL harus HTTPS, tanpa credential dan tidak boleh menunjuk IP/local host.
- Signed upload tidak menerima header Authorization API; hanya `Content-Type` sesuai metadata provider.
- Input file dibatasi ke folder `data/academic-inputs/`, file regular, bukan symlink, jenis dan ukuran yang diizinkan.
- Report dibatasi 20 MiB dan dibaca secara bounded; redirect report ditolak.
- Error provider disederhanakan dan secret disanitasi sebelum dibalas.
- Dokumen tidak disimpan dalam database Growth WHISKAY. Salinan sumber hanya berada di folder input lokal sesuai tindakan operator; dokumen yang diupload juga diproses/disimpan sesuai kebijakan provider.
- Jangan kirim dokumen rahasia, data pribadi pihak lain, atau naskah yang tidak kamu punya izin untuk kirim.
- AI score bukan bukti pasti plagiarisme atau kepengarangan. Jangan menggunakan fitur ini untuk mengelabui detektor atau mengubah hasil.

## 9. QA dan batas verifikasi

Test client memakai mock `fetch`; tidak ada API key aktif atau naskah nyata pada tes otomatis. Tes menguji auth header, idempotency header, word validation, direct multipart, signed upload, path traversal/symlink, signed URL, report cap, delete endpoint, error redaction, dan command confirmation. Uji live baru dapat dilakukan setelah operator mengatur key sendiri dan memilih dokumen uji yang memang boleh dikirim.

## 10. Pemecahan masalah

- **API key missing:** tambahkan `ACADEMICX_KEY` ke `.env`, pastikan `start` memakai `--env-file=.env`, restart proses.
- **Folder input belum ada:** jalankan `mkdir -p data/academic-inputs` dan set permission `700`.
- **Teks minimal 125 kata:** gunakan dokumen yang lebih panjang atau file lokal.
- **Format file ditolak:** gunakan PDF, DOC, DOCX, atau TXT.
- **Report belum tersedia / HTTP 409:** periksa `.acad status <check_id>` lagi nanti; provider memproses check secara asinkron.
- **HTTP 429:** provider menyatakan batas check aktif tercapai; tunggu proses yang berjalan selesai.
- **Timeout setelah submit:** jangan langsung mengirim ulang; cari ID di `.acad list` terlebih dahulu.
- **401/403:** periksa API key dan permission pada akun Academi.cx.

