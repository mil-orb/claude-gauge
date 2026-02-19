#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const RST = '\x1b[0m';
const DIM = '\x1b[2m';

// --- Color schemes: each maps pct (0-100) to an ANSI 24-bit color ---
const colorSchemes = {
  gradient(pct) {
    // green (40,200,60) → yellow (220,200,0) → red (220,40,20)
    // Linear to yellow at 50%; fast-start curve in upper half for earlier red
    let r, g, b;
    if (pct <= 50) {
      const t = pct / 50;
      r = Math.round(40 + 180 * t);
      g = 200;
      b = Math.round(60 - 60 * t);
    } else {
      const t = (pct - 50) / 50;
      const tFast = 1 - (1 - t) * (1 - t);
      r = 220;
      g = Math.round(200 - 160 * tFast);
      b = Math.round(20 * tFast);
    }
    return `\x1b[38;2;${r};${g};${b}m`;
  },
  ocean(pct) {
    // cyan (0,200,200) → blue (40,80,220) → purple (140,40,200)
    // Linear to blue at 50%; fast-start curve in upper half for earlier escalation
    let r, g, b;
    if (pct <= 50) {
      const t = pct / 50;
      r = Math.round(40 * t);
      g = Math.round(200 - 120 * t);
      b = Math.round(200 + 20 * t);
    } else {
      const t = (pct - 50) / 50;
      const tFast = 1 - (1 - t) * (1 - t);
      r = Math.round(40 + 100 * tFast);
      g = Math.round(80 - 40 * tFast);
      b = Math.round(220 - 20 * tFast);
    }
    return `\x1b[38;2;${r};${g};${b}m`;
  },
  ember(pct) {
    // warm yellow (200,180,40) → orange (220,120,20) → deep red (180,30,10)
    // Linear to orange at 50%; fast-start curve in upper half for earlier escalation
    let r, g, b;
    if (pct <= 50) {
      const t = pct / 50;
      r = Math.round(200 + 20 * t);
      g = Math.round(180 - 60 * t);
      b = Math.round(40 - 20 * t);
    } else {
      const t = (pct - 50) / 50;
      const tFast = 1 - (1 - t) * (1 - t);
      r = Math.round(220 - 40 * tFast);
      g = Math.round(120 - 90 * tFast);
      b = Math.round(20 - 10 * tFast);
    }
    return `\x1b[38;2;${r};${g};${b}m`;
  },
  frost(pct) {
    // white (200,210,220) → light blue (100,160,220) → deep blue (30,60,180)
    // Linear to light blue at 50%; fast-start curve in upper half for earlier escalation
    let r, g, b;
    if (pct <= 50) {
      const t = pct / 50;
      r = Math.round(200 - 100 * t);
      g = Math.round(210 - 50 * t);
      b = 220;
    } else {
      const t = (pct - 50) / 50;
      const tFast = 1 - (1 - t) * (1 - t);
      r = Math.round(100 - 70 * tFast);
      g = Math.round(160 - 100 * tFast);
      b = Math.round(220 - 40 * tFast);
    }
    return `\x1b[38;2;${r};${g};${b}m`;
  },
};

// --- Display renderers: each returns the visual bar string ---
const displayRenderers = {
  bar(pct, width) {
    const filled = Math.floor(pct * width / 100);
    const remainder = (pct * width * 10 / 100) % 10;
    let bar = '\u2588'.repeat(filled);
    let edgeChars = 0;
    if (remainder > 0 && filled < width) {
      bar += remainder >= 5 ? '\u2593' : '\u2592';
      edgeChars = 1;
    }
    bar += '\u2591'.repeat(Math.max(0, width - filled - edgeChars));
    return bar;
  },
  drain(pct, width) {
    // Reverse: shows remaining capacity draining away
    const remaining = 100 - pct;
    const filled = Math.floor(remaining * width / 100);
    const remainder = (remaining * width * 10 / 100) % 10;
    let bar = '';
    const empty = Math.max(0, width - filled - (remainder > 0 && filled < width ? 1 : 0));
    bar += '\u2591'.repeat(empty);
    if (remainder > 0 && filled < width) {
      bar += remainder >= 5 ? '\u2592' : '\u2593';
    }
    bar += '\u2588'.repeat(filled);
    return bar;
  },
  dots(pct, width) {
    const filled = Math.round(pct * width / 100);
    return '\u25cf'.repeat(filled) + '\u25cb'.repeat(Math.max(0, width - filled));
  },
  blocks(pct, width) {
    const filled = Math.round(pct * width / 100);
    return '\u28ff'.repeat(filled) + '\u2800'.repeat(Math.max(0, width - filled));
  },
  compact() {
    return null; // handled separately
  },
};

// --- Detect terminal width (subprocess-safe) ---
function detectTermWidth() {
  if (process.stdout.columns) return process.stdout.columns;
  if (process.stderr.columns) return process.stderr.columns;
  const envCols = parseInt(process.env.COLUMNS, 10);
  if (envCols > 0) return envCols;
  return 80;
}

// --- Read stdin with timeout ---
function readStdin(timeoutMs) {
  const MAX_INPUT = 1024 * 1024;
  return new Promise((resolve) => {
    let data = '';
    let done = false;
    const finish = () => { if (!done) { done = true; clearTimeout(timer); resolve(data); } };
    const timer = setTimeout(() => { process.stdin.destroy(); finish(); }, timeoutMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
      if (data.length > MAX_INPUT) { process.stdin.destroy(); finish(); }
    });
    process.stdin.on('end', finish);
    process.stdin.on('error', finish);
    process.stdin.resume();
  });
}

// --- Load config ---
function loadConfig() {
  const defaults = {
    display: 'bar',
    color: 'gradient',
    bar_width: 'auto',
    show_cost: true,
    show_duration: true,
    show_lines: false,
    currency_rate: null,
  };
  try {
    const cfgPath = path.join(__dirname, 'config.json');
    const loaded = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    delete loaded.__proto__;
    delete loaded.constructor;
    delete loaded.prototype;
    // Migrate old display_mode to new display field
    if (loaded.display_mode && !loaded.display) {
      loaded.display = loaded.display_mode;
    }
    return { ...defaults, ...loaded };
  } catch {
    return defaults;
  }
}

// --- Format token count ---
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

// --- Format duration ---
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
    process.stdout.write(`${DIM}-- no data --${RST}`);
    return;
  }

  let j;
  try {
    j = JSON.parse(input);
  } catch {
    process.stdout.write(`${DIM}-- parse error --${RST}`);
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
  const linesAdded = cost.total_lines_added || 0;
  const linesRemoved = cost.total_lines_removed || 0;

  // Handle null/early state
  if (pct === -1) {
    process.stdout.write(`${DIM}-- waiting --${RST}`);
    return;
  }

  // Clamp
  pct = Math.max(0, Math.min(100, pct));

  // Resolve color scheme
  const colorFn = colorSchemes[cfg.color] || colorSchemes.gradient;
  const color = colorFn(pct);

  const tokensFmt = fmtTokens(inputTokens);
  const ctxFmt = fmtTokens(ctxSize);

  // Build optional segments
  const segments = [`${pct}%`, `${tokensFmt}/${ctxFmt}`];

  if (cfg.show_cost !== false) {
    let costFmt;
    if (typeof cfg.currency_rate === 'number' && cfg.currency_rate > 0) {
      costFmt = `${detectCurrencySymbol()}${(costUsd * cfg.currency_rate).toFixed(2)}`;
    } else {
      costFmt = `$${costUsd.toFixed(2)}`;
    }
    segments.push(costFmt);
  }

  if (cfg.show_duration !== false) {
    segments.push(fmtDuration(durationMs));
  }

  if (cfg.show_lines === true) {
    segments.push(`+${linesAdded} -${linesRemoved}`);
  }

  const textPart = segments.join(' \u00b7 ');

  // Resolve display type
  const display = cfg.display || 'bar';

  if (display === 'compact') {
    process.stdout.write(`${color}\u25cf${RST} ${textPart}`);
    return;
  }

  // Calculate bar width
  let width;
  if (typeof cfg.bar_width === 'number' && cfg.bar_width > 0) {
    width = cfg.bar_width;
  } else {
    const termWidth = detectTermWidth();
    const available = termWidth - textPart.length - 1;
    if (available < 5) {
      // Too narrow for a bar — degrade to compact
      process.stdout.write(`${color}\u25cf${RST} ${textPart}`);
      return;
    }
    width = Math.min(available, Math.floor(termWidth * 0.4));
  }

  const renderer = displayRenderers[display] || displayRenderers.bar;
  const bar = renderer(pct, width);

  process.stdout.write(`${color}${bar}${RST} ${textPart}`);
}

main().catch(() => {
  process.stdout.write(`${DIM}-- error --${RST}`);
});
