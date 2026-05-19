// Bundle 32.4 substrate — snap.derived.{essentialsBreakdown, discretionaryBreakdown} conservation smoke.
//
// Why: pre-32.4 the essentials/discretionary breakdown was implicit across
// snap.bills/.debts/.savings/.knownUpcoming + the dailyLiving + provisions
// totals. Drilldown UI consumers (Pass 2) need a single structured
// aggregator. snap.derived.essentialsBreakdown + .discretionaryBreakdown
// expose it. The conservation law smoke spec asserts:
//   essentialsBreakdown sum === essentialsTotal
//   discretionaryBreakdown sum === remainder
//   essentialsTotal + remainder === totalToPlan
//
// 3 cases:
//   1. Conservation law on clean unlocked baseline
//   2. Conservation holds after a savings override (allocation shifts but
//      breakdowns track)
//   3. Conservation holds after a debt override (debts decrease, essentials
//      decrease in lock-step, remainder grows)
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
  // Force unlocked so setOverride paths reach INV-32 / breakdown computation
  // (INV-29 refuses setOverride on locked plans — Bundle 32.7 Pass 1).
  if (S.activePlan) S.activePlan.lockedAt = null;
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

const TOL = 0.5;  // half-dollar tolerance: each component already rounded to 2dp; cumulative drift ~$0.01-0.20 max

test.describe('Bundle 32.4 substrate — snap.derived breakdowns conservation', () => {
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
      && BRAIN.plan && typeof BRAIN.plan.getSnapshot === 'function'
      && BRAIN.SOURCES && BRAIN.SOURCES.PLAN_OVERRIDE_SET, { timeout: 5000 });
    await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
    await page.evaluate(() => {
      const modal = document.getElementById('eod-recon-modal');
      if (modal && modal.classList.contains('open') && typeof eodReconAccept === 'function') eodReconAccept();
    });
  });

  test('Case 1: clean baseline — essentials + discretionary breakdowns exist and sum correctly', async ({ page }) => {
    const r = await page.evaluate(() => {
      const snap = BRAIN.plan.getSnapshot();
      const d = snap.derived;
      const ess = d.essentialsBreakdown;
      const disc = d.discretionaryBreakdown;
      const essSum = (ess.bills || 0) + (ess.debts || 0) + (ess.dailyLiving || 0) + (ess.provisions || 0);
      const discSum = (disc.savings || 0) + (disc.knownUpcoming || 0) + (disc.stillToAllocate || 0);
      return {
        essBreakdown: ess,
        discBreakdown: disc,
        essBreakdownSum: parseFloat(essSum.toFixed(2)),
        discBreakdownSum: parseFloat(discSum.toFixed(2)),
        essentialsTotal: d.essentialsTotal,
        remainder: d.remainder,
        totalToPlan: snap.totalToPlan,
      };
    });
    // Breakdowns exist and are well-formed
    expect(r.essBreakdown).toBeTruthy();
    expect(typeof r.essBreakdown.bills).toBe('number');
    expect(typeof r.essBreakdown.debts).toBe('number');
    expect(typeof r.essBreakdown.dailyLiving).toBe('number');
    expect(typeof r.essBreakdown.provisions).toBe('number');
    expect(r.discBreakdown).toBeTruthy();
    expect(typeof r.discBreakdown.savings).toBe('number');
    expect(typeof r.discBreakdown.knownUpcoming).toBe('number');
    expect(typeof r.discBreakdown.stillToAllocate).toBe('number');
    // Conservation laws
    expect(Math.abs(r.essBreakdownSum - r.essentialsTotal),
      `essentialsBreakdown sum ${r.essBreakdownSum} != essentialsTotal ${r.essentialsTotal}`).toBeLessThan(TOL);
    expect(Math.abs(r.discBreakdownSum - r.remainder),
      `discretionaryBreakdown sum ${r.discBreakdownSum} != remainder ${r.remainder}`).toBeLessThan(TOL);
    expect(Math.abs((r.essentialsTotal + r.remainder) - r.totalToPlan),
      `essentialsTotal+remainder ${r.essentialsTotal + r.remainder} != totalToPlan ${r.totalToPlan}`).toBeLessThan(TOL);
  });

  test('Case 2: after a savings override — discretionary.savings tracks; conservation preserved', async ({ page }) => {
    const r = await page.evaluate(() => {
      const before = BRAIN.plan.getSnapshot().derived;
      const beforeSavings = before.discretionaryBreakdown.savings;
      // Inject a savings override
      const setRes = BRAIN.plan.setOverride('savings', 'bundle32-4-case2', 200, {}, BRAIN.SOURCES.PLAN_OVERRIDE_SET);
      if (!setRes.ok) return { skip: true, reason: setRes.reason };
      const after = BRAIN.plan.getSnapshot().derived;
      const ess = after.essentialsBreakdown;
      const disc = after.discretionaryBreakdown;
      const essSum = ess.bills + ess.debts + ess.dailyLiving + ess.provisions;
      const discSum = disc.savings + disc.knownUpcoming + disc.stillToAllocate;
      return {
        skip: false,
        beforeSavings, afterSavings: disc.savings,
        essSum: parseFloat(essSum.toFixed(2)),
        discSum: parseFloat(discSum.toFixed(2)),
        essentialsTotal: after.essentialsTotal,
        remainder: after.remainder,
        totalToPlan: BRAIN.plan.getSnapshot().totalToPlan,
      };
    });
    if (r.skip) test.skip(true, r.reason);
    // savings line tracked the +$200
    expect(r.afterSavings - r.beforeSavings).toBeGreaterThanOrEqual(199);
    // conservation still holds
    expect(Math.abs(r.essSum - r.essentialsTotal)).toBeLessThan(TOL);
    expect(Math.abs(r.discSum - r.remainder)).toBeLessThan(TOL);
    expect(Math.abs((r.essentialsTotal + r.remainder) - r.totalToPlan)).toBeLessThan(TOL);
  });

  test('Case 3: after a debt override — essentials.debts decreases; essentialsTotal tracks; remainder grows; conservation preserved', async ({ page }) => {
    const r = await page.evaluate(() => {
      const firstDebt = (S.debts || []).find(d => !d.paid);
      if (!firstDebt) return { skip: true, reason: 'no-debts' };
      const debtId = firstDebt.id || firstDebt.name;
      const isViaRent = !!firstDebt.viaRent;
      const before = BRAIN.plan.getSnapshot().derived;
      // Override to $1
      const setRes = BRAIN.plan.setOverride('debt', debtId, 1, {}, BRAIN.SOURCES.PLAN_OVERRIDE_SET);
      if (!setRes.ok) return { skip: true, reason: setRes.reason };
      const after = BRAIN.plan.getSnapshot().derived;
      const ess = after.essentialsBreakdown;
      const disc = after.discretionaryBreakdown;
      const essSum = ess.bills + ess.debts + ess.dailyLiving + ess.provisions;
      const discSum = disc.savings + disc.knownUpcoming + disc.stillToAllocate;
      return {
        skip: false,
        isViaRent,
        beforeDebts: before.essentialsBreakdown.debts,
        afterDebts: ess.debts,
        beforeEssTotal: before.essentialsTotal,
        afterEssTotal: after.essentialsTotal,
        beforeRemainder: before.remainder,
        afterRemainder: after.remainder,
        essSum: parseFloat(essSum.toFixed(2)),
        discSum: parseFloat(discSum.toFixed(2)),
        totalToPlan: BRAIN.plan.getSnapshot().totalToPlan,
      };
    });
    if (r.skip) test.skip(true, r.reason);
    // Conservation across the change
    expect(Math.abs(r.essSum - r.afterEssTotal)).toBeLessThan(TOL);
    expect(Math.abs(r.discSum - r.afterRemainder)).toBeLessThan(TOL);
    expect(Math.abs((r.afterEssTotal + r.afterRemainder) - r.totalToPlan)).toBeLessThan(TOL);
    // viaRent debts excluded from snap.debts.total (per snap.debts filter at index.html:20045)
    // — so a viaRent override won't move essentials.debts. Non-viaRent debts will.
    if (!r.isViaRent) {
      expect(r.afterDebts).toBeLessThan(r.beforeDebts);
      // Lockstep: essentialsTotal drop matches debts drop
      const debtsDelta = r.beforeDebts - r.afterDebts;
      const essDelta = r.beforeEssTotal - r.afterEssTotal;
      expect(Math.abs(debtsDelta - essDelta)).toBeLessThan(TOL);
      // Remainder grows by same amount
      const remainderDelta = r.afterRemainder - r.beforeRemainder;
      expect(Math.abs(remainderDelta - debtsDelta)).toBeLessThan(TOL);
    }
  });
});
