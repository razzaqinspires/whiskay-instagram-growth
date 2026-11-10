# WHISKAY v0.10.32 — Owner Eval Runtime Reliability

## Ringkasan

Part 6 memfokuskan perbaikan Eval Master khusus owner. Sintaks tetap terpisah dari command/plugin biasa:

- `>` — JavaScript async body.
- `=>` — JavaScript expression atau explicit `return`.
- `$` — Bash/CLI.
- `>>` — Python 3.
- `>>>` — Go.

## Perubahan

- Parser menghapus leading Unicode BOM sebelum mendeteksi prefix.
- Prefix dikenali dalam urutan terpanjang agar `>>>`, `>>`, `=>`, dan `>` tidak saling tertukar.
- Prefix tanpa source (`>>` atau `>>>`) mengembalikan petunjuk penggunaan spesifik, bukan pesan generik.
- Timer yang dibuat melalui `setTimeout`, `setInterval`, dan `setImmediate` di JS eval dilacak dan dibersihkan ketika snippet selesai atau timeout.
- Gate owner self-chat sekarang menghasilkan alasan penolakan terstruktur (`FROM_ME_REQUIRED`, `GROUP_CHAT_FORBIDDEN`, `SESSION_PN_UNAVAILABLE`, `SESSION_OWNER_MISMATCH`, `CHAT_NOT_OWNER_SELF_CHAT`) dan alasan dicatat ke log runtime.
- Lookup LID yang gagal tidak merusak pemeriksaan authorization; kandidat tersebut dianggap tidak terverifikasi.
- Dokumentasi memperjelas bahwa `node:vm` bukan sandbox dan Promise timeout tidak membatalkan operasi eksternal yang telah dimulai.

## File

- `src/lib/owner-code-runtime.mjs` — parser, runtime JavaScript, timer lifecycle, empty-source usage, owner gate.
- `src/commands.mjs` — diagnostik alasan penolakan Eval Master.
- `test/owner-code-runtime.test.mjs` — regression prefix, runtime, timer, BOM, authorization diagnostics.
- `docs/OWNER-CODE-RUNTIME.md` — syntax, troubleshooting, security limits.
- `docs/research/OWNER-RUNTIME-RESEARCH-v0.10.32.md` — riset Node.js dan Baileys.
- `docs/upgrades/UPGRADE-v0.10.32.md` — prosedur upgrade/rollback.
- `docs/qa/QA-REPORT-v0.10.32.md` — hasil QA.

## Kompatibilitas dan konfigurasi

- Node.js tetap `>=22.5.0 <23`.
- Baileys tetap `7.0.0-rc14`; tidak ada perubahan dependency.
- Tidak ada perubahan schema `config/app.json`.
- `ownerCode.enabled` tetap harus `true`.

## Keamanan

Eval Master adalah eksekusi kode berprivilege tinggi. JS menerima `process`, `require`, objek socket dan helper live; Bash/Python/Go berjalan dengan hak akses user OS WHISKAY. Ini bukan sandbox. Gunakan user OS non-root, permission minimum, dan jangan menaruh secret yang tidak diperlukan di environment proses.
