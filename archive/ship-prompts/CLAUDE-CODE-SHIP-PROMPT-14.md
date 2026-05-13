# Claude Code Ship Prompt — Bundle 14

> **Status:** DRAFT. Opus reviews before CC executes.
> **Scope:** Seed `BRAIN.bills` bubble. First real cross-bubble composition (Bills → Transaction). MI-13 invariant ownership. `window._pendingBillPay*` globals folded. AutoMatch/AutoDetect relocated. Lenient-with-warning exception for `unmark` baked into both code and spec.
> **Pre-reqs:** HEAD `f536aad` (Bundle 13 — envelope contract + brain.test.js + spec v1.2).
> **Risk:** Medium. Touches the bill-paid lifecycle in 6+ surfaces. Mitigated by 33 existing brain.test.js tests + new composition tests + phone-verify.
> **Phone-verify:** Required (user-visible flows: payBillNow / markBillPaidMonth / Already-paid / Unmark / MI-13 banner).

---

## Standing Discipline (carried forward)

**Pre-authorised decisions — do NOT surface:**
- Build artifacts (`audit/allow-list.json`, `runtime-report.json`) → `git checkout --`
- Guardian rule fires on canonical helper itself → inline `guardian-allow` with `(permanent - ...)` tag, ASCII dashes only (regex parser quirk — em-dash will not match)
- Tests fail because assertion targets removed code → comment out + note in handoff ERRORS

**Surface required (STOP and ask):**
- A caller of `S.paidBills[key] =` that ISN'T in the Bundle 11 allow-list AND isn't migrated by Bundle 14 — flag it
- Money-math behavior change (balance, NW, debt totals)
- A composition-failure case not covered by lenient OR strict that I haven't named — name it explicitly before proceeding
- The unmark lenient exception triggering MORE THAN warn-then-proceed for `not-found` / `no-bucket` — these are the only sanctioned lenient reasons

**Handoff format v2 (same as Bundle 13):**
```
=== HANDOFF ===
COMMIT: <hash> <subject>
HEAD: <old> → <new>
DIFF: <file>: +N/-M
VERIFY: static <result>, runtime <p>/<t>, tests-core <p>/<t>, tests-brain <p>/<t>
DEVIATIONS: <one-line each, "none" if clean>
ERRORS: <STOP items + unexpected fires, "none" if clean>
VERIFY-CHANNEL: phone
TESTS: <terse list — must-pass items>
=== END ===
```

---

## Step 0 — Pre-flight

```
git status
git log --oneline -3
git pull origin main
```

HEAD `f536aad` (Bundle 13). Working tree clean (discard artifacts per Standing Discipline).

---

## Step 1 — Audit existing paid-bill surface

Inventory the current code so each method's migration target is explicit. Surface findings before any edit.

```
grep -n "S\.paidBills\[" index.html
grep -n "function payBillNow\|function markBillPaidMonth\|function undoBillPaid\|function undoPaidBillByKey\|function markBillAlreadyPaid\|function _markBillPaidViaQuickLog\|function isPaidBillKeyTruthy\|function isPaidBillAutoDebit\|function _reversePaidBillTxn" index.html
grep -n "function autoMatchBillsToTxns\|function autoDetectBillPayments\|function _txnMatchesBillStrict\|function _isBillRecentlyUnmarked" index.html
grep -n "_pendingBillPayKey\|_pendingBillPayAutoDebit" index.html
grep -n "function getBillsDue" index.html
grep -n "name: 'paidbills-key-not-future'" index.html
```

**Surface a table:**
```
EXISTING SURFACE                  CURRENT LOCATION  BUNDLE 14 TARGET
payBillNow                        L<N>              calls BRAIN.bills.markPaid (default mode)
markBillPaidMonth                 L<N>              calls BRAIN.bills.markPaid (default mode)
markBillAlreadyPaid               L<N>              calls BRAIN.bills.setPendingPay then opens Quick Log
_markBillPaidViaQuickLog          L<N>              calls BRAIN.bills.setPendingPay then opens Quick Log
withMarkPaidGate autoDebit handler L<N>             sets _pendingPay.autoDebit = true after action()
_consumePendingBillPay            L<N>              becomes thin shim → BRAIN.bills.consumePendingPay(txnTs)
undoBillPaid                      L<N>              calls BRAIN.bills.unmark(key)
undoPaidBillByKey                 L<N>              calls BRAIN.bills.unmark(key)
_reversePaidBillTxn               L<N>              becomes internal helper of unmark (or stays if used elsewhere; verify)
isPaidBillKeyTruthy               L<N>              becomes BRAIN.bills.isPaid(key); free fn stays as thin shim
isPaidBillAutoDebit               L<N>              becomes BRAIN.bills.isAutoDebit(key); free fn stays
isThisMonthlyBillPaid             L<N>              UNCHANGED (key-format helper, not lifecycle)
autoMatchBillsToTxns              L<N>              becomes BRAIN.bills.autoMatch({silent})
autoDetectBillPayments            L<N>              becomes BRAIN.bills.autoDetect()
_txnMatchesBillStrict             L<N>              becomes BRAIN.bills._txnMatches (internal)
_isBillRecentlyUnmarked           L<N>              becomes BRAIN.bills._isRecentlyUnmarked (internal)
getBillsDue                       L<N>              free fn stays; BRAIN.bills.dueBeforePayday wraps it
MI-13 invariant ('paidbills-key-not-future') registry+check  L<N>  logic moves to BRAIN.bills.invariants.checkFutureKeyNotPaid; registry's check() calls the bubble method
window._pendingBillPayKey         L<N>              deleted (replaced by BRAIN.bills._pendingPay)
window._pendingBillPayAutoDebit   L<N>              deleted (folded into BRAIN.bills._pendingPay.autoDebit)
```

**STOP after audit.** Confirm with user that each migration target is correct. If the audit surfaces an UNEXPECTED writer of `S.paidBills` (not in the Bundle 11 allow-list and not migrated above), that's a STOP-and-ask item — likely a missed Bundle-11 site.

---

## Step 2 — Seed `BRAIN.bills` (foundational methods + private state)

### 2a — Extend `BRAIN.SOURCES` with bill-lifecycle tags

Pre-flight grep at Step 0 confirmed PAY_BILL_NOW + MARK_BILL_PAID already exist (Bundle 11). Add three more entries to BRAIN.SOURCES + _SOURCE_SET so unmark and the two auto-pay paths get distinguishable audit attribution.

Locate via `grep -n "BUCKET_QUICK_ADD" index.html` (the last entry in the enum).

```js
// In SOURCES enum, after BUCKET_QUICK_ADD:
// BRAIN.bills (Bundle 14)
UNMARK_BILL:     'unmark-bill',
AUTO_MATCH:      'auto-match',
AUTO_DETECT:     'auto-detect',
```

```js
// In _SOURCE_SET array, append:
'unmark-bill', 'auto-match', 'auto-detect',
```

Without these three additions the source-validation guard rejects every Bills auto-pay write and every Unmark with `unknown-source`. The brain.test.js composition tests would catch this immediately, but extending the enum is cheaper than diagnosing the test fire.

### 2b — Insert the new sub-object adjacent to `BRAIN.transaction`

In `index.html`. BRAIN definition is around L10737+; after Bundle 13's docstring updates this may have shifted — locate via `grep -n "^const BRAIN" index.html`.

```js
  // ─── BRAIN.bills — Bills bubble (seeded Bundle 14) ─────────────────────
  // Owns the paidBills lifecycle: markPaid (with auto-debit and linked-txn
  // modes), unmark (lenient-with-warning per Composition Contract
  // Exception), isPaid, isAutoDebit, dueBeforePayday. Composes with
  // BRAIN.transaction.record/removeByTs to keep paid-flag and txn in
  // lockstep — first real cross-bubble composition in the codebase, validates
  // the architecture's premise.
  //
  // Composition behavior:
  //   markPaid (CREATE direction): strict abort on inner failure. Don't
  //   flip a paid flag without its supporting txn. Per Composition
  //   Contract (spec v1.2).
  //
  //   unmark (DESTROY direction): lenient-with-warning per Composition
  //   Contract EXCEPTION (spec v1.3). If the inner removeByTs returns
  //   not-found (txn already gone — snapshot restore, manual edit-txn
  //   delete, autoDetect-created entry with no _txnTs), warn and proceed
  //   with paidBills cleanup. Any OTHER inner failure aborts per standard
  //   contract. unmark's purpose is to converge on a clean state;
  //   aborting because cleanup target is already clean would strand the
  //   paidBills entry forever.
  bills: {
    // ─── Internal state ─────────────────────────────────────────────────
    // Cross-modal stash for the "Already paid" Quick Log flow. Set by
    // setPendingPay() on modal open, consumed by consumePendingPay(txnTs)
    // on Quick Log expense save, cleared by clearPendingPay() on modal
    // open OR pivot-away-from-Bills. Replaces window._pendingBillPayKey
    // and window._pendingBillPayAutoDebit globals (Bundle 7.2.2/7.2.3).
    _pendingPay: null,

    // ─── Pending-pay context API ────────────────────────────────────────
    setPendingPay(key, opts) {
      this._pendingPay = {
        key,
        autoDebit: !!(opts && opts.autoDebit),
        // future-extensible: billName, billDay can land here too
      };
    },
    clearPendingPay() {
      this._pendingPay = null;
    },
    // Consume on Quick Log expense save. txnTs is the ts returned by
    // BRAIN.transaction.record for the txn the user just logged.
    consumePendingPay(txnTs) {
      if (!this._pendingPay) return { ok: false, reason: 'no-pending-pay' };
      const ctx = this._pendingPay;
      this._pendingPay = null;
      // findBillByNameDay is needed only for the bill name/day; the
      // paidBills key in ctx.key is canonical. Use it directly.
      return this._setPaidEntry(ctx.key, {
        autoDebit: ctx.autoDebit,
        txnTs,
        source: BRAIN.SOURCES.MARK_BILL_PAID,
      });
    },

    // ─── Canonical writer: markPaid ─────────────────────────────────────
    // Three modes via options:
    //   default               -> create new txn (BRAIN.transaction.record),
    //                            set {paid:true, ts, _txnTs}
    //   { autoDebit:true }    -> create new txn,
    //                            set {paid:true, _scheduledAutoDebit:true, ts, _txnTs}
    //   { txnTs:<existing> }  -> don't create txn, link to existing;
    //                            auto-set _scheduledAutoDebit if bill day future
    //
    // bill = { name, day, amt, tag? }. source MUST be in BRAIN.SOURCES.
    markPaid(bill, source, options) {
      if (!source || !BRAIN._SOURCE_SET.has(source)) {
        return { ok: false, reason: 'unknown-source:' + source };
      }
      if (!bill || !bill.name || typeof bill.day !== 'number') {
        return { ok: false, reason: 'invalid-bill' };
      }
      const opts = options || {};
      const key = paidBillKey(bill.name, bill.day);

      // Mode resolution:
      let txnTs;
      let autoDebit = !!opts.autoDebit;
      if (typeof opts.txnTs === 'number') {
        // Link mode (autoDetect / autoMatch path). Verify the txn exists.
        const linked = BRAIN.transaction.findByTs(opts.txnTs);
        if (!linked) {
          return { ok: false, reason: 'linked-txn-missing', txnTs: opts.txnTs };
        }
        txnTs = opts.txnTs;
        // Auto-set autoDebit for future-dated keys in link mode (matches
        // the structured-shape contract from Bundle 7.2.3).
        const now = new Date();
        const todayD = now.getDate();
        if (bill.day > todayD) autoDebit = true;
      } else {
        // Create mode (default + autoDebit user-initiated). Compose with
        // BRAIN.transaction.record. STRICT abort on inner failure.
        const billAmt = (typeof bill.amt === 'number') ? bill.amt : 0;
        const txnSource = (source === BRAIN.SOURCES.PAY_BILL_NOW)
          ? BRAIN.SOURCES.PAY_BILL_NOW
          : BRAIN.SOURCES.MARK_BILL_PAID;
        const rec = BRAIN.transaction.record(
          { amt: billAmt, note: bill.name + ' — paid', cat: bill.tag || 'Bills', income: false, _balAffected: true },
          txnSource
        );
        if (!rec.ok) {
          // STRICT: don't flip paidBills without the supporting txn.
          return { ok: false, reason: 'inner-' + rec.reason };
        }
        txnTs = rec.ts;
      }

      return this._setPaidEntry(key, { autoDebit, txnTs, source });
    },

    // Internal: write the paidBills entry. Called by markPaid (after
    // txn settled) and consumePendingPay. Not part of the public surface.
    _setPaidEntry(key, { autoDebit, txnTs, source }) {
      if (!S.paidBills) S.paidBills = {};
      const entry = autoDebit
        ? { paid: true, _scheduledAutoDebit: true, ts: txnTs, _txnTs: txnTs }
        : { paid: true, ts: txnTs, _txnTs: txnTs };
      // guardian-allow: no-direct-paidbills-access - key from canonical paidBillKey helper resolved by caller; structured Bundle 7+ shape carrying the txn back-reference for reversible undo (permanent - BRAIN.bills internal write helper consumed by markPaid / consumePendingPay)
      S.paidBills[key] = entry;
      BRAIN.audit.append({
        type: 'bill_mark_paid',
        key,
        autoDebit,
        txnTs,
        source,
        ts: Date.now()
      });
      try { save(); } catch (_) {}
      return { ok: true, key, entry };
    },

    // ─── Canonical writer: unmark ───────────────────────────────────────
    // LENIENT-WITH-WARNING per Composition Contract Exception (spec v1.3).
    // Inner removeByTs returning not-found / no-txns is treated as
    // already-clean — warn and proceed. Inner setBucketSaved returning
    // no-bucket during round-up reversal: same. Any OTHER inner failure
    // aborts per standard contract.
    unmark(key, source) {
      if (!source) source = BRAIN.SOURCES.UNMARK_BILL; // user-initiated unmark default
      if (!source || !BRAIN._SOURCE_SET.has(source)) {
        return { ok: false, reason: 'unknown-source:' + source };
      }
      if (!S.paidBills || !S.paidBills[key]) {
        return { ok: false, reason: 'not-paid', key };
      }
      const entry = S.paidBills[key];
      const txnTs = (entry && typeof entry === 'object') ? entry._txnTs : null;

      // Reverse paired txn — lenient on already-gone.
      if (txnTs) {
        const removed = BRAIN.transaction.removeByTs(txnTs);
        if (!removed.ok) {
          if (removed.reason === 'not-found' || removed.reason === 'no-txns') {
            console.warn('[BRAIN.bills.unmark] paired txn already gone (' + removed.reason + ') for key', key);
          } else {
            // Unexpected failure — abort per standard contract.
            return { ok: false, reason: 'inner-' + removed.reason };
          }
        } else {
          // Restore balance for the txn we just removed. _balAffected check
          // matches _reversePaidBillTxn's logic.
          const t = removed.removed;
          if (t && t._balAffected) {
            if (t.income) S.bal -= (t.amt || 0);
            else S.bal += (t.amt || 0);
            S.bal = parseFloat(S.bal.toFixed(2));
          }
          // Handle round-up sibling — same lenient pattern (this calls
          // _reversePaidBillTxn's existing trailing-roundup logic OR
          // inlines it via BRAIN.savings.setBucketSaved with lenient
          // not-found handling). Implementation detail; see migration
          // step 4 below.
        }
      }

      // Record un-mark for Bundle 7.2.3 autoDetect skip-respect.
      if (!S._billUnmarkLog) S._billUnmarkLog = {};
      S._billUnmarkLog[key] = Date.now();

      // guardian-allow: no-direct-paidbills-access - key handed in by caller as a stored paidBills lookup; this is the canonical delete in BRAIN.bills.unmark, the un-mark equivalent of paidBillKey-based access (permanent - BRAIN.bills.unmark canonical deletion)
      delete S.paidBills[key];

      // Reset MI-13 invariant counts on resolution (preserves existing
      // Bundle 7.2.2 semantics — fresh re-banners at count=1, not card).
      if (S._invariantViolationCounts) {
        S._invariantViolationCounts['paidbills-key-not-future'] = { count: 0, firstSeenTs: Date.now() };
      }

      BRAIN.audit.append({
        type: 'bill_unmark',
        key,
        txnReversed: !!txnTs,
        source,
        ts: Date.now()
      });
      try { save(); } catch (_) {}
      return { ok: true, key };
    },

    // ─── Readers ────────────────────────────────────────────────────────
    isPaid(key) {
      if (!S.paidBills) return false;
      // guardian-allow: no-direct-paidbills-access - canonical reader exposing the paidBills lookup as BRAIN.bills.isPaid; equivalent shape to isPaidBillKeyTruthy free function which is now a thin shim (permanent - bubble-method canonical reader)
      const v = S.paidBills[key];
      return v === true || (v && v.paid === true);
    },
    isAutoDebit(key) {
      if (!S.paidBills) return false;
      // guardian-allow: no-direct-paidbills-access - canonical reader for the _scheduledAutoDebit flag; equivalent shape to isPaidBillAutoDebit free function which is now a thin shim (permanent - bubble-method canonical reader)
      const v = S.paidBills[key];
      return !!(v && typeof v === 'object' && v._scheduledAutoDebit);
    },
    // Wraps getBillsDue (free fn stays canonical). Bubble method is the
    // public surface; future Dashboard bubble reads through this.
    dueBeforePayday() {
      return (typeof getBillsDue === 'function') ? getBillsDue() : [];
    },

    // ─── Auto-detect / Auto-match (relocated, not unified) ──────────────
    // Same matcher (_txnMatches) underneath. Distinct entry points
    // preserve semantic split: autoMatch runs on init (today-only/silent),
    // autoDetect runs on every onStateChange (7-day/toast-on-match).
    // Both compose with markPaid in link mode (txnTs option).
    autoMatch(opts) {
      const silent = !!(opts && opts.silent);
      const now = new Date();
      const todayStr = now.toDateString();
      const todayM = now.getMonth(), todayY = now.getFullYear();
      const todayTxns = (S.txns || []).filter(t => new Date(t.ts).toDateString() === todayStr);
      const matched = [];
      (BILLS || []).filter(b => b.recurring !== false).forEach(b => {
        if (this.isPaid(paidBillKey(b.name, b.day))) return;
        if (this._isRecentlyUnmarked(b.name, b.day, todayM, todayY)) return;
        const matchTxn = todayTxns.find(t => this._txnMatches(t, b));
        if (!matchTxn) return;
        const r = this.markPaid(b, BRAIN.SOURCES.AUTO_MATCH, { txnTs: matchTxn.ts });
        if (r.ok) matched.push(b.name);
      });
      if (matched.length && !silent && typeof showUndoToast === 'function') {
        showUndoToast('✓ ' + matched.join(', ') + ' marked as paid — matched transaction');
      }
      return { ok: true, matched };
    },
    autoDetect() {
      const now = new Date();
      const todayM = now.getMonth(), todayY = now.getFullYear();
      const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
      const recentTxns = (S.txns || []).filter(t => !t.income && t.ts >= sevenDaysAgo);
      const detected = [];
      (BILLS || []).filter(b => b.recurring !== false).forEach(b => {
        if (this.isPaid(paidBillKey(b.name, b.day))) return;
        if (this._isRecentlyUnmarked(b.name, b.day, todayM, todayY)) return;
        const matchTxn = recentTxns.find(t => this._txnMatches(t, b));
        if (!matchTxn) return;
        const r = this.markPaid(b, BRAIN.SOURCES.AUTO_DETECT, { txnTs: matchTxn.ts });
        if (r.ok) detected.push(b.name);
      });
      if (detected.length && typeof showToast === 'function') {
        try { showToast('✓ ' + detected.join(', ') + ' auto-detected as paid'); } catch(e) {}
      }
      return { ok: true, detected };
    },

    // ─── Internal: strict txn-bill matcher ──────────────────────────────
    // Same impl as Bundle 7.2.3's _txnMatchesBillStrict. Require BOTH
    // amount AND name keyword match. Tolerance scales with bill size.
    _txnMatches(t, b) {
      if (t.income || t._isRoundup || t._isCorrection) return false;
      const amt = b.amt || 0;
      const tolerance = amt <= 20 ? 0.50 : 1.00;
      if (Math.abs((t.amt || 0) - amt) > tolerance) return false;
      const keyword = (b.name || '').toLowerCase().split(/[\s\-—]+/)
        .filter(w => w.length >= 4)
        .sort((a, x) => x.length - a.length)[0];
      if (!keyword) return false;
      return ((t.note || '').toLowerCase()).indexOf(keyword) >= 0;
    },

    // ─── Internal: respect user un-marks for 30 days ────────────────────
    _isRecentlyUnmarked(billName, billDay, m, y) {
      const log = S._billUnmarkLog;
      if (!log) return false;
      const key = paidBillKey(billName, billDay, m, y);
      const ts = log[key];
      if (!ts) return false;
      if (Date.now() - ts > 30 * 86400000) {
        delete log[key];
        return false;
      }
      return true;
    },

    // ─── Invariants (registered cross-cutting in MathInvariants) ────────
    // Logic owned by Bills; registry stays in MathInvariants.invariants[]
    // so the render-time safety net catches drift from paths the canonical
    // writer didn't audit (snapshot restore, load() migrations, future
    // bugs that bypass markPaid). See spec v1.2 Invariant Ownership.
    invariants: {
      checkFutureKeyNotPaid() {
        // Same logic as the existing 'paidbills-key-not-future' invariant
        // body — moved here verbatim. Returns the violation object or null.
        // ... (copy from MathInvariants invariants[] entry where name === 'paidbills-key-not-future')
        const now = new Date();
        const todayY = now.getFullYear(), todayM = now.getMonth(), todayD = now.getDate();
        const future = Object.keys(S.paidBills || {}).filter(k => {
          // guardian-allow: no-direct-paidbills-access - invariant scan over Object.keys; isPaidBillAutoDebit reads value directly here (BRAIN.bills.isAutoDebit is the canonical reader; this is a Bills-owned invariant inspecting its own state) (permanent - invariant logic owned by Bills, reads paidBills directly)
          if (BRAIN.bills.isAutoDebit(k)) return false;
          const m2 = k.match(/^(\d{4})-(\d{1,2})-.*-(\d{1,2})$/);
          if (!m2) return false;
          const y = +m2[1], mo = +m2[2]-1, d = +m2[3];
          if (y > todayY) return true;
          if (y === todayY && mo > todayM) return true;
          if (y === todayY && mo === todayM && d > todayD) return true;
          return false;
        });
        if (future.length === 0) return null;
        return {
          displayValue: future.length + ' bill(s)',
          expected: 'paidBills key day ≤ today',
          details: future.slice(0, 3).map(k => {
            const m2 = k.match(/^\d{4}-\d{1,2}-(.*)-\d{1,2}$/);
            return m2 ? m2[1] : k;
          }).join(', ') + (future.length > 3 ? ' +' + (future.length - 3) + ' more' : ''),
          keys: future
        };
      }
    }
  },
```

---

## Step 3 — Update `MathInvariants` registry to call into the bubble

Find the existing `{ name: 'paidbills-key-not-future', ... }` entry in `MathInvariants.invariants[]`. Replace its `check()` body with a thin delegation:

```js
{
  name: 'paidbills-key-not-future',
  tier: 'fail',
  anchor: 'OPEN-BUGS#23',
  dismissPolicy: 'persistent',
  check() {
    // Bundle 14: logic moved to BRAIN.bills.invariants — semantic ownership
    // with the Bills bubble. Registry entry stays cross-cutting so render-
    // time check runs every render (preserves the safety net for paths
    // the canonical writer didn't audit). See spec v1.2 Invariant Ownership.
    if (typeof BRAIN === 'undefined' || !BRAIN.bills || !BRAIN.bills.invariants) {
      // TDZ-safe fallback for boot ordering — invariant runs after BRAIN
      // is defined in normal flow; this branch only matters if invariants
      // run mid-load() before the BRAIN const initializer.
      return null;
    }
    return BRAIN.bills.invariants.checkFutureKeyNotPaid();
  },
  message(v) { return 'Bills tracked as paid early — tap to review'; }
},
```

Banner copy + dismiss/escalation logic unchanged. The relocation is semantic ownership only.

---

## Step 4 — Migrate existing surfaces to call through `BRAIN.bills`

### 4a — `payBillNow`

```js
function payBillNow(billName, billDay, billAmt) {
  const bill = findBillByNameDay(billName, billDay) || { name: billName, day: billDay, amt: billAmt };
  bill.amt = billAmt; // ensure amt is set for markPaid's txn composition
  withMarkPaidGate(bill, () => {
    // Bundle 14: route through BRAIN.bills.markPaid (default mode) — it
    // composes with BRAIN.transaction.record to create the paired txn and
    // sets the structured paidBills entry with _txnTs back-ref. STRICT
    // abort if the inner record fails — no orphan paid flag.
    const r = BRAIN.bills.markPaid(bill, BRAIN.SOURCES.PAY_BILL_NOW);
    if (!r.ok) {
      showToast('⚠️ Could not mark ' + billName + ' paid — ' + r.reason);
      return;
    }
    S.bal = parseFloat((S.bal - billAmt).toFixed(2));
    onStateChange('bill_paid_now');
    showToast('✅ ' + billName + ' paid — $' + billAmt + ' logged');
    const detail = document.getElementById('cal-day-detail');
    if (detail) detail.style.display = 'none';
  });
}
```

### 4b — `markBillPaidMonth`

```js
function markBillPaidMonth() {
  if (activeBillIdx < 0) return;
  const b = BILLS[activeBillIdx];
  withMarkPaidGate(b, () => {
    saveUndoState();
    S.bal -= b.amt;
    const r = BRAIN.bills.markPaid(b, BRAIN.SOURCES.MARK_BILL_PAID);
    if (!r.ok) {
      // Reverse the balance deduction on failure (strict abort).
      S.bal += b.amt;
      showToast('⚠️ Could not mark ' + b.name + ' paid — ' + r.reason);
      return;
    }
    closeModal('bill-modal', true);
    onStateChange('bill-paid-month');
    if (navigator.vibrate) navigator.vibrate(50);
    try { NOTIFY.refresh(); } catch(e) {}
  });
}
```

### 4c — `markBillAlreadyPaid` + `_markBillPaidViaQuickLog`

Replace window-global stash with `BRAIN.bills.setPendingPay`:

```js
function markBillAlreadyPaid(billName, billDay) {
  const bill = findBillByNameDay(billName, billDay) || { name: billName, day: billDay };
  const billAmt = (bill && typeof bill.amt === 'number') ? bill.amt : 0;
  withMarkPaidGate(bill, () => {
    if (typeof openQuickLogModal !== 'function') {
      // Fallback path — no Quick Log available. Route through markPaid
      // default mode (creates a synthetic txn).
      const r = BRAIN.bills.markPaid(bill, BRAIN.SOURCES.MARK_BILL_PAID);
      if (!r.ok) {
        showToast('⚠️ Could not mark ' + billName + ' paid — ' + r.reason);
      } else {
        onStateChange('bill_already_paid');
        showToast('✅ ' + billName + ' marked as paid');
      }
      const detail = document.getElementById('cal-day-detail');
      if (detail) detail.style.display = 'none';
      return;
    }
    const detail = document.getElementById('cal-day-detail');
    if (detail) detail.style.display = 'none';
    openQuickLogModal();
    // Bundle 14: cross-modal stash now lives on BRAIN.bills, not window.
    BRAIN.bills.setPendingPay(paidBillKey(billName, billDay), { autoDebit: false });
    const _a = document.getElementById('ql-amt');
    const _n = document.getElementById('ql-note');
    const _c = document.getElementById('ql-cat-hidden');
    if (_a && billAmt > 0) _a.value = billAmt.toFixed(2);
    if (_n) _n.value = billName + ' — paid';
    if (_c) _c.value = (bill.tag === 'Loan' || bill.tag === 'Fixed') ? 'Bills' : (bill.tag || 'Bills');
  });
}
```

Mirror for `_markBillPaidViaQuickLog`.

### 4d — `withMarkPaidGate` autoDebit handler

```js
autodebitBtn.onclick = function() {
  closeModal('mark-paid-modal');
  action();
  // Bundle 14: after action() opens Quick Log + sets _pendingPay, flip
  // its autoDebit flag. consumePendingPay reads this on save.
  try {
    const key = paidBillKey(bill.name, bill.day);
    if (S.paidBills && S.paidBills[key] === true) {
      // Path (a) — legacy direct-set already happened (rare; only fallback
      // path hits this). Upgrade shape inline.
      // guardian-allow: no-direct-paidbills-access - legacy upgrade write; structured shape with auto-debit flag for the 3-way modal autoDebit choice; same paidBillKey-derived key (permanent - Bundle 7 mark-paid auto-debit upgrade write retained)
      S.paidBills[key] = { paid: true, _scheduledAutoDebit: true, ts: Date.now() };
      save();
    } else if (BRAIN.bills._pendingPay && BRAIN.bills._pendingPay.key === key) {
      // Path (b) — Quick Log stash is live; tag it.
      BRAIN.bills._pendingPay.autoDebit = true;
    }
  } catch(e) { console.warn('[BRAIN.bills autoDebit] flag write failed:', e); }
};
```

### 4e — `_consumePendingBillPay` becomes shim

```js
function _consumePendingBillPay(txnTsOverride) {
  // Bundle 14: thin shim — delegates to BRAIN.bills.consumePendingPay.
  // Callers can pre-bundle the txnTs they captured from BRAIN.transaction.record
  // (preserves Bundle 11's back-ref correctness when round-up pushes after
  // the bill payment).
  return BRAIN.bills.consumePendingPay(txnTsOverride);
}
```

### 4f — `undoBillPaid` + `undoPaidBillByKey` route through `unmark`

```js
function undoBillPaid() {
  if (activeBillIdx < 0) return;
  const b = BILLS[activeBillIdx];
  const key = paidBillKey(b.name, b.day);
  const r = BRAIN.bills.unmark(key, BRAIN.SOURCES.UNMARK_BILL);
  closeModal('bill-modal', true);
  if (typeof onStateChange === 'function') onStateChange('bill-paid-undone');
  // (showToast on result.ok — preserve Bundle 7.2.4 messaging)
}

function undoPaidBillByKey(key) {
  // Bundle 14: route through BRAIN.bills.unmark. Lenient-with-warning
  // handles the "txn already gone" case so this never returns false
  // when the user just wants to clear the flag.
  const r = BRAIN.bills.unmark(key, BRAIN.SOURCES.UNMARK_BILL);
  if (!r.ok) return false;

  // Preserve MI-13-modal close + re-render behavior from Bundle 7.2.3.
  try {
    const inv = MathInvariants.invariants.find(i => i.name === 'paidbills-key-not-future');
    const result = inv && inv.check();
    if (result && result.keys && result.keys.length) {
      renderMI13DetailsModal(result.keys);
    } else {
      closeModal('mi13-details-modal', true);
    }
  } catch (_) {}
  if (typeof onStateChange === 'function') onStateChange('bill-paid-undone');
  const name = parseMI13Key(key).name || key;
  try { showToast('Undid: ' + name + (r.txnReversed ? ' — balance + txn reversed' : '')); } catch (_) {}
  return true;
}
```

### 4g — Free-fn shims for `isPaidBillKeyTruthy` + `isPaidBillAutoDebit`

Keep the free functions for backwards-compat but delegate to BRAIN:

```js
function isPaidBillKeyTruthy(key) {
  return (typeof BRAIN !== 'undefined' && BRAIN.bills) ? BRAIN.bills.isPaid(key) : false;
}
function isPaidBillAutoDebit(key) {
  return (typeof BRAIN !== 'undefined' && BRAIN.bills) ? BRAIN.bills.isAutoDebit(key) : false;
}
```

TDZ-safe via the `typeof BRAIN !== 'undefined'` guard.

### 4h — `autoMatchBillsToTxns` + `autoDetectBillPayments` become shims

```js
function autoMatchBillsToTxns(silent) {
  return BRAIN.bills.autoMatch({ silent });
}
function autoDetectBillPayments() {
  return BRAIN.bills.autoDetect();
}
```

The existing free-function bodies (Bundle 7.2.3) are now superseded — delete the body, keep the shim. `_txnMatchesBillStrict` and `_isBillRecentlyUnmarked` move into `BRAIN.bills` as private helpers; their free-function forms can stay as shims OR be deleted if no other caller. Check:

```
grep -n "_txnMatchesBillStrict\|_isBillRecentlyUnmarked" index.html
```

If only `autoMatch` / `autoDetect` use them, delete the free functions and inline-reference `this._txnMatches` / `this._isRecentlyUnmarked`.

---

## Step 5 — Delete the window globals

After all callers migrated:

```js
// Remove all `delete window._pendingBillPayKey` and
// `delete window._pendingBillPayAutoDebit` references.
// They're superseded by BRAIN.bills.clearPendingPay().
```

Specifically:
- `openQuickLogModal`: replace the two `delete window._pendingBillPay*` lines with `BRAIN.bills.clearPendingPay()`.
- Quick Log income / from-person pivot paths: same — replace deletes with `BRAIN.bills.clearPendingPay()`.
- Category pivot away from Bills in `selectCat`: same.

---

## Step 6 — `_reversePaidBillTxn` migration

Bundle 7.2.4's `_reversePaidBillTxn` does three things: restore balance, splice main txn, splice round-up sibling + reverse bucket. Bundle 14's `unmark` already handles balance + main-txn removal via composition. The round-up handling stays as an inline helper inside `unmark` OR migrates to its own small helper.

**Recommended:** inline the round-up reversal directly inside `unmark` (between the main-txn removeByTs and the paidBills delete). The old `_reversePaidBillTxn` free function becomes a shim that just calls into `unmark`'s logic — or is deleted if no remaining caller.

```
grep -n "_reversePaidBillTxn" index.html
```

If only `undoBillPaid` / `undoPaidBillByKey` called it (both now route through `unmark`), delete the function.

**If grep surfaces a holdout caller:** name it explicitly in the handoff `DEVIATIONS` line — file/function + line number. Future bundle can target the migration with a clear name. Leave `_reversePaidBillTxn` as a shim (delegating to `BRAIN.bills.unmark` or a small inlined helper) in the interim.

---

## Step 7 — Update `brain.test.js`

Add new tests for `BRAIN.bills` matching the contract pattern. Target: ~12-15 new tests, bringing total to ~45-48.

**Required coverage:**

```js
// Happy paths
test('bills.markPaid: default mode creates paired txn and structured entry', () => { ... });
test('bills.markPaid: autoDebit mode sets _scheduledAutoDebit flag', () => { ... });
test('bills.markPaid: txnTs link mode does NOT create new txn', () => { ... });
test('bills.markPaid: txnTs link mode auto-sets _scheduledAutoDebit for future days', () => { ... });

// Validation
test('bills.markPaid: unknown source rejected (no mutation)', () => { ... });
test('bills.markPaid: invalid bill rejected', () => { ... });
test('bills.markPaid: link mode with missing txnTs returns linked-txn-missing', () => { ... });

// Composition - strict abort (CREATE direction)
test('composition: markPaid default mode aborts cleanly when transaction.record fails (strict)', () => {
  resetS();
  const original = BRAIN.transaction.record;
  BRAIN.transaction.record = () => ({ ok: false, reason: 'forced-test-failure' });
  try {
    const result = BRAIN.bills.markPaid(
      { name: 'Test Bill', day: 15, amt: 50, tag: 'Streaming' },
      BRAIN.SOURCES.MARK_BILL_PAID
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('inner-forced-test-failure');
    // Verify NO paidBills entry created — strict abort means no orphan flag.
    const key = paidBillKey('Test Bill', 15);
    const entry = S.paidBills && S.paidBills[key];
    expect(!!entry).toBe(false);
  } finally {
    BRAIN.transaction.record = original;
  }
});

// Composition - lenient with warning (DESTROY direction)
test('composition: unmark proceeds when removeByTs returns not-found (lenient)', () => {
  // Setup: paidBills has entry with _txnTs pointing at a ts that's NOT in S.txns
  // Verify: unmark returns { ok: true }, paidBills entry removed, _billUnmarkLog set
});
test('composition: unmark aborts on UNEXPECTED inner failure (strict for non-lenient reasons)', () => {
  resetS();
  // Set up a paidBills entry pointing at a real txn so removeByTs has a target.
  const key = paidBillKey('Probe Bill', 15);
  const txnTs = Date.now();
  S.txns.push({ amt: 30, note: 'Probe', cat: 'Bills', ts: txnTs });
  S.paidBills[key] = { paid: true, ts: txnTs, _txnTs: txnTs };
  const original = BRAIN.transaction.removeByTs;
  BRAIN.transaction.removeByTs = () => ({ ok: false, reason: 'system-error' });
  try {
    const result = BRAIN.bills.unmark(key, BRAIN.SOURCES.UNMARK_BILL);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('inner-system-error');
    // Verify paidBills entry STILL EXISTS — strict abort preserves state
    // when the failure mode wasn't an "already-clean" exception.
    expect(!!S.paidBills[key]).toBe(true);
  } finally {
    BRAIN.transaction.removeByTs = original;
  }
});

// unmark mechanics
test('bills.unmark: removes entry + records _billUnmarkLog + resets invariant counts', () => { ... });
test('bills.unmark: not-paid case returns not-paid envelope', () => { ... });

// pendingPay context
test('bills.setPendingPay / consumePendingPay round-trip with manual mode', () => { ... });
test('bills.setPendingPay / consumePendingPay round-trip with autoDebit mode', () => { ... });
test('bills.clearPendingPay clears context', () => { ... });
test('bills.consumePendingPay: no-pending-pay envelope when context is null', () => { ... });

// Readers
test('bills.isPaid: handles legacy true and structured shapes', () => { ... });
test('bills.isAutoDebit: returns true only for _scheduledAutoDebit:true entries', () => { ... });

// Invariant
test('bills.invariants.checkFutureKeyNotPaid: returns null when no future paid keys', () => { ... });
test('bills.invariants.checkFutureKeyNotPaid: returns violation for future non-autoDebit keys', () => { ... });
test('bills.invariants.checkFutureKeyNotPaid: skips autoDebit-flagged keys', () => { ... });
```

Each test follows the `resetS()` + arrange + act + assert pattern from existing brain.test.js. The `BRAIN.bills` object body must be copied verbatim into brain.test.js's BRAIN definition (same convention as other bubbles).

---

## Step 8 — Update `BRAIN_ARCHITECTURE.md` to v1.3

Bump status header to v1.3. Add the Composition Contract Exception section after "Composition Contract":

```markdown
### Composition Contract Exceptions (v1.3)

The abort-on-inner-failure rule has named exceptions for CLEANUP-
direction operations. `unmark` / `undo` / `delete` operations have the
opposite intent: converge on a clean state. If a downstream cleanup
target is already absent, that's success (we wanted it gone), not
failure. These operations follow LENIENT-WITH-WARNING semantics for
"already-clean" failure modes.

**Current exceptions:**

- `BRAIN.bills.unmark(key)` calling `BRAIN.transaction.removeByTs(ts)`:
  if inner returns `not-found` or `no-txns`, log a warning and proceed
  with the paidBills cleanup. Any OTHER inner failure aborts per
  standard contract (returns `inner-<reason>` envelope).
- `BRAIN.bills.unmark(key)` calling `BRAIN.savings.setBucketSaved` for
  round-up reversal: if inner returns `no-bucket` (bucket was
  renamed/deleted), log warning and proceed. Other failures abort.

**Rule for naming the exception in code:** the composition function
MUST explicitly check the `reason` field and decide per-code. Implicit
lenience is forbidden — every composition either aborts-or-proceeds on
EVERY possible inner reason code. New "already-clean" reason codes
added to inner writers must be re-evaluated by every outer caller.

**Why CREATE-strict / DESTROY-lenient is the right asymmetry:**
- CREATE direction (markPaid, record, setBucketSaved): the goal is to
  establish state. A failed inner write means the supporting record
  doesn't exist, so the outer write would create an orphan flag. Abort.
- DESTROY direction (unmark, removeByTs): the goal is to converge on
  cleanliness. An "already-clean" inner result means the cleanup target
  has converged ahead of us. Proceed and finish convergence.
```

Bump bubble inventory:
```
| `BRAIN.bills` | Bill lifecycle: markPaid / unmark / isPaid / dueBeforePayday / autoMatch / autoDetect + paidbills-key-not-future invariant | ✅ Bundle 14, envelope v1.2 |
```

Update "Known Gaps" — strike `window._pendingBillPayKey` (resolved Bundle 14). Strike MI-13 invariant relocation (resolved Bundle 14).

---

## Step 9 — Validation + commit

```
node guardian-static.js
node guardian-runtime.js
node tests/core.test.js
node tests/brain.test.js
```

Expected: static 0, runtime 47/50, core 41/41, brain 45-48/45-48.

**Commit:**
```
git add index.html guardian-static.js tests/brain.test.js BRAIN_ARCHITECTURE.md
git commit -m "arch(14): BRAIN.bills bubble + first cross-bubble composition + MI-13 ownership

[full message — see template]"
git push origin main
```

Commit message template:
```
arch(14): BRAIN.bills bubble + first cross-bubble composition + MI-13 ownership

Fourth BRAIN bubble. First real cross-bubble composition (Bills →
Transaction). Validates the architecture's premise: bubbles compose
via canonical writers with explicit envelope-failure handling, no
direct S mutation outside the bubble boundary, render-time safety net
preserved via invariant-ownership pattern.

BRAIN.bills (7 public methods + 3 private + 1 invariant + 1 state):
- markPaid(bill, source, opts): three modes via opts — default
  (creates paired txn via BRAIN.transaction.record), {autoDebit:true}
  (creates txn + sets _scheduledAutoDebit), {txnTs:<existing>} (link
  to existing txn, auto-sets _scheduledAutoDebit for future days).
  STRICT abort on inner record() failure — no orphan paid flags.
- unmark(key, source): LENIENT-WITH-WARNING per Composition Contract
  Exception (spec v1.3). Inner removeByTs returning not-found or
  no-txns is treated as already-clean — warn and proceed. Inner
  setBucketSaved returning no-bucket during round-up reversal: same.
  Any OTHER inner failure aborts per standard contract.
- isPaid(key) / isAutoDebit(key): canonical readers. Free fns become
  shims.
- dueBeforePayday(): wraps getBillsDue (canonical impl unchanged).
- autoMatch({silent}) / autoDetect(): relocated, NOT unified. Both
  compose with markPaid in txnTs link mode. _txnMatches + _isRecentlyUnmarked
  move under the bubble as private helpers.
- _pendingPay state + setPendingPay / clearPendingPay / consumePendingPay
  helpers replace window._pendingBillPayKey / _pendingBillPayAutoDebit
  globals (Bundle 7.2.2/7.2.3 leftover).
- invariants.checkFutureKeyNotPaid(): MI-13 logic relocates here per
  Invariant Ownership pattern (spec v1.2). Registry entry in
  MathInvariants.invariants[] stays cross-cutting — render-time safety
  net unchanged. Banner copy / dismiss / escalation behavior identical.

Migrated surfaces:
- payBillNow → BRAIN.bills.markPaid (default mode, PAY_BILL_NOW source)
- markBillPaidMonth → BRAIN.bills.markPaid (default mode, MARK_BILL_PAID source)
- markBillAlreadyPaid / _markBillPaidViaQuickLog → setPendingPay before opening Quick Log
- withMarkPaidGate autoDebit handler → flips _pendingPay.autoDebit
- _consumePendingBillPay → thin shim around BRAIN.bills.consumePendingPay
- undoBillPaid / undoPaidBillByKey → BRAIN.bills.unmark
- _reversePaidBillTxn → inlined inside unmark (free fn deleted if no other caller)
- isPaidBillKeyTruthy / isPaidBillAutoDebit → free-fn shims around BRAIN.bills
- autoMatchBillsToTxns / autoDetectBillPayments → free-fn shims around BRAIN.bills
- 'paidbills-key-not-future' invariant check() → delegates to BRAIN.bills.invariants

Window globals deleted (replaced by BRAIN.bills._pendingPay): all
`delete window._pendingBillPayKey` and `delete window._pendingBillPayAutoDebit`
sites in openQuickLogModal / Quick Log save paths / selectCat.

tests/brain.test.js (+12-15 tests, total ~45-48):
- Happy paths for all three markPaid modes
- Validation paths (unknown source, invalid bill, linked-txn-missing)
- COMPOSITION-STRICT test: markPaid aborts cleanly when record fails
- COMPOSITION-LENIENT test: unmark proceeds when removeByTs returns
  not-found (locks the abort-on-already-clean exception per spec v1.3)
- COMPOSITION-STRICT-FOR-UNEXPECTED test: unmark aborts on non-
  lenient inner failure reasons
- setPendingPay / consumePendingPay round-trips (manual + autoDebit)
- isPaid / isAutoDebit handling of legacy + structured shapes
- Invariant check returns null/violation appropriately

BRAIN_ARCHITECTURE.md v1.3:
- New "Composition Contract Exceptions" section documenting CREATE-strict
  / DESTROY-lenient asymmetry with the unmark exceptions named explicitly.
- Bubble inventory: BRAIN.bills added as ✅ Bundle 14, envelope v1.2.
- Known Gaps updated: window._pendingBillPay globals + MI-13 invariant
  relocation marked resolved.

Verification: guardian-static exit 0, runtime 47/50 (same fixture-drift
baseline), tests-core 41/41, tests-brain 45-48/45-48.
Phone-verify: payBillNow + markBillPaidMonth flows + Already paid +
Unmark from MI-13 modal + Unmark from bill modal + autoDetect on app
boot all behave identically to Bundle 13.
```

---

## Step 10 — Phone-verify

| # | Test | PASS criteria |
|---|------|---|
| 14.A | Pay Now from calendar cell | Bill flips to TRACKED, txn appears in Recent Spending, balance deducted |
| 14.B | Mark Paid This Month from bill modal | Same — bill marked + txn + balance |
| 14.C | "Already paid" → Quick Log → Save | Bill flips to TRACKED, txn matches user-entered amount, paidBills entry has _txnTs back-ref |
| 14.D | 3-way modal "Auto-debits monthly" → Quick Log → Save | Same as 14.C PLUS no MI-13 banner fires (auto-debit flag suppresses) |
| 14.E | Unmark from MI-13 modal | Bill clears from list, paid flag removed, balance restored if Bundle 7.2.4 reversal applies, modal closes if list empty |
| 14.F | Unmark from bill modal "Undo" button | Same as 14.E |
| 14.G | Unmark when paired txn was manually deleted earlier | LENIENT exception fires — bill still un-marks cleanly, warning in console, no user-visible error |
| 14.H | autoMatch on app boot | Bills with matching today-txns get marked paid silently (no toast unless detected.length > 0) |
| 14.I | autoDetect on onStateChange | After logging a txn that matches a bill, the bill gets auto-flagged + toast fires |
| 14.J | MI-13 banner / card still works | Pre-mark a future-dated bill paid (Already paid → Paid manually) → banner appears next render → tap → modal opens with the bill → Undo → bill un-marks cleanly |
| 14.K | Category pivot in Quick Log clears pendingPay | "Already paid" → Quick Log opens with amt + note prefilled → tap Income chip → amt + note clear, no bill flagged on Save |

A through G are critical. H/I/J/K nice-to-have but recommended.

---

## End of prompt
