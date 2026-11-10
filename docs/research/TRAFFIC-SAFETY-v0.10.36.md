# WHISKAY Traffic Safety Research — v0.10.36

## 1. Scope and safety boundary

This release implements application-side traffic governance for the existing Baileys runtime: per-command cooldown, burst detection, warning escalation, temporary bans, durable inbound metadata, a persistent outbound FIFO, send pacing, and operational status.

It does not claim to detect WhatsApp's internal anti-abuse classifier. It does not imitate human activity, spoof protocol fingerprints, bypass platform controls, or manually rotate cryptographic/session keys. Those actions are not a reliable anti-ban control and can conflict with WhatsApp rules.

## 2. Source-grounded constraints

WhatsApp's Help Center says unwanted messaging, unauthorized automated/bulk messaging, modified clients, and harvesting can lead to account bans. WhatsApp's Terms also prohibit impermissible automated/bulk messaging and unauthorized use. Business Platform messaging has its own policy, including restrictions on templates and the 24-hour customer-service window.

References:
- https://faq.whatsapp.com/361005896189245/
- https://www.whatsapp.com/legal/terms-of-service
- https://whatsappbusiness.com/policy/
- https://www.whatsapp.com/legal/messaging-guidelines

Baileys documents `messages.upsert` as the inbound event, recommends iterating every message in the batch, and provides `sock.sendMessage` for outbound sends. Baileys is an unofficial WebSocket client library; it does not provide a guarantee against account restrictions:
- https://github.com/WhiskeySockets/Baileys

## 3. Four separate controls

### Cooldown
Per sender and per command. Default 1,800 ms. First blocked attempt in a cooldown period emits one notice; subsequent attempts during the same period do not emit repeated notices. Cooldown is not counted as an anti-spam warning by itself, although repeated attempts still contribute to burst telemetry.

### Anti-spam
Default burst window 10 seconds, burst limit 5. A burst episode is recorded as a warning event. At 3 warning events in the rolling one-hour window, the system sends a warning notice. At 5 warning events, the sender receives a 15-minute temporary ban. Owner can tune limits and duration. Expired bans clear automatically; manual unban is available.

### Inbound audit
Every live `notify` message with content is recorded as metadata: sender JID, message ID, message type, timestamp, and decision. Raw inbound chat body is not persisted by the audit logger. Command attempts update the same ingress row with a routing decision such as `QUEUED_FOR_PROCESSING`, `HELD_COOLDOWN`, `BLOCKED_SPAM_WARNING`, or `BLOCKED_TEMP_BAN`.

### Outbound FIFO and transport pacing
All socket `sendMessage` and `relayMessage` calls pass through one persistent FIFO queue by default, including native interactive flows and media compatibility relays. When the durable queue is turned OFF but transport pacing remains ON, sends still pass through a serialized in-memory rate gate. The queue writes pending payloads to a private JSON file before relay. Text responses receive an appended footer with queue position, queue ID, estimated wait, and configured minimum interval. Default minimum interval is 1,200 ms; one send at a time.

The queue is bounded. It pauses while the WhatsApp socket is disconnected. Send errors and interrupted `SENDING` jobs are marked `UNKNOWN` because the relay may already have reached WhatsApp; they are not automatically resent. This avoids duplicate sends but means ambiguous outcomes require owner review. This avoids duplicate sends at the cost of requiring manual review of ambiguous results.

## 4. Owner commands

- `.safety status`
- `.safety cooldown on|off`
- `.safety cooldown-ms <0-60000>`
- `.safety spam on|off`
- `.safety spam limits <burst> <warning> <ban> <window-seconds>`
- `.safety ban-duration <minutes>`
- `.safety transport on|off`
- `.safety queue on|off`
- `.safety rate <500-60000>`
- `.safety spam limits <burst> <warning> <ban> <window-seconds>`
- `.safety ban-duration <minutes>`
- `.safety bans`
- `.safety ban <international-number> [minutes]`
- `.safety unban <international-number>`

Alias: `.trafficguard`. These are owner-only, including when runtime mode is PUBLIC; group chat is not accepted for configuration.

## 5. JSON persistence

- `data/whatsapp-traffic-safety.json`: settings, sender cooldown state, warning timestamps, bans, and inbound metadata.
- `data/whatsapp-outbound-queue.json`: queue IDs, positions, pending outbound payloads, and delivery state.

Both are written with atomic rename and restrictive file permissions. Pending outbound message payloads may contain private message content and must be treated as sensitive runtime data. Sent payloads are removed from retained queue records; only status metadata remains. Neither file belongs in source ZIP archives or Git.

## 6. Operational guidance

Run one process per WhatsApp session directory. Keep the process under a dedicated non-root OS user. Back up runtime JSON files securely. Do not edit Baileys auth/session key material manually. For commercial automation, prefer the official WhatsApp Business Platform and follow current policy and template rules. Baileys auth updates are persisted through its `creds.update` event and `saveCreds()` callback in `src/wa.mjs`; WHISKAY does not manually rotate or fabricate cryptographic keys.

## 7. Implementation files

- `src/security/traffic-safety-manager.mjs`
- `src/lib/outbound-message-queue.mjs`
- `src/lib/message-ingress.mjs`
- `src/config.mjs`
- `src/commands.mjs`
- `src/wa.mjs`
- `src/plugins/core.mjs`
- `config/app.example.json`
- `test/traffic-safety.test.mjs`
