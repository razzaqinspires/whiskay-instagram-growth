# Release Notes WHISKAY v0.10.31

Tanggal: 9 November 2026

## WhatsApp message engine integration

- Memperbarui delivery tracker agar `get()` menjalankan TTL pruning; detail command tidak lagi dapat menampilkan record yang sudah kedaluwarsa.
- Memisahkan `relayOutcome=UNCONFIRMED` dari status delivery. Late relay timeout tidak menimpa `DELIVERY_ACK`, `READ`, atau `PLAYED` yang sudah dikonfirmasi.
- Menambahkan regression tests untuk late ambiguous relay error dan TTL lookup.
- Mempertahankan aturan tidak melakukan automatic resend pada hasil relay ambigu.

## Source cleanup

Menghapus source legacy yang tidak direferensikan oleh runtime dan tidak sesuai dengan kontrak Growth organik aktif:

- `src/growth/order-engine.mjs`
- `src/growth/provider-adapter.mjs`
- `src/growth/redis-queue.mjs`
- `src/growth/sqlite-queue.mjs`
- `src/growth/worker.mjs`
- `scripts/worker.mjs`, `scripts/queue-health.mjs`
- Test order/provider/queue legacy yang bergantung pada API/config yang telah dipensiunkan.

Growth campaign, content, funnel, catalog, dan store organik tetap dipertahankan. Tidak ada database runtime yang dihapus oleh release packaging.

## Dokumentasi

- Peta project dan script inventory diperbarui.
- Dokumen Growth queue lama diberi status retired/historical.
- README mengindeks riset, release notes, upgrade guide, dan QA report versi aktif.

## Dependency

`@whiskeysockets/baileys` tetap `7.0.0-rc14`. Tidak ada perubahan versi dependency.
