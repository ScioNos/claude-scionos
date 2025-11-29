#!/usr/bin/env node

import chalk from 'chalk';
import { password } from '@inquirer/prompts';
import spawn from 'cross-spawn';
import which from 'which';
import process from 'node:process';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');

// 0. Handle --version / -v flag
if (process.argv.includes('--version') || process.argv.includes('-v')) {
    console.log(pkg.version);
    process.exit(0);
}

// 1. Check if "claude" command is available
try {
    await which('claude');
} catch (error) {
    console.error(chalk.redBright("Error: 'claude' command not found. Please install Claude Code first: npm install -g @anthropic-ai/claude-code"));
    process.exit(1);
}

// 2. Check Git Bash on Windows
if (process.platform === 'win32') {
    const possiblePaths = [
        process.env.CLAUDE_CODE_GIT_BASH_PATH,
        'C:\\Program Files\\Git\\bin\\bash.exe',
        'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    ].filter(Boolean);

    const gitBashFound = possiblePaths.some(path => fs.existsSync(path));

    if (!gitBashFound) {
        console.log(chalk.red('\n❌ Git Bash is required on Windows\n'));
        console.log(chalk.cyan('📥 Install Git for Windows:'));
        console.log(chalk.white('   https://git-scm.com/downloads/win\n'));
        console.log(chalk.cyan('⚙️  Or set the path manually:'));
        console.log(chalk.white('   CLAUDE_CODE_GIT_BASH_PATH=C:\\Program Files\\Git\\bin\\bash.exe\n'));
        console.log(chalk.yellow('💡 After installation, restart your terminal and try again.\n'));
        process.exit(1);
    }
}

// 3. Intro
console.clear();
console.log(chalk.cyan.bold("Claude Code (via ScioNos)"));

// 4. Token info
console.log(chalk.blueBright("To retrieve your token, visit: https://hubs02225.snia.ch/console/token"));

// 5. Token input
const token = await password({
    message: "Please enter your ANTHROPIC_AUTH_TOKEN:",
    validate: (input) => {
        if (!input || input.trim() === '') {
            return "Token cannot be empty.";
        }
        return true;
    },
    mask: '*'
});

// 6. Environment configuration
const env = {
    ...process.env,
    ANTHROPIC_BASE_URL: "https://hubs02225.snia.ch",
    ANTHROPIC_AUTH_TOKEN: token,
    ANTHROPIC_API_KEY: "" // Force empty string
};

// 7. Launch Claude Code
const child = spawn('claude', [], {
    stdio: 'inherit',
    env: env
});

child.on('close', (code) => {
    process.exit(code);
});

child.on('error', (err) => {
    console.error(chalk.red(`Error launching Claude: ${err.message}`));
    process.exit(1);
});
