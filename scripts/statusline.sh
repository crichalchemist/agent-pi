#!/usr/bin/env bash
# Reads ~/.claude/claude-pi/status.json and outputs a single formatted line
# for Claude Code's statusLine. Outputs nothing when idle.

STATUS_FILE="${STATUS_FILE:-${HOME}/.claude/claude-pi/status.json}"

[[ -f "$STATUS_FILE" ]] || exit 0

running=$(python3 -c "import json,sys; d=json.load(open('$STATUS_FILE')); print(d.get('running',0))" 2>/dev/null)
[[ "$running" =~ ^[0-9]+$ ]] || exit 0
(( running == 0 )) && exit 0

models=$(python3 -c "
import json
d = json.load(open('$STATUS_FILE'))
print(', '.join(d.get('models', [])))
" 2>/dev/null)

bytes=$(python3 -c "
import json
d = json.load(open('$STATUS_FILE'))
b = d.get('totalOutputBytes', 0)
if b >= 1024:
    print(f'{b/1024:.1f}KB')
else:
    print(f'{b}B')
" 2>/dev/null)

if [[ -n "$models" ]]; then
  echo "Pi: ${running} running (${models}) | ${bytes}"
else
  echo "Pi: ${running} running | ${bytes}"
fi
