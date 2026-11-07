# Content-to-Follower Intelligence — v0.10.9

## Tujuan

Content-to-Follower Intelligence menghubungkan performa setiap konten Instagram dengan profile visits dan follows yang dilaporkan oleh Instagram Insights. Modul ini menjawab pertanyaan operasional:

- Konten mana yang menghasilkan kunjungan profil paling banyak?
- Dari profile visits yang tercatat, berapa banyak follows yang tercatat?
- Format Reel, carousel, post, story, video, atau live mana yang paling efisien berdasarkan data yang dimasukkan?
- Tema konten mana yang memiliki efisiensi follow terbaik dalam data yang tersedia?
- Apakah konten menghasilkan engagement (likes, comments, shares, saves) sekaligus pergerakan ke profil dan follow?

Modul tidak melakukan scraping, tidak menjalankan follow/unfollow, dan tidak menarik data Instagram secara otomatis. Metrik dimasukkan oleh owner dari Instagram Insights per konten.

## File dan tanggung jawab

| Lokasi | Tanggung jawab | Alasan |
|---|---|---|
| `src/growth/content-intelligence.mjs` | Normalisasi metrik, kalkulasi rasio, aggregate weighted, ranking, rekomendasi | Pure domain logic yang mudah diuji tanpa jaringan atau session |
| `src/growth/store.mjs` | Penyimpanan konten, validasi URL, association campaign, histori snapshot | Menjaga integritas state lokal dan migrasi backward-compatible |
| `src/plugins/instagram-growth.mjs` | Command `.igcontent` | Interface WhatsApp untuk input dan laporan |
| `test/content-intelligence.test.mjs` | Tes kalkulasi, persistensi, command, invalid data | Menangkap regresi perhitungan dan validasi input |

## Command

### Menambahkan / memperbarui performa konten

```text
.igcontent add <campaign-id|->|<label>|<url>|<format>|<tema>|<reach>|<impressions>|<profile_visits>|<follows>|<likes>|<comments>|<shares>|<saves>
```

Contoh:

```text
.igcontent add -|Tutorial Reels|https://www.instagram.com/reel/ABC123/|reel|coding tutorial|12500|18000|750|82|640|35|90|120
```

Jika konten bagian dari campaign yang sudah ada, ganti `-` dengan campaign ID. Gunakan `-` bila tidak terkait campaign tertentu.

Format konten yang diterima: `reel`, `post`, `story`, `video`, `carousel`, `live`. URL wajib HTTPS dengan host `instagram.com` atau `www.instagram.com` dan path media `/p/`, `/reel/`, `/tv/`, atau `/stories/<username>/<id>/`. Query tracking pada URL dibuang saat disimpan.

Semua delapan metrik wajib diisi sebagai integer nol atau lebih:

| Field | Makna |
|---|---|
| `reach` | Akun unik yang dijangkau oleh konten |
| `impressions` | Total tayangan/paparan konten |
| `profile_visits` | Kunjungan profil yang dikaitkan dengan konten dalam Insights |
| `follows` | Follow yang ditampilkan pada Insights konten |
| `likes` | Likes konten |
| `comments` | Komentar konten |
| `shares` | Shares konten |
| `saves` | Saves konten |

Masukkan data dari satu konten dan satu periode Insights yang konsisten. Jangan mencampur total account Insights dengan metrik media individual.

### Melihat konten

```text
.igcontent list
.igcontent list 30
.igcontent report CNT_CONTENT_ID
```

`list` menampilkan konten terbaru. `report` menampilkan seluruh metrik terakhir, rasio konversi, campaign terkait, waktu update, dan jumlah snapshot.

### Membandingkan konten

```text
.igcontent compare
```

Laporan membandingkan aggregate menurut format dan tema, serta menampilkan hingga lima konten dengan follows per 1.000 reach tertinggi. Pengelompokan menggunakan jumlah metrik, kemudian menghitung rasio dari total (weighted aggregation). Sistem tidak menghitung rata-rata sederhana dari persentase tiap posting karena ukuran jangkauan antarpost dapat sangat berbeda.

## Rumus

Misalkan `R = reach`, `P = profile visits`, `F = follows`, `E = likes + comments + shares + saves`.

| Metrik | Rumus |
|---|---|
| Profile visit rate | `P / R × 100%` |
| Visit-to-follow conversion | `F / P × 100%` |
| Reach-to-follow rate | `F / R × 100%` |
| Engagement rate | `E / R × 100%` |
| Save rate | `saves / R × 100%` |
| Share rate | `shares / R × 100%` |
| Follows per 1,000 reach | `F / R × 1.000` |
| Impressions per reach | `impressions / R` |

Jika denominator nol, hasil disajikan sebagai `n/a`; pembagian dengan nol tidak menghasilkan `Infinity` atau `NaN` pada laporan.

## Cara membaca laporan

- **Reach tinggi, profile visits rendah:** evaluasi hook, relevansi CTA, dan alasan untuk membuka profil. Jangan mengubah CTA menjadi clickbait.
- **Profile visits tinggi, follows rendah:** evaluasi bio, pinned content, positioning niche, bukti kualitas, dan konsistensi janji akun.
- **Engagement tinggi:** bedakan jenis interaksi; saves/shares dapat membantu mengidentifikasi konten yang berguna, tetapi tidak otomatis membuktikan follow intent.
- **Follows per 1.000 reach tinggi:** jadikan konten sebagai kandidat eksperimen ulang, bukan benchmark universal. Validasi dengan beberapa posting dan periode yang konsisten.
- **Format/tema pemenang:** aggregate weighted lebih informatif daripada satu outlier, tetapi sampel harus cukup dan distribusi reach perlu diperhatikan.

## Persistensi dan batas

Database `data/instagram-growth.json` naik dari envelope version 2 ke version 3. Migrasi dilakukan saat database dibaca/ditulis: semua properti lama dipertahankan dan `contentPosts` diinisialisasi sebagai array kosong jika belum ada.

- Maksimal 500 URL konten unik.
- URL yang sama memperbarui record konten yang sama dan menambahkan snapshot terbaru, bukan membuat duplikat record.
- Maksimal 90 snapshot per konten.
- ID konten berbentuk `CNT...` dan dapat dipakai pada `.igcontent report`.
- Bila konten sudah terkait ke campaign, pengiriman ulang dengan campaign ID yang berbeda ditolak.
- Tidak ada perubahan file session, data Instagram stats lama, atau SQLite queue.

## Batas atribusi

Analitik ini hanya setepat data yang dimasukkan. Gunakan angka `follows` yang benar-benar ditampilkan sebagai per-content metric dalam Instagram Insights. Kenaikan follower total account (`.iggrowth`) tidak boleh disalin sebagai follows ke setiap post. Satu follower dapat melihat beberapa konten sebelum mengikuti; laporan ini adalah indikator operasional, bukan atribusi kausal.

WHISKAY tidak memberikan jaminan jumlah follower, tidak mengirim follow otomatis, dan tidak menggunakan endpoint pihak ketiga untuk memperbesar angka.

## QA

`test/content-intelligence.test.mjs` menguji kalkulasi rasio, weighted comparison format/theme, validasi URL dan angka, link campaign, deduplication URL, snapshot history, dan command `add`/`compare`. Jalankan `npm test` untuk keseluruhan suite.
