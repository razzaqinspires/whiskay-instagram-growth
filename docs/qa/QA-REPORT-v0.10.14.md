# QA Report — WHISKAY v0.10.14

Tanggal: 7 November 2026

## Scope test

- Native Flow button validation: quick reply, CTA URL, WebView URL, CTA Copy, CTA Call, single select/list, CTA Catalog.
- Legacy Template Buttons payload: bounded quick reply, CTA URL, CTA Call.
- Carousel validation and text fallback.
- Native poll payload, option limits, and duplicate choice validation.
- Interactive response extraction from common Baileys wrappers.
- Media wrapper normalization, image/video/PTV/audio/document/sticker, quoted media, size-capped stream download, and structured message classification.
- Poll creation cache and poll decryption `getMessage` bridge.
- Video-HD filter/limits and graceful missing-binary status.
- Plugin registry for `.remini`, `.poll`, `.mediainfo`, `.waform`, `.wacapabilities`.
- Academi.cx path traversal validation ordering.

## Results

Hasil angka akhir dimasukkan setelah test suite lengkap, syntax/source check, docs check, permission audit, dan archive extraction diuji pada source tree dan ZIP release. Tes tidak mengirim media WhatsApp nyata, tidak melakukan relay ke WhatsApp, tidak memakai API key Academi.cx, dan tidak menguji encoding video produksi apabila FFmpeg/FFprobe tidak tersedia di runner.

## Batas verifikasi live

- Perangkat/client WhatsApp Android, iOS, dan Web belum diuji langsung.
- CTA Catalog bergantung pada katalog akun WhatsApp Business yang terhubung.
- Native Flow/Carousel/WebView dapat berubah mengikuti versi aplikasi WhatsApp.
- `.remini` adalah FFmpeg lokal, bukan AI Remini cloud.
- Baileys adalah library tidak resmi; koneksi ke WhatsApp dapat berubah jika protokolnya diperbarui.
