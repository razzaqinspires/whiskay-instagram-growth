# Baileys Runtime and Session Handling

This document describes WHISKAY v0.8.9 runtime behavior and separates documented Baileys contracts from account-specific diagnosis.

## Message delivery path

1. Baileys emits `messages.upsert` with an array of messages and an event type.
2. WHISKAY accepts only `type === "notify"`, the live notification class. History/backfill or unrecognized event types are ignored as command input before message text parsing.
3. Each message is passed to the command handler. `fromMe: true` is retained because the owner sends commands from their linked primary WhatsApp account. In a direct chat, `remoteJid` is the recipient; authorization therefore uses the authenticated socket PN (`sock.user.id`), not the destination JID. Replies are sent back to that destination. Group commands remain controlled by the runtime mode and `allowGroups`; only the authenticated owner is eligible in self mode.
4. Text is extracted from supported message wrappers and captions, then parsed using configured prefixes.
5. The authenticated socket PN (`sock.user.id`, `@s.whatsapp.net`) is the canonical owner identity. For `fromMe: true`, the session PN must match `whatsapp.ownerNumber`; in a private chat, `remoteJid` identifies the recipient, not the sender, and is used only to route the reply. Group commands are separately controlled by `commands.allowGroups`. Messages not marked `fromMe` are accepted only when the sender and private destination both resolve to the configured owner PN.
6. The anti-spam gate runs before plugin execution. Command receipt and rejection logs do not include the message text, phone number, or arguments. The socket-level ingress diagnostic reports only the upsert type and aggregate counts.

A live WhatsApp connection does not by itself prove that this pipeline is working. Logs should show `[COMMAND] Incoming command` after a valid owner command arrives. If the connection is open but that log does not appear, investigate `messages.upsert`, event type, and key fields. If the incoming log appears followed by an authorization warning, check `whatsapp.ownerNumber` and the PN/LID alternate JIDs. If command receipt appears but there is no reply, inspect the plugin execution or send-message error.

## Connection and reconnect policy

| Status / event | WHISKAY policy |
|---|---|
| `open` | Log connected; reset accumulated retry attempts only after the connection has stayed open for 60 seconds. |
| `401` / `loggedOut` | Stop automatic reconnect. A revoked linked device requires the normal WhatsApp re-link flow; WHISKAY does not silently delete the saved session. |
| `440` / `connectionReplaced` | Stop this process. Check for another terminal, PM2 app, or device process using the same auth directory. |
| `503` / `unavailableService` | Treat as a transient service close and schedule one jittered exponential retry. |
| `515` / `restartRequired` | Reopen with the same saved auth state through the managed reconnect path. |
| Other transient close | One reconnect timer with bounded exponential backoff (3 seconds to 120 seconds, with jitter). |

The socket manager prevents concurrent starts within the process. The outer launcher also owns an exclusive local runtime lock, and supervises only one bot child and one worker child. On Unix, the bot and worker run in child process groups separate from the terminal foreground process group; the launcher receives Ctrl+C once and coordinates SIGTERM. It waits up to 15 seconds before force-stopping any child that has not exited. The plugin loader is also closed safely if SIGINT occurs before its asynchronous startup completes. A second Ctrl+C is not required for the normal shutdown path.

## Pre-key handling and the 503 caveat

Baileys uses Signal Protocol pre-keys in its authentication store. An open issue against Baileys 7.0.0-rc9/master describes repeated pre-key top-ups producing extra local pre-key files after repeated reconnects. The report includes example logs containing `503 Service Unavailable Stream Errored (unknown)`. This is an upstream community report, not proof that every 503 has that root cause or that the user's particular session is affected.

Do not delete `pre-key-*.json`, prune keys by age, remove `creds.json`, or pair again merely because a 503 occurred. A key that appears old or unused locally can still be referenced by a peer; external pruning can break message decryption. WHISKAY instead avoids needless reconnects, never scans/chmods the auth directory on each credential update, and retains the session on transient closes.

A different issue reports a possible unacknowledged top-level status stanza leading to `Stream Errored (ack)` on rc14. That report is distinct from a `503` unless the actual error details match. WHISKAY does not patch the WhatsApp protocol or send fabricated acknowledgments.

## Diagnosing a command that receives no reply

- No `[WHATSAPP] Live command message received` line: the socket did not deliver a command-like `notify` batch to the ingress listener, or the message text/prefix was not recognized.
- A live-command line but no `[COMMAND] Incoming command`: inspect the LID readiness gate and the `[COMMAND] message handler failed` diagnostic.
- `[COMMAND] Ignored: owner PN authorization failed`: inspect the structured `reason`. `SESSION_OWNER_MISMATCH` means `whatsapp.ownerNumber` does not match the logged-in `sock.user.id` PN; `CHAT_NOT_OWNER_PN` means the destination could not be resolved to the owner PN; `SENDER_NOT_OWNER` means the sender identity differs; `GROUPS_DISABLED` or `PUBLIC_GROUPS_DISABLED` means group command input is disabled by the effective runtime mode/group switch. Do not disable owner authorization as a workaround.
- `[COMMAND] Incoming command` followed by a plugin error: inspect plugin initialization/execution and the message-send failure. A successful WebSocket open alone does not prove command dispatch.

The diagnostics deliberately omit message text, credentials, full JIDs, and phone numbers. Share only the relevant log lines and redact any identifiers that appear elsewhere.

## Safe upgrade checklist

- Stop the previous WHISKAY instance before starting the new version. If the named old app still exists in PM2, remove only `whiskay-ig-bot`; do not stop unrelated PM2 apps.
- Keep `.env`, `config/app.json`, `session/`, `auth_ig/`, and user data under `data/`.
- Run one `npm start` process. Do not run `node index.mjs`, `npm run worker`, or PM2 alongside it unless intentionally doing a separate isolated test.
- Keep `whatsapp.ownerNumber` and `whatsapp.pairingNumber` set to the primary account's digits. They must match the live socket PN (`sock.user.id`, `@s.whatsapp.net`); do not enter an `@lid` value.
- Confirm the runtime with `.menu`, `.igprofile`, and `.igpanel`; use the command receipt log to distinguish message delivery, authorization, and plugin failures.

## Upstream references

- Baileys quickstart / message event example: https://github.com/WhiskeySockets/docs/blob/main/quickstart.mdx
- Baileys troubleshooting / reconnect guidance: https://github.com/WhiskeySockets/docs/blob/main/advanced/troubleshooting.mdx
- Event type definitions: https://github.com/WhiskeySockets/Baileys/blob/master/src/Types/Events.ts
- Disconnect reason definitions: https://github.com/WhiskeySockets/Baileys/blob/master/src/Types/index.ts
- Pre-key growth report: https://github.com/WhiskeySockets/Baileys/issues/2797
- Separate status-stanza acknowledgment report: https://github.com/WhiskeySockets/Baileys/issues/2858


## Runtime access mode and owner-only group processing — v0.10.9

`src/commands.mjs` reads the durable state through `src/lib/runtime-mode.mjs` before authorization. The mode state has two independent fields: `mode` (`self` or `public`) and `allowGroups` (boolean).

- `self`: every non-public command goes through `inspectOwnerAuthorization()`. If `allowGroups` is true, the router accepts group commands only when Baileys identifies the sender as the configured owner; a group admin/member role does not grant WHISKAY authorization.
- `public`: all groups are rejected regardless of the persisted `allowGroups` preference. Only private PN/LID chats may call `help`, `menu`, `igservices`, and `igservice`. These commands are informational; owner operations, campaign edits, credit/order controls, Instagram account reads, and `.mode` remain owner-only.
- `.mode` itself is always checked against owner authorization. It cannot be used by public users to switch the runtime mode.
- The state is written atomically to `data/runtime-mode.json`. Existing state is loaded on restart and takes precedence over bootstrap `config/app.json` values.

The public mode is intentionally not a blanket public bot. It is a small private-chat catalogue allowlist; public group commands are never enabled. See [Mode & Group Access](MODE-AND-GROUP-ACCESS.md) for examples and recovery instructions.
