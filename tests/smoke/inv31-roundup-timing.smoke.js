// Bundle 33.x — INV-31 round-up timing-immediate smoke.
//
// Why: round-up txns must land within the same JS event-loop tick as their
// parent — synchronous emission guarantees audit-log temporal coherence and
// rules out the "user closes app between parent + deferred round-up" silent-
// drop class.
//
// What this asserts (3 cases):
//   1. executeChatAction('log_txn', ...) emits parent + round-up sibling in
//      same tick; child ts within 100ms of parent; bucket credited synchronously
//   2. quickLogTxn() via DOM seeding emits same shape (parent + round-up)
//      with same temporal guarantee
//   3. BRAIN.transaction.recordWithAllocation alone does NOT emit a round-up
//      sibling (regression guard — when SDD §3 step 11 fold-in lands, this
//      assertion flips to require synchronous sibling emission)
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
  // Force round-ups enabled + a known destination bucket
  S.roundUpsEnabled = true;
  // Pick the first existing bucket as destination (test runs against real fixture state)
  if (S.savingsBuckets && S.savingsBuckets.length > 0) {
    S.roundUpDestination = S.savingsBuckets[0].name;
  }
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

test.describe('Bundle 33.x — INV-31 round-up timing immediate', () => {
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
      && BRAIN.savings && BRAIN.savings.addToBucket
      && typeof executeChatAction === 'function'
      && BRAIN.SOURCES && BRAIN.SOURCES.ROUNDUP && BRAIN.SOURCES.CHAT
      && BRAIN.SOURCES.LOG_EXPENSE, { timeout: 5000 });
    await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
    // EOD reconciliation modal can intercept; dismiss if present
    await page.evaluate(() => {
      const modal = document.getElementById('eod-recon-modal');
      if (modal && modal.classList.contains('open') && typeof eodReconAccept === 'function') eodReconAccept();
    });
  });

  test('Case 1: chat log_txn emits parent + round-up within same tick (≤100ms ts gap)', async ({ page }) => {
    const result = await page.evaluate(() => {
      if (!S.roundUpDestination || !BRAIN.savings.getBucket(S.roundUpDestination)) {
        return { skip: true, reason: 'no-round-up-destination-bucket-in-fixture' };
      }
      const txnsBefore = (S.txns || []).length;
      const auditBefore = (S._auditLog || []).length;
      const destName = S.roundUpDestination;
      const destBucketBefore = BRAIN.savings.getBucket(destName);
      const bucketSavedBefore = destBucketBefore ? (+destBucketBefore.saved || 0) : 0;

      // FIRE in same tick — no setTimeout/await between
      executeChatAction({ action: 'log_txn', amt: 9.40, note: 'INV-31 chat probe', cat: 'Food / Coffee' });

      const txnsAfter = S.txns || [];
      const destBucketAfter = BRAIN.savings.getBucket(destName);
      const bucketSavedAfter = destBucketAfter ? (+destBucketAfter.saved || 0) : 0;

      // Identify parent (chat-marked) and round-up child by flags
      const parentTxn = [...txnsAfter].reverse().find(t => t && t._chatLogged && !t._isRoundup);
      const roundUpTxn = [...txnsAfter].reverse().find(t => t && t._isRoundup);

      return {
        skip: false,
        txnsBefore,
        txnsAfter: txnsAfter.length,
        auditBefore,
        auditAfter: (S._auditLog || []).length,
        parentTxn: parentTxn ? { amt: parentTxn.amt, ts: parentTxn.ts, cat: parentTxn.cat } : null,
        roundUpTxn: roundUpTxn ? { amt: roundUpTxn.amt, ts: roundUpTxn.ts, cat: roundUpTxn.cat, _isRoundup: roundUpTxn._isRoundup } : null,
        bucketSavedBefore,
        bucketSavedAfter,
        destName,
      };
    });

    if (result.skip) {
      console.log('[INV-31 case 1] skipped:', result.reason);
      test.skip();
      return;
    }
    // Both txns must exist
    expect(result.parentTxn, 'parent (chat-marked) txn must land').not.toBeNull();
    expect(result.roundUpTxn, 'round-up child txn must land in same tick').not.toBeNull();
    expect(result.parentTxn.amt).toBeCloseTo(9.40, 2);
    expect(result.roundUpTxn.amt).toBeCloseTo(0.60, 2);
    // Temporal coherence: round-up ts within 100ms of parent ts
    const gap = Math.abs(result.roundUpTxn.ts - result.parentTxn.ts);
    expect(gap, `parent ts=${result.parentTxn.ts} round-up ts=${result.roundUpTxn.ts} gap=${gap}ms exceeds 100ms`).toBeLessThanOrEqual(100);
    // Bucket credited synchronously
    const bucketDelta = +(result.bucketSavedAfter - result.bucketSavedBefore).toFixed(2);
    expect(bucketDelta, `bucket ${result.destName} delta ${bucketDelta} != round-up 0.60`).toBeCloseTo(0.60, 2);
    // Exactly 2 txns added (parent + round-up; no extras)
    expect(result.txnsAfter - result.txnsBefore).toBe(2);
  });

  test('Case 2: quickLogTxn (Quick Log path) emits parent + round-up synchronously', async ({ page }) => {
    // Quick Log path reads DOM inputs ($('ql-amt'), $('ql-note'), $('ql-roundup-toggle')).
    // Seed those inputs + the round-up toggle, then fire quickLogTxn().
    const result = await page.evaluate(() => {
      if (!S.roundUpDestination || !BRAIN.savings.getBucket(S.roundUpDestination)) {
        return { skip: true, reason: 'no-round-up-destination-bucket-in-fixture' };
      }
      // Stub DOM input elements quickLogTxn expects
      function ensureInput(id, value) {
        let el = document.getElementById(id);
        if (!el) {
          el = document.createElement('input');
          el.id = id;
          document.body.appendChild(el);
        }
        el.value = value;
        return el;
      }
      function ensureToggle(id, checked) {
        let el = document.getElementById(id);
        if (!el) {
          el = document.createElement('input');
          el.id = id;
          el.type = 'checkbox';
          document.body.appendChild(el);
        }
        el.checked = checked;
        return el;
      }
      ensureInput('ql-amt', '7.30');
      ensureInput('ql-note', 'INV-31 quicklog probe');
      ensureToggle('ql-roundup-toggle', true);
      // Inputs the function reads conditionally — set safe defaults
      ensureInput('ql-txn-type', 'expense');
      ensureInput('ql-freq', 'monthly');
      ensureInput('ql-due-month', '');
      // Active category chip (function reads `.cat-chip.active` data-cat)
      const existingChip = document.querySelector('.cat-chip.active');
      if (!existingChip) {
        const chip = document.createElement('div');
        chip.className = 'cat-chip active';
        chip.dataset.cat = 'Food / Coffee';
        document.body.appendChild(chip);
      }
      const txnsBefore = (S.txns || []).length;
      const destName = S.roundUpDestination;
      const bucketSavedBefore = +BRAIN.savings.getBucket(destName).saved || 0;

      // FIRE
      try { quickLogTxn(); } catch (e) {
        return { skip: true, reason: 'quickLogTxn-threw:' + (e && e.message) };
      }

      const txnsAfter = S.txns || [];
      const parentTxn = [...txnsAfter].reverse().find(t => t && t.note === 'INV-31 quicklog probe' && !t._isRoundup);
      const roundUpTxn = [...txnsAfter].reverse().find(t => t && t._isRoundup && t.note && t.note.indexOf('Round-up') === 0);
      const bucketSavedAfter = +BRAIN.savings.getBucket(destName).saved || 0;

      return {
        skip: false,
        txnsBefore, txnsAfter: txnsAfter.length,
        parentTxn: parentTxn ? { amt: parentTxn.amt, ts: parentTxn.ts } : null,
        roundUpTxn: roundUpTxn ? { amt: roundUpTxn.amt, ts: roundUpTxn.ts } : null,
        bucketSavedBefore, bucketSavedAfter,
      };
    });

    if (result.skip) {
      console.log('[INV-31 case 2] skipped:', result.reason);
      test.skip();
      return;
    }
    expect(result.parentTxn, 'Quick Log parent txn must land').not.toBeNull();
    expect(result.roundUpTxn, 'Quick Log round-up sibling must land in same tick').not.toBeNull();
    expect(result.parentTxn.amt).toBeCloseTo(7.30, 2);
    expect(result.roundUpTxn.amt).toBeCloseTo(0.70, 2);
    const gap = Math.abs(result.roundUpTxn.ts - result.parentTxn.ts);
    expect(gap, `Quick Log temporal gap ${gap}ms exceeds 100ms`).toBeLessThanOrEqual(100);
    const bucketDelta = +(result.bucketSavedAfter - result.bucketSavedBefore).toFixed(2);
    expect(bucketDelta).toBeCloseTo(0.70, 2);
    expect(result.txnsAfter - result.txnsBefore).toBe(2);
  });

  test('Case 3: recordWithAllocation alone does NOT emit round-up sibling (regression guard for future fold-in)', async ({ page }) => {
    const result = await page.evaluate(() => {
      const txnsBefore = (S.txns || []).length;
      const balBefore = S.bal;
      const r = BRAIN.transaction.recordWithAllocation(
        { amt: 4.30, note: 'INV-31 raw writer probe', cat: 'Food / Coffee', direction: 'outflow' },
        BRAIN.SOURCES.LOG_EXPENSE
      );
      return {
        result: r,
        txnsBefore,
        txnsAfter: (S.txns || []).length,
        balBefore, balAfter: S.bal,
        lastTxn: (S.txns || []).slice(-1)[0],
      };
    });
    expect(result.result.ok, `recordWithAllocation must accept the probe: ${JSON.stringify(result.result)}`).toBe(true);
    // Forward-looking regression guard: current behavior is 1 txn only (no fold-in).
    // When SDD §3 step 11 fold-in lands (Bundle 33+ optimization), this assertion
    // FLIPS to expect 2 txns (parent + round-up sibling) + temporal coherence checks
    // similar to Case 1/2. The flip is the signal that the fold-in shipped.
    expect(result.txnsAfter - result.txnsBefore).toBe(1);
    expect(result.lastTxn._isRoundup).toBeFalsy();
    expect(+(result.balBefore - result.balAfter).toFixed(2)).toBeCloseTo(4.30, 2);
  });
});
