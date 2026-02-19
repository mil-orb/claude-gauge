#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SETTINGS="$HOME/.claude/settings.json"
BACKUP="$HOME/.claude/statusline.backup.json"
# On Windows, .sh files can't be executed directly — prefix with bash
if [[ "$OSTYPE" == msys* || "$OSTYPE" == cygwin* || "$OSTYPE" == win* ]]; then
  STATUSLINE_CMD="bash $PLUGIN_ROOT/statusline.sh"
else
  STATUSLINE_CMD="$PLUGIN_ROOT/statusline.sh"
fi

# Ensure settings file exists
if [[ ! -f "$SETTINGS" ]]; then
  echo '{}' > "$SETTINGS"
fi

# Check for jq or node
if ! command -v jq &>/dev/null && ! command -v node &>/dev/null; then
  echo "[claude-gauge] ERROR: jq or node required. Install jq: https://jqlang.github.io/jq/download/" >&2
  exit 1
fi

# Read current settings
CURRENT=$(cat "$SETTINGS")

# Backup existing statusline config if present
if command -v jq &>/dev/null; then
  HAS_STATUSLINE=$(jq -r 'has("statusLine")' <<< "$CURRENT")
else
  HAS_STATUSLINE=$(node -e "
    const j = JSON.parse(require('fs').readFileSync(0, 'utf8'));
    console.log(j.statusLine ? 'true' : 'false');
  " <<< "$CURRENT")
fi

if [[ "$HAS_STATUSLINE" == "true" ]]; then
  if command -v jq &>/dev/null; then
    jq '.statusLine' <<< "$CURRENT" > "$BACKUP"
  else
    node -e "
      const j = JSON.parse(require('fs').readFileSync(0, 'utf8'));
      process.stdout.write(JSON.stringify(j.statusLine, null, 2));
    " <<< "$CURRENT" > "$BACKUP"
  fi
fi

# Set statusline config
if command -v jq &>/dev/null; then
  jq --arg cmd "$STATUSLINE_CMD" '.statusLine = {"type":"command","command":$cmd,"padding":1}' <<< "$CURRENT" > "$SETTINGS"
else
  node -e "
    const fs = require('fs');
    const j = JSON.parse(fs.readFileSync(0, 'utf8'));
    j.statusLine = { type: 'command', command: process.argv[1], padding: 1 };
    fs.writeFileSync(process.argv[2], JSON.stringify(j, null, 2));
  " "$STATUSLINE_CMD" "$SETTINGS" <<< "$CURRENT"
fi

# Ensure statusline.sh is executable
chmod +x "$PLUGIN_ROOT/statusline.sh"

echo "[claude-gauge] Setup complete. Restart Claude Code to see the status line."
