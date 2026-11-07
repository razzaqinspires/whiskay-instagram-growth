# WHISKAY v0.10.10

## Session-Bound Campaign Identity
- `.igcampaign create <nama>` sekarang mengambil profil dari session Instagram aktif.
- Budget opsional dapat diberikan sebagai argumen kedua setelah pemisah `|`; default 0.
- Username/URL manual ditolak agar campaign tidak dapat salah dikaitkan ke akun lain.
- Identitas session diverifikasi melalui pemeriksaan session dan kecocokan `instagram.username`.
- Helper murni `src/growth/session-target.mjs` ditambahkan beserta unit test.

## Compatibility
- Campaign lama tidak diubah.
- Tidak ada migrasi database.
- Perintah lama yang menyertakan target URL manual harus diganti.
- Session Instagram tetap terpisah dari session WhatsApp.

## QA
Lihat `docs/qa/QA-REPORT-v0.10.10.md` untuk hasil pemeriksaan aktual.
