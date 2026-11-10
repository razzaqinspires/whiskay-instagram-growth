# Release Notes — v0.10.40

- Introduced a WHISKAY-owned Instagram provider fallback engine.
- Routed `.igdl` through the engine and added `.igdl providers`.
- Added ordered provider failover, provider health counters, and a short cooldown after repeated failures.
- Archived Snapgram.io and iGram.world CJS contributions byte-for-byte with SHA-256 provenance.
- Quarantined both contributed providers because their supplied execution paths depend on automated Turnstile solving; iGram also evaluates remotely downloaded signer code.
- Existing KOL.ID integration remains the only active provider.
- Added isolated tests for fallback order, failure tracking, redaction, and quarantine.
- No contributed source was edited.
