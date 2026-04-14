#!/usr/bin/env node

import { styleText } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
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
import { password, confirm, select, Separator } from '@inquirer/prompts';
import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { isClaudeCodeInstalled, detectOS, checkGitBashOnWindows, getInstallationInstructions } from './src/detectors/claude-only.js';
import {
    DEFAULT_SERVICE,
    SERVICES,
    assessStrategy,
    assessStrategyLaunch,
    canProceedWithValidation,
    deleteStoredToken,
    getFallbackStrategy,
    getSecureStorageBackend,
    getServiceConfig,
    getServiceStrategies,
    getStoredToken,
    getStoredTokenStatus,
    getStrategyChoices,
    hasVerifiedModelIds,
    listStrategies,
    storeToken,
    validateToken
} from './src/routerlab.js';
import { startProxyServer } from './src/proxy.js';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');

function normalizeEntrypointPath(candidate) {
    if (!candidate) {
        return null;
    }

    const resolved = path.resolve(candidate);

    try {
        const realPath = fs.realpathSync.native?.(resolved) ?? fs.realpathSync(resolved);
        return process.platform === 'win32' ? realPath.toLowerCase() : realPath;
    } catch {
        return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    }
}

// --- UTILS ---

function showBanner() {
    if (!process.env.CI && !process.argv.includes('--no-clear')) console.clear();
    const primary = chalk.hex('#3b82f6');
    const accent = chalk.hex('#a855f7');
    const warm = chalk.hex('#D97757');
    const border = chalk.gray;

    console.log("");
    console.log(border("   ┌──────────────────────────────────────────────────────────┐"));
    console.log(border("   │                                                          │"));
    console.log(border("   │                 ") + chalk.bold(primary("Scio")) + chalk.bold(accent("Nos")) + chalk.bold(chalk.white("  ✕  ")) + chalk.bold(warm("Claude Code")) + border("                  │"));
    console.log(border("   │                                                          │"));
    console.log(border("   └──────────────────────────────────────────────────────────┘"));
    console.log(chalk.gray(`                                                   v${pkg.version}`));
    console.log("");
}

function showQuickDocs() {
    const commands = [
        ['claude-scionos', 'Guided launch'],
        ['claude-scionos doctor', 'Diagnose setup and RouterLab access'],
        ['claude-scionos auth login', 'Save your token securely'],
        ['claude-scionos auth login --service llm', 'Save your RouterLab LLM invitation token'],
        ['claude-scionos --list-strategies', 'Show routing options and availability']
    ];
    const commandWidth = Math.max(...commands.map(([command]) => command.length)) + 2;

    console.log(chalk.gray("Quick commands"));
    for (const [command, description] of commands) {
        console.log(`  ${chalk.cyan(command.padEnd(commandWidth, ' '))}${description}`);
    }
    console.log("");
}

function showHelp() {
    const supportedServices = Object.keys(SERVICES).join('|');
    showBanner();
    showQuickDocs();
    console.log(chalk.gray("Flags"));
    console.log(`  ${chalk.cyan("--strategy <value>")}    Preselect a strategy without opening the menu`);
    console.log(`  ${chalk.cyan(`--service <${supportedServices}>`)}  Select the RouterLab access target (${chalk.white("llm")} is invitation-only)`);
    console.log(`  ${chalk.cyan("--no-prompt")}           Do not ask any interactive question`);
    console.log(`  ${chalk.cyan("--list-strategies")}     List strategies and availability`);
    console.log(`  ${chalk.cyan("--scionos-debug")}       Show proxy and launch diagnostics`);
    console.log("");
    console.log(chalk.gray("Examples"));
    console.log(`  ${chalk.cyan("claude-scionos --strategy aws")}`);
    console.log(`  ${chalk.cyan("claude-scionos auth login --service llm")}`);
    console.log(`  ${chalk.cyan("claude-scionos --service llm --strategy claude-glm-5")}`);
    console.log(`  ${chalk.cyan('claude-scionos --strategy aws --no-prompt -p "Summarize this repo"')}`);
    console.log(`  ${chalk.cyan("claude-scionos auth test")}`);
    console.log("");
    console.log(chalk.gray("Token sources"));
    console.log(`  1. ${chalk.white("ANTHROPIC_AUTH_TOKEN")} environment variable`);
    console.log(`  2. secure local storage via ${chalk.white("claude-scionos auth login")} or ${chalk.white("claude-scionos auth login --service llm")}`);
    console.log(`  3. manual prompt in guided mode`);
    console.log("");
}

function showSection(title, lines) {
    console.log(chalk.gray(title));
    for (const line of lines) {
        console.log(`  ${line}`);
    }
    console.log("");
}

function statusBadge(level) {
    if (level === 'ok') return chalk.green('OK');
    if (level === 'warn') return chalk.yellow('WARN');
    if (level === 'error') return chalk.red('FAIL');
    return chalk.gray('INFO');
}

function showStatus(label, level, detail) {
    const padded = label.padEnd(20, ' ');
    console.log(`  ${statusBadge(level)}  ${chalk.white(padded)} ${chalk.gray(detail)}`);
}

function getStrategyIndicator(strategyValue, modelIds, serviceValue) {
    if (!hasVerifiedModelIds(modelIds)) {
        return chalk.gray('●');
    }

    const launchReadiness = assessStrategyLaunch(strategyValue, modelIds, serviceValue);
    return launchReadiness.ready ? chalk.green('●') : chalk.red('●');
}

function getStrategyMenuLabel(strategyValue) {
    if (strategyValue === 'aws') {
        return '💰 aws 50%';
    }

    return strategyValue;
}

function normalizeStrategyValue(strategy) {
    return strategy?.trim() || null;
}

function normalizeServiceValue(service) {
    return service?.trim()?.toLowerCase() || DEFAULT_SERVICE;
}

function resolveSelectedService(serviceValue) {
    const service = getServiceConfig(serviceValue);
    if (service) {
        return service;
    }

    const supported = Object.keys(SERVICES).join(', ');
    throw new Error(`Unknown service "${serviceValue}". Supported values: ${supported}.`);
}

function parseWrapperArgs(argv) {
    const parsed = {
        authAction: 'status',
        claudeArgs: [],
        command: null,
        debug: false,
        help: false,
        listStrategies: false,
        noPrompt: false,
        service: normalizeServiceValue(process.env.SCIONOS_SERVICE),
        strategy: null,
        version: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];

        if ((arg === 'doctor' || arg === 'auth') && parsed.command === null && parsed.claudeArgs.length === 0) {
            parsed.command = arg;
            if (arg === 'auth') {
                const maybeAction = argv[index + 1];
                if (maybeAction && !maybeAction.startsWith('-')) {
                    parsed.authAction = maybeAction;
                    index += 1;
                }
            }
            continue;
        }

        if (arg === '--help' || arg === '-h' || arg === 'help') {
            parsed.help = true;
            continue;
        }

        if (arg === '--version' || arg === '-v') {
            parsed.version = true;
            continue;
        }

        if (arg === '--strategy') {
            parsed.strategy = normalizeStrategyValue(argv[index + 1]);
            index += 1;
            continue;
        }

        if (arg === '--service') {
            parsed.service = normalizeServiceValue(argv[index + 1]);
            index += 1;
            continue;
        }

        if (arg.startsWith('--strategy=')) {
            parsed.strategy = normalizeStrategyValue(arg.slice('--strategy='.length));
            continue;
        }

        if (arg.startsWith('--service=')) {
            parsed.service = normalizeServiceValue(arg.slice('--service='.length));
            continue;
        }

        if (arg === '--no-prompt') {
            parsed.noPrompt = true;
            continue;
        }

        if (arg === '--list-strategies') {
            parsed.listStrategies = true;
            continue;
        }

        if (arg === '--scionos-debug') {
            parsed.debug = true;
            continue;
        }

        parsed.claudeArgs.push(arg);
    }

    return parsed;
}

function getEnvironmentToken() {
    return process.env.ANTHROPIC_AUTH_TOKEN?.trim() || null;
}

function getAvailableTokenCandidate(serviceValue) {
    const envToken = getEnvironmentToken();
    if (envToken) {
        return { token: envToken, source: 'environment' };
    }

    try {
        const storedToken = getStoredToken(serviceValue);
        if (storedToken) {
            return { token: storedToken, source: 'secure-store' };
        }
    } catch {
        return { token: null, source: 'secure-store-error' };
    }

    return { token: null, source: 'none' };
}

function formatTokenSource(source) {
    if (source === 'environment') return 'environment';
    if (source === 'secure-store') return 'secure storage';
    if (source === 'manual') return 'manual input';
    return 'not available';
}

function installClaudeCode() {
    return spawnSync('npm', ['install', '-g', '@anthropic-ai/claude-code'], {
        stdio: 'inherit',
        shell: process.platform === 'win32'
    });
}

async function promptAndValidateToken(promptMessage, serviceConfig) {
    while (true) {
        if (serviceConfig.tokenHelpUrl) {
            console.log(chalk.blueBright(`To retrieve your token, visit: ${serviceConfig.tokenHelpUrl}`));
        } else if (serviceConfig.tokenHelpMessage) {
            console.log(chalk.blueBright(serviceConfig.tokenHelpMessage));
        }

        const token = await password({
            message: promptMessage,
            mask: '*'
        });

        console.log(chalk.gray("Validating token..."));
        const validation = await validateToken(token, { baseUrl: serviceConfig.baseUrl });
        if (canProceedWithValidation(validation)) {
            console.log(chalk.green("✓ Token validated."));
            return { token, validation };
        }

        console.log(chalk.red(`❌ Token validation failed: ${validation.message || validation.status || validation.reason}. Try again.`));
    }
}

async function maybeStoreToken(token, serviceConfig, replaceExisting = false) {
    const storage = getSecureStorageBackend();
    if (!storage.supported) {
        return;
    }

    const shouldStore = await confirm({
        message: replaceExisting
            ? `Replace the token stored in ${storage.backend}?`
            : `Save this token securely in ${storage.backend} for future launches?`,
        default: true
    });

    if (!shouldStore) {
        return;
    }

    storeToken(token, serviceConfig.value);
    console.log(chalk.green(`✓ Token saved securely in ${storage.backend}.`));
}

async function resolveLaunchToken(noPrompt, serviceConfig) {
    const candidate = getAvailableTokenCandidate(serviceConfig.value);

    if (candidate.token) {
        const validation = await validateToken(candidate.token, { baseUrl: serviceConfig.baseUrl });
        if (canProceedWithValidation(validation)) {
            return {
                token: candidate.token,
                source: candidate.source,
                validation
            };
        }

        const sourceLabel = formatTokenSource(candidate.source);
        if (noPrompt) {
            throw new Error(`${sourceLabel} token is invalid: ${validation.message || validation.status || validation.reason}`);
        }

        console.log(chalk.yellow(`⚠ The ${sourceLabel} token is invalid. Please enter a new token.`));
        const prompted = await promptAndValidateToken(`Please enter your ${serviceConfig.tokenPromptLabel} token:`, serviceConfig);
        await maybeStoreToken(prompted.token, serviceConfig, candidate.source === 'secure-store');
        return {
            token: prompted.token,
            source: 'manual',
            validation: prompted.validation
        };
    }

    if (noPrompt) {
        throw new Error(`ANTHROPIC_AUTH_TOKEN or a securely stored token is required when using --no-prompt for ${serviceConfig.tokenPromptLabel}`);
    }

    const prompted = await promptAndValidateToken(`Please enter your ${serviceConfig.tokenPromptLabel} token:`, serviceConfig);
    await maybeStoreToken(prompted.token, serviceConfig);
    return {
        token: prompted.token,
        source: 'manual',
        validation: prompted.validation
    };
}

async function resolveStrategyChoice(parsed, modelIds, serviceConfig) {
    const finalizeChoice = (selected) => {
        const selectedLaunchReadiness = assessStrategyLaunch(selected, modelIds, serviceConfig.value);
        const resolvedStrategy = getFallbackStrategy(selected, modelIds, serviceConfig.value);

        if (!resolvedStrategy) {
            throw new Error(`Strategy "${selected}" cannot support the default Claude Code launch on ${serviceConfig.availabilityLabel}. ${selectedLaunchReadiness.note}`);
        }

        if (hasVerifiedModelIds(modelIds)) {
            const availability = assessStrategy(selected, modelIds, serviceConfig.value);
            if (availability.level === 'partial') {
                console.log(chalk.yellow(`⚠ Strategy "${selected}" is only partially available on ${serviceConfig.availabilityLabel}.`));
            }
        }

        return resolvedStrategy;
    };

    if (parsed.strategy) {
        const strategy = getServiceStrategies(serviceConfig.value).find((entry) => entry.value === parsed.strategy);
        if (!strategy) {
            throw new Error(`Unknown strategy "${parsed.strategy}". Use --list-strategies to inspect the supported values.`);
        }

        return finalizeChoice(strategy.value);
    }

    if (parsed.noPrompt) {
        return finalizeChoice('default');
    }

    const strategyChoices = getStrategyChoices(modelIds, serviceConfig.value).map((choice) => {
        const launchReadiness = assessStrategyLaunch(choice.value, modelIds, serviceConfig.value);
        const disabled = hasVerifiedModelIds(modelIds) && !launchReadiness.ready ? launchReadiness.note : false;

        return {
            ...choice,
            disabled,
            name: `${getStrategyIndicator(choice.value, modelIds, serviceConfig.value)} ${getStrategyMenuLabel(choice.value)}`,
            short: getStrategyMenuLabel(choice.value)
        };
    });

    if (hasVerifiedModelIds(modelIds) && strategyChoices.every((choice) => choice.disabled)) {
        throw new Error(`No launchable strategy is available on ${serviceConfig.availabilityLabel}.`);
    }

    const spacedStrategyChoices = strategyChoices.flatMap((choice, index) => (
        index === strategyChoices.length - 1 ? [choice] : [choice, new Separator(' ')]
    ));

    const selected = await select({
        message: 'Select Model Strategy:',
        choices: spacedStrategyChoices,
        pageSize: spacedStrategyChoices.length
    });

    return finalizeChoice(selected);
}

function showStrategies(modelIds = null, serviceConfig) {
    const strategies = listStrategies(modelIds, serviceConfig.value);
    showSection('Strategies', strategies.map((strategy) => {
        const indicator = getStrategyIndicator(strategy.value, modelIds, serviceConfig.value);
        const state = !hasVerifiedModelIds(modelIds)
            ? chalk.gray('Unknown')
            : assessStrategyLaunch(strategy.value, modelIds, serviceConfig.value).ready
                ? chalk.green('Ready')
                : chalk.red('Blocked');
        return `${indicator} ${chalk.white(strategy.name)}  ${state}  ${chalk.gray(`(${strategy.value})`)}\n    ${strategy.description} ${strategy.availability.note}`.trimEnd();
    }));
}

async function runAuthCommand(action, serviceConfig) {
    showBanner();
    const storage = getSecureStorageBackend();
    const envToken = getEnvironmentToken();
    const storedStatus = getStoredTokenStatus(serviceConfig.value);

    if (action === 'status') {
        showSection('Authentication', [
            `${chalk.white('Service:')} ${serviceConfig.label}`,
            `${chalk.white('Secure backend:')} ${storage.supported ? storage.backend : `${storage.backend} (${storage.reason})`}`,
            `${chalk.white('Stored token:')} ${storedStatus.stored ? 'available' : 'not stored'}`,
            `${chalk.white('Environment token:')} ${envToken ? 'available' : 'not set'}`
        ]);
        return;
    }

    if (action === 'logout') {
        const removed = deleteStoredToken(serviceConfig.value);
        console.log(removed ? chalk.green('✓ Stored token removed.') : chalk.yellow('⚠ No stored token was found.'));
        return;
    }

    if (action === 'login' || action === 'change') {
        if (!storage.supported) {
            throw new Error(`Secure storage is unavailable: ${storage.reason || storage.backend}`);
        }

        const prompted = await promptAndValidateToken(`Enter the ${serviceConfig.tokenPromptLabel} token to save securely:`, serviceConfig);
        storeToken(prompted.token, serviceConfig.value);
        console.log(chalk.green(`✓ Token saved securely in ${storage.backend}.`));
        return;
    }

    if (action === 'test') {
        const candidate = getAvailableTokenCandidate(serviceConfig.value);
        if (!candidate.token) {
            console.log(chalk.yellow('⚠ No environment token or stored token is available.'));
            return;
        }

        const validation = await validateToken(candidate.token, { baseUrl: serviceConfig.baseUrl });
        console.log(canProceedWithValidation(validation)
            ? chalk.green(`✓ ${formatTokenSource(candidate.source)} token is valid.`)
            : chalk.red(`❌ ${formatTokenSource(candidate.source)} token is invalid: ${validation.message || validation.status || validation.reason}`));

        if (canProceedWithValidation(validation)) {
            showStrategies(validation.models, serviceConfig);
        }
        return;
    }

    throw new Error(`Unknown auth action "${action}". Use: login, status, change, logout, test.`);
}

async function runDoctor(serviceConfig) {
    showBanner();
    const osInfo = detectOS();
    const claudeStatus = isClaudeCodeInstalled();
    const storage = getSecureStorageBackend();
    const storedStatus = getStoredTokenStatus(serviceConfig.value);
    const gitBashStatus = process.platform === 'win32'
        ? checkGitBashOnWindows()
        : { available: true, message: 'Not required on non-Windows systems' };

    console.log(chalk.gray('System Diagnostics'));
    showStatus('Service target', 'ok', serviceConfig.label);
    showStatus('Platform', 'ok', `${osInfo.type} / ${osInfo.shell} / ${osInfo.arch}`);
    showStatus('Node', 'ok', process.version);
    showStatus('Claude Code', claudeStatus.installed ? 'ok' : 'error', claudeStatus.installed ? claudeStatus.cliPath : 'CLI not found');
    if (process.platform === 'win32') {
        showStatus('Git Bash', gitBashStatus.available ? 'ok' : 'error', gitBashStatus.message);
    }
    showStatus('Secure storage', storage.supported ? 'ok' : 'warn', storage.supported ? storage.backend : storage.reason);
    showStatus('Stored token', storedStatus.stored ? 'ok' : 'warn', storedStatus.stored ? 'available' : 'not stored');
    showStatus('Env token', getEnvironmentToken() ? 'ok' : 'warn', getEnvironmentToken() ? 'available' : 'not set');
    console.log('');

    const candidate = getAvailableTokenCandidate(serviceConfig.value);
    if (!candidate.token) {
        showStatus(`${serviceConfig.tokenPromptLabel} auth`, 'warn', 'Skipped: no environment or stored token available');
        console.log('');
        return;
    }

    const validation = await validateToken(candidate.token, { baseUrl: serviceConfig.baseUrl });
    showStatus(`${serviceConfig.tokenPromptLabel} auth`, canProceedWithValidation(validation) ? 'ok' : 'error', canProceedWithValidation(validation)
        ? `validated via ${formatTokenSource(candidate.source)} token`
        : validation.message || validation.status || validation.reason);
    console.log('');

    if (canProceedWithValidation(validation)) {
        showStrategies(validation.models, serviceConfig);
    }
}

async function runListStrategies(serviceConfig) {
    showBanner();
    const candidate = getAvailableTokenCandidate(serviceConfig.value);
    if (!candidate.token) {
        showStrategies(null, serviceConfig);
        console.log(chalk.gray(`Tip: save a token with \`claude-scionos auth login${serviceConfig.value === DEFAULT_SERVICE ? '' : ` --service ${serviceConfig.value}`}\` to verify availability live.`));
        return;
    }

    const validation = await validateToken(candidate.token, { baseUrl: serviceConfig.baseUrl });
    if (canProceedWithValidation(validation)) {
        showStrategies(validation.models, serviceConfig);
        return;
    }

    console.log(chalk.yellow(`⚠ Unable to verify strategy availability with the ${formatTokenSource(candidate.source)} token.`));
    showStrategies(null, serviceConfig);
}

async function ensureClaudeInstallation(osInfo, interactive) {
    let claudeStatus = isClaudeCodeInstalled();

    if (claudeStatus.installed) {
        return claudeStatus;
    }

    if (!interactive) {
        throw new Error('Claude Code CLI not found. Run in guided mode or install it globally first.');
    }

    console.error(chalk.redBright('\n❌ Claude Code CLI not found'));
    const shouldInstall = await confirm({
        message: 'Claude Code CLI is not installed. Install globally via npm?',
        default: true
    });

    if (!shouldInstall) {
        throw new Error(getInstallationInstructions(osInfo));
    }

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
        throw new Error('Installation finished, but executable not found immediately. Restart terminal recommended.');
    }

    return claudeStatus;
}

async function main() {
    const parsed = parseWrapperArgs(process.argv.slice(2));

    if (parsed.version) {
        console.log(pkg.version);
        process.exit(0);
    }

    if (parsed.help) {
        showHelp();
        process.exit(0);
    }

    const serviceConfig = resolveSelectedService(parsed.service);

    if (parsed.command === 'auth') {
        await runAuthCommand(parsed.authAction, serviceConfig);
        process.exit(0);
    }

    if (parsed.command === 'doctor') {
        await runDoctor(serviceConfig);
        process.exit(0);
    }

    if (parsed.listStrategies) {
        await runListStrategies(serviceConfig);
        process.exit(0);
    }

    const interactive = !parsed.noPrompt;
    const isDebug = parsed.debug;

    if (interactive) {
        showBanner();
        showQuickDocs();
    }

    if (isDebug && interactive) console.log(chalk.cyan('🔍 Checking system configuration...'));
    const osInfo = detectOS();
    const claudeStatus = await ensureClaudeInstallation(osInfo, interactive);

    if (process.platform === 'win32') {
        const gitBashStatus = checkGitBashOnWindows();
        if (!gitBashStatus.available) {
            throw new Error('Git Bash is required on Windows. Please install Git for Windows first.');
        }
    }

    const { token, source, validation } = await resolveLaunchToken(parsed.noPrompt, serviceConfig);
    if (interactive) {
        console.log(chalk.green(`✓ Using ${formatTokenSource(source)} token.`));
    }

    const modelChoice = await resolveStrategyChoice(parsed, validation.models, serviceConfig);
    let finalBaseUrl = serviceConfig.baseUrl;
    let proxyServer = null;

    if (modelChoice !== 'default') {
        if (interactive) {
            console.log(chalk.magenta(`\n🔮 Starting Local Proxy to map models to ${chalk.bold(modelChoice)}...`));
        }

        const proxyInfo = await startProxyServer(modelChoice, token, {
            baseUrl: serviceConfig.baseUrl,
            debug: isDebug,
            onDebug: (message) => console.log(chalk.yellow(message)),
            onError: (message) => console.error(chalk.red(message))
        });
        proxyServer = proxyInfo.server;
        finalBaseUrl = proxyInfo.url; // e.g. http://127.0.0.1:54321
        if (interactive && isDebug) console.log(chalk.gray(`✓ Proxy listening on ${finalBaseUrl}`));
    }

    const env = {
        ...process.env,
        ANTHROPIC_BASE_URL: finalBaseUrl,
        ANTHROPIC_AUTH_TOKEN: token,
        ANTHROPIC_API_KEY: "" // Force empty
    };

    if (interactive) {
        showSection('Launch Summary', [
            `${chalk.white('Service:')} ${serviceConfig.label}`,
            `${chalk.white('Token source:')} ${formatTokenSource(source)}`,
            `${chalk.white('Strategy:')} ${modelChoice}`,
            `${chalk.white('Endpoint:')} ${finalBaseUrl}`,
            `${chalk.white('Mode:')} ${parsed.noPrompt ? 'non-interactive' : 'guided'}`
        ]);
        console.log(chalk.green(`🚀 Launching Claude Code [${modelChoice}]...\n`));
    }

    const child = spawn(claudeStatus.cliPath, parsed.claudeArgs, {
        stdio: 'inherit',
        env: env,
        shell: process.platform === 'win32'
    });

    const cleanup = () => {
        if (proxyServer) {
            if (interactive && isDebug) console.log(chalk.gray('\nStopping proxy server...'));
            proxyServer.close();
        }
    };

    child.on('exit', (code) => {
        cleanup();
        process.exit(code ?? 0);
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
        // Claude handles SIGINT; we keep the wrapper alive for cleanup on child exit.
    });

    process.on('SIGTERM', () => {
        if (child) child.kill('SIGTERM');
        cleanup();
        process.exit(0);
    });
}

const isEntrypoint = normalizeEntrypointPath(process.argv[1]) === normalizeEntrypointPath(fileURLToPath(import.meta.url));

if (isEntrypoint) {
    main().catch((err) => {
        console.error(chalk.red(`\n❌ ${err.message}`));
        process.exit(1);
    });
}

export {
    canProceedWithValidation,
    installClaudeCode,
    main,
    normalizeEntrypointPath,
    validateToken
};
