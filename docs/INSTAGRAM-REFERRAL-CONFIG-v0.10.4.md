# Instagram Platform & Referral configuration (v0.10.4)

## Important distinction: two different APIs

- Instagram API host is Meta's official `graph.instagram.com` for Instagram Login, or `graph.facebook.com` for Facebook Login. This configuration is disabled by default and is for supported account/media/insights operations. It is not an endpoint for following accounts, injecting followers, sending unsolicited DMs, or searching arbitrary Instagram users.
- Referral claims belong to your own WHISKAY backend. They must not be sent to Instagram. The referral endpoint is therefore separately allowlisted and locked to `/v1/referrals/claims`.

## Add sections to config/app.json

Run `node scripts/merge-platform-config.mjs`. It fills only missing keys from `config/app.example.json`; existing values are preserved. The current migration helper writes a private timestamped config backup to a sibling directory outside the project root, performs an atomic replacement, and keeps the resulting `config/app.json` owner-only. Secrets remain in `.env`, not JSON.

## Environment secrets

```env
INSTAGRAM_GRAPH_ACCESS_TOKEN=YOUR_META_OAUTH_ACCESS_TOKEN
REFERRAL_SERVICE_TOKEN=YOUR_OWN_BACKEND_SERVICE_TOKEN
REFERRAL_WEBHOOK_SECRET=RANDOM_HMAC_SECRET_AT_LEAST_32_CHARACTERS
```

Do not commit `.env` or put tokens in `config/app.json`.

## Instagram API selection

`instagram.platformApi.loginMethod` accepts `instagram_login` or `facebook_login` and validates the corresponding official host. `apiVersion` must be set to a currently supported Meta version before enabling the API. Keep `enabled:false` until OAuth consent, token scopes, token expiry handling, and account type have been configured.

`instagram.targeting.mode` accepts `manual` or `automatic`:

- `manual`: uses explicitly listed usernames / approved creator directory.
- `automatic`: ranks candidates already present in the locally approved creator directory using configured niche, location and public metrics. It does not discover arbitrary Instagram accounts through unsupported endpoints.

Both modes require owner approval. Allowed actions are limited to review, campaign link, and collaboration invitation. Automated follow/unfollow/like/comment/DM are intentionally unavailable.

## Referral settings

The referral endpoint must be an HTTPS endpoint on one of `allowedHosts`, with exact path `/v1/referrals/claims`. The webhook accepts only verified signup events signed by the backend. Keep `autoProcess:false` until staging has been validated. The referral service token and HMAC secret are read from environment variables.
