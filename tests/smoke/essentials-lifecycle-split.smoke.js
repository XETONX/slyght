// Bundle 32.5 Pass 1.a — essentials lifecycle split conservation smoke.
//
// Substrate addition consumed by the upcoming hero "where the money sits"
// breakdown. Splits snap.derived essentials into paid-out (executed bill +
// debt mark-paid events) vs still-upcoming (everything else — including
// budgeted daily-living + provisions per Option A decision 2026-05-19).
//
// 3 cases:
//   1. Conservation invariant: paidTotal + upcomingTotal === essentialsTotal
//      paidTotal + upcomingTotal + remainder === totalToPlan
//      Both must hold simultaneously.
//   2. Paying a bill via canonical writer increases paidTotal + decreases
//      upcomingTotal by exactly the bill amount; essentialsTotal stays put;
//      remainder stays put.
//   3. Daily-living + provisions stay in upcoming bucket regardless of
//      cycle phase (Option A — budgeted not transacted). Forcing
//      daysRemaining → 0 doesn't move them into paid.
//
// Run: npm run smoke

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const FIXTURE_PATH = path.resolve(__dirname, '../../state-snapshot.json');
const FROZEN_ISO = '2026-05-19T22:00:00+10:00';
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

const TOL = 0.5;  // half-dollar tolerance for accumulated rounding

test.describe('Bundle 32.5 Pass 1.a — essentials lifecycle split conservation', () => {
  test.beforeEach(async ({ page, context }) => {
    await page.clock.install({ time: new Date(FROZEN_ISO) });
    await context.addInitScript((args) => {
      try { localStorage.setItem('slyght_v5', JSON.stringify(args.seed)); } catch (_) {}
      try { localStorage.setItem('slyght_seeded_v13', '1'); } catch (_) {}
      try { localStorage.setItem('slyght_seeded_v12', '1'); } catch (_) {}
      try { localStorage.setItem('slyght_seeded_v11', '1'); } catch (_) {}
      try { localStorage.setItem('slyght_bills_reset_month', args.monthKey); } catch (_) {}
    }, { seed: buildSlyghtV5(fixture), monthKey: '2026-5' });
    await page.goto(process.env.SMOKE_BASE_URL || '/');
    await page.addStyleTag({ content: SETTLE_CSS });
    await page.waitForFunction(() => typeof BRAIN !== 'undefined'
      && BRAIN.plan && typeof BRAIN.plan.getSnapshot === 'function', { timeout: 5000 });
    await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
    await page.evaluate(() => {
      const modal = document.getElementById('eod-recon-modal');
      if (modal && modal.classList.contains('open') && typeof eodReconAccept === 'function') eodReconAccept();
    });
  });

  test('Case 1: conservation — paid + upcoming === essentialsTotal; paid + upcoming + remainder === totalToPlan', async ({ page }) => {
    const r = await page.evaluate(() => {
      const snap = BRAIN.plan.getSnapshot();
      const d = snap.derived;
      return {
        paid: d.essentialsPaidTotal,
        upcoming: d.essentialsUpcomingTotal,
        essentialsTotal: d.essentialsTotal,
        remainder: d.remainder,
        totalToPlan: snap.totalToPlan,
      };
    });
    // Both fields exist and are numbers
    expect(typeof r.paid).toBe('number');
    expect(typeof r.upcoming).toBe('number');
    // Both are non-negative
    expect(r.paid).toBeGreaterThanOrEqual(0);
    expect(r.upcoming).toBeGreaterThanOrEqual(0);
    // First conservation: lifecycle split sums to essentials total
    expect(Math.abs((r.paid + r.upcoming) - r.essentialsTotal),
      `paid $${r.paid} + upcoming $${r.upcoming} ≠ essentialsTotal $${r.essentialsTotal}`).toBeLessThan(TOL);
    // Second conservation: full hero math
    expect(Math.abs((r.paid + r.upcoming + r.remainder) - r.totalToPlan),
      `paid + upcoming + remainder $${r.paid + r.upcoming + r.remainder} ≠ totalToPlan $${r.totalToPlan}`).toBeLessThan(TOL);
  });

  test('Case 2: paying a bill via canonical writer moves $ from upcoming → paid; essentialsTotal + remainder unchanged', async ({ page }) => {
    const r = await page.evaluate(() => {
      // Reset to unlocked baseline first — INV-29 doesn't apply to markPaid
      // but cleaner setup
      if (S.activePlan && S.activePlan.lockedAt) {
        S.activePlan.lockedAt = null;
        try { BRAIN.allocation.unlock(BRAIN.SOURCES.CANVAS_UNLOCK); } catch (_) {}
      }
      // Find an unpaid bill in this cycle
      const billsList = (BRAIN.bills && BRAIN.bills.getThisCycle) ? BRAIN.bills.getThisCycle() : [];
      const unpaidBill = billsList.find(b => !b.paid);
      if (!unpaidBill) return { skip: true, reason: 'no-unpaid-bill' };
      const before = BRAIN.plan.getSnapshot().derived;
      const billAmt = +unpaidBill.amt || 0;
      // Mark it paid via canonical writer (NOT _skipFreeMoneyGate since this
      // is a user-initiated mark-paid not an auto-debit batch)
      const r = BRAIN.bills.markPaid(unpaidBill, BRAIN.SOURCES.MARK_BILL_PAID, { autoDebit: false });
      if (!r.ok) return { skip: true, reason: 'mark-paid-refused:' + r.reason };
      const after = BRAIN.plan.getSnapshot().derived;
      return {
        skip: false,
        billAmt,
        paidDelta: after.essentialsPaidTotal - before.essentialsPaidTotal,
        upcomingDelta: after.essentialsUpcomingTotal - before.essentialsUpcomingTotal,
        essentialsTotalDelta: after.essentialsTotal - before.essentialsTotal,
        remainderDelta: after.remainder - before.remainder,
      };
    });
    if (r.skip) test.skip(true, r.reason);
    // Paid increases by ~billAmt
    expect(Math.abs(r.paidDelta - r.billAmt),
      `paid delta $${r.paidDelta} ≠ +$${r.billAmt}`).toBeLessThan(TOL);
    // Upcoming decreases by ~billAmt
    expect(Math.abs(r.upcomingDelta - (-r.billAmt)),
      `upcoming delta $${r.upcomingDelta} ≠ -$${r.billAmt}`).toBeLessThan(TOL);
    // Essentials total + remainder don't move (lifecycle shift only)
    expect(Math.abs(r.essentialsTotalDelta)).toBeLessThan(TOL);
    expect(Math.abs(r.remainderDelta)).toBeLessThan(TOL);
  });

  test('Case 3: daily-living + provisions live in upcoming regardless of cycle phase (Option A)', async ({ page }) => {
    const r = await page.evaluate(() => {
      const snap = BRAIN.plan.getSnapshot();
      const d = snap.derived;
      const eb = d.essentialsBreakdown;
      // dailyLiving + provisions amounts (both are budgeted, no paid concept)
      const budgetedBucket = eb.dailyLiving + eb.provisions;
      // Lifecycle bucket totals
      const upcoming = d.essentialsUpcomingTotal;
      const paid = d.essentialsPaidTotal;
      return {
        budgetedBucket,
        upcoming,
        paid,
        // upcoming must be at least the size of dailyLiving + provisions
        upcomingCoversBudgeted: upcoming >= budgetedBucket - 0.5,
        // paid must NOT include any portion of dailyLiving / provisions
        // (i.e., paid never exceeds bills+debts paid)
        eb,
      };
    });
    // The budgeted bucket (dailyLiving + provisions) is wholly contained
    // within "upcoming" — paid never gets credit for them.
    expect(r.upcomingCoversBudgeted,
      `upcoming $${r.upcoming} must include dailyLiving + provisions $${r.budgetedBucket}`).toBe(true);
    // Sanity: paid ≤ (bills total + debts total) — never includes
    // dailyLiving or provisions contribution
    const billsPlusDebts = r.eb.bills + r.eb.debts;
    expect(r.paid).toBeLessThanOrEqual(billsPlusDebts + 0.5);
  });

  // Bug-1.5 hotfix (2026-05-21) — paid non-viaRent debt conservation.
  // Pre-fix, `debtsList = S.debts.filter(!d.paid && !d.viaRent)` excluded
  // paid debts from debtsTotal, but `paidDebtsTotal` independently filtered
  // `d.paid && !d.viaRent` and was added to essentialsPaidTotal. The two
  // filters were asymmetric: a paid non-viaRent debt sat in essentialsPaidTotal
  // without a matching contribution in essentialsTotal. The arithmetic
  // conservation (paid + upcoming === total) still held by construction
  // (upcoming = total − paid), but the SEMANTICS broke — essentialsTotal
  // under-counted by exactly paidDebtsTotal whenever paid non-viaRent debts
  // existed. Hero "where the money sits" panel mis-attributed.
  // Baseline fixture's Teachers Health (paid, amt $259.41) was masked by
  // bills $5,684 dominating the totals; live state with smaller bill set
  // exposed it. Fix: debtsList includes paid (mirrors bills pattern),
  // debtsUnpaidTotal filtered separately, paidDebtsTotal derived.
  // This case injects a $500 paid non-viaRent debt and asserts:
  //   - essentialsTotal grows by exactly the injected amount
  //   - essentialsPaidTotal grows by exactly the injected amount
  //   - essentialsUpcomingTotal stays put (paid debts don't go to upcoming)
  //   - arithmetic conservation still holds
  test('Case 4: Bug-1.5 regression — paid non-viaRent debt grows essentialsTotal + essentialsPaidTotal symmetrically', async ({ page }) => {
    const r = await page.evaluate(() => {
      const before = BRAIN.plan.getSnapshot().derived;
      // Inject a paid non-viaRent debt with non-zero amount.
      S.debts = S.debts || [];
      S.debts.push({
        id: 'test-bug-1-5-paid-debt',
        name: 'Test Paid Debt (Bug 1.5 regression)',
        amt: 500,
        paid: true,
        viaRent: false,
      });
      const after = BRAIN.plan.getSnapshot().derived;
      return {
        before: {
          paid: before.essentialsPaidTotal,
          upcoming: before.essentialsUpcomingTotal,
          total: before.essentialsTotal,
          debtsBreakdown: before.essentialsBreakdown.debts,
        },
        after: {
          paid: after.essentialsPaidTotal,
          upcoming: after.essentialsUpcomingTotal,
          total: after.essentialsTotal,
          debtsBreakdown: after.essentialsBreakdown.debts,
        },
      };
    });
    // Conservation holds before AND after the injection.
    expect(Math.abs((r.before.paid + r.before.upcoming) - r.before.total)).toBeLessThan(TOL);
    expect(Math.abs((r.after.paid + r.after.upcoming) - r.after.total)).toBeLessThan(TOL);
    // essentialsTotal grew by exactly the injected paid-debt amount.
    expect(r.after.total - r.before.total).toBeCloseTo(500, 1);
    // essentialsBreakdown.debts grew by the same amount (debts subfield mirrors debtsTotal).
    expect(r.after.debtsBreakdown - r.before.debtsBreakdown).toBeCloseTo(500, 1);
    // essentialsPaidTotal grew by exactly the injected paid-debt amount.
    expect(r.after.paid - r.before.paid).toBeCloseTo(500, 1);
    // Upcoming did NOT change — paid debt doesn't shift upcoming.
    expect(Math.abs(r.after.upcoming - r.before.upcoming)).toBeLessThan(TOL);
  });
});
