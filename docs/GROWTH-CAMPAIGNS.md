# Organic Growth Campaigns — WHISKAY v0.10.12

Campaign adalah catatan strategi dan pengukuran organik untuk **satu akun Instagram yang sedang terhubung**. Tidak ada saldo, wallet, kredit, budget, order berbayar, payment gateway, provider delivery, atau transaksi finansial di runtime ini. Campaign tidak memicu follow/unfollow otomatis.

## Command

- `.igcampaign create <nama campaign>` — membuat campaign tanpa parameter tambahan. Nama adalah label internal, bukan username atau URL. Identitas dan URL profil diambil dari satu session Instagram aktif.
- `.igcampaign list` — menampilkan campaign untuk akun session aktif.
- `.igcampaign progress <ID>` — baseline, checkpoint, perubahan follower, Insights, funnel, dan goal.
- `.igcampaign goal <ID> <target_followers> <YYYY-MM-DD>` — menetapkan target pengukuran.
- `.igcampaign checkpoint <ID>` — membaca profil melalui adapter read-only dan menyimpan checkpoint.
- `.igcampaign insights <ID> <reach> <impressions> <profile_visits> <follows>` — menyimpan metrik Insights yang dimasukkan owner.
- `.igcampaign pause <ID>`, `.igcampaign resume <ID>`, `.igcampaign complete <ID>`, `.igcampaign cancel <ID>` — mengubah status campaign.
- `.igfunnel <ID>` — rasio reach → profile visit → follow dan rekomendasi diagnostik.

Contoh: `.igcampaign create Organic Follower Growth November`. Jangan menambahkan `|0`, angka nominal, URL profil, atau username.

## Identitas satu session

Pembuatan campaign memanggil `getConnectedInstagramProfile()` dan `buildSessionCampaignTarget()`. Identitas harus cocok dengan `instagram.username` dan session file yang dikonfigurasi. Campaign yang terikat pada username berbeda ditolak. Untuk berpindah akun, operator harus mengganti session secara sengaja melalui prosedur logout/login yang aman; multi-account/session pool tidak didukung.

## Pengukuran

- Baseline diambil dari snapshot lokal jika tersedia; jika tidak, jalankan `.igsync` dan simpan checkpoint pertama.
- Reach, impressions, profile visits, dan follows berasal dari Instagram Insights yang dimasukkan owner.
- Delta follower adalah perubahan selama periode pengamatan, bukan atribusi kausal ke satu konten.
- Riwayat Insights dibatasi 90 snapshot per campaign.
- Denominator nol menghasilkan `n/a`; tidak ada target yang dijamin.

## Penyimpanan dan migrasi

Database `data/instagram-growth.json` memakai envelope v5 dengan allowlist field. Saat dibaca, field finansial legacy (`balance`, `credits`, `ledger`, `orders`, `idempotency`, dan `budget` pada campaign) tidak dimuat ke model aktif; penulisan berikutnya menyimpan hanya campaign dan content posts yang diizinkan. Simpan backup privat di luar source tree sebelum upgrade. Lihat [penghapusan konsep finansial](REMOVED-FINANCIAL-CONCEPTS-v0.10.12.md) dan [panduan upgrade](upgrades/UPGRADE-v0.10.12.md).
