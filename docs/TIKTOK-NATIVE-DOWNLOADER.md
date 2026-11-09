# TikTok Native Downloader — v0.10.23

Tanggal: 8 November 2026  
Status: implementation dan fixture QA tersedia; live provider/CDN belum diverifikasi dari lingkungan build.

## Ringkasan

WHISKAY menambahkan downloader TikTok di atas arsitektur plugin dan media yang sudah aktif. Fitur tidak menjalankan Chromium, Puppeteer, Playwright, headless browser, atau proses browser berat. Semua resolusi metadata dilakukan melalui HTTP API provider, sedangkan pengunduhan CDN dilakukan dengan `fetch` terbatas dan hasil media dikirim sebagai `Buffer` melalui `sendMedia` milik WhatsApp message router.

Command baru:

```text
.tiktok <url>
.tiktok info <url>
.tiktok audio <url>
.tiktok status
.tiktok help
```

Alias: `.tt`, `.ttdl`, `.tiktokdl`.

`.tiktok <url>` membaca metadata, mengunduh video atau item foto/slide, lalu mengirim media satu per satu. `.tiktok info` hanya membaca metadata. `.tiktok audio` mengunduh track musik apabila provider menyediakannya. `.tiktok status` hanya membaca konfigurasi lokal; command ini tidak melakukan ping provider.

## Dukungan format

- Video publik: URL video HD/utama yang disediakan provider.
- Photo post/slide: array image dari provider, maksimal 10 item per permintaan.
- Metadata: ID post, caption, kreator, username, avatar, tanggal publikasi, durasi, resolusi, views, likes, comments, shares, saves dan download count apabila field tersedia.
- Musik: title, author, ID, original-sound flag, cover, URL track dan header download jika provider menyediakannya.
- Story publik: hanya bila provider dapat mengembalikan media publik tanpa meminta bypass akses. URL story yang private, age-restricted, login-gated, atau ditolak platform tidak diproses.

Field metadata yang tidak tersedia ditampilkan sebagai `—` atau `Tidak tersedia`; WHISKAY tidak mengarang statistik, informasi kreator, atau musik.

## Provider chain dan fallback

Urutan resolver:

1. Endpoint custom pertama di `TIKTOK_SCRAPER_API_URLS` (primary).
2. Endpoint custom berikutnya (backup; maksimal tiga endpoint custom).
3. TikWM (`https://www.tikwm.com/api/`) sebagai fallback terakhir.

Jika provider berhasil me-resolve URL tetapi CDN gagal diunduh karena timeout, 404, host output tidak valid, atau kegagalan non-access lainnya, service mencoba provider berikutnya. Jika menerima HTTP 401/403 atau penanda eksplisit private account, age restriction, login required, atau access denied, service menghentikan chain. Ini disengaja agar failover tidak digunakan untuk melewati pembatasan akses.

TikWM dipakai melalui POST form (`url`, `hd=1`) dan request ke endpoint tersebut dijeda sekurang-kurangnya satu detik per proses secara default. Implementasi contoh publik TikWM menunjukkan endpoint `https://www.tikwm.com/api/` dengan field `url` dan `hd=1`; bentuk respons dan host media dapat berubah di sisi provider. Lihat [contoh integrasi TikWM](https://github.com/AndreyQq/Tiktok-Video-No-Watermark) dan [dokumentasi client tikwm](https://github.com/perpetuallyhorni/tikwm).

## Kontrak endpoint scraper custom

Endpoint custom harus berupa HTTPS publik dan menerima:

```http
POST /resolve
Content-Type: application/json
Authorization: Bearer <optional-token>
```

Payload:

```json
{
  "url": "https://www.tiktok.com/@creator/video/1234567890123456789"
}
```

Respons minimal yang diterima:

```json
{
  "success": true,
  "data": {
    "type": "video",
    "title": "Caption publik",
    "video_url": "https://<approved-tiktok-cdn>/video.mp4",
    "headersDownload": {
      "User-Agent": "Mozilla/5.0",
      "Referer": "https://www.tiktok.com/"
    },
    "author": {
      "unique_id": "creator",
      "nickname": "Creator"
    },
    "stats": {
      "play_count": 1000,
      "digg_count": 120,
      "comment_count": 10,
      "share_count": 5
    },
    "music_info": {
      "id": "music-id",
      "title": "Original sound",
      "author": "Creator",
      "play": "https://<approved-tiktok-cdn>/audio.mp3",
      "original": true
    }
  }
}
```

Untuk album foto, provider dapat mengembalikan `images`, `slides`, atau `media` sebagai array URL/object. Setiap object boleh menyediakan `url`, `type`, dan `headersDownload`. Service mengenali beberapa variasi umum field video, foto, creator, statistik, dan musik. Endpoint harus memberi URL media absolut HTTPS, kecuali relative path pada respons TikWM yang ditangani khusus.

Token `TIKTOK_SCRAPER_API_TOKEN` hanya dikirim sebagai Bearer token ke endpoint custom yang dikonfigurasi. Token tidak diteruskan ke URL media atau CDN. Endpoint custom tidak boleh mengembalikan cookie session pengguna, bearer token CDN, proxy URL, atau URL jaringan privat.

## Konfigurasi

Tambahkan ke `.env` lokal bila endpoint scraper teman/operator telah diaudit dan disediakan sebagai HTTP JSON API:

```dotenv
TIKTOK_SCRAPER_API_URLS=https://primary.example/api/tiktok/resolve,https://backup.example/api/tiktok/resolve
TIKTOK_SCRAPER_API_TOKEN=
TIKTOK_MEDIA_HOST_ALLOWLIST=cdn.example.net
```

`TIKTOK_SCRAPER_API_URLS` dipisahkan koma, titik koma, atau newline; maksimal tiga HTTPS endpoint. Urutan yang ditulis adalah urutan prioritas. `TIKTOK_SCRAPER_API_TOKEN` opsional. `TIKTOK_MEDIA_HOST_ALLOWLIST` opsional dan hanya untuk hostname CDN HTTPS publik tambahan yang sudah diperiksa operator; subdomain dari hostname terdaftar juga diizinkan.

Tanpa custom endpoint, downloader tetap mencoba TikWM. `.env.example` hanya berisi nama variabel kosong, bukan credential.

**Catatan sumber teman:** URL `https://code.jhx.my.id/rbpf` tidak dapat diambil/diinspeksi dari sesi penyusunan ini. Karena itu source tersebut belum diklaim sebagai kode yang ditransplantasi. Adapter di atas menyediakan kontrak integrasi untuk scraper milik operator yang dapat diekspos sebagai API JSON. Bila source asli diberikan sebagai file, implementasi adapter khusus dapat menggantikan kontrak generik tanpa menggandakan command `.tiktok`.

## `headersDownload` dan keamanan CDN

Service menerima `headersDownload` dari payload provider dan menyaringnya menjadi allowlist:

- `Accept`
- `Accept-Language`
- `User-Agent`
- `Referer`
- `Origin`

Nilai `Referer` dan `Origin` hanya diterima bila HTTPS dan berasal dari domain TikTok. Header `Cookie`, `Authorization`, `Proxy-Authorization`, `X-Forwarded-*`, dan header lain diabaikan. Ini mendukung permintaan CDN standar tanpa meneruskan kredensial atau mencoba menembus kontrol akses.

URL media harus HTTPS, tanpa userinfo atau port khusus, dan hostname harus cocok dengan host TikTok/TikWM yang dikenal atau daftar tambahan yang diatur operator. Setiap redirect CDN divalidasi ulang. Redirect ke host lain, localhost, IP literal, host privat, atau host yang tidak ada di allowlist ditolak.

Batas operasional:

| Kontrol | Nilai |
|---|---:|
| Endpoint custom | Maksimal 3 |
| Respons JSON provider | 1 MiB |
| Timeout resolver | 25 detik (batas kode 2–60 detik) |
| Timeout body CDN | 30 detik (batas kode 2–60 detik) |
| Redirect CDN | Maksimal 4 hop |
| Media per item | 40 MiB |
| Total media satu command | 64 MiB |
| Item media foto/slide | Maksimal 10 |
| Jeda minimum request TikWM per proses | 1 detik |

Tidak ada penyimpanan file sementara: media dibaca sebagai Buffer dengan byte cap lalu dikirim melalui `sendMedia` yang sudah ada. Command memakai anti-spam dan otorisasi owner pada jalur dispatch WHISKAY.

## File yang berubah

| Path | Tujuan / dampak |
|---|---|
| `src/media/tiktok-scraper.mjs` | Service ESM: URL validation, provider chain, normalisasi metadata/music/slide, download header sanitizer, redirect allowlist, bounded fetch dan failover. |
| `src/plugins/tiktok-downloader.mjs` | Command `.tiktok` dan alias; info-only, audio-only, download video/slide, metadata reply dan pengiriman melalui router media. |
| `.env.example` | Variabel opsional endpoint/token/host allowlist. Tidak ada nilai rahasia. |
| `test/tiktok-scraper.test.mjs` | Fixture provider, metadata, slide, fallback resolver/CDN, header filtering, restrictions, redirect, MIME dan ukuran. |
| `test/tiktok-plugin.test.mjs` | Registrasi command, parser, metadata formatting, dan dispatch ke transport media. |
| `README.md` | Petunjuk command, arsitektur media dan link dokumentasi. |
| `docs/CONFIGURATION.md` | Referensi variabel provider TikTok. |
| `docs/CHANGELOG.md` | Catatan implementasi v0.10.23. |
| `docs/PROJECT-STRUCTURE.md` | Inventory layer media/plugin/tests. |
| `docs/releases/RELEASE-NOTES-v0.10.23.md` | Ringkasan perubahan rilis. |
| `docs/upgrades/UPGRADE-v0.10.23.md` | Langkah konfigurasi dan rollback. |
| `docs/qa/QA-REPORT-v0.10.23.md` | Hasil uji lokal dan batas verifikasi live. |

## QA dan batas verifikasi

Jalankan tes fokus:

```bash
node --test test/tiktok-scraper.test.mjs test/tiktok-plugin.test.mjs
```

Jalankan pemeriksaan repository:

```bash
npm run check
npm run docs:check
npm test
```

Tes otomatis memakai `fetch` fixture; tes tersebut tidak membuktikan provider publik atau CDN TikTok/TikWM tersedia saat runtime. Live test harus memakai URL publik yang boleh diunduh, dilakukan secara manual dalam jumlah terbatas, serta menghormati hak cipta, privasi, dan ketentuan platform.

## Privasi, hak cipta, dan batas produk

URL publik yang diminta akan dikirim ke endpoint custom bila dikonfigurasi, atau ke TikWM sebagai fallback. Media yang sudah lolos pemeriksaan host akan diunduh dari CDN dan dikirim kembali ke chat peminta. Jangan mengirim tautan private atau konten milik orang lain tanpa izin. WHISKAY tidak login ke TikTok, tidak mengimpor cookie pengguna, tidak mengambil data akun privat, tidak melewati age gate/region gate, tidak menghapus watermark dengan teknik bypass, dan tidak menjalankan follow/like/comment/share/DM otomatis.
