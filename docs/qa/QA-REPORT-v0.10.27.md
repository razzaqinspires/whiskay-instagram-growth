# QA Report — WHISKAY v0.10.27 Part 1

**Tanggal:** 9 November 2026  
**Scope:** `waform`, AIRichResponse, ProductMessage media upload, incoming Baileys serializer, documentation/research.

## 1. Perubahan yang diuji

- AIRichResponse builder menghasilkan direct SingleLayout sections dan `sendAIRichResponse()` memanggil `relayMessage()` dengan payload raw.
- AIRich HTML embedded screen menggunakan bentuk SingleLayout yang sama.
- `.waform ai-rich`, `.waform code`, `.waform contact`, `.waform location`, `.waform media`, `.waform product`, `.waform url`, `.waform webview`, `.waform copy`, dan `.waform dialer` menyediakan demo default.
- `.waform product` mengambil metadata dari `sock.getCatalog()` dan memetakan image sample ke `assets/`.
- Product image path dinormalisasi menjadi `Buffer`.
- Incoming serializer mengenali album, request phone number, history bundle/notice, sticker pack, poll result snapshot, scheduled call, question/status, dan AI Rich message wrappers.
- AIRich nested message text dan quoted context berhasil diekstrak dalam unit test.

## 2. Hasil validasi

| Pemeriksaan | Hasil |
|---|---:|
| `npm run check` | PASS — 121 file JavaScript |
| Focused WhatsApp tests | PASS — 56/56 |
| Full `npm test` | 298 passed / 3 failed (301 total) |
| Baileys package install/live session | Not run |
| Live WhatsApp delivery/render | Not run |

## 3. Kegagalan full suite yang sudah diketahui

Tiga kegagalan full-suite berasal dari bagian legacy Growth/SQLite yang ada di ZIP upload ini dan berada di luar scope Part 1:

1. `test/order-engine.test.mjs` — bergantung pada legacy Growth order engine/queue.
2. `test/part4-integration.test.mjs` — mengharapkan file legacy seperti `src/growth/order-engine.mjs` sudah tidak ada, tetapi file tersebut masih ada dalam ZIP upload.
3. `test/sqlite-queue.test.mjs` — import `src/growth/sqlite-queue.mjs` gagal karena `config.growth.queue` tidak tersedia pada konfigurasi aktif.

Kondisi ini juga menunjukkan bahwa ZIP yang diunggah belum sepenuhnya konsisten dengan catatan cleanup source v0.10.25 sebelumnya. File legacy tidak dihapus dalam Part 1 agar perubahan message pipeline tidak bercampur dengan cleanup Growth. Perlu ditangani pada part audit/cleanup terpisah.

## 4. Batasan validasi

- Unit tests memverifikasi struktur payload dan alur relay menggunakan mock; tidak mengirim pesan ke akun WhatsApp nyata.
- Tidak ada bukti bahwa penerima akan merender AIRichResponse, Carousel, ProductMessage, atau native flow pada setiap versi aplikasi.
- Baileys issue #2653 menunjukkan bahwa `sendMessage()` dapat mengembalikan message key sementara `messages.update` berikutnya berstatus failed. Karena itu ID/ACK dari pemanggilan send tidak dilaporkan sebagai delivery confirmation.
- `getCatalog()` memiliki upstream report timeout/empty response pada issue #2717; sample ProductMessage hanya dapat berjalan bila katalog riil dapat dibaca.
- Baileys `7.0.0-rc14` adalah release candidate; dependency tidak dinaikkan pada Part 1.

## 5. Files changed

- `src/lib/native-flow.mjs` — AIRich section schema dan direct relay transport.
- `src/lib/whatsapp-message-router.mjs` — ProductMessage image path ke Buffer.
- `src/lib/baileys-serializer.mjs` — current WAProto structured types dan AIRich nested context/text.
- `src/plugins/whatsapp-tools.mjs` — no-argument samples dan assets-only media resolver.
- `test/native-flow.test.mjs` — AIRich structure/transport regression.
- `test/whatsapp-message-router.test.mjs` — ProductMessage image normalization.
- `test/baileys-serializer.test.mjs` — WAProto type detection dan AIRich nested context.
- `test/plugin-button-help.test.mjs` — default waform demos.
- `docs/NATIVE-FLOW.md`, `docs/WHATSAPP-MESSAGE-ROUTER.md`, `docs/CHANGELOG.md`, `docs/research/BAILEYS-UPSTREAM-RESEARCH-v0.10.27.md`, release/upgrade/QA docs, `README.md`, `package.json`.

## 6. Rollback

Revert source files listed above and restore package version to `0.10.26`. No database or session migration is needed. Keep the original `assets/` directory; no runtime media files are moved or deleted.
