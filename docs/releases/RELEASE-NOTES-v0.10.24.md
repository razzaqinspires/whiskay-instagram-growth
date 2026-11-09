# Release Notes v0.10.24 — Isolated AI Scrape Gateway

Date: 8 November 2026

## Added

- Owner-only `.aiscrape` command with aliases `.irfanscrape` and `.scrapeai`.
- Local-only `help`, `info`, and `status` actions plus explicitly confirmed `.aiscrape run CONFIRM <url> | <prompt>`.
- Isolated HTTPS gateway adapter with exact hostname allowlist, Bearer token from environment, DNS public-address checks, redirect rejection, bounded response, timeout, and non-secret error mapping.
- Configuration for model alias, thinking level, and fast-mode setting without introducing a new npm dependency.
- Documentation of the unverified `irfan-cpp` source and the gateway contract.

## Security decisions

- No `irfan-cpp` dependency is installed. Package source, npm metadata, license, repository, lifecycle scripts, transitive dependencies, and provenance were not verified.
- The adapter does not send the snippet's `voucher`, `token_router`, or `light_house` fields.
- The feature is disabled by default and requires an explicit owner-side environment configuration.
- One URL and prompt are sent per confirmed request; no conversation history, session, cookie, local file, or other message content is attached.

## Compatibility

- Node.js 22.5–22.x remains required.
- No database, session, or schema migration.
- No new npm dependencies.
- Public mode does not expose `.aiscrape`; normal self-mode owner authorization applies.

See [Upgrade Guide v0.10.24](../upgrades/UPGRADE-v0.10.24.md), [QA Report v0.10.24](../qa/QA-REPORT-v0.10.24.md), and [Irfan Scrape Gateway Audit](../IRFAN-CPP-INTEGRATION.md).
