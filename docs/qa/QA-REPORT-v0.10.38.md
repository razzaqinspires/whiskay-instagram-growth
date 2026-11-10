# QA Report — WHISKAY v0.10.38

## Scope

Integrate the uploaded SPR/SPR2 plugin concept as a standalone ESM plugin while preserving WHISKAY architecture.

## Added tests

- Incoming group message metadata is indexed by sender and group.
- Sender PN and LID aliases can resolve the same stored message.
- Store rejects own outgoing messages.
- Expired records are pruned.
- Outbound delete registry accepts private bot-sent message records only.
- Plugin exposes `spr`, `spr2`, `sprstatus`, `sprclear`, and `sprdmsg`.

## Automated results

- Focused SPR tests: 4/4 PASS.
- Full `npm test`: 337/337 PASS.
- `npm run check`: 122 JavaScript files PASS.
- `npm run docs:check`: 172 documentation records indexed and validated.
- `npm run security:permissions`: PASS; restrictive file/directory permissions enforced.
- `npm run version:check`: `whiskay-instagram-growth@0.10.38`, Node v22.16.0, npm 10.9.2.

## Live verification

No live WhatsApp session was available. Delivery to PN/LID, group message indexing under actual Baileys v7 event envelopes, and message deletion behavior must be verified on the operator's test account. No claim is made that hidden group delivery or recipient-history erasure works.

## Live verification

No live WhatsApp session was available. Delivery to PN/LID, group message indexing under actual Baileys v7 event envelopes, and message deletion behavior must be verified on the operator's test account. No claim is made that hidden group delivery or recipient-history erasure works.
