# Apply Part 1 — WhatsApp menu and media core repair

This patch is intended for the existing WHISKAY v0.10.22 working tree. It does not replace `.env`, `config/app.json`, `session/`, `auth_ig/`, or `data/`.

## Files

Copy the patch ZIP contents into the project root, preserving the directory structure. It changes `src/`, `test/`, and the relevant `docs/` files only.

## Verification

From the project root run:

```bash
node --check src/commands.mjs
node --check src/lib/menu-renderer.mjs
node --check src/lib/whatsapp-message-router.mjs
node --test test/menu-renderer.test.mjs test/whatsapp-message-router.test.mjs test/command-recommender.test.mjs test/commands.test.mjs
```

After the tests pass, restart the single active WHISKAY process and test:

```text
.menu
.plugins
.waform media ptv whiskay-demo-ptv.mp4
.waform media gif whiskay-demo-gif.mp4
.waform media voice whiskay-demo-voice.ogg
```

For PTV, check the actual receiving WhatsApp client for playback and round-video presentation. A relay acknowledgement alone is not proof of successful rendering.

## Rollback

Restore the previous versions of the changed source files. No database migration or session reset is needed. Do not clear WhatsApp or Instagram sessions to apply this patch.
