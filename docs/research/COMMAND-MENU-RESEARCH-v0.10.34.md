# Riset Command Menu — v0.10.34

## Gejala yang dilaporkan

`.menu` masih menampilkan tiga pesan:
1. Native Flow pembuka yang mengatakan katalog akan dikirim setelah menu.
2. Katalog halaman 1/2.
3. Katalog halaman 2/2.

Teks tersebut berasal dari implementasi lama yang memisahkan katalog dari pesan interaktif. Source release v0.10.33 sudah menggabungkan katalog ke body Native Flow; bila teks lama masih muncul setelah memasang release tersebut, proses yang aktif kemungkinan masih menjalankan direktori/build lama atau ada instance WHISKAY lain yang menerima pesan.

## Keputusan v0.10.34

- Satu `.menu` hanya menjalankan satu operasi outbound `sendInteractive`.
- Seluruh informasi katalog (command, alias, usage, deskripsi, kategori) ditempatkan di `interactiveMessage.body.text`, yaitu teks utama/caption yang tampil bersama tombol.
- Tiga tindakan tetap tersedia: Profile, Saluran WHISKAY, dan 10 Rekomendasi.
- Tidak ada pemanggilan `reply()`, chunking, atau pengiriman katalog lanjutan dari branch `.menu`.
- Log lokal `[MENU] v0.10.34 single-message dispatch` menunjukkan jumlah command, panjang body, dan apakah transport memakai Native Flow atau fallback teks. Log ini tidak mengirim pesan tambahan ke WhatsApp.

## Batas protokol dan riset web

Dokumentasi WhatsApp Business Platform/Cloud API mencantumkan batas 1.024 karakter untuk body interactive message. Itu adalah spesifikasi Cloud API, bukan kontrak protokol WhatsApp Web Baileys. WHISKAY memakai Native Flow melalui Baileys, sehingga batas Cloud API tidak boleh diperlakukan sebagai batas yang pasti identik; namun payload Native Flow yang sangat panjang juga tidak boleh diasumsikan pasti tampil penuh pada setiap versi client.

Referensi:
- Meta WhatsApp Node.js SDK `InteractiveObject`: https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/types/InteractiveObject/
- Referensi interactive Cloud API (body limit 1,024): https://github.com/bellopushon/whatsapp-cloud-api/blob/main/skills/whatsapp-cloud-api/references/INTERACTIVE.md
- Contoh transport Native Flow Baileys dengan body, footer, dan buttons pada satu payload: https://github.com/zqdevelopers/zq_baileys_helper

Jika client WhatsApp memotong body panjang, tidak ada cara yang dapat menjamin semua 33 deskripsi tampil penuh dalam satu interactive body sekaligus mempertahankan kompatibilitas semua versi. Dalam kondisi itu pilihannya adalah meringkas katalog atau memakai pesan katalog terpisah; release ini mengikuti permintaan satu pesan dan mengirim katalog penuh dalam satu body.

## Diagnostik instalasi

Setelah restart, jalankan `.menu` dan periksa log:
`[MENU] v0.10.34 single-message dispatch: commands=..., bodyChars=..., transport=native-flow`

Jika log tersebut tidak muncul, proses yang aktif bukan source v0.10.34 atau `.menu` sedang diproses oleh instance lain. Pastikan `npm run version:check` menampilkan `whiskay-instagram-growth@0.10.34` pada direktori yang benar, hentikan instance lama, lalu start ulang release ini.

## File

- `src/commands.mjs` — satu outbound call dan diagnostik dispatch.
- `test/commands.test.mjs` — katalog panjang tetap satu relay tanpa katalog split.
- `docs/releases/RELEASE-NOTES-v0.10.34.md`
- `docs/upgrades/UPGRADE-v0.10.34.md`
- `docs/qa/QA-REPORT-v0.10.34.md`
- `README.md`
