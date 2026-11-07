# Organic Follower Growth Playbook — WHISKAY v0.10.12

WHISKAY membantu owner merencanakan, mencatat, dan menganalisis pertumbuhan organik untuk satu akun Instagram yang sedang login. Sistem tidak menjual layanan, mengelola saldo, membuat pembayaran, atau mengeksekusi follow otomatis.

## Mulai

1. Pastikan `.igcheck` menunjukkan session tersedia.
2. Jalankan `.igprofile` untuk memeriksa username yang terhubung.
3. Jalankan `.igsync` untuk menyimpan baseline statistik.
4. Buat campaign: `.igcampaign create Organic Follower Growth`.
5. Catat performa konten dengan `.igcontent add` dan Insights yang benar.
6. Gunakan `.igcampaign progress <ID>`, `.igfunnel <ID>`, dan `.igcontent compare` untuk analisis.

## Command campaign

- `.igcampaign create <nama>` — nama adalah label internal; identitas dan URL target otomatis dari session aktif.
- `.igcampaign list` — campaign untuk username session aktif.
- `.igcampaign goal <ID> <target> <YYYY-MM-DD>` — target pengukuran, bukan jaminan.
- `.igcampaign checkpoint <ID>` — snapshot profil read-only.
- `.igcampaign insights <ID> <reach> <impressions> <profile_visits> <follows>` — input metrik Insights.
- `.igfunnel <ID>` — analisis konversi.

Tidak ada parameter budget, nominal, username, atau URL profil. Tidak ada command balance, wallet, credit, ledger, order, provider, atau payment.

## Strategi

Prioritaskan konsistensi topik, hook yang jelas, retensi video, caption yang menjelaskan nilai konten, CTA yang relevan, optimasi bio/pinned posts, kolaborasi sukarela, dan distribusi komunitas yang sesuai aturan. Evaluasi satu variabel pada satu waktu dan bandingkan rentang tanggal setara.

## Batas interpretasi

Follows per reach dan profile visit-to-follow adalah rasio observasi, bukan bukti sebab-akibat. Data harus berasal dari Insights akun yang benar. Jangan menjumlahkan periode yang tumpang tindih. Target follower bukan jaminan hasil.
