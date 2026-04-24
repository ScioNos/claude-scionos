import http from 'node:http';
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
  delete headers.authorization;
  delete headers[PROXY_AUTH_HEADER];
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

function getPreferredClaudeGptModel(requestedModel = '') {
  if (requestedModel.includes('haiku') || requestedModel.includes('mini')) {
    return 'claude-gpt-5.4-mini';
  }

  if (requestedModel.includes('opus')) {
    return 'claude-gpt-5.5';
  }

  return 'claude-gpt-5.4';
}

function resolveMappedModel(targetModel, requestedModel = '', availableModels = []) {
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

    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
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
  startProxyServer,
};
