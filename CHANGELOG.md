# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.2] - 2026-01-11

### Added
- **Robust Proxy**: Integrated `undici` library for advanced HTTP agent control in the local proxy.
- **SSL Bypass**: Added support for internal/self-signed certificates (`rejectUnauthorized: false`) when using the proxy.

### Fixed
- **Proxy Connectivity**: Fixed `fetch failed` and protocol errors by cleaning conflicting headers (`Host`, `Content-Length`) before upstream forwarding.
- **Code Quality**: Removed unused variables and dead code for cleaner execution.

## [3.0.1] - 2026-01-11

### Added
- **Model Mapping & Proxy**: Integrated local proxy to transparently map Claude models to **GLM-4.7** or **MiniMax-M2.1**.
- **Active Token Validation**: Now validates the `ANTHROPIC_AUTH_TOKEN` against the `routerlab.ch` API in real-time before launching.
- **Interactive Menu**: Added a selection menu at startup to choose the model strategy (Default vs Mapped).
- **Pro Branding**: New professional "ScioNos ✕ Claude Code" banner with corporate colors.

### Improved
- **Error Handling**: Better distinction between missing executable (`ENOENT`) and permission errors (`EACCES`).
- **User Interface**: Clearer validation steps and visual feedback.

## [2.2.0] - 2026-01-06

### Added
- **Auto-Installation**: Prompts users to automatically install Claude Code CLI (`npm install -g`) if missing.
- **Native Path Detection**: Now detects Claude Code installations in native paths (`~/.local/bin`, Windows Apps, etc.) per official docs.
- **SIGTERM Support**: Added handling for `SIGTERM` signals (Docker, CI/CD) to cleanly stop the child process.

### Fixed
- **Crash on Config-Only**: Fixed a critical bug where the wrapper would crash if a configuration file existed but the CLI executable was missing.
- **Recursion Safety**: Now launches the detected absolute path of the executable instead of the generic command name, preventing potential loop issues.
- **Error Logging**: Errors are now correctly sent to `stderr` instead of `stdout`.

## [2.1.0] - 2026-01-06

### Added
- **Debug Mode**: New `--scionos-debug` flag for detailed diagnostic output
- **Test Infrastructure**: Added Vitest test suite covering core detection logic
- **Linting**: Fixed development environment and linting rules

### Fixed
- **Windows Path Handling**: Fixed an issue where `where claude` returned multiple paths on Windows
- **Signal Handling**: Improved `SIGINT` (Ctrl+C) handling to prevent wrapper from killing Claude prematurely

## [2.0.0] - 2025-12-12

### ⚠️ BREAKING CHANGES
- Enhanced detection system replaces basic checks
- Improved error handling with detailed diagnostics
- Better cross-platform support and user guidance

### Added
- **Advanced System Detection**: Comprehensive OS, shell, and environment detection
- **Enhanced Claude Code Detection**: Checks both directory and CLI availability with detailed status
- **Improved Git Bash Detection**: Better Windows support with automatic path discovery
- **Detailed Error Messages**: Actionable troubleshooting information for users
- **System Information Display**: Shows detected OS and shell during startup
- **Modular Architecture**: New `src/detectors/` directory for extensible detection logic

### Improved
- **User Experience**: Much clearer feedback when something goes wrong
- **Cross-Platform Compatibility**: Better handling of Windows, macOS, and Linux
- **Installation Guidance**: OS-specific instructions when dependencies are missing
- **Code Organization**: Cleaner separation of concerns with dedicated detection modules

### Technical Changes
- Replaced basic `which()` checks with comprehensive detection system
- Added support for detecting Claude Code configuration files
- Enhanced shell detection (PowerShell, CMD, bash, zsh, fish)
- Improved error recovery and user guidance

## [1.0.1] - 2025-11-29

### Added
- Git Bash detection for Windows users
- Clear error message when Git Bash is missing on Windows
- Troubleshooting section for Git Bash in README.md
- Section de dépannage pour Git Bash dans README.fr.md
- Support for `CLAUDE_CODE_GIT_BASH_PATH` environment variable

### Fixed
- Windows users no longer blocked after entering token due to missing Git Bash
- Better error handling for Windows environment requirements

### Improved
- User experience for Windows beta testers
- Documentation clarity for Windows-specific requirements
- Error messages now provide actionable solutions

## [1.0.0] - 2025-11-28

### Added
- Initial release
- Ephemeral and secure token handling (memory-only storage)
- Support for ScioNos environment (`https://routerlab.ch`)
- Bilingual documentation (English and French)
- Command-line interface with `--version` flag
- Secure token input with masking
- Automatic cleanup on process exit
- Zero persistence (no files written to disk)

### Security
- Tokens stored only in memory
- No configuration files created
- Automatic credential cleanup on exit
- Environment variable isolation

[2.0.0]: https://github.com/ScioNos/claude-scionos/compare/v1.0.1...v2.0.0
[1.0.1]: https://github.com/ScioNos/claude-scionos/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/ScioNos/claude-scionos/releases/tag/v1.0.0
