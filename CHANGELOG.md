# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- Support for SNIA environment (`https://hubs02225.snia.ch`)
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

[1.0.1]: https://github.com/ScioNos/claude-scionos/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/ScioNos/claude-scionos/releases/tag/v1.0.0
