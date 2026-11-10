# Instagram Multi-Provider Fallback — v0.10.40

## Purpose

The existing `.igdl` command now calls a WHISKAY-owned provider engine rather than calling KOL.ID directly. The engine normalizes provider invocation, records provider health, moves to the next enabled provider after a safe extraction failure, and exposes provider status.

## Current operational state

| Provider | State | Runtime behavior |
|---|---|---|
| KOL.ID | Active | Existing downloader is the only enabled provider in this release |
| Snapgram.io contribution | Quarantined | Source preserved; not executed |
| iGram.world contribution | Quarantined | Source preserved; not executed |

This is a real failover control plane, but Snapgram and iGram are not active fallbacks. Their supplied implementations depend on automated Turnstile solving. The iGram implementation additionally downloads remote JavaScript and evaluates it in `node:vm` to obtain a request signer. WHISKAY does not enable CAPTCHA solving or remote-code execution as a fallback mechanism. A provider can be activated only through a separate reviewed adapter using a permitted access method.

## Commands

- `.igdl <instagram_url>` — extract and send public media using the active provider chain.
- `.igdl extract <instagram_url>` — extract media information without downloading media bytes.
- `.igdl info` — inspect active provider page metadata.
- `.igdl providers` — inspect active provider health and quarantined contributions.
- `.igdl help` — usage and limitations.

## Fallback contract

The adapter at `src/library/adapters/instagram-fallback.mjs` accepts provider objects implementing `extract(url, { download })`, and expects `{ result, media }`. It tries enabled providers in declared order. Failed providers increment health counters; three consecutive failures trigger a one-minute cooldown. A success resets the consecutive-failure counter. The engine returns the selected provider and attempt outcomes.

Only extraction failures trigger provider failover. WhatsApp media sending occurs after extraction and is not retried by this engine, avoiding duplicate sends when delivery state is ambiguous. The current active chain contains KOL.ID only; future reviewed adapters can be injected into the engine without changing contributed source files.

## Immutable contribution intake

Two user-supplied CJS files are stored unchanged:

- `library/contributed/cjs/snapgram-scraper.cjs`
- `library/contributed/cjs/igram-world-scraper.cjs`

Their SHA-256 hashes and intake metadata are recorded in `library/CONTRIBUTION-MANIFEST.json`. Both are classified `unverified-private-use-only` and `quarantined`. No edits, formatting, refactoring, or secret removal were made inside either contributed file.

## Security findings

Both pasted sources contain the same hard-coded third-party solver API credential. Treat it as exposed and ask the credential owner to rotate/revoke it. The source is preserved verbatim by the immutable-contribution rule, but is not imported or executed by WHISKAY.

Snapgram requires a Turnstile-solving service. iGram requires Turnstile-solving and evaluates downloaded JavaScript inside a VM context. These mechanisms are not enabled by the adapter. The `node:vm` module is not a security boundary for hostile code, and downloaded remote code must not be treated as trusted.

No solver key is copied into `.env`, config, logs, or the provider engine. No automatic CAPTCHA bypass is performed.

## Files changed

- `src/library/adapters/instagram-fallback.mjs` — provider orchestration, health state, cooldown, and failover contract.
- `src/plugins/kol-instagram-downloader.mjs` — command bridge to the provider engine; adds `.igdl providers`.
- `library/contributed/cjs/snapgram-scraper.cjs` — immutable contributed source.
- `library/contributed/cjs/igram-world-scraper.cjs` — immutable contributed source.
- `library/CONTRIBUTION-MANIFEST.json` — provenance, SHA-256, permission and quarantine status.
- `test/instagram-fallback.test.mjs` — fallback, error redaction and quarantine tests.

## QA and limitations

Unit tests cover ordered fallback, failure accounting, secret redaction, and quarantine state. They do not prove live provider availability or WhatsApp delivery. KOL.ID remains the only live enabled provider. Snapgram and iGram are archived for future review and are not advertised as working fallback providers.

## Rollback

Disable the bridge by reverting `src/plugins/kol-instagram-downloader.mjs` and `src/library/adapters/instagram-fallback.mjs`. Keep the contributed source files and manifest entries intact for provenance. Do not delete or edit the immutable source files during rollback.
