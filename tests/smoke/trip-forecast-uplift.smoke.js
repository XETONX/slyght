// Bundle 32.3 Pass 2 — trip-aware survival forecast smoke.
//
// Locks in John's values call (per ADR-bundle-32-3-forecast-trip-uplift.md):
//   uplift = max(0, (trip.targetAmount - Σmeta.covered[].amount) / trip.days)
//   During spendWindow [start..end], daily forecast deduction = uplift,
//   which REPLACES minDailyNeeded. Outside any active spendWindow,
//   minDailyNeeded applies as before.
//
// Cases:
//   1. seedV27 migration upgrades string covered entries to objects (idempotent)
//   2. getUpliftPerDay — full coverage (covered >= target) → 0 (fully prepaid)
//   3. getUpliftPerDay — partial coverage → (target - Σcovered) / days
//   4. getUpliftPerDay — zero coverage → target / days
//   5. getUpliftPerDay — non-trip kind → 0
//   6. getUpliftPerDay — missing window → 0
//   7. isActiveOn — date inside spendWindow → true; outside → false; boundary inclusive
//   8. getActiveSpendingTrips(date) — back-to-back trips return distinct sets per day
//   9. Forecast: fully-prepaid trip in horizon → minLivingCosts equal to non-trip baseline
//  10. Forecast: uncovered trip in horizon → minLivingCosts > baseline (uplift applied per day)
//  11. Conservation: minLivingCosts === Σ perDayLivingCost; totalNeeded === bills + debts + minLivingCosts
//  12. Day-boundary: forecast day == trip.endDate uses uplift; trip.endDate+1 uses minDailyNeeded
//
// Run: npm run smoke

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const FIXTURE_PATH = path.resolve(__dirname, '../../state-snapshot.json');
// Freeze clock at 2026-05-25 — payday=15 → next payday Jun 15 → 21-day horizon.
// Darwin (Jun 7-15) sits in days 13-21 of forecast; 9 trip days inside window.
// China (Dec 1-22) is beyond the cycle horizon — no effect on this cycle's forecast.
const FROZEN_ISO = '2026-05-25T22:00:00+10:00';
const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

function buildSlyghtV5(fx) {
  const S = Object.assign({}, fx.S || {});
  if (fx.paidBills && !S.paidBills) S.paidBills = fx.paidBills;
  return { S, BILLS: fx.BILLS || [] };
}

const SETTLE_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
  }
`;

test.describe('Bundle 32.3 Pass 2 — trip-aware survival forecast', () => {
  test.beforeEach(async ({ page, context }) => {
    await page.clock.install({ time: new Date(FROZEN_ISO) });
    await context.addInitScript((args) => {
      try { localStorage.setItem('slyght_v5', JSON.stringify(args.seed)); } catch (_) {}
      try { localStorage.setItem('slyght_seeded_v13', '1'); } catch (_) {}
      try { localStorage.setItem('slyght_seeded_v12', '1'); } catch (_) {}
      try { localStorage.setItem('slyght_seeded_v11', '1'); } catch (_) {}
      // Note: NOT setting v27 flag — boot must run seedV27 against fixture
      try { localStorage.setItem('slyght_bills_reset_month', args.monthKey); } catch (_) {}
    }, { seed: buildSlyghtV5(fixture), monthKey: '2026-5' });
    await page.goto(process.env.SMOKE_BASE_URL || '/');
    await page.addStyleTag({ content: SETTLE_CSS });
    await page.waitForFunction(() => typeof BRAIN !== 'undefined'
      && BRAIN.plan && BRAIN.plan.intent
      && typeof BRAIN.plan.intent.getUpliftPerDay === 'function'
      && typeof BRAIN.plan.intent.isActiveOn === 'function'
      && typeof BRAIN.plan.intent.getActiveSpendingTrips === 'function'
      && typeof getSurvivalForecast === 'function', { timeout: 5000 });
    await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
    await page.evaluate(() => {
      const modal = document.getElementById('eod-recon-modal');
      if (modal && modal.classList.contains('open') && typeof eodReconAccept === 'function') eodReconAccept();
    });
  });

  test('Case 1: seedV27 upgrades string covered entries to objects (idempotent)', async ({ page }) => {
    const r = await page.evaluate(() => {
      const darwin = BRAIN.plan.intent.get('darwin-2026');
      const covered = (darwin && darwin.meta && darwin.meta.covered) || [];
      const allObjects = covered.every(e => e && typeof e === 'object' && 'amount' in e);
      const allZero = covered.every(e => e && e.amount === 0);
      return { count: covered.length, allObjects, allZero, sample: covered[0] };
    });
    expect(r.count).toBe(3);  // flights, accommodation, car hire
    expect(r.allObjects).toBe(true);
    expect(r.allZero).toBe(true);
    expect(r.sample).toEqual({ name: 'flights', amount: 0 });
  });

  test('Case 2: getUpliftPerDay — full coverage (covered >= target) → 0', async ({ page }) => {
    const r = await page.evaluate(() => {
      // Darwin: $900 target, 9 days. Coverage $1,000 > target → fully prepaid.
      BRAIN.plan.intent.update('darwin-2026', {
        meta: {
          days: 9,
          covered: [{ name: 'flights', amount: 1000 }],
          gfSplitting: true,
        },
      }, BRAIN.SOURCES.PLAN_INTENT_UPDATE);
      const darwin = BRAIN.plan.intent.get('darwin-2026');
      return { uplift: BRAIN.plan.intent.getUpliftPerDay(darwin) };
    });
    expect(r.uplift).toBe(0);
  });

  test('Case 3: getUpliftPerDay — partial coverage → (target - covered) / days', async ({ page }) => {
    const r = await page.evaluate(() => {
      // Darwin: $900 target, 9 days. Coverage $360 → net $540 / 9 = $60/day.
      BRAIN.plan.intent.update('darwin-2026', {
        meta: { days: 9, covered: [{ name: 'flights', amount: 360 }] },
      }, BRAIN.SOURCES.PLAN_INTENT_UPDATE);
      const darwin = BRAIN.plan.intent.get('darwin-2026');
      return { uplift: BRAIN.plan.intent.getUpliftPerDay(darwin) };
    });
    expect(r.uplift).toBeCloseTo(60, 4);
  });

  test('Case 4: getUpliftPerDay — zero coverage → target / days', async ({ page }) => {
    const r = await page.evaluate(() => {
      // Darwin: $900 / 9 days = $100/day. Default fixture state (post-seedV27)
      // has covered amounts = 0, so this matches the live state.
      const darwin = BRAIN.plan.intent.get('darwin-2026');
      return { uplift: BRAIN.plan.intent.getUpliftPerDay(darwin) };
    });
    expect(r.uplift).toBeCloseTo(100, 4);  // $900 / 9
  });

  test('Case 5: getUpliftPerDay — non-trip kind → 0', async ({ page }) => {
    const r = await page.evaluate(() => {
      const goal = BRAIN.plan.intent.byKind('goal')[0];
      return { uplift: BRAIN.plan.intent.getUpliftPerDay(goal) };
    });
    expect(r.uplift).toBe(0);
  });

  test('Case 6: getUpliftPerDay — missing window → 0', async ({ page }) => {
    const r = await page.evaluate(() => {
      BRAIN.plan.intent.add({
        id: 'pass2-case6-trip-nowindow', name: 'Window-less trip',
        kind: 'trip', targetAmount: 500, /* no startDate/endDate */
      }, BRAIN.SOURCES.PLAN_INTENT_ADD);
      const t = BRAIN.plan.intent.get('pass2-case6-trip-nowindow');
      return { uplift: BRAIN.plan.intent.getUpliftPerDay(t) };
    });
    expect(r.uplift).toBe(0);
  });

  test('Case 7: isActiveOn — inside window true, outside false, endDate inclusive', async ({ page }) => {
    const r = await page.evaluate(() => {
      // Darwin 2026-06-07..2026-06-15
      return {
        before: BRAIN.plan.intent.isActiveOn('darwin-2026', new Date('2026-06-06T12:00:00+10:00')),
        firstDay: BRAIN.plan.intent.isActiveOn('darwin-2026', new Date('2026-06-07T12:00:00+10:00')),
        midDay: BRAIN.plan.intent.isActiveOn('darwin-2026', new Date('2026-06-10T12:00:00+10:00')),
        lastDay: BRAIN.plan.intent.isActiveOn('darwin-2026', new Date('2026-06-15T12:00:00+10:00')),
        after: BRAIN.plan.intent.isActiveOn('darwin-2026', new Date('2026-06-16T12:00:00+10:00')),
      };
    });
    expect(r.before).toBe(false);
    expect(r.firstDay).toBe(true);
    expect(r.midDay).toBe(true);
    expect(r.lastDay).toBe(true);  // endDate is INCLUSIVE
    expect(r.after).toBe(false);
  });

  test('Case 8: getActiveSpendingTrips(date) — back-to-back trips', async ({ page }) => {
    const r = await page.evaluate(() => {
      // Add a second trip overlapping Darwin's last day → both active on Jun 15.
      BRAIN.plan.intent.add({
        id: 'pass2-case8-overlap', name: 'Overlap',
        kind: 'trip', targetAmount: 200,
        startDate: '2026-06-15', endDate: '2026-06-17',
      }, BRAIN.SOURCES.PLAN_INTENT_ADD);
      const beforeOverlap = BRAIN.plan.intent.getActiveSpendingTrips(new Date('2026-06-10T12:00:00+10:00'));
      const onOverlap = BRAIN.plan.intent.getActiveSpendingTrips(new Date('2026-06-15T12:00:00+10:00'));
      const afterDarwin = BRAIN.plan.intent.getActiveSpendingTrips(new Date('2026-06-16T12:00:00+10:00'));
      return {
        beforeOverlapIds: beforeOverlap.map(t => t.id).sort(),
        onOverlapIds: onOverlap.map(t => t.id).sort(),
        afterDarwinIds: afterDarwin.map(t => t.id).sort(),
      };
    });
    expect(r.beforeOverlapIds).toEqual(['darwin-2026']);
    expect(r.onOverlapIds).toEqual(['darwin-2026', 'pass2-case8-overlap']);
    expect(r.afterDarwinIds).toEqual(['pass2-case8-overlap']);
  });

  test('Case 9: forecast — fully prepaid trip → minLivingCosts equal to non-trip baseline', async ({ page }) => {
    const r = await page.evaluate(() => {
      // Fully prepay Darwin so its uplift becomes 0
      BRAIN.plan.intent.update('darwin-2026', {
        meta: { days: 9, covered: [{ name: 'all', amount: 5000 }] },
      }, BRAIN.SOURCES.PLAN_INTENT_UPDATE);
      // Also cancel any other trips that might be in the horizon (defensive)
      BRAIN.plan.intent.list({ kind: 'trip' }).forEach(t => {
        if (t.id !== 'darwin-2026') {
          BRAIN.plan.intent.setActivation(t.id, 'off', BRAIN.SOURCES.PLAN_INTENT_UPDATE);
        }
      });
      // Force recompute
      if (typeof MODEL !== 'undefined' && typeof computeFinancialModel === 'function') {
        try { Object.assign(MODEL, computeFinancialModel()); } catch (_) {}
      }
      const f = getSurvivalForecast();
      return {
        tripUpliftTotal: f.tripUpliftTotal,
        tripActiveDays: f.tripActiveDays,
        minDailyNeeded: f.minDailyNeeded,
        minLivingCosts: f.minLivingCosts,
        days: f.days,
      };
    });
    // Fully prepaid → zero uplift contribution
    expect(r.tripUpliftTotal).toBe(0);
    expect(r.tripActiveDays).toBe(0);
    // minLivingCosts should equal days * minDailyNeeded (baseline)
    expect(r.minLivingCosts).toBeCloseTo(r.days * r.minDailyNeeded, 1);
  });

  test('Case 10: forecast — uncovered trip in horizon raises minLivingCosts', async ({ page }) => {
    const r = await page.evaluate(() => {
      // Ensure Darwin has zero coverage (default fixture post-v27 already does)
      BRAIN.plan.intent.update('darwin-2026', {
        meta: { days: 9, covered: [
          { name: 'flights', amount: 0 },
          { name: 'accommodation', amount: 0 },
          { name: 'car hire', amount: 0 },
        ] },
      }, BRAIN.SOURCES.PLAN_INTENT_UPDATE);
      // Cancel any other trips so only Darwin contributes
      BRAIN.plan.intent.list({ kind: 'trip' }).forEach(t => {
        if (t.id !== 'darwin-2026') {
          BRAIN.plan.intent.setActivation(t.id, 'off', BRAIN.SOURCES.PLAN_INTENT_UPDATE);
        }
      });
      if (typeof MODEL !== 'undefined' && typeof computeFinancialModel === 'function') {
        try { Object.assign(MODEL, computeFinancialModel()); } catch (_) {}
      }
      const f = getSurvivalForecast();
      return {
        tripUpliftTotal: f.tripUpliftTotal,
        tripActiveDays: f.tripActiveDays,
        minDailyNeeded: f.minDailyNeeded,
        minLivingCosts: f.minLivingCosts,
        days: f.days,
      };
    });
    // Darwin's $900 over 9 days = $100/day. Inside frozen 21-day horizon
    // (May 25 → Jun 15), Darwin spans Jun 7-15 = 9 active trip days.
    // Expected uplift: 9 * $100 = $900. tripActiveDays = 9.
    expect(r.tripActiveDays).toBe(9);
    expect(r.tripUpliftTotal).toBeCloseTo(900, 1);
    // minLivingCosts ≈ 12 days × minDailyNeeded + 9 days × $100
    const expected = (r.days - 9) * r.minDailyNeeded + 900;
    expect(r.minLivingCosts).toBeCloseTo(expected, 1);
  });

  test('Case 11: conservation — minLivingCosts equals Σ perDayLivingCost; totalNeeded matches components', async ({ page }) => {
    const r = await page.evaluate(() => {
      // Set Darwin to partial coverage to make the math non-trivial
      BRAIN.plan.intent.update('darwin-2026', {
        meta: { days: 9, covered: [{ name: 'flights', amount: 180 }] },  // net = $720, $80/day
      }, BRAIN.SOURCES.PLAN_INTENT_UPDATE);
      BRAIN.plan.intent.list({ kind: 'trip' }).forEach(t => {
        if (t.id !== 'darwin-2026') {
          BRAIN.plan.intent.setActivation(t.id, 'off', BRAIN.SOURCES.PLAN_INTENT_UPDATE);
        }
      });
      if (typeof MODEL !== 'undefined' && typeof computeFinancialModel === 'function') {
        try { Object.assign(MODEL, computeFinancialModel()); } catch (_) {}
      }
      const f = getSurvivalForecast();
      // Recompute per-day sum from the public API to assert conservation
      const today = new Date(); today.setHours(0,0,0,0);
      let computedSum = 0;
      for (let i = 1; i <= f.days; i++) {
        const d = new Date(today); d.setDate(today.getDate() + i);
        const trips = BRAIN.plan.intent.getActiveSpendingTrips(d);
        let uplift = 0;
        for (const t of trips) uplift += BRAIN.plan.intent.getUpliftPerDay(t);
        computedSum += uplift > 0 ? uplift : f.minDailyNeeded;
      }
      return {
        minLivingCosts: f.minLivingCosts,
        totalNeeded: f.totalNeeded,
        upcomingBillsTotal: f.upcomingBillsTotal,
        upcomingDebtsTotal: f.upcomingDebtsTotal,
        computedSum: parseFloat(computedSum.toFixed(2)),
      };
    });
    // CONSERVATION: minLivingCosts must equal the sum we just walked
    expect(r.minLivingCosts).toBeCloseTo(r.computedSum, 1);
    // totalNeeded = bills + debts + living
    expect(r.totalNeeded).toBeCloseTo(r.upcomingBillsTotal + r.upcomingDebtsTotal + r.minLivingCosts, 1);
  });

  test('Case 12: day-boundary — endDate uses uplift; endDate+1 uses minDailyNeeded', async ({ page }) => {
    const r = await page.evaluate(() => {
      // Make a clean scratch trip with a short window we can probe precisely
      BRAIN.plan.intent.add({
        id: 'pass2-case12-boundary', name: 'Boundary trip',
        kind: 'trip', targetAmount: 400,
        startDate: '2026-06-08', endDate: '2026-06-10',  // 3 days, $133.33/day
      }, BRAIN.SOURCES.PLAN_INTENT_ADD);
      const trip = BRAIN.plan.intent.get('pass2-case12-boundary');
      const uplift = BRAIN.plan.intent.getUpliftPerDay(trip);  // 400/3

      function deductionOn(isoDay) {
        const d = new Date(isoDay + 'T12:00:00+10:00');
        const trips = BRAIN.plan.intent.getActiveSpendingTrips(d);
        let u = 0;
        for (const t of trips) u += BRAIN.plan.intent.getUpliftPerDay(t);
        return u;
      }

      return {
        uplift,
        before:   deductionOn('2026-06-07'),
        startDay: deductionOn('2026-06-08'),
        midDay:   deductionOn('2026-06-09'),
        endDay:   deductionOn('2026-06-10'),
        after:    deductionOn('2026-06-11'),
      };
    });
    expect(r.uplift).toBeCloseTo(400 / 3, 4);
    // Before window: trip contributes 0. Note Darwin is ALSO active on
    // some of these dates from fixture; assert the additional contribution
    // from this scratch trip rather than absolute equality.
    expect(r.startDay).toBeGreaterThanOrEqual(r.uplift - 0.01);
    expect(r.midDay).toBeGreaterThanOrEqual(r.uplift - 0.01);
    expect(r.endDay).toBeGreaterThanOrEqual(r.uplift - 0.01);
    // After endDate: scratch trip stops contributing. Subtract any other
    // active trips' uplifts to confirm boundary.
    // (Darwin spans Jun 7-15 so it's active on Jun 11 too. Just assert
    //  the delta from endDay to after equals exactly the scratch trip
    //  uplift — that proves the scratch trip dropped off on the boundary.)
    expect(r.endDay - r.after).toBeCloseTo(r.uplift, 1);
  });
});
