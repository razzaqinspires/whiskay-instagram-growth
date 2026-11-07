# Keamanan WHISKAY v0.10.12

## Identitas dan akses

- WhatsApp berjalan dalam mode self; hanya owner terautentikasi yang boleh mengubah mode atau menjalankan command privat.
- `allowGroups` hanya berlaku pada mode self dan tetap memeriksa identitas owner.
- Instagram hanya memiliki satu session aktif per instance. Username campaign berasal dari session, bukan input command.
- Session WhatsApp dan Instagram disimpan pada direktori terpisah.

## Instagram

Adapter Instagram digunakan untuk login eksplisit dan pembacaan profil/statistik yang tersedia. Tidak ada auto-follow, auto-unfollow, mass DM, fake engagement, pembelian follower, atau challenge bypass. Metrik konten yang tidak tersedia melalui adapter dimasukkan owner dari Insights.

## Data dan credential

- `.env`, `config/app.json`, `session/`, `auth_ig/`, dan `data/` adalah state privat.
- `IG_PASSWORD` hanya untuk login pertama; hapus setelah session berhasil dibuat.
- Referral token dan HMAC secret hanya digunakan oleh modul referral opsional.
- Tidak ada wallet, balance, credit, ledger, budget, payment gateway, atau promotion-provider credential di runtime aktif.
- Growth store memakai allowlist field dan mengabaikan properti finansial legacy ketika membaca database lama; penulisan berikutnya menyimpan schema organik.

## HTTP QA adapter

`src/adapters/ConcreteHttpAdapter.js` hanya mengirim ke route loopback QA tetap. Adapter ini bukan konektor Instagram dan tidak boleh diperluas menjadi pengirim batch ke host bebas.

## Operasional

Jalankan `npm run security:permissions` setelah memulihkan file privat. Jangan memasukkan file session, database, log, backup, atau arsip ke source release. Lihat [panduan upgrade v0.10.12](upgrades/UPGRADE-v0.10.12.md).
