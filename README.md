# claude-pi

A Claude Code plugin that turns [Pi](https://pi.dev) into a multi-agent orchestration layer. Run diverse agentic workflows by coordinating a fleet of AI models — Gemini, GPT-4, Claude Haiku, and others — in parallel, outside your context window.

## What it does

Claude orchestrates. Pi executes.

When Claude identifies a subtask that is independent, parallelizable, or better suited to a different model, it can delegate that work to a Pi agent and continue reasoning in the main session. Agents run concurrently across providers, each chosen for what it's best at — not just what's cheapest.

At every session start, the plugin discovers your available Pi models and reports them before any user interaction. Claude uses those models throughout the session without any manual configuration.

If you have the [superpowers](https://github.com/obra/superpowers) plugin installed, the plugin detects it and surfaces a dedicated skill for routing superpowers workflow roles — spec reviewers, code quality reviewers, parallel investigation agents — to the appropriate Pi model.

## Prerequisites

- [Claude Code](https://claude.ai/code) 1.x or later
- [Pi](https://pi.dev) with at least one provider configured

Configure Pi auth once before installing the plugin:

```bash
pi auth
```

Or set provider environment variables directly:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export GEMINI_API_KEY=AIza...
export OPENAI_API_KEY=sk-...
```

## Installation

```bash
claude /plugin install github:crichalchemist/agent-pi
```

No build step required — compiled files are included in the repository.

The plugin patches `~/.claude/CLAUDE.md` to instruct Claude to lead with Pi for multi-agent workflows, and writes `.mcp.json` in the current project directory to register the MCP server.

## How it works

### Session-start model notification

When a Claude Code session opens, the plugin runs a one-shot script that queries Pi for available models and delivers a notification before any user interaction:

```
[pi-models] Available: gemini-2.5-pro (frontier), gemini-2.0-flash (fast), gpt-4o (balanced) — default: google/gemini-2.5-pro — use pi_list_models to refresh
```

Claude reads this notification and routes tasks to the appropriate tier.

| Tier | Examples | Best for |
|------|----------|---------|
| fast | gemini-2.0-flash, claude-haiku-4-5, gpt-4o-mini | Formatting, boilerplate, retrieval, mechanical transforms |
| balanced | gpt-4o, claude-sonnet-4-6, o3-mini | Standard coding, analysis, review, research |
| frontier | gemini-2.5-pro, claude-opus-4-7, o3 | Novel reasoning, architecture, security review, state-of-the-art tasks |

### MCP tools

The plugin registers eight tools on the `pi` MCP server:

| Tool | Description |
|------|-------------|
| `pi_list_models` | Refresh available models mid-session |
| `pi_run_task` | Run a task and wait for the result (blocking) |
| `pi_spawn_agent` | Spawn an agent and return a session ID immediately |
| `pi_steer_agent` | Send a mid-task steering message (delivered after current turn finishes) |
| `pi_followup_agent` | Queue a non-interruptive message (delivered only after agent finishes all work) |
| `pi_poll_agent` | Check status and partial output of a spawned agent |
| `pi_get_result` | Wait for a spawned agent to finish and return output |
| `pi_terminate_agent` | Abort a running agent |

### Parallel orchestration pattern

The primary pattern for multi-agent work:

```
pi_spawn_agent × N  →  pi_poll_agent loop  →  pi_get_result × N  →  synthesize
```

Spawn N agents with independent, self-contained prompts. Poll for progress and steer if needed. Collect results and synthesize in the main session.

### Skills

The plugin ships two skills:

**`skills/orchestrate/SKILL.md`** — guides Claude on when to delegate, which model tier to choose, and how to use the parallel-spawn pattern. Invoke with `/claude-pi:orchestrate`.

**`skills/superpowers/SKILL.md`** — routes superpowers workflow roles to Pi. Spec compliance reviewers, code quality reviewers, and parallel investigation agents are read-only and context-independent — ideal for Pi. Implementer subagents that need `Edit`/`Bash` stay on the `Agent` tool. Invoke with `/claude-pi:superpowers`.

## Status line

The plugin adds a live status line to Claude Code showing in-flight Pi agents, the models they are
running on, and total accumulated output:

```
Pi: 2 running (gemini-2.0-flash, gpt-4o) | 12.3KB
```

The line is written by `scripts/statusline.sh`, which prints nothing when no agent is running.

## Development

```bash
npm install
npm test          # 92 unit tests
npm run build     # compile src/ → bin/
npm run eval      # behavioral evals (drives real Claude sessions)
```

Tests use [vitest](https://vitest.dev). The Pi SDK is never imported in tests — all external dependencies are injectable.

`npm run eval` is separate and much slower: it uses `claude-session-driver` to launch a real
Claude Code session, feeds it a scenario from `tests/scenarios/`, and asserts on which Pi tools
the session actually called. It runs against a stub Pi server by default (no token spend); pass
`--real` to delegate to your live Pi fleet. Run `npm run build` first — the evals load `bin/`.

## License

MIT
