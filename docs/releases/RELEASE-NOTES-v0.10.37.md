# WHISKAY v0.10.37 — Eval Master Reliability

## Changes

- Added end-to-end owner runtime dispatch tests through `handleMessage()` for `>`, `=>`, `$`, `>>`, and `>>>`.
- Added ingress diagnostics for detected Eval Master prefixes without logging submitted source code.
- Kept execution restricted to live Baileys `notify` messages; history/backfill is never executed.
- Bound session PN/LID identity from authenticated Baileys credentials where available.
- Tightened private self-chat validation: `remoteJidAlt` is no longer treated as destination proof; `remoteJid` and `remoteJidPn` are used.
- Parser accepts one terminal WhatsApp-copy backslash marker and balanced Markdown code fences.
- Added persistent owner runtime audit at `data/owner-code-audit.json`, storing source hash and execution metadata only.

## Prefixes

- `>` JavaScript async body
- `=>` JavaScript expression / explicit return
- `$` Bash
- `>>` Python
- `>>>` Go

Eval Master remains a special owner-only syntax and is not a regular command or menu item.

## Security

The runtime is privileged execution and not a sandbox. It must remain owner-only and the bot should run under a dedicated non-root OS account.
