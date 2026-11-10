# Upgrade WHISKAY v0.10.32

## Sebelum upgrade

1. Hentikan instance WHISKAY.
2. Backup `config/app.json`, `.env`, `session/`, `auth_ig/`, dan data runtime secara terpisah.
3. Jangan menyalin folder session/database ke ZIP distribusi publik.

## Instalasi

1. Ekstrak `whiskay-instagram-growth-v0.10.32.zip` ke direktori baru.
2. Pindahkan konfigurasi privat dan data yang memang dibutuhkan secara selektif.
3. Pastikan `ownerCode.enabled` sesuai keputusan operator.
4. Pastikan `whatsapp.ownerNumber` sama dengan nomor akun yang dipakai oleh Baileys.
5. Jalankan `npm install`, `npm run check`, `npm run docs:check`, dan `npm test`.
6. Jalankan `npm start` di foreground dan pantau log `[OWNER RUNTIME]`.

## Tes manual Eval Master

Kirim dari linked device owner ke chat WhatsApp milik akun owner sendiri:

```text
$ ls
=> "helo"
> return "p"
>> print("python-ok")
>>> package main
import "fmt"
func main() { fmt.Println("go-ok") }
```

Prefix kosong seperti `>>` dan `>>>` sekarang menampilkan contoh penggunaan. `>>` bukan perintah interaktif REPL; source Python harus dikirim setelah prefix.

## Verifikasi authorization

- Uji hanya pada private self-chat owner.
- Group, pesan bukan `fromMe`, akun session yang berbeda, dan chat kontak lain harus ditolak.
- Jika ditolak, lihat log `[OWNER RUNTIME] Request rejected by private self-chat gate` dan alasan terstruktur.
- Jangan mengendurkan gate hanya untuk membuat pesan dari chat lain diterima.

## Rollback

Hentikan proses v0.10.32 dan jalankan direktori versi sebelumnya. Pulihkan konfigurasi dan session dari backup jika telah dimigrasikan. Tidak ada migrasi database atau perubahan format session pada release ini.
