#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// --- ANSI colors ---
const C = {
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  orange: '\x1b[38;5;208m',
  red:    '\x1b[31m',
  dim:    '\x1b[2m',
  reset:  '\x1b[0m',
};

// --- Read stdin with timeout ---
function readStdin(timeoutMs) {
  return new Promise((resolve) => {
    let data = '';
    const timer = setTimeout(() => {
      process.stdin.destroy();
      resolve(data);
    }, timeoutMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => { clearTimeout(timer); resolve(data); });
    process.stdin.on('error', () => { clearTimeout(timer); resolve(data); });
    process.stdin.resume();
  });
}

// --- Load config ---
function loadConfig() {
  const defaults = { display_mode: 'bar', bar_width: 20, show_duration: true, currency_rate: null };
  try {
    const cfgPath = path.join(__dirname, 'config.json');
    return { ...defaults, ...JSON.parse(fs.readFileSync(cfgPath, 'utf8')) };
  } catch {
    return defaults;
  }
}

// --- Pick color by percentage ---
function pickColor(pct) {
  if (pct >= 91) return C.red;
  if (pct >= 76) return C.orange;
  if (pct >= 51) return C.yellow;
  return C.green;
}

// --- Format token count: 1500000 -> "1.5m", 96000 -> "96k", 500 -> "500" ---
function fmtTokens(n) {
  if (n >= 1000000) {
    const d = Math.floor(n / 100000);
    const whole = Math.floor(d / 10);
    const frac = d % 10;
    return frac === 0 ? `${whole}m` : `${whole}.${frac}m`;
  }
  if (n >= 1000) {
    const d = Math.floor(n / 100);
    const whole = Math.floor(d / 10);
    const frac = d % 10;
    return frac === 0 ? `${whole}k` : `${whole}.${frac}k`;
  }
  return String(n);
}

// --- Format duration: ms -> "5s", "12m", "1h30m" ---
function fmtDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m`;
  return `${totalSec}s`;
}

// --- Detect currency symbol from locale ---
function detectCurrencySymbol() {
  const loc = process.env.LC_MONETARY || process.env.LC_ALL || process.env.LANG || 'en_US';
  if (/^(en_GB|cy_GB)/.test(loc)) return '\u00a3';
  if (/^(en_AU|en_NZ)/.test(loc)) return 'A$';
  if (/^(en_CA|fr_CA)/.test(loc)) return 'C$';
  if (/^ja_JP/.test(loc)) return '\u00a5';
  if (/^zh_CN/.test(loc)) return '\u00a5';
  if (/^ko_KR/.test(loc)) return '\u20a9';
  if (/^(hi_IN|en_IN)/.test(loc)) return '\u20b9';
  if (/^pt_BR/.test(loc)) return 'R$';
  if (/_CH/.test(loc)) return 'CHF';
  if (/^(de_|fr_FR|es_ES|it_|nl_|pt_PT|fi_|el_|sk_|sl_|et_|lv_|lt_)/.test(loc)) return '\u20ac';
  if (/^(da_DK|sv_SE|nb_NO|nn_NO)/.test(loc)) return 'kr';
  if (/^pl_PL/.test(loc)) return 'z\u0142';
  if (/^cs_CZ/.test(loc)) return 'K\u010d';
  if (/^hu_HU/.test(loc)) return 'Ft';
  if (/^ro_RO/.test(loc)) return 'lei';
  if (/^tr_TR/.test(loc)) return '\u20ba';
  return '$';
}

// --- Main ---
async function main() {
  const input = await readStdin(2000);

  if (!input.trim()) {
    process.stdout.write(`${C.dim}-- no data --${C.reset}`);
    return;
  }

  let j;
  try {
    j = JSON.parse(input);
  } catch {
    process.stdout.write(`${C.dim}-- parse error --${C.reset}`);
    return;
  }

  const cfg = loadConfig();
  const cw = j.context_window || {};
  const cu = cw.current_usage || {};
  const cost = j.cost || {};

  // Extract values
  let pct = typeof cw.used_percentage === 'number' ? Math.floor(cw.used_percentage) : -1;
  const ctxSize = cw.context_window_size || 200000;
  const inputTokens = (cu.input_tokens || 0) + (cu.cache_creation_input_tokens || 0) + (cu.cache_read_input_tokens || 0);
  const costUsd = cost.total_cost_usd || 0;
  const durationMs = cost.total_duration_ms || 0;

  // Handle null/early state
  if (pct === -1) {
    process.stdout.write(`${C.dim}-- waiting --${C.reset}`);
    return;
  }

  // Clamp
  pct = Math.max(0, Math.min(100, pct));

  const color = pickColor(pct);
  const tokensFmt = fmtTokens(inputTokens);
  const ctxFmt = fmtTokens(ctxSize);

  // Currency
  let costFmt;
  if (typeof cfg.currency_rate === 'number' && cfg.currency_rate > 0) {
    const sym = detectCurrencySymbol();
    costFmt = `${sym}${(costUsd * cfg.currency_rate).toFixed(2)}`;
  } else {
    costFmt = `$${costUsd.toFixed(2)}`;
  }

  // Duration
  let durationSuffix = '';
  if (cfg.show_duration !== false) {
    durationSuffix = ` \u00b7 ${fmtDuration(durationMs)}`;
  }

  // Render
  if (cfg.display_mode === 'compact') {
    process.stdout.write(`${color}\u25cf${C.reset} ${pct}% ${tokensFmt}/${ctxFmt} ${costFmt}${durationSuffix}`);
  } else {
    const width = cfg.bar_width || 20;
    const filled = Math.floor(pct * width / 100);
    const remainder = (pct * width * 10 / 100) % 10;

    let bar = '\u2588'.repeat(filled);

    let edgeChars = 0;
    if (remainder > 0 && filled < width) {
      bar += remainder >= 5 ? '\u2593' : '\u2592';
      edgeChars = 1;
    }

    const empty = width - filled - edgeChars;
    bar += '\u2591'.repeat(Math.max(0, empty));

    process.stdout.write(`${color}${bar}${C.reset} ${pct}% \u00b7 ${tokensFmt}/${ctxFmt} \u00b7 ${costFmt}${durationSuffix}`);
  }
}

main().catch(() => {
  process.stdout.write(`${C.dim}-- error --${C.reset}`);
});
