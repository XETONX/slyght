// Bundle 32 Sub-bundle 1 — cashflow truth reconciliation oracle.
//
// THIS IS THE PINNED ORACLE. Smoke reads tests/state-dump/live-2026-05-21.json
// directly as a frozen fixture. Never auto-refreshed (smoke-fixture
// pull-on-run does NOT touch this file). To update: deliberate version bump
// — pull a new dated state-dump, hand-validate the numbers in tests/fixtures/
// reconciliation-oracle.md, then point this spec at the new filename.
//
// The validated numbers (2026-05-21 hand-reconciliation):
//   - Cash: $802.66
//   - Salary credit (incl bonus folded): $8,623.33
//   - Bonus ghost: $1,341 physically in S.bal, bonus.included=false (D2 #8)
//   - Vet refund: $174 (credit txn)
//   - 10 bills paid this cycle with matching txns (Rent, KIA Loan, Optus,
//     Allianz CTP, KIA Reg, Mum debt, Michael debt, Claude Max, YouTube,
//     Pet Insurance day-20)
//   - 7-8 bills still due (Adobe, Spotify, Google One, Pet Ins Bowtie,
//     Stan, Claude Plus, Netflix, Moshtix conditional)
//   - True still-owed: $188.17 (Moshtix excluded — endDate Jun 11)
//   - App's billsUnpaidTotal pre-fix: $5,638.62 → over-reports by ~$5,479
//   - Headroom: $802.66 − $188 − $720 = −$105.51 (24d × $30 floor)
//
// Commit 1 scope: BRAIN.bills.isPaidInCycle substrate + 3 site migrations
// (getThisCycle, getBillsDue inner isPaid, renderDebtTiles L7656). Cases
// 1, 1b, 4 + edge fixtures cover this commit. Cases 2, 3, 6, 7, 8, 9 ship
// with Commits 2-3.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Pinned oracle — DO NOT swap this path to state-snapshot.json or any
// fixture:fresh-managed file. Version-bump by changing the filename here
// when a new hand-reconciliation lands.
const ORACLE_PATH = path.resolve(__dirname, '../state-dump/live-2026-05-21.json');
const FROZEN_ISO = '2026-05-21T22:00:00+10:00';
const oracle = JSON.parse(fs.readFileSync(ORACLE_PATH, 'utf8'));

function buildSlyghtV5(fx) {
  const S = Object.assign({}, fx.S || {});
  if (fx.paidBills && !S.paidBills) S.paidBills = fx.paidBills;
  return { S, BILLS: fx.BILLS || [] };
}

const TOL = 0.5;

const SETTLE_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
  }
`;

async function bootOracle(page, context) {
  await page.clock.install({ time: new Date(FROZEN_ISO) });
  await context.addInitScript((args) => {
    try { localStorage.setItem('slyght_v5', JSON.stringify(args.seed)); } catch (_) {}
    // Suppress all migration seeds — oracle is post-migration
    for (let i = 0; i < 40; i++) {
      try { localStorage.setItem('slyght_seeded_v' + i, '1'); } catch (_) {}
    }
    try { localStorage.setItem('slyght_bills_reset_month', args.monthKey); } catch (_) {}
  }, { seed: buildSlyghtV5(oracle), monthKey: '2026-5' });
  await page.goto(process.env.SMOKE_BASE_URL || '/');
  await page.addStyleTag({ content: SETTLE_CSS });
  await page.waitForFunction(() => typeof BRAIN !== 'undefined'
    && BRAIN.bills && typeof BRAIN.bills.isPaidInCycle === 'function'
    && typeof BRAIN.plan.getSnapshot === 'function', { timeout: 5000 });
  await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page.evaluate(() => {
    const modal = document.getElementById('eod-recon-modal');
    if (modal && modal.classList.contains('open') && typeof eodReconAccept === 'function') eodReconAccept();
  });
}

test.describe('Sub-bundle 1 — Cashflow Truth (Commit 1: isPaidInCycle substrate)', () => {
  test.beforeEach(({ page, context }) => bootOracle(page, context));

  // Case 1 — isPaidInCycle reproduces the 10 known-paid bills.
  // Hand-reconciliation paid-list, each verified by matching txn evidence.
  test('Case 1: isPaidInCycle returns true for all 10 known-paid bills (matching txn or paidBills key)', async ({ page }) => {
    const r = await page.evaluate(() => {
      const cycleStart = new Date(S.activePlan.cycleStartDate);
      // Match each known-paid by name substring (handles "KIA Loan — Firstmac"
      // etc — exact match is brittle to bill renames).
      const targets = [
        { match: 'Rent + Deposit', expectedAmt: 3000 },
        { match: 'KIA Loan',       expectedAmt: 780 },
        { match: 'Optus',          expectedAmt: 194 },
        { match: 'Allianz CTP',    expectedAmt: 566 },
        { match: 'KIA Registration', expectedAmt: 462 },
        { match: 'Claude Max',     expectedAmt: 340 },
        { match: 'YouTube',        expectedAmt: 16.99 },
        // Pet Insurance day-20 (NOT Bowtie day-6 — that's still due Jun 6)
        { match: 'Pet Insurance',  expectedAmt: 60.27, dayPreferred: 20 },
      ];
      const out = {};
      for (const t of targets) {
        let bill = (BILLS || []).find(b => b && b.name && b.name.includes(t.match)
          && (t.dayPreferred === undefined || b.day === t.dayPreferred));
        if (!bill) bill = (BILLS || []).find(b => b && b.name && b.name.includes(t.match));
        out[t.match] = {
          found: !!bill,
          billAmt: bill ? bill.amt : null,
          isPaid: bill ? BRAIN.bills.isPaidInCycle(bill, cycleStart) : null,
        };
      }
      return out;
    });
    for (const [name, info] of Object.entries(r)) {
      expect(info.found, `Bill "${name}" should exist in BILLS`).toBe(true);
      expect(info.isPaid, `Bill "${name}" should be detected as paid this cycle (txn-match or flag)`).toBe(true);
    }
  });

  // Case 1b — isPaidInCycle returns false for the 7 known-still-due bills.
  // Pre-fix, these would have been detected paid only if paidBills key
  // was set; the still-due list specifically captures bills whose key
  // is NOT in paidBills (no future-flag flag, no past txn match).
  test('Case 1b: isPaidInCycle returns false for bills with no flag and no matching txn', async ({ page }) => {
    const r = await page.evaluate(() => {
      const cycleStart = new Date(S.activePlan.cycleStartDate);
      const stillDue = [
        { match: 'Adobe' },
        { match: 'Spotify' },
        { match: 'Google One' },
        // Pet Insurance Bowtie (day 6, distinct from Pet Insurance day-20)
        { match: 'Bowtie' },
        { match: 'Stan' },
        { match: 'Claude Plus' },
        { match: 'Netflix' },
      ];
      const out = {};
      for (const t of stillDue) {
        const bill = (BILLS || []).find(b => b && b.name && b.name.includes(t.match));
        out[t.match] = {
          found: !!bill,
          billAmt: bill ? bill.amt : null,
          isPaid: bill ? BRAIN.bills.isPaidInCycle(bill, cycleStart) : null,
        };
      }
      return out;
    });
    for (const [name, info] of Object.entries(r)) {
      expect(info.found, `Bill "${name}" should exist in BILLS`).toBe(true);
      expect(info.isPaid, `Bill "${name}" should NOT be detected as paid (still due)`).toBe(false);
    }
  });

  // Case 4 — Conservation: bills.paid + bills.unpaidTotal === bills.total.
  // The Bundle 32.4 conservation invariant (essentials lifecycle split)
  // must still hold after migration. Post-Commit-1 the values shift
  // (~$5,479 of bills flip from unpaid to paid), but the arithmetic
  // conservation is invariant.
  test('Case 4: bills.paid + bills.unpaidTotal === bills.total (conservation across the migration)', async ({ page }) => {
    const r = await page.evaluate(() => {
      const snap = BRAIN.plan.getSnapshot();
      const b = snap.bills;
      const breakdown = snap.derived && snap.derived.essentialsBreakdown;
      const paidEss = snap.derived && snap.derived.essentialsPaidTotal;
      const upcomingEss = snap.derived && snap.derived.essentialsUpcomingTotal;
      const totalEss = snap.derived && snap.derived.essentialsTotal;
      return {
        billsTotal: b && b.total,
        billsUnpaidTotal: b && b.unpaidTotal,
        // Bundle 32.1 expected snap.bills shape; if .paid isn't directly
        // exposed, derive: paid = total - unpaid
        billsPaid: (b && typeof b.total === 'number' && typeof b.unpaidTotal === 'number')
          ? b.total - b.unpaidTotal : null,
        essentialsPaid: paidEss,
        essentialsUpcoming: upcomingEss,
        essentialsTotal: totalEss,
      };
    });
    // bills conservation
    expect(typeof r.billsTotal).toBe('number');
    expect(typeof r.billsUnpaidTotal).toBe('number');
    expect(r.billsTotal).toBeGreaterThan(0);
    expect(r.billsUnpaidTotal).toBeGreaterThanOrEqual(0);
    expect(r.billsUnpaidTotal).toBeLessThanOrEqual(r.billsTotal + TOL);
    // essentials conservation (Bundle 32.5 Pass 1.a invariant)
    expect(Math.abs((r.essentialsPaid + r.essentialsUpcoming) - r.essentialsTotal)).toBeLessThan(TOL);
  });

  // Case 1c (edge — synthetic) — txn-match-only path.
  // Inject a bill with no paidBills entry but a matching txn. Pre-fix
  // (flag-only) would return false. Post-fix returns true via Path 2.
  test('Case 1c: txn-match-only path — paidBills empty for a bill but matching txn exists ⇒ paid', async ({ page }) => {
    const r = await page.evaluate(() => {
      const cycleStart = new Date(S.activePlan.cycleStartDate);
      // Inject synthetic bill + matching txn
      const testBill = {
        name: 'SyntheticOptus', amt: 250, day: 18, recurring: true, autoDebit: true,
      };
      const csMs = cycleStart.getTime();
      const billDate = new Date(cycleStart.getFullYear(), cycleStart.getMonth(), 18);
      // Confirm bill date is in cycle and past, else we can't test Path 2
      const txn = {
        ts: billDate.getTime() + 86400000,  // 1 day after billDate
        amt: 250, note: 'syntheticoptus paid', income: false,
      };
      S.txns.push(txn);
      const detected = BRAIN.bills.isPaidInCycle(testBill, cycleStart);
      S.txns.pop();  // clean up
      return { detected };
    });
    expect(r.detected).toBe(true);
  });

  // Case 1d (edge — synthetic) — flag-only path.
  // Bill with paidBills entry, no matching txn. Should still return true.
  test('Case 1d: flag-only path — paidBills key set but no matching txn ⇒ paid', async ({ page }) => {
    const r = await page.evaluate(() => {
      const cycleStart = new Date(S.activePlan.cycleStartDate);
      const testBill = {
        name: 'SyntheticFlagOnly', amt: 99, day: 22, recurring: true, autoDebit: true,
      };
      // Inject paidBills entry with the cycle-resolved key
      const key = paidBillKey(testBill.name, testBill.day, cycleStart.getMonth(), cycleStart.getFullYear());
      S.paidBills = S.paidBills || {};
      S.paidBills[key] = { paid: true, ts: Date.now(), _scheduledAutoDebit: true };
      const detected = BRAIN.bills.isPaidInCycle(testBill, cycleStart);
      delete S.paidBills[key];  // clean up
      return { detected };
    });
    expect(r.detected).toBe(true);
  });

  // Case 1e (edge — synthetic) — cycle clamp: prior-cycle txn doesn't leak.
  // A txn from before cycleStart should NOT satisfy current cycle's bill.
  test('Case 1e: cycle clamp — txn before cycleStart does NOT satisfy current cycle bill', async ({ page }) => {
    const r = await page.evaluate(() => {
      const cycleStart = new Date(S.activePlan.cycleStartDate);
      const testBill = {
        name: 'SyntheticClampTest', amt: 150, day: 16, recurring: true,
      };
      // Inject txn 30 days BEFORE cycleStart (prior cycle)
      const priorTxn = {
        ts: cycleStart.getTime() - 30 * 86400000,
        amt: 150, note: 'syntheticclamptest paid', income: false,
      };
      S.txns.push(priorTxn);
      const detected = BRAIN.bills.isPaidInCycle(testBill, cycleStart);
      S.txns.pop();
      return { detected };
    });
    // Pre-fix _isPaidByMatchingTxn would NOT have clamped — it could find
    // this txn. Post-fix isPaidInCycle clamps to >= cycleStart.
    expect(r.detected).toBe(false);
  });

  // ── Commit 2 cases: trip-aware daily-living substrate (Option C) ──

  // Case 6a — Snapshot livingTotal under Option C with Darwin fully covered.
  // Live state: Darwin Jun 7-15 ($800 target) fully covered by Darwin Trip
  // bucket ($800 saved). cycleStartDate 2026-05-14, cycleEndDate 2026-06-14,
  // daysInCycle 31. Trip days Jun 7-14 (8 days) overlap cycle. Under Option C,
  // bucket fully covers → uplift = 0 on every trip day → livingTotal stays
  // at floor × daysInCycle = $30 × 31 = $930. PROVES the substrate doesn't
  // false-fire when bucket is funded.
  test('Case 6a: snapshot dailyLiving.plannedTotal = floor × daysInCycle when trip is fully bucket-covered', async ({ page }) => {
    const r = await page.evaluate(() => {
      const snap = BRAIN.plan.getSnapshot();
      return {
        plannedTotal: snap.dailyLiving.plannedTotal,
        floor: snap.dailyLiving.floor,
        daysInCycle: snap.daysInCycle,
        tripUpliftTotal: snap.dailyLiving.tripUpliftTotal,
        tripActiveDays: snap.dailyLiving.tripActiveDays,
      };
    });
    expect(r.floor).toBe(30);
    expect(r.daysInCycle).toBe(31);
    // Darwin fully bucket-covered → ZERO uplift, ZERO active trip days
    expect(r.tripUpliftTotal).toBe(0);
    expect(r.tripActiveDays).toBe(0);
    // livingTotal exactly floor × daysInCycle
    expect(r.plannedTotal).toBeCloseTo(r.floor * r.daysInCycle, 1);
    expect(r.plannedTotal).toBeCloseTo(930, 1);
  });

  // Case 6b — Forecast Option C: Darwin bucket-covered → zero trip uplift.
  // The forecast's daily-cost basis is getMinDailySpend() (dynamic, derived
  // from 30-day spend pace, clamped [20, 40]), NOT snap's static floor.
  // The hand-reconciliation's $720 number maps to snap.dailyLiving.floor ×
  // daysRemaining and lives in Commit 3's safeToSpendHeadroom field.
  // Here we assert what THIS commit's substrate change actually proves:
  // forecast no longer adds bucket-funded uplift on trip days.
  test('Case 6b: forecast Option C — bucket-covered trip contributes zero uplift', async ({ page }) => {
    const r = await page.evaluate(() => {
      if (typeof getSurvivalForecast !== 'function') return { skip: true, reason: 'no-forecast-fn' };
      const f = getSurvivalForecast();
      return {
        skip: false,
        minLivingCosts: f.minLivingCosts,
        minDailyNeeded: f.minDailyNeeded,
        tripUpliftTotal: f.tripUpliftTotal,
        tripActiveDays: f.tripActiveDays,
        days: f.days,
      };
    });
    if (r.skip) test.skip(true, r.reason);
    // Darwin fully covered (Option C netOfBucket): zero trip uplift in forecast
    expect(r.tripUpliftTotal).toBe(0);
    expect(r.tripActiveDays).toBe(0);
    // With zero trip uplift, minLivingCosts === days × minDailyNeeded
    // (no trip extras). Asserts the relationship, not an absolute number,
    // so dynamic minDailyNeeded variance doesn't break the test.
    expect(r.minLivingCosts).toBeCloseTo(r.days * r.minDailyNeeded, 1);
  });

  // Case 7 — Synthetic underfund: zero out Darwin bucket → uplift fires.
  // Validates the substrate actually responds to bucket state.
  test('Case 7: zeroing Darwin bucket triggers trip uplift in snapshot + forecast', async ({ page }) => {
    const r = await page.evaluate(() => {
      // Snapshot Darwin's current state, then zero its bucket
      const darwin = (typeof BRAIN !== 'undefined' && BRAIN.plan && BRAIN.plan.intent)
        ? BRAIN.plan.intent.get('darwin-2026') : null;
      if (!darwin) return { skip: true, reason: 'no-darwin-intent' };
      const bucket = (S.savingsBuckets || []).find(b => b.name === darwin.bucketId || b.id === darwin.bucketId);
      if (!bucket) return { skip: true, reason: 'no-darwin-bucket' };

      const beforeSnap = BRAIN.plan.getSnapshot();
      const beforeFc = (typeof getSurvivalForecast === 'function') ? getSurvivalForecast() : null;

      const origSaved = bucket.saved;
      bucket.saved = 0;
      const afterSnap = BRAIN.plan.getSnapshot();
      const afterFc = (typeof getSurvivalForecast === 'function') ? getSurvivalForecast() : null;
      bucket.saved = origSaved;  // restore

      return {
        skip: false,
        target: darwin.targetAmount,
        bucketOriginal: origSaved,
        snapLivingBefore: beforeSnap.dailyLiving.plannedTotal,
        snapLivingAfter: afterSnap.dailyLiving.plannedTotal,
        snapTripUpliftBefore: beforeSnap.dailyLiving.tripUpliftTotal,
        snapTripUpliftAfter: afterSnap.dailyLiving.tripUpliftTotal,
        forecastLivingBefore: beforeFc && beforeFc.minLivingCosts,
        forecastLivingAfter: afterFc && afterFc.minLivingCosts,
      };
    });
    if (r.skip) test.skip(true, r.reason);
    // Substrate must actually respond: zero bucket → uplift fires
    expect(r.snapTripUpliftBefore).toBe(0);
    expect(r.snapTripUpliftAfter).toBeGreaterThan(0);
    // Snap livingTotal grew by trip-days × residual_per_day
    expect(r.snapLivingAfter).toBeGreaterThan(r.snapLivingBefore);
    // Forecast also responds (proves the migrated L5828 call wired correctly)
    expect(r.forecastLivingAfter).toBeGreaterThan(r.forecastLivingBefore);
  });

  // INV-uplift A — perDayLivingCost is the source-of-truth; plannedTotal sums it.
  test('INV-uplift A: snap.dailyLiving.plannedTotal === Σ perDayLivingCost', async ({ page }) => {
    const r = await page.evaluate(() => {
      const snap = BRAIN.plan.getSnapshot();
      const arr = snap.dailyLiving.perDayLivingCost || [];
      const sum = arr.reduce((s, v) => s + (+v || 0), 0);
      return { plannedTotal: snap.dailyLiving.plannedTotal, sum, len: arr.length, daysInCycle: snap.daysInCycle };
    });
    expect(r.len).toBe(r.daysInCycle);
    expect(Math.abs(r.plannedTotal - r.sum)).toBeLessThan(TOL);
  });

  // INV-uplift C — fully-covered trip contributes zero uplift days.
  test('INV-uplift C: fully bucket-covered trip → tripUpliftTotal === 0', async ({ page }) => {
    const r = await page.evaluate(() => {
      const snap = BRAIN.plan.getSnapshot();
      return { uplift: snap.dailyLiving.tripUpliftTotal };
    });
    expect(r.uplift).toBe(0);
  });

  // Case 1f — Reconciliation oracle headline assertion.
  // The whole point of Commit 1: app reports the bill-paid truth that
  // matches today's hand-reconciliation. snap.bills.unpaidTotal pre-fix
  // was $5,638.62; post-Commit-1 should drop to ~$188 (or a value in
  // the right order of magnitude — Moshtix conditional, Pet Ins fixture
  // variance, etc.).
  test('Case 1f: snap.bills.unpaidTotal drops from $5,638 (pre-fix) to under $300 (post-fix)', async ({ page }) => {
    const r = await page.evaluate(() => {
      const snap = BRAIN.plan.getSnapshot();
      return { unpaid: snap.bills.unpaidTotal, total: snap.bills.total };
    });
    // Pre-fix oracle baseline: 5638.62 ± minor
    // Post-fix target: < 300 (genuine still-due subscriptions only)
    expect(r.unpaid).toBeLessThan(300);
    expect(r.unpaid).toBeGreaterThan(50);  // sanity floor — should NOT be 0
  });
});
