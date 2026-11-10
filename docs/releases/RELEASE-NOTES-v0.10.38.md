# WHISKAY v0.10.38 — SPR Private Relay

## Added

- Standalone ESM plugin `src/plugins/spr.mjs`.
- `.spr` reply, mention, and number/group lookup flows.
- `.spr2` alternate explicit private-DM entry point.
- `.sprstatus`, `.sprclear`, `.sprdmsg`, and `.sprdelete`.
- Bounded 12-hour incoming message metadata index.
- Tracking of bot-sent SPR message IDs for safe delete requests.
- Live `notify` message indexing in `src/wa.mjs`.
- Shared module registration for dependency-aware plugin hot reload.

## Compatibility and safety

- No changes to Baileys dependency version.
- No replacement of Native Flow, message router, serializer, or outbound queue.
- No copied `groupStatusMessageV2` / forged `protocolMessage` stealth deletion sequence.
- Relay uses normal private `sock.sendMessage`; recipient receives an ordinary DM.
- Deletion is restricted to previously recorded bot-sent SPR messages.

## Commands

`.spr`, `.spr2`, `.sprstatus`, `.sprclear`, `.sprdmsg`.
