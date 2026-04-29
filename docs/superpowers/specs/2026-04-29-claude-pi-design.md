# claude-pi Plugin Design

**Date:** 2026-04-29
**Status:** Approved

## Problem

Claude Code handles orchestration and reasoning well but is expensive for mechanical, parallelizable, or model-diverse subtasks. Pi (pi.dev) is a minimal terminal coding harness with a TypeScript SDK, support for 15+ model providers, and a lightweight session API. This plugin bridges the two: Claude orchestrates, Pi executes using cost-appropriate models — including frontier models where task complexity warrants it.

## Goals

- Let Claude delegate independent subtasks to Pi agents running cost-appropriate models
- Surface available Pi models at session start so Claude routes by capability, not assumption
- Support both fire-and-forget and steerable long-running agents
- Ship as a native Claude Code plugin — no setup CLI, no manual config patching
- Functional TypeScript throughout; no classes

## Non-Goals

- Persisting Pi session state across Claude Code sessions
- Exposing Pi's extension/hook API to Claude
- Building a Pi UI or TUI component

---

## Architecture

A native Claude Code plugin with three self-contained parts:

```
claude-pi/
├── .claude-plugin/
│   └── plugin.json          # Plugin manifest (no userConfig — Pi manages its own auth)
├── skills/
│   └── orchestrate/
│       └── SKILL.md         # Orchestration strategy skill
├── monitors/
│   └── monitors.json        # Session-start model poll
├── .mcp.json                # MCP server wiring
├── bin/
│   ├── server.js            # Compiled MCP server
│   └── list-models.js       # Compiled monitor script
└── src/
    ├── server/
    │   ├── index.ts         # MCP stdio entry point
    │   ├── tools.ts         # Tool schema + handler definitions
    │   ├── pi-client.ts     # Pi SDK wrapper (functional, injectable)
    │   ├── session-store.ts # In-memory session registry
    │   └── types.ts         # Discriminated unions + branded types
    └── monitor/
        └── list-models.ts   # One-shot model poll, exits after output
```

**Plugin installation:** `claude /plugin install github:<owner>/claude-pi`

**`.mcp.json`:**
```json
{
  "mcpServers": {
    "pi": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/bin/server.js"]
    }
  }
}
```

**`plugin.json`** — no `userConfig` needed; Pi handles its own auth via `AuthStorage`:
```json
{
  "name": "claude-pi",
  "version": "1.0.0",
  "description": "Orchestrate Pi agents from Claude Code for cost-effective task delegation",
  "license": "MIT"
}
```

**Auth model:** Pi has no own API key. The SDK's `AuthStorage.create()` reads `~/.pi/agent/auth.json` and standard provider env vars (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, etc.). Users configure Pi auth once via `pi auth` CLI; the plugin inherits that state at runtime. No credentials are injected by the plugin.

---

## Session-Start Model Discovery

**`monitors/monitors.json`:**
```json
[{
  "name": "pi-models",
  "command": "node ${CLAUDE_PLUGIN_ROOT}/bin/list-models.js",
  "description": "Available Pi models for this session",
  "when": "always"
}]
```

`list-models.ts` runs once at session start: calls `AuthStorage.create()` and `ModelRegistry.create(authStorage)` to discover available models (those with valid API keys), emits a single formatted notification, exits. Tier labels (`frontier`, `balanced`, `fast`) are derived from a static mapping keyed on Pi's model IDs — `ModelRegistry` supplies model IDs and provider names; the tier mapping lives in `list-models.ts`. Claude receives the full model list before any user interaction.

Output format (one stdout line, delivered as a notification):
```
[pi-models] Available: gemini-2.5-pro (frontier), gemini-2.0-flash (fast), claude-haiku-4-5 (fast), gpt-4o (balanced) — use pi_list_models to refresh
```

If the monitor exits non-zero (Pi auth not configured, auth file missing), no notification arrives. The skill handles this gracefully (see Skill section).

---

## MCP Server & Tools

**Dependencies:** `@modelcontextprotocol/sdk`, `@mariozechner/pi-coding-agent`

**Functional wiring — Pi SDK injected at startup, not imported directly in handlers:**

```typescript
// server/index.ts
import { AuthStorage, ModelRegistry, SessionManager, createAgentSession }
  from "@mariozechner/pi-coding-agent"

const authStorage   = AuthStorage.create()
const modelRegistry = ModelRegistry.create(authStorage)
const sessionDeps   = { authStorage, modelRegistry, sessionManager: SessionManager.inMemory() }

const store  = makeSessionStore()
const client = makePiClient(createAgentSession, sessionDeps)  // real Pi SDK
const tools  = makeTools(store, client)
// In tests: makePiClient(mockSessionFactory, mockDeps)
```

**Build:** `tsc` compiles `src/` to `bin/` via a `prepublishOnly` npm script. No bundler required — output is plain CommonJS targeting Node 20+.

### Tool Reference

| Tool | Input | Output |
|------|-------|--------|
| `pi_list_models` | — | `{ models: ModelInfo[] }` |
| `pi_run_task` | `task, model, cwd?, timeout?` | `{ output: string }` |
| `pi_spawn_agent` | `task, model, cwd?` | `{ session_id: string }` |
| `pi_steer_agent` | `session_id, message` | `{ ok: boolean }` |
| `pi_poll_agent` | `session_id` | `{ status, output, error? }` |
| `pi_get_result` | `session_id` | `{ output: string }` |
| `pi_terminate_agent` | `session_id` | `{ output: string }` |

**`pi_run_task`** — creates a Pi session, sends task, awaits `agent_end` event, returns accumulated output. Accepts optional `cwd` (defaults to Claude's working directory) and `timeout` in ms (default 5 min). On timeout, aborts the session and returns whatever output accumulated so far with a `session_timeout` error — partial output is included so Claude can decide whether to retry or synthesize from it.

**`pi_spawn_agent`** — creates a Pi session, subscribes to events for output accumulation, returns `session_id` immediately. Does not wait for completion.

**`pi_poll_agent`** — reads current `SessionEntry` from store. Returns `status: 'running' | 'done' | 'error'`, accumulated `output`, and `error` if applicable.

**`pi_get_result`** — polls store until `status !== 'running'`, returns final output. Rejects if session not found or errored.

**`pi_steer_agent`** — calls `session.steer(message)` on the live session object. Returns `{ ok: false }` if session is no longer running.

**`pi_terminate_agent`** — calls session abort signal, updates store to `done`, returns whatever output accumulated.

---

## Session Management

```typescript
// server/session-store.ts
type SessionStatus = 'running' | 'done' | 'error'

type SessionEntry = {
  readonly session:   PiSession
  readonly output:    string
  readonly status:    SessionStatus
  readonly error?:    string
  readonly createdAt: number
}

type SessionStore = {
  add:    (id: string, entry: SessionEntry) => void
  get:    (id: string) => SessionEntry | undefined
  update: (id: string, patch: Partial<SessionEntry>) => void
  remove: (id: string) => void
  all:    () => ReadonlyMap<string, SessionEntry>
}
```

All updates use `{ ...entry, ...patch }` — entries are immutable after creation. Output accumulates via append-on-delta, never in-place mutation. Session IDs are generated with `crypto.randomUUID()` at spawn time.

**Stale session cleanup** — sessions older than 30 minutes pruned on a 5-minute interval. Prevents unbounded memory growth from abandoned agents. TTL configurable via `PI_SESSION_TTL_MS` env var.

---

## Skill Design

**Location:** `skills/orchestrate/SKILL.md`
**Invocation:** `/claude-pi:orchestrate` (or auto-dispatched by Claude based on task context)

**Frontmatter:**
```yaml
---
name: claude-pi-orchestrate
description: Use when a task is mechanical, parallelizable, requires a different
  model's strengths, or where delegating preserves tokens — file generation,
  boilerplate, batch transforms, research, summarization, or any subtask
  independent of the current conversation context.
---
```

**Key content sections:**

**Model tiers** (populated from session-start notification):

| Tier | Examples | Use when |
|------|---------|---------|
| Fast/cheap | Gemini Flash, Haiku, 4o-mini | Formatting, boilerplate, mechanical transforms |
| Balanced | GPT-4o, Sonnet | Standard coding, analysis, research |
| Frontier | Gemini Pro, o3, GPT-4.5 | Novel reasoning, architecture, state-of-the-art tasks |

**When to delegate:**
- Task is independent of current conversation context
- Task is mechanical, repetitive, or parallelizable
- A cheaper or more capable model is better suited
- Subtask runtime > ~30s (below this, Pi startup overhead isn't worth it)

**When not to delegate:**
- Task requires reasoning about this specific conversation
- Task needs Claude's tool access (Bash, Edit, Write, etc.)
- Task is trivially short

**Session-start awareness:** "At session start you receive a `[pi-models]` notification. Use the listed models — do not assume availability. If no notification arrived (Pi unreachable or bad key), call `pi_list_models` before delegating; if that also fails, handle the task locally."

**Parallel pattern** (primary): `pi_spawn_agent` × N → `pi_poll_agent` loop → `pi_get_result` × N → synthesize.

**Steering rule:** Poll running agents for long tasks. If output is going off-track, `pi_steer_agent` immediately. Terminate and respawn with corrected task description if steering is insufficient.

---

## Error Handling

All Pi SDK errors are caught and mapped to typed shapes — no stack traces leak through MCP responses:

```typescript
type PiError =
  | { kind: 'auth_failed';     message: string }
  | { kind: 'model_not_found'; model: string }
  | { kind: 'session_timeout'; session_id: string }
  | { kind: 'pi_unavailable';  message: string }
```

No bare `catch` blocks. Every error path is explicit and returns a typed result or MCP error response.

**Failure surfaces:**

| Surface | Failure | Handling |
|---------|---------|---------|
| Monitor | Pi unreachable at session start | No notification; skill instructs Claude to call `pi_list_models` or handle locally |
| `pi_run_task` | Model error / timeout | Returns `PiError`; Claude retries with different model or handles locally |
| `pi_spawn_agent` | Auth failure | Returns `auth_failed` error immediately |
| `pi_poll_agent` | Session not found | Returns structured error; Claude treats as abandoned |
| `pi_steer_agent` | Session already done | Returns `{ ok: false }`; Claude checks result instead |

---

## Testing Strategy

### Layer 1: TypeScript unit tests (automated, CI)

**Runner:** vitest  
**Location:** `tests/unit/`

Pi SDK is behind an injectable interface — tests never hit a real Pi session:

```typescript
// In tests
const tools = makeTools(makeSessionStore(), makePiClient(mockSessionFactory))

// In production
const tools = makeTools(makeSessionStore(), makePiClient(createAgentSession))
```

Coverage targets:
- `tools.ts` — all seven tool handlers, happy path + error paths
- `session-store.ts` — add, get, update, remove, stale cleanup
- `pi-client.ts` — session creation, output accumulation, termination
- `list-models.ts` — output formatting, auth failure path

**TDD cycle:** Write failing test → `npm test path/to/test` → watch it fail → implement minimal code → watch it pass → refactor.

### Layer 2: Skill tests (structured, semi-manual)

**Location:** `tests/scenarios/`

```
tests/
├── unit/                         # vitest (automated)
├── scenarios/
│   ├── delegation-baseline.md    # Pressure: should Claude delegate or handle locally?
│   └── model-selection-pressure.md  # Pressure: does Claude pick the right tier?
├── run-baseline.sh               # claude --no-plugins -p "$(cat ...)"
└── run-skill.sh                  # claude --plugin-dir . -p "$(cat ...)"
```

Baseline (RED): `claude --no-plugins -p "$(cat tests/scenarios/delegation-baseline.md)"`  
With skill (GREEN): `claude --plugin-dir . -p "$(cat tests/scenarios/delegation-baseline.md)"`

Not automated CI — scenarios are committed markdown files run manually during skill development, following the RED-GREEN-REFACTOR cycle from writing-skills.

---

## Distribution

1. Publish to a public GitHub repository (`github:<owner>/claude-pi`)
2. Users install with: `claude /plugin install github:<owner>/claude-pi`
3. Users must have Pi auth configured before the plugin is useful — run `pi auth` or set provider env vars (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, etc.). The plugin README documents this prerequisite.
4. Submit to Anthropic official marketplace once stable

