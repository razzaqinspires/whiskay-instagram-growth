# QA Report — WHISKAY v0.10.16

Tanggal: 7 November 2026

## Automated checks

| Check | Result |
|---|---|
| `node --test` | PASS — 169 tests, 0 failures |
| `node scripts/check-source.mjs` | PASS — 84 JavaScript files syntax-checked |
| `node scripts/check-docs.mjs` | PASS — 78 documentation files directly indexed; links and inventory valid |
| `node scripts/check-permissions.mjs` | PASS — permission audit completed; private file/directory modes normalized where required |
| FFmpeg integration | PASS — FFmpeg/FFprobe 7.1.5 processed a 320×180, 2-second synthetic clip through all four presets; each output reached 640×360 and retained audio |
| Release ZIP integrity | PASS — `unzip -t` passed; extracted source re-ran 169 tests and both source/docs checks |

## Coverage added in v0.10.16

- Outgoing message type selection, aliases, and safe default transports.
- Native Flow, quick reply, CTA URL/WebView/Copy/Call/Catalog, single-select lists, hydrated template compatibility, rich cards, carousels, and poll routing.
- Media routing for image, video/PTV, audio/voice, document, sticker, and GIF; URL-based outgoing media is rejected by the generic router.
- Contact/vCard validation, static coordinate validation, text table/code/link fallbacks, and rejection of generic fake product/payment/status/live-location/AI-forwarding payloads.
- Incoming structured response parsing and owner-gated command re-entry.
- Video HD preset validation, metadata inspection buffer validation, FFmpeg/FFprobe availability handling, and output size/resolution checks.

## Not verified by automated tests

- Actual message rendering on live WhatsApp Android, iOS, Web, or multi-device clients.
- Native Flow/WebView/carousel/CTA availability for the owner's WhatsApp account or specific client version.
- Live poll vote decryption with an actual WhatsApp poll.
- Encoding performance, memory pressure, and media compatibility on the owner's target Android/Termux or production host. The local Linux FFmpeg/FFprobe integration path was exercised with a synthetic clip.
- True Remini cloud AI processing. The `.remini` feature is local FFmpeg resizing/filtering and is not the Remini application or an AI enhancement API.

## Operational limits and safeguards

- Video HD: 64 MiB input, 128 MiB output, up to five minutes, maximum source dimension 3,840 px, and bounded FFmpeg execution time. Temporary work directories are private and removed after processing.
- Outgoing media through the generic router requires Buffer or local path; automatic remote URL fetching is disabled.
- Product messages are not synthesized. They require genuine WhatsApp Business catalog/product data and an eligible account/client flow.
- AI-assisted cards are standard Native Flow cards and do not claim Meta AI identity or forwarded-bot provenance.
- Serializer source files uploaded by the owner remain preserved as vendor reference files and are not blindly executed as CommonJS extensions.

## Result

Automated unit/regression tests and JavaScript syntax validation passed. The complete `npm run qa` pipeline passed using temporary non-secret fixture configuration. A real FFmpeg/FFprobe 7.1.5 integration test passed for all four presets on a generated 320×180 test clip, preserving its audio and producing 640×360 MP4 outputs. The clean source archive passed `unzip -t`; the extracted archive independently passed all 169 tests, 84-file syntax validation, and the 78-document README index check. The archive contains no `.env` or `config/app.json`. Live WhatsApp compatibility and performance on the owner's Android/Termux device remain manual tests.
