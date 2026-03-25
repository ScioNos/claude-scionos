# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- Install dependencies: `npm install`
- Run tests: `npm test`
- Run a single test file: `npx vitest run tests/detectors.test.js`
- Run tests matching a name: `npx vitest run -t "detectOS"`
- Lint: `npm run lint`
- Run the CLI locally: `node index.js`
- Run the published package behavior locally via npm entrypoint: `npx .`
- Debug wrapper/proxy behavior: `node index.js --scionos-debug`
- Show wrapper version: `node index.js --version`

## Architecture

This repository is a thin Node.js CLI wrapper around the official `claude` executable.

- `index.js` is the main entrypoint and contains the full runtime flow: banner/version handling, Claude Code installation checks, Windows Git Bash checks, token prompt + validation against RouterLab, optional model-strategy selection, local proxy startup, env var injection, and spawning the real Claude Code process.
- `src/detectors/claude-only.js` contains the environment detection layer used by the wrapper. It is responsible for locating the Claude Code binary, detecting OS/shell details, checking Git Bash on Windows, and generating install instructions.
- `tests/detectors.test.js` covers the detector module with Vitest using mocked `fs`, `os`, and `child_process` APIs.

## Runtime model

The wrapper has two execution modes:

1. **Default mode**: it sets `ANTHROPIC_BASE_URL=https://routerlab.ch` and launches the installed Claude Code binary with the validated token in memory-only environment variables.
2. **Proxy mode**: for non-default model strategies, it starts a local HTTP proxy on `127.0.0.1` that forwards requests to RouterLab while rewriting `/messages` request bodies so Claude model IDs are swapped to ScioNos-targeted upstream models.

Important implementation details:

- Token validation happens before launch by calling `GET /v1/models` on RouterLab.
- The spawned Claude process inherits most of the parent environment, but `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, and an empty `ANTHROPIC_API_KEY` are forced in `index.js`.
- On Windows, the wrapper exits early unless Git Bash is detectable, because Claude Code depends on it.
- The wrapper can offer to install `@anthropic-ai/claude-code` globally when the `claude` binary is missing.

## Testing focus

When changing behavior, prioritize tests around detector logic and any code paths that affect:

- CLI discovery / installation detection
- Windows-specific Git Bash handling
- Token validation and launch environment setup
- Proxy request rewriting for model mapping

## Notes from README

- Requires Node.js 22+.
- The public documentation should describe credential handling conservatively: credentials are intended to stay in memory for the current run, but claims about zero persistence should only be made when they match the actual shipped runtime and dependencies.
- The wrapper is expected to remain transparent to normal Claude Code CLI flags; `index.js` forwards user args to the real `claude` binary except for the local `--scionos-debug` flag.
