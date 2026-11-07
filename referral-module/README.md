# Referral Attribution Worker

Node.js ESM module to associate **already-verified signup events** with referral codes. It does not create accounts and intentionally rejects account-registration endpoints.

## Requirements

- Node.js 20+ (uses built-in `fetch` and `AbortController`)
- An authenticated internal API endpoint at `POST /v1/referrals/attribute`
- A server-to-server service token stored in an environment variable or secret manager

## Input shape

```js
[
  { signupEventId: 'signup_00000001', referralToken: 'ref_abc12345' },
  { signupEventId: 'signup_00000002', referralToken: 'ref_xyz67890' },
]
```

`signupEventId` must identify an existing signup whose user has completed the normal verification process. The receiving API must independently verify that fact and validate the referral token. Never accept a client-supplied `signupEventId` as proof of verification.

## Example

```js
import { processReferralAttributions } from './referral-attribution-worker.mjs';

const result = await processReferralAttributions(verifiedSignupEvents, {
  endpoint: 'https://api.example.com/v1/referrals/attribute',
  serviceToken: process.env.REFERRAL_SERVICE_TOKEN,
  intervalMs: 1000,
  onProgress: ({ index, total, succeeded, failed }) => {
    console.log(`Processed ${index}/${total}; success=${succeeded}; failed=${failed}`);
  },
});

console.log({ total: result.total, succeeded: result.succeeded, failed: result.failed });
```

Do not log referral tokens or the service token. Results contain only signup event IDs and status metadata. Failed items can be retried safely only if the API implements idempotency using the `Idempotency-Key` header and enforces one referral attribution per eligible user.

## Required server-side checks

1. Resolve `signupEventId` to an existing account and signup event.
2. Require the account's email/phone verification and any required consent to be complete.
3. Validate referral token ownership, status, campaign dates, and applicable limits.
4. Enforce one attribution per account; use a database transaction and a unique constraint.
5. Treat the `Idempotency-Key` as a replay guard, not as proof of user identity.
6. Reject unknown users, unverified accounts, expired referral codes, and self-referrals according to business rules.

## Tests

```bash
node --test referral-attribution-worker.test.mjs
```
