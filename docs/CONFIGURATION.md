# Konfigurasi WHISKAY v0.10.25

WHISKAY berjalan sebagai eksperimen private/self. Konfigurasi Instagram hanya mendukung **satu session aktif dan satu username** pada satu instance. Tidak ada konfigurasi wallet, saldo, kredit, budget, payment gateway, provider promosi, order finansial, atau Growth queue. Konfigurasi Growth aktif hanya `growth.databaseFile`.

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

## Owner Code Runtime

Bagian `ownerCode` di `config/app.json` mengatur runtime khusus owner yang bukan command/plugin. Konfigurasi contoh:

```json
"ownerCode": {
  "enabled": true,
  "timeoutMs": 15000,
  "maxCodeChars": 8000,
  "maxOutputBytes": 16000,
  "workDir": "./data/owner-runtime",
  "pythonBin": "python3",
  "goBin": "go",
  "shellBin": "/bin/bash"
}
```

Timeout valid 1.000–60.000 ms, kode 100–20.000 karakter, output 1.024–65.536 byte. `workDir` harus berada pada direktori data privat dan tidak boleh menunjuk root proyek/filesystem. Runtime Go memakai `GOPROXY=off`/`GOSUMDB=off`, sehingga tidak mengunduh module otomatis.

## Environment secrets

| Variabel | Kegunaan |
|---|---|
| `IG_PASSWORD` | Hanya login Instagram pertama; hapus setelah session dibuat |
| `REFERRAL_SERVICE_TOKEN` | Token backend referral terverifikasi jika modul referral dipakai |
| `REFERRAL_WEBHOOK_SECRET` | HMAC secret webhook referral jika listener diaktifkan |
| `NODE_ENV` | Menentukan mode runtime dan local QA |
| `MAX_BATCH_SIZE` | Hanya batas batch receiver QA loopback saat development |
| `TIKTOK_SCRAPER_API_URLS` | Maksimal tiga endpoint HTTPS scraper TikTok kustom, urut primary lalu backup; TikWM tetap fallback terakhir |
| `TIKTOK_SCRAPER_API_TOKEN` | Bearer token opsional yang hanya dikirim ke endpoint scraper kustom; tidak pernah dikirim ke CDN media |
| `TIKTOK_MEDIA_HOST_ALLOWLIST` | Host CDN HTTPS publik tambahan yang disetujui operator, dipisahkan koma |
| `IRFAN_SCRAPE_ENABLED` | Harus `true` untuk mengaktifkan AI scrape gateway; default `false` |
| `IRFAN_SCRAPE_API_URL` | Satu endpoint gateway HTTPS yang diaudit operator |
| `IRFAN_SCRAPE_API_TOKEN` | Bearer token minimal 16 karakter; hanya dikirim ke endpoint gateway |
| `IRFAN_SCRAPE_ALLOWED_HOSTS` | Allowlist hostname exact; harus mencakup hostname endpoint, tanpa wildcard |
| `IRFAN_SCRAPE_TIMEOUT_MS` | Batas request 1.000–90.000 ms; default 30.000 |
| `IRFAN_SCRAPE_MODEL` | Alias model yang dipahami gateway; default `default`, bukan klaim model resmi |
| `IRFAN_SCRAPE_THINKING` | `low`, `medium`, atau `max`; interpretasi ditentukan gateway |
| `IRFAN_SCRAPE_USE_FAST` | `true`/`false`; opsi non-secret yang diteruskan ke gateway |

Tidak ada `PROMOTION_PROVIDER_API_KEY` dan tidak ada secret pembayaran. AI Scrape Gateway hanya aktif setelah endpoint dan token dikonfigurasi secara eksplisit; jangan menyalin domain routing/voucher dari snippet yang belum diaudit. Jangan menambahkan credential layanan follower/engagement.

## Penyimpanan

`session/` menyimpan session Baileys; `auth_ig/` menyimpan satu session Instagram; `data/instagram-growth.json` menyimpan campaign organik dan histori konten; `data/` juga dapat menyimpan runtime state privat. Direktori tersebut tidak disertakan dalam source ZIP. File `data/growth-queue.sqlite` dari versi lama bukan bagian runtime aktif dan tidak dihapus otomatis.
