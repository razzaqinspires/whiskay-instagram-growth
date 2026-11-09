# Baileys Media Research — v0.10.28

**Tanggal riset:** 9 November 2026  
**Dependency yang ditinjau:** `@whiskeysockets/baileys@7.0.0-rc14`  
**Ruang lingkup:** media upload/download, stream lifecycle, re-upload, voice note, proxy dan metadata media.

## Ringkasan temuan upstream

1. Issue [#2750](https://github.com/WhiskeySockets/Baileys/issues/2750) mendokumentasikan stream download yang terputus di tengah transfer. `fetched.pipe(output)` tidak meneruskan error dari source ke destination. Pada reproduksi yang dilaporkan, Undici mengeluarkan `TypeError: terminated`, proses menerima `uncaughtException`, dan stream keluaran tidak pernah selesai. Komentar pengguna lain menyatakan reproduksi serupa pada rc14 dan workaround `fetched.on('error', error => output.destroy(error))` bekerja. Issue ditutup dengan state completed, tetapi source upstream yang diperiksa masih memuat `return fetched.pipe(output, { end: true })` tanpa handler error.
2. Dokumentasi penggunaan Baileys menyebut `sock.updateMediaMessage(msg)` sebagai cara meminta ulang media lama, dan `downloadMediaMessage` mendukung callback `reuploadRequest`. WHISKAY menggunakan `downloadContentFromMessage` untuk pembatasan byte secara streaming, sehingga recovery perlu diorkestrasi di lapisan WHISKAY.
3. Issue [#2758](https://github.com/WhiskeySockets/Baileys/issues/2758) melaporkan bahwa `fetchAgent` pada socket tidak otomatis mengatur jalur `downloadMediaMessage` yang memakai Undici fetch. Belum ada API resmi yang terverifikasi dari riset ini untuk meneruskan SOCKS5 agent ke helper download tersebut. WHISKAY tidak mengubah global fetch atau memasang monkey-patch proxy.
4. Issue [#2867](https://github.com/WhiskeySockets/Baileys/issues/2867) awalnya mengaitkan masalah voice note iPhone dengan upload class, tetapi koreksi reproduksi menyatakan penyebab yang terisolasi adalah metadata chapter Opus (`CHAPTERnnn=`) yang ikut dari konversi FFmpeg. Jangan mengubah upload path PTT tanpa uji reproduksi yang memisahkan variabel.
5. npm menandai `7.0.0-rc14` sebagai tag `latest` saat pemeriksaan, tetapi versinya tetap release candidate. Dependency tetap dipatok; tidak ada kenaikan versi pada rilis ini.

## Perubahan WHISKAY

- `src/lib/baileys-serializer.mjs`: descriptor media sekarang menyimpan sumber WAMessage untuk recovery; quoted media membentuk envelope WAMessage minimal menggunakan stanza ID, remote JID, participant, dan quoted payload.
- `downloadMediaPayload()`: stream dibaca dengan batas byte dan timeout, lalu bila transfer gagal dan socket mendukung `updateMediaMessage`, WHISKAY meminta refresh satu kali dan mencoba ulang payload yang diperbarui. Pelanggaran batas ukuran tidak memicu re-upload.
- `src/commands.mjs`: meneruskan socket dan logger ke downloader.
- `scripts/patch-baileys-media-stream.mjs`: patch postinstall idempotent dan versi-terkunci untuk meneruskan error dari `fetched` ke `output.destroy(error)` pada Baileys rc14. Patch gagal secara eksplisit jika target source tidak ditemukan/ambigu atau versi berbeda.

## Batas dan risiko yang belum ditutup

- SOCKS5 proxy untuk media download belum diimplementasikan. Jangan menyimpulkan `fetchAgent` socket otomatis dipakai pada jalur download.
- Re-upload membutuhkan WAMessage asli dan izin/protokol server; media yang telah dihapus permanen mungkin tetap tidak dapat dipulihkan.
- Re-upload hanya dicoba satu kali. Tidak ada retry loop atau pengiriman ulang pesan ke chat.
- Unit tests menggunakan stream/mocks lokal; belum ada live WhatsApp transfer test pada koneksi yang sengaja diputus.
- AlbumMessage di WAProto berisi metadata expected image/video count; media album tetap perlu dikorelasikan melalui message association terpisah. Part 2 tidak menggabungkan pesan album secara spekulatif.

## Referensi

- [Baileys issue #2750 — mid-download stream error](https://github.com/WhiskeySockets/Baileys/issues/2750)
- [Baileys issue #2758 — SOCKS proxy for media download](https://github.com/WhiskeySockets/Baileys/issues/2758)
- [Baileys issue #2867 — voice note/Opus chapters correction](https://github.com/WhiskeySockets/Baileys/issues/2867)
- [Baileys media processing documentation](https://deepwiki.com/WhiskeySockets/Baileys/6-chat-management)
- [Baileys npm package](https://www.npmjs.com/package/@whiskeysockets/baileys)
