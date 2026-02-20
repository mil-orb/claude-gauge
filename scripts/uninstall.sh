#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SETTINGS="$HOME/.claude/settings.json"
BACKUP="$HOME/.claude/statusline.backup.json"

echo "[claude-gauge] Uninstalling..."

# Stop the proxy
echo "[claude-gauge] Stopping rate limit proxy..."
node "$PLUGIN_ROOT/scripts/proxy-ctl.js" stop 2>/dev/null || true

# Remove PID file and cache
rm -f "$HOME/.claude/gauge-proxy.pid" 2>/dev/null || true
rm -f "$HOME/.claude/gauge-rate-limits.json" 2>/dev/null || true
rm -f "$HOME/.claude/gauge-sessions" 2>/dev/null || true

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

# Remove claude-gauge block from shell profiles (handles both old single-line and new conditional block)
for profile in "$HOME/.zshrc" "$HOME/.bash_profile" "$HOME/.bashrc" "$HOME/.profile"; do
  if [[ -f "$profile" ]] && grep -q 'claude-gauge rate limit proxy' "$profile" 2>/dev/null; then
    if command -v sed &>/dev/null; then
      if grep -q 'claude-gauge rate limit proxy (conditional' "$profile" 2>/dev/null; then
        # New conditional block: delete from comment line through closing fi
        sed -i.bak '/# claude-gauge rate limit proxy (conditional/,/^fi$/d' "$profile"
      else
        # Legacy single-line format: comment + export
        sed -i.bak '/# claude-gauge rate limit proxy/d' "$profile"
        sed -i.bak '/export ANTHROPIC_BASE_URL.*localhost/d' "$profile"
      fi
      # Clean up any leftover ANTHROPIC_BASE_URL lines from gauge
      sed -i.bak '/ANTHROPIC_BASE_URL.*localhost.*3456/d' "$profile"
      rm -f "$profile.bak"
      echo "[claude-gauge] Removed claude-gauge config from $profile"
    fi
  fi
done

echo ""
# On Windows, remove the user-level environment variable automatically
if [[ "$(uname -s)" == MINGW* || "$(uname -s)" == MSYS* || "$(uname -s)" == CYGWIN* || "${OS:-}" == "Windows_NT" ]]; then
  WIN_VAL=$(powershell.exe -NoProfile -Command "[System.Environment]::GetEnvironmentVariable('ANTHROPIC_BASE_URL', 'User')" 2>/dev/null | tr -d '\r')
  if [[ -n "$WIN_VAL" && "$WIN_VAL" == *"localhost"* ]]; then
    powershell.exe -NoProfile -Command "[System.Environment]::SetEnvironmentVariable('ANTHROPIC_BASE_URL', \$null, 'User')" 2>/dev/null
    echo "[claude-gauge] Removed Windows ANTHROPIC_BASE_URL"
  fi
fi

echo ""
echo "[claude-gauge] Uninstall complete."
echo ""
echo "  Start a new Claude Code session for changes to take effect."
echo "  The current session still has the old environment loaded."
echo ""
