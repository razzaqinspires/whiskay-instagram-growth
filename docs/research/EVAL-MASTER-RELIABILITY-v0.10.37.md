# Eval Master Reliability Research — v0.10.37

## 1. Findings from source audit

The previous release had five separate runtime prefixes and unit tests for parser/runner behavior, but it lacked a full end-to-end `handleMessage` test for all five prefixes. The WhatsApp ingress and owner authorization path therefore was not adequately proven.

The path is:
1. Baileys emits `messages.upsert`.
2. `classifyMessageUpsert()` accepts live `notify` messages.
3. `extractMessageText()` extracts message text.
4. `parseOwnerCodeRequest()` recognizes a dedicated prefix.
5. Owner/session/private self-chat authorization runs.
6. The selected runtime executes.
7. The result is sent back to the originating private self-chat.

A failure at steps 2, 4, or 5 previously could look like a non-working Eval Master even though the runtime engine itself passed isolated tests.

## 2. Baileys event contract

The Baileys event map describes `messages.upsert` as `{ messages, type }`, and states that messages received while the connection is online use `type: "notify"`. The current WHISKAY policy continues to execute only live `notify` messages. History/backfill events are not executed to avoid replaying old owner code.

Baileys source also shows that outgoing message keys can carry alternate addressing information. `remoteJidAlt` must not be used as proof of the destination chat: it may represent the sender's alternate identity. WHISKAY now verifies the destination from `remoteJid` and `remoteJidPn`, and obtains the authenticated PN/LID pair from auth credentials where available.

References:
- https://github.com/WhiskeySockets/Baileys/blob/master/src/Types/Events.ts
- https://github.com/WhiskeySockets/Baileys/blob/master/src/Utils/decode-wa-message.ts
- https://github.com/WhiskeySockets/Baileys

## 3. Runtime prefix contract

| Prefix | Runtime | Expected use |
|---|---|---|
| `>` | JavaScript async | Async body; use `return` for a result |
| `=>` | JavaScript expression | Expression or explicit `return` |
| `$` | Bash | Shell command |
| `>>` | Python | Python source |
| `>>>` | Go | Go source |

Eval Master is not a plugin command and must not be exposed in `.menu`.

Examples:
- `=> 1 + 1`
- `> return await Promise.resolve("async-ok")`
- `$ ls`
- `>> print("python-ok")`
- `>>> package main\nimport "fmt"\nfunc main() { fmt.Println("go-ok") }`

The parser strips one terminal backslash when it is the final character of a copied WhatsApp message, and accepts balanced Markdown code fences. It does not rewrite backslashes inside source.

## 4. v0.10.37 implementation

- `src/lib/owner-code-runtime.mjs`: tolerant parser, strict private self-chat destination check, runtime dispatch.
- `src/wa.mjs`: logs detected runtime prefixes, event type, count, fromMe count, and enabled state without logging source code. Authenticated identity PN/LID is attached from Baileys credentials.
- `src/commands.mjs`: uses authenticated identity for both owner authorization gates; records execution metadata.
- `src/lib/owner-code-audit.mjs`: new atomic JSON audit store.
- `src/config.mjs`: validates private audit path.
- `config/app.example.json`: documents audit file path.
- `test/owner-code-runtime.test.mjs`: end-to-end dispatch coverage for all five prefixes and negative authorization tests.

## 5. Owner authorization and safety

Execution requires:
- `key.fromMe === true`.
- Authenticated socket PN matches `whatsapp.ownerNumber`.
- Private chat only; group chats are rejected.
- Destination JID resolves to the owner PN or the authenticated owner's LID.
- Only `notify` messages execute; `append`/history messages never execute.

`remoteJidAlt` is not accepted as a destination proof. This avoids confusing the sender's alternate identity with the recipient chat.

## 6. Execution audit

`data/owner-code-audit.json` stores only:
- sequence ID and timestamp;
- runtime name;
- message ID;
- SHA-256 of source code and source length;
- success/failure, duration, exit code, and normalized error category.

Raw source and output are not written to the audit file. The file is created with restrictive directory/file permissions and atomic replacement.

## 7. Operational diagnostics

When a prefix arrives, logs should show:
- `[OWNER RUNTIME] Prefix detected at WhatsApp ingress`
- `eventType`
- `candidates`
- `fromMeCount`
- `runtimes`
- `ownerCodeEnabled`

If event type is not `notify`, the log explicitly states that the request was not executed because it was a non-live/history event. If it reaches `handleMessage` but fails owner authorization, the existing authorization log reports a reason such as `FROM_ME_REQUIRED`, `SESSION_OWNER_MISMATCH`, or `CHAT_NOT_OWNER_SELF_CHAT`.

Do not share full WhatsApp JIDs, source code, environment values, or auth files when sharing logs.

## 8. Security boundary

Eval Master is privileged execution, not a sandbox. JavaScript receives access to `process`, `require`, and the socket context; Bash, Python, and Go run with the bot process's OS permissions. Keep owner-only authorization enabled and run the bot as a dedicated non-root user with limited filesystem permissions.
