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
</p>

---

You don't know you're approaching your rate limit until Claude stops responding. Checking with `/usage` wastes tokens and breaks your flow. The Anthropic dashboard means leaving the terminal.

**claude-gauge** puts a color-coded gauge in your status line showing your 5-hour rate limit utilization. A lightweight local proxy captures rate limit headers from the Anthropic API and feeds them to the gauge. The bar fills as you consume quota — green when you're fine, red when you're running low. One glance, zero interruption, zero tokens spent.

## How It Works

```
Claude Code  →  proxy (localhost:3456)  →  api.anthropic.com
                      ↓
               Captures rate limit headers
                      ↓
               Writes ~/.claude/gauge-rate-limits.json
                      ↓
               Gauge reads cache → displays fuel bar
```

A zero-dependency reverse proxy (`proxy.js`) sits between Claude Code and the Anthropic API. It forwards all requests, streams SSE responses without buffering, and captures `anthropic-ratelimit-unified-5h-utilization` from each response. The gauge reads this cache file and renders your quota as a fuel bar.

## Install

In Claude Code, run:

```
/plugin marketplace add mil-orb/claude-gauge

/plugin install claude-gauge
```

Restart Claude Code. The gauge appears in your status line immediately.

The install hook automatically starts the proxy and adds `ANTHROPIC_BASE_URL` to your shell profile. On Windows, you may also need to set it system-wide:

```powershell
[System.Environment]::SetEnvironmentVariable('ANTHROPIC_BASE_URL', 'http://localhost:3456', 'User')
```

## What You See

**With proxy running** — the bar shows your rate limit utilization:

```
████████▒░░░░░░░░░░░ ⚡32% · 47.9k · 3m
│                     │       │        └─ session duration
│                     │       └────────── session tokens (input + output)
│                     └────────────────── 5h rate limit utilization
└──────────────────────────────────────── gauge bar (fills as quota is consumed)
```

- Bar **fills** from left as utilization climbs (use `drain` mode for a fuel gauge that empties)
- Color shifts green → yellow → red with your chosen color scheme
- `⚡32%` — your 5-hour rolling utilization percentage
- Session tokens are read from Claude Code's local JSONL transcript files

**Without proxy** — minimal fallback:

```
no proxy · 47.9k · 3m
```

Shows session tokens and duration. No bar rendered.

## Display Types

Five built-in visualizations, all driven by rate limit when the proxy is running:

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
  "show_cost": false,         // running session cost in USD
  "show_duration": true,      // elapsed session time
  "show_lines": false,        // lines added and removed
  "currency_rate": null,      // local currency conversion (e.g. 0.79 for GBP, symbol auto-detected)
  "show_rate_limit": true     // enable rate limit gauge (requires proxy)
}
```

> **Tip:** Config path is `~/.claude/plugins/claude-gauge/config.json`

## Proxy Management

```bash
node scripts/proxy-ctl.js start    # start proxy (detached)
node scripts/proxy-ctl.js stop     # stop proxy
node scripts/proxy-ctl.js status   # check if running
```

The proxy listens on port 3456 by default. Set `GAUGE_PROXY_PORT` to change it.

Cache staleness: if the proxy hasn't updated the cache in 10 minutes, the gauge falls back to the "no proxy" display. This prevents showing stale rate limit data.

Set `"show_rate_limit": false` in config.json to disable rate limit tracking entirely.

## Uninstall

In Claude Code, run:

```
/plugin uninstall claude-gauge
```

The uninstall hook automatically stops the proxy and removes `ANTHROPIC_BASE_URL` from your shell profile. For Windows users who set the variable via PowerShell, remove it manually:

```powershell
[System.Environment]::SetEnvironmentVariable('ANTHROPIC_BASE_URL', $null, 'User')
```

## Requirements

- Node.js 18+ (included with Claude Code)
- A terminal with 24-bit color support (most modern terminals)
- No additional dependencies (proxy uses Node.js built-in `http`/`https`)

## License

MIT
