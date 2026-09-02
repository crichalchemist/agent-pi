# claude-pi

[![CI](https://github.com/crichalchemist/agent-pi/actions/workflows/ci.yml/badge.svg)](https://github.com/crichalchemist/agent-pi/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/crichalchemist/agent-pi?sort=semver)](https://github.com/crichalchemist/agent-pi/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A Claude Code plugin that turns [Pi](https://pi.dev) into a multi-agent orchestration layer. Run
diverse agentic workflows by coordinating a fleet of AI models in parallel, outside your context
window — whichever providers you have configured in Pi.

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

Installing touches three things outside this repository:

- `~/.claude/settings.json` — sets `statusLine.command`
- `~/.claude/CLAUDE.md` — appends a sentinel-guarded block telling Claude to lead with Pi
- `./.mcp.json` — registers the MCP server in the project you install from

To reverse all three:

```bash
claude /plugin uninstall claude-pi
```

## How it works

### Session-start model notification

When a Claude Code session opens, the plugin runs a one-shot script that queries Pi for available models and delivers a notification before any user interaction:

```
[pi-models] Available: <model> (frontier), <model> (balanced), <model> (fast) — default: <provider>/<model> — use pi_list_models to refresh
```

Claude reads this notification and routes tasks to the appropriate tier. Your line lists whatever
models *your* Pi install actually serves — the plugin pins no model list of its own.

| Tier | Typically matches | Best for |
|------|-------------------|---------|
| fast | names containing `flash`, `haiku`, `mini`, `nano` | Formatting, boilerplate, retrieval, mechanical transforms |
| balanced | anything unmatched — the default | Standard coding, analysis, review, research |
| frontier | names containing `opus`, `pro`, `thinking` | Novel reasoning, architecture, security review |

Tiers are derived from the model name by pattern, not from a hardcoded list, so a newly released
model classifies correctly without a plugin update. A small override table handles names that
don't classify cleanly (`o3` is frontier, `o3-mini` is balanced).

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

`npm run eval` is a separate, slower check: it drives a real Claude Code session and asserts on
which Pi tools that session actually called, verifying the skills change delegation behavior
rather than just reading well. It runs against a stub Pi server by default, so it costs nothing.
See [CLAUDE.md](CLAUDE.md) for its design.

## License

MIT — see [LICENSE](LICENSE).
