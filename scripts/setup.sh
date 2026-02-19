#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SETTINGS="$HOME/.claude/settings.json"
BACKUP="$HOME/.claude/statusline.backup.json"
# Use node statusline.js — works on all platforms (Windows, macOS, Linux)
STATUSLINE_CMD="node \"$PLUGIN_ROOT/statusline.js\""

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

# Start rate limit proxy
echo "[claude-gauge] Starting rate limit proxy..."
node "$PLUGIN_ROOT/scripts/proxy-ctl.js" start

# Validate proxy port
PORT_VAL="${GAUGE_PROXY_PORT:-3456}"
if [[ ! "$PORT_VAL" =~ ^[0-9]+$ ]] || (( PORT_VAL < 1 || PORT_VAL > 65535 )); then
  echo "[claude-gauge] ERROR: GAUGE_PROXY_PORT must be a valid port number" >&2
  exit 1
fi
PROXY_URL="http://localhost:${PORT_VAL}"
ENV_LINE="export ANTHROPIC_BASE_URL=\"$PROXY_URL\""

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

if [[ -n "$SHELL_PROFILE" ]]; then
  if ! grep -q 'ANTHROPIC_BASE_URL' "$SHELL_PROFILE" 2>/dev/null; then
    echo "" >> "$SHELL_PROFILE"
    echo "# claude-gauge rate limit proxy" >> "$SHELL_PROFILE"
    echo "$ENV_LINE" >> "$SHELL_PROFILE"
    echo "[claude-gauge] Added ANTHROPIC_BASE_URL to $SHELL_PROFILE"
    echo "[claude-gauge] Run: source $SHELL_PROFILE (or restart your shell)"
  else
    echo "[claude-gauge] ANTHROPIC_BASE_URL already set in $SHELL_PROFILE"
  fi
else
  echo "[claude-gauge] Could not detect shell profile. Add manually:"
  echo "  $ENV_LINE"
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
echo "  ║  Uninstall: /plugin uninstall claude-gauge║"
echo "  ║                                          ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""
echo "  Restart Claude Code to see the status line."
echo ""
echo "  On Windows? Also run in PowerShell:"
echo "    [System.Environment]::SetEnvironmentVariable("
echo "      'ANTHROPIC_BASE_URL','http://localhost:${PORT_VAL}','User')"
echo ""
