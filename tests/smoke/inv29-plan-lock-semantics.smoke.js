// Bundle 32.7 Pass 1 — INV-29 plan-lock narrow-semantics enforcement smoke.
//
// Substrate prerequisite: BRAIN.plan.lock/unlock/isLocked canonical writers
// (Pass 1.a). Before Pass 1, "is the plan locked" returned different answers
// across S.activePlan.lockedAt vs BRAIN.allocation vs legacy localStorage
// flag — defining INV-29 enforcement was impossible. Post Pass 1 the reader
// is unambiguous (single source: S.activePlan.lockedAt via BRAIN.plan.isLocked).
//
// INV-29 (SDD-bundle-30 §C#3): plan lock prevents modification of
// S.activePlan.overrides ONLY. It does NOT prevent ticking items, editing
// bonus, logging transactions, or marking bills paid.
//
// 5 cases asserted:
//   1. Refusal: setOverride on locked plan returns {ok:false, reason:'plan-locked'};
//      state unchanged; audit log has inv29_refusal entry.
//   2. clearOverride on locked plan also refused (clearing IS modification).
//   3. Tick: BRAIN.plan.tickItem on locked plan SUCCEEDS (ticks are post-lock
//      execution, not plan-shape modification).
//   4. Bonus: BRAIN.plan.setBonus on locked plan SUCCEEDS (bonus is income-side
//      adjustment, not override modification).
//   5. After unlock: setOverride works again (refusal lifts when isLocked() false).
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

test.describe('Bundle 32.7 Pass 1 — INV-29 plan-lock narrow semantics', () => {
  test.beforeEach(async ({ page, context }) => {
    await page.clock.install({ time: new Date(FROZEN_ISO) });
    await context.addInitScript((args) => {
      try { localStorage.setItem('slyght_v5', JSON.stringify(args.seed)); } catch (_) {}
      try { localStorage.setItem('slyght_seeded_v13', '1'); } catch (_) {}
      try { localStorage.setItem('slyght_seeded_v12', '1'); } catch (_) {}
      try { localStorage.setItem('slyght_seeded_v11', '1'); } catch (_) {}
      try { localStorage.setItem('slyght_bills_reset_month', args.monthKey); } catch (_) {}
      try { localStorage.removeItem('slyght_payday_plan'); } catch (_) {}
    }, { seed: buildSlyghtV5(fixture), monthKey: '2026-5' });

    await page.goto(process.env.SMOKE_BASE_URL || '/');
    await page.addStyleTag({ content: SETTLE_CSS });
    await page.waitForFunction(() => typeof BRAIN !== 'undefined'
      && BRAIN.plan && BRAIN.plan.setOverride && BRAIN.plan.lock && BRAIN.plan.unlock
      && BRAIN.SOURCES.PLAN_OVERRIDE_SET && BRAIN.SOURCES.PLAN_OVERRIDE_CLEAR
      && BRAIN.SOURCES.CANVAS_LOCK && BRAIN.SOURCES.CANVAS_UNLOCK, { timeout: 5000 });
    await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
    await page.evaluate(() => {
      const modal = document.getElementById('eod-recon-modal');
      if (modal && modal.classList.contains('open') && typeof eodReconAccept === 'function') eodReconAccept();
    });
  });

  test('Case 1: setOverride on locked plan is refused (plan-locked); state unchanged; audit logged', async ({ page }) => {
    const result = await page.evaluate(() => {
      BRAIN.plan.lock({}, BRAIN.SOURCES.CANVAS_LOCK);
      // Capture pre-attempt state
      const overridesBefore = Object.keys((S.activePlan && S.activePlan.overrides) || {}).length;
      const r = BRAIN.plan.setOverride('savings', 'inv29-case1-probe', 50, {}, BRAIN.SOURCES.PLAN_OVERRIDE_SET);
      const overridesAfter = Object.keys((S.activePlan && S.activePlan.overrides) || {}).length;
      const recentAudit = (S._auditLog || []).slice(-3).map(e => e && e.type);
      return { r, overridesBefore, overridesAfter, recentAudit };
    });
    expect(result.r.ok).toBe(false);
    expect(result.r.reason).toBe('plan-locked');
    expect(result.overridesAfter).toBe(result.overridesBefore);
    expect(result.recentAudit).toContain('inv29_refusal');
  });

  test('Case 2: clearOverride on locked plan is refused (clearing is modification too)', async ({ page }) => {
    const result = await page.evaluate(() => {
      // Set an override first while unlocked
      BRAIN.plan.setOverride('savings', 'inv29-case2-probe', 75, {}, BRAIN.SOURCES.PLAN_OVERRIDE_SET);
      // Now lock and try to clear
      BRAIN.plan.lock({}, BRAIN.SOURCES.CANVAS_LOCK);
      const overrideBefore = (S.activePlan && S.activePlan.overrides && S.activePlan.overrides['savings:inv29-case2-probe']);
      const r = BRAIN.plan.clearOverride('savings', 'inv29-case2-probe', BRAIN.SOURCES.PLAN_OVERRIDE_CLEAR);
      const overrideAfter = (S.activePlan && S.activePlan.overrides && S.activePlan.overrides['savings:inv29-case2-probe']);
      return { r, overrideBeforeExists: !!overrideBefore, overrideAfterExists: !!overrideAfter };
    });
    expect(result.r.ok).toBe(false);
    expect(result.r.reason).toBe('plan-locked');
    expect(result.overrideBeforeExists).toBe(true);
    expect(result.overrideAfterExists).toBe(true); // unchanged
  });

  test('Case 3: BRAIN.plan.tickItem on locked plan SUCCEEDS (ticks are post-lock execution)', async ({ page }) => {
    const result = await page.evaluate(() => {
      BRAIN.plan.lock({}, BRAIN.SOURCES.CANVAS_LOCK);
      // Pick a bill to tick
      const billsList = (BRAIN.bills && BRAIN.bills.getThisCycle) ? BRAIN.bills.getThisCycle() : [];
      const unpaidBill = billsList.find(b => !b.paid);
      if (!unpaidBill) return { skip: true, reason: 'no-unpaid-bill' };
      const billId = unpaidBill.id || unpaidBill.name;
      const r = BRAIN.plan.tickItem('bill', billId, BRAIN.SOURCES.PLAN_BILLS_TICK);
      return { r, skip: false };
    });
    if (result.skip) test.skip(true, result.reason);
    else expect(result.r.ok).toBe(true);
  });

  test('Case 4: BRAIN.plan.setBonus on locked plan SUCCEEDS (bonus is income-side, not override)', async ({ page }) => {
    const result = await page.evaluate(() => {
      BRAIN.plan.lock({}, BRAIN.SOURCES.CANVAS_LOCK);
      const r = BRAIN.plan.setBonus({ amount: 1500, included: true, status: 'expected' }, BRAIN.SOURCES.PLAN_BONUS_EDIT);
      return { r };
    });
    expect(result.r.ok).toBe(true);
  });

  test('Case 5: setOverride succeeds again after BRAIN.plan.unlock', async ({ page }) => {
    const result = await page.evaluate(() => {
      BRAIN.plan.lock({}, BRAIN.SOURCES.CANVAS_LOCK);
      const refused = BRAIN.plan.setOverride('savings', 'inv29-case5-probe', 25, {}, BRAIN.SOURCES.PLAN_OVERRIDE_SET);
      BRAIN.plan.unlock(BRAIN.SOURCES.CANVAS_UNLOCK);
      const accepted = BRAIN.plan.setOverride('savings', 'inv29-case5-probe', 25, {}, BRAIN.SOURCES.PLAN_OVERRIDE_SET);
      return { refused, accepted, isLockedAtEnd: BRAIN.plan.isLocked() };
    });
    expect(result.refused.ok).toBe(false);
    expect(result.refused.reason).toBe('plan-locked');
    expect(result.accepted.ok).toBe(true);
    expect(result.isLockedAtEnd).toBe(false);
  });
});
