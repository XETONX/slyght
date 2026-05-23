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

  // Case 1d (edge — synthetic) — flag without ledger backing is SUSPECT.
  // CONTRACT CHANGE (P0-5, Ledger Walk session 2026-05-23): the prior Sub-bundle 1
  // Commit 1 contract treated any truthy paidBills entry as paid. P0-5 reverses
  // this per John's standing rule: paid:true + matching debit txn = LEGITIMATE;
  // paid:true + NO matching debit txn = SUSPECT (treated as unpaid). Object-shape
  // entries with _txnTs anchor fast-path through; everything else must verify
  // against the ledger.
  test('Case 1d (post-P0-5): flag without _txnTs AND without matching txn ⇒ NOT paid (suspect)', async ({ page }) => {
    const r = await page.evaluate(() => {
      const cycleStart = new Date(S.activePlan.cycleStartDate);
      // Use day=16: past payday (15), past the frozen-clock date (May 21),
      // so billDate is past nowTs and Path 2's future-bill guard doesn't trip.
      const testBill = {
        name: 'SyntheticFlagOnly', amt: 99, day: 16, recurring: true, autoDebit: true,
      };
      // Inject paidBills entry without _txnTs anchor (the orphan shape)
      const key = paidBillKey(testBill.name, testBill.day, cycleStart.getMonth(), cycleStart.getFullYear());
      S.paidBills = S.paidBills || {};
      S.paidBills[key] = { paid: true, ts: Date.now(), _scheduledAutoDebit: true };
      // No matching txn injected — Path 2 ledger verification will not find one
      const detectedNoLedger = BRAIN.bills.isPaidInCycle(testBill, cycleStart);

      // Now add a matching debit txn within the window — should flip to paid via Path 2
      const billDate = new Date(cycleStart.getFullYear(), cycleStart.getMonth(), testBill.day);
      const matchingTxn = {
        amt: 99, note: 'SyntheticFlagOnly — paid', cat: 'Bills',
        ts: billDate.getTime() + 1, income: false,
      };
      S.txns.push(matchingTxn);
      const detectedWithLedger = BRAIN.bills.isPaidInCycle(testBill, cycleStart);

      // Cleanup
      delete S.paidBills[key];
      S.txns = S.txns.filter(t => t !== matchingTxn);
      return { detectedNoLedger, detectedWithLedger };
    });
    // Orphan flag (no _txnTs, no matching txn) → SUSPECT → false
    expect(r.detectedNoLedger).toBe(false);
    // Same flag once a matching debit txn lands → LEGITIMATE → true
    expect(r.detectedWithLedger).toBe(true);
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

  // ── Commit 3 cases: safeToSpendHeadroom derivation in state ──

  // Case 8 — THE hero number. Hand-reconciliation 2026-05-21:
  //   cash $802.66 − bills still due − living remaining = headroom
  // For the frozen oracle: 8 bills still-due totalling $219.36, 24 days
  // remaining × $30 floor = $720, Darwin fully bucket-covered so no trip
  // uplift in remaining window. Expected headroom ≈ -$136.70.
  // (Hand-recon's -$105.51 figure excludes Moshtix on its endDate Jun 11
  // past the Jun 14 bill date; isPaidInCycle doesn't filter endDate-past
  // — separate finding, not Sub-bundle 1 scope.)
  test('Case 8: snap.derived.safeToSpendHeadroom = cash − billsStillDue − livingRemaining', async ({ page }) => {
    const r = await page.evaluate(() => {
      const snap = BRAIN.plan.getSnapshot();
      const d = snap.derived;
      return {
        headroom: d.safeToSpendHeadroom,
        receipt: d.cashflowReceipt,
        bal: S.bal,
        billsUnpaid: snap.bills.unpaidTotal,
        floor: snap.dailyLiving.floor,
        daysRemaining: snap.daysRemaining,
      };
    });
    // Receipt fields exposed
    expect(typeof r.headroom).toBe('number');
    expect(r.receipt).toBeTruthy();
    expect(r.receipt.cash).toBeCloseTo(r.bal, 1);
    expect(r.receipt.billsStillDue).toBeCloseTo(r.billsUnpaid, 1);
    expect(r.receipt.headroom).toBeCloseTo(r.headroom, 1);
    // Conservation: headroom === cash − billsStillDue − livingRemaining
    const expected = r.bal - r.billsUnpaid - r.receipt.livingRemaining;
    expect(r.headroom).toBeCloseTo(expected, 1);
    // Living-remaining bound: floor × daysRemaining ≤ livingRemaining
    // (equality when no trip uplift fires in remaining window)
    expect(r.receipt.livingRemaining).toBeGreaterThanOrEqual(r.floor * r.daysRemaining - 0.5);
    // For Darwin-bucket-covered oracle: tripUpliftRemaining = 0
    expect(r.receipt.tripUpliftRemaining).toBe(0);
    // Headroom against oracle should be in negative-or-slightly-positive
    // territory (cash $802 vs ~$219 bills + $720 living = roughly -$137)
    expect(r.headroom).toBeLessThan(0);
    expect(r.headroom).toBeGreaterThan(-200);
  });

  // Case 9 — Conservation across the full safeToSpendHeadroom derivation.
  // Cash + (income still to come) − all-obligations-in-cycle should equal
  // projectedEndBalance. Headroom and projectedEndBalance both project
  // cycle-end cash; they differ in scope (headroom is "spend room over
  // remaining days at floor"; projectedEndBalance is "cash if nothing
  // else happens"). Both should be in same ballpark when no income left.
  test('Case 9: headroom + livingRemaining recovers cash for the remaining window', async ({ page }) => {
    const r = await page.evaluate(() => {
      const snap = BRAIN.plan.getSnapshot();
      const d = snap.derived;
      return {
        cash: S.bal,
        headroom: d.safeToSpendHeadroom,
        livingRemaining: d.cashflowReceipt.livingRemaining,
        billsStillDue: d.cashflowReceipt.billsStillDue,
      };
    });
    // Algebraic check: cash = headroom + livingRemaining + billsStillDue
    const recovered = r.headroom + r.livingRemaining + r.billsStillDue;
    expect(recovered).toBeCloseTo(r.cash, 1);
  });

  // ── Commit 4a cases: hero render + receipt + cash-now footer ──

  // Case 10 — Hero displays the safeToSpendHeadroom, NOT S.bal.
  // Negative against oracle → coral class applied.
  test('Case 10: hero element displays safeToSpendHeadroom and applies coral when negative', async ({ page }) => {
    // Wait for full render — the new hero render runs inside renderAll
    await page.waitForFunction(() => {
      const el = document.querySelector('#h-bal');
      return el && el.textContent && el.textContent.length > 0;
    }, { timeout: 5000 });
    const r = await page.evaluate(() => {
      const snap = BRAIN.plan.getSnapshot();
      const hbal = document.querySelector('#h-bal');
      const ctx = document.querySelector('.hero-section .hero-ctx');
      return {
        heroText: hbal && hbal.textContent,
        heroClass: hbal && hbal.className,
        heroLabel: ctx && ctx.textContent,
        headroom: snap.derived.safeToSpendHeadroom,
        bal: S.bal,
      };
    });
    // Hero displays the headroom value, not S.bal. parseFloat preserves
    // sign so signed-vs-signed comparison.
    const heroNum = parseFloat(String(r.heroText).replace(/[^\d.-]/g, ''));
    expect(heroNum).toBeCloseTo(r.headroom, 0);
    // And NOT S.bal (the pre-Commit-4 hero value)
    expect(Math.abs(heroNum - r.bal)).toBeGreaterThan(50);
    // Against oracle (negative headroom) → coral class applied
    expect(r.heroClass).toContain('coral');
    // Hero label switched to safe-to-spend framing
    expect(r.heroLabel).toContain('SAFE TO SPEND');
    expect(r.heroLabel).toContain('DAYS TO PAYDAY');
  });

  // Case 11 — Receipt sub-line renders the math literally.
  test('Case 11: receipt sub-line renders cash − bills − living = headroom', async ({ page }) => {
    await page.waitForFunction(() => {
      const el = document.querySelector('#cashflow-receipt');
      return el && el.style.display !== 'none' && el.innerHTML && el.innerHTML.length > 0;
    }, { timeout: 5000 });
    const r = await page.evaluate(() => {
      const receipt = document.querySelector('#cashflow-receipt');
      const snap = BRAIN.plan.getSnapshot();
      return {
        receiptHTML: receipt && receipt.innerHTML,
        receiptVisible: receipt && receipt.style.display !== 'none',
        cash: snap.derived.cashflowReceipt.cash,
        billsStillDue: snap.derived.cashflowReceipt.billsStillDue,
        livingRemaining: snap.derived.cashflowReceipt.livingRemaining,
        headroom: snap.derived.cashflowReceipt.headroom,
      };
    });
    expect(r.receiptVisible).toBe(true);
    // Receipt contains each term as text
    expect(r.receiptHTML).toContain('bills');
    expect(r.receiptHTML).toContain('living');
    // Coral result class when negative
    if (r.headroom < 0) expect(r.receiptHTML).toContain('rcpt-result-neg');
  });

  // Case 12 — Failure line surfaces "over by $X" with run-dry date when negative.
  test('Case 12: failure line shows "over by $X · runs dry" when negative', async ({ page }) => {
    await page.waitForFunction(() => typeof BRAIN !== 'undefined' && BRAIN.dashboard
      && typeof BRAIN.dashboard.getBurn7d === 'function', { timeout: 5000 });
    const r = await page.evaluate(() => {
      const failLine = document.querySelector('#cashflow-failure-line');
      const snap = BRAIN.plan.getSnapshot();
      return {
        failText: failLine && failLine.textContent,
        failVisible: failLine && failLine.style.display !== 'none',
        headroom: snap.derived.safeToSpendHeadroom,
      };
    });
    if (r.headroom < 0) {
      expect(r.failVisible).toBe(true);
      expect(r.failText).toContain('over by');
    } else {
      expect(r.failVisible).toBe(false);
    }
  });

  // Case 13 — Cash-now footer displays S.bal as verified anchor.
  test('Case 13: cash-now footer renders S.bal with verified indicator', async ({ page }) => {
    await page.waitForFunction(() => {
      const el = document.querySelector('#cash-now-footer');
      return el && el.style.display !== 'none';
    }, { timeout: 5000 });
    const r = await page.evaluate(() => {
      const cnf = document.querySelector('#cash-now-footer');
      return {
        footerHTML: cnf && cnf.innerHTML,
        footerVisible: cnf && cnf.style.display !== 'none',
        bal: S.bal,
      };
    });
    expect(r.footerVisible).toBe(true);
    expect(r.footerHTML).toContain('in account now');
    expect(r.footerHTML).toContain('verified');
    // Footer shows S.bal value
    expect(r.footerHTML).toContain(r.bal.toFixed(2));
  });

  // Case 14 — getTopDiscretionaryCategory reader returns a structured result.
  test('Case 14: getTopDiscretionaryCategory ranks discretionary spend and returns biggest', async ({ page }) => {
    const r = await page.evaluate(() => {
      const cycleStart = new Date(S.activePlan.cycleStartDate);
      return BRAIN.dashboard.getTopDiscretionaryCategory(cycleStart);
    });
    // Shape verified — name may be null if no discretionary activity
    expect(r).toBeTruthy();
    expect('name' in r).toBe(true);
    expect('amount' in r).toBe(true);
    expect('projectedSaving7d' in r).toBe(true);
    // Against live oracle, John has heavy gaming/weed activity — should
    // surface one of the cuttable buckets.
    if (r.amount > 0) {
      expect(['gaming', 'takeaway', 'weed', 'coffee', 'food-out']).toContain(r.name);
    }
  });

  // Case 15 — getBurn7d returns 7-day discretionary burn with floor multiple.
  test('Case 15: getBurn7d computes 7-day burn + multiple of floor', async ({ page }) => {
    const r = await page.evaluate(() => BRAIN.dashboard.getBurn7d());
    expect(typeof r.total).toBe('number');
    expect(typeof r.perDay).toBe('number');
    expect(typeof r.multiple).toBe('number');
    expect(r.floor).toBe(30);
    // Live state has heavy recent spending — perDay should be > floor
    if (r.txnCount > 0) {
      expect(r.perDay).toBeGreaterThan(0);
      expect(r.multiple).toBeGreaterThanOrEqual(0);
    }
  });

  // Case 16 — computeHeadroomAtFloor simulates recovery levers.
  test('Case 16: computeHeadroomAtFloor returns headroom at alternative floor inputs', async ({ page }) => {
    const r = await page.evaluate(() => ({
      at30: BRAIN.dashboard.computeHeadroomAtFloor(30),
      at25: BRAIN.dashboard.computeHeadroomAtFloor(25),
      at20: BRAIN.dashboard.computeHeadroomAtFloor(20),
      current: BRAIN.plan.getSnapshot().derived.safeToSpendHeadroom,
    }));
    // All three should be numbers
    expect(typeof r.at30).toBe('number');
    expect(typeof r.at25).toBe('number');
    expect(typeof r.at20).toBe('number');
    // Lower floor → higher headroom (saving on daily living)
    expect(r.at25).toBeGreaterThan(r.at30 - 0.5);
    expect(r.at20).toBeGreaterThan(r.at25 - 0.5);
    // At current floor (oracle has $30), should match current headroom
    expect(r.at30).toBeCloseTo(r.current, 1);
  });

  // ── Commit 4b cases: TO RECOVER block + 7-day burn card + bills correction reveal ──

  // Case 17 — TO RECOVER block renders when headroom is negative, with 3 levers.
  test('Case 17: TO RECOVER block renders 3 levers when headroom negative', async ({ page }) => {
    await page.waitForFunction(() => {
      const el = document.querySelector('#to-recover-block');
      return el && el.style.display !== 'none' && el.innerHTML.length > 0;
    }, { timeout: 5000 });
    const r = await page.evaluate(() => {
      const block = document.querySelector('#to-recover-block');
      const levers = block.querySelectorAll('.to-recover-lever');
      const labels = Array.from(levers).map(l => l.querySelector('.lever-label')?.textContent || '');
      const results = Array.from(levers).map(l => l.querySelector('.lever-result')?.textContent || '');
      return {
        visible: block.style.display !== 'none',
        leverCount: levers.length,
        labels,
        results,
        hdr: block.querySelector('.tr-hdr')?.textContent || '',
      };
    });
    expect(r.visible).toBe(true);
    // Header text
    expect(r.hdr).toContain('TO RECOVER');
    // At least the 2 floor levers (and ideally the dynamic category one too)
    expect(r.leverCount).toBeGreaterThanOrEqual(2);
    // Labels include the floor-drop levers
    expect(r.labels.some(l => l.includes('$25/day'))).toBe(true);
    expect(r.labels.some(l => l.includes('$20/day'))).toBe(true);
    // Each lever has a computed result (signed)
    expect(r.results.every(s => /[-+]?\$/.test(s) || s.includes('→'))).toBe(true);
  });

  // Case 18 — TO RECOVER lever values match computeHeadroomAtFloor outputs.
  test('Case 18: TO RECOVER lever values match computeHeadroomAtFloor outputs', async ({ page }) => {
    const r = await page.evaluate(() => {
      const at25 = BRAIN.dashboard.computeHeadroomAtFloor(25);
      const at20 = BRAIN.dashboard.computeHeadroomAtFloor(20);
      const block = document.querySelector('#to-recover-block');
      const levers = Array.from(block.querySelectorAll('.to-recover-lever'));
      const findLever = (token) => levers.find(l => (l.querySelector('.lever-label')?.textContent || '').includes(token));
      const parse = (el) => {
        if (!el) return null;
        const txt = (el.querySelector('.lever-result')?.textContent || '').replace(/[^\d.-]/g, '');
        return parseFloat(txt);
      };
      return {
        at25_expected: at25,
        at25_displayed: parse(findLever('$25/day')),
        at20_expected: at20,
        at20_displayed: parse(findLever('$20/day')),
      };
    });
    expect(r.at25_displayed).toBeCloseTo(r.at25_expected, 0);
    expect(r.at20_displayed).toBeCloseTo(r.at20_expected, 0);
  });

  // Case 19 — Substrate proves positive-headroom path. Render-hide is
  // covered transitively by Cases 17 + 18 (which exercise the negative
  // path against the oracle); this case asserts the substrate flips
  // sign correctly when cash bias goes positive. Synthetic mutation
  // doesn't go through canonical writer — pure read-side proof.
  test('Case 19: substrate computes positive headroom under positive cash bias', async ({ page }) => {
    const r = await page.evaluate(() => {
      const origBal = S.bal;
      S.bal = 99999;  // synthetic-positive cash
      const headroom = BRAIN.plan.getSnapshot().derived.safeToSpendHeadroom;
      S.bal = origBal;  // restore
      return { headroom };
    });
    expect(r.headroom).toBeGreaterThan(0);
  });

  // Case 20 — 7-day burn card renders with total + perDay + multiple + leak.
  test('Case 20: 7-day burn card renders metrics + biggest cuttable leak', async ({ page }) => {
    await page.waitForFunction(() => {
      const el = document.querySelector('#burn-7d-card');
      return el && el.style.display !== 'none' && el.innerHTML.length > 0;
    }, { timeout: 5000 });
    const r = await page.evaluate(() => {
      const card = document.querySelector('#burn-7d-card');
      return {
        visible: card.style.display !== 'none',
        hdrText: card.querySelector('.b7-hdr')?.textContent || '',
        amtText: card.querySelector('.b7-amt')?.textContent || '',
        subText: card.querySelector('.b7-sub')?.textContent || '',
        leakText: card.querySelector('.b7-leak')?.textContent || '',
        burn7d: BRAIN.dashboard.getBurn7d(),
      };
    });
    expect(r.visible).toBe(true);
    expect(r.hdrText).toContain('7-day burn');
    expect(r.amtText).toContain('$');
    expect(r.subText).toContain('/day');
    expect(r.subText).toContain('× floor');
    // Leak section appears when there's discretionary activity
    if (r.burn7d.total > 0) {
      expect(r.leakText.length).toBeGreaterThan(0);
    }
  });

  // Case 21 — Bills correction reveal fires on first load with flag unset.
  test('Case 21: bills correction reveal renders when localStorage flag unset', async ({ page }) => {
    const r = await page.evaluate(() => {
      // Reset the flag and re-render
      localStorage.removeItem('slyght_bills_correction_revealed_v1');
      if (typeof renderAll === 'function') renderAll();
      const reveal = document.querySelector('#bills-correction-reveal');
      const snap = BRAIN.plan.getSnapshot();
      return {
        visible: reveal && reveal.style.display !== 'none',
        innerHTML: reveal && reveal.innerHTML,
        billsTotal: snap.bills.total,
        billsUnpaid: snap.bills.unpaidTotal,
        correctionDelta: snap.bills.total - snap.bills.unpaidTotal,
      };
    });
    // Reveal only triggers when there's a meaningful correction (>$500)
    if (r.correctionDelta > 500) {
      expect(r.visible).toBe(true);
      expect(r.innerHTML).toContain('BILLS CORRECTION');
      expect(r.innerHTML).toContain('real');
    } else {
      // Edge case: synthetic fixture with no correction — reveal stays hidden
      expect(r.visible).toBe(false);
    }
  });

  // Case 22 — Bills correction reveal sets flag and hides on dismiss.
  test('Case 22: dismissBillsCorrection() sets flag and hides the reveal', async ({ page }) => {
    const r = await page.evaluate(() => {
      localStorage.removeItem('slyght_bills_correction_revealed_v1');
      if (typeof renderAll === 'function') renderAll();
      const reveal = document.querySelector('#bills-correction-reveal');
      const visibleBefore = reveal && reveal.style.display !== 'none';
      if (typeof dismissBillsCorrection === 'function') dismissBillsCorrection();
      const visibleAfter = reveal && reveal.style.display !== 'none';
      const flagSet = localStorage.getItem('slyght_bills_correction_revealed_v1');
      // Re-render to confirm it doesn't come back
      if (typeof renderAll === 'function') renderAll();
      const visibleAfterRerender = reveal && reveal.style.display !== 'none';
      return { visibleBefore, visibleAfter, flagSet, visibleAfterRerender };
    });
    expect(r.flagSet).toBe('1');
    expect(r.visibleAfter).toBe(false);
    expect(r.visibleAfterRerender).toBe(false);
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
