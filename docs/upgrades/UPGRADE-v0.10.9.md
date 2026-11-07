# Upgrade Guide — WHISKAY v0.10.9

## Scope

This upgrade adds owner-only group mode control and Content-to-Follower Intelligence. It preserves the WhatsApp session format and existing campaign/order/ledger records. The growth JSON envelope migrates from v1/v2 to v3 by adding `contentPosts`.

## Before upgrading

1. Stop the existing WHISKAY process with its normal graceful shutdown.
2. Make a private backup of `config/app.json`, `.env`, `session/self/`, `auth_ig/`, and `data/instagram-growth.json`. Store backups outside the source project and never upload them into a public archive.
3. Preserve `data/growth-queue.sqlite`, `data/runtime-mode.json`, `data/lid-map.json`, Instagram stats, safety state and referral claim queue if they exist.
4. Do not pair WhatsApp again unless the old session is actually invalid.

## Apply the source

Extract `WHISKAY_v0.10.9_SOURCE.zip` to a clean project directory. Reuse only the private runtime files listed above. Do not copy an old source archive, `node_modules`, cache, or unused scripts into the new tree.

```bash
cp .env.example .env
cp config/app.example.json config/app.json
nvim config/app.json
nvim .env
npm install
```

If you are upgrading an existing installation, do not overwrite the existing private `.env` and `config/app.json` with the example. Instead, merge the new ordinary settings manually using Neovim. Add these bootstrap fields under `commands` if they are not present:

```json
"mode": "self",
"runtimeModeFile": "./data/runtime-mode.json",
"allowGroups": true
```

The runtime state file, when it already exists, takes precedence over bootstrap values. The operator should use `.mode` to change runtime settings after startup.

## Run QA before starting

```bash
npm run check
npm run docs:check
npm test
npm run validate
npm run security:permissions
```

Do not enable optional provider or referral integrations as part of this upgrade. Confirm the app configuration and all local secret files remain private.

## Enable owner-only group usage

After pairing the existing owner account, send from the owner's private chat:

```text
.mode status
.mode self
.mode groups on
.mode status
```

Expected status: `Mode: SELF` and `Group access: ON (owner only)`. This permits owner-authenticated commands in a group; it does not make commands available to every member. Non-owner attempts remain rejected even when the sender is a group admin.

To disable groups:

```text
.mode groups off
```

To switch to public catalogue mode:

```text
.mode public
```

Public mode rejects all groups and permits only `help`, `menu`, `igservices`, and `igservice` in private chat.

## Start

```bash
npm start
```

Then check `.mode status`, `.menu`, `.igpanel`, `.igcontent`, and `.igcontent compare`. No live Instagram connection is needed for manual content input and analytics.

## Growth database migration

On first growth DB read, existing v1/v2 fields are retained and `contentPosts` defaults to `[]`. The next successful write persists the v3 envelope. No campaign, order, balance, ledger, idempotency record or SQLite queue is intentionally deleted. Do not edit the JSON database while the bot or worker is running.

## Rollback

1. Stop WHISKAY.
2. Preserve the current `data/instagram-growth.json` and `data/runtime-mode.json` outside the project.
3. Restore the complete private backup from before upgrade if you need to return to the previous binary/source version. A v0.10.8 source expects the older growth store envelope; restoring the pre-upgrade JSON database is the safest path.
4. Restore the previous source tree and private config/session files.
5. Run the previous version's QA commands before restarting.

Do not try to roll back by deleting individual fields from the v3 JSON while WHISKAY is running.

## Known limitations

- No automatic Meta Insights ingestion was added. Per-content metrics are owner-entered.
- Public mode is not a full public bot and never enables groups.
- Per-content follow counts are not proof of causal attribution.
