# Changelog

All notable changes to claude-gauge are documented here.

## [2.0.0] - 2026-03-20

### Changed
- **Breaking:** Replaced local reverse proxy with Claude Code's native `rate_limits` statusline field (requires Claude Code v2.1.80+)
- Rate limit data now read directly from stdin JSON — no proxy, no cache file, no `ANTHROPIC_BASE_URL` routing
- Removed `show_rate_limit` config option (rate limits are always available natively)

### Removed
- `proxy.js` — reverse proxy no longer needed
- `scripts/proxy-ctl.js` — proxy lifecycle management
- `scripts/proxy-supervisor.js` — watchdog process
- `scripts/proxy-ensure.sh` — UserPromptSubmit health check hook
- `GAUGE_PROXY_PORT` environment variable
- `ANTHROPIC_BASE_URL` routing and `CLAUDE_ENV_FILE` mechanism
- `~/.claude/gauge-rate-limits.json` cache file
- `~/.claude/gauge-proxy.pid` PID file

## [1.2.0] - 2026-02-24

### Added
- Windows support for proxy env routing via `settings.json` env block (where `CLAUDE_ENV_FILE` is unavailable)
- Session-scoped `CLAUDE_ENV_FILE` mechanism on macOS/Linux — no more persistent shell profile modifications
- CodeQL security scanning

### Fixed
- Supervisor self-terminating on Windows due to slow `tasklist.exe` — replaced with PowerShell `Get-Process` (~350ms vs 15s+)
- Windows process tree cleanup — use `taskkill /T /F` instead of unreliable `SIGTERM`
- Stale token count when switching between sessions
- Potential path traversal vulnerability (code scanning alert #1)

### Changed
- Proxy auto-shuts down when no Claude Code sessions are detected (2 consecutive 30s polls)
- Hardened proxy stop with retry escalation and orphan cleanup
- Removed legacy shell profile and global environment variable modifications

## [1.1.0] - 2026-02-15

### Added
- Proxy supervisor with auto-restart and exponential backoff
- Orphan process detection and cleanup
- Uninstall script with statusline backup/restore

### Fixed
- Rate limit accuracy and 7-day exhaustion display
- Proxy security hardening (localhost-only binding, connection limits, body size limits)

## [1.0.0] - 2026-02-13

### Added
- Initial release
- Zero-dependency reverse proxy capturing rate limit headers
- 5 display modes: bar, drain, dots, blocks, compact
- 7 color schemes: gradient, ocean, ember, frost, retro, spectrum, mono
- Session metrics: tokens, cost, duration
- Interactive configuration via `/claude-gauge:config`
