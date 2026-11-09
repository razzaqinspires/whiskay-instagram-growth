# Release Notes — WHISKAY v0.10.26

**Date:** 9 November 2026  
**Package:** `whiskay-instagram-growth@0.10.26`

## Added

- Dedicated owner-only code runtime outside the plugin/command system.
- `>` async JavaScript eval, `=>` expression/return eval, `$` Bash CLI, `>>` Python 3, and `>>>` Go.
- Runtime single-flight protection, timeout/output/input bounds, process-group termination, private temporary source files, and explicit configuration.

## Security boundary

Code execution requires a `fromMe=true` message from the authenticated owner session and a private chat JID resolving to the configured owner number. Group chat and other direct recipients are rejected. The evaluator is privileged and runs with WHISKAY OS-user permissions; it is not a general-purpose sandbox.

## Validation

The owner runtime tests cover prefix parsing, private-self-chat authorization, JavaScript async/return execution, synchronous JavaScript timeout, Bash process execution/timeout, Python execution, Go execution, and WhatsApp output bounds. The full project test suite requires production dependencies to be installed before it can be claimed as passing.
