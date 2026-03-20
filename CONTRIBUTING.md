# Contributing to claude-gauge

Thanks for your interest in contributing! claude-gauge is a small, focused project and contributions are welcome.

## Getting Started

1. Fork the repository and clone it locally
2. Run `npm install` to install dev dependencies (Playwright, used for demo GIF generation only)
3. The statusline renderer has **zero runtime dependencies** — it uses only Node.js built-ins

## Project Structure

```
statusline.js            # Status line renderer — reads native rate_limits, renders gauge
scripts/
  setup.sh               # SessionStart hook — installs gauge on first run
  uninstall.sh           # Clean removal with statusline restore
hooks/
  hooks.json             # Claude Code hook configuration
commands/                # Claude Code slash commands (/claude-gauge:config)
config.json              # User-facing display configuration
```

## Design Principles

- **Zero dependencies.** All runtime code uses Node.js built-ins only. Do not add npm dependencies.
- **Cross-platform.** Everything must work on macOS, Linux, and Windows (MSYS2/Git Bash). Test on Windows if you touch process management or file paths.
- **Native integration.** Rate limit data comes from Claude Code's native `rate_limits` statusline field (v2.1.80+). No proxy or external API calls needed.

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

1. **Test in Claude Code:** Install the plugin locally and verify the gauge renders
2. **Verify rate limits appear:** The `rate_limits` field should be present in the statusline JSON on Claude Code v2.1.80+
3. **Test on your platform:** If your change touches process management, test on Windows and Unix if possible

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
3. Verify the gauge renders correctly with rate limit data
4. Open a PR with a description of what changed and why

## Reporting Issues

- **Display issues:** Include your terminal emulator name and a screenshot
- **Rate limit issues:** Ensure you're running Claude Code v2.1.80+ (the `rate_limits` field was added in that version)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
