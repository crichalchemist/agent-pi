# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test              # run all unit tests once (vitest)
npm run test:watch    # vitest in watch mode
npm run build         # compile src/ → bin/ (tsc)
```

Run a single test file:
```bash
npx vitest run tests/unit/tools.test.ts
```

Behavioral evals are separate — they drive real Claude Code sessions, so they are slow and
never part of `npm test` (`vitest.config.ts` includes only `tests/unit/**`):

```bash
npm run build && npm run eval          # all cases, stubbed Pi, free
npm run eval -- --only model-selection # one case
npm run eval -- --real                 # delegate to the LIVE Pi fleet (spends tokens)
```

## Architecture

This is a Claude Code plugin (`claude-pi`) that exposes a Pi agent orchestration layer as an MCP server. There are two runtime entry points:

**`src/server/index.ts`** — the MCP stdio server, started by Claude Code via `~/.claude/settings.json` → `mcpServers.pi`. Registers eight tools (`pi_list_models`, `pi_run_task`, `pi_spawn_agent`, `pi_steer_agent`, `pi_followup_agent`, `pi_poll_agent`, `pi_get_result`, `pi_terminate_agent`).

**`src/monitor/list-models.ts`** — a one-shot script run at session start via `monitors/monitors.json`. Queries Pi for available models and emits a `[pi-models]` notification to the conversation before any user interaction. If the [superpowers](https://github.com/obra/superpowers) plugin is detected on disk, emits a second hint line pointing to `claude-pi:superpowers`.

### Data flow through the server

```
MCP call → tools.ts (makeTools)
                ↓
         pi-client.ts (makePiClient / makePiSessionFactory)
                ↓
         @earendil-works/pi-coding-agent SDK (createAgentSession +
                                            session.prompt | session.followUp)
                ↓
         makePiSessionAdapter — subscribes immediately, buffers events until
         tools.ts calls adapted.subscribe(), then drains synchronously
```

`session.prompt(task)` is fire-and-forget (`.catch(() => {})`) inside `makePiSessionFactory` — this is intentional. The adapter's pre-subscription buffer makes it safe and allows `store.add('running')` to fire before the task completes, which is what drives the statusline.

### steer vs. followUp

Two delivery semantics, distinct all the way down:

- **steer** (`pi_steer_agent`) — interrupts; Pi delivers it once the current assistant turn
  finishes its tool calls.
- **followUp** (`pi_followup_agent`, and the `followUp: true` flag on `pi_run_task` /
  `pi_spawn_agent`) — never interrupts; delivered only after the agent finishes all work.

The `followUp` boolean threads through the whole stack — tool schema → `RunTaskParams`/`SpawnParams`
→ `PiClient.startSession` → `SessionFactory` → the `session.followUp(task)` vs `session.prompt(task)`
branch in `makePiSessionFactory`. Any similar flag has to touch all five.

The `?? steer` fallback in `makePiSessionAdapter` covers only the `pi_followup_agent` path.
`makePiSessionFactory` calls `session.followUp(task)` on the raw SDK session, so `followUp: true`
at spawn time is unprotected if the SDK ever drops the method.

### Model tier classification

`getTier` in `types.ts` maps a model id to `fast | balanced | frontier` with no network call and no
hardcoded model list — it is deliberately pattern-based so new Pi model names classify without a code
change. Order: exact match in `MODEL_TIER_OVERRIDES` (the escape hatch for names that don't classify
cleanly, e.g. `o3` vs `o3-mini`), then a regex against the **provider-stripped** name
(`google/gemini-2.5-pro` → `gemini-2.5-pro`), defaulting to `balanced`.

Both consumers depend on it — `pi-client.ts` (`listModels`) and `monitor/list-models.ts` (the
session-start notification) — so a change here shifts what Claude sees at session start *and* what
`pi_list_models` returns mid-session. `tests/unit/types.test.ts` covers the classification table.

### Behavioral evals

Unit tests prove the MCP server works. `tests/eval/` answers a different question — does the
**orchestrate skill actually change Claude's delegation behavior** — and it can only be answered
by driving a real session and watching which tools get called.

`tests/eval/run-evals.mjs` uses [claude-session-driver](https://github.com/obra/superpowers)
(`csd`) to launch a Claude worker in tmux, sends it a scenario from `tests/scenarios/`, then
asserts on csd's `pre_tool_use` **event stream** — not on the worker's prose. A worker will
happily describe a delegation plan it never executed; the event stream records only real calls.

Three things make this work, and each is load-bearing:

- **`--mcp-config <stub> --strict-mcp-config`** points the `pi` server at
  `tests/eval/stub-pi-server.mjs`, which registers the *real* `TOOL_SCHEMAS` and `makeTools`
  dispatch from `bin/` behind a canned `PiClient`. Tool calls are genuine; the Pi spend is zero.
  `--strict-mcp-config` is required — without it the project `.mcp.json` loads the real server too.
- **Worker cwd is the repo**, which is already trusted. A scratch dir would stall the worker on
  Claude Code's folder-trust prompt, and pre-trusting one means editing `~/.claude.json`.
- **Tiers are asserted through the real `getTier()`**, never a hardcoded model list, so the
  assertions hold against whatever fleet Pi actually serves. Scenarios call `pi_list_models`
  rather than naming models, for the same reason. Note the circularity: the stub labels tiers
  with `getTier` and the eval asserts with `getTier`, so a `getTier` regression flows into both
  sides and passes. The eval tests *which model Claude picked*, not that the label was right —
  `tests/unit/types.test.ts` is what guards classification.

Arms: `delegation/green` and `model-selection/green` are scored; `delegation/red` (MCP tools
present, skill *absent*) is reported as an unscored baseline — delegating without the skill is a
fine outcome, just not one to assert on. The old `--no-plugins` baseline was replaced because it
removed the tools entirely and so measured plugin absence rather than skill absence.

`--real` swaps the stub for `bin/server/index.js`, started in a scratch cwd so live Pi agents
don't write into the repo. The runner also diffs `git status` around the run and warns loudly if
a worker dirtied the tree.

These are LLM evals: a single run is stochastic, so one failure is a prompt to re-run, not proof
of a regression.

### Pi settings integration

`src/server/pi-settings.ts` reads `~/.pi/agent/settings.json` (the user's Pi desktop app config) and exports two utilities used by both `pi-client.ts` and `list-models.ts`:

- `readPiSettings(path?)` — reads and parses the settings file; returns `{}` on any error
- `filterByEnabledModels(models, settings)` — filters a model list to only those in `settings.enabledModels`; returns all models if `enabledModels` is absent or empty

`makePiClient` accepts an optional `{ readSettings }` injection for testability — all tests that call `listModels()` inject `async () => ({})` to stay independent of the real settings file.

The monitor notification includes `— default: provider/model` when `defaultProvider` + `defaultModel` are set in Pi settings, giving Claude an explicit starting point for delegation without tier inference.

### Nested delegation (pi-subagents)

[pi-subagents](https://github.com/nicobailon/pi-subagents) gives a Pi agent a `subagent` tool, so an
agent this plugin spawns can spawn its own children. **This needs no code in `pi-client.ts` and never
did** — it works because of what `createAgentSession` is *not* told:

- `resourceLoader` is omitted, so `DefaultResourceLoader` is used. It resolves user-scope packages
  through `packageManager.resolve()`, reading `~/.pi/agent/settings.json` → `packages`.
- neither `tools` nor `noTools` is passed, so extension tools stay registered *and* active alongside
  the built-in read/bash/edit/write set.
- `agentDir` is omitted, so it defaults to `~/.pi/agent` — the same config the Pi CLI uses.

`pi install npm:pi-subagents` appends `"npm:pi-subagents"` to `settings.packages` and unpacks into
`~/.pi/agent/npm/node_modules/`. It does **not** write to `~/.pi/agent/extensions/`, so detection reads
the packages array — that is what `hasSubagents` in `pi-settings.ts` checks, and what the monitor's
second hint line reports.

**Only user-scope packages work here.** `DefaultResourceLoader.loadProjectTrustExtensions()` forces
project settings untrusted during the bootstrap pass, deliberately keeping project-local
extensions out unless a `resolveProjectTrust` callback grants trust. The MCP server is
non-interactive and passes no such callback, so anything installed with `pi install -l` (project
scope, `<cwd>/.pi/`) will silently not load. Diagnosing that as a bug wastes a session — it is by
design.

Verified end to end against the live SDK, not inferred: a `pi_run_task` agent called
`subagent { action: "list" }` and got the real agent roster back, and a second run delegated to the
`worker` agent and returned the child's answer.

**Known limitation, accepted deliberately:** `session-store.ts` and the status line model exactly one
level of Pi sessions. Grandchildren are invisible to `pi_poll_agent`, `pi_steer_agent` and
`pi_terminate_agent`, and their token spend is not counted in the status line. Depth and concurrency
control belong to pi-subagents' own config, not here — do not add a nested-session tracking layer to
this plugin without a concrete reason.

### In-memory session state

`session-store.ts` (`makeSessionStore`) holds all live and recently-completed sessions as an immutable-entry `Map<string, SessionEntry>`. Every mutation calls `onChange`, which triggers `status-writer.ts` to atomically write `~/.claude/claude-pi/status.json` via a tmp-rename pattern. `scripts/statusline.sh` reads that file to render the Claude Code status bar line.

### Event logger

`event-logger.ts` (`makeSessionLogger`) writes per-session JSONL files to `~/.claude/claude-pi/sessions/<session-id>.jsonl`. All writes serialize through a promise chain to guarantee line order. Invoked from `pi_spawn_agent` in `tools.ts`.

### Plugin wiring

`plugin.json` → `.claude-plugin/scripts/install.sh` and `uninstall.sh` manage:
- `~/.claude/settings.json` → `statusLine.command` — path to `scripts/statusline.sh`
- `${PWD}/.mcp.json` → `mcpServers.pi` — points to a stable wrapper at `~/.claude/claude-pi/mcp-server.sh` that resolves the current install path at runtime (survives version upgrades)
- `~/.claude/CLAUDE.md` — appends a sentinel-guarded block instructing Claude to lead with Pi for multi-agent workflows; removed cleanly on uninstall

`monitors/monitors.json` runs `bin/monitor/list-models.js` at session start using `${CLAUDE_PLUGIN_ROOT}`.

### Skills

`skills/orchestrate/SKILL.md` — guides Claude on when to delegate, model tier selection, the parallel-spawn pattern, and the 6-agent parallel cap. Invoked as `claude-pi:orchestrate`.

`skills/superpowers/SKILL.md` — routes [superpowers](https://github.com/obra/superpowers) workflow roles to Pi. Read-only roles (spec reviewer, code quality reviewer, parallel investigation agents) go to Pi; implementer subagents that need `Edit`/`Bash` stay on the `Agent` tool. Invoked as `claude-pi:superpowers`. Only surfaced when superpowers is detected at session start.

### Version sync

`npm version <patch|minor|major>` bumps `package.json` and automatically syncs `.claude-plugin/plugin.json` via the `version` lifecycle hook, staging both files into the same git commit.

### Dependency injection pattern

The Pi SDK (`@earendil-works/pi-coding-agent`) is never imported in tests. Every production module takes an injectable factory or interface:
- `makeTools(store, client, opts)` — `client` is a `PiClient` interface
- `makeSessionStore(opts)` — `onChange` is injectable
- `makePiSessionFactory(deps)` — `deps.modelRuntime` is injectable

### Pi SDK surface (`@earendil-works/pi-coding-agent`)

The SDK moved scope from `@mariozechner` at 0.84. Three call-site differences matter:

- `ModelRuntime.create()` replaces `AuthStorage.create()` + `ModelRegistry.create(auth)`. It is
  **async**, resolves credentials itself (no `AuthStorage` to thread), and reads Pi's local model
  store — `allowModelNetwork` defaults to false and is *not* needed to see current models, so the
  server does no network I/O at startup.
- `getAvailable()` is now **async** and returns a **readonly** array. `ModelRuntimeLike` and
  `filterByEnabledModels` both accept `readonly`, which is why the seam absorbed the change.
- `getModel(provider, id)` replaces `find(provider, id)` — still sync, still returns `undefined`
  rather than throwing on an unknown pair.

`ModelRuntimeLike` in `pi-client.ts` is the injection seam: it is declared structurally, so the
concrete SDK type never reaches `makePiClient`'s signature and tests pass a plain object.
`makePiSessionFactory` does take the concrete `ModelRuntime`, because `createAgentSession` requires
it — that factory is exercised through mocks of the module, not the type.

`makePiSessionAdapter` is exported specifically so it can be tested in isolation from the SDK.

### Build output

`tsc` compiles `src/` → `bin/` preserving the directory structure. `bin/` is committed to the repo so users can install the plugin without a build step.

**`bin/` is what actually runs.** The MCP wrapper execs `$INSTALL_PATH/bin/server/index.js` and
`monitors/monitors.json` runs `bin/monitor/list-models.js` — nothing loads `src/` at runtime. A `src/`
edit has zero effect until `npm run build`, and committing without it lands a src/bin mismatch in the
repo. Run `npm run build` before committing any `src/` change.

`tsconfig.json` excludes `tests/` — `npm run build` does not typecheck the test suite.

## Key env vars

| Variable | Default | Purpose |
|---|---|---|
| `PI_SESSIONS_DIR` | `~/.claude/claude-pi/sessions` | Override JSONL session log directory |
| `PI_SESSION_TTL_MS` | `1800000` (30 min) | Session entry TTL in the store |
| `STATUS_FILE` | `~/.claude/claude-pi/status.json` | Read by `scripts/statusline.sh` only — **does not redirect writes**; `status-writer.ts` has no env override (inject `statusDir` instead) |
