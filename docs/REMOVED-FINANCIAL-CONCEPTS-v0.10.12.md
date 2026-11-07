# Penghapusan Subsystem Finansial — v0.10.12

## Keputusan produk

WHISKAY adalah eksperimen private/self untuk pertumbuhan Instagram organik. Subsystem finansial tidak termasuk ruang lingkup produk. Mulai v0.10.12 tidak ada fitur aktif untuk saldo/balance, wallet, credit, ledger, budget, payment gateway, top-up, order berbayar, atau provider pengiriman engagement.

## Dampak runtime

- Tidak ada command `.igbalance`, `.igcredit`, `.igledger`, `.igorder`, `.igorders`, `.igorderstatus`, `.igorderupdate`, `.igprovider`, atau `.igqueue`.
- Tidak ada `PROMOTION_PROVIDER_API_KEY` dalam `.env.example`.
- Growth config hanya membutuhkan lokasi database organik.
- `src/growth/store.mjs` memakai allowlist schema v5: `campaigns` dan `contentPosts` beserta field yang disetujui.
- `balance`, `credits`, `ledger`, `orders`, `idempotency`, dan `budget` legacy tidak disalin ke object aktif. Penulisan berikutnya menyimpan format organik saja.
- Tidak ada payment request atau provider request yang dijalankan oleh campaign.

## Data lama dan kompatibilitas

Data lama tidak dihapus secara agresif ketika dibaca. Store menormalisasi object lama ke allowlist yang didukung; setelah operasi tulis sukses, hanya field schema organik yang dipersistenkan. File database tidak dihapus saat migrasi. Buat salinan privat di luar source tree sebelum upgrade. Jangan mengedit database ketika bot berjalan.

Campaign lama yang tidak memiliki `accountUsername` valid tidak akan dianggap milik session aktif. Buat campaign baru setelah `.igprofile` memastikan identitas session yang benar. Konten legacy yang tidak dapat dikaitkan dengan identitas akan tetap tidak dapat ditampilkan dalam filter akun aktif sampai diperbaiki secara manual melalui prosedur yang didukung.

## File yang berubah

| Lokasi | Perubahan | Manfaat |
|---|---|---|
| `src/growth/store.mjs` | Allowlist schema v5 tanpa properti finansial | Mencegah field lama masuk model runtime |
| `src/plugins/instagram-growth.mjs` | Hanya command campaign, funnel, dan content organik | Menghilangkan permukaan command finansial |
| `src/config.mjs` | Growth config hanya database path | Tidak ada konfigurasi saldo/provider |
| `.env.example` | Menghapus credential provider promosi | Template secret lebih kecil dan relevan |
| `config/app.example.json` | Growth hanya `databaseFile` | Tidak ada setting billing |
| `README.md`, `docs/CONFIGURATION.md`, `docs/SECURITY.md` | Kontrak produk dan setup diperbarui | Tidak membingungkan operator |

## Catatan sejarah

Release notes dan changelog versi lama tetap disimpan sebagai arsip sejarah pengembangan. Referensi historis terhadap order, saldo, provider, atau budget tidak berarti fitur tersebut tersedia pada v0.10.12. Dokumen riset SMM/payment yang tidak lagi relevan dihapus dari `docs/`.
