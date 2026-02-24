# Changelog

All notable changes to claude-gauge are documented here.

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
