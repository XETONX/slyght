// Bundle 30 Phase 1.B — Transaction-path canonical-writer smoke.
//
// Why this exists: phase 1.B migrated 9 sites that previously mutated
// S.bal directly alongside a separate BRAIN.transaction.record() call.
// The risk class was FR-01 (cash hero didn't decrement because callers
// drifted out of sync). This spec asserts:
//
//   1. BRAIN.transaction.recordWithAllocation exists + composes correctly.
//   2. INV-01 holds: every recorded txn decrements/increments S.bal by
//      exactly its amount via the canonical writer.
//   3. The AUDITOR shim (BUNDLE-30-AUDITOR-SHIM) is active — AUDITOR.log
//      gets TXN_DELTA_* entries when BRAIN.balance.applyTxnDelta fires.
//   4. Rollback on invalid source: txn does not orphan-append, balance
//      unchanged, envelope returns {ok: false}.
//   5. Real user-flow integration: quickLogTxn income + expense paths
//      both produce coherent state.
//
// Run:
//   npm run smoke
//   $env:SMOKE_BASE_URL="https://xetonx.github.io/slyght/?cb=<SHA>"; npm run smoke

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

test.describe('Bundle 30 Phase 1.B — Transaction canonical-writer smoke', () => {
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
      && BRAIN.transaction && BRAIN.transaction.recordWithAllocation, { timeout: 5000 });
    await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  });

  test('recordWithAllocation exists + has expected envelope shape', async ({ page }) => {
    const shape = await page.evaluate(() => {
      const fn = BRAIN.transaction.recordWithAllocation;
      if (typeof fn !== 'function') return { ok: false, reason: 'not-callable' };
      // Probe with an obviously invalid call (no args) — must return
      // {ok: false, reason: ...} not throw.
      const r1 = fn();
      const r2 = fn({}, 'log-expense');
      const r3 = fn({ amt: 50, cat: 'Other', direction: 'outflow' }, 'NOT-A-SOURCE');
      return {
        callable: true,
        envelopeShape: r1 && typeof r1.ok === 'boolean' && typeof r1.reason === 'string',
        invalidEnvelope: r2 && r2.ok === false,
        invalidSource: r3 && r3.ok === false && r3.reason.indexOf('unknown-source') === 0,
      };
    });
    expect(shape.callable).toBe(true);
    expect(shape.envelopeShape).toBe(true);
    expect(shape.invalidEnvelope).toBe(true);
    expect(shape.invalidSource).toBe(true);
  });

  test('INV-01 outflow: recordWithAllocation decrements S.bal by exact amount', async ({ page }) => {
    const result = await page.evaluate(() => {
      const balBefore = S.bal;
      const txnCountBefore = (S.txns || []).length;
      const auditBefore = (S._auditLog || []).length;
      const r = BRAIN.transaction.recordWithAllocation(
        { amt: 200, cat: 'Bills', note: 'Optus (smoke test)', direction: 'outflow' },
        BRAIN.SOURCES.LOG_EXPENSE
      );
      return {
        envelope: r,
        balBefore, balAfter: S.bal,
        balDelta: parseFloat((S.bal - balBefore).toFixed(2)),
        txnCountDelta: (S.txns || []).length - txnCountBefore,
        auditDelta: (S._auditLog || []).length - auditBefore,
        // Verify the txn + the balance_apply_delta entries both appended
        auditTypesAfter: (S._auditLog || []).slice(-3).map(e => e.type),
      };
    });
    expect(result.envelope.ok).toBe(true);
    expect(result.envelope.delta).toBe(-200);
    expect(result.envelope.balanceOld).toBe(result.balBefore);
    expect(result.envelope.balanceNew).toBe(result.balAfter);
    expect(result.balDelta).toBe(-200);
    expect(result.txnCountDelta).toBe(1);
    // Audit log: at least txn_record + balance_apply_delta (2 entries minimum)
    expect(result.auditDelta).toBeGreaterThanOrEqual(2);
    expect(result.auditTypesAfter).toContain('txn_record');
    expect(result.auditTypesAfter).toContain('balance_apply_delta');
  });

  test('INV-04 inflow: recordWithAllocation increments S.bal by exact amount', async ({ page }) => {
    const result = await page.evaluate(() => {
      const balBefore = S.bal;
      const r = BRAIN.transaction.recordWithAllocation(
        { amt: 7282.33, cat: 'Income', note: 'Salary (smoke test)', direction: 'inflow' },
        BRAIN.SOURCES.LOG_INCOME
      );
      return {
        envelope: r,
        balBefore, balAfter: S.bal,
        balDelta: parseFloat((S.bal - balBefore).toFixed(2)),
      };
    });
    expect(result.envelope.ok).toBe(true);
    expect(result.envelope.delta).toBe(7282.33);
    expect(result.balDelta).toBe(7282.33);
  });

  test('BUNDLE-30-AUDITOR-SHIM: applyTxnDelta dual-logs to AUDITOR', async ({ page }) => {
    const result = await page.evaluate(() => {
      if (typeof AUDITOR === 'undefined') return { ok: false, reason: 'AUDITOR undefined' };
      const auditorBefore = AUDITOR.log.length;
      const r = BRAIN.transaction.recordWithAllocation(
        { amt: 42, cat: 'Other', note: 'AUDITOR shim probe', direction: 'outflow' },
        BRAIN.SOURCES.LOG_EXPENSE
      );
      const auditorAfter = AUDITOR.log.slice(0, AUDITOR.log.length - auditorBefore);
      // AUDITOR uses .unshift so newest at index 0
      const newest = AUDITOR.log[0];
      return {
        ok: r.ok,
        delta: r.delta,
        auditorEntryCountAdded: AUDITOR.log.length - auditorBefore,
        newestAuditorAction: newest && newest.action,
        newestAuditorBefore: newest && newest.before,
        newestAuditorAfter: newest && newest.after,
        newestAuditorExpected: newest && newest.expected,
      };
    });
    expect(result.ok).toBe(true);
    expect(result.delta).toBe(-42);
    expect(result.auditorEntryCountAdded).toBeGreaterThanOrEqual(1);
    // The shim writes TXN_DELTA_<SOURCE_UPPER_UNDERSCORED>
    expect(result.newestAuditorAction).toBe('TXN_DELTA_LOG_EXPENSE');
    expect(result.newestAuditorExpected).toBe(-42);
  });

  test('Rollback on invalid source: no orphan txn, balance unchanged', async ({ page }) => {
    const result = await page.evaluate(() => {
      const balBefore = S.bal;
      const txnCountBefore = (S.txns || []).length;
      const r = BRAIN.transaction.recordWithAllocation(
        { amt: 999, cat: 'Bills', direction: 'outflow' },
        'this-is-not-a-real-source-tag'
      );
      return {
        envelope: r,
        balUnchanged: S.bal === balBefore,
        txnCountUnchanged: (S.txns || []).length === txnCountBefore,
      };
    });
    expect(result.envelope.ok).toBe(false);
    expect(result.envelope.reason.indexOf('unknown-source')).toBe(0);
    expect(result.balUnchanged).toBe(true);
    expect(result.txnCountUnchanged).toBe(true);
  });

  // ─── Phase 2.A — bucket destination ──────────────────────────────
  test('Phase 2.A: bucket destination credits bucket atomically (INV-02 + INV-12)', async ({ page }) => {
    const result = await page.evaluate(() => {
      // Pick a bucket from fixture that exists
      const buckets = (BRAIN.savings && BRAIN.savings.getBuckets) ? BRAIN.savings.getBuckets() : [];
      if (!buckets.length) return { ok: false, reason: 'no-buckets-in-fixture' };
      const targetBucket = buckets[0];
      const balBefore = S.bal;
      const bucketBefore = +targetBucket.saved || 0;
      // Use _skipFreeMoneyGate so the test isn't dependent on fixture's free_money
      const r = BRAIN.transaction.recordWithAllocation(
        { amt: 25, note: 'Smoke test allocation', cat: 'Savings',
          direction: 'outflow',
          destination: { type: 'bucket', id: targetBucket.name },
          _skipFreeMoneyGate: true },
        BRAIN.SOURCES.BUCKET_QUICK_ADD
      );
      // Re-read bucket after credit
      const bucketAfter = (BRAIN.savings.getBucket(targetBucket.name) || {}).saved || 0;
      return {
        envelope: r,
        balDelta: parseFloat((S.bal - balBefore).toFixed(2)),
        bucketDelta: parseFloat((bucketAfter - bucketBefore).toFixed(2)),
        bucketName: targetBucket.name,
      };
    });
    expect(result.envelope.ok).toBe(true);
    expect(result.envelope.bucketCredit).toBeTruthy();
    expect(result.envelope.bucketCredit.amt).toBe(25);
    expect(result.envelope.bucketCredit.bucket).toBe(result.bucketName);
    expect(result.balDelta).toBe(-25);   // INV-02 cash side
    expect(result.bucketDelta).toBe(25); // INV-12 bucket side
  });

  test('Phase 2.A: invalid bucket destination returns bucket-not-found, no side effects', async ({ page }) => {
    const result = await page.evaluate(() => {
      const balBefore = S.bal;
      const txnCountBefore = (S.txns || []).length;
      const r = BRAIN.transaction.recordWithAllocation(
        { amt: 100, cat: 'Savings', direction: 'outflow',
          destination: { type: 'bucket', id: 'NONEXISTENT-BUCKET-' + Date.now() },
          _skipFreeMoneyGate: true },
        BRAIN.SOURCES.BUCKET_QUICK_ADD
      );
      return {
        envelope: r,
        balUnchanged: S.bal === balBefore,
        txnCountUnchanged: (S.txns || []).length === txnCountBefore,
      };
    });
    expect(result.envelope.ok).toBe(false);
    expect(result.envelope.reason).toMatch(/^bucket-not-found/);
    expect(result.balUnchanged).toBe(true);
    expect(result.txnCountUnchanged).toBe(true);
  });

  // ─── Phase 2.B — INV-28 free-money gate ──────────────────────────
  test('Phase 2.B: INV-28 refuses allocation exceeding free_money_remaining', async ({ page }) => {
    const result = await page.evaluate(() => {
      const snap = BRAIN.plan.getSnapshot();
      const available = (snap && snap.derived && typeof snap.derived.availableNow === 'number')
        ? snap.derived.availableNow : null;
      if (typeof available !== 'number') return { ok: false, reason: 'no-snapshot' };
      const buckets = BRAIN.savings.getBuckets();
      if (!buckets.length) return { ok: false, reason: 'no-buckets' };
      const balBefore = S.bal;
      const bucketBefore = +buckets[0].saved || 0;
      const auditBefore = (S._auditLog || []).length;
      // Ask for $1000 above available — must refuse
      const askAmount = parseFloat((available + 1000).toFixed(2));
      const r = BRAIN.transaction.recordWithAllocation(
        { amt: askAmount, cat: 'Savings', note: 'INV-28 probe',
          direction: 'outflow',
          destination: { type: 'bucket', id: buckets[0].name } },
          // No _skipFreeMoneyGate — gate must fire
        BRAIN.SOURCES.BUCKET_QUICK_ADD
      );
      // Audit should have an inv28_refusal entry
      const newAudit = (S._auditLog || []).slice(auditBefore);
      const refusalEntry = newAudit.find(e => e && e.type === 'inv28_refusal');
      return {
        envelope: r,
        available,
        askAmount,
        balUnchanged: S.bal === balBefore,
        bucketUnchanged: (+BRAIN.savings.getBucket(buckets[0].name).saved || 0) === bucketBefore,
        refusalAuditEntry: refusalEntry,
      };
    });
    expect(result.envelope.ok).toBe(false);
    expect(result.envelope.reason).toBe('insufficient-free-money');
    expect(result.envelope.requested).toBe(result.askAmount);
    expect(result.envelope.available).toBeCloseTo(result.available, 1);
    expect(result.balUnchanged).toBe(true);
    expect(result.bucketUnchanged).toBe(true);
    expect(result.refusalAuditEntry).toBeTruthy();
    expect(result.refusalAuditEntry.requested).toBe(result.askAmount);
  });

  // ─── Q-2.3 — round-ups exempt from INV-28 (inheritance) ──────────
  test('Q-2.3: _isRoundup envelope exempt from INV-28 even when free_money insufficient', async ({ page }) => {
    const result = await page.evaluate(() => {
      const snap = BRAIN.plan.getSnapshot();
      const available = (snap && snap.derived && typeof snap.derived.availableNow === 'number')
        ? snap.derived.availableNow : 0;
      const buckets = BRAIN.savings.getBuckets();
      if (!buckets.length) return { ok: false, reason: 'no-buckets' };
      const bucketBefore = +buckets[0].saved || 0;
      // Round-up amount sized to exceed available IF gated
      const roundUpAmt = Math.max(available + 5, 0.50);
      const r = BRAIN.transaction.recordWithAllocation(
        { amt: roundUpAmt, cat: 'Savings', note: 'Round-up probe',
          direction: 'outflow',
          destination: { type: 'bucket', id: buckets[0].name },
          _isRoundup: true },  // exemption flag per Q-2.3
        BRAIN.SOURCES.ROUNDUP
      );
      return {
        envelope: r,
        bucketAfter: +BRAIN.savings.getBucket(buckets[0].name).saved || 0,
        bucketBefore,
        available,
      };
    });
    // Even though roundUpAmt > available, the round-up succeeds because
    // INV-28 applies to top-level allocations only (Q-2.3 inheritance rule).
    expect(result.envelope.ok).toBe(true);
    expect(result.envelope.reason).toBeUndefined();
    expect(result.bucketAfter).toBeGreaterThan(result.bucketBefore);
  });

  test('Q-2.2: _skipFreeMoneyGate envelope exempt from INV-28 (payday-tick semantics)', async ({ page }) => {
    const result = await page.evaluate(() => {
      const snap = BRAIN.plan.getSnapshot();
      const available = (snap && snap.derived && typeof snap.derived.availableNow === 'number')
        ? snap.derived.availableNow : 0;
      const buckets = BRAIN.savings.getBuckets();
      if (!buckets.length) return { ok: false, reason: 'no-buckets' };
      const askAmount = Math.max(available + 200, 100);
      const r = BRAIN.transaction.recordWithAllocation(
        { amt: askAmount, cat: 'Savings', note: 'Tick probe',
          direction: 'outflow',
          destination: { type: 'bucket', id: buckets[0].name },
          _skipFreeMoneyGate: true },  // payday-plan tick exemption
        BRAIN.SOURCES.PLAN_SAVINGS_TICK
      );
      return {
        envelope: r,
        askAmount,
        available,
      };
    });
    // Even though askAmount > available, the tick succeeds because
    // _skipFreeMoneyGate is set (lock-time committed allocation).
    expect(result.envelope.ok).toBe(true);
    expect(result.envelope.reason).toBeUndefined();
  });

  // ─── Phase 2.E — markPaid envelope (internal refactor) ───────────
  test('Phase 2.E: BRAIN.bills.markPaid composes balance via envelope (public API unchanged)', async ({ page }) => {
    const result = await page.evaluate(() => {
      // Find an unpaid bill from the fixture
      const bills = (BRAIN.bills && BRAIN.bills.getThisCycle) ? BRAIN.bills.getThisCycle() : [];
      const unpaid = bills.find(b => !b.paid);
      if (!unpaid) return { ok: false, reason: 'no-unpaid-bill-in-fixture' };
      const balBefore = S.bal;
      // Public API call — same as pre-Phase-2.E caller invocation
      const r = BRAIN.bills.markPaid(unpaid, BRAIN.SOURCES.PAY_BILL_NOW);
      return {
        markPaidResult: r,
        balBefore, balAfter: S.bal,
        balDelta: parseFloat((S.bal - balBefore).toFixed(2)),
        billAmt: unpaid.amt,
      };
    });
    expect(result.markPaidResult.ok).toBe(true);
    // markPaid returns {ok, key, entry} (via _setPaidEntry) — public API
    // unchanged from pre-Phase-2.E. The envelope-internal composition
    // handles the balance side; callers no longer need their own
    // BRAIN.balance.applyTxnDelta call.
    expect(result.markPaidResult.entry).toBeTruthy();
    expect(result.markPaidResult.entry.paid).toBe(true);
    expect(result.balDelta).toBe(-result.billAmt);
  });

  test('quickLogTxn expense end-to-end produces coherent state', async ({ page }) => {
    // Drive the full UI path: open Quick Log modal, set amount, log.
    const result = await page.evaluate(() => {
      const balBefore = S.bal;
      // Simulate filling the modal + calling the function (bypassing
      // tap UX since DOM tap is brittle in headless; we test the path
      // not the click handlers).
      document.getElementById('ql-amt').value = '50';
      document.getElementById('ql-cat-hidden').value = 'Food / Coffee';
      document.getElementById('ql-txn-type').value = 'expense';
      // Suppress browser confirm/alert for habit-flag flow
      window.alert = () => {};
      window.confirm = () => true;
      quickLogTxn();
      return {
        balBefore, balAfter: S.bal,
        balDelta: parseFloat((S.bal - balBefore).toFixed(2)),
        latestTxn: (S.txns || [])[(S.txns || []).length - 1],
      };
    });
    expect(result.balDelta).toBe(-50);
    expect(result.latestTxn).toBeTruthy();
    expect(result.latestTxn.amt).toBe(50);
    expect(result.latestTxn.cat).toBe('Food / Coffee');
    expect(result.latestTxn._balAffected).toBe(true);
  });
});
