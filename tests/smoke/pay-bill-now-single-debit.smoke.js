// P0-1 regression test — payBillNow must single-debit, not double-debit.
//
// Before fix: outer raw `S.bal -= billAmt` at L19949 fires AFTER
// BRAIN.bills.markPaid has already debited via recordWithAllocation envelope.
// Bill amount leaves S.bal twice.
//
// After fix: L19949 deleted; markPaid envelope owns balance mutation (matches
// the markBillPaidMonth reference shape at L8749).
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
    && BRAIN.bills && typeof BRAIN.bills.markPaid === 'function'
    && typeof payBillNow === 'function', { timeout: 5000 });
  await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page.evaluate(() => {
    const modal = document.getElementById('eod-recon-modal');
    if (modal && modal.classList.contains('open') && typeof eodReconAccept === 'function') eodReconAccept();
  });
}

test.describe('P0-1 — payBillNow single-debit', () => {
  test.beforeEach(({ page, context }) => boot(page, context));

  // Case 1 — calling payBillNow on a fresh test bill drops S.bal by exactly
  // billAmt, not 2× billAmt. The pre-fix double-debit would surface here as
  // diff === 2 × amt.
  test('Case 1: payBillNow drops S.bal by exactly billAmt (not double)', async ({ page }) => {
    const result = await page.evaluate(() => {
      const TEST_BILL_NAME = '__P0-1 Test Bill__';
      const TEST_BILL_DAY = 1; // ensures canMarkBillPaid passes the gate (day < today)
      const TEST_BILL_AMT = 50;

      // Clean up any prior test fixture
      const existingIdx = BILLS.findIndex(b => b.name === TEST_BILL_NAME);
      if (existingIdx >= 0) BILLS.splice(existingIdx, 1);
      const cycleStart = new Date(S.activePlan.cycleStartDate);
      const cycleMonth = cycleStart.getMonth() + 1;
      const cycleYear = cycleStart.getFullYear();
      const billMonth = TEST_BILL_DAY < (S.payday || 15) ? cycleMonth + 1 : cycleMonth;
      const billYear = billMonth > 12 ? cycleYear + 1 : cycleYear;
      const adjustedMonth = billMonth > 12 ? billMonth - 12 : billMonth;
      const key = `${billYear}-${adjustedMonth}-${TEST_BILL_NAME}-${TEST_BILL_DAY}`;
      delete S.paidBills[key];
      BILLS.push({ name: TEST_BILL_NAME, day: TEST_BILL_DAY, amt: TEST_BILL_AMT, tag: 'Bills', recurring: true });

      const balBefore = +S.bal;
      const txnsCountBefore = S.txns.length;

      payBillNow(TEST_BILL_NAME, TEST_BILL_DAY, TEST_BILL_AMT);

      const balAfter = +S.bal;
      const txnsCountAfter = S.txns.length;
      const paidFlag = S.paidBills[key];

      return {
        balBefore: +balBefore.toFixed(2),
        balAfter: +balAfter.toFixed(2),
        expectedAfter: +(balBefore - TEST_BILL_AMT).toFixed(2),
        diff: +(balBefore - balAfter).toFixed(2),
        txnsCountBefore,
        txnsCountAfter,
        paidFlag,
        TEST_BILL_AMT,
        key,
      };
    });

    // Single-debit assertion (the regression lock)
    expect(result.diff).toBeCloseTo(result.TEST_BILL_AMT, 2);
    expect(result.balAfter).toBeCloseTo(result.expectedAfter, 2);

    // Bill is now flagged paid (markPaid envelope wrote the key)
    expect(result.paidFlag).toBeTruthy();

    // Envelope appended one txn (the paired debit)
    expect(result.txnsCountAfter).toBeGreaterThanOrEqual(result.txnsCountBefore + 1);

    // Negative — diff is NOT 2× amt (the pre-fix double-debit signature)
    expect(result.diff).not.toBeCloseTo(result.TEST_BILL_AMT * 2, 2);
  });
});
