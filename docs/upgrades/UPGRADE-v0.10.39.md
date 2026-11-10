# Upgrade WHISKAY v0.10.39

1. Stop the existing bot process.
2. Back up `.env`, `config/app.json`, `session/`, `auth_ig/`, and `data/` outside the project root.
3. Extract the v0.10.39 source into a clean directory; do not overlay a legacy tree without reviewing local changes.
4. Run `npm install` with registry access. This release declares `@napi-rs/canvas`; installation was not verified in the build environment because DNS lookup for registry.npmjs.org returned `EAI_AGAIN`.
5. Confirm `library/CONTRIBUTION-MANIFEST.json`, the preserved CJS source, `src/library/adapters/katabangwaindah.mjs`, and `src/plugins/contributed-katabangwaindah.mjs` are present.
6. Run `npm run validate`, `npm run check`, `npm run docs:check`, `npm test`, and `npm run security:permissions`.
7. Start WHISKAY. Confirm the plugin registry loads `contributed-katabangwaindah` and exposes `katabg`.
8. In an owner-authorized chat, run `.katabg help`, `.katabg config`, then `.katabg contoh teks` after the native canvas dependency is installed and outbound network access is available.

Persistent adapter config is created only when `.katabg set` is first used, at `data/contributed-config/katabg.json` (private mode 0600); no database or session migration is introduced. The optional font file is not included; the adapter falls back to the system/runtime font if it is absent.

## Rollback

Stop WHISKAY and remove `src/plugins/contributed-katabangwaindah.mjs` to unregister the command. For complete rollback, also remove `src/library/adapters/katabangwaindah.mjs`, the new tests/docs/manifest, revert `package.json` dependency/version metadata and package-release inclusion. Preserve or archive the contributed source and attribution as required by the author; do not delete it as part of routine rollback.
