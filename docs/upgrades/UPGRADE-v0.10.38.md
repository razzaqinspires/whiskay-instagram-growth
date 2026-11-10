# Upgrade WHISKAY v0.10.38

1. Stop the previous bot process.
2. Back up `.env`, `config/app.json`, `session/`, `auth_ig/`, `data/`, and custom plugins.
3. Extract `whiskay-instagram-growth-v0.10.38.zip` into a new directory.
4. Run `npm install`.
5. Copy runtime configuration, credentials, sessions, and persistent data selectively. Do not overwrite new source files with old source copies.
6. Run `npm run validate`, `npm run check`, `npm run docs:check`, `npm test`, and `npm run security:permissions`.
7. Start WHISKAY and confirm the plugin log reports `spr` plugin and its five commands loaded.

## First tests

- In a group, reply to a normal member message and run `.spr Test private message`.
- Try `.sprstatus`.
- Try `.spr nomor | pesan | id_grup` for a member who has sent a message since the bot started.
- Verify that the target receives an ordinary private DM.
- If needed, run `.sprdmsg <returned-message-id> CONFIRM` to request deletion of that bot-sent DM.

`.spr2` currently uses the same direct private delivery model and is not a hidden group relay.

## Rollback

Stop WHISKAY and restore the previous v0.10.37 source directory. The SPR message index is volatile and does not require data migration. The existing WhatsApp session and other runtime data can be reused.
