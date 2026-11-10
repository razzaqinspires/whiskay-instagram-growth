# WHISKAY Owner Code Runtime

## Purpose

This is a special owner-control surface. It is intentionally **not** a command, plugin, alias, or menu entry. The runtime prefixes are detected in WhatsApp message ingress and dispatched separately from `parseCommand()` and `PluginLoader`.

## Syntax

| Prefix | Runtime | Semantics | Example |
|---|---|---|---|
| `>` | Async JavaScript | Executes a JavaScript async function body; use `await` and `return`. | `> return await Promise.resolve(process.version)` |
| `=>` | JavaScript return/eval | Evaluates one expression and returns its value; an explicit `return` statement is also supported. | `=> process.platform` |
| `$` | CLI | Executes the supplied text with Bash (`/bin/bash` by default). | `$ pwd && node --version` |
| `>>` | Python 3 | Writes source to a temporary `.py` file and runs configured Python binary. | `>> print("python-ready")` |
| `>>>` | Go | Writes source to a temporary `main.go` file and runs `go run`. | `>>> package main
import "fmt"
func main() { fmt.Println("go-ready") }` |

Multi-line source is supported in the message body. These prefixes are not affected by the normal `.`/`!` command prefixes, are not shown by `.help`/`.menu`, and do not register with plugins.

## JavaScript context

The JavaScript runtime receives these references: `sock` and alias `conn`, `msg` and alias `m`, `key`, `ctx`, `config`, `pluginLoader`, `lidManager`, `command`, `prefix`, `args`, `rawArgs`, `reply`, `send`, `sendMedia`, `sendInteractive`, `logger`, `process`, `Buffer`, `require`, `console`, `fetch`, `URL`, and timer functions. `>` supports `await`; `=>` is intended for a single expression or an explicit `return` statement. Use `>` for multi-statement async bodies.

Examples:

```text
> return await sock.user
=> process.version
=> args
$ pwd && ls -la
>> import platform; print(platform.python_version())
>>> package main
import "fmt"
func main() { fmt.Println("Go runtime ready") }
```

## Owner-only authorization

A code request runs only when all checks pass:

1. The message is a live `notify` event, not history/backfill.
2. `key.fromMe === true`.
3. The authenticated Baileys session PN matches `whatsapp.ownerNumber`.
4. The target is a private self-chat whose PN (including a resolved LID alias) matches the configured owner number.
5. `ownerCode.enabled` is `true`.

Group messages, messages from another sender, other private contacts, and a session whose PN differs from the configured owner are rejected. This strict self-chat target check also applies when command runtime mode is `public`.

## Configuration

Merge this block into `config/app.json`:

```json
{
  "ownerCode": {
    "enabled": true,
    "timeoutMs": 15000,
    "maxCodeChars": 8000,
    "maxOutputBytes": 16000,
    "workDir": "./data/owner-runtime",
    "pythonBin": "python3",
    "goBin": "go",
    "shellBin": "/bin/bash"
  }
}
```

The default values are enabled, 15-second execution timeout, 8,000 source characters, and 16,000 output bytes. Config validation permits timeout 1–60 seconds, source 100–20,000 characters, and output 1,024–65,536 bytes. A single-flight gate permits only one owner runtime job at a time.

To disable execution, set `ownerCode.enabled` to `false` and restart WHISKAY. The owner runtime is separate from the normal plugin command system and never appears in the command menu.

## Process behavior

- Bash: starts the configured shell binary with `spawn(..., shell:false)` and passes the owner's source as the shell program argument.
- Python: runs `python3 -I <temporary-file>` by default.
- Go: runs `go run <temporary-main.go>` with `GOTOOLCHAIN=local`, `GOPROXY=off`, `GOSUMDB=off`, and `GOWORK=off`. This avoids automatic toolchain/module downloads; use standard library or dependencies already available locally.
- Python/Go files are created with mode 0600 in `data/owner-runtime/`, then removed after the process ends.
- External processes have a timeout, output cap, `shell:false` at the Node process API, and process-group termination on timeout/overflow.
- The result is bounded to fit in one WhatsApp reply. Empty prefixes such as `>>` and `>>>` return runtime-specific usage examples; they do not start an interactive REPL. Leading Unicode BOM is removed before prefix detection. JavaScript timers created through the exposed timer functions are tracked and cleared when the snippet returns or times out.

## Security warning

This is a high-privilege owner administration tool, not a general-purpose sandbox. JavaScript eval receives live WHISKAY objects, `process`, `require`, and filesystem/network-capable APIs; Bash, Python, and Go run with the operating-system permissions of the WHISKAY process. Any owner code can read credentials available to that OS user, edit/delete project files, access network resources, or stop the bot. JavaScript synchronous execution is bounded by the VM timeout, and pending async results are bounded by a Promise timeout. The Promise timeout only stops WHISKAY waiting for the result; it does not cancel external I/O, child processes started by user code, or all work scheduled through host APIs. Tracked JavaScript timers are cleaned up when the snippet completes, but this is not a complete cancellation or isolation boundary. JavaScript code that begins an infinite CPU loop after resuming from an awaited host API can still block the Node event loop; subprocess timeout does terminate the process group created by the dedicated Bash/Python/Go runner. These controls do not create an OS isolation boundary. Never expose these prefixes to public users or groups, and never paste untrusted code.

For stronger isolation, run WHISKAY under a dedicated unprivileged OS account with restricted filesystem permissions, no unnecessary secrets in its environment, resource quotas, and OS/container sandboxing. Do not run WHISKAY as `root` when using unrestricted code execution.

## Troubleshooting

- `Runtime tidak ditemukan: python3`: install Python 3 or configure `ownerCode.pythonBin`.
- `Runtime tidak ditemukan: go`: install Go or configure `ownerCode.goBin`.
- Go external package lookup fails: expected; module proxy is disabled for this runtime.
- Runtime does not respond: inspect terminal logs for `[OWNER RUNTIME] Request rejected by private self-chat gate`. Reasons include `FROM_ME_REQUIRED`, `GROUP_CHAT_FORBIDDEN`, `SESSION_PN_UNAVAILABLE`, `SESSION_OWNER_MISMATCH`, and `CHAT_NOT_OWNER_SELF_CHAT`. Send the code from the linked owner device to the owner's own WhatsApp chat, not a contact or group; confirm the active session PN and `whatsapp.ownerNumber` match. If a LID self-chat is used, verify the Baileys LID mapping is available.
- To disable immediately, stop WHISKAY, set `ownerCode.enabled=false`, and restart.
