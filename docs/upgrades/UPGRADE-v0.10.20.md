# Upgrade Guide — WHISKAY v0.10.20

1. Extract `WHISKAY_v0.10.20_SOURCE.zip` to a new directory; do not overwrite a live installation.
2. Copy the old `.env`, `config/app.json`, WhatsApp `session/`, Instagram `auth_ig/`, and private runtime data only after reviewing each destination. Do not replace new source templates with empty runtime placeholders.
3. Run `npm install`, then `npm run check`, `npm run docs:check`, `npm test`, and `npm run security:permissions`.
4. Start the bot and verify `.plugins`, `.waform help`, `.igdl help`, `.remini status`, `.hotreload status`, and `.wacapabilities`.
5. Test `.remini` with a small attached video caption and a text command replying to a small video. Keep the file below the configured Video HD input limit.
6. Test `.igdl` only with a public Instagram URL for content you own or may download. The API is third-party and its current availability is not guaranteed.
7. Verify interactive UI on a second WhatsApp device. A successful relay acknowledgement alone does not prove a card/button rendered or media was delivered.

No session migration or growth-store schema migration is required by v0.10.20. Keep the old installation until the new process connects and plugin registry/commands have been verified.
