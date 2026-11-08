# Release Notes — WHISKAY v0.10.20

**Date:** 8 November 2026  
**Release type:** Media ingress correction, button navigation, and message transport clarification.

## Fixed

- `.remini` caption and quoted-video dispatch remains explicit: a direct video attachment is preferred, otherwise the quoted video descriptor is used. The descriptor is handed to the bounded Baileys downloader.
- `.waform help` now opens the interactive Message Lab instead of a text-only help reply. Its body carries the full command syntax while the Single Select rows navigate to each supported demo.
- `.igdl` and `.igdl help` now open an interactive command menu; `.igdl` without a URL prompts for the correct URL syntax and offers navigation buttons.
- Corrected the generic message router alias: `ai-card`, `ai-rich`, and `ai-rich-card` resolve to AIRichResponse; `card` continues to use a standard Native Flow card.

## Format distinctions

- `.waform mixed`: quick reply + channel WebView CTA + ten data-ranked command recommendations.
- `.waform card`: ordinary Native Flow card; `.waform ai-rich` / `.waform ai-card`: AIRichResponse protobuf, using generic WHISKAY attribution rather than pretending to be Meta AI.
- `.waform template`: Hydrated Template Buttons legacy format; `.waform legacy-buttons`: legacy ButtonsMessage. They are not aliases for Mixed Native Flow.
- `.waform catalog`: CTA to a connected Business catalog; `.waform product`: actual ProductMessage and requires real Business/catalog data and owner opt-in.
- `.waform call`: scheduled EventMessage with optional Baileys call-link creation; `.waform dialer`: OS phone dialer CTA, not an immediate WhatsApp call.
- `.waform carousel`: `InteractiveMessage.carouselMessage` with root context/device metadata; it is not a Native Flow list.
- `.waform media`: PTV, view-once image/video, voice/PTT and GIF transports; media files must be local and bounded.

## KOL.ID downloader

`.igdl <instagram_url>` continues to use KOL.ID's CSRF/session + fixed async API flow, strict Instagram URL validation, status endpoint pinning, CDN/redirect allowlisting, and bounded streaming. Help now has button navigation. No Instagram account login or engagement automation is performed.

## Validation boundary

Local tests validate payload construction, menu actions, media selection, and network bounds. Real Android/iOS/Web rendering or delivery for CarouselMessage, AIRichResponse, EventMessage, ProductMessage, PTV, View Once, and legacy buttons has not been verified on a live WhatsApp account. The live KOL.ID API is not called during automated tests.
