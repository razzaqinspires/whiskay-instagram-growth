# Upgrade Guide — WHISKAY v0.10.21

1. Extract `WHISKAY_v0.10.21_SOURCE.zip` into a new directory; do not overwrite a live installation.
2. Copy `.env`, `config/app.json`, WhatsApp `session/`, Instagram `auth_ig/`, and private runtime data from the previous installation only after reviewing each destination. Never replace source templates with empty runtime placeholders.
3. Keep the existing `data/command-usage.json` if you want recommendation hit/exposure history to continue. If it does not exist, the recommendation engine starts with a clean history.
4. Keep media assets in the expected directories: `data/whatsapp-media/`, `data/whatsapp-products/`, and `data/remini/`. Symlinks that resolve outside the relevant media root are rejected.
5. Run `npm install`, `npm run check`, `npm run docs:check`, `npm test`, and `npm run security:permissions`. Run `npm run validate` after copying the real configuration.
6. Start WHISKAY and verify `.plugins`, `.menu`, `.profile`, `.waform help`, `.igdl help`, `.remini status`, `.hotreload status`, and `.wacapabilities`. For video processing, test both `.remini` as a caption on an attached video and `.remini enhance sharp` as a reply to the original video message.
7. Test `.remini` with a small video attached as a caption and with a text command replying to the original video. Do not reply to a text caption or thumbnail; reply to the actual video message.
8. Test `.igdl` only with a public Instagram URL for content you own or are authorized to download. The API is third-party and may change.
9. Test interactive formats on a second WhatsApp device. A relay acknowledgement is not proof that the client rendered the button/card or delivered media.

## Migration notes

- `.profile` is a new alias of `.igprofile`; existing `.igprofile` and `.igme` remain available.
- The command recommendation store is JSON in `data/command-usage.json`; it contains aggregate command counts/exposure timestamps, not message bodies or user text.
- Scheduled call EventMessage now fails clearly if `sock.createCallLink` is unavailable. A plain event without `call` remains supported.
- No WhatsApp/Instagram session schema migration is required. Keep the old installation until the new process is paired and the plugin registry is verified.
