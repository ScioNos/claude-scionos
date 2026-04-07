import { beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { createAcpServer } from '../src/acp-server.js';
import { assessStrategy, getFallbackStrategy, getServiceConfig, getStrategyChoices } from '../src/routerlab.js';
import { buildProxyRequestOptions, normalizeProxyHeaders, resolveMappedModel } from '../src/proxy.js';
import * as indexModule from '../index.js';

const {
  isAcpMockEnabled,
  normalizeEntrypointPath,
  parseWrapperArgs,
  resolveLaunchToken,
} = indexModule;

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

describe('ACP argument parsing', () => {
  beforeEach(() => {
    delete process.env.SCIONOS_ACP_MOCK;
    vi.restoreAllMocks();
  });

  it('captures --acp as a wrapper-owned flag', () => {
    const parsed = parseWrapperArgs(['--acp']);

    expect(parsed.acpMode).toBe(true);
    expect(parsed.claudeArgs).toEqual([]);
  });

  it('keeps forwarded Claude args while stripping wrapper ACP flags', () => {
    const parsed = parseWrapperArgs(['--acp', '--strategy', 'aws', '-p', 'hello']);

    expect(parsed.acpMode).toBe(true);
    expect(parsed.strategy).toBe('aws');
    expect(parsed.claudeArgs).toEqual(['-p', 'hello']);
  });

  it('enables ACP mock only with explicit env and ACP mode', () => {
    const nonAcp = parseWrapperArgs([]);
    const acp = parseWrapperArgs(['--acp']);

    process.env.SCIONOS_ACP_MOCK = '1';

    expect(isAcpMockEnabled(nonAcp)).toBe(false);
    expect(isAcpMockEnabled(acp)).toBe(true);
  });

  it('returns a mock token for ACP no-prompt launches without credentials', async () => {
    const serviceConfig = getServiceConfig();
    vi.stubEnv('SCIONOS_ACP_MOCK', '1');
    vi.spyOn(indexModule, 'validateToken').mockResolvedValue({
      valid: false,
      reason: 'bad gateway',
    });

    const result = await resolveLaunchToken(true, serviceConfig, { acpMock: true });

    expect(result.token).toBe('scionos-acp-mock-token');
    expect(result.source).toBe('mock-acp');
    expect(result.validation.reason).toBe('mock_bypass');
  });
});

describe('ACP server protocol', () => {
  it('returns initialize metadata with conservative capabilities', async () => {
    const outputs = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
      outputs.push(String(chunk));
      return true;
    };

    try {
      const server = createAcpServer({
        cliPath: 'claude',
        env: process.env,
      });

      await server._test.handleRequest({
        id: 1,
        method: 'initialize',
        params: {},
      });

      const message = JSON.parse(outputs.at(-1));
      expect(message.jsonrpc).toBe('2.0');
      expect(message.id).toBe(1);
      expect(message.result.protocolVersion).toBe(1);
      expect(message.result.capabilities).toEqual({
        streaming: false,
        tools: false,
        prompts: false,
        resources: false,
      });
      expect(message.result.serverInfo.name).toBe('claude-scionos');
      expect(message.result.sessionId).toMatch(/^session-/);
    } finally {
      process.stdout.write = originalWrite;
    }
  });

  it('rejects message/send before initialize', async () => {
    const outputs = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
      outputs.push(String(chunk));
      return true;
    };

    try {
      const server = createAcpServer({
        cliPath: 'claude',
        env: process.env,
      });

      await server._test.handleRequest({
        id: 2,
        method: 'message/send',
        params: {
          messages: [{ role: 'user', content: 'hello' }],
        },
      });

      const message = JSON.parse(outputs.at(-1));
      expect(message.error.code).toBe(-32002);
      expect(message.error.message).toContain('not initialized');
    } finally {
      process.stdout.write = originalWrite;
    }
  });

  it('returns a mock response in ACP mock mode without spawning Claude', async () => {
    const outputs = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
      outputs.push(String(chunk));
      return true;
    };

    try {
      const server = createAcpServer({
        cliPath: 'claude',
        env: process.env,
        mockMode: true,
      });

      await server._test.handleRequest({
        id: 1,
        method: 'initialize',
        params: {},
      });
      await server._test.handleRequest({
        id: 2,
        method: 'message/send',
        params: {
          messages: [{ role: 'user', content: 'hello mock' }],
        },
      });

      const message = JSON.parse(outputs.at(-1));
      expect(message.id).toBe(2);
      expect(message.result.content[0].text).toBe('ACP mock response: hello mock');
    } finally {
      process.stdout.write = originalWrite;
    }
  });

  it('returns a response for message/send after initialize', async () => {
    const outputs = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
      outputs.push(String(chunk));
      return true;
    };

    try {
      const server = createAcpServer({
        cliPath: process.execPath,
        claudeArgs: ['-e', "process.stdout.write('bonjour test'); process.exit(0);"],
        env: process.env,
      });

      await server._test.handleRequest({
        id: 1,
        method: 'initialize',
        params: {},
      });
      await server._test.handleRequest({
        id: 2,
        method: 'message/send',
        params: {
          messages: [{ role: 'user', content: 'hello' }],
        },
      });

      const message = JSON.parse(outputs.at(-1));
      expect(message.id).toBe(2);
      expect(message.result.stopReason).toBe('end_turn');
      expect(message.result.content[0].text).toBe('bonjour test');
    } finally {
      process.stdout.write = originalWrite;
    }
  });

  it('extracts prompt text from mixed content arrays', () => {
    const server = createAcpServer({
      cliPath: 'claude',
      env: process.env,
    });

    const prompt = server._test.extractPromptFromParams({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Bonjour' },
            'le monde',
          ],
        },
      ],
    });

    expect(prompt).toBe('Bonjour\nle monde');
  });
});
