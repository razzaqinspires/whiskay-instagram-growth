# Interactive Message Reliability Research — v0.10.39

## 1. Source archive and scope

Base archive: `whiskay-instagram-growth-v0.10.38.zip`.

Scope: repair the reported missing/disabled WhatsApp buttons, improve Native Flow and carousel serialization boundaries, stop outbound queue metadata from mutating interactive messages, and make `.menu` expose the complete active command registry and Instagram login-management workflow without sending a fragmented catalogue.

No Baileys dependency upgrade was made. The release page still identifies `v7.0.0-rc14` as the latest release in the inspected source set. WHISKAY remains pinned to `@whiskeysockets/baileys@7.0.0-rc14` to avoid an unrelated protocol migration.

## 2. Confirmed source-level causes

### 2.1 Outbound queue was rewriting relay payloads

`src/lib/outbound-message-queue.mjs` appended a visible queue footer to both `sendMessage` and `relayMessage`. For Native Flow, it mutated `viewOnceMessage.message.interactiveMessage.body.text` and cut the body to a 900-character budget. This truncated `.menu`'s command catalogue and modified a serialized interactive payload after the serializer had validated it.

Decision: visible queue footer is now applied only to ordinary `sendMessage` payloads. `relayMessage` interactive/AIRich/carousel payloads are passed through without mutation; queue position, estimated wait, and pacing remain in queue state/logs.

### 2.2 Quick Reply in self-chat

WhatsApp disables Quick Reply controls in a message-yourself/self-chat. This explains the grey/inactive controls when WHISKAY sends a button to the same account. It is not a defect that can be repaired by changing `stanzaId` or retrying the relay.

Decision: when the destination matches the authenticated socket PN/LID, namespaced command `quick_reply` buttons are converted to `cta_copy` with the corresponding command text. The control remains tappable and copies the command; the owner must send it manually. For recipient private chats and groups, the original `quick_reply` is retained.

### 2.3 Interactive field budgets and fallback visibility

Native Flow body text was allowed up to 12,000 characters even though interactive-message clients have tighter body-field budgets. Overlong content could be rejected or rendered inconsistently. The menu also attempted to place a full command catalogue into a single interactive body.

Decision: Native Flow body is capped at 1,024 characters, header title/subtitle and footer at 60 characters. Over-limit content falls back to text and the message router logs the fallback reason without logging the message content. Full command details now live in the `single_select` dropdown, not in the caption.

### 2.4 Special flow descriptor mixing

`cta_catalog`, `send_location`, and call-permission special flows use dedicated binary node descriptors. Mixing one of these with ordinary quick reply/URL controls could select an incorrect `mixed` descriptor.

Decision: special CTA flow types must be sent alone. Ordinary quick reply + CTA URL + single-select remains a mixed Native Flow v9 message.

## 3. Baileys upstream research

### Official release channel

GitHub releases show `v7.0.0-rc14` as the latest Baileys release in the inspected release page. WHISKAY does not move to an unverified branch or a newer tag without a separate dependency/compatibility stage.

Source: https://github.com/WhiskeySockets/Baileys/releases

### Interactive binary-node helper

The public `zq_baileys_helper` repository explains that Baileys interactive buttons require the binary nodes `biz`, `interactive`, and `native_flow`, plus a private-chat `bot` node. It describes private vs group node handling. WHISKAY already had this pattern; v0.10.39 adds stricter validation and prevents queue mutation after serialization.

Source: https://github.com/zqdevelopers/zq_baileys_helper

### Client compatibility issue

Baileys issue #2031 documents a report about reply-button display/click behavior on iOS vs Android/Web. The issue was closed as not planned; it does not establish a universal cross-client guarantee. WHISKAY therefore keeps a text fallback command (`.plugins text` in SELF mode or `.help` in PUBLIC mode) and does not claim that every WhatsApp client renders every button type.

Source: https://github.com/WhiskeySockets/Baileys/issues/2031

### Interactive message stub followed by full payload

Baileys issue #2652 documents an observed `messages.upsert` sequence where a stub (`Message absent from node`) may arrive first, then a complete `interactiveMessage` with the same ID. It also documents incoming interactive body/caption locations. WHISKAY's classifier requires a real `message` object before parsing or storing; it ignores the stub and accepts the later complete payload. A regression test now protects this behavior.

Source: https://github.com/WhiskeySockets/Baileys/issues/2652

## 4. `.menu` design

One Mixed Native Flow message contains exactly three controls:

1. Profile: real `quick_reply` in recipient/group chats; CTA Copy in self-chat.
2. WHISKAY channel: HTTPS CTA URL with WebView interaction request.
3. All Commands: single-select command directory.

The directory includes up to ten dynamic recommendations, then all active commands grouped into broad sections. In SELF mode it also includes `.menu`, `.help`, and `.mode`. Command rows show canonical name/usage, aliases, category grouping, and description. Instagram account management commands include `.igcheck`, `.iglogin`, `.igprofile`, `.igsync`, and `.igsetstats`.

Caption includes the login sequence and access-mode summary but stays under 1,024 characters. This avoids multiple catalogue replies. In PUBLIC mode, only commands permitted by the public allowlist are included; owner management commands remain hidden.

## 5. File changes

- `src/lib/native-flow.mjs`: view-once Native Flow envelope, self-chat quick-reply adaptation, CTA parameter completeness, quick-reply count and body limits, special-flow isolation, expanded response ID extraction. Carousel remains top-level per the supplied working carousel serializer.
- `src/lib/baileys-serializer.mjs`: command text extraction from wrapped Native Flow/list/button/template responses.
- `src/lib/outbound-message-queue.mjs`: no queue-footer mutation on `relayMessage` payloads.
- `src/lib/whatsapp-message-router.mjs`: logs Native Flow/Carousel text fallback reason and payload size.
- `src/commands.mjs`: full command directory, built-ins, login-management guide, self-chat-aware menu actions.
- `src/plugins/whatsapp-tools.mjs`: compact interactive help and `.wacapabilities text` full matrix.
- `test/native-flow.test.mjs`, `test/baileys-serializer.test.mjs`, `test/message-ingress.test.mjs`, `test/commands.test.mjs`, `test/traffic-safety.test.mjs`: regression coverage.

## 6. Message types and limits

- Native Flow: 1–10 buttons, no more than 3 quick replies, up to 10 sections × 20 rows/section.
- Native Flow body: 1,024 characters; header title/subtitle and footer: 60 characters.
- CTA URLs must remain HTTPS. CTA Copy rejects secret-like strings.
- Special CTA flows are isolated in their own message.
- Carousel remains 2–10 cards using a top-level `interactiveMessage.carouselMessage` and root `messageContextInfo`.
- `sendMessage` and `relayMessage` continue through the durable outbound queue. Only text sendMessage receives visible queue telemetry.

## 7. Login and command management

Menu login guidance reflects the active Instagram session model: `.igcheck` diagnoses adapter/session state without logging in; `.iglogin` is an explicit first login and is rejected if a local session already exists; `.igprofile` reads the connected profile; `.igsync` syncs profile stats read-only; `.igsetstats` stores manually supplied metrics. Existing local session files remain owner-managed and are not replaced by menu actions.

The built-in `.mode` command is shown only in SELF mode. The special Eval Master prefixes remain owner-only execution syntax and are not included as regular commands in `.menu`.

## 8. Verification boundary

Unit tests verify payload shape, binary-node presence, wrapper placement, self-chat adaptation, response parsing, menu command coverage, and queue immutability. They do not prove actual delivery or rendering on every WhatsApp client. Live tests must be run from a second WhatsApp account for recipient-side quick replies; a message-yourself chat is not a valid quick-reply click test.
