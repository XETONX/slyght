// Bundle 32.1 — `snap.derived` allocation canonical-reader smoke.
//
// Why: pre-fix, three PLAN-mode renderers (renderAllocateTile,
// renderPaydayPlanRoot, renderPaydaySavings) each computed essentialsTotal
// / remainder / allocatedTotal / stillToAllocate inline from snap.bills.total
// + snap.debts.total + snap.dailyLiving.plannedTotal + PLAN.getTotalProvisions()
// + snap.savings.total + snap.knownUpcoming.total. Same math three times, drift
// risk structural. Bundle 32.1 lifted these into `snap.derived.*` as canonical
// readers; renderAllocateTile + renderPaydayPlanRoot now consume from snap.
//
// This spec asserts:
//   1. Field existence: snap.derived.{essentialsTotal, remainder, allocatedTotal,
//      stillToAllocate, savingsOverAllocated} are all defined numbers
//   2. Provisions exposed: snap.provisions.total exists
//   3. Conservation law: remainder === allocatedTotal + stillToAllocate
//      (within $1 rounding tolerance) — the math that all three renderers
//      previously re-derived independently is now invariant by construction
//   4. Essentials composition: essentialsTotal === bills + debts + living +
//      provisions
//   5. Over-allocation detection: inject a savings override exceeding surplus,
//      verify savingsOverAllocated > 0 (INV-32 prerequisite)
//   6. Renderer migration: rendered HTML of renderAllocateTile contains the
//      same dollar figures as snap.derived (proves renderer consumes canonical)
//
// Run: npm run smoke

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { captureState } = require('../helpers/capture-state');

const FIXTURE_PATH = path.resolve(__dirname, '../../state-snapshot.json');
const FROZEN_ISO = '2026-05-05T22:00:00+10:00';
const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
const SPEC_FILE = 'tests/smoke/snap-derived-allocation.smoke.js';

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

test.describe('Bundle 32.1 — snap.derived allocation canonical-reader', () => {
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
      && typeof renderAllocateTile === 'function', { timeout: 5000 });
    await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  });

  test('snap.derived exposes Bundle 32.1 canonical allocation fields with correct math', async ({ page }) => {
    const data = await page.evaluate(() => {
      const snap = BRAIN.plan.getSnapshot();
      return {
        // Field existence + types
        essentialsTotal: snap.derived.essentialsTotal,
        remainder: snap.derived.remainder,
        allocatedTotal: snap.derived.allocatedTotal,
        stillToAllocate: snap.derived.stillToAllocate,
        savingsOverAllocated: snap.derived.savingsOverAllocated,
        provisionsTotal: snap.provisions ? snap.provisions.total : null,
        // Source values to verify composition
        billsTotal: snap.bills.total,
        debtsTotal: snap.debts.total,
        livingPlannedTotal: snap.dailyLiving.plannedTotal,
        savingsTotal: snap.savings.total,
        upcomingTotal: snap.knownUpcoming.total,
        totalToPlan: snap.totalToPlan,
        surplus: snap.derived.surplus,
      };
    });

    // (1) Field existence — all five new derived fields are numbers
    expect(typeof data.essentialsTotal, 'essentialsTotal must be a number').toBe('number');
    expect(typeof data.remainder, 'remainder must be a number').toBe('number');
    expect(typeof data.allocatedTotal, 'allocatedTotal must be a number').toBe('number');
    expect(typeof data.stillToAllocate, 'stillToAllocate must be a number').toBe('number');
    expect(typeof data.savingsOverAllocated, 'savingsOverAllocated must be a number').toBe('number');

    // (2) Provisions exposed at top-level snap
    expect(data.provisionsTotal, 'snap.provisions.total must be a number').not.toBeNull();
    expect(typeof data.provisionsTotal).toBe('number');

    // (3) Conservation law: remainder = allocatedTotal + stillToAllocate
    // (within $1 rounding tolerance — each field is .toFixed(2) per snap convention)
    const conservationDelta = Math.abs(data.remainder - (data.allocatedTotal + data.stillToAllocate));
    expect(conservationDelta,
      `Conservation law: remainder (${data.remainder}) must equal allocatedTotal (${data.allocatedTotal}) + stillToAllocate (${data.stillToAllocate}); delta ${conservationDelta} exceeds $1`
    ).toBeLessThanOrEqual(1);

    // (4) Essentials composition: essentialsTotal = bills + debts + living + provisions
    const expectedEssentials = data.billsTotal + data.debtsTotal + data.livingPlannedTotal + data.provisionsTotal;
    expect(Math.abs(data.essentialsTotal - expectedEssentials),
      `essentialsTotal (${data.essentialsTotal}) must equal bills + debts + living + provisions (${expectedEssentials})`
    ).toBeLessThanOrEqual(1);

    // (5) Allocated composition: allocatedTotal = savings + upcoming
    const expectedAllocated = data.savingsTotal + data.upcomingTotal;
    expect(Math.abs(data.allocatedTotal - expectedAllocated)).toBeLessThanOrEqual(1);

    // (6) savingsOverAllocated is always >= 0 (max(0, ...) clamp)
    expect(data.savingsOverAllocated).toBeGreaterThanOrEqual(0);

    await captureState(page, {
      label: 'snap-derived-allocation-fields',
      featurePath: 'BRAIN → PLAN → GET_SNAPSHOT → DERIVED → ALLOCATION',
      specFile: SPEC_FILE, specLine: 95,
      codeUnderTest: 'snap.derived.{essentialsTotal, remainder, allocatedTotal, stillToAllocate, savingsOverAllocated} + snap.provisions.total',
      expectedState: `essentialsTotal=${data.essentialsTotal}, remainder=${data.remainder}, allocatedTotal=${data.allocatedTotal}, stillToAllocate=${data.stillToAllocate}, savingsOverAllocated=${data.savingsOverAllocated}, provisions=${data.provisionsTotal}; conservation law holds`,
      clipTo: null,
    });
  });

  test('Over-allocation: injecting savings override > surplus → savingsOverAllocated > 0', async ({ page }) => {
    // Inject an override large enough to push savings.total > surplus.
    // This is the canonical input for the Bundle 32.2 INV-32 over-allocation
    // write-time check. Verify the derived value flips from 0 to positive.
    const data = await page.evaluate(() => {
      const before = BRAIN.plan.getSnapshot();
      const beforeOver = before.derived.savingsOverAllocated;
      const surplus = before.derived.surplus;

      // Inject an override that's 1.5x the surplus — guaranteed to push savings over
      S.activePlan = S.activePlan || {};
      S.activePlan.overrides = Object.assign({}, S.activePlan.overrides || {}, {
        'savings:bundle32-overalloc-probe': { thisCycleAmount: surplus * 1.5 + 100, normalAmount: 0 },
      });

      const after = BRAIN.plan.getSnapshot();
      return {
        beforeOver,
        afterOver: after.derived.savingsOverAllocated,
        afterSurplus: after.derived.surplus,
        afterSavingsTotal: after.savings.total,
        injection: surplus * 1.5 + 100,
      };
    });

    // savingsOverAllocated must now be positive (over-allocated state detected).
    expect(data.afterOver,
      `savingsOverAllocated should be > 0 after injecting savings override of $${data.injection.toFixed(2)} against surplus $${data.afterSurplus.toFixed(2)}`
    ).toBeGreaterThan(0);

    // The magnitude should reflect the over-allocation amount:
    // savingsOverAllocated = savings.total − surplus (when savings > surplus)
    const expectedOver = Math.max(0, data.afterSavingsTotal - data.afterSurplus);
    expect(Math.abs(data.afterOver - expectedOver),
      `savingsOverAllocated (${data.afterOver}) should equal max(0, savings - surplus) = ${expectedOver}`
    ).toBeLessThanOrEqual(1);
  });

  test('Renderer migration: renderAllocateTile output references snap.derived values (not re-derived)', async ({ page }) => {
    // Verify renderAllocateTile renders the SAME numbers as snap.derived
    // exposes. If a future refactor re-introduces inline computation that drifts,
    // this assertion catches it.
    //
    // Inject a known savings allocation so the tile renders the post-allocation
    // path (allocatedTotal > 0 branch) rather than the empty "Tap to start" path.
    const result = await page.evaluate(() => {
      S.activePlan = S.activePlan || {};
      // Use ~25% of surplus to stay in healthy state (not over-allocated)
      const peek = BRAIN.plan.getSnapshot();
      const injectAmt = Math.max(50, Math.floor(peek.derived.surplus * 0.25));
      S.activePlan.overrides = Object.assign({}, S.activePlan.overrides || {}, {
        'savings:bundle32-migration-probe': { thisCycleAmount: injectAmt, normalAmount: 0 },
      });

      const snap = BRAIN.plan.getSnapshot();
      const html = renderAllocateTile();
      return {
        derived: {
          essentialsTotal: Math.round(snap.derived.essentialsTotal),
          remainder: Math.round(snap.derived.remainder),
          allocatedTotal: Math.round(snap.derived.allocatedTotal),
          stillToAllocate: Math.round(snap.derived.stillToAllocate),
        },
        html,
      };
    });

    // Each dollar figure from snap.derived should appear in the rendered HTML.
    // Format used by renderAllocateTile: `$${Math.round(X).toLocaleString()}`.
    const formatDollar = n => '$' + n.toLocaleString();

    expect(result.html, `rendered tile must contain stillToAllocate ${formatDollar(result.derived.stillToAllocate)}`)
      .toContain(formatDollar(result.derived.stillToAllocate));
    expect(result.html, `rendered tile must contain allocatedTotal ${formatDollar(result.derived.allocatedTotal)}`)
      .toContain(formatDollar(result.derived.allocatedTotal));
    expect(result.html, `rendered tile must contain remainder ${formatDollar(result.derived.remainder)}`)
      .toContain(formatDollar(result.derived.remainder));
  });
});
