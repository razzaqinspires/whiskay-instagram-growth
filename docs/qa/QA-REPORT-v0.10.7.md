# QA Report — WHISKAY v0.10.7

**Tanggal:** 6 November 2026  
**Node.js:** v22.16.0  
**npm:** 10.9.2  
**Python:** tersedia; bridge berhasil dikompilasi  
**Baseline:** v0.10.6  
**Environment:** source tree lokal tanpa koneksi live WhatsApp, Instagram, provider, atau backend referral

## Ringkasan final

**Status: QA lokal lulus**

| Pemeriksaan | Hasil | Detail |
|---|---|---|
| `npm run validate` | PASS | Config valid; owner/pairing lokal disetel ke nomor dummy yang sama; secret tidak dicetak |
| `npm run check` | PASS | 71 file JavaScript (`.mjs`, `.js`, `.cjs`) lolos syntax validation |
| `npm run docs:check` | PASS | 51 dokumen Markdown di `docs/` terindeks langsung; local links, version docs, npm targets, 16 script inventory, dan source hygiene valid |
| `npm test` | PASS | 120 tes, 0 gagal, 0 skipped |
| `npm run security:permissions` | PASS | 1 file lokal dikunci ke `0600`; tidak ada permission directory yang perlu diperbaiki |
| `npm run queue:health` | PASS | SQLite terbuka dan tertutup dengan benar; pending/running/completed/failed seluruhnya 0 pada database QA baru |
| `npm run doctor` | PASS WITH SETUP ITEMS | 5/8 checks pass, 3 item setup, 0 failed; Instagram username dan `.venv-instagram` tidak tersedia pada source bersih |
| `python -m py_compile python/instagram_bridge.py` | PASS | Bridge Python dapat dikompilasi; `__pycache__` dihapus sesudahnya |
| Release ZIP integrity | PASS | ZIP diperiksa dengan `unzip -t`; daftar file dan pengecualian state diverifikasi setelah packaging |
| `npm run security:check` | NOT RUN | `npm audit` tidak dijalankan pada run ini; memerlukan registry npm dan audit dependency terpisah |

## Jumlah test dan cakupan

`npm test` menghasilkan **120 passed / 0 failed** pada Node Test Runner. Peningkatan coverage v0.10.7 mencakup:

- `test/redact.test.mjs`: sanitasi token assignment, Bearer/Basic authorization, sensitive query string, URL userinfo, JWT-shaped value, label error, dan batas panjang teks.
- `test/provider-adapter.test.mjs`: rejection response dan transport exception disanitasi sebelum diterima caller.
- `test/sqlite-queue.test.mjs`: `last_error` disanitasi, age metrics dihitung terhadap waktu referensi, dan retensi terminal dibatasi menjadi maksimal 1.000 completed + 1.000 failed.
- Test lainnya tetap menjalankan parser/owner authorization, Baileys command routing mock, adapter loopback QA, konfigurasi, campaign/order, provider policy, referral HMAC/idempotency, retry, dan SQLite queue.

## Hasil pemeriksaan queue-health

```text
[QUEUE] SQLite queue siap
Jobs: pending=0 | running=0 | completed=0 | failed=0
Oldest pending: — | next due: —
Oldest running: — | oldest failed: —
Last completed: — | last failed: —
```

Database ini adalah state sementara source QA baru, bukan database operator lama. File database dan sidecar lokal dibersihkan sebelum packaging.

## Script dan dokumentasi

- `scripts/` berisi 16 file `.mjs`/`.sh`; semuanya memiliki npm caller, runtime import, atau penggunaan manual yang dijelaskan dalam `docs/guides/SCRIPTS-REFERENCE.md`.
- Tidak ada updater versi lama, `stop.mjs`, adapter Redis, duplicate entrypoint, atau script orphan yang ditambahkan kembali.
- Satu-satunya Markdown di root adalah `README.md`; 51 dokumen lain berada di `docs/` dalam folder komponen, guides, releases, upgrades, dan qa.
- Source tree tidak berisi arsip ZIP/TAR, backup, log, atau salinan proyek.

## Verifikasi arsip hasil build

Setelah ZIP dibuat, arsip diekstrak ke direktori temporary yang terpisah dan diuji ulang dari source hasil ekstraksi:

- `npm run check`: PASS, 71 file JavaScript.
- `npm run docs:check`: PASS, 51 dokumen terindeks dan seluruh 16 script tercatat.
- `npm test`: PASS, 120 tes dan 0 gagal.
- `unzip -t`: tidak ditemukan kerusakan kompresi.
- Inspeksi file list: tidak ada `.env`, `config/app.json`, `node_modules/`, `.git/`, `.venv-instagram/`, sesi, database, backup, atau ZIP lama; tidak ada Markdown root selain `README.md`.

## Batasan verifikasi

- Tidak membuka session atau mengirim pesan WhatsApp live.
- Tidak login, membaca profil, atau melakukan aksi Instagram.
- Tidak mengirim order ke provider eksternal.
- Tidak memanggil backend referral eksternal.
- `npm run doctor` melaporkan setup Instagram belum siap karena username dan virtualenv tidak disediakan pada source release; fitur itu opsional.
- Audit dependency `npm audit` belum dilakukan pada run ini.

Unit test lulus tidak sama dengan verifikasi deployment. Operator tetap harus menjalankan smoke test dengan konfigurasi dan sesi lokal masing-masing setelah instalasi.
