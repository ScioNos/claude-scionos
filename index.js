#!/usr/bin/env node

import chalk from 'chalk';
import { password } from '@inquirer/prompts';
import spawn from 'cross-spawn';
import updateNotifier from 'update-notifier';
import process from 'node:process';
import { createRequire } from 'node:module';
import { isClaudeCodeInstalled, detectOS, checkGitBashOnWindows, getInstallationInstructions } from './src/detectors/claude-only.js';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');

// Initialize update notifier
updateNotifier({ pkg }).notify();

// 0. Handle Flags
if (process.argv.includes('--version') || process.argv.includes('-v')) {
    console.log(pkg.version);
    process.exit(0);
}

const isDebug = process.argv.includes('--scionos-debug');

// 1. Enhanced System Detection
console.log(chalk.cyan('🔍 Checking system configuration...'));

// Detect OS and environment
const osInfo = detectOS();
console.log(chalk.gray(`✓ OS: ${osInfo.type} (${osInfo.arch})`));
console.log(chalk.gray(`✓ Shell: ${osInfo.shell}`));

// Check Claude Code installation
const claudeStatus = isClaudeCodeInstalled();

if (!claudeStatus.installed) {
    console.error(chalk.redBright('\n❌ Claude Code not found'));

    // Show detailed detection info
    console.log(chalk.yellow('\nDetection Details:'));
    console.log(chalk.gray(claudeStatus.details));

    // Show installation instructions
    const instructions = getInstallationInstructions(osInfo, claudeStatus);
    console.log(chalk.cyan(instructions));

    process.exit(1);
}

// Show Claude Code status
console.log(chalk.green('\n✓ Claude Code detected'));
console.log(chalk.gray(claudeStatus.details));

// 2. Check Git Bash on Windows (if needed)
let gitBashPath = null;
if (process.platform === 'win32') {
    console.log(chalk.cyan('\n🔍 Checking Git Bash availability...'));
    const gitBashStatus = checkGitBashOnWindows();

    if (!gitBashStatus.available) {
        console.log(chalk.red('\n❌ Git Bash is required on Windows'));
        console.log(chalk.gray(gitBashStatus.message));

        // Show Git Bash installation instructions
        console.log(chalk.cyan('\n📥 Install Git for Windows:'));
        console.log(chalk.white('   https://git-scm.com/downloads/win\n'));
        console.log(chalk.cyan('⚙️  Or set the path manually:'));
        console.log(chalk.white('   set CLAUDE_CODE_GIT_BASH_PATH=C:\\Program Files\\Git\\bin\\bash.exe'));
        console.log(chalk.white('   (PowerShell: $env:CLAUDE_CODE_GIT_BASH_PATH="C:\\Program Files\\Git\\bin\\bash.exe")\n'));
        console.log(chalk.yellow('💡 After installation, restart your terminal and try again.\n'));
        process.exit(1);
    } else {
        console.log(chalk.green('✓ Git Bash available'));
        console.log(chalk.gray(gitBashStatus.message));
        gitBashPath = gitBashStatus.path;
    }
}

// 3. Intro
console.clear();
console.log(chalk.cyan.bold("Claude Code (via ScioNos)"));
console.log(chalk.gray(`Running on ${osInfo.type} with ${osInfo.shell}`));
if (isDebug) console.log(chalk.yellow("🐞 Debug Mode Active"));

// 4. Token info
console.log(chalk.blueBright("To retrieve your token, visit: https://routerlab.ch/keys"));

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
    ANTHROPIC_BASE_URL: "https://routerlab.ch",
    ANTHROPIC_AUTH_TOKEN: token,
    ANTHROPIC_API_KEY: "" // Force empty string
};

// 7. Launch Claude Code
// Filter out our internal flag before passing args to Claude
const args = process.argv.slice(2).filter(arg => arg !== '--scionos-debug');

if (isDebug) {
    console.log(chalk.yellow('\n--- DEBUG INFO ---'));
    console.log(chalk.gray(`Platform: ${process.platform}`));
    console.log(chalk.gray(`Claude Command: claude ${args.join(' ')}`));
    console.log(chalk.gray(`Router URL: ${env.ANTHROPIC_BASE_URL}`));
    console.log(chalk.gray(`Token Length: ${token.length} chars`));
    if (gitBashPath) console.log(chalk.gray(`Git Bash: ${gitBashPath}`));
    console.log(chalk.yellow('------------------\n'));
}

const child = spawn('claude', args, {
    stdio: 'inherit',
    env: env
});

// Signal Handling
// We intentionally ignore SIGINT in the parent process.
// Because stdio is 'inherit', the child process (Claude) receives the Ctrl+C (SIGINT) directly from the TTY.
// If the parent exits immediately on SIGINT (Node default), it might kill the child or leave the terminal in a weird state.
// By listening and doing nothing, we let the child handle the exit sequence.
process.on('SIGINT', () => {
    if (isDebug) {
        console.log(chalk.yellow('\n[Wrapper] Received SIGINT. Waiting for Claude to exit...'));
    }
});

child.on('close', (code) => {
    if (isDebug) {
        console.log(chalk.yellow(`\n[Wrapper] Child process exited with code ${code}`));
    }
    process.exit(code);
});

child.on('error', (err) => {
    console.error(chalk.red(`Error launching Claude: ${err.message}`));
    process.exit(1);
});