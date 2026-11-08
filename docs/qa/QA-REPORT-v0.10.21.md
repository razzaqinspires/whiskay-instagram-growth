# QA Report — WHISKAY v0.10.21

**Date:** 8 November 2026  
**Base:** v0.10.20  
**Scope:** Profile quick reply/menu, Baileys call-link validation, safe local media paths, KOL.ID response-body bounds, and release packaging.

## Automated results

| Check | Result |
|---|---:|
| `node --test` | 201 passed, 0 failed |
| `node scripts/check-source.mjs` | 91 JavaScript files passed syntax validation |
| `node scripts/check-docs.mjs` | 94 Markdown documents indexed; links and release docs valid |
| `node scripts/check-permissions.mjs` | PASS; permission audit clean |
| `scripts/validate-config.mjs` | PASS with temporary fixture configuration; fixture removed afterwards |
| Source tree cleanup | PASS; no `.env` or `config/app.json` in release source tree |
| ZIP integrity / extracted archive | See final release verification after packaging |

## Regression coverage

- `.menu` sends exactly three Native Flow buttons: `.profile` quick reply, the configured channel WebView CTA, and a ten-row recommendation Single Select.
- The actual inbound WAMessage is passed as the quoted message and `pushName` is included in the greeting.
- `.profile` resolves to the active Instagram profile command alias.
- Event-call payloads are blocked when the socket has no `createCallLink` method.
- Product, PTV, View Once, carousel, AIRichResponse and legacy template payload structures are validated without claiming live client rendering.
- KOL.ID URL, status endpoint, redirect allowlist, HTML/JSON/media body bounds, read timeouts, and per-item/total media limits have unit coverage.
- `.remini` tests cover attached-caption video and quoted-video dispatch, including choosing the direct video ahead of an unrelated quoted attachment.
- Message Lab tests cover `.wacapabilities`, button-based `.waform code` prompt/sample, and separate `card` versus `ai-card` transports.
- `.igdl` help/no-argument flows are validated as interactive menus; KOL response body and redirect handling remains bounded.
- Recommendation engine tests cover command hit counts, exposure history, exploration, and deterministic rotation.

## Not verified

No live WhatsApp client rendering or delivery, live Instagram session access, Product catalog account, scheduled call link generation on the user's account, live KOL.ID request, or FFmpeg processing on the owner's Termux device was exercised. Those require the owner's own sessions, account configuration, network, and device. A Baileys relay acknowledgement is not proof of client rendering or recipient delivery.
