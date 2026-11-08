# External Integration Requests — source verification queue

## Ruang.Email Webmail API & OTP Scraper

**Requested base:** `https://ruang.email`  
**Mailbox host stated by the requester:** `https://mail.ruang.email`  
**Code source supplied:** `https://codeku.theresav.eu/raw/diTyjkv5`  
**Attribution supplied:** Kadokun; thanks to mail.ruang.email & Kadokun.

### Capabilities described by the requester (not yet source-verified)

- Authentication/login.
- Mailbox quota information; the description states 5 GB.
- Folder listing and inbox message listing.
- Full email reading.
- User-invoked extraction of OTP codes and verification links.
- Email sending.

### Implementation status

This integration is **not installed or active** in v0.10.17. The supplied raw-source URL could not be retrieved by the build environment. No request path, HTTP method, request body, response schema, login/session flow, or permission/scope contract was available for inspection.

Do not infer REST routes from the feature description. A guessed login endpoint or guessed message-send payload could leak mailbox credentials, disclose mail contents, or send unintended messages. The integration should only be implemented after the exact JavaScript source is attached directly or the maintainer supplies a readable API specification.

### Proposed command surface (design proposal only; commands are not registered)

```text
.rmail help
.rmail info
.rmail login-status
.rmail quota
.rmail folders
.rmail inbox [folder] [limit]
.rmail search <folder> <query>
.rmail read <message_id>
.rmail otp [latest|sender <address>|limit]
.rmail links <message_id>
.rmail send CONFIRM <recipient>|<subject>|<body>
```

### Security requirements for implementation

1. One explicitly configured mailbox owned/controlled by the WHISKAY owner; no multi-account credential harvesting.
2. Credentials, cookies, session tokens, and API keys must be stored only in `.env` or an owner-private credential file. Never accept secrets in WhatsApp command text or log them.
3. No mailbox login, inbox polling, or OTP scraping at startup. All reads and OTP extraction must be owner-initiated and bounded.
4. OTP and verification links may be displayed only in the owner's private chat. Never include them in group messages, debug logs, error reports, or generated release archives.
5. Email sending requires an explicit `CONFIRM` token and clear recipient/subject/body preview. No mass mailing, bulk recipient fanout, or background send queue by default.
6. Message listing and reading must use pagination and strict limits; attachment downloads require type/size limits and private temporary storage.
7. Validate response schemas, redirect targets, timeouts, host pinning, HTML sanitization, and secret redaction before enabling a live API client.
8. Mailbox storage quota (for example the stated 5 GB) is informational storage metadata, not a WHISKAY balance, wallet, credit, or payment feature.

### Next required input

Attach the actual `*.js` file from the supplied code source. After source review, map the exact authentication, quota, folder, message, OTP/link, and send operations into a typed client, tests, owner-only plugin, help/menu commands, and documentation. Do not put a real mailbox password or token in the chat; configure it locally after the API contract is verified.
