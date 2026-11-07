# QA Report — WHISKAY v0.10.0

Date: 2026-11-06
Source baseline: v0.9.4 uploaded archive

## Automated checks

| Check | Result |
|---|---:|
| ESM syntax validation | 56 files passed |
| Full Node test suite | 79 passed, 0 failed |
| Campaign baseline/checkpoint/Insights tests | 2 passed |
| Instagram snapshot persistence tests | 2 passed |
| Plugin loader and unique analytics command registration | passed |

## Scope verified

- `.igstats` remains the latest-snapshot summary.
- `.iggrowth [7|30|90]` is registered as a distinct command and not as an alias of `.igstats`.
- `.ighistory [jumlah]` is registered separately.
- Campaign baseline snapshots persist.
- Campaign checkpoint snapshots persist with source validation.
- Manually entered Instagram Insights values are validated and persisted.
- Campaign progress calculates account-level follower delta and relative growth.
- Existing campaigns remain compatible because new fields are optional and default to empty values.
- Campaign checkpoint uses the existing session-only/read-only Instagram synchronization path, including its safety cooldown.
- Upgrade script is designed to patch exact source files only, back up the full target project, and restore patched files if QA fails.

## Not tested / not claimed

- Live Instagram login, challenge handling, remote Insights access, ad delivery, creator collaboration execution, or any increase in followers.
- The adapter currently does not retrieve reach or impressions; the campaign Insights command accepts values copied manually from Instagram Insights.
- No automated follower delivery, follow/unfollow, engagement manipulation, or anti-enforcement evasion is included.

## Release exclusions

The release ZIP omits `.env`, `config/app.json`, WhatsApp/Instagram session files, runtime `data/`, SQLite databases, `node_modules`, Python virtual environments, backups, and `.git`.
