# QA Report WHISKAY v0.10.31 — Part 5

Tanggal: 9 November 2026  
Basis: source ZIP v0.10.30  
Runtime test: Node.js v22.16.0 pada workspace build

## Perubahan yang diuji

- Delivery tracker TTL lookup.
- Status monotonicity saat relay error datang setelah ACK.
- Penghapusan orphan Growth order/provider/queue modules dan tests.
- Project structure, scripts inventory, release/upgrade/research docs.

## Hasil

- `npm test`: **313 passed, 0 failed, 0 cancelled**.
- `npm run check`: **114 JavaScript files** passed syntax validation.
- `npm run docs:check`: **144 Markdown documents** indexed directly from README; links, active-version docs, npm script targets, inventory of **17 maintained scripts**, and source-tree archive scan passed.
- Focused Part 5 tests: **11/11 passed** (delivery tracker + Growth integration boundary).
- Package release: generated and verified separately after QA.

`npm run validate` was not executed because the clean source workspace intentionally has no operator `config/app.json` or `.env`; the release contains only templates. Live WhatsApp tests were not run.

## Batas QA

- Tidak dilakukan login/pairing WhatsApp live.
- Tidak diuji rendering Native Flow/AIRich/Product pada perangkat Android/iOS/Web.
- Tidak diuji status stanza raw `<status>` dari server WhatsApp.
- Issue upstream #2726 (timestamp receipt), #2858 (top-level status ACK), #2781 (retry LID), dan #2884 (group sender key recovery) belum diklaim selesai oleh patch WHISKAY.
- npm dependency audit membutuhkan akses registry dan bukan bukti perilaku live.

## Acceptance criteria

- Tidak ada test suite yang gagal (313/313).
- Syntax checker lulus (114 file).
- Docs checker lulus dan seluruh 144 Markdown terindeks README.
- Tidak ada script aktif tanpa inventory.
- Source tidak memuat orphan order/provider/queue modules.
- Relay ambigu tidak memicu resend otomatis dan tidak menurunkan status yang telah terkonfirmasi.
