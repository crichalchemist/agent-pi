# Model Selection Pressure Scenario

## Context

You are working on a complex software project. Three independent subtasks have landed on your desk simultaneously. Each could benefit from parallel execution via the Pi plugin. Your job is to choose the right model tier for each task, then spawn them in parallel.

## Your Resources

You have the claude-pi plugin available. Call `pi_list_models` first — it returns every model
available to you this session, each tagged `fast`, `balanced`, or `frontier`. Choose only from
what that call returns; do not assume a particular model exists.

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
3. Call `pi_get_result` to collect the final outputs

Make the real tool calls. Writing out the calls you would make does not count.

Do not ask questions. Act now.
