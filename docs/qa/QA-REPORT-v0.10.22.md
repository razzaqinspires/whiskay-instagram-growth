# QA Report — WHISKAY v0.10.22

**Tanggal:** 8 November 2026  
**Base:** v0.10.21  
**Runtime pemeriksaan:** Node.js 22.16.0 · npm 10.9.2

## Otomatis

- `node --check` pada seluruh file JS/MJS: pass.
- `npm run version:check`: pass, versi `0.10.22`.
- `npm run validate`: pass dengan fixture konfigurasi sementara; `.env` dan `config/app.json` fixture dihapus setelah pemeriksaan.
- `npm run check`: pass.
- `npm run docs:check`: pass; seluruh dokumen dan tautan lokal valid.
- `npm test`: 211 passed, 0 failed, 0 skipped.
- `npm run security:permissions`: pass.
- ZIP integrity check: pass.
- Source ZIP diekstrak ke direktori baru; `npm run check`, `npm run docs:check`, dan `npm test` lulus kembali.
- PTV/GIF/View Once video demo: FFprobe mendeteksi H.264 video stream.
- Voice demo: FFprobe mendeteksi Opus, mono, 48 kHz.
- View Once image demo: terdeteksi sebagai JPEG 720×900.
- Smoke test command `.waform media` tanpa filename untuk kelima jenis: lulus pada fake send transport; file default ter-resolve dan flag PTV/PTT/View Once sesuai.

## Coverage tambahan

- Hydrated Template Buttons menggunakan raw proto relay dan tidak memanggil `sock.sendMessage()`.
- Carousel membawa `biz`/`bot` additional nodes dan quality control node pada private chat; grup tidak menerima bot node.
- AIRich HTML memvalidasi trusted domain dan membangun nested `embedded_screens`/tab sections.
- View Once transport membangun WAMessage, mempertahankan quoted WAMessage, dan mengirim `additionalNodes` meta `view_once=true`.
- Patch Baileys rc14 diuji untuk normalisasi mediatype, idempotensi, dan penolakan target source yang ambigu.
- YouTube Music parser memvalidasi video ID, deduplikasi, filter, endpoint, dan allowlist URL download.
- `.ytmusic` help menu diuji untuk ID action yang valid.

## Belum dapat diverifikasi otomatis

- Rendering Native Flow/Template/Carousel/AIRich HTML pada WhatsApp Android/iOS dan Web.
- Penerimaan View Once, PTV, voice note, dan GIF pada server/client WhatsApp aktual.
- Penerimaan ProductMessage oleh katalog akun Business pengguna.
- `getCatalog()` live pada session pengguna.
- Search InnerTube live dan download `yt-dlp` live pada device pengguna.

ACK dari `relayMessage()` tidak dianggap bukti delivery atau rendering. Patch dependency hanya diuji melalui fixture unit test; pemasangan aktual patch dijalankan oleh `postinstall` ketika pengguna menjalankan `npm install`.
