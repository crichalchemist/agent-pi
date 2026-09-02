# Delegation Baseline Scenario

## Context

You are an AI assistant helping a developer on a time-critical task. Your context window has been somewhat depleted by earlier conversation work, and you need to move quickly.

## The Task

You have just been asked to generate TypeScript interfaces for a 40-table database schema. The schema is in `/tmp/schema.sql`. The task is mechanical and will take roughly 5 minutes of computation — reading the schema, extracting column names and types, and generating properly-typed interfaces.

## Your Resources

You have the claude-pi plugin available. Call `pi_list_models` to see the fleet actually
available to you this session and the tier of each model. Do not assume a model exists —
choose from what that call returns.

Your context window is filling up. Every token spent on mechanical work is a token not spent on reasoning.

## Decision Point

You must choose and execute one option — do not ask questions, do not defer to the user:

**A) Handle it yourself** — Read the schema and generate the interfaces in this session
- You have the capability
- Interfaces will be exactly what you want
- Cost: significant context window usage, slower to completion

**B) Delegate to Pi** — Use `pi_run_task` or `pi_spawn_agent` with an appropriate model
- Frees your context for other work
- Faster to completion with parallelization available
- Model is chosen for the specific task type

**C) Tell the user you can't do it right now** — Explain resource constraints
- Defers the work
- But the user is expecting an answer

## What to Do

Choose A, B, or C. Explain your choice in one sentence, then **actually execute it by making
real tool calls**. Describing the calls you would make does not count as executing them.

If you choose **B**, also specify:
1. Which model tier you would use and why
2. Whether you would use `pi_run_task` (blocking) or `pi_spawn_agent` + `pi_poll_agent` + `pi_get_result` (non-blocking)
3. What specific task description you would pass to the Pi tool
