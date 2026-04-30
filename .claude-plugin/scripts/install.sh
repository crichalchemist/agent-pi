#!/usr/bin/env bash
# Patches ~/.claude/settings.json to add the Pi status line and MCP server.
# PLUGIN_ROOT is set by the Claude Code plugin system to the resolved plugin path.

set -euo pipefail

SETTINGS_FILE="${SETTINGS_FILE:-${HOME}/.claude/settings.json}"
STATUSLINE_CMD="${PLUGIN_ROOT}/scripts/statusline.sh"
SERVER_SCRIPT="${PLUGIN_ROOT}/bin/server/index.js"

if [[ ! -f "$SETTINGS_FILE" ]]; then
  echo '{}' > "$SETTINGS_FILE"
fi

python3 - "$SETTINGS_FILE" "$STATUSLINE_CMD" "$SERVER_SCRIPT" <<'PYEOF'
import json, sys

settings_path, cmd, server_script = sys.argv[1], sys.argv[2], sys.argv[3]

with open(settings_path) as f:
    settings = json.load(f)

settings['statusLine'] = {
    'type': 'command',
    'command': cmd,
}

settings.setdefault('mcpServers', {})['pi'] = {
    'command': 'node',
    'args': [server_script],
}

with open(settings_path, 'w') as f:
    json.dump(settings, f, indent=2)
    f.write('\n')

print(f'[claude-pi] Status line installed: {cmd}')
print(f'[claude-pi] MCP server registered: {server_script}')
PYEOF
