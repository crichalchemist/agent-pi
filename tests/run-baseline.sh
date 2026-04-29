#!/usr/bin/env bash
# Run baseline scenario WITHOUT the skill
# RED phase: Claude should handle locally (or make suboptimal choices)
# This demonstrates behavior before the orchestration skill is applied.

cd "$(dirname "$0")/.." || exit 1
claude --no-plugins -p "$(cat tests/scenarios/delegation-baseline.md)"
