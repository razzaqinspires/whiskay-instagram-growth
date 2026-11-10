# Owner Runtime Research — v0.10.32

## Pemeriksaan sumber

### Node.js `node:vm`

Dokumentasi resmi Node.js menyatakan `node:vm` **bukan mekanisme keamanan**. Timeout `runInContext()` membatasi eksekusi sinkron di dalam VM, tetapi pekerjaan asynchronous yang menggunakan queue global atau API host dapat melewati batas timeout. Karena WHISKAY sengaja memberi Eval Master akses ke `process`, `require`, socket dan helper runtime, fitur ini harus diperlakukan sebagai administrasi berprivilege tinggi, bukan sandbox.

Sumber: https://nodejs.org/api/vm.html

### Baileys

Baileys 7 memperkenalkan breaking changes dan perubahan alamat PN/LID. Decoder upstream saat ini membedakan `fromMe` dari alamat tujuan: pada direct message yang dikirim oleh akun sendiri, `remoteJid` adalah chat penerima. `remoteJidAlt` dapat berisi alternate address bila tersedia. WHISKAY tetap memverifikasi PN session terhadap `ownerNumber`, kemudian memastikan tujuan private chat terpetakan ke PN owner.

Sumber:
- https://github.com/WhiskeySockets/Baileys/blob/master/src/Utils/decode-wa-message.ts
- https://github.com/WhiskeySockets/Baileys/blob/master/src/Types/Events.ts
- https://github.com/WhiskeySockets/Baileys

### Dependency

npm menampilkan `@whiskeysockets/baileys` `7.0.0-rc14` sebagai versi publik terbaru yang diperiksa untuk release ini. Tidak ada upgrade dependency pada Part 6.

Sumber: https://www.npmjs.com/package/@whiskeysockets/baileys

## Temuan source WHISKAY

- `src/wa.mjs` hanya memproses event `messages.upsert` bertipe `notify`, sehingga pesan history/append tidak mengeksekusi ulang kode lama.
- `src/commands.mjs` mendeteksi prefix khusus sebelum parser command biasa dan mengeksekusinya terpisah dari plugin loader.
- `src/lib/owner-code-runtime.mjs` mengurutkan prefix dari yang terpanjang (`>>>`, `>>`, `=>`, `>`, `$`).
- Authorization mensyaratkan `fromMe`, session PN cocok dengan `ownerNumber`, serta private self-chat yang cocok dengan owner PN atau LID alias yang tervalidasi.
- `node:vm` dipakai untuk evaluasi JS, tetapi sandbox mendapat `process`, `require`, `sock`, `Buffer`, dan helper aktif. Ini sengaja memberi akses penuh kepada owner, tetapi tidak membatasi privilege OS.

## Perubahan Part 6

- Leading BOM dibersihkan sebelum parsing.
- Prefix kosong memberi contoh syntax yang relevan.
- Timer JS yang dibuat melalui timer global yang diekspos runtime dibersihkan setelah snippet selesai.
- Owner gate menghasilkan alasan diagnostik dan kegagalan lookup LID tidak membuat seluruh handler melempar exception.
- Timeout Promise hanya membatasi waktu tunggu bot; tidak membatalkan operasi eksternal yang telah dimulai.

## Batas verifikasi

Tes lokal memverifikasi parser, authorization helper, JS eval, Bash, Python, Go, timeout, output cap, dan timer cleanup. Tes ini tidak menggantikan uji end-to-end pada WhatsApp live. Rendering/ingress live perlu diverifikasi pada session owner yang sedang aktif.
