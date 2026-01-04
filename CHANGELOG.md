# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
