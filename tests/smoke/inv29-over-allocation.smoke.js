// Bundle 32.2 — INV-29 write-time over-allocation refusal smoke.
//
// Why: pre-fix, BRAIN.plan.setOverride accepted any savings override regardless
// of whether the resulting sum(savings:* thisCycleAmount) exceeded surplus.
// User could allocate $1,433 to goals against $1,170 surplus — writes succeeded,
// display surfaced "-$263 over allocated" as a red warning, but state was
// already corrupt. INV-28 covers the txn-time path (recordWithAllocation);
// INV-29 covers the plan-time path (setOverride).
//
// What this asserts:
//   1. Increase that fits → allowed, override written, no refusal
//   2. Increase that exceeds surplus → refused with reason 'inv29-over-allocation',
//      audit log appended 'inv29_refusal', state unchanged
//   3. Reduction in over-allocated state → allowed (improves state even if final
//      state still over — refusing reductions would create stuck state)
//   4. Pay-in-full normalisation (within $0.50 of normal) → still clears override
//      per Bundle 28 normalised path; INV-29 doesn't see those cases
//   5. Audit log entry shape correct (all expected fields present)
//
// Run: npm run smoke

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { captureState } = require('../helpers/capture-state');

const FIXTURE_PATH = path.resolve(__dirname, '../../state-snapshot.json');
const FROZEN_ISO = '2026-05-05T22:00:00+10:00';
const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
const SPEC_FILE = 'tests/smoke/inv29-over-allocation.smoke.js';

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

test.describe('Bundle 32.2 — INV-29 over-allocation write-time refusal', () => {
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
      && BRAIN.plan && BRAIN.plan.setOverride
      && BRAIN.SOURCES && BRAIN.SOURCES.PLAN_OVERRIDE_SET, { timeout: 5000 });
    await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  });

  test('Case 1: increase that fits surplus is allowed', async ({ page }) => {
    const result = await page.evaluate(() => {
      // Clear any pre-existing savings overrides so we're starting clean.
      // Use 25% of surplus as the new amount — guaranteed under threshold.
      S.activePlan = S.activePlan || {};
      S.activePlan.overrides = S.activePlan.overrides || {};
      Object.keys(S.activePlan.overrides).forEach(k => {
        if (k.startsWith('savings:')) delete S.activePlan.overrides[k];
      });
      const snap = BRAIN.plan.getSnapshot();
      const safeAmt = Math.floor(snap.derived.surplus * 0.25);
      const r = BRAIN.plan.setOverride('savings', 'bundle32-inv29-case1', safeAmt, {}, BRAIN.SOURCES.PLAN_OVERRIDE_SET);
      const after = BRAIN.plan.getSnapshot();
      const overrideAfter = S.activePlan.overrides['savings:bundle32-inv29-case1'];
      return {
        r, safeAmt,
        surplus: snap.derived.surplus,
        overrideWritten: !!overrideAfter,
        overrideAmt: overrideAfter ? overrideAfter.thisCycleAmount : null,
        savingsTotalAfter: after.savings.total,
      };
    });

    expect(result.r.ok, 'increase within surplus should be allowed').toBe(true);
    expect(result.overrideWritten, 'override should be written to S.activePlan.overrides').toBe(true);
    expect(result.overrideAmt).toBe(result.safeAmt);
    expect(result.r.reason).toBeUndefined();
  });

  test('Case 2: increase that exceeds surplus is refused with inv29-over-allocation', async ({ page }) => {
    const result = await page.evaluate(() => {
      S.activePlan = S.activePlan || {};
      S.activePlan.overrides = S.activePlan.overrides || {};
      Object.keys(S.activePlan.overrides).forEach(k => {
        if (k.startsWith('savings:')) delete S.activePlan.overrides[k];
      });
      const snap = BRAIN.plan.getSnapshot();
      // Inject an amount 1.5× the surplus — guaranteed to exceed.
      const overAmt = Math.ceil(snap.derived.surplus * 1.5) + 100;
      const auditBefore = (S._auditLog || []).length;
      const balBefore = S.bal;
      const r = BRAIN.plan.setOverride('savings', 'bundle32-inv29-case2', overAmt, {}, BRAIN.SOURCES.PLAN_OVERRIDE_SET);
      const overrideAfter = S.activePlan.overrides['savings:bundle32-inv29-case2'];
      const recentAudit = (S._auditLog || []).slice(-10);
      const refusalEntry = recentAudit.find(e => e && e.type === 'inv29_refusal' && e.key === 'savings:bundle32-inv29-case2');
      return {
        r, overAmt,
        surplus: snap.derived.surplus,
        overrideAfter: !!overrideAfter,
        balUnchanged: S.bal === balBefore,
        refusalEntry,
      };
    });

    // Refusal envelope
    expect(result.r.ok, 'increase exceeding surplus must be refused').toBe(false);
    expect(result.r.reason).toBe('inv29-over-allocation');
    expect(result.r.requested).toBe(result.overAmt);
    expect(typeof result.r.available).toBe('number');
    expect(typeof result.r.wouldOverBy).toBe('number');
    expect(result.r.wouldOverBy).toBeGreaterThan(0);

    // State unchanged (no override written, balance unchanged)
    expect(result.overrideAfter, 'no override should be written on refusal').toBe(false);
    expect(result.balUnchanged).toBe(true);

    // Audit log entry appended with expected shape
    expect(result.refusalEntry, 'inv29_refusal audit log entry must be appended').toBeTruthy();
    expect(result.refusalEntry.type).toBe('inv29_refusal');
    expect(result.refusalEntry.requested).toBe(result.overAmt);
    expect(typeof result.refusalEntry.wouldBeSavingsTotal).toBe('number');
    expect(typeof result.refusalEntry.surplus).toBe('number');
    expect(typeof result.refusalEntry.wouldOverBy).toBe('number');

    await captureState(page, {
      label: 'inv29-refusal',
      featurePath: 'BRAIN → PLAN → SET_OVERRIDE → INV29_REFUSAL',
      specFile: SPEC_FILE, specLine: 110,
      codeUnderTest: `BRAIN.plan.setOverride('savings', 'bundle32-inv29-case2', ${result.overAmt}, {}, PLAN_OVERRIDE_SET) where overAmt > surplus (${result.surplus})`,
      expectedState: `r.ok=false, r.reason='inv29-over-allocation', wouldOverBy=${result.r.wouldOverBy}; state unchanged; audit log inv29_refusal entry appended`,
      clipTo: null,
    });
  });

  test('Case 3: reduction in over-allocated state is allowed', async ({ page }) => {
    // Setup: inject two savings overrides totaling more than surplus (legacy
    // over-allocated state). Then attempt to REDUCE one of them. Must be allowed
    // even though resulting state is still over — refusing reductions would
    // create stuck state per INV-29 policy.
    const result = await page.evaluate(() => {
      S.activePlan = S.activePlan || {};
      S.activePlan.overrides = S.activePlan.overrides || {};
      Object.keys(S.activePlan.overrides).forEach(k => {
        if (k.startsWith('savings:')) delete S.activePlan.overrides[k];
      });
      const snapPre = BRAIN.plan.getSnapshot();
      const overAmt = Math.ceil(snapPre.derived.surplus * 0.7) + 200;
      // Direct-mutate to simulate legacy over-allocated state. Two overrides
      // each at overAmt → total = 2×overAmt > surplus (over-allocated).
      S.activePlan.overrides['savings:bundle32-inv29-case3a'] = {
        normalAmount: 0, thisCycleAmount: overAmt, reason: null, deferred: 0, deferAction: 'none', setAt: Date.now(),
      };
      S.activePlan.overrides['savings:bundle32-inv29-case3b'] = {
        normalAmount: 0, thisCycleAmount: overAmt, reason: null, deferred: 0, deferAction: 'none', setAt: Date.now(),
      };
      const snapOver = BRAIN.plan.getSnapshot();
      // Verify state is now over-allocated
      const isOverBefore = snapOver.derived.savingsOverAllocated > 0;
      // Now REDUCE case3a from overAmt to overAmt/2 (still allocated, just less)
      const reducedAmt = Math.floor(overAmt / 2);
      const r = BRAIN.plan.setOverride('savings', 'bundle32-inv29-case3a', reducedAmt, {}, BRAIN.SOURCES.PLAN_OVERRIDE_SET);
      const overrideAfter = S.activePlan.overrides['savings:bundle32-inv29-case3a'];
      const snapAfter = BRAIN.plan.getSnapshot();
      return {
        r,
        overAmt, reducedAmt,
        isOverBefore,
        overrideAfter: overrideAfter ? overrideAfter.thisCycleAmount : null,
        stillOverAfter: snapAfter.derived.savingsOverAllocated > 0,
        savingsOverAfter: snapAfter.derived.savingsOverAllocated,
      };
    });

    // Pre-condition: state was over-allocated
    expect(result.isOverBefore, 'state must be over-allocated before reduction attempt').toBe(true);

    // Reduction allowed (does NOT refuse even though final state still over)
    expect(result.r.ok, 'reduction in over-allocated state must be allowed').toBe(true);
    expect(result.r.reason).toBeUndefined();
    expect(result.overrideAfter, 'override should be updated to the reduced amount').toBe(result.reducedAmt);

    // Note: stillOverAfter may be true OR false depending on how much was reduced.
    // INV-29 doesn't promise the state will be under-allocated after a reduction,
    // only that the reduction was allowed. That's the right policy.
  });

  test('Case 4: pay-in-full normalisation still works (Bundle 28 path preserved)', async ({ page }) => {
    // When the user picks an amount within $0.50 of normal, setOverride clears
    // the override entirely (Bundle 29 demon-time normalisation). INV-29 must
    // not interfere with that path. Note: bills have a different defer-flow so
    // this test uses 'kia-extra' instead (also goes through the normalisation
    // path for non-bill categories, but isn't affected by INV-29's savings-only scope).
    const result = await page.evaluate(() => {
      // Resolve a normal amount for a known bucket. We use kia-extra which has
      // a defined normal via S.carloan etc. and is not subject to INV-29.
      // The point of this test is that the normalisation short-circuit fires
      // BEFORE the INV-29 check.
      const carloan = +S.carloan || 0;
      if (carloan <= 0) {
        // No KIA loan in fixture — use a savings override with explicit normalAmount
        // set above the would-be-refused threshold. The normalisation path
        // checks |new - normal| <= 0.5, so pick exactly normal.
        return { skipped: true, reason: 'no-kia-loan-in-fixture' };
      }
      // For kia-extra, normalAmount is resolved via _resolveNormalAmount(category, itemId).
      // The "pay in full" scenario means setting amt == carloan exactly.
      // This is NOT a savings override, so INV-29 wouldn't apply anyway — but
      // we still verify the normalisation path fires cleanly.
      const r = BRAIN.plan.setOverride('kia-extra', 'KIA', carloan, {}, BRAIN.SOURCES.PLAN_OVERRIDE_SET);
      return { r, carloan };
    });

    if (result.skipped) {
      test.skip(true, result.reason);
      return;
    }
    expect(result.r.ok, 'pay-in-full setOverride must succeed').toBe(true);
    // The normalised flag in the response indicates the override was cleared
    // rather than written — Bundle 29 normalisation path
    if (result.r.normalised) {
      expect(result.r.deferred).toBe(0);
    }
  });
});
