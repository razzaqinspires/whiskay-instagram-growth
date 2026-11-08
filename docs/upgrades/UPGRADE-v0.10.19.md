# Upgrade Guide — WHISKAY v0.10.19

## Preserve private runtime data

Upgrade into a new directory. Do not overwrite the old runtime until the new one has passed local QA and you have verified the WhatsApp and Instagram sessions.

Keep these files/directories outside the source ZIP and copy them only from your own trusted installation:

- `.env`
- `config/app.json`
- `session/`
- `auth_ig/`
- `data/` (campaigns, content analytics, command usage and academic inputs)

The release ZIP intentionally excludes active credentials and runtime data.

## Installation

```bash
cd ~
unzip WHISKAY_v0.10.19_SOURCE.zip
cd whiskay-v0.10.19
cp /root/wbself/.env .env
cp /root/wbself/config/app.json config/app.json
for d in session auth_ig data; do
  [ -d /root/wbself/$d ] && cp -a /root/wbself/$d "$d"
done
chmod 600 .env config/app.json
npm install
npm run check
npm run docs:check
npm test
npm run security:permissions
npm start
```

Adjust `/root/wbself` if the previous installation is elsewhere. Do not run two WHISKAY instances against the same copied session/data directories. Stop the old process before connecting the new one.

## First-run verification

```text
.hotreload status
.plugins
.menu
.remini status
.waform
.igcampaign
.igdl info
```

Use a small video first: send an actual WhatsApp video with caption `.remini inspect`, then reply to a video with `.remini inspect`. For encoding, try `.remini enhance fast` before the higher-load presets. Install FFmpeg/FFprobe on the host.

Test `.menu` on a real receiving WhatsApp client: check 3 buttons, channel URL/WebView behavior, ten-row recommendation list, channel preview, push name and actual quoted message. Native Flow support varies by client build.

## New optional Business settings

`WHISKAY_WHATSAPP_BUSINESS_CATALOG_ENABLED` remains disabled by default. Set it to `true` only when the logged-in number is a WhatsApp Business account and the supplied product ID/image/price/currency/business owner are valid data from its real catalog. `WHISKAY_BUSINESS_OWNER_JID` may be set to the real Business owner JID. Do not populate test/fake product IDs to force the demo.

## KOL.ID

`.igdl` sends a public Instagram URL to KOL.ID. Review its service terms and privacy implications before using. It does not access private profiles or use the user's Instagram session. External service availability and output rights remain the operator's responsibility.

## Rollback

Keep the previous directory and its own credentials untouched until the new version is verified. If the new instance cannot start or connect, stop it, then resume the previous directory/session. Do not copy partially modified session directories between concurrently running instances.
