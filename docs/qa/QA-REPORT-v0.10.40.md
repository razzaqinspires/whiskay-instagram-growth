# QA Report — v0.10.40

## Scope

Instagram provider fallback control plane, existing KOL.ID adapter bridge, immutable source intake, manifest provenance, and documentation.

## Results

| Check | Result |
|---|---:|
| New fallback and source-integrity tests | 4/4 passed |
| Existing KOL downloader tests | 6/6 passed |
| Combined focused tests | 10/10 passed |
| JavaScript syntax check | 137 files passed |
| Full project tests | 357 passed / 3 failed |
| Documentation check | Passed |

## Existing full-suite failures

The same three legacy failures observed against the v0.10.39 input archive remain:

1. `test/order-engine.test.mjs` fails while importing the legacy order engine.
2. `test/part4-integration.test.mjs` expects `src/growth/order-engine.mjs` to be absent, but that file remains in the supplied archive.
3. `test/sqlite-queue.test.mjs` fails while importing the legacy queue module.

These files/tests were not modified by this release. They are recorded as inherited baseline failures, not attributed to the Instagram fallback changes.

## Security and integration status

- KOL.ID is the only active provider.
- Snapgram and iGram source files are stored verbatim and remain quarantined.
- No Turnstile-solving service is invoked.
- No downloaded remote JavaScript is evaluated.
- WhatsApp send operations are not retried by the extraction fallback engine.
- Live upstream availability and end-to-end WhatsApp delivery were not tested.

## Source integrity

SHA-256 values are recorded in `library/CONTRIBUTION-MANIFEST.json`. Source copies are checked against the exact bytes extracted from the user-provided attachment. Permission status remains unverified/private-use-only.

## Final status

The new fallback engine and KOL downloader regression suite pass. Full suite remains blocked by three inherited Growth/order/queue failures.


## Configuration validation

`node scripts/validate-config.mjs` cannot pass in this clean archive because `config/app.json` lacks the required WhatsApp pairing and owner numbers. This is an inherited deployment configuration requirement; no credentials were added to the release archive.
