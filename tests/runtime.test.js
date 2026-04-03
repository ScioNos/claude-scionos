import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { assessStrategy, getFallbackStrategy, getServiceConfig, getStrategyChoices } from '../src/routerlab.js';
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

  it('marks mapped strategies as ready when all target models are available', () => {
    expect(assessStrategy('claude-glm-5', ['claude-glm-5']).level).toBe('ready');
    expect(assessStrategy('aws', [
      'aws-claude-haiku-4-5-20251001',
      'aws-claude-sonnet-4-6',
      'aws-claude-opus-4-6',
    ]).level).toBe('ready');
  });

  it('renders service-specific availability notes', () => {
    expect(assessStrategy('claude-glm-5', ['claude-glm-5'], 'llm').note).toContain('RouterLab LLM');
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
    const llmChoices = getStrategyChoices(['claude-glm-5', 'claude-gpt-5.4'], 'llm');

    expect(llmChoices.map((choice) => choice.value)).toEqual([
      'claude-glm-5',
      'claude-gpt-5.4',
    ]);
  });

  it('keeps claude-gpt-5.4 available on routerlab too', () => {
    const routerlabChoices = getStrategyChoices(['claude-gpt-5.4'], 'routerlab');

    expect(routerlabChoices.map((choice) => choice.value)).toContain('claude-gpt-5.4');
  });

  it('falls back to default only when a strategy is unavailable', () => {
    expect(getFallbackStrategy('claude-glm-5', ['claude-glm-5'])).toBe('claude-glm-5');
    expect(getFallbackStrategy('claude-glm-5', ['claude-minimax-m2.5'])).toBe('default');
    expect(getFallbackStrategy('aws', null)).toBe('aws');
    expect(getFallbackStrategy('claude-gpt-5.4', ['claude-gpt-5.4'], 'routerlab')).toBe('claude-gpt-5.4');
    expect(getFallbackStrategy('claude-gpt-5.4', ['claude-gpt-5.4'], 'llm')).toBe('claude-gpt-5.4');
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
