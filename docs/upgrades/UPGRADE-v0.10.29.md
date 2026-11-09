# Upgrade Guide — v0.10.29

1. Stop the current WHISKAY process using its normal supervisor.
2. Back up `.env`, `config/app.json`, `session/`, `auth_ig/`, and required runtime data separately. These are not included in the release ZIP.
3. Extract `whiskay-instagram-growth-v0.10.29.zip` into a clean directory.
4. Restore only the required private configuration and session files from the backup; do not overwrite the new source tree wholesale with an old backup.
5. Run `npm ci` to install the pinned dependency graph and execute the Baileys postinstall compatibility checks.
6. Run `npm run validate`, `npm run check`, `npm run docs:check`, and `npm test`.
7. Start the bot and test `.waform quick`, `.waform list`, `.waform catalog`, `.waform send-location`, `.waform carousel`, and `.waform carousel` on the intended test devices.

## Operational impact

- No configuration key or database migration is required.
- Native Flow relay timeouts now surface as failures rather than automatically sending a text fallback. Inspect the command error/log and recipient chat before retrying to avoid duplicates.
- `.waform send-location` requests the recipient to share location through WhatsApp; it does not access GPS silently.
- Carousel image/video media is uploaded through Baileys `prepareWAMessageMedia`; use local, trusted assets only.

## Rollback

Stop the process, restore the previous source release and its matching `package.json`, then restore private config/session files from the backup if needed. No database rollback is required.
