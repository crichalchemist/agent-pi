---
name: claude-pi-superpowers
description: Use when running a superpowers workflow — subagent-driven-development, dispatching-parallel-agents, systematic-debugging, or requesting-code-review — to decide which roles should go to Pi versus the Agent tool
---

# Pi + Superpowers: Diverse Agentic Workflows

## Overview

Pi provides a heterogeneous agent fleet — Gemini, GPT-4, Claude, and others — running outside your context window. Superpowers workflows have natural read-only roles where Pi adds model diversity and breadth without consuming tokens.

**REQUIRED:** Load `claude-pi:orchestrate` for Pi tool signatures, model tiers, and the parallel pattern.

## Role Routing

| Role | Tool | Tier |
|------|------|------|
| Spec compliance reviewer | Pi | balanced |
| Code quality reviewer | Pi | balanced |
| Security reviewer | Pi | frontier |
| Parallel investigation agent | Pi | balanced |
| Parallel research agent | Pi | fast |
| Implementer subagent | `Agent` tool | — needs Bash/Edit/Write |
| Brainstorming dialogue | neither | — no subagent dispatch |

## Per-Workflow Patterns

### subagent-driven-development

Reviewer roles receive the full diff + spec context in the prompt — no local file access needed.

```
Per task:
  Implementer            → Agent tool          (needs Edit/Bash)
  Spec reviewer          → pi_spawn_agent       balanced
  Code quality reviewer  → pi_spawn_agent       balanced
  Security-sensitive     → pi_spawn_agent       frontier
```

Use `pi_run_task` for sequential reviews. For the final cross-task review, spawn once and `pi_get_result`.

Use `followUp: true` on `pi_spawn_agent` when you want to queue a review without interrupting the implementer.

### dispatching-parallel-agents / systematic-debugging

Independent investigations are Pi's strongest use case — each agent gets a self-contained prompt.

```
1. pi_spawn_agent × N  — focused investigation prompt per agent
2. pi_poll_agent loop  — steer if off-track
3. pi_get_result × N   — collect findings
4. synthesize          — combine in this session
```

Prefer balanced for code/log analysis; fast for pure text retrieval.

### requesting-code-review

The reviewer receives git SHAs and a full diff — entirely read-only and ideal for Pi.

```
pi_run_task(
  model: 'google/gemini-2.5-pro',  // frontier when review gates a merge to main
  task: <full requesting-code-review prompt with git diff>
)
```

Use balanced for draft or in-progress reviews; frontier when gating main.

## What Pi Cannot Do

Pi agents have no access to your local filesystem. Never delegate roles that require:
- Editing or writing files
- Running tests or shell commands
- Reading project files not provided in the prompt

When a role needs local access, use the `Agent` tool.
