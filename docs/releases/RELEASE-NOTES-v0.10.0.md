# WHISKAY Instagram Growth v0.10.0

## Highlights

- `.iggrowth` is now a dedicated analytics command and no longer an alias of `.igstats`.
- Added `.ighistory` for recent snapshot history.
- Campaigns now have a baseline snapshot, progress report, read-only checkpoint, and manual Instagram Insights fields.
- Upgrade is additive and preserves `.env`, `config/app.json`, WhatsApp/Instagram sessions, databases, and other runtime state.

## Campaign commands

```text
.igcampaign create <nama>|<budget opsional>
.igcampaign list
.igcampaign progress <ID>
.igcampaign checkpoint <ID>
.igcampaign insights <ID> <reach> <impressions> <profile_visits> <follows>
.igcampaign pause <ID>
.igcampaign resume <ID>
.igcampaign complete <ID>
.igcampaign cancel <ID>
```

The checkpoint command uses the current read-only Instagram adapter and existing cooldown. Insights values must be transcribed from Instagram Insights; the adapter does not fetch reach or impressions.

## Not included

No automatic follower delivery, mass follow/unfollow, fake engagement, or anti-ban evasion is implemented. A daily cap does not make artificial follower automation safe. Campaigns measure genuine promotion outcomes instead.

## Compatibility

- Base version: WHISKAY v0.9.4
- Target version: WHISKAY v0.10.0
- Node.js: existing project requirement (`>=22.5.0 <23`)
- No new npm dependencies.
