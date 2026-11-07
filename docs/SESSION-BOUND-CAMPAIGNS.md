# Session-Bound Instagram Campaign Identity

WHISKAY mendukung **tepat satu identitas Instagram aktif per instance**. Identitas campaign tidak boleh ditentukan lewat username/URL yang diketik pada command.

## Command

`.igcampaign create <nama campaign>`

Contoh: `.igcampaign create Organic Follower Growth`. Nama setelah `create` adalah label internal campaign. Username dan URL profil otomatis diambil dari session aktif. Tidak ada parameter budget, saldo, nominal, username, atau target URL.

## Alur identitas

1. Plugin memanggil `getConnectedInstagramProfile()` dari `src/instagram.mjs`.
2. Adapter memeriksa session file privat yang ditetapkan oleh `instagram.sessionFile`.
3. Profil hasil session dinormalisasi dan dicocokkan dengan `instagram.username`.
4. `src/growth/session-target.mjs` membentuk target profil HTTPS dari username session.
5. Store mengikat campaign ke `accountUsername`; command list/progress menolak campaign yang bukan milik identitas aktif.

Jika session tidak ada, tidak dapat dibaca, permission tidak aman, atau username tidak cocok, campaign tidak dibuat. Tidak ada fallback ke argumen command, cache dari akun lain, atau URL manual.

## Batas satu akun

Satu instance = satu `instagram.sessionFile` = satu `instagram.username`. Multi-account manager, session pool, dan pengelolaan akun lain tidak tersedia. Mengganti akun memerlukan pergantian session secara eksplisit dan verifikasi ulang identitas. Session WhatsApp Baileys tetap terpisah di `session/`.

## File utama

- `src/instagram.mjs`: membaca identitas dari session aktif.
- `src/growth/session-target.mjs`: memvalidasi identitas dan membuat URL profil.
- `src/plugins/instagram-growth.mjs`: command campaign mengambil identitas dari session.
- `src/growth/store.mjs`: menyimpan `accountUsername` dan menolak field legacy yang tidak diizinkan.
- `test/session-target.test.mjs`, `test/growth-campaigns.test.mjs`: tes identitas dan isolasi campaign.

Lihat [konfigurasi](CONFIGURATION.md) dan [upgrade v0.10.12](upgrades/UPGRADE-v0.10.12.md).
