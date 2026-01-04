# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

claude-scionos is a lightweight Node.js CLI wrapper that provides ephemeral and secure execution of the official Claude Code CLI. It's designed for the ScioNos environment and focuses on in-memory credential management with zero disk persistence.

## Architecture

The project is a single-file Node.js application (`index.js`) that:

1. **Validates prerequisites**: Checks if Claude Code CLI is installed and available in PATH
2. **Windows-specific check**: Verifies Git Bash installation (required by Claude Code on Windows)
3. **Secure token collection**: Uses `@inquirer/prompts` for masked password input
4. **Environment isolation**: Creates isolated environment variables with:
   - `ANTHROPIC_BASE_URL`: Set to `https://routerlab.ch` (hardcoded ScioNos endpoint)
   - `ANTHROPIC_AUTH_TOKEN`: User-provided token (memory only)
   - `ANTHROPIC_API_KEY`: Explicitly set to empty string
5. **Process spawning**: Launches Claude Code CLI with inherited stdio and custom environment

## Key Dependencies

- `@inquirer/prompts`: For secure password input with masking
- `cross-spawn`: Platform-agnostic process spawning
- `chalk`: Terminal colors for user-friendly output
- `update-notifier`: Automatic npm update notifications
- `which`: Command availability checking

## Development Commands

```bash
# Run locally during development
node index.js

# Lint code
npm run lint

# Version bumping (automated commit messages)
npm run release:patch  # Bump patch version
npm run release:minor  # Bump minor version
npm run release:major  # Bump major version

# Check for vulnerabilities
npm audit
```

## Testing

Currently no automated tests are configured. When implementing tests, focus on:
- Version flag handling (`--version`, `-v`)
- Claude Code CLI detection
- Windows Git Bash detection logic
- Token validation and environment setup

## Release Process

1. Update version in `package.json` if not using npm scripts
2. Update `SESSION_SUMMARY.md` with changes
3. Commit changes with descriptive message
4. Publish to npm: `npm publish`
5. Create GitHub release with changelog

## Platform-Specific Behavior

### Windows
- Requires Git Bash for Claude Code CLI to function
- Detects Git Bash in standard locations:
  - `C:\Program Files\Git\bin\bash.exe` (64-bit)
  - `C:\Program Files (x86)\Git\bin\bash.exe` (32-bit)
  - Custom path via `CLAUDE_CODE_GIT_BASH_PATH` environment variable
- Provides clear error messages with installation guidance

### Unix (macOS/Linux)
- No additional requirements beyond Claude Code CLI
- Standard Unix process spawning behavior

## Important Constants

- `ANTHROPIC_BASE_URL`: `"https://routerlab.ch"` (ScioNos-specific endpoint)
- Minimum Node.js version: 22
- Package entry point: `index.js` with shebang for direct execution

## Code Style Notes

- ES6 modules throughout (`import`/`export`)
- Async/await pattern for asynchronous operations
- Colored terminal output using chalk
- Clear user error messages with actionable guidance
- Process exit codes: 0 (success), 1 (error)