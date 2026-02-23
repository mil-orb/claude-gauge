#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SETTINGS="$HOME/.claude/settings.json"
BACKUP="$HOME/.claude/statusline.backup.json"
# Use node statusline.js — works on all platforms (Windows, macOS, Linux)
STATUSLINE_CMD="node \"$PLUGIN_ROOT/statusline.js\""

# SECURITY: PORT_VAL is interpolated into node commands and PROXY_URL.
# It MUST be validated numeric before any use downstream.
PORT_VAL="${GAUGE_PROXY_PORT:-3456}"
if [[ ! "$PORT_VAL" =~ ^[0-9]+$ ]] || (( PORT_VAL < 1 || PORT_VAL > 65535 )); then
  echo "[claude-gauge] ERROR: GAUGE_PROXY_PORT must be a valid port number (got: $PORT_VAL)" >&2
  exit 1
fi
PROXY_URL="http://localhost:${PORT_VAL}"

# --- Platform detection ---
IS_WINDOWS="false"
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) IS_WINDOWS="true" ;;
esac
if [[ "${OS:-}" == "Windows_NT" ]]; then
  IS_WINDOWS="true"
fi

# --- Helper: verify proxy is accepting connections (uses node, no curl dependency) ---
proxy_is_alive() {
  node -e "
    const s = require('net').createConnection(${PORT_VAL}, '127.0.0.1');
    s.on('connect', () => { s.destroy(); process.exit(0); });
    s.on('error', () => process.exit(1));
    setTimeout(() => process.exit(1), 500);
  " 2>/dev/null
}

# --- Helper: set or remove env.ANTHROPIC_BASE_URL in settings.json ---
# Used on Windows where CLAUDE_ENV_FILE is not supported by Claude Code.
settings_env_set() {
  local url="$1"
  node -e "
    const fs = require('fs');
    const p = process.argv[1];
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!j.env) j.env = {};
    j.env.ANTHROPIC_BASE_URL = process.argv[2];
    fs.writeFileSync(p, JSON.stringify(j, null, 2));
  " "$SETTINGS" "$url" 2>/dev/null
}

settings_env_remove() {
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
}

# --- Helper: route API through proxy (platform-aware) ---
# On non-Windows: uses CLAUDE_ENV_FILE (session-scoped, ideal).
# On Windows: CLAUDE_ENV_FILE not yet supported by Claude Code,
#   so we fall back to settings.json env block (persistent, with health-gate).
ensure_proxy_env() {
  if [[ "$IS_WINDOWS" == "true" ]]; then
    if proxy_is_alive; then
      settings_env_set "$PROXY_URL"
    else
      settings_env_remove
    fi
  else
    if [ -n "${CLAUDE_ENV_FILE:-}" ] && proxy_is_alive; then
      echo "export ANTHROPIC_BASE_URL=\"$PROXY_URL\"" >> "$CLAUDE_ENV_FILE"
    fi
  fi
}

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

# Check if statusline already points to claude-gauge (repeat session fast path)
ALREADY_SET="false"
if command -v jq &>/dev/null; then
  ALREADY_SET=$(jq -r '.statusLine.command // "" | test("claude-gauge") | tostring' <<< "$CURRENT" 2>/dev/null || echo "false")
else
  ALREADY_SET=$(node -e "
    const j = JSON.parse(require('fs').readFileSync(0, 'utf8'));
    console.log(j.statusLine && j.statusLine.command && j.statusLine.command.includes('claude-gauge') ? 'true' : 'false');
  " <<< "$CURRENT")
fi

if [[ "$ALREADY_SET" == "true" ]]; then
  # Already configured — ensure proxy is running and env var is correct
  node "$PLUGIN_ROOT/scripts/proxy-ctl.js" start 2>/dev/null || true
  # Give proxy a moment to bind if just started
  sleep 0.3 2>/dev/null || true
  ensure_proxy_env
  exit 0
fi

# --- First-time install path below ---

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

# Start rate limit proxy
echo "[claude-gauge] Starting rate limit proxy..."
node "$PLUGIN_ROOT/scripts/proxy-ctl.js" start

# Give proxy a moment to bind
sleep 0.3 2>/dev/null || true

ensure_proxy_env

echo ""
echo "  claude-gauge installed!"
echo ""
echo "  Rate limit fuel gauge is active"
echo "  Proxy running on port ${PORT_VAL}"
echo ""
echo "  Configure: /claude-gauge:config"
echo "  Uninstall: see README for instructions"
echo ""
echo "  Restart Claude Code to see the status line."
echo ""
