# Upgrade Guide — WHISKAY v0.10.8

**From:** v0.10.7  
**To:** v0.10.8  
**Migration type:** backward-compatible JSON campaign fields; no destructive migration

## 1. Before upgrading

1. Stop WHISKAY with `Ctrl+C` and confirm the process exited.
2. Make a private copy of `data/instagram-growth.json`, `data/growth-queue.sqlite` and its sidecars, `data/instagram-stats.json`, `data/instagram-safety.json`, `session/`, `auth_ig/`, `.env`, and `config/app.json`.
3. Keep the backup outside the source release directory. Never put secrets or session files into the release ZIP.
4. Verify the current source version with `npm run version:check`.

## 2. Install source

Extract `WHISKAY_v0.10.8_SOURCE.zip` into a clean release directory. Copy only your private local `.env`, `config/app.json`, and required runtime state according to the project backup procedure. Do not overwrite or delete the existing database/session state without a deliberate migration plan.

```bash
npm install
npm run validate
npm run check
npm run docs:check
npm test
npm run doctor
```

## 3. New commands

```text
.igcampaign goal <ID> <target_followers> <YYYY-MM-DD>
.igfunnel <campaign-id>
```

Take an initial `.igsync` snapshot before creating a campaign when possible. If a campaign already exists without a baseline, its first `.igcampaign checkpoint <ID>` can serve as the fallback baseline.

Record Insights only after copying Reach, Impressions, Profile visits and Follows from the same Instagram Insights date range:

```text
.igcampaign insights <ID> <reach> <impressions> <profile_visits> <follows>
.igfunnel <ID>
.igcampaign progress <ID>
```

## 4. Configuration and data impact

- No new `.env` variable.
- No new `config/app.json` key.
- No SQLite schema or queue migration.
- New campaign fields are optional: `insightsHistory` (maximum 90 snapshots) and `followerGoal`.
- `campaign.insights` continues to contain the latest snapshot.
- Old records lacking the new properties remain readable. On the next Insights write, an existing latest snapshot is retained as the initial history item.
- A target requires a baseline and must be above it; deadline must be 1–730 days from current UTC date.

## 5. Rollback

1. Stop the running process.
2. Restore the previous v0.10.7 source release.
3. Keep the same private data backup. v0.10.7 ignores the additional optional JSON campaign properties and continues reading `campaign.insights` as before.
4. Do not remove new campaign fields manually unless the application is stopped and a verified JSON backup is available.
5. Run `npm test` and `npm run validate` on the restored release before starting it.

## 6. Known limitations

- Funnel metrics are manually entered and depend on correct period selection in Instagram Insights.
- Follower delta is account-level net change, not causal attribution to a campaign.
- Goal pace is required net change per day, not forecast or guaranteed result.
- Live Instagram, WhatsApp, ads, and creator collaborations are not exercised by automated QA.
