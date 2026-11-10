# WHISKAY v0.10.39 — Isolated Contributed Library

## Added

- Preservation-first library layout under `library/contributed/` with an explicit nested CommonJS package boundary.
- Immutable source snapshot for Rizkyrohan's Kata Bang Windah [IMAGE CANVAS] contribution.
- WHISKAY-owned canvas control plane at `src/library/adapters/katabangwaindah.mjs`.
- Thin plugin bridge at `src/plugins/contributed-katabangwaindah.mjs`.
- Commands: `.katabg <text>`, `.katabg preview <text>`, `.katabg config`, `.katabg help`; aliases `.katabangwaindah` and `.windahcanvas`.
- Contribution manifest and governance guide for future CJS/ESM/Python and other contributed packages.
- Test coverage for preserved source markers, config guardrails, text layout, and injected renderer path.

## Architecture

`library/contributed/` is outside active plugin discovery and is not hot-reloaded as a plugin. The adapter is under `src/` and is loaded via a one-line `.mjs` bridge in `src/plugins/`. All custom behavior is outside the contributor file. The release packager includes `library/` so the preserved contribution and manifest travel with the release.

## Dependency and asset notes

- Declared production dependency: `@napi-rs/canvas ^0.1.80`.
- Package-lock generation was attempted but the npm registry lookup failed with `EAI_AGAIN`; no lockfile update is claimed.
- The upstream font binary was not copied. If the Arial Narrow asset is present at `library/assets/fonts/arialnarrow.ttf`, the adapter registers it; otherwise the renderer uses its installed fallback font.
- Background image download is pinned to `raw.githubusercontent.com`, HTTPS only, no redirects, content type and response bytes bounded.
- Upstream source/license permission was not established by the provided URLs; keep private pending confirmation before public redistribution.

## Compatibility

- Requires Node.js 22.5–22.x as declared by this project.
- Existing plugin loader, command authorization, anti-spam and WhatsApp message router remain the dispatch/transport owners.
- The contributed CJS file is a script-style snippet with free runtime variables and no exported API; the adapter does not execute it or patch it.
