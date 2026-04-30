#!/usr/bin/env bash
# Removes the Pi status line and MCP server entry from ~/.claude/settings.json.

set -euo pipefail

SETTINGS_FILE="${SETTINGS_FILE:-${HOME}/.claude/settings.json}"
WRAPPER="${HOME}/.claude/claude-pi/mcp-server.sh"
STATUSLINE_CMD="${PLUGIN_ROOT}/scripts/statusline.sh"

# Remove pi entry from .mcp.json in cwd if present
MCP_JSON="${PWD}/.mcp.json"
if [[ -f "$MCP_JSON" ]]; then
  python3 - "$MCP_JSON" "$WRAPPER" <<'PYEOF'
import json, sys, os

mcp_path, wrapper = sys.argv[1], sys.argv[2]
with open(mcp_path) as f:
    config = json.load(f)

mcp = config.get('mcpServers', {})
if mcp.get('pi', {}).get('command') == wrapper:
    del mcp['pi']
    if not mcp:
        del config['mcpServers']
    if config:
        with open(mcp_path, 'w') as f:
            json.dump(config, f, indent=2)
            f.write('\n')
    else:
        os.remove(mcp_path)
    print(f'[claude-pi] .mcp.json updated.')
PYEOF
fi

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

[[ -f "$WRAPPER" ]] && rm "$WRAPPER" && echo '[claude-pi] Wrapper script removed.'
