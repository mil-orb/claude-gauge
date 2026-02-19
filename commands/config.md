---
description: "Interactive configuration for claude-gauge status line"
---

# claude-gauge Configuration

You are configuring the claude-gauge plugin. Read the current config, then walk the user through each setting interactively using AskUserQuestion.

## Steps

1. **Read current config** from the plugin directory:
   - Find the plugin root by checking `~/.claude/plugins/` for claude-gauge, or use the path from `~/.claude/settings.json` statusLine command
   - Read `config.json` from that directory
   - Show the user their current settings in a brief summary

2. **Walk through each setting** using AskUserQuestion, one at a time. Show the current value and let them pick a new one or keep the current. Group into two questions:

   **Question 1 — Visual style** (ask all three together):
   - `display`: bar (filling gauge, default), drain (emptying tank), dots (circle pips), blocks (braille), compact (text only). Default: bar
   - `color`: gradient (green→yellow→red), ocean (cyan→blue→purple), ember (yellow→orange→red), frost (white→blue), retro (CGA hard steps), spectrum (per-character gradient fill), mono (grayscale). Default: gradient
   - `bar_size`: small (10), medium (20), large (30), xlarge (40), or a custom number. Default: medium

   **Question 2 — Info segments** (ask toggles together):
   - `show_cost`: show running session cost in USD. Default: false
   - `show_duration`: show elapsed session time. Default: true
   - `show_lines`: show lines added/removed. Default: false
   - `show_rate_limit`: show ⚡ rate limit utilization from proxy. Default: true

   **Question 3 — Currency** (only ask if show_cost is enabled):
   - `currency_rate`: exchange rate from USD (e.g. 0.79 for GBP). Null means show USD. Symbol is auto-detected from locale.

3. **Write the updated config.json** to the plugin directory. Preserve the comment keys (lines starting with `//`) for documentation. Format it nicely.

4. **Confirm** the changes and remind the user that settings take effect on the next status line refresh — no restart needed.

## Important

- The config file lives in the plugin installation directory, NOT the project source
- Typical path: `~/.claude/plugins/claude-gauge/config.json` or check `~/.claude/settings.json` for the statusLine command path
- If you can't find the config, check `~/.claude/plugins/` and its subdirectories
- Do NOT modify any files other than config.json
- Use the Edit tool to update config.json, not Write, to preserve structure
