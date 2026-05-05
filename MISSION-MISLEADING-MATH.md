# MISSION: MISLEADING-MATH FIXES — BACKLOG ITEMS 1-13

## ⚠️ Read this header before any code touches the file

**Source:** John's 52-item backlog written 29 April 2026 from real
usage of the deployed app. Items in scope:

- **#1** Spent today doesn't align between Dashboard and Analysis tab
- **#2** Variable expenses calculated into "pay this week" wrongly
- **#8** Dynamic projection "spent so far" wrong ($98 displayed but
  $135 actually spent today)
- **#9** Dynamic projection "Bills remaining $0" when $269 actually due
- **#10** Cascading week total wrongness (downstream of #8 and #9)
- **#12** "This Week $120" total inconsistent with shown bills
- **#13** Netflix monthly bill day-10 vs paid-on-9th confusion

Plus optional:
- **#15** Keyboard closes after every character on expected income input

**The pattern:** every bug here is a "same number computed two
different ways, displays differently" or "filter/categorization wrong"
problem. Each is small individually. The collection is the trust
problem.

**Estimated time:** 90-180 minutes total. Hard stop at 3 hours.

---

## ⚠️ PUSH POLICY

After fixes are committed locally and tests/guardian pass, push to
origin main. John will manually verify on phone using the checklist in
Step 7. May revert if any check fails.

So: investigate → fix one bug at a time → verify each → commit (single
commit) → push → print verification block → STOP.

---

## SUCCESS CRITERIA

1. Dashboard "Spent today" matches Analysis tab "Spent today" (#1)
2. Bills tab "Dynamic Week Projection" shows correct "Bills remaining"
   reflecting actually-unpaid bills due in remaining days of week (#9)
3. "Spent so far" in Dynamic Week Projection matches transaction sum
   for the week-window (#8)
4. "Week total projection" / "This Week $X" is internally consistent —
   the displayed total equals the sum of unpaid items shown (#10, #12)
5. Variable bills are visibly grouped/separated from fixed bills in
   "this week" displays, OR explicitly labeled (#2)
6. Netflix and similar bills with day-of-month near today don't show
   confusing "monthly bill day 10 paid on 9th" UI (#13)
7. (If feasible) Expected income input doesn't lose focus on every
   keystroke (#15)
8. All existing tests still pass + 2-3 new tests for the reconciliation
9. Single commit, manual phone verification gate, push to main
10. No regression to the prior TDZ fix or paidBills fix

---

## CONSTRAINTS

- **Do NOT redesign anything.** Touch calculations and filters only.
- **Do NOT consolidate the dashboard banner with the survival
  forecast.** That's a separate piece of work. The "Bills won't clear
  -$268" banner can stay wrong; it's not in this mission's scope.
- **Do NOT touch the bills tab cascade "BALANCE AFTER" logic.** That's
  the Bills Tab v2 work (#56). Out of scope.
- **Do NOT touch the borrow-estimate / Survival Forecast payday-netting
  bug.** Separate work.
- **Do NOT change visual structure or styling of any tile.**
- **Do NOT touch Plan Mode** (next mission's territory).
- **Single commit.** All fixes in one atomic commit.
- **No "while I'm here" refactors.**

---

## WORK PLAN

### Step 1 — Investigation (15 min, read-only)

For each bug, find and document:

1. **#1 — Spent today mismatch:**
   Find both functions that compute "spent today" — one for Dashboard,
   one for Analysis. Document each: which transactions they include
   (date filter, category filter, correction inclusion).

2. **#8 — "Spent so far" mismatch:**
   Find the function that produces "Spent so far: $98.47 (2 days)" in
   the Dynamic Week Projection. Document its date range and inclusion
   rules.

3. **#9 — "Bills remaining $0":**
   Find the function. Document its filter for "what counts as a
   remaining bill in the current week."

4. **#2 — Variable bills in "pay this week":**
   Find where Fuel ($110, day 5, tag "Variable") gets grouped into the
   Bills tab "This Week" view. Document whether/how variable bills are
   distinguished.

5. **#12 — "This Week $X" total math:**
   Find the function producing the "This Week $120" header AND the
   "Balance after: -$80.19" alongside. Document the math.

6. **#13 — Netflix paid-on-9th confusion:**
   Open the Netflix bill display logic. Document how it formats "day
   10" + paid status. Identify the actual confusing element.

7. **#15 — Keyboard refocus loop (if scoped):**
   Find the expected-income input field. Document its event handlers.
   Likely culprit: re-render on every input event recreating the DOM
   element.

Print findings in a single table:

```
| # | Bug                          | Root cause | Fix complexity |
|---|------------------------------|------------|----------------|
| 1 | Spent today mismatch         | ?          | S/M/L          |
| 2 | Variable bills grouped wrong | ?          | S/M/L          |
| 8 | Spent so far wrong           | ?          | S/M/L          |
| 9 | Bills remaining $0           | ?          | S/M/L          |
| 10| Week total projection cascade| (downstream of 8+9) | -    |
| 12| This Week total inconsistent | ?          | S/M/L          |
| 13| Netflix display confusing    | ?          | S/M/L          |
| 15| Keyboard closes on input     | ?          | S/M/L          |
```

**STOP after Step 1 and confirm scope before editing.** If any bug
turns out to be Large complexity (>45 min), flag it for deferral. If
total estimated time >2.5 hours, DEFER #15 and #13 to a follow-up
mission and confirm with John before proceeding.

---

### Step 2 — Fix #1 (Spent today mismatch) (15-30 min)

Identify which "spent today" calculation is canonical. Likely the one
that:
- Filters transactions by `ts >= startOfToday` (not by some other date logic)
- Excludes income (`income: true`)
- Excludes corrections that reverse spending (the `_isCorrection: true`
  flag)
- Excludes round-ups (the `_isRoundup: true` flag) — these are inside
  spending already
- Includes everything else

Make BOTH the Dashboard "Spent today" and Analysis tab "Spent today"
read from the same canonical function. If they're already in different
places, extract a shared `computeSpentToday(state, now)` and have both
call it.

---

### Step 3 — Fix #8 + #9 + #10 (Dynamic Week Projection) (30-45 min)

These three are related and fix together.

**#8 — "Spent so far"** should equal the sum of expenses in the current
week-window (Monday → today, or whatever the week-start convention is —
verify), excluding income, corrections, round-ups, and bill payments
already counted as bills.

**#9 — "Bills remaining"** should equal the sum of bills in BILLS array
where `b.day >= todayDayOfMonth` AND `b.day <= endOfWeekDayOfMonth` AND
not already paid via paidBills lookup.

**#10 — "Week total projection"** should equal Spent so far + Bills
remaining + projected-living-spend for remaining days. Each component
should match its source.

After this fix, the three lines should reconcile:
```
Spent so far:        $X.XX (N days)
Bills remaining:     $Y.YY
Projected daily:     $Z.ZZ/day × M days = $Z*M
Week total projection: $X + $Y + $Z*M
```

---

### Step 4 — Fix #2 (Variable bills) (10-20 min)

In the Bills tab "This Week" view, where Fuel currently appears
inline with fixed bills, do ONE of these (whichever is smaller):

- Add a label/tag to variable bills saying "ESTIMATED" or "VARIABLE"
  next to the amount, so John knows it's an estimate not a fixed
  obligation
- Group variable bills into a sub-section: "Fixed this week / Variable
  this week (est.)"

Pick whichever is the smaller code change. Goal: John can SEE that Fuel
is variable when looking at the week view.

---

### Step 5 — Fix #12 (This Week total math) (15-30 min)

Find the disagreement: header says "$120 due this week" but the items
shown sum to a different number, or "Balance after bills" doesn't match
balance minus shown items.

Make the header total be the literal sum of the unpaid items
displayed. Make "Balance after" be balance minus that same sum.

If the bills tab cascade ("BALANCE AFTER" inside individual bill rows)
has issues — that's the F5/F6/F7 audit bug pile, OUT OF SCOPE for this
mission. We just fix the header total.

---

### Step 6 — Fix #13 (Netflix display) (10-20 min)

Open how Netflix renders when:
- Today is past day 10 of the month
- Netflix is unpaid for this month
- Or Netflix is paid for this month

Identify what's confusing. Likely candidates:
- "day 10" label rendered when today is day 12 (should say "due 2 days
  ago" or "OVERDUE")
- "paid on 9th" rendered when bill is monthly day-10 (off-by-one)
- Both PAID and DUE pills shown simultaneously

Fix to the simplest clear state. Generic improvement applies to all
similar bills (Amazon Prime, Microsoft, etc).

---

### Step 7 — Fix #15 (Keyboard refocus, optional) (10-20 min if scoped)

Find the expected-income input. The bug is almost certainly:

```js
// Bad: re-renders the input on every keystroke
input.addEventListener('input', e => {
  state.expectedIncome = e.target.value;
  renderEverything();  // recreates the input element, kills focus
});
```

Fix:
```js
// Good: update state without re-rendering this input
input.addEventListener('input', e => {
  state.expectedIncome = e.target.value;
});
input.addEventListener('blur', e => {
  saveState();
  renderEverything();
});
```

Or use a debounced re-render that excludes the focused input.

If it turns out the architecture doesn't support this without a bigger
refactor, defer this one.

---

### Step 8 — Tests (15 min)

Add to `tests/core.test.js`:

```js
test('Spent today: Dashboard and Analysis use same calc', () => {
  // Setup state with known transactions today + corrections + round-ups
  // Call both calc functions, expect same result
});

test('Bills remaining this week excludes paid bills', () => {
  // Setup: today is May 3, Amazon (day 3) paid, Fuel (day 5) unpaid
  // Expect: Bills remaining returns Fuel only, not Amazon
});

test('Week total projection reconciles to components', () => {
  // Setup known state
  // Expect: spent_so_far + bills_remaining + projected_living = week_total
});
```

Adjust to actual function names and test framework patterns.

---

### Step 9 — Commit, push, print verification block (10 min)

```bash
git add index.html tests/core.test.js
git status   # confirm only those 2 files
```

If anything else staged: STOP and report.

```bash
git commit -m "fix(math): reconcile dashboard/analysis 'spent today' and dynamic week projection" \
  -m "Bugs from John's 29 April backlog: #1 spent today mismatch between Dashboard and Analysis. #2 variable bills not distinguished from fixed in 'this week' view. #8 'spent so far' wrong. #9 'bills remaining 0' when bills actually due. #10 week total projection cascade. #12 'this week' total inconsistent with shown items. #13 Netflix bill display confusing. (Optional #15 keyboard refocus on expected income input.)" \
  -m "Fix: extract canonical spent-today calc shared between Dashboard and Analysis. Fix bills-remaining filter to include unpaid bills in remaining days of week. Fix this-week total to equal sum of displayed items. Distinguish variable bills with ESTIMATED tag. Improve Netflix-style overdue/paid display logic."

git push origin main
```

Then print verification block (Step 10).

---

### Step 10 — Verification block

```
═══════════════════════════════════════════════════════════════
MISLEADING-MATH FIXES SHIPPED to xetonx.github.io/slyght

Commit: <new hash>
Tests: NN/NN passing
Guardian: 4/4 passing

Bugs fixed: #1, #2, #8, #9, #10, #12, #13
[#15 fixed | #15 deferred — reason: ...]

═══════════════════════════════════════════════════════════════
JOHN'S MANUAL VERIFICATION ON PHONE:

Wait ~60 seconds for GitHub Pages to redeploy.

Hard-refresh xetonx.github.io/slyght on phone.

[ ] 1. Open Dashboard. Note "Spent today" value.
       Open Analysis tab. Note "Spent today" value.
       Confirm: SAME number on both screens.

[ ] 2. Bills tab → look at "This Week" header total.
       Manually add up the unpaid items shown.
       Confirm: header total = sum of unpaid items.

[ ] 3. Bills tab → Dynamic Week Projection section.
       Confirm: "Bills remaining" is non-zero and reflects
       actually-unpaid bills due in remaining week (Fuel ~$110
       if today is before May 5).

[ ] 4. Bills tab → "This Week" view.
       Look at Fuel ($110, variable monthly).
       Confirm: it's labeled VARIABLE / ESTIMATED, OR grouped
       into a variable sub-section. Distinct from fixed bills.

[ ] 5. Bills tab → Netflix bill (or any monthly bill where today
       is past its day).
       Confirm: status is clear (PAID, OVERDUE, or DUE) without
       conflicting badges. "Day X · paid Y" doesn't mislead.

[ ] 6. (If #15 was fixed) Plan Mode → Expected extra income.
       Type a number with multiple digits.
       Confirm: keyboard stays open, all digits enter, no
       per-keystroke refocus.

[ ] 7. Open Dashboard. Confirm balance still correct.
       Bills tab → Calendar → May 1. Confirm Teachers Health
       still shows paid (no regression to c800400 paidBills fix).

If ALL pass: misleading-math bugs cleared. Next mission: Plan
Mode "what-if" upgrade for May 15 readiness.

If ANY fail: report which one. Run `git revert HEAD && git push`
to roll back. Previous deployed state at c800400 stays good.

═══════════════════════════════════════════════════════════════
```

THEN STOP. Do not continue. Do not start the Plan Mode upgrade.

---

## SAFETY RULES

1. No commits without guardian + tests passing
2. No "while I'm here" refactors
3. Single commit
4. Do not modify Bills Tab cascade "BALANCE AFTER" logic
5. Do not modify Survival Forecast / borrow-estimate logic
6. Do not modify dashboard "Bills won't clear" banner
7. Do not modify Plan Mode
8. Do not touch design or visual structure
9. Hard stop at 3 hours total
10. After Step 1 investigation, if total estimated work exceeds 2.5
    hours, STOP and confirm scope before continuing — defer #15 and
    #13 if needed

---

## Run with

```
Read C:\Users\admin\slyght\MISSION-MISLEADING-MATH.md and execute it
exactly. Single commit + push + verification block. Stop after print.
```
