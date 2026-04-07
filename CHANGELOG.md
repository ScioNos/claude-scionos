# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **ACP Server MVP**: Replaced the provisional stdio bridge with a minimal ACP JSON-RPC server for Zed-compatible `initialize`, `message/send`, `cancel`, and `shutdown` flows.

### Changed
- **ACP Capabilities**: Advertise conservative ACP capabilities and return empty `tools/list` and `prompts/list` responses until those surfaces are implemented.
- **ACP Mock Testing**: Allow `SCIONOS_ACP_MOCK=1` to bypass RouterLab token validation only for explicit local ACP wrapper testing.
- **Documentation**: Clarified the current ACP support level and Zed integration behavior in the English and French READMEs.

## [4.1.1] - 2026-04-03

### Added
- **RouterLab Strategy Coverage**: Added `claude-gpt-5.4` to the `routerlab` service menu in addition to the existing `llm` service support.

## [4.1.0] - 2026-04-02

### Added
- **Invitation-Only LLM Service**: Added `--service llm` to target `https://llm.routerlab.ch` without changing the default RouterLab experience.
- **Service-Aware Token Storage**: Added separate secure token storage and validation flows for the invitation-only LLM access.

### Changed
- **CLI UX**: Updated `auth`, `doctor`, `--list-strategies`, help output, and launch summaries to display the selected service target explicitly.
- **Documentation**: Documented the new `llm` service in both English and French READMEs.

## [4.0.1] - 2026-03-27

### Fixed
- **Global npm Invocation on Windows**: Fixed silent exits when `claude-scionos` was launched through the npm global shim or `npx` with a relative script path, for example `claude-scionos --version` or `claude-scionos doctor`.
- **Entrypoint Detection**: Normalized CLI entrypoint path resolution so the wrapper consistently executes `main()` when started through Windows `.cmd`/PowerShell shims.

## [4.0.0] - 2026-03-26

### ⚠️ BREAKING CHANGES
- **Reserved Wrapper Commands**: `doctor` and `auth` are now handled by `claude-scionos` itself instead of being forwarded as plain first-position arguments to Claude Code.
- **Reserved Wrapper Flags**: `--strategy`, `--no-prompt`, and `--list-strategies` are now first-class launcher flags owned by the wrapper.
- **Release Positioning**: The package is now documented and packaged as a RouterLab launcher with its own client-facing command surface, not only as a thin pass-through wrapper.

### Added
- **Secure Token Storage**: Added cross-platform secure token management with `auth login`, `auth status`, `auth change`, `auth logout`, and `auth test`.
- **Non-Interactive Launch**: Added `--strategy` and `--no-prompt` for scripted launches, CI usage, and customer support workflows.
- **Diagnostics**: Added `doctor` to validate local prerequisites, Git Bash on Windows, secure storage support, and RouterLab token availability.
- **Strategy Discovery**: Added `--list-strategies`, live availability checks, and fallback logic when a mapped strategy is unavailable.
- **Client UX**: Added embedded quick-start help, launch summaries, and clearer strategy metadata in the interactive flow.

### Changed
- **Architecture**: Refactored the single-file launcher into an orchestrator plus dedicated `src/proxy.js` and `src/routerlab.js` modules.
- **Branding**: Kept the original banner style while expanding the client-oriented CLI flow around RouterLab support and model routing.
- **Packaging**: Limited published npm contents with a `files` whitelist, aligned package metadata with RouterLab, and added explicit `.npmignore` guidance.
- **Testing**: Expanded runtime coverage around proxy headers, model mapping, strategy readiness, and fallback behavior.

### Fixed
- **Proxy Transparency**: Preserved upstream Claude Code headers more faithfully, removed fragile header rebuilding, and recalculated request metadata after model swapping.
- **Bootstrap Side Effects**: Removed automatic update-notifier behavior that introduced hidden persistence and import-time side effects.
- **Manifest Integrity**: Removed the invalid self-dependency and cleaned release metadata to avoid broken installs and inconsistent published state.
- **Windows Reliability**: Stabilized the CLI and test flow on Windows by using a thread-based Vitest pool and keeping the terminal UI layout closer to the original working design.

### Documentation
- **README**: Rewrote the English and French READMEs around RouterLab usage, secure token storage, `doctor`, automation-friendly flags, and support flows.
- **Changelog**: Rebased release notes to reflect the actual product surface delivered in this release.

## [3.1.0] - 2026-03-25

### Changed
- **Versioning**: Aligned the published package metadata on `3.1.0` to match the current working state.
- **Documentation**: Reviewed the README files and internal guidance to remove outdated release claims and keep the project description consistent with the current repository state.

### Cleaned
- **Repository**: Removed unused root assets and other non-essential release leftovers.

## [3.0.7] - 2026-03-23

### Changed
- **Documentation**: Updated the README files to reflect the RouterLab model identifiers `claude-glm-5` and `claude-minimax-m2.5`.
- **Tests**: Stabilized the Windows detector test suite against host environment leakage.

### Cleaned
- **Repository**: Reduced temporary/release noise around the package contents and project workspace.

## [3.0.6] - 2026-03-17

### Fixed
- **Proxy Connectivity**: Replaced `undici` with native `node:https` module to fix "Cannot find package 'undici'" and "fetch failed" errors.
- **Model Compatibility**: Updated GLM-5 and MiniMax to use the Anthropic-compatible proxy model IDs available at the time.
- **Error Handling**: Improved error logging with detailed error codes and causes for easier debugging.

### Improved
- **Timeouts**: Increased token validation timeout from 10s to 30s; added 60-120s timeouts for proxy requests.
- **Retry Logic**: Added exponential backoff retry for transient 502/503/504 errors.
- **Debug Mode**: Enhanced `--scionos-debug` output with request/response status logging.

## [3.0.5] - 2026-03-16

### Added
- **Dynamic AWS Models**: Integrated dynamic routing for AWS 50% discount models (`haiku`, `sonnet`, `opus`) in the local proxy.
- **Model Selection**: Cleaned up the initial prompt menu to offer 4 robust strategic choices including GLM-5 and MiniMax M2.5.

## [3.0.4] - 2026-03-16

### Changed
- **Dependencies**: Replaced `chalk`, `cross-spawn`, and `undici` with Node.js >= 22 native APIs (`util.styleText`, `child_process.spawn`, `fetch`).
- **Dependencies**: Updated development and production packages to the latest versions.

### Fixed
- **Code Quality**: Fixed `Token` ESLint assignment warnings and improved formatting compatibility.

## [3.0.3] - 2026-02-18

### Changed
- **Model**: Renamed `GLM-4.7` to `Kimi K2.5` (`kimi-k2.5`) in the model selection menu.

### Fixed
- **Token Validation**: Added a 10-second `AbortController` timeout on `validateToken()` to prevent the prompt from hanging on unresponsive network.
- **Proxy Memory**: Added a 100 MB cap on incoming request buffers; oversized requests now return HTTP 413 instead of causing a memory overflow.
- **CI/CD Compatibility**: `console.clear()` is now skipped when the `CI` environment variable is set or `--no-clear` is passed, preventing broken output in pipelines.

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

[4.0.1]: https://github.com/ScioNos/claude-scionos/compare/v4.0.0...v4.0.1
[4.0.0]: https://github.com/ScioNos/claude-scionos/compare/v3.1.0...v4.0.0
[3.1.0]: https://github.com/ScioNos/claude-scionos/compare/v3.0.7...v3.1.0
[3.0.6]: https://github.com/ScioNos/claude-scionos/compare/v3.0.5...v3.0.6
[3.0.7]: https://github.com/ScioNos/claude-scionos/compare/v3.0.6...v3.0.7
[3.0.5]: https://github.com/ScioNos/claude-scionos/compare/v3.0.4...v3.0.5
[3.0.4]: https://github.com/ScioNos/claude-scionos/compare/v3.0.3...v3.0.4
[3.0.3]: https://github.com/ScioNos/claude-scionos/compare/v3.0.2...v3.0.3
[3.0.2]: https://github.com/ScioNos/claude-scionos/compare/v3.0.1...v3.0.2
[3.0.1]: https://github.com/ScioNos/claude-scionos/compare/v2.2.0...v3.0.1
[2.2.0]: https://github.com/ScioNos/claude-scionos/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/ScioNos/claude-scionos/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/ScioNos/claude-scionos/compare/v1.0.1...v2.0.0
[1.0.1]: https://github.com/ScioNos/claude-scionos/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/ScioNos/claude-scionos/releases/tag/v1.0.0
