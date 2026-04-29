#!/usr/bin/env bash
# Run scenario WITH the orchestration skill loaded
# GREEN phase: Claude should delegate to Pi using the skill guidance
# This demonstrates how behavior changes with the orchestration skill applied.

cd "$(dirname "$0")/.." || exit 1
claude --plugin-dir . -p "$(cat tests/scenarios/delegation-baseline.md)"
