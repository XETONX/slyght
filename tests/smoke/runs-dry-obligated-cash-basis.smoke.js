// Break #2 regression test — runs-dry numerator uses obligated cash, not raw S.bal.
//
// Before fix: `_daysToZero = Math.floor(S.bal / _b7d.perDay)` — raw cash basis.
// "Over by $X" used obligated-cash headroom; runs-dry date used raw cash. Two
// timelines on the same coral line.
//
// After fix: numerator is `_cashflow.cash − _cashflow.billsStillDue`. Both
// halves of the failure line now use the same cash base.
//
// Pinned oracle: live-2026-05-23.json (headroom negative → failure-line renders).

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
    && BRAIN.plan && typeof BRAIN.plan.getSnapshot === 'function'
    && BRAIN.dashboard && typeof BRAIN.dashboard.getBurn7d === 'function', { timeout: 5000 });
  await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page.evaluate(() => {
    const modal = document.getElementById('eod-recon-modal');
    if (modal && modal.classList.contains('open') && typeof eodReconAccept === 'function') eodReconAccept();
  });
  // Trigger renderAll so the failure-line lands in DOM
  await page.evaluate(() => { if (typeof renderAll === 'function') renderAll(); });
}

test.describe('Break #2 — runs-dry uses obligated-cash basis', () => {
  test.beforeEach(({ page, context }) => boot(page, context));

  // Case 1 — fixture has negative headroom → failure-line renders → "runs dry"
  // date must be derived from obligated cash (cash − billsStillDue), not raw S.bal.
  test('Case 1: runs-dry date matches obligated-cash formula, not raw S.bal', async ({ page }) => {
    const result = await page.evaluate(() => {
      const snap = BRAIN.plan.getSnapshot();
      const cashflow = snap?.derived?.cashflowReceipt;
      const headroom = snap?.derived?.safeToSpendHeadroom;
      if (!cashflow || headroom === undefined || headroom >= 0) {
        return { skip: 'headroom not coral; failure-line not active' };
      }
      const b7d = BRAIN.dashboard.getBurn7d();
      const obligatedCash = Math.max(0, cashflow.cash - cashflow.billsStillDue);
      const rawBal = +S.bal;

      // What the two formulas would produce
      const daysFromObligated = b7d.perDay > 0 ? Math.floor(obligatedCash / b7d.perDay) : null;
      const daysFromRawBal = b7d.perDay > 0 ? Math.floor(rawBal / b7d.perDay) : null;

      const failLine = document.getElementById('cashflow-failure-line');
      const text = failLine ? failLine.textContent : '';

      return {
        bal: rawBal,
        billsStillDue: cashflow.billsStillDue,
        obligatedCash,
        burnPerDay: b7d.perDay,
        daysFromObligated,
        daysFromRawBal,
        failLineText: text,
        diffDays: (daysFromRawBal !== null && daysFromObligated !== null)
          ? daysFromRawBal - daysFromObligated
          : 0,
      };
    });

    if (result.skip) {
      test.skip(true, result.skip);
      return;
    }

    // burnPerDay > 0 required for the runs-dry calc to fire
    expect(result.burnPerDay).toBeGreaterThan(0);

    // The failure-line text exists and includes "runs dry"
    expect(result.failLineText).toContain('runs dry');

    // Obligated cash is less than raw bal (because billsStillDue > 0 in the oracle)
    expect(result.obligatedCash).toBeLessThan(result.bal);

    // The two formulas produce different day counts (proving the bug class)
    expect(result.daysFromObligated).toBeLessThan(result.daysFromRawBal);
    expect(result.diffDays).toBeGreaterThan(0);

    // Reconstruct both candidate date strings using the same locale formatter
    // the page uses ('en-AU' → outputs as "23 May"). The rendered failure-line
    // must match the obligated-cash formula's output, not the raw-bal one.
    const nowMs = new Date('2026-05-23T22:00:00+10:00').getTime();
    const fromObligated = new Date(nowMs + result.daysFromObligated * 86400000);
    const expectedDateStr = fromObligated.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });

    expect(result.failLineText).toContain(expectedDateStr);

    // Negative — the rendered date is NOT the raw-S.bal formula's output
    // (only assert when the two formulas diverge by a day; otherwise vacuous)
    if (result.diffDays > 0) {
      const fromRawBal = new Date(nowMs + result.daysFromRawBal * 86400000);
      const wouldBeDateStr = fromRawBal.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });
      if (wouldBeDateStr !== expectedDateStr) {
        expect(result.failLineText).not.toContain(wouldBeDateStr);
      }
    }
  });
});
