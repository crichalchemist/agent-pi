#!/usr/bin/env bash
# Removes the Pi status line and MCP server entry from ~/.claude/settings.json.

set -euo pipefail

SETTINGS_FILE="${SETTINGS_FILE:-${HOME}/.claude/settings.json}"
WRAPPER="${HOME}/.claude/claude-pi/mcp-server.sh"
STATUSLINE_CMD="${PLUGIN_ROOT}/scripts/statusline.sh"

[[ -f "$SETTINGS_FILE" ]] || exit 0

python3 - "$SETTINGS_FILE" "$STATUSLINE_CMD" "$WRAPPER" <<'PYEOF'
import json, sys

settings_path, cmd, wrapper = sys.argv[1], sys.argv[2], sys.argv[3]

with open(settings_path) as f:
    settings = json.load(f)

existing = settings.get('statusLine', {})
if existing.get('command') == cmd:
    del settings['statusLine']
    print(f'[claude-pi] Status line removed.')
else:
    print(f'[claude-pi] Status line not set by this plugin, skipping.')

mcp = settings.get('mcpServers', {})
pi_entry = mcp.get('pi', {})
if pi_entry.get('command') == wrapper:
    del mcp['pi']
    if not mcp:
        del settings['mcpServers']
    print(f'[claude-pi] MCP server removed.')
else:
    print(f'[claude-pi] MCP server not set by this plugin, skipping.')

with open(settings_path, 'w') as f:
    json.dump(settings, f, indent=2)
    f.write('\n')
PYEOF

# Remove the wrapper script if it still points to us
[[ -f "$WRAPPER" ]] && rm "$WRAPPER" && echo '[claude-pi] Wrapper script removed.'
