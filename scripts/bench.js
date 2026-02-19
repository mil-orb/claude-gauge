#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCRIPT_PATH = path.join(__dirname, '..', 'statusline.js');
const PROJECT_DIR = path.join(__dirname, '..');
const JSON_INPUT = JSON.stringify({
  context_window: {
    used_percentage: 62, context_window_size: 200000,
    current_usage: { input_tokens: 124000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  },
  cost: { total_cost_usd: 1.23, total_duration_ms: 1620000, total_lines_added: 150, total_lines_removed: 50 },
});

function bench(label, runs, fn) {
  for (let i = 0; i < 3; i++) fn(); // warmup
  const times = [];
  for (let i = 0; i < runs; i++) {
    const start = process.hrtime.bigint();
    fn();
    const end = process.hrtime.bigint();
    times.push(Number(end - start) / 1e6);
  }
  times.sort((a, b) => a - b);
  const min = times[0];
  const median = times[Math.floor(times.length / 2)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`${label}`);
  console.log(`  min=${min.toFixed(1)}ms  median=${median.toFixed(1)}ms  avg=${avg.toFixed(1)}ms  p95=${p95.toFixed(1)}ms\n`);
  return { label, min, median, avg, p95 };
}

console.log('=== STATUSLINE.JS LATENCY BENCHMARKS ===\n');

const results = [];

// 1. Node.js startup baseline
results.push(bench('1. Node.js startup (baseline)', 20, () => {
  execFileSync('node', ['-e', ''], { encoding: 'utf8', timeout: 5000 });
}));

// 2. Node startup + require(fs, path)
results.push(bench('2. Node + require(fs, path)', 20, () => {
  execFileSync('node', ['-e', "require('fs');require('path');"], { encoding: 'utf8', timeout: 5000 });
}));

// 3. Node startup + stdin read + JSON parse
results.push(bench('3. Node + stdin + JSON.parse', 20, () => {
  execFileSync('node', ['-e', `let d='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>JSON.parse(d));process.stdin.resume();`],
    { input: JSON_INPUT, encoding: 'utf8', timeout: 5000 });
}));

// 4. Full statusline.js E2E
results.push(bench('4. Full statusline.js E2E', 20, () => {
  execFileSync('node', [SCRIPT_PATH], { input: JSON_INPUT, encoding: 'utf8', timeout: 5000 });
}));

// 5. Config read cost (isolated)
results.push(bench('5. fs.readFileSync(config.json)', 20, () => {
  execFileSync('node', ['-e', `require('fs').readFileSync('${path.join(PROJECT_DIR, 'config.json').replace(/\\/g, '/')}','utf8');`],
    { encoding: 'utf8', timeout: 5000 });
}));

console.log('=== DASHBOARD OVERHEAD SIMULATION ===\n');

const logPath = path.join(PROJECT_DIR, '.usage-bench.jsonl').replace(/\\/g, '/');
const ctxPath = path.join(PROJECT_DIR, '.ctx-bench.json').replace(/\\/g, '/');
fs.writeFileSync(ctxPath, JSON.stringify({ repo: 'mil-orb/claude-gauge', branch: 'master', commit: 'd956766' }));

// 6. JSONL append
results.push(bench('6. fs.appendFileSync (JSONL entry)', 20, () => {
  execFileSync('node', ['-e', `require('fs').appendFileSync('${logPath}',JSON.stringify({ts:Date.now(),pct:62})+'\\n');`],
    { encoding: 'utf8', timeout: 5000 });
}));

// 7. Read cached context
results.push(bench('7. Read session-context.json', 20, () => {
  execFileSync('node', ['-e', `try{JSON.parse(require('fs').readFileSync('${ctxPath}','utf8'));}catch{}`],
    { encoding: 'utf8', timeout: 5000 });
}));

// 8. Full E2E + dashboard overhead (cache read + JSONL append)
results.push(bench('8. Full E2E + dashboard overhead', 20, () => {
  const wrapper = `
    require('${SCRIPT_PATH.replace(/\\/g, '/')}');
    const fs = require('fs');
    setTimeout(() => {
      try { JSON.parse(fs.readFileSync('${ctxPath}', 'utf8')); } catch {}
      fs.appendFileSync('${logPath}', JSON.stringify({ts:Date.now(),pct:62})+'\\n');
    }, 0);
  `;
  execFileSync('node', ['-e', wrapper], { input: JSON_INPUT, encoding: 'utf8', timeout: 5000 });
}));

// Cleanup
try { fs.unlinkSync(logPath); } catch {}
try { fs.unlinkSync(ctxPath); } catch {}

console.log('=== COST BREAKDOWN ===\n');
const baseline = results[0].median;
const full = results[3].median;
const withDash = results[7].median;
const overhead = withDash - full;
console.log(`Node.js startup:        ${baseline.toFixed(1)}ms`);
console.log(`Statusline logic:       ${(full - baseline).toFixed(1)}ms`);
console.log(`Dashboard overhead:     ${overhead.toFixed(1)}ms`);
console.log(`Total with dashboard:   ${withDash.toFixed(1)}ms`);
console.log(`Overhead %:             ${((overhead / full) * 100).toFixed(1)}%`);
