# WHISKAY Native Flow

Native Flow WHISKAY dibangun oleh `src/lib/native-flow.mjs` dan digunakan oleh unified router `src/lib/whatsapp-message-router.mjs`. Native Flow merupakan payload client-dependent; sukses relay tidak menjamin semua versi WhatsApp merendernya dengan cara sama.

## Pilihan transport

| Kebutuhan | Format |
|---|---|
| Pilihan singkat menjalankan command | `quick_reply` |
| Banyak menu/submenu | `single_select` / list |
| Buka URL HTTPS | `cta_url` |
| URL dengan permintaan WebView | `webview_url` alias `cta_url` + `webview_interaction` |
| Menyalin ID/kode publik | `cta_copy` |
| Membuka dialer | `cta_call` |
| Membuka katalog Business | `cta_catalog` |
| Client lama | hydrated Template Buttons |
| Satu ringkasan terstruktur | Native Flow Rich Card |
| Dua sampai sepuluh kartu | Native Flow Carousel |
| Voting | native poll |

## Contoh command

```text
.menu
.waform help
.waform quick
.waform mixed
.waform list
.waform url https://example.com
.waform webview https://example.com/app
.waform copy WHISKAY-ID-001
.waform call +6281234567890
.waform catalog
.waform template
.waform card
.waform ai-card
.waform carousel
.waform poll
.wacapabilities
```

Penjelasan pemilihan format dan API `send()` seluruh plugin: [WhatsApp Message Router](WHATSAPP-MESSAGE-ROUTER.md).

## Action routing

Command action ID memakai prefix `wsk:cmd:`. Saat tombol/row dipilih, parser mengambil ID dari Native Flow response, list response, atau legacy button reply. ID valid diubah kembali menjadi command teks; selanjutnya handler menjalankan pemeriksaan owner, mode, anti-spam, dan plugin seperti command yang diketik manual. CTA URL/Copy/Call/Catalog bukan command action dan tidak dieksekusi oleh command router.

## Validasi dan batas

- Native Flow: 1–10 buttons.
- Single Select: 1–10 sections; 1–20 rows per section.
- Carousel: 2–10 cards; media card memakai Buffer/path lokal dan Baileys uploader.
- Hydrated Template Buttons: 1–3 buttons; quick reply, URL, call.
- Poll: 2–12 opsi; selectableCount 0 sampai jumlah opsi.
- CTA URL dan WebView: HTTPS tanpa username/password.
- CTA Copy: string publik maksimal 256 karakter; command `.waform copy` menolak pola kata credential umum.
- Media arbitrary URL tidak diunduh otomatis.

## Batas payload eksperimental

AI Rich Response proprietary dari referensi mengandung forwarded-AI metadata dan bot JID statis. WHISKAY tidak menggunakan builder itu. Gunakan Rich Card biasa untuk menampilkan hasil AI tanpa menyatakan pesan berasal dari Meta AI. Product Message tidak dikirim sebagai payload generik tanpa identitas Business dan data katalog asli. Fake quoted replies, fake payment, fake call, status, live location, bot identity, dan payment wrappers tidak diekspos melalui command.

## Poll vote

Baileys memerlukan pesan pembuatan poll untuk mendekripsi hasil vote. WHISKAY menyimpan poll creation WAMessage secara bounded (maksimum 5.000) dan memasoknya melalui `getMessage` saat socket dibuat. Hanya poll update yang sudah didekripsi dan berisi `vote.selectedOptions` yang diekspos sebagai event vote; ciphertext tidak diperlakukan sebagai hasil polling.

## Uji perangkat

Automated tests memeriksa struktur payload dan fallback. Uji live tetap diperlukan pada client WhatsApp yang digunakan owner, terutama untuk WebView, CTA catalog, carousel media, template legacy, dan rich card.
