# WHISKAY — Contributed Library Governance

**Introduced:** v0.10.39  
**Policy:** source from friends/third-party contributors is preserved verbatim. Runtime integration is implemented only in WHISKAY-owned adapters.

## 1. Non-negotiable preservation boundary

Every feature source explicitly identified as a friend's contribution is classified as `CONTRIBUTED_IMMUTABLE` unless the author grants written permission for source modifications. Do not reformat, rename, refactor, fix bugs inside, remove watermark/credits, alter attribution, or merge multiple authors' sources together. A bug or incompatibility in an upstream file is handled by an adapter, a shim outside the source, a pinned dependency, or a documented compatibility decision. If the feature cannot be safely adapted without editing the contribution, disable it and explain the blocker.

Directory convention:

```text
library/
  contributed/
    cjs/                 # CommonJS contributions; isolated package.json scope
    esm/                 # ESM contributions
    python/              # Python contributions
    assets/              # author-supplied static assets if redistribution is permitted
  assets/                # WHISKAY-owned runtime assets
src/
  library/
    adapters/            # WHISKAY-owned control plane and integration
```

The contribution folder is not an active plugin directory and is not loaded by `PluginLoader`. The adapter is the only integration point with WHISKAY runtime APIs.

## 2. Intake and provenance manifest

For every new contribution, record:

- displayed name and feature type;
- creator/author exactly as supplied;
- source URL and exact upstream file URL;
- retrieval timestamp and upstream commit/blob SHA where available;
- local path, module format, license/permission evidence, dependencies and runtime assumptions;
- SHA-256 of the preserved local source;
- asset/font origins and redistribution restrictions;
- supported adapter capabilities and known limitations.

Use a manifest such as `library/contributed/manifest.json` when the collection grows beyond a handful of files. Never infer an open-source license from a public GitHub URL. A visible source is not automatically permission to redistribute. Obtain the author's permission or confirm a license before public release packaging; until then, classify the contribution as private-only and keep attribution intact.

## 3. Adapter control plane

The adapter owns all flexibility:

- input mapping and validation;
- output formatting, WhatsApp send method and quoting;
- layout, text, colors, dimensions, font paths and presets;
- provider selection and ordered fallbacks;
- timeout, retries, redirect policy, host allowlists and response-size bounds;
- dependency checks, circuit breakers and health status;
- observability and redacted error messages;
- command metadata, aliases, help, config and diagnostics.

Adapters may import a contribution only when its exported contract is usable. A script-style snippet with free variables (for example `conn`, `m`, or top-level `await` in a `.cjs` path) is not a normal reusable CJS module. It should be archived as a source artifact and adapted by re-implementing its documented algorithm in WHISKAY-owned code, or wrapped only with explicit permission. Do not execute arbitrary contributed snippets with `eval`, `vm`, dynamic source rewriting, or privileged owner runtime.

## 4. Module boundaries

The project root uses ESM (`package.json` has `type: module`). CJS contributions must be placed under a nested directory with `package.json` declaring `type: commonjs`, or use the `.cjs` extension. ESM adapters can load actual CJS exports via `createRequire()`; do not assume a script snippet with no `module.exports` exposes a callable function. Keep each source's module boundary local and explicit. See Node.js module documentation: https://nodejs.org/api/modules.html and https://nodejs.org/api/esm.html.

## 5. Fallback contract

A fallback is an explicit ordered strategy, not a blind retry. Each provider/renderer should return a normalized result or a typed failure (`UNAVAILABLE`, `TIMEOUT`, `INVALID_INPUT`, `UNSUPPORTED_FORMAT`, `RATE_LIMITED`, `UPSTREAM_ERROR`). The adapter may move to the next candidate only when the failure class is safe to retry. Do not retry an ambiguous WhatsApp send: the remote delivery may already have occurred. Distinguish render fallback from outbound transport fallback. Every fallback must preserve credit requirements and disclose when output quality or format changes.

## 6. Security requirements

- HTTPS only for remote assets; explicit host allowlist; reject redirects unless each hop is revalidated.
- Bound input text, dimensions, download bytes, output bytes, concurrency and timeouts.
- Never fetch a user-supplied arbitrary URL by default. Use approved asset URLs or an allowlisted proxy/provider implementation.
- Do not load fonts from arbitrary local paths or trust symlink paths for private assets.
- Keep credentials in environment secrets; never in manifest/source/config committed to Git.
- Sanitize errors before replying; detailed stack traces belong in owner-only logs with redaction.
- Run adapters with the bot's least privilege and existing authorization/anti-spam controls.
- Verify license/permission and upstream integrity before packaging third-party source.

## 7. First contribution: Kata Bang Windah [IMAGE CANVAS]

| Concern | Path / value |
|---|---|
| Preserved CJS script | `library/contributed/cjs/katabangwaindah.canvas.cjs` |
| CJS boundary | `library/contributed/cjs/package.json` |
| Control plane + command | `src/library/adapters/katabangwaindah.mjs` |
| Tests | `test/contributed-library.test.mjs` |
| Creator | Rizkyrohan |
| WhatsApp source channel | https://whatsapp.com/channel/0029VbDWBmtA89MamPba8q3f |
| GitHub file | https://github.com/rzkrohan/scraper/blob/main/image/katabangwaindah%5BCanvas%5D.js |
| Font origin | https://github.com/rzkrohan/Font/blob/2e114f4712fbab9e290cb822ab7bfe0b02bbcaab/arialnarrow.ttf |
| Background origin | https://raw.githubusercontent.com/rzkrohan/image-canvas/refs/heads/main/IMG-20261110-WA0238.jpg |

The original is a script-style snippet, not an exported module: it assumes `conn`, `m`, hard-coded content and an external font path. The adapter therefore implements the canvas algorithm using `@napi-rs/canvas`, accepts command text, and never executes the source snippet. It keeps upstream creator/source attribution in the immutable source copy and includes the creator attribution in command help. The original snippet's copyright/permission status was not established by the supplied references; treat this as private-use integration pending license/author permission before public redistribution.

### Command surface

- `.katabg <text>` — render a quote image.
- `.katabg preview <text>` — explicit render alias.
- `.katabg set responseStyle detailed` — persist response format.
- `.katabg set width 1800` — persist canvas width.
- `.katabg reset` — restore all defaults.
- `.katabg config` — inspect effective configuration.
- `.katabg set <key> <value>` — validate and persist a setting.
- `.katabg reset` — reset to built-in defaults.
- `.katabg help` — usage and source credit.

Aliases: `.katabangwaindah`, `.windahcanvas`.

### Adapter configuration

The adapter stores mutable runtime settings in `data/contributed-config/katabg.json` (created on first change, mode 0600). Use `.katabg set <key> <value>` and `.katabg reset`; changes are validated and written atomically. Supported response styles are `minimal`, `compact`, `standard`, and `detailed`. The default schema remains in `DEFAULTS` inside `src/library/adapters/katabangwaindah.mjs`. Font paths are deliberately not mutable through commands and are restricted to `library/assets/fonts/`. No configuration value is injected into the contributed file.

The default font is optional. When `library/assets/fonts/arialnarrow.ttf` is present it is registered under `Arial Narrow`; otherwise the canvas runtime's fallback font is used. The upstream font link is recorded, but the font binary is not bundled until its redistribution rights and retrieval integrity are confirmed.

### Known constraints

The provided `@napi-rs/canvas` snippet uses a fixed background image URL, a 1594×3200 canvas, fixed offsets and a hard-coded example string. The adapter exposes these as controlled inputs. The default background host is pinned to `raw.githubusercontent.com`; redirects are rejected and content type/size are bounded. The image itself is fetched at runtime, therefore availability depends on network and upstream asset availability.

## 8. Future contribution intake checklist

1. Identify exact source file and creator; capture source and commit/blob identity.
2. Confirm usage/redistribution permission; preserve source untouched.
3. Place source in the correct module scope and record hash/provenance.
4. Inspect free variables, module exports, dependency assumptions, network requests, credentials, filesystem access and side effects.
5. Define a normalized adapter API and controlled config schema.
6. Add provider/renderer fallback policy and safety bounds.
7. Add command/help/config/status only after adapter contract works.
8. Add isolated unit tests and integration/loader tests; include a regression asserting the source snapshot remains unchanged.
9. Update README, project map, changelog, release/upgrade/QA notes and source manifest.
10. Run full QA; report live integrations separately from mocked tests.

## 9. Rollback

Disable the adapter command first or remove its `.mjs` adapter from the active plugin directory. Keep the contributed file, provenance, credits and manifest untouched. No persistent user state is created by the Kata Bang Windah adapter. To revert the whole feature, remove the adapter, test and docs entries, revert the canvas dependency declaration/package lock when available, and remove `library/` only after confirming no other contributions depend on it.

## 10. Runtime registry bridge

The adapter implementation is imported by the minimal plugin bridge at `src/plugins/contributed-katabangwaindah.mjs`. This file contains no rendering/configuration logic; it exists only because the current plugin registry intentionally scans `src/plugins/*.mjs`. The `library/` contribution store itself remains outside the registry and outside hot-reload plugin discovery. Dependency-aware source snapshots already copy `src/`, so the adapter is included in snapshot reloads. The release packager explicitly includes `library/`.
