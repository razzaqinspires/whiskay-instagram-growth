# Baileys Serializer Reference Files

Empat berkas yang diberikan pemilik disimpan utuh di `vendor/baileys-serializer-reference/` dan cocok byte-per-byte dengan empat attachment yang dikirim ulang pada pekerjaan v0.10.16:

- `serializer-compat.cjs`
- `serializer.js`
- `lib/helpers.cjs`
- `lib/freply.cjs`

Berkas tersebut menjadi referensi implementasi, bukan module yang diimpor langsung oleh runtime. `serializer-compat.cjs` berbasis CommonJS dan memuat `require('@whiskeysockets/baileys')`; facade ESM `serializer.js` merujuk service/config/security/observability path yang tidak ada pada struktur WHISKAY. WHISKAY memakai Node ESM dan Baileys v7.

SHA-256 referensi yang tersimpan:

- `serializer-compat.cjs`: `793427ab35ea1fb6e8ddde3596e52b4343db8b82e08cbcba467b8a4d0156fcf7`
- `serializer.js`: `0479c25242f150cb6f338c3540552103f4f49a6495f4083862fe98829d6425a7`
- `lib/helpers.cjs`: `49d48a12fb3651e832a7a2afbb9a3bd239811d17328e6d8fd88cb546184e4e64`
- `lib/freply.cjs`: `b9ac57c10c75b351154bf988dc71cb1794e5556d83daa0e69ec0639d875883b2`

## Runtime adaptasi

- `src/lib/baileys-serializer.mjs`: unwrap wrappers, klasifikasi media/structured message dan media kutipan, polling update yang sudah didekripsi, serta bounded streaming download.
- `src/lib/native-flow.mjs`: Native Flow buttons/CTA, WebView flag, single-select/list, template legacy, rich card normal, carousel, native poll, dan parser interactive response.
- `src/lib/whatsapp-message-router.mjs`: pemilih format keluar untuk semua plugin (`send()`), media, vCard, lokasi statis, tabel/code/link/math text fallback dan penolakan payload generik yang tidak layak.
- `src/lib/poll-store.mjs`: cache bounded poll creation untuk jalur `getMessage`/vote decryption.
- `src/commands.mjs`: context plugin menggunakan router tersebut dan tetap menjalankan command action melalui owner authorization + anti-spam.

## Keputusan keamanan atas kemampuan source

Source helper menyediakan builder untuk rich response, table, list, code, link, LaTeX, carousel, dan AI Rich. Sebagian rich payload menggunakan `botForwardedMessage`, `forwardedAiBotMessageInfo`, `forwardOrigin`, dan bot JID bawaan. WHISKAY tidak memasang metadata AI/forwarded tersebut karena dapat memberikan atribusi yang tidak benar. Konten AI dapat ditampilkan dalam Native Flow Rich Card biasa tanpa label Meta AI/verified bot.

`freply.cjs` juga menyediakan fake quoted message untuk produk, trolley/order, payment, status, newsletter, calls, pinned, view-once, fake sender/persona, dan bot-forwarded. Itu tetap hanya referensi. Tidak ada command untuk membuat pembayaran/produk/kontak/event/call/status palsu atau mengendalikan call stanzas. Product Message memerlukan akun Business serta ID dan metadata katalog produk yang benar.

## Catatan uji

Payload tests memeriksa normalisasi, validasi URL/nomor/koordinat, routing, fallback teks, parser respons, batas carousel/template/poll, dan command owner dispatch. Itu tidak menjamin setiap versi WhatsApp Android/iOS/Web merender semua payload identik. Uji dengan client dan akun nyata tetap diperlukan.
