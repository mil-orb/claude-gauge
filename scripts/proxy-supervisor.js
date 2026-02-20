#!/usr/bin/env node
'use strict';

// Watchdog supervisor for the gauge proxy.
// Spawns proxy.js as a child and restarts it on exit with exponential backoff.
// Backoff resets after 60 seconds of healthy uptime.
// Polls session registry — shuts down when all Claude Code sessions are gone.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PROXY_SCRIPT = path.join(__dirname, '..', 'proxy.js');
const PORT = process.argv[2] || '3456';

const MIN_BACKOFF = 500;
const MAX_BACKOFF = 5000;
const HEALTHY_THRESHOLD = 30000;

// Session registry polling
const SESSION_REGISTRY = path.join(os.homedir(), '.claude', 'gauge-sessions');
const POLL_INTERVAL = 30000;   // 30s between checks
const REQUIRED_FAILS = 2;      // 2 consecutive all-dead checks before shutdown

let backoff = MIN_BACKOFF;
let lastStart = 0;
let stopping = false;
let child = null;
let pollTimer = null;
let consecutiveFails = 0;

// --- Session registry monitoring ---

function readRegistry() {
  try {
    const content = fs.readFileSync(SESSION_REGISTRY, 'utf8');
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => /^\d+$/.test(line))
      .map(Number);
  } catch {
    return [];
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function checkSessions() {
  const pids = readRegistry();

  // Empty registry = neutral (startup race, or no sessions registered yet)
  if (pids.length === 0) {
    consecutiveFails = 0;
    return;
  }

  const anyAlive = pids.some(isAlive);

  if (anyAlive) {
    consecutiveFails = 0;
    return;
  }

  // All PIDs dead
  consecutiveFails++;
  if (consecutiveFails >= REQUIRED_FAILS) {
    cleanup();
    process.exit(0);
  }
}

// --- Proxy lifecycle ---

function startProxy() {
  if (stopping) return;

  lastStart = Date.now();
  child = spawn(process.execPath, [PROXY_SCRIPT, PORT], {
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, GAUGE_SUPERVISED: '1' },
  });

  child.on('error', () => {});

  child.on('exit', () => {
    child = null;
    if (stopping) return;

    const uptime = Date.now() - lastStart;
    if (uptime > HEALTHY_THRESHOLD) {
      backoff = MIN_BACKOFF;
    } else {
      backoff = Math.min(backoff * 2, MAX_BACKOFF);
    }

    setTimeout(startProxy, backoff);
  });
}

function cleanup() {
  stopping = true;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (child) {
    try { child.kill('SIGTERM'); } catch {}
  }
}

process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('SIGINT', () => { cleanup(); process.exit(0); });

// Supervisor must not crash
process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

startProxy();

// Start session polling after proxy is up — unref so it won't keep process alive after cleanup
pollTimer = setInterval(checkSessions, POLL_INTERVAL);
pollTimer.unref();
