#!/usr/bin/env bash
# Patches ~/.claude/settings.json to add the Pi status line and MCP server.
# PLUGIN_ROOT is set by the Claude Code plugin system to the resolved plugin path.
#
# The MCP server entry points to a stable wrapper (~/.claude/claude-pi/mcp-server.sh)
# that resolves the current install path at runtime — so upgrades never break the
# mcpServers entry in settings.json.

set -euo pipefail

SETTINGS_FILE="${SETTINGS_FILE:-${HOME}/.claude/settings.json}"
WRAPPER_DIR="${HOME}/.claude/claude-pi"
WRAPPER="${WRAPPER_DIR}/mcp-server.sh"
STATUSLINE_CMD="${PLUGIN_ROOT}/scripts/statusline.sh"

mkdir -p "$WRAPPER_DIR"

# Write the stable wrapper that resolves the current install at runtime.
# Written once — survives all future version upgrades without changes.
cat > "$WRAPPER" <<'WRAPPER_EOF'
#!/usr/bin/env bash
# Resolves the currently installed claude-pi binary at runtime.
# This file is written once by the install script and never needs updating.
INSTALL_PATH=$(python3 -c "
import json, os
f = os.path.expanduser('~/.claude/plugins/installed_plugins.json')
with open(f) as fp:
    p = json.load(fp)
for k, entries in p.get('plugins', {}).items():
    if 'claude-pi' in k:
        print(entries[-1]['installPath'])
        break
")
exec node "$INSTALL_PATH/bin/server/index.js"
WRAPPER_EOF
chmod +x "$WRAPPER"

# Write .mcp.json in the current working directory (where the user ran /plugin install).
# Claude Code reads MCP server config from project-level .mcp.json, not settings.json.
# The wrapper path is stable — this file never needs updating after version upgrades.
MCP_JSON="${PWD}/.mcp.json"
python3 - "$MCP_JSON" "$WRAPPER" <<'PYEOF'
import json, sys, os

mcp_path, wrapper = sys.argv[1], sys.argv[2]

existing = {}
if os.path.exists(mcp_path):
    try:
        with open(mcp_path) as f:
            existing = json.load(f)
    except Exception:
        pass

existing.setdefault('mcpServers', {})['pi'] = {'command': wrapper}

with open(mcp_path, 'w') as f:
    json.dump(existing, f, indent=2)
    f.write('\n')

print(f'[claude-pi] .mcp.json written: {mcp_path}')
PYEOF

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
