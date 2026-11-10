# Peta Struktur Proyek WHISKAY v0.10.39

Dokumen ini menjelaskan source aktif pada v0.10.31. Catatan versi lama dipertahankan sebagai sejarah, bukan petunjuk runtime saat ini.

## Direktori aktif

| Path | Peran | Batasan |
|---|---|---|
| `index.mjs`, `scripts/start.mjs` | Foreground supervisor, process lock, shutdown, startup bot | Satu bot; tidak menjalankan worker Growth order/queue |
| `src/wa.mjs`, `src/commands.mjs` | Baileys lifecycle, ingress, owner authorization, anti-spam, parser, plugin dispatch | Semua command biasa melewati satu jalur akses |
| `src/lib/` | Plugin loader, Native Flow, serializer, media router, delivery tracker, menu, LID/session utilities | Delivery cache in-memory, bounded, tidak menyimpan isi pesan |
| `library/contributed/` | Source pemberian kontributor yang dipertahankan verbatim, dikelompokkan berdasarkan format/module scope; package boundary CJS lokal | Tidak dipindai PluginLoader dan tidak boleh diedit; seluruh konfigurasi/perilaku runtime harus melalui adapter terpisah |
| `src/library/adapters/` | Mesin kontrol, normalisasi konfigurasi, renderer facade, fallback, dan command adapter untuk library kontribusi | Adapter boleh berubah; source kontributor tidak |
| `library/assets/` | Asset runtime milik adapter (font, template, resource statis) | Tidak menyimpan kredensial atau session |
| `src/plugins/` | WhatsApp core tools, Message Lab, TikTok, Instagram, Academi.cx, referral, YouTube Music, AI scrape | Tidak ada order/wallet/provider engagement commands |
| `src/media/` | TikTok, YouTube Music, dan media normalization | Provider eksternal dibatasi allowlist, timeout, dan byte caps |
| `src/ai/` | Adapter AI scrape HTTPS yang dikonfigurasi owner | Nonaktif secara default |
| `src/growth/` | Campaign organik, session identity, funnel, content intelligence | Store campaign/content saja; tanpa order, wallet, provider, atau queue |
| `src/referral/` | Claim referral terverifikasi dan webhook HMAC opsional | Terpisah dari Growth campaign dan downloader |
| `src/security/` | Anti-spam, redaction, filesystem/permission guards | Guard tidak boleh dilemahkan untuk melewati validasi |
| `python/` | Bridge Instagram | Satu session aktif di `auth_ig/` |
| `scripts/` | Launcher, validator, doctor, permission audit, setup, migrasi config, packaging, Baileys compatibility patches | Semua script terdaftar di `docs/guides/SCRIPTS-REFERENCE.md` |
| `test/` | Node Test Runner | State privat diarahkan ke OS temp; tidak menghapus session live |
| `docs/` | Arsitektur, security, guide, research, release, upgrade, QA, dan arsip sejarah | README root mengindeks semua Markdown |

## Alur pesan WhatsApp

1. `src/wa.mjs` membuat socket Baileys, memasang LID manager dan `createMessageDeliveryTracker()`.
2. `messages.upsert` disaring oleh `classifyMessageUpsert()`. Hanya `notify` yang dapat masuk jalur command; `append`/history tidak pernah menjalankan ulang command.
3. `src/commands.mjs` mengurai text/interactive response, memeriksa otorisasi, anti-spam, lalu dispatch plugin.
4. `.waform` dan `src/lib/whatsapp-message-router.mjs` menggunakan serializer terpusat untuk text, media, ProductMessage, EventMessage, AIRich, Native Flow, dan carousel.
5. `src/lib/native-flow.mjs` menyiapkan protobuf message dan required binary nodes, lalu memanggil `relayMessage()`.
6. `message-delivery-tracker.mjs` mengamati hasil `sendMessage`/`relayMessage`, `messages.update`, dan `message-receipt.update`. Cache bersifat diagnostik, bukan persistent delivery guarantee.
7. Hasil relay yang ambigu tidak di-retry otomatis; keputusan resend memerlukan pemeriksaan status agar tidak menghasilkan pesan ganda.

## Owner Code Runtime

Owner Code Runtime berada terpisah dari plugin registry. Prefix `>`, `=>`, `$`, `>>`, dan `>>>` hanya diproses setelah verifikasi private self-chat, `fromMe`, dan kecocokan identitas sesi owner. Fitur ini bukan sandbox; proses berjalan dengan hak akses OS bot. Jalankan bot sebagai user OS non-root dengan izin filesystem minimal.

## Retired Growth order/queue source — cleanup v0.10.31

ZIP v0.10.30 kembali memuat beberapa file legacy meskipun catatan cleanup sebelumnya menyatakan modul tersebut sudah dipensiunkan. Audit v0.10.31 mengonfirmasi file-file itu tidak direferensikan oleh plugin/runtime aktif dan kontrak config/store organik tidak menyediakan API order/queue. Karena itu file berikut dihapus:

- `src/growth/order-engine.mjs`
- `src/growth/provider-adapter.mjs`
- `src/growth/redis-queue.mjs`
- `src/growth/sqlite-queue.mjs`
- `src/growth/worker.mjs`
- `scripts/worker.mjs` dan `scripts/queue-health.mjs`
- `test/order-engine.test.mjs`, `test/provider-adapter.test.mjs`, `test/sqlite-queue.test.mjs`

`src/growth/store.mjs`, catalog, campaign, content, funnel, dan content intelligence tetap dipertahankan. Database legacy seperti `data/growth-queue.sqlite` tidak dihapus otomatis; backup dan penghapusan manual hanya dilakukan operator setelah verifikasi kebutuhan historis.

## Entrypoint runtime

1. `npm start` menjalankan `scripts/start.mjs`.
2. Launcher memvalidasi config, permission, dan process lock; lalu menjalankan `index.mjs`.
3. `index.mjs` menyiapkan WhatsApp/referral sesuai konfigurasi.
4. `src/wa.mjs` mengelola Baileys lifecycle dan ingress.
5. `src/commands.mjs` menjalankan authorization, runtime mode, anti-spam, parser, dan plugin dispatch.
6. Adapter Instagram tetap terpisah dari WhatsApp session.
