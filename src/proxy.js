import http from 'node:http';
import {Transform} from 'node:stream';
import {BASE_URL, DEFAULT_ANTHROPIC_VERSION} from './routerlab.js';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'content-encoding',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);
const PROXY_AUTH_HEADER = 'x-scionos-proxy-secret';
const MESSAGES_PATH = '/v1/messages';
const REASONING_CONTENT_BLOCK_TYPES = new Set(['thinking', 'redacted_thinking']);
const REASONING_DELTA_TYPES = new Set(['thinking_delta', 'signature_delta']);

function normalizeProxyHeaders(headers) {
  const normalizedHeaders = {};

  for (const [key, value] of Object.entries(headers ?? {})) {
    if (value === undefined || HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      continue;
    }

    normalizedHeaders[key] = value;
  }

  return normalizedHeaders;
}

function buildProxyRequestOptions(url, method, upstreamHeaders, validToken, bodyLength, timeout) {
  const headers = normalizeProxyHeaders(upstreamHeaders);
  deleteHeader(headers, 'authorization');
  deleteHeader(headers, PROXY_AUTH_HEADER);
  deleteHeader(headers, 'accept-encoding');
  headers['x-api-key'] = validToken;
  headers['anthropic-version'] ??= DEFAULT_ANTHROPIC_VERSION;

  if (bodyLength !== undefined) {
    headers['Content-Length'] = String(bodyLength);
  }

  return {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname + url.search,
    method,
    headers,
    timeout,
  };
}

function deleteHeader(headers, headerName) {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === headerName.toLowerCase()) {
      delete headers[key];
    }
  }
}

function isReasoningContentBlock(block) {
  return REASONING_CONTENT_BLOCK_TYPES.has(block?.type);
}

function sanitizeContentBlocks(content) {
  if (!Array.isArray(content)) {
    return {content, changed: false};
  }

  const sanitized = content.filter((block) => !isReasoningContentBlock(block));
  return {
    content: sanitized,
    changed: sanitized.length !== content.length,
  };
}

function sanitizeAnthropicCompatiblePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return {payload, changed: false};
  }

  let changed = false;
  const sanitizedPayload = {...payload};

  if (Array.isArray(payload.content)) {
    const sanitizedContent = sanitizeContentBlocks(payload.content);
    sanitizedPayload.content = sanitizedContent.content;
    changed ||= sanitizedContent.changed;
  }

  if (Array.isArray(payload.messages)) {
    sanitizedPayload.messages = payload.messages.map((message) => {
      if (!message || typeof message !== 'object') {
        return message;
      }

      const sanitizedContent = sanitizeContentBlocks(message.content);
      if (!sanitizedContent.changed) {
        return message;
      }

      changed = true;
      return {
        ...message,
        content: sanitizedContent.content,
      };
    });
  }

  return {payload: changed ? sanitizedPayload : payload, changed};
}

function getPreferredClaudeGptModel(requestedModel = '') {
  if (requestedModel.includes('haiku') || requestedModel.includes('mini')) {
    return 'claude-gpt-5.4-mini';
  }

  if (requestedModel.includes('opus')) {
    return 'claude-gpt-5.5';
  }

  return 'claude-gpt-5.4';
}

function getPreferredClaudeModel(requestedModel = '') {
  if (requestedModel.includes('haiku') || requestedModel.includes('mini')) {
    return 'claude-haiku-4-5-20251001';
  }

  if (requestedModel.includes('opus')) {
    return 'claude-opus-4-6';
  }

  return 'claude-sonnet-4-6';
}

function getPreferredDeepseekV4Model(requestedModel = '') {
  if (requestedModel.includes('opus') || requestedModel.includes('sonnet')) {
    return 'claude-deepseek-v4-pro';
  }

  return 'claude-deepseek-v4-flash';
}

function resolveMappedModel(targetModel, requestedModel = '', availableModels = []) {
  if (targetModel === 'claude') {
    const preferredModel = getPreferredClaudeModel(requestedModel);
    const availableClaudeModels = Array.isArray(availableModels)
      ? availableModels.filter((model) => model.startsWith('claude-') && !model.startsWith('claude-gpt-'))
      : [];

    if (availableClaudeModels.length === 0) {
      return preferredModel;
    }

    if (availableClaudeModels.includes(preferredModel)) {
      return preferredModel;
    }

    return (
      availableClaudeModels.find((model) => model === 'claude-sonnet-4-6')
      ?? availableClaudeModels[0]
      ?? preferredModel
    );
  }

  if (targetModel === 'claude-gpt-special') {
    return 'claude-gpt-5.4-sp';
  }

  if (targetModel === 'deepseek-v4-beta') {
    const preferredModel = getPreferredDeepseekV4Model(requestedModel);
    const availableDeepseekModels = Array.isArray(availableModels)
      ? availableModels.filter((model) => model === 'claude-deepseek-v4-pro' || model === 'claude-deepseek-v4-flash')
      : [];

    if (availableDeepseekModels.length === 0) {
      return preferredModel;
    }

    if (availableDeepseekModels.includes(preferredModel)) {
      return preferredModel;
    }

    return (
      availableDeepseekModels.find((model) => model === 'claude-deepseek-v4-flash')
      ?? availableDeepseekModels[0]
      ?? preferredModel
    );
  }

  if (targetModel !== 'aws') {
    if (targetModel !== 'claude-gpt') {
      return targetModel;
    }

    const preferredModel = getPreferredClaudeGptModel(requestedModel);
    const availableClaudeGptModels = Array.isArray(availableModels)
      ? availableModels.filter((model) => model.startsWith('claude-gpt-'))
      : [];

    if (availableClaudeGptModels.length === 0) {
      return preferredModel;
    }

    if (availableClaudeGptModels.includes(preferredModel)) {
      return preferredModel;
    }

    return (
      availableClaudeGptModels.find((model) => model === 'claude-gpt-5.4')
      ?? availableClaudeGptModels[0]
      ?? preferredModel
    );
  }

  if (requestedModel.includes('haiku')) {
    return 'aws-claude-haiku-4-5-20251001';
  }

  if (requestedModel.includes('opus')) {
    return 'aws-claude-opus-4-6';
  }

  return 'aws-claude-sonnet-4-6';
}

function writeJsonError(res, statusCode, payload) {
  if (res.headersSent) {
    return;
  }

  res.writeHead(statusCode);
  res.end(JSON.stringify(payload));
}

function getRequestPath(req) {
  return new URL(req.url, 'http://127.0.0.1').pathname;
}

function isAuthorizedProxyRequest(req, proxySecret) {
  if (!proxySecret) {
    return true;
  }

  return req.headers[PROXY_AUTH_HEADER] === proxySecret;
}

function isAllowedProxyRoute(req) {
  return req.method === 'POST' && getRequestPath(req) === MESSAGES_PATH;
}

async function handleMessageRequest(req, res, options) {
  const {availableModels = [], baseUrl, debug, onDebug, onError, targetModel, validToken} = options;
  const chunks = [];
  const maxSize = 100 * 1024 * 1024;
  let totalSize = 0;

  req.on('data', (chunk) => {
    totalSize += chunk.length;
    if (totalSize > maxSize) {
      writeJsonError(res, 413, {error: {message: 'Request too large'}});
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

      if (bodyJson?.model) {
        const preferredModel = resolveMappedModel(targetModel, bodyJson.model);
        const newModel = resolveMappedModel(targetModel, bodyJson.model, availableModels);
        if (debug) {
          onDebug(`[Proxy] Swapping model ${bodyJson.model} -> ${newModel}`);
          if (preferredModel !== newModel) {
            onDebug(`[Proxy] Fallback applied because ${preferredModel} is not available for this token`);
          }
        }

        bodyJson.model = newModel;
      }

      if (bodyJson) {
        bodyJson = sanitizeAnthropicCompatiblePayload(bodyJson).payload;
      }

      const payload = bodyJson ? JSON.stringify(bodyJson) : bodyBuffer;
      await forwardRequest(req, res, {
        baseUrl,
        bodyLength: typeof payload === 'string' ? Buffer.byteLength(payload) : payload.length,
        debug,
        onDebug,
        onError,
        payload,
        timeout: 120000,
        validToken,
      });
    } catch (error) {
      onError(`[Proxy Error] POST ${MESSAGES_PATH}: ${error.message}`);
      writeJsonError(res, 500, {
        error: {
          message: 'Scionos Proxy Error',
          details: error.message,
        },
      });
    }
  });
}

async function forwardRequest(req, res, options) {
  const {baseUrl, bodyLength, debug, onDebug, onError, payload, timeout, validToken} = options;
  const https = await import('node:https');
  const url = new URL(`${baseUrl}${req.url}`);
  const requestOptions = buildProxyRequestOptions(
    url,
    req.method,
    req.headers,
    validToken,
    bodyLength,
    timeout,
  );

  const proxyReq = https.request(requestOptions, (proxyRes) => {
    if (debug) {
      onDebug(`[Proxy] Upstream response status: ${proxyRes.statusCode}`);
    }

    handleProxyResponse(proxyRes, res, {debug, onDebug, onError});
  });

  proxyReq.on('error', (error) => {
    onError(`[Proxy Error] ${req.method} ${req.url}: ${error.message}`);
    if (debug && error.code) {
      onError(`[Proxy Error] Code: ${error.code}`);
    }

    writeJsonError(res, req.method === 'POST' && getRequestPath(req) === MESSAGES_PATH ? 500 : 502, {
      error: {
        message: req.method === 'POST' && getRequestPath(req) === MESSAGES_PATH
          ? 'Proxy Error'
          : 'Scionos Proxy Error: Failed to connect to upstream',
        details: error.message,
        ...(error.code ? {code: error.code} : {}),
      },
    });
  });

  proxyReq.on('timeout', () => {
    onError('[Proxy] Request timeout');
    proxyReq.destroy();
    writeJsonError(res, 504, {error: {message: 'Gateway Timeout'}});
  });

  if (payload !== undefined) {
    proxyReq.write(payload);
    proxyReq.end();
    if (debug) {
      onDebug('[Proxy] Request sent to upstream');
    }
    return;
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    req.pipe(proxyReq);
  } else {
    proxyReq.end();
  }
}

function handleProxyResponse(proxyRes, res, options = {}) {
  const contentType = String(proxyRes.headers['content-type'] ?? '');
  const contentEncoding = String(proxyRes.headers['content-encoding'] ?? '');

  if (contentEncoding && contentEncoding !== 'identity') {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
    return;
  }

  if (contentType.includes('text/event-stream')) {
    const headers = normalizeProxyHeaders(proxyRes.headers);
    deleteHeader(headers, 'content-length');
    deleteHeader(headers, 'content-encoding');
    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(createAnthropicSseSanitizer(options)).pipe(res);
    return;
  }

  if (!contentType.includes('application/json')) {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
    return;
  }

  const chunks = [];
  proxyRes.on('data', (chunk) => chunks.push(chunk));
  proxyRes.on('end', () => {
    const bodyBuffer = Buffer.concat(chunks);
    let bodyText = bodyBuffer.toString('utf8');

    try {
      const parsed = JSON.parse(bodyText);
      const sanitized = sanitizeAnthropicCompatiblePayload(parsed);
      if (sanitized.changed) {
        bodyText = JSON.stringify(sanitized.payload);
        if (options.debug) {
          options.onDebug('[Proxy] Removed upstream reasoning content blocks from JSON response');
        }
      }
    } catch {
      bodyText = bodyBuffer.toString('utf8');
    }

    const headers = normalizeProxyHeaders(proxyRes.headers);
    deleteHeader(headers, 'content-length');
    deleteHeader(headers, 'content-encoding');
    headers['content-length'] = String(Buffer.byteLength(bodyText));
    res.writeHead(proxyRes.statusCode, headers);
    res.end(bodyText);
  });

  proxyRes.on('error', (error) => {
    options.onError?.(`[Proxy Error] Upstream response read failed: ${error.message}`);
    res.destroy(error);
  });
}

function createAnthropicSseSanitizer(options = {}) {
  const state = {
    droppedIndexes: new Set(),
    indexMap: new Map(),
    loggedReasoningRemoval: false,
    nextIndex: 0,
  };
  let pending = '';

  return new Transform({
    transform(chunk, _encoding, callback) {
      pending += chunk.toString('utf8');
      const events = pending.split(/\r?\n\r?\n/);
      pending = events.pop() ?? '';

      for (const eventText of events) {
        const sanitized = sanitizeSseEvent(eventText, state, options);
        if (sanitized) {
          this.push(`${sanitized}\n\n`);
        }
      }

      callback();
    },
    flush(callback) {
      const sanitized = sanitizeSseEvent(pending, state, options);
      if (sanitized) {
        this.push(`${sanitized}\n\n`);
      }

      callback();
    },
  });
}

function sanitizeSseEvent(eventText, state, options = {}) {
  if (!eventText.trim()) {
    return '';
  }

  const lines = eventText.split(/\r?\n/);
  const dataLines = lines.filter((line) => line.startsWith('data:'));

  if (dataLines.length === 0) {
    return eventText;
  }

  const data = dataLines.map((line) => line.slice(5).trimStart()).join('\n');
  if (data === '[DONE]') {
    return eventText;
  }

  let parsed;
  try {
    parsed = JSON.parse(data);
  } catch {
    return eventText;
  }

  const sanitized = sanitizeAnthropicStreamEvent(parsed, state);
  if (!sanitized) {
    if (options.debug && !state.loggedReasoningRemoval) {
      options.onDebug('[Proxy] Removed upstream reasoning content block from stream response');
      state.loggedReasoningRemoval = true;
    }
    return '';
  }

  const outputLines = [];
  let wroteData = false;
  for (const line of lines) {
    if (line.startsWith('data:')) {
      if (!wroteData) {
        outputLines.push(`data: ${JSON.stringify(sanitized)}`);
        wroteData = true;
      }
      continue;
    }

    outputLines.push(line);
  }

  return outputLines.join('\n');
}

function sanitizeAnthropicStreamEvent(event, state) {
  if (!event || typeof event !== 'object') {
    return event;
  }

  if (event.type === 'message_start' && Array.isArray(event.message?.content)) {
    initializeStreamContentIndexMap(event.message.content, state);
    const sanitized = sanitizeAnthropicCompatiblePayload(event.message);
    return sanitized.changed ? {...event, message: sanitized.payload} : event;
  }

  if (event.type === 'content_block_start') {
    const originalIndex = event.index;

    if (isReasoningContentBlock(event.content_block)) {
      state.droppedIndexes.add(originalIndex);
      return null;
    }

    const mappedIndex = getOrCreateMappedContentIndex(originalIndex, state);
    return {...event, index: mappedIndex};
  }

  if (event.type === 'content_block_delta' || event.type === 'content_block_stop') {
    const originalIndex = event.index;
    if (state.droppedIndexes.has(originalIndex)) {
      return null;
    }

    if (REASONING_DELTA_TYPES.has(event.delta?.type)) {
      state.droppedIndexes.add(originalIndex);
      return null;
    }

    if (!state.indexMap.has(originalIndex)) {
      return event;
    }

    return {...event, index: state.indexMap.get(originalIndex)};
  }

  return event;
}

function initializeStreamContentIndexMap(content, state) {
  for (const [originalIndex, block] of content.entries()) {
    if (state.droppedIndexes.has(originalIndex) || state.indexMap.has(originalIndex)) {
      continue;
    }

    if (isReasoningContentBlock(block)) {
      state.droppedIndexes.add(originalIndex);
      continue;
    }

    state.indexMap.set(originalIndex, state.nextIndex);
    state.nextIndex += 1;
  }
}

function getOrCreateMappedContentIndex(originalIndex, state) {
  if (!state.indexMap.has(originalIndex)) {
    state.indexMap.set(originalIndex, state.nextIndex);
    state.nextIndex += 1;
  }

  return state.indexMap.get(originalIndex);
}

function startProxyServer(targetModel, validToken, options = {}) {
  const {
    availableModels = [],
    baseUrl = BASE_URL,
    debug = false,
    onDebug = () => {},
    onError = () => {},
    proxySecret = null,
  } = options;

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!isAuthorizedProxyRequest(req, proxySecret)) {
        writeJsonError(res, 403, {error: {message: 'Forbidden'}});
        return;
      }

      if (!isAllowedProxyRoute(req)) {
        writeJsonError(res, 404, {error: {message: 'Not Found'}});
        return;
      }

      handleMessageRequest(req, res, {
        availableModels,
        baseUrl,
        debug,
        onDebug,
        onError,
        targetModel,
        validToken,
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({server, url: `http://127.0.0.1:${address.port}`});
    });

    server.on('error', (error) => reject(error));
  });
}

export {
  buildProxyRequestOptions,
  normalizeProxyHeaders,
  PROXY_AUTH_HEADER,
  resolveMappedModel,
  sanitizeAnthropicCompatiblePayload,
  sanitizeAnthropicStreamEvent,
  startProxyServer,
};
