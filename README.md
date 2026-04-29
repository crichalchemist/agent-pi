# claude-pi

A Claude Code plugin that lets Claude delegate tasks to [Pi](https://pi.dev) agents. Claude orchestrates; Pi executes — using cost-appropriate models for mechanical, parallelizable, or model-diverse subtasks.

## What it does

When Claude identifies a task that is independent, repetitive, or better suited to a different model, it can hand that task to a Pi agent instead of handling it in the current session. This saves tokens for reasoning-heavy work and runs subtasks in parallel.

At every session start, the plugin discovers your available Pi models and reports them to Claude as a notification. Claude uses those models throughout the session without you having to configure anything.

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

The plugin inherits whichever providers Pi has access to. Models without a valid key are excluded from the available list automatically.

## Installation

```bash
claude /plugin install github:crichalchemist/agent-pi
```

No build step required — compiled files are included in the repository.

## How it works

### Session-start model notification

When you open a Claude Code session, the plugin runs a one-shot script that queries Pi for available models and delivers a notification before any user interaction:

```
[pi-models] Available: gemini-2.5-pro (frontier), gemini-2.0-flash (fast), gpt-4o (balanced) — use pi_list_models to refresh
```

Claude reads this notification and routes tasks to the appropriate tier.

| Tier | Examples | Best for |
|------|----------|---------|
| fast | gemini-2.0-flash, claude-haiku-4-5, gpt-4o-mini | Formatting, boilerplate, mechanical transforms |
| balanced | gpt-4o, claude-sonnet-4-6, o3-mini | Standard coding, analysis, research |
| frontier | gemini-2.5-pro, claude-opus-4-7, o3 | Novel reasoning, architecture, state-of-the-art tasks |

### MCP tools

The plugin registers seven tools on the `pi` MCP server:

| Tool | Description |
|------|-------------|
| `pi_list_models` | Refresh available models mid-session |
| `pi_run_task` | Run a task and wait for the result (blocking) |
| `pi_spawn_agent` | Spawn an agent and return a session ID immediately |
| `pi_steer_agent` | Send a steering message to a running agent |
| `pi_poll_agent` | Check status and partial output of a spawned agent |
| `pi_get_result` | Wait for a spawned agent to finish and return output |
| `pi_terminate_agent` | Abort a running agent |

### Orchestration skill

The plugin includes a skill at `skills/orchestrate/SKILL.md` that guides Claude on when to delegate, which model tier to choose, and the parallel-spawn pattern:

```
pi_spawn_agent × N  →  pi_poll_agent loop  →  pi_get_result × N  →  synthesize
```

Invoke it directly with `/claude-pi:orchestrate`, or Claude will activate it automatically when a task matches the delegation criteria.

## Development

```bash
npm install
npm test          # 31 unit tests
npm run build     # compile src/ → bin/
```

Tests use [vitest](https://vitest.dev). The Pi SDK is never called in unit tests — all SDK dependencies are injectable.

## License

MIT
