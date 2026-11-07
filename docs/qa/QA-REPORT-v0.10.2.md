# QA Report — WHISKAY v0.10.2

Scope: verified referral webhook, persistent queue, dedicated claim submission, and Baileys command plugin.

Tests cover HMAC verification, rejection of unverified event types, replay-window enforcement, duplicate-event rejection, processing of opaque backend-issued claim tokens, completion persistence, endpoint-path and hostname allowlisting, redirect rejection, and batch-limit enforcement. Local QA: 65 ESM files pass syntax validation and the full Node test suite passes 96/96 tests, including a local HTTP webhook listener test. This validates local behavior only; the staging backend and linked WhatsApp device are not connected in this environment.

Live backend webhook and WhatsApp device rendering require the deployment's staging backend and paired device; they are not claimed as verified by the local test suite.
