# WHISKAY v0.10.5 — Documentation Governance & Runtime Cleanup

**Tanggal:** 6 November 2026  
**Basis:** v0.10.4 QA Source  
**Jenis rilis:** maintenance, documentation architecture, developer tooling, and dead-code cleanup.

## Ringkasan

v0.10.5 memusatkan semua dokumentasi Markdown di `docs/` (root hanya menyisakan `README.md`), menambahkan validasi dokumentasi dan pemeriksaan sintaks JavaScript yang mencakup `.mjs`, `.js`, dan `.cjs`, serta menghapus script/komponen legacy yang tidak lagi digunakan oleh runtime foreground + SQLite.

## Perubahan dan lokasi

| Lokasi | Perubahan | Manfaat |
|---|---|---|
| `package.json` | Versi menjadi `0.10.5`; menambah `docs:check` dan `test:adapter`; QA memasukkan pemeriksaan dokumentasi | Rilis dapat diverifikasi dengan satu alur konsisten |
| `scripts/check-source.mjs` | Pemeriksaan sintaks kini mencakup `.mjs`, `.js`, `.cjs`, termasuk adapter baru | Menghindari file adapter tidak tercakup QA |
| `scripts/check-docs.mjs` | Memastikan Markdown berada di `docs/`, setiap dokumen terindeks README, dan tautan lokal valid | Mengurangi dokumentasi yatim dan link rusak |
| `scripts/package-release.mjs` | Mengemas source + docs secara rekursif dan mengecualikan credential, state, backup, serta arsip | Source ZIP lebih bersih dan aman dibagikan |
| `scripts/stop.mjs` dan `scripts/upgrade-v*.sh` | Dihapus sebagai script PM2/updater historis yang tidak cocok dengan runtime saat ini | Menghindari jalur operasi usang |
| `ecosystem.config.cjs` | Dihapus; PM2 tidak didukung oleh launcher foreground | Menghilangkan konfigurasi deployment yang menyesatkan |
| `src/growth/redis-queue.mjs` | Dihapus karena tidak direferensikan dan antrean aktif menggunakan SQLite bawaan Node | Mengurangi dead code dan import dependency yang tidak terpasang |
| `.env.example` | Ditambahkan template variabel rahasia kosong | Instalasi baru memiliki template env yang nyata |
| `docs/CHANGE-POLICY.md` | Aturan dokumentasi wajib untuk setiap perubahan | Menjamin perubahan berikutnya terlacak secara rinci |

## Perubahan perilaku

- Tidak ada perubahan pada alur Instagram, login, referral, status order, atau approval provider.
- Adapter HTTP tetap hanya untuk receiver QA lokal pada loopback dan route tetap `/__whiskay_qa__/batch`; tidak menjadi endpoint Instagram atau pengiriman engagement.
- `MAX_BATCH_SIZE` tetap dibatasi 1–1.000 hanya ketika `NODE_ENV=development`; produksi tetap pada default 100.
- Approval owner aplikasi tetap wajib. Attestation `local-qa-runner` adalah bukti uji lokal, bukan persetujuan bisnis/produksi.
- `npm run package:release` sekarang membuat nama arsip berdasarkan versi (`whiskay-v0.10.5-source.zip`) secara default di luar root proyek.

## Batasan

Unit test dan pemeriksaan lokal tidak membuktikan rendering live WhatsApp, autentikasi Instagram, atau penerimaan endpoint backend. Pengujian Axios terhadap jaringan lokal harus dijalankan di lingkungan operator dengan dependency terpasang.
