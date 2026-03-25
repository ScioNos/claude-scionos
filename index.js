#!/usr/bin/env node

import { styleText } from 'node:util';
const chalk = {
    hex: (color) => {
        if (color === '#3b82f6') return (t) => styleText('blueBright', t);
        if (color === '#a855f7') return (t) => styleText('magentaBright', t);
        if (color === '#D97757') return (t) => styleText('redBright', t);
        return (t) => t;
    },
    white: (t) => styleText('white', t),
    gray: (t) => styleText('gray', t),
    yellow: (t) => styleText('yellow', t),
    red: (t) => styleText('red', t),
    cyan: (t) => styleText('cyan', t),
    redBright: (t) => styleText('redBright', t),
    blueBright: (t) => styleText('blueBright', t),
    green: (t) => styleText('green', t),
    magenta: (t) => styleText('magenta', t),
    bold: (t) => styleText('bold', t)
};
import { password, confirm, select } from '@inquirer/prompts';
import { spawn, spawnSync } from 'node:child_process';
import updateNotifier from 'update-notifier';
import process from 'node:process';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
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
    if (!process.env.CI && !process.argv.includes('--no-clear')) console.clear();
    const p = chalk.hex('#3b82f6'); // Primary (Scio)
    const s = chalk.hex('#a855f7'); // Secondary (Nos)
    const c = chalk.hex('#D97757'); // Claude Orange
    const w = chalk.white;
    const g = chalk.gray;
    const border = g; // Gray border

    console.log("");
    console.log(border("   ┌──────────────────────────────────────────────────────────┐"));
    console.log(border("   │                                                          │"));
    console.log(border("   │                 ") + chalk.bold(p("Scio")) + chalk.bold(s("Nos")) + chalk.bold(w("  ✕  ")) + chalk.bold(c("Claude Code")) + border("                  │"));
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
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
        const response = await fetch(`${BASE_URL}/v1/models`, {
            method: 'GET',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
            return { valid: true };
        } else if (response.status === 401 || response.status === 403) {
            return { valid: false, reason: 'auth_failed' };
        } else {
            return { valid: false, reason: 'server_error', status: response.status, statusText: response.statusText, message: `Server responded with ${response.status} ${response.statusText}`.trim() };
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            return { valid: false, reason: 'timeout', message: 'Request timed out after 30s' };
        }
        return { valid: false, reason: 'network_error', message: error.message };
    }
}

function canProceedWithValidation(validation) {
    return validation.valid === true;
}

function buildProxyRequestOptions(url, method, validToken, bodyLength, timeout) {
    const headers = {
        'Content-Type': 'application/json',
        'x-api-key': validToken,
        'anthropic-version': '2023-06-01'
    };

    if (bodyLength !== undefined) {
        headers['Content-Length'] = bodyLength;
    }

    return {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method,
        headers,
        timeout
    };
}

function installClaudeCode() {
    return spawnSync('npm', ['install', '-g', '@anthropic-ai/claude-code'], {
        stdio: 'inherit',
        shell: process.platform === 'win32'
    });
}

/**
 * Starts a local proxy server to map models
 * @param {string} targetModel - The model ID to map to (e.g., 'claude-glm-5')
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
                const MAX_SIZE = 100 * 1024 * 1024; // 100MB
                let totalSize = 0;
                req.on('data', chunk => {
                    totalSize += chunk.length;
                    if (totalSize > MAX_SIZE) {
                        res.writeHead(413);
                        res.end(JSON.stringify({ error: { message: 'Request too large' } }));
                        req.destroy();
                        return;
                    }
                    chunks.push(chunk);
                });
                req.on('end', async () => {
                    try {
                        const bodyBuffer = Buffer.concat(chunks);
                        let bodyJson;
                        try {
                            bodyJson = JSON.parse(bodyBuffer.toString());
                        } catch {
                            bodyJson = null;
                        }

                        // THE MAGIC: Swap the model
                        if (bodyJson && bodyJson.model) {
                            let newModel = targetModel;
                            if (targetModel === 'aws') {
                                if (bodyJson.model.includes('haiku')) {
                                    newModel = 'aws-claude-haiku-4-5-20251001';
                                } else if (bodyJson.model.includes('opus')) {
                                    newModel = 'aws-claude-opus-4-6';
                                } else {
                                    newModel = 'aws-claude-sonnet-4-6';
                                }
                            }

                            if (process.argv.includes('--scionos-debug')) {
                                console.log(chalk.yellow(`[Proxy] Swapping model ${bodyJson.model} -> ${newModel}`));
                            }
                            bodyJson.model = newModel;
                        }

                        // Forward request using https directly
                        const https = await import('node:https');
                        const url = new URL(`${BASE_URL}${req.url}`);
                        
                        const options = buildProxyRequestOptions(
                            url,
                            'POST',
                            validToken,
                            bodyJson ? Buffer.byteLength(JSON.stringify(bodyJson)) : bodyBuffer.length,
                            120000
                        );

                        const proxyReq = https.request(options, (proxyRes) => {
                            if (process.argv.includes('--scionos-debug')) {
                                console.log(chalk.yellow(`[Proxy] Upstream response status: ${proxyRes.statusCode}`));
                            }
                            res.writeHead(proxyRes.statusCode, proxyRes.headers);
                            proxyRes.pipe(res);
                        });

                        proxyReq.on('error', (error) => {
                            console.error(chalk.red(`[Proxy Error] POST /messages: ${error.message}`));
                            console.error(chalk.red(`  Code: ${error.code}`));
                            if (!res.headersSent) {
                                res.writeHead(500);
                                res.end(JSON.stringify({ error: { message: "Proxy Error", details: error.message, code: error.code } }));
                            }
                        });

                        proxyReq.on('timeout', () => {
                            console.error(chalk.red(`[Proxy] Request timeout`));
                            proxyReq.destroy();
                            if (!res.headersSent) {
                                res.writeHead(504);
                                res.end(JSON.stringify({ error: { message: "Gateway Timeout" } }));
                            }
                        });

                        proxyReq.write(bodyJson ? JSON.stringify(bodyJson) : bodyBuffer);
                        proxyReq.end();

                        if (process.argv.includes('--scionos-debug')) {
                            console.log(chalk.yellow(`[Proxy] Request sent to upstream`));
                        }
                    } catch (error) {
                        console.error(chalk.red(`[Proxy Error] POST /messages: ${error.message}`));
                        if (!res.headersSent) {
                            res.writeHead(500);
                            res.end(JSON.stringify({ error: { message: "Scionos Proxy Error", details: error.message } }));
                        }
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
                    const https = await import('node:https');
                    const url = new URL(`${BASE_URL}${req.url}`);
                    
                    const options = buildProxyRequestOptions(
                        url,
                        req.method,
                        validToken,
                        undefined,
                        60000
                    );

                    const proxyReq = https.request(options, (proxyRes) => {
                        res.writeHead(proxyRes.statusCode, proxyRes.headers);
                        proxyRes.pipe(res);
                    });

                    proxyReq.on('error', (error) => {
                        console.error(chalk.red(`[Proxy Error] ${req.method} ${req.url}: ${error.message}`));
                        if (!res.headersSent) {
                            res.writeHead(502);
                            res.end(JSON.stringify({
                                error: {
                                    message: "Scionos Proxy Error: Failed to connect to upstream",
                                    details: error.message
                                }
                            }));
                        }
                    });

                    // Forward body for PUT/POST requests
                    if (req.method === 'POST' || req.method === 'PUT') {
                        req.pipe(proxyReq);
                    } else {
                        proxyReq.end();
                    }
                } catch (error) {
                    console.error(chalk.red(`[Proxy Error] ${req.method} ${req.url}: ${error.message}`));
                    if (!res.headersSent) {
                        res.writeHead(502);
                        res.end(JSON.stringify({
                            error: {
                                message: "Scionos Proxy Error: Failed to connect to upstream",
                                details: error.message
                            }
                        }));
                    }
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

async function main() {
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
                const installResult = installClaudeCode();
                if (installResult.error) {
                    throw installResult.error;
                }
                if (installResult.status !== 0) {
                    throw new Error(`npm install exited with status ${installResult.status}`);
                }
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
    if (process.platform === 'win32') {
        const gitBashStatus = checkGitBashOnWindows();
        if (!gitBashStatus.available) {
            console.log(chalk.red('\n❌ Git Bash is required on Windows'));
            console.log(chalk.cyan('Please install Git for Windows: https://git-scm.com/downloads/win'));
            process.exit(1);
        }
    }

    // 3. Token Loop
    let token;
    while (true) {
        console.log(chalk.blueBright("To retrieve your token, visit: https://routerlab.ch/keys"));
        token = await password({
            message: "Please enter your ANTHROPIC_AUTH_TOKEN:",
            mask: '*'
        });

        console.log(chalk.gray("Validating token..."));
        const validation = await validateToken(token);

        if (canProceedWithValidation(validation)) {
            console.log(chalk.green("✓ Token validated."));
            break;
        }

        if (validation.reason === 'auth_failed') {
            console.log(chalk.red("❌ Invalid token (401/403). Try again."));
            continue;
        }

        console.log(chalk.red(`❌ Token validation failed: ${validation.message || validation.status || validation.reason}. Please try again.`));
    }

    // 4. Model Selection
    const modelChoice = await select({
        message: 'Select Model Strategy:',
        choices: [
            {
                name: 'Default (Use Claude natively)',
                value: 'default',
                description: 'Standard behavior. Claude decides which model to use.'
            },
            {
                name: 'Claude AWS (-50% du prix 💰)',
                value: 'aws',
                description: 'Map models to aws-claude-haiku, aws-claude-sonnet, aws-claude-opus'
            },
            {
                name: 'GLM-5',
                value: 'claude-glm-5',
                description: 'Remplace tous les modèles par claude-glm-5'
            },
            {
                name: 'MiniMax M2.5',
                value: 'claude-minimax-m2.5',
                description: 'Remplace tous les modèles par claude-minimax-m2.5'
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
        env: env,
        shell: process.platform === 'win32'
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
}

const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url);

if (isEntrypoint) {
    main().catch((err) => {
        console.error(chalk.red(`\n❌ Unhandled error: ${err.message}`));
        process.exit(1);
    });
}

export {
    buildProxyRequestOptions,
    canProceedWithValidation,
    installClaudeCode,
    main,
    startProxyServer,
    validateToken
};
