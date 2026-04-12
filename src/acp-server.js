import { appendFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import process from 'node:process';

function generateSessionId() {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function createMockResponse(prompt) {
  return `ACP mock response: ${prompt}`;
}

function createFileLogger(filePath) {
  if (!filePath) {
    return () => {};
  }

  return (message) => {
    appendFileSync(filePath, `${new Date().toISOString()} ${message}\n`, 'utf8');
  };
}

function createAcpServer(options) {
  const {
    cliPath,
    claudeArgs = [],
    env,
    debug = false,
    shell = false,
    onError = () => {},
    onDebug = () => {},
    onExit = () => {},
    mockMode = false,
    logFilePath = null,
  } = options;

  const protocolVersion = 1;
  const serverInfo = {
    name: 'claude-scionos',
    version: '4.1.1',
    description: 'ACP server wrapper for Claude Code with ScioNos routing',
  };
  const capabilities = {
    streaming: false,
    tools: false,
    prompts: true,
    resources: false,
  };

  let buffer = '';
  let sessionId = null;
  let initialized = false;
  let activeChild = null;
  let shuttingDown = false;
  let activeRequests = 0;
  let endSeen = false;
  let resolveWhenIdle = null;
  let processing = Promise.resolve();
  const logToFile = createFileLogger(logFilePath);

  function logEvent(message) {
    logToFile(message);
  }

  function logDebug(message) {
    if (debug) {
      onDebug(message);
    }
  }

  function logBanner() {
    logEvent(`[claude-scionos-acp] start pid=${process.pid} cwd=${process.cwd()} cliPath=${cliPath} mockMode=${mockMode ? '1' : '0'} logFile=${logFilePath ?? 'none'}`);
  }

  function writeMessage(payload) {
    const message = JSON.stringify(payload);
    logEvent(`[ACP OUT] ${message}`);
    process.stdout.write(`${message}\n`);
    // Ensure the message is flushed immediately for stdio communication
    if (process.stdout.flush) {
      process.stdout.flush();
    }
  }

  function sendResponse(id, result) {
    writeMessage({
      jsonrpc: '2.0',
      id,
      result,
    });
  }

  function sendError(id, code, message, data = null) {
    writeMessage({
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
        data,
      },
    });
  }

  function sendNotification(method, params = {}) {
    writeMessage({
      jsonrpc: '2.0',
      method,
      params,
    });
  }

  function normalizeMessageContent(content) {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((entry) => {
          if (typeof entry === 'string') {
            return entry;
          }
          if (entry?.type === 'text' && typeof entry.text === 'string') {
            return entry.text;
          }
          return '';
        })
        .filter(Boolean)
        .join('\n');
    }

    if (content?.type === 'text' && typeof content.text === 'string') {
      return content.text;
    }

    return '';
  }

  function extractPromptFromParams(params = {}) {
    if (Array.isArray(params.messages) && params.messages.length > 0) {
      const lastMessage = params.messages[params.messages.length - 1];
      return normalizeMessageContent(lastMessage?.content ?? lastMessage?.parts);
    }

    if (Array.isArray(params.input) && params.input.length > 0) {
      const lastInput = params.input[params.input.length - 1];
      return normalizeMessageContent(lastInput?.content ?? lastInput?.parts);
    }

    // Handle prompt as array (e.g., [{"type":"text","text":"coucou"}])
    if (Array.isArray(params.prompt) && params.prompt.length > 0) {
      return normalizeMessageContent(params.prompt);
    }

    if (typeof params.prompt === 'string') {
      return params.prompt;
    }

    if (typeof params.input === 'string') {
      return params.input;
    }

    if (Array.isArray(params.content)) {
      return normalizeMessageContent(params.content);
    }

    return '';
  }

  function ensureSessionId(requestedSessionId = null) {
    sessionId = requestedSessionId || sessionId || generateSessionId();
    return sessionId;
  }

  function buildSessionPayload(currentSessionId) {
    return {
      sessionId: currentSessionId,
      session_id: currentSessionId,
      id: currentSessionId,
      protocolVersion,
      capabilities,
      serverInfo,
    };
  }

  function spawnClaude(prompt) {
    return new Promise((resolve, reject) => {
      const childArgs = ['--print', prompt, ...claudeArgs];
      const child = spawn(cliPath, childArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
        shell,
      });

      activeChild = child;
      let stdout = '';
      let stderr = '';

      child.stdin.end();

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        stderr += text;
        logEvent(`[CLAUDE STDERR] ${text.trimEnd()}`);
        process.stderr.write(text);
      });

      child.on('error', (error) => {
        activeChild = null;
        reject(error);
      });

      child.on('close', (code, signal) => {
        activeChild = null;
        if (debug) {
          onDebug(`[ACP] Claude child closed with code ${code ?? 'null'}${signal ? ` (signal: ${signal})` : ''}`);
        }
        if (code === 0) {
          resolve(stdout.trimEnd());
          return;
        }

        reject(new Error((stderr || stdout || `Claude exited with code ${code ?? 'null'}${signal ? ` (${signal})` : ''}`).trim()));
      });
    });
  }

  function maybeResolveIdle() {
    if (endSeen && activeRequests === 0 && resolveWhenIdle) {
      const resolve = resolveWhenIdle;
      resolveWhenIdle = null;
      resolve(0);
    }
  }

  async function handleInitialize(id, params = {}) {
    sessionId = ensureSessionId(params.sessionId ?? params.session_id ?? params.id);
    initialized = true;
    sendResponse(id, buildSessionPayload(sessionId));
    logEvent(`[ACP] initialize -> session ${sessionId}`);
  }

  function handleSessionNew(id, params = {}) {
    const nextSessionId = ensureSessionId(params.sessionId ?? params.session_id ?? params.id);
    initialized = true;
    sendResponse(id, buildSessionPayload(nextSessionId));
    logEvent(`[ACP] session/new -> session ${nextSessionId}`);
  }

  function handleSessionGet(id, params = {}) {
    const requestedSessionId = params.sessionId ?? params.session_id ?? params.id;

    if (requestedSessionId && sessionId && requestedSessionId !== sessionId) {
      sendError(id, -32004, `Unknown session: ${requestedSessionId}`);
      return;
    }

    const currentSessionId = ensureSessionId(requestedSessionId);
    initialized = true;
    sendResponse(id, buildSessionPayload(currentSessionId));
    logEvent(`[ACP] session/get -> session ${currentSessionId}`);
  }

  function handlePromptsList(id) {
    sendResponse(id, { prompts: [] });
  }

  function handleToolsList(id) {
    sendResponse(id, { tools: [] });
  }

  async function handleMessageSend(id, params = {}) {
    if (!initialized) {
      sendError(id, -32002, 'ACP session not initialized');
      return;
    }

    const prompt = extractPromptFromParams(params).trim();
    if (!prompt) {
      sendError(id, -32602, 'No prompt content provided');
      return;
    }

    try {
      if (mockMode) {
        const result = createMockResponse(prompt);
        logEvent(`[ACP MOCK] Returning mock response for prompt (${prompt.length} chars)`);
        sendResponse(id, {
          sessionId,
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
          stopReason: 'end_turn',
        });
        return;
      }

      logDebug(`[ACP] Sending prompt to Claude (${prompt.length} chars)`);
      const result = await spawnClaude(prompt);
      sendResponse(id, {
        sessionId,
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
        stopReason: 'end_turn',
      });
    } catch (error) {
      onError(`[ACP] Claude request failed: ${error.message}`);
      sendError(id, -32000, `Claude request failed: ${error.message}`);
    }
  }

  function handleShutdown(id) {
    shuttingDown = true;
    sendResponse(id, { ok: true });
  }

  function handleCancel(id) {
    if (activeChild && !activeChild.killed) {
      activeChild.kill('SIGTERM');
    }
    sendResponse(id, { cancelled: true });
  }

  async function handleRequest(request) {
    activeRequests += 1;
    try {
      let { id = null, method, params = {} } = request ?? {};

      // Normalize method path: remove leading slash
      if (typeof method === 'string' && method.startsWith('/')) {
        method = method.slice(1);
      }

      if (!method || typeof method !== 'string') {
        if (id !== null) {
          sendError(id, -32600, 'Invalid request');
        }
        return;
      }

      switch (method) {
        case 'initialize':
          await handleInitialize(id, params);
          break;
        case 'session/new':
          handleSessionNew(id, params);
          break;
        case 'session/get':
        case 'session/current':
          handleSessionGet(id, params);
          break;
        case 'prompts/list':
          handlePromptsList(id);
          break;
        case 'tools/list':
          handleToolsList(id);
          break;
        case 'message/send':
        case 'prompt':
        case 'session/prompt':
          await handleMessageSend(id, params);
          break;
        case 'cancel':
        case 'message/cancel':
          handleCancel(id);
          break;
        case 'shutdown':
          handleShutdown(id);
          break;
        default:
          logEvent(`[ACP IN] unknown method: ${method}`);
          if (id !== null) {
            sendError(id, -32601, `Method not supported: ${method}`);
          }
      }
    } finally {
      activeRequests -= 1;
      maybeResolveIdle();
    }
  }

  async function processBuffer() {
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      let request;
      try {
        request = JSON.parse(trimmed);
        logEvent(`[ACP IN] ${trimmed}`);
      } catch (error) {
        onError(`[ACP] Failed to parse JSON: ${error.message}`);
        continue;
      }

      await handleRequest(request);
    }
  }

  async function flushPendingRequests() {
    try {
      await processing;
    } catch (error) {
      onError(`[ACP] Pending request failed: ${error.message}`);
    }
  }

  async function start() {
    logBanner();
    logDebug('[ACP] Server started on stdio');
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      buffer += chunk;
      processing = processing.then(() => processBuffer()).catch((error) => {
        onError(`[ACP] Request processing failed: ${error.message}`);
      });
    });

    process.stdin.on('end', () => {
      endSeen = true;
      flushPendingRequests().finally(() => {
        onExit({ code: shuttingDown ? 0 : null, signal: null });
        maybeResolveIdle();
      });
    });

    process.on('SIGINT', () => {
      if (activeChild && !activeChild.killed) {
        activeChild.kill('SIGINT');
      }
    });

    process.on('SIGTERM', () => {
      if (activeChild && !activeChild.killed) {
        activeChild.kill('SIGTERM');
      }
      onExit({ code: 0, signal: 'SIGTERM' });
      process.exit(0);
    });

    process.stdin.resume();
    return processing;
  }

  return {
    start,
    sendNotification,
    _test: {
      extractPromptFromParams,
      flushPendingRequests,
      handleRequest,
      normalizeMessageContent,
      processBuffer,
      _setResolveWhenIdle: (resolve) => {
        resolveWhenIdle = resolve;
        maybeResolveIdle();
      },
    },
  };
}

async function startAcpServer(options) {
  const server = createAcpServer(options);
  await server.start();
  return new Promise((resolve) => {
    server._test._setResolveWhenIdle(resolve);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startAcpServer({
    cliPath: 'claude',
    env: process.env,
    shell: process.platform === 'win32',
    onError: (message) => process.stderr.write(`${message}\n`),
    onDebug: (message) => process.stderr.write(`${message}\n`),
  }).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}

export {
  createAcpServer,
  startAcpServer,
};
