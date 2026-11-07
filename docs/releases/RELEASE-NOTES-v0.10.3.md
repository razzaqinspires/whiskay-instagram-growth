# WHISKAY v0.10.3 — Native Flow Compatibility Fix

Tanggal: 6 November 2026

## Perubahan
- Sinkronisasi atribut dan child node envelope `biz` dengan serializer kompatibilitas sumber.
- Tambah `quality_control` / `decision_source` metadata node.
- `.igpanel` disederhanakan menjadi tiga quick reply utama.
- `.igservices` sekarang memakai `single_select`, bukan carousel.
- Perintah baru `.igservice <service-id>` untuk membuka rincian item.
- Parser respons lebih toleran terhadap variasi `selectedRowId`.

## Verifikasi
- Pemeriksaan sintaks source ESM.
- Unit test Native Flow memeriksa atribut `biz`, `quality_control`, bot-node private/group, routing ID dan fallback.
- Pengujian live pada perangkat penerima belum dilakukan.
