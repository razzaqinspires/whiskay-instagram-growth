# Upgrade WHISKAY v0.10.12

## Sebelum upgrade

1. Hentikan WHISKAY dengan `Ctrl+C` dan pastikan proses Node berhenti.
2. Simpan backup privat `.env`, `config/app.json`, `session/`, `auth_ig/`, dan `data/` di luar direktori proyek. Jangan memasukkan backup ke source ZIP.
3. Pastikan hanya ada satu session Instagram aktif dan `instagram.username` sesuai dengan akun di session file.

## Terapkan source

Ekstrak `WHISKAY_v0.10.12_SOURCE.zip` ke direktori source baru. Jangan menimpa file runtime privat secara membabi buta. Salin kembali hanya `.env`, `config/app.json`, `session/`, `auth_ig/`, dan `data/` yang memang diperlukan.

Jika ini instalasi baru:

```bash
cp .env.example .env
cp config/app.example.json config/app.json
nvim config/app.json
nvim .env
npm install
```

## Perubahan command

Sebelumnya beberapa dokumen lama mencantumkan budget sebagai argumen campaign. Sekarang command yang didukung hanya:

```text
.igcampaign create <nama campaign>
```

Contoh:

```text
.igcampaign create Organic Follower Growth
```

Jangan menambahkan `|0`, nominal, username, atau URL profil. Identitas diambil dari session aktif.

## Migrasi data growth

`data/instagram-growth.json` lama dapat memuat field `balance`, `credits`, `ledger`, `orders`, `idempotency`, atau `budget`. Store v5 hanya memuat campaign dan content post melalui allowlist. Field finansial tidak masuk model aktif dan tidak ditulis kembali pada operasi persistensi berikutnya. File database tidak otomatis dihapus. Simpan backup privat di luar source tree sebelum start.

Campaign yang terikat pada akun berbeda/identitas legacy tidak dapat diakses dari session aktif. Jangan mengedit session file atau database saat bot berjalan.

## Verifikasi

```bash
npm install
npm run validate
npm run check
npm run docs:check
npm test
npm run security:permissions
npm run doctor
npm run instagram:doctor
```

Setelah semua pemeriksaan sesuai, jalankan `npm start`. Uji `.igprofile`, kemudian `.igcampaign create Organic Follower Growth`.

## Rollback

Hentikan proses, pulihkan source versi sebelumnya dan backup privat yang dibuat sebelum upgrade. Jangan mencampur database yang sudah ditulis schema v5 dengan source lama tanpa memeriksa kompatibilitasnya. Jika perlu kembali ke data lama, pulihkan salinan database backup utuh.
