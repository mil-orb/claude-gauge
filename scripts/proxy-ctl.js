#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SUPERVISOR_SCRIPT = path.join(__dirname, 'proxy-supervisor.js');
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

// Check if the port is already bound by another process
function isPortInUse(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(true));
    srv.once('listening', () => { srv.close(); resolve(false); });
    srv.listen(parseInt(port, 10), '127.0.0.1');
  });
}

async function start() {
  if (!fs.existsSync(SUPERVISOR_SCRIPT)) {
    console.error('[gauge-proxy] proxy-supervisor.js not found at', SUPERVISOR_SCRIPT);
    process.exit(1);
  }

  const existing = readPid();
  if (existing && isRunning(existing)) {
    console.log(`[gauge-proxy] already running (pid ${existing})`);
    return;
  }

  // Check if an orphan proxy is holding the port
  const portBusy = await isPortInUse(PORT);
  if (portBusy) {
    console.log(`[gauge-proxy] port ${PORT} already in use (orphan proxy or another process)`);
    // Clean stale PID file since the supervisor is gone
    try { fs.unlinkSync(PID_FILE); } catch {}
    return;
  }

  // Clean stale PID file
  try { fs.unlinkSync(PID_FILE); } catch {}

  const child = spawn(process.execPath, [SUPERVISOR_SCRIPT, PORT], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });

  child.on('error', (err) => {
    console.error(`[gauge-proxy] failed to start: ${err.message}`);
  });

  if (child.pid) {
    // Write supervisor PID — stop kills supervisor, which kills proxy child
    try { fs.writeFileSync(PID_FILE, String(child.pid)); } catch {}
    child.unref();
    console.log(`[gauge-proxy] started (pid ${child.pid}) on port ${PORT}`);
  }
}

function stop() {
  const pid = readPid();
  if (pid && isRunning(pid)) {
    try {
      process.kill(pid, 'SIGTERM');
      console.log(`[gauge-proxy] stopped (pid ${pid})`);
    } catch (err) {
      console.error(`[gauge-proxy] failed to stop: ${err.message}`);
    }
  } else if (!pid) {
    console.log('[gauge-proxy] no PID file found');
  } else {
    console.log('[gauge-proxy] stale PID file (process already gone)');
  }
  try { fs.unlinkSync(PID_FILE); } catch {}
}

async function status() {
  const pid = readPid();
  const portBusy = await isPortInUse(PORT);

  if (pid && isRunning(pid)) {
    console.log(`[gauge-proxy] running (pid ${pid}) on port ${PORT}`);
  } else if (portBusy) {
    console.log(`[gauge-proxy] port ${PORT} in use (orphan proxy — PID file stale or missing)`);
    try { fs.unlinkSync(PID_FILE); } catch {}
  } else {
    console.log('[gauge-proxy] not running');
    if (pid) try { fs.unlinkSync(PID_FILE); } catch {}
  }
}

const cmd = process.argv[2];
if (cmd === 'start') start();
else if (cmd === 'stop') stop();
else if (cmd === 'status') status();
else console.log('Usage: proxy-ctl.js <start|stop|status>');
