# Riset Command Menu & Unknown Command Handling — v0.10.33

## Tujuan

Menangani dua perilaku yang dilaporkan pada 10 November 2026:

1. `.menu` menghasilkan satu Native Flow lalu dua pesan katalog teks.
2. Prefix command yang tidak dikenal (`.westmanga`, `.wmhomd`, `.wmhome`) membalas dengan notifikasi yang tidak diinginkan.

## Pemeriksaan source

`src/commands.mjs` sebelumnya menghitung `inlineBody`, tetapi hanya memasukkan katalog jika panjangnya <= 900 karakter. Ketika katalog lebih panjang, body Native Flow hanya berisi pengantar dan menjanjikan katalog susulan. Setelah `sendInteractive()`, kode memanggil `chunkCommandCatalog()` dan mengirim seluruh katalog sebagai pesan teks tambahan. Untuk 33 command, inilah penyebab tiga pesan.

`src/lib/native-flow.mjs` sebelumnya membatasi body menu menjadi 3.000 karakter. Menu perlu menyimpan katalog lengkap di body Native Flow, sehingga batas khusus body dinaikkan menjadi 12.000 karakter. Ini adalah batas aplikasi WHISKAY, bukan jaminan batas tampilan resmi WhatsApp. Rendering teks panjang perlu diverifikasi pada WhatsApp Android, iOS, dan Web. Jika client membatasi tampilan, satu pesan tetap terkirim tetapi sebagian teks dapat terpotong/kurang nyaman dibaca.

## Keputusan implementasi

- `.menu` mengirim satu Native Flow dengan tiga tindakan yang sama.
- Seluruh katalog command (nama, alias, usage, deskripsi, kategori) ditempatkan pada `interactiveMessage.body.text`.
- Tidak ada pesan teks lanjutan.
- Native Flow body WHISKAY dibatasi 12.000 karakter untuk mencegah payload tidak terkendali.
- Bila katalog melebihi batas ini, pengiriman gagal melalui validasi dan dicatat; tidak ada silent truncation atau pesan susulan.
- Command berprefix yang tidak terdaftar tidak lagi mengirim balasan WhatsApp. Kejadian dicatat pada logger level debug agar tidak membanjiri chat.

## Riset eksternal

Dokumentasi penyedia WhatsApp Business Platform mendeskripsikan struktur interactive message dengan `body.text`, footer, header, dan action. Contoh dokumentasi tersebut menyebut batas body 1.024 karakter untuk Cloud API, tetapi WHISKAY memakai protokol WhatsApp Web melalui Baileys, bukan Cloud API. Batas Cloud API tidak boleh diasumsikan sebagai batas identik untuk payload Baileys; kompatibilitas tampilan body Native Flow panjang harus diuji di client sebenarnya.

Baileys helper komunitas memetakan teks body ke `interactiveMessage.body.text` dan mengirim tombol melalui `relayMessage` dengan binary nodes yang sesuai. Ini mendukung pemisahan body text dan button actions, tetapi bukan bukti bahwa setiap client menerima teks sepanjang 12.000 karakter.

## Files

- `src/commands.mjs` — satu pesan menu; silent unknown command.
- `src/lib/native-flow.mjs` — batas body Native Flow 12.000 karakter.
- `test/commands.test.mjs` — satu pesan untuk katalog panjang dan unknown command tanpa balasan.
- `README.md` — indeks release terbaru.
- `docs/PROJECT-STRUCTURE.md` — versi peta source.
- `docs/releases/RELEASE-NOTES-v0.10.33.md` — perubahan.
- `docs/upgrades/UPGRADE-v0.10.33.md` — upgrade dan rollback.
- `docs/qa/QA-REPORT-v0.10.33.md` — hasil QA.

## Batasan

Tidak dilakukan pengiriman live dari session WhatsApp pengguna. QA membuktikan satu pemanggilan relay pada mock Baileys, bukan rendering atau panjang body yang benar-benar ditampilkan pada semua client.
