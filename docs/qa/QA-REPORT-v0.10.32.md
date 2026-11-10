# QA Report — WHISKAY v0.10.32

## Scope

Part 6: Eval Master owner-only (`>`, `=>`, `$`, `>>`, `>>>`).

## Results

- `npm test` — **317/317 PASS**, 0 fail, 0 skipped.
- `npm run check` — **114 JavaScript files PASS**.
- `npm run docs:check` — **148 Markdown documents indexed**, local links valid, 17 maintained scripts inventoried.
- `node --test test/owner-code-runtime.test.mjs` — **17/17 PASS**.
- Exact runtime smoke examples — Bash `$ ls`, JS `=> "helo"`, async JS `> return "p"`, Python `>> print(...)`, and Go `>>> package main` all returned expected output.
- Package ZIP integrity — verified after packaging.

## Regression coverage

- Prefix longest-first order `>>>`, `>>`, `=>`, `>`, `$`.
- Live `notify` vs history `append`.
- `fromMe`, owner PN, self-chat, group rejection, LID mapping.
- Structured owner gate rejection reasons.
- JS async Promise and explicit return.
- JS expression and explicit return.
- Synchronous VM timeout and async Promise timeout.
- Bash process timeout and output cap.
- Python runtime.
- Go runtime without toolchain/module download.
- Empty prefix usage, leading Unicode BOM, and timer cleanup.

## Limitations

No live WhatsApp session/device test was performed. The tests prove local parser/runtime behavior, not that a particular linked-device event is emitted by WhatsApp in the user's active session. There is no OS sandbox. Node.js `vm` is not a security boundary, and an async Promise timeout does not cancel all work already started by privileged JavaScript.
