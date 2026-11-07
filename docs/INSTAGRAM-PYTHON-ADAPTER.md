# Instagram Python Adapter — v0.9.4

Node.js retains the WhatsApp runtime, owner authorization, command/plugin system, growth engine, statistics store, and SQLite queue. Python 3.11+ with `instagrapi==3.2.3` handles Instagram account operations.

## Files and configuration

- Bridge: `python/instagram_bridge.py`
- Requirements: `requirements-instagram.txt`
- Installer: `scripts/install-instagram-python.sh`
- Python executable: `instagram.pythonBin` in `config/app.json`
- Session: `instagram.sessionFile`, default `./auth_ig/instagrapi-session.json`
- Username: `instagram.username` in `config/app.json`
- Password: `IG_PASSWORD` in `.env`, only for explicit first login

All relative paths resolve from the project root. `IG_USERNAME` and `IG_SESSION_FILE` are set by Node for the child adapter; users do not need to duplicate them in `.env`.

## Actions

| Action | Behavior |
|---|---|
| `doctor` | Local-only check of Python, instagrapi version, and session path. No Instagram network request. |
| `login` | Explicit first login; refuses an existing session/symlink. Validates profile before atomically persisting settings. |
| `profile` | Loads saved settings, reads the authenticated account profile, checks configured username, and atomically refreshes settings. No password login fallback. |

`profile_data()` obtains a `User` object using `client.user_info(client.user_id)` because that model contains follower/following/media counters. `account_info()` returns a different model and must not be used for those counter fields.

## Startup and command behavior

Startup runs local adapter inspection only. Existing session settings are loaded lazily when `.igprofile` or `.igsync` is requested. There is no automatic password login on startup.

`INSTAGRAPI_UNAVAILABLE` means the selected Python interpreter runs but the instagrapi package is not installed. `SESSION_PRESENT_UNVERIFIED` means the file exists and has safe local permissions. It is not proof of server-side validity. The first actual profile request can still fail if Instagram revoked or expired the session.

## Safe first login

1. Ensure there is no session file at the configured path and no persistent safety hold.
2. Set `IG_PASSWORD` in `.env` locally.
3. Restart WHISKAY to load the new environment.
4. Send `.iglogin` once from the owner account.
5. Confirm session saved successfully.
6. Remove `IG_PASSWORD` from `.env` and restart.
7. Use `.igprofile`; do not repeat `.iglogin`.

If checkpoint/challenge/rate-limit occurs, stop and complete account verification through the official Instagram application. Do not bypass the challenge.

## Previous session-path note

The current path is `auth_ig/instagrapi-session.json`. Session data from a different Instagram library may use an incompatible serialization format. Do not rename/copy Baileys files from `session/self/` into this path.
