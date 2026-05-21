// One-shot probe: load the reconciliation oracle into a headless browser,
// boot slyght, query the precise numbers we need to design Commit 3's
// safeToSpendHeadroom field. Not committed as smoke (smoke spec asserts;
// this just observes).
//
// Run: node scripts/recon/probe-oracle-numbers.js
// Output: JSON to stdout.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ORACLE_PATH = path.resolve(__dirname, '..', '..', 'tests', 'state-dump', 'live-2026-05-21.json');
const APP_URL = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const FROZEN = '2026-05-21T22:00:00+10:00';

(async () => {
  const oracle = JSON.parse(fs.readFileSync(ORACLE_PATH, 'utf8'));
  const seed = { S: oracle.S || {}, BILLS: oracle.BILLS || [] };

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.clock.install({ time: new Date(FROZEN) });

  await context.addInitScript((s) => {
    try { localStorage.setItem('slyght_v5', JSON.stringify(s)); } catch (_) {}
    for (let i = 0; i < 40; i++) {
      try { localStorage.setItem('slyght_seeded_v' + i, '1'); } catch (_) {}
    }
    try { localStorage.setItem('slyght_bills_reset_month', '2026-5'); } catch (_) {}
  }, seed);

  await page.goto(APP_URL);
  await page.waitForFunction(() => typeof BRAIN !== 'undefined' && BRAIN.plan && BRAIN.plan.getSnapshot
    && BRAIN.bills && typeof BRAIN.bills.isPaidInCycle === 'function', { timeout: 10000 });
  try { await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); }); } catch (_) {}

  const r = await page.evaluate(() => {
    const snap = BRAIN.plan.getSnapshot();
    const cycleStart = new Date(S.activePlan.cycleStartDate);
    const billList = (BILLS || []).map(b => ({
      name: b.name, amt: b.amt, day: b.day, autoDebit: !!b.autoDebit,
      paid: BRAIN.bills.isPaidInCycle(b, cycleStart),
    }));
    const stillUnpaid = billList.filter(b => !b.paid);
    const stillUnpaidTotal = stillUnpaid.reduce((s, b) => s + (+b.amt || 0), 0);
    return {
      bal: S.bal,
      cycleStart: S.activePlan.cycleStartDate,
      cycleEnd: S.activePlan.cycleEndDate,
      daysInCycle: snap.daysInCycle,
      daysRemaining: snap.daysRemaining,
      floor: snap.dailyLiving.floor,
      plannedTotal: snap.dailyLiving.plannedTotal,
      perDayLivingCost: snap.dailyLiving.perDayLivingCost,
      tripUpliftTotal: snap.dailyLiving.tripUpliftTotal,
      tripActiveDays: snap.dailyLiving.tripActiveDays,
      billsTotal: snap.bills && snap.bills.total,
      billsUnpaidTotal: snap.bills && snap.bills.unpaidTotal,
      // Cross-check via direct isPaidInCycle walk
      billsAllByName: billList,
      stillUnpaidCount: stillUnpaid.length,
      stillUnpaidNames: stillUnpaid.map(b => b.name + ' $' + b.amt + ' (day ' + b.day + ')'),
      stillUnpaidTotal,
    };
  });

  await browser.close();
  console.log(JSON.stringify(r, null, 2));
})().catch(err => { console.error(err); process.exit(1); });
