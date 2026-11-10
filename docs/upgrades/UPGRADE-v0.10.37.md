# Upgrade WHISKAY v0.10.37

## Before upgrade

Stop the bot. Back up `.env`, `config/app.json`, `session/`, `auth_ig/`, `data/`, and locally maintained plugins.

## Install

1. Extract `whiskay-instagram-growth-v0.10.37.zip` into a new directory.
2. Run `npm install`.
3. Copy `.env`, `config/app.json`, WhatsApp session, Instagram auth, and runtime data selectively from the previous installation.
4. Preserve existing `data/whatsapp-traffic-safety.json` and `data/whatsapp-outbound-queue.json`.
5. New file `data/owner-code-audit.json` is created automatically. The optional `ownerCode.auditFile` setting defaults to that path.
6. New file `data/owner-code-audit.json` stores source hashes and execution metadata only; raw code/output are not retained.
7. Run `npm run validate`, `npm run check`, `npm run docs:check`, and `npm test`.
8. Start WHISKAY and check logs for `[OWNER RUNTIME] Prefix detected at WhatsApp ingress`.

## Eval Master test

Send each of these from the authenticated owner's private self-chat:
- `=> 1 + 1`
- `> return await Promise.resolve("async-ok")`
- `$ ls`
- `>> print("python-ok")`
- `>>> package main` followed by a Go `main()` program

An empty prefix such as `>>` or `>>>` should return usage examples. A terminal copied backslash is normalized. The bot must return a result message for each execution.

If no result appears, inspect ingress logs:
- No prefix-detected log: Baileys event did not reach the handler or text extraction did not recognize the message.
- Prefix detected with non-`notify` event: history/backfill was intentionally not executed.
- Authorization rejection: inspect `fromMe`, session PN match, and self-chat destination mapping.
- Execution completed with failure: inspect the returned runtime error and ensure Bash/Python/Go are installed.

Do not share raw secrets, session files, source code snippets containing secrets, or full JIDs in support logs.

## Rollback

Stop the process and restore the previous source release. Keep `data/owner-code-audit.json` separately if you want to retain execution metadata. The previous version will not read this audit file.
