# Upgrade WHISKAY v0.10.36

## Backup

Stop the bot and back up `.env`, `config/app.json`, `session/`, `auth_ig/`, `data/`, and any locally maintained plugins. Never place credentials or runtime JSON files into the source archive.

## Install

1. Extract `whiskay-instagram-growth-v0.10.36.zip` into a new directory.
2. Install dependencies with `npm install`.
3. Copy `config/app.json`, `.env`, WhatsApp session, Instagram auth, and required data selectively from the previous installation.
4. `trafficSafety` is optional in `config/app.json`; defaults are applied when absent. The example config documents all fields.
5. Validate with `npm run validate`, `npm run check`, `npm run docs:check`, and `npm test`.
6. Start the bot and run `.safety status`.

## New runtime JSON files

- `data/whatsapp-traffic-safety.json`
- `data/whatsapp-outbound-queue.json`

Both are created automatically. Keep them private and backed up. Do not commit or distribute them.

## Owner controls

`.safety status`, `.safety cooldown on|off`, `.safety cooldown-ms <ms>`, `.safety spam on|off`, `.safety spam limits <burst> <warning> <ban> <seconds>`, `.safety ban-duration <minutes>`, `.safety transport on|off`, `.safety queue on|off`, `.safety rate <ms>`, `.safety bans`, `.safety ban <number> [minutes]`, `.safety unban <number>`.

All safety controls are owner-only, including in PUBLIC mode. Group chat is rejected.

## Important queue behavior

All outgoing `sock.sendMessage` calls are queued by default and serialized. If the socket disconnects, pending jobs remain on disk until reconnect. A job that was already marked `SENDING` when the process stopped, or whose relay call errors, is marked `UNKNOWN` and is not automatically resent, because WhatsApp may already have accepted it. Review such entries manually.

## Rollback

Stop WHISKAY and restore the previous source release. Keep the two traffic JSON files separately if you want to preserve settings and audit history. The older release will not use them. Never copy an outbound queue JSON into a second active bot instance using the same WhatsApp account/session.
