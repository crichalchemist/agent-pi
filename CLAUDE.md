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

## Architecture

This is a Claude Code plugin (`claude-pi`) that exposes a Pi agent orchestration layer as an MCP server. There are two runtime entry points:

**`src/server/index.ts`** — the MCP stdio server, started by Claude Code via `~/.claude/settings.json` → `mcpServers.pi`. Registers seven tools (`pi_list_models`, `pi_run_task`, `pi_spawn_agent`, `pi_steer_agent`, `pi_poll_agent`, `pi_get_result`, `pi_terminate_agent`).

**`src/monitor/list-models.ts`** — a one-shot script run at session start via `monitors/monitors.json`. Queries Pi for available models and emits a `[pi-models]` notification to the conversation before any user interaction.

### Data flow through the server

```
MCP call → tools.ts (makeTools)
                ↓
         pi-client.ts (makePiClient / makePiSessionFactory)
                ↓
         @mariozechner/pi-coding-agent SDK (createAgentSession + session.prompt)
                ↓
         makePiSessionAdapter — subscribes immediately, buffers events until
         tools.ts calls adapted.subscribe(), then drains synchronously
```

`session.prompt(task)` is fire-and-forget (`.catch(() => {})`) inside `makePiSessionFactory` — this is intentional. The adapter's pre-subscription buffer makes it safe and allows `store.add('running')` to fire before the task completes, which is what drives the statusline.

### Pi settings integration

`src/server/pi-settings.ts` reads `~/.pi/agent/settings.json` (the user's Pi desktop app config) and exports two utilities used by both `pi-client.ts` and `list-models.ts`:

- `readPiSettings(path?)` — reads and parses the settings file; returns `{}` on any error
- `filterByEnabledModels(models, settings)` — filters a model list to only those in `settings.enabledModels`; returns all models if `enabledModels` is absent or empty

`makePiClient` accepts an optional `{ readSettings }` injection for testability — all tests that call `listModels()` inject `async () => ({})` to stay independent of the real settings file.

The monitor notification includes `— default: provider/model` when `defaultProvider` + `defaultModel` are set in Pi settings, giving Claude an explicit starting point for delegation without tier inference.

### In-memory session state

`session-store.ts` (`makeSessionStore`) holds all live and recently-completed sessions as an immutable-entry `Map<string, SessionEntry>`. Every mutation calls `onChange`, which triggers `status-writer.ts` to atomically write `~/.claude/claude-pi/status.json` via a tmp-rename pattern. `scripts/statusline.sh` reads that file to render the Claude Code status bar line.

### Event logger

`event-logger.ts` (`makeSessionLogger`) writes per-session JSONL files to `~/.claude/claude-pi/sessions/<session-id>.jsonl`. All writes serialize through a promise chain to guarantee line order. Invoked from `pi_spawn_agent` in `tools.ts`.

### Plugin wiring

`plugin.json` → `scripts/install.sh` and `scripts/uninstall.sh` manage two entries in `~/.claude/settings.json`:
- `statusLine.command` — path to `scripts/statusline.sh`
- `mcpServers.pi` — absolute path to `bin/server/index.js` in the plugin cache

`monitors/monitors.json` runs `bin/monitor/list-models.js` at session start using `${CLAUDE_PLUGIN_ROOT}`.

### Dependency injection pattern

The Pi SDK (`@mariozechner/pi-coding-agent`) is never imported in tests. Every production module takes an injectable factory or interface:
- `makeTools(store, client, opts)` — `client` is a `PiClient` interface
- `makeSessionStore(opts)` — `onChange` is injectable
- `makePiSessionFactory(deps)` — `deps.modelRegistry` is injectable

`makePiSessionAdapter` is exported specifically so it can be tested in isolation from the SDK.

### Build output

`tsc` compiles `src/` → `bin/` preserving the directory structure. `bin/` is committed to the repo so users can install the plugin without a build step.

## Key env vars

| Variable | Default | Purpose |
|---|---|---|
| `PI_SESSIONS_DIR` | `~/.claude/claude-pi/sessions` | Override JSONL session log directory |
| `PI_SESSION_TTL_MS` | `1800000` (30 min) | Session entry TTL in the store |
| `STATUS_FILE` | `~/.claude/claude-pi/status.json` | Override statusline reads this file |
