# Release Notes — WHISKAY v0.10.19

**Date:** 8 November 2026  
**Release type:** WhatsApp message/media interaction reconstruction + KOL.ID downloader.

## Fixed

- Incoming command text extraction covers video/PTV captions and supported nested message wrappers.
- `.remini` selects an attached video first, then a quoted video, and explicitly passes that descriptor to the bounded Baileys media downloader.
- `.remini help` is a Single Select button menu; status/presets/info remain available as explicit commands.
- `.acad help` and `.igcampaign` root/list flows expose interactive command menus while keeping required arguments, owner checks, and Academi.cx `CONFIRM` gates.
- Main `.menu` uses exactly three Mixed Native Flow actions, preserves the original inbound WAMessage quote and push name, links the supplied WHISKAY channel, and presents ten scored recommendations.
- `.plugins` paginates the full registered command directory using bounded Native Flow sections.

## Added / reconstructed

- Mathematical command recommendation store based on lifetime hits, last-seven-day activity, freshness, category diversity, exploration for low-hit commands, and recommendation exposure history.
- Separate builders/transports for Native Flow, legacy ButtonsMessage, Hydrated Template Buttons, Native Flow card, carousel, AIRichResponse, EventMessage, ProductMessage, Poll, PTV, View Once, contact, location and media.
- Carousel adds root contextInfo and messageContextInfo metadata, card-specific native flow actions, and a normal interactive envelope by default (not View Once).
- AIRichResponse uses the actual `botForwardedMessage.message.richResponseMessage` protobuf branch, typed submessages and unified response data, plus neutral WHISKAY capability/disclaimer metadata. Fixed fake bot JID/forwarded Meta AI identity fields are deliberately omitted.
- KOL.ID downloader plugin `.igdl` (`.kolig`, `.igdownload` aliases) supports public Instagram posts/Reels/stories/carousels using CSRF session, fixed async job API routes, host/redirect validation and bounded media streaming.
- Additional tests for video-caption dispatch, quoted video, button menus, recommendation ranking, carousel context and KOL.ID request/media bounds.

## Important distinctions

- `.waform dialer` / `cta_call` opens the device dialer. `.waform call audio|video` creates a scheduled EventMessage with a call link if Baileys supports it; neither makes an unsolicited direct call.
- `.waform catalog` opens a connected catalog; ProductMessage is separate and requires a real Business catalog and owner opt-in.
- `.waform ai-rich` is protobuf-based AIRichResponse; `.waform card` is a normal Native Flow card. AIRichResponse rendering remains experimental/client-dependent and does not identify as Meta AI.
- View Once/PTV/Event/Product/Carousel/AIRichResponse payload construction is tested locally; live rendering/delivery needs recipient-device testing.
- KOL.ID integration tests use mocked service responses; live API availability was not verified as part of this release.
