#!/usr/bin/env node
/*
 * Walk-and-Judge — deterministic walker (the BODY).
 *
 * Drives the FAKE-seeded app via Playwright, screenshots EVERY step, and captures
 * per-step S-deltas + the audit-log "lands" (ground-truth of what each action wrote).
 * READ-ONLY on FAKE data: state-snapshot.fake.json carries pushOnSaveEnabled:false,
 * so a walk can never reach John's real KV/ledger.
 *
 * The JUDGE (the MIND) is Claude reading the emitted screenshots — no Anthropic API
 * key needed (the brief's autonomous-API-fleet is replaced by CC/sub-agent vision
 * judging: deterministic walk + frontier-Claude verdict).
 *
 * Emits tests/walker-out/<stamp>/walk.json + per-flow screenshots for the coverage
 * map + the Opus HTML path map. Run: node scripts/walker/run-walk.js
 */
'use strict';
const { chromium } = require('@playwright/test');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
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
    steps.push({ n: i + 1, id: st.id, action: st.action, screenshot: `${flow.id}/${shot}`, watch: st.watch || [], before, after, lands, expect: st.expect || null, judge: st.judge || null, error: err });
  }
  return { flow: flow.id, title: flow.title, steps };
}

// ── FIRST BATCH — Darwin both paths (the headline proof) ──
const FLOWS = [
  {
    id: 'darwin-A-quicklog', title: 'Darwin via Quick Log → Savings (known-broken: no bucket picker)',
    reseedBefore: true,
    steps: [
      { id: 'baseline', action: 'Dashboard on open', watch: ['bal', 'bucket:Darwin Trip', 'txns.length'], drive: p => p.evaluate(() => { if (typeof goPage === 'function') goPage('pg-dash'); }), expect: 'bal 1240, Darwin Trip 800', judge: 'Starting picture coherent?' },
      { id: 'open-quicklog', action: 'Open Quick Log', watch: [], drive: p => p.evaluate(() => openQuickLogModal()), expect: 'modal opens', judge: 'Is this the surface John reaches for to put money toward Darwin?' },
      { id: 'select-savings', action: "Select 'Savings' type", watch: [], drive: p => p.evaluate(() => { const b = document.querySelector('#ql-type-chips button[data-type="savings"]'); if (b) b.click(); }), expect: 'category row hides; NO Darwin/bucket picker', judge: 'THE GAP: can John pick Darwin here? (expect: no picker exists)' },
      { id: 'enter-300', action: 'Enter $300', watch: [], drive: async p => { await p.fill('#ql-amt', '300'); }, expect: 'amount entered', judge: 'n/a' },
      { id: 'submit', action: 'Submit (quickLogTxn)', watch: ['bal', 'bucket:Darwin Trip', 'txns.length'], drive: p => p.evaluate(() => quickLogTxn()), expect: 'bal 1240→940 (cash drops) BUT Darwin STAYS 800 (uncredited)', judge: 'John saved $300 toward Darwin — did the goal grow? Expect NO = the finding.' },
      { id: 'aftermath', action: 'Dashboard after submit', watch: ['bal', 'bucket:Darwin Trip'], drive: p => p.evaluate(() => { if (typeof goPage === 'function') goPage('pg-dash'); }), expect: 'Darwin still 800; no warning shown', judge: 'Does any surface tell John the $300 missed the goal? (silent loss)' },
    ],
  },
  {
    id: 'darwin-B-plantick', title: 'Darwin via Plan-tick (working path — the contrast)',
    reseedBefore: true,
    steps: [
      { id: 'baseline', action: 'Dashboard on open (re-seeded)', watch: ['bal', 'bucket:Darwin Trip'], drive: p => p.evaluate(() => { if (typeof goPage === 'function') goPage('pg-dash'); }), expect: 'bal 1240, Darwin 800', judge: 'clean baseline' },
      { id: 'open-plan', action: 'Open Payday Plan canvas', watch: [], drive: p => p.evaluate(() => openPaydayPlan()), expect: 'canvas renders; activePlan lazy-inits', judge: 'Is the canvas the natural door vs Quick Log?' },
      { id: 'open-savings', action: 'Open Savings sub-screen', watch: [], drive: p => p.evaluate(() => openPaydayCategory('payday-savings')), expect: 'Darwin row $800/$4000', judge: 'Darwin shows once, tappable?' },
      { id: 'set-override', action: 'Set Darwin override $300 (BRAIN.plan.setOverride)', watch: [], drive: p => p.evaluate(() => BRAIN.plan.setOverride('savings', 'Darwin Trip', 300, {}, BRAIN.SOURCES.PLAN_OVERRIDE_SET)), expect: 'override set (intent only, no cash move)', judge: 'intent clear?' },
      { id: 'lock', action: 'Lock the plan', watch: [], drive: p => p.evaluate(() => BRAIN.plan.lock({ snapshot: BRAIN.plan.getSnapshot() }, BRAIN.SOURCES.CANVAS_LOCK)), expect: 'lockedAt set', judge: 'lock = "ticking now moves money"?' },
      { id: 'tick', action: 'Tick Darwin (paydayTick → executes)', watch: ['bal', 'bucket:Darwin Trip', 'txns.length'], drive: p => p.evaluate(() => paydayTick('savings', 'Darwin Trip', BRAIN.SOURCES.PLAN_SAVINGS_TICK)), expect: 'bal 1240→940 AND Darwin 800→1100 (credited!)', judge: 'RIGHT for John: same $300, the goal grows, surfaces agree.' },
    ],
  },
];

(async () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = path.join(OUT_ROOT, stamp);
  fs.mkdirSync(outDir, { recursive: true });
  const env = await boot(); env.outDir = outDir;
  const results = [];
  for (const flow of FLOWS) { if (flow.reseedBefore) await reseed(env.page); results.push(await runFlow(env, flow)); }
  const walk = { generatedAt: new Date().toISOString(), fixture: 'state-snapshot.fake.json (FAKE, pushOnSaveEnabled:false)', frozen: FROZEN_ISO, viewport: VIEWPORT, pageErrors: env.errors, flows: results };
  fs.writeFileSync(path.join(outDir, 'walk.json'), JSON.stringify(walk, null, 2));
  await env.browser.close(); env.server.kill();
  console.log('WALK COMPLETE →', path.relative(process.cwd(), outDir));
  for (const f of results) { console.log('\n=== ' + f.flow + ' ==='); for (const s of f.steps) console.log(`  ${s.n} ${s.id.padEnd(14)} ${s.error ? 'ERR ' + s.error : 'ok '} | ${JSON.stringify(s.after)} | lands:[${s.lands.map(l => l.type).join(',')}]`); }
  console.log('\npageErrors:', env.errors.length, env.errors.slice(0, 5).join(' | '));
})().catch(e => { console.error('WALK FAILED:', e.message); process.exit(1); });
