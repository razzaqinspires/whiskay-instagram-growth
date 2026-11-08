# QA Report — WHISKAY v0.10.20

**Date:** 8 November 2026  
**Baileys:** `@whiskeysockets/baileys 7.0.0-rc14`  
**Runtime target:** Node.js 22.5–22.x

## Automated checks

The final exact counts are recorded after syntax, docs, test, archive extraction, and permission checks.

| Check | Expected evidence |
|---|---|
| Unit/regression tests | Node `node --test`; includes new `.waform help` and `.igdl help` button tests |
| Source validation | All maintained JavaScript files parse |
| Docs validation | All docs are indexed and links/script inventory resolve |
| Release archive | `unzip -t` and tests from extracted source |
| Security permissions | Repo permission auditor passes; no live `.env`/auth material packaged |

## Regression scope

- Attached video caption and quoted video command dispatch.
- Baileys media wrapper unwrapping, PTV, quoted media and download byte caps.
- `.menu` exactly three mixed buttons, channel WebView, actual quoted WAMessage and ten recommendations.
- `.waform help` and Message Lab button navigation; AIRichResponse alias distinct from Native Flow card.
- `.igdl` help navigation and URL input prompt.
- KOL.ID session/CSRF fixture, fixed async status endpoint, CDN host/redirect allowlist, and download caps.
- Carousel, AIRichResponse, EventMessage, ProductMessage, PTV, View Once, Poll, contact/location and legacy button payload structures.

## Not covered

- Live WhatsApp UI rendering/delivery on Android/iOS/Web.
- Live KOL.ID API availability or Instagram post visibility.
- Any actual third-party Instagram login or engagement automation.
- ProductMessage rendering for a real Business catalog unless the owner has enabled it with genuine product metadata.
