# Changelog

## 0.10.9 — Owner-only group mode and content-to-follower intelligence
- Added `.mode status`, `.mode self`, `.mode public`, and `.mode groups on|off`; mode is restricted to the authenticated owner and persisted atomically in a private runtime state file.
- Added owner-only group access in self mode. Group participants other than the configured owner remain rejected; group admins do not receive implicit privileges.
- Added public private-chat read-only allowlist (`help`, `menu`, `igservices`, `igservice`); public mode always blocks groups and owner commands.
- Added `src/growth/content-intelligence.mjs` for per-content profile-visit, visit-to-follow, reach-to-follow, engagement, saves/shares and follows-per-1,000-reach metrics.
- Added `.igcontent add|list|report|compare`, URL normalization, campaign association, weighted comparisons by format/theme, and up to 90 snapshots per unique content URL.
- Migrated the growth JSON envelope from v2 to v3 by adding `contentPosts`; existing order, campaign, ledger and idempotency data remain intact.
- Added runtime-mode and content-intelligence suites; updated README, architecture, Baileys runtime, configuration, security, playbook, release, upgrade and QA documentation.
- No automatic Instagram Insights fetch, auto-follow, artificial follower delivery, public group command support, Meta OAuth activation, or Baileys/Instagram transport coupling.

## 0.10.8 — Follower growth funnel, organic goals, and campaign diagnostics
- Added pure funnel calculations for reach → profile visits → follows, reach-to-follow rate, impressions per reached account, and follows per 1,000 reach; zero denominators produce explicit `n/a` values.
- Added `.igfunnel <campaign-id>` with actionable stage diagnostics that avoid unsupported universal conversion benchmarks.
- Added `.igcampaign goal <ID> <target_followers> <YYYY-MM-DD>` with baseline validation, UTC deadline bounds, required net followers/day, and `IN_PROGRESS` / `ACHIEVED` / `OVERDUE` status.
- Added an Insights snapshot history capped at 90 records per campaign while preserving `campaign.insights` as the latest snapshot and reading old campaign records without migration.
- Added fallback baseline handling through the first campaign checkpoint when no creation-time snapshot exists.
- Extended campaign progress/list output and plugin registration tests; added unit coverage for calculations, zero denominators, validation, history, and goals.
- Added `docs/FOLLOWER-GROWTH-PLAYBOOK.md`; updated growth campaign documentation, README, release/upgrade/QA indexes, and changelog.
- No Instagram write action, auto-follow, follow/unfollow worker, artificial engagement, provider activation, Baileys transport change, environment key, or SQLite schema migration.

## 0.10.7 — Queue observability, secret-safe failures, and bounded terminal history
- Sanitized provider rejection messages before they reach callers; expanded redaction for credential assignments, Bearer/Basic authorization, sensitive query strings, URL userinfo, JWT-shaped values, and unsafe error labels.
- Sanitized queue failures before persistence in `jobs.last_error` and before worker logging; limited persisted error text to 500 characters.
- Bounded terminal SQLite history to the 1,000 newest `completed` jobs and 1,000 newest `failed` jobs independently; pending/running jobs are not pruned.
- Expanded `getQueueStats()` with oldest pending/running/failed timestamps and ages, next pending due time, and last completed/failed update time.
- Expanded `npm run queue:health` with non-payload queue observability; added deterministic tests for redaction, age calculations, and retention behavior.
- Added `docs/GROWTH-QUEUE-OPERATIONS.md`, release/upgrade/QA records, and refreshed README, architecture, security, project structure, and script inventory documentation.
- No SQLite schema migration, environment/configuration key, session format, owner approval, Instagram operation, Baileys transport, or provider activation change.

## 0.10.6 — Source hygiene, referral safety, and documentation governance
- Removed the unused legacy self-bot entrypoint and its duplicate LID manager; active runtime remains `index.mjs` + `src/wa.mjs`.
- Removed the unreferenced referral worker generation that used `/v1/referrals/attribute`; active integration remains under `src/referral/` and posts only verified claims to `/v1/referrals/claims`.
- Added isolated tests for the active referral conversion batch, including idempotency conflicts, bounded retry, cancellation, and token-redaction guarantees.
- Added injectable `sleepImpl` for deterministic retry tests; successful results no longer expose arbitrary backend response bodies and failures use stable, sanitized codes.
- Expanded `scripts/check-docs.mjs` into a source-governance check for README indexing, local links, current-version docs, npm script targets, script inventory, and stale archive/backup files.
- Hardened release packaging to keep ZIP output outside the project root and reject unsafe output targets.
- Moved config migration backups to a private sibling directory and made config replacement atomic.
- Rebuilt README as the detailed documentation index, added `docs/PROJECT-STRUCTURE.md`, and marked legacy upgrade guides as historical.

## 0.10.3 — 2026-11-06

- Fix Native Flow envelope: `biz` attributes and `quality_control` node.
- Replace IG services carousel with a Native Flow single-select list.
- Add `.igservice <service-id>` detail command.
- Limit IG dashboard to three primary quick replies and include text command fallback guidance.
- Extend Native Flow response ID parsing and tests.

## [0.10.1] — 2026-11-06

### Added
- ESM Native Flow builder for Baileys v7: quick reply, URL/call/copy CTA, and single select.
- Text-only native carousel card builder for the Instagram growth catalog.
- Namespaced interactive response parsing for native-flow, list, and legacy button replies.
- Interactive Instagram Growth panel and service catalog.
- Safe plain-text fallback when interactive relay/build is unavailable.

### Security and compatibility
- Native button actions re-enter the existing command handler and keep the owner authorization and anti-spam checks.
- Removed implicit Google URL and placeholder telephone defaults from the active builder path.
- Avoided directly importing uploaded CommonJS serializers that use `require('@whiskeysockets/baileys')`, which is incompatible with the v7 ESM-only package.
- No fake forwarded metadata, synthetic identity claims, or hidden follower manipulation.

### QA
- 58 ESM source files passed syntax checks.
- 87 Node tests passed, 0 failed.
- Live WhatsApp rendering and delivery were not tested in this environment.

# Changelog

## 0.9.4 — Test isolation, configuration integrity, and session safety
- Fixed critical destructive-test regression in v0.9.3: Node test workers now use isolated temporary paths for WhatsApp/Instagram sessions, snapshots, safety state, LID map, growth ledger, and SQLite queue; temporary state is removed at test-process exit.
- Guarded destructive tests against direct execution outside Node Test Runner. Added regression coverage for path isolation and explicit rejection of obsolete `instagram.authMode`.
- Confirmed v0.9.3 test cleanup could remove live Instagram session, statistics, order/ledger JSON, and SQLite queue when tests ran against the active project.
- Anchored relative configuration paths to the project root; corrected `.igcheck` status and distinguishes missing Python, missing `instagrapi`, missing session, unsafe path, unsafe permissions, and unverified session presence.
- Made Instagram settings and local statistics writes atomic; added persistent session/login guard and retained separate WhatsApp/Instagram credential stores.
- Removed duplicate Instagram statistics plugin; updated provider catalog filtering to inspect service name and descriptive metadata.
- Reduced credential exposure: worker is never given `IG_PASSWORD`; first-login password is passed only to the bot while session path is absent and removed after one login attempt.
- Added warnings for obsolete environment variables; clarified `.env` versus `config/app.json` contract.
- Updated README, configuration/security/architecture/adapter docs, upgrade notes, release notes, and QA report.
- QA: 77 Node tests, 54 ESM files, config validation, Python bridge compile, permission audit, upgrade-script syntax, and release archive integrity passed. No live Instagram or WhatsApp test was performed.


## 0.9.3 — Persistent safety and architecture hardening
- Added a persistent Instagram safety guard, cooldown tracking, profile cache, synchronization rate limit, and cross-process operation lock.
- Added a provider catalog preflight that begins filtering descriptions/categories in addition to service names.
- Corrected project paths and safety state handling; source review later found test modules still targeted configured live state paths, fixed in v0.9.4.
- This release did not fully isolate destructive tests; upgrade to v0.9.4 before running tests against an active project.

## 0.9.2 — Instagram Safety Hardening
- `.iglogin` now refuses to run when a session file already exists; the Python bridge enforces the same rule independently.
- Instagram profile reads are cached for 15 minutes and concurrent reads are coalesced.
- Instagram statistics sync is limited to one remote snapshot per 6 hours and concurrent syncs are rejected.
- Profile username and numeric fields are validated before data is accepted or stored.
- Profile retrieval uses `user_info(user_id)` for the `User` fields exposed by instagrapi 3.2.3.
- No automatic login, challenge bypass, proxy rotation, mass follow/unfollow, likes, comments, or scraping loops were added.

## v0.9.1 — Instagram profile lookup hotfix

- Fixed `profile_data()` to call `client.account_info()` without a positional `user_id`.
- This resolves the `AccountMixin.account_info() takes 1 positional argument but 2 were given` failure on instagrapi 3.2.3.
- No change to login flow, WhatsApp runtime, growth/order modules, or stored data.

## v0.9.0 — Python Instagram engine

- Removed the obsolete `instagram-private-api@1.46.1` Node dependency.
- Added isolated Python 3.11+ adapter using `instagrapi==3.2.3`.
- Rewired `.iglogin`, `.igprofile`, and `.igsync` to Python bridge.
- Added `.igcheck` / `.igdiagnose` for non-invasive runtime/session diagnostics.
- Kept WhatsApp Baileys runtime, owner authorization, plugin system, campaign/order engine, SQLite worker, and local statistics history in Node.js.
- New session path is `auth_ig/instagrapi-session.json`; old session file is not deleted or converted.
- No login on startup and no automatic password fallback from profile/sync.

## 0.8.9
- Fixed self-bot owner authorization for commands sent from the authenticated owner account to another person's private chat. `remoteJid` is the recipient/destination, not the sender identity.
- For `fromMe: true`, authorization relies on the authenticated socket PN (`sock.user.id`) matching `whatsapp.ownerNumber`; destination PN/LID is used only for reply routing.
- Group commands remain subject to `commands.allowGroups`; commands from a mismatched session remain rejected.
- Added regression tests for recipient-chat routing, authenticated owner session, and mismatched session rejection.

## 0.8.8
- Menjadikan JID nomor telepon `@s.whatsapp.net` sebagai identitas owner kanonis; LID hanya diterjemahkan ke PN melalui identitas socket terautentikasi atau mapping Baileys sebelum otorisasi.
- Menggunakan `sock.user.id` sebagai PN sesi aktual dan `sock.user.lid` untuk mengenali self-chat ketika Baileys hanya mengirim `remoteJid` berakhiran `@lid`.
- Menolak command bila PN akun WhatsApp yang sedang login berbeda dari `whatsapp.ownerNumber` yang dikonfigurasi, serta mencatat hasil pencocokan tanpa mencetak nomor telepon.
- Menambahkan reason code otorisasi (`SESSION_OWNER_MISMATCH`, `CHAT_NOT_OWNER_PN`, `SENDER_NOT_OWNER`, dan `GROUPS_DISABLED`) agar diagnosis tidak lagi hanya menampilkan pesan penolakan generik.
- Menambahkan regression tests untuk PN sesi, self-LID, alternate PN, dan penolakan chat milik akun lain.

## 0.8.7
- Menambahkan klasifikasi pesan masuk Baileys dengan pemrosesan command hanya untuk event live `notify`; pesan history `append` dilewati sebelum parsing dan tidak dieksekusi ulang.
- Menambahkan log diagnostik privasi-aman dan regression test command `.menu` / `.igprofile` / `.igpanel` untuk self-chat owner berbasis `@lid` + alternate PN.
- Mengisolasi child process dari process group terminal pada Unix agar launcher menjadi satu-satunya penerima Ctrl+C; launcher mengatur SIGTERM, graceful shutdown, dan batas penghentian.
- Menambah durasi grace period supervisor dan mempertahankan timeout sebagai fallback, tanpa meninggalkan timer yang membuat proses menunggu setelah child exit.
- Memperbaiki race shutdown saat plugin masih dimuat agar file watcher tidak dipasang setelah SIGINT.

## 0.8.6
- Fixed owner self-chat authorization when Baileys exposes `remoteJid` as `@lid` and the matching owner PN in `remoteJidAlt` / `remoteJidPn`.
- Process live `messages.upsert` notifications while retaining `fromMe=true` for owner self-commands; history backfills are not executed as live commands.
- Attach core WhatsApp listeners before the LID map finishes loading and defer command processing until the map is ready, preventing startup messages from being dropped.
- Added command-receipt and authorization diagnostics without logging message contents, phone numbers, or command arguments.
- Made LID mapping persistence skip unchanged pairs to avoid rewriting a large map on every message.
- Added bounded exponential reconnect backoff with jitter (3 seconds to 120 seconds); reset the retry counter only after a stable 60-second connection.
- Process only `messages.upsert` events explicitly marked `notify`, preventing history/unknown batches from triggering commands.
- Coordinated socket startup, reconnect, and close; awaited Baileys socket shutdown and drained active command handlers within a bounded grace period.
- Fixed the launcher shutdown timer leak that kept the terminal occupied after all child processes had exited; Ctrl+C now uses one graceful signal path.
- Made the growth worker's idle wait interruptible for faster shutdown.
- Added regression tests for owner alternate-JID authorization, supervisor timeout cleanup, reconnect policy and the shipped Instagram plugin commands.

## 0.8.5
- Added an exclusive, stale-recoverable runtime lock to prevent two bot instances from sharing one Baileys session.
- Detect PM2 environment and refuse launch with a clear migration message.
- Stop reconnect loops after WhatsApp 440 connection-replaced conflicts.
- Removed per-credential-update directory scans that raced with Baileys pre-key rotation and caused ENOENT warnings.
- Keep restrictive session permissions through startup repair and `umask 077`.

## 0.8.4 — Foreground runtime and plugin conflict isolation

- Removed PM2 from runtime dependencies and process management.
- `npm start` launches the WhatsApp bot and SQLite worker as supervised child processes in the current terminal.
- Ctrl+C, SIGTERM, and Ctrl+Z/SIGTSTP request graceful shutdown of both processes.
- `npm run worker` now runs a standalone foreground worker for debugging; no background daemon commands are provided.
- Plugin loader skips only commands/aliases that collide with an already-loaded plugin instead of rejecting the entire plugin file.
- Added regression coverage for partial plugin command conflicts and updated operational documentation.

## 0.8.3 — Redis removal and built-in SQLite queue

- Replaced BullMQ/ioredis with a durable SQLite queue built on Node.js `node:sqlite`.
- Removed Redis server, Redis password, BullMQ, and ioredis installation/runtime requirements.
- Added atomic job claim, stable IDs, bounded exponential retries, stale-running-job recovery, queue health reporting, and local status polling.
- Initially ran bot and worker under PM2; replaced by foreground supervision in v0.8.4.
- Added cross-process lock around JSON order/ledger mutations to serialize bot and worker writes.
- Optimized permission repair: first recursive audit is batched; later starts verify the private directory roots and rely on restrictive umask for newly created files.
- Updated runtime requirement to Node.js 22.5–22.x and refreshed README, configuration, security, architecture, research register, and QA report.

## 0.8.2 — Automatic permission repair and quieter startup

- Permission helper automatically secures `.env`, session files, and private data directories; no per-file `chmod` instructions.
- Startup applies the permission repair directly and removes repetitive validate/source-syntax/security prestart output.
- Runtime configuration still checks required WhatsApp owner/pairing values before starting services.
- Bot and worker set a restrictive process umask so newly created files default to owner-only access.
- Symlinks in private directories are skipped safely.

## 0.8.1 — Background runtime and simplified install

- `npm install` includes PM2 with runtime dependencies.
- `npm start` launches bot and worker under PM2 in the background.
- Added stop/status/logs/restart commands.

## 0.8.0 — SMM Panel architecture reconstruction

- Added user-supplied research text, findings register, SMM API v2-compatible provider adapter, owner approval, local idempotency, wallet reservation and refund logic.
- Provider adapter allows only reviewed authentic creator-collaboration and promotion services.
- Explicitly excluded credential pools, private endpoint bypass, device/telemetry spoofing, proxy evasion, and fake engagement fulfillment.

## 0.7.0
- Added bounded order history pagination and status filters.


## [0.10.0] - 2026-11-06

### Added
- Dedicated `.iggrowth [7|30|90]` time-window comparison separate from `.igstats`.
- `.ighistory [jumlah]` recent snapshot history.
- Campaign baseline snapshots, read-only checkpoints, manually entered Instagram Insights metrics, and `.igcampaign progress <ID>`.

### Changed
- Removed `iggrowth` from the `igstats` alias list.
- Campaign IDs include a random suffix to reduce collisions.
- Campaign analytics are explicitly separated from provider fulfillment; reach and impressions are owner-entered from Instagram Insights.

### Safety
- No artificial follower delivery, automated follow/unfollow, mass engagement, or anti-enforcement evasion is implemented.
- Campaign checkpoint collection reuses the existing Instagram read-only adapter and its six-hour synchronization cooldown.

## v0.10.2 — Verified referral queue integration

- Added backend-HMAC-verified referral signup webhook trigger.
- Added private persistent queue for one-time claim tokens issued after successful signup verification.
- Added sequential referral claim processor pinned to `/v1/referrals/claims`.
- Added Baileys owner commands `.referralstatus` and `.referralprocess`.
- Added replay-window checks, duplicate-event suppression, restrictive queue-file permissions, bounded processing, and integration tests.

## 0.10.4
- Added official Instagram Platform API and safe creator targeting configuration.
- Added separate referral backend configuration and safe app.json merge utility.


## v0.10.12 — Organic-only single-session cleanup

- Menghapus konsep saldo, wallet, kredit, ledger, budget, payment, dan provider promosi dari runtime/config aktif.
- Menegaskan command campaign hanya menerima nama dan mengambil identitas dari satu session Instagram aktif.
- Memperbarui README dan dokumentasi operasional; menghapus dokumen riset SMM/payment yang tidak lagi relevan.
