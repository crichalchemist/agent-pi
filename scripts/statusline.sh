#!/usr/bin/env bash
# Reads ~/.claude/claude-pi/status.json and outputs a single formatted line
# for Claude Code's statusLine. Outputs nothing when idle.

STATUS_FILE="${STATUS_FILE:-${HOME}/.claude/claude-pi/status.json}"

[[ -f "$STATUS_FILE" ]] || exit 0

output=$(python3 - "$STATUS_FILE" <<'EOF'
import json, sys

d = json.load(open(sys.argv[1]))
running = d.get('running', 0)
if running == 0:
    sys.exit(0)

models = d.get('models', [])
b = d.get('totalOutputBytes', 0)
size = f'{b/1024:.1f}KB' if b >= 1024 else f'{b}B'
model_str = f' ({", ".join(models)})' if models else ''
print(f'Pi: {running} running{model_str} | {size}')
EOF
) || exit 0

[[ -n "$output" ]] && echo "$output"
exit 0
