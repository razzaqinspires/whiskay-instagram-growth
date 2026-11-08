# WHISKAY WhatsApp Message Lab v0.10.22

Dokumen ini mencatat perbaikan `.waform` untuk Baileys `7.0.0-rc14`, format media demo, ProductMessage, dan batas rendering client.

## Ringkasan perubahan

- Hydrated Template Buttons sekarang dibuat dengan `generateWAMessageFromContent()` lalu dikirim melalui `relayMessage()`. Implementasi lama mengirim objek `templateMessage` ke `sock.sendMessage()` dan pada sesi pengguna menghasilkan `Invalid media type`.
- Legacy `ButtonsMessage` tetap memakai jalur proto/relay terpisah. Jangan menganggapnya sebagai Native Flow; transport legacy hanya mengirim quick reply.
- Carousel mengirim `InteractiveMessage.carouselMessage`, `messageContextInfo` pada envelope, `contextInfo` di dalam interactive message, dan node `biz`/`bot` yang disiapkan untuk relay. `additionalNodes` adalah opsi relay Baileys yang benar-benar tersedia, tetapi tidak menjamin WhatsApp akan menampilkan payload.
- `.waform carousel forwarded` menyalakan `isForwarded` dan `forwardingScore` sebagai eksperimen kompatibilitas. Pesan tersebut akan diberi indikator forwarded walaupun bukan hasil forward asli; gunakan hanya pada chat uji. Implementasi tidak menyisipkan `botJid`, persona, signature, atau atribusi Meta AI palsu.
- AIRichResponse sekarang memiliki `.waform ai-rich html [forwarded]` yang membangun `unifiedResponse.sections` dan `embedded_screens` dengan kontainer tab di dalam `content`, `FOAEmbeddedScreenContentTabbed`, `GenAIUnifiedResponseSection`, `GenAISingleLayoutViewModel`, dan `GenAIaeacdsnwHtmlPrimitive.payload`.
- `WHISKAY_RICH_HTML_TRUSTED_DOMAIN` opsional menerima domain yang benar-benar dikuasai operator. Domain tanpa skema/path; jangan mengisi domain milik pihak lain. Tidak ada verification signature atau bot identity yang direkayasa.
- `.waform media <type> [filename]` menerima filename opsional. Tanpa filename, lima aset demo lokal disalin dari `assets/whatsapp-media-demo/` ke `data/whatsapp-media/` saat pertama digunakan.
- View Once memakai `generateWAMessage()` + `relayMessage()` dan `additionalNodes: [{tag:"meta",attrs:{view_once:"true"}}]`. Karena Baileys rc14 memilih `mediatype` dari wrapper mentah, `postinstall` menjalankan patch idempotent agar `getMediaType()` menerima `normalizeMessageContent(message) || message` terlebih dahulu.
- `.waform product catalog` membaca katalog Business melalui `sock.getCatalog()`. `.waform product info <id>` menampilkan metadata yang dikembalikan. `.waform product <id> | ...` mengirim ProductMessage memakai metadata dan gambar lokal yang diberikan operator.

## Command media demo

Jalankan langsung tanpa mengirim nama file:

```text
.waform media ptv
.waform media voice
.waform media gif
.waform media viewonce-image
.waform media viewonce-video
```

Nama file default:

| Tipe | File | Format |
|---|---|---|
| PTV | `whiskay-demo-ptv.mp4` | MP4 video note |
| Voice | `whiskay-demo-voice.ogg` | OGG/Opus PTT |
| GIF | `whiskay-demo-gif.mp4` | MP4 dengan `gifPlayback` |
| View Once image | `whiskay-demo-viewonce-image.jpg` | JPEG |
| View Once video | `whiskay-demo-viewonce-video.mp4` | MP4 |

Alternatif filename manual:

```text
.waform media ptv | custom-video.mp4
.waform media voice custom-voice.ogg
```

File kustom harus berada di `data/whatsapp-media/`, berupa regular file, tidak melebihi 40 MiB, dan memakai ekstensi yang sesuai. GIF WhatsApp dikirim sebagai MP4 dengan flag `gifPlayback`, bukan file `.gif` mentah.

## ProductMessage Business

`.waform catalog` adalah CTA untuk membuka katalog Business. Itu tidak sama dengan ProductMessage.

1. Pastikan session yang dipakai adalah akun WhatsApp Business dan katalog berisi produk asli.
2. Atur `.env`:

```dotenv
WHISKAY_WHATSAPP_BUSINESS_CATALOG_ENABLED=true
WHISKAY_BUSINESS_OWNER_JID=628xxxxxxxxxx@s.whatsapp.net
```

3. Jalankan `.waform product catalog` untuk membaca maksimal 10 item yang dikembalikan Baileys.
4. Siapkan gambar produk yang sesuai di `data/whatsapp-products/`.
5. Kirim dengan metadata riil:

```text
.waform product <productId> | <title> | <description> | IDR | <harga> | <retailerId> | <gambar.jpg>
```

Harga dimasukkan sebagai nilai mata uang biasa dan dikonversi ke `priceAmount1000`. ID produk, retailer ID, judul, deskripsi, harga, mata uang, dan gambar harus cocok dengan katalog yang dikelola akun Business. WHISKAY tidak membuat data produk, harga, stok, atau ID palsu.

`getCatalog()` bukan jalur yang selalu stabil. Baileys issue #2717 melaporkan timeout/empty response pada sebagian sesi; command memberi batas tunggu 20 detik dan tidak membuat katalog pengganti.

## AIRich HTML dan batas client

`embedded_screens` adalah struktur yang berbeda dari HTML biasa di body chat. Kontainer tab harus berada di dalam `embedded_screens[n].content[]`, lalu `tabs[]`, kemudian `sections[]` dengan `view_model.primitive.payload`. HTML embedded screen ditujukan untuk WhatsApp Android/iOS yang mendukungnya. WA Web desktop dapat mengabaikan embedded screen atau menampilkan bubble fallback. Keberhasilan `relayMessage()`/ACK bukan bukti rendering.

Command:

```text
.waform ai-rich
.waform ai-rich html
.waform ai-rich html forwarded
.waform table
.waform code sample
```

Varian `forwarded` mengatur indikator forwarded saja. Ia tidak meniru Meta AI. WHISKAY sengaja tidak mengirim `forwardedAiBotMessageInfo.botJid`, persona, atau verification signature yang bukan miliknya.

## View Once pada Baileys rc14

Baileys upstream `v7.0.0-rc14` masih memiliki gap pengiriman View Once. PR [#2847](https://github.com/WhiskeySockets/Baileys/pull/2847) menunjukkan bahwa `relayMessage()` memilih `mediatype` dari wrapper `viewOnceMessage`, sehingga nilai media dapat kosong; PR tersebut mengusulkan normalisasi sebelum `getMediaType()`. PR [#2837](https://github.com/WhiskeySockets/Baileys/pull/2837) menambahkan stanza-level `<meta view_once="true"/>`. Keduanya masih berstatus open/stale pada saat riset, bukan perbaikan yang sudah termasuk rc14. WHISKAY menerapkan normalisasi dependency secara idempotent melalui `scripts/patch-baileys-view-once.mjs`, lalu menambahkan node metadata melalui `additionalNodes` pada relay View Once.

Patch hanya diterapkan pada versi `7.0.0-rc14` yang dipatok package.json, memeriksa tepat satu target source line, dan berhenti jika struktur dependency berubah. `npm install` menjalankannya otomatis; perintah manual: `npm run baileys:patch-viewonce`.

## GitHub/Baileys research yang relevan

- Baileys `MessageRelayOptions` v7.0.0-rc14 mendefinisikan `additionalNodes?: BinaryNode[]`. `relayMessage()` menambahkan node tersebut ke isi stanza sebelum `sendNode()`. Jadi opsi ini valid secara API; payload node yang keliru tetap dapat ditolak atau diabaikan oleh server/client.
- Issue [#2824](https://github.com/WhiskeySockets/Baileys/issues/2824): pelapor menyatakan preview card terlihat di perangkat penerima, tetapi UI chat pada perangkat pengirim hanya menampilkan teks. Ini tidak membuktikan carousel akan tampil di semua perangkat.
- Issue [#2739](https://github.com/WhiskeySockets/Baileys/issues/2739): quoted media dapat berbeda antara Web dan mobile. Diskusi issue menyarankan mempertahankan `WAMessage` kutipan utuh dan tidak menulis ulang `quoted.key.remoteJid`; salah satu komentar juga menunjukkan kemungkinan edge case PN/LID alias pada kondisi remoteJid di Baileys. WHISKAY meneruskan quoted WAMessage tanpa mengganti key.
- Issue [#2717](https://github.com/WhiskeySockets/Baileys/issues/2717): `getCatalog()` dapat timeout dan mengembalikan daftar kosong.
- PR [#2847](https://github.com/WhiskeySockets/Baileys/pull/2847) dan [#2837](https://github.com/WhiskeySockets/Baileys/pull/2837) masih belum menjadi bagian dari rc14; WHISKAY membawa patch kompatibilitas lokal terkontrol untuk dua kebutuhan View Once tersebut.
- Referensi struktur AIRich/embedded HTML diambil dari dokumentasi reverse-engineering komunitas [@rexxhayanasi/elaina-baileys](https://www.npmjs.com/package/@rexxhayanasi/elaina-baileys), bukan kontrak resmi Meta/Baileys. Bentuk ini tetap eksperimental.

## Batas verifikasi

Tes lokal memvalidasi struktur payload, pemanggilan relay, format aset, dan fallback. Tes lokal tidak dapat membuktikan bahwa WhatsApp menerima, menyimpan, atau merender Native Flow, Carousel, AIRich HTML, ProductMessage, PTV, View Once, GIF, atau voice note pada akun/perangkat tertentu. Uji penerimaan harus dilakukan di chat penerima menggunakan versi WhatsApp mobile yang aktual.
