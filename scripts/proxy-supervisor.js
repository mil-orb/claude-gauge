#!/usr/bin/env node
'use strict';

// Watchdog supervisor for the gauge proxy.
// Spawns proxy.js as a child and restarts it on exit with exponential backoff.
// Backoff resets after 60 seconds of healthy uptime.

const { spawn } = require('node:child_process');
const path = require('node:path');

const PROXY_SCRIPT = path.join(__dirname, '..', 'proxy.js');
const PORT = process.argv[2] || '3456';

const MIN_BACKOFF = 1000;
const MAX_BACKOFF = 30000;
const HEALTHY_THRESHOLD = 60000;

let backoff = MIN_BACKOFF;
let lastStart = 0;
let stopping = false;
let child = null;

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
