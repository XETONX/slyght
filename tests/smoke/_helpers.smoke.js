// Bundle 30.5 Phase C pre-work — regression guard for captureState helpers.
//
// Locks in the counter-leak refinement fix from Phase B end-of-phase. Bug
// pattern: per-spec audit counter persisted across tests in the same spec.
// Playwright creates a fresh page per test → in-page audit log starts at 0
// → stale counter caused first capture in tests-2-onwards to show empty
// audit_window when writes had actually fired. Fix: detect
// `auditAll.length < storedCounter` → reset since=0.
//
// This spec is the regression guard. If a future change to capture-state.js
// removes the stale-counter reset, test 2 below FAILS because its capture's
// audit_window comes back empty.
//
// Bundle 30.5 Phase C pre-work, 2026-05-19.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { captureState } = require('../helpers/capture-state');

const FIXTURE_PATH = path.resolve(__dirname, '../../state-snapshot.json');
const FROZEN_ISO = '2026-05-05T22:00:00+10:00';
const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
const SPEC_FILE = 'tests/smoke/_helpers.smoke.js';

function buildSlyghtV5(fx) {
  const S = Object.assign({}, fx.S || {});
  if (fx.paidBills && !S.paidBills) S.paidBills = fx.paidBills;
  return { S, BILLS: fx.BILLS || [] };
}

test.describe('Bundle 30.5 helpers — captureState regression guards', () => {
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
    await page.waitForFunction(() => typeof BRAIN !== 'undefined'
      && BRAIN.transaction && BRAIN.transaction.recordWithAllocation, { timeout: 5000 });
    await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  });

  // Test 1 — sets the per-spec audit counter. Writes a txn so the in-page
  // audit log grows; captureState updates _lastAuditCount[SPEC_FILE] to a
  // non-zero value. Test 2 will then start with a fresh page where the
  // in-page log is back to its baseline.
  test('test 1 of 2 — primes stored audit counter via a write + capture', async ({ page }) => {
    const r = await page.evaluate(() => {
      return BRAIN.transaction.recordWithAllocation(
        { amt: 11, cat: 'Other', note: 'Counter-leak primer', direction: 'outflow' },
        BRAIN.SOURCES.LOG_EXPENSE
      );
    });
    expect(r.ok).toBe(true);

    const cap1 = await captureState(page, {
      label: 'test1-after-write',
      featurePath: 'BRAIN → TRANSACTION → RECORD_WITH_ALLOCATION',
      specFile: SPEC_FILE, specLine: 56,
      codeUnderTest: 'test 1: $11 outflow then capture — bumps stored counter',
      expectedState: 'audit_window has the test 1 write entries',
      clipTo: null,
    });
    // Sanity: this test's capture itself should see its own write entries
    expect(cap1.audit_window.length).toBeGreaterThan(0);
  });

  // Test 2 — proves the counter-leak fix. Fresh page → in-page audit log
  // baseline. Without the fix: stored counter from test 1 > 0, auditAll
  // length < stored → bug returns empty slice. With the fix: detect stale,
  // reset to 0, audit_window contains test 2's writes.
  test('test 2 of 2 — REGRESSION GUARD: audit_window populated despite test-1 counter leak', async ({ page }) => {
    // Trigger 2 writes so audit_window has multiple entries to find
    const wrote = await page.evaluate(() => {
      const r1 = BRAIN.transaction.recordWithAllocation(
        { amt: 77, cat: 'Other', note: 'Counter-leak probe A', direction: 'outflow' },
        BRAIN.SOURCES.LOG_EXPENSE
      );
      const r2 = BRAIN.transaction.recordWithAllocation(
        { amt: 33, cat: 'Other', note: 'Counter-leak probe B', direction: 'outflow' },
        BRAIN.SOURCES.LOG_EXPENSE
      );
      return { r1ok: r1.ok, r2ok: r2.ok };
    });
    expect(wrote.r1ok).toBe(true);
    expect(wrote.r2ok).toBe(true);

    const cap = await captureState(page, {
      label: 'test2-regression-guard',
      featurePath: 'BRAIN → TRANSACTION → RECORD_WITH_ALLOCATION',
      specFile: SPEC_FILE, specLine: 79,
      codeUnderTest: 'test 2: 2 writes ($77 + $33 outflows) then capture — audit_window must contain entries',
      expectedState: 'audit_window contains 4+ entries (2 txn_record + 2 balance_apply_delta from this test\'s writes). Empty would indicate the stale-counter bug returned.',
      clipTo: null,
      knownStateNotes: [
        {
          code: 'COUNTER_LEAK_REGRESSION_GUARD',
          description: 'This capture\'s audit_window must contain the test-2 writes (2 outflows × 2 audit entries each = 4 minimum). If empty, capture-state.js _lastAuditCount stale-detection reset was removed and the Phase B bug regressed.',
        },
      ],
    });

    // THE regression assertion — this is what locks the fix in place
    expect(cap.audit_window.length).toBeGreaterThanOrEqual(4);
    // Confirm the test-2 writes specifically are in the window (not just
    // any audit entries from boot/migration)
    const types = cap.audit_window.map(e => e && e.type);
    expect(types.filter(t => t === 'txn_record').length).toBeGreaterThanOrEqual(2);
    expect(types.filter(t => t === 'balance_apply_delta').length).toBeGreaterThanOrEqual(2);
  });
});
