// P0-2 regression test — projectedEndBalance must filter status:'bought'
// items out of the knownUpcoming subtraction, mirroring bills/debts unpaid-only.
//
// Before fix: L21265 subtracted unfiltered upcomingTotal, double-counting items
// that tickItem had already debited from currentBalance via recordWithAllocation.
// After fix: L21265 uses upcomingUnboughtTotal; bought items contribute zero
// to the projection delta.
//
// Pinned oracle: live-2026-05-23.json (post-Ledger-Walk maiden run).

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ORACLE_PATH = path.resolve(__dirname, '../state-dump/live-2026-05-23.json');
const FROZEN_ISO = '2026-05-23T22:00:00+10:00';
const oracle = JSON.parse(fs.readFileSync(ORACLE_PATH, 'utf8'));

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

async function boot(page, context) {
  await page.clock.install({ time: new Date(FROZEN_ISO) });
  await context.addInitScript((args) => {
    try { localStorage.setItem('slyght_v5', JSON.stringify(args.seed)); } catch (_) {}
    for (let i = 0; i < 40; i++) {
      try { localStorage.setItem('slyght_seeded_v' + i, '1'); } catch (_) {}
    }
    try { localStorage.setItem('slyght_bills_reset_month', args.monthKey); } catch (_) {}
  }, { seed: buildSlyghtV5(oracle), monthKey: '2026-5' });
  await page.goto(process.env.SMOKE_BASE_URL || '/');
  await page.addStyleTag({ content: SETTLE_CSS });
  await page.waitForFunction(() => typeof BRAIN !== 'undefined'
    && BRAIN.plan && typeof BRAIN.plan.getSnapshot === 'function', { timeout: 5000 });
  await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page.evaluate(() => {
    const modal = document.getElementById('eod-recon-modal');
    if (modal && modal.classList.contains('open') && typeof eodReconAccept === 'function') eodReconAccept();
  });
}

test.describe('P0-2 — knownUpcoming projection filter (no double-subtract)', () => {
  test.beforeEach(({ page, context }) => boot(page, context));

  // Case 1 — inject an upcoming item with status:'bought', verify projectedEndBalance
  // does NOT subtract its amount (because tickItem semantically already did so via the
  // recordWithAllocation envelope, which updated currentBalance).
  test('Case 1: bought upcoming item is excluded from projectedEndBalance subtraction', async ({ page }) => {
    const result = await page.evaluate(() => {
      // Take a baseline snapshot
      const snap0 = BRAIN.plan.getSnapshot();
      const proj0 = snap0.derived.projectedEndBalance;
      const upcoming0 = snap0.derived.upcomingTotal !== undefined
        ? snap0.derived.upcomingTotal
        : (S.activePlan.knownUpcoming || []).reduce((s, i) => s + (+i.amount || 0), 0);

      // Inject a new upcoming item with status:'bought' directly into S.activePlan.knownUpcoming
      // (simulating: user added the item and tickItem marked it bought, BUT for this assertion
      // we skip the recordWithAllocation call so currentBalance stays the same — isolating
      // the projection-math contribution from the balance-mutation contribution).
      const AMT = 123.45;
      S.activePlan.knownUpcoming = (S.activePlan.knownUpcoming || []).concat([
        { id: '__p0-2-test-bought__', name: '__P0-2 Bought Test__', amount: AMT, status: 'bought' }
      ]);

      const snap1 = BRAIN.plan.getSnapshot();
      const proj1 = snap1.derived.projectedEndBalance;

      // Cleanup
      S.activePlan.knownUpcoming = S.activePlan.knownUpcoming.filter(i => i.id !== '__p0-2-test-bought__');

      return {
        proj0: +proj0.toFixed(2),
        proj1: +proj1.toFixed(2),
        delta: +(proj1 - proj0).toFixed(2),
        AMT,
      };
    });

    // The bought item should NOT change projectedEndBalance — it was already
    // subtracted from currentBalance (we didn't move currentBalance in this test,
    // so the projection should remain unchanged).
    // Pre-fix, projectedEndBalance would drop by AMT (the double-subtract).
    expect(result.delta).toBeCloseTo(0, 2);

    // Negative — delta is NOT −AMT (the pre-fix double-subtract signature).
    expect(result.delta).not.toBeCloseTo(-result.AMT, 2);
  });

  // Case 2 — unbought upcoming items DO contribute to projection subtraction
  // (regression guard against over-filtering).
  test('Case 2: unbought upcoming item IS subtracted from projectedEndBalance', async ({ page }) => {
    const result = await page.evaluate(() => {
      const snap0 = BRAIN.plan.getSnapshot();
      const proj0 = snap0.derived.projectedEndBalance;

      const AMT = 77.77;
      S.activePlan.knownUpcoming = (S.activePlan.knownUpcoming || []).concat([
        { id: '__p0-2-test-unbought__', name: '__P0-2 Unbought Test__', amount: AMT, status: 'planned' }
      ]);

      const snap1 = BRAIN.plan.getSnapshot();
      const proj1 = snap1.derived.projectedEndBalance;

      S.activePlan.knownUpcoming = S.activePlan.knownUpcoming.filter(i => i.id !== '__p0-2-test-unbought__');

      return {
        proj0: +proj0.toFixed(2),
        proj1: +proj1.toFixed(2),
        delta: +(proj1 - proj0).toFixed(2),
        AMT,
      };
    });

    // Unbought item subtracts from projection by exactly AMT
    expect(result.delta).toBeCloseTo(-result.AMT, 2);
  });
});
