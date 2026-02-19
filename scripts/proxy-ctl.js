#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const PROXY_SCRIPT = path.join(__dirname, '..', 'proxy.js');
const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const PID_FILE = path.join(CLAUDE_DIR, 'gauge-proxy.pid');
const PORT = process.env.GAUGE_PROXY_PORT || '3456';

function readPid() {
  try {
    const raw = fs.readFileSync(PID_FILE, 'utf8').trim();
    const pid = parseInt(raw, 10);
    if (!Number.isInteger(pid) || pid <= 0 || pid > 4194304) return null;
    return pid;
  } catch {
    return null;
  }
}

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function start() {
  if (!fs.existsSync(PROXY_SCRIPT)) {
    console.error('[gauge-proxy] proxy.js not found at', PROXY_SCRIPT);
    process.exit(1);
  }

  const existing = readPid();
  if (existing && isRunning(existing)) {
    console.log(`[gauge-proxy] already running (pid ${existing})`);
    return;
  }

  // Clean stale PID file
  try { fs.unlinkSync(PID_FILE); } catch {}

  const child = spawn(process.execPath, [PROXY_SCRIPT, PORT], {
    detached: true,
    stdio: 'ignore',
  });

  child.on('error', (err) => {
    console.error(`[gauge-proxy] failed to start: ${err.message}`);
  });

  if (child.pid) {
    child.unref();
    console.log(`[gauge-proxy] started (pid ${child.pid}) on port ${PORT}`);
  }
}

function stop() {
  const pid = readPid();
  if (!pid) {
    console.log('[gauge-proxy] not running (no PID file)');
    return;
  }
  if (!isRunning(pid)) {
    console.log('[gauge-proxy] not running (stale PID file)');
    try { fs.unlinkSync(PID_FILE); } catch {}
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
    console.log(`[gauge-proxy] stopped (pid ${pid})`);
  } catch (err) {
    console.error(`[gauge-proxy] failed to stop: ${err.message}`);
  }
  try { fs.unlinkSync(PID_FILE); } catch {}
}

function status() {
  const pid = readPid();
  if (!pid) {
    console.log('[gauge-proxy] not running');
    return;
  }
  if (isRunning(pid)) {
    console.log(`[gauge-proxy] running (pid ${pid}) on port ${PORT}`);
  } else {
    console.log('[gauge-proxy] not running (stale PID file)');
    try { fs.unlinkSync(PID_FILE); } catch {}
  }
}

const cmd = process.argv[2];
if (cmd === 'start') start();
else if (cmd === 'stop') stop();
else if (cmd === 'status') status();
else console.log('Usage: proxy-ctl.js <start|stop|status>');
