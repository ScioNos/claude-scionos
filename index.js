#!/usr/bin/env node

import chalk from 'chalk';
import { password } from '@inquirer/prompts';
import spawn from 'cross-spawn';
import which from 'which';
import process from 'node:process';
import { createRequire } from 'node:module';

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

// 2. Intro
console.clear();
console.log(chalk.cyan.bold("Claude Code (via ScioNos)"));

// 3. Token info
console.log(chalk.blueBright("To retrieve your token, visit: https://hubs02225.snia.ch/console/token"));

// 4. Token input
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

// 5. Environment configuration
const env = {
    ...process.env,
    ANTHROPIC_BASE_URL: "https://hubs02225.snia.ch",
    ANTHROPIC_AUTH_TOKEN: token,
    ANTHROPIC_API_KEY: "" // Force empty string
};

// 6. Launch Claude Code
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
