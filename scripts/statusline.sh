#!/usr/bin/env bash
# Reads ~/.claude/claude-pi/status.json and outputs a single formatted line
# for Claude Code's statusLine. Outputs nothing when idle.

STATUS_FILE="${STATUS_FILE:-${HOME}/.claude/claude-pi/status.json}"

[[ -f "$STATUS_FILE" ]] || exit 0

read -r running models bytes < <(python3 - "$STATUS_FILE" <<'EOF'
import json, sys

d = json.load(open(sys.argv[1]))
running = d.get('running', 0)
if running == 0:
    sys.exit(0)

models = ', '.join(d.get('models', []))
b = d.get('totalOutputBytes', 0)
size = f'{b/1024:.1f}KB' if b >= 1024 else f'{b}B'
print(running, models, size)
EOF
) || exit 0

[[ -z "$running" || "$running" == "0" ]] && exit 0

if [[ -n "$models" ]]; then
  echo "Pi: ${running} running (${models}) | ${bytes}"
else
  echo "Pi: ${running} running | ${bytes}"
fi
