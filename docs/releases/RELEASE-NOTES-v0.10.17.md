# WHISKAY v0.10.17 — Dependency-aware Hot Reload

## Perubahan utama

- Perluas watcher plugin agar memantau subfolder source `src/`, bukan hanya `src/plugins/`.
- Reload library ESM melalui snapshot source berversi agar dependency statis tidak tertahan cache module Node.js.
- Muat ulang seluruh plugin dari satu snapshot agar dependency shared tidak bercampur lintas generasi.
- Pertahankan modul stateful/path-sensitive sebagai symlink ke source runtime aktif: config, command dispatcher, Instagram session module, LID mapping, poll cache, growth store, dan referral queue.
- Tambahkan rollback registry jika ada plugin/dependency yang gagal selama hot reload.
- Tambahkan retry otomatis jika dependency yang hilang dibuat/ditambahkan ke dalam `src/`.
- Tambahkan `.hotreload status|reload` dan alias `.watchstatus` untuk diagnosa/manual reload.
- Tandai perubahan `config.mjs` sebagai restart-required karena config dibaca sekali pada startup.

## Tidak berubah

- Tidak mengubah satu-owner/ satu-session Instagram.
- Tidak menambah automasi follow/unfollow, likes, mass DM, atau engagement palsu.
- Tidak menambah balance/wallet/payment/credit/ledger internal.
- Tidak mengubah session WhatsApp/Instagram atau skema growth database.
- Tidak menambah dependency npm.

## Ruang.Email

Fitur Ruang.Email belum disertakan pada runtime v0.10.17. Link source yang diberikan (`https://codeku.theresav.eu/raw/diTyjkv5`) tidak dapat dibaca oleh retrieval environment pada sesi ini, sementara endpoint, format auth, dan struktur respons tidak dijelaskan dalam pesan. Implementasi REST yang menebak path atau payload berisiko membaca mailbox yang salah atau mengirim email tanpa kontrak API yang benar. Source `.js` aslinya harus disertakan langsung untuk audit endpoint, validasi auth, dan implementasi command. Tidak ada command Ruang.Email palsu/placeholder di release ini.
