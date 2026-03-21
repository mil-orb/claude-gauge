<p align="center">
  <img src="assets/session-demo.gif" alt="claude-gauge demo" width="580">
</p>

<h1 align="center">claude-gauge</h1>

<p align="center">
  Rate limit awareness for Claude Code — without wasting a single token.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Claude_Code-plugin-5A45FF?style=flat-square" alt="Claude Code Plugin">
  <img src="https://img.shields.io/badge/node-18%2B-brightgreen?style=flat-square" alt="Node 18+">
  <img src="https://img.shields.io/badge/zero-dependencies-blue?style=flat-square" alt="Zero Dependencies">
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT License">
  <a href="https://github.com/mil-orb/claude-gauge/actions/workflows/github-code-scanning/codeql"><img src="https://github.com/mil-orb/claude-gauge/actions/workflows/github-code-scanning/codeql/badge.svg" alt="CodeQL"></a>
</p>

---

You don't know you're approaching your rate limit until Claude stops responding. Checking with `/usage` breaks your flow. Alt-tabbing to the Anthropic dashboard breaks it even more.

**claude-gauge** puts a live session dashboard in your status line — rate limit utilization, token count, cost, and session duration, all in one glanceable bar. The bar fills as you consume quota — green when you're fine, red when you're running low. Always visible, zero interruption.

## How It Works

```
Claude Code  →  statusline.js  →  reads native rate_limits field
                                   from Claude Code's statusline JSON
                                         ↓
                                   Renders fuel bar + session metrics
```

Claude Code (v2.1.80+) natively provides rate limit data in the `rate_limits` field of the JSON passed to statusline scripts. claude-gauge reads this directly — no proxy, no extra API calls, no external dependencies.

## Install

**Step 1** — In Claude Code, run these two commands:

```
/plugin marketplace add mil-orb/claude-gauge
/plugin install claude-gauge
```

**Step 2** — Restart Claude Code.

That's it. The gauge appears in your status line immediately.

## What You See

<p align="center">
  <img src="assets/screenshot.png" alt="claude-gauge in Claude Code" width="580">
</p>

```
████████▒░░░░░░░░░░░ ⚡32% · 47.9k · $1.84 · 3m
│                     │       │        │       └─ session duration
│                     │       │        └──────── session cost (USD)
│                     │       └───────────────── session tokens (input + output)
│                     └───────────────────────── 5h rate limit utilization
└─────────────────────────────────────────────── gauge bar (fills as quota is consumed)
```

- Bar **fills** from left as utilization climbs (use `drain` mode for a fuel gauge that empties)
- Color shifts green → yellow → red with your chosen color scheme
- `⚡32%` — your 5-hour rolling utilization percentage
- Session tokens are read from Claude Code's local JSONL transcript files

## Display Types

Five built-in visualizations:

<p align="center">
  <img src="assets/display-modes.gif" alt="display modes" width="580">
</p>

| Type | Preview | Description |
|------|---------|-------------|
| `bar` | `██████████████░░░░░░` | Default — fills as quota is consumed |
| `drain` | `░░░░░░██████████████` | Fuel gauge — empties as quota is consumed |
| `dots` | `●●●●●●●●●●●●●○○○○○○` | Minimal circle pips |
| `blocks` | `⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠀⠀⠀⠀⠀⠀` | Dense braille blocks |
| `compact` | `● ⚡23%` | Text only, no bar |

## Color Schemes

Seven 24-bit true color schemes that escalate as utilization climbs:

<p align="center">
  <img src="assets/color-schemes.gif" alt="color schemes" width="580">
</p>

| Scheme | Transition | Style |
|--------|-----------|-------|
| `gradient` | green → yellow → red | Uniform fill, single color |
| `ocean` | cyan → blue → purple | Uniform fill |
| `ember` | yellow → orange → deep red | Uniform fill |
| `frost` | white → light blue → deep blue | Uniform fill |
| `retro` | green / yellow / red | Hard CGA steps at 33%/66% |
| `spectrum` | green → yellow → red | **Per-character gradient** — each bar character is a different color |
| `mono` | white → gray → dark | Grayscale |

`spectrum` is the only per-character scheme — it paints a full rainbow gradient across the bar width regardless of fill level. All others apply one color uniformly based on utilization percentage.

## Configuration

Run `/claude-gauge:config` for an interactive setup, or edit `config.json` in the plugin directory directly. Changes take effect on the next status line refresh — no restart needed.

```jsonc
{
  "display": "bar",           // bar, drain, dots, blocks, compact
  "color": "gradient",        // gradient, ocean, ember, frost, retro, spectrum, mono
  "bar_size": "medium",       // small (10), medium (20), large (30), xlarge (40), or a number
  "show_cost": true,          // running session cost in USD
  "show_duration": true,      // elapsed session time
  "show_lines": false,        // lines added and removed
  "currency_rate": null       // local currency conversion (e.g. 0.79 for GBP, symbol auto-detected)
}
```

> **Tip:** Config path is `~/.claude/plugins/claude-gauge/config.json`

## Uninstall

**Step 1** — Run the uninstall script:

```bash
bash ~/.claude/plugins/cache/mil-orb/claude-gauge/*/scripts/uninstall.sh
```

**Step 2** — Remove the plugin from Claude Code:

```
/plugin uninstall claude-gauge
```

**Step 3** — Start a new Claude Code session.

<details>
<summary>What the uninstall script does</summary>

- **Restores your status line** — restores your previous statusline config from backup, or removes the `statusLine` block from `~/.claude/settings.json`

</details>

## Requirements

- Node.js 18+ (included with Claude Code)
- Claude Code v2.1.80+ (provides native `rate_limits` field)
- A terminal with 24-bit color support (most modern terminals)
- No additional dependencies

## License

MIT
