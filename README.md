# WHISKAY — Private WhatsApp Runtime & Organic Instagram Growth

**Versi 0.10.16 — Unified WhatsApp Message Router · Local Video HD Presets · Academi.cx Document Review**  
**Tanggal:** 7 November 2026  
**Runtime:** Node.js 22.5–22.x · npm 10+ · Python 3.11+ untuk adapter Instagram

WHISKAY adalah proyek eksperimental private/self berbasis WhatsApp Baileys. Sistem ini membantu owner mengelola command pribadi, memeriksa satu akun Instagram yang sedang login, mencatat campaign organik, menganalisis performa konten, serta menyediakan plugin pemeriksaan dokumen Academi.cx yang terpisah. Proyek belum menjadi layanan publik dan tidak memiliki subsistem saldo, wallet, kredit, ledger, budget, order, atau pembayaran internal. Plugin Academi.cx tetap dapat memakai akun API eksternal milik operator dan provider dapat menerapkan biaya sendiri.

> **Model operasi:** satu instance WHISKAY = satu owner WhatsApp = satu session Instagram aktif = satu identitas Instagram. Campaign mengambil username dan URL profil dari session tersebut. Tidak ada auto-follow/unfollow, fake follower delivery, auto-like, mass DM, atau pembelian engagement.

---

## 1. Prinsip produk dan batas fitur

1. **Private experimental:** akses dikendalikan owner; mode `self` adalah mode operasi yang direkomendasikan.
2. **Single Instagram session:** hanya satu `instagram.sessionFile` dan satu `instagram.username` aktif per instance.
3. **Organic-only growth:** campaign merupakan catatan rencana, checkpoint, Insights, dan analisis; bukan layanan delivery follower.
4. **No WHISKAY finance subsystem:** tidak ada saldo, wallet, credit, ledger, budget, payment, billing, atau provider order internal. Integrasi eksternal Academi.cx dapat dikenai biaya oleh provider; WHISKAY tidak mengelola saldo eksternal tersebut.
5. **Owner-supplied Insights:** reach, impressions, profile visits, follows, likes, comments, shares, dan saves dimasukkan dari Insights yang benar.
6. **No account impersonation:** username/URL target tidak diterima dari command campaign. Identitas harus cocok dengan session aktif.
7. **WhatsApp/Instagram separation:** Baileys hanya mengelola WhatsApp; adapter Python hanya mengakses akun Instagram yang login.

Detail penghapusan fitur finansial dan migrasi data legacy: [Removed Financial Concepts](docs/REMOVED-FINANCIAL-CONCEPTS-v0.10.12.md).

## 2. Persyaratan dan instalasi

- Linux, Debian proot, atau Termux dengan lingkungan Node yang sesuai.
- Node.js 22.5 sampai 22.x dan npm 10+.
- Python 3.11+ hanya untuk adapter Instagram.
- Akun WhatsApp owner untuk pairing Baileys.

```bash
unzip WHISKAY_v0.10.16_SOURCE.zip
cd whiskay-v0.10.16
cp .env.example .env
cp config/app.example.json config/app.json
nvim config/app.json
nvim .env
npm install
```

Isi `whatsapp.pairingNumber` dan `whatsapp.ownerNumber` dengan nomor owner yang sama, format digit internasional tanpa `+`. Isi `instagram.username` dengan username akun yang akan login, tanpa `@`. Jangan masukkan password ke JSON. `IG_PASSWORD` hanya digunakan untuk login pertama melalui command eksplisit.

Pada Debian proot, prasyarat OS opsional dapat dipasang dengan `bash scripts/setup-debian-proot.sh`. Setup Python Instagram: `bash scripts/install-instagram-python.sh`.

## 3. Pemeriksaan dan start

```bash
npm run version:check
npm run validate
npm run check
npm run docs:check
npm test
npm run security:permissions
npm run doctor
npm run instagram:doctor
```

Setelah konfigurasi valid:

```bash
npm start
```

`npm run qa` menjalankan validasi konfigurasi, syntax check, dokumentasi, test suite, dan permission audit. Tes otomatis tidak membuktikan login live Instagram atau pairing WhatsApp. Tekan `Ctrl+C` satu kali untuk graceful shutdown. Jangan menjalankan dua instance pada direktori session/data yang sama.

## 4. Mode self dan akses grup

Default yang direkomendasikan:

```text
.mode self
.mode groups on
.mode status
```

- `self`: hanya owner yang dapat memakai command.
- `groups on`: owner boleh mengirim command dari grup; anggota grup tetap tidak mendapat akses.
- `groups off`: owner hanya dapat mengoperasikan bot melalui chat pribadi.
- `public`: menutup command grup dan membatasi private chat pada allowlist read-only yang ditentukan kode.

Perubahan mode harus berasal dari owner. Detail: [Mode and Group Access](docs/MODE-AND-GROUP-ACCESS.md).

## 5. Satu session Instagram

Periksa status:

```text
.igcheck
```

Login pertama secara eksplisit:

```text
.iglogin
```

Periksa identitas session:

```text
.igprofile
```

Sinkronkan statistik profil read-only:

```text
.igsync
```

Session Instagram berada di `auth_ig/`, terpisah dari session WhatsApp di `session/`. `instagram.username` wajib cocok dengan username yang dibaca dari session. Mengganti akun berarti mengganti session secara eksplisit dan memverifikasi identitas baru; multi-session/multi-account tidak didukung. Detail: [Instagram Python Adapter](docs/INSTAGRAM-PYTHON-ADAPTER.md) dan [Session-Bound Campaigns](docs/SESSION-BOUND-CAMPAIGNS.md).

## 6. Campaign organik — tanpa parameter uang

Buat campaign dengan nama bebas:

```text
.igcampaign create Organic Follower Growth November
```

Nama tersebut hanya label internal. WHISKAY otomatis mengambil username dan URL profil dari session aktif. Jangan menambahkan `|0`, nominal, username, atau URL profil. Contoh lain:

```text
.igcampaign list
.igcampaign progress CMP_ID
.igcampaign goal CMP_ID 1500 2026-12-06
.igcampaign checkpoint CMP_ID
.igcampaign insights CMP_ID 12000 18500 620 74
.igfunnel CMP_ID
```

Angka pada contoh Insights harus diganti dengan data aktual dari satu periode Insights yang konsisten. Goal merupakan sasaran pengukuran, bukan jaminan dan bukan instruksi follow otomatis. Panduan: [Growth Campaigns](docs/GROWTH-CAMPAIGNS.md) dan [Follower Growth Playbook](docs/FOLLOWER-GROWTH-PLAYBOOK.md).

## 7. Content-to-Follower Intelligence

Pencatatan konten dan analisis perbandingan:

```text
.igcontent add -|Tutorial Reels|https://www.instagram.com/reel/ABC123/|reel|coding tutorial|12500|18000|750|82|640|35|90|120
.igcontent list
.igcontent report CONTENT_ID
.igcontent compare
```

Kolom metrik mengikuti urutan command help plugin: campaign ID (`-` bila tidak terkait), label, URL konten, format, tema, reach, impressions, profile visits, follows, likes, comments, shares, saves. Data berasal dari input owner; fitur tidak melakukan scraping atau mengambil Insights privat secara otomatis. Detail: [Content-to-Follower Intelligence](docs/CONTENT-TO-FOLLOWER-INTELLIGENCE.md).

## 8. Academi.cx Document Review — terpisah dari Instagram

Plugin `.acad` menggunakan API resmi Academi.cx dan tidak memakai session Instagram, Growth store, atau Baileys internals. Semua command tetap mengikuti otorisasi owner WHISKAY. Menu memisahkan seluruh kelompok Instagram dengan satu baris `━━━━━━━━━━━━━━━━━━━━━━━━` sebelum plugin Academi.cx.

Command yang tersedia:

```text
.acad help
.acad info
.acad ai CONFIRM <teks|nama_file>
.acad similarity CONFIRM <teks|nama_file>
.acad full CONFIRM <teks|nama_file>
.acad status <check_id>
.acad list [1-100] [starting_after_id]
.acad report <check_id> [similarity|pdf|original]
.acad delete <check_id> CONFIRM
```

Teks harus 125–50.000 kata menurut batas provider; teks langsung dari chat dibatasi 2.500 karakter default, sedangkan dokumen ditempatkan terlebih dahulu di `data/academic-inputs/` (PDF, DOC, DOCX, TXT; maksimal 50 MB). Pengiriman setiap pemeriksaan membutuhkan kata `CONFIRM` karena dokumen dikirim ke penyedia eksternal. Unduhan laporan dibatasi 20 MiB oleh client.

Kunci API disimpan di `.env` sebagai `ACADEMICX_KEY`; jangan masukkan kunci atau naskah privat ke README, log, test fixture, atau repository. WHISKAY tidak menyediakan wallet, balance, usage ledger, billing, top-up, ataupun payment command. Academi.cx adalah layanan eksternal yang dapat mengenakan biaya pada akun API provider; pastikan tarif dan kuota provider sebelum submit. AI score hanyalah indikator dan similarity report harus ditinjau manual.

Panduan lengkap: [Academi.cx Document Review](docs/ACADEMIC-DOCUMENT-REVIEW.md).


## 9. WhatsApp Message Router — pemilihan tipe pesan

Semua plugin memakai adapter `send()` yang sama. Router memilih transport berdasarkan tujuan pesan, bukan sekadar menempelkan tombol pada setiap jawaban:

- Quick reply untuk tindakan pendek yang menjalankan command WHISKAY; ID respons diteruskan kembali ke parser command dan tetap melalui pemeriksaan owner/anti-spam.
- CTA URL untuk tautan HTTPS, WebView CTA untuk situs yang memang cocok dibuka dalam webview (client dapat fallback ke browser), dan CTA Copy untuk ID/kode publik non-rahasia.
- Single Select / button list untuk menu dan submenu; Native Flow biasa untuk beberapa aksi; hydrated Template Buttons hanya fallback client lama.
- Rich Card untuk satu ringkasan/hasil, termasuk konten AI tanpa identitas Meta AI palsu; carousel untuk 2–10 kartu; poll native untuk voting WhatsApp.
- Media mencakup image, video, PTV/video note, audio, voice/PTT, document, sticker, dan GIF; selain itu terdapat vCard, lokasi statis, tabel/code/link/LaTeX text fallback.
- Product Message hanya layak bila tersedia akun Business serta metadata produk/katalog WhatsApp yang sah. WHISKAY tidak membuat produk, stok, harga, identitas AI, payment, status, atau live-location palsu.

Command pemeriksaan: `.wacapabilities`, `.waform help`, `.waform mixed`, `.waform list`, `.waform card`, `.waform carousel`, `.waform poll`, `.waform media`, dan `.mediainfo`. Matriks penggunaan, API plugin, batas tombol, serta catatan kompatibilitas: [WhatsApp Message Router](docs/WHATSAPP-MESSAGE-ROUTER.md), [Native Flow](docs/NATIVE-FLOW.md), dan [Baileys Serializer Reference](docs/BAILEYS-SERIALIZER-REFERENCE.md).

## 10. Video HD lokal — preset Remini-style

`.remini` menerima video terlampir atau video yang dibalas; proses upscale/filter berjalan lokal dengan FFmpeg/FFprobe. Command yang tersedia: `.remini status`, `.remini presets`, `.remini inspect`, `.remini enhance balanced`, `.remini enhance sharp`, `.remini enhance clean`, dan `.remini enhance fast`. Preset mengatur karakter resize, denoise, sharpening, dan warna. Ini bukan API Remini cloud atau model AI Remini; command tidak mengambil URL arbitrer dan tidak mengirim file ke layanan pihak ketiga.

Pasang FFmpeg/FFprobe pada host, misalnya Termux `pkg install ffmpeg` atau Debian/Ubuntu `apt install ffmpeg`. Batas proses dan keterbatasan kualitas dijelaskan di [Video HD](docs/VIDEO-HD.md).

## 11. Arsitektur dan lokasi file

| Lapisan | Lokasi | Fungsi |
|---|---|---|
| Bootstrap | `index.mjs`, `scripts/start.mjs` | Startup, shutdown, process lock |
| WhatsApp | `src/wa.mjs`, `src/commands.mjs`, `src/lib/whatsapp-message-router.mjs` | Baileys, parsing command, owner auth, unified message routing |
| Runtime mode | `src/lib/runtime-mode.mjs` | Persistensi mode self/public dan group switch |
| Plugins | `src/plugins/` | Core, Instagram stats/growth, referral opsional, Academi.cx review |
| Instagram bridge | `src/instagram.mjs`, `python/` | Satu session Instagram dan pembacaan terbatas |
| Session identity | `src/growth/session-target.mjs` | Normalisasi identitas campaign dari session |
| Growth store | `src/growth/store.mjs` | Campaign dan content post organik; schema allowlist v5 |
| Funnel | `src/growth/funnel.mjs` | Rasio reach → profile visit → follow |
| Content intelligence | `src/growth/content-intelligence.mjs` | Metrik, agregasi format/tema, perbandingan konten |
| Security | `src/security/` | Redaction, anti-spam, permission, private filesystem |
| Referral | `src/referral/` | Claim signup terverifikasi; terpisah dari pertumbuhan Instagram |
| Academi.cx | `src/academic/client.mjs`, `src/plugins/academic-review.mjs` | Document-review API terisolasi; tidak memakai session Instagram |
| QA adapter | `src/adapters/` | Receiver loopback untuk pengujian lokal, bukan transport Instagram |
| Tests | `test/` | Node Test Runner dengan state privat terisolasi |
| Scripts | `scripts/` | Start, validate, doctor, QA, packaging |
| Documentation | `docs/` | Semua dokumentasi selain README |

Lihat [Architecture](docs/ARCHITECTURE.md), [Project Structure](docs/PROJECT-STRUCTURE.md), dan [Baileys Runtime](docs/BAILEYS-RUNTIME.md).

## 12. Data privat dan migrasi legacy

- `.env`: secret lokal.
- `config/app.json`: konfigurasi operator lokal.
- `session/`: session WhatsApp.
- `auth_ig/`: satu session Instagram.
- `data/instagram-growth.json`: campaign dan histori konten.
- `data/`: runtime state lokal lain.

Folder dan file privat tidak disertakan source ZIP. Growth store v5 hanya memuat field campaign/content yang diizinkan. Field legacy seperti `balance`, `credits`, `ledger`, `orders`, `idempotency`, dan `budget` campaign diabaikan saat dibaca dan tidak ditulis kembali pada persistensi berikutnya. Data input Academi.cx hanya berada di `data/academic-inputs/` dan tidak masuk source release. Migrasi ini tidak menghapus file sumber sebelum penulisan sukses. Tetap buat backup privat di luar proyek sebelum upgrade. Lihat [Removed Financial Concepts](docs/REMOVED-FINANCIAL-CONCEPTS-v0.10.12.md) dan [Upgrade v0.10.12](docs/upgrades/UPGRADE-v0.10.12.md).

## 13. Scripts dan QA

Semua `.mjs`/`.sh` yang dipertahankan harus tercatat di [Scripts Reference](docs/guides/SCRIPTS-REFERENCE.md). Script tidak boleh disalin sebagai backup atau arsip ke source tree. Periksa daftar perintah di `package.json`; gunakan nama perintah kanonis.

| Command | Tujuan |
|---|---|
| `npm run check` | Syntax check source/test/script |
| `npm run docs:check` | Indeks README, link, release docs, script inventory, arsip |
| `npm test` | Seluruh tes otomatis |
| `npm run qa` | Gerbang QA lokal |
| `npm run doctor` | Diagnostik runtime |
| `npm run instagram:doctor` | Diagnostik adapter/session Instagram |
| `npm run security:permissions` | Audit permission private state |
| `npm run security:check` | Audit dependency; perlu akses registry npm |
| `npm run package:release` | Membuat source ZIP bersih di luar root proyek |

QA tidak menguji koneksi live WhatsApp/Instagram, tidak menguji hasil pertumbuhan follower, dan tidak menjalankan tindakan Instagram. Referral menggunakan mock atau konfigurasi backend yang terpisah.

## 14. Dokumentasi lengkap

README ini adalah indeks utama. Semua dokumen Markdown lain berada di `docs/` dan diperiksa oleh `npm run docs:check`.

### Kebijakan, arsitektur, dan keamanan

- [Change Policy](docs/CHANGE-POLICY.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Architecture Review v0.9.4](docs/ARCHITECTURE_REVIEW_v0.9.4.md)
- [Project Structure](docs/PROJECT-STRUCTURE.md)
- [Security](docs/SECURITY.md)
- [Configuration](docs/CONFIGURATION.md)
- [Baileys Runtime](docs/BAILEYS-RUNTIME.md)
- [Baileys Serializer Reference](docs/BAILEYS-SERIALIZER-REFERENCE.md)
- [WhatsApp Message Router](docs/WHATSAPP-MESSAGE-ROUTER.md)
- [Video HD](docs/VIDEO-HD.md)
- [Native Flow](docs/NATIVE-FLOW.md)
- [Mode and Group Access](docs/MODE-AND-GROUP-ACCESS.md)

### Instagram dan pertumbuhan organik

- [Instagram Python Adapter](docs/INSTAGRAM-PYTHON-ADAPTER.md)
- [Session-Bound Campaigns](docs/SESSION-BOUND-CAMPAIGNS.md)
- [Growth Campaigns](docs/GROWTH-CAMPAIGNS.md)
- [Follower Growth Playbook](docs/FOLLOWER-GROWTH-PLAYBOOK.md)
- [Content-to-Follower Intelligence](docs/CONTENT-TO-FOLLOWER-INTELLIGENCE.md)
- [Removed Financial Concepts v0.10.12](docs/REMOVED-FINANCIAL-CONCEPTS-v0.10.12.md)

### Referral dan QA adapter

- [Referral Integration](docs/REFERRAL-INTEGRATION.md)
- [Referral Module Guide](docs/guides/REFERRAL-MODULE.md)
- [Instagram Referral Config v0.10.4](docs/INSTAGRAM-REFERRAL-CONFIG-v0.10.4.md)
- [Local QA HTTP Adapter](docs/LOCAL-QA-HTTP-ADAPTER.md)

### Academi.cx Document Review

- [Academic Document Review](docs/ACADEMIC-DOCUMENT-REVIEW.md)

### Panduan operasional

- [Menu Example](docs/guides/MENU-EXAMPLE.md)
- [Scripts Reference](docs/guides/SCRIPTS-REFERENCE.md)
- [Local QA Runbook](docs/qa/RUN-LOCAL-QA.md)

### Riwayat dan catatan versi

- [Changelog](docs/CHANGELOG.md)
- [Release Notes v0.10.16](docs/releases/RELEASE-NOTES-v0.10.16.md)
- [Upgrade Guide v0.10.16](docs/upgrades/UPGRADE-v0.10.16.md)
- [QA Report v0.10.16](docs/qa/QA-REPORT-v0.10.16.md)
- [Release Notes v0.10.15](docs/releases/RELEASE-NOTES-v0.10.15.md)
- [Upgrade Guide v0.10.15](docs/upgrades/UPGRADE-v0.10.15.md)
- [QA Report v0.10.15](docs/qa/QA-REPORT-v0.10.15.md)
- [Release Notes v0.10.14](docs/releases/RELEASE-NOTES-v0.10.14.md)
- [Upgrade Guide v0.10.14](docs/upgrades/UPGRADE-v0.10.14.md)
- [QA Report v0.10.14](docs/qa/QA-REPORT-v0.10.14.md)
- [Release Notes v0.10.12](docs/releases/RELEASE-NOTES-v0.10.12.md)
- [Upgrade Guide v0.10.12](docs/upgrades/UPGRADE-v0.10.12.md)
- [QA Report v0.10.12](docs/qa/QA-REPORT-v0.10.12.md)

Dokumen release/upgrade/QA versi lama dipertahankan hanya sebagai rekam jejak. Instruksi historis yang menyebut fitur finansial atau provider lama bukan fitur aktif WHISKAY. Integrasi Academi.cx pada v0.10.15 hanya merupakan plugin document review dan tidak menambahkan subsistem finansial WHISKAY. v0.10.16 memusatkan pemilihan transport pesan WhatsApp dan memperluas preset Video HD lokal.

## 13. Indeks lengkap seluruh dokumen

Setiap dokumen `docs/**/*.md` ditautkan langsung di bawah ini agar pemeriksaan dokumentasi dan navigasi source selalu lengkap.

- [ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [ACADEMIC-DOCUMENT-REVIEW.md](docs/ACADEMIC-DOCUMENT-REVIEW.md)
- [RELEASE-NOTES-v0.10.15.md](docs/releases/RELEASE-NOTES-v0.10.15.md)
- [UPGRADE-v0.10.15.md](docs/upgrades/UPGRADE-v0.10.15.md)
- [QA-REPORT-v0.10.15.md](docs/qa/QA-REPORT-v0.10.15.md)
- [ARCHITECTURE_REVIEW_v0.9.4.md](docs/ARCHITECTURE_REVIEW_v0.9.4.md)
- [BAILEYS-RUNTIME.md](docs/BAILEYS-RUNTIME.md)
- [CHANGE-POLICY.md](docs/CHANGE-POLICY.md)
- [CHANGELOG.md](docs/CHANGELOG.md)
- [CONFIGURATION.md](docs/CONFIGURATION.md)
- [CONTENT-TO-FOLLOWER-INTELLIGENCE.md](docs/CONTENT-TO-FOLLOWER-INTELLIGENCE.md)
- [FOLLOWER-GROWTH-PLAYBOOK.md](docs/FOLLOWER-GROWTH-PLAYBOOK.md)
- [GROWTH-CAMPAIGNS.md](docs/GROWTH-CAMPAIGNS.md)
- [INSTAGRAM-PYTHON-ADAPTER.md](docs/INSTAGRAM-PYTHON-ADAPTER.md)
- [INSTAGRAM-REFERRAL-CONFIG-v0.10.4.md](docs/INSTAGRAM-REFERRAL-CONFIG-v0.10.4.md)
- [LOCAL-QA-HTTP-ADAPTER.md](docs/LOCAL-QA-HTTP-ADAPTER.md)
- [MODE-AND-GROUP-ACCESS.md](docs/MODE-AND-GROUP-ACCESS.md)
- [NATIVE-FLOW.md](docs/NATIVE-FLOW.md)
- [PROJECT-STRUCTURE.md](docs/PROJECT-STRUCTURE.md)
- [REFERRAL-INTEGRATION.md](docs/REFERRAL-INTEGRATION.md)
- [REMOVED-FINANCIAL-CONCEPTS-v0.10.12.md](docs/REMOVED-FINANCIAL-CONCEPTS-v0.10.12.md)
- [SECURITY.md](docs/SECURITY.md)
- [SESSION-BOUND-CAMPAIGNS.md](docs/SESSION-BOUND-CAMPAIGNS.md)
- [MENU-EXAMPLE.md](docs/guides/MENU-EXAMPLE.md)
- [REFERRAL-MODULE.md](docs/guides/REFERRAL-MODULE.md)
- [SCRIPTS-REFERENCE.md](docs/guides/SCRIPTS-REFERENCE.md)
- [QA-REPORT-v0.10.0.md](docs/qa/QA-REPORT-v0.10.0.md)
- [QA-REPORT-v0.10.1.md](docs/qa/QA-REPORT-v0.10.1.md)
- [QA-REPORT-v0.10.10.md](docs/qa/QA-REPORT-v0.10.10.md)
- [QA-REPORT-v0.10.12.md](docs/qa/QA-REPORT-v0.10.12.md)
- [QA-REPORT-v0.10.14.md](docs/qa/QA-REPORT-v0.10.14.md)
- [QA-REPORT-v0.10.2.md](docs/qa/QA-REPORT-v0.10.2.md)
- [QA-REPORT-v0.10.3.md](docs/qa/QA-REPORT-v0.10.3.md)
- [QA-REPORT-v0.10.5.md](docs/qa/QA-REPORT-v0.10.5.md)
- [QA-REPORT-v0.10.6.md](docs/qa/QA-REPORT-v0.10.6.md)
- [QA-REPORT-v0.10.7.md](docs/qa/QA-REPORT-v0.10.7.md)
- [QA-REPORT-v0.10.8.md](docs/qa/QA-REPORT-v0.10.8.md)
- [QA-REPORT-v0.10.9.md](docs/qa/QA-REPORT-v0.10.9.md)
- [QA-REPORT.md](docs/qa/QA-REPORT.md)
- [RUN-LOCAL-QA.md](docs/qa/RUN-LOCAL-QA.md)
- [RELEASE-NOTES-v0.10.0.md](docs/releases/RELEASE-NOTES-v0.10.0.md)
- [RELEASE-NOTES-v0.10.1.md](docs/releases/RELEASE-NOTES-v0.10.1.md)
- [RELEASE-NOTES-v0.10.10.md](docs/releases/RELEASE-NOTES-v0.10.10.md)
- [RELEASE-NOTES-v0.10.12.md](docs/releases/RELEASE-NOTES-v0.10.12.md)
- [RELEASE-NOTES-v0.10.14.md](docs/releases/RELEASE-NOTES-v0.10.14.md)
- [RELEASE-NOTES-v0.10.2.md](docs/releases/RELEASE-NOTES-v0.10.2.md)
- [RELEASE-NOTES-v0.10.3.md](docs/releases/RELEASE-NOTES-v0.10.3.md)
- [RELEASE-NOTES-v0.10.4.md](docs/releases/RELEASE-NOTES-v0.10.4.md)
- [RELEASE-NOTES-v0.10.5.md](docs/releases/RELEASE-NOTES-v0.10.5.md)
- [RELEASE-NOTES-v0.10.6.md](docs/releases/RELEASE-NOTES-v0.10.6.md)
- [RELEASE-NOTES-v0.10.7.md](docs/releases/RELEASE-NOTES-v0.10.7.md)
- [RELEASE-NOTES-v0.10.8.md](docs/releases/RELEASE-NOTES-v0.10.8.md)
- [RELEASE-NOTES-v0.10.9.md](docs/releases/RELEASE-NOTES-v0.10.9.md)
- [RELEASE-NOTES-v0.9.3.md](docs/releases/RELEASE-NOTES-v0.9.3.md)
- [RELEASE-NOTES-v0.9.4.md](docs/releases/RELEASE-NOTES-v0.9.4.md)
- [UPGRADE-v0.10.0.md](docs/upgrades/UPGRADE-v0.10.0.md)
- [UPGRADE-v0.10.1.md](docs/upgrades/UPGRADE-v0.10.1.md)
- [UPGRADE-v0.10.10.md](docs/upgrades/UPGRADE-v0.10.10.md)
- [UPGRADE-v0.10.12.md](docs/upgrades/UPGRADE-v0.10.12.md)
- [UPGRADE-v0.10.14.md](docs/upgrades/UPGRADE-v0.10.14.md)
- [UPGRADE-v0.10.2.md](docs/upgrades/UPGRADE-v0.10.2.md)
- [UPGRADE-v0.10.3.md](docs/upgrades/UPGRADE-v0.10.3.md)
- [UPGRADE-v0.10.4.md](docs/upgrades/UPGRADE-v0.10.4.md)
- [UPGRADE-v0.10.5.md](docs/upgrades/UPGRADE-v0.10.5.md)
- [UPGRADE-v0.10.6.md](docs/upgrades/UPGRADE-v0.10.6.md)
- [UPGRADE-v0.10.7.md](docs/upgrades/UPGRADE-v0.10.7.md)
- [UPGRADE-v0.10.8.md](docs/upgrades/UPGRADE-v0.10.8.md)
- [UPGRADE-v0.10.9.md](docs/upgrades/UPGRADE-v0.10.9.md)
- [UPGRADE-v0.9.0.md](docs/upgrades/UPGRADE-v0.9.0.md)
- [UPGRADE-v0.9.2.md](docs/upgrades/UPGRADE-v0.9.2.md)
- [UPGRADE-v0.9.3.md](docs/upgrades/UPGRADE-v0.9.3.md)
- [UPGRADE-v0.9.4.md](docs/upgrades/UPGRADE-v0.9.4.md)
