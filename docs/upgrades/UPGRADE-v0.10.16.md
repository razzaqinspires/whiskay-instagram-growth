# Upgrade WHISKAY v0.10.15 → v0.10.16

## Perubahan

- Semua plugin sekarang menerima `send()` dari unified WhatsApp message router.
- Format tambahan: quick reply/CTA/list/template/rich card/carousel/poll, media (termasuk PTV dan voice note), contact, static location, table, code, link, serta LaTeX text fallback.
- `.waform` menyediakan demo tipe pesan; `.wacapabilities` menjelaskan pemilihan format.
- `.remini inspect` dan preset `balanced|sharp|clean|fast` tersedia.
- Tidak ada migrasi session, auth, config, atau Growth database.

## Upgrade

1. Hentikan instance lama dengan `Ctrl+C`.
2. Buat backup privat untuk `.env`, `config/app.json`, `session/`, `auth_ig/`, dan `data/`.
3. Ekstrak `WHISKAY_v0.10.16_SOURCE.zip` ke direktori baru `whiskay-v0.10.16/`.
4. Salin konfigurasi dan data privat dari instalasi v0.10.15; jangan menimpa konfigurasi lokal dengan template kosong.
5. Instal dependensi dan jalankan pemeriksaan:

```bash
npm install
npm run version:check
npm run validate
npm run check
npm run docs:check
npm test
npm run security:permissions
npm run doctor
```

6. Uji command berikut setelah start:

```text
.menu
.wacapabilities
.waform help
.waform quick
.waform mixed
.waform list
.waform card
.waform carousel
.waform poll
.mediainfo
.remini status
.remini presets
```

7. Untuk Video HD, gunakan file uji non-rahasia:

```text
.remini inspect
.remini enhance balanced
.remini enhance sharp
.remini enhance clean
.remini enhance fast
```

Command `inspect` membaca metadata tetapi tidak meng-encode ulang. Command `enhance` membutuhkan FFmpeg dan FFprobe. Media harus terlampir atau dikutip; URL arbitrary tidak diterima.

## Catatan format WhatsApp

Native Flow, WebView, carousel, CTA, dan Template Buttons dipengaruhi versi client/akun. Tes otomatis memverifikasi struktur dan fallback; bukan jaminan render live. Uji tiap tipe pada perangkat WhatsApp yang benar-benar dipakai. Product Message hanya dapat ditambahkan bila akun Business dan metadata produk/katalog riil sudah tersedia.

## Privasi dan rollback

File gambar/video outgoing dari plugin harus berupa Buffer atau path lokal; URL remote ditolak oleh router. Media masuk diunduh dengan batas byte. Folder temporary Video HD dibuat private lalu dibersihkan. Rollback: hentikan v0.10.16 dan jalankan source v0.10.15 dari direktori lama; tidak ada migrasi database wajib.
