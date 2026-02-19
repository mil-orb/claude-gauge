#!/usr/bin/env bash
set -euo pipefail

# --- Read stdin ---
INPUT=$(cat)

# --- Script directory (for config.json) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- ANSI colors ---
C_GREEN=$'\033[32m'
C_YELLOW=$'\033[33m'
C_ORANGE=$'\033[38;5;208m'
C_RED=$'\033[31m'
C_DIM=$'\033[2m'
C_RESET=$'\033[0m'

# --- Parse JSON ---
# Prefer jq, fall back to node
if command -v jq &>/dev/null; then
  PARSE_CMD="jq"
else
  PARSE_CMD="node"
fi

if [[ "$PARSE_CMD" == "jq" ]]; then
  IFS=$'\t' read -r PCT CTX_SIZE INPUT_TOKENS COST DISPLAY_MODE BAR_WIDTH <<< "$(
    jq -r --slurpfile cfg "$SCRIPT_DIR/config.json" '
      ($cfg[0].display_mode // "bar") as $mode |
      ($cfg[0].bar_width // 20) as $bw |
      [
        (.context_window.used_percentage // -1 | floor),
        (.context_window.context_window_size // 200000),
        (
          if .context_window.current_usage != null then
            (.context_window.current_usage.input_tokens // 0)
            + (.context_window.current_usage.cache_creation_input_tokens // 0)
            + (.context_window.current_usage.cache_read_input_tokens // 0)
          else 0 end
        ),
        (.cost.total_cost_usd // 0),
        $mode,
        $bw
      ] | @tsv
    ' <<< "$INPUT"
  )"
else
  IFS=$'\t' read -r PCT CTX_SIZE INPUT_TOKENS COST DISPLAY_MODE BAR_WIDTH <<< "$(
    node -e "
      const fs = require('fs');
      const j = JSON.parse(process.argv[1]);
      const cfgPath = process.argv[2] + '/config.json';
      let cfg = { display_mode: 'bar', bar_width: 20 };
      try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(cfgPath, 'utf8')) }; } catch {}
      const cw = j.context_window || {};
      const cu = cw.current_usage || {};
      const pct = cw.used_percentage != null ? Math.floor(cw.used_percentage) : -1;
      const ctxSize = cw.context_window_size || 200000;
      const inputTokens = (cu.input_tokens || 0) + (cu.cache_creation_input_tokens || 0) + (cu.cache_read_input_tokens || 0);
      const cost = (j.cost || {}).total_cost_usd || 0;
      console.log([pct, ctxSize, inputTokens, cost, cfg.display_mode, cfg.bar_width].join('\t'));
    " "$INPUT" "$SCRIPT_DIR"
  )"
fi

# --- Handle null/early state ---
if [[ "$PCT" == "-1" ]]; then
  printf '%s-- waiting --%s' "$C_DIM" "$C_RESET"
  exit 0
fi

# --- Pick color ---
pick_color() {
  local p=$1
  if   (( p >= 91 )); then printf '%s' "$C_RED"
  elif (( p >= 76 )); then printf '%s' "$C_ORANGE"
  elif (( p >= 51 )); then printf '%s' "$C_YELLOW"
  else                      printf '%s' "$C_GREEN"
  fi
}
COLOR=$(pick_color "$PCT")

# --- Format token count ---
fmt_tokens() {
  local n=$1
  if   (( n >= 1000000 )); then
    local d=$(( n / 100000 ))
    local whole=$(( d / 10 ))
    local frac=$(( d % 10 ))
    if (( frac == 0 )); then printf '%s' "${whole}m"
    else printf '%s' "${whole}.${frac}m"; fi
  elif (( n >= 1000 )); then
    local d=$(( n / 100 ))
    local whole=$(( d / 10 ))
    local frac=$(( d % 10 ))
    if (( frac == 0 )); then printf '%s' "${whole}k"
    else printf '%s' "${whole}.${frac}k"; fi
  else
    printf '%s' "$n"
  fi
}

TOKENS_FMT=$(fmt_tokens "$INPUT_TOKENS")
CTX_FMT=$(fmt_tokens "$CTX_SIZE")
COST_FMT=$(printf '$%.2f' "$COST")

# --- Render ---
if [[ "$DISPLAY_MODE" == "compact" ]]; then
  # Compact mode: ● 48% 96k/200k $0.08
  printf '%s●%s %s%% %s/%s %s' \
    "$COLOR" "$C_RESET" "$PCT" "$TOKENS_FMT" "$CTX_FMT" "$COST_FMT"
else
  # Bar mode with gradient fade edge
  WIDTH=${BAR_WIDTH:-20}
  FILLED=$(( PCT * WIDTH / 100 ))
  REMAINDER=$(( (PCT * WIDTH * 10 / 100) % 10 ))

  BAR=""
  for ((i=0; i<FILLED; i++)); do BAR+="█"; done

  # Gradient edge: ▓ then ▒ for partial fill
  EDGE_CHARS=0
  if (( REMAINDER > 0 && FILLED < WIDTH )); then
    if (( REMAINDER >= 5 )); then
      BAR+="▓"
    else
      BAR+="▒"
    fi
    EDGE_CHARS=1
  fi

  # Fill remaining with ░
  EMPTY=$(( WIDTH - FILLED - EDGE_CHARS ))
  for ((i=0; i<EMPTY; i++)); do BAR+="░"; done

  printf '%s%s%s %s%% · %s/%s · %s' \
    "$COLOR" "$BAR" "$C_RESET" "$PCT" "$TOKENS_FMT" "$CTX_FMT" "$COST_FMT"
fi
