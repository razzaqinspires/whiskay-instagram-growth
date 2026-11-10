# SPR Integration Research — WHISKAY v0.10.38

## Source material

Primary source: user-uploaded `ulik_ by rohan.js`, attributed in its header to Rizkyrohan. The source contains two commands (`spr`, `spr2`), an in-memory global message index, and a `dmsg()` helper.

The supplied implementation describes:
- Reply-to-message mode in the same chat.
- Mention mode, using the mentioned user's LID and a recent stored stanza ID.
- Number + text + group ID mode, searching a stored message ID.
- `.spr2` as a variant of the number/group mode.
- A global store cleared every 12 hours.
- A `dmsg()` sequence that sends a `groupStatusMessageV2`, sends a `protocolMessage` with `type: 14` and `editedMessage`, then issues repeated delete requests.

## Source-derived behavior vs. supported protocol behavior

The uploaded source attempts to make a group relay visible only to one target by passing a target message's stanza ID as the `messageId` option to `relayMessage`. Its own comments describe this as a trick. This behavior is not a documented privacy guarantee and must not be presented as guaranteed private delivery.

The `dmsg()` implementation is also not a standard, documented delete workflow. It uses status/protocol-message construction and repeated deletes to try to remove traces. WHISKAY does not reproduce this behavior.

Baileys supports normal message sending and message deletion by message key. These operations have their normal WhatsApp semantics; they do not grant arbitrary access to erase another user's entire chat history.

References:
- https://github.com/WhiskeySockets/Baileys
- https://github.com/WhiskeySockets/Baileys/releases
- https://baileys.wiki/

## WHISKAY architecture audit

Base release: `whiskay-instagram-growth-v0.10.37.zip`, package `whiskay-instagram-growth@0.10.37`, Baileys `7.0.0-rc14`.

Existing components retained:
- `src/plugins/whatsapp-tools.mjs`
- `src/lib/whatsapp-message-router.mjs`
- `src/lib/native-flow.mjs`
- `src/lib/baileys-serializer.mjs`
- `src/lib/plugin-loader.mjs`
- `src/lib/outbound-message-queue.mjs`
- `src/wa.mjs`

Integration is a standalone ESM plugin and a small metadata-store module. No serializer, Native Flow, message-router, protocol serializer, or dependency version replacement was made.

## v0.10.38 implementation

### `src/lib/spr-message-store.mjs`
- New bounded in-memory metadata index.
- Stores only message ID, chat JID, sender PN/LID aliases, and timestamp.
- No message text, media, or quoted payload retained.
- Default 12-hour TTL and 20,000 record cap.
- Tracks bot-sent SPR message IDs for safe owner-requested deletion.
- Rejects outgoing own messages from the inbound index.

### `src/wa.mjs`
- Saves each live `notify` message into the SPR metadata index.
- History/backfill messages are not indexed.
- Does not change command dispatch or Baileys event policy.

### `src/lib/plugin-loader.mjs`
- Adds the SPR metadata module to shared runtime modules so the plugin snapshot and live ingress handler use the same store instance across hot reload.

### `src/plugins/spr.mjs`
Commands:
- `.spr <text>` — reply to a target message and send a normal private DM to that author.
- `.spr @mention | <text>` — use a mention and the current chat's message index.
- `.spr <number> | <text> | <groupJid>` — find the latest target message in the named group and send a normal private DM.
- `.spr2 <number> | <text> | <groupJid>` — alternate entry point; intentionally uses the same explicit private-DM transport.
- `.sprstatus` / `.sprinfo` — store statistics.
- `.sprclear` — clear incoming metadata index.
- `.sprdmsg <messageId> CONFIRM` / `.sprdelete` — request deletion of one previously recorded bot-sent SPR message.

Every command checks `key.fromMe` and authenticated socket PN against `whatsapp.ownerNumber`.

## DMSG safety boundary

The original stealth-style `dmsg()` implementation is not included. The WHISKAY replacement is limited to a message ID returned by a previous SPR direct message and stored as a bot-owned outbound record. It issues the standard Baileys delete request for that bot-sent key only. It does not delete a target's own messages or promise deletion from all recipients' history.

## Operational behavior

- Inbound index is volatile and resets when the process restarts.
- TTL is 12 hours.
- Capacity is bounded to 20,000 message records.
- Only metadata is retained; no message body/media.
- Target must have sent a message while WHISKAY was online and while a live `notify` event was processed.
- Target PN is preferred; LID is retained as fallback when PN mapping is unavailable.
- Outgoing direct messages use the existing patched `sock.sendMessage`, so the existing outbound queue remains in the path.

## Known limitations

- Direct private delivery is not a covert group message; the recipient receives an ordinary DM.
- If the target's LID cannot be mapped and the client/server rejects LID addressing, sending can fail.
- `.spr2` is intentionally not behaviorally identical to the uploaded hidden-relay trick.
- A delete request may be rejected or may not remove a message from every recipient device; the bot reports only that the request was submitted.
