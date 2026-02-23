#!/usr/bin/env node
'use strict';

// Watchdog supervisor for the gauge proxy.
// Spawns proxy.js as a child and restarts it on exit with exponential backoff.
// Backoff resets after 60 seconds of healthy uptime.
// Shuts down when no Claude Code processes are detected.

const { spawn, execSync, execFileSync } = require('node:child_process');
const path = require('node:path');

const PROXY_SCRIPT = path.join(__dirname, '..', 'proxy.js');
const PORT = process.argv[2] || '3456';

const MIN_BACKOFF = 500;
const MAX_BACKOFF = 5000;
const HEALTHY_THRESHOLD = 30000;

const POLL_INTERVAL = 30000;   // 30s between checks
const REQUIRED_FAILS = 2;      // 2 consecutive all-dead checks before shutdown

let backoff = MIN_BACKOFF;
let lastStart = 0;
let stopping = false;
let child = null;
let pollTimer = null;
let consecutiveFails = 0;

// --- Claude Code process detection (no PID registry needed) ---

function claudeIsRunning() {
  try {
    if (process.platform === 'win32') {
      // tasklist.exe /FI can take 15+ seconds on some Windows machines,
      // exceeding the timeout and causing false negatives. PowerShell
      // Get-Process is consistently fast (~350ms).
      const out = execFileSync('powershell.exe', [
        '-NoProfile', '-Command',
        'if(Get-Process claude -EA 0){echo 1}else{echo 0}',
      ], { encoding: 'utf8', timeout: 5000, windowsHide: true });
      return out.trim() === '1';
    }
    // macOS / Linux
    execSync('pgrep -x claude', { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function checkSessions() {
  if (claudeIsRunning()) {
    consecutiveFails = 0;
    return;
  }

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
  if (child && child.pid) {
    try {
      if (process.platform === 'win32') {
        // On Windows, taskkill /T /F reliably kills the entire process tree.
        // child.kill('SIGTERM') maps to TerminateProcess but is less reliable
        // when the supervisor itself is about to exit immediately after.
        execSync(`taskkill /T /F /PID ${child.pid}`, {
          encoding: 'utf8', timeout: 5000, windowsHide: true,
        });
      } else {
        child.kill('SIGTERM');
      }
    } catch {}
  }
}

process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('SIGINT', () => { cleanup(); process.exit(0); });

// Supervisor must not crash — but log for debugging
process.on('uncaughtException', (err) => {
  try { process.stderr.write(`[gauge-supervisor] uncaught: ${err.message}\n`); } catch {}
});
process.on('unhandledRejection', (reason) => {
  try { process.stderr.write(`[gauge-supervisor] unhandled rejection: ${reason}\n`); } catch {}
});

startProxy();

// Start session polling after proxy is up — unref so it won't keep process alive after cleanup
pollTimer = setInterval(checkSessions, POLL_INTERVAL);
pollTimer.unref();
