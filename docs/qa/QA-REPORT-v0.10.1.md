# QA Report — WHISKAY v0.10.1

Date: 2026-11-06
Source baseline: WHISKAY v0.10.0

## Automated checks

| Check | Result |
|---|---:|
| ESM syntax validation | 58 files passed |
| Full Node test suite | 87 passed, 0 failed |
| Native Flow button normalization | passed |
| CTA URL and phone validation | passed |
| Single-select section validation | passed |
| Interactive response extraction | passed |
| Owner-authenticated button routing | passed |
| Carousel payload shape | passed |
| Relay failure/invalid-payload fallback | passed |

## Scope verified

- `.igpanel` builds dashboard quick-reply actions.
- `.igservices` creates 2–10 carousel card structures from the service catalog.
- Native Flow actions are namespaced with `wsk:cmd:`.
- Native-flow/list/legacy-button responses can enter the existing command parser.
- The normal owner authorization, plugin registry, and anti-spam gate remain in the execution path.
- URL and call CTA builders reject absent or invalid targets instead of inventing defaults.
- Tests use injected mock Baileys APIs; no production session or database is used.

## Not tested / not claimed

- npm dependency installation from registry in this execution environment (the install attempt timed out).
- Actual Baileys import or live socket relay against WhatsApp servers.
- Rendering of Native Flow/carousel on Android, iOS, Web, or Desktop.
- Live message acknowledgements, poll decryption, business-node acceptance, or media-backed carousel cards.
- Increase in Instagram followers or execution of creator/advertising campaigns.

## Release exclusions

The release ZIP omits `.env`, `config/app.json`, WhatsApp/Instagram sessions, runtime `data/`, SQLite databases, `node_modules`, Python virtual environments, backups, and `.git`.
