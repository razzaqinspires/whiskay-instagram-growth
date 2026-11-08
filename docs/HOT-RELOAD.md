# Dependency-aware Hot Reload — v0.10.17

WHISKAY v0.10.17 memperluas hot reload dari file plugin langsung ke seluruh source tree `src/`.

## Apa yang diawasi

- `src/plugins/*.mjs`: penambahan, penghapusan, dan perubahan command/plugin.
- `src/academic/`, `src/lib/`, `src/growth/`, `src/referral/`, `src/media/`, `src/security/`, serta subfolder `src/` lain: perubahan dependency yang diimpor plugin.
- Pembuatan ulang file library yang sebelumnya tidak ada. Jika sebuah plugin gagal saat startup karena dependency lokal hilang, file baru di bawah `src/` memicu snapshot dan percobaan load ulang semua plugin.

Setiap perubahan source yang relevan memicu snapshot baru dan memuat ulang seluruh plugin dalam satu dependency graph ESM. Strategi satu snapshot bersama dipilih agar plugin tidak memakai versi dependency yang berbeda setelah satu library berubah.

## Mengapa snapshot diperlukan

Node.js mempertahankan cache module ESM berdasarkan URL module. Mengimpor ulang `src/plugins/academic-review.mjs?hot=...` saja tidak otomatis membuat `src/academic/client.mjs` dimuat ulang; dependency statis tanpa query tetap dapat menggunakan module cache lama. WHISKAY membuat salinan source berversi di `.whiskay-runtime/hot-modules/` dan memuat plugin dari sana, sehingga dependency library mendapatkan identitas module baru.

Modul yang memiliki state proses atau path data absolut ditautkan kembali ke source aktif agar tidak membuat store/session/cache kedua: `config.mjs`, `commands.mjs`, `instagram.mjs`, `lib/lid-manager.mjs`, `lib/poll-store.mjs`, `growth/store.mjs`, `referral/bot.mjs`, dan `referral/queue-processor.mjs`.

Snapshot lama dibatasi sampai delapan generasi terakhir. Folder `.whiskay-runtime/` bersifat runtime-only, diabaikan Git dan tidak masuk source release.

## Transaksi reload dan kegagalan

Saat startup, plugin yang dependency-nya valid tetap dapat dimuat meskipun ada plugin lain yang gagal. Ketika hot reload berlangsung, registry lama dipertahankan jika ada plugin atau dependency yang gagal diimpor; WHISKAY tidak mengganti registry sehat dengan set plugin yang hanya termuat sebagian. Setelah file diperbaiki/disimpan, watcher mencoba ulang.

`config.mjs` dibaca satu kali saat proses startup. Perubahan pada file tersebut ditandai `restart-required`; restart WHISKAY untuk menerapkan nilai konfigurasi. Perubahan pada source library/plugin biasa tidak memerlukan restart.

## Command diagnostik

```text
.hotreload status
.hotreload reload
.watchstatus
```

`status` menampilkan mode watcher, source root, jumlah direktori yang diawasi, plugin/command aktif, snapshot terakhir, perubahan terakhir, dan hasil reload. `reload` meminta pembuatan snapshot baru secara manual. Command tetap melewati akses owner dan anti-spam runtime.

Contoh log:

```text
[HOT-RELOAD] perubahan source terdeteksi: academic/client.mjs; memuat ulang dependency graph plugin.
[PLUGIN] unloaded academic-review
[PLUGIN] reloaded academic-review (1/1 commands)
[PLUGIN] source snapshot gen-...: 5 plugin(s), ... command(s) · academic/client.mjs
```

## Batasan

- Watcher hanya aktif bila `plugins.hotReload=true`.
- Source tree di luar `src/` tidak diawasi. Perubahan `.env`, `config/app.json`, `package.json`, dependency `node_modules`, `index.mjs`, `scripts/`, atau loader itu sendiri memerlukan restart.
- Bila penulisan file berlangsung bertahap, watcher melakukan debounce dan snapshot ulang. Import yang gagal akan mempertahankan registry lama.
- Hot reload tidak menggantikan regression tests. Jalankan `npm test` dan `npm run qa` setelah perubahan library.
