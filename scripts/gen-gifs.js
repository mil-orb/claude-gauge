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
  // Context usage grows non-linearly (fast early, plateaus, then spikes)
  const pct = Math.min(100, Math.round(progress * 85 + Math.sin(progress * Math.PI) * 10));
  // Tokens climb steadily
  const tokens = Math.round(progress * 170000);
  // Cost accumulates
  const cost = progress * 3.20;
  // Duration grows linearly (simulating ~45min session)
  const durationMs = Math.round(progress * 2700000);
  // Lines change in bursts
  const linesAdded = Math.round(progress * 340 + Math.sin(progress * 4) * 30);
  const linesRemoved = Math.round(progress * 85 + Math.cos(progress * 3) * 15);

  return {
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
  };
}

function genOutput(jsonInput, opts = {}) {
  const display = opts.display || 'bar';
  const color = opts.color || 'gradient';
  const cfgOverride = JSON.stringify({
    display, color, bar_width: 30,
    show_cost: true, show_duration: true, show_lines: false,
  });
  const wrapper = `
    const fs = require('fs');
    const origRead = fs.readFileSync;
    fs.readFileSync = function(p, enc) {
      if (typeof p === 'string' && p.endsWith('config.json')) return ${JSON.stringify(cfgOverride)};
      return origRead.call(this, p, enc);
    };
    require(${JSON.stringify(SCRIPT)});
  `;
  try {
    return execFileSync('node', ['-e', wrapper], {
      input: JSON.stringify(jsonInput),
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

  // GIF 1: Session demo — realistic session with climbing usage/cost/duration
  console.log('Generating session-demo frames...');
  manifest['session-demo'] = [];
  for (let step = 0; step <= STEPS; step++) {
    const data = sessionData(step, STEPS);
    const ansi = genOutput(data, { display: 'bar', color: 'gradient' });
    if (!ansi) continue;
    const fname = `session-${String(step).padStart(3, '0')}.html`;
    fs.writeFileSync(path.join(FRAME_DIR, fname), buildHtml(ansi, 'claude-gauge'));
    manifest['session-demo'].push({ step, file: fname });
  }
  console.log(`  ${manifest['session-demo'].length} frames`);

  // GIF 2: Display modes cycling at a realistic mid-session point
  console.log('Generating display-modes frames...');
  manifest['display-modes'] = [];
  const midData = sessionData(30, STEPS); // ~60% through session
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
  for (const scheme of ['gradient', 'ocean', 'ember', 'frost']) {
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
