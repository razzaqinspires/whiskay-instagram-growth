# Upgrade Guide v0.10.24

## Apply

1. Back up the current source tree using the existing release procedure.
2. Apply the v0.10.24 patch/source archive over the project root.
3. Keep `.env`, `config/app.json`, WhatsApp/Instagram sessions, and `data/` private; the patch does not replace these files.
4. Run:

```bash
npm run check
npm run docs:check
node --test test/irfan-scrape-adapter.test.mjs test/ai-scrape-plugin.test.mjs
npm test
```

No `npm install` is required for this feature because no new dependency was added.

## Enable only after gateway review

AI scraping is disabled by default. Do not activate it until the gateway owner, HTTPS endpoint, data retention policy, request contract, and any usage charges have been checked. Add the `IRFAN_SCRAPE_*` variables described in `.env.example` to the local `.env`; do not paste tokens into WhatsApp or commit them.

The allowlist value must be the exact hostname of `IRFAN_SCRAPE_API_URL`. `IRFAN_SCRAPE_API_TOKEN` must be at least 16 characters. Restart WHISKAY after editing `.env`, then use `.aiscrape status` to inspect local configuration without performing a provider request.

Test a single low-sensitivity public URL with explicit confirmation:

```text
.aiscrape run CONFIRM https://example.com/ | Summarize this public page in three bullet points.
```

## Rollback

Remove `src/plugins/ai-scrape.mjs` and `src/ai/irfan-scrape-adapter.mjs`, remove the two tests, and restore `package.json`, README, changelog, `.env.example`, and the version 0.10.23 documentation index. Remove the local `IRFAN_SCRAPE_*` values from `.env`. No persistent state or database migration is created by this feature.
