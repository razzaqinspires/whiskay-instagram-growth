# QA Report — WHISKAY v0.10.35

## Scope

Owner-controlled notification preferences for unknown command names.

## Results

- `node --test test/commands.test.mjs` — **25/25 PASS**.
- `npm test` — **320/320 PASS**, 0 fail, 0 skipped.
- `npm run check` — **115 JavaScript files PASS**.
- `npm run docs:check` — **160 Markdown documents indexed**, links and 17 maintained scripts valid.

## Coverage

- Default OFF is silent.
- ON emits unknown-command reply.
- OFF returns to silent behavior.
- Settings survive store re-instantiation.
- Aliases `.unknowncmd` and `.unknowncommandnotice` are supported.
- Non-owner cannot modify settings in PUBLIC mode.
- Group setting command is rejected.
- Store uses atomic JSON writes and safe default OFF.

No live WhatsApp device/session test was performed.
