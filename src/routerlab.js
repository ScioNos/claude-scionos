import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const BASE_URL = 'https://routerlab.ch';
const TOKEN_HELP_URL = `${BASE_URL}/keys`;
const DEFAULT_ANTHROPIC_VERSION = '2023-06-01';
const SECURE_STORAGE_SERVICE = 'claude-scionos';
const SECURE_STORAGE_ACCOUNT = 'routerlab-token';
const WINDOWS_TOKEN_FILE = path.join(os.homedir(), '.claude-scionos', 'routerlab-token.secure.txt');

const STRATEGIES = [
  {
    value: 'default',
    name: 'Default',
    description: 'Uses Claude natively without a local proxy.',
    selectionName: 'Default (Use Claude natively)',
    selectionDescription: 'Standard behavior. Claude decides which model to use.',
  },
  {
    value: 'aws',
    name: 'Claude AWS',
    description: 'Maps Claude requests to AWS-backed Claude variants.',
    selectionName: 'Claude AWS (-50% du prix 💰)',
    selectionDescription: 'Map models to aws-claude-haiku, aws-claude-sonnet, aws-claude-opus.',
    mappedModels: [
      'aws-claude-haiku-4-5-20251001',
      'aws-claude-sonnet-4-6',
      'aws-claude-opus-4-6',
    ],
  },
  {
    value: 'claude-glm-5',
    name: 'GLM-5',
    description: 'Forces all requests to claude-glm-5.',
    selectionDescription: 'Forces all requests to claude-glm-5.',
    mappedModels: ['claude-glm-5'],
  },
  {
    value: 'claude-minimax-m2.5',
    name: 'MiniMax M2.5',
    description: 'Forces all requests to claude-minimax-m2.5.',
    selectionDescription: 'Forces all requests to claude-minimax-m2.5.',
    mappedModels: ['claude-minimax-m2.5'],
  },
];

async function fetchModels(apiKey, options = {}) {
  const {
    baseUrl = BASE_URL,
    anthropicVersion = DEFAULT_ANTHROPIC_VERSION,
    timeoutMs = 30000,
  } = options;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(`${baseUrl}/v1/models`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': anthropicVersion,
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      return {
        valid: true,
        models: payload ? extractModelIds(payload) : null,
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {valid: false, reason: 'auth_failed'};
    }

    return {
      valid: false,
      reason: 'server_error',
      status: response.status,
      statusText: response.statusText,
      message: `Server responded with ${response.status} ${response.statusText}`.trim(),
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      return {valid: false, reason: 'timeout', message: `Request timed out after ${Math.round(timeoutMs / 1000)}s`};
    }

    return {valid: false, reason: 'network_error', message: error.message};
  }
}

async function validateToken(apiKey, options = {}) {
  return fetchModels(apiKey, options);
}

function extractModelIds(payload) {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload.map((entry) => entry?.id ?? entry?.name ?? entry).filter(Boolean);
  }

  if (Array.isArray(payload.data)) {
    return payload.data.map((entry) => entry?.id ?? entry?.name ?? entry).filter(Boolean);
  }

  if (Array.isArray(payload.models)) {
    return payload.models.map((entry) => entry?.id ?? entry?.name ?? entry).filter(Boolean);
  }

  return [];
}

function canProceedWithValidation(validation) {
  return validation.valid === true;
}

function findStrategy(strategyValue) {
  return STRATEGIES.find((strategy) => strategy.value === strategyValue) ?? null;
}

function assessStrategy(strategyValue, modelIds = []) {
  const strategy = findStrategy(strategyValue);
  if (!strategy) {
    return {
      available: false,
      level: 'unavailable',
      note: 'Unknown strategy.',
      strategy: null,
    };
  }

  if (strategy.value === 'default') {
    return {
      available: true,
      level: 'ready',
      note: 'Always available.',
      strategy,
    };
  }

  if (!Array.isArray(modelIds)) {
    return {
      available: true,
      level: 'unknown',
      note: 'Availability not verified.',
      strategy,
    };
  }

  const availableModels = new Set(modelIds);
  const presentCount = strategy.mappedModels.filter((model) => availableModels.has(model)).length;

  if (presentCount === strategy.mappedModels.length) {
    return {
      available: true,
      level: 'ready',
      note: 'Verified on RouterLab.',
      strategy,
    };
  }

  if (presentCount > 0) {
    return {
      available: true,
      level: 'partial',
      note: 'Partially available on RouterLab.',
      strategy,
    };
  }

  return {
    available: false,
    level: 'unavailable',
    note: 'Not reported by RouterLab.',
    strategy,
  };
}

function listStrategies(modelIds = []) {
  return STRATEGIES.map((strategy) => ({
    ...strategy,
    availability: assessStrategy(strategy.value, modelIds),
  }));
}

function getFallbackStrategy(strategyValue, modelIds = []) {
  const availability = assessStrategy(strategyValue, modelIds);
  if (availability.level === 'unavailable') {
    return 'default';
  }

  return strategyValue;
}

function getStrategyChoices(modelIds = []) {
  return listStrategies(modelIds).map((strategy) => ({
    name: `${strategy.selectionName ?? strategy.name}${strategy.availability.level === 'ready' ? '  [Ready]' : strategy.availability.level === 'partial' ? '  [Partial]' : strategy.availability.level === 'unknown' ? '  [Unknown]' : '  [Unavailable]'}`,
    value: strategy.value,
    description: `${strategy.selectionDescription ?? strategy.description} ${strategy.availability.note}`.trim(),
  }));
}

function getSecureStorageBackend() {
  if (process.platform === 'win32') {
    return {supported: true, backend: 'Windows DPAPI'};
  }

  if (process.platform === 'darwin') {
    return {supported: true, backend: 'macOS Keychain'};
  }

  if (process.platform === 'linux') {
    return commandExists('secret-tool')
      ? {supported: true, backend: 'Linux Secret Service'}
      : {supported: false, backend: 'Linux Secret Service', reason: '`secret-tool` not found'};
  }

  return {supported: false, backend: 'Unknown', reason: 'Unsupported operating system'};
}

function commandExists(command) {
  const result = spawnSync(command, ['--help'], {encoding: 'utf8'});
  return !result.error;
}

function runPowerShell(command, env = {}) {
  const powershell = process.env.SystemRoot
    ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe';

  const result = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
    },
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'PowerShell command failed').trim());
  }

  return result.stdout.trim();
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    input: options.input,
    env: options.env,
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}

function storeToken(token) {
  const storage = getSecureStorageBackend();
  if (!storage.supported) {
    throw new Error(storage.reason || 'Secure storage is not available on this machine');
  }

  if (process.platform === 'win32') {
    fs.mkdirSync(path.dirname(WINDOWS_TOKEN_FILE), {recursive: true});
    runPowerShell(
      '$secure = ConvertTo-SecureString $env:SCIONOS_TOKEN -AsPlainText -Force; $encrypted = ConvertFrom-SecureString $secure; Set-Content -Path $env:SCIONOS_TOKEN_FILE -Value $encrypted -NoNewline',
      {
        SCIONOS_TOKEN: token,
        SCIONOS_TOKEN_FILE: WINDOWS_TOKEN_FILE,
      },
    );
    return storage;
  }

  if (process.platform === 'darwin') {
    const result = runCommand('security', [
      'add-generic-password',
      '-U',
      '-a',
      SECURE_STORAGE_ACCOUNT,
      '-s',
      SECURE_STORAGE_SERVICE,
      '-w',
      token,
    ]);

    if (result.status !== 0) {
      throw new Error((result.stderr || result.stdout || 'Unable to store token in Keychain').trim());
    }

    return storage;
  }

  const result = runCommand('secret-tool', [
    'store',
    '--label=RouterLab Token',
    'service',
    SECURE_STORAGE_SERVICE,
    'account',
    SECURE_STORAGE_ACCOUNT,
  ], {
    input: token,
  });

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'Unable to store token in Secret Service').trim());
  }

  return storage;
}

function getStoredToken() {
  const storage = getSecureStorageBackend();
  if (!storage.supported) {
    return null;
  }

  if (process.platform === 'win32') {
    if (!fs.existsSync(WINDOWS_TOKEN_FILE)) {
      return null;
    }

    const token = runPowerShell(
      '$secure = Get-Content -Path $env:SCIONOS_TOKEN_FILE -Raw | ConvertTo-SecureString; $ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure); try { [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }',
      {
        SCIONOS_TOKEN_FILE: WINDOWS_TOKEN_FILE,
      },
    );
    return token || null;
  }

  if (process.platform === 'darwin') {
    const result = runCommand('security', [
      'find-generic-password',
      '-a',
      SECURE_STORAGE_ACCOUNT,
      '-s',
      SECURE_STORAGE_SERVICE,
      '-w',
    ]);
    return result.status === 0 ? result.stdout.trim() || null : null;
  }

  const result = runCommand('secret-tool', [
    'lookup',
    'service',
    SECURE_STORAGE_SERVICE,
    'account',
    SECURE_STORAGE_ACCOUNT,
  ]);
  return result.status === 0 ? result.stdout.trim() || null : null;
}

function deleteStoredToken() {
  const storage = getSecureStorageBackend();
  if (!storage.supported) {
    return false;
  }

  if (process.platform === 'win32') {
    if (!fs.existsSync(WINDOWS_TOKEN_FILE)) {
      return false;
    }

    fs.unlinkSync(WINDOWS_TOKEN_FILE);
    return true;
  }

  if (process.platform === 'darwin') {
    const result = runCommand('security', [
      'delete-generic-password',
      '-a',
      SECURE_STORAGE_ACCOUNT,
      '-s',
      SECURE_STORAGE_SERVICE,
    ]);
    return result.status === 0;
  }

  const result = runCommand('secret-tool', [
    'clear',
    'service',
    SECURE_STORAGE_SERVICE,
    'account',
    SECURE_STORAGE_ACCOUNT,
  ]);
  return result.status === 0;
}

function getStoredTokenStatus() {
  const storage = getSecureStorageBackend();
  const storedToken = getStoredToken();
  return {
    ...storage,
    stored: Boolean(storedToken),
  };
}

export {
  BASE_URL,
  DEFAULT_ANTHROPIC_VERSION,
  SECURE_STORAGE_ACCOUNT,
  SECURE_STORAGE_SERVICE,
  STRATEGIES,
  TOKEN_HELP_URL,
  assessStrategy,
  canProceedWithValidation,
  deleteStoredToken,
  fetchModels,
  getFallbackStrategy,
  getSecureStorageBackend,
  getStoredToken,
  getStoredTokenStatus,
  getStrategyChoices,
  listStrategies,
  storeToken,
  validateToken,
};
