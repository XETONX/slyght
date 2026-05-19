// Bundle 33.x — INV-27 negative balance write-time guard smoke.
//
// Why: pre-fix, BRAIN.transaction.recordWithAllocation would silently accept
// an outflow that drove S.bal negative. User would only discover the over-
// draw on the next dashboard render (or AFTER another txn). INV-27 closes
// this by refusing such writes unless the caller has explicitly armed
// BRAIN.balance.confirmNegativeOverride() within the last 30 seconds OR
// passed envelope._overrideNegativeWarn: true (opt-in flag for callers
// that handle the warning themselves).
//
// 5 cases asserted:
//   1. Refusal: outflow that overdraws WITHOUT confirmation → ok:false,
//      reason:'negative-warning-required', state unchanged, audit log
//      has inv27_refusal entry.
//   2. Confirm-then-retry: arm via confirmNegativeOverride(), retry with
//      _overrideNegativeWarn:true → ok:true, balance lands negative,
//      audit log carries BALANCE_NEGATIVE_CONFIRMED source on arm + txn.
//   3. Inflow exempt: income txns always succeed regardless of starting
//      balance — no INV-27 gate on inflows.
//   4. Boundary: S.bal=$0.01 outflow $0.02 — refused (negative-warning).
//      Confirm + retry succeeds.
//   5. TTL: arm via confirmNegativeOverride(), advance clock past 30s,
//      retry without re-arming → refused (stale token detected).
//      Audit log carries balance_negative_override_stale entry.
//
// Run: npm run smoke

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const FIXTURE_PATH = path.resolve(__dirname, '../../state-snapshot.json');
const FROZEN_ISO = '2026-05-05T22:00:00+10:00';
const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

function buildSlyghtV5(fx, overrides = {}) {
  const S = Object.assign({}, fx.S || {}, overrides);
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

async function setup(page, context, seedOverrides = {}) {
  await page.clock.install({ time: new Date(FROZEN_ISO) });
  await context.addInitScript((args) => {
    try { localStorage.setItem('slyght_v5', JSON.stringify(args.seed)); } catch (_) {}
    try { localStorage.setItem('slyght_seeded_v13', '1'); } catch (_) {}
    try { localStorage.setItem('slyght_seeded_v12', '1'); } catch (_) {}
    try { localStorage.setItem('slyght_seeded_v11', '1'); } catch (_) {}
    try { localStorage.setItem('slyght_bills_reset_month', args.monthKey); } catch (_) {}
  }, { seed: buildSlyghtV5(fixture, seedOverrides), monthKey: '2026-5' });

  await page.goto(process.env.SMOKE_BASE_URL || '/');
  await page.addStyleTag({ content: SETTLE_CSS });
  await page.waitForFunction(() => typeof BRAIN !== 'undefined'
    && BRAIN.transaction && BRAIN.transaction.recordWithAllocation
    && BRAIN.balance && typeof BRAIN.balance.confirmNegativeOverride === 'function'
    && BRAIN.SOURCES && BRAIN.SOURCES.BALANCE_NEGATIVE_CONFIRMED
    && BRAIN.SOURCES.LOG_EXPENSE && BRAIN.SOURCES.LOG_INCOME, { timeout: 5000 });
  await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page.evaluate(() => {
    const modal = document.getElementById('eod-recon-modal');
    if (modal && modal.classList.contains('open') && typeof eodReconAccept === 'function') eodReconAccept();
  });
  // Force S.bal to a known low value so probe outflows go negative
  await page.evaluate(() => { S.bal = 50; });
}

test.describe('Bundle 33.x — INV-27 negative balance write-time guard', () => {
  test('Case 1: outflow that overdraws without confirmation is refused; state unchanged', async ({ page, context }) => {
    await setup(page, context);
    const result = await page.evaluate(() => {
      const balBefore = S.bal;
      const txnsBefore = (S.txns || []).length;
      const auditBefore = (S._auditLog || []).length;
      const r = BRAIN.transaction.recordWithAllocation(
        { amt: 100, cat: 'Food / Coffee', direction: 'outflow', note: 'INV-27 case 1 overdraw' },
        BRAIN.SOURCES.LOG_EXPENSE
      );
      return {
        r,
        balBefore, balAfter: S.bal,
        txnsBefore, txnsAfter: (S.txns || []).length,
        auditBefore, auditAfter: (S._auditLog || []).length,
        recentAuditTypes: (S._auditLog || []).slice(-3).map(e => e && e.type),
      };
    });
    expect(result.r.ok).toBe(false);
    expect(result.r.reason).toBe('negative-warning-required');
    expect(result.r.shortfall).toBeCloseTo(50, 2);
    expect(result.balAfter).toBe(result.balBefore);
    expect(result.txnsAfter).toBe(result.txnsBefore);
    expect(result.recentAuditTypes).toContain('inv27_refusal');
  });

  test('Case 2: confirm-then-retry with _overrideNegativeWarn succeeds; audit logs arm + txn', async ({ page, context }) => {
    await setup(page, context);
    const result = await page.evaluate(() => {
      const balBefore = S.bal;
      // Step A: arm the override token
      BRAIN.balance.confirmNegativeOverride();
      // Step B: retry the call with the opt-in flag
      const r = BRAIN.transaction.recordWithAllocation(
        { amt: 100, cat: 'Food / Coffee', direction: 'outflow', note: 'INV-27 case 2 retry', _overrideNegativeWarn: true },
        BRAIN.SOURCES.LOG_EXPENSE
      );
      const armEntry = (S._auditLog || []).find(e => e && e.type === 'balance_negative_override_armed');
      return {
        r,
        balBefore, balAfter: S.bal,
        lastTxn: (S.txns || []).slice(-1)[0],
        hasArmEntry: !!armEntry,
        armSource: armEntry && armEntry.source,
        tokenStillArmed: BRAIN.balance._negativeOverrideArmedAt > 0,
      };
    });
    expect(result.r.ok).toBe(true);
    expect(result.balAfter).toBeCloseTo(-50, 2);
    expect(result.lastTxn.amt).toBeCloseTo(100, 2);
    expect(result.hasArmEntry).toBe(true);
    expect(result.armSource).toBe('balance-negative-confirmed');
    // Token consumed on use
    expect(result.tokenStillArmed).toBe(false);
  });

  test('Case 3: inflow always succeeds regardless of starting balance (no INV-27 gate)', async ({ page, context }) => {
    await setup(page, context);
    const result = await page.evaluate(() => {
      S.bal = -200;  // start already negative
      const balBefore = S.bal;
      const r = BRAIN.transaction.recordWithAllocation(
        { amt: 1000, cat: 'Income', direction: 'inflow', note: 'INV-27 case 3 inflow' },
        BRAIN.SOURCES.LOG_INCOME
      );
      return { r, balBefore, balAfter: S.bal };
    });
    expect(result.r.ok).toBe(true);
    expect(result.balAfter).toBeCloseTo(800, 2);
  });

  test('Case 4: boundary — $0.01 balance, $0.02 outflow → refused; then confirm + retry succeeds', async ({ page, context }) => {
    await setup(page, context);
    const result = await page.evaluate(() => {
      S.bal = 0.01;
      const r1 = BRAIN.transaction.recordWithAllocation(
        { amt: 0.02, cat: 'Food / Coffee', direction: 'outflow', note: 'INV-27 case 4 boundary refusal' },
        BRAIN.SOURCES.LOG_EXPENSE
      );
      // Now confirm + retry
      BRAIN.balance.confirmNegativeOverride();
      const r2 = BRAIN.transaction.recordWithAllocation(
        { amt: 0.02, cat: 'Food / Coffee', direction: 'outflow', note: 'INV-27 case 4 boundary retry', _overrideNegativeWarn: true },
        BRAIN.SOURCES.LOG_EXPENSE
      );
      return { r1, r2, balFinal: S.bal };
    });
    expect(result.r1.ok).toBe(false);
    expect(result.r1.reason).toBe('negative-warning-required');
    expect(result.r2.ok).toBe(true);
    expect(result.balFinal).toBeCloseTo(-0.01, 2);
  });

  test('Case 5: TTL — confirmation token expires after 30s; retry refused (stale)', async ({ page, context }) => {
    await setup(page, context);
    const result = await page.evaluate(async () => {
      const TTL = BRAIN.balance._NEGATIVE_OVERRIDE_TTL_MS;
      // Step A: arm
      BRAIN.balance.confirmNegativeOverride();
      // Step B: spoof clock advance — we can't really wait 30s in a test; we
      // manipulate the armed-at timestamp to simulate aging past TTL.
      BRAIN.balance._negativeOverrideArmedAt = Date.now() - (TTL + 5000);
      // Step C: retry — should refuse because token stale
      const r = BRAIN.transaction.recordWithAllocation(
        { amt: 100, cat: 'Food / Coffee', direction: 'outflow', note: 'INV-27 case 5 stale token', _overrideNegativeWarn: true },
        BRAIN.SOURCES.LOG_EXPENSE
      );
      const staleEntry = (S._auditLog || []).find(e => e && e.type === 'balance_negative_override_stale');
      return {
        r,
        balFinal: S.bal,
        hasStaleEntry: !!staleEntry,
        staleAgeMs: staleEntry && staleEntry.ageMs,
        ttlMs: TTL,
      };
    });
    expect(result.r.ok).toBe(false);
    expect(result.r.reason).toBe('negative-warning-required');
    expect(result.balFinal).toBe(50); // unchanged from setup
    expect(result.hasStaleEntry).toBe(true);
    expect(result.staleAgeMs).toBeGreaterThan(result.ttlMs);
  });
});
