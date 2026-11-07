# WHISKAY v0.10.12 — Organic-Only / Single-Session Cleanup

Tanggal: 7 November 2026

## Ringkasan

Rilis ini mengunci arah proyek sebagai runtime eksperimental private/self dengan satu session Instagram aktif dan campaign organik. Seluruh konsep saldo, balance, wallet, credit, ledger, budget, payment gateway, provider delivery, dan order berbayar dikeluarkan dari konfigurasi serta permukaan command aktif.

## Perubahan

- `package.json`: versi dinaikkan ke `0.10.12`.
- `src/growth/store.mjs`: schema allowlist v5 hanya menyimpan campaign dan content posts; field finansial legacy tidak dibawa ke model aktif.
- `src/plugins/instagram-growth.mjs`: command create hanya menerima nama campaign; identitas/URL berasal dari session Instagram aktif.
- `src/growth/session-target.mjs`: tetap menjadi validasi satu identitas aktif.
- `.env.example`: tidak lagi menampilkan credential provider promosi.
- `docs/CONFIGURATION.md`, `docs/SECURITY.md`, `docs/GROWTH-CAMPAIGNS.md`, `docs/SESSION-BOUND-CAMPAIGNS.md`, `docs/FOLLOWER-GROWTH-PLAYBOOK.md`, `docs/guides/MENU-EXAMPLE.md`: diperbarui agar tidak menjelaskan konsep finansial sebagai fitur aktif.
- `docs/RESEARCH-REGISTER.md` dan `docs/RESEARCH-SOURCE.md`: dihapus karena memuat rancangan SMM/payment yang tidak lagi menjadi arah proyek.
- `README.md`: menjadi indeks lengkap dokumen dan panduan versi aktif.

## Command campaign

```text
.igcampaign create Organic Follower Growth
```

Tidak ada parameter nominal, budget, URL target, atau username. Nama hanya label campaign.

## Keamanan dan migrasi

Tidak ada penghapusan database otomatis. Growth store membaca legacy record melalui allowlist dan menulis ulang schema organik saat operasi persistensi berikutnya. Buat backup privat sebelum upgrade. Satu instance tetap memakai satu session Instagram.
