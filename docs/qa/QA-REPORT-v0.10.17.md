# QA Report WHISKAY v0.10.17

<badge>QA PASS</badge>

## Hasil gerbang lokal

- `npm run qa`: **PASS**.
- Configuration validation menggunakan fixture owner/Instagram non-rahasia: **PASS**.
- JavaScript syntax check: **84 file PASS**.
- README/documentation validation: **83 dokumen PASS**, termasuk direct-link index, relative links, release/upgrade docs, script targets, 14-script inventory, dan source-tree hygiene.
- Node Test Runner: **171 PASS, 0 FAIL**.
- Private permission audit: **PASS**; satu file state diperbaiki menjadi mode `0600`.
- Plugin snapshot runtime smoke test: **7 plugin, 51 command** loaded; `.acad` dan `.hotreload` terdaftar.
- Dependency reload test: perubahan file library yang diimpor plugin terdeteksi dan implementasi terbaru dijalankan tanpa restart.
- Missing-library recovery test: plugin yang gagal mengimpor dependency di startup berhasil dimuat setelah file library ditambahkan.
- Registry rollback path: snapshot gagal tidak mengganti registry lama (ditangani melalui transactional reload flow).
- Release ZIP integrity (`unzip -t`): **PASS**, no compressed-data errors.
- Extracted release contains `src/academic/client.mjs`: **PASS**.
- Extracted-source regression tests: **171 PASS, 0 FAIL**.
- Extracted-source syntax check: **84 file PASS**.
- Extracted-source docs check: **83 dokumen PASS**.
- Release package excludes `.env`, `config/app.json`, sessions, private runtime data, `.whiskay-runtime/`, and `node_modules/` as required.

## Perubahan yang diuji khusus

- Watcher per direktori untuk seluruh source tree `src/`, termasuk subfolder baru.
- Versioned ESM source snapshots untuk menyelesaikan cache dependency statis.
- Symlink preservation untuk config, commands/anti-spam, Instagram session module, LID manager, poll cache, growth store, dan referral queue.
- Owner command `.hotreload status|reload` dan alias `.watchstatus`.
- Configuration change is reported as `restart-required` because config is loaded once at process startup.

## Tidak diuji / batas verifikasi

- Pairing WhatsApp dan rendering pesan/button pada WhatsApp Android/iOS secara live.
- Login live Instagram, API Academi.cx, dan provider service calls.
- Performa hot reload pada target host/Termux milik operator.
- Ruang.Email API; source yang diberikan (`https://codeku.theresav.eu/raw/diTyjkv5`) tidak dapat diambil untuk audit, sehingga integrasi sengaja tidak dipasang dan endpoint tidak ditebak.

## Keamanan dan distribusi

Release source tidak mencakup `.env`, `config/app.json`, `session/`, `auth_ig/`, database, inbox dokumen, file media privat, `.whiskay-runtime/`, atau `node_modules/`. Tidak ada kredensial mailbox atau API key yang diminta/disimpan. Tidak menambah dependency npm atau migrasi sesi/database.
