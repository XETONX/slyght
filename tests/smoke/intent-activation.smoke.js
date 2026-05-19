// Bundle 32.3 Pass 1 — intent activation fields + isActive resolver smoke.
//
// Substrate additions only — no consumer migrated yet. Pass 2 (forecast)
// is the first consumer; Pass 3 (UI) is the second. This spec locks the
// activation-resolution semantics so both downstream passes can rely on it.
//
// 7 cases covering the full resolution matrix:
//   1. add() defaults: new intent has autoActivate=true, manualActivation=null
//   2. update() accepts the two new fields; rejects unknown still
//   3. setActivation() writer accepts 'on'/'off'/null; rejects garbage
//   4. isActive: kind='goal' → always active (auto path, no spend window)
//   5. isActive: kind='trip' + today inside window → active
//   6. isActive: kind='trip' + today outside window → inactive
//   7. isActive: manual override wins ('on' active even outside window;
//      'off' inactive even inside window)
//   Bonus #8: getActiveSpendingTrips returns only kind='trip' + isActive
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

test.describe('Bundle 32.3 Pass 1 — intent activation fields + isActive resolver', () => {
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
      && BRAIN.plan && BRAIN.plan.intent
      && typeof BRAIN.plan.intent.isActive === 'function'
      && typeof BRAIN.plan.intent.setActivation === 'function'
      && typeof BRAIN.plan.intent.getActiveSpendingTrips === 'function'
      && BRAIN.SOURCES && BRAIN.SOURCES.PLAN_INTENT_ADD
      && BRAIN.SOURCES.PLAN_INTENT_UPDATE, { timeout: 5000 });
    await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
    await page.evaluate(() => {
      const modal = document.getElementById('eod-recon-modal');
      if (modal && modal.classList.contains('open') && typeof eodReconAccept === 'function') eodReconAccept();
    });
  });

  test('Case 1: add() defaults — autoActivate=true, manualActivation=null', async ({ page }) => {
    const r = await page.evaluate(() => {
      const addRes = BRAIN.plan.intent.add({
        id: 'pass1-case1', name: 'Pass1 Case1 Goal', kind: 'goal', targetAmount: 1000,
      }, BRAIN.SOURCES.PLAN_INTENT_ADD);
      const intent = BRAIN.plan.intent.get('pass1-case1');
      return { addOk: addRes.ok, intent };
    });
    expect(r.addOk).toBe(true);
    expect(r.intent.autoActivate).toBe(true);
    expect(r.intent.manualActivation).toBeNull();
  });

  test('Case 2: update() accepts new fields; rejects unknown', async ({ page }) => {
    const r = await page.evaluate(() => {
      BRAIN.plan.intent.add({ id: 'pass1-case2', name: 'Pass1 Case2', kind: 'goal', targetAmount: 500 }, BRAIN.SOURCES.PLAN_INTENT_ADD);
      const okAuto = BRAIN.plan.intent.update('pass1-case2', { autoActivate: false }, BRAIN.SOURCES.PLAN_INTENT_UPDATE);
      const okManual = BRAIN.plan.intent.update('pass1-case2', { manualActivation: 'on' }, BRAIN.SOURCES.PLAN_INTENT_UPDATE);
      const rejected = BRAIN.plan.intent.update('pass1-case2', { bogusField: 'nope' }, BRAIN.SOURCES.PLAN_INTENT_UPDATE);
      const after = BRAIN.plan.intent.get('pass1-case2');
      return { okAuto, okManual, rejected, after };
    });
    expect(r.okAuto.ok).toBe(true);
    expect(r.okManual.ok).toBe(true);
    expect(r.rejected.ok).toBe(false);
    expect(r.rejected.reason).toContain('unknown-field');
    expect(r.after.autoActivate).toBe(false);
    expect(r.after.manualActivation).toBe('on');
  });

  test('Case 3: setActivation() — valid values accepted; garbage rejected', async ({ page }) => {
    const r = await page.evaluate(() => {
      BRAIN.plan.intent.add({ id: 'pass1-case3', name: 'Pass1 Case3', kind: 'goal', targetAmount: 100 }, BRAIN.SOURCES.PLAN_INTENT_ADD);
      const on = BRAIN.plan.intent.setActivation('pass1-case3', 'on', BRAIN.SOURCES.PLAN_INTENT_UPDATE);
      const off = BRAIN.plan.intent.setActivation('pass1-case3', 'off', BRAIN.SOURCES.PLAN_INTENT_UPDATE);
      const clear = BRAIN.plan.intent.setActivation('pass1-case3', null, BRAIN.SOURCES.PLAN_INTENT_UPDATE);
      const bogus = BRAIN.plan.intent.setActivation('pass1-case3', 'maybe', BRAIN.SOURCES.PLAN_INTENT_UPDATE);
      return { on, off, clear, bogus, final: BRAIN.plan.intent.get('pass1-case3') };
    });
    expect(r.on.ok).toBe(true);
    expect(r.off.ok).toBe(true);
    expect(r.clear.ok).toBe(true);
    expect(r.bogus.ok).toBe(false);
    expect(r.bogus.reason).toContain('invalid-activation');
    // Final state after the three valid calls: cleared (null)
    expect(r.final.manualActivation).toBeNull();
  });

  test('Case 4: isActive — kind=goal always active by default', async ({ page }) => {
    const r = await page.evaluate(() => {
      BRAIN.plan.intent.add({ id: 'pass1-case4', name: 'Pass1 Case4', kind: 'goal', targetAmount: 100 }, BRAIN.SOURCES.PLAN_INTENT_ADD);
      return { isActive: BRAIN.plan.intent.isActive('pass1-case4') };
    });
    expect(r.isActive).toBe(true);
  });

  test('Case 5: isActive — trip with today INSIDE [startDate, endDate]', async ({ page }) => {
    const r = await page.evaluate(() => {
      // Frozen clock is 2026-05-19. Make a trip window that includes today.
      BRAIN.plan.intent.add({
        id: 'pass1-case5', name: 'Pass1 Case5 Trip', kind: 'trip', targetAmount: 500,
        startDate: '2026-05-15', endDate: '2026-05-25',
      }, BRAIN.SOURCES.PLAN_INTENT_ADD);
      return { isActive: BRAIN.plan.intent.isActive('pass1-case5') };
    });
    expect(r.isActive).toBe(true);
  });

  test('Case 6: isActive — trip with today OUTSIDE window (past or future)', async ({ page }) => {
    const r = await page.evaluate(() => {
      // Past trip
      BRAIN.plan.intent.add({
        id: 'pass1-case6-past', name: 'Past Trip', kind: 'trip', targetAmount: 500,
        startDate: '2026-04-01', endDate: '2026-04-10',
      }, BRAIN.SOURCES.PLAN_INTENT_ADD);
      // Future trip
      BRAIN.plan.intent.add({
        id: 'pass1-case6-future', name: 'Future Trip', kind: 'trip', targetAmount: 500,
        startDate: '2026-12-01', endDate: '2026-12-22',
      }, BRAIN.SOURCES.PLAN_INTENT_ADD);
      // Trip without dates
      BRAIN.plan.intent.add({
        id: 'pass1-case6-nodate', name: 'No-Date Trip', kind: 'trip', targetAmount: 500,
      }, BRAIN.SOURCES.PLAN_INTENT_ADD);
      return {
        past: BRAIN.plan.intent.isActive('pass1-case6-past'),
        future: BRAIN.plan.intent.isActive('pass1-case6-future'),
        nodate: BRAIN.plan.intent.isActive('pass1-case6-nodate'),
      };
    });
    expect(r.past).toBe(false);
    expect(r.future).toBe(false);
    expect(r.nodate).toBe(false);
  });

  test('Case 7: manual override wins — \'on\' forces active outside window; \'off\' forces inactive inside window', async ({ page }) => {
    const r = await page.evaluate(() => {
      // Past trip + manual 'on' → active
      BRAIN.plan.intent.add({
        id: 'pass1-case7-on', name: 'Past Trip Forced On', kind: 'trip', targetAmount: 500,
        startDate: '2026-04-01', endDate: '2026-04-10',
        manualActivation: 'on',
      }, BRAIN.SOURCES.PLAN_INTENT_ADD);
      // Current trip + manual 'off' → inactive (e.g., trip cancelled)
      BRAIN.plan.intent.add({
        id: 'pass1-case7-off', name: 'Current Trip Cancelled', kind: 'trip', targetAmount: 500,
        startDate: '2026-05-15', endDate: '2026-05-25',
        manualActivation: 'off',
      }, BRAIN.SOURCES.PLAN_INTENT_ADD);
      return {
        forcedOn: BRAIN.plan.intent.isActive('pass1-case7-on'),
        forcedOff: BRAIN.plan.intent.isActive('pass1-case7-off'),
      };
    });
    expect(r.forcedOn).toBe(true);
    expect(r.forcedOff).toBe(false);
  });

  test('Case 8: getActiveSpendingTrips returns only kind=trip + isActive', async ({ page }) => {
    const r = await page.evaluate(() => {
      // Active trip
      BRAIN.plan.intent.add({
        id: 'pass1-case8-active', name: 'Active Trip', kind: 'trip', targetAmount: 500,
        startDate: '2026-05-15', endDate: '2026-05-25',
      }, BRAIN.SOURCES.PLAN_INTENT_ADD);
      // Inactive trip (past)
      BRAIN.plan.intent.add({
        id: 'pass1-case8-inactive', name: 'Inactive Trip', kind: 'trip', targetAmount: 500,
        startDate: '2026-04-01', endDate: '2026-04-10',
      }, BRAIN.SOURCES.PLAN_INTENT_ADD);
      // Goal (not a trip — should be excluded even though isActive returns true)
      BRAIN.plan.intent.add({
        id: 'pass1-case8-goal', name: 'A Goal', kind: 'goal', targetAmount: 1000,
      }, BRAIN.SOURCES.PLAN_INTENT_ADD);
      const trips = BRAIN.plan.intent.getActiveSpendingTrips();
      const ids = trips.map(t => t.id);
      return { ids, count: trips.length };
    });
    expect(r.ids).toContain('pass1-case8-active');
    expect(r.ids).not.toContain('pass1-case8-inactive');
    expect(r.ids).not.toContain('pass1-case8-goal');
  });

  test('Case 9: existing seedV25-populated intents lacking the new fields default correctly via isActive', async ({ page }) => {
    // Confirms lazy-default behavior: pre-Pass-1 intents in S.planIntents
    // don't have autoActivate/manualActivation set, but isActive's checks
    // (`=== false`, `=== 'on'`, `=== 'off'`) default to the auto path.
    const r = await page.evaluate(() => {
      // Find an existing intent from John's seed data
      const existing = BRAIN.plan.intent.list().find(i => i.kind === 'goal' && !i.archived);
      if (!existing) return { skip: true, reason: 'no-existing-goal-intent' };
      // It may not have the new fields; verify isActive still works
      return {
        skip: false,
        name: existing.name,
        hasAutoActivateField: 'autoActivate' in existing,
        hasManualActivationField: 'manualActivation' in existing,
        isActive: BRAIN.plan.intent.isActive(existing.id),
      };
    });
    if (r.skip) test.skip(true, r.reason);
    // Whether or not the field is present, isActive must resolve to a boolean
    expect(typeof r.isActive).toBe('boolean');
    // Goal-kind defaults to active in the auto path
    expect(r.isActive).toBe(true);
  });
});
