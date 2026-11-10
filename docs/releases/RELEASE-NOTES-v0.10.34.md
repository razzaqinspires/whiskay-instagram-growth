# WHISKAY v0.10.34 — Single-Message Menu Dispatch

## Perubahan

- Memastikan branch `.menu` hanya menjalankan satu outbound `sendInteractive`.
- Seluruh command aktif, kategori, alias, usage, dan deskripsi disatukan di `interactiveMessage.body.text` (teks/caption utama pada pesan bertombol).
- Tiga tombol Mixed Native Flow tetap dipertahankan.
- Tidak ada pesan susulan katalog, chunking, atau `reply()` dari branch `.menu`.
- Menambahkan log diagnostik lokal `[MENU] v0.10.34 single-message dispatch` berisi jumlah command, panjang body, dan transport. Log tidak dikirim ke WhatsApp.
- Memperkuat regression test untuk memastikan katalog lengkap berada di body dan tidak ada marker katalog 1/2 atau 2/2.

## File

- `src/commands.mjs`
- `test/commands.test.mjs`
- `README.md`
- `docs/research/COMMAND-MENU-RESEARCH-v0.10.34.md`
- `docs/releases/RELEASE-NOTES-v0.10.34.md`
- `docs/upgrades/UPGRADE-v0.10.34.md`
- `docs/qa/QA-REPORT-v0.10.34.md`

## Compatibility

Tidak ada perubahan dependency, database, konfigurasi, session, atau syntax command. Node.js dan Baileys tetap mengikuti versi pada package sebelumnya.

## Batasan

Body katalog panjang pada Native Flow Baileys harus diuji pada client WhatsApp aktual. Batas 1.024 karakter yang didokumentasikan untuk Cloud API tidak otomatis menjadi batas protokol Baileys, dan tidak menjamin rendering panjang di seluruh versi WhatsApp Web/mobile.
