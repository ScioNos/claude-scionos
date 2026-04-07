# Claude Code for RouterLab

`claude-scionos` is a RouterLab launcher for the official Claude Code CLI. It keeps the normal Claude Code workflow, while adding guided onboarding, strategy routing, secure token storage, and a `doctor` command for client support.

_[🇫🇷 Lire en français](./README.fr.md)_

## Highlights

- Guided launch for first-time users
- `--strategy` to preselect a routing strategy
- `--service llm` for invitation-only RouterLab LLM access
- `--no-prompt` for automation and CI
- `--list-strategies` to inspect available routes
- `doctor` to diagnose local setup quickly
- `auth login|status|change|logout|test` for secure token management
- Local proxy only when a mapped strategy is selected
- `--acp` for non-interactive Zed/editor integrations
- Conservative ACP capabilities (`tools`, `prompts`, `resources`, `streaming` disabled until implemented)

## Requirements

- Node.js 22 or later
- A RouterLab token from [routerlab.ch/keys](https://routerlab.ch/keys)
- Or an invitation token for `--service llm`
- On Windows, Git Bash must be installed for Claude Code

## Installation

Run directly with `npx`:

```bash
npx claude-scionos
```

Or install globally:

```bash
npm install -g claude-scionos
claude-scionos
```

## Quick Start

Guided mode:

```bash
npx claude-scionos
```

Useful commands:

```bash
npx claude-scionos --list-strategies
npx claude-scionos doctor
npx claude-scionos auth login
npx claude-scionos auth login --service llm
npx claude-scionos auth test
npx claude-scionos --strategy aws
npx claude-scionos --service llm --strategy claude-glm-5
npx claude-scionos --strategy aws --no-prompt -p "Summarize this repo"
npx claude-scionos --acp --no-prompt
```

## Services

- Default behavior uses `https://routerlab.ch`
- `--service llm` switches the launcher to `https://llm.routerlab.ch`
- `llm` is intended for invitation-only access
- Tokens stored with `auth login --service llm` are kept separate from the default RouterLab token
- `llm` currently exposes `claude-glm-5` and `claude-gpt-5.4`
- `routerlab` also exposes `claude-gpt-5.4`

## Strategies

- `default`: use Claude Code normally without the local proxy
- `aws`: remap Claude model families to RouterLab AWS-backed Claude variants
- `claude-glm-5`: force all requests to `claude-glm-5`
- `claude-minimax-m2.5`: force all requests to `claude-minimax-m2.5`
- `claude-gpt-5.4`: force all requests to `claude-gpt-5.4`

Use `--list-strategies` to see the strategies available for the selected service and their live availability when a token is available.

## Token Handling

Token resolution order:

1. `ANTHROPIC_AUTH_TOKEN`
2. Secure local storage from `claude-scionos auth login`
3. Service-specific secure local storage from `claude-scionos auth login --service llm`
4. Manual prompt in guided mode

Secure storage backends:

- Windows: DPAPI-encrypted local file bound to the current user
- macOS: Keychain
- Linux: Secret Service via `secret-tool`

Manage the token with:

```bash
claude-scionos auth login
claude-scionos auth status
claude-scionos auth change
claude-scionos auth logout
claude-scionos auth test
```

## What `--strategy`, `--no-prompt`, and `--acp` mean

- `--strategy <value>` skips the interactive strategy menu and selects the route directly
- `--service <value>` switches between RouterLab targets. `routerlab` is the default and `llm` is invitation-only
- `--no-prompt` disables every interactive question
- `--acp` starts a non-interactive stdio bridge intended for Zed or another ACP-capable editor

When `--no-prompt` is used, the launcher must already have a token from `ANTHROPIC_AUTH_TOKEN` or secure storage.

When `--acp` is used, the wrapper also forces non-interactive behavior and writes its own diagnostics to `stderr` only.

## Zed Integration

Use `claude-scionos --acp` as the custom agent command in Zed. For example:

```json
{
  "agent_servers": {
    "claude-scionos": {
      "type": "custom",
      "command": "npx",
      "args": ["claude-scionos", "--acp", "--no-prompt"]
    }
  }
}
```

Current ACP support is intentionally minimal:
- `initialize`
- `message/send`
- `tools/list` returns an empty list
- `prompts/list` returns an empty list
- `cancel` / `message/cancel`
- `shutdown`

For local wrapper-only testing without a valid RouterLab token, you can enable the development bypass:

```bash
SCIONOS_ACP_MOCK=1 node index.js --acp --no-prompt
```

This mock mode is only intended to let the ACP wrapper start for local/Zed testing. It does not validate real RouterLab access.

The wrapper does not yet advertise streaming, tools, resources, or prompt capabilities.

ACP mode reuses the same service, token, and strategy logic as the normal launcher. If you need a mapped route, pass the same strategy flags you would use in the terminal.

## Doctor

`claude-scionos doctor` checks the local setup and prints a support-friendly summary:

- platform and Node.js
- Claude Code installation
- Git Bash on Windows
- secure storage backend
- stored or environment token presence
- RouterLab token validation when a token is available

## Compatibility

The wrapper forwards regular Claude Code flags and arguments. The local proxy is only started for mapped strategies. `default` launches Claude Code without the proxy layer.

## Troubleshooting

`claude-scionos doctor` should be the first command to run when a client reports an issue.

Common cases:

- `Claude Code CLI not found`: install `@anthropic-ai/claude-code`
- `Git Bash is required on Windows`: install Git for Windows
- `ANTHROPIC_AUTH_TOKEN ... is required when using --no-prompt`: set the environment variable or store the token first
- `secret-tool not found`: install a Secret Service client on Linux or rely on the environment variable

## Development

```bash
npm install
npm test
npm run lint
node index.js
```

## License

MIT. See [LICENSE](./LICENSE).
