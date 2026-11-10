# WHISKAY v0.10.33 — Single-Message Command Menu

## Perubahan

### `.menu` menjadi satu pesan

- Katalog command lengkap sekarang disisipkan langsung ke `interactiveMessage.body.text`.
- Native Flow tetap memiliki tiga tindakan: quick reply Profile, CTA URL Saluran WHISKAY, dan single-select rekomendasi.
- Menghapus loop yang sebelumnya mengirim katalog dalam beberapa pesan teks.
- Tidak ada pesan katalog susulan.
- Batas body Native Flow WHISKAY dinaikkan dari 3.000 menjadi 12.000 karakter.

### Unknown command tidak lagi membalas

- `.westmanga`, `.wmhomd`, `.wmhome`, dan command prefix lain yang tidak terdaftar diabaikan tanpa pesan balasan.
- Event dicatat pada logger level debug.
- Command valid dan alias terdaftar tetap melewati plugin dispatcher seperti sebelumnya.
- Penolakan authorization dan error plugin tidak disamakan dengan unknown command; aturan security dan error handling tetap berlaku.

## File

- `src/commands.mjs`
- `src/lib/native-flow.mjs`
- `test/commands.test.mjs`
- `README.md`
- `docs/PROJECT-STRUCTURE.md`
- `docs/research/COMMAND-MENU-RESEARCH-v0.10.33.md`
- `docs/upgrades/UPGRADE-v0.10.33.md`
- `docs/qa/QA-REPORT-v0.10.33.md`

## Compatibility

- Node.js tetap `>=22.5.0 <23`.
- Baileys tetap `7.0.0-rc14`.
- Tidak ada perubahan dependency, konfigurasi privat, database, atau session format.

## Known limitation

Batas 12.000 karakter adalah validasi WHISKAY. Tidak ada jaminan semua versi WhatsApp menampilkan body Native Flow panjang secara identik. Perlu verifikasi live pada Android/iOS/Web.
