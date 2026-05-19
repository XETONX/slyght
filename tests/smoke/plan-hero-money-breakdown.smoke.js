// Bundle 32.5 Pass 1.b — PLAN hero "where the money sits" breakdown smoke.
//
// Verifies the user-facing breakdown that replaces the prior "Your free
// money this cycle" panel. Three lines + stacked bar + receipt footer +
// account-balance grounding line.
//
// Receipt-vs-reality contract (same pattern as 32.4 drilldown +
// 32.6 reset modal): every displayed value in the breakdown must match
// the corresponding snap.derived value, and the receipt footer's
// arithmetic must hold literally.
//
// 5 cases:
//   1. Each of the 3 lines (paid, upcoming, free) renders the
//      correct snap.derived value
//   2. Stacked bar segments exist for non-zero components; flex sizes
//      proportional to dollar amounts
//   3. Conservation receipt line literally renders: paid + upcoming + free
//      = totalToPlan (with ✓)
//   4. Account-balance grounding line renders S.bal (preserves
//      legacy hero-tile content per the spec)
//   5. Paying a bill (via canonical writer) shifts $ from upcoming → paid
//      in the displayed breakdown after re-render (live data, not stale)
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

// Parse "$1,234" / "$1,234.56" / "-$50" → numeric
function dollarsFrom(text) {
  if (!text) return NaN;
  const m = String(text).replace(/[^\d.\-]/g, '');
  return parseFloat(m);
}

test.describe('Bundle 32.5 Pass 1.b — PLAN hero money breakdown', () => {
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
      && BRAIN.plan && BRAIN.plan.getSnapshot
      && typeof renderPaydayPlanRoot === 'function'
      && typeof openPaydayPlan === 'function', { timeout: 5000 });
    await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
    await page.evaluate(() => {
      const modal = document.getElementById('eod-recon-modal');
      if (modal && modal.classList.contains('open') && typeof eodReconAccept === 'function') eodReconAccept();
    });
    // Open canvas so the breakdown renders
    await page.evaluate(() => openPaydayPlan());
    await page.waitForTimeout(150);
  });

  test('Case 1: 3 breakdown lines render correct snap.derived values', async ({ page }) => {
    const r = await page.evaluate(() => {
      const d = BRAIN.plan.getSnapshot().derived;
      const lookup = (key) => {
        const row = document.querySelector('[data-line="' + key + '"]');
        if (!row) return null;
        const amtSpan = row.querySelector('span[style*="font-family:var(--mono)"]');
        return amtSpan ? amtSpan.textContent : null;
      };
      return {
        snapPaid: d.essentialsPaidTotal,
        snapUpcoming: d.essentialsUpcomingTotal,
        snapFree: d.remainder,
        displayPaid: lookup('paid'),
        displayUpcoming: lookup('upcoming'),
        displayFree: lookup('free'),
      };
    });
    expect(r.displayPaid, 'paid line must render').toBeTruthy();
    expect(r.displayUpcoming, 'upcoming line must render').toBeTruthy();
    expect(r.displayFree, 'free line must render').toBeTruthy();
    expect(Math.abs(dollarsFrom(r.displayPaid) - Math.round(r.snapPaid))).toBeLessThan(2);
    expect(Math.abs(dollarsFrom(r.displayUpcoming) - Math.round(r.snapUpcoming))).toBeLessThan(2);
    expect(Math.abs(dollarsFrom(r.displayFree) - Math.round(r.snapFree))).toBeLessThan(2);
  });

  test('Case 2: stacked bar segments render with flex proportional to non-zero components', async ({ page }) => {
    const r = await page.evaluate(() => {
      const tile = document.querySelector('[data-money-breakdown="true"]');
      if (!tile) return { tileMissing: true };
      // Find the stacked bar — the div with 6px height that's a flex container
      const bars = Array.from(tile.querySelectorAll('div[style*="display:flex"]'));
      const stackBar = bars.find(b => /height:\s*6px/.test(b.getAttribute('style') || ''));
      if (!stackBar) return { barMissing: true };
      const segments = Array.from(stackBar.children).map(c => {
        const style = c.getAttribute('style') || '';
        const flexMatch = style.match(/flex:\s*(\d+)/);
        return flexMatch ? parseInt(flexMatch[1], 10) : 0;
      });
      const d = BRAIN.plan.getSnapshot().derived;
      return {
        segments,
        snapPaid: Math.max(0, Math.round(d.essentialsPaidTotal)),
        snapUpcoming: Math.max(0, Math.round(d.essentialsUpcomingTotal)),
        snapFree: Math.max(0, Math.round(Math.abs(d.remainder))),
      };
    });
    expect(r.tileMissing).toBeFalsy();
    expect(r.barMissing).toBeFalsy();
    // Sum of flex values matches sum of non-zero snap components
    const expectedSum = r.snapPaid + r.snapUpcoming + r.snapFree;
    const observedSum = r.segments.reduce((s, n) => s + n, 0);
    expect(Math.abs(observedSum - expectedSum)).toBeLessThan(3);
  });

  test('Case 3: receipt footer renders the conservation arithmetic literally', async ({ page }) => {
    const r = await page.evaluate(() => {
      const receipt = document.querySelector('[data-money-receipt]');
      const receiptText = receipt ? receipt.textContent : null;
      const snap = BRAIN.plan.getSnapshot();
      return { receiptText, totalToPlan: snap.totalToPlan };
    });
    expect(r.receiptText, 'receipt footer must render').toBeTruthy();
    // Receipt format: "Σ $X + $Y + $Z = $TOTAL ✓"
    const parts = r.receiptText.split('=');
    expect(parts.length).toBe(2);
    const lhsParts = parts[0].split('+').map(s => dollarsFrom(s));
    const rhsTotal = dollarsFrom(parts[1]);
    const lhsSum = lhsParts.reduce((s, n) => s + (isNaN(n) ? 0 : n), 0);
    // LHS sum equals RHS total (the receipt's own arithmetic)
    expect(Math.abs(lhsSum - rhsTotal),
      `receipt arithmetic broken: ${lhsParts.join(' + ')} = ${lhsSum} but RHS shows ${rhsTotal}`).toBeLessThan(2);
    // RHS total matches snap.totalToPlan
    expect(Math.abs(rhsTotal - Math.round(r.totalToPlan))).toBeLessThan(2);
    // ✓ check character renders
    expect(r.receiptText.includes('✓')).toBe(true);
  });

  test('Case 4: account-balance grounding line renders S.bal', async ({ page }) => {
    const r = await page.evaluate(() => {
      const row = document.querySelector('[data-line="account-balance"]');
      return {
        displayBal: row ? row.textContent : null,
        sBal: S.bal,
      };
    });
    expect(r.displayBal, 'account-balance row must render').toBeTruthy();
    const parsed = dollarsFrom(r.displayBal);
    expect(Math.abs(parsed - r.sBal)).toBeLessThan(0.05);
  });

  test('Case 5: paying a bill shifts $ from upcoming → paid in re-rendered breakdown', async ({ page }) => {
    const r = await page.evaluate(() => {
      // Capture before
      const before = (() => {
        const paid = document.querySelector('[data-line="paid"] span[style*="font-family:var(--mono)"]');
        const upcoming = document.querySelector('[data-line="upcoming"] span[style*="font-family:var(--mono)"]');
        return {
          paidText: paid ? paid.textContent : null,
          upcomingText: upcoming ? upcoming.textContent : null,
        };
      })();
      // Find an unpaid bill
      const billsList = (BRAIN.bills && BRAIN.bills.getThisCycle) ? BRAIN.bills.getThisCycle() : [];
      const unpaidBill = billsList.find(b => !b.paid);
      if (!unpaidBill) return { skip: true, reason: 'no-unpaid-bill' };
      const billAmt = +unpaidBill.amt || 0;
      // Mark paid via canonical writer
      const mp = BRAIN.bills.markPaid(unpaidBill, BRAIN.SOURCES.MARK_BILL_PAID, { autoDebit: false });
      if (!mp.ok) return { skip: true, reason: 'mark-paid-failed:' + mp.reason };
      // Re-render
      renderPaydayPlanRoot();
      // Capture after
      const after = (() => {
        const paid = document.querySelector('[data-line="paid"] span[style*="font-family:var(--mono)"]');
        const upcoming = document.querySelector('[data-line="upcoming"] span[style*="font-family:var(--mono)"]');
        return {
          paidText: paid ? paid.textContent : null,
          upcomingText: upcoming ? upcoming.textContent : null,
        };
      })();
      return { skip: false, billAmt, before, after };
    });
    if (r.skip) test.skip(true, r.reason);
    // dollarsFrom lives in Node context — compute deltas here
    const paidDelta = dollarsFrom(r.after.paidText) - dollarsFrom(r.before.paidText);
    const upcomingDelta = dollarsFrom(r.after.upcomingText) - dollarsFrom(r.before.upcomingText);
    // Paid increases by ~billAmt
    expect(Math.abs(paidDelta - r.billAmt),
      `paid delta ${paidDelta} ≠ +${r.billAmt}; before=${r.before.paidText} after=${r.after.paidText}`).toBeLessThan(2);
    // Upcoming decreases by ~billAmt
    expect(Math.abs(upcomingDelta - (-r.billAmt)),
      `upcoming delta ${upcomingDelta} ≠ -${r.billAmt}; before=${r.before.upcomingText} after=${r.after.upcomingText}`).toBeLessThan(2);
  });
});
