#!/usr/bin/env node
'use strict';

// GIF generator for claude-gauge README
// Generates realistic session-like ANSI output -> HTML frames

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'statusline.js');
const OUT_DIR = path.join(__dirname, '..', 'assets');
const FRAME_DIR = path.join(OUT_DIR, 'frames');

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(FRAME_DIR, { recursive: true });

// Simulate realistic session data at a given point in time
function sessionData(step, totalSteps) {
  const progress = step / totalSteps;
  const pct = Math.min(100, Math.round(progress * 85 + Math.sin(progress * Math.PI) * 10));
  const tokens = Math.round(progress * 170000);
  const cost = progress * 3.20;
  const durationMs = Math.round(progress * 2700000);
  const linesAdded = Math.round(progress * 340 + Math.sin(progress * 4) * 30);
  const linesRemoved = Math.round(progress * 85 + Math.cos(progress * 3) * 15);

  // Rate limit utilization: API returns fractions (0–1), grows from ~1% to ~40%
  const rl5h = Math.max(0.005, progress * 0.38 + Math.sin(progress * Math.PI * 2) * 0.03);
  const rl7d = Math.max(0.003, progress * 0.12 + Math.sin(progress * Math.PI) * 0.02);

  return {
    stdin: {
      context_window: {
        used_percentage: pct,
        context_window_size: 200000,
        current_usage: { input_tokens: tokens, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      },
      cost: {
        total_cost_usd: cost,
        total_duration_ms: durationMs,
        total_lines_added: Math.max(0, linesAdded),
        total_lines_removed: Math.max(0, linesRemoved),
      },
    },
    rateLimit: {
      '5h': Math.round(rl5h * 100) / 100,
      '7d': Math.round(rl7d * 100) / 100,
      tokens_limit: null,
      tokens_remaining: null,
      status: 'active',
      ts: Date.now(),
    },
    sessionTokens: Math.round(progress * 170000),
  };
}

// Generate fake JSONL content with token usage data
function fakeJsonl(totalTokens) {
  if (!totalTokens) return '';
  const lines = [];
  const count = Math.min(10, Math.max(1, Math.ceil(totalTokens / 5000)));
  const perMsg = Math.ceil(totalTokens / count);
  for (let i = 0; i < count; i++) {
    lines.push(JSON.stringify({
      type: 'assistant',
      message: {
        usage: {
          input_tokens: Math.round(perMsg * 0.7),
          output_tokens: Math.round(perMsg * 0.3),
        },
      },
    }));
  }
  return lines.join('\n');
}

function genOutput(data, opts = {}) {
  const display = opts.display || 'bar';
  const color = opts.color || 'gradient';
  const cfgOverride = JSON.stringify({
    display, color, bar_size: 30,
    show_cost: true, show_duration: true, show_lines: false,
    show_rate_limit: true,
  });

  const rlJson = JSON.stringify(data.rateLimit);
  const jsonlContent = fakeJsonl(data.sessionTokens);

  // Wrapper that mocks filesystem calls so statusline.js sees:
  // - config.json → our override
  // - gauge-rate-limits.json → fake rate limit data (lstatSync + readFileSync)
  // - JSONL session files → fake token data (readdirSync + statSync + readFileSync)
  const wrapper = `
    const fs = require('node:fs');
    const path = require('node:path');
    const os = require('node:os');

    const origReadFileSync = fs.readFileSync;
    const origLstatSync = fs.lstatSync;
    const origReaddirSync = fs.readdirSync;
    const origStatSync = fs.statSync;

    const RL_JSON = ${JSON.stringify(rlJson)};
    const FAKE_JSONL = ${JSON.stringify(jsonlContent)};
    const CFG_JSON = ${JSON.stringify(cfgOverride)};
    const PROJECTS = path.join(os.homedir(), '.claude', 'projects');

    fs.readFileSync = function(p, enc) {
      if (typeof p === 'string') {
        if (p.endsWith('config.json')) return CFG_JSON;
        if (p.includes('gauge-rate-limits')) return RL_JSON;
        if (p.endsWith('.jsonl')) return FAKE_JSONL;
      }
      return origReadFileSync.call(this, p, enc);
    };

    fs.lstatSync = function(p) {
      if (typeof p === 'string' && p.includes('gauge-rate-limits')) {
        return { isFile: () => true, isSymbolicLink: () => false };
      }
      return origLstatSync.call(this, p);
    };

    fs.readdirSync = function(p) {
      if (typeof p === 'string' && p === PROJECTS) return ['demo-project'];
      if (typeof p === 'string' && p.endsWith('demo-project')) return FAKE_JSONL ? ['session.jsonl'] : [];
      return origReaddirSync.call(this, p);
    };

    fs.statSync = function(p) {
      if (typeof p === 'string' && p.endsWith('.jsonl')) {
        return { size: FAKE_JSONL.length, mtimeMs: Date.now() };
      }
      return origStatSync.call(this, p);
    };

    require(${JSON.stringify(SCRIPT)});
  `;
  try {
    return execFileSync('node', ['-e', wrapper], {
      input: JSON.stringify(data.stdin),
      encoding: 'utf8',
      timeout: 5000,
    });
  } catch {
    return '';
  }
}

function ansiToHtml(ansi) {
  let html = '';
  let i = 0;
  let inSpan = false;
  while (i < ansi.length) {
    if (ansi[i] === '\x1b' && ansi[i + 1] === '[') {
      let j = i + 2;
      while (j < ansi.length && ansi[j] !== 'm') j++;
      const code = ansi.slice(i + 2, j);
      i = j + 1;
      if (code === '0') {
        if (inSpan) { html += '</span>'; inSpan = false; }
      } else if (code === '2') {
        if (inSpan) html += '</span>';
        html += '<span style="opacity:0.5">';
        inSpan = true;
      } else if (code.startsWith('38;2;')) {
        const parts = code.split(';');
        if (inSpan) html += '</span>';
        html += `<span style="color:rgb(${parts[2]},${parts[3]},${parts[4]})">`;
        inSpan = true;
      }
    } else {
      const ch = ansi[i];
      html += ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '&' ? '&amp;' : ch;
      i++;
    }
  }
  if (inSpan) html += '</span>';
  return html;
}

// Mock Claude Code session lines that appear progressively
const sessionLines = [
  { type: 'user', text: '> Help me refactor the auth module' },
  { type: 'claude', text: '  I\'ll restructure the authentication module. Let me' },
  { type: 'claude', text: '  start by reading the current implementation.' },
  { type: 'blank' },
  { type: 'action', text: '  Read src/auth/handler.ts' },
  { type: 'action', text: '  Read src/auth/middleware.ts' },
  { type: 'action', text: '  Read src/auth/types.ts' },
  { type: 'blank' },
  { type: 'claude', text: '  I see several issues. The session logic is tightly' },
  { type: 'claude', text: '  coupled to the HTTP layer. I\'ll extract it into a' },
  { type: 'claude', text: '  standalone service with proper interfaces.' },
  { type: 'blank' },
  { type: 'action', text: '  Write src/auth/session-service.ts' },
  { type: 'action', text: '  Edit src/auth/handler.ts' },
  { type: 'action', text: '  Edit src/auth/middleware.ts' },
  { type: 'blank' },
  { type: 'claude', text: '  Now let me update the tests to match.' },
  { type: 'blank' },
  { type: 'action', text: '  Edit src/auth/__tests__/handler.test.ts' },
  { type: 'action', text: '  Write src/auth/__tests__/session-service.test.ts' },
  { type: 'blank' },
  { type: 'claude', text: '  Done. The auth module is now split into three layers:' },
  { type: 'claude', text: '  session service, request handler, and middleware.' },
];

// Returns visible session lines at a given progress (0-1)
function getSessionContent(progress) {
  const visibleCount = Math.floor(progress * sessionLines.length);
  // Show a scrolling window of the last N lines
  const maxVisible = 8;
  const lines = sessionLines.slice(Math.max(0, visibleCount - maxVisible), visibleCount);
  return lines.map(l => {
    if (l.type === 'blank') return '';
    if (l.type === 'user') return `<span style="color:#58a6ff;font-weight:bold">${esc(l.text)}</span>`;
    if (l.type === 'action') return `<span style="color:#8b949e">${esc(l.text)}</span>`;
    return `<span style="color:#c9d1d9">${esc(l.text)}</span>`;
  }).join('\n');
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildSessionHtml(gaugeAnsi, sessionContent) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #1a1a2e; display: flex; align-items: center; justify-content: center; height: 100vh; }
  .terminal {
    background: #0d1117;
    border-radius: 8px;
    padding: 16px 20px;
    font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace;
    font-size: 14px;
    line-height: 1.6;
    color: #c9d1d9;
    border: 1px solid #30363d;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    white-space: pre;
    width: 580px;
  }
  .session { min-height: 180px; }
  .divider { border-top: 1px solid #21262d; margin: 10px 0 8px; }
  .gauge { font-size: 13px; }
</style></head><body>
  <div class="terminal">
    <div class="session">${sessionContent}</div>
    <div class="divider"></div>
    <div class="gauge">${ansiToHtml(gaugeAnsi)}</div>
  </div>
</body></html>`;
}

function buildHtml(ansiContent, label) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #1a1a2e; display: flex; align-items: center; justify-content: center; height: 100vh; }
  .terminal {
    background: #0d1117;
    border-radius: 8px;
    padding: 16px 20px;
    font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace;
    font-size: 15px;
    line-height: 1.5;
    color: #c9d1d9;
    border: 1px solid #30363d;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    white-space: pre;
  }
  .label {
    color: #8b949e;
    font-size: 11px;
    margin-bottom: 6px;
    letter-spacing: 0.5px;
  }
</style></head><body>
  <div class="terminal"><div class="label">${label}</div><div class="content">${ansiToHtml(ansiContent)}</div></div>
</body></html>`;
}

async function main() {
  const manifest = {};
  const STEPS = 50;

  // GIF 1: Session demo — mock Claude Code session with gauge at the bottom
  console.log('Generating session-demo frames...');
  manifest['session-demo'] = [];
  for (let step = 0; step <= STEPS; step++) {
    const data = sessionData(step, STEPS);
    const progress = step / STEPS;
    const ansi = genOutput(data, { display: 'bar', color: 'gradient' });
    if (!ansi) continue;
    const sessionContent = getSessionContent(progress);
    const fname = `session-${String(step).padStart(3, '0')}.html`;
    fs.writeFileSync(path.join(FRAME_DIR, fname), buildSessionHtml(ansi, sessionContent));
    manifest['session-demo'].push({ step, file: fname });
  }
  console.log(`  ${manifest['session-demo'].length} frames`);

  // GIF 2: Display modes cycling at a realistic mid-session point
  console.log('Generating display-modes frames...');
  manifest['display-modes'] = [];
  const midData = sessionData(30, STEPS);
  for (const mode of ['bar', 'drain', 'dots', 'blocks', 'compact']) {
    const ansi = genOutput(midData, { display: mode, color: 'gradient' });
    if (!ansi) continue;
    const fname = `mode-${mode}.html`;
    fs.writeFileSync(path.join(FRAME_DIR, fname), buildHtml(ansi, `display: "${mode}"`));
    manifest['display-modes'].push({ mode, file: fname });
  }
  console.log(`  ${manifest['display-modes'].length} frames`);

  // GIF 3: Color schemes cycling at mid-session
  console.log('Generating color-schemes frames...');
  manifest['color-schemes'] = [];
  for (const scheme of ['gradient', 'ocean', 'ember', 'frost', 'retro', 'spectrum', 'mono']) {
    const ansi = genOutput(midData, { display: 'bar', color: scheme });
    if (!ansi) continue;
    const fname = `color-${scheme}.html`;
    fs.writeFileSync(path.join(FRAME_DIR, fname), buildHtml(ansi, `color: "${scheme}"`));
    manifest['color-schemes'].push({ scheme, file: fname });
  }
  console.log(`  ${manifest['color-schemes'].length} frames`);

  fs.writeFileSync(path.join(FRAME_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('Done. Frame manifest saved.');
}

main().catch(console.error);
