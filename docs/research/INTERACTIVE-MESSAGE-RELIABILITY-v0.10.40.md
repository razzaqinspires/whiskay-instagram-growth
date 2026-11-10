# Interactive Message Reliability Research — v0.10.40

## 1. Base and scope

Base source: WHISKAY v0.10.39. Scope: ensure dropdown/button visibility across WhatsApp clients, move command catalogues to classic ListMessage, preserve Native Flow for mixed actions, and keep serialized relay payloads intact.

Baileys dependency remains `@whiskeysockets/baileys@7.0.0-rc14`. No dependency upgrade was made because the helper and WHISKAY serializer compatibility checks target this version and a Baileys version migration would be a separate breaking-change stage.

## 2. New upstream finding: Native Flow single-select does not render on iOS

The current `baileys-buttons` package documentation (v1.3.2, published four weeks before this research snapshot) states:
- Native Flow mixed buttons use `generateWAMessageFromContent` + `relayMessage`.
- `interactiveMessage` must be wrapped in `viewOnceMessage` with `messageContextInfo` inside; top-level Native Flow renders disabled/grey controls.
- Required binary nodes are `biz → interactive(type=native_flow,v=1) → native_flow(v=9,name=mixed)` and private-chat `bot(biz_bot=1)`.
- Classic dropdown `sendList` uses `ListMessage` with `biz → list(type=product_list,v=2)` and no `viewOnceMessage` wrapper.
- Native Flow `single_select` does not render on iOS; classic `ListMessage` is the compatibility path.
- Quick replies are disabled in message-yourself/self-chat; CTA buttons remain tappable.
- The package documents testing against Baileys `7.0.0-rc14`.

Source: https://npm.io/package/baileys-buttons

WHISKAY ports the protocol structure rather than adding `baileys-buttons` as a runtime dependency. This keeps the existing router/queue architecture and avoids a second abstraction layer.

## 3. v0.10.40 implementation

### 3.1 Classic ListMessage sender

`src/lib/native-flow.mjs` now exports `sendNativeList()`:
- Builds `proto.Message.ListMessage` with `ListType.SINGLE_SELECT`.
- Maps row IDs to `rows[].rowId` (not Native Flow `id`).
- Sends with `generateWAMessageFromContent` and `relayMessage`.
- Adds `biz → list(type=product_list,v=2)`.
- Adds private `bot(biz_bot=1)` for private chats; omits it in groups.
- Does not use a `viewOnceMessage` wrapper.
- Validates up to 10 sections and 20 rows per section, bounded title/description/body fields, and falls back to text before relay when validation/transport prerequisites are missing.

### 3.2 Router automatic conversion

`src/lib/whatsapp-message-router.mjs` now exposes `sendList()`. `sendInteractive()` detects a single `single_select` button and converts it to classic ListMessage automatically. A caller may set `forceNativeFlowList: true` only when it explicitly needs the Android/Web Native Flow single-select variant. Mixed Native Flow messages are not converted.

### 3.3 `.menu` command

`.menu` now sends exactly one classic ListMessage with one `Buka Menu` button and these sections:
1. `AKSI CEPAT`: `.profile` (SELF) or `.igservices` (PUBLIC), `.channel`, `.help`.
2. Up to ten dynamic recommendations.
3. All active commands grouped by broad category.

SELF mode includes all 40 plugin commands plus `.menu`, `.help`, `.channel`, and `.mode` (44 canonical commands). PUBLIC mode includes only commands in the public allowlist plus `.menu`, `.help`, `.channel` (current real registry smoke: 5 commands). Rows carry canonical command/usage, aliases, and description. The full directory stays in the same message; no second/third catalogue reply is sent.

Real registry smoke with the actual plugin loader: 12 plugins, 40 canonical plugin commands, one ListMessage relay, no text fallback, 7 sections, 57 rows (3 quick actions + 10 recommendations + 44 command rows), and 493-character description. The smoke confirmed `.iglogin`, `.spr`, `.waform`, and `.channel` are present.

The Instagram management guide is included in the list description: `.igcheck` → `.iglogin` for first login only → `.igprofile` → `.igsync`; `.igsetstats` is available for manual metric entry. Existing session files are preserved and no login occurs automatically.

### 3.4 Built-in channel command

`src/commands.mjs` adds `.channel` and exposes it in PUBLIC mode. It replies with the official WHISKAY WhatsApp Channel URL. It is included in the command directory and the quick-actions section.

### 3.5 Existing Native Flow behavior preserved

- Mixed Native Flow still uses `viewOnceMessage.message.messageContextInfo` and nested `interactiveMessage`.
- Self-chat command quick replies become CTA Copy; recipient/group quick replies remain native quick replies.
- Carousel retains the supplied serializer's top-level `interactiveMessage.carouselMessage` envelope.
- Queue never appends a footer to `relayMessage` payloads.
- Incoming Native Flow, classic list, legacy button, and template responses are converted to command text through the serializer.

## 4. Previous issues and evidence

### Queue payload mutation

In v0.10.38, outbound queue footer injection rewrote the `interactiveMessage.body.text` and truncated it to a 900-character budget. That cut off the command catalogue and modified relay payloads after serializer validation. v0.10.39 fixed this by adding visible queue footers only to ordinary `sendMessage` text. v0.10.40 retains that behavior.

### Self-chat quick replies

WhatsApp disables quick-reply controls in message-yourself chats. WHISKAY now converts namespaced command quick replies to CTA Copy in self-chat; the command must be sent manually after copying. This is a WhatsApp client behavior, not a relay retry issue.

### iOS dropdown compatibility

Native Flow `single_select` does not render on iOS per the `baileys-buttons` documentation. The `.menu` and all single-select-only pickers now use classic ListMessage by default.

### Upsert stub then full payload

Baileys issue #2652 documents a stub upsert before the complete interactive payload with the same ID. WHISKAY ignores events without `message` content and accepts the later complete payload; a regression test covers this.

Source: https://github.com/WhiskeySockets/Baileys/issues/2652

### iOS quick-reply issue

Baileys issue #2031 documents a client-specific quick-reply behavior report and was closed as not planned. WHISKAY does not promise identical button rendering on all WhatsApp versions; `.help text` remains the plain-text fallback path.

Source: https://github.com/WhiskeySockets/Baileys/issues/2031

## 5. Changed files

- `src/lib/native-flow.mjs`: classic ListMessage sender, row normalization, list binary nodes.
- `src/lib/whatsapp-message-router.mjs`: `sendList`, automatic classic-list routing for single-select-only interactive requests.
- `src/commands.mjs`: `.menu` classic list layout, full command directory, `.channel` built-in/public allowlist.
- `src/lib/baileys-serializer.mjs`: interactive command extraction from wrapped Native Flow/list/button/template responses (retained from v0.10.39).
- `src/lib/outbound-message-queue.mjs`: relay payload immutability (retained from v0.10.39).
- Tests: native-flow, router, commands, serializer, message ingress, and queue.

## 6. Compatibility boundaries

- Classic ListMessage is the default dropdown for iOS compatibility.
- Native Flow `single_select` is kept only for explicit Android/Web use.
- Native Flow quick reply still requires the correct view-once envelope and binary nodes.
- Self-chat quick replies are disabled by WhatsApp; CTA Copy is the fallback.
- Carousel support remains client-dependent.
- A successful relay call does not prove delivery, display, or click behavior on a recipient device.
