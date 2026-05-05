# MISSION: HOTFIX — paidBills MONTH-AWARE LOOKUP

## ⚠️ Read this header before any code touches the file

A bug shipped in `a76f297` (and earlier): the function(s) that check
"is this bill paid for the rendered month?" construct their lookup key
from `today.getMonth()` instead of the *rendered* month. So when the
calendar or Bills tab renders a future month, paid-status from THIS
month bleeds across.

**Concrete symptoms verified tonight by John:**

1. Calendar day-detail modal: May 3, 2026 shows Amazon Prime as PAID
   (green pill). Today is April 29. May 3 is in the future. Should be
   unpaid.
2. Bills tab "This Week" total shows $120, with Amazon Prime $9.99 line
   crossed out as paid. If it's truly paid, total should be $110 (Fuel
   only). Both can't be true.

**Same shape of bug as the original May 1 double-count.** Same fix
pattern: pass rendered month/year through, build the key from that.

**Reference document:** `C:\Users\admin\slyght\AUDIT-FOUNDATION.md`
Section 3 flagged this fragility:
> "Bills tab 'Due Today' / 'This Week' | renderBillsGrouped | totals |
>  canonical | ⚠️ FRAGILE — inline `isPaid` check duplicates
>  `isThisMonthlyBillPaid` (4338) without legacy-name fallback"

Two suspect functions. Both may have the same bug. We consolidate to
one and make it month-aware.

**Estimated time:** 30–45 minutes. Hard stop at 75 minutes.

---

## ⚠️ PUSH POLICY

After the fix is committed locally and tests/guardian pass, push to
origin main. John will then manually verify on phone using the
checklist in Step 7. **He may revert** if verification fails.

So: commit + push + print verification block + STOP.

---

## SUCCESS CRITERIA

1. The function `isThisMonthlyBillPaid(bill)` (or whatever it's called)
   accepts an optional `(month, year)` parameter pair. When omitted, it
   defaults to today's month/year (preserving existing call sites that
   want today). When provided, it uses those values to construct the
   lookup key.
2. Every call site that renders a SPECIFIC month (calendar
   day-detail, Bills tab "This Week" / "This Month" / "Paid this month",
   `renderBillsGrouped`, model `buildCalendarEntries`) passes the
   rendered month/year explicitly.
3. Any inline duplicate of the paid-check (line 4338 area, plus any
   others discovered) is replaced with a call to the canonical function.
4. New unit test verifies May 3 Amazon Prime is NOT marked paid when
   today is April 29 and the April Amazon Prime IS paid.
5. New unit test verifies "This Week" total only includes unpaid bills
   for the rendered week.
6. All existing tests still pass (24/24 + 2 new = 26/26).
7. Guardian passes (4/4 layers).
8. Pushed to `origin main`.
9. John manually verifies on phone:
   - May 3 day-detail modal shows Amazon Prime as UNPAID (or doesn't
     show it as PAID with green pill)
   - "This Week" total in Bills tab is internally consistent (paid bills
     don't count toward the total)

---

## CONSTRAINTS

- **Do NOT touch the Phase 2C work on `phase-2c-and-tdz-pending`
  branch.** Hands off.
- **Do NOT modify the model's coverage logic.** That's Phase 2C scope.
- **Do NOT cherry-pick anything from `phase-2c-and-tdz-pending`.**
- **Single commit.** The fix is small and atomic.
- **Pass `(month, year)` as parameters, not via global state.** Same
  discipline as the May 1 fix. No `today.getMonth()` inside the lookup
  function itself.
- **Default behavior preserved.** Calls that don't pass month/year
  still work as before (use today). This way we don't break any caller
  we miss.

---

## WORK PLAN

### Step 1 — Investigation (5 min, read-only)

1. Find `isThisMonthlyBillPaid` function. Quote line number and full body.
2. Find the inline duplicate the audit flagged at line 4338 area. Quote it.
3. Search for ALL call sites of `isThisMonthlyBillPaid`:
   ```
   grep -n "isThisMonthlyBillPaid\|paidBills\[" index.html
   ```
4. List every call site with a one-line description of which month it's
   trying to check (today vs rendered).
5. Print findings, then proceed to Step 2.

If there are MORE than 2 places doing the lookup (canonical + inline
duplicate), list them all and STOP for confirmation before editing.

---

### Step 2 — Fix the canonical function (10 min)

Modify `isThisMonthlyBillPaid(bill)` to accept optional month/year:

```js
function isThisMonthlyBillPaid(bill, month, year) {
  const now = new Date();
  const m = (month !== undefined) ? month : now.getMonth();
  const y = (year !== undefined) ? year : now.getFullYear();
  const key = y + '-' + (m + 1) + '-' + bill.name + '-' + bill.day;
  return S.paidBills && S.paidBills[key] === true;
}
```

(Adjust to match the existing key format — the snapshot shows keys like
`2026-4-Amazon Prime-3` so the format is `YYYY-M-Name-Day` where M is
1-indexed month. Verify this against the existing function before
changing.)

---

### Step 3 — Update every call site that renders a specific month (10 min)

For each call site identified in Step 1:

- **Calendar day-detail modal**: passes the rendered date's month/year.
- **`renderBillsGrouped`**: probably renders for current month, so
  default behavior is fine — but verify. If it ever renders future
  weeks (the "This Week" total can span April 29 → May 5), it needs the
  bill's *due date's* month/year.
- **`buildCalendarEntries`**: when checking `paidBills` during model
  build, use the rendered month being walked, not today.

For the "This Week" subview: each bill in the week has a due date.
Compute that bill's due-month and due-year (could be next month if the
week crosses), pass those when calling `isThisMonthlyBillPaid`.

Replace the inline duplicate at line 4338 area with a call to
`isThisMonthlyBillPaid(bill, billDueMonth, billDueYear)`.

---

### Step 4 — Add unit tests (10 min)

Append to `tests/core.test.js`:

```js
test('Paid lookup: April-paid Amazon Prime is NOT paid in May', () => {
  // Setup: April Amazon Prime is paid; today is April 29.
  const stateA = JSON.parse(JSON.stringify(S));
  stateA.paidBills = { '2026-4-Amazon Prime-3': true };
  const amazonBill = BILLS.find(b => b.name === 'Amazon Prime');
  // Same bill, checked for May (month=4, year=2026):
  const paidInMay = isThisMonthlyBillPaid(amazonBill, 4, 2026);
  expect(paidInMay).toBe(false);
  // Sanity: April should still be true.
  const paidInApril = isThisMonthlyBillPaid(amazonBill, 3, 2026);
  expect(paidInApril).toBe(true);
});

test('Paid lookup: default behavior unchanged (today month)', () => {
  // No month/year arg should default to today's month/year.
  const stateA = JSON.parse(JSON.stringify(S));
  const now = new Date();
  const todayKey = now.getFullYear() + '-' + (now.getMonth()+1) + '-Amazon Prime-3';
  stateA.paidBills = { [todayKey]: true };
  const amazonBill = BILLS.find(b => b.name === 'Amazon Prime');
  // Note: assigning to S directly here for the test; if tests use a
  // shared mock state, adjust as needed.
  const oldPaid = S.paidBills;
  S.paidBills = stateA.paidBills;
  try {
    expect(isThisMonthlyBillPaid(amazonBill)).toBe(true);
  } finally {
    S.paidBills = oldPaid;
  }
});
```

If the test framework needs adjustments for how `S` and `BILLS` are
exposed, simplify the test rather than reshape the framework. The key
assertion is: passing `(month=4, year=2026)` to a bill paid in April
returns `false`.

---

### Step 5 — Run guardian + tests (5 min)

```
node tests/core.test.js
node guardian-all.js
```

Both must pass green. 26/26 tests, 4/4 guardians.

If anything fails: STOP, paste output, debug. Don't push broken state.

---

### Step 6 — Commit and push (5 min)

```
git add index.html tests/core.test.js
git status   # confirm only those 2 files staged
```

If anything else is staged: STOP and report.

```
git commit -m "fix(bills): isThisMonthlyBillPaid accepts rendered month/year — fixes cross-month paid-status bleed" -m "Bug: function used today.getMonth() to construct paidBills lookup key, so April-paid bills appeared as PAID in May calendar/bills views. Symptoms: May 3 day-detail showing Amazon Prime PAID with green pill; This Week total including paid bills." -m "Fix: function now accepts optional (month, year) parameters. Defaults to today's month/year when omitted (preserves all existing default callers). All callers that render a specific month/year now pass it explicitly. Inline duplicate at renderBillsGrouped consolidated to canonical function." -m "Tests: 26/26 passing (24 prior + 2 new). Guardian: 4/4 passing."

git push origin main
```

---

### Step 7 — Print verification block and STOP

```
═══════════════════════════════════════════════════════════════
HOTFIX SHIPPED to xetonx.github.io/slyght

Commit: <new hash>
Tests: 26/26 passing
Guardian: 4/4 passing

═══════════════════════════════════════════════════════════════
JOHN'S MANUAL VERIFICATION ON PHONE:

Wait ~60 seconds for GitHub Pages to redeploy.

Hard-refresh xetonx.github.io/slyght on phone.

[ ] 1. Bills tab → tap forward arrow on calendar to MAY 2026.
       Tap May 3.
       Confirm: Amazon Prime shown as UNPAID (no green PAID pill,
       OR not shown at all if rendering defaults to unpaid future
       bills only).

[ ] 2. Bills tab → "This Week" section.
       Confirm: total adds up correctly. If a bill is shown crossed
       out as paid, it should NOT count toward the total.

[ ] 3. Calendar tab → APRIL 2026 → tap April 3 (or wherever Amazon
       Prime was paid this month).
       Confirm: STILL shows as PAID for April. (Default-month behavior
       preserved.)

[ ] 4. Open dashboard. Confirm balance, NW, debts, recent spending
       all still populate correctly. (No regression from the fix.)

[ ] 5. Calendar → MAY 2026 → tap May 1.
       Confirm: Teachers Health bill $259.41 still shows correctly
       (the May 1 fix from earlier still works).

If ALL 5 pass: hotfix successful. Sleep.
If ANY fail: report which one. Run `git revert HEAD && git push` to
roll back. The previous TDZ fix at 56896d8 stays in place.

═══════════════════════════════════════════════════════════════
```

THEN STOP. Do not continue. Do not touch phase-2c-and-tdz-pending.

---

## SAFETY RULES

1. No commits without guardian + tests passing.
2. No "while I'm here" refactors. Only the paidBills lookup logic.
3. Single commit.
4. Do not modify model coverage logic — that's Phase 2C.
5. Do not touch `phase-2c-and-tdz-pending` branch.
6. Hard stop at 75 minutes. If mid-step, abort and report.

---

## Run with

```
Read C:\Users\admin\slyght\MISSION-HOTFIX-PAIDBILLS.md and execute it
exactly. Reference AUDIT-FOUNDATION.md Section 3 for the fragility
note. Single commit + push + verification block. Stop after print.
```
