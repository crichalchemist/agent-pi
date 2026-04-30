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

if [[ ! -f "$SETTINGS_FILE" ]]; then
  echo '{}' > "$SETTINGS_FILE"
fi

python3 - "$SETTINGS_FILE" "$STATUSLINE_CMD" "$WRAPPER" <<'PYEOF'
import json, sys

settings_path, cmd, wrapper = sys.argv[1], sys.argv[2], sys.argv[3]

with open(settings_path) as f:
    settings = json.load(f)

settings['statusLine'] = {
    'type': 'command',
    'command': cmd,
}

settings.setdefault('mcpServers', {})['pi'] = {
    'command': wrapper,
}

with open(settings_path, 'w') as f:
    json.dump(settings, f, indent=2)
    f.write('\n')

print(f'[claude-pi] Status line installed: {cmd}')
print(f'[claude-pi] MCP server registered via wrapper: {wrapper}')
PYEOF
