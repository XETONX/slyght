// scripts/probe-plan-snapshot.js
//
// One-shot probe for "what does BRAIN.plan.getSnapshot() actually return
// against the current state-snapshot.json fixture, AT today's clock?".
//
// Why: manual reproduction of the snapshot formula is brittle — too many
// inputs (overrides, custom provisions, bill cycle resolver, savings
// override fallback). This probe runs the real code in a headless browser
// against the current fixture, returns the canonical numbers + a parallel
// Option C computation for the trip-aware variant.
//
// Run: `node scripts/probe-plan-snapshot.js`
// Output: JSON to stdout. No state mutation, no commit.
//
// Bundle 32.9 prerequisite (Step 0 of beast-mode brief 2026-05-21).

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FIXTURE_PATH = path.resolve(__dirname, '..', 'state-snapshot.json');
const APP_URL = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
const TODAY = '2026-05-21T10:30:00+10:00';  // ~now, Sydney AEST

(async () => {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
  const seed = { S: fixture.S || {}, BILLS: fixture.BILLS || [] };

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.clock.install({ time: new Date(TODAY) });

  await context.addInitScript((s) => {
    try { localStorage.setItem('slyght_v5', JSON.stringify(s)); } catch (_) {}
    // Suppress all migration seeds — fixture is already post-migration
    for (let i = 0; i < 40; i++) {
      try { localStorage.setItem('slyght_seeded_v' + i, '1'); } catch (_) {}
    }
  }, seed);

  await page.goto(APP_URL);
  await page.waitForFunction(
    () => typeof BRAIN !== 'undefined' && BRAIN.plan && BRAIN.plan.getSnapshot,
    { timeout: 10000 }
  );
  try { await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); }); } catch (_) {}

  const result = await page.evaluate(() => {
    const snap = BRAIN.plan.getSnapshot();
    const provisions = (typeof PLAN !== 'undefined' && PLAN.getTotalProvisions) ? PLAN.getTotalProvisions() : null;

    // Trip-aware computation under Option C (net-of-bucket residual)
    const trips = (typeof BRAIN !== 'undefined' && BRAIN.plan && BRAIN.plan.intent)
      ? BRAIN.plan.intent.byKind('trip') : [];
    const buckets = (typeof S !== 'undefined' && Array.isArray(S.savingsBuckets)) ? S.savingsBuckets : [];

    const tripInfo = trips.filter(t => !t.archived).map(t => {
      const start = new Date(t.startDate + 'T00:00:00');
      const end = new Date(t.endDate + 'T00:00:00');
      const tripDays = Math.max(1, Math.round((end - start) / 86400000) + 1);
      const covered = (t.meta && Array.isArray(t.meta.covered)) ? t.meta.covered : [];
      const coveredSum = covered.reduce((s, e) =>
        (typeof e === 'object' && e !== null) ? s + (+e.amount || 0) : s, 0);
      const target = +t.targetAmount || 0;
      const bucket = buckets.find(b => b && (b.id === t.bucketId || b.name === t.bucketId));
      const bucketSaved = bucket ? (+bucket.saved || 0) : 0;
      const netC = Math.max(0, target - coveredSum - bucketSaved);
      const upliftC = netC / tripDays;
      const netPass2 = Math.max(0, target - coveredSum);
      const upliftPass2 = netPass2 / tripDays;
      return {
        id: t.id, name: t.name, target, start: t.startDate, end: t.endDate, tripDays,
        coveredSum, bucketSaved, netC, upliftC, netPass2, upliftPass2,
        bucketName: bucket ? bucket.name : null,
      };
    });

    // Re-run per-day loop under Option C and Pass 2 for the REMAINING days
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const inWin = (dStr, start, end) => dStr >= start && dStr <= end;
    const floor = +snap.dailyLiving.floor || 0;
    const daysRemaining = +snap.daysRemaining || 0;
    let livingOptionC = 0, livingPass2 = 0, livingStatic = floor * (snap.daysInCycle || 0);
    let tripDaysActive = 0;
    for (let i = 1; i <= daysRemaining; i++) {
      const d = new Date(today); d.setDate(today.getDate() + i);
      const dStr = d.toISOString().slice(0, 10);
      let upC = 0, upP2 = 0;
      for (const t of tripInfo) {
        if (inWin(dStr, t.start, t.end)) { upC += t.upliftC; upP2 += t.upliftPass2; }
      }
      if (upC > 0) { livingOptionC += upC; tripDaysActive++; } else { livingOptionC += floor; }
      if (upP2 > 0) { livingPass2 += upP2; } else { livingPass2 += floor; }
    }

    // Forecast (Pass 2) — already trip-aware
    const forecast = (typeof getSurvivalForecast === 'function') ? getSurvivalForecast() : null;

    return {
      snap_derived: snap.derived,
      snap_totals: {
        totalToPlan: snap.totalToPlan,
        billsTotal: snap.bills?.total,
        billsUnpaidTotal: snap.bills?.unpaidTotal,
        debtsTotal: snap.debts?.total,
        savingsTotal: snap.savings?.total,
        upcomingTotal: snap.knownUpcoming?.total,
        provisionsTotal: snap.provisions?.total,
        livingTotal: snap.dailyLiving?.plannedTotal,
        bufferFloor: snap.bufferFloor,
        daysInCycle: snap.daysInCycle,
        daysRemaining: snap.daysRemaining,
        income: snap.income,
      },
      provisionsFromPLAN: provisions,
      trips: tripInfo,
      OptionC: {
        livingTotal: parseFloat(livingOptionC.toFixed(2)),
        tripDaysActive,
        deltaVsStatic: parseFloat((livingOptionC - livingStatic).toFixed(2)),
        impliedRemainder: parseFloat((snap.totalToPlan - (snap.bills.total + snap.debts.total + livingOptionC + (snap.provisions?.total || 0))).toFixed(2)),
      },
      Pass2: {
        livingTotal: parseFloat(livingPass2.toFixed(2)),
        deltaVsStatic: parseFloat((livingPass2 - livingStatic).toFixed(2)),
      },
      forecast: forecast ? {
        minLivingCosts: forecast.minLivingCosts,
        totalNeeded: forecast.totalNeeded,
        survivalShortfall: forecast.survivalShortfall,
        comfortableShortfall: forecast.comfortableShortfall,
        tripUpliftTotal: forecast.tripUpliftTotal,
        tripActiveDays: forecast.tripActiveDays,
      } : 'not-available',
      bal: S.bal,
    };
  });

  await browser.close();
  console.log(JSON.stringify(result, null, 2));
})().catch(err => {
  console.error('PROBE FAIL:', err);
  process.exit(1);
});
