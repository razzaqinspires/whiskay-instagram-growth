# QA Report — WHISKAY v0.10.36

## Scope

Persistent cooldown, anti-spam warning escalation, temporary ban list, all-live-message metadata audit, owner controls, outbound FIFO, transport pacing, and restart ambiguity handling.

## Test cases

- Live inbound audit persists sender/message/type metadata without raw inbound body.
- Cooldown accepts first command and emits only one notice during active cooldown.
- Cooldown and inbound decisions persist to JSON.
- Repeated burst episodes escalate through hold, warning, and temporary ban.
- Active ban blocks subsequent command attempts; manual unban clears the ban.
- Safety settings persist and validate numeric bounds.
- Outbound queue serializes `sendMessage` and direct `relayMessage` sends, adding queue position and pacing metadata.
- Ambiguous `SENDING` jobs are marked `UNKNOWN` and are not replayed after restart.
- Owner safety controls remain protected in PUBLIC mode.

## Execution results

- `node --test test/traffic-safety.test.mjs`: 8/8 PASS.
- `npm test`: 328/328 PASS.
- `npm run check`: 118 JavaScript files PASS.
- `npm run docs:check`: 164 documentation records indexed and validated.

## Limitations

- No live WhatsApp session/device test was performed.
- No visibility into WhatsApp's internal anti-abuse classifier or enforcement signals.
- Conservative pacing is not a guarantee against account restrictions.
- Ambiguous relay outcomes are marked `UNKNOWN` and require owner review; no blind retry.
