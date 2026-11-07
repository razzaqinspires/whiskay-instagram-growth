# WHISKAY Video HD — Local FFmpeg Enhancement

## Asal fitur dan batas klaim

Referensi awal berasal dari scraper komunitas [XZEERH / KumpulanScraper `scrape-remini-video-hd.js`](https://github.com/XZEERH/KumpulanScraper/blob/main/scrape-remini-video-hd.js), yang mencantumkan Razeerh sebagai creator, kanal WhatsApp, listing aplikasi Remini, dan FFmpeg/FFprobe. Sumber tersebut melakukan scraping metadata Play Store, mengambil video dari input lokal atau URL, memeriksa metadata dengan FFprobe (plus parser MP4 sederhana), kemudian memproses ulang video memakai FFmpeg.

WHISKAY mengadaptasi bagian pemrosesan lokal yang relevan, bukan mengambil seluruh downloader/scraper. Ini **bukan integrasi API cloud Remini**, bukan login ke aplikasi Remini, dan tidak mengirim video ke server Remini. FFmpeg dapat melakukan upscale/filter/denoise/sharpen, tetapi tidak otomatis memulihkan detail yang tidak terdapat pada frame sumber atau menyamai model AI cloud.

## Command

```text
.remini help
.remini status
.remini info
.remini presets
.remini inspect
.remini
.remini enhance [balanced|sharp|clean|fast]
.remini balanced
.remini sharp
.remini clean
.remini fast
```

Lampirkan video dengan caption command atau balas pesan video. `.remini inspect` hanya membaca metadata. `.remini` dan `.remini enhance <preset>` menjalankan proses encoding, lalu mengirim hasil MP4 kembali ke chat.

## Preset

| Preset | Filter | Kegunaan |
|---|---|---|
| `balanced` | Lanczos + denoise ringan + sharpen + koreksi warna | Default umum |
| `sharp` | Lanczos + denoise lebih ringan + penajaman lebih kuat | Sumber relatif bersih; noise dapat ikut terlihat |
| `clean` | Lanczos + denoise lebih kuat + sharpen ringan | Sumber banyak noise |
| `fast` | Bicubic resize | Beban filter lebih rendah |

Setiap preset memakai fallback filter Lanczos yang lebih sederhana lalu Bicubic bila filter utama gagal. Filter hanya mengubah piksel, bukan generator frame AI.

## Persyaratan

Termux:

```bash
pkg update
pkg install ffmpeg
ffmpeg -version
ffprobe -version
```

Debian/Ubuntu:

```bash
sudo apt update
sudo apt install ffmpeg
ffmpeg -version
ffprobe -version
```

Jika binary berada di lokasi khusus, atur `FFMPEG_PATH` dan `FFPROBE_PATH` di `.env`. Setelah runtime restart, periksa `.remini status`.

## Batas proses WHISKAY

- Input maksimum 64 MiB.
- Output maksimum 128 MiB.
- Durasi maksimum 5 menit.
- Dimensi sumber maksimum 3.840 piksel per sisi.
- Encoding timeout 15 menit.
- Buffer diproses dari WhatsApp dalam direktori temporary privat; direktori dihapus dalam `finally`.
- FFprobe memeriksa metadata input dan output.
- Skala maksimum 2x dengan batas output 3.840 px. Video yang sudah menyentuh batas dimensi output tidak diproses karena tidak akan mengalami upscale bermakna.
- Hasil dikirim sebagai video MP4 atau document MP4 bila buffer hasil melebihi batas inline internal.

Batas WhatsApp aktual dapat berbeda dari batas internal WHISKAY. Beban CPU/RAM meningkat seiring resolusi dan durasi; jangan menjalankan banyak job besar bersamaan.

## Adaptasi keamanan

WHISKAY tidak mengadopsi arbitrary URL fetch, redirect downloader, file path bebas dari CLI/chat, Google Play scraping runtime, parser MP4 fallback yang belum diverifikasi, JSON result file global, atau path output bersama. Video input berasal dari attachment/quoted message WhatsApp lalu diunduh lewat Baileys bounded stream. Ini mengurangi SSRF dan path traversal serta memastikan file temporary dibersihkan.

Tidak ada dependency `cheerio` atau axios tambahan untuk fitur ini. `axios` yang sudah berada pada dependency utama tidak digunakan oleh engine Video HD.

## Privasi

Media dibaca lokal dari stream WhatsApp dan diproses lokal. Tidak ada upload video ke Remini atau provider eksternal. Hasil hanya dikirim kembali ke chat yang memanggil command. File temporary dihapus pada blok `finally`, termasuk ketika proses gagal.

## Catatan sumber

- Creator yang dicantumkan snippet: Razeerh.
- Kanal sumber: [WhatsApp Channel](https://whatsapp.com/channel/0029VbCN4sQLo4hhDCkOHX1m).
- Base app listing: [Remini on Google Play](https://play.google.com/store/apps/details?id=com.bigwinepot.nwdn.international).
- Upstream code: [scrape-remini-video-hd.js](https://github.com/XZEERH/KumpulanScraper/blob/main/scrape-remini-video-hd.js).
