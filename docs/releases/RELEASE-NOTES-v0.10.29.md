# Release Notes — v0.10.29

## Native Flow & Interactive Transport Reliability

### Added
- `.waform send-location` sample for the experimental `send_location` native-flow action.
- Carousel card video attachment support alongside local image attachments.

### Changed
- Native Flow binary descriptor is selected from the first button type: generic `mixed` v9 or special `cta_catalog` / `send_location` v2.
- CTA Call emits `phone_number` in native-flow params rather than duplicate `phone` and `phone_number` keys.
- Carousel cards omit empty footers and reject simultaneous image+video on one card.
- Reserved `biz` and `bot` binary nodes are serializer-owned and cannot be duplicated through `additionalNodes`.
- Relay failures propagate; automatic text fallback only applies to local build/preparation errors to avoid duplicate sends after ambiguous network timeouts.

### Compatibility
- Dependency remains `@whiskeysockets/baileys@7.0.0-rc14`.
- No live WhatsApp rendering claim is made.

### Files
- `src/lib/native-flow.mjs`
- `src/lib/whatsapp-message-router.mjs`
- `src/plugins/whatsapp-tools.mjs`
- `test/native-flow.test.mjs`
- `test/whatsapp-message-router.test.mjs`
- `test/plugin-button-help.test.mjs`
- `docs/NATIVE-FLOW.md`
- `docs/BAILEYS-SERIALIZER-REFERENCE.md`

### Rollback
Restore the previous release source and package version. No database migration or session format change is introduced.
