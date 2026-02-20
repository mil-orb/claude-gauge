#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

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
  retro(pct) {
    // IBM CGA palette: hard color steps, no blending
    if (pct < 33) return '\x1b[38;2;0;170;0m';
    if (pct < 66) return '\x1b[38;2;170;170;0m';
    return '\x1b[38;2;170;0;0m';
  },
  spectrum(pct) {
    // Per-character gradient: each bar char colored by its position
    // Uses the same green→yellow→red palette as gradient
    return colorSchemes.gradient(pct);
  },
  mono(pct) {
    // Grayscale: bright white (220) → mid gray (120) → dark (50)
    let v;
    if (pct <= 50) {
      v = Math.round(220 - 100 * (pct / 50));
    } else {
      v = Math.round(120 - 70 * ((pct - 50) / 50));
    }
    return `\x1b[38;2;${v};${v};${v}m`;
  },
};

// Per-character color schemes: each filled char gets its own color by position
const PER_CHAR_SCHEMES = new Set(['spectrum']);

// Dithered edge: dark shade (▓) for high fill, medium shade (▒) for low fill
function edgeChar(remainder) {
  return remainder >= 5 ? '\u2593' : '\u2592';
}

// --- Display renderers: each returns a pre-colored bar string ---
// colorFn(pct) returns ANSI escape; perChar controls per-character vs uniform coloring
const displayRenderers = {
  bar(pct, width, colorFn, perChar) {
    const filled = Math.floor(pct * width / 100);
    const remainder = (pct * width * 10 / 100) % 10;
    const hasEdge = remainder > 0 && filled < width;
    let bar = '';
    if (perChar) {
      for (let i = 0; i < filled; i++) bar += colorFn(i / width * 100) + '\u2588';
      if (hasEdge) bar += colorFn(filled / width * 100) + edgeChar(remainder);
    } else {
      const c = colorFn(pct);
      bar = c + '\u2588'.repeat(filled);
      if (hasEdge) bar += edgeChar(remainder);
    }
    bar += RST + DIM + '\u2591'.repeat(Math.max(0, width - filled - (hasEdge ? 1 : 0))) + RST;
    return bar;
  },
  drain(pct, width, colorFn, perChar) {
    // Reverse: shows remaining capacity draining away
    const remaining = 100 - pct;
    const filled = Math.floor(remaining * width / 100);
    const remainder = (remaining * width * 10 / 100) % 10;
    const hasEdge = remainder > 0 && filled < width;
    const empty = Math.max(0, width - filled - (hasEdge ? 1 : 0));
    let bar = DIM + '\u2591'.repeat(empty) + RST;
    if (perChar) {
      if (hasEdge) bar += colorFn(empty / width * 100) + edgeChar(remainder);
      for (let i = 0; i < filled; i++) bar += colorFn((empty + (hasEdge ? 1 : 0) + i) / width * 100) + '\u2588';
    } else {
      const c = colorFn(pct);
      if (hasEdge) bar += c + edgeChar(remainder);
      bar += c + '\u2588'.repeat(filled);
    }
    bar += RST;
    return bar;
  },
  dots(pct, width, colorFn, perChar) {
    const filled = Math.round(pct * width / 100);
    let bar = '';
    if (perChar) {
      for (let i = 0; i < filled; i++) bar += colorFn(i / width * 100) + '\u25cf';
    } else {
      bar = colorFn(pct) + '\u25cf'.repeat(filled);
    }
    bar += RST + DIM + '\u25cb'.repeat(Math.max(0, width - filled)) + RST;
    return bar;
  },
  blocks(pct, width, colorFn, perChar) {
    const filled = Math.round(pct * width / 100);
    let bar = '';
    if (perChar) {
      for (let i = 0; i < filled; i++) bar += colorFn(i / width * 100) + '\u28ff';
    } else {
      bar = colorFn(pct) + '\u28ff'.repeat(filled);
    }
    bar += RST + DIM + '\u2800'.repeat(Math.max(0, width - filled)) + RST;
    return bar;
  },
  compact() {
    return null; // handled separately
  },
};

// --- Bar size presets ---
const barSizes = {
  small: 10,
  medium: 20,
  large: 30,
  xlarge: 40,
};

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
    bar_size: 'medium',
    show_cost: true,
    show_duration: true,
    show_lines: false,
    currency_rate: null,
    show_rate_limit: true,
  };
  const ALLOWED_KEYS = new Set(Object.keys(defaults));
  try {
    const cfgPath = path.join(__dirname, 'config.json');
    const loaded = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    const result = { ...defaults };
    for (const key of ALLOWED_KEYS) {
      if (Object.prototype.hasOwnProperty.call(loaded, key)) {
        result[key] = loaded[key];
      }
    }
    // Migrate old bar_width to bar_size
    if (Object.prototype.hasOwnProperty.call(loaded, 'bar_width') && !Object.prototype.hasOwnProperty.call(loaded, 'bar_size')) {
      result.bar_size = loaded.bar_width;
    }
    return result;
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
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (d > 0) return `${d}d${h}h`;
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

// --- Read session tokens from JSONL transcript ---
const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

const MAX_JSONL_BYTES = 10 * 1024 * 1024; // 10 MB cap

function readSessionTokens() {
  try {
    const resolvedBase = path.resolve(CLAUDE_PROJECTS_DIR);
    const dirs = fs.readdirSync(CLAUDE_PROJECTS_DIR);
    const candidates = [];
    const now = Date.now();
    for (const dir of dirs) {
      const dirPath = path.resolve(CLAUDE_PROJECTS_DIR, dir);
      // Path traversal guard
      if (!dirPath.startsWith(resolvedBase + path.sep)) continue;
      let entries;
      try { entries = fs.readdirSync(dirPath); } catch { continue; }
      for (const f of entries) {
        if (!f.endsWith('.jsonl')) continue;
        const fp = path.join(dirPath, f);
        try {
          const st = fs.statSync(fp);
          // Only consider files modified in the last 5 minutes
          if (now - st.mtimeMs < 5 * 60 * 1000) {
            candidates.push({ path: fp, size: st.size, mtime: st.mtimeMs });
          }
        } catch { /* skip */ }
      }
    }
    if (candidates.length === 0) return null;

    // Pick most recent first, then largest as tiebreaker
    candidates.sort((a, b) => b.mtime - a.mtime || b.size - a.size);
    const chosen = candidates[0];

    // Read file with size cap
    let content;
    if (chosen.size > MAX_JSONL_BYTES) {
      const fd = fs.openSync(chosen.path, 'r');
      const buf = Buffer.alloc(MAX_JSONL_BYTES);
      fs.readSync(fd, buf, 0, MAX_JSONL_BYTES, chosen.size - MAX_JSONL_BYTES);
      fs.closeSync(fd);
      content = buf.toString('utf8');
    } else {
      content = fs.readFileSync(chosen.path, 'utf8');
    }

    const lines = content.split('\n');
    let input = 0, output = 0;
    for (const line of lines) {
      if (!line || !line.includes('"assistant"')) continue;
      try {
        const j = JSON.parse(line);
        if (j.type !== 'assistant' || !j.message || !j.message.usage) continue;
        const u = j.message.usage;
        input += u.input_tokens || 0;
        output += u.output_tokens || 0;
      } catch { /* skip malformed lines */ }
    }
    const total = input + output;
    if (total === 0) return null;
    return { input, output, total };
  } catch {
    return null;
  }
}

// --- Read rate limit cache ---
const RATE_LIMIT_CACHE = path.join(os.homedir(), '.claude', 'gauge-rate-limits.json');
const RATE_LIMIT_STALE_MS = 10 * 60 * 1000; // 10 minutes

function readRateLimit() {
  try {
    const st = fs.lstatSync(RATE_LIMIT_CACHE);
    if (!st.isFile()) return null;
    const raw = fs.readFileSync(RATE_LIMIT_CACHE, 'utf8');
    const data = JSON.parse(raw);
    if (Date.now() - data.ts > RATE_LIMIT_STALE_MS) return null;
    if (typeof data['5h'] !== 'number' || !Number.isFinite(data['5h'])) return null;
    return data;
  } catch {
    return null;
  }
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

  // Extract values — prefer remaining_percentage when available
  let pct = typeof cw.used_percentage === 'number' ? Math.floor(cw.used_percentage) : -1;
  const remainPct = typeof cw.remaining_percentage === 'number' ? Math.floor(cw.remaining_percentage) : -1;
  const ctxSize = typeof cw.context_window_size === 'number' ? cw.context_window_size : 200000;
  const costUsd = typeof cost.total_cost_usd === 'number' ? cost.total_cost_usd : 0;
  const durationMs = typeof cost.total_duration_ms === 'number' ? cost.total_duration_ms : 0;
  const linesAdded = typeof cost.total_lines_added === 'number' ? cost.total_lines_added : 0;
  const linesRemoved = typeof cost.total_lines_removed === 'number' ? cost.total_lines_removed : 0;

  // Handle null/early state
  if (pct === -1) {
    process.stdout.write(`${DIM}-- waiting --${RST}`);
    return;
  }

  // Clamp
  pct = Math.max(0, Math.min(100, pct));

  // Resolve display type and color scheme
  const display = cfg.display || 'bar';
  const colorFn = Object.prototype.hasOwnProperty.call(colorSchemes, cfg.color) ? colorSchemes[cfg.color] : colorSchemes.gradient;
  const perChar = PER_CHAR_SCHEMES.has(cfg.color);

  const ctxFmt = fmtTokens(ctxSize);

  // Rate limit: when available, the BAR shows rate limit utilization
  const rlData = cfg.show_rate_limit !== false ? readRateLimit() : null;
  const hasRateLimit = rlData != null;

  // The bar percentage: rate limit utilization or context window used
  // API returns utilization as a fraction (0–1), convert to percentage
  // drain renderer inverts this into a fuel gauge (full = lots remaining)
  const barPct = hasRateLimit ? Math.max(0, Math.min(100, Math.round(rlData['5h'] * 100))) : pct;
  // Color based on utilization (high = red) — for text segments and compact mode
  const color = colorFn(barPct);

  // Build text segments
  const segments = [];

  // Session tokens from JSONL transcript
  const sessionTokens = readSessionTokens();

  if (hasRateLimit) {
    // Rate limit is the bar — show ⚡ label + utilization
    const rl5h = rlData['5h'] * 100;
    segments.push(`\u26a1${rl5h < 10 ? rl5h.toFixed(1) : Math.round(rl5h)}%`);
    // Session tokens from JSONL
    if (sessionTokens) {
      segments.push(fmtTokens(sessionTokens.total));
    }
  } else {
    // No rate limit data — show status + session tokens + session time
    const noProxySegments = [`${DIM}no proxy${RST}`];
    if (sessionTokens) noProxySegments.push(fmtTokens(sessionTokens.total));
    if (cfg.show_duration !== false) noProxySegments.push(fmtDuration(durationMs));
    process.stdout.write(noProxySegments.join(' \u00b7 '));
    return;
  }

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

  if (display === 'compact') {
    process.stdout.write(`${color}\u25cf${RST} ${textPart}`);
    return;
  }

  // Resolve bar width from size preset or explicit number
  let width;
  if (typeof cfg.bar_size === 'number' && cfg.bar_size > 0) {
    width = Math.min(cfg.bar_size, 100);
  } else {
    width = barSizes[cfg.bar_size] || barSizes.medium;
  }

  const renderer = Object.prototype.hasOwnProperty.call(displayRenderers, display) ? displayRenderers[display] : displayRenderers.bar;
  const bar = renderer(barPct, width, colorFn, perChar);

  process.stdout.write(`${bar} ${textPart}`);
}

main().catch(() => {
  process.stdout.write(`${DIM}-- error --${RST}`);
});
