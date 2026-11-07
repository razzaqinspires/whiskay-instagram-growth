# QA Report — WHISKAY v0.10.12

Tanggal pemeriksaan: 7 November 2026

## Hasil aktual

| Pemeriksaan | Hasil |
|---|---:|
| `npm run validate` dengan config QA sementara | PASS |
| `npm run check` | 71 file JavaScript PASS |
| `npm run docs:check` | 65 dokumen terindeks, link dan inventaris script PASS |
| `npm test` | 121 PASS, 0 FAIL |
| `npm run security:permissions` | PASS; 4 file dikunci ke mode 0600 |

## Cakupan relevan

- Command `.igcampaign create` hanya menerima nama campaign; input username, URL profil, dan parameter nominal ditolak.
- Campaign mengambil identitas dari satu session Instagram aktif.
- Session target helper menolak identitas kosong atau malformed.
- Growth store schema v5 mempertahankan campaign/content allowlist dan tidak memuat properti finansial legacy ke model runtime.
- Tes konfigurasi memastikan financial/provider settings tidak diekspos oleh normalized runtime config.
- Tes plugin memastikan command balance, credit, ledger, order, provider, dan queue tidak terdaftar.
- Dokumentasi memindahkan semua penjelasan aktif ke kontrak organic-only dan single-session.

## Belum diuji

- Pairing WhatsApp live.
- Login atau pembacaan profil Instagram live.
- Pengukuran hasil pertumbuhan follower pada akun nyata.
- Referral backend live.
- `npm run security:check` / registry vulnerability audit, karena memerlukan akses registry npm.

Tes otomatis tidak membuktikan Instagram menerima login atau bahwa suatu strategi akan mencapai target follower.
