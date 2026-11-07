# WHISKAY v0.10.2

Verified referral conversion pipeline integrated with the existing Baileys plugin architecture. Only backend-signed `referral.signup.verified` webhooks are accepted. Claim submission uses one-time backend-issued tokens and a dedicated `/v1/referrals/claims` route. Added `.referralstatus` and `.referralprocess` owner commands.

The source release excludes `.env`, `config/app.json`, sessions, Instagram authentication state, runtime databases, and `node_modules`.
