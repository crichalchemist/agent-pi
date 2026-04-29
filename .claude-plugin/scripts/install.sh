#!/usr/bin/env bash
# Patches ~/.claude/settings.json to add the Pi status line command.
# PLUGIN_ROOT is set by the Claude Code plugin system to the resolved plugin path.

set -euo pipefail

SETTINGS_FILE="${SETTINGS_FILE:-${HOME}/.claude/settings.json}"
STATUSLINE_CMD="${PLUGIN_ROOT}/scripts/statusline.sh"

if [[ ! -f "$SETTINGS_FILE" ]]; then
  echo '{}' > "$SETTINGS_FILE"
fi

python3 - "$SETTINGS_FILE" "$STATUSLINE_CMD" <<'PYEOF'
import json, sys

settings_path, cmd = sys.argv[1], sys.argv[2]

with open(settings_path) as f:
    settings = json.load(f)

settings['statusLine'] = {
    'type': 'command',
    'command': cmd,
}

with open(settings_path, 'w') as f:
    json.dump(settings, f, indent=2)
    f.write('\n')

print(f'[claude-pi] Status line installed: {cmd}')
PYEOF
