# Release notes — WHISKAY v0.9.3

This release implements persistent Instagram safety controls on top of v0.9.2.

- `.iglogin` refuses to run if a session file exists and persists a 24-hour first-login cooldown before attempting a network login.
- Instagram profile reads use a persisted 15-minute cache/cooldown.
- `.igsync` uses a persisted six-hour cooldown and checks the latest remote snapshot, not merely the last row (manual snapshots cannot bypass it).
- An exclusive filesystem lock serializes login/profile/sync across processes. Lock contention fails closed.
- Challenge, checkpoint, rate-limit and authentication-like failures can set a persistent manual-review hold.
- Python receives only an allowlisted environment; `IG_PASSWORD` is passed only for the explicit login action.
- Python child process is stopped after 45 seconds; output is bounded.
- `.igcheck` status is deliberately named `SESSION_FILE_PRESENT_NOT_VALIDATED` when only file presence is known.
- Stats comparisons avoid mixing manual and remote sources.

No automatic challenge bypass, proxy rotation, mass engagement, or automated login retry is included.
