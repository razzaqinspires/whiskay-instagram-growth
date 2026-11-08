# QA Report — WHISKAY v0.10.19

**Date:** 8 November 2026  
**Source:** `whiskay-v0.10.19`  
**Baileys:** `@whiskeysockets/baileys 7.0.0-rc14`  
**Node runtime target:** 22.5–22.x.

## Automated checks

| Check | Result |
|---|---|
| Node test runner | 194 tests passed, 0 failed (final run recorded in release workspace) |
| JavaScript syntax/source validation | To be recorded after final packaging run |
| Markdown/docs/link/script inventory | To be recorded after final packaging run |
| Source ZIP integrity/extraction | To be recorded after final packaging run |
| Permission audit | To be recorded after final packaging run |

The QA table is finalized with exact command outputs before archive publication.

## Regression scope

- `.remini` parses a command carried in an attached video caption, PTV caption, wrapped document caption, or text reply to a quoted video.
- Direct attachment takes precedence over quoted media; the media descriptor is explicitly supplied to Baileys' bounded downloader.
- `.menu` emits exactly three Mixed Native Flow controls: profile quick reply, channel WebView CTA, and ten recommendation rows. Tests confirm the original incoming WAMessage is supplied as the quote.
- Recommendation ranking is deterministic and tests total hits, recent use, discovery slots, category diversity, exposures, and percentage normalization.
- `.remini`, `.acad`, and `.igcampaign` help/navigation menus expose real command actions without bypassing argument/confirmation requirements.
- Native Flow, legacy ButtonsMessage, hydrated templates, carousel root context, AIRichResponse fields, EventMessage, ProductMessage and PTV/View Once payload structures have local tests.
- KOL.ID test fixture covers page session/CSRF, immediate or queued completion, supported Instagram URL paths, CDN allowlist/redirect validation, and item/total download caps.

## Not covered by local tests

- Real WhatsApp Android/iOS/Web rendering, actual carrier delivery, or client compatibility for CarouselMessage/AIRichResponse/View Once/PTV/Event/Product/Template/legacy ButtonsMessage.
- Live KOL.ID service behavior and live Instagram media availability; adapter logic is exercised with mocked HTTP responses.
- Live Instagram login/growth operations and any real creator engagement.
- ProductMessage visibility on a real Business catalog/chat. The command is gated by owner opt-in and real catalog data.

## Known integration risks

- Baileys is pinned to `7.0.0-rc14`; its protocol layer is version-sensitive. Do not infer delivery from a resolved `relayMessage()` promise alone.
- WhatsApp clients can change Native Flow and AIRichResponse rendering independently of the Baileys package.
- KOL.ID may change dynamic HTML, CSRF token placement, endpoint response shape, or media hostnames; the adapter should fail closed rather than download an unapproved host.
- The channel preview asset is a branded WHISKAY illustration, not a verified snapshot of the channel's current avatar. Set `WHISKAY_CHANNEL_THUMBNAIL_URL` to a genuine authorized HTTPS thumbnail if desired.
