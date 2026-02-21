#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SETTINGS="$HOME/.claude/settings.json"
BACKUP="$HOME/.claude/statusline.backup.json"
# Use node statusline.js — works on all platforms (Windows, macOS, Linux)
STATUSLINE_CMD="node \"$PLUGIN_ROOT/statusline.js\""

# SECURITY: PORT_VAL is interpolated into PowerShell commands and shell profile
# code blocks. It MUST be validated numeric before any use downstream.
PORT_VAL="${GAUGE_PROXY_PORT:-3456}"
if [[ ! "$PORT_VAL" =~ ^[0-9]+$ ]] || (( PORT_VAL < 1 || PORT_VAL > 65535 )); then
  echo "[claude-gauge] ERROR: GAUGE_PROXY_PORT must be a valid port number (got: $PORT_VAL)" >&2
  exit 1
fi
PROXY_URL="http://localhost:${PORT_VAL}"

IS_WINDOWS=false
if [[ "$(uname -s)" == MINGW* || "$(uname -s)" == MSYS* || "$(uname -s)" == CYGWIN* || "${OS:-}" == "Windows_NT" ]]; then
  IS_WINDOWS=true
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

# --- Helper: manage Windows env var based on proxy health ---
sync_windows_env() {
  if [[ "$IS_WINDOWS" != "true" ]]; then return; fi

  if proxy_is_alive; then
    # Proxy is up — ensure env var is set
    local current
    current=$(powershell.exe -NoProfile -Command "[System.Environment]::GetEnvironmentVariable('ANTHROPIC_BASE_URL', 'User')" 2>/dev/null | tr -d '\r')
    if [[ "$current" != "$PROXY_URL" ]]; then
      # SECURITY: $PROXY_URL is interpolated into PowerShell. Safe because PORT_VAL
      # is validated numeric at script entry. Do not remove that validation.
      powershell.exe -NoProfile -Command "[System.Environment]::SetEnvironmentVariable('ANTHROPIC_BASE_URL', '$PROXY_URL', 'User')" 2>/dev/null
      echo "[claude-gauge] Set Windows ANTHROPIC_BASE_URL=$PROXY_URL"
    fi
  else
    # Proxy is down — clear env var to prevent ECONNREFUSED on next session
    local current
    current=$(powershell.exe -NoProfile -Command "[System.Environment]::GetEnvironmentVariable('ANTHROPIC_BASE_URL', 'User')" 2>/dev/null | tr -d '\r')
    if [[ -n "$current" && "$current" == *"localhost"* ]]; then
      powershell.exe -NoProfile -Command "[System.Environment]::SetEnvironmentVariable('ANTHROPIC_BASE_URL', \$null, 'User')" 2>/dev/null
      echo "[claude-gauge] Cleared Windows ANTHROPIC_BASE_URL (proxy not reachable)"
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
  sync_windows_env
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

# Detect shell profile (check $SHELL first, then file existence)
SHELL_PROFILE=""
case "$SHELL" in
  */zsh)  [[ -f "$HOME/.zshrc" ]] && SHELL_PROFILE="$HOME/.zshrc" ;;
  */bash) [[ -f "$HOME/.bash_profile" ]] && SHELL_PROFILE="$HOME/.bash_profile" ||
          [[ -f "$HOME/.bashrc" ]] && SHELL_PROFILE="$HOME/.bashrc" ;;
esac
if [[ -z "$SHELL_PROFILE" ]]; then
  if [[ -f "$HOME/.zshrc" ]]; then SHELL_PROFILE="$HOME/.zshrc";
  elif [[ -f "$HOME/.bash_profile" ]]; then SHELL_PROFILE="$HOME/.bash_profile";
  elif [[ -f "$HOME/.bashrc" ]]; then SHELL_PROFILE="$HOME/.bashrc";
  elif [[ -f "$HOME/.profile" ]]; then SHELL_PROFILE="$HOME/.profile";
  fi
fi

# Conditional export: only set ANTHROPIC_BASE_URL if the proxy is reachable.
# If the proxy is down, Claude Code talks directly to the API — no ECONNREFUSED.
# Uses node (already a hard dependency) instead of curl for portability.
#
# SECURITY: PORT_VAL is interpolated into code written to the user's shell profile.
# Safe because PORT_VAL is validated numeric at script entry. Do not remove that validation.
ENV_BLOCK="# claude-gauge rate limit proxy (conditional — falls back to direct API)
if node -e \"const n=require('net');const s=n.createConnection(${PORT_VAL},'127.0.0.1');s.on('connect',()=>{s.destroy();process.exit(0)});s.on('error',()=>process.exit(1));setTimeout(()=>process.exit(1),300)\" 2>/dev/null; then
  export ANTHROPIC_BASE_URL=\"$PROXY_URL\"
fi # end claude-gauge"

# On Windows, set or clear the user-level env var based on proxy health.
sync_windows_env

if [[ -n "$SHELL_PROFILE" ]]; then
  if grep -q 'claude-gauge rate limit proxy (conditional' "$SHELL_PROFILE" 2>/dev/null; then
    # Already has the new conditional block
    echo "[claude-gauge] claude-gauge already configured in $SHELL_PROFILE"
  elif grep -q 'claude-gauge rate limit proxy' "$SHELL_PROFILE" 2>/dev/null; then
    # Upgrade: remove old static export and replace with conditional block
    sed -i.bak '/# claude-gauge rate limit proxy/d' "$SHELL_PROFILE"
    sed -i.bak '/export ANTHROPIC_BASE_URL.*localhost/d' "$SHELL_PROFILE"
    rm -f "$SHELL_PROFILE.bak"
    echo "" >> "$SHELL_PROFILE"
    echo "$ENV_BLOCK" >> "$SHELL_PROFILE"
    echo "[claude-gauge] Upgraded ANTHROPIC_BASE_URL to conditional mode in $SHELL_PROFILE"
  else
    echo "" >> "$SHELL_PROFILE"
    echo "$ENV_BLOCK" >> "$SHELL_PROFILE"
    echo "[claude-gauge] Added conditional ANTHROPIC_BASE_URL to $SHELL_PROFILE"
    echo "[claude-gauge] Run: source $SHELL_PROFILE (or restart your shell)"
  fi
else
  echo "[claude-gauge] Could not detect shell profile. Add manually:"
  echo "  $ENV_BLOCK"
fi

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║         claude-gauge installed!           ║"
echo "  ╠══════════════════════════════════════════╣"
echo "  ║                                          ║"
echo "  ║  ⚡ Rate limit fuel gauge is active       ║"
echo "  ║  📊 Proxy running on port ${PORT_VAL}            ║"
echo "  ║                                          ║"
echo "  ║  Configure: /claude-gauge:config          ║"
echo "  ║  Uninstall: see README for instructions    ║"
echo "  ║                                          ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""
echo "  Restart Claude Code to see the status line."
echo ""
