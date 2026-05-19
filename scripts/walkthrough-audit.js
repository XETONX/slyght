#!/usr/bin/env node
// Bundle 31 Phase 1B — walkthrough-audit.js
//
// Full daily-use UX audit: navigates to UI surfaces, captures screenshots,
// sends each to Haiku 4.5 with a 5-dimension structured-JSON prompt, and
// aggregates findings into a markdown report.
//
// Dimensions evaluated per surface:
//   1. internal consistency  (numbers cohere, percentages plausible)
//   2. clarity of next action (interactive elements obvious, labels clear)
//   3. information density    (overload vs scannability)
//   4. semantic correctness   (labels match content)
//   5. dead zones             (inert-looking visible elements)
//
// Findings tagged P0/P1/P2/P3. Cost-capped at $1.50. Wall-clock 60 min.
//
// Usage:
//   node scripts/walkthrough-audit.js
//
// Requires:
//   ANTHROPIC_API_KEY in .env or env
//   chromium installed via npx playwright install chromium

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// ─── env loader ───────────────────────────────────────────────────
(function _loadDotEnv() {
  const envPath = path.join(PROJECT_ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  try {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 1) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch (_) {}
})();

// ─── config ───────────────────────────────────────────────────────
const MODEL = 'claude-haiku-4-5-20251001';
const API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 1500;             // larger than verify-visual (richer JSON output)
const PER_CALL_TIMEOUT_MS = 45_000;
const RETRY_BACKOFF_MS = [1000, 2000];
const COST_CAP_USD = 1.50;
const WALL_CLOCK_CAP_MS = 60 * 60 * 1000;
const PORT = 4571;                    // avoid clashing with smoke spec's 4567
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('[audit] ANTHROPIC_API_KEY not set — aborting');
  process.exit(2);
}

// ─── surface definitions ──────────────────────────────────────────
// Each surface = { id, name, nav, clipTo, description, phase1aRefs }
// `nav` is an async function (page) => void that puts the page in the
// right state. `clipTo` is an optional CSS selector for element-clipped
// screenshots. Empty clipTo = full viewport. phase1aRefs cross-references
// Phase 1A items so Haiku knows what we already found.
const SURFACES = [
  {
    id: 'dashboard-hero',
    name: 'Dashboard — hero (balance + alerts)',
    nav: async () => {},
    clipTo: null,
    description: 'Default dashboard view. Should show current balance prominently, any over-pace/under-pace banners, and footer strip with today\'s spend.',
    phase1aRefs: 'Items 1 (this-cycle hero labeling), 10 (MAX PER DAY + pace adjacency)',
  },
  {
    id: 'dashboard-scrolled-cards',
    name: 'Dashboard — MAX PER DAY + running pace tiles',
    nav: async (page) => { await page.evaluate(() => window.scrollTo(0, 400)); },
    clipTo: null,
    description: 'Dashboard middle scroll. Shows MAX PER DAY card and running-over/under-pace tile, often adjacent.',
    phase1aRefs: 'Item 10 (visual adjacency between MAX PER DAY + Running pace causing skip-reading)',
  },
  {
    id: 'bills-tab-top',
    name: 'Bills tab — monthly view top',
    nav: async (page) => { await page.evaluate(() => { document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); const el = document.getElementById('pg-cal'); if (el) el.classList.add('active'); if (typeof renderBillsGrouped === 'function') renderBillsGrouped(); window.scrollTo(0, 0); }); await page.waitForTimeout(200); },
    clipTo: '#pg-cal',
    description: 'Bills tab monthly grouped view. Shows current month\'s bills with paid/unpaid status, TRACKED badges for auto-debit, and totals at bottom.',
    phase1aRefs: 'Items 7-8 (Claude MAX auto-debit visual confusion — should resolve transitively post-Item-16). Item 18 (Paid-this-month counter may undercount).',
  },
  {
    id: 'analysis-tab-pivot',
    name: 'Analysis tab — spending pivot (top)',
    nav: async (page) => { await page.evaluate(() => { document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); const el = document.getElementById('pg-spend'); if (el) el.classList.add('active'); if (typeof renderAnalysisTab === 'function') renderAnalysisTab(); if (typeof renderSpendingPivot === 'function') renderSpendingPivot(); window.scrollTo(0, 0); }); await page.waitForTimeout(200); },
    clipTo: '#pg-spend',
    description: 'Analysis tab spending pivot. Shows category breakdown of recent spending with period selector (Today/7d/30d/All).',
    phase1aRefs: 'Item 2 (debt categories doubling — banner already in place; assess clarity of the banner).',
  },
  {
    id: 'analysis-tab-essentials',
    name: 'Analysis tab — Essential vs Discretionary card (POST-FIX from Item 3)',
    nav: async (page) => { await page.evaluate(() => { document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); const el = document.getElementById('pg-spend'); if (el) el.classList.add('active'); if (typeof renderAnalysisTab === 'function') renderAnalysisTab(); window.scrollTo(0, 800); }); await page.waitForTimeout(300); },
    clipTo: null,
    description: 'Analysis tab middle scroll, focus on Essential vs Discretionary breakdown card. Bundle 31 Item 3 cycle-bounded the math. Verify the numbers no longer look impossibly inflated.',
    phase1aRefs: 'Item 3 (was: $15k impossible total; post-fix should reflect cycle-only math).',
  },
  {
    id: 'analysis-survival-forecast',
    name: 'Analysis tab — Survival Forecast',
    nav: async (page) => { await page.evaluate(() => { document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); const el = document.getElementById('pg-spend'); if (el) el.classList.add('active'); if (typeof renderAnalysisTab === 'function') renderAnalysisTab(); if (typeof renderSurvivalForecast === 'function') renderSurvivalForecast(); window.scrollTo(0, 200); }); await page.waitForTimeout(200); },
    clipTo: '#survival-forecast',
    description: 'Survival Forecast tile — projected runout date, daily minimum spend, will-survive verdict.',
    phase1aRefs: 'Items 7 (auto-debit inclusion in runout — should resolve once Item 16 batch processes), 9 (min living costs sourced from history vs budget — NOT fixed this session, P1 flagged).',
  },
  {
    id: 'plan-mode-root',
    name: 'Plan mode — root dashboard (POST-FIX from Item 4)',
    nav: async (page) => { await page.evaluate(() => { if (typeof renderPlanMode === 'function') renderPlanMode(); document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); const el = document.getElementById('pg-plan') || document.getElementById('pg-settings'); if (el) el.classList.add('active'); window.scrollTo(0, 0); }); await page.waitForTimeout(300); },
    clipTo: null,
    description: 'Plan mode root view — should show the renderAllocateTile (Bundle 31 Item 4 reframed: "$X still to allocate" not "$Y left to allocate"). Plus WRX card, trip cards, goal cards.',
    phase1aRefs: 'Item 4 (still-to-allocate framing). Item 12 (Trip/Goal cards external buttons). Item 13 (WRX card always-open clutter).',
  },
  {
    id: 'payday-plan-canvas',
    name: 'Payday Plan canvas — REMAINDER tile',
    nav: async (page) => { await page.evaluate(() => { if (typeof openPaydayPlan === 'function') openPaydayPlan(); }); await page.waitForTimeout(400); await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(200); },
    clipTo: null,
    description: 'Payday Plan canvas root. Shows "Your free money this cycle" REMAINDER tile, then "Allocating the remainder" section with Savings + Upcoming tiles and "Still uncommitted" sub-line.',
    phase1aRefs: 'Items 4-6 cluster (the original $1,770/$537/$1,133+$637 set; canvas was not edited this commit — should remain coherent).',
  },
  {
    id: 'payday-savings-subscreen',
    name: 'Payday — Savings sub-screen (POST-FIX from Item 4)',
    nav: async (page) => { await page.evaluate(() => { if (typeof openPaydayPlan === 'function') openPaydayPlan(); }); await page.waitForTimeout(300); await page.evaluate(() => { if (typeof openPaydayCategory === 'function') openPaydayCategory('payday-savings'); }); await page.waitForTimeout(300); },
    clipTo: null,
    description: 'Payday Plan → Savings sub-screen. Bundle 31 Item 4 reframed the "Pool to allocate" header to "still to split across goals" with "$X already assigned of $Y this cycle" subtitle.',
    phase1aRefs: 'Item 5 (was: $537 left to allocate phrasing; post-fix should show "still to split"). Item 12 (goal/bucket card inline buttons).',
  },
  {
    id: 'payday-upcoming-subscreen',
    name: 'Payday — Upcoming items sub-screen',
    nav: async (page) => { await page.evaluate(() => { if (typeof openPaydayPlan === 'function') openPaydayPlan(); }); await page.waitForTimeout(300); await page.evaluate(() => { if (typeof openPaydayCategory === 'function') openPaydayCategory('payday-upcoming'); }); await page.waitForTimeout(300); },
    clipTo: null,
    description: 'Payday Plan → Upcoming items sub-screen. Shows knownUpcoming list with tick handles, category emoji, dates.',
    phase1aRefs: 'Item 11 (no discoverable delete for upcoming items in unlocked plan).',
  },
  {
    id: 'payday-bills-subscreen',
    name: 'Payday — Bills sub-screen',
    nav: async (page) => { await page.evaluate(() => { if (typeof openPaydayPlan === 'function') openPaydayPlan(); }); await page.waitForTimeout(300); await page.evaluate(() => { if (typeof openPaydayCategory === 'function') openPaydayCategory('payday-bills'); }); await page.waitForTimeout(300); },
    clipTo: null,
    description: 'Payday Plan → Bills sub-screen. Lists this-cycle bills with paid/unpaid state, tick handles, auto-debit badges.',
    phase1aRefs: 'Items 7-8 (auto-debit visual treatment — should now respect Item 16 batch-processed paid state).',
  },
  {
    id: 'plan-mode-wrx',
    name: 'Plan mode — WRX card',
    nav: async (page) => { await page.evaluate(() => { if (typeof renderPlanMode === 'function') renderPlanMode(); document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); const el = document.getElementById('pg-plan') || document.getElementById('pg-settings'); if (el) el.classList.add('active'); window.scrollTo(0, 600); }); await page.waitForTimeout(200); },
    clipTo: null,
    description: 'Plan mode middle scroll — WRX Command Centre area. Card is always rendered open, no collapse affordance.',
    phase1aRefs: 'Item 13 (WRX card always-open clutters dashboard; NOT fixed this session — P1 flagged).',
  },
  {
    id: 'settings-overview',
    name: 'Settings — overview',
    nav: async (page) => { await page.evaluate(() => { document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); const el = document.getElementById('pg-settings'); if (el) el.classList.add('active'); window.scrollTo(0, 0); }); await page.waitForTimeout(200); },
    clipTo: '#pg-settings',
    description: 'Settings page top. Should expose main config rows (financial data, theme, payday, debt strategy, etc.) clearly labelled.',
    phase1aRefs: 'No Phase 1A items; opportunistic audit.',
  },
  {
    id: 'settings-diagnostics',
    name: 'Settings — Diagnostics section',
    nav: async (page) => { await page.evaluate(() => { document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); const el = document.getElementById('pg-settings'); if (el) el.classList.add('active'); window.scrollTo(0, 2000); }); await page.waitForTimeout(200); },
    clipTo: null,
    description: 'Settings → Diagnostics area. Math Health card, Boot Self-Test card, Activity Log card, Dev Inspect card. Bundle 30 1.A.6 territory.',
    phase1aRefs: 'Math Health post-collapse lenient verdict from Bundle 30.5 carry-over.',
  },
  {
    id: 'settings-data-backup',
    name: 'Settings — Data & Backup section',
    nav: async (page) => { await page.evaluate(() => { document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); const el = document.getElementById('pg-settings'); if (el) el.classList.add('active'); window.scrollTo(0, 1200); }); await page.waitForTimeout(200); },
    clipTo: null,
    description: 'Settings → Data & Backup. Pre-Bundle-30 snapshot row, reconciliation import buttons (dormant after Phase 4 cleanup).',
    phase1aRefs: 'No Phase 1A items; verify dormant recon-import buttons are not misleading.',
  },
];

// ─── prompt builder ───────────────────────────────────────────────
function buildAuditPrompt(surface, phase1aSummary) {
  return `You are auditing a personal finance app called slyght for a user named John (smart-but-lazy WMS Consultant, mobile-first, often on 4hrs sleep). He's already flagged 17 issues in a separate Phase 1A audit — this Phase 1B pass finds what HIS DAILY-USE EYES MISS.

CURRENT SURFACE: ${surface.name}
SURFACE DESCRIPTION: ${surface.description}
CROSS-REFERENCE TO PHASE 1A: ${surface.phase1aRefs}

PHASE 1A CONTEXT (don't re-flag items already covered):
${phase1aSummary}

Evaluate the screenshot across 5 dimensions. Only flag what would genuinely impact John's decisions or trust in the data. DON'T flag style preferences (color, font sizes within reason).

1. INTERNAL CONSISTENCY (P0/P1 risk)
   - Do numbers shown internally cohere?
   - Do totals visually fail to match their parts?
   - Percentages implausible (>100%, 0% when activity is visible)?
   - Dates stale or contradictory?

2. CLARITY OF NEXT ACTION (P1/P2 risk)
   - Obvious next action on this screen?
   - Interactive elements visually obvious as interactive?
   - Buttons labelled with verbs or just nouns?
   - Elements that LOOK interactive but might not be?

3. INFORMATION DENSITY (P2/P3 risk)
   - Overloaded with non-actionable metrics?
   - Competing visual weight between primary action and secondary info?
   - Would a financially-stressed user scanning quickly get the wrong impression?

4. SEMANTIC CORRECTNESS (P0/P1 risk)
   - Labels match what they appear to show?
   - "Opportunity cost" should be foregone returns, not fixed obligations
   - "Month on Month" should compare months
   - "Essential vs Discretionary" should sum to total spend
   - Any label-vs-content mismatch?

5. DEAD ZONES (P1/P2 risk)
   - Visible elements that look inert?
   - Empty/unused areas suggesting broken render?

Output STRICTLY this JSON shape (no other text). If you find NO issues on this surface, output an empty array \`[]\`:

[
  {
    "id": "p1b-XXX",
    "severity": "P0|P1|P2|P3",
    "category": "consistency|clarity|density|semantic|dead",
    "screen": "${surface.id}",
    "finding": "<one-sentence statement of the issue>",
    "evidence": "<what in the image shows it — specific element, position, or label>",
    "suggested_fix_complexity": "small|medium|large",
    "may_overlap_with_1a": "<item-N or null>"
  }
]

Use sequential ids (p1b-001, p1b-002, ...). Multiple findings on one surface = multiple objects in the array. SECURITY issues (PII leak, auth bypass, exposed key) → severity P0 + category "semantic" + finding starting with "SECURITY:".`;
}

const PHASE_1A_SUMMARY = `17 items found in Phase 1A on 2026-05-19. Already known: math/labeling on cycle aggregation (Items 1, 3 — Item 3 fixed this commit cycle-bounding Analysis tile), allocation vocabulary collision (Items 4-6 — Item 4 reframed headlines to "still to allocate" this commit), auto-debit absence of scheduler (Items 7, 8, 16 — Item 16 batch handler shipped this commit), historical min-living-costs in runout (Item 9), MAX PER DAY + pace tile visual adjacency (Item 10), no-discoverable-delete on upcoming items (Item 11), trip vs goal/bucket card external buttons (Item 12, Trips already inline), WRX always-open (Item 13), Opportunity Cost selecting rent as worst (Item 14), Month-on-Month doesn't actually compare (Item 15), Opal $1 placeholder vs fare (Item 17). Focus on what's NOT in this list.`;

// ─── Haiku call ───────────────────────────────────────────────────
function parseAuditResponse(text) {
  // Haiku may wrap in code fences or add preamble. Try to extract a JSON array.
  let cleaned = text.trim();
  // Strip markdown fences if present
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  // Find the first '[' and last ']'
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start < 0 || end < 0) return { parsed: null, error: 'no JSON array in response', raw: text.slice(0, 400) };
  try {
    const arr = JSON.parse(cleaned.slice(start, end + 1));
    if (!Array.isArray(arr)) return { parsed: null, error: 'JSON parsed but not an array', raw: text.slice(0, 400) };
    return { parsed: arr, error: null };
  } catch (e) {
    return { parsed: null, error: 'JSON parse failed: ' + e.message, raw: text.slice(0, 400) };
  }
}

async function callHaiku(imageBytes, prompt, attempt) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PER_CALL_TIMEOUT_MS);
  let resp;
  try {
    resp = await fetch(API_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION, 'content-type': 'application/json' },
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
    return { ok: false, error: e.name === 'AbortError' ? 'timeout' : ('fetch-failed: ' + (e.message || e)), retryable: attempt < RETRY_BACKOFF_MS.length };
  }
  clearTimeout(timer);
  if (resp.status === 429) return { ok: false, error: 'rate-limited', retryable: attempt < RETRY_BACKOFF_MS.length };
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    return { ok: false, error: `http-${resp.status}: ${body.slice(0, 300)}`, retryable: false };
  }
  const data = await resp.json();
  const text = (data.content && data.content[0] && data.content[0].text) || '';
  const usage = data.usage || {};
  const costUsd = ((usage.input_tokens || 0) * 1 + (usage.output_tokens || 0) * 5) / 1_000_000;
  const parsed = parseAuditResponse(text);
  return { ok: true, parsed: parsed.parsed, parseError: parsed.error, raw: text, api_response_id: data.id || null, input_tokens: usage.input_tokens || 0, output_tokens: usage.output_tokens || 0, cost_usd: costUsd };
}

async function callHaikuWithRetry(imageBytes, prompt) {
  for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
    const r = await callHaiku(imageBytes, prompt, attempt);
    if (r.ok) return r;
    if (!r.retryable) return r;
    if (attempt < RETRY_BACKOFF_MS.length) await new Promise(res => setTimeout(res, RETRY_BACKOFF_MS[attempt]));
  }
  return { ok: false, error: 'retries-exhausted' };
}

// ─── server lifecycle ─────────────────────────────────────────────
function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [path.join('scripts', 'serve.js'), String(PORT)], { cwd: PROJECT_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let ready = false;
    const t = setTimeout(() => {
      if (!ready) { proc.kill(); reject(new Error('server-start-timeout')); }
    }, 5000);
    // Probe until reachable
    const probe = () => {
      fetch(`http://localhost:${PORT}/`).then(r => {
        if (r.ok || r.status === 404) { ready = true; clearTimeout(t); resolve(proc); }
        else setTimeout(probe, 200);
      }).catch(() => setTimeout(probe, 200));
    };
    setTimeout(probe, 300);
  });
}

// ─── trace logging ────────────────────────────────────────────────
// Bundle 31 methodology fix: per-API-call JSONL trace so audit runs
// are verifiable (request IDs, token counts, raw responses persisted).
// Audit reports without backing traces are not Guardian-equivalent.
function screenshotHash(absPath) {
  if (!fs.existsSync(absPath)) return 'no-screenshot';
  const buf = fs.readFileSync(absPath);
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

function openTraceFile() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const tracePath = path.join(PROJECT_ROOT, 'docs', 'audit', `${ts}-trace.jsonl`);
  fs.mkdirSync(path.dirname(tracePath), { recursive: true });
  // Truncate/create the file; we append line-by-line below.
  fs.writeFileSync(tracePath, '');
  return tracePath;
}

function appendTrace(tracePath, line) {
  // Synchronous append per call so a crash mid-run preserves all completed
  // entries. JSONL = one JSON object per line; downstream tooling can
  // stream-parse without loading whole file.
  fs.appendFileSync(tracePath, JSON.stringify(line) + '\n');
}

// ─── main ─────────────────────────────────────────────────────────
(async () => {
  const start = Date.now();
  console.log('[audit] starting walkthrough audit at ' + new Date().toISOString());

  const tracePath = openTraceFile();
  console.log('[audit] trace file: ' + path.relative(PROJECT_ROOT, tracePath));

  let server;
  try { server = await startServer(); console.log('[audit] server on :' + PORT); }
  catch (e) { console.error('[audit] server failed:', e.message); process.exit(2); }

  // Load the smoke fixture (same as smoke specs use)
  const FIXTURE_PATH = path.join(PROJECT_ROOT, 'state-snapshot.json');
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
  const seed = { S: Object.assign({}, fixture.S || {}), BILLS: fixture.BILLS || [] };
  if (fixture.paidBills && !seed.S.paidBills) seed.S.paidBills = fixture.paidBills;

  const { chromium } = require('@playwright/test');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 3,
    locale: 'en-AU',
    timezoneId: 'Australia/Sydney',
    serviceWorkers: 'block',
  });
  // Pre-seed localStorage + frozen clock before navigation (matches smoke pattern)
  await ctx.addInitScript((args) => {
    try { localStorage.setItem('slyght_v5', JSON.stringify(args.seed)); } catch (_) {}
    try { localStorage.setItem('slyght_seeded_v13', '1'); } catch (_) {}
    try { localStorage.setItem('slyght_seeded_v12', '1'); } catch (_) {}
    try { localStorage.setItem('slyght_seeded_v11', '1'); } catch (_) {}
    try { localStorage.setItem('slyght_bills_reset_month', args.monthKey); } catch (_) {}
  }, { seed, monthKey: '2026-5' });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date('2026-05-19T10:00:00+10:00') });
  await page.goto(`http://localhost:${PORT}/`);
  await page.addStyleTag({ content: '*,*::before,*::after{animation-duration:0s !important;animation-delay:0s !important;transition-duration:0s !important;transition-delay:0s !important;}' });
  // Wait until BRAIN is initialised before tapping the splash (avoid TDZ)
  await page.waitForFunction(() => typeof BRAIN !== 'undefined' && BRAIN.bills && BRAIN.plan && typeof splashTap === 'function', { timeout: 8000 });
  await page.evaluate(() => splashTap());
  await page.waitForTimeout(500);

  const allFindings = [];
  let totalCost = 0;
  let aborted = false;
  let surfaceResults = [];

  for (let i = 0; i < SURFACES.length; i++) {
    if (Date.now() - start > WALL_CLOCK_CAP_MS) { console.warn('[audit] wall-clock cap hit; aborting'); aborted = true; break; }
    if (totalCost > COST_CAP_USD) { console.warn('[audit] cost cap hit; aborting'); aborted = true; break; }
    const surface = SURFACES[i];
    console.log(`[audit] (${i + 1}/${SURFACES.length}) ${surface.name}`);
    let navError = null;
    try { await surface.nav(page); }
    catch (e) { navError = e.message || String(e); console.warn('[audit]   nav warning:', navError); }
    // Capture
    const shotName = surface.id + '.png';
    const shotPath = path.join(PROJECT_ROOT, 'docs', 'audit', '_screenshots', shotName);
    fs.mkdirSync(path.dirname(shotPath), { recursive: true });
    try {
      if (surface.clipTo) {
        const loc = page.locator(surface.clipTo).first();
        await loc.screenshot({ path: shotPath, scale: 'css' });
      } else {
        await page.screenshot({ path: shotPath, fullPage: false, scale: 'css' });
      }
    } catch (e) {
      console.warn('[audit]   screenshot failed:', e.message);
      appendTrace(tracePath, {
        timestamp: new Date().toISOString(),
        surface_id: surface.id,
        outcome: 'screenshot-failed',
        error: e.message,
      });
      surfaceResults.push({ surface, findings: [], error: 'screenshot-failed: ' + e.message });
      continue;
    }
    // Haiku
    const imageBytes = fs.readFileSync(shotPath);
    const shotHash = screenshotHash(shotPath);
    const prompt = buildAuditPrompt(surface, PHASE_1A_SUMMARY);
    const callStart = Date.now();
    const r = await callHaikuWithRetry(imageBytes, prompt);
    const callMs = Date.now() - callStart;
    if (!r.ok) {
      console.warn('[audit]   haiku failed:', r.error);
      appendTrace(tracePath, {
        timestamp: new Date().toISOString(),
        surface_id: surface.id,
        screenshot_hash: shotHash,
        outcome: 'haiku-failed',
        error: r.error,
        call_ms: callMs,
      });
      surfaceResults.push({ surface, findings: [], error: r.error });
      continue;
    }
    totalCost += r.cost_usd || 0;
    // Persist trace BEFORE evaluating parse success — even if JSON parse
    // fails, we want the API call record on disk for verification.
    appendTrace(tracePath, {
      timestamp: new Date().toISOString(),
      surface_id: surface.id,
      screenshot_hash: shotHash,
      outcome: r.parsed ? 'ok' : 'parse-failed',
      api_response_id: r.api_response_id || null,
      model: MODEL,
      input_tokens: r.input_tokens || 0,
      output_tokens: r.output_tokens || 0,
      cost_usd: r.cost_usd || 0,
      cumulative_cost_usd: totalCost,
      call_ms: callMs,
      parsed_findings_count: r.parsed ? r.parsed.length : 0,
      parse_error: r.parseError || null,
      // Truncate raw response to ~2000 chars to keep trace file lean while
      // still letting reviewers verify API output shape.
      raw_response_text: (r.raw || '').slice(0, 2000),
    });
    if (!r.parsed) {
      console.warn('[audit]   parse failed:', r.parseError);
      surfaceResults.push({ surface, findings: [], error: 'parse: ' + r.parseError, raw: r.raw });
      continue;
    }
    console.log(`[audit]   ${r.parsed.length} finding(s), $${r.cost_usd.toFixed(4)} (total $${totalCost.toFixed(4)}) · req=${(r.api_response_id || '').slice(0, 14)}`);
    // P0 inline surface
    const p0 = r.parsed.filter(f => f.severity === 'P0');
    if (p0.length) console.log(`[audit]   ⚠️  P0(s) on this surface: ` + p0.map(f => f.finding).join(' | '));
    surfaceResults.push({ surface, findings: r.parsed, screenshot: 'docs/audit/_screenshots/' + shotName });
    allFindings.push(...r.parsed);
  }

  await browser.close();
  if (server) { try { server.kill(); } catch (_) {} }

  // ─── aggregate report ─────────────────────────────────────────
  const bySeverity = { P0: [], P1: [], P2: [], P3: [] };
  for (const f of allFindings) {
    if (bySeverity[f.severity]) bySeverity[f.severity].push(f);
  }
  const durationMin = ((Date.now() - start) / 60000).toFixed(1);
  const reportPath = path.join(PROJECT_ROOT, 'docs', 'audit', '2026-05-19-bundle-31-full-walkthrough-audit.md');
  const lines = [];
  lines.push('# Bundle 31 Phase 1B — Full Walkthrough Audit');
  lines.push('');
  lines.push(`**Date:** 2026-05-19  `);
  lines.push(`**Model:** ${MODEL}  `);
  lines.push(`**Surfaces audited:** ${surfaceResults.length} of ${SURFACES.length}  `);
  lines.push(`**Findings:** ${allFindings.length} (P0: ${bySeverity.P0.length}, P1: ${bySeverity.P1.length}, P2: ${bySeverity.P2.length}, P3: ${bySeverity.P3.length})  `);
  lines.push(`**Total Haiku cost:** $${totalCost.toFixed(4)}  `);
  lines.push(`**Duration:** ${durationMin} min  `);
  lines.push(`**Aborted:** ${aborted ? 'yes (cap hit)' : 'no'}  `);
  lines.push(`**API call trace:** \`${path.relative(PROJECT_ROOT, tracePath).replace(/\\/g, '/')}\` (one JSONL line per API call — request IDs, token counts, raw responses for verification)  `);
  lines.push('');
  lines.push('## Findings by severity');
  lines.push('');
  for (const sev of ['P0', 'P1', 'P2', 'P3']) {
    lines.push(`### ${sev} (${bySeverity[sev].length})`);
    lines.push('');
    if (!bySeverity[sev].length) { lines.push('_None._'); lines.push(''); continue; }
    for (const f of bySeverity[sev]) {
      lines.push(`**${f.id || 'p1b-?'}** \`${f.category}\` · ${f.screen}`);
      lines.push(`- **Finding:** ${f.finding}`);
      lines.push(`- **Evidence:** ${f.evidence}`);
      lines.push(`- **Fix complexity:** ${f.suggested_fix_complexity}`);
      if (f.may_overlap_with_1a) lines.push(`- **Overlaps Phase 1A:** ${f.may_overlap_with_1a}`);
      lines.push('');
    }
  }
  lines.push('## Per-surface results');
  lines.push('');
  for (const r of surfaceResults) {
    lines.push(`### ${r.surface.name}`);
    lines.push(`- ID: \`${r.surface.id}\``);
    lines.push(`- Screenshot: \`${r.screenshot || 'n/a'}\``);
    lines.push(`- Findings: ${r.findings ? r.findings.length : 0}`);
    if (r.error) lines.push(`- Error: ${r.error}`);
    if (r.findings && r.findings.length) {
      for (const f of r.findings) lines.push(`  - ${f.severity} ${f.category}: ${f.finding}`);
    }
    lines.push('');
  }
  fs.writeFileSync(reportPath, lines.join('\n'));
  console.log(`[audit] report: ${path.relative(PROJECT_ROOT, reportPath)}`);
  console.log(`[audit] trace:  ${path.relative(PROJECT_ROOT, tracePath)}`);
  // Verifiable line count from disk (not in-memory counter) so reviewers
  // can re-derive call count from the trace file independently.
  try {
    const traceLines = fs.readFileSync(tracePath, 'utf8').split('\n').filter(l => l.trim()).length;
    console.log(`[audit] trace lines: ${traceLines} (verify by: wc -l ${path.relative(PROJECT_ROOT, tracePath)})`);
  } catch (_) {}
  console.log(`[audit] summary: ${allFindings.length} findings · P0=${bySeverity.P0.length} P1=${bySeverity.P1.length} P2=${bySeverity.P2.length} P3=${bySeverity.P3.length} · $${totalCost.toFixed(4)}`);

  process.exit(0);
})().catch(e => {
  console.error('[audit] fatal:', e && e.stack || e);
  process.exit(2);
});
