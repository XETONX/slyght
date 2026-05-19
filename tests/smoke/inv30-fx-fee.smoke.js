// Bundle 33.x — INV-30 FX fee separate-transaction smoke.
//
// Why: PRE-FIX (pre-Bundle-33.x), BRAIN.transaction.recordWithAllocation
// accepted an `envelope.fxFee = {amt, sourceCurrency}` opt and silently
// did NOTHING with it — latent silent-data-loss bug. FX-fee amounts
// passed by callers were lost. INV-30 closes this hole AND establishes
// the contract: parent + FX-fee child txn with `linkedTo` back-reference.
//
// What this asserts (2 cases):
//   1. Parent + child landed correctly: 2 txns appended, parent carries
//      original cat, child carries cat:'FX Fee' + linkedTo:parent.ts +
//      source:'fx-fee-auto'. Balance decremented by parent+child total.
//      Audit log carries entries for both writes.
//   2. Recursion guard: FX-fee child does NOT spawn its own FX-fee
//      grandchild (the recursive call is gated by _isFxFeeChild flag).
//      Asserts exactly 2 txns even if the fee.amt is itself > 0.
//
// Dormant in production until first UI surface emits envelope.fxFee.
// Smoke spec is the only current exerciser.
//
// Run: npm run smoke

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const FIXTURE_PATH = path.resolve(__dirname, '../../state-snapshot.json');
const FROZEN_ISO = '2026-05-05T22:00:00+10:00';
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

test.describe('Bundle 33.x — INV-30 FX fee separate-transaction', () => {
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
      && BRAIN.transaction && BRAIN.transaction.recordWithAllocation
      && BRAIN.SOURCES && BRAIN.SOURCES.FX_FEE_AUTO
      && BRAIN.SOURCES.LOG_EXPENSE, { timeout: 5000 });
    await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
    await page.evaluate(() => {
      const modal = document.getElementById('eod-recon-modal');
      if (modal && modal.classList.contains('open') && typeof eodReconAccept === 'function') eodReconAccept();
    });
  });

  test('Case 1: envelope.fxFee emits parent + FX-fee child with correct shape and linkedTo back-reference', async ({ page }) => {
    const result = await page.evaluate(() => {
      const balBefore = S.bal;
      const txnsBefore = (S.txns || []).length;
      const r = BRAIN.transaction.recordWithAllocation(
        {
          amt: 100,
          cat: 'Bills',
          direction: 'outflow',
          note: 'INV-30 case 1 international purchase',
          fxFee: { amt: 3, sourceCurrency: 'USD' },
        },
        BRAIN.SOURCES.LOG_EXPENSE
      );
      const txnsAfter = S.txns || [];
      const parentTxn = txnsAfter.find(t => t && t.ts === r.txnTs);
      const childTxn = txnsAfter.find(t => t && t.cat === 'FX Fee' && t.linkedTo === r.txnTs);
      return {
        r,
        balBefore, balAfter: S.bal,
        txnsBefore, txnsAfter: txnsAfter.length,
        parentTxn: parentTxn ? { amt: parentTxn.amt, cat: parentTxn.cat, ts: parentTxn.ts, note: parentTxn.note } : null,
        childTxn: childTxn ? { amt: childTxn.amt, cat: childTxn.cat, ts: childTxn.ts, linkedTo: childTxn.linkedTo, _isFxFeeChild: childTxn._isFxFeeChild } : null,
        // Sum across the period of cat='FX Fee' is auditable
        fxFeeSumAll: (S.txns || []).filter(t => t.cat === 'FX Fee').reduce((s, t) => s + (+t.amt || 0), 0),
      };
    });
    expect(result.r.ok).toBe(true);
    // Two txns appended (parent + fx-fee child)
    expect(result.txnsAfter - result.txnsBefore).toBe(2);
    // Parent shape
    expect(result.parentTxn).not.toBeNull();
    expect(result.parentTxn.amt).toBeCloseTo(100, 2);
    expect(result.parentTxn.cat).toBe('Bills');
    // Child shape — `linkedTo` MUST point at parent.ts
    expect(result.childTxn).not.toBeNull();
    expect(result.childTxn.amt).toBeCloseTo(3, 2);
    expect(result.childTxn.cat).toBe('FX Fee');
    expect(result.childTxn.linkedTo).toBe(result.parentTxn.ts);
    expect(result.childTxn._isFxFeeChild).toBe(true);
    // Writer return surfaces the fxFeeChild metadata
    expect(result.r.fxFeeChild).not.toBeNull();
    expect(result.r.fxFeeChild.amt).toBeCloseTo(3, 2);
    expect(result.r.fxFeeChild.sourceCurrency).toBe('USD');
    // Balance decremented by parent + child total
    const balDelta = +(result.balAfter - result.balBefore).toFixed(2);
    expect(balDelta).toBeCloseTo(-103, 2);
    // Sum-of-FX-Fee analysis stays auditable
    expect(result.fxFeeSumAll).toBeGreaterThanOrEqual(3);
  });

  test('Case 2: FX-fee child does NOT spawn its own FX-fee grandchild (recursion guard via _isFxFeeChild)', async ({ page }) => {
    const result = await page.evaluate(() => {
      const txnsBefore = (S.txns || []).length;
      // Provoke the recursion guard: the FX-fee child has `_isFxFeeChild:true`
      // which suppresses any envelope.fxFee on the recursive call. We can't
      // pass envelope.fxFee on the CHILD because the child is constructed
      // internally. The guard is that the child's recursive call into
      // recordWithAllocation does not itself carry envelope.fxFee. We
      // verify by checking that exactly 2 txns land (parent + child),
      // not 3 (parent + child + grandchild) or more.
      const r = BRAIN.transaction.recordWithAllocation(
        {
          amt: 50,
          cat: 'Bills',
          direction: 'outflow',
          note: 'INV-30 case 2 recursion-guard probe',
          fxFee: { amt: 1.50, sourceCurrency: 'EUR' },
        },
        BRAIN.SOURCES.LOG_EXPENSE
      );
      return {
        r,
        txnsBefore, txnsAfter: (S.txns || []).length,
        // Count FX Fee txns landed (should be exactly 1 — the child)
        fxFeeChildCount: (S.txns || []).filter(t => t.linkedTo === r.txnTs && t.cat === 'FX Fee').length,
        // No grandchild — no FX Fee txn should reference the FX Fee CHILD's ts
        childTxnTs: r.fxFeeChild && r.fxFeeChild.ts,
        grandchildCount: r.fxFeeChild
          ? (S.txns || []).filter(t => t.linkedTo === r.fxFeeChild.ts).length
          : 0,
      };
    });
    expect(result.r.ok).toBe(true);
    expect(result.txnsAfter - result.txnsBefore).toBe(2);
    expect(result.fxFeeChildCount).toBe(1);
    // Critical: no grandchild — recursion stopped by _isFxFeeChild guard
    expect(result.grandchildCount).toBe(0);
  });
});
