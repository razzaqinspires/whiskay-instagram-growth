# Baileys upstream research — v0.10.27

**Tanggal pemeriksaan:** 9 November 2026  
**Versi WHISKAY:** `0.10.27`  
**Versi dependency WHISKAY:** `@whiskeysockets/baileys@7.0.0-rc14`

## 1. Ringkasan

WHISKAY saat ini sudah berada pada rilis upstream `7.0.0-rc14`, yang pada saat pemeriksaan tercantum sebagai latest release di repository resmi WhiskeySockets. Tidak ada alasan berbasis bukti untuk mengganti versi dependency hanya karena mencari “versi terbaru”; rc14 tetap merupakan release candidate, bukan Baileys 7 stable. README upstream juga menyatakan adanya breaking changes sejak v7 dan mengarahkan pengguna ke migration guide.

Sumber utama:

- Repository resmi: https://github.com/WhiskeySockets/Baileys
- Releases: https://github.com/WhiskeySockets/Baileys/releases
- WAProto: https://github.com/WhiskeySockets/Baileys/blob/master/WAProto/WAProto.proto
- Message types: https://github.com/WhiskeySockets/Baileys/blob/master/src/Types/Message.ts
- Wiki: https://baileys.wiki/
- Migration guide: https://whiskey.so/migrate-latest

## 2. Perubahan schema/type yang relevan

Pemeriksaan `WAProto.proto` pada branch utama menunjukkan message fields yang perlu dikenali serializer, termasuk:

- `albumMessage`
- `requestPhoneNumberMessage`
- `messageHistoryBundle` dan `messageHistoryNotice`
- `stickerPackMessage`
- `pollResultSnapshotMessage` dan `pollResultSnapshotMessageV3`
- `scheduledCallCreationMessage` dan `scheduledCallEditMessage`
- `questionMessage`, `questionReplyMessage`, `questionResponseMessage`
- `statusQuestionAnswerMessage`, `statusQuotedMessage`, `statusStickerInteractionMessage`
- `botForwardedMessage`, `richResponseMessage`, `botTaskMessage`, `botInvokeMessage`
- `groupStatusMessage`, `groupStatusMessageV2`, `groupStatusMentionMessage`, `statusMentionMessage`

`src/lib/baileys-serializer.mjs` sekarang mengenali type-type tersebut sebagai structured message descriptors. Ini hanya memperluas klasifikasi/incoming inspection; bukan klaim bahwa semua type tersebut sudah memiliki outgoing builder atau dukungan render yang seragam di semua client.

## 3. AIRichResponse

Schema resmi mendefinisikan `AIRichResponseMessage` dengan `messageType`, `submessages`, `unifiedResponse.data`, dan `contextInfo`. `botForwardedMessage` adalah `FutureProofMessage` di `Message`. `MessageContextInfo` juga memiliki `botMetadata`.

Perbandingan dengan helper AIRich dari file referensi pengguna menunjukkan bentuk Single layout yang digunakan helper tersebut:

```js
{
  view_model: {
    primitive: { /* GenAI primitive */ },
    __typename: 'GenAISingleLayoutViewModel'
  }
}
```

WHISKAY sebelumnya membungkus setiap primitive sebagai `GenAIUnifiedResponseSection`; ini berbeda dari bentuk helper referensi. Perubahan v0.10.27 memperbaiki section menjadi direct Single layout dan mengirim payload protobuf langsung melalui `sock.relayMessage`, bukan melalui `generateWAMessageFromContent`. Tidak menyalin `forwardedAiBotMessageInfo.botJid` dari contoh karena nilai tetap itu dapat mengatribusi pesan ke identitas bot lain; WHISKAY mempertahankan disclaimer netral.

Kesesuaian protobuf tidak menjamin UI AIRich akan dirender. Render tetap tergantung versi WhatsApp penerima dan kemampuan server/client.

## 4. ProductMessage dan media

Schema `ProductMessage` memiliki `product.productImage`, `productId`, `title`, `description`, `currencyCode`, `priceAmount1000`, `retailerId`, serta field catalog terkait. Baileys `WAMediaUpload` menerima `Buffer`, stream, atau `{ url }`; path file mentah bukan bentuk media upload yang aman untuk diteruskan langsung.

Perubahan v0.10.27:

- Path demo dicari di `assets/whatsapp-products/`, `assets/whatsapp-media-demo/`, lalu `assets/`.
- Resolver memakai `realpath`, menolak path traversal dan symlink keluar dari assets, serta membatasi ukuran/ekstensi.
- Product image lokal dibaca menjadi `Buffer` sebelum diteruskan ke Baileys.
- `.waform product` tanpa argumen mengambil produk pertama dari katalog Business aktual melalui `sock.getCatalog()`. Tidak membuat product ID/harga/retailer ID palsu.
- `WHISKAY_WHATSAPP_BUSINESS_CATALOG_ENABLED=true` tetap wajib; pengiriman produk membutuhkan akun Business dan katalog yang benar.

Upstream issue #2717 melaporkan `getCatalog()` dapat timeout atau mengembalikan katalog kosong pada sebagian sesi. WHISKAY memberi timeout dan error eksplisit; tidak menganggap katalog kosong sebagai sample berhasil.

## 5. Issue dan keamanan upstream

### Delivery acknowledgement bukan delivery confirmation

Upstream issue #2653 mendokumentasikan kasus `sendMessage()` mengembalikan message key/ID, tetapi `messages.update` kemudian menunjukkan status failed dan penerima tidak menerima pesan. Karena itu WHISKAY tidak boleh menganggap nilai return dari `sendMessage()`/`relayMessage()` sebagai bukti bahwa pesan sudah sampai atau dirender. Monitoring ACK akan menjadi pekerjaan lanjutan pada part berikutnya.

Issue: https://github.com/WhiskeySockets/Baileys/issues/2653

### Product catalog timeout

Issue #2717: https://github.com/WhiskeySockets/Baileys/issues/2717

### `extractMessageContent` fuzz report di rc14

Issue #2875 melaporkan exception pada input malformed/fuzz di `extractMessageContent` Baileys rc14 dan ditutup dengan state `not_planned`. WHISKAY tidak memodifikasi package dependency berdasarkan issue tersebut; serializer lokal tetap membatasi traversal, memvalidasi object shape, menghindari asumsi payload bertipe object, dan memiliki regression test untuk message types baru.

Issue: https://github.com/WhiskeySockets/Baileys/issues/2875

### Security advisory CVE-2026-48063

GHSA-qvv5-jq5g-4cgg memengaruhi versi sebelum `7.0.0-rc12` (serta v6 sebelum `6.7.22`) terkait message-upsert/history-sync spoofing melalui crafted `protocolMessage`. WHISKAY menggunakan rc14, yang berada di atas versi perbaikan yang dinyatakan advisory. Tetap pin versi release dan jangan mengganti dependency ke branch `master` tanpa audit.

Advisory: https://github.com/WhiskeySockets/Baileys/security/advisories/GHSA-qvv5-jq5g-4cgg

## 6. Repository pembanding

Repository yang diperiksa untuk memastikan versi yang benar-benar dipakai project aktif:

| Repository | Baileys dependency yang terlihat | Catatan |
|---|---|---|
| `jeankassio/ZapToBox-Whatsapp-Api` | `7.0.0-rc14` | Pinned rc14; README secara eksplisit menyebut release candidate, bukan stable 7, dan mengarahkan ke migration guide v7. |
| `Rich627/whatsapp-claude-plugin` | `7.0.0-rc14` | Memiliki postinstall patch khusus connection payload rc14: `passive: true` menjadi `false` dan menghapus `lidDbMigrated`. Patch tidak diadopsi karena perubahan itu khusus koneksi dan tidak berkaitan dengan serializer/message pipeline WHISKAY. |
| `openclaw/openclaw` | `baileys@7.0.0-rc14` melalui workspace/alias | Mengunci rc14 dan menerapkan patch terpisah untuk `audio-decode` v3 waveform (`getChannelData()` menjadi `channelData[0]`) serta pemilihan HTTP upload pada Node/Bun. WHISKAY tidak mengadopsi patch ini karena baseline WHISKAY Node 22 dan tidak memasang peer `audio-decode@3`; perlu ditinjau jika voice waveform atau runtime Bun diaktifkan. |
| `mrxdking/star-xd` | `^7.0.0-rc.9` | Lebih lama dari rc14, tidak dijadikan dasar upgrade. |
| `neoxr/neoxr-bot`, `riycoders/Chika-Md`, `Neeraj-x0/X-Asena`, `zim-bot/zimbot-v4` | Tidak menggunakan rc14; sebagian memakai Baileys v4/v5 atau dependency berbeda | Tidak dianggap referensi kompatibilitas terbaru. |

Pemeriksaan repository ini bersifat pembanding source/version/patch, bukan benchmark runtime atau bukti bahwa implementasi mereka berhasil mengirim setiap jenis pesan. Untuk `audio-decode`, Baileys rc14 masih mendeklarasikan optional peer `^2.1.3`; patch OpenClaw khusus v3 tidak boleh disalin tanpa terlebih dahulu menyamakan versi peer dan target file dependency.

## 7. Keputusan v0.10.27

- Pertahankan `@whiskeysockets/baileys@7.0.0-rc14`; tidak ada dependency upgrade.
- Perbaiki AIRich payload shape dan relay transport.
- Perbaiki resolver media untuk assets dan normalisasi ProductMessage image ke Buffer.
- Tambahkan defaults pada `.waform` agar demo standar tidak membutuhkan input parameter.
- Perluas incoming serializer dengan current WAProto message types.
- Tunda outgoing album/request-phone-number/history sync and advanced bot types sampai format, preconditions, and client behavior dapat diuji secara terpisah.
- Tunda monitoring delivery ACK dan full live WhatsApp test ke part berikutnya.

### Interactive message client compatibility

Issue #1918 contains a case where a valid-looking Native Flow protobuf was relayed but WhatsApp Web displayed an unsupported-message warning. The issue is closed with no maintainer comment. This is consistent with the general limitation that correct protobuf serialization does not imply that a specific WhatsApp Web/mobile build supports rendering the message.

Issue: https://github.com/WhiskeySockets/Baileys/issues/1918
