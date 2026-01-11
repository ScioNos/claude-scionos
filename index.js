#!/usr/bin/env node

import chalk from 'chalk';
import { password, confirm, select } from '@inquirer/prompts';
import spawn from 'cross-spawn';
import updateNotifier from 'update-notifier';
import process from 'node:process';
import http from 'node:http';
import { createRequire } from 'node:module';
import { isClaudeCodeInstalled, detectOS, checkGitBashOnWindows, getInstallationInstructions } from './src/detectors/claude-only.js';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');

// Initialize update notifier
updateNotifier({ pkg }).notify();

// --- CONFIGURATION ---
const BASE_URL = "https://routerlab.ch";

// --- UTILS ---

/**
 * Displays the application banner
 */
function showBanner() {
    console.clear();
    const p = chalk.hex('#3b82f6'); // Primary (Scio)
    const s = chalk.hex('#a855f7'); // Secondary (Nos)
    const c = chalk.hex('#D97757'); // Claude Orange
    const w = chalk.white;
    const g = chalk.gray;
    const border = g; // Gray border

    console.log("");
    console.log(border("   ┌──────────────────────────────────────────────────────────┐"));
    console.log(border("   │                                                          │"));
    console.log(border("   │                 ") + p.bold("Scio") + s.bold("Nos") + w.bold("  ✕  ") + c.bold("Claude Code") + border("                  │"));
    console.log(border("   │                                                          │"));
    console.log(border("   └──────────────────────────────────────────────────────────┘"));
    console.log(g(`                                                   v${pkg.version}`));
    console.log("");
}

/**
 * Validates the API Token against RouterLab
 */
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

/**
 * Starts a local proxy server to map models
 * @param {string} targetModel - The model ID to map to (e.g., 'glm-4.7')
 * @param {string} validToken - The validated Auth Token
 * @returns {Promise<string>} - The local URL (e.g., http://127.0.0.1:45321)
 */
function startProxyServer(targetModel, validToken) {
    return new Promise((resolve, reject) => {
        const server = http.createServer(async (req, res) => {
            // Handle CORS preflight if necessary (usually strict for CLI tools but good practice)
            if (req.method === 'OPTIONS') {
                res.writeHead(200, {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
                    'Access-Control-Allow-Headers': '*'
                });
                res.end();
                return;
            }

            // We only care about interception if it's a message generation request
            // Claude Code uses /v1/messages
            if (req.method === 'POST' && req.url.includes('/messages')) {
                const chunks = [];
                req.on('data', chunk => chunks.push(chunk));
                req.on('end', async () => {
                    try {
                        const bodyBuffer = Buffer.concat(chunks);
                        let bodyJson;
                        try {
                            bodyJson = JSON.parse(bodyBuffer.toString());
                        } catch (e) {
                            // If not JSON, forward as is
                            bodyJson = null;
                        }

                        // THE MAGIC: Swap the model
                        if (bodyJson && bodyJson.model) {
                            // Map any Claude model to our target
                            // Claude Code usually requests 'claude-3-opus-...' or 'claude-3-5-sonnet...'
                            // We force the target.
                            if (process.argv.includes('--scionos-debug')) {
                                console.log(chalk.yellow(`[Proxy] Swapping model ${bodyJson.model} -> ${targetModel}`));
                            }
                            bodyJson.model = targetModel;
                        }

                        // Prepare upstream request
                        const upstreamRes = await fetch(`${BASE_URL}${req.url}`, {
                            method: 'POST',
                            headers: {
                                ...req.headers,
                                'host': new URL(BASE_URL).host,
                                'x-api-key': validToken // Ensure we use the validated token
                            },
                            body: bodyJson ? JSON.stringify(bodyJson) : bodyBuffer
                        });

                        // Pipe response back
                        res.writeHead(upstreamRes.status, upstreamRes.headers);
                        if (upstreamRes.body) {
                            // @ts-ignore - Node fetch body is iterable
                            for await (const chunk of upstreamRes.body) {
                                res.write(chunk);
                            }
                        }
                        res.end();

                    } catch (error) {
                        console.error(chalk.red(`[Proxy Error] ${error.message}`));
                        res.writeHead(500);
                        res.end(JSON.stringify({ error: { message: "Scionos Proxy Error" } }));
                    }
                });
            } else {
                // Passthrough for other endpoints (like /models potentially)
                // In a simple CLI usage, direct passthrough might be enough, 
                // but since we changed the BASE_URL, we must forward everything.
                // For simplicity in this script, we assume most traffic is POST /messages.
                // If Claude Code calls GET /models, we should forward it too.
                
                // Simple Redirect implementation for non-body requests
                try {
                     const upstreamRes = await fetch(`${BASE_URL}${req.url}`, {
                        method: req.method,
                        headers: {
                            ...req.headers,
                            'host': new URL(BASE_URL).host,
                            'x-api-key': validToken
                        }
                    });
                     res.writeHead(upstreamRes.status, upstreamRes.headers);
                     if (upstreamRes.body) {
                        // @ts-ignore
                        for await (const chunk of upstreamRes.body) {
                            res.write(chunk);
                        }
                     }
                     res.end();
                } catch (e) {
                    res.writeHead(502);
                    res.end();
                }
            }
        });

        // Listen on random port
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            const port = address.port;
            resolve({ server, url: `http://127.0.0.1:${port}` });
        });

        server.on('error', (err) => reject(err));
    });
}

// --- MAIN EXECUTION ---

// 0. Handle Flags
if (process.argv.includes('--version') || process.argv.includes('-v')) {
    console.log(pkg.version);
    process.exit(0);
}

const isDebug = process.argv.includes('--scionos-debug');

// 1. Show Banner
showBanner();

// 2. System Check
if (isDebug) console.log(chalk.cyan('🔍 Checking system configuration...'));
const osInfo = detectOS();
let claudeStatus = isClaudeCodeInstalled();

// Check Claude Code installation
if (!claudeStatus.installed) {
    console.error(chalk.redBright('\n❌ Claude Code CLI not found'));
    const shouldInstall = await confirm({
        message: 'Claude Code CLI is not installed. Install globally via npm?',
        default: true
    });

    if (shouldInstall) {
        try {
            console.log(chalk.cyan('\n📦 Installing @anthropic-ai/claude-code...'));
            spawn.sync('npm', ['install', '-g', '@anthropic-ai/claude-code'], { stdio: 'inherit' });
            claudeStatus = isClaudeCodeInstalled();
            if (!claudeStatus.installed) {
                 console.warn(chalk.yellow('⚠ Installation finished, but executable not found immediately. Restart terminal recommended.'));
                 process.exit(0);
            }
        } catch (e) {
            console.error(chalk.red(`\n❌ Installation failed: ${e.message}`));
            console.error(chalk.cyan(getInstallationInstructions(osInfo)));
            process.exit(1);
        }
    } else {
        console.error(chalk.cyan(getInstallationInstructions(osInfo)));
        process.exit(1);
    }
}

// Check Git Bash on Windows
let gitBashPath = null;
if (process.platform === 'win32') {
    const gitBashStatus = checkGitBashOnWindows();
    if (!gitBashStatus.available) {
        console.log(chalk.red('\n❌ Git Bash is required on Windows'));
        console.log(chalk.cyan('Please install Git for Windows: https://git-scm.com/downloads/win'));
        process.exit(1);
    }
    gitBashPath = gitBashStatus.path;
}

// 3. Token Loop
let token = "";
while (true) {
    console.log(chalk.blueBright("To retrieve your token, visit: https://routerlab.ch/keys"));
    token = await password({
        message: "Please enter your ANTHROPIC_AUTH_TOKEN:",
        mask: '*'
    });

    console.log(chalk.gray("Validating token..."));
    const validation = await validateToken(token);

    if (validation.valid) {
        console.log(chalk.green("✓ Token validated."));
        break;
    } else if (validation.reason === 'auth_failed') {
        console.log(chalk.red("❌ Invalid token (401/403). Try again."));
    } else {
        console.log(chalk.yellow(`⚠ Validation warning: ${validation.message || validation.status}`));
        const ignore = await confirm({ message: "Continue anyway?", default: false });
        if (ignore) break;
    }
}

// 4. Model Selection
const modelChoice = await select({
    message: 'Select Model Strategy:',
    choices: [
        {
            name: 'Default (Use Claude Opus/Sonnet/Haiku natively)',
            value: 'default',
            description: 'Standard behavior. Claude decides which model to use.'
        },
        {
            name: 'Force GLM-4.7 (Map all models to GLM-4.7)',
            value: 'glm-4.7',
            description: 'Intercepts traffic and routes everything to GLM-4.7'
        },
        {
            name: 'Force MiniMax-M2.1 (Map all models to MiniMax)',
            value: 'minimax-m2.1',
            description: 'Intercepts traffic and routes everything to MiniMax-M2.1'
        }
    ]
});

// 5. Setup Environment & Proxy
let finalBaseUrl = BASE_URL;
let proxyServer = null;

if (modelChoice !== 'default') {
    console.log(chalk.magenta(`\n🔮 Starting Local Proxy to map models to ${chalk.bold(modelChoice)}...`));
    try {
        const proxyInfo = await startProxyServer(modelChoice, token);
        proxyServer = proxyInfo.server;
        finalBaseUrl = proxyInfo.url; // e.g. http://127.0.0.1:54321
        if (isDebug) console.log(chalk.gray(`✓ Proxy listening on ${finalBaseUrl}`));
    } catch (err) {
        console.error(chalk.red(`Failed to start proxy: ${err.message}`));
        process.exit(1);
    }
}

const env = {
    ...process.env,
    ANTHROPIC_BASE_URL: finalBaseUrl,
    ANTHROPIC_AUTH_TOKEN: token,
    ANTHROPIC_API_KEY: "" // Force empty
};

// 6. Launch Claude
const args = process.argv.slice(2).filter(arg => arg !== '--scionos-debug');
if (isDebug) {
    console.log(chalk.yellow('\n--- DEBUG INFO ---'));
    console.log(chalk.gray(`Endpoint: ${env.ANTHROPIC_BASE_URL}`));
    console.log(chalk.gray(`Model Strategy: ${modelChoice}`));
    console.log(chalk.yellow('------------------\n'));
}

console.log(chalk.green(`\n🚀 Launching Claude Code [${modelChoice}]...\n`));

const child = spawn(claudeStatus.cliPath, args, {
    stdio: 'inherit',
    env: env
});

// 7. Cleanup Handlers
const cleanup = () => {
    if (proxyServer) {
        if (isDebug) console.log(chalk.gray('\nStopping proxy server...'));
        proxyServer.close();
    }
};

child.on('exit', (code) => {
    cleanup();
    process.exit(code);
});

child.on('error', (err) => {
    cleanup();
    console.error(chalk.red(`\n❌ Error launching Claude CLI:`));
    if (err.code === 'ENOENT') {
        console.error(chalk.yellow(`   Executable not found. Try 'npm install -g @anthropic-ai/claude-code'`));
    } else if (err.code === 'EACCES') {
        console.error(chalk.yellow(`   Permission denied.`));
    } else {
        console.error(chalk.yellow(`   ${err.message}`));
    }
    process.exit(1);
});

process.on('SIGINT', () => {
    // Child handles SIGINT usually, but we ensure cleanup if wrapper is killed
    // We don't exit here immediately to let Claude handle the interrupt
});

process.on('SIGTERM', () => {
    if (child) child.kill('SIGTERM');
    cleanup();
    process.exit(0);
});