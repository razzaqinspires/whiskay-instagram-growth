# Release Notes — v0.10.28

**Nama rilis:** Baileys Media Reliability & Recovery  
**Tanggal:** 9 November 2026

## Perubahan

- Download media masuk memiliki batas byte dan timeout yang eksplisit.
- Jika stream gagal, WHISKAY dapat meminta `sock.updateMediaMessage()` satu kali dan mencoba payload media yang diperbarui.
- Quoted media menyimpan WAMessage envelope minimal untuk mendukung recovery.
- Postinstall patch Baileys rc14 meneruskan error stream sumber ke output transform sehingga kegagalan unduhan dapat ditangkap caller.
- Patch dependency dikunci ke Baileys `7.0.0-rc14`, idempotent, dan menolak target yang hilang/ambigu.

## Tidak berubah

- Baileys tetap `7.0.0-rc14`.
- Tidak ada perubahan protokol PTT upload.
- Tidak ada SOCKS proxy global/monkey-patch.
- Tidak ada klaim pengujian WhatsApp live.

## QA

21/21 tes spesifik media/serializer lulus; syntax check 122 file dan docs check 132 dokumen lulus. Full suite: 306 passed, 3 failed karena legacy Growth tests/file mismatch yang sudah dicatat di [QA Report v0.10.28](../qa/QA-REPORT-v0.10.28.md). Belum ada live WhatsApp test atau verifikasi postinstall terhadap `node_modules` aktual.
