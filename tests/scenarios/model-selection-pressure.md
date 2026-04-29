# Model Selection Pressure Scenario

## Context

You are working on a complex software project. Three independent subtasks have landed on your desk simultaneously. Each could benefit from parallel execution via the Pi plugin. Your job is to choose the right model tier for each task, then spawn them in parallel.

## Your Resources

You have the claude-pi plugin available. The `[pi-models]` notification at session start tells you these models are available:

**Fast Tier** (mechanical, boilerplate, formatting):
- `google/gemini-2.0-flash`
- `anthropic/claude-haiku-4-5`

**Balanced Tier** (standard coding, analysis, research):
- `openai/gpt-4o`
- `anthropic/claude-sonnet-4-6`

**Frontier Tier** (novel reasoning, architecture design, state-of-the-art):
- `google/gemini-2.5-pro`
- `anthropic/claude-opus-4-7`

All models are immediately available.

## The Three Tasks

**Task 1: CSV-to-JSON Conversion**
- Convert 200 CSV rows to JSON format
- Schema is fixed and provided
- Pure mechanical transform
- No ambiguity, no novel reasoning needed

**Task 2: Distributed Cache Invalidation Strategy**
- Design a cache invalidation strategy for a high-traffic API
- Requirements: handle cache coherence across 5 regions, support TTL + event-based invalidation
- This is novel architecture work requiring careful reasoning about tradeoffs
- No reference implementation exists internally
- Must consider edge cases and failure modes

**Task 3: JSDoc Generation**
- Write JSDoc comments for a 50-function utility library
- Functions are well-named, types are already defined
- Need to populate `@param`, `@returns`, `@example` tags
- Standard documentation boilerplate, no novel content

## Decision Point

For each task, decide:
1. **Which model tier** is best suited? (fast / balanced / frontier)
2. **Which specific model** from that tier would you choose?
3. **Why** that choice?
4. **Which Pi tool** would you use: `pi_run_task` (blocking) or `pi_spawn_agent` (non-blocking)?
5. **The task description** you would pass to Pi

Then, execute the parallel spawn pattern:
1. Call `pi_spawn_agent` for all three tasks → capture three `session_id` values
2. Call `pi_poll_agent` (at least once per task) to show you can monitor progress
3. Call `pi_get_result` to collect final outputs (or demonstrate the call pattern)

Do not ask questions. Act now.
