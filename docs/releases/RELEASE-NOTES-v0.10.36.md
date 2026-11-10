# WHISKAY v0.10.36 — Persistent Traffic Safety

## Highlights

- Separate per-command cooldown from anti-spam burst detection.
- One cooldown notice per sender/command cooldown period.
- Persistent warning escalation and temporary bans.
- Owner-only `.safety` control panel.
- Audit metadata for every live inbound message with content; no raw inbound chat body stored by the audit log.
- Persistent outbound FIFO around Baileys `sock.sendMessage` and `sock.relayMessage`, including interactive relays.
- Configurable minimum send interval and bounded queue.
- Text responses include queue position, queue ID, estimated wait, and configured pacing interval.
- Pending outbound payloads are stored in private runtime JSON and cleared after send.
- Ambiguous `SENDING` jobs after process interruption become `UNKNOWN`; no blind retry.

## Default policy

- Cooldown: ON, 1,800 ms per command, one notice per cooldown period.
- Anti-spam: ON, 5 messages per 10-second burst window.
- Warning threshold: 3 burst episodes in a rolling 1-hour window.
- Temporary ban: after 5 warning episodes, 15 minutes.
- Transport pacing: ON, 1,200 ms minimum interval.
- Outbound queue: ON, 1,000 pending jobs maximum.

## Commands

See [Traffic Safety Research](../research/TRAFFIC-SAFETY-v0.10.36.md) and root README for complete owner command reference.

## Security boundary

This is not an anti-detection or anti-ban bypass. It does not spoof protocol traffic, imitate human behavior, or manually rotate WhatsApp cryptographic keys. It is a queue, rate-governance, abuse-control, and observability layer.
