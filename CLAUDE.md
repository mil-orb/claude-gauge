# claude-gauge

Context window visualizer plugin for Claude Code.

## What it does

Displays a color-coded progress bar in the Claude Code status line showing:
- Context window usage (percentage + token count)
- Session cost
- Color thresholds: green (0-50%), yellow (51-75%), orange (76-90%), red (91%+)

## Configuration

Edit `config.json` in the plugin root:
- `display_mode`: `"bar"` (default) or `"compact"`
- `bar_width`: number of characters (default 20)
- `show_duration`: `true` (default) or `false` — show session elapsed time
- `currency_rate`: exchange rate from USD (e.g. `0.79` for GBP). Symbol auto-detected from locale. Leave `null` for USD.
- `weekly_limit`: reserved for future weekly usage tracking (leave null)

## Dependencies

Requires `jq` on PATH (falls back to `node` if unavailable).
