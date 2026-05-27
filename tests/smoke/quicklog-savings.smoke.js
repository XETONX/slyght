// SLY-1 — Quick Log → Savings silently loses money.
//
// Why this exists: the 'savings' txn-type chip was wired into QUICK_TYPES +
// selectTxnType in Bundle 28 round 38, but quickLogTxn() never received the
// matching savings branch. Savings entries fell through to the generic expense
// path with NO bucket destination → S.bal decremented but no goal credited.
// Money was destroyed; the toast falsely confirmed success with a dash where
// the goal name should be (OPEN-BUGS #11).
//
// The fix adds a required goal-picker (#ql-goal-dest), populated for type=savings
// in selectTxnType, and a savings branch in quickLogTxn that routes through
// BRAIN.transaction.recordWithAllocation with a bucket destination — the same
// Phase 2.A path the round-up already uses. No new writer; canonical-writer-only.
//
// Invariants asserted (the spec IS the contract):
//   INV-02  bucket balance increments when an allocation records
//   INV-12  cash debit + bucket credit are atomic (conservation: no money lost)
//   INV-28  free-money gate refuses allocations exceeding availableNow (first
//           live Quick Log path to supply a bucket destination — DORMANT→active)
//   §8      no native confirm/alert — empty/refused saves surface via EDIT_MODAL
//
// The load-bearing regression assertion is CONSERVATION: bucketDelta === -balDelta.
// On the pre-fix code this was balDelta=-amt, bucketDelta=0 (money evaporated),
// so test A FAILS before the fix and PASSES after, independent of free-money state.
//
// Run:
//   npm run smoke
//   $env:SMOKE_BASE_URL="https://xetonx.github.io/slyght/?cb=<SHA>"; npm run smoke

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { captureState } = require('../helpers/capture-state');

const FIXTURE_PATH = path.resolve(__dirname, '../../state-snapshot.json');
const FROZEN_ISO = '2026-05-05T22:00:00+10:00';
const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
const SPEC_FILE = 'tests/smoke/quicklog-savings.smoke.js';

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

test.describe('SLY-1 — Quick Log Savings routes to a goal (no silent money loss)', () => {
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
      && BRAIN.transaction && BRAIN.transaction.recordWithAllocation
      && BRAIN.savings && BRAIN.savings.getBuckets, { timeout: 5000 });
    await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  });

  // ─── Wiring: the savings source tag is registered in BOTH lists ──────
  test('LOG_SAVINGS source is registered in SOURCES enum AND _SOURCE_SET', async ({ page }) => {
    const r = await page.evaluate(() => ({
      enumVal: BRAIN.SOURCES.LOG_SAVINGS,
      inSet: BRAIN._SOURCE_SET.has('log-savings'),
    }));
    // Both lists required — writers gate on _SOURCE_SET.has(source); a miss
    // rejects the first savings log at runtime (index.html:24601).
    expect(r.enumVal).toBe('log-savings');
    expect(r.inSet).toBe(true);
  });

  // ─── Field visibility: picker shows ONLY for savings ─────────────────
  test('goal picker shows for Savings type, hidden for others', async ({ page }) => {
    const r = await page.evaluate(() => {
      openQuickLogModal();
      const field = document.getElementById('ql-goal-field');
      const atOpen = field ? field.style.display : 'MISSING';
      // Drive the real chip handlers (the buttons render in openQuickLogModal).
      const savingsChip = document.querySelector('#ql-type-chips button[data-type="savings"]');
      const expenseChip = document.querySelector('#ql-type-chips button[data-type="expense"]');
      selectTxnType(savingsChip, 'savings');
      const sel = document.getElementById('ql-goal-dest');
      const onSavings = field.style.display;
      const optionCount = sel ? sel.options.length : -1;
      selectTxnType(expenseChip, 'expense');
      const onExpense = field.style.display;
      return { atOpen, onSavings, onExpense, optionCount, bucketCount: BRAIN.savings.getBuckets().length };
    });
    expect(r.atOpen).toBe('none');           // hidden at modal open (default expense)
    expect(r.onSavings).toBe('');            // shown when savings selected
    expect(r.onExpense).toBe('none');        // hidden again on switch away
    // populated: blank "Choose goal…" + one option per real bucket
    expect(r.optionCount).toBe(r.bucketCount + 1);
  });

  // ─── A. CONSERVATION — the bug fix (fail-before / pass-after) ────────
  test('INV-02 + INV-12: saving to a goal credits the goal and conserves money', async ({ page }) => {
    const result = await page.evaluate(() => {
      const buckets = BRAIN.savings.getBuckets();
      if (!buckets.length) return { skip: 'no-buckets-in-fixture' };
      const target = buckets[0];
      // Small amount to stay within free money so the happy path resolves;
      // the conservation assertion below holds regardless of the gate outcome.
      const amt = 40;
      const balBefore = S.bal;
      const bucketBefore = +((BRAIN.savings.getBucket(target.name) || {}).saved) || 0;
      const txnCountBefore = (S.txns || []).length;

      window.alert = () => {}; window.confirm = () => true;
      openQuickLogModal();
      selectTxnType(document.querySelector('#ql-type-chips button[data-type="savings"]'), 'savings');
      document.getElementById('ql-amt').value = String(amt);
      document.getElementById('ql-goal-dest').value = target.name;
      quickLogTxn();

      const bucketAfter = +((BRAIN.savings.getBucket(target.name) || {}).saved) || 0;
      const latest = (S.txns || [])[(S.txns || []).length - 1];
      // Source tags live in the AUDIT LOG, not on the txn object — record()
      // tags the txn_record audit entry, never stamps S.txns[].source (0 of
      // 212 real txns carry it; that's the architecture's convention per
      // CLAUDE.md "audit-log every dollar move with source"). Assert the tag
      // landed where it canonically lives, keyed to this txn's ts.
      const auditEntry = (S._auditLog || [])
        .filter(e => e.type === 'txn_record' && e.txnTs === (latest && latest.ts))
        .slice(-1)[0] || null;
      return {
        amt, targetName: target.name,
        balDelta: parseFloat((S.bal - balBefore).toFixed(2)),
        bucketDelta: parseFloat((bucketAfter - bucketBefore).toFixed(2)),
        txnCountDelta: (S.txns || []).length - txnCountBefore,
        latest: latest ? { cat: latest.cat, amt: latest.amt, _balAffected: latest._balAffected } : null,
        auditSource: auditEntry ? auditEntry.source : null,
      };
    });
    test.skip(result.skip === 'no-buckets-in-fixture', 'fixture has no savings buckets');

    // CONSERVATION (INV-12): money moves fully into the goal or not at all —
    // never evaporates. Pre-fix: balDelta=-40, bucketDelta=0 → assertion FAILS.
    expect(result.bucketDelta).toBe(-result.balDelta);

    // Happy path: with $40 inside free money the save lands fully.
    expect(result.balDelta).toBe(-result.amt);        // cash side (INV-02)
    expect(result.bucketDelta).toBe(result.amt);      // goal side (INV-02)
    expect(result.txnCountDelta).toBe(1);
    expect(result.latest).toBeTruthy();
    expect(result.latest.cat).toBe('Savings');
    expect(result.latest.amt).toBe(result.amt);
    expect(result.auditSource).toBe('log-savings'); // canonical source tag (audit log, not txn)
    expect(result.latest._balAffected).toBe(true);

    await captureState(page, {
      label: 'savings-credited-goal',
      featurePath: 'UI → GLOBAL → QUICK_LOG_MODAL → SAVINGS_BRANCH',
      specFile: SPEC_FILE, specLine: 130,
      codeUnderTest: 'openQuickLogModal → selectTxnType(savings) → quickLogTxn() with $40 to first bucket',
      expectedState: 'INV-02 + INV-12: S.bal -40 AND bucket.saved +40 atomically; one txn cat=Savings source=log-savings; conservation bucketDelta === -balDelta',
      clipTo: null,
    });
  });

  // ─── B. Empty goal → refuse, ZERO mutation (§8 openInfo, no alert) ───
  test('blank goal selection refuses the save with no money moved', async ({ page }) => {
    const result = await page.evaluate(() => {
      const balBefore = S.bal;
      const txnCountBefore = (S.txns || []).length;
      let nativeAlertFired = false;
      window.alert = () => { nativeAlertFired = true; };
      window.confirm = () => true;
      openQuickLogModal();
      selectTxnType(document.querySelector('#ql-type-chips button[data-type="savings"]'), 'savings');
      document.getElementById('ql-amt').value = '300';
      document.getElementById('ql-goal-dest').value = '';   // no goal chosen
      quickLogTxn();
      const editModalOpen = document.getElementById('edit-modal').classList.contains('open');
      return {
        balDelta: parseFloat((S.bal - balBefore).toFixed(2)),
        txnCountDelta: (S.txns || []).length - txnCountBefore,
        editModalOpen,
        nativeAlertFired,
      };
    });
    // Pre-fix: this fell through to the expense path → balDelta=-300, txn+1.
    expect(result.balDelta).toBe(0);
    expect(result.txnCountDelta).toBe(0);
    expect(result.editModalOpen).toBe(true);   // EDIT_MODAL.openInfo surfaced the block
    expect(result.nativeAlertFired).toBe(false); // §8 — no native alert in the flow

    await captureState(page, {
      label: 'savings-blank-goal-refused',
      featurePath: 'UI → GLOBAL → QUICK_LOG_MODAL → SAVINGS_BRANCH',
      specFile: SPEC_FILE, specLine: 165,
      codeUnderTest: 'quickLogTxn() type=savings with #ql-goal-dest empty',
      expectedState: 'no balance/txn mutation; EDIT_MODAL.openInfo("Choose a goal") shown; no native alert',
      clipTo: null,
    });
  });

  // ─── C. INV-28 free-money gate via the live Quick Log path ───────────
  test('INV-28: Quick Log savings above free money is refused, nothing moves', async ({ page }) => {
    const result = await page.evaluate(() => {
      const snap = BRAIN.plan.getSnapshot();
      const available = (snap && snap.derived && typeof snap.derived.availableNow === 'number')
        ? snap.derived.availableNow : null;
      if (typeof available !== 'number') return { skip: 'no-snapshot' };
      const buckets = BRAIN.savings.getBuckets();
      if (!buckets.length) return { skip: 'no-buckets' };
      const target = buckets[0];
      const balBefore = S.bal;
      const bucketBefore = +((BRAIN.savings.getBucket(target.name) || {}).saved) || 0;
      const askAmount = parseFloat((available + 1000).toFixed(2)); // $1000 over

      window.alert = () => {}; window.confirm = () => true;
      openQuickLogModal();
      selectTxnType(document.querySelector('#ql-type-chips button[data-type="savings"]'), 'savings');
      document.getElementById('ql-amt').value = String(askAmount);
      document.getElementById('ql-goal-dest').value = target.name;
      quickLogTxn();

      const bucketAfter = +((BRAIN.savings.getBucket(target.name) || {}).saved) || 0;
      const recentAudit = (S._auditLog || []).slice(-10);
      const refusal = recentAudit.find(e => e && e.type === 'inv28_refusal' && +e.requested === askAmount);
      return {
        available, askAmount,
        balDelta: parseFloat((S.bal - balBefore).toFixed(2)),
        bucketDelta: parseFloat((bucketAfter - bucketBefore).toFixed(2)),
        editModalOpen: document.getElementById('edit-modal').classList.contains('open'),
        refusalAuditEntry: refusal || null,
      };
    });
    test.skip(result.skip != null, 'fixture missing snapshot or buckets: ' + result.skip);

    expect(result.balDelta).toBe(0);            // money conserved on refusal
    expect(result.bucketDelta).toBe(0);
    expect(result.editModalOpen).toBe(true);    // refusal surfaced in plain English
    expect(result.refusalAuditEntry).toBeTruthy();
    expect(result.refusalAuditEntry.requested).toBe(result.askAmount);

    await captureState(page, {
      label: 'savings-inv28-refused-via-ui',
      featurePath: 'UI → GLOBAL → QUICK_LOG_MODAL → SAVINGS_BRANCH',
      specFile: SPEC_FILE, specLine: 205,
      codeUnderTest: 'quickLogTxn() type=savings with amt = availableNow + 1000',
      expectedState: 'INV-28: recordWithAllocation refuses (insufficient-free-money); S.bal + bucket unchanged; inv28_refusal audit entry; EDIT_MODAL.openInfo shown',
      clipTo: null,
      knownStateNotes: [
        {
          code: 'INV28_FIRST_LIVE_UI_SURFACE',
          description: 'SLY-1 makes Quick Log savings the first production UI path to supply a bucket destination, transitioning INV-28 from dormant (smoke-only) to live. This test exercises the refused path through the real handler, not a direct recordWithAllocation call.',
        },
      ],
    });
  });
});
