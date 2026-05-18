#!/usr/bin/env node
// Bundle 30.5 Phase C — verify-visual-state.js
//
// Reads the most-recent tests/visual-captures/<sha>/index.json (or the
// SHA passed as --sha=<short>), runs each capture through Haiku for an
// auto-flag pass (Q-30.5.1 hybrid answer), and writes a markdown report
// to tests/visual-captures/<sha>/verification-report.md.
//
// Idempotency (Phase 5 amendment #27): responses cached by
// captureId_screenshotHash so re-runs against the same SHA's captures
// hit cache, not the API. Cache file:
//   tests/visual-captures/<sha>/.verify-cache.json
//
// Mode selection:
//   ANTHROPIC_API_KEY set    → auto-flag mode (Haiku) — cost ~$0.10/run
//   ANTHROPIC_API_KEY missing → manual-review mode (no API calls); every
//                              capture marked needs-manual-review
//
// Exit codes (for CI integration in Phase D):
//   0 — all captures MATCH (or all cached MATCHes)
//   1 — any DIVERGENCE / ERROR / needs-manual-review flag surfaced
//
// Usage:
//   node scripts/verify-visual-state.js [--sha=<short>] [--force]
//   --sha=<short>  pin to a specific SHA dir (else latest by mtime)
//   --force        ignore cache; re-call API for every capture

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// Auto-load .env if present (so `npm run verify-visual` doesn't need
// --env-file=.env flag). Simple parser; ignores quotes, comments.
(function _loadDotEnv() {
  const envPath = path.join(PROJECT_ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  try {
    const text = fs.readFileSync(envPath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 1) continue;
      const k = trimmed.slice(0, eq).trim();
      let v = trimmed.slice(eq + 1).trim();
      // strip surrounding quotes
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch (_) {}
})();
const CAPTURES_ROOT = path.join(PROJECT_ROOT, 'tests', 'visual-captures');
const FEATURE_MAP_PATH = path.join(PROJECT_ROOT, 'FEATURE-MAP.md');
const MODEL = 'claude-haiku-4-5-20251001';
const API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 250;
const PER_CALL_TIMEOUT_MS = 30_000;
const RETRY_BACKOFF_MS = [1000, 2000, 4000];

// ─── arg parsing ───────────────────────────────────────────────────
const args = process.argv.slice(2);
const opts = {
  sha: null,
  force: args.includes('--force'),
};
for (const a of args) {
  if (a.startsWith('--sha=')) opts.sha = a.slice('--sha='.length);
}

const apiKey = process.env.ANTHROPIC_API_KEY;
const manualReviewMode = !apiKey;

// ─── filesystem + cache ────────────────────────────────────────────
function pickShaDir() {
  if (!fs.existsSync(CAPTURES_ROOT)) {
    console.error(`[verify] no captures root at ${CAPTURES_ROOT}`);
    process.exit(2);
  }
  if (opts.sha) {
    const d = path.join(CAPTURES_ROOT, opts.sha);
    if (!fs.existsSync(d)) {
      console.error(`[verify] no captures for SHA ${opts.sha}`);
      process.exit(2);
    }
    return d;
  }
  const dirs = fs.readdirSync(CAPTURES_ROOT)
    .map(name => ({ name, path: path.join(CAPTURES_ROOT, name) }))
    .filter(d => fs.statSync(d.path).isDirectory())
    .map(d => ({ ...d, mtime: fs.statSync(d.path).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (!dirs.length) {
    console.error('[verify] no SHA dirs under captures root');
    process.exit(2);
  }
  return dirs[0].path;
}

function loadIndex(dir) {
  const p = path.join(dir, 'index.json');
  if (!fs.existsSync(p)) {
    console.error(`[verify] no index.json in ${dir}`);
    process.exit(2);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function loadCache(dir) {
  const p = path.join(dir, '.verify-cache.json');
  if (!fs.existsSync(p)) return { schema_version: '1', entries: {} };
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return { schema_version: '1', entries: {} };
  }
}

function saveCache(dir, cache) {
  const p = path.join(dir, '.verify-cache.json');
  cache.last_saved_at = new Date().toISOString();
  fs.writeFileSync(p, JSON.stringify(cache, null, 2));
}

function screenshotHash(absPath) {
  if (!fs.existsSync(absPath)) return 'no-screenshot';
  const buf = fs.readFileSync(absPath);
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

function cacheKey(captureId, shotHash) {
  return `${captureId}__${shotHash}`;
}

// ─── FEATURE-MAP coverage ──────────────────────────────────────────
function loadFeatureMapPaths() {
  if (!fs.existsSync(FEATURE_MAP_PATH)) return new Set();
  const text = fs.readFileSync(FEATURE_MAP_PATH, 'utf8');
  const out = new Set();
  const re = /^\s*\*\*Path:\*\*\s*`([^`]+)`/gm;
  let m;
  while ((m = re.exec(text)) !== null) out.add(m[1].trim());
  return out;
}

// ─── Haiku call ────────────────────────────────────────────────────
function buildPrompt(cap) {
  const notes = (cap.known_state_notes || []).map(n =>
    `  - ${n.code}: ${n.description}`).join('\n');
  return `You are auto-flagging a smoke-test screenshot for divergence from expected state.

Feature path: ${cap.feature_path}
Label: ${cap.label}
Code under test: ${cap.code_under_test || '(not specified)'}
Expected state: ${cap.expected_state || '(not specified)'}
Clip selector: ${cap.clip_to || '(full viewport)'}

States to IGNORE (known fixture artifacts — do NOT flag these):
${notes || '  (none)'}

Compare the screenshot to the expected state. Ignore any visible states listed above.

Respond in exactly this format, nothing else:
VERDICT: MATCH
REASON: <one short sentence>

OR

VERDICT: DIVERGENCE
REASON: <one short sentence stating what diverged>`;
}

function parseHaikuResponse(text) {
  const verdictMatch = text.match(/VERDICT:\s*(MATCH|DIVERGENCE)/i);
  const reasonMatch = text.match(/REASON:\s*([\s\S]+?)(?:\n\s*$|$)/i);
  if (!verdictMatch) {
    return { verdict: 'PARSE_ERROR', reason: 'no VERDICT line in response: ' + text.slice(0, 200) };
  }
  return {
    verdict: verdictMatch[1].toUpperCase(),
    reason: (reasonMatch ? reasonMatch[1] : '').trim() || '(no reason)',
  };
}

async function callHaiku(imageBytes, prompt, attempt) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PER_CALL_TIMEOUT_MS);
  let resp;
  try {
    resp = await fetch(API_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageBytes.toString('base64') } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') {
      return { ok: false, error: 'timeout', retryable: attempt < RETRY_BACKOFF_MS.length };
    }
    return { ok: false, error: 'fetch-failed: ' + (e.message || e), retryable: attempt < RETRY_BACKOFF_MS.length };
  }
  clearTimeout(timer);
  if (resp.status === 429) {
    return { ok: false, error: 'rate-limited', retryable: attempt < RETRY_BACKOFF_MS.length };
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    return { ok: false, error: `http-${resp.status}: ${body.slice(0, 300)}`, retryable: false };
  }
  const data = await resp.json();
  const text = (data.content && data.content[0] && data.content[0].text) || '';
  const usage = data.usage || {};
  // Haiku 4.5 pricing: $1/M input tokens, $5/M output tokens (approx — confirm at billing time)
  const costUsd = ((usage.input_tokens || 0) * 1 + (usage.output_tokens || 0) * 5) / 1_000_000;
  const parsed = parseHaikuResponse(text);
  return {
    ok: true,
    verdict: parsed.verdict,
    reason: parsed.reason,
    raw_response: text,
    api_response_id: data.id,
    input_tokens: usage.input_tokens || 0,
    output_tokens: usage.output_tokens || 0,
    cost_usd: costUsd,
    model: MODEL,
  };
}

async function callHaikuWithRetry(imageBytes, prompt) {
  for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
    const r = await callHaiku(imageBytes, prompt, attempt);
    if (r.ok) return r;
    if (!r.retryable) return r;
    if (attempt < RETRY_BACKOFF_MS.length) {
      await new Promise(res => setTimeout(res, RETRY_BACKOFF_MS[attempt]));
    }
  }
  return { ok: false, error: 'retries-exhausted' };
}

// ─── per-capture verification ──────────────────────────────────────
async function verifyCapture(dir, cap, cache, stats) {
  const shotPath = cap.screenshot ? path.join(dir, cap.screenshot) : null;
  const shotExists = shotPath && fs.existsSync(shotPath);
  const shotHash = shotExists ? screenshotHash(shotPath) : 'no-screenshot';
  const key = cacheKey(cap.id, shotHash);

  // State-mode captures (logic-only tests, no visual UI to verify):
  // skip Haiku entirely. The smoke test already asserted the expected
  // state in code; captureState preserves state_snapshot + audit_window
  // as forensic evidence. Auto-MATCH with a note. Phase C report flags
  // these visually so reviewers know visual verification was skipped.
  if (cap.verify_mode === 'state') {
    stats.matches++;
    const entry = {
      verdict: 'MATCH',
      reason: 'state-mode capture — visual verification skipped (assertion already enforced in code; state_snapshot + audit_window preserved as forensic record)',
      cost_usd: 0,
      model: 'state-mode-skip',
      cached_at: new Date().toISOString(),
    };
    cache.entries[key] = entry;
    return { ...entry, cacheHit: false };
  }

  // Cache hit?
  if (!opts.force && cache.entries[key]) {
    stats.cacheHits++;
    return { ...cache.entries[key], cacheHit: true };
  }

  // Manual-review mode: skip API
  if (manualReviewMode) {
    stats.manualReview++;
    const entry = {
      verdict: 'NEEDS_MANUAL_REVIEW',
      reason: 'ANTHROPIC_API_KEY not set; manual-review mode',
      cost_usd: 0,
      model: 'none',
      cached_at: new Date().toISOString(),
    };
    cache.entries[key] = entry;
    return { ...entry, cacheHit: false };
  }

  if (!shotExists) {
    stats.errors++;
    const entry = {
      verdict: 'ERROR',
      reason: `screenshot file missing: ${cap.screenshot}`,
      cost_usd: 0,
      cached_at: new Date().toISOString(),
    };
    cache.entries[key] = entry;
    return { ...entry, cacheHit: false };
  }

  // Call API
  stats.apiCalls++;
  const imageBytes = fs.readFileSync(shotPath);
  const prompt = buildPrompt(cap);
  const r = await callHaikuWithRetry(imageBytes, prompt);
  if (!r.ok) {
    stats.errors++;
    const entry = {
      verdict: 'ERROR',
      reason: r.error,
      cost_usd: 0,
      cached_at: new Date().toISOString(),
    };
    cache.entries[key] = entry;
    return { ...entry, cacheHit: false };
  }
  const entry = {
    verdict: r.verdict,
    reason: r.reason,
    raw_response: r.raw_response,
    api_response_id: r.api_response_id,
    input_tokens: r.input_tokens,
    output_tokens: r.output_tokens,
    cost_usd: r.cost_usd,
    model: r.model,
    cached_at: new Date().toISOString(),
  };
  cache.entries[key] = entry;
  stats.totalCost += r.cost_usd;
  if (r.verdict === 'MATCH') stats.matches++;
  else if (r.verdict === 'DIVERGENCE') stats.divergences++;
  else stats.errors++;
  return { ...entry, cacheHit: false };
}

// ─── report rendering ──────────────────────────────────────────────
function renderReport({ dir, idx, results, stats, featureMapPaths, coverageGaps, orphans, mode, durationMs }) {
  const lines = [];
  lines.push('# Visual verification report');
  lines.push('');
  lines.push(`**SHA:** \`${idx.sha}\``);
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Mode:** ${mode}`);
  lines.push(`**Captures dir:** \`${path.relative(PROJECT_ROOT, dir).replace(/\\/g, '/')}/\``);
  lines.push(`**Duration:** ${(durationMs / 1000).toFixed(1)}s`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Total captures: **${results.length}**`);
  lines.push(`- ✅ MATCH: **${stats.matches}**`);
  lines.push(`- ⚠️ DIVERGENCE: **${stats.divergences}**`);
  lines.push(`- 🚨 ERROR: **${stats.errors}**`);
  lines.push(`- 👀 NEEDS_MANUAL_REVIEW: **${stats.manualReview}**`);
  lines.push(`- Cache: **${stats.cacheHits} hits, ${stats.apiCalls} API calls**`);
  lines.push(`- Total cost: **$${stats.totalCost.toFixed(4)}** USD${stats.apiCalls === 0 ? ' (no API calls this run)' : ''}`);
  lines.push(`- FEATURE-MAP paths total: **${featureMapPaths.size}**`);
  lines.push(`- Coverage gaps (paths with no captures): **${coverageGaps.length}**`);
  lines.push(`- Orphan captures (paths not in FEATURE-MAP): **${orphans.length}**`);
  lines.push('');

  const flagged = results.filter(r => r.verdict === 'DIVERGENCE' || r.verdict === 'ERROR' || r.verdict === 'PARSE_ERROR');
  if (flagged.length) {
    lines.push('## 🚨 Flagged items (priority review)');
    lines.push('');
    for (const r of flagged) {
      lines.push(`### ${r.cap.feature_path} — ${r.cap.label}`);
      lines.push(`- **Verdict:** ${r.verdict}`);
      lines.push(`- **Reason:** ${r.reason}`);
      lines.push(`- **Spec:** \`${r.cap.spec_file || '?'}:${r.cap.spec_line || '?'}\``);
      lines.push(`- **Expected:** ${r.cap.expected_state || '(none)'}`);
      lines.push(`- **Screenshot:** \`${r.cap.screenshot || '(none)'}\``);
      lines.push('');
    }
  }

  const needsReview = results.filter(r => r.verdict === 'NEEDS_MANUAL_REVIEW');
  if (needsReview.length) {
    lines.push('## 👀 Needs manual review');
    lines.push('');
    if (mode === 'manual-review') {
      lines.push('No API key set. Every capture below requires human review of the screenshot + state against expected_state.');
      lines.push('');
    }
    for (const r of needsReview) {
      lines.push(`- \`${r.cap.feature_path}\` — ${r.cap.label} — \`${r.cap.screenshot || '(none)'}\``);
    }
    lines.push('');
  }

  if (coverageGaps.length) {
    lines.push('## Coverage gaps');
    lines.push('');
    lines.push('FEATURE-MAP paths with no captures in this run:');
    lines.push('');
    for (const p of coverageGaps.slice(0, 40)) lines.push(`- \`${p}\``);
    if (coverageGaps.length > 40) lines.push(`- ... ${coverageGaps.length - 40} more`);
    lines.push('');
  }

  if (orphans.length) {
    lines.push('## 🚨 Orphan captures (paths not in FEATURE-MAP)');
    lines.push('');
    for (const o of orphans) lines.push(`- \`${o}\` — ADD TO FEATURE-MAP OR REMOVE CAPTURE`);
    lines.push('');
  }

  lines.push('## All captures');
  lines.push('');
  lines.push('| Path | Label | Verdict | Reason | Cache | Cost |');
  lines.push('|---|---|---|---|---|---|');
  for (const r of results) {
    const icon = r.verdict === 'MATCH' ? '✅'
      : r.verdict === 'DIVERGENCE' ? '⚠️'
      : r.verdict === 'NEEDS_MANUAL_REVIEW' ? '👀'
      : '🚨';
    const reasonShort = (r.reason || '').slice(0, 80).replace(/\|/g, '\\|');
    lines.push(`| \`${r.cap.feature_path}\` | ${r.cap.label} | ${icon} ${r.verdict} | ${reasonShort} | ${r.cacheHit ? 'hit' : 'miss'} | $${(r.cost_usd || 0).toFixed(4)} |`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('_Generated by `scripts/verify-visual-state.js` (Bundle 30.5 Phase C)._');
  lines.push(`_Cache: \`.verify-cache.json\` in same dir; re-run is idempotent unless captures change or \`--force\` passed._`);
  return lines.join('\n');
}

// ─── main ──────────────────────────────────────────────────────────
async function main() {
  const startMs = Date.now();
  const dir = pickShaDir();
  const idx = loadIndex(dir);
  const cache = loadCache(dir);
  const featureMapPaths = loadFeatureMapPaths();

  const mode = manualReviewMode ? 'manual-review (no ANTHROPIC_API_KEY)' : `auto-flag (Haiku ${MODEL})`;
  console.log(`[verify] dir: ${path.relative(PROJECT_ROOT, dir).replace(/\\/g, '/')}`);
  console.log(`[verify] captures: ${idx.captures.length}`);
  console.log(`[verify] mode: ${mode}`);
  console.log(`[verify] cache entries: ${Object.keys(cache.entries).length}${opts.force ? ' (FORCE — cache ignored)' : ''}`);

  const stats = { matches: 0, divergences: 0, errors: 0, manualReview: 0, cacheHits: 0, apiCalls: 0, totalCost: 0 };
  const results = [];
  for (let i = 0; i < idx.captures.length; i++) {
    const cap = idx.captures[i];
    process.stdout.write(`[verify] (${i + 1}/${idx.captures.length}) ${cap.label} `);
    const r = await verifyCapture(dir, cap, cache, stats);
    if (r.cacheHit && r.verdict === 'MATCH') stats.matches++;
    else if (r.cacheHit && r.verdict === 'DIVERGENCE') stats.divergences++;
    else if (r.cacheHit && r.verdict === 'NEEDS_MANUAL_REVIEW') stats.manualReview++;
    else if (r.cacheHit) stats.errors++;
    results.push({ cap, ...r });
    console.log(`→ ${r.verdict}${r.cacheHit ? ' [cache]' : ''}`);
    saveCache(dir, cache);
  }

  // Coverage gaps + orphans
  const capturedPaths = new Set(idx.captures.map(c => c.feature_path));
  const coverageGaps = [...featureMapPaths].filter(p => !capturedPaths.has(p));
  const orphans = [...capturedPaths].filter(p => !featureMapPaths.has(p));

  const durationMs = Date.now() - startMs;
  const reportText = renderReport({ dir, idx, results, stats, featureMapPaths, coverageGaps, orphans, mode, durationMs });
  const reportPath = path.join(dir, 'verification-report.md');
  fs.writeFileSync(reportPath, reportText);
  console.log(`[verify] report: ${path.relative(PROJECT_ROOT, reportPath).replace(/\\/g, '/')}`);
  console.log(`[verify] summary: ${stats.matches} MATCH · ${stats.divergences} DIVERGENCE · ${stats.errors} ERROR · ${stats.manualReview} MANUAL · cache ${stats.cacheHits}/${results.length} · $${stats.totalCost.toFixed(4)}`);

  const flagCount = stats.divergences + stats.errors + stats.manualReview;
  process.exit(flagCount > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('[verify] fatal:', e);
  process.exit(2);
});
