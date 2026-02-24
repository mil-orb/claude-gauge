#!/usr/bin/env bash
# Lightweight proxy health check for the UserPromptSubmit hook.
# If the proxy is alive, exits immediately (~50ms).
# If dead, restarts it and re-routes API traffic.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PORT_VAL="${GAUGE_PROXY_PORT:-3456}"
if [[ ! "$PORT_VAL" =~ ^[0-9]+$ ]] || (( PORT_VAL < 1 || PORT_VAL > 65535 )); then
  echo "[claude-gauge] ERROR: GAUGE_PROXY_PORT must be a valid port number (got: $PORT_VAL)" >&2
  exit 1
fi
PROXY_URL="http://localhost:${PORT_VAL}"
SETTINGS="$HOME/.claude/settings.json"

# --- Platform detection ---
IS_WINDOWS="false"
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) IS_WINDOWS="true" ;;
esac
if [[ "${OS:-}" == "Windows_NT" ]]; then
  IS_WINDOWS="true"
fi

# Fast TCP check — exits 0 if proxy is listening
proxy_is_alive() {
  node -e "
    const s = require('net').createConnection(${PORT_VAL}, '127.0.0.1');
    s.on('connect', () => { s.destroy(); process.exit(0); });
    s.on('error', () => process.exit(1));
    setTimeout(() => process.exit(1), 300);
  " 2>/dev/null
}

# If alive, nothing to do
if proxy_is_alive; then
  exit 0
fi

# Proxy is down — restart it
node "$PLUGIN_ROOT/scripts/proxy-ctl.js" start 2>/dev/null || true
sleep 0.3 2>/dev/null || true

# Re-route or clean up depending on whether proxy recovered
if proxy_is_alive; then
  if [[ "$IS_WINDOWS" == "true" ]]; then
    node -e "
      const fs = require('fs');
      const p = process.argv[1];
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (!j.env) j.env = {};
      j.env.ANTHROPIC_BASE_URL = process.argv[2];
      fs.writeFileSync(p, JSON.stringify(j, null, 2));
    " "$SETTINGS" "$PROXY_URL" 2>/dev/null
  elif [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo "export ANTHROPIC_BASE_URL=\"$PROXY_URL\"" >> "$CLAUDE_ENV_FILE"
  fi
else
  # Proxy failed to restart — remove stale URL so Claude Code talks direct to API
  if [[ "$IS_WINDOWS" == "true" ]]; then
    node -e "
      const fs = require('fs');
      const p = process.argv[1];
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (j.env) {
        delete j.env.ANTHROPIC_BASE_URL;
        if (Object.keys(j.env).length === 0) delete j.env;
      }
      fs.writeFileSync(p, JSON.stringify(j, null, 2));
    " "$SETTINGS" 2>/dev/null
  fi
fi
