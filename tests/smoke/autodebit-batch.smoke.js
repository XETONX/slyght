// Bundle 31 Phase 3A — Item 16: batch auto-debit processor smoke.
//
// Why: pre-fix the autoDebit flag on bills had no scheduler. The flag set
// _scheduledAutoDebit:true in paidBills entries (suppressing the banner)
// but only when the user manually marked the bill paid. If user never
// marked, no txn was written and balance silently drifted.
//
// The Item 16 batch processor fires on boot, scans BILLS for autoDebit
// entries past their billDate in eligible cycles, and atomically writes
// txn + marks paid via BRAIN.bills.markPaid.
//
// Cycle-floor guard prevents reprocessing of cycles already reconciled
// (e.g. 2026-05-15 cycle was settled by 2026-05-19 ADHOC adjustment).
// S.autodebitProcessingStartTs holds the millisecond timestamp of the
// first cycle eligible for batch processing.
//
// Cases (6):
//   1. Bill in pre-floor cycle → SKIPPED with reason 'pre-floor'
//   2. Bill in eligible cycle, past today → PROCESSED
//   3. Bill in eligible cycle, future → SKIPPED with reason 'future'
//   4. Second batch run on same state → idempotent (already-paid)
//   5. Bill manually paid pre-debit-day → SKIPPED with reason 'already-paid'
//   6. First-boot init: floor=undefined → init from MODEL.paydayDate
//
// Run:
//   npm run smoke

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { captureState } = require('../helpers/capture-state');

const FIXTURE_PATH = path.resolve(__dirname, '../../state-snapshot.json');
const FROZEN_ISO = '2026-05-05T22:00:00+10:00';
const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
const SPEC_FILE = 'tests/smoke/autodebit-batch.smoke.js';

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

// Synthetic auto-debit bill spec. Caller controls `day`. The unique name
// suffix per test avoids cross-test pollution if the fixture leaks.
function makeAutoBill(day, suffix) {
  return {
    name: 'Bundle31 AutoDebit Test ' + suffix,
    amt: 25.50,
    day,
    tag: 'Subscription',
    recurring: true,
    autoDebit: true,
  };
}

test.describe('Bundle 31 Phase 3A — Batch auto-debit processor (Item 16)', () => {
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
      && BRAIN.bills && BRAIN.bills.processAutoDebits
      && BRAIN.SOURCES && BRAIN.SOURCES.AUTODEBIT_BATCH_LANDED, { timeout: 5000 });
    await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  });

  test('Case 1: bill in pre-floor cycle is skipped', async ({ page }) => {
    // Setup: floor is a FUTURE timestamp; synthetic bill's billDate falls
    // before it, in the current cycle. Bill must be past today AND past
    // floor to process; pre-floor short-circuit fires first.
    const result = await page.evaluate(({ bill }) => {
      const futureFloor = new Date('2026-06-15T00:00:00+10:00').getTime();
      S.autodebitProcessingStartTs = futureFloor;
      BILLS.push(bill);
      const r = BRAIN.bills.processAutoDebits(Date.now(), BRAIN.SOURCES.AUTODEBIT_BATCH_LANDED);
      return { r, floor: S.autodebitProcessingStartTs };
    }, { bill: makeAutoBill(3, 'preFloor') });

    expect(result.r.ok).toBe(true);
    expect(result.r.processed.length).toBe(0);
    const skipped = result.r.skipped.find(s => s.name && s.name.includes('preFloor'));
    expect(skipped, 'preFloor bill must appear in skipped list').toBeTruthy();
    expect(skipped.reason).toBe('pre-floor');

    await captureState(page, {
      label: 'case1-pre-floor-skip',
      featurePath: 'BRAIN → BILLS → PROCESS_AUTODEBITS',
      specFile: SPEC_FILE, specLine: 95,
      codeUnderTest: 'BRAIN.bills.processAutoDebits with floor in future + bill pre-floor',
      expectedState: `bill with day=3 (May 3 billDate) < floor (June 15) → skipped with reason 'pre-floor'`,
      clipTo: null,
    });
  });

  test('Case 2: bill in eligible cycle past today is processed', async ({ page }) => {
    // Setup: floor is in the PAST; synthetic bill day=3 → May 3 billDate
    // (within current cycle April 15-May 14, today=May 5). May 3 > floor
    // (Apr 1) AND May 3 < today (May 5) → eligible → process.
    //
    // Note: the fixture already has several real autoDebit:true bills that
    // are also eligible under this floor; we assert ONLY that the synthetic
    // is in the processed list and that the balance moved at LEAST by the
    // synthetic's amount (not exactly, since other bills also process).
    const result = await page.evaluate(({ bill }) => {
      const pastFloor = new Date('2026-04-01T00:00:00+10:00').getTime();
      S.autodebitProcessingStartTs = pastFloor;
      BILLS.push(bill);
      const balBefore = S.bal;
      const txnCountBefore = (S.txns || []).length;
      const r = BRAIN.bills.processAutoDebits(Date.now(), BRAIN.SOURCES.AUTODEBIT_BATCH_LANDED);
      return {
        r,
        balDelta: parseFloat((S.bal - balBefore).toFixed(2)),
        txnCountDelta: (S.txns || []).length - txnCountBefore,
      };
    }, { bill: makeAutoBill(3, 'eligible') });

    expect(result.r.ok).toBe(true);
    const processed = result.r.processed.find(p => p.name && p.name.includes('eligible'));
    expect(processed, 'eligible synthetic bill must appear in processed list').toBeTruthy();
    expect(processed.day).toBe(3);
    expect(processed.amt).toBe(25.50);
    // Balance must have decremented by AT LEAST the synthetic bill amount
    // (other fixture autoDebit bills also process, contributing more).
    expect(result.balDelta).toBeLessThanOrEqual(-25.50);
    // At least one txn appended (synthetic + any other fixture bills).
    expect(result.txnCountDelta).toBeGreaterThanOrEqual(1);

    await captureState(page, {
      label: 'case2-eligible-processed',
      featurePath: 'BRAIN → BILLS → PROCESS_AUTODEBITS',
      specFile: SPEC_FILE, specLine: 130,
      codeUnderTest: 'BRAIN.bills.processAutoDebits with past floor + eligible bill',
      expectedState: `synthetic day-3 bill present in processed list, balance decremented at least $25.50`,
      clipTo: null,
    });
  });

  test('Case 3: bill in eligible cycle but future date is skipped', async ({ page }) => {
    // Setup: floor in past; synthetic bill day=10 → May 10 billDate
    // (within current cycle, today=May 5). May 10 > today → future.
    // Fixture autoDebit bills can still process; we assert ONLY that the
    // synthetic future-dated bill is in skipped with reason 'future'.
    const result = await page.evaluate(({ bill }) => {
      const pastFloor = new Date('2026-04-01T00:00:00+10:00').getTime();
      S.autodebitProcessingStartTs = pastFloor;
      BILLS.push(bill);
      const r = BRAIN.bills.processAutoDebits(Date.now(), BRAIN.SOURCES.AUTODEBIT_BATCH_LANDED);
      return { r };
    }, { bill: makeAutoBill(10, 'future') });

    expect(result.r.ok).toBe(true);
    // Synthetic must NOT be in processed
    const synthInProcessed = result.r.processed.find(p => p.name && p.name.includes('future'));
    expect(synthInProcessed, 'future-dated synthetic must NOT be in processed').toBeFalsy();
    // Synthetic MUST be in skipped with reason 'future'
    const skipped = result.r.skipped.find(s => s.name && s.name.includes('future'));
    expect(skipped, 'future-dated synthetic must appear in skipped list').toBeTruthy();
    expect(skipped.reason).toBe('future');
  });

  test('Case 4: second run on same state is idempotent', async ({ page }) => {
    // First run processes the eligible bill, second run skips with
    // 'already-paid' because isThisMonthlyBillPaid returns truthy.
    const result = await page.evaluate(({ bill }) => {
      const pastFloor = new Date('2026-04-01T00:00:00+10:00').getTime();
      S.autodebitProcessingStartTs = pastFloor;
      BILLS.push(bill);
      const r1 = BRAIN.bills.processAutoDebits(Date.now(), BRAIN.SOURCES.AUTODEBIT_BATCH_LANDED);
      const balAfterFirst = S.bal;
      const txnCountAfterFirst = (S.txns || []).length;
      const r2 = BRAIN.bills.processAutoDebits(Date.now(), BRAIN.SOURCES.AUTODEBIT_BATCH_LANDED);
      return {
        r1, r2,
        balAfterFirst,
        balDeltaSecondRun: parseFloat((S.bal - balAfterFirst).toFixed(2)),
        txnDeltaSecondRun: (S.txns || []).length - txnCountAfterFirst,
      };
    }, { bill: makeAutoBill(3, 'idempotent') });

    // First run processed it
    expect(result.r1.processed.find(p => p.name.includes('idempotent'))).toBeTruthy();
    // Second run skipped with already-paid (NO new txn, NO balance change)
    expect(result.r2.processed.length).toBe(0);
    const skipped = result.r2.skipped.find(s => s.name && s.name.includes('idempotent'));
    expect(skipped, 'second run must skip the already-processed bill').toBeTruthy();
    expect(skipped.reason).toBe('already-paid');
    expect(result.balDeltaSecondRun).toBe(0);
    expect(result.txnDeltaSecondRun).toBe(0);
  });

  test('Case 5: bill manually paid pre-debit-day is skipped', async ({ page }) => {
    // User has front-run a manual mark-paid before the batch fires.
    // The batch must respect that and not double-write the synthetic.
    // (Other fixture autoDebit bills still process; we assert only that
    // the manually-paid synthetic specifically gets skipped.)
    const result = await page.evaluate(({ bill }) => {
      const pastFloor = new Date('2026-04-01T00:00:00+10:00').getTime();
      S.autodebitProcessingStartTs = pastFloor;
      BILLS.push(bill);
      // Pre-mark the bill paid via direct paidBills mutation (simulates
      // a prior user mark — the batch should respect it).
      S.paidBills = S.paidBills || {};
      // Key shape: YYYY-M-NAME-DAY (1-indexed month). Bill day=3 falls
      // in May (since day < payday=15). May = month 5.
      const key = '2026-5-' + bill.name + '-3';
      S.paidBills[key] = { paid: true, ts: Date.now() };
      const r = BRAIN.bills.processAutoDebits(Date.now(), BRAIN.SOURCES.AUTODEBIT_BATCH_LANDED);
      return { r };
    }, { bill: makeAutoBill(3, 'manuallyPaid') });

    // Synthetic must NOT be in processed (we pre-marked it paid)
    const synthInProcessed = result.r.processed.find(p => p.name && p.name.includes('manuallyPaid'));
    expect(synthInProcessed, 'manually-paid synthetic must NOT be re-processed').toBeFalsy();
    // Synthetic MUST be in skipped with reason 'already-paid'
    const skipped = result.r.skipped.find(s => s.name && s.name.includes('manuallyPaid'));
    expect(skipped, 'manually-paid synthetic must appear in skipped list').toBeTruthy();
    expect(skipped.reason).toBe('already-paid');
  });

  test('Case 6: first boot with no floor field initializes from MODEL.paydayDate', async ({ page }) => {
    // Simulate first deploy: S.autodebitProcessingStartTs is undefined.
    // Apply the boot-init logic. Assert: (a) field is set, (b) value
    // matches MODEL.paydayDate, (c) audit log records the init event,
    // (d) a subsequent processAutoDebits call honours the new floor.
    const result = await page.evaluate(() => {
      // Reset to first-deploy state
      delete S.autodebitProcessingStartTs;
      const auditLenBefore = (S._auditLog || []).length;

      // Replay the boot-init logic from index.html (DOMContentLoaded handler).
      if (S.autodebitProcessingStartTs == null
          && typeof MODEL !== 'undefined' && MODEL && MODEL.paydayDate
          && typeof BRAIN !== 'undefined' && BRAIN.audit) {
        S.autodebitProcessingStartTs = MODEL.paydayDate.getTime();
        BRAIN.audit.append({
          type: 'autodebit_floor_initialized',
          startTs: S.autodebitProcessingStartTs,
          startIso: new Date(S.autodebitProcessingStartTs).toISOString(),
          rationale: 'Bundle 31 Item 16 first-deploy (smoke replay)',
          ts: Date.now(),
        });
      }

      const auditLenAfter = (S._auditLog || []).length;
      const initEntry = (S._auditLog || []).find(e => e.type === 'autodebit_floor_initialized');
      return {
        floorAfterInit: S.autodebitProcessingStartTs,
        modelPaydayTs: MODEL.paydayDate.getTime(),
        modelPaydayIso: MODEL.paydayDate.toISOString(),
        auditEntryAppended: auditLenAfter - auditLenBefore,
        initEntry: initEntry ? { type: initEntry.type, startTs: initEntry.startTs, startIso: initEntry.startIso } : null,
      };
    });

    // (a) field is set
    expect(result.floorAfterInit).toBeDefined();
    expect(typeof result.floorAfterInit).toBe('number');
    // (b) value matches MODEL.paydayDate
    expect(result.floorAfterInit).toBe(result.modelPaydayTs);
    // (c) audit log records the init event. Bundle 31 fixture-refresh fix:
    // removed `auditEntryAppended >= 1` length-based check. S._auditLog
    // caps at 500 entries (index.html:19238); fixtures with audit logs
    // at-cap make every length-delta assertion fail even when the writer
    // correctly appends. `initEntry` content check below is cap-immune.
    expect(result.initEntry).not.toBeNull();
    expect(result.initEntry.type).toBe('autodebit_floor_initialized');
    expect(result.initEntry.startTs).toBe(result.modelPaydayTs);

    // (d) subsequent processAutoDebits honours the new floor.
    // Bundle 31 fixture-refresh fix: derive asOfTs FROM the just-initialized
    // floor, instead of hardcoding a date that assumes paydayReceived=false.
    // The pre-refresh fixture had paydayReceived=false → MODEL.paydayDate
    // landed at 2026-05-15 (current-month payday). The 2026-05-19 reconciled
    // fixture has paydayReceived=true → MODEL.paydayDate advances to
    // 2026-06-15 (next-month payday). Hardcoding asOfTs=June 1 broke when
    // the floor moved to June 15.
    //
    // Robust pattern: asOfTs = floor + 60 days. Always lands one full
    // cycle past the floor, regardless of which payday the floor is. Bill
    // day=20 (>= payday=15) falls in the cycle's start month, so
    // billDate = floor + (~30-50 days) which is > floor AND < asOfTs.
    const asOfTs = result.floorAfterInit + 60 * 86400000;
    const followup = await page.evaluate(({ bill, asOfTs }) => {
      BILLS.push(bill);
      const r = BRAIN.bills.processAutoDebits(asOfTs, BRAIN.SOURCES.AUTODEBIT_BATCH_LANDED);
      return r;
    }, { bill: makeAutoBill(20, 'postFloorCase6'), asOfTs });

    const processed = followup.processed.find(p => p.name && p.name.includes('postFloorCase6'));
    expect(processed, `day-20 bill must process when asOfTs is 60d past floor (${new Date(asOfTs).toISOString()}) and floor is ${new Date(result.floorAfterInit).toISOString()}`).toBeTruthy();
  });
});
