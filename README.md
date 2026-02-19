<p align="center">
  <img src="assets/session-demo.gif" alt="claude-gauge demo" width="580">
</p>

<h1 align="center">claude-gauge</h1>

<p align="center">
  Real-time context window, cost, and session stats in your Claude Code status line.
</p>

<p align="center">
  <a href="#install"><img src="https://img.shields.io/badge/Claude_Code-plugin-5A45FF?style=flat-square" alt="Claude Code Plugin"></a>
  <img src="https://img.shields.io/badge/node-18%2B-brightgreen?style=flat-square" alt="Node 18+">
  <img src="https://img.shields.io/badge/zero-dependencies-blue?style=flat-square" alt="Zero Dependencies">
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT License">
</p>

---

Know exactly where you stand. **claude-gauge** shows a color-coded progress bar that shifts from green to red as your context window fills up, alongside live cost, duration, and token counts — all without leaving your terminal.

## Install

```bash
claude plugin add mil-orb/claude-gauge
```

Restart Claude Code. The gauge appears in your status line immediately.

## Display Types

Five built-in visualizations to match your workflow:

<p align="center">
  <img src="assets/display-modes.gif" alt="display modes" width="580">
</p>

| Type | Preview | Best for |
|------|---------|----------|
| `bar` | `████████▓░░░░░` | Default — clear fill indicator |
| `drain` | `░░░░░░▓████████` | Seeing remaining capacity drain away |
| `dots` | `●●●●●●●○○○○○○○` | Minimal, clean aesthetic |
| `blocks` | `⣿⣿⣿⣿⣿⣿⣿⠀⠀⠀⠀⠀⠀⠀` | Dense, compact display |
| `compact` | `● 62%` | Maximum space savings |

## Color Schemes

Four 24-bit true color gradients that escalate as usage climbs:

<p align="center">
  <img src="assets/color-schemes.gif" alt="color schemes" width="580">
</p>

| Scheme | Transition | Vibe |
|--------|-----------|------|
| `gradient` | green → yellow → red | Traffic light — intuitive danger signal |
| `ocean` | cyan → blue → purple | Cool and calm |
| `ember` | yellow → orange → deep red | Warm intensity |
| `frost` | white → light blue → deep blue | Ice to depth |

All schemes use a fast-start curve in the upper half — colors stay proportional through 50%, then escalate quickly toward the danger end so you notice before it's too late.

## Configuration

Edit `config.json` in the plugin directory:

```jsonc
{
  "display": "bar",           // bar, drain, dots, blocks, compact
  "color": "gradient",        // gradient, ocean, ember, frost
  "bar_width": "auto",        // "auto" or a number (e.g. 20)
  "show_cost": true,          // session cost ($1.23)
  "show_duration": true,      // elapsed time (4h30m)
  "show_lines": false,        // lines changed (+150 -75)
  "currency_rate": null,      // exchange rate from USD (e.g. 0.79 for GBP)
  "weekly_limit": null        // reserved for future use
}
```

> **Tip:** The config file is at `~/.claude/plugins/claude-gauge/config.json`. Changes take effect on the next status line refresh — no restart needed.

### Currency conversion

Set `currency_rate` to convert from USD. The symbol is auto-detected from your system locale:

```json
{ "currency_rate": 0.79 }
```

`$1.23` becomes `£0.97` on a `en_GB` system.

## How It Works

Claude Code sends JSON telemetry to the plugin on each status line tick:

```
stdin → parse JSON → compute bar + color → write ANSI to stdout
```

- **Zero dependencies** — only Node.js builtins (`fs`, `path`)
- **~50ms** end-to-end (42ms is Node startup; 8ms is actual rendering)
- **Auto-sizing** — bar width adapts to terminal width with 40% cap
- **Graceful degradation** — falls back to compact mode on narrow terminals

## Uninstall

```bash
claude plugin remove claude-gauge
```

## Requirements

- Node.js 18+ (included with Claude Code)
- A terminal with 24-bit color support (most modern terminals)

## License

MIT
