# WHISKAY v0.10.35 — Unknown Command Notification Controls

## Fitur baru

Command owner-only `.unknownnotice` mengatur balasan untuk command prefix yang tidak terdaftar.

- `.unknownnotice status` — lihat status.
- `.unknownnotice on` — aktifkan balasan `Command tidak dikenal`.
- `.unknownnotice off` — nonaktifkan balasan; unknown command kembali diabaikan.
- Alias: `.unknowncmd`, `.unknowncommandnotice`.

Default adalah OFF agar chat tidak dipenuhi notifikasi typo/command asing.

## Penyimpanan

Status disimpan di `data/unknown-command-notifications.json` melalui penulisan atomik. File berada di data runtime dan tidak masuk ZIP source. Jika file belum ada atau rusak, default aman adalah OFF.

Path dapat diatur dengan `commands.unknownCommandNotificationsFile` pada `config/app.json`. Nilai harus berada di area data privat sesuai validator path WHISKAY.

## Otorisasi

Command pengaturan dipaksa melalui pemeriksaan owner meskipun runtime berada dalam mode PUBLIC. Command ini ditolak pada group chat. Tidak ada perubahan pada Eval Master atau aturan plugin.

## File

- `src/lib/unknown-command-notice-store.mjs`
- `src/config.mjs`
- `config/app.example.json`
- `src/commands.mjs`
- `src/plugins/core.mjs`
- `test/commands.test.mjs`
- `README.md`
- `docs/research/UNKNOWN-COMMAND-NOTIFICATIONS-v0.10.35.md`
- `docs/upgrades/UPGRADE-v0.10.35.md`
- `docs/qa/QA-REPORT-v0.10.35.md`
