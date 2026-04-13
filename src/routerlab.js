import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const SERVICES = {
  routerlab: {
    value: 'routerlab',
    label: 'RouterLab',
    availabilityLabel: 'RouterLab',
    tokenPromptLabel: 'RouterLab',
    baseUrl: 'https://routerlab.ch',
    tokenHelpUrl: 'https://routerlab.ch/keys',
    tokenHelpMessage: null,
    secureStorageAccount: 'routerlab-token',
    secureStorageLabel: 'RouterLab Token',
    secureStorageFileName: 'routerlab-token.secure.txt',
    strategyValues: ['default', 'aws', 'claude-gpt-5.4', 'claude-glm-5', 'claude-minimax-m2.5'],
  },
  llm: {
    value: 'llm',
    label: 'LLM (invitation only)',
    availabilityLabel: 'RouterLab LLM',
    tokenPromptLabel: 'RouterLab LLM',
    baseUrl: 'https://llm.routerlab.ch',
    tokenHelpUrl: null,
    tokenHelpMessage: 'Use the invitation token provided for RouterLab LLM.',
    secureStorageAccount: 'routerlab-llm-token',
    secureStorageLabel: 'RouterLab LLM Token',
    secureStorageFileName: 'routerlab-llm-token.secure.txt',
    strategyValues: ['claude-glm-5', 'claude-gpt-5.4', 'claude-qwen3.6-plus'],
  },
};
const DEFAULT_SERVICE = 'routerlab';
const BASE_URL = SERVICES[DEFAULT_SERVICE].baseUrl;
const TOKEN_HELP_URL = SERVICES[DEFAULT_SERVICE].tokenHelpUrl;
const DEFAULT_ANTHROPIC_VERSION = '2023-06-01';
const SECURE_STORAGE_SERVICE = 'claude-scionos';
const SECURE_STORAGE_ACCOUNT = SERVICES[DEFAULT_SERVICE].secureStorageAccount;
const DEFAULT_CLAUDE_MODELS = [
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6',
  'claude-opus-4-6',
];
const AWS_CLAUDE_MODELS = [
  'aws-claude-haiku-4-5-20251001',
  'aws-claude-sonnet-4-6',
  'aws-claude-opus-4-6',
];

const STRATEGIES = [
  {
    value: 'default',
    name: 'Default',
    description: 'Uses Claude natively without a local proxy.',
    selectionName: 'Default (Use Claude natively)',
    selectionDescription: 'Standard behavior. Claude decides which model to use.',
    requiredModels: DEFAULT_CLAUDE_MODELS,
  },
  {
    value: 'aws',
    name: 'Claude AWS',
    description: 'Maps Claude requests to AWS-backed Claude variants.',
    selectionName: 'Claude AWS (-50% du prix 💰)',
    selectionDescription: 'Map models to aws-claude-haiku, aws-claude-sonnet, aws-claude-opus.',
    requiredModels: AWS_CLAUDE_MODELS,
    mappedModels: AWS_CLAUDE_MODELS,
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
  {
    value: 'claude-gpt-5.4',
    name: 'GPT-5.4',
    description: 'Forces all requests to claude-gpt-5.4.',
    selectionDescription: 'Forces all requests to claude-gpt-5.4.',
    mappedModels: ['claude-gpt-5.4'],
  },
  {
    value: 'claude-qwen3.6-plus',
    name: 'Qwen3.6 Plus',
    description: 'Forces all requests to claude-qwen3.6-plus.',
    selectionDescription: 'Forces all requests to claude-qwen3.6-plus.',
    mappedModels: ['claude-qwen3.6-plus'],
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

function normalizeServiceValue(serviceValue) {
  return serviceValue?.trim()?.toLowerCase() || DEFAULT_SERVICE;
}

function getServiceConfig(serviceValue = DEFAULT_SERVICE) {
  return SERVICES[normalizeServiceValue(serviceValue)] ?? null;
}

function getServiceLabel(serviceValue = DEFAULT_SERVICE) {
  return getServiceConfig(serviceValue)?.availabilityLabel ?? 'RouterLab';
}

function getWindowsTokenFile(serviceValue = DEFAULT_SERVICE) {
  const service = getServiceConfig(serviceValue);
  if (!service) {
    throw new Error(`Unknown service "${serviceValue}"`);
  }

  return path.join(os.homedir(), '.claude-scionos', service.secureStorageFileName);
}

function hasNonEmptyWindowsTokenFile(tokenFile) {
  try {
    return fs.statSync(tokenFile).size > 0;
  } catch {
    return false;
  }
}

function encodeTokenForPowerShell(token) {
  return Buffer.from(token, 'utf8').toString('base64');
}

function getServiceStrategies(serviceValue = DEFAULT_SERVICE) {
  const service = getServiceConfig(serviceValue);
  if (!service?.strategyValues?.length) {
    return [];
  }

  return service.strategyValues
    .map((strategyValue) => STRATEGIES.find((strategy) => strategy.value === strategyValue) ?? null)
    .filter(Boolean);
}

function findStrategy(strategyValue, serviceValue = DEFAULT_SERVICE) {
  return getServiceStrategies(serviceValue).find((strategy) => strategy.value === strategyValue) ?? null;
}

function getRequiredModels(strategy) {
  return strategy?.requiredModels ?? strategy?.mappedModels ?? [];
}

function hasVerifiedModelIds(modelIds) {
  return Array.isArray(modelIds) && modelIds.length > 0;
}

function hasExploitableModelIds(modelIds, serviceValue = DEFAULT_SERVICE) {
  if (!hasVerifiedModelIds(modelIds)) {
    return false;
  }

  const serviceStrategies = getServiceStrategies(serviceValue);
  const knownModelIds = new Set(
    serviceStrategies.flatMap((strategy) => getRequiredModels(strategy)),
  );

  if (knownModelIds.size === 0) {
    return false;
  }

  return modelIds.some((modelId) => knownModelIds.has(modelId));
}

function assessStrategy(strategyValue, modelIds = [], serviceValue = DEFAULT_SERVICE) {
  const serviceLabel = getServiceLabel(serviceValue);
  const strategy = findStrategy(strategyValue, serviceValue);
  if (!strategy) {
    return {
      available: false,
      level: 'unavailable',
      note: 'Unknown strategy.',
      strategy: null,
    };
  }

  const requiredModels = getRequiredModels(strategy);
  if (!requiredModels.length) {
    return {
      available: true,
      level: 'ready',
      note: 'Always available.',
      strategy,
    };
  }

  if (!hasExploitableModelIds(modelIds, serviceValue)) {
    return {
      available: true,
      level: 'unknown',
      note: 'Availability not verified.',
      strategy,
    };
  }

  const availableModels = new Set(modelIds);
  const presentCount = requiredModels.filter((model) => availableModels.has(model)).length;

  if (presentCount === requiredModels.length) {
    return {
      available: true,
      level: 'ready',
      note: `Verified on ${serviceLabel}.`,
      strategy,
    };
  }

  if (presentCount > 0) {
    return {
      available: true,
      level: 'partial',
      note: `Partially available on ${serviceLabel}.`,
      strategy,
    };
  }

  return {
    available: false,
    level: 'unavailable',
    note: `Not reported by ${serviceLabel}.`,
    strategy,
  };
}

function listStrategies(modelIds = [], serviceValue = DEFAULT_SERVICE) {
  return getServiceStrategies(serviceValue).map((strategy) => ({
    ...strategy,
    availability: assessStrategy(strategy.value, modelIds, serviceValue),
  }));
}

function assessStrategyLaunch(strategyValue, modelIds = [], serviceValue = DEFAULT_SERVICE) {
  const availability = assessStrategy(strategyValue, modelIds, serviceValue);
  const serviceLabel = getServiceLabel(serviceValue);
  const requiredModels = getRequiredModels(availability.strategy);

  if (!availability.strategy) {
    return {
      ready: false,
      note: 'Unknown strategy.',
      missingModels: [],
      requiredModels: [],
      availability,
    };
  }

  if (!requiredModels.length || !hasExploitableModelIds(modelIds, serviceValue)) {
    return {
      ready: availability.level !== 'unavailable',
      note: availability.note,
      missingModels: [],
      requiredModels,
      availability,
    };
  }

  const missingModels = requiredModels.filter((model) => !modelIds.includes(model));
  if (missingModels.length === 0) {
    return {
      ready: true,
      note: `Default Claude Code launch verified on ${serviceLabel}.`,
      missingModels,
      requiredModels,
      availability,
    };
  }

  const note = requiredModels.length === 1
    ? `Default Claude Code launch requires ${requiredModels[0]}, which is not reported by ${serviceLabel}.`
    : `Default Claude Code launch requires all of: ${requiredModels.join(', ')}. Missing on ${serviceLabel}: ${missingModels.join(', ')}.`;

  return {
    ready: false,
    note,
    missingModels,
    requiredModels,
    availability,
  };
}

function getFallbackStrategy(strategyValue, modelIds = [], serviceValue = DEFAULT_SERVICE) {
  if (hasExploitableModelIds(modelIds, serviceValue)) {
    return assessStrategyLaunch(strategyValue, modelIds, serviceValue).ready ? strategyValue : null;
  }

  const availability = assessStrategy(strategyValue, modelIds, serviceValue);
  return availability.level === 'unavailable' ? null : strategyValue;
}

function getStrategyChoices(modelIds = [], serviceValue = DEFAULT_SERVICE) {
  return listStrategies(modelIds, serviceValue).map((strategy) => ({
    name: strategy.value,
    value: strategy.value,
    description: strategy.selectionDescription ?? strategy.description,
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

function runPowerShell(command, options = {}) {
  const {
    env = {},
    input,
  } = options;
  const powershell = process.env.SystemRoot
    ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe';

  const result = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8',
    input,
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

function storeToken(token, serviceValue = DEFAULT_SERVICE) {
  const service = getServiceConfig(serviceValue);
  if (!service) {
    throw new Error(`Unknown service "${serviceValue}"`);
  }

  const storage = getSecureStorageBackend();
  if (!storage.supported) {
    throw new Error(storage.reason || 'Secure storage is not available on this machine');
  }

  if (process.platform === 'win32') {
    const tokenFile = getWindowsTokenFile(service.value);
    const encodedToken = encodeTokenForPowerShell(token);
    fs.mkdirSync(path.dirname(tokenFile), {recursive: true});
    runPowerShell(
      `$token = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encodedToken}')); if ([string]::IsNullOrEmpty($token)) { throw "Token input is empty" }; $secure = ConvertTo-SecureString $token -AsPlainText -Force; $encrypted = ConvertFrom-SecureString $secure; Set-Content -Path $env:SCIONOS_TOKEN_FILE -Value $encrypted -NoNewline`,
      {
        env: {
          SCIONOS_TOKEN_FILE: tokenFile,
        },
      },
    );

    if (!hasNonEmptyWindowsTokenFile(tokenFile)) {
      throw new Error('Secure token file was created but no encrypted content was written');
    }

    return storage;
  }

  if (process.platform === 'darwin') {
    const result = runCommand('security', [
      'add-generic-password',
      '-U',
      '-a',
      service.secureStorageAccount,
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
    `--label=${service.secureStorageLabel}`,
    'service',
    SECURE_STORAGE_SERVICE,
    'account',
    service.secureStorageAccount,
  ], {
    input: token,
  });

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'Unable to store token in Secret Service').trim());
  }

  return storage;
}

function getStoredToken(serviceValue = DEFAULT_SERVICE) {
  const service = getServiceConfig(serviceValue);
  if (!service) {
    return null;
  }

  const storage = getSecureStorageBackend();
  if (!storage.supported) {
    return null;
  }

  if (process.platform === 'win32') {
    const tokenFile = getWindowsTokenFile(service.value);
    if (!fs.existsSync(tokenFile)) {
      return null;
    }

    if (!hasNonEmptyWindowsTokenFile(tokenFile)) {
      return null;
    }

    const token = runPowerShell(
      '$secure = Get-Content -Path $env:SCIONOS_TOKEN_FILE -Raw | ConvertTo-SecureString; $ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure); try { [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }',
      {
        env: {
          SCIONOS_TOKEN_FILE: tokenFile,
        },
      },
    );
    return token || null;
  }

  if (process.platform === 'darwin') {
    const result = runCommand('security', [
      'find-generic-password',
      '-a',
      service.secureStorageAccount,
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
    service.secureStorageAccount,
  ]);
  return result.status === 0 ? result.stdout.trim() || null : null;
}

function deleteStoredToken(serviceValue = DEFAULT_SERVICE) {
  const service = getServiceConfig(serviceValue);
  if (!service) {
    return false;
  }

  const storage = getSecureStorageBackend();
  if (!storage.supported) {
    return false;
  }

  if (process.platform === 'win32') {
    const tokenFile = getWindowsTokenFile(service.value);
    if (!fs.existsSync(tokenFile)) {
      return false;
    }

    fs.unlinkSync(tokenFile);
    return true;
  }

  if (process.platform === 'darwin') {
    const result = runCommand('security', [
      'delete-generic-password',
      '-a',
      service.secureStorageAccount,
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
    service.secureStorageAccount,
  ]);
  return result.status === 0;
}

function getStoredTokenStatus(serviceValue = DEFAULT_SERVICE) {
  const storage = getSecureStorageBackend();
  const storedToken = getStoredToken(serviceValue);
  return {
    ...storage,
    stored: Boolean(storedToken),
  };
}

export {
  BASE_URL,
  DEFAULT_CLAUDE_MODELS,
  DEFAULT_SERVICE,
  DEFAULT_ANTHROPIC_VERSION,
  AWS_CLAUDE_MODELS,
  SECURE_STORAGE_ACCOUNT,
  SECURE_STORAGE_SERVICE,
  SERVICES,
  STRATEGIES,
  TOKEN_HELP_URL,
  assessStrategy,
  assessStrategyLaunch,
  canProceedWithValidation,
  deleteStoredToken,
  fetchModels,
  getFallbackStrategy,
  getSecureStorageBackend,
  getServiceConfig,
  getServiceStrategies,
  getStoredToken,
  getStoredTokenStatus,
  hasExploitableModelIds,
  getStrategyChoices,
  hasVerifiedModelIds,
  listStrategies,
  storeToken,
  validateToken,
};
