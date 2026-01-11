#!/usr/bin/env node

import chalk from 'chalk';
import { password, confirm } from '@inquirer/prompts';
import spawn from 'cross-spawn';
import updateNotifier from 'update-notifier';
import process from 'node:process';
import { execSync } from 'node:child_process';
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
let claudeStatus = isClaudeCodeInstalled();

if (!claudeStatus.installed) {
    console.error(chalk.redBright('\n❌ Claude Code CLI not found'));

    // Show detailed detection info
    console.error(chalk.yellow('\nDetection Details:'));
    console.error(chalk.gray(claudeStatus.details));
    console.log(''); // spacer

    const shouldInstall = await confirm({
        message: 'Claude Code CLI is not installed. Do you want to install it via npm now?',
        default: true
    });

    if (shouldInstall) {
        try {
            console.log(chalk.cyan('\n📦 Installing @anthropic-ai/claude-code globally...'));
            execSync('npm install -g @anthropic-ai/claude-code', { stdio: 'inherit' });
            console.log(chalk.green('✓ Installation successful!'));
            
            // Re-detect to get the new path
            claudeStatus = isClaudeCodeInstalled();
            
            if (!claudeStatus.installed) {
                 // Fallback if install succeeded but path isn't picked up immediately
                 console.warn(chalk.yellow('⚠ Installation finished, but the executable was not found in the standard paths immediately.'));
                 console.warn(chalk.yellow('You may need to restart your terminal.'));
                 process.exit(0);
            }
        } catch (e) {
            console.error(chalk.red(`\n❌ Installation failed: ${e.message}`));
            console.error(chalk.yellow('Please try installing manually using the instructions below.'));
            
            const instructions = getInstallationInstructions(osInfo, claudeStatus);
            console.error(chalk.cyan(instructions));
            process.exit(1);
        }
    } else {
        // User declined install
        const instructions = getInstallationInstructions(osInfo, claudeStatus);
        console.error(chalk.cyan(instructions));
        process.exit(1);
    }
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

// 5. Token Validation Loop
const BASE_URL = "https://routerlab.ch";
let token = "";

async function validateToken(apiKey) {
    try {
        const response = await fetch(`${BASE_URL}/v1/models`, {
            method: 'GET',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            }
        });

        if (response.ok) {
            return { valid: true };
        } else if (response.status === 401 || response.status === 403) {
            return { valid: false, reason: 'auth_failed' };
        } else {
            return { valid: false, reason: 'server_error', status: response.status, statusText: response.statusText };
        }
    } catch (error) {
        return { valid: false, reason: 'network_error', message: error.message };
    }
}

while (true) {
    token = await password({
        message: "Please enter your ANTHROPIC_AUTH_TOKEN:",
        validate: (input) => {
            if (!input || input.trim() === '') {
                return "Token cannot be empty.";
            }
            return true;
        },
        mask: '*'
    });

    console.log(chalk.gray("Validating token..."));
    const validation = await validateToken(token);

    if (validation.valid) {
        console.log(chalk.green("✓ Token validated successfully."));
        break;
    } else if (validation.reason === 'auth_failed') {
        console.log(chalk.red("❌ Invalid token. Access denied (401/403). Please try again."));
        // Loop continues
    } else {
        // Server or Network error
        console.log(chalk.yellow(`⚠ Validation warning: ${validation.reason === 'server_error' ? `Server returned ${validation.status} ${validation.statusText}` : validation.message}`));
        
        const shouldContinue = await confirm({
            message: "Could not validate token due to network/server issue. Continue anyway?",
            default: false
        });

        if (shouldContinue) {
            break;
        }
        // Loop continues if they say "No" (want to retry token)
    }
}

// 6. Environment configuration
const env = {
    ...process.env,
    ANTHROPIC_BASE_URL: BASE_URL,
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

const child = spawn(claudeStatus.cliPath, args, {
    stdio: 'inherit',
    env: env
});

// Signal Handling
// We intentionally ignore SIGINT in the parent process.
// Because stdio is 'inherit', the child process (Claude) receives the Ctrl+C (SIGINT) directly from the TTY.
process.on('SIGINT', () => {
    if (isDebug) {
        console.error(chalk.yellow('\n[Wrapper] Received SIGINT. Waiting for Claude to exit...'));
    }
});

// Handle SIGTERM (e.g., Docker stop, kill)
process.on('SIGTERM', () => {
    if (isDebug) {
        console.error(chalk.yellow('\n[Wrapper] Received SIGTERM. Forwarding to Claude...'));
    }
    if (child) {
        child.kill('SIGTERM');
    }
    process.exit(0);
});

child.on('close', (code) => {
    if (isDebug) {
        console.error(chalk.yellow(`\n[Wrapper] Child process exited with code ${code}`));
    }
    process.exit(code);
});

child.on('error', (err) => {
    console.error(chalk.red(`\n❌ Error launching Claude CLI:`));
    
    if (err.code === 'ENOENT') {
        console.error(chalk.yellow(`   The executable '${claudeStatus.cliPath}' was not found.`));
        console.error(chalk.yellow(`   It may have been deleted or moved. Please try reinstalling:`));
        console.error(chalk.cyan(`   npm install -g @anthropic-ai/claude-code`));
    } else if (err.code === 'EACCES') {
        console.error(chalk.yellow(`   Permission denied accessing '${claudeStatus.cliPath}'.`));
        console.error(chalk.yellow(`   Try running with elevated privileges (sudo or Administrator) or check file permissions.`));
    } else {
        console.error(chalk.yellow(`   ${err.message}`));
    }
    
    process.exit(1);
});