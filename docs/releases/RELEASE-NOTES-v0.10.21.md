# Release Notes — WHISKAY v0.10.21

**Date:** 8 November 2026  
**Release type:** Profile quick reply, call-link validation, and bounded downloader streams.

## Menu and command discovery

- `.profile` is now an alias for `.igprofile`, so the main menu's first Quick Reply resolves to the requested command name while continuing to read the single active Instagram session.
- `.menu` remains exactly three Mixed Native Flow actions: Profile Quick Reply, the configured WhatsApp Channel WebView CTA, and a ten-row Single Select recommendation list.
- The menu keeps the original inbound WAMessage as the actual quote, uses the incoming `pushName` in the greeting, and adds an `externalAdReply` channel preview. The bundled thumbnail is a WHISKAY-designed preview, not a verified channel-avatar download.
- The recommendation engine continues to use actual command hits, seven-day trend, freshness, exploration, exposure history, and category diversity. `.waform list` no longer double-counts recommendation exposure.

## Baileys message transport

- Scheduled audio/video EventMessage now requires `sock.createCallLink`; WHISKAY refuses to send an event-call payload if the Baileys socket cannot create a real join token.
- `.waform dialer` remains a separate CTA Call action that opens the device phone dialer. It is not a WhatsApp call.
- Product/media local file resolution now checks real paths and rejects symlinks escaping the configured media directory.
- PTV demo input is restricted to MP4; voice/PTT demo input is restricted to OGG/Opus to avoid pretending arbitrary MP3 files are valid voice-note payloads.

## KOL.ID downloader

- HTML, JSON, and media response bodies now use explicit byte limits and body-read timeouts in addition to the existing request timeout.
- The downloader retains Instagram URL validation, fixed KOL.ID status endpoint validation, HTTPS/CDN allowlists, redirect revalidation, 40 MiB per-media and 64 MiB total limits, and ten-item maximum.

## Command discovery and regression coverage

- `.wacapabilities`, `.waform help`, and `.igdl help` open navigable Single Select menus. `.waform code` without arguments provides a buttonized prompt; the `sample` action sends a real AIRichResponse code block.
- The `card` demo remains a Native Flow card; `ai-card` is a distinct AIRichResponse protobuf.
- Final automated regression suite: 201 passed, 0 failed; 91 JavaScript files pass syntax validation; 94 Markdown documents are indexed and validated; permission audit passed.

## Verification boundary

The automated suite validates command dispatch, payload construction, URL/path validation, call-link gating, KOL response parsing and byte/time limits. It does not prove live WhatsApp client rendering/delivery or current KOL.ID service availability. Carousel, AIRichResponse, ProductMessage, EventMessage, PTV, View Once and WebView must still be checked on the actual receiving WhatsApp clients.
