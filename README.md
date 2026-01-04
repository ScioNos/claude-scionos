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

**claude-scionos** is an ephemeral and secure runner for the official [Claude Code](https://github.com/anthropics/claude-code) CLI. It initializes all required environment variables **directly in memory**, ensuring that no configuration files or authentication data are ever written to disk.

The goal is to offer a clean, isolated, and professional execution layer fully compatible with Claude Code, specifically designed for the **ScioNos environment**.

---

### 📌 Key Features

- 🔒 **Token Isolation** — Authentication token never written to disk
- 💾 **Zero Persistence** — No temporary files or local configuration stored
- 🧩 **Full Compatibility** — Works seamlessly with the official Claude Code CLI
- 🔐 **Memory-Only Storage** — All credentials destroyed on process exit
- 🚀 **Quick Start** — Single command execution via `npx`
- 🧪 **CI/CD Ready** — Suitable for automated workflows and pipelines

---

### ⚙️ Requirements

Before using `claude-scionos`, ensure you have:

- **Node.js** version 22 or later ([Download](https://nodejs.org/))
- **Claude Code** CLI installed globally:

  ```bash
  npm install -g @anthropic-ai/claude-code
  ```

- A valid **ANTHROPIC_AUTH_TOKEN** from [https://routerlab.ch/keys](https://routerlab.ch/keys)

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

Simply execute the command:

```bash
npx claude-scionos
```

**What happens:**

1. The tool checks if Claude Code CLI is installed
2. Prompts you to enter your `ANTHROPIC_AUTH_TOKEN`
3. Launches Claude Code with the token stored **only in memory**
4. Automatically cleans up credentials when you exit

#### Example Session

```bash
$ npx claude-scionos

Claude Code (via ScioNos)
To retrieve your token, visit: https://routerlab.ch/keys
? Please enter your ANTHROPIC_AUTH_TOKEN: ********

# Claude Code starts...
```

#### Command-Line Options

```bash
# Display version
npx claude-scionos --version
npx claude-scionos -v
```

---

### 🔍 How It Works

1. **Verification**: Checks if `claude` command is available in your PATH
2. **Token Input**: Securely prompts for your authentication token (masked input)
3. **Environment Setup**: Creates isolated environment variables:
   - `ANTHROPIC_BASE_URL` → `https://routerlab.ch`
   - `ANTHROPIC_AUTH_TOKEN` → Your token (memory only)
4. **Execution**: Spawns Claude Code process with custom environment
5. **Cleanup**: Automatically destroys credentials on exit

**No files are created. No data persists.**

---

### 🔐 Security Considerations

While `claude-scionos` ensures maximum security by keeping tokens in memory only, please be aware:

⚠️ **Important Notes:**

- Tokens are **never written to disk**
- Memory dumps or debuggers could potentially expose the token while the process runs
- Tokens are automatically cleared when the process terminates
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
