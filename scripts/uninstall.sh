#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SETTINGS="$HOME/.claude/settings.json"
BACKUP="$HOME/.claude/statusline.backup.json"

echo "[claude-gauge] Uninstalling..."

# Stop the proxy
echo "[claude-gauge] Stopping rate limit proxy..."
node "$PLUGIN_ROOT/scripts/proxy-ctl.js" stop || true

# Belt-and-suspenders: verify port is free, force-kill any stragglers
PROXY_PORT="${GAUGE_PROXY_PORT:-3456}"
if command -v lsof &>/dev/null; then
  STRAGGLER=$(lsof -ti :"$PROXY_PORT" 2>/dev/null || true)
  if [[ -n "$STRAGGLER" ]]; then
    echo "[claude-gauge] Force-killing straggler on port $PROXY_PORT (pid $STRAGGLER)..."
    kill -9 $STRAGGLER 2>/dev/null || true
  fi
elif [[ "${OS:-}" == "Windows_NT" || "$(uname -s)" == MINGW* || "$(uname -s)" == MSYS* ]]; then
  STRAGGLER=$(netstat -ano -p TCP 2>/dev/null | grep "127\.0\.0\.1:${PROXY_PORT}.*LISTENING" | awk '{print $NF}' | head -1)
  if [[ -n "$STRAGGLER" && "$STRAGGLER" != "0" ]]; then
    echo "[claude-gauge] Force-killing straggler on port $PROXY_PORT (pid $STRAGGLER)..."
    taskkill.exe /T /F /PID "$STRAGGLER" 2>/dev/null || true
  fi
fi

# Remove PID file and cache
rm -f "$HOME/.claude/gauge-proxy.pid" 2>/dev/null || true
rm -f "$HOME/.claude/gauge-rate-limits.json" 2>/dev/null || true

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
echo "  The current session still has the old environment loaded."
echo ""
