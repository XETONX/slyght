// P0-5 regression test — BRAIN.bills.isPaidInCycle requires ledger backing.
//
// Before fix: Path 1 returned true on any paidBills[key] truthy entry,
// regardless of shape. A bare-true flag with no matching debit txn (the
// Stan-7-class orphan caught during the ledger walk maiden run) was
// counted as paid.
//
// After fix: Path 1 fast-paths object-shape entries with _txnTs anchor;
// bare-true entries fall through to Path 2's ledger-match. Per John's
// txn-anchored rule: paid:true + matching txn → legitimate; paid:true
// + NO matching txn → suspect (treated as unpaid).
//
// Per ADR-H citation discipline: this implementation ratifies the
// txn-anchored rule that John explicitly stated 2026-05-23.

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
    && BRAIN.bills && typeof BRAIN.bills.isPaidInCycle === 'function'
    && typeof paidBillKey === 'function', { timeout: 5000 });
  await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page.evaluate(() => {
    const modal = document.getElementById('eod-recon-modal');
    if (modal && modal.classList.contains('open') && typeof eodReconAccept === 'function') eodReconAccept();
  });
}

test.describe('P0-5 — isPaidInCycle txn-anchored guard', () => {
  test.beforeEach(({ page, context }) => boot(page, context));

  // Case 1 — synthetic object-shape flag with _txnTs anchor → legitimate (fast path).
  // Mirrors the Allianz CTP / KIA Rego early-payment case from the maiden walk:
  // flag carries _txnTs back-ref, isPaidInCycle returns true on the strength of
  // that anchor alone (no ledger lookup required). Uses a bill day > payday so
  // cycle-month math is unambiguous and doesn't confound the test.
  test('Case 1: object flag with _txnTs returns true (legitimate fast path)', async ({ page }) => {
    const result = await page.evaluate(() => {
      const cycleStart = new Date(S.activePlan.cycleStartDate);
      const TEST_NAME = '__P0-5 LegitObject Test__';
      const TEST_DAY = 20; // > payday (15) → cycle-relative billMonth = csMonth
      const billMonth = cycleStart.getMonth();
      const billYear = cycleStart.getFullYear();
      const key = paidBillKey(TEST_NAME, TEST_DAY, billMonth, billYear);
      // Object flag with _txnTs anchor — legitimate per the txn-anchored rule.
      // No matching txn injected — fast path should accept on _txnTs alone.
      S.paidBills[key] = { paid: true, ts: Date.now(), _txnTs: Date.now() };
      const bill = { name: TEST_NAME, day: TEST_DAY, amt: 50 };
      const paid = BRAIN.bills.isPaidInCycle(bill, cycleStart);
      // Cleanup
      delete S.paidBills[key];
      return { key, paid };
    });
    expect(result.paid).toBe(true);
  });

  // Case 2 — bare-true flag with NO matching debit txn → SUSPECT, return false.
  // This is the Stan-7-class orphan that the maiden walk surfaced.
  test('Case 2: bare-true flag with no ledger backing returns false (suspect)', async ({ page }) => {
    const result = await page.evaluate(() => {
      const cycleStart = new Date(S.activePlan.cycleStartDate);
      // Inject a fake bare-true paidBills entry for a bill with no matching txn.
      const TEST_NAME = '__P0-5 Orphan Test__';
      const TEST_DAY = 8; // < payday → cycle-relative billMonth = csMonth + 1
      const billMonth = cycleStart.getMonth() + 1;
      const billYear = cycleStart.getFullYear() + (billMonth > 11 ? 1 : 0);
      const adjustedMonth = billMonth > 11 ? 0 : billMonth;
      const key = paidBillKey(TEST_NAME, TEST_DAY, adjustedMonth, billYear);
      S.paidBills[key] = true; // bare boolean — no _txnTs anchor
      // Ensure NO matching txn exists (clean any prior).
      S.txns = (S.txns || []).filter(t => !(t.note && t.note.includes(TEST_NAME)));
      const bill = { name: TEST_NAME, day: TEST_DAY, amt: 13 };
      const paid = BRAIN.bills.isPaidInCycle(bill, cycleStart);
      // Cleanup
      delete S.paidBills[key];
      return { key, paid };
    });
    expect(result.paid).toBe(false);
  });

  // Case 3 — bare-true flag WITH matching debit txn (past bill) → return true.
  // Older shape that pre-dates _txnTs; the ledger still backs it.
  test('Case 3: bare-true flag with matching ledger txn returns true (legacy-shape valid)', async ({ page }) => {
    const result = await page.evaluate(() => {
      const cycleStart = new Date(S.activePlan.cycleStartDate);
      const TEST_NAME = '__P0-5 LegacyShape Test__';
      const TEST_DAY = 17; // > payday → cycle-relative billMonth = csMonth
      const billMonth = cycleStart.getMonth();
      const billYear = cycleStart.getFullYear();
      const key = paidBillKey(TEST_NAME, TEST_DAY, billMonth, billYear);
      S.paidBills[key] = true; // bare boolean
      // Inject a matching debit txn within the ±5d window
      const billDate = new Date(billYear, billMonth, TEST_DAY);
      const TXN_AMT = 42;
      const matchingTxn = {
        amt: TXN_AMT,
        note: TEST_NAME + ' — paid',
        cat: 'Bills',
        ts: billDate.getTime() + 1,
        income: false,
      };
      S.txns.push(matchingTxn);
      const bill = { name: TEST_NAME, day: TEST_DAY, amt: TXN_AMT };
      const paid = BRAIN.bills.isPaidInCycle(bill, cycleStart);
      // Cleanup
      delete S.paidBills[key];
      S.txns = S.txns.filter(t => t !== matchingTxn);
      return { paid };
    });
    expect(result.paid).toBe(true);
  });

  // Case 4 — the maiden-walk verdict holds: Stan-7 specifically returns false
  // (it's a bare-true flag with no matching txn in the live fixture).
  test('Case 4: Stan-7 (the maiden-walk ledger-orphan) returns false', async ({ page }) => {
    const result = await page.evaluate(() => {
      const cycleStart = new Date(S.activePlan.cycleStartDate);
      // Stan-7 flag is bare `true` in live-2026-05-23.json
      const stanKey = '2026-5-Stan-7';
      const flag = S.paidBills ? S.paidBills[stanKey] : undefined;
      if (flag === undefined) return { skip: 'no Stan-7 entry in fixture' };
      // The day is 7 (< payday 15) → cycle-relative falls in csMonth + 1 = June
      const bill = { name: 'Stan', day: 7, amt: 13 };
      const paid = BRAIN.bills.isPaidInCycle(bill, cycleStart);
      return { flag, paid };
    });
    if (result.skip) {
      test.skip(true, result.skip);
      return;
    }
    // Stan-7 is bare-true, no _txnTs, no matching txn → suspect → false
    expect(result.flag).toBe(true);
    expect(result.paid).toBe(false);
  });
});
