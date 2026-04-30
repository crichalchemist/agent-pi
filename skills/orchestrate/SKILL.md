---
name: claude-pi-orchestrate
description: Use when a task is mechanical, parallelizable, requires a different
  model's strengths, or where delegating preserves tokens — file generation,
  boilerplate, batch transforms, research, summarization, or any subtask
  independent of the current conversation context.
---

# Pi Orchestration

## Model Tiers

Tiers are populated from the `[pi-models]` notification at session start.

| Tier | Examples | Use when |
|------|----------|---------|
| fast | gemini-2.0-flash, claude-haiku-4-5, gpt-4o-mini | Formatting, boilerplate, mechanical transforms |
| balanced | gpt-4o, claude-sonnet-4-6, o3-mini | Standard coding, analysis, research |
| frontier | gemini-2.5-pro, claude-opus-4-7, o3 | Novel reasoning, architecture, state-of-the-art tasks |

Model keys use `provider/id` format when calling tools:
- `google/gemini-2.5-pro` (frontier)
- `google/gemini-2.0-flash` (fast)
- `anthropic/claude-haiku-4-5` (fast)
- `openai/gpt-4o` (balanced)

## Session-Start Awareness

At session start, Claude receives a `[pi-models]` notification from the monitor. Two forms:

- `[pi-models] Available: <model> (<tier>), ... — use pi_list_models to refresh` — use the listed models
- `[pi-models] No models available — configure Pi auth with \`pi auth\` or set provider env vars` — no Pi available, handle locally

If no `[pi-models]` notification arrived, call `pi_list_models` before delegating; if that also fails, handle the task locally.

Always use the models listed in the notification. Do not assume availability of unlisted models.

## When to Delegate

Delegate when ALL of these are true:
- Task is independent of current conversation context
- Task is mechanical, repetitive, or parallelizable
- A cheaper or more capable model is better suited
- Subtask runtime is likely > 30s (below this, Pi startup overhead isn't worth it)

Do NOT delegate when:
- Task requires reasoning about this specific conversation
- Task needs Claude's own tools (Bash, Edit, Write, Read, etc.)
- Task is trivially short (< 30s estimated runtime)

## Tool Reference

| Tool | Purpose |
|------|---------|
| `pi_list_models` | Refresh available models |
| `pi_run_task` | Run task and wait for result (blocking) |
| `pi_spawn_agent` | Spawn agent, returns session_id immediately |
| `pi_steer_agent` | Send mid-task steering message |
| `pi_poll_agent` | Check status and partial output |
| `pi_get_result` | Wait for spawned agent to finish |
| `pi_terminate_agent` | Abort a running agent |

## Parallel Pattern (primary)

```
1. pi_spawn_agent × N  → get N session_ids
2. pi_poll_agent loop  → check progress, steer if going off-track
3. pi_get_result × N   → collect final outputs
4. synthesize          → combine results in this session
```

**Cap parallel spawns at 6.** Beyond that, provider rate limits and context overhead from tracking session IDs and partial outputs outweigh the parallelism gains. For larger batches, spawn in waves of 6, collect results, then spawn the next wave.

Use `pi_run_task` only for single-task, time-bounded work where you need the result before continuing.

## Steering Rule

Poll running agents for long tasks. If output is going off-track, call `pi_steer_agent` immediately with a correction message. If steering is insufficient, call `pi_terminate_agent` and respawn with a more precise task description.
