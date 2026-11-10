# Upgrade Guide — v0.10.40

1. Replace the project with the v0.10.40 release archive or merge the changed files listed in `docs/INSTAGRAM-MULTI-PROVIDER-FALLBACK.md`.
2. Keep the existing `.env`, WhatsApp session, and private data directories.
3. Install dependencies using `npm ci` in the project directory.
4. Run `npm test`.
5. Start WHISKAY using the existing start procedure.
6. Run `.igdl providers` to inspect active and quarantined providers.

No new environment variable is required. Do not add the hard-coded solver credential from either contributed source to `.env`. Ask its owner to rotate/revoke the exposed credential.
