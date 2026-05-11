# Claude Code Ship Prompt — Bundle 15

> **Status:** SELF-AUTHORED. CC executes against `5981f46` HEAD.
> **Scope:** Seed BRAIN.debts bubble. Close Bundle 11's three TXNS_PUSH allow-list exemptions (applyBalanceCorrection / confirmWrxAlloc / markDebtPaid). Add no-direct-debts-mutation guardian rule (AST). Establish CREATE-strict / DESTROY-lenient composition for debt lifecycle.
> **Pre-reqs:** HEAD `5981f46` (Bundle 14). Bundle 16 is queued (autoDebit redesign) — Bundle 15 does NOT touch autoDebit semantics.
> **Risk:** Medium. Touches debt lifecycle (3 writers, many readers stay free). Mitigated by composition pattern proven Bundle 14 + ~12 new tests.
> **Phone-verify:** Required (visible flows: + Add Debt, Mark debt paid, Delete debt, WRX sale alloc, balance reconciliation).

---

## Step 1 — Audit (then STOP for surface)

```
grep -n "S\.debts\.\|S\.debts\[" index.html
grep -n "function saveNewDebt\|function markDebtPaid\|function deleteDebt\|function applyBalanceCorrection\|function confirmWrxAlloc\|function markDebtCovered" index.html
```

Expected writers to migrate:
- `saveNewDebt` (push) → `BRAIN.debts.add`
- `markDebtPaid` (paid=true + clearance txn) → `BRAIN.debts.markPaid`
- `deleteDebt` (filter reassign) → `BRAIN.debts.delete`
- `confirmWrxAlloc` (loop sets paid=true + pushes txns) → loop calls `BRAIN.debts.markPaid` with WRX_ALLOCATE source
- `applyBalanceCorrection` (pushes _isCorrection txn + adjusts S.bal) → routes txn push through `BRAIN.transaction.recordCorrection` (new helper)
- `markDebtCovered` if exists → `BRAIN.debts.update({covered:true})` or similar
- Priority reorder (auto-sort) at L4637 → leave; surface as adjacent debt (priority is metadata, not a write-direction we need to canonicalize this bundle)
- SCAN-driven debt push at L10141 → `BRAIN.debts.add` with `chat` source (or new SCAN source if cleaner)

Readers stay free (they don't write). Many filter calls exist; not in scope.

---

## Step 2 — Extend BRAIN.SOURCES

Add 5 new tags + the SCAN one if used:
- `ADD_DEBT: 'add-debt'`
- `CLEAR_DEBT: 'clear-debt'`
- `UNMARK_DEBT: 'unmark-debt'`
- `UPDATE_DEBT: 'update-debt'`
- `DELETE_DEBT: 'delete-debt'`
- `WRX_ALLOCATE: 'wrx-allocate'`
- `RECONCILE_CORRECTION: 'reconcile-correction'`

(Both enum + _SOURCE_SET.)

---

## Step 3 — Seed BRAIN.debts (adjacent to BRAIN.bills)

Methods (envelope-shape per spec v1.2 + composition contract):
- `add(debt, source) → {ok, debt?, id?, reason?}` — validates required fields, ID-collision guard, push
- `markPaid(id, source) → {ok, debt?, txnTs?, reason?}` — CREATE-strict: composes with BRAIN.transaction.record for clearance txn. Aborts if record fails.
- `unmark(id, source) → {ok, debt?, txnReversed?, reason?}` — DESTROY-lenient on `not-found` from removeByTs. Same as bills.unmark pattern.
- `update(id, fields, source) → {ok, debt?, changed?, reason?}` — partial update of name/amt/rate/notes/delayDate. Whitelist mutable fields.
- `delete(id, source) → {ok, removed?, reason?}` — splice from array. No composition (no paired txn).
- `findById(id) → debt | undefined` — reader
- `active() → [debt]` — reader: unpaid non-viaRent
- `total({includeViaRent?}) → number` — reader: sum of active amounts
- `applyBalanceCorrection(newBal, reason) → {ok, diff?, txnTs?, reason?}` — NOT debt-domain actually, but composes via `BRAIN.transaction.recordCorrection` (new helper). Bundle 15 lives in BRAIN.debts because that's where the existing call site sits semantically? Actually NO — this is RECONCILE source, belongs in BRAIN.transaction. Add `BRAIN.transaction.recordCorrection(diff, reason)` instead.

ID-collision guard preserves Mission #42 era logic.

---

## Step 4 — Add `BRAIN.transaction.recordCorrection` helper

Wraps `BRAIN.transaction.record` with the `_isCorrection:true` shape + RECONCILE_CORRECTION source. Closes the `applyBalanceCorrection` allow-list exemption.

```js
recordCorrection(diff, reason) {
  if (typeof diff !== 'number' || isNaN(diff)) return { ok: false, reason: 'invalid-diff' };
  return this.record({
    amt: Math.abs(diff),
    note: reason || 'Balance correction',
    cat: diff > 0 ? 'Income' : 'Adjustment',
    income: diff > 0,
    _balAffected: true,
    _isCorrection: true
  }, BRAIN.SOURCES.RECONCILE_CORRECTION);
}
```

---

## Step 5 — Migrate writers

### 5a — `saveNewDebt` → `BRAIN.debts.add`
Move validation + linked-liability detection logic UP into the caller (UI handler), then call `BRAIN.debts.add(debt, BRAIN.SOURCES.ADD_DEBT)`.

### 5b — `markDebtPaid` → `BRAIN.debts.markPaid`
Becomes a thin shim:
```js
function markDebtPaid(idx) {
  if (idx < 0 || !S.debts[idx]) return;
  const debt = S.debts[idx];
  saveUndoState();
  const r = BRAIN.debts.markPaid(debt.id, BRAIN.SOURCES.CLEAR_DEBT);
  if (!r.ok) {
    showToast('⚠️ Could not clear ' + debt.name + ' — ' + r.reason);
    return;
  }
  closeModal('debt-modal', true);
  onStateChange('debt-paid');
  showUndoToast('Debt marked paid');
  // Auto-link Afterpay logic stays (bills auto-paid when Afterpay debt clears)
}
```

### 5c — `deleteDebt` → `BRAIN.debts.delete`
Direct migration.

### 5d — `confirmWrxAlloc` → loop calls `BRAIN.debts.markPaid` with `WRX_ALLOCATE`
Carloan adjustment stays direct (it's not a debt-array write).

### 5e — `applyBalanceCorrection` txn push → `BRAIN.transaction.recordCorrection`
Inline at the existing call site. Function stays for the S.bal mutation + AUDITOR.record side effects.

### 5f — SCAN-driven debt push at L10141 → `BRAIN.debts.add`
Use `BRAIN.SOURCES.CHAT` (matches scan-via-chat origin) OR add `SCAN_INGEST` source. Pick CHAT for minimal vocab growth — scan flow is chat-adjacent.

---

## Step 6 — Add guardian rule `no-direct-debts-mutation` (AST)

Flag:
- `S.debts.push(...)` outside allow-list
- `S.debts.splice(...)` outside allow-list
- `S.debts = ...` (reassignment) outside allow-list
- `S.debts[<expr>].paid = ...` direct paid-flag write
- `S.debts[<expr>].amt = ...` direct amount write

Allow-list (`DEBTS_WRITER_FNS`):
- `add`, `markPaid`, `unmark`, `update`, `delete` (BRAIN.debts internal methods)
- `load` (migration)
- Priority reorder function (surface name from audit — likely `confirmAutoSort` or similar) until Bundle 16+
- Possibly `markDebtCovered` if it edits in place

---

## Step 7 — Tests (brain.test.js)

~12 new tests target ~66 total:
- `debts.add: happy path returns envelope with debt + id`
- `debts.add: rejects invalid (missing name / amt)`
- `debts.add: ID collision guard (Mission #42 era logic preserved)`
- `debts.markPaid: STRICT abort when transaction.record fails (composition)`
- `debts.markPaid: happy path sets paid:true + creates clearance txn + _txnTs back-ref`
- `debts.unmark: LENIENT proceeds when removeByTs returns not-found`
- `debts.unmark: STRICT aborts on unexpected inner failure`
- `debts.update: whitelist enforces fields (name/amt/rate/notes only)`
- `debts.delete: removes by id, returns envelope`
- `debts.findById / active / total`: reader correctness
- `transaction.recordCorrection: routes through record with RECONCILE_CORRECTION + _isCorrection shape`

---

## Step 8 — Guardian allow-list cleanup

Remove from `TXNS_PUSH_WRITER_FNS`:
- `applyBalanceCorrection` (now routes through `recordCorrection`)
- `confirmWrxAlloc` (now routes through `BRAIN.debts.markPaid`)
- `markDebtPaid` (now routes through `BRAIN.debts.markPaid`)

The Bundle 11 allow-list shrinks from `['record', 'load', 'applyBalanceCorrection', 'confirmWrxAlloc', 'markDebtPaid']` to `['record', 'load']`. The architectural completion.

---

## Step 9 — Update BRAIN_ARCHITECTURE.md to v1.4

- Header bump
- Bubble inventory: BRAIN.debts ✅ Bundle 15
- Known Gaps: Bundle 11 txns-push exemptions resolved
- (Bundle 16 autoDebit redesign already queued in v1.3 known gaps — no change)

---

## Step 10 — Validate + commit + push

```
node guardian-static.js
node guardian-runtime.js
node tests/core.test.js
node tests/brain.test.js
```

Commit: `arch(15): BRAIN.debts bubble + recordCorrection helper + Bundle 11 allow-list closure`

---

## Step 11 — Phone-verify

A. + Add Debt: dialog opens, save creates debt, ID-collision guard works
B. Mark debt paid (debt modal "Mark Paid"): paid:true set, clearance txn appears, balance deducted
C. Unmark (Owed to Mum or any debt): paired clearance txn removed, balance restored
D. Delete debt (debt modal "Delete Debt"): removed from list, no txn impact
E. WRX sale alloc: selected debts get marked paid via canonical path, txns created with WRX_ALLOCATE source visible in audit
F. Balance reconciliation: correction txn created via recordCorrection, _isCorrection flag preserved
G. Priority reorder still works (auto-sort) — NOT migrated this bundle, surface as adjacent debt

---

## End of prompt
