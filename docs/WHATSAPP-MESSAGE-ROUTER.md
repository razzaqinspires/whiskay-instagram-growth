# WHISKAY WhatsApp Message Router

Versi aktif: v0.10.16. Semua plugin memanggil satu API `send()` dari `src/commands.mjs`. Router pusat berada di `src/lib/whatsapp-message-router.mjs`; payload interaktif tetap dibangun oleh `src/lib/native-flow.mjs`; inspeksi/download pesan masuk tetap di `src/lib/baileys-serializer.mjs`.

## Keputusan format

| Jenis command/pesan | Format terpilih | Kapan digunakan |
|---|---|---|
| Aksi singkat seperti Menu, Ping, lihat status | `quick_reply` | Maksimal beberapa pilihan tindakan yang langsung menjalankan command WHISKAY. Respons masuk dipetakan ke command ID bernamespace lalu melewati otorisasi owner dan anti-spam yang sama. |
| Banyak command atau submenu | `single_select` / button list | Pilihan bertingkat atau lebih dari tiga opsi. `.menu` memakai Native Flow Single Select. |
| Buka docs, GitHub, situs, halaman layanan | `cta_url` | URL HTTPS publik yang memang dimaksudkan dibuka di browser/client. |
| Buka halaman dalam WhatsApp | `webview_url` | Alias CTA URL dengan `webview_interaction: true`; tidak menjamin semua client memakai WebView. |
| Salin nomor referensi, kode publik, ID non-rahasia | `cta_copy` | Hanya nilai yang memang boleh terlihat dan disalin. Regex menolak beberapa pola nama credential yang umum; pemanggil tetap wajib tidak mengirim rahasia. |
| Hubungi nomor dukungan | `cta_call` | Nomor internasional yang tervalidasi, bukan nomor contoh yang tidak dimiliki. |
| Buka katalog | `cta_catalog` | Hanya bila akun WhatsApp Business telah mempunyai katalog yang benar-benar terhubung. |
| Client lama | hydrated Template Buttons | Jalur kompatibilitas maksimal tiga tombol; bukan pilihan utama. Template mendukung quick reply, URL, dan call pada builder WHISKAY. |
| Ringkasan / hasil / status satu objek | Rich Card berbasis Native Flow | Satu kartu terstruktur dengan header/body/footer dan CTA biasa. Ini bukan payload Meta AI khusus. |
| Menampilkan beberapa fitur/produk | Native Flow Carousel | Dua sampai sepuluh kartu; setiap kartu memiliki body dan tombolnya sendiri. Gambar lokal dapat disiapkan melalui media uploader Baileys. |
| Polling dan pilihan suara | Native WhatsApp Poll | Voting native single atau multi-select. WAMessage pembuatan disimpan secara bounded untuk kebutuhan `getMessage`/dekripsi suara. |
| Foto, video, video note/PTV, audio/voice note, dokumen, sticker, GIF | Baileys `sendMessage` media payload | Media file dikirim sebagai Buffer/path lokal. Untuk incoming, `downloadMedia()` memakai streaming dan batas byte. |
| Kartu kontak | `contacts` / vCard | Kontak riil dengan nama dan nomor yang diberikan secara eksplisit. |
| Titik lokasi | `location` | Koordinat statis dalam batas latitude/longitude yang valid. Tidak mengirim live tracking. |
| Table, code, link, LaTeX | Fallback teks | WhatsApp menerima teks terformat sederhana; router tidak mengklaim render tabel/LaTeX/code proprietary yang tidak dijamin oleh client. |

## API `send()`

```js
await send('Teks biasa');

await send({
  type: 'quick_reply',
  title: 'Buka menu',
  id: 'wsk:cmd:.menu',
  body: 'Pilih tindakan'
});

await send({
  type: 'cta_url',
  title: 'Dokumentasi',
  url: 'https://example.com/docs'
});

await send({
  type: 'list',
  title: 'Pilihan',
  items: [
    { title: 'Menu', id: 'wsk:cmd:.menu' },
    { title: 'Status', id: 'wsk:cmd:.status' }
  ]
});

await send({
  type: 'rich_card',
  title: 'Status proses',
  body: 'Proses selesai.',
  buttons: [{ type: 'quick_reply', title: 'Menu', id: 'wsk:cmd:.menu' }]
});

await send({ type: 'media', mediaType: 'video', media: videoBuffer, caption: 'Hasil' });
await send({ type: 'contact', name: 'Support', phone: '+6281234567890' });
await send({ type: 'location', latitude: -6.2, longitude: 106.8, name: 'Lokasi' });
```

Alias didukung: `nativeButtons`, `native_buttons`, `buttons`, `quick_reply`, `url`, `webview`, `copy`, `call`, `catalog`, `button_list`, `card`, `rich`, `ai_rich_card`, `template_buttons`, `native_poll`, `voice`, `contacts`, dan `static_location`.

## Batas format dan keamanan

- Native Flow maksimal 10 tombol. Single Select memakai 1–10 sections dan 1–20 rows per section. Carousel maksimal 10 cards dan membutuhkan minimal 2 cards. Template Buttons maksimal 3 tombol. Poll maksimal 12 opsi.
- Semua URL CTA wajib HTTPS dan tanpa userinfo. Media interaktif hanya menerima Buffer/path lokal; `send()` menolak URL arbitrary untuk media upload.
- Quick Reply yang ditujukan untuk command internal memakai `commandActionId()`. Jangan mengirim command user-supplied langsung sebagai payload tanpa validasi.
- CTA Copy bukan penyimpanan rahasia. Jangan mengirim password, token, API key, private key, cookie, atau informasi pribadi.
- Product Message generik tidak diaktifkan. Integrasi produk membutuhkan akun Business, product/catalog ID, dan metadata katalog yang valid; jangan membuat harga, stok, rating, atau ID fiktif.
- AI Rich Response dari helper referensi memakai `botForwardedMessage`/`forwardedAiBotMessageInfo` dan botJid bawaan. Metadata itu dapat memberi kesan pesan berasal dari Meta AI/forwarded bot. WHISKAY tidak menggunakannya. `ai_rich_card` hanya alias ke kartu Native Flow normal untuk menampilkan konten AI tanpa mengklaim identitas Meta AI.
- Fake quote/sender, fake payment/order, fake call/status, live location, dan proprietary status/pinned wrappers tidak menjadi command aktif.
- ACK relay bukan bukti bahwa ponsel penerima merender setiap Native Flow. Uji langsung pada versi WhatsApp Android/iOS/Web yang digunakan.

## Command untuk uji

`.waform help` menampilkan seluruh jenis demo. `.wacapabilities` menampilkan keputusan format dan batas kompatibilitas. `.mediainfo` memeriksa media incoming; `.poll` mengirim poll asli. `.menu` memakai Single Select jika jumlah section memenuhi batas builder.

## Referensi serializer milik owner

Empat file yang diberikan disimpan utuh di `vendor/baileys-serializer-reference/`. SHA-256:

- `serializer-compat.cjs`: `793427ab35ea1fb6e8ddde3596e52b4343db8b82e08cbcba467b8a4d0156fcf7`
- `serializer.js`: `0479c25242f150cb6f338c3540552103f4f49a6495f4083862fe98829d6425a7`
- `lib/helpers.cjs`: `49d48a12fb3651e832a7a2afbb9a3bd239811d17328e6d8fd88cb546184e4e64`
- `lib/freply.cjs`: `b9ac57c10c75b351154bf988dc71cb1794e5556d83daa0e69ec0639d875883b2`

Berkas referensi tidak dimuat langsung oleh runtime ESM. `serializer.js` juga mengimpor modul path-specific dari proyek sumber lain. Adaptasi WHISKAY dipisah agar API runtime yang benar-benar dipakai dapat diuji dan dibatasi.
