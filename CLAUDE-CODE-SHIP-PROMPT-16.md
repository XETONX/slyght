# Claude Code Ship Prompt — Bundle 16

> **Status:** DRAFT (queued behind Bundle 15 — Debts).
> **Scope:** Relocate `autoDebit` from per-paid-instance flag to bill-level metadata. UI redesign of bill edit modal + future-paid flow. MI-13 invariant + autoMatch / autoDetect semantics updated to read from bill metadata. 3-way mark-paid modal collapses to 2-way (autoDebit option dies; it's now a bill property).
> **Pre-reqs:** Bundle 15 (Debts) must land first per Opus's plan. Bundle 16 builds on the BRAIN.bills bubble from Bundle 14.
> **Risk:** Medium-high. Touches UI (bill edit modal), schema (BILLS[]), invariant criteria (MI-13), three flow points (calDayClick / withMarkPaidGate / autoMatch+autoDetect). Migration of existing `_scheduledAutoDebit:true` entries must be lossless.
> **Phone-verify:** Required (visible flows: bill edit modal, calendar tap on future auto-debit bills, 3-way → 2-way modal, MI-13 banner).

---

## Background — The semantic gap being closed

User-flagged Bundle 14 verify (2026-05-12): "M13 banner doesn't fire if I list YouTube Premium as auto-debits in the future, but it should recognise that yes this bill auto-debits but this is in the future it shouldn't be marking paid unless the date changes on the bill like did I get charged early?"

**Diagnosis:** `_scheduledAutoDebit` lives in the wrong place. It's a per-paid-instance flag on `S.paidBills[key]`, set when the user picks "Auto-debits monthly" in the 3-way modal. But auto-debit is a property of the BILL itself, not of "this particular month's paid mark." Putting it on the paid mark means:

- User picks "auto-debits" on May 12 for a May 18 YouTube bill
- System pre-marks `2026-5-YouTube Premium-18` with `_scheduledAutoDebit:true`
- Calendar shows May 18 as paid ✅ — except the bank hasn't actually charged yet
- The app is lying about reality between May 12 and May 18
- MI-13 doesn't fire because we *told it to shut up*, not because the bill is paid

**The right model:** `recurring: true` lives on the bill. `autoDebit: true` should too. Same shape: metadata about HOW the bill behaves, not WHAT happened to a particular month's instance.

---

## Standing Discipline (carried forward)

**Pre-authorised decisions:**
- Build artifacts → `git checkout --`
- Guardian-rule fires on canonical helper → inline `guardian-allow` with `(permanent - ...)` ASCII-dash tag
- Tests fail because assertion targets removed code → comment out + note in handoff ERRORS

**Surface required (STOP and ask):**
- The migration's backfill (existing `_scheduledAutoDebit:true` entries → setting `BILLS[name].autoDebit = true`) ambiguous for any bill (e.g., two bills with same name) — flag and surface
- A user has paidBills entries for bills that aren't in current BILLS[] (deleted bills) — flag, don't migrate those (orphans)
- The bill edit modal field changes would visibly change layout — surface for approval before applying CSS

**Handoff format v2 (same as Bundle 14):**
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

HEAD should be Bundle 15 (Debts) commit. Working tree clean.

---

## Step 1 — Audit existing autoDebit references

```
grep -n "_scheduledAutoDebit" index.html
grep -n "isPaidBillAutoDebit\|isAutoDebit" index.html
grep -n "autodebitBtn\|mark-paid-modal" index.html
grep -n "mark-paid-autodebit-btn" index.html
```

Expect findings in:
- `withMarkPaidGate` (the 3-way modal handler)
- `BRAIN.bills` (the `isAutoDebit` reader and structured-shape writes)
- `BRAIN.bills.invariants.checkFutureKeyNotPaid` (skips entries with the flag)
- `autoMatch` / `autoDetect` (writes future-dated entries with the flag)
- The bill modal HTML (the 3-way modal definition + the recurring checkbox area)
- `_consumePendingBillPay` / `consumePendingPay` (writes structured shape with the flag)

**Surface findings as a table** before any edit. Each existing usage gets a Bundle 16 target:

```
EXISTING USAGE                         CURRENT BEHAVIOR             BUNDLE 16 TARGET
withMarkPaidGate autodebitBtn handler  Flips _pendingPay.autoDebit  GONE — autoDebit no longer a per-mark choice
3-way mark-paid-modal HTML             3 buttons                    2 buttons (Paid manually / Cancel)
BRAIN.bills.isAutoDebit(key)           Reads per-instance flag      Reads BILLS[name].autoDebit via key→bill resolution
BRAIN.bills.invariants check           Skips _scheduledAutoDebit    Skips bills with bill.autoDebit:true
autoMatch / autoDetect                 Sets flag for future-dated   Reads bill.autoDebit; doesn't set flag
markPaid txnTs link mode               Auto-sets autoDebit for fut. Reads bill.autoDebit
Bill edit modal                        Has Recurring checkbox       ADD Auto-debits checkbox
calDayClick on future bill             Pay Now / Already paid btns  If bill.autoDebit + future day: informational msg only
```

**STOP after audit.** Confirm scope with user before editing.

---

## Step 2 — Schema migration: `_scheduledAutoDebit` → `BILLS[].autoDebit`

### 2a — Add to BILLS schema

```js
// In BILLS array literal (search: const BILLS = [):
// Add autoDebit:true to bills John has confirmed auto-debit via the
// existing 3-way modal flow. Audit S.paidBills entries with
// _scheduledAutoDebit:true at boot to determine which bills.
//
// EXPECT (per John's bank reality as of 2026-05-12):
//   YouTube Premium  — autoDebit:true
//   Spotify          — autoDebit:true
//   Rent             — autoDebit:false (manual / via Mum account)
//   KIA Loan         — autoDebit:true (Firstmac direct debit)
//   NRMA insurance   — autoDebit:true
//   ... etc.
//
// Surface the final list before editing — John confirms which bills
// actually auto-debit. Don't infer from paidBills alone (might have
// noise from accidental "auto-debit" choices in the 3-way modal).
```

**STOP after surfacing the proposed `autoDebit:true/false` list per bill. John confirms which bills auto-debit before any BILLS edit.**

### 2b — One-time migration in `load()`

```js
// Bundle 16: backfill autoDebit metadata. For each existing
// _scheduledAutoDebit:true entry in S.paidBills, find the corresponding
// bill in BILLS by name and set bill.autoDebit = true. Then delete
// the per-instance flag (the bill metadata supersedes it).
//
// Safety: if the underlying bill is missing (deleted bill), surface
// the orphan paidBills entries in console + leave them alone. Don't
// mass-cleanup; let the next render's MI-13 check handle them.
if (!S._bundle16AutoDebitMigrationV1) {
  try {
    const seen = new Set();
    Object.keys(S.paidBills || {}).forEach(k => {
      const entry = S.paidBills[k];
      if (!entry || typeof entry !== 'object') return;
      if (!entry._scheduledAutoDebit) return;
      const m = k.match(/^\d{4}-\d{1,2}-(.*)-\d{1,2}$/);
      if (!m) return;
      const billName = m[1];
      const bill = BILLS.find(b => b.name === billName);
      if (bill) {
        bill.autoDebit = true;
        seen.add(billName);
      } else {
        console.warn('[Bundle 16] orphan paidBills entry — bill not found:', billName);
      }
      // Strip per-instance flag now that the bill carries the truth.
      // The structured shape stays (paid, ts, _txnTs) — only
      // _scheduledAutoDebit is removed.
      delete entry._scheduledAutoDebit;
    });
    if (typeof BRAIN !== 'undefined' && BRAIN.audit) {
      try { BRAIN.audit.append({
        type: 'bundle16_autodebit_migration',
        billsMigrated: Array.from(seen),
        ts: Date.now()
      }); } catch(_) {}
    }
    S._bundle16AutoDebitMigrationV1 = true;
    save();
  } catch (e) {
    console.error('[Bundle 16] migration failed; will retry next load', e);
  }
}
```

---

## Step 3 — Update `BRAIN.bills.isAutoDebit` to read from bill metadata

```js
isAutoDebit(key) {
  // Bundle 16: read from BILLS[].autoDebit (canonical) with fallback
  // to legacy per-instance _scheduledAutoDebit flag for entries that
  // weren't migrated (e.g., very stale localStorage, snapshot replay).
  if (typeof BILLS !== 'undefined') {
    const m = key && key.match(/^\d{4}-\d{1,2}-(.*)-\d{1,2}$/);
    if (m) {
      const bill = BILLS.find(b => b.name === m[1]);
      if (bill && bill.autoDebit === true) return true;
      if (bill && bill.autoDebit === false) return false; // explicit
    }
  }
  // Fallback to legacy flag for backwards compat
  return isPaidBillAutoDebit(key);
},
```

The free function `isPaidBillAutoDebit` stays unchanged (legacy reader). The bubble method becomes the canonical surface and prefers bill metadata.

---

## Step 4 — Update `BRAIN.bills.invariants.checkFutureKeyNotPaid`

The invariant currently skips entries where `BRAIN.bills.isAutoDebit(key)` returns true. After Step 3, that reader prefers bill metadata. **No change needed to the invariant logic itself** — Step 3's reader change propagates through.

Add a comment block above the invariant explaining the Bundle 16 reader change:
```js
// Bundle 16: BRAIN.bills.isAutoDebit now reads from BILLS[].autoDebit
// (bill metadata) instead of the per-paid-instance flag. The invariant
// logic is unchanged — it asks "is this auto-debit?" via the canonical
// reader, which now sources truth from the bill itself.
```

---

## Step 5 — `withMarkPaidGate` → 2-way modal

Bill modal HTML (search: `id="mark-paid-modal"`):
```html
<!-- Bundle 16: 3-way modal collapses to 2-way. The autoDebit option
     is now bill metadata (set in bill edit modal), not a per-action
     choice. For non-autoDebit bills past their due date or in the
     past, "Paid manually" + Cancel is the right surface. For
     autoDebit bills, withMarkPaidGate bypasses this modal entirely
     (returns "this is an auto-debit bill" status). -->
<button onclick="..." id="mark-paid-manual-btn">Paid manually</button>
<button onclick="..." id="mark-paid-cancel-btn">Cancel</button>
<!-- DELETE id="mark-paid-autodebit-btn" -->
```

```js
function withMarkPaidGate(bill, action) {
  // Bundle 16: for autoDebit bills, the user shouldn't be marking
  // paid at all — the bank handles it. Show informational toast.
  if (bill && bill.autoDebit === true) {
    showToast('🤖 ' + bill.name + ' auto-debits on day ' + bill.day + ' — system tracks when the charge lands');
    return;
  }
  // For non-autoDebit bills past due (no future flag needed) just fire
  // the action directly.
  if (!bill || canMarkBillPaid(bill)) { action(); return; }
  // 2-way modal for non-autoDebit future-dated bills (rare — user
  // explicitly trying to pre-mark a manual-pay bill).
  const titleEl = document.getElementById('mark-paid-title');
  const subEl = document.getElementById('mark-paid-subtitle');
  const manualBtn = document.getElementById('mark-paid-manual-btn');
  const modal = document.getElementById('mark-paid-modal');
  if (!titleEl || !subEl || !manualBtn || !modal) {
    if (confirm(bill.name + " isn't due until day " + bill.day + ". Mark as paid anyway?")) action();
    return;
  }
  titleEl.textContent = bill.name;
  subEl.textContent = "Due day " + bill.day + " — early mark?";
  manualBtn.onclick = function() {
    closeModal('mark-paid-modal');
    action();
  };
  modal.classList.add('open');
}
```

The `autodebitBtn.onclick` handler block deletes entirely. The `BRAIN.bills._pendingPay.autoDebit` flag flip dies with it (no longer needed — bill metadata is the truth).

---

## Step 6 — `BRAIN.bills.markPaid` — drop the autoDebit option

```js
markPaid(bill, source, options) {
  if (!source || !BRAIN._SOURCE_SET.has(source)) {
    return { ok: false, reason: 'unknown-source:' + source };
  }
  if (!bill || !bill.name || typeof bill.day !== 'number') {
    return { ok: false, reason: 'invalid-bill' };
  }
  // Bundle 16: autoDebit is read from bill metadata, not options.
  // Refuse to mark an autoDebit bill paid in advance — the bank handles it.
  if (bill.autoDebit === true) {
    const now = new Date();
    if (bill.day > now.getDate()) {
      return { ok: false, reason: 'autoDebit-future-no-premark', billName: bill.name, day: bill.day };
    }
    // For autoDebit bills on or past their day, allow the mark (the
    // charge has happened — record it). Auto-set the flag.
  }
  const opts = options || {};
  const key = paidBillKey(bill.name, bill.day);
  let txnTs;
  // No more autoDebit option — Bundle 16 removed it. The flag is set
  // automatically based on bill.autoDebit metadata at write time below.
  if (typeof opts.txnTs === 'number') {
    const linked = BRAIN.transaction.findByTs(opts.txnTs);
    if (!linked) return { ok: false, reason: 'linked-txn-missing', txnTs: opts.txnTs };
    txnTs = opts.txnTs;
  } else {
    const billAmt = (typeof bill.amt === 'number') ? bill.amt : 0;
    const txnSource = (source === BRAIN.SOURCES.PAY_BILL_NOW)
      ? BRAIN.SOURCES.PAY_BILL_NOW : BRAIN.SOURCES.MARK_BILL_PAID;
    const rec = BRAIN.transaction.record(
      { amt: billAmt, note: bill.name + ' paid', cat: bill.tag || 'Bills', income: false, _balAffected: true },
      txnSource
    );
    if (!rec.ok) return { ok: false, reason: 'inner-' + rec.reason };
    txnTs = rec.ts;
  }
  // _setPaidEntry no longer needs autoDebit param — reads from bill metadata.
  return this._setPaidEntry(key, { bill, txnTs, source });
},
_setPaidEntry(key, ctx) {
  if (!S.paidBills) S.paidBills = {};
  // Bundle 16: structured shape minus _scheduledAutoDebit. The bill
  // metadata is the source of truth; the per-instance flag is no
  // longer set on new entries (legacy entries keep theirs until the
  // migration in Step 2b strips them).
  S.paidBills[key] = { paid: true, ts: ctx.txnTs, _txnTs: ctx.txnTs };
  BRAIN.audit.append({
    type: 'bill_mark_paid', key,
    autoDebit: !!(ctx.bill && ctx.bill.autoDebit),
    txnTs: ctx.txnTs, source: ctx.source, ts: Date.now()
  });
  try { save(); } catch(_) {}
  return { ok: true, key, entry: S.paidBills[key] };
},
```

Note the new failure reason: `autoDebit-future-no-premark`. This is the load-bearing semantic — the architecture refuses to lie about future auto-debit bills.

---

## Step 7 — `calDayClick` — informational message for auto-debit future bills

```js
function calDayClick(day) {
  // ... existing code finds items ...
  // For each unpaid bill in items, render the row:
  bills.forEach(it => {
    const b = it.bill;
    const bPaid = isThisMonthlyBillPaid(b.name, b.day, calMonth, calYear);
    if (bPaid) {
      // ... existing TRACKED + Unmark row ...
    } else if (b.autoDebit === true && _isInFuture(b.day, calMonth, calYear)) {
      // Bundle 16: future auto-debit bill — informational only.
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;margin-bottom:8px">' +
        '<div><div style="color:var(--text);font-size:14px;font-weight:600">'+esc(b.name)+' <span style="font-size:11px;color:var(--text3)">🤖</span></div>' +
        '<div style="color:var(--text2);font-size:12px">$'+b.amt.toFixed(2)+' — auto-debits on day '+b.day+'</div></div>' +
        '<div style="color:var(--text3);font-size:11px;font-style:italic">Tracks when charge lands</div>' +
        '</div>';
    } else {
      // ... existing Pay now / Already paid row ...
    }
  });
}
```

Add a helper `_isInFuture(day, month, year)` that compares against today.

---

## Step 8 — `autoMatch` / `autoDetect` — no longer set per-instance flag

```js
autoMatch(opts) {
  // ... existing scan loop ...
  // Bundle 16: markPaid no longer needs autoDebit option — reads from
  // bill.autoDebit. Removing { autoDebit: true } that was implicit in
  // Bundle 14's link mode for future bills.
  const r = this.markPaid(b, BRAIN.SOURCES.AUTO_MATCH, { txnTs: matchTxn.ts });
  // ...
}
```

Same edit for `autoDetect`. The `bill.autoDebit` check inside `markPaid` (Step 6) is the new gate.

---

## Step 9 — Bill edit modal: add "Auto-debits" checkbox

Search for the bill edit modal HTML (the one that lets you edit a bill's name/amount/day/recurring):

```
grep -n "id=\"bill-modal\"" index.html
grep -n "id=\"bm-recurring\"" index.html  (or similar)
```

Add a checkbox alongside Recurring. CSS may need a small tweak to keep the layout clean. **Surface the proposed HTML before applying** so John can confirm placement.

Wire it to the bill object on save (mark-paid or edit flow):
```js
const _bmad = $('bm-autodebit');
if (_bmad) b.autoDebit = !!_bmad.checked;
```

---

## Step 10 — Tests

Add to `tests/brain.test.js`:

```js
test('bills.markPaid: refuses to pre-mark autoDebit future bill (autoDebit-future-no-premark)', () => {
  resetS();
  const tomorrow = new Date().getDate() + 1; // assumes test month has tomorrow
  const r = BRAIN.bills.markPaid(
    { name: 'YouTube Premium', day: tomorrow, amt: 16.99, autoDebit: true },
    BRAIN.SOURCES.MARK_BILL_PAID
  );
  expect(r.ok).toBe(false);
  expect(r.reason).toBe('autoDebit-future-no-premark');
  // No paidBills entry created
  expect(!!S.paidBills[paidBillKey('YouTube Premium', tomorrow)]).toBe(false);
});

test('bills.markPaid: ALLOWS autoDebit bill mark on or past its day', () => {
  resetS();
  const today = new Date().getDate();
  const r = BRAIN.bills.markPaid(
    { name: 'YouTube Premium', day: today, amt: 16.99, autoDebit: true },
    BRAIN.SOURCES.MARK_BILL_PAID
  );
  expect(r.ok).toBe(true);
});

test('bills.isAutoDebit: prefers bill metadata over per-instance flag', () => {
  resetS();
  // Mock a BILLS array with autoDebit:true on this bill
  // (test framework may need to expose BILLS — surface this if not).
  const key = paidBillKey('YouTube Premium', 18);
  // Even with NO _scheduledAutoDebit on the paidBills entry, bill
  // metadata flag should make isAutoDebit return true.
  S.paidBills[key] = { paid: true, ts: 1, _txnTs: 1 }; // no flag
  // BILLS[YouTube Premium].autoDebit = true (set up in test BILLS mock)
  expect(BRAIN.bills.isAutoDebit(key)).toBe(true);
});

test('migration: _scheduledAutoDebit:true entries set BILLS[name].autoDebit and strip the flag', () => {
  // (Migration runs in load(); test simulates it.)
  // Setup: paidBills has entry with _scheduledAutoDebit:true
  // Run migration logic
  // Assert: BILLS[that-name].autoDebit === true AND entry._scheduledAutoDebit is gone
});
```

Target: +5-7 tests, bringing total to ~60.

---

## Step 11 — Update `BRAIN_ARCHITECTURE.md` to v1.4

Bump status header to v1.4. Add subsection under Known Gaps:

```markdown
### autoDebit semantics (v1.4 — Bundle 16)

`autoDebit` was originally a per-paid-instance flag on
`S.paidBills[key]._scheduledAutoDebit` (Bundle 7). Bundle 16 relocates
it to bill-level metadata (`BILLS[].autoDebit`). Reasons:

1. autoDebit is a property of HOW the bill is paid, not of WHAT
   happened to one month's instance. Same shape as `recurring:true`.
2. Pre-marking an autoDebit bill paid before the bank charge lands
   makes the calendar lie about reality. Bundle 16 refuses this:
   `markPaid` returns `{ok:false, reason:'autoDebit-future-no-premark'}`
   when called on an autoDebit bill in the future.
3. `BRAIN.bills.isAutoDebit` now reads from bill metadata (canonical)
   with fallback to legacy per-instance flag for un-migrated entries.

Migration backfills: any `_scheduledAutoDebit:true` paidBills entry
sets `BILLS[name].autoDebit = true` then strips the per-instance flag.
Orphan entries (bill not in BILLS) are logged but not touched.
```

Bump bubble inventory:
```
| `BRAIN.bills` | Bills lifecycle ... | ✅ Bundle 14, autoDebit relocated Bundle 16 |
```

---

## Step 12 — Validation + commit

```
node guardian-static.js
node guardian-runtime.js
node tests/core.test.js
node tests/brain.test.js
```

Expected: static 0, runtime 47/50, core 41/41, brain ~60/~60.

Commit:
```
arch(16): autoDebit relocates to bill metadata + 2-way modal + MI-13 reads from bill
```

---

## Step 13 — Phone-verify

| # | Test | PASS criteria |
|---|------|---|
| 16.A | Bill edit modal "Auto-debits" checkbox | Checkbox appears alongside Recurring; toggling persists across reload |
| 16.B | Calendar tap on future autoDebit bill | Shows informational row (🤖 icon + "auto-debits on day X — tracks when charge lands"); NO Pay now / Already paid buttons |
| 16.C | Calendar tap on future NON-autoDebit bill | Shows Pay now + Already paid buttons (existing flow) |
| 16.D | Calendar tap on PAST or TODAY autoDebit bill | Shows Pay now + Already paid (charge has happened or is today) |
| 16.E | "Already paid" on autoDebit future bill via any surface | Refused with toast "🤖 X auto-debits on day Y — system tracks when the charge lands" |
| 16.F | 3-way modal now 2-way | Only Paid manually + Cancel; no Auto-debits option |
| 16.G | Migration ran on first load | YouTube + Spotify + KIA Loan etc. have BILLS[].autoDebit:true; existing paidBills entries stripped of _scheduledAutoDebit |
| 16.H | MI-13 banner still suppressed for autoDebit bills | Pre-mark a future autoDebit bill (via the canonical path post-Bundle-16) — banner doesn't fire because BILLS[].autoDebit:true |
| 16.I | autoMatch / autoDetect on autoDebit bills | When a txn matches an autoDebit bill, paidBills entry created without per-instance flag (bill metadata carries truth) |

A through G critical.

---

## End of prompt
