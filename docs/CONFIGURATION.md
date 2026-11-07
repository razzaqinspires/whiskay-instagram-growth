# Konfigurasi WHISKAY v0.10.12

WHISKAY berjalan sebagai eksperimen private/self. Konfigurasi Instagram hanya mendukung **satu session aktif dan satu username** pada satu instance. Tidak ada konfigurasi wallet, saldo, kredit, budget, payment gateway, provider promosi, atau order finansial.

## File konfigurasi

- `config/app.example.json`: template non-secret yang ikut source.
- `config/app.json`: konfigurasi lokal operator; jangan dibagikan.
- `.env.example`: nama secret dan contoh kosong.
- `.env`: secret lokal; permission `0600`, tidak masuk ZIP.

## Instagram single-session

| Key | Fungsi |
|---|---|
| `instagram.username` | Username akun yang benar-benar terkait dengan session, tanpa `@` |
| `instagram.sessionFile` | Satu file session instagrapi, default `./auth_ig/instagrapi-session.json` |
| `instagram.statsFile` | Snapshot statistik lokal |
| `instagram.guardFile` | Status safety/cooldown Instagram |
| `instagram.pythonBin` | Python virtualenv adapter |

`instagram.username` harus cocok dengan identitas yang dibaca dari session. Campaign tidak menerima username atau URL profil manual. Untuk berganti akun, hentikan bot, amankan session lama di luar source tree, lakukan login eksplisit akun baru, lalu perbarui username dan session path. Jangan menjalankan dua akun pada satu instance.

## WhatsApp self mode

`whatsapp.pairingNumber` dan `whatsapp.ownerNumber` harus sama dalam format digit internasional tanpa `+`. `commands.mode` mendukung `self` atau `public`; `commands.allowGroups` hanya memberi owner akses grup ketika mode `self`.

## Environment secrets

| Variabel | Kegunaan |
|---|---|
| `IG_PASSWORD` | Hanya login Instagram pertama; hapus setelah session dibuat |
| `REFERRAL_SERVICE_TOKEN` | Token backend referral terverifikasi jika modul referral dipakai |
| `REFERRAL_WEBHOOK_SECRET` | HMAC secret webhook referral jika listener diaktifkan |
| `NODE_ENV` | Menentukan mode runtime dan local QA |
| `MAX_BATCH_SIZE` | Hanya batas batch receiver QA loopback saat development |

Tidak ada `PROMOTION_PROVIDER_API_KEY` dan tidak ada secret pembayaran. Jangan menambahkan credential layanan follower/engagement.

## Penyimpanan

`session/` menyimpan session Baileys; `auth_ig/` menyimpan satu session Instagram; `data/instagram-growth.json` menyimpan campaign organik dan histori konten; `data/` juga dapat menyimpan runtime state privat. Direktori tersebut tidak disertakan dalam source ZIP.
