// Phase G Pass 1.a — MODEL canonical discretionary fields conservation smoke.
//
// Why: pre-Phase-G 15+ renderers re-filtered S.txns inline with subtly
// different shapes (5 variants observed; OPEN-BUGS #6B/#7/#8/#17 are the
// most-visible). Phase G extends MODEL with pre-computed canonical
// breakdowns; consumers migrate to read from MODEL instead of re-filtering.
//
// Pass 1.a substrate assertion: cycleDiscretionaryByCategory sums to
// MODEL.cycleDiscretionarySpend. If this holds, every consumer that migrates can
// read the breakdown safely. If it ever breaks, the migration target
// itself is wrong and the audit catches it before consumer rollout.
//
// 3 cases:
//   1. cycleDiscretionaryByCategory exists, well-formed; Σ totals ===
//      MODEL.cycleDiscretionarySpend (conservation)
//   2. Adding a $50 discretionary txn moves Σ + MODEL.cycleDiscretionarySpend by +$50
//      in lockstep (substrate stays canonical under writes)
//   3. Non-discretionary txns (Bills/Debt repayment) do NOT move
//      cycleDiscretionaryByCategory or cycleDiscretionarySpend — the filter scope
//      is honored
//
// Run: npm run smoke

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const FIXTURE_PATH = path.resolve(__dirname, '../../state-snapshot.json');
// Post-payday clock — fixture's paydayReceivedDate is 2026-05-14, so a
// May 19 frozen clock means cycleStart resolves to 2026-05-14 and the
// cycle window is [May 14, May 19] (well-formed). A pre-payday clock
// like 2026-05-05 would have cycleStart in the future (May 14) and
// cycleDiscretionarySpend computes 0, masking the conservation tests. Same pattern
// scenario-walk.js uses for post-payday daily-use scenarios.
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

const TOL = 0.5;  // half-dollar tolerance; per-category amounts already
                 // are pre-rounded sums of raw txn amts (no rounding step)

test.describe('Phase G Pass 1.a — MODEL.cycleDiscretionaryByCategory canonical substrate', () => {
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
    await page.waitForFunction(() => typeof MODEL !== 'undefined' && MODEL
      && typeof MODEL.cycleDiscretionarySpend === 'number'
      && typeof MODEL.cycleDiscretionaryByCategory === 'object'
      && BRAIN && BRAIN.transaction && BRAIN.transaction.recordWithAllocation, { timeout: 5000 });
    await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
    await page.evaluate(() => {
      const modal = document.getElementById('eod-recon-modal');
      if (modal && modal.classList.contains('open') && typeof eodReconAccept === 'function') eodReconAccept();
    });
  });

  test('Case 1: MODEL.cycleDiscretionaryByCategory well-formed; Σ === MODEL.cycleDiscretionarySpend', async ({ page }) => {
    const r = await page.evaluate(() => {
      const breakdown = MODEL.cycleDiscretionaryByCategory || {};
      const keys = Object.keys(breakdown);
      let totalsSum = 0;
      let nonNegativeAll = true;
      const perCat = {};
      for (const k of keys) {
        const v = breakdown[k];
        // Shape from getDiscretionaryByCategory: {total, count, txns}
        const t = +(v && v.total) || 0;
        if (t < 0) nonNegativeAll = false;
        totalsSum += t;
        perCat[k] = t;
      }
      return {
        breakdownKeys: keys,
        nonNegativeAll,
        totalsSum: parseFloat(totalsSum.toFixed(2)),
        cycleDiscretionarySpend: MODEL.cycleDiscretionarySpend,
        perCat,
      };
    });
    expect(r.nonNegativeAll, 'all per-category totals must be non-negative').toBe(true);
    expect(Math.abs(r.totalsSum - r.cycleDiscretionarySpend),
      `cycleDiscretionaryByCategory sum $${r.totalsSum} != MODEL.cycleDiscretionarySpend $${r.cycleDiscretionarySpend} — substrate canonical broken`).toBeLessThan(TOL);
  });

  test('Case 2: $50 discretionary txn moves Σ and MODEL.cycleDiscretionarySpend by +$50 in lockstep', async ({ page }) => {
    const r = await page.evaluate(() => {
      const beforeBreakdownSum = Object.values(MODEL.cycleDiscretionaryByCategory || {})
        .reduce((s, v) => s + (+(v && v.total) || 0), 0);
      const beforeCycleSpent = MODEL.cycleDiscretionarySpend;
      // Add a $50 Food/Coffee discretionary txn
      BRAIN.transaction.recordWithAllocation(
        { amt: 50, cat: 'Food / Coffee', direction: 'outflow', note: 'Phase G case 2 probe' },
        BRAIN.SOURCES.LOG_EXPENSE
      );
      // Force MODEL refresh
      if (typeof refreshModel === 'function') refreshModel();
      const afterBreakdownSum = Object.values(MODEL.cycleDiscretionaryByCategory || {})
        .reduce((s, v) => s + (+(v && v.total) || 0), 0);
      const afterCycleSpent = MODEL.cycleDiscretionarySpend;
      return {
        breakdownDelta: parseFloat((afterBreakdownSum - beforeBreakdownSum).toFixed(2)),
        cycleDiscretionarySpendDelta: parseFloat((afterCycleSpent - beforeCycleSpent).toFixed(2)),
      };
    });
    expect(Math.abs(r.breakdownDelta - 50)).toBeLessThan(TOL);
    expect(Math.abs(r.cycleDiscretionarySpendDelta - 50)).toBeLessThan(TOL);
    expect(Math.abs(r.breakdownDelta - r.cycleDiscretionarySpendDelta), 'breakdown delta + cycleDiscretionarySpend delta must move in lockstep').toBeLessThan(TOL);
  });

  test('Case 3: non-discretionary txn (Bills cat) does NOT move discretionary canonical fields', async ({ page }) => {
    const r = await page.evaluate(() => {
      const beforeBreakdownSum = Object.values(MODEL.cycleDiscretionaryByCategory || {})
        .reduce((s, v) => s + (+(v && v.total) || 0), 0);
      const beforeCycleSpent = MODEL.cycleDiscretionarySpend;
      // Bills/Debts/Savings/Transfer are in _NON_SPEND_CATS → excluded
      BRAIN.transaction.recordWithAllocation(
        { amt: 100, cat: 'Bills', direction: 'outflow', note: 'Phase G case 3 bill probe' },
        BRAIN.SOURCES.LOG_EXPENSE
      );
      if (typeof refreshModel === 'function') refreshModel();
      const afterBreakdownSum = Object.values(MODEL.cycleDiscretionaryByCategory || {})
        .reduce((s, v) => s + (+(v && v.total) || 0), 0);
      const afterCycleSpent = MODEL.cycleDiscretionarySpend;
      return {
        breakdownDelta: parseFloat((afterBreakdownSum - beforeBreakdownSum).toFixed(2)),
        cycleDiscretionarySpendDelta: parseFloat((afterCycleSpent - beforeCycleSpent).toFixed(2)),
      };
    });
    expect(Math.abs(r.breakdownDelta)).toBeLessThan(TOL);
    expect(Math.abs(r.cycleDiscretionarySpendDelta)).toBeLessThan(TOL);
  });
});
