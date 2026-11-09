# WHISKAY Part 5 — Live Deployment & Runtime Validation

## Scope

Part 5 adds a repeatable runtime smoke test for the active plugin registry. It checks the runtime configuration, plugin discovery, and the critical commands introduced or updated in Parts 1–3 (`.waform`, `.tiktok`, `.aiscrape`) plus their documented aliases. It does not send WhatsApp messages, authenticate a WhatsApp session, download third-party media, or call an external AI gateway.

## New files and changes

- `scripts/runtime-smoke.mjs` — starts the actual `PluginLoader` with file watching disabled, checks config and the active command registry, then closes the loader.
- `package.json` — adds `npm run runtime:smoke`.
- `docs/qa/RUNTIME-VALIDATION-PART5-2026-11-08.md` — deployment and live-test procedure.
- `README.md` — links this report from the QA/deployment documentation section.

## Run on the target server

Run from the WHISKAY project root after applying Parts 1–4 and installing dependencies:

```bash
node --version
npm run validate
npm run check
npm run docs:check
npm test
npm run security:permissions
npm run runtime:smoke
npm run doctor
```

Expected Node runtime: Node.js 22.5–22.x. Do not run two WHISKAY instances concurrently. Stop the old process with one `Ctrl+C` and wait for graceful shutdown before starting the new one. Do not use PM2; `scripts/start.mjs` explicitly rejects PM2-managed execution.

## Controlled live test

1. Start the bot in a terminal with `npm start`.
2. Confirm startup logs show the expected plugin and command counts and that WhatsApp reaches the connected state.
3. From the owner account, run `.ping`, `.menu`, `.plugins text`, `.waform help`, `.tiktok status`, and `.aiscrape status`.
4. Test one `.waform` interface in a private test chat. Do not broadcast or test with a group of unsuspecting users.
5. Test TikTok only with a public URL for media you own or are authorized to save. Confirm both successful retrieval and a controlled error for an unavailable URL.
6. Keep `IRFAN_SCRAPE_ENABLED=false` unless the gateway URL, token, allowlist, privacy terms, and remote-side URL-fetch protections have been reviewed. When enabled, use only a non-sensitive test URL and prompt.
7. Stop with one `Ctrl+C`; verify graceful shutdown and that the runtime lock is released before restarting.

## Safety and rollback

- Back up the project and `data/` before applying updates. Preserve `.env`, `config/app.json`, `session/`, `auth_ig/`, and `data/`.
- Never paste `.env`, pairing codes, QR payloads, session files, API tokens, or full authentication logs into chat.
- If smoke tests fail, do not start production. Capture only sanitized error names and stack frames, restore the source backup, and keep runtime data untouched.
- To roll back, stop WHISKAY, restore the source backup created before patching, reinstall the dependency tree from the matching package manifest, then rerun `npm run validate` and `npm test` before restarting.

## Evidence boundary

A local plugin smoke test proves import/registration only. It does not prove WhatsApp connectivity, provider uptime, account eligibility, media delivery, or AI gateway correctness. Those require the controlled live test on the actual server and account. A deployment is not marked live-verified until those steps have been run and the sanitized results recorded.
