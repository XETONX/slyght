// Bundle 32.6 substrate — BRAIN.plan.resetCycle canonical writer smoke.
//
// Why: pre-32.6 there was no canonical "undo this cycle to a fresh state"
// operation. Users wanting to re-plan had to (a) unlock + (b) manually
// clear each override + (c) manually un-tick each row, etc. resetCycle
// makes this atomic and audit-trail-coherent.
//
// 5 cases asserted:
//   1. Reset clears overrides + ticks + knownUpcoming + savings mirror +
//      lockedAt + streak gate; audit log entry has compressed pre-state
//   2. Reset preserves cycleId + cycleStartDate + cycleEndDate +
//      income.netPay + dailyLivingFloor + bufferFloor (cycle identity
//      and user prefs unchanged)
//   3. Reset preserves bonus.amount + bonus.status but clears
//      bonus.included (user re-opts-in for the new plan attempt)
//   4. Dual-store sync — BRAIN.allocation.isLocked() === false after
//      reset (parallel to unlock's mirror behavior)
//   5. Reset works on a locked plan (atomic unlock + clear). No need to
//      unlock first — that's the whole point.
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

test.describe('Bundle 32.6 substrate — BRAIN.plan.resetCycle canonical writer', () => {
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
      && BRAIN.plan && typeof BRAIN.plan.resetCycle === 'function'
      && BRAIN.SOURCES && BRAIN.SOURCES.PLAN_CYCLE_RESET, { timeout: 5000 });
    await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
    await page.evaluate(() => {
      const modal = document.getElementById('eod-recon-modal');
      if (modal && modal.classList.contains('open') && typeof eodReconAccept === 'function') eodReconAccept();
    });
  });

  test('Case 1: reset clears overrides/ticks/knownUpcoming/savings/lockedAt; audit log captures pre-state', async ({ page }) => {
    const result = await page.evaluate(() => {
      // Seed some "dirty" state
      if (S.activePlan) {
        S.activePlan.lockedAt = null;
      }
      BRAIN.plan.setOverride('savings', 'reset-probe-1', 100, {}, BRAIN.SOURCES.PLAN_OVERRIDE_SET);
      BRAIN.plan.setOverride('savings', 'reset-probe-2', 50, {}, BRAIN.SOURCES.PLAN_OVERRIDE_SET);
      // Add a knownUpcoming
      if (!S.activePlan.knownUpcoming) S.activePlan.knownUpcoming = [];
      S.activePlan.knownUpcoming.push({ id: 'reset-probe-up', name: 'Reset probe upcoming', amount: 75 });
      // Seed a tick
      S.activePlan.ticks = S.activePlan.ticks || {};
      S.activePlan.ticks.bill = S.activePlan.ticks.bill || {};
      S.activePlan.ticks.bill['reset-probe-bill'] = { tickedAt: Date.now() };
      // Capture pre-reset state
      const overridesBefore = Object.keys(S.activePlan.overrides || {}).length;
      const upcomingBefore = (S.activePlan.knownUpcoming || []).length;
      const ticksBefore = Object.keys(S.activePlan.ticks.bill || {}).length;

      const r = BRAIN.plan.resetCycle(BRAIN.SOURCES.PLAN_CYCLE_RESET);

      const overridesAfter = Object.keys(S.activePlan.overrides || {}).length;
      const upcomingAfter = (S.activePlan.knownUpcoming || []).length;
      const ticksAfter = Object.keys(S.activePlan.ticks.bill || {}).length;
      const recentAudit = (S._auditLog || []).slice(-3);
      const resetEntry = recentAudit.find(e => e && e.type === 'plan_cycle_reset');

      return {
        rOk: r.ok,
        overridesBefore, overridesAfter,
        upcomingBefore, upcomingAfter,
        ticksBefore, ticksAfter,
        lockedAtAfter: S.activePlan.lockedAt,
        streakAfter: S.activePlan.streak,
        savingsMirror: Object.keys(S.activePlan.savings || {}).length,
        resetEntryPresent: !!resetEntry,
        resetEntryHasPreState: !!(resetEntry && resetEntry.preState),
        preStateOverridesCount: resetEntry && resetEntry.preState && resetEntry.preState.overridesCount,
      };
    });
    expect(result.rOk).toBe(true);
    expect(result.overridesBefore).toBeGreaterThanOrEqual(2);
    expect(result.overridesAfter).toBe(0);
    expect(result.upcomingBefore).toBeGreaterThanOrEqual(1);
    expect(result.upcomingAfter).toBe(0);
    expect(result.ticksBefore).toBeGreaterThanOrEqual(1);
    expect(result.ticksAfter).toBe(0);
    expect(result.lockedAtAfter).toBeNull();
    expect(result.streakAfter).toBe(0);
    expect(result.savingsMirror).toBe(0);
    expect(result.resetEntryPresent).toBe(true);
    expect(result.resetEntryHasPreState).toBe(true);
    expect(result.preStateOverridesCount).toBe(result.overridesBefore);
  });

  test('Case 2: reset preserves cycle identity + user prefs (cycleId/dates/income/floors)', async ({ page }) => {
    const result = await page.evaluate(() => {
      const before = {
        cycleId: S.activePlan && S.activePlan.cycleId,
        cycleStartDate: S.activePlan && S.activePlan.cycleStartDate,
        cycleEndDate: S.activePlan && S.activePlan.cycleEndDate,
        netPay: S.activePlan && S.activePlan.income && S.activePlan.income.netPay,
        dailyLivingFloor: S.activePlan && S.activePlan.dailyLivingFloor,
        bufferFloor: S.activePlan && S.activePlan.bufferFloor,
        driftSensitivity: S.activePlan && S.activePlan.driftSensitivity,
      };
      BRAIN.plan.resetCycle(BRAIN.SOURCES.PLAN_CYCLE_RESET);
      const after = {
        cycleId: S.activePlan && S.activePlan.cycleId,
        cycleStartDate: S.activePlan && S.activePlan.cycleStartDate,
        cycleEndDate: S.activePlan && S.activePlan.cycleEndDate,
        netPay: S.activePlan && S.activePlan.income && S.activePlan.income.netPay,
        dailyLivingFloor: S.activePlan && S.activePlan.dailyLivingFloor,
        bufferFloor: S.activePlan && S.activePlan.bufferFloor,
        driftSensitivity: S.activePlan && S.activePlan.driftSensitivity,
      };
      return { before, after };
    });
    expect(result.after.cycleId).toBe(result.before.cycleId);
    expect(result.after.cycleStartDate).toBe(result.before.cycleStartDate);
    expect(result.after.cycleEndDate).toBe(result.before.cycleEndDate);
    expect(result.after.netPay).toBe(result.before.netPay);
    expect(result.after.dailyLivingFloor).toBe(result.before.dailyLivingFloor);
    expect(result.after.bufferFloor).toBe(result.before.bufferFloor);
    expect(result.after.driftSensitivity).toBe(result.before.driftSensitivity);
  });

  test('Case 3: bonus.amount + bonus.status preserved; bonus.included cleared', async ({ page }) => {
    const result = await page.evaluate(() => {
      // Set a bonus state
      BRAIN.plan.setBonus({ amount: 1500, included: true, status: 'confirmed' }, BRAIN.SOURCES.PLAN_BONUS_EDIT);
      const before = Object.assign({}, S.activePlan.income.bonus);
      BRAIN.plan.resetCycle(BRAIN.SOURCES.PLAN_CYCLE_RESET);
      const after = Object.assign({}, S.activePlan.income.bonus);
      return { before, after };
    });
    expect(result.before.amount).toBe(1500);
    expect(result.before.included).toBe(true);
    expect(result.before.status).toBe('confirmed');
    // After reset: amount + status preserved; included cleared
    expect(result.after.amount).toBe(1500);
    expect(result.after.status).toBe('confirmed');
    expect(result.after.included).toBe(false);
  });

  test('Case 4: dual-store sync — BRAIN.allocation.isLocked() false after reset', async ({ page }) => {
    const result = await page.evaluate(() => {
      // Reset to unlocked baseline first — fixture may carry S.activePlan.lockedAt
      // from John's real state, which makes the next lock() a no-op (already-locked
      // path returns without mirroring).
      if (S.activePlan && S.activePlan.lockedAt) {
        S.activePlan.lockedAt = null;
        try { BRAIN.allocation.unlock(BRAIN.SOURCES.CANVAS_UNLOCK); } catch (_) {}
      }
      // Lock first via canonical writer (sets both S.activePlan + BRAIN.allocation)
      BRAIN.plan.lock({ snapshot: { test: 'reset-case4' } }, BRAIN.SOURCES.CANVAS_LOCK);
      const allocLockedPreReset = BRAIN.allocation.isLocked();
      BRAIN.plan.resetCycle(BRAIN.SOURCES.PLAN_CYCLE_RESET);
      return {
        allocLockedPreReset,
        allocLockedPostReset: BRAIN.allocation.isLocked(),
        planLockedPostReset: BRAIN.plan.isLocked(),
      };
    });
    expect(result.allocLockedPreReset).toBe(true);
    expect(result.allocLockedPostReset).toBe(false);
    expect(result.planLockedPostReset).toBe(false);
  });

  test('Case 5: reset on a locked plan works atomically (unlock + clear in one operation)', async ({ page }) => {
    const result = await page.evaluate(() => {
      // Build a locked + dirty plan
      BRAIN.plan.setOverride('savings', 'reset-locked-probe', 200, {}, BRAIN.SOURCES.PLAN_OVERRIDE_SET);
      BRAIN.plan.lock({ snapshot: { case: 5 } }, BRAIN.SOURCES.CANVAS_LOCK);
      const isLockedBefore = BRAIN.plan.isLocked();
      const overridesBefore = Object.keys(S.activePlan.overrides || {}).length;
      // Confirm INV-29 would refuse a normal setOverride here
      const inv29Check = BRAIN.plan.setOverride('savings', 'reset-locked-blocked-attempt', 1, {}, BRAIN.SOURCES.PLAN_OVERRIDE_SET);
      // resetCycle should work even though plan is locked
      const r = BRAIN.plan.resetCycle(BRAIN.SOURCES.PLAN_CYCLE_RESET);
      return {
        isLockedBefore,
        inv29RefusedNormalSet: inv29Check.ok === false && inv29Check.reason === 'plan-locked',
        rOk: r.ok,
        isLockedAfter: BRAIN.plan.isLocked(),
        overridesBefore,
        overridesAfter: Object.keys(S.activePlan.overrides || {}).length,
        preStateWasLocked: r.preState && r.preState.wasLocked,
      };
    });
    expect(result.isLockedBefore).toBe(true);
    // Confirms INV-29 is active (the normal mutation path is gated) BUT resetCycle bypasses
    expect(result.inv29RefusedNormalSet).toBe(true);
    expect(result.rOk).toBe(true);
    expect(result.isLockedAfter).toBe(false);
    expect(result.overridesBefore).toBeGreaterThanOrEqual(1);
    expect(result.overridesAfter).toBe(0);
    expect(result.preStateWasLocked).toBe(true);
  });

  // Bug-1.6 hotfix (2026-05-21) — resetCycle falsy-coalesce eats user-set zero.
  // Pre-fix: `bufferFloor: +p.bufferFloor || 300` (and same pattern for
  // dailyLivingFloor || 30, driftSensitivity || 0.15) silently replaced an
  // explicit zero with the default. 0 is a legitimate user value for all
  // three fields (buffer-off · pantry-day spending · zero drift tolerance).
  // Caught when live state (bufferFloor=0 after John dropped it) made
  // Case 2's after===before check fail. Baseline fixture had bufferFloor=100
  // so the bug stayed hidden. Fix: Number.isFinite guards on all 3 fields
  // in both the dryRun preState path (receipt-modal display) AND the
  // preserved write path (the actual mutation).
  //
  // Two cases: write-path preservation + receipt-path preservation. Both
  // matter — the receipt-vs-reality smoke (reset-cycle-ui.smoke.js Case 6)
  // walks the receipt's WILL KEEP rows and compares against the post-reset
  // state. If either path falsy-coalesces, the receipt lies.

  test('Case 6: Bug-1.6 regression — user-set zero preserves across resetCycle (write path)', async ({ page }) => {
    const result = await page.evaluate(() => {
      // Set all three toxic-pattern fields to 0 — the exact input that
      // pre-fix would silently revert to defaults.
      S.activePlan = S.activePlan || {};
      S.activePlan.bufferFloor = 0;
      S.activePlan.dailyLivingFloor = 0;
      S.activePlan.driftSensitivity = 0;
      const before = {
        bufferFloor: S.activePlan.bufferFloor,
        dailyLivingFloor: S.activePlan.dailyLivingFloor,
        driftSensitivity: S.activePlan.driftSensitivity,
      };
      BRAIN.plan.resetCycle(BRAIN.SOURCES.PLAN_CYCLE_RESET);
      const after = {
        bufferFloor: S.activePlan.bufferFloor,
        dailyLivingFloor: S.activePlan.dailyLivingFloor,
        driftSensitivity: S.activePlan.driftSensitivity,
      };
      return { before, after };
    });
    expect(result.before.bufferFloor).toBe(0);
    expect(result.after.bufferFloor).toBe(0);              // pre-fix: 300
    expect(result.before.dailyLivingFloor).toBe(0);
    expect(result.after.dailyLivingFloor).toBe(0);         // pre-fix: 30
    expect(result.before.driftSensitivity).toBe(0);
    expect(result.after.driftSensitivity).toBe(0);         // pre-fix: 0.15
  });

  test('Case 7: Bug-1.6 regression — dryRun preState reports user-set zero (receipt-vs-reality)', async ({ page }) => {
    const result = await page.evaluate(() => {
      S.activePlan = S.activePlan || {};
      S.activePlan.bufferFloor = 0;
      S.activePlan.dailyLivingFloor = 0;
      // dryRun feeds the receipt modal's WILL KEEP rows. Must reflect the
      // actual user-set values, not the defaults.
      const r = BRAIN.plan.resetCycle(BRAIN.SOURCES.PLAN_CYCLE_RESET, { dryRun: true });
      return {
        ok: r.ok,
        dryRun: r.dryRun,
        bufferFloor: r.preState && r.preState.bufferFloor,
        dailyLivingFloor: r.preState && r.preState.dailyLivingFloor,
      };
    });
    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.bufferFloor).toBe(0);                   // pre-fix: 0 (|| 0 was identity) — still asserts contract
    expect(result.dailyLivingFloor).toBe(0);              // pre-fix: 30 (|| 30 ate the zero)
  });
});
