# Naskah Riset Asli dari Pengguna

Judul: **Analisis Arsitektur Rekayasa Sistem SMM Panel dan Mekanisme Otomasi Pertumbuhan Media Sosial**

Dokumen ini menyimpan naskah riset yang diberikan pengguna pada percakapan tanggal 4 November 2026. Klaim mengenai sistem internal situs yang disebut di dalamnya adalah isi sumber, bukan hasil audit independen kami.

## Domain Ekosistem SMM Panel dan Paradigma Operasional

Industri layanan pemasaran media sosial atau *Social Media Marketing* (SMM) Panel bertumpu pada jaringan infrastruktur perangkat lunak terdistribusi yang menyediakan interaksi artifisial seperti pengikut (*followers*), suka (*likes*), tayangan (*views*), dan komentar secara otomatis. Domain-domain yang dianalisis, mencakup takipcimx.net, takipcikrali.com, takipciking.com, takipcipanelin.com, dan takipcimx.com, mewakili ekosistem otomasi pertumbuhan media sosial yang beroperasi secara ekstensif pada kawasan regional Turki dan pasar global. Secara teknis, platform-platform ini menerapkan dua paradigma operasi utama, yaitu sistem kolam akses terpusat (*Havuz Sistemi*) dan sistem jaringan pengecer berbasis API (*API Reseller Network*).

Istilah *Havuz Sistemi* atau sistem kolam merujuk pada arsitektur pengumpulan token otentikasi. Pada model ini, pengguna mendaftarkan akun media sosial mereka untuk mendapatkan kredit atau pengikut gratis. Ketika pengguna melakukan otentikasi pada platform tersebut, sistem menangkap dan menyimpan sesi otorisasi pengguna seperti sessionid, *cookies*, dan *device token*. Akses otorisasi yang terkumpul di dalam basis data terpusat dijadikan sebagai agen pekerja (*worker nodes*) atau pasokan akun otomatis. Skrip latar belakang kemudian memanggil token sesi ini secara terprogram untuk melakukan tindakan mengikuti (*follow*) atau menyukai (*like*) akun target milik pembeli tanpa memerlukan interaksi manual dari pemilik akun asli.

Seiring ketatnya proteksi otentikasi media sosial, sebagian besar platform transisi ke model *SMM Reseller Network*. Pada model ini, antarmuka depan (*front-end*) terhubung langsung ke penyedia grosir (*upstream providers*) melalui antarmuka pemformatan aplikasi (*Application Programming Interface* / API) terstandarisasi.

| Nama Domain Target | Jenis Layanan Utama | Model Operasional Utama | Target Pasar | Implementasi Antarmuka |
|---|---|---|---|---|
| takipcimx.net / .com | Otomasi Pengikut & Akselerasi Interaksi | *Havuz Sistemi* & Integrasi API v2 | Domestik & Internasional | Accelerated Mobile Pages (AMP) |
| takipcikrali.com | Penjualan Layanan Sosial Media Grosir | Pengecer SMM Panel (Reseller) | Domestik & Regional | Responsive Web Framework |
| takipciking.com | Panel Ketersediaan *Follower* & *Like* | Pengecer SMM Panel (Reseller) | Domestik & Regional | Responsive Web Framework |
| takipcipanelin.com | Platform Penyedia & Manajemen Panel | Penyedia Skrip & *Main Provider API* | Pengembang & Pemilik Panel | Admin Dashboard & API Engine |

Integrasi teknologi *Accelerated Mobile Pages* (AMP) pada situs seperti takipcimx.net dan takipcimx.com bertujuan mengoptimalkan peringkat pada mesin pencari (*Search Engine Optimization* / SEO) serta mempercepat pemuatan halaman pada perangkat seluler. Arsitektur antarmuka yang ringan ini memungkinkan penanganan beban lonjakan trafik saat pengguna melakukan pemesanan instan.

## Komponen Arsitektur Perangkat Lunak dan Inovasi Infrastruktur

Platform SMM Panel modern beroperasi menggunakan arsitektur perangkat lunak multilapis (*multi-tier architecture*). Sistem ini mengintegrasikan komponen antarmuka depan, kerangka kerja *backend*, antrean tugas pemrosesan *asynchronous*, serta lapisan komunikasi API hulu.

| Lapisan Arsitektur | Teknologi / Perangkat Lunak Utama | Fungsi Utama Sistem |
|---|---|---|
| **Backend Framework** | PHP (Laravel 11/12, Symfony) atau Node.js (Express, NestJS) | Logika bisnis, manajemen dompet (*ledger*), dan sinkronisasi otentikasi. |
| **Database Engine** | MySQL 8.0+, MariaDB 10.3+, atau PostgreSQL | Penyimpanan data pengguna, riwayat transaksi, katalog layanan, dan status pesanan. |
| **Caching & Queue System** | Redis, RabbitMQ, Laravel Horizon | Pengelolaan antrean tugas pemrosesan, pembatasan frekuensi (*rate limit*), dan *caching* status. |
| **Proxy Engine** | Residential Rotating Proxies (SOCKS5/HTTP) | Pengalihan IP untuk menghindari pemblokiran *rate limit* dari platform media sosial target. |
| **Job Scheduler** | Background Workers & Cron Jobs | Penjadwalan pengecekan status pesanan, *drip-feed*, serta proses pengisian ulang (*refill*). |
| **Payment Gateway** | Payeer, CoinPayments, Stripe, PayPal, Binance Pay | Pemrosesan pengisian saldo (*wallet top-up*) dan agregasi transaksi finansial. |

Penggunaan arsitektur antrean berbasis Redis dan *worker process* menggantikan ketergantungan pada *cron job* konvensional. Pada arsitektur SMM Panel skala besar, *cron job* linier mengalami keterbatasan pemrosesan (*queue bottleneck*) ketika menangani ribuan transaksi per detik. Sistem *worker* terdistribusi memungkinkan penanganan eksekusi pesanan, penyeimbangan beban (*load balancing*), dan pembaruan status pesanan secara simultan.

Keberhasilan transmisi data pada platform ini sangat bergantung pada penggunaan *Residential Rotating Proxies*. Alamat IP perumahan (*residential IP*) membuat lalu lintas permintaan dari server panel menyerupai koneksi pengguna seluler asli yang berasal dari penyedia layanan internet (*Internet Service Provider* / ISP) resmi, sehingga menekan risiko pemicuan batas deteksi anomali pada sistem keamanan media sosial.

## Mekanisme Eksekusi Otomasi Pengiriman Follower

Penambahan kuantitas pengikut atau interaksi ke akun target media sosial terjadi melalui dua jalur eksekusi teknis: pemrosesan API jaringan penyedia (*Upstream API Reseller Routing*) dan eksekusi langsung API privat seluler (*Direct Mobile Private API Automation*).

Alur pemrosesan pesanan dimulai ketika pengguna mengirimkan permintaan melalui antarmuka SMM Panel. Permintaan ini diteruskan ke modul pembagi *API v2 Dispatcher Router*. Dari titik ini, sistem membagi jalur eksekusi menjadi dua: meneruskannya ke penyedia grosir hulu (*Upstream SMM API*) atau mengeksekusinya secara internal via *Mobile Private API Engine* menggunakan pustaka seperti instagrapi atau instagram-private-api. Sebelum permintaan privat dikirim ke platform media sosial target, modul generator enkripsi HMAC-SHA256 menyuntikkan tanda tangan kriptografi pada beban kerja (*payload*), yang kemudian ditransmisikan melalui jaringan *Residential Rotating Proxies*.

### Alur Eksekusi Upstream SMM API Provider Routing

Sebagian besar SMM Panel komersial bertindak sebagai pengecer (*reseller*) dalam jaringan penyedia bertingkat. Saat pesanan diterima, sistem *backend* mengeksekusi pemanggilan HTTP POST ke penyedia hulu (*Upstream Provider*) menggunakan spesifikasi **SMM API v2 Standard**.

Sistem memverifikasi saldo dompet pengguna dan kecukupan saldo akun pada penyedia hulu. Permintaan eksekusi dikirimkan membawa ID Layanan, URL target, dan kuantitas pesanan. Penyedia hulu membaca data profil target via API, mencatat jumlah pengikut awal (*start count*), dan memasukkan tugas ke antrean bot pemroses. Penyedia hulu secara berkala memperbarui status pesanan (*Pending*, *In Progress*, *Completed*, *Partial*, *Canceled*), yang kemudian ditagih via pemungutan status (*status polling*) oleh skrip panel pengecer.

### Alur Eksekusi Direct Mobile Private API Automation

Pada level penyedia utama (*main provider*) atau platform yang mengoperasikan *Havuz Sistemi*, eksekusi dilakukan langsung terhadap titik akhir privat (*private endpoints*) aplikasi seluler media sosial tanpa antarmuka berbasis peramban konvensional.

Proses diawali dengan otentikasi dan manajemen sesi. Akun-akun pekerja (*bot accounts* atau *pool accounts*) melakukan otentikasi ke endpoint otorisasi internal seperti `POST /api/v1/accounts/login/`. Sesi otorisasi berupa *cookies*, token CSRF, dan kunci sesi (sessionid) disimpan dalam format serialisasi JSON atau basis data Redis.

Selanjutnya, sistem melakukan penandatanganan beban kerja kriptografi (*Payload Signing*). Permintaan ke endpoint privat seluler memerlukan beban kerja terenkripsi. Beban kerja JSON ditandatangani menggunakan fungsi HMAC-SHA256 dengan kunci rahasia aplikasi (*app secret key*). Hasil penandatanganan dikirimkan dalam format string `signed_body=<signature>.<payload_json>`.

Setiap permintaan HTTP menyertakan simulasi sidik jari perangkat seluler (*device fingerprinting*). Header wajib yang disuntikkan meliputi X-IG-App-ID, X-IG-Capabilities, X-Bloks-Version-Id, User-Agent seluler otentik, dan ID Unik Perangkat (android_id, family_device_id). Untuk mengeksekusi penambahan pengikut, skrip memanggil endpoint relasi seperti `POST /api/v1/friendships/create/{user_id}/`.

Untuk mengelabui sistem deteksi berbasis kecerdasan buatan, mesin otomasi mengirimkan telemetri analitis latar belakang (*scribe/analytics telemetry*) secara berurutan. Pengiriman data mencakup jeda waktu pembacaan (*dwell time* antara 1.5 hingga 4.5 detik) dan penarikan data umpan (*feed prefetch*) sebelum eksekusi tindakan perintah *follow* dilakukan.

## Analisis Pustaka dan Modul Perangkat Lunak Utama

| Nama Modul / Pustaka | Bahasa / Kerangka Kerja | Fungsi Utama dalam Sistem | Karakteristik Teknis |
|---|---|---|---|
| **instagrapi** | Python 3.11+ | Client SDK API Privat Instagram (Mobile/Web). | Penanganan sesi, 2FA, *challenge resolver*, MQTT, Pydantic response models. |
| **aiograpi** | Python (AsyncIO) | Varian *asynchronous* dari instagrapi. | Eksekusi tugas skala besar berbasis *non-blocking I/O* terdistribusi. |
| **instagram-private-api** | Node.js / TypeScript | Client SDK API Privat Android Instagram. | Pemodelan *state management*, simulasi *pre-login flow*, eksekusi feeds/repositories. |
| **Laravel Horizon** | PHP / Laravel | Dasbor pemantauan dan pengelola antrean Redis. | Manajemen *queue workers*, *auto-scaling*, serta penanganan *failed jobs*. |
| **SMM API v2 Specification** | Protokol HTTP JSON | Standar antarmuka integrasi antar-panel SMM. | Format kompatibel PerfectPanel untuk agregasi layanan grosir. |

Modul privat tersebut mengabstraksi rantai enkripsi kompleks, pembuatan HMAC-SHA256, simulasi *handshake* TLS, dan algoritma *device attestation* sehingga pengembang dapat menjalankan perintah otorisasi secara terprogram.

## Cetak Biru Arsitektur Pembuatan Fitur SMM Panel

Pembangunan fitur SMM Panel mandiri memerlukan perancangan mesin status pesanan (*Order State Machine*), implementasi endpoint API terstandarisasi, dan penerapan batas aman otomasi.

### Perancangan Mesin Status Pesanan

Proses alur data pesanan dikendalikan oleh *Order State Machine* untuk menjamin konsistensi data dompet dan penanganan kegagalan.

Tahap awal dimulai dari status **Submitted**, di mana pesanan diterima dari pengguna atau API internal, kemudian sistem melakukan validasi format URL target dan mengecek kecukupan saldo. Jika validasi gagal, pesanan beralih ke status **Rejected**. Jika lolos, pesanan masuk ke status **Pending** saat data didaftarkan ke dalam antrean tugas Redis.

Ketika *queue worker* mulai mengeksekusi panggilan API ke penyedia hulu atau bot internal, status diperbarui menjadi **In Progress**. Jika seluruh kuantitas pengikut berhasil terkirim, pesanan dinyatakan **Completed**. Jika layanan terhenti sebelum target terpenuhi, pesanan berpindah ke **Partial**. Pada kondisi ini, sistem menghitung sisa pengikut yang belum terkirim dan mengembalikan saldo secara otomatis (*pro-rata refund*) ke akun pengguna. Apabila terjadi kegagalan sistem atau penolakan akun target, pesanan berubah menjadi **Canceled** dengan pengembalian dana penuh.

### Spesifikasi Antarmuka SMM API v2 Standard

Implementasi komunikasi dengan penyedia hulu atau antarmuka yang disediakan untuk pengecer lain mengikuti protokol SMM API v2. Seluruh permintaan dikirimkan melalui protokol HTTPS POST ke satu titik akhir endpoint.

| Parameter Action | Parameter Input Wajib | Struktur Output JSON Utama | Spesifikasi Fungsi |
|---|---|---|---|
| services | key | Array berisi service, name, rate, min, max | Mengambil katalog layanan, harga grosir, dan batasan pesanan. |
| add | key, service, link, quantity | Object berisi order ID unik | Mengirimkan pesanan baru ke sistem backend pemrosesan. |
| status | key, order atau orders | Object berisi charge, start_count, status | *Polling* status pesanan (mendukung hingga 100 ID dalam satu panggilan). |
| balance | key | Object berisi balance, currency | Mengambil informasi sisa modal pada akun penyedia. |
| refill | key, order | Object berisi refill ID unik | Mengajukan permintaan pengiriman ulang untuk pesanan yang berkurang. |

Setiap transaksi pengiriman pesanan disarankan memanfaatkan kunci idempotensi (*idempotency key*) pada header HTTP untuk menghindari duplikasi pesanan apabila terjadi koneksi terputus di tengah pemrosesan.

### Parameter Keamanan dan Pembatasan Frekuensi Akun Bot

Jika fitur dikembangkan menggunakan akun pekerja internal (*direct bot automation*), penerapan batas frekuensi (*rate limiting*) wajib dikonfigurasi guna menghindari deteksi pemblokiran massal.

| Jenis Tindakan Otomasi | Batas Maksimum Operasional | Pengaturan Jeda Waktu (*Random Delay*) |
|---|---|---|
| **User Follow** | 20 - 30 tindakan / jam per akun | Random delay 120 - 240 detik antar tindakan |
| **Media Like** | 50 - 60 tindakan / jam per akun | Random delay 30 - 60 detik antar tindakan |
| **Story View** | 200 - 500 tindakan / jam per akun | Pemrosesan kolektif berbasis *batching* |
| **Direct Message** | 5 - 10 tindakan / jam per akun | Dibatasi khusus akun dengan riwayat interaksi aktif |

Setiap akun pekerja dipetakan secara terisolasi dengan satu alamat IP proxy kediaman (*static residential IP*) dan satu profil sidik jari perangkat seluler unik. Perubahan alamat IP atau parameter perangkat yang terlalu sering pada akun yang sama akan memicu verifikasi tantangan keamanan (*Challenge Required*).

## Kesimpulan dan Rekomendasi Strategis

Otomasi pada ekosistem SMM Panel beroperasi melalui dua rantai utama: jaringan pengecer berbasis standar SMM API v2 atau rekayasa balik protokol seluler (*Mobile Private API*) yang memanfaatkan teknik penandatanganan HMAC-SHA256, penyuntikan header perangkat, dan pengalihan jaringan proxy perumahan.

Untuk membangun fitur SMM Panel yang stabil dan berkinerja tinggi, beberapa langkah rekayasa berikut perlu diterapkan:

1. Adopsi kerangka kerja pemrosesan antrean berbasis Redis (seperti Laravel Horizon atau Celery/FastAPI AsyncIO) untuk menangani eksekusi tugas secara non-blocking dan terdistribusi.
2. Gunakan integrasi SMM API v2 ke penyedia grosir hulu pada tahap awal produksi guna menekan beban biaya infrastruktur dalam mengelola akun pekerja mandiri.
3. Terapkan mesin status pesanan (*order state machine*) yang menangani kasus gagal kirim secara otomatis dengan fungsi pengembalian dana parsial (*partial refund*) dan pengecekan kunci idempotensi.
4. Apabila mengeksekusi otomasi langsung, isolasi setiap akun pekerja dalam kombinasi proxy kediaman statis dan pertahankan status sesi terenkripsi untuk meminimalkan pemicuan tantangan verifikasi ulang.

---

## Catatan Rekayasa dan Keamanan

Bagian mengenai pengumpulan session/cookie akun pihak lain, pool akun, endpoint privat untuk aksi follow/like/view/DM, pemalsuan sidik jari perangkat, telemetri untuk mengelabui deteksi, serta proxy untuk menghindari rate limit dicatat sebagai temuan/hipotesis riset, tetapi tidak diimplementasikan. Implementasi v0.8.0 memakai jalur provider yang ditinjau dan hanya untuk kampanye promosi autentik; tidak memproses follower atau engagement artifisial.
