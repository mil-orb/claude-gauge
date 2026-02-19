#!/usr/bin/env bash
set -euo pipefail

# --- ANSI colors ---
C_GREEN=$'\033[32m'
C_YELLOW=$'\033[33m'
C_ORANGE=$'\033[38;5;208m'
C_RED=$'\033[31m'
C_DIM=$'\033[2m'
C_RESET=$'\033[0m'

# --- Script directory (for config.json) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- Read stdin (with timeout to avoid hanging) ---
INPUT=""
if ! read -t 2 -d '' INPUT; then
  # read returns non-zero when it hits the delimiter or timeout;
  # if INPUT is still empty, there was no data at all.
  if [[ -z "$INPUT" ]]; then
    printf '%s-- no data --%s' "$C_DIM" "$C_RESET"
    exit 0
  fi
fi

# --- Parse JSON ---
# Prefer jq, fall back to node
if command -v jq &>/dev/null; then
  PARSE_CMD="jq"
else
  PARSE_CMD="node"
fi

# --- Resolve config file (fall back to inline default) ---
CFG_FILE="$SCRIPT_DIR/config.json"
if [[ ! -f "$CFG_FILE" ]]; then
  CFG_FILE=$(mktemp)
  printf '{"display_mode":"bar","bar_width":20,"show_duration":true}\n' > "$CFG_FILE"
  trap 'rm -f "$CFG_FILE"' EXIT
fi

if [[ "$PARSE_CMD" == "jq" ]]; then
  IFS=$'\t' read -r PCT CTX_SIZE INPUT_TOKENS COST DURATION_MS DISPLAY_MODE BAR_WIDTH SHOW_DURATION <<< "$(
    jq -r --slurpfile cfg "$CFG_FILE" '
      ($cfg[0].display_mode // "bar") as $mode |
      ($cfg[0].bar_width // 20) as $bw |
      (if $cfg[0].show_duration == false then "false" else "true" end) as $sd |
      [
        (if .context_window.used_percentage | type == "number" then .context_window.used_percentage | floor else -1 end),
        (.context_window.context_window_size // 200000),
        (
          if .context_window.current_usage != null then
            (.context_window.current_usage.input_tokens // 0)
            + (.context_window.current_usage.cache_creation_input_tokens // 0)
            + (.context_window.current_usage.cache_read_input_tokens // 0)
          else 0 end
        ),
        (.cost.total_cost_usd // 0),
        (.cost.total_duration_ms // 0),
        $mode,
        $bw,
        $sd
      ] | @tsv
    ' <<< "$INPUT"
  )"
else
  IFS=$'\t' read -r PCT CTX_SIZE INPUT_TOKENS COST DURATION_MS DISPLAY_MODE BAR_WIDTH SHOW_DURATION <<< "$(
    node -e "
      const fs = require('fs');
      const j = JSON.parse(fs.readFileSync(0, 'utf8'));
      const cfgPath = process.argv[1] + '/config.json';
      let cfg = { display_mode: 'bar', bar_width: 20, show_duration: true };
      try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(cfgPath, 'utf8')) }; } catch {}
      const cw = j.context_window || {};
      const cu = cw.current_usage || {};
      const pct = cw.used_percentage != null ? Math.floor(cw.used_percentage) : -1;
      const ctxSize = cw.context_window_size || 200000;
      const inputTokens = (cu.input_tokens || 0) + (cu.cache_creation_input_tokens || 0) + (cu.cache_read_input_tokens || 0);
      const cost = (j.cost || {}).total_cost_usd || 0;
      const durationMs = (j.cost || {}).total_duration_ms || 0;
      const sd = cfg.show_duration === false ? 'false' : 'true';
      console.log([pct, ctxSize, inputTokens, cost, durationMs, cfg.display_mode, cfg.bar_width, sd].join('\t'));
    " "$SCRIPT_DIR" <<< "$INPUT"
  )"
fi

# --- Handle null/early state ---
if [[ "$PCT" == "-1" ]]; then
  printf '%s-- waiting --%s' "$C_DIM" "$C_RESET"
  exit 0
fi

# --- Clamp PCT to 0-100 ---
(( PCT > 100 )) && PCT=100 || true
(( PCT < 0 )) && PCT=0 || true

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
[[ "$COST" =~ ^[0-9.]+$ ]] || COST=0
COST_FMT=$(LC_NUMERIC=C printf '$%.2f' "$COST")

# --- Format duration ---
fmt_duration() {
  local ms=$1
  local total_sec=$(( ms / 1000 ))
  local h=$(( total_sec / 3600 ))
  local m=$(( (total_sec % 3600) / 60 ))
  if (( h > 0 )); then
    printf '%dh%02dm' "$h" "$m"
  elif (( m > 0 )); then
    printf '%dm' "$m"
  else
    printf '%ds' "$total_sec"
  fi
}

DURATION_SUFFIX=""
if [[ "$SHOW_DURATION" == "true" ]]; then
  [[ "$DURATION_MS" =~ ^[0-9]+$ ]] || DURATION_MS=0
  DURATION_SUFFIX=" · $(fmt_duration "$DURATION_MS")"
fi

# --- Render ---
if [[ "$DISPLAY_MODE" == "compact" ]]; then
  # Compact mode: ● 48% 96k/200k $0.08 12m
  printf '%s●%s %s%% %s/%s %s%s' \
    "$COLOR" "$C_RESET" "$PCT" "$TOKENS_FMT" "$CTX_FMT" "$COST_FMT" "$DURATION_SUFFIX"
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

  printf '%s%s%s %s%% · %s/%s · %s%s' \
    "$COLOR" "$BAR" "$C_RESET" "$PCT" "$TOKENS_FMT" "$CTX_FMT" "$COST_FMT" "$DURATION_SUFFIX"
fi
