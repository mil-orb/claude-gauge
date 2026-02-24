# Contributing to claude-gauge

Thanks for your interest in contributing! claude-gauge is a small, focused project and contributions are welcome.

## Getting Started

1. Fork the repository and clone it locally
2. Run `npm install` to install dev dependencies (Playwright, used for demo GIF generation only)
3. The proxy and statusline have **zero runtime dependencies** — they use only Node.js built-ins

## Project Structure

```
proxy.js                 # Reverse proxy — captures rate limit headers
statusline.js            # Status line renderer — reads cache, renders gauge
scripts/
  proxy-ctl.js           # Proxy lifecycle control (start/stop/status)
  proxy-supervisor.js    # Watchdog — restarts proxy on crash, auto-shuts down
  setup.sh               # SessionStart hook — installs gauge on first run
  uninstall.sh           # Clean removal with orphan cleanup
hooks/
  hooks.json             # Claude Code hook configuration
commands/                # Claude Code slash commands (/claude-gauge:config)
config.json              # User-facing display configuration
```

## Design Principles

- **Zero dependencies.** All runtime code uses Node.js built-ins only. Do not add npm dependencies.
- **Cross-platform.** Everything must work on macOS, Linux, and Windows (MSYS2/Git Bash). Test on Windows if you touch process management or file paths.
- **Minimal footprint.** The proxy is a transparent passthrough. It must not modify request/response bodies, add latency, or buffer SSE streams.
- **Fail safe.** If the proxy is down, Claude Code must still work normally. Never leave `ANTHROPIC_BASE_URL` pointing at a dead proxy.

## Making Changes

### Before you start

- Open an issue to discuss non-trivial changes before writing code
- For bug fixes, describe the reproduction steps

### Code style

- `'use strict'` at the top of every JS file
- Single quotes, 2-space indentation
- No transpilation — write plain Node.js (CommonJS, `require`)
- Keep files small and self-contained

### Testing

There is no automated test suite yet. Before submitting:

1. **Start the proxy:** `node scripts/proxy-ctl.js start`
2. **Verify it proxies:** `node scripts/proxy-ctl.js status` should show running
3. **Test in Claude Code:** Install the plugin locally and verify the gauge renders
4. **Test on your platform:** If your change touches process management, test on Windows and Unix if possible

### Commit messages

Follow conventional-ish style:

```
fix: description of what was fixed
feat: description of new feature
docs: documentation only change
```

Keep the first line under 72 characters. Add detail in the body if needed.

## Submitting a Pull Request

1. Create a branch from `main`
2. Make your changes with clear, focused commits
3. Ensure the proxy starts, stops, and proxies correctly
4. Open a PR with a description of what changed and why

## Reporting Issues

- **Proxy issues:** Include your OS, Node.js version (`node -v`), and the output of `node scripts/proxy-ctl.js status`
- **Display issues:** Include your terminal emulator name and a screenshot
- **Rate limit issues:** Note whether the proxy is running and check `~/.claude/gauge-rate-limits.json` for recent data

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
