#!/usr/bin/env bash
# Removes the Pi status line entry from ~/.claude/settings.json if it points
# to this plugin's script.

set -euo pipefail

SETTINGS_FILE="${SETTINGS_FILE:-${HOME}/.claude/settings.json}"
STATUSLINE_CMD="${PLUGIN_ROOT}/scripts/statusline.sh"

[[ -f "$SETTINGS_FILE" ]] || exit 0

python3 - "$SETTINGS_FILE" "$STATUSLINE_CMD" <<'PYEOF'
import json, sys

settings_path, cmd = sys.argv[1], sys.argv[2]

with open(settings_path) as f:
    settings = json.load(f)

existing = settings.get('statusLine', {})
if existing.get('command') == cmd:
    del settings['statusLine']
    with open(settings_path, 'w') as f:
        json.dump(settings, f, indent=2)
        f.write('\n')
    print(f'[claude-pi] Status line removed.')
else:
    print(f'[claude-pi] Status line not set by this plugin, skipping.')
PYEOF
