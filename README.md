# WHISKAY — Private WhatsApp Runtime & Organic Instagram Growth

**Versi 0.10.31 — WhatsApp Message Engine Integration · Delivery Reliability · Native Flow · Media Recovery · Owner Runtime & Organic Growth**  
**Tanggal:** 9 November 2026  
**Runtime:** Node.js 22.5–22.x · npm 10+ · Python 3.11+ untuk adapter Instagram

WHISKAY adalah proyek eksperimental private/self berbasis WhatsApp Baileys. Sistem ini membantu owner mengelola command pribadi, memeriksa satu akun Instagram yang sedang login, mencatat campaign organik, menganalisis performa konten, menyediakan downloader media, pemeriksaan dokumen Academi.cx, dan adapter AI scraping eksternal yang nonaktif secara default. Proyek belum menjadi layanan publik dan tidak memiliki subsistem saldo, wallet, kredit, ledger, budget, order, atau pembayaran internal. Plugin Academi.cx tetap dapat memakai akun API eksternal milik operator dan provider dapat menerapkan biaya sendiri.

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

Dokumentasi rilis terbaru: [Part 5 Message Engine Integration Research](docs/research/WHATSAPP-MESSAGE-ENGINE-INTEGRATION-v0.10.31.md), [Release Notes v0.10.31](docs/releases/RELEASE-NOTES-v0.10.31.md), [Upgrade v0.10.31](docs/upgrades/UPGRADE-v0.10.31.md), dan [QA v0.10.31](docs/qa/QA-REPORT-v0.10.31.md). Riwayat Part 4: [Baileys Delivery Research](docs/research/BAILEYS-DELIVERY-RESEARCH-v0.10.30.md), [Release Notes v0.10.30](docs/releases/RELEASE-NOTES-v0.10.30.md), [Upgrade v0.10.30](docs/upgrades/UPGRADE-v0.10.30.md), dan [QA v0.10.30](docs/qa/QA-REPORT-v0.10.30.md). Riwayat Part 3: [Baileys Interactive Research](docs/research/BAILEYS-INTERACTIVE-RESEARCH-v0.10.29.md), [Release Notes v0.10.29](docs/releases/RELEASE-NOTES-v0.10.29.md), [Upgrade v0.10.29](docs/upgrades/UPGRADE-v0.10.29.md), dan [QA v0.10.29](docs/qa/QA-REPORT-v0.10.29.md). Riwayat Part 2: [Baileys Media Research v0.10.28](docs/research/BAILEYS-MEDIA-RESEARCH-v0.10.28.md), [Release Notes v0.10.28](docs/releases/RELEASE-NOTES-v0.10.28.md), [Upgrade v0.10.28](docs/upgrades/UPGRADE-v0.10.28.md), dan [QA v0.10.28](docs/qa/QA-REPORT-v0.10.28.md).

Dokumentasi integrasi dan source governance: [WhatsApp Message Engine Research v0.10.31](docs/research/WHATSAPP-MESSAGE-ENGINE-INTEGRATION-v0.10.31.md), [Project Structure](docs/PROJECT-STRUCTURE.md), [Scripts Reference](docs/guides/SCRIPTS-REFERENCE.md), [Research Register](docs/RESEARCH-REGISTER.md), dan [Growth Queue Operations — retired historical reference](docs/GROWTH-QUEUE-OPERATIONS.md).

## 2. Persyaratan dan instalasi

- Linux, Debian proot, atau Termux dengan lingkungan Node yang sesuai.
- Node.js 22.5 sampai 22.x dan npm 10+.
- Python 3.11+ hanya untuk adapter Instagram.
- Akun WhatsApp owner untuk pairing Baileys.

```bash
unzip whiskay-instagram-growth-v0.10.30.zip
cd whiskay-instagram-growth-v0.10.30
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

### Owner Code Runtime (bukan command/plugin)

WHISKAY menyediakan jalur runtime privat untuk owner melalui pesan WhatsApp biasa. Sintaks khusus ini tidak masuk menu/plugin command:

| Prefix | Runtime | Contoh |
|---|---|---|
| `>` | JavaScript async eval | `> return await Promise.resolve(process.version)` |
| `=>` | JavaScript expression/return eval | `=> process.platform` |
| `$` | CLI Bash | `$ pwd && node --version` |
| `>>` | Python 3 | `>> print("python runtime ready")` |
| `>>>` | Go | `>>> package main\nimport "fmt"\nfunc main(){fmt.Println("go runtime ready")}` |

Kelima prefix hanya berjalan pada private self-chat akun owner yang terautentikasi (`fromMe`, nomor sesi cocok dengan `whatsapp.ownerNumber`, dan JID tujuan terpetakan ke nomor owner). Pesan grup, chat kontak lain, pengirim lain, dan pesan history/backfill tidak menjalankan kode. Akses tetap owner-only ketika runtime mode `public`; mode tersebut tidak mengubah kebijakan runtime khusus ini. Detail sintaks, konfigurasi, dan batas keamanan: [Owner Code Runtime](docs/OWNER-CODE-RUNTIME.md).

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

Integrasi downloader Instagram publik KOL.ID tersedia melalui `.igdl`; detail batas host, CSRF, async job, dan ukuran media terdapat di [KOL.ID Instagram Downloader](docs/KOL-ID-INSTAGRAM-DOWNLOADER.md).

## 9. AI Scrape Gateway (opsional dan owner-only)

`.aiscrape` mengirim hanya URL dan prompt yang diketik owner ke satu endpoint HTTPS yang telah dikonfigurasi dan di-allowlist. Perintah membutuhkan `CONFIRM`, memiliki cooldown 30 detik, timeout maksimal 90 detik, batas respons 512 KiB, dan membatasi hasil chat ke 3.500 karakter. Status/help/info tidak melakukan request jaringan.

```text
.aiscrape help
.aiscrape info
.aiscrape status
.aiscrape run CONFIRM https://example.com/article | Ringkas artikel dan tulis poin utama.
```

Gateway dinonaktifkan secara default. Konfigurasi menggunakan `IRFAN_SCRAPE_*` pada `.env`; host endpoint wajib HTTPS dan harus cocok persis dengan `IRFAN_SCRAPE_ALLOWED_HOSTS`. `IRFAN_SCRAPE_API_TOKEN` hanya dikirim sebagai Bearer token ke gateway tersebut. Target URL privat, localhost, dan IP reserved ditolak. Redirect gateway ditolak.

Adapter ini **bukan transplantasi paket `irfan-cpp` dan bukan implementasi `Scrape.build()`**. Paket, repository, lisensi, lifecycle scripts, dependensi, dan provenance-nya belum berhasil diverifikasi dari sumber yang tersedia; URL scraper teman juga belum dapat diambil. Karena itu WHISKAY tidak memasang paket, tidak mengirim `voucher`, `token_router`, atau `light_house`, dan tidak mengklaim nama model di snippet adalah model resmi. Adapter menggunakan kontrak gateway HTTP JSON yang didokumentasikan dalam [Irfan Scrape Gateway Audit](docs/IRFAN-CPP-INTEGRATION.md).

## 10. WhatsApp Message Router — pemilihan tipe pesan

Semua plugin memakai adapter `send()` yang sama. Router memilih transport berdasarkan tujuan pesan, bukan sekadar menempelkan tombol pada setiap jawaban:

- Quick reply untuk tindakan pendek yang menjalankan command WHISKAY; ID respons diteruskan kembali ke parser command dan tetap melalui pemeriksaan owner/anti-spam.
- CTA URL untuk tautan HTTPS, WebView CTA untuk situs yang memang cocok dibuka dalam webview (client dapat fallback ke browser), dan CTA Copy untuk ID/kode publik non-rahasia.
- Single Select / button list untuk menu dan submenu; `.waform help`, `.igdl help`, `.remini help`, `.igcampaign help`, dan `.acad help` membuka menu interaktif, `.plugins` menampilkan direktori bertombol; hydrated Template Buttons hanya fallback client lama.
- Native Flow card untuk satu ringkasan sederhana; AIRichResponse protobuf yang berbeda untuk teks/code/table terstruktur tanpa mengaku sebagai Meta AI; CarouselMessage untuk 2–10 kartu dengan root context metadata; poll native untuk voting WhatsApp.
- Media mencakup image, video, PTV/video note, audio, voice/PTT, document, sticker, GIF, dan view-once image/video; selain itu terdapat vCard, lokasi statis, tabel/code lewat AIRichResponse dengan text fallback, serta EventMessage/ProductMessage tersendiri.
- Product Message hanya layak bila tersedia akun Business serta metadata produk/katalog WhatsApp yang sah. WHISKAY tidak membuat produk, stok, harga, identitas AI, payment, status, atau live-location palsu.

Command pemeriksaan: `.wacapabilities`, `.waform` dan `.waform help`, `.waform mixed`, `.waform card`, `.waform ai-rich`, `.waform ai-rich html`, `.waform carousel`, `.waform template`, `.waform product catalog`, dan `.waform media ptv|voice|gif|viewonce-image|viewonce-video`. Media demo dibaca langsung dari `assets/whatsapp-media-demo/` tanpa disalin ke `data/`; `.waform` menyediakan payload default untuk tiap sample utama. View Once memakai `additionalNodes` meta `view_once=true` serta patch mediatype Baileys rc14 otomatis saat `npm install`. Template legacy menggunakan raw proto relay untuk menghindari `Invalid media type`; Carousel dan AIRich tetap client-dependent. v0.10.29 memperbaiki descriptor binary Native Flow untuk `cta_catalog` dan `send_location`, menambahkan sample `.waform send-location`, mendukung image/video per carousel card, dan memisahkan fallback build-error dari relay-error agar tidak mengirim pesan teks duplikat ketika status relay ambigu. Lihat [WhatsApp Message Lab v0.10.22](docs/WHATSAPP-MESSAGE-LAB-v0.10.22.md), [WhatsApp Message Router](docs/WHATSAPP-MESSAGE-ROUTER.md), [Native Flow](docs/NATIVE-FLOW.md), [Baileys Interactive Research v0.10.29](docs/research/BAILEYS-INTERACTIVE-RESEARCH-v0.10.29.md), [Release Notes v0.10.29](docs/releases/RELEASE-NOTES-v0.10.29.md), [Upgrade v0.10.29](docs/upgrades/UPGRADE-v0.10.29.md), [QA v0.10.29](docs/qa/QA-REPORT-v0.10.29.md), dan [Baileys Serializer Reference](docs/BAILEYS-SERIALIZER-REFERENCE.md).

## 10. Video HD lokal — preset Remini-style

`.remini` menerima video terlampir dengan caption command, atau video yang dibalas dengan command teks. Serializer mendeteksi wrapper video/PTV dan memilih lampiran langsung terlebih dahulu, lalu quoted video. Proses upscale/filter berjalan lokal dengan FFmpeg/FFprobe. Command yang tersedia: `.remini status`, `.remini presets`, `.remini inspect`, `.remini enhance balanced`, `.remini enhance sharp`, `.remini enhance clean`, dan `.remini enhance fast`. Preset mengatur karakter resize, denoise, sharpening, dan warna. Ini bukan API Remini cloud atau model AI Remini; command tidak mengambil URL arbitrer dan tidak mengirim file ke layanan pihak ketiga.

Pasang FFmpeg/FFprobe pada host, misalnya Termux `pkg install ffmpeg` atau Debian/Ubuntu `apt install ffmpeg`. Batas proses dan keterbatasan kualitas dijelaskan di [Video HD](docs/VIDEO-HD.md).

## 11. Dependency-aware hot reload

Watcher memantau seluruh folder `src/`, termasuk library yang diimpor oleh plugin. Perubahan file di `src/academic/`, `src/lib/`, `src/growth/`, `src/media/`, `src/referral/`, `src/security/`, dan subfolder lain memicu snapshot ESM baru dan reload seluruh plugin secara konsisten. Dependency yang hilang saat startup akan dicoba kembali saat file ditambahkan. Jika reload gagal, registry lama tetap aktif.

```text
.hotreload status
.hotreload reload
.watchstatus
```

`.hotreload status` menampilkan mode, source root, jumlah direktori yang diawasi, plugin/command aktif, snapshot, dan waktu perubahan. `.hotreload reload` menjalankan snapshot secara manual. `config.mjs`, `.env`, `config/app.json`, `package.json`, `node_modules`, `index.mjs`, `scripts/`, serta loader utama tetap memerlukan restart penuh. Panduan: [Dependency-aware Hot Reload](docs/HOT-RELOAD.md).

## 12. Menu Mixed dan Command Recommendation Engine

`.menu` selalu memakai tiga tindakan: quick reply `.profile` (alias dari `.igprofile`), CTA WebView menuju [Saluran WhatsApp WHISKAY](https://whatsapp.com/channel/0029Vb8vHDB5PO0v7xAQL33e), dan Single Select sepuluh rekomendasi. Pesan masuk yang memicu menu dikirim ke Baileys sebagai `quoted` WAMessage asli; greeting memakai `pushName` yang tersedia. Preview channel menggunakan `externalAdReply`; aset bawaan merupakan ilustrasi WHISKAY, bukan foto profil channel terverifikasi. `WHISKAY_CHANNEL_THUMBNAIL_URL` dapat mengubah preview ke gambar HTTPS yang sah.

Rekomendasi dihitung dari hit command aktual, hit tujuh hari terakhir, jarak waktu sejak command dipakai, seberapa sering command dipromosikan, dan keragaman kategori. Dua slot discovery pada daftar sepuluh item mendorong command long-tail agar tidak tenggelam oleh command populer. Persentase merupakan share relatif skor pada daftar yang ditampilkan, bukan probabilitas atau persentase hit. Data lokal berada di `data/command-usage.json`. Lihat [Command Recommendation Engine](docs/COMMAND-RECOMMENDATION-ENGINE.md).

## 13. KOL.ID Instagram Downloader

`.igdl <instagram_url>` atau `.igdl extract <instagram_url>` mengambil media publik Instagram melalui KOL.ID; `.igdl info` membaca metadata halaman. Aliases: `.kolig` dan `.igdownload`. Adaptor memakai CSRF/session KOL.ID, request endpoint tetap, polling job, validasi host media dan redirect, serta batas download per-item/total. Tidak memakai session login Instagram, tidak membuka profil private, dan tidak menjalankan auto-engagement. Lihat [KOL.ID Instagram Downloader](docs/KOL-ID-INSTAGRAM-DOWNLOADER.md).

## 13A. TikTok Native Downloader

Plugin `.tiktok` (`.tt`, `.ttdl`, `.tiktokdl`) mendukung unduh video, foto/slide publik, metadata, dan track musik jika provider menyediakannya. `.tiktok info <url>` hanya membaca metadata; `.tiktok audio <url>` mengirim track musik; `.tiktok status` menampilkan konfigurasi provider. Resolver mencoba endpoint scraper utama/backup yang dikonfigurasi operator, lalu TikWM sebagai fallback terakhir. Jika resolve berhasil tetapi CDN download gagal, provider berikutnya juga dicoba. HTTP 401/403, akun privat, dan age restriction menghentikan fallback agar tidak melewati pembatasan akses.

`headersDownload` hanya meneruskan header aman (`Accept`, `Accept-Language`, `User-Agent`, `Referer`, `Origin`) ke host CDN yang diizinkan. Cookie, Authorization, proxy header, dan kredensial tidak diteruskan ke CDN. Batas unduhan adalah 10 item, 40 MiB per item, dan 64 MiB total. Stories hanya dapat diproses bila provider memang mengembalikan media publik; strict-age/private stories tidak dibypass. Detail konfigurasi, format adapter provider, dan batasannya ada di [TikTok Native Downloader](docs/TIKTOK-NATIVE-DOWNLOADER.md).

Contoh:

```text
.tiktok https://www.tiktok.com/@creator/video/1234567890123456789
.tiktok info https://www.tiktok.com/@creator/video/1234567890123456789
.tiktok audio https://www.tiktok.com/@creator/video/1234567890123456789
.tiktok status
```

## 14. YouTube Music Search & Audio

Plugin `.ytmusic` mencari lagu melalui YouTube Music InnerTube dan menampilkan hasil dalam Single Select. Memilih hasil menjalankan `.ytmusic play <videoId>` untuk mengunduh satu track M4A dengan `yt-dlp`, lalu mengirimnya ke chat. Perlu `yt-dlp` dan FFmpeg pada PATH. Perintah `.ytmusic status` memeriksa binary. Tidak ada unduhan playlist massal; gunakan hanya materi yang kamu miliki atau berizin. Detail: [YouTube Music](docs/YOUTUBE-MUSIC.md).

Contoh:

```text
.ytmusic Nadin Amizah Bertaut
.ytmusic songs Coldplay
.ytmusic play <videoId>
.ytmusic status
```

Konfigurasi optional: `YOUTUBE_MUSIC_API_KEY`, `YOUTUBE_MUSIC_CLIENT_VERSION`, dan `YT_DLP_PATH` di `.env`. InnerTube adalah endpoint web tidak resmi dan dapat berubah.


## 15. Arsitektur dan lokasi file

| Lapisan | Lokasi | Fungsi |
|---|---|---|
| Bootstrap | `index.mjs`, `scripts/start.mjs` | Startup, shutdown, process lock |
| WhatsApp | `src/wa.mjs`, `src/commands.mjs`, `src/lib/whatsapp-message-router.mjs` | Baileys, command/plugin dispatch, owner authorization, unified message routing |
| Owner runtime | `src/lib/owner-code-runtime.mjs` | JavaScript eval, CLI, Python, Go; bukan plugin command; owner private self-chat only |
| Runtime mode | `src/lib/runtime-mode.mjs` | Persistensi mode self/public dan group switch |
| Plugins | `src/plugins/` | Core, Instagram stats/growth, `.igdl` KOL.ID, `.tiktok` multi-provider, `.remini`, `.acad`, referral opsional |
| Instagram bridge | `src/instagram.mjs`, `python/` | Satu session Instagram dan pembacaan terbatas |
| Session identity | `src/growth/session-target.mjs` | Normalisasi identitas campaign dari session |
| Growth store | `src/growth/store.mjs` | Campaign dan content post organik; schema allowlist v5; tanpa order/wallet/queue |
| Funnel | `src/growth/funnel.mjs` | Rasio reach → profile visit → follow |
| Content intelligence | `src/growth/content-intelligence.mjs` | Metrik, agregasi format/tema, perbandingan konten |
| Security | `src/security/` | Redaction, anti-spam, permission, private filesystem |
| Command recommendations | `src/lib/command-recommender.mjs` | Lifetime/recent hit, exploration, exposure and category diversity |
| Media connectors | `src/media/` | KOL.ID Instagram downloader, native TikTok multi-provider scraper, YouTube Music, bounded video enhancement inputs |
| Referral | `src/referral/` | Claim signup terverifikasi; terpisah dari pertumbuhan Instagram |
| Academi.cx | `src/academic/client.mjs`, `src/plugins/academic-review.mjs` | Document-review API terisolasi; tidak memakai session Instagram |
| QA adapter | `src/adapters/` | Receiver loopback untuk pengujian lokal, bukan transport Instagram |
| Tests | `test/` | Node Test Runner dengan state privat terisolasi |
| Scripts | `scripts/` | Start, validate, doctor, QA, packaging |
| Documentation | `docs/` | Semua dokumentasi selain README |

Lihat [Architecture](docs/ARCHITECTURE.md), [Project Structure](docs/PROJECT-STRUCTURE.md), dan [Baileys Runtime](docs/BAILEYS-RUNTIME.md).

## 16. Data privat dan migrasi legacy

- `.env`: secret lokal.
- `config/app.json`: konfigurasi operator lokal.
- `session/`: session WhatsApp.
- `auth_ig/`: satu session Instagram.
- `data/instagram-growth.json`: campaign dan histori konten.
- `data/command-usage.json`: statistik hit command, promosi rekomendasi, dan histori exposure (bukan isi pesan).
- `data/`: runtime state lokal lain.

Folder dan file privat tidak disertakan source ZIP. Growth store v5 hanya memuat field campaign/content yang diizinkan. Field legacy seperti `balance`, `credits`, `ledger`, `orders`, `idempotency`, dan `budget` campaign diabaikan saat dibaca dan tidak ditulis kembali pada persistensi berikutnya. Data input Academi.cx hanya berada di `data/academic-inputs/` dan tidak masuk source release. Migrasi ini tidak menghapus file sumber sebelum penulisan sukses. Tetap buat backup privat di luar proyek sebelum upgrade. Lihat [Removed Financial Concepts](docs/REMOVED-FINANCIAL-CONCEPTS-v0.10.12.md) dan [Upgrade v0.10.12](docs/upgrades/UPGRADE-v0.10.12.md).

## 17. Scripts dan QA

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

Nama arsip dibuat otomatis dari `package.json`: `<name>-v<version>.zip` (saat ini `whiskay-instagram-growth-v0.10.29.zip`). Folder utama di dalam ZIP memakai nama yang sama. `.env`, `config/app.json`, session, database, dan runtime data tidak ikut dipaketkan. Jangan mengganti nama arsip secara manual menjadi nama yang tidak cocok dengan versi source.

QA tidak menguji koneksi live WhatsApp/Instagram/provider TikTok/AI gateway, tidak menguji hasil pertumbuhan follower, dan tidak menjalankan tindakan Instagram. Referral menggunakan mock atau konfigurasi backend yang terpisah. Tidak ada order/wallet/provider queue yang menjadi fitur runtime aktif; campaign dan analitik organik tetap aktif. Audit source upload v0.10.27 menemukan beberapa file legacy order/SQLite queue masih tertinggal meski sudah dinyatakan dihapus pada catatan v0.10.25. File tersebut tidak dijalankan dan akan dibersihkan pada Part 2; statusnya dicatat di [Project Structure](docs/PROJECT-STRUCTURE.md) dan [QA Report v0.10.27](docs/qa/QA-REPORT-v0.10.27.md).

## 18. Dokumentasi lengkap

Dokumentasi historis antrean dan riset promosi dipertahankan sebagai arsip, bukan runbook aktif. Growth worker, SMM provider, order, dan wallet tidak menjadi bagian runtime v0.10.27. Gunakan [Removed Financial Concepts](docs/REMOVED-FINANCIAL-CONCEPTS-v0.10.12.md) sebagai batas fitur aktif.

README ini adalah indeks utama. Semua dokumen Markdown lain berada di `docs/` dan diperiksa oleh `npm run docs:check`.

### Kebijakan, arsitektur, dan keamanan

- [Change Policy](docs/CHANGE-POLICY.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Architecture Review v0.9.4](docs/ARCHITECTURE_REVIEW_v0.9.4.md)
- [Project Structure](docs/PROJECT-STRUCTURE.md)
- [Security](docs/SECURITY.md)
- [Owner Code Runtime](docs/OWNER-CODE-RUNTIME.md)
- [Configuration](docs/CONFIGURATION.md)
- [Baileys Runtime](docs/BAILEYS-RUNTIME.md)
- [Baileys Serializer Reference](docs/BAILEYS-SERIALIZER-REFERENCE.md)
- [WhatsApp Message Router](docs/WHATSAPP-MESSAGE-ROUTER.md)
- [Command Recommendation Engine](docs/COMMAND-RECOMMENDATION-ENGINE.md)
- [KOL.ID Instagram Downloader](docs/KOL-ID-INSTAGRAM-DOWNLOADER.md)
- [Video HD](docs/VIDEO-HD.md)
- [Dependency-aware Hot Reload](docs/HOT-RELOAD.md)
- [Native Flow](docs/NATIVE-FLOW.md), [Baileys Interactive Research v0.10.29](docs/research/BAILEYS-INTERACTIVE-RESEARCH-v0.10.29.md), [Release Notes v0.10.29](docs/releases/RELEASE-NOTES-v0.10.29.md), [Upgrade v0.10.29](docs/upgrades/UPGRADE-v0.10.29.md), [QA v0.10.29](docs/qa/QA-REPORT-v0.10.29.md)
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

### AI Scrape Gateway

- [Irfan Scrape Gateway Audit](docs/IRFAN-CPP-INTEGRATION.md)

### Panduan operasional

- [Menu Example](docs/guides/MENU-EXAMPLE.md)
- [Scripts Reference](docs/guides/SCRIPTS-REFERENCE.md)
- [Local QA Runbook](docs/qa/RUN-LOCAL-QA.md)

### Riwayat dan catatan versi
- [Release Notes v0.10.24](docs/releases/RELEASE-NOTES-v0.10.24.md)
- [Upgrade Guide v0.10.24](docs/upgrades/UPGRADE-v0.10.24.md)
- [QA Report v0.10.24](docs/qa/QA-REPORT-v0.10.24.md)
- [Release Notes v0.10.27](docs/releases/RELEASE-NOTES-v0.10.27.md)
- [Upgrade Guide v0.10.27](docs/upgrades/UPGRADE-v0.10.27.md)
- [QA Report v0.10.27](docs/qa/QA-REPORT-v0.10.27.md)
- [Baileys Upstream Research v0.10.27](docs/research/BAILEYS-UPSTREAM-RESEARCH-v0.10.27.md)
- [Release Notes v0.10.26](docs/releases/RELEASE-NOTES-v0.10.26.md)
- [Upgrade Guide v0.10.26](docs/upgrades/UPGRADE-v0.10.26.md)
- [QA Report v0.10.26](docs/qa/QA-REPORT-v0.10.26.md)
- [Source Audit & Cleanup v0.10.25](docs/qa/SOURCE-AUDIT-v0.10.25-2026-11-08.md)
- [Release Notes v0.10.23](docs/releases/RELEASE-NOTES-v0.10.23.md)
- [Upgrade Guide v0.10.23](docs/upgrades/UPGRADE-v0.10.23.md)
- [QA Report v0.10.23](docs/qa/QA-REPORT-v0.10.23.md)
- [Release Notes v0.10.22](docs/releases/RELEASE-NOTES-v0.10.22.md)
- [Upgrade Guide v0.10.22](docs/upgrades/UPGRADE-v0.10.22.md)
- [QA Report v0.10.22](docs/qa/QA-REPORT-v0.10.22.md)
- [Release Notes v0.10.21](docs/releases/RELEASE-NOTES-v0.10.21.md)
- [Upgrade Guide v0.10.21](docs/upgrades/UPGRADE-v0.10.21.md)
- [QA Report v0.10.21](docs/qa/QA-REPORT-v0.10.21.md)
- [Release Notes v0.10.20](docs/releases/RELEASE-NOTES-v0.10.20.md)
- [Upgrade Guide v0.10.20](docs/upgrades/UPGRADE-v0.10.20.md)
- [QA Report v0.10.20](docs/qa/QA-REPORT-v0.10.20.md)
- [Release Notes v0.10.19 (historical)](docs/releases/RELEASE-NOTES-v0.10.19.md)
- [Upgrade Guide v0.10.19 (historical)](docs/upgrades/UPGRADE-v0.10.19.md)
- [QA Report v0.10.19 (historical)](docs/qa/QA-REPORT-v0.10.19.md)

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


Dokumen release/upgrade/QA versi lama dipertahankan hanya sebagai rekam jejak. Instruksi historis yang menyebut fitur finansial atau provider lama bukan fitur aktif WHISKAY. v0.10.17 memperluas hot reload ke library dan dependency ESM di bawah `src/`; v0.10.19 memperkenalkan rekonstruksi ingress/media dan KOL.ID; v0.10.20 menyempurnakan caption video, quoted-video dispatch, serta button help untuk Message Lab dan KOL.ID; v0.10.21 menambahkan alias `.profile`, mengunci call event agar hanya terkirim jika Baileys menyediakan `createCallLink`, menolak symlink media keluar dari folder, dan memberi timeout pada pembacaan body KOL.ID. v0.10.22 memperbaiki transport WhatsApp interaktif; v0.10.23 menambahkan TikTok multi-provider downloader; v0.10.24 menambahkan adapter AI scrape eksternal yang opt-in, tanpa memasang paket irfan-cpp yang belum terverifikasi. v0.10.25 menyatukan regresi Part 1–3 dan membersihkan modul order/wallet/worker Growth yang sudah dihapus oleh keputusan produk. v0.10.26 memulihkan Owner Code Runtime khusus owner dan menambahkan eksekusi Go.

## 19. Indeks lengkap seluruh dokumen

Setiap dokumen `docs/**/*.md` ditautkan langsung di bawah ini agar pemeriksaan dokumentasi dan navigasi source selalu lengkap.

- [ACADEMIC-DOCUMENT-REVIEW.md](docs/ACADEMIC-DOCUMENT-REVIEW.md)
- [ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [ARCHITECTURE_REVIEW_v0.9.4.md](docs/ARCHITECTURE_REVIEW_v0.9.4.md)
- [BAILEYS-RUNTIME.md](docs/BAILEYS-RUNTIME.md)
- [BAILEYS-SERIALIZER-REFERENCE.md](docs/BAILEYS-SERIALIZER-REFERENCE.md)
- [CHANGE-POLICY.md](docs/CHANGE-POLICY.md)
- [CHANGELOG.md](docs/CHANGELOG.md)
- [COMMAND-RECOMMENDATION-ENGINE.md](docs/COMMAND-RECOMMENDATION-ENGINE.md)
- [CONFIGURATION.md](docs/CONFIGURATION.md)
- [CONTENT-TO-FOLLOWER-INTELLIGENCE.md](docs/CONTENT-TO-FOLLOWER-INTELLIGENCE.md)
- [EXTERNAL-INTEGRATION-REQUESTS.md](docs/EXTERNAL-INTEGRATION-REQUESTS.md)
- [FOLLOWER-GROWTH-PLAYBOOK.md](docs/FOLLOWER-GROWTH-PLAYBOOK.md)
- [GROWTH-CAMPAIGNS.md](docs/GROWTH-CAMPAIGNS.md)
- [GROWTH-QUEUE-OPERATIONS.md](docs/GROWTH-QUEUE-OPERATIONS.md)
- [MENU-EXAMPLE.md](docs/guides/MENU-EXAMPLE.md)
- [REFERRAL-MODULE.md](docs/guides/REFERRAL-MODULE.md)
- [SCRIPTS-REFERENCE.md](docs/guides/SCRIPTS-REFERENCE.md)
- [HOT-RELOAD.md](docs/HOT-RELOAD.md)
- [INSTAGRAM-PYTHON-ADAPTER.md](docs/INSTAGRAM-PYTHON-ADAPTER.md)
- [INSTAGRAM-REFERRAL-CONFIG-v0.10.4.md](docs/INSTAGRAM-REFERRAL-CONFIG-v0.10.4.md)
- [IRFAN-CPP-INTEGRATION.md](docs/IRFAN-CPP-INTEGRATION.md)
- [KOL-ID-INSTAGRAM-DOWNLOADER.md](docs/KOL-ID-INSTAGRAM-DOWNLOADER.md)
- [LOCAL-QA-HTTP-ADAPTER.md](docs/LOCAL-QA-HTTP-ADAPTER.md)
- [MODE-AND-GROUP-ACCESS.md](docs/MODE-AND-GROUP-ACCESS.md)
- [NATIVE-FLOW.md](docs/NATIVE-FLOW.md)
- [PROJECT-STRUCTURE.md](docs/PROJECT-STRUCTURE.md)
- [QA-REPORT-PART1-WHATSAPP-CORE-2026-11-08.md](docs/qa/QA-REPORT-PART1-WHATSAPP-CORE-2026-11-08.md)
- [QA-REPORT-v0.10.0.md](docs/qa/QA-REPORT-v0.10.0.md)
- [QA-REPORT-v0.10.1.md](docs/qa/QA-REPORT-v0.10.1.md)
- [QA-REPORT-v0.10.10.md](docs/qa/QA-REPORT-v0.10.10.md)
- [QA-REPORT-v0.10.12.md](docs/qa/QA-REPORT-v0.10.12.md)
- [QA-REPORT-v0.10.13.md](docs/qa/QA-REPORT-v0.10.13.md)
- [QA-REPORT-v0.10.14.md](docs/qa/QA-REPORT-v0.10.14.md)
- [QA-REPORT-v0.10.15.md](docs/qa/QA-REPORT-v0.10.15.md)
- [QA-REPORT-v0.10.16.md](docs/qa/QA-REPORT-v0.10.16.md)
- [QA-REPORT-v0.10.17.md](docs/qa/QA-REPORT-v0.10.17.md)
- [QA-REPORT-v0.10.19.md](docs/qa/QA-REPORT-v0.10.19.md)
- [QA-REPORT-v0.10.2.md](docs/qa/QA-REPORT-v0.10.2.md)
- [QA-REPORT-v0.10.20.md](docs/qa/QA-REPORT-v0.10.20.md)
- [QA-REPORT-v0.10.21.md](docs/qa/QA-REPORT-v0.10.21.md)
- [QA-REPORT-v0.10.22.md](docs/qa/QA-REPORT-v0.10.22.md)
- [QA-REPORT-v0.10.23.md](docs/qa/QA-REPORT-v0.10.23.md)
- [QA-REPORT-v0.10.24.md](docs/qa/QA-REPORT-v0.10.24.md)
- [QA-REPORT-v0.10.26.md](docs/qa/QA-REPORT-v0.10.26.md)
- [QA-REPORT-v0.10.25.md](docs/qa/QA-REPORT-v0.10.25.md)
- [QA-REPORT-v0.10.3.md](docs/qa/QA-REPORT-v0.10.3.md)
- [QA-REPORT-v0.10.5.md](docs/qa/QA-REPORT-v0.10.5.md)
- [QA-REPORT-v0.10.6.md](docs/qa/QA-REPORT-v0.10.6.md)
- [QA-REPORT-v0.10.7.md](docs/qa/QA-REPORT-v0.10.7.md)
- [QA-REPORT-v0.10.8.md](docs/qa/QA-REPORT-v0.10.8.md)
- [QA-REPORT-v0.10.9.md](docs/qa/QA-REPORT-v0.10.9.md)
- [QA-REPORT.md](docs/qa/QA-REPORT.md)
- [RUN-LOCAL-QA.md](docs/qa/RUN-LOCAL-QA.md)
- [REFERRAL-INTEGRATION.md](docs/REFERRAL-INTEGRATION.md)
- [RELEASE-NOTES-v0.10.0.md](docs/releases/RELEASE-NOTES-v0.10.0.md)
- [RELEASE-NOTES-v0.10.1.md](docs/releases/RELEASE-NOTES-v0.10.1.md)
- [RELEASE-NOTES-v0.10.10.md](docs/releases/RELEASE-NOTES-v0.10.10.md)
- [RELEASE-NOTES-v0.10.12.md](docs/releases/RELEASE-NOTES-v0.10.12.md)
- [RELEASE-NOTES-v0.10.13.md](docs/releases/RELEASE-NOTES-v0.10.13.md)
- [RELEASE-NOTES-v0.10.14.md](docs/releases/RELEASE-NOTES-v0.10.14.md)
- [RELEASE-NOTES-v0.10.15.md](docs/releases/RELEASE-NOTES-v0.10.15.md)
- [RELEASE-NOTES-v0.10.16.md](docs/releases/RELEASE-NOTES-v0.10.16.md)
- [RELEASE-NOTES-v0.10.17.md](docs/releases/RELEASE-NOTES-v0.10.17.md)
- [RELEASE-NOTES-v0.10.19.md](docs/releases/RELEASE-NOTES-v0.10.19.md)
- [RELEASE-NOTES-v0.10.2.md](docs/releases/RELEASE-NOTES-v0.10.2.md)
- [RELEASE-NOTES-v0.10.20.md](docs/releases/RELEASE-NOTES-v0.10.20.md)
- [RELEASE-NOTES-v0.10.21.md](docs/releases/RELEASE-NOTES-v0.10.21.md)
- [RELEASE-NOTES-v0.10.22.md](docs/releases/RELEASE-NOTES-v0.10.22.md)
- [RELEASE-NOTES-v0.10.23.md](docs/releases/RELEASE-NOTES-v0.10.23.md)
- [RELEASE-NOTES-v0.10.24.md](docs/releases/RELEASE-NOTES-v0.10.24.md)
- [RELEASE-NOTES-v0.10.26.md](docs/releases/RELEASE-NOTES-v0.10.26.md)
- [RELEASE-NOTES-v0.10.25.md](docs/releases/RELEASE-NOTES-v0.10.25.md)
- [RELEASE-NOTES-v0.10.3.md](docs/releases/RELEASE-NOTES-v0.10.3.md)
- [RELEASE-NOTES-v0.10.4.md](docs/releases/RELEASE-NOTES-v0.10.4.md)
- [RELEASE-NOTES-v0.10.5.md](docs/releases/RELEASE-NOTES-v0.10.5.md)
- [RELEASE-NOTES-v0.10.6.md](docs/releases/RELEASE-NOTES-v0.10.6.md)
- [RELEASE-NOTES-v0.10.7.md](docs/releases/RELEASE-NOTES-v0.10.7.md)
- [RELEASE-NOTES-v0.10.8.md](docs/releases/RELEASE-NOTES-v0.10.8.md)
- [RELEASE-NOTES-v0.10.9.md](docs/releases/RELEASE-NOTES-v0.10.9.md)
- [RELEASE-NOTES-v0.9.3.md](docs/releases/RELEASE-NOTES-v0.9.3.md)
- [RELEASE-NOTES-v0.9.4.md](docs/releases/RELEASE-NOTES-v0.9.4.md)
- [REMOVED-FINANCIAL-CONCEPTS-v0.10.12.md](docs/REMOVED-FINANCIAL-CONCEPTS-v0.10.12.md)
- [RESEARCH-REGISTER.md](docs/RESEARCH-REGISTER.md)
- [RESEARCH-SOURCE.md](docs/RESEARCH-SOURCE.md)
- [SECURITY.md](docs/SECURITY.md)
- [SESSION-BOUND-CAMPAIGNS.md](docs/SESSION-BOUND-CAMPAIGNS.md)
- [TIKTOK-NATIVE-DOWNLOADER.md](docs/TIKTOK-NATIVE-DOWNLOADER.md)
- [UPGRADE-PART1-WHATSAPP-CORE-2026-11-08.md](docs/upgrades/UPGRADE-PART1-WHATSAPP-CORE-2026-11-08.md)
- [UPGRADE-v0.10.0.md](docs/upgrades/UPGRADE-v0.10.0.md)
- [UPGRADE-v0.10.1.md](docs/upgrades/UPGRADE-v0.10.1.md)
- [UPGRADE-v0.10.10.md](docs/upgrades/UPGRADE-v0.10.10.md)
- [UPGRADE-v0.10.12.md](docs/upgrades/UPGRADE-v0.10.12.md)
- [UPGRADE-v0.10.13.md](docs/upgrades/UPGRADE-v0.10.13.md)
- [UPGRADE-v0.10.14.md](docs/upgrades/UPGRADE-v0.10.14.md)
- [UPGRADE-v0.10.15.md](docs/upgrades/UPGRADE-v0.10.15.md)
- [UPGRADE-v0.10.16.md](docs/upgrades/UPGRADE-v0.10.16.md)
- [UPGRADE-v0.10.17.md](docs/upgrades/UPGRADE-v0.10.17.md)
- [UPGRADE-v0.10.19.md](docs/upgrades/UPGRADE-v0.10.19.md)
- [UPGRADE-v0.10.2.md](docs/upgrades/UPGRADE-v0.10.2.md)
- [UPGRADE-v0.10.20.md](docs/upgrades/UPGRADE-v0.10.20.md)
- [UPGRADE-v0.10.21.md](docs/upgrades/UPGRADE-v0.10.21.md)
- [UPGRADE-v0.10.22.md](docs/upgrades/UPGRADE-v0.10.22.md)
- [UPGRADE-v0.10.23.md](docs/upgrades/UPGRADE-v0.10.23.md)
- [UPGRADE-v0.10.24.md](docs/upgrades/UPGRADE-v0.10.24.md)
- [UPGRADE-v0.10.26.md](docs/upgrades/UPGRADE-v0.10.26.md)
- [UPGRADE-v0.10.25.md](docs/upgrades/UPGRADE-v0.10.25.md)
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
- [VIDEO-HD.md](docs/VIDEO-HD.md)
- [WHATSAPP-MESSAGE-LAB-v0.10.22.md](docs/WHATSAPP-MESSAGE-LAB-v0.10.22.md)
- [WHATSAPP-MESSAGE-ROUTER.md](docs/WHATSAPP-MESSAGE-ROUTER.md)
- [YOUTUBE-MUSIC.md](docs/YOUTUBE-MUSIC.md)

## Runtime validation

- Part 5 runtime validation: [RUNTIME-VALIDATION-PART5-2026-11-08.md](docs/qa/RUNTIME-VALIDATION-PART5-2026-11-08.md)

## 9. WhatsApp delivery diagnostics

`sendMessage` dan `relayMessage` dicatat oleh delivery tracker in-memory. Pemetaan LID status/broadcast juga mendukung cross-pair `participant` + `remoteJidAlt` saat bentuk envelope cocok. `sendMessage` dan `relayMessage` dicatat oleh delivery tracker in-memory. Event `messages.update` dan `message-receipt.update` dipakai untuk membedakan server acknowledgment, delivery acknowledgment, read, dan played. Periksa ringkasan melalui `.wadelivery` atau detail melalui `.wadelivery <messageId>`. `SERVER_ACK` bukan bukti pesan diterima atau dibaca oleh penerima. Hasil relay timeout dianggap ambigu dan tidak memicu resend otomatis. Cache dibatasi 2.000 record/24 jam dan hilang ketika proses restart. Detail: [Baileys Delivery Research](docs/research/BAILEYS-DELIVERY-RESEARCH-v0.10.30.md).
