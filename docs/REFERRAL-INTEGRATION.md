# WHISKAY Referral Integration

## Flow

1. The account backend completes its normal signup and identity-verification flow.
2. Only after successful verification, the backend issues a short-lived, opaque, one-time `claimToken` and sends a signed webhook with event type `referral.signup.verified`.
3. `src/referral/trigger.mjs` verifies the HMAC signature and a five-minute timestamp window before enqueuing the claim.
4. `src/referral/queue-processor.mjs` stores the pending claim in a private local queue and submits it to the dedicated `/v1/referrals/claims` route.
5. The receiving backend must validate the one-time token, account eligibility, referral ownership, and idempotency before awarding attribution or rewards.
6. The Baileys plugin exposes `.referralstatus` and `.referralprocess [1-25]`. These commands are owner-authorized by the existing WHISKAY command dispatcher.

## Environment

```env
REFERRAL_CLAIM_ENDPOINT=https://api-staging.example.test/v1/referrals/claims
REFERRAL_CLAIM_ALLOWED_HOSTS=api-staging.example.test
REFERRAL_SERVICE_TOKEN=replace-with-api-service-token
REFERRAL_WEBHOOK_SECRET=replace-with-at-least-32-random-characters
REFERRAL_WEBHOOK_ENABLED=true
REFERRAL_WEBHOOK_HOST=127.0.0.1
REFERRAL_WEBHOOK_PORT=8787
REFERRAL_AUTO_PROCESS=false
```

`REFERRAL_CLAIM_ENDPOINT` may point to staging or production, but the client validates HTTPS, pins the path to `/v1/referrals/claims`, and checks the exact hostname against `REFERRAL_CLAIM_ALLOWED_HOSTS`. Redirects are rejected. An arbitrary `TARGET_API_ENDPOINT` is intentionally not used. The service credential can therefore only be sent to an explicitly allowlisted referral-claim endpoint.

## Backend webhook signature

The sender signs the exact raw body with HMAC-SHA256:

`sha256=<hex(HMAC_SHA256(secret, timestamp + "." + rawBody))>`

Headers:

- `x-whiskay-timestamp`: Unix timestamp in seconds.
- `x-whiskay-signature`: signature shown above.

Body example:

```json
{
  "type": "referral.signup.verified",
  "data": {
    "eventId": "signup_evt_00000001",
    "claimToken": "opaque-one-time-token-issued-after-verification",
    "verifiedAt": "2026-11-06T10:00:00.000Z"
  }
}
```

WHISKAY exposes this route when `REFERRAL_WEBHOOK_ENABLED=true`: `POST /webhooks/referral/verified`. It binds to loopback (`127.0.0.1`) by default. Put an authenticated reverse proxy in front when the backend is on another host; only set `REFERRAL_WEBHOOK_HOST=0.0.0.0` when network firewalling and TLS termination are configured. The listener preserves the raw request body for signature verification. `REFERRAL_AUTO_PROCESS=true` optionally starts processing one claim asynchronously after each durable enqueue; otherwise the owner can run `.referralprocess`.

## Baileys commands

- `.referralstatus` — queue size and completion count.
- `.referralprocess` — process up to 10 verified claims.
- `.referralprocess 25` — process up to 25 verified claims.

Requests are sequential with at least one second between claim submissions. Failed claims remain queued. Successfully claimed event IDs are retained in a bounded deduplication ledger. Queue files are stored under `data/referral-claims/` with restrictive file permissions.

## Important constraints

- This integration does not create accounts and does not submit unverified signups.
- Do not place passwords, account cookies, access tokens, or registration credentials in `claimToken`.
- The receiving backend must enforce token expiry, one-time use, account verification, reward eligibility, and idempotency.
- Do not expose the service token or webhook secret in WhatsApp messages or logs.
- The actual WHISKAY bot entrypoint is `index.mjs`; commands are loaded through the plugin loader. There is no standalone `bot.mjs` in the source tree. `src/referral/bot.mjs` provides the command definitions for this integration.
