# Baileys Delivery & Receipt Research — v0.10.30

Tanggal: 9 November 2026  
Dependency target: `@whiskeysockets/baileys@7.0.0-rc14`

## Sumber upstream

- README resmi Baileys: https://github.com/WhiskeySockets/Baileys/blob/master/README.md
- Package npm dan versi/tag: https://www.npmjs.com/package/@whiskeysockets/baileys
- Event map upstream: `src/Types/Events.ts`
- Message types upstream: `src/Types/Message.ts`
- Protobuf status: `WAProto/WAProto.proto`, `WebMessageInfo.Status`

## Temuan yang menjadi dasar implementasi

Baileys mengekspos beberapa event yang berbeda dan tidak boleh disamakan:

- `messages.upsert`: pesan baru atau append/history. `notify` adalah live event; `append` bukan perintah untuk mengulang command lama.
- `messages.update`: partial update untuk pesan, termasuk `update.status` dan poll updates.
- `message-receipt.update`: receipt per pengguna, relevan terutama pada group/multi-recipient.
- `messages.media-update`: pembaruan material media, bukan delivery receipt.

Nilai status `proto.WebMessageInfo.Status`:

| Code | Status | Interpretasi |
|---:|---|---|
| 0 | ERROR | Error status yang dilaporkan protokol |
| 1 | PENDING | Menunggu status selanjutnya |
| 2 | SERVER_ACK | Server WhatsApp mengakui pesan/relay; bukan bukti penerima sudah menerima |
| 3 | DELIVERY_ACK | Delivery acknowledgment |
| 4 | READ | Pesan dibaca |
| 5 | PLAYED | Media/audio diputar |

Receipt pengguna membawa timestamp seperti `receiptTimestamp`, `readTimestamp`, dan `playedTimestamp`. Tracker menyimpan receipt per JID pengguna, sementara status ringkas pesan adalah tahap tertinggi yang teramati.

## Keputusan desain WHISKAY

1. Tidak melakukan automatic resend saat relay promise gagal atau timeout. Hasil transport bisa ambigu: pesan mungkin sudah diterima server meski client tidak menerima respons. Mengirim ulang otomatis dapat menggandakan pesan.
2. Instrumentasi `sendMessage` dan `relayMessage` dilakukan pada socket aktif dan return value asli tidak diubah.
3. Hanya pesan outbound (`key.fromMe === true`) yang dihitung untuk delivery tracker.
4. Cache in-memory dibatasi 2.000 pesan dan TTL 24 jam. Konten pesan tidak disimpan.
5. Status `SERVER_ACK` tidak ditampilkan sebagai delivery ke penerima.
6. Receipt individual disimpan per pengguna, tanpa menyimpulkan bahwa seluruh anggota group telah membaca pesan.
7. `messages.upsert` tetap hanya mengeksekusi command dari event `notify`; Part 4 tidak mengubah kebijakan ingress.

## Batasan

- Tidak semua jenis chat/client mengirim receipt individual.
- Status `READ` atau `PLAYED` dapat dipengaruhi pengaturan privasi dan jenis konten.
- Tracker hanya mengamati event yang diterima selama proses aktif; restart menghapus cache.
- Status yang teramati bukan bukti tampilan UI yang persis sama pada setiap perangkat.

## Isu upstream yang dipantau (bukan seluruhnya diperbaiki WHISKAY)

- Baileys issue #2652 melaporkan bentuk key status/broadcast yang dapat memerlukan cross-pair `participant` LID dengan `remoteJidAlt` PN saat `participantAlt` tidak tersedia. WHISKAY menambahkan cross-pair hanya untuk `@broadcast`, bukan untuk group biasa.
- Baileys issue #2781 melaporkan malformed stanza `smax-invalid (479)` pada jalur retry resend 1:1 LID di rc14. WHISKAY tidak menambahkan retry manual dan tidak mengubah internal retry Baileys; kasus ini tetap dipantau sebagai isu dependency.
- Baileys issue #2858 melaporkan top-level `<status>` stanza yang belum di-ACK pada sebagian rollout server. Ini berada pada raw socket stanza handler internal; WHISKAY tidak memasang listener raw `CB:status` karena berisiko mengganggu parser/ACK internal tanpa reproduksi akun yang terdampak.
- Baileys issue #2884 melaporkan pemulihan sender key group inbound setelah relink yang tidak konsisten. Ini bukan delivery ACK dan tidak dapat diselesaikan oleh tracker pesan.
- Baileys issue #2850 mengingatkan risiko pembatasan akun pada pengiriman massal/cepat. WHISKAY tidak menambahkan bulk sender atau retry agresif.

Semua issue di atas adalah laporan komunitas/upstream, bukan bukti bahwa setiap akun WHISKAY terdampak.

## Perubahan master yang belum menjadi rilis npm

Pemeriksaan halaman Pull Requests upstream per 9 November 2026 juga menunjukkan kandidat perubahan setelah rc14:

- PR #2883: ACK untuk top-level `<status>` stanza, terkait issue #2858.
- PR #2879: mempertahankan timestamp pesan saat direct receipt diproses.
- PR #2887: memindahkan `pollResultSnapshotMessageV3` ke field protobuf 115.

Ini adalah aktivitas branch upstream, bukan bukti bahwa perbaikannya sudah masuk ke paket npm `7.0.0-rc14`. WHISKAY tidak mengubah package ke branch master dan tidak menyalin patch internal tersebut tanpa pengujian end-to-end. Ketiganya menjadi agenda pemeriksaan pada Part 5 saat membandingkan tag rc14 dengan source master terbaru.
