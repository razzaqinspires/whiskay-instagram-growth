# Upgrade Guide — WHISKAY v0.10.26

## Changes

This version restores owner-only execution prefixes as a special message-ingress path, not as plugin commands. It adds Go using `>>>` and retains the other interfaces: `>` async JavaScript, `=>` expression/return JavaScript, `$` Bash CLI, and `>>` Python 3.

## Upgrade steps

1. Back up `.env`, `config/app.json`, `session/`, `auth_ig/`, and `data/` outside the project directory.
2. Stop the existing WHISKAY process with one `Ctrl+C` and confirm it exits.
3. Extract the new source release into a clean versioned directory; do not overlay it on a running directory.
4. Merge the `ownerCode` object from `config/app.example.json` into the existing `config/app.json`. Preserve owner phone numbers, paths, and all existing operator settings. `ownerCode.enabled` defaults to `true` if omitted; set it to `false` to disable code execution.
5. Confirm `python3`, `go`, and `/bin/bash` exist if those runtimes are needed. Go external module downloads are disabled by this runner.
6. Install exact project dependencies with `npm install`, then run `npm run validate`, `npm run check`, `npm run docs:check`, `npm test`, and `npm run security:permissions`.
7. Start with `npm start`. Test code prefixes only in the owner's private self-chat.

## Data and rollback

The patch does not migrate or delete WhatsApp/Instagram sessions, SQLite databases, campaign records, or existing data. Temporary Python/Go sources are written below `data/owner-runtime/` and removed after completion. To roll back, stop WHISKAY and restore the prior source directory and the matching backup config; retain runtime data unless a separate recovery plan calls for it.

## Important security note

The owner runtime can execute arbitrary code with the WHISKAY OS user's permissions. Never expose it to groups, public users, or direct chats with other recipients. See [Owner Code Runtime](../OWNER-CODE-RUNTIME.md).
