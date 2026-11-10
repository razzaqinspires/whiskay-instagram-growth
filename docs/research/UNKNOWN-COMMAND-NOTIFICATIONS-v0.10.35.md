# Unknown Command Notification Controls — v0.10.35

## Tujuan

Menyediakan pilihan bagi owner untuk menampilkan atau menyembunyikan balasan atas command prefix yang tidak dikenal, tanpa mengubah perilaku command/plugin yang valid.

## Desain

Default OFF: unknown command tidak membalas, hanya dicatat di log debug.

ON: dispatcher membalas:
`Command tidak dikenal: <prefix><command>`
`Ketik <prefix>help untuk daftar command.`

Owner mengatur melalui `.unknownnotice status|on|off`. Alias `.unknowncmd` dan `.unknowncommandnotice` tersedia.

## Otorisasi

`unknownnotice` diperlakukan sebagai owner settings command. `inspectOwnerAuthorization()` dijalankan meskipun runtime mode PUBLIC. Group ditolak dengan `allowGroups:false`. Ini mencegah pengguna biasa mengubah preferensi notifikasi.

## Persistensi

Store JSON kecil menggunakan atomic temp-file + rename, mode file 0600, direktori mode 0700. Default saat file hilang atau tidak dapat dibaca adalah OFF. Path default `./data/unknown-command-notifications.json` dan dapat disesuaikan dengan `commands.unknownCommandNotificationsFile`.

## Riset Baileys

Baileys mendistribusikan pesan masuk melalui event `messages.upsert`, dan contoh upstream menganjurkan memproses setiap message dalam array event. Perilaku notifikasi unknown command bukan fitur protokol Baileys; ia adalah kebijakan dispatcher WHISKAY setelah parser menerima teks command. Karena itu, pengaturan ditempatkan di aplikasi, bukan socket config Baileys. <https://github.com/WhiskeySockets/Baileys>.

Baileys `7.0.0-rc14` masih tercatat di npm pada pemeriksaan 10 November 2026. Tidak ada perubahan dependency untuk fitur ini. <https://www.npmjs.com/package/@whiskeysockets/baileys>.

## File

- `src/lib/unknown-command-notice-store.mjs`
- `src/config.mjs`
- `config/app.example.json`
- `src/commands.mjs`
- `src/plugins/core.mjs`
- `test/commands.test.mjs`
