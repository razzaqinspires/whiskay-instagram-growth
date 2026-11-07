# WHISKAY Command Menu — v0.10.16

Menu aktual dibentuk dari metadata plugin aktif. Prefix di bawah contoh; runtime memakai prefix dari `config/app.json`.

```text
╭━━ WHISKAY COMMAND MENU ━━╮
Prefix aktif: ! . # /
Format: prefix + command + (args ? " " + args : "")
╰━━━━━━━━━━━━━━━━━━━━━━━━╯

「 Core & Diagnostics 」
.antispam — Status proteksi anti-spam
.jidstats — Statistik cache mapping LID ↔ PN
.ping — Tes respons bot
.plugins — Daftar plugin dan command aktif
.whoami — Lihat JID mentah dan alternate addressing

「 Media Processing 」
.remini — Upscale video lokal dengan FFmpeg/FFprobe
.remini status — Cek ketersediaan engine
.remini info — Detail proses, batas dan privasi

「 Media Tools 」
.mediainfo — Lihat informasi media (langsung/kutipan)

「 WhatsApp Interfaces 」
.poll <...> — Buat WhatsApp poll native
.waform <type> — Uji quick reply, list, CTA, template, card, carousel, catalog
.wacapabilities — Peta kemampuan Baileys dan rekomendasi format

「 Referral & Conversion 」
.referralprocess [jumlah 1-25] — Proses referral claim terverifikasi
.referralstatus — Lihat antrean referral signup terverifikasi

「 Content Intelligence 」
.igcontent <add|list|report|compare> ... — Analisis performa konten dan konversi follower

「 Follower Growth 」
.igfunnel <campaign-id> — Analisis funnel reach → profile visits → follows

「 Growth Campaigns 」
.igcampaign <create|list|progress|goal|checkpoint|insights|pause|resume|complete|cancel> ... — Kelola campaign organik

「 Growth Dashboard 」
.igpanel — Dashboard Instagram Growth Panel

「 Instagram Account 」
.igcheck — Periksa Python adapter, versi instagrapi, dan session
.iglogin — Login pertama secara eksplisit
.igprofile — Baca profil dari session Instagram (read-only)
.igsetstats <followers> <following> <posts> — Simpan statistik manual
.igsync — Sinkronkan statistik profil dari session read-only

「 Instagram Analytics 」
.iggrowth [7|30|90] — Laporan pertumbuhan followers
.ighistory [jumlah] — Lihat histori snapshot Instagram
.igstats — Statistik dan pertumbuhan follower

「 Organic Growth 」
.igservice <strategy-id> — Detail strategi pertumbuhan organik
.igservices — Daftar strategi pertumbuhan organik

━━━━━━━━━━━━━━━━━━━━━━━━

「 Academi.cx Document Review 」
.acad ai CONFIRM <teks|file> — Indikator AI-writing
.acad similarity CONFIRM <teks|file> — Pemeriksaan similarity
.acad full CONFIRM <teks|file> — Kedua pemeriksaan
.acad status <check_id> — Status pemeriksaan
.acad report <check_id> [similarity|pdf|original] — Kirim report
.acad list [1-100] [starting_after_id] — Riwayat pemeriksaan
.acad delete <check_id> CONFIRM — Hapus check secara permanen
.acad info — Status konfigurasi dan batas integrasi
.acad help — Bantuan Academi.cx
.acx / .academix — Alias alternatif untuk plugin Academi.cx

━━━━━━━━━━━━━━━━━━━━━━━━

Gunakan .plugins untuk melihat plugin aktif.

Contoh perintah tambahan: `.waform catalog`, `.waform poll`, `.poll multi "Fitur?" | Video | Audio | Dokumen`, `.mediainfo`.
```

## Aturan pengelompokan

- Core, media, WhatsApp, dan referral tetap berada di bagian umum.
- Semua kategori dan command Instagram/Growth ditampilkan bersama sebelum separator.
- Baris `━━━━━━━━━━━━━━━━━━━━━━━━` memisahkan bagian Instagram dari plugin eksternal non-Instagram.
- Academi.cx berada setelah separator dan tidak menggunakan session Instagram.
- Menu runtime dapat sedikit berbeda jika plugin opsional tidak aktif atau tidak tersedia.
- Tidak ada command `.igbalance`, `.igcredit`, `.igledger`, `.igorder`, `.igorders`, `.igprovider balance`, `.acad balance`, wallet, atau payment dalam rilis ini.
