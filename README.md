# claude-gauge

A Claude Code plugin that displays context window usage as a color-coded progress bar in your status line.

## What it looks like

**Bar mode** (default):
```
████████████▓░░░░░░░ 62% · 124k/200k · $0.18 · 23m
```

**Compact mode:**
```
● 62% 124k/200k $0.18 · 23m
```

Colors shift as context fills: green (0-50%) → yellow (51-75%) → orange (76-90%) → red (91%+).

## Install

```bash
claude plugin add claude-gauge
```

The plugin automatically configures your status line on install. Restart Claude Code to see it.

## Configuration

Edit `config.json` in the plugin directory:

| Setting | Default | Description |
|---------|---------|-------------|
| `display_mode` | `"bar"` | `"bar"` for progress bar, `"compact"` for minimal dot + numbers |
| `bar_width` | `"auto"` | `"auto"` to dynamically fit terminal (default), or a number (e.g. `20`) for fixed width |
| `show_cost` | `true` | Show session cost |
| `show_duration` | `true` | Show session elapsed time |
| `show_lines` | `false` | Show lines added/removed (`+156 -23`) |
| `currency_rate` | `null` | Exchange rate from USD (e.g. `0.79` for GBP). Currency symbol auto-detected from locale. |
| `weekly_limit` | `null` | Reserved for future weekly usage tracking |

## Requirements

- `node` on PATH (used by default on all platforms)

## Uninstall

```bash
claude plugin remove claude-gauge
```

If you had a previous status line config, it was backed up to `~/.claude/statusline.backup.json` during install.

## License

MIT
