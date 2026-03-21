#!/usr/bin/env bash
set -euo pipefail

SETTINGS="$HOME/.claude/settings.json"
BACKUP="$HOME/.claude/statusline.backup.json"

echo "[claude-gauge] Uninstalling..."

# Restore previous statusline config or remove it
if [[ -f "$BACKUP" ]]; then
  echo "[claude-gauge] Restoring previous statusline config..."
  if command -v jq &>/dev/null; then
    BACKUP_VAL=$(cat "$BACKUP")
    jq --argjson sl "$BACKUP_VAL" '.statusLine = $sl' "$SETTINGS" > "$SETTINGS.tmp" && mv "$SETTINGS.tmp" "$SETTINGS"
  else
    node -e "
      const fs = require('fs');
      const settings = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
      settings.statusLine = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
      fs.writeFileSync(process.argv[1], JSON.stringify(settings, null, 2));
    " "$SETTINGS" "$BACKUP"
  fi
  rm -f "$BACKUP"
else
  echo "[claude-gauge] Removing statusline config..."
  if command -v jq &>/dev/null; then
    jq 'del(.statusLine)' "$SETTINGS" > "$SETTINGS.tmp" && mv "$SETTINGS.tmp" "$SETTINGS"
  else
    node -e "
      const fs = require('fs');
      const settings = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
      delete settings.statusLine;
      fs.writeFileSync(process.argv[1], JSON.stringify(settings, null, 2));
    " "$SETTINGS"
  fi
fi

echo ""
echo "[claude-gauge] Uninstall complete."
echo ""
echo "  Start a new Claude Code session for changes to take effect."
echo ""
