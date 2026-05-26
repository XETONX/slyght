#!/usr/bin/env node
/*
 * Walk-and-Judge — deterministic walker (the BODY).
 *
 * Drives the FAKE-seeded app via Playwright, screenshots EVERY step, and captures
 * per-step S-deltas + the audit-log "lands" (ground-truth of what each action wrote)
 * + optional per-step probes (arbitrary in-page measurements, e.g. prompt provenance).
 * READ-ONLY on FAKE data: state-snapshot.fake.json carries pushOnSaveEnabled:false,
 * so a walk can never reach John's real KV/ledger.
 *
 * The JUDGE (the MIND) is Claude reading the emitted screenshots — no Anthropic API
 * key needed (the brief's autonomous-API-fleet is replaced by CC/sub-agent vision
 * judging: deterministic walk + frontier-Claude verdict).
 *
 * LAYER A — CHECKPOINTING: after each flow, the flow slice is written + gzipped
 * (flow.json + flow.json.gz) and appended to a lightweight index.json. A crash mid-
 * fleet preserves every completed surface; the 202-action run is resumable.
 *
 * Emits tests/walker-out/<stamp>/ : index.json, walk.json(+.gz), per-flow dirs.
 * Run: node scripts/walker/run-walk.js
 */
'use strict';
const { chromium } = require('@playwright/test');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { loadFixture, buildSlyghtV5 } = require('../../tests/helpers/fixture-path');

const PORT = 4577;
const FROZEN_ISO = '2026-05-26T10:00:00+10:00';
const MONTH_KEY = '2026-5';
const VIEWPORT = { width: 412, height: 915 };
const OUT_ROOT = path.join(__dirname, '..', '..', 'tests', 'walker-out');

function waitForPort(port, timeoutMs = 8000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get({ host: 'localhost', port, path: '/index.html' }, res => { res.resume(); resolve(); });
      req.on('error', () => (Date.now() - start > timeoutMs) ? reject(new Error('serve timeout')) : setTimeout(tick, 150));
    };
    tick();
  });
}
const settle = (page) => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))).catch(() => {});

async function readPaths(page, paths) {
  return page.evaluate((ps) => {
    if (typeof S === 'undefined' || !S) return {};
    const out = {};
    for (const p of ps) {
      try {
        if (p.startsWith('bucket:')) { const b = (S.savingsBuckets || []).find(x => x.name === p.slice(7)); out[p] = b ? b.saved : null; }
        else if (p === 'txns.length') out[p] = (S.txns || []).length;
        else { const segs = p.replace(/^S\./, '').split('.'); let cur = S; for (const s of segs) cur = cur == null ? cur : cur[s]; out[p] = cur; }
      } catch (e) { out[p] = '<err>'; }
    }
    return out;
  }, paths);
}
const auditLen = (page) => page.evaluate(() => (typeof S !== 'undefined' && S._auditLog) ? S._auditLog.length : 0).catch(() => 0);
const auditSince = (page, n) => page.evaluate((i) => (typeof S !== 'undefined' && S._auditLog) ? S._auditLog.slice(i).map(e => ({ type: e.type, source: e.source })) : [], n).catch(() => []);

async function boot() {
  const server = spawn('node', [path.join(__dirname, '..', 'serve.js'), String(PORT)], { stdio: 'ignore' });
  await waitForPort(PORT);
  const seed = buildSlyghtV5(loadFixture({ preferFake: true }));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, serviceWorkers: 'block', locale: 'en-AU', timezoneId: 'Australia/Sydney' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/sw\.js|ERR_|serviceWorker|favicon/i.test(m.text())) errors.push('[console] ' + m.text()); });
  await page.clock.install({ time: new Date(FROZEN_ISO) });
  await context.addInitScript((a) => {
    try { localStorage.setItem('slyght_v5', JSON.stringify(a.seed)); } catch (_) {}
    ['v11','v12','v13','v14','v15','v16','v17','v18','v19','v22','v25','v27'].forEach(v => { try { localStorage.setItem('slyght_seeded_' + v, '1'); } catch (_) {} });
    try { localStorage.setItem('slyght_bills_reset_month', a.monthKey); } catch (_) {}
    try { localStorage.setItem('slyght_payday_canvas_seen', '1'); } catch (_) {}
    try { localStorage.setItem('slyght_onboarded', '1'); } catch (_) {}
    try { localStorage.setItem('slyght_ai_consent', '1'); } catch (_) {}
  }, { seed, monthKey: MONTH_KEY });
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => { try { if (typeof splashTap === 'function') splashTap(); } catch (_) {} });
  await page.waitForFunction(() => typeof S !== 'undefined' && typeof BRAIN !== 'undefined' && BRAIN.transaction && typeof renderAll === 'function', { timeout: 8000 }).catch(() => {});
  await page.addStyleTag({ content: '*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}*{caret-color:transparent!important}' }).catch(() => {});
  await settle(page);
  return { server, browser, context, page, errors };
}

async function reseed(page) {
  await page.evaluate((seed) => { localStorage.setItem('slyght_v5', JSON.stringify(seed)); }, buildSlyghtV5(loadFixture({ preferFake: true })));
  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate(() => { try { if (typeof splashTap === 'function') splashTap(); } catch (_) {} });
  await page.waitForFunction(() => typeof S !== 'undefined' && typeof renderAll === 'function', { timeout: 8000 }).catch(() => {});
  await page.addStyleTag({ content: '*{animation-duration:0s!important;transition-duration:0s!important;caret-color:transparent!important}' }).catch(() => {});
  await settle(page);
}

async function runFlow(env, flow) {
  const dir = path.join(env.outDir, flow.id);
  fs.mkdirSync(dir, { recursive: true });
  const steps = [];
  for (let i = 0; i < flow.steps.length; i++) {
    const st = flow.steps[i];
    let err = null;
    const before = await readPaths(env.page, st.watch || []);
    const aLen = await auditLen(env.page);
    try { await st.drive(env.page); } catch (e) { err = e.message; }
    await settle(env.page);
    const shot = `step-${String(i + 1).padStart(2, '0')}-${st.id}.png`;
    try { await env.page.screenshot({ path: path.join(dir, shot), fullPage: false }); } catch (_) {}
    const after = await readPaths(env.page, st.watch || []);
    const lands = await auditSince(env.page, aLen);
    let probe = null;
    if (st.probe) { try { probe = await st.probe(env.page); } catch (e) { probe = { error: e.message }; } }
    steps.push({ n: i + 1, id: st.id, action: st.action, screenshot: `${flow.id}/${shot}`, watch: st.watch || [], before, after, lands, probe, expect: st.expect || null, judge: st.judge || null, error: err });
  }
  return { flow: flow.id, title: flow.title, steps };
}

// ── LAYER A — checkpoint a finished flow: per-flow JSON + gzip + index entry. ──
function checkpointFlow(env, result) {
  const dir = path.join(env.outDir, result.flow);
  const json = JSON.stringify(result, null, 2);
  try { fs.writeFileSync(path.join(dir, 'flow.json'), json); } catch (_) {}
  try { fs.writeFileSync(path.join(dir, 'flow.json.gz'), zlib.gzipSync(json)); } catch (_) {}
  const idxPath = path.join(env.outDir, 'index.json');
  let idx = [];
  try { idx = JSON.parse(fs.readFileSync(idxPath, 'utf8')); } catch (_) {}
  idx.push({
    flow: result.flow, title: result.title, steps: result.steps.length,
    screenshots: result.steps.map(s => s.screenshot),
    landsPerStep: result.steps.map(s => s.lands.map(l => l.type)),
    pageErrorsSoFar: env.errors.length, checkpointedAt: new Date().toISOString(),
  });
  try { fs.writeFileSync(idxPath, JSON.stringify(idx, null, 2)); } catch (_) {}
}

// ── PROBES — arbitrary in-page measurements captured per step. ──
// #1 FINDING: AI prompt provenance. The live prompt (index.html:15665) reads RAW
// S.bal + getDynamicDailyBudget; the correct builder buildSystemPrompt (:15332,
// getLiveBal + getGenuineSurplus + disclaimer) is dead code. This probe captures
// the concrete divergence on the running fixture — no API key required.
const aiProbe = (p) => p.evaluate(() => {
  const r = {}; const tryv = (f) => { try { return f(); } catch (e) { return '<err:' + e.message + '>'; } };
  r.live_prompt_uses = 'RAW S.bal (:15672) + getDynamicDailyBudget (:15676)';
  r.correct_builder = 'buildSystemPrompt (:15332) uses getLiveBal + getGenuineSurplus + disclaimer';
  r.buildSystemPrompt_isDeadCode = (typeof buildSystemPrompt === 'function') ? 'DEFINED but 0 callers (grep-confirmed)' : 'absent';
  r.S_bal = tryv(() => S.bal);
  r.getLiveBal = tryv(() => getLiveBal());
  r.bal_divergence = tryv(() => +(getLiveBal() - S.bal).toFixed(2));
  r.getGenuineSurplus = tryv(() => getGenuineSurplus());
  r.getDynamicDailyBudget = tryv(() => getDynamicDailyBudget());
  // id-mismatch: live prompt looks up goal id 'rainy-day-fund' (:15649); fixture has 'rainy-day'
  r.goal_ids_present = tryv(() => ((typeof BRAIN !== 'undefined' && BRAIN.plan && BRAIN.plan.intent) ? BRAIN.plan.intent.byKind('goal') : []).map(g => g.id));
  r.rainy_lookup_byPromptId = tryv(() => ((typeof BRAIN !== 'undefined' && BRAIN.plan && BRAIN.plan.intent) ? BRAIN.plan.intent.byKind('goal') : []).some(g => g.id === 'rainy-day-fund'));
  // Darwin: prompt hardcodes "June 7-15" (:15704); intent says otherwise
  r.darwin_intent_dates = tryv(() => { const ts = (typeof BRAIN !== 'undefined' && BRAIN.plan && BRAIN.plan.intent) ? BRAIN.plan.intent.byKind('trip') : []; const d = ts.find(t => t.id === 'darwin-2026'); return d ? { start: d.startDate || d.start, end: d.endDate || d.end } : '<none>'; });
  r.darwin_prompt_hardcoded = 'June 7-15 (:15704 literal)';
  r.prompt_has_disclaimer = 'NO — disclaimer lives only in dead buildSystemPrompt (:15375)';
  r.hardcoded_contradictions = ['$50,000 deposit target (:15691) vs "$3k currently" (:15715)', 'Salary $117,500 (:15698)', '$68k total (:15740)', 'KIA/Firstmac by name (:15693)'];
  return r;
});

// lock-state across the 3 known stores (memory: S.activePlan.lockedAt + BRAIN.allocation
// localStorage + legacy bool; 2 unlock paths clear inconsistent subsets — ADR Bundle 32.7).
const lockProbe = (p) => p.evaluate(() => {
  const r = {}; const tryv = (f) => { try { return f(); } catch (e) { return '<err:' + e.message + '>'; } };
  r.activePlan_lockedAt = tryv(() => (S.activePlan && S.activePlan.lockedAt) || null);
  r.brain_isLocked_getter = tryv(() => (typeof BRAIN !== 'undefined' && BRAIN.plan && BRAIN.plan.isLocked) ? BRAIN.plan.isLocked() : '<no-getter>');
  r.localStorage_lockKeys = tryv(() => Object.keys(localStorage).filter(k => /lock|alloc|plan/i.test(k)).reduce((a, k) => { a[k] = (localStorage.getItem(k) || '').slice(0, 60); return a; }, {}));
  r.legacy_planLocked = tryv(() => (typeof S.planLocked !== 'undefined') ? S.planLocked : '<none>');
  return r;
});

// ── FLOWS — first batch (proving the loop + Layer A on real money paths). ──
const FLOWS = [
  {
    id: 'darwin-A-quicklog', title: 'Darwin via Quick Log → Savings (known-broken: no bucket picker)',
    reseedBefore: true,
    steps: [
      { id: 'baseline', action: 'Dashboard on open', watch: ['bal', 'bucket:Darwin Trip', 'txns.length'], drive: p => p.evaluate(() => { if (typeof goPage === 'function') goPage('pg-dash'); }), expect: 'bal 4800, Darwin Trip 800', judge: 'Starting picture coherent?' },
      { id: 'open-quicklog', action: 'Open Quick Log', watch: [], drive: p => p.evaluate(() => openQuickLogModal()), expect: 'modal opens', judge: 'Is this the surface John reaches for to put money toward Darwin?' },
      { id: 'select-savings', action: "Select 'Savings' type", watch: [], drive: p => p.evaluate(() => { const b = document.querySelector('#ql-type-chips button[data-type="savings"]'); if (b) b.click(); }), expect: 'category row hides; NO Darwin/bucket picker', judge: 'THE GAP: can John pick Darwin here? (expect: no picker exists)' },
      { id: 'enter-300', action: 'Enter $300', watch: [], drive: async p => { await p.fill('#ql-amt', '300'); }, expect: 'amount entered', judge: 'n/a' },
      { id: 'submit', action: 'Submit (quickLogTxn)', watch: ['bal', 'bucket:Darwin Trip', 'txns.length'], drive: p => p.evaluate(() => quickLogTxn()), expect: 'bal 4800→4500 (cash drops) BUT Darwin STAYS 800 (uncredited)', judge: 'John saved $300 toward Darwin — did the goal grow? Expect NO = the finding.' },
      { id: 'aftermath', action: 'Dashboard after submit', watch: ['bal', 'bucket:Darwin Trip'], drive: p => p.evaluate(() => { if (typeof goPage === 'function') goPage('pg-dash'); }), expect: 'Darwin still 800; no warning shown', judge: 'Does any surface tell John the $300 missed the goal? (silent loss)' },
    ],
  },
  {
    id: 'darwin-B-plantick', title: 'Darwin via Plan-tick (working path — the contrast)',
    reseedBefore: true,
    steps: [
      { id: 'baseline', action: 'Dashboard on open (re-seeded)', watch: ['bal', 'bucket:Darwin Trip'], drive: p => p.evaluate(() => { if (typeof goPage === 'function') goPage('pg-dash'); }), expect: 'bal 4800, Darwin 800', judge: 'clean baseline' },
      { id: 'open-plan', action: 'Open Payday Plan canvas', watch: [], drive: p => p.evaluate(() => openPaydayPlan()), expect: 'canvas renders; activePlan lazy-inits', judge: 'Is the canvas the natural door vs Quick Log?' },
      { id: 'open-savings', action: 'Open Savings sub-screen', watch: [], drive: p => p.evaluate(() => openPaydayCategory('payday-savings')), expect: 'Darwin row $800/$4000', judge: 'Darwin shows once, tappable?' },
      { id: 'set-override', action: 'Set Darwin override $300 (BRAIN.plan.setOverride)', watch: [], drive: p => p.evaluate(() => BRAIN.plan.setOverride('savings', 'Darwin Trip', 300, {}, BRAIN.SOURCES.PLAN_OVERRIDE_SET)), expect: 'override set (positive surplus → accepted, not INV-32-refused)', judge: 'intent clear?' },
      { id: 'lock', action: 'Lock the plan', watch: [], drive: p => p.evaluate(() => BRAIN.plan.lock({ snapshot: BRAIN.plan.getSnapshot() }, BRAIN.SOURCES.CANVAS_LOCK)), expect: 'lockedAt set', judge: 'lock = "ticking now moves money"?' },
      { id: 'tick', action: 'Tick Darwin (paydayTick → executes)', watch: ['bal', 'bucket:Darwin Trip', 'txns.length'], drive: p => p.evaluate(() => paydayTick('savings', 'Darwin Trip', BRAIN.SOURCES.PLAN_SAVINGS_TICK)), expect: 'bal 4800→4500 AND Darwin 800→1100 (credited!)', judge: 'RIGHT for John: same $300, the goal grows, surfaces agree.' },
    ],
  },
  {
    id: 'log-transaction', title: 'Log a $4.50 coffee (core Quick Log writer + round-up to China)',
    reseedBefore: true,
    steps: [
      { id: 'baseline', action: 'Dashboard', watch: ['bal', 'txns.length', 'bucket:China Holiday'], drive: p => p.evaluate(() => goPage('pg-dash')), expect: 'bal 4800, China 1500, txns 9', judge: 'clean start' },
      { id: 'open-quicklog', action: 'Open Quick Log', watch: [], drive: p => p.evaluate(() => openQuickLogModal()), expect: 'modal opens', judge: 'reachable in one tap?' },
      { id: 'select-expense', action: "Select 'Expense' type", watch: [], drive: p => p.evaluate(() => { const b = document.querySelector('#ql-type-chips button[data-type="expense"]'); if (b) b.click(); }), expect: 'expense type active', judge: 'n/a' },
      { id: 'enter', action: 'Enter $4.50 + note', watch: [], drive: async p => { await p.fill('#ql-amt', '4.50'); try { await p.fill('#ql-note', 'Test Cafe — flat white'); } catch (_) {} }, expect: 'amount + note entered', judge: 'n/a' },
      { id: 'submit', action: 'Submit (quickLogTxn)', watch: ['bal', 'txns.length', 'bucket:China Holiday'], drive: p => p.evaluate(() => quickLogTxn()), expect: 'bal −$4.50 (+−$0.50 round-up); txns +1/+2; China +0.50 if round-up fires', judge: 'Cash drops by the spend; round-up (if on) credits China; NW unchanged by the transfer.' },
      { id: 'aftermath', action: 'Dashboard after', watch: ['bal', 'txns.length'], drive: p => p.evaluate(() => goPage('pg-dash')), expect: 'hero reflects new bal', judge: 'Hero == getLiveBal? does the spend show in the feed?' },
    ],
  },
  {
    id: 'bills-mark-paid', title: 'Mark Phone Plan ($50) paid + undo (writer-key vs reader-key)',
    reseedBefore: true,
    steps: [
      { id: 'baseline', action: 'Bills / Calendar tab', watch: ['bal', 'txns.length'], drive: p => p.evaluate(() => goPage('pg-cal')), expect: 'bal 4800; Phone Plan (day 10) unpaid', judge: 'Are due markers + amounts correct?' },
      { id: 'pay-phone', action: 'Pay Phone Plan now (payBillNow → BRAIN.bills.markPaid)', watch: ['bal', 'txns.length'], drive: p => p.evaluate(() => payBillNow('Phone Plan', 10, 50)), expect: 'bal 4800→4750 (−50); txn +1 (Bills); paidBills["2026-5-Phone Plan-10"] set', judge: 'Cash debited once, a ledger txn written, the bill flips to paid?' },
      { id: 'after-paid', action: 'Calendar after pay', watch: [], drive: p => p.evaluate(() => goPage('pg-cal')), expect: 'Phone Plan ✓ paid', judge: 'Paid state visible + consistent?' },
      { id: 'undo', action: 'Undo (unmarkBillFromCal — reader-key path)', watch: ['bal', 'txns.length'], drive: p => p.evaluate(() => { try { const k = (typeof paidBillKey === 'function') ? paidBillKey('Phone Plan', 10) : null; if (k && typeof unmarkBillFromCal === 'function') unmarkBillFromCal(k, 10); } catch (e) {} }), expect: 'flag cleared + txn reversed IF reader-key == writer-key', judge: 'THE CHECK: does undo actually reverse, or silently no-op? (cycle-relative writer-key vs reader-key)' },
      { id: 'after-undo', action: 'Calendar after undo', watch: ['bal', 'txns.length'], drive: p => p.evaluate(() => goPage('pg-cal')), expect: 'Phone Plan back to unpaid; bal restored to 4800', judge: 'Clean reversal, or stuck-paid?' },
    ],
  },
  {
    id: 'plan-lock', title: 'Payday Plan lock / unlock loop (3-store lock-state divergence)',
    reseedBefore: true,
    steps: [
      { id: 'open-plan', action: 'Open Payday canvas', watch: [], drive: p => p.evaluate(() => openPaydayPlan()), expect: 'canvas; activePlan inits', judge: 'natural door?' },
      { id: 'set-override', action: 'Set Rainy Day override $100 (BRAIN.plan.setOverride)', watch: [], drive: p => p.evaluate(() => BRAIN.plan.setOverride('savings', 'Rainy Day Fund', 100, {}, BRAIN.SOURCES.PLAN_OVERRIDE_SET)), expect: 'override accepted (positive surplus)', judge: 'accepted, no INV-32 refusal?' },
      { id: 'lock', action: 'Lock plan (BRAIN.plan.lock)', watch: ['activePlan.lockedAt'], drive: p => p.evaluate(() => BRAIN.plan.lock({ snapshot: BRAIN.plan.getSnapshot() }, BRAIN.SOURCES.CANVAS_LOCK)), expect: 'lockedAt set across stores', judge: 'lock state coherent (audit lands)?' },
      { id: 'probe-locked', action: 'Probe lock-state across 3 stores', watch: ['activePlan.lockedAt'], drive: p => p.evaluate(() => {}), probe: lockProbe, expect: 'all stores agree LOCKED', judge: 'divergence between the 3 stores?' },
      { id: 'unlock', action: 'Unlock plan', watch: ['activePlan.lockedAt'], drive: p => p.evaluate(() => { try { if (typeof BRAIN !== 'undefined' && BRAIN.plan && BRAIN.plan.unlock) BRAIN.plan.unlock(BRAIN.SOURCES.CANVAS_LOCK); } catch (e) {} }), expect: 'all stores cleared', judge: 'did unlock fire?' },
      { id: 'probe-unlocked', action: 'Probe lock-state after unlock', watch: ['activePlan.lockedAt'], drive: p => p.evaluate(() => {}), probe: lockProbe, expect: 'all stores cleared', judge: 'THE CHECK: does unlock clear ALL stores, or leave a stale lock? (2 paths, inconsistent subsets)' },
    ],
  },
  {
    id: 'ai-provenance', title: 'AI prompt provenance — what the live adviser is fed (#1 FINDING)',
    reseedBefore: true,
    steps: [
      { id: 'open-chat', action: 'Open AI chat', watch: [], drive: p => p.evaluate(() => goPage('pg-chat')), expect: 'composer renders', judge: 'Is this the surface John most wants to trust?' },
      { id: 'probe-prompt', action: 'Probe prompt provenance (no API key — inspect embedded numbers)', watch: ['bal'], drive: p => p.evaluate(() => {}), probe: aiProbe, expect: 'live prompt SHOULD embed getLiveBal + genuine surplus + disclaimer; it reads RAW S.bal + getDynamicDailyBudget, no disclaimer, hardcoded stale facts, rainy-day-fund id miss', judge: '#1 FINDING: does the adviser advise on a number the user can not see + self-contradicting stale literals?' },
    ],
  },
];

(async () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = path.join(OUT_ROOT, stamp);
  fs.mkdirSync(outDir, { recursive: true });
  // Run-honesty: --group=X / --spec=Y filters to the RUNNABLE flows for that scope,
  // validated against mission-control/specs.json (never raw shell input → safe).
  const arg = (k) => { const a = process.argv.find(s => s.startsWith('--' + k + '=')); return a ? a.split('=')[1] : null; };
  const _group = arg('group'), _spec = arg('spec');
  let flowsToRun = FLOWS;
  if (_group || _spec) {
    let reg = {}; try { reg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'mission-control', 'specs.json'), 'utf8')); } catch (_) {}
    const allowed = new Set();
    (reg.specs || []).forEach(s => { if (s.runnable && ((_group && s.group === _group) || (_spec && s.file === _spec))) (s.flows || []).forEach(f => allowed.add(f)); });
    flowsToRun = FLOWS.filter(f => allowed.has(f.id));
    console.log('@@WALK_SCOPE ' + (_group ? 'group=' + _group : 'spec=' + _spec) + ' → ' + (flowsToRun.map(f => f.id).join(',') || '(none)'));
    if (!flowsToRun.length) { console.log('@@WALK_EXIT 0'); process.exit(0); }
  }
  const env = await boot(); env.outDir = outDir;
  const results = [];
  for (const flow of flowsToRun) {
    if (flow.reseedBefore) await reseed(env.page);
    console.log('@@FLOW_START ' + flow.id); // Mission Control live tracker hook
    const result = await runFlow(env, flow);
    checkpointFlow(env, result); // LAYER A — resumable per surface
    console.log('@@FLOW_DONE ' + flow.id);  // → cockpit flips this node ⊘→walked, live
    results.push(result);
  }
  const walk = { generatedAt: new Date().toISOString(), fixture: 'state-snapshot.fake.json (FAKE, pushOnSaveEnabled:false)', frozen: FROZEN_ISO, viewport: VIEWPORT, pageErrors: env.errors, flows: results };
  const walkJson = JSON.stringify(walk, null, 2);
  fs.writeFileSync(path.join(outDir, 'walk.json'), walkJson);
  fs.writeFileSync(path.join(outDir, 'walk.json.gz'), zlib.gzipSync(walkJson));
  await env.browser.close(); env.server.kill();
  console.log('WALK COMPLETE →', path.relative(process.cwd(), outDir));
  for (const f of results) { console.log('\n=== ' + f.flow + ' ==='); for (const s of f.steps) console.log(`  ${s.n} ${s.id.padEnd(14)} ${s.error ? 'ERR ' + s.error : 'ok '} | ${JSON.stringify(s.after)} | lands:[${s.lands.map(l => l.type).join(',')}]${s.probe ? ' | probe:' + JSON.stringify(s.probe) : ''}`); }
  console.log('\npageErrors:', env.errors.length, env.errors.slice(0, 5).join(' | '));
})().catch(e => { console.error('WALK FAILED:', e.message); process.exit(1); });
