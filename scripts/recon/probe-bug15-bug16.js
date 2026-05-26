// One-shot probe for Bug-1.5 + Bug-1.6 verification (no commit, no mutation).
// Run: node scripts/recon/probe-bug15-bug16.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FIXTURE_PATH = path.resolve(__dirname, '..', '..', 'state-snapshot.json');
const APP_URL = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const TODAY = '2026-05-21T10:30:00+10:00';

(async () => {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
  const seed = { S: fixture.S || {}, BILLS: fixture.BILLS || [] };

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.clock.install({ time: new Date(TODAY) });

  await context.addInitScript((s) => {
    try { localStorage.setItem('slyght_v5', JSON.stringify(s)); } catch (_) {}
    for (let i = 0; i < 40; i++) {
      try { localStorage.setItem('slyght_seeded_v' + i, '1'); } catch (_) {}
    }
  }, seed);

  await page.goto(APP_URL);
  await page.waitForFunction(() => typeof BRAIN !== 'undefined' && BRAIN.plan && BRAIN.plan.getSnapshot, { timeout: 10000 });
  try { await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); }); } catch (_) {}

  // ── Bug-1.5 verification: essentials lifecycle split conservation ──
  const bug15 = await page.evaluate(() => {
    const snap = BRAIN.plan.getSnapshot();
    const ess = snap.essentials || {};
    const paid = +ess.paidTotal || 0;
    const upcoming = +ess.upcomingTotal || 0;
    const total = +ess.total || 0;
    const sum = paid + upcoming;
    const drift = Math.abs(sum - total);

    // Find any paid non-viaRent debt
    const debts = Array.isArray(S.debts) ? S.debts : [];
    const paidNonViaRent = debts.filter(d => d && d.paid && !d.viaRent);
    const teachers = debts.find(d => d && /teachers/i.test(d.name || ''));

    return {
      essentialsTotal: total,
      essentialsPaidTotal: paid,
      essentialsUpcomingTotal: upcoming,
      sum,
      drift,
      conservation_ok: drift < 0.01,
      paidNonViaRentCount: paidNonViaRent.length,
      paidNonViaRentNames: paidNonViaRent.map(d => d.name || '(unnamed)'),
      teachersHealth: teachers ? { name: teachers.name, paid: !!teachers.paid, viaRent: !!teachers.viaRent, amount: teachers.amount } : null,
      remainder: snap.remainder,
    };
  });

  // ── Bug-1.6 verification: resetCycle preserves user-set zero ──
  const bug16 = await page.evaluate(() => {
    // Pre-arm: set bufferFloor = 0 explicitly
    if (!S.activePlan) S.activePlan = {};
    S.activePlan.bufferFloor = 0;
    const pre = S.activePlan.bufferFloor;
    // Call resetCycle with proper SOURCES tag
    try {
      const src = (BRAIN.SOURCES && BRAIN.SOURCES.PLAN_CYCLE_RESET) ? BRAIN.SOURCES.PLAN_CYCLE_RESET : 'PLAN_CYCLE_RESET';
      BRAIN.plan.resetCycle(src);
    } catch (e) {
      return { error: e.message, stack: e.stack };
    }
    const post = (S.activePlan && S.activePlan.bufferFloor);
    return {
      pre_bufferFloor: pre,
      post_bufferFloor: post,
      preserved: post === 0,
      fix_works: pre === 0 && post === 0,
    };
  });

  await browser.close();
  console.log(JSON.stringify({ bug15, bug16 }, null, 2));
})().catch(e => { console.error('PROBE FAIL:', e); process.exit(1); });
