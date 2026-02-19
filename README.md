# claude-gauge

Real-time token usage, session cost, and stats in your status line.

## Display types

```
bar:     ███████████▓░░░░░░░░ 62% · 124k/200k · $0.18 · 23m
drain:   ░░░░░░░░░░░▓████████ 62% · 124k/200k · $0.18 · 23m
dots:    ●●●●●●●●●●●○○○○○○○○ 62% · 124k/200k · $0.18 · 23m
blocks:  ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠀⠀⠀⠀⠀⠀⠀⠀ 62% · 124k/200k · $0.18 · 23m
compact: ● 62% · 124k/200k · $0.18 · 23m
```

## Color schemes

- **gradient** — green → yellow → red (default)
- **ocean** — cyan → blue → purple
- **ember** — yellow → orange → deep red
- **frost** — white → light blue → deep blue

All colors use smooth 24-bit true color gradients.

## Install

```bash
claude plugin add claude-gauge
```

Restart Claude Code to see it.

## Configuration

Edit `config.json` in the plugin directory:

| Setting | Default | Description |
|---------|---------|-------------|
| `display` | `"bar"` | `"bar"`, `"drain"`, `"dots"`, `"blocks"`, or `"compact"` |
| `color` | `"gradient"` | `"gradient"`, `"ocean"`, `"ember"`, or `"frost"` |
| `bar_width` | `"auto"` | `"auto"` to fit terminal, or a number for fixed width |
| `show_cost` | `true` | Show session cost |
| `show_duration` | `true` | Show session elapsed time |
| `show_lines` | `false` | Show lines added/removed (`+156 -23`) |
| `currency_rate` | `null` | Exchange rate from USD (e.g. `0.79` for GBP). Symbol auto-detected from locale. |
| `weekly_limit` | `null` | Reserved for future weekly usage tracking |

## Requirements

- `node` on PATH (included with Claude Code)

## Uninstall

```bash
claude plugin remove claude-gauge
```

## License

MIT
