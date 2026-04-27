import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { assessStrategy, assessStrategyLaunch, DEFAULT_CLAUDE_MODELS, AWS_CLAUDE_MODELS, getFallbackStrategy, getServiceConfig, getStrategyChoices, hasExploitableModelIds, resolveServiceBaseUrl, validateTokenFormat } from '../src/routerlab.js';
import { buildProxyRequestOptions, normalizeProxyHeaders, PROXY_AUTH_HEADER, resolveMappedModel } from '../src/proxy.js';
import { normalizeEntrypointPath, resolveLaunchToken } from '../index.js';

describe('proxy request handling', () => {
  it('keeps useful upstream headers while stripping hop-by-hop ones', () => {
    const headers = normalizeProxyHeaders({
      accept: 'application/json',
      'anthropic-beta': 'tools-2025-01-01',
      connection: 'keep-alive',
      host: '127.0.0.1:1234',
      'user-agent': 'claude-code/test',
    });

    expect(headers).toEqual({
      accept: 'application/json',
      'anthropic-beta': 'tools-2025-01-01',
      'user-agent': 'claude-code/test',
    });
  });

  it('overrides auth headers, strips the local proxy secret, and recomputes content length', () => {
    const options = buildProxyRequestOptions(
      new URL('https://routerlab.ch/v1/messages'),
      'POST',
      {
        authorization: 'Bearer stale-token',
        'anthropic-beta': 'tools-2025-01-01',
        'anthropic-version': '2024-10-22',
        'content-type': 'application/json',
        'x-api-key': 'stale-token',
        [PROXY_AUTH_HEADER]: 'session-secret',
      },
      'fresh-token',
      42,
      120000,
    );

    expect(options.headers).toEqual({
      'anthropic-beta': 'tools-2025-01-01',
      'anthropic-version': '2024-10-22',
      'content-type': 'application/json',
      'x-api-key': 'fresh-token',
      'Content-Length': '42',
    });
  });

  it('maps AWS models dynamically from the requested Claude model', () => {
    expect(resolveMappedModel('aws', 'claude-3-5-haiku')).toBe('aws-claude-haiku-4-5-20251001');
    expect(resolveMappedModel('aws', 'claude-3-opus')).toBe('aws-claude-opus-4-6');
    expect(resolveMappedModel('aws', 'claude-3-7-sonnet')).toBe('aws-claude-sonnet-4-6');
    expect(resolveMappedModel('claude-glm-5.1', 'claude-3-7-sonnet')).toBe('claude-glm-5.1');
  });

  it('maps claude-gpt dynamically from the requested Claude model', () => {
    expect(resolveMappedModel('claude-gpt', 'claude-3-5-haiku')).toBe('claude-gpt-5.4-mini');
    expect(resolveMappedModel('claude-gpt', 'claude-3-opus')).toBe('claude-gpt-5.5');
    expect(resolveMappedModel('claude-gpt', 'claude-3-7-sonnet')).toBe('claude-gpt-5.4');
  });

  it('maps the special llm GPT strategy to claude-gpt-5.4-sp', () => {
    expect(resolveMappedModel('claude-gpt-special', 'claude-3-5-haiku')).toBe('claude-gpt-5.4-sp');
    expect(resolveMappedModel('claude-gpt-special', 'claude-3-opus')).toBe('claude-gpt-5.4-sp');
    expect(resolveMappedModel('claude-gpt-special', 'claude-3-7-sonnet')).toBe('claude-gpt-5.4-sp');
  });

  it('maps deepseek-v4 beta from the requested Claude model', () => {
    expect(resolveMappedModel('deepseek-v4-beta', 'claude-3-5-haiku')).toBe('claude-deepseek-v4-flash');
    expect(resolveMappedModel('deepseek-v4-beta', 'claude-3-opus')).toBe('claude-deepseek-v4-pro');
    expect(resolveMappedModel('deepseek-v4-beta', 'claude-3-7-sonnet')).toBe('claude-deepseek-v4-flash');
  });

  it('falls back to deepseek-v4-flash when pro is unavailable', () => {
    const availableModels = ['claude-deepseek-v4-flash'];

    expect(resolveMappedModel('deepseek-v4-beta', 'claude-3-opus', availableModels)).toBe('claude-deepseek-v4-flash');
  });

  it('maps llm Claude models dynamically from the requested Claude model', () => {
    expect(resolveMappedModel('claude', 'claude-3-5-haiku')).toBe('claude-haiku-4-5-20251001');
    expect(resolveMappedModel('claude', 'claude-3-opus')).toBe('claude-opus-4-6');
    expect(resolveMappedModel('claude', 'claude-3-7-sonnet')).toBe('claude-sonnet-4-6');
    expect(resolveMappedModel('claude', 'unknown-model')).toBe('claude-sonnet-4-6');
  });

  it('falls back to an available Claude model when opus or haiku variants are unavailable', () => {
    const availableModels = ['claude-sonnet-4-6'];

    expect(resolveMappedModel('claude', 'claude-3-opus', availableModels)).toBe('claude-sonnet-4-6');
    expect(resolveMappedModel('claude', 'claude-3-5-haiku', availableModels)).toBe('claude-sonnet-4-6');
  });

  it('falls back to an available claude-gpt model when opus or haiku variants are unavailable', () => {
    const availableModels = ['claude-gpt-5.4'];

    expect(resolveMappedModel('claude-gpt', 'claude-3-opus', availableModels)).toBe('claude-gpt-5.4');
    expect(resolveMappedModel('claude-gpt', 'claude-3-5-haiku', availableModels)).toBe('claude-gpt-5.4');
  });
});

describe('strategy metadata', () => {
  it('resolves known service targets', () => {
    expect(getServiceConfig().baseUrl).toBe('https://routerlab.ch');
    expect(getServiceConfig('llm').baseUrl).toBe('https://llm.routerlab.ch');
  });

  it('marks default and mapped strategies as ready only when all required models are available', () => {
    expect(assessStrategy('default', DEFAULT_CLAUDE_MODELS).level).toBe('ready');
    expect(assessStrategy('claude', DEFAULT_CLAUDE_MODELS, 'llm').level).toBe('ready');
    expect(assessStrategy('claude-glm-5.1', ['claude-glm-5.1']).level).toBe('ready');
    expect(assessStrategy('aws', AWS_CLAUDE_MODELS).level).toBe('ready');
    expect(assessStrategy('claude-gpt-special', ['claude-gpt-5.4-sp'], 'llm').level).toBe('ready');
    expect(assessStrategy('deepseek-v4-beta', ['claude-deepseek-v4-pro', 'claude-deepseek-v4-flash'], 'llm').level).toBe('ready');
  });

  it('marks grouped strategies as partial when one of the required models is missing', () => {
    expect(assessStrategy('default', DEFAULT_CLAUDE_MODELS.slice(0, 2)).level).toBe('partial');
    expect(assessStrategy('claude', DEFAULT_CLAUDE_MODELS.slice(0, 2), 'llm').level).toBe('partial');
    expect(assessStrategy('aws', AWS_CLAUDE_MODELS.slice(0, 2)).level).toBe('partial');
    expect(assessStrategy('deepseek-v4-beta', ['claude-deepseek-v4-flash'], 'llm').level).toBe('partial');
  });

  it('renders service-specific availability notes', () => {
    expect(assessStrategy('claude-gpt', ['claude-gpt-5.4'], 'llm').note).toContain('RouterLab LLM');
  });

  it('treats an empty verified model list as unknown instead of blocked', () => {
    expect(assessStrategy('claude-gpt', []).level).toBe('unknown');
    expect(assessStrategyLaunch('claude-gpt', []).ready).toBe(true);
    expect(getFallbackStrategy('claude-gpt', [])).toBe('claude-gpt');
  });

  it('treats llm strategies as verified when Claude-family models are reported', () => {
    const reportedModels = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-6'];

    expect(hasExploitableModelIds(reportedModels, 'llm')).toBe(true);
    expect(assessStrategy('claude-gpt', reportedModels, 'llm').level).toBe('unavailable');
    expect(assessStrategyLaunch('claude-gpt', reportedModels, 'llm').ready).toBe(false);
    expect(getFallbackStrategy('claude-gpt', reportedModels, 'llm')).toBe(null);
  });

  it('supports legacy aliases but returns canonical strategy ids', () => {
    expect(assessStrategyLaunch('claude-gpt-5.4', ['claude-gpt-5.4'], 'llm').ready).toBe(true);
    expect(getFallbackStrategy('claude-gpt-5.4', ['claude-gpt-5.4'], 'llm')).toBe('claude-gpt');
    expect(assessStrategyLaunch('claude-gpt-5.4-sp', ['claude-gpt-5.4-sp'], 'llm').ready).toBe(true);
    expect(getFallbackStrategy('claude-gpt-5.4-sp', ['claude-gpt-5.4-sp'], 'llm')).toBe('claude-gpt-special');
  });

  it('blocks default and aws when one of the required launch models is missing', () => {
    const defaultReadiness = assessStrategyLaunch('default', DEFAULT_CLAUDE_MODELS.slice(0, 2));
    const awsReadiness = assessStrategyLaunch('aws', AWS_CLAUDE_MODELS.slice(0, 2));

    expect(defaultReadiness.ready).toBe(false);
    expect(defaultReadiness.missingModels).toEqual(['claude-opus-4-6']);
    expect(awsReadiness.ready).toBe(false);
    expect(awsReadiness.missingModels).toEqual(['aws-claude-opus-4-6']);
  });

  it('keeps single-model llm routes launchable when the service reports a matching model', () => {
    const gptSpecialReadiness = assessStrategyLaunch('claude-gpt-special', ['claude-gpt-5.4-sp'], 'llm');

    expect(gptSpecialReadiness.ready).toBe(true);
    expect(gptSpecialReadiness.note).toBe('Default Claude Code launch verified on RouterLab LLM.');
  });

  it('uses human-readable strategy labels in the interactive selector without availability badges', () => {
    const choices = getStrategyChoices(['claude-glm-5.1']);

    expect(choices.find((choice) => choice.value === 'claude-glm-5.1')).toEqual({
      name: 'GLM-5.1',
      value: 'claude-glm-5.1',
      description: 'Forces all requests to claude-glm-5.1.',
    });
    expect(choices.every((choice) => !choice.name.includes('[Ready]'))).toBe(true);
  });

  it('shows a service-specific menu for llm', () => {
    const llmChoices = getStrategyChoices([
      'claude-haiku-4-5-20251001',
      'claude-sonnet-4-6',
      'claude-opus-4-6',
      'claude-gpt-5.4',
      'claude-gpt-5.4-sp',
      'claude-deepseek-v4-pro',
      'claude-deepseek-v4-flash',
    ], 'llm');

    expect(llmChoices.map((choice) => choice.value)).toEqual([
      'claude',
      'claude-gpt',
      'claude-gpt-special',
      'deepseek-v4-beta',
    ]);
    expect(llmChoices.find((choice) => choice.value === 'claude')).toEqual({
      name: 'Claude (Opus 4.6)',
      value: 'claude',
      description: 'Map models to claude-haiku, claude-sonnet, claude-opus.',
    });
    expect(llmChoices.find((choice) => choice.value === 'claude-gpt-special')).toEqual({
      name: 'OpenAI GPT special (only gpt-5.4)',
      value: 'claude-gpt-special',
      description: 'Forces all requests to claude-gpt-5.4-sp.',
    });
    expect(llmChoices.find((choice) => choice.value === 'deepseek-v4-beta')).toEqual({
      name: 'deepseek-v4 beta',
      value: 'deepseek-v4-beta',
      description: 'Opus 4.7 => claude-deepseek-v4-pro, Sonnet 4.6 => claude-deepseek-v4-flash, Haiku => claude-deepseek-v4-flash.',
    });
  });

  it('keeps claude-gpt as the third routerlab option', () => {
    const routerlabChoices = getStrategyChoices(['claude-gpt-5.4'], 'routerlab');

    expect(routerlabChoices.map((choice) => choice.value)).toEqual([
      'default',
      'aws',
      'claude-gpt',
      'claude-minimax-m2.7',
      'claude-glm-5.1',
    ]);
  });

  it('keeps llm-only strategies out of routerlab', () => {
    const routerlabChoices = getStrategyChoices(['claude-gpt-5.4'], 'routerlab');

    expect(routerlabChoices.map((choice) => choice.value)).toContain('claude-gpt');
    expect(routerlabChoices.map((choice) => choice.value)).not.toContain('claude-gpt-special');
    expect(routerlabChoices.map((choice) => choice.value)).not.toContain('deepseek-v4-beta');
  });

  it('falls back to default only when a strategy is unavailable', () => {
    expect(getFallbackStrategy('claude-glm-5.1', ['claude-glm-5.1'])).toBe('claude-glm-5.1');
    expect(getFallbackStrategy('claude-glm-5.1', ['claude-minimax-m2.7'])).toBe(null);
    expect(getFallbackStrategy('default', DEFAULT_CLAUDE_MODELS.slice(0, 1))).toBe(null);
    expect(getFallbackStrategy('claude', DEFAULT_CLAUDE_MODELS.slice(0, 2), 'llm')).toBe(null);
    expect(getFallbackStrategy('claude', DEFAULT_CLAUDE_MODELS, 'llm')).toBe('claude');
    expect(getFallbackStrategy('claude', ['claude-sonnet-4-6'], 'llm')).toBe(null);
    expect(getFallbackStrategy('claude', null, 'llm')).toBe('claude');
    expect(getFallbackStrategy('aws', AWS_CLAUDE_MODELS.slice(0, 2))).toBe(null);
    expect(getFallbackStrategy('aws', ['aws-claude-sonnet-4-6'])).toBe(null);
    expect(getFallbackStrategy('aws', DEFAULT_CLAUDE_MODELS)).toBe(null);
    expect(getFallbackStrategy('aws', AWS_CLAUDE_MODELS)).toBe('aws');
    expect(getFallbackStrategy('aws', null)).toBe('aws');
    expect(getFallbackStrategy('claude-gpt', ['claude-gpt-5.4'], 'routerlab')).toBe('claude-gpt');
    expect(getFallbackStrategy('claude-gpt', ['claude-gpt-5.4'], 'llm')).toBe('claude-gpt');
    expect(getFallbackStrategy('claude-gpt-special', ['claude-gpt-5.4-sp'], 'llm')).toBe('claude-gpt-special');
    expect(getFallbackStrategy('deepseek-v4-beta', ['claude-deepseek-v4-pro', 'claude-deepseek-v4-flash'], 'llm')).toBe('deepseek-v4-beta');
  });
});

describe('wrapper validation helpers', () => {
  const routerlabConfig = getServiceConfig('routerlab');

  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('rejects obviously invalid token formats locally', () => {
    expect(validateTokenFormat('')).toEqual({
      valid: false,
      reason: 'missing',
      message: 'Token is required.',
    });
    expect(validateTokenFormat('short-token')).toEqual({
      valid: false,
      reason: 'too_short',
      message: 'Token seems invalid (too short).',
    });
    expect(validateTokenFormat('valid-token-with-enough-length')).toEqual({valid: true});
  });

  it('resolves service base URLs with and without environment override', () => {
    expect(resolveServiceBaseUrl('routerlab', {})).toBe('https://routerlab.ch');
    expect(resolveServiceBaseUrl('llm', {})).toBe('https://llm.routerlab.ch');
    expect(resolveServiceBaseUrl('routerlab', {ANTHROPIC_BASE_URL: 'https://override.example'})).toBe('https://override.example');
  });

  it('does not let an ambient ANTHROPIC_BASE_URL override the selected service by default', () => {
    vi.stubEnv('ANTHROPIC_BASE_URL', 'https://override.example');

    expect(resolveServiceBaseUrl('llm')).toBe('https://llm.routerlab.ch');
  });

  it('fails fast in no-prompt mode when the token format is obviously invalid', async () => {
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'short-token');

    await expect(resolveLaunchToken(true, routerlabConfig)).rejects.toThrow(
      'environment token is invalid: Token seems invalid (too short).',
    );
  });
});

describe('entrypoint detection', () => {
  it('normalizes relative Windows-style script paths to the same file', () => {
    const absolute = path.resolve('index.js');
    const relative = path.join('.', 'index.js');

    expect(normalizeEntrypointPath(relative)).toBe(normalizeEntrypointPath(absolute));
  });
});
