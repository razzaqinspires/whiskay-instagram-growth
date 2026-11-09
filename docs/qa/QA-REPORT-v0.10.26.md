# QA Report — WHISKAY v0.10.26

**Date:** 9 November 2026  
**Package:** `whiskay-instagram-growth@0.10.26`

## Tests run in the source workspace

| Test | Result |
|---|---|
| `node --test test/owner-code-runtime.test.mjs` | PASS — 13 tests, 0 failed |
| Related config/ingress/runtime/LID + owner runtime tests | PASS — 33 tests, 0 failed |
| `npm run validate` | PASS — temporary config with placeholder owner/pairing number, no real operator identity |
| `npm run check` | PASS — 109 JavaScript files syntax-validated |
| `npm run docs:check` | PASS — 124 docs indexed and 16 maintained scripts catalogued |
| Owner prefix parser | PASS — `>`, `=>`, `$`, `>>`, `>>>` |
| Owner private self-chat gate | PASS — rejects `fromMe=false`, contact chat, group, mismatched session; accepts mapped owner LID |
| JavaScript async eval | PASS |
| JavaScript expression/return eval | PASS |
| JavaScript synchronous execution timeout and never-settling Promise timeout | PASS |
| Bash CLI execution and timeout | PASS |
| Python 3 execution | PASS |
| Go execution | PASS — `go1.23.2`, external module download disabled |
| Output cap | PASS |

## Implementation notes

- Owner code paths are recognized by `messages.upsert` before normal command dispatch but are never added to `PluginLoader` or `.menu`.
- Owner authorization is checked by the existing WhatsApp owner authorization layer, then narrowed to `fromMe=true`, authenticated session PN equality, and private destination PN equality with the configured owner.
- Execution is single-flight. External processes use `spawn(..., shell:false)` and are terminated as a process group on timeout/output overflow. Shell semantics are provided by explicitly launching Bash with the owner-supplied shell program.
- JS eval receives WHISKAY runtime references (`sock`, `msg`, `key`, `ctx`, `config`, `reply`, `send`, `pluginLoader`, `lidManager`, `logger`, `process`, `require`). It is privileged by design and not a sandbox.
- Python and Go source files are temporary, mode 0600, under `data/owner-runtime/`, and are removed after execution.

## Not verified

A full `npm test` was not run: `npm install --ignore-scripts` could not resolve `registry.npmjs.org` (DNS `EAI_AGAIN`), so Baileys dependencies were unavailable. The private self-chat check is covered with deterministic unit cases, but actual Baileys LID/PN fields should be confirmed with the owner's own session. Full project test suite and dependency audit are not claimed here because production dependency installation was blocked by DNS/network availability.
