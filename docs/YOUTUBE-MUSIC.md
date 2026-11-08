# YouTube Music — WHISKAY

Plugin `youtube-music` menambahkan command `.ytmusic` untuk pencarian YouTube Music dan pengiriman satu track audio ke chat.

## Command

```text
.ytmusic <query>
.ytmusic search <query>
.ytmusic songs <query>
.ytmusic videos <query>
.ytmusic albums <query>
.ytmusic artists <query>
.ytmusic playlists <query>
.ytmusic play <videoId>
.ytmusic status
.ytmusic help
```

Hasil pencarian ditampilkan sebagai Native Flow Single Select. Memilih item menjalankan `.ytmusic play <videoId>`. Plugin hanya memproses satu video per command; tidak mengunduh playlist massal.

## Dependensi

- Node.js 22.5+ menyediakan Fetch API dan `AbortSignal.timeout()`.
- `yt-dlp` harus tersedia pada `PATH`, atau set `YT_DLP_PATH` di `.env`.
- `ffmpeg` diperlukan bila yt-dlp harus mengonversi audio fallback ke M4A.

Termux:

```bash
pkg update
pkg install yt-dlp ffmpeg
```

Debian/Ubuntu:

```bash
sudo apt update
sudo apt install ffmpeg
python3 -m pip install --user -U yt-dlp
```

Verifikasi:

```bash
yt-dlp --version
ffmpeg -version
```

## Konfigurasi opsional

```dotenv
YOUTUBE_MUSIC_API_KEY=
YOUTUBE_MUSIC_CLIENT_VERSION=
YT_DLP_PATH=
```

`YOUTUBE_MUSIC_API_KEY` adalah override untuk public WEB_REMIX client key. Nilai default yang disertakan berasal dari contoh kode yang diberikan operator; ini bukan kredensial akun pribadi. YouTube dapat mengubah key, client version, struktur InnerTube, atau membatasi request. Jika pencarian gagal, perbarui key/client version melalui `.env`, bukan dengan menaruh kredensial di source.

## Batas keamanan dan operasi

- URL download dibatasi ke `youtube.com`, `www.youtube.com`, `music.youtube.com`, dan `youtu.be`; hanya satu video ID yang diterima.
- Playlist, URL pencarian, host lain, dan URL dengan userinfo ditolak.
- `yt-dlp` dijalankan dengan `spawn()` dan `shell:false`; tidak ada shell interpolation.
- Timeout unduh dibatasi 150 detik (maksimum konfigurasi internal 240 detik), ukuran output dibatasi 32 MiB secara default dan maksimum 64 MiB.
- File sementara ditulis di `data/youtube-music/`, dikirim sebagai audio M4A, lalu dihapus setelah proses selesai.
- Plugin tidak melakukan pencarian playlist massal, upload ulang, atau distribusi otomatis.
- Gunakan hanya materi yang kamu miliki atau yang kamu punya izin untuk mengunduh. Hormati hak cipta dan ketentuan YouTube.

## Troubleshooting

- `.ytmusic status` memeriksa apakah `yt-dlp` dapat dipanggil.
- `yt-dlp not found`: pasang paket dan pastikan direktori binary ada di `PATH`, atau set `YT_DLP_PATH`.
- `ffmpeg not found`: pasang FFmpeg; ekstraksi M4A fallback memerlukannya.
- Pencarian gagal: YouTube InnerTube adalah API web tidak resmi dan dapat berubah. Coba lagi nanti atau perbarui `YOUTUBE_MUSIC_CLIENT_VERSION` / `YOUTUBE_MUSIC_API_KEY`.
- Download gagal: periksa ID video, batas ukuran, koneksi, dan ketersediaan video di wilayah akun.
