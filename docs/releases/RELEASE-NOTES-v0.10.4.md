# WHISKAY v0.10.4 — Instagram & Referral Configuration

- Adds official Instagram Platform API host selection (`graph.instagram.com` for Instagram Login; `graph.facebook.com` for Facebook Login).
- Adds read-only endpoint map for profile, media, and insights.
- Adds manual and automatic creator-shortlist configuration. Automatic mode ranks only locally approved creator entries and always requires owner approval.
- Adds referral claim and signed webhook configuration separately from Instagram API.
- Secrets are environment-only; `config/app.json` contains variable names, not secret values.
- Adds safe config merge utility that backs up an existing `config/app.json` and fills only missing defaults.
- Does not automate follow/unfollow/like/comment/DM or target arbitrary Instagram accounts through unsupported endpoints.
