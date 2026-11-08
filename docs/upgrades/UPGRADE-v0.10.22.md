# Upgrade WHISKAY v0.10.22

## 1. Persiapan

Hentikan instance lama dengan `Ctrl+C` satu kali. Jangan menghapus `~/wbself`; pertahankan sebagai rollback. Pastikan arsip `WHISKAY_v0.10.22_SOURCE.zip` sudah diekstrak.

```bash
cd ~
ZIP="$HOME/WHISKAY_v0.10.22_SOURCE.zip"
OLD="$HOME/wbself"
NEW="$HOME/whiskay-v0.10.22"
unzip -q "$ZIP" -d "$HOME"
```

## 2. Pindahkan konfigurasi dan session

```bash
cp -p "$OLD/.env" "$NEW/.env"
cp -p "$OLD/config/app.json" "$NEW/config/app.json"
for d in session auth_ig data; do
  if [ -d "$OLD/$d" ]; then
    mkdir -p "$NEW/$d"
    cp -a "$OLD/$d/." "$NEW/$d/"
  fi
done
cd "$NEW"
chmod 600 .env config/app.json
```

`assets/whatsapp-media-demo/` sudah berada di source release. Jangan menyalin `node_modules`, `.git`, atau credential dari ZIP lain. Folder `data/whatsapp-media/` dapat dibuat otomatis oleh `.waform media`.

## 3. Opsional: aktifkan ProductMessage Business

Hanya jika sesi adalah WhatsApp Business dan kamu memiliki katalog produk riil, atur `.env`:

```dotenv
WHISKAY_WHATSAPP_BUSINESS_CATALOG_ENABLED=true
WHISKAY_BUSINESS_OWNER_JID=628xxxxxxxxxx@s.whatsapp.net
```

Jangan aktifkan hanya untuk menguji akun personal. Setelah start, coba `.waform product catalog`. `getCatalog()` dapat timeout pada sebagian sesi; WHISKAY tidak membuat data katalog pengganti.

## 4. Opsional: YouTube Music

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

Atur `YT_DLP_PATH` hanya bila binary tidak ada di PATH. `YOUTUBE_MUSIC_API_KEY` dan `YOUTUBE_MUSIC_CLIENT_VERSION` opsional. Uji `.ytmusic status` setelah startup.

## 5. Instalasi dan QA

```bash
npm install
# postinstall akan memeriksa dan menerapkan patch View Once Baileys rc14 secara otomatis
npm run check
npm run docs:check
npm test
npm run security:permissions
npm run validate
```

Jika patch View Once belum diterapkan karena instalasi menggunakan `--ignore-scripts`, jalankan `npm run baileys:patch-viewonce`. Jika script menolak source dependency yang tidak dikenal, jangan edit `node_modules` secara manual; periksa versi Baileys dan dokumentasi Message Lab.

Jika semua lulus:

```bash
npm start
```

## 6. Uji command setelah pairing tersambung

```text
.waform help
.waform template
.waform legacy-buttons
.waform carousel
.waform carousel forwarded
.waform ai-rich
.waform ai-rich html
.waform ai-rich html forwarded
.waform table
.waform product catalog
.waform media ptv
.waform media voice
.waform media gif
.waform media viewonce-image
.waform media viewonce-video
.ytmusic status
.ytmusic search <judul lagu>
```

Product send test hanya setelah data katalog dan gambar lokal yang benar tersedia. Download audio `.ytmusic play <videoId>` hanya untuk konten yang kamu miliki atau punya izin.

## 7. Rollback

Hentikan v0.10.22 dengan `Ctrl+C`. Jalankan kembali `~/wbself` dengan `.env`, `config/app.json`, session WhatsApp, session Instagram, dan data lama yang dipertahankan. Jangan menjalankan dua instance pada session yang sama secara bersamaan.
