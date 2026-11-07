# Baileys serializer reference files

The four files in this folder are the original user-supplied reference files, kept for traceability.
They are **not imported by the WHISKAY runtime**. The supplied `serializer-compat.cjs` and
`helpers.cjs` call `require('@whiskeysockets/baileys')`, while this project uses the ESM-only
Baileys package. The supplied `serializer.js` also imports project modules that do not exist in
this repository and assumes a different config/security/observability layout.

Runtime-compatible behavior is implemented selectively in:

- `src/lib/native-flow.mjs` — native flow, URL/webview/copy/call, list, carousel and card layout.
- `src/lib/baileys-serializer.mjs` — incoming message unwrapping and media descriptor/download helpers.
- `src/lib/poll-store.mjs` — poll creation message cache for Baileys vote decryption.

The runtime intentionally does not enable synthetic/fake quoted messages, fake payment/order
notices, fake status/channel attribution, call control/music, or fake product receipts. Do not
import the historical `freply` API into commands that send messages to real users. Use real
WhatsApp media/message payloads and transparent labels only.
