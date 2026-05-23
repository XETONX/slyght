// CDB-28 regression test — getThisWeekProjection routes through
// BRAIN.bills.isPaidInCycle (canonical), not legacy isThisMonthlyBillPaid.
//
// Drone L Finding 9: pace card and MAX PER DAY in the same UI block used
// different bill-paid readers (legacy flag-only) while the hero used
// canonical isPaidInCycle (txn-match union). Result: three different
// answers to "is this bill paid this cycle" on the same screen.
//
// This commit collapses the pace surface onto the canonical reader,
// matching the hero.
//
// Pinned oracle: live-2026-05-23.json.

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
  await page.waitForFunction(() => typeof getThisWeekProjection === 'function'
    && typeof BRAIN !== 'undefined' && BRAIN.bills
    && typeof BRAIN.bills.isPaidInCycle === 'function', { timeout: 5000 });
  await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page.evaluate(() => {
    const modal = document.getElementById('eod-recon-modal');
    if (modal && modal.classList.contains('open') && typeof eodReconAccept === 'function') eodReconAccept();
  });
}

test.describe('CDB-28 — getThisWeekProjection uses canonical isPaidInCycle', () => {
  test.beforeEach(({ page, context }) => boot(page, context));

  // Case 1 — stub canonical reader to return true for a specific bill, verify
  // the projection excludes it from billsDueThisWeek. Proves the reader-swap
  // is what controls the decision (not the legacy flag-only path).
  test('Case 1: canonical reader return-true excludes bill from billsDueThisWeek', async ({ page }) => {
    const result = await page.evaluate(() => {
      const TEST_NAME = '__CDB-28 canonical-test bill__';
      const TEST_DAY = new Date().getDate(); // today, so the loop includes it
      const TEST_AMT = 99.99;
      // Clean any prior fixture
      const existingIdx = BILLS.findIndex(b => b.name === TEST_NAME);
      if (existingIdx >= 0) BILLS.splice(existingIdx, 1);
      BILLS.push({ name: TEST_NAME, day: TEST_DAY, amt: TEST_AMT, tag: 'Bills', recurring: true });

      // Baseline: NOT marked paid via any path → bill should be counted.
      const baseline = getThisWeekProjection().billsDueThisWeek;

      // Now stub canonical reader to return true for our test bill ONLY.
      const _origIsPaid = BRAIN.bills.isPaidInCycle;
      BRAIN.bills.isPaidInCycle = function(bill, cycleStart) {
        if (bill && bill.name === TEST_NAME) return true;
        return _origIsPaid.call(this, bill, cycleStart);
      };

      const afterStub = getThisWeekProjection().billsDueThisWeek;

      // Restore
      BRAIN.bills.isPaidInCycle = _origIsPaid;
      BILLS.splice(BILLS.findIndex(b => b.name === TEST_NAME), 1);

      return {
        baseline: +baseline.toFixed(2),
        afterStub: +afterStub.toFixed(2),
        delta: +(baseline - afterStub).toFixed(2),
        TEST_AMT,
      };
    });

    // The canonical reader stub returning true for the test bill excludes
    // it from billsDueThisWeek — the delta equals exactly TEST_AMT, proving
    // the canonical reader is the gate (not the legacy flag-only fallback).
    expect(result.delta).toBeCloseTo(result.TEST_AMT, 2);
    expect(result.afterStub).toBeLessThan(result.baseline);
  });
});
