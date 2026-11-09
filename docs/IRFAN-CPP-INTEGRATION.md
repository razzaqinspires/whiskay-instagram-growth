# AI Scrape Gateway — audit and integration boundary

## Audit result (2026-11-08)

The request supplied a CommonJS example:

```js
const { Scrape } = require('irfan-cpp');
const client = await Scrape.build();
const result = await client.scrape({
  prompt: '...',
  url: '...',
  voucher: 'gpt_6.cc',
  settings: {
    model: 'gpt-6-astra',
    thinking: 'max',
    token_router: 'irfan-72.cc',
    light_house: 'cloudflare-ccps.cdp.cl',
    use_fast: true
  }
});
```

That snippet is not sufficient to verify the package's behavior. The public package metadata/source could not be reliably retrieved from the build environment; `npm view irfan-cpp` timed out, web search did not return an attributable package/repository listing, and no tarball, license, lockfile entry, install scripts, dependency tree, or source code was available for inspection. The separate scraper source URL `https://code.jhx.my.id/rbpf` was also unavailable during source review.

This is **not a finding that the package is malicious or nonexistent**. It means provenance, source, license, request destinations, data retention, voucher purpose, and dependency behavior remain unknown. WHISKAY therefore does not install or execute `irfan-cpp` in this release.

## Implemented boundary

A WHISKAY-owned adapter now exposes the explicit command surface:

```text
.aiscrape help
.aiscrape info
.aiscrape status
.aiscrape run CONFIRM https://example.com/article | Ringkas isi artikel dan buat lima poin utama.
```

Aliases: `.irfanscrape` and `.scrapeai`.

The adapter is not `Scrape.build()` and does not claim wire compatibility with the unpublished/uninspected package. It calls an operator-configured HTTP JSON gateway using this contract:

- Method: `POST`
- URL: exact `IRFAN_SCRAPE_API_URL` value, HTTPS only
- Headers: `Accept: application/json, text/plain`, `Content-Type: application/json`, `Authorization: Bearer <IRFAN_SCRAPE_API_TOKEN>`
- Body:

```json
{
  "url": "https://example.com/article",
  "prompt": "Summarize the page.",
  "settings": {
    "model": "default",
    "thinking": "medium",
    "use_fast": true
  }
}
```

Accepted response examples:

```json
{ "text": "Page summary..." }
```

```json
{ "choices": [{ "message": { "content": "Page summary..." } }] }
```

A plain-text response is also accepted. Result is normalized to text and bounded to 8,000 characters before WhatsApp presentation.

## Commands and controls

| Command | Action |
|---|---|
| `.aiscrape help` | Syntax and limits; does not contact gateway |
| `.aiscrape info` | Data-sharing and security explanation; local-only |
| `.aiscrape status` | Reads local environment configuration; no health request |
| `.aiscrape run CONFIRM <url> \| <prompt>` | One explicit request; sends only that URL, prompt, and configured model controls |

The command uses the project's existing `self`-mode owner authorization. Public mode's allowlist does not include it. Each successful request is rate-limited to one per sender/chat per 30 seconds. The command requires `CONFIRM` because the gateway may consume quota or incur charges.

## Configuration

Add these values to the local `.env` only after verifying the gateway operator and privacy policy:

```dotenv
IRFAN_SCRAPE_ENABLED=true
IRFAN_SCRAPE_API_URL=https://YOUR-TRUSTED-GATEWAY.example/v1/scrape
IRFAN_SCRAPE_API_TOKEN=REPLACE_WITH_A_PRIVATE_TOKEN_AT_LEAST_16_CHARS
IRFAN_SCRAPE_ALLOWED_HOSTS=YOUR-TRUSTED-GATEWAY.example
IRFAN_SCRAPE_TIMEOUT_MS=30000
IRFAN_SCRAPE_MODEL=default
IRFAN_SCRAPE_THINKING=medium
IRFAN_SCRAPE_USE_FAST=true
```

`IRFAN_SCRAPE_API_URL` must be HTTPS, have no embedded credentials/query/fragment, and use the standard HTTPS port. Its hostname must appear exactly in `IRFAN_SCRAPE_ALLOWED_HOSTS`; wildcard host entries are not supported. The token is never accepted from WhatsApp command text and is never included in logs or result messages.

The adapter checks that the endpoint and target hostname resolve only to public IP addresses, rejects localhost/private/reserved addresses, disables redirects, times out requests, limits response bodies to 512 KiB, and maps provider errors to non-secret user-facing messages. DNS checks in the WHISKAY process do not prove that the remote gateway itself safely fetches the target URL; the gateway must independently defend against SSRF, redirects, private-network access, and DNS rebinding.

## Deliberately excluded fields

The supplied snippet includes `voucher`, `token_router`, and `light_house` values pointing at external domains. Their ownership, function, credential semantics, and data routing were not verifiable. These fields are not sent. The default model alias is `default`; set `IRFAN_SCRAPE_MODEL` only to a value that your own gateway documents and supports. `gpt-6-astra` is not treated as an official model identifier by this repository.

No model prompt is automatically populated from other WhatsApp messages. No chat history, WhatsApp session, Instagram session, cookies, credentials, or local files are sent by this adapter. The explicitly supplied URL and prompt are sent to the configured gateway; data logging/retention on that gateway must be reviewed separately.

## Validation

```bash
node --test test/irfan-scrape-adapter.test.mjs test/ai-scrape-plugin.test.mjs
node --check src/ai/irfan-scrape-adapter.mjs
node --check src/plugins/ai-scrape.mjs
```

Tests use mocked DNS and `fetch`; no live provider request was performed. Before enabling a gateway, verify its owner, source/repository, terms, logging/retention, request schema, and usage pricing independently. If the exact `irfan-cpp` source/tarball is supplied later, audit its metadata, license, lifecycle scripts, transitive dependencies, network egress, and provenance before considering a direct package integration.
