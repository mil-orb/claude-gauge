#!/usr/bin/env node
'use strict';

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const PORT = parseInt(process.argv[2] || process.env.GAUGE_PROXY_PORT || '3456', 10);
const TARGET_HOST = 'api.anthropic.com';
const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const CACHE_FILE = path.join(CLAUDE_DIR, 'gauge-rate-limits.json');
const PID_FILE = path.join(CLAUDE_DIR, 'gauge-proxy.pid');
const MAX_BODY = 100 * 1024 * 1024; // 100 MB
const MAX_CONNECTIONS = 50;

// Hop-by-hop headers that must not be forwarded
const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'proxy-connection',
]);

// Ensure ~/.claude exists
try { fs.mkdirSync(CLAUDE_DIR, { recursive: true }); } catch {}

let activeConnections = 0;

function writeCache(headers) {
  const h5 = headers['anthropic-ratelimit-unified-5h-utilization'];
  const h7 = headers['anthropic-ratelimit-unified-7d-utilization'];
  if (h5 == null && h7 == null) return;

  const tokLimit = headers['anthropic-ratelimit-tokens-limit'];
  const tokRemain = headers['anthropic-ratelimit-tokens-remaining'];

  const parsed5h = h5 != null ? parseFloat(h5) : null;
  const parsed7d = h7 != null ? parseFloat(h7) : null;

  // Don't let a zero reading overwrite a recent non-zero value —
  // utilization can't drop to exactly 0 during an active session.
  if (parsed5h === 0) {
    try {
      const prev = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      if (typeof prev['5h'] === 'number' && prev['5h'] > 0 &&
          Date.now() - prev.ts < 5 * 60 * 1000) return;
    } catch { /* no previous cache, allow write */ }
  }

  const data = {
    '5h': Number.isFinite(parsed5h) ? parsed5h : null,
    '7d': Number.isFinite(parsed7d) ? parsed7d : null,
    tokens_limit: tokLimit != null ? parseInt(tokLimit, 10) : null,
    tokens_remaining: tokRemain != null ? parseInt(tokRemain, 10) : null,
    status: 'active',
    ts: Date.now(),
  };

  // Atomic write: temp file + rename
  const tmp = CACHE_FILE + '.tmp.' + process.pid;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, CACHE_FILE);
  } catch {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

function filterHeaders(raw) {
  const safe = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) safe[k] = v;
  }
  return safe;
}

const server = http.createServer((req, res) => {
  // Reject malformed paths
  if (!req.url.startsWith('/') || /[\x00-\x1f]/.test(req.url)) {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end('{"error":"bad_request"}');
    return;
  }

  // Connection limit
  if (activeConnections >= MAX_CONNECTIONS) {
    res.writeHead(429, { 'content-type': 'application/json' });
    res.end('{"error":"too_many_connections"}');
    return;
  }
  activeConnections++;

  // Body size enforcement — reject up front via Content-Length when available
  const contentLength = parseInt(req.headers['content-length'], 10);
  if (contentLength > MAX_BODY) {
    res.writeHead(413, { 'content-type': 'application/json' });
    res.end('{"error":"payload_too_large"}');
    activeConnections--;
    return;
  }

  // Streaming body size enforcement for chunked/unknown-length requests
  let bodyBytes = 0;
  let aborted = false;
  req.on('data', (chunk) => {
    bodyBytes += chunk.length;
    if (bodyBytes > MAX_BODY && !aborted) {
      aborted = true;
      req.destroy();
      if (!res.headersSent) res.writeHead(413, { 'content-type': 'application/json' });
      res.end('{"error":"payload_too_large"}');
    }
  });

  const opts = {
    hostname: TARGET_HOST,
    port: 443,
    path: req.url,
    method: req.method,
    headers: { ...filterHeaders(req.headers), host: TARGET_HOST },
  };

  const proxyReq = https.request(opts, (proxyRes) => {
    // Only cache rate limits from /v1/messages — other endpoints may return
    // stale/zero utilization values that overwrite the real reading.
    if (req.url.startsWith('/v1/messages')) writeCache(proxyRes.headers);
    res.writeHead(proxyRes.statusCode, filterHeaders(proxyRes.headers));
    proxyRes.on('error', (err) => {
      process.stderr.write(`[gauge-proxy] response stream error: ${err.message}\n`);
      if (!res.writableEnded) res.destroy();
    });
    // Stream through without buffering (critical for SSE)
    proxyRes.pipe(res);
  });

  proxyReq.setTimeout(300000, () => {
    proxyReq.destroy(new Error('upstream timeout'));
  });

  proxyReq.on('error', (err) => {
    process.stderr.write(`[gauge-proxy] upstream error: ${err.message}\n`);
    if (!res.headersSent && !res.writableEnded) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end('{"error":"proxy_error"}');
    }
  });

  res.on('close', () => { activeConnections--; });

  req.pipe(proxyReq);
});

// Write PID file only after server is actually listening
server.listen(PORT, '127.0.0.1', () => {
  if (!process.env.GAUGE_SUPERVISED) {
    fs.writeFileSync(PID_FILE, String(process.pid));
  }
  process.stderr.write(`[gauge-proxy] listening on 127.0.0.1:${PORT} → ${TARGET_HOST}\n`);
});

server.on('error', (err) => {
  process.stderr.write(`[gauge-proxy] server error: ${err.message}\n`);
  cleanup();
  process.exit(1);
});

function cleanup() {
  if (!process.env.GAUGE_SUPERVISED) {
    try { fs.unlinkSync(PID_FILE); } catch {}
  }
  server.close();
}

process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('SIGINT', () => { cleanup(); process.exit(0); });

// Crash guard — prevent unexpected errors from killing the proxy.
// The proxy has no meaningful state between requests, so continuing is safe.
process.on('uncaughtException', (err) => {
  try { process.stderr.write(`[gauge-proxy] uncaught: ${err.message}\n`); } catch {}
});
process.on('unhandledRejection', (reason) => {
  try { process.stderr.write(`[gauge-proxy] unhandled rejection: ${reason}\n`); } catch {}
});
