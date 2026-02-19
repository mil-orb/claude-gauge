# claude-gauge

Context window visualizer plugin for Claude Code.

## What it does

Displays a color-coded progress bar in the Claude Code status line showing:
- Context window usage (percentage + token count)
- Session cost
- Color thresholds: green (0-50%), yellow (51-75%), orange (76-90%), red (91%+)

## Configuration

Edit `config.json` in the plugin root:
- `display`: `"bar"` (default), `"drain"`, `"dots"`, `"blocks"`, or `"compact"`
- `color`: `"gradient"` (default), `"ocean"`, `"ember"`, or `"frost"`
- `bar_width`: `"auto"` (default) or a number (e.g. `20`) for fixed width
- `show_cost`: `true` (default) or `false`
- `show_duration`: `true` (default) or `false`
- `show_lines`: `false` (default) or `true`
- `currency_rate`: exchange rate from USD (e.g. `0.79` for GBP). Symbol auto-detected from locale.
- `weekly_limit`: reserved for future weekly usage tracking

## Dependencies

Requires `node` on PATH (included with Claude Code).
