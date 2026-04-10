import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { assessStrategy, assessStrategyLaunch, DEFAULT_CLAUDE_MODELS, AWS_CLAUDE_MODELS, getFallbackStrategy, getServiceConfig, getStrategyChoices } from '../src/routerlab.js';
import { buildProxyRequestOptions, normalizeProxyHeaders, resolveMappedModel } from '../src/proxy.js';
import { normalizeEntrypointPath } from '../index.js';

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

  it('overrides auth headers and recomputes content length', () => {
    const options = buildProxyRequestOptions(
      new URL('https://routerlab.ch/v1/messages'),
      'POST',
      {
        authorization: 'Bearer stale-token',
        'anthropic-beta': 'tools-2025-01-01',
        'anthropic-version': '2024-10-22',
        'content-type': 'application/json',
        'x-api-key': 'stale-token',
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
    expect(resolveMappedModel('claude-glm-5', 'claude-3-7-sonnet')).toBe('claude-glm-5');
  });
});

describe('strategy metadata', () => {
  it('resolves known service targets', () => {
    expect(getServiceConfig().baseUrl).toBe('https://routerlab.ch');
    expect(getServiceConfig('llm').baseUrl).toBe('https://llm.routerlab.ch');
  });

  it('marks default and mapped strategies as ready only when all required models are available', () => {
    expect(assessStrategy('default', DEFAULT_CLAUDE_MODELS).level).toBe('ready');
    expect(assessStrategy('claude-glm-5', ['claude-glm-5']).level).toBe('ready');
    expect(assessStrategy('aws', AWS_CLAUDE_MODELS).level).toBe('ready');
  });

  it('marks grouped strategies as partial when one of the required models is missing', () => {
    expect(assessStrategy('default', DEFAULT_CLAUDE_MODELS.slice(0, 2)).level).toBe('partial');
    expect(assessStrategy('aws', AWS_CLAUDE_MODELS.slice(0, 2)).level).toBe('partial');
  });

  it('renders service-specific availability notes', () => {
    expect(assessStrategy('claude-glm-5', ['claude-glm-5'], 'llm').note).toContain('RouterLab LLM');
  });

  it('treats an empty verified model list as unknown instead of blocked', () => {
    expect(assessStrategy('claude-gpt-5.4', []).level).toBe('unknown');
    expect(assessStrategyLaunch('claude-gpt-5.4', []).ready).toBe(true);
    expect(getFallbackStrategy('claude-gpt-5.4', [])).toBe('claude-gpt-5.4');
  });

  it('blocks default and aws when one of the required launch models is missing', () => {
    const defaultReadiness = assessStrategyLaunch('default', DEFAULT_CLAUDE_MODELS.slice(0, 2));
    const awsReadiness = assessStrategyLaunch('aws', AWS_CLAUDE_MODELS.slice(0, 2));

    expect(defaultReadiness.ready).toBe(false);
    expect(defaultReadiness.missingModels).toEqual(['claude-opus-4-6']);
    expect(awsReadiness.ready).toBe(false);
    expect(awsReadiness.missingModels).toEqual(['aws-claude-opus-4-6']);
  });

  it('uses raw strategy ids in the interactive selector without availability badges', () => {
    const choices = getStrategyChoices(['claude-glm-5']);

    expect(choices.find((choice) => choice.value === 'claude-glm-5')).toEqual({
      name: 'claude-glm-5',
      value: 'claude-glm-5',
      description: 'Forces all requests to claude-glm-5.',
    });
    expect(choices.every((choice) => !choice.name.includes('[Ready]'))).toBe(true);
  });

  it('shows a service-specific menu for llm', () => {
    const llmChoices = getStrategyChoices(['claude-glm-5', 'claude-gpt-5.4', 'claude-qwen3.6-plus'], 'llm');

    expect(llmChoices.map((choice) => choice.value)).toEqual([
      'claude-glm-5',
      'claude-gpt-5.4',
      'claude-qwen3.6-plus',
    ]);
  });

  it('keeps claude-gpt-5.4 as the third routerlab option', () => {
    const routerlabChoices = getStrategyChoices(['claude-gpt-5.4'], 'routerlab');

    expect(routerlabChoices.map((choice) => choice.value)).toEqual([
      'default',
      'aws',
      'claude-gpt-5.4',
      'claude-glm-5',
      'claude-minimax-m2.5',
    ]);
  });

  it('keeps claude-gpt-5.4 available on routerlab too', () => {
    const routerlabChoices = getStrategyChoices(['claude-gpt-5.4'], 'routerlab');

    expect(routerlabChoices.map((choice) => choice.value)).toContain('claude-gpt-5.4');
  });

  it('falls back to default only when a strategy is unavailable', () => {
    expect(getFallbackStrategy('claude-glm-5', ['claude-glm-5'])).toBe('claude-glm-5');
    expect(getFallbackStrategy('claude-glm-5', ['claude-minimax-m2.5'])).toBe(null);
    expect(getFallbackStrategy('default', DEFAULT_CLAUDE_MODELS.slice(0, 1))).toBe(null);
    expect(getFallbackStrategy('aws', AWS_CLAUDE_MODELS.slice(0, 2))).toBe(null);
    expect(getFallbackStrategy('aws', ['aws-claude-sonnet-4-6'])).toBe(null);
    expect(getFallbackStrategy('aws', DEFAULT_CLAUDE_MODELS)).toBe(null);
    expect(getFallbackStrategy('aws', AWS_CLAUDE_MODELS)).toBe('aws');
    expect(getFallbackStrategy('aws', null)).toBe('aws');
    expect(getFallbackStrategy('claude-gpt-5.4', ['claude-gpt-5.4'], 'routerlab')).toBe('claude-gpt-5.4');
    expect(getFallbackStrategy('claude-gpt-5.4', ['claude-gpt-5.4'], 'llm')).toBe('claude-gpt-5.4');
    expect(getFallbackStrategy('claude-qwen3.6-plus', ['claude-qwen3.6-plus'], 'llm')).toBe('claude-qwen3.6-plus');
  });
});

describe('entrypoint detection', () => {
  it('normalizes relative Windows-style script paths to the same file', () => {
    const absolute = path.resolve('index.js');
    const relative = path.relative(process.cwd(), absolute) || 'index.js';
    const windowsRelative = relative.split(path.sep).join('\\');

    expect(normalizeEntrypointPath(windowsRelative)).toBe(normalizeEntrypointPath(absolute));
  });
});
