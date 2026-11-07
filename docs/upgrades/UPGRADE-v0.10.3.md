# Upgrade v0.10.2 → v0.10.3

> **Dokumen historis:** instruksi ini merekam prosedur untuk versi lama. Script updater yang disebutkan mungkin sudah dihapus dan tidak tersedia pada source v0.10.6. Jangan jalankan command lama dari dokumen ini pada instalasi sekarang. Untuk upgrade saat ini, gunakan [UPGRADE v0.10.6](UPGRADE-v0.10.6.md).


1. Hentikan WHISKAY dengan `Ctrl+C` atau stop process manager.
2. Ekstrak arsip release di direktori terpisah.
3. Jalankan dari root hasil ekstraksi: `bash scripts/upgrade-v0.10.3.sh /root/wbself`.
4. Skrip membuat backup penuh dan menyalin patch setelah pengecekan versi.
5. Jalankan `npm start` setelah upgrade berhasil.

Tidak ditimpa: `.env`, `config/app.json`, `session/`, `auth_ig/`, `data/`, `node_modules`, dan virtual environment Instagram.

Setelah bot hidup, uji `.igpanel` dan `.igservices` dari WhatsApp. Pembaruan ini memperbaiki struktur envelope berdasarkan serializer yang disediakan, tetapi tidak mengklaim dukungan universal lintas versi WhatsApp.
