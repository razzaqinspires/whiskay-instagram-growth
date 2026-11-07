# Native Flow WHISKAY

Native Flow menyediakan navigasi WhatsApp interaktif untuk command yang memang tersedia di plugin registry. Semua callback dikonversi menjadi command teks dan melewati parser, anti-spam, mode, serta otorisasi owner yang sama.

## Panel Instagram

`.igpanel` menampilkan statistik tersimpan, jumlah campaign, jumlah konten dianalisis, dan quick reply ke `.igstats`, `.igservices`, serta `.igcampaign list`. Fallback teks juga disediakan jika client tidak mendukung interactive message.

## Keamanan

Tombol tidak melewati pemeriksaan owner. Pada mode self, owner tetap satu-satunya pengguna yang berwenang. `allowGroups` hanya berlaku untuk owner ketika mode self. Tidak ada tombol untuk saldo, order, wallet, payment, atau pembelian layanan.
