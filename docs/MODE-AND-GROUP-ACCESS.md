# Runtime Mode & Group Access — v0.10.9

Dokumen ini menjelaskan bagaimana WHISKAY menentukan command mana yang boleh dijalankan di private chat dan grup WhatsApp. Kebijakan ini dibuat untuk akun self-bot milik operator: grup boleh dipakai hanya ketika runtime berada di `self`, dan setiap command grup tetap harus berasal dari owner yang terverifikasi.

## Ringkasan kebijakan

| Mode | Private chat owner | Private chat pengguna lain | Grup owner | Grup pengguna lain |
|---|---|---|---|---|
| `self` + `allowGroups: off` | Semua command sesuai izin owner | Ditolak | Ditolak | Ditolak |
| `self` + `allowGroups: on` | Semua command sesuai izin owner | Ditolak | Diizinkan, owner saja | Ditolak |
| `public` | Semua command owner sesuai izin | Hanya command read-only allowlist | Ditolak | Ditolak |

`public` bukan mode group-public. Tidak ada cara mengaktifkan command grup untuk semua peserta melalui versi ini. Pengaturan `allowGroups` yang tersimpan boleh tetap `true` saat beralih ke public, tetapi router memaksakan grup `OFF` sampai mode kembali ke self.

## Command

Jalankan command dari akun WhatsApp owner. Gunakan private chat/self-chat terlebih dahulu untuk perubahan akses.

| Command | Efek |
|---|---|
| `.mode` / `.mode status` | Tampilkan mode aktif dan status izin grup |
| `.mode self` | Aktifkan mode owner-only |
| `.mode public` | Aktifkan private read-only allowlist; seluruh grup ditolak |
| `.mode groups on` | Aktifkan grup untuk owner saja ketika mode self |
| `.mode groups off` | Matikan penerimaan command dari grup |

Contoh mengaktifkan grup:

```text
.mode status
.mode self
.mode groups on
.mode status
```

Setelah itu owner dapat mengirim `.menu`, `.igpanel`, `.igcampaign`, atau command owner lainnya dari grup. Peserta lain di grup yang sama tidak dapat menjalankan command WHISKAY, meskipun mereka admin grup. Role admin WhatsApp tidak pernah menjadi pengganti identitas owner.

Contoh menutup grup:

```text
.mode groups off
```

Contoh menyalakan kembali mode terbatas:

```text
.mode self
```

## Public private-chat allowlist

Saat mode `public`, router hanya menerima command berikut dari private PN/LID chat:

- `.help` / `.menu` — menampilkan menu yang sudah difilter.
- `.igservices` — menampilkan katalog layanan.
- `.igservice <service-id>` — melihat deskripsi layanan.

Allowlist tersebut tidak bisa membaca statistik akun, data campaign, histori konten, referral, maupun sesi. Command `.mode` tetap harus lolos owner authorization; pengguna lain tidak dapat mengubah mode atau mengaktifkan grup.

## Konfigurasi bootstrap

`config/app.example.json` memuat:

```json
{
  "commands": {
    "mode": "self",
    "runtimeModeFile": "./data/runtime-mode.json",
    "allowGroups": true
  }
}
```

- `mode` adalah nilai awal ketika state runtime belum pernah dibuat.
- `allowGroups` adalah nilai awal sakelar grup. Template source v0.10.9 mengaktifkannya untuk penggunaan self-group yang diminta; operator dapat langsung mematikannya melalui `.mode groups off`.
- `runtimeModeFile` adalah lokasi state yang ditulis oleh command `.mode`.

Untuk `config/app.json` lama yang masih memiliki `allowGroups: false`, nilai tersebut tetap menjadi nilai awal jika `data/runtime-mode.json` belum ada. Owner dapat mengaktifkannya lewat `.mode groups on` tanpa mengedit file konfigurasi. Setelah state runtime dibuat, state tersimpan yang berlaku pada restart berikutnya.

## Penyimpanan dan keamanan

`src/lib/runtime-mode.mjs` membuat store yang:

1. Memvalidasi mode hanya `self` atau `public`.
2. Memvalidasi `allowGroups` sebagai boolean.
3. Menulis file melalui temporary file lalu atomic rename.
4. Membuat direktori private `0700` dan file state `0600`.
5. Memuat state lama saat restart.
6. Gagal tertutup jika file state rusak atau memiliki schema yang tidak valid.

`src/commands.mjs` melakukan pemeriksaan mode sebelum dispatch plugin. Dalam mode self, group message tetap melewati `inspectOwnerAuthorization()` dengan identitas PN/LID yang dipetakan oleh Baileys. Dalam mode public, semua group JID ditolak tanpa melihat sakelar `allowGroups`.

Perintah `.mode` berada di router bawaan, bukan plugin publik. Perubahan mode hanya dapat dilakukan setelah owner authorization berhasil. Anti-spam tetap aktif; subcommand `.mode` memakai key anti-spam terpisah agar `.mode groups on` dan `.mode public` tidak salah dianggap duplikat karena command root-nya sama.

## Troubleshooting

**Command owner dari grup tidak dijalankan**

1. Kirim `.mode status` lewat private chat owner.
2. Pastikan mode `SELF`.
3. Pastikan `Group access: ON (owner only)`.
4. Bila off, jalankan `.mode groups on` lewat private chat owner.
5. Jika tetap gagal, periksa log reason authorization. Pastikan `whatsapp.ownerNumber` sama dengan socket PN pada akun yang sedang login.

**Pengguna lain dapat mencoba command di grup**

Tidak akan diproses. Dalam self mode, router hanya menerima identitas owner. Jangan menjadikan status admin grup sebagai izin.

**Public mode memblokir grup walaupun group access ON**

Ini perilaku yang disengaja. Jalankan `.mode self` dari private chat owner jika ingin menggunakan group mode lagi.

**State mode tidak kembali mengikuti config**

`data/runtime-mode.json` menyimpan perubahan terakhir dan lebih diutamakan daripada nilai bootstrap `config/app.json`. Gunakan `.mode` untuk mengubah state; jangan hapus file saat proses bot aktif.

## Verifikasi QA

`test/runtime-mode.test.mjs` menguji persistence, validasi nilai, owner-only group dispatch, public group denial, private read-only allowlist, menu filtering, dan penolakan command mode dari non-owner. Jalankan melalui `npm test`; jangan menjalankan test file secara terpisah.
