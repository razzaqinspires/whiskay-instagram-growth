# Upgrade WHISKAY v0.10.31

## Sebelum upgrade

1. Hentikan instance WHISKAY secara graceful.
2. Backup direktori privat `session/`, `auth_ig/`, `data/`, `config/app.json`, dan `.env` di luar direktori source.
3. Jangan menyalin `node_modules` dari versi lama.
4. Pastikan hanya satu proses memakai session WhatsApp yang sama.

## Instalasi

```bash
unzip whiskay-instagram-growth-v0.10.31.zip
cd whiskay-instagram-growth-v0.10.31
cp .env.example .env
cp config/app.example.json config/app.json
nvim .env
nvim config/app.json
npm install
npm run validate
npm run check
npm run docs:check
npm test
npm run security:permissions
```

Jika memindahkan instalasi lama, salin hanya konfigurasi dan state privat yang diperlukan setelah meninjau perubahan format. Jangan menimpa `config/app.json` yang sudah ada dengan example; merge perubahan secara manual menggunakan Neovim.

## Dampak perubahan

- Delivery tracker hanya menyimpan metadata in-memory, maksimum 2.000 pesan/24 jam. Restart mengosongkan cache.
- `relayOutcome=UNCONFIRMED` menunjukkan hasil relay ambigu. Status delivery yang sudah terkonfirmasi tidak diturunkan oleh late timeout.
- Source Growth order/provider/queue sudah dihapus karena bukan fitur aktif. File database lama seperti `data/growth-queue.sqlite` tidak dihapus otomatis dan tidak digunakan oleh versi ini.
- Baileys tetap `7.0.0-rc14`; patch kompatibilitas View Once dan media stream tetap diterapkan oleh `postinstall`.

## Rollback

1. Stop WHISKAY.
2. Simpan log versi baru untuk diagnosis.
3. Kembalikan source ZIP versi sebelumnya ke direktori terpisah.
4. Pulihkan `.env`, `config/app.json`, `session/`, `auth_ig/`, dan `data/` dari backup jika diperlukan.
5. Jalankan satu instance saja. Jangan menjalankan source v0.10.30 dan v0.10.31 bersamaan menggunakan session yang sama.

Tidak ada migrasi database wajib pada v0.10.31.
