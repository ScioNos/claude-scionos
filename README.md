# Claude Code (via ScioNos)

<div align="center">

[![npm version](https://img.shields.io/npm/v/claude-scionos.svg?style=flat-square)](https://www.npmjs.com/package/claude-scionos)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](./LICENSE)
[![Node Version](https://img.shields.io/badge/node-%3E%3D22-brightgreen?style=flat-square)](https://nodejs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](https://github.com/ScioNos/claude-scionos/pulls)

**Ephemeral and secure runner for Claude Code CLI**

_[🇫🇷 Lire en français](./README.fr.md)_

</div>

---

### 📖 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Usage](#usage)
- [How It Works](#how-it-works)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

### 🛡️ Overview

**claude-scionos** is a secure runner for the official [Claude Code](https://github.com/anthropics/claude-code) CLI. It initializes the required environment variables for the ScioNos environment at launch and keeps authentication data in process memory during execution.

The goal is to offer a clean, isolated, and professional execution layer fully compatible with Claude Code, specifically designed for the **ScioNos environment**.

---

### 📌 Key Features

- 🔒 **Token Isolation** — Authentication token is provided at launch and kept in memory during execution
- 🔄 **Model Mapping** — Transparently route requests to supported ScioNos model strategies via local proxy
- 🧩 **Full Compatibility** — Works seamlessly with the official Claude Code CLI
- 🔐 **Session-Scoped Credentials** — Credentials are intended for the current run and cleared when the process exits
- 🚀 **Quick Start** — Single command execution via `npx`

---

### ⚙️ Requirements

Before using `claude-scionos`, ensure you have:

- **Node.js** version 22 or later ([Download](https://nodejs.org/))
- A valid **ANTHROPIC_AUTH_TOKEN** from [https://routerlab.ch/keys](https://routerlab.ch/keys)

*(Note: If **Claude Code** is not installed, the tool will offer to install it for you automatically.)*

---

### 📥 Installation

#### Option 1: Direct Execution (Recommended)

No installation required! Run directly with `npx`:

```bash
npx claude-scionos
```

#### Option 2: Global Installation

For frequent use, install globally:

```bash
npm install -g claude-scionos
```

Then run:

```bash
claude-scionos
```

---

### 🚀 Usage

#### Basic Usage

Run the command:

```bash
npx claude-scionos
```

**What happens:**

1.  Checks if Claude Code CLI is installed (if not, offers **automatic installation**)
2.  Prompts for your `ANTHROPIC_AUTH_TOKEN` and validates it instantly
3.  **Selection Menu**: Choose your model strategy:
    - *Default*: Use standard Anthropic models (Opus/Sonnet/Haiku)
    - *Claude AWS*: Maps Claude requests to the ScioNos AWS-backed strategy
    - *GLM-5*: Maps all requests to `claude-glm-5`
    - *MiniMax M2.5*: Maps all requests to `claude-minimax-m2.5`
4.  Launches Claude Code (starting a transparent local proxy if needed)
5.  Automatically cleans credentials on exit

#### Debugging

If you encounter issues, you can run with the debug flag to see detailed diagnostic information:

```bash
npx claude-scionos --scionos-debug
```

#### Command Line Options

```bash
# Display version
npx claude-scionos --version
npx claude-scionos -v
```

#### Full Claude Code Compatibility

**`claude-scionos` is a transparent wrapper** — it accepts **all flags and commands** supported by the official Claude Code CLI.

You can use any Claude Code flag or command, such as:
- `npx claude-scionos --model opus "explain this code"`
- `npx claude-scionos --verbose --continue`
- `npx claude-scionos -p --output-format json "query"`

For advanced flags and subcommands, refer to the installed Claude Code CLI version available in your environment.

---

### 🔍 How It Works

1. **Verification**: Checks if `claude` command is available in your PATH
2. **Token Validation**: Prompts for and validates your token in real-time via the API (ensuring it works before launch)
3. **Environment Setup**: Creates isolated environment variables:
   - `ANTHROPIC_BASE_URL` → `https://routerlab.ch`
   - `ANTHROPIC_AUTH_TOKEN` → Your token (memory only)
4. **Execution**: Launches Claude Code with the prepared environment and starts a local proxy when a mapped strategy is selected
5. **Cleanup**: Clears in-memory credentials when the process exits

The wrapper is designed to keep credentials scoped to the current run and avoid writing its own project-specific configuration files.

---

### 🔐 Security Considerations

While `claude-scionos` ensures maximum security by keeping tokens in memory only, please be aware:

⚠️ **Important Notes:**

- Tokens are intended to stay in process memory during execution
- Runtime behavior also depends on the underlying Claude Code CLI and installed dependencies on the host machine
- Memory dumps or debuggers could potentially expose the token while the process runs
- Tokens are cleared when the process terminates
- **Use only in trusted environments**

✅ **Best Practices:**

- Never share your `ANTHROPIC_AUTH_TOKEN` with others
- Retrieve a fresh token for each session from [https://routerlab.ch/keys](https://routerlab.ch/keys)
- Avoid running on shared/untrusted systems
- Use for local development or secure CI/CD pipelines

---

### 🛠️ Troubleshooting

#### Error: 'claude' command not found

**Problem:** Claude Code CLI is not installed or not in PATH.

**Solution:**
```bash
npm install -g @anthropic-ai/claude-code
```

Verify installation:
```bash
claude --version
```

---

#### Windows: Git Bash not found

**Problem:** On Windows, Claude Code requires git-bash to run. If you see an error after entering your token, or if `claude-scionos` exits with a Git Bash warning, this is the issue.

**Solution:**

1. **Install Git for Windows** (includes Git Bash):

   Download from: [https://git-scm.com/downloads/win](https://git-scm.com/downloads/win)

2. **Alternative:** If Git Bash is already installed but not detected, set the environment variable:

   ```bash
   # Windows Command Prompt
   set CLAUDE_CODE_GIT_BASH_PATH=C:\Program Files\Git\bin\bash.exe

   # Windows PowerShell
   $env:CLAUDE_CODE_GIT_BASH_PATH="C:\Program Files\Git\bin\bash.exe"
   ```

3. **Restart your terminal** and run again:

   ```bash
   npx claude-scionos
   ```

**Note:** Git Bash is automatically included when you install Git for Windows. After installation, `claude-scionos` will detect it automatically.

---

#### Token authentication fails

**Problem:** Invalid or expired token.

**Solution:**
1. Get a fresh token from [https://routerlab.ch/keys](https://routerlab.ch/keys)
2. Ensure you're copying the complete token (no extra spaces)
3. Check your network connection to `routerlab.ch`

---

#### Node.js version error

**Problem:** Node.js version is below 22.

**Solution:**
```bash
# Check your Node version
node --version

# Upgrade Node.js to version 22 or later
# Visit: https://nodejs.org/
```

---

### 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. **Report Bugs** — [Open an issue](https://github.com/ScioNos/claude-scionos/issues)
2. **Suggest Features** — Share your ideas via issues
3. **Submit PRs** — Fork, create a branch, and submit a pull request

**Development Setup:**

```bash
# Clone the repository
git clone https://github.com/ScioNos/claude-scionos.git
cd claude-scionos

# Install dependencies
npm install

# Test locally
node index.js
```

---

### 📝 License

MIT License — © 2025 [ScioNos](https://scionos.ch)

See [LICENSE](./LICENSE) file for details.

---

### 🔗 Links

- **Homepage:** [https://scionos.ch](https://scionos.ch)
- **npm Package:** [https://www.npmjs.com/package/claude-scionos](https://www.npmjs.com/package/claude-scionos)
- **Issues:** [https://github.com/ScioNos/claude-scionos/issues](https://github.com/ScioNos/claude-scionos/issues)
- **Claude Code:** [https://github.com/anthropics/claude-code](https://github.com/anthropics/claude-code)

---

<div align="center">

**Made with ❤️ by ScioNos**

[⬆ Back to Top](#claude-code-via-scionos)

</div>
