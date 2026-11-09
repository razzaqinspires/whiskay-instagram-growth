# Release Notes v0.10.30

## WhatsApp Delivery State & Message Reliability

- Menambahkan `src/lib/message-delivery-tracker.mjs` untuk mengamati hasil outbound `sendMessage`/`relayMessage`.
- Mengonsumsi event Baileys `messages.update` dan `message-receipt.update`.
- Memetakan status ERROR, PENDING, SERVER_ACK, DELIVERY_ACK, READ, dan PLAYED.
- Menyimpan receipt timestamp per penerima pada group/multi-recipient.
- Menambahkan command owner-gated `.wadelivery [messageId]` untuk melihat ringkasan dan detail status.
- Menghindari automatic resend pada hasil relay yang ambigu.
- Cache hanya menyimpan metadata pesan, maksimum 2.000 record, TTL 24 jam; tidak menyimpan isi pesan.

## QA dan batasan

Tes unit memvalidasi tracking wrapper, status monotonic, receipt per penerima, ambiguity relay, dan pruning. Tidak ada pengujian live WhatsApp pada rilis ini. Receipt tidak selalu tersedia dan SERVER_ACK tidak sama dengan DELIVERY_ACK.

- Memperbaiki pembelajaran LID→PN untuk envelope status/broadcast saat `participantAlt` tidak ada, hanya jika `remoteJid` berakhiran `@broadcast` dan `remoteJidAlt` adalah PN.
- Mencatat issue upstream rc14 tentang retry stanza, top-level status ACK, dan group sender-key recovery sebagai risiko terpantau; tidak memasang patch raw socket tanpa reproduksi.
