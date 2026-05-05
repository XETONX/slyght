# MISSION: PLAN MODE WHAT-IF UPGRADE — BACKLOG ITEMS 46-49

## ⚠️ Read this header before any code touches the file

**Source:** John's 52-item backlog written 29 April 2026, plus today's
explicit need: "I can use Plan Mode to actually plan my salary and what
I can add after like dentist etc."

**Items in scope:**
- **#46** Editable early repayment fee with live recalc
- **#47** Bonus preview with allocation impact
- **#48** Locked non-negotiable transparency (show the math)
- **#49** Slider affordability check (real-time feedback)

**Real-world driver:** John has payday on May 15 (12 days away). He
needs to decide things like "can I afford a $400 dentist visit" or
"can I book $2,000 flights" once the salary lands. Plan Mode is the
screen he loves and trusts most. These four items make Plan Mode an
actual planning tool, not just a display.

**Estimated time:** 2-3 hours. Hard stop at 3.5 hours.

---

## ⚠️ PUSH POLICY

Single commit, manual phone verification, push to main. Same flow as
the previous two missions (TDZ fix, paidBills fix, misleading-math
fixes — all worked cleanly with this gate).

investigate → fix one item at a time → test → commit (single) → push →
print verification block → STOP.

---

## SUCCESS CRITERIA

1. **#48** — Plan Mode "Locked non-negotiable" amount has a
   tap-to-expand breakdown showing each component (income, rent, KIA,
   other bills, etc.) and the math that produces the final figure
2. **#47** — When user enters an expected bonus amount, Plan Mode
   shows a preview of impact: new daily figure, suggested allocation
   options, accelerated debt payoff months
3. **#46** — Early repayment fee field is editable inline; changing it
   recalculates the WRX/KIA analysis (months saved, interest saved,
   net saving) in real-time
4. **#49** — Goal/savings sliders show real-time affordability
   feedback as they move: if a slider value would push daily below the
   weekday budget, show a warning + suggestion
5. Single commit, all 4 items in one atomic change
6. All existing tests pass + 3-4 new tests for the recalculation logic
7. No regression to dashboard, bills tab, or recent fixes (5c6e219,
   c800400, 56896d8)

---

## CONSTRAINTS

- **Do NOT redesign Plan Mode visually.** John explicitly loves the
  current Plan Mode UI. Touch only the calculation transparency,
  add interactivity, expand existing controls. No layout overhaul.
- **Do NOT modify dashboard or bills tab.** Out of scope.
- **Do NOT touch the design system / primitives** (post-payday work).
- **Do NOT add new tabs or new screens.** Everything happens inside
  the existing Plan Mode.
- **Do NOT touch Survival Forecast borrow-estimate logic.** Separate
  pending work.
- **Single commit.**
- **No "while I'm here" refactors.**

---

## WORK PLAN

### Step 1 — Investigation (20 min, read-only)

For each item, find the existing code and document:

1. **#48 — Locked non-negotiable:**
   Find where Plan Mode displays the "locked non-negotiable" amount.
   Document its current calculation: which fields it sums, what
   formula. Check if a tap-to-expand pattern already exists elsewhere
   in the app (likely in NumberDisplay-style components if they
   exist) — if so, reuse it.

2. **#47 — Bonus preview:**
   Find the "Expected extra income" / bonus input. Document its
   current handler. Find where post-bonus daily/discretionary values
   could be displayed. Identify what fields the preview needs to
   compute (daily budget recalc, suggested allocations, debt payoff
   acceleration).

3. **#46 — Early repayment fee:**
   Find the WRX/KIA analysis section. Locate the hardcoded "$382
   (2 months interest)" or equivalent. Document the recalculation
   chain: fee → months saved → interest saved → net saving figure.
   Identify what becomes editable.

4. **#49 — Slider affordability:**
   Find the goal/savings sliders in Plan Mode. Document their current
   `oninput` / `onchange` handlers. Identify what affordability
   calculation should happen as the slider moves (daily impact
   estimation, breach of weekday/weekend budget thresholds,
   suggestions when over).

Print findings:

```
| # | Item               | Current location | Complexity | Risk areas |
|---|--------------------|------------------|------------|------------|
| 46| Early repayment fee| line ###         | S/M/L      | ?          |
| 47| Bonus preview      | line ###         | S/M/L      | ?          |
| 48| Locked transparency| line ###         | S/M/L      | ?          |
| 49| Slider affordability| line ###        | S/M/L      | ?          |
```

**STOP after Step 1 and confirm scope before editing.** If any item is
Large complexity (>60 min), flag for deferral. If total estimated time
exceeds 3 hours, recommend cutting #46 or #49 (the less May-15-critical
items).

---

### Step 2 — Fix #48 (Locked non-negotiable transparency) (30-45 min)

This is the foundation — the "show the math" pattern that other items
will reference.

The locked non-negotiable value is currently displayed as a single
number. Add a tap-to-expand breakdown showing:

```
Income (May 15 payday)              +$7,282.33
─────────────────────────────────────
Rent + Deposit Savings              −$3,000.00
KIA Loan — Firstmac                   −$780.00
Optus — Phone + Internet              −$194.00
[other locked bills...]              −$XXX.XX
Property Deposit (via Mum, viaRent)  $0.00 (handled in rent)
─────────────────────────────────────
Locked non-negotiable                 $XXXXX
Discretionary remainder               $XXXX
```

The expand control can be a small caret icon or a "Show breakdown"
text link next to the figure. Tapping toggles visibility of the
breakdown rows.

Apply the same pattern to the discretionary remainder if it makes
sense in context.

If the existing Plan Mode has its own breakdown components, reuse
them. Don't invent new visual patterns — match the existing Plan Mode
language.

---

### Step 3 — Fix #47 (Bonus preview with allocation) (30-45 min)

When user enters a number into the "Expected extra income" / bonus
field, show a preview block underneath:

```
With $1,500 bonus expected:

  Daily budget becomes:        $XX/day  (was $YY/day)
  Or allocate the bonus:
    → China Holiday (+$1,500)  Goal reached: N months sooner
    → KIA payoff (+$1,500)     N months saved · $XX interest saved
    → Split: ##% / ##% / ##%   Custom allocation
```

The preview is informational — it doesn't auto-allocate. User can
choose an allocation by tapping one of the options OR via the
sliders. Tapping an option pre-fills the slider arrangement.

If "Plan Mode locking" or "lock this plan" already exists as a
concept, the bonus preview integrates with that flow — bonus is part
of the plan once locked.

---

### Step 4 — Fix #46 (Editable early repayment fee) (20-30 min)

Find the WRX/KIA analysis. Locate the early repayment fee figure
(likely "$382 (2 months interest)" or similar).

Make it inline-editable: tap → input field → blur saves and
recalculates. The downstream fields (months saved, total interest
saved, net saving) update in real-time.

Add a small "(default: 2 months interest)" hint near the field so
user knows what the original estimate was.

Persist the user-set value to state so it survives sessions.

---

### Step 5 — Fix #49 (Slider affordability check) (40-60 min)

For each goal/savings slider in Plan Mode, add real-time feedback as
the slider moves.

Calculation: as user drags slider, compute:
- New daily budget = (income + bonus − all locked − sum of all goal
  allocations including this slider) / days_in_cycle
- Compare to user's weekday budget (state.weekdayBudget = $30)
- If new daily < weekday budget: show warning
- If new daily < $0: show error

Visual feedback (match Plan Mode's existing style — likely subtle
text below the slider, not a modal):

```
[China Holiday slider at $500]
$500/month → Your daily becomes $XX (below your $30 weekday budget)
Try: $200 (cap at affordable) · or pull $300 from Freedom Buffer
```

When the slider is in safe range, no warning. When it pushes daily
into warning zone, show the suggestion. When daily goes negative,
show error and prevent locking the plan.

This is the most ambitious item. If the slider implementation
doesn't already trigger a real-time recalc handler, hooking one in
might require some refactoring. If that refactoring is non-trivial,
DEFER #49 and proceed without it. Document the deferral clearly.

---

### Step 6 — Tests (20 min)

Add to `tests/core.test.js`:

```js
test('Locked non-negotiable: breakdown sums to displayed total', () => {
  // Setup state with known income, bills, debts
  // Call breakdown function, sum components
  // Expect: sum === displayed locked-non-negotiable value
});

test('Bonus preview: daily budget reflects bonus added', () => {
  // Setup: known state, $1500 bonus
  // Call preview calc
  // Expect: daily = (income + 1500 - locked) / days
});

test('Early repayment fee: changing fee recalculates net saving', () => {
  // Setup: KIA loan state, default fee $382
  // Override to $500
  // Expect: net_saving figure changes accordingly
});

test('Slider affordability: warns when slider pushes daily below budget', () => {
  // Setup: known state with weekdayBudget = $30
  // Set slider value that produces daily $25
  // Expect: warning flag is set
});
```

---

### Step 7 — Commit, push, print verification block (15 min)

```bash
git add index.html tests/core.test.js
git status   # confirm only those 2 files staged
```

If anything else is staged: STOP and report.

```bash
git commit -m "feat(plan): what-if planning controls — bonus preview, locked transparency, editable repayment fee, slider affordability" \
  -m "Backlog items: #46 editable early repayment fee with live recalc. #47 bonus preview with allocation impact. #48 locked non-negotiable transparency (tap to expand breakdown). #49 slider affordability check (real-time feedback as sliders move)." \
  -m "Enables John to use Plan Mode for actual May 15 payday planning: see what's locked, add what-if expenses (dentist, flights), see affordability impact in real time." \
  [-m "Note: #49 slider affordability deferred to follow-up — slider refactor non-trivial."]

git push origin main
```

Then print verification block (Step 8). If #49 was deferred, note it in
both the commit message and the verification block.

---

### Step 8 — Verification block

```
═══════════════════════════════════════════════════════════════
PLAN MODE WHAT-IF UPGRADE SHIPPED to xetonx.github.io/slyght

Commit: <new hash>
Tests: NN/NN passing
Guardian: 4/4 passing

Items shipped: #46, #47, #48 [, #49 | #49 deferred — reason: ...]

═══════════════════════════════════════════════════════════════
JOHN'S MANUAL VERIFICATION ON PHONE:

Wait ~60 seconds for GitHub Pages to redeploy.

Hard-refresh xetonx.github.io/slyght on phone.

[ ] 1. Open Plan Mode.
       Find the "Locked non-negotiable" value.
       Tap it (or its expand control).
       Confirm: a breakdown appears showing income, rent, KIA, other
       bills with the math that produces the final figure.

[ ] 2. In Plan Mode, find "Expected extra income" / bonus field.
       Enter a value like $1,500.
       Confirm: a preview block appears showing new daily budget,
       suggested allocation options for the bonus.

[ ] 3. Find the WRX/KIA early repayment fee field.
       Tap it. Type a different value (e.g., $500 instead of $382).
       Confirm: net saving / months saved / interest saved figures
       update accordingly. No "save" button needed (auto-save).

[ ] 4. (If #49 shipped) Find a goal allocation slider (China Holiday,
       Rainy Day, etc.).
       Drag it to a high value (e.g., $500/month for China).
       Confirm: a warning or suggestion appears below the slider
       indicating the daily impact and recommending a cap.

[ ] 5. Open Dashboard. Confirm balance and "Spent today" still work.
       (No regression to commit 5c6e219 misleading-math fixes.)

[ ] 6. Bills tab → Calendar → tap May 1.
       Confirm Teachers Health still shows paid (no regression to
       commit c800400 paidBills fix).

[ ] 7. Type into Plan Mode's expected income field with multiple
       keystrokes.
       Confirm: keyboard stays open, no per-keystroke refocus.
       (No regression to #15 fix in 5c6e219.)

If ALL pass: Plan Mode is now a planning tool. May 15 ready for
"what if I add $400 dentist" decisions.

If ANY fail: report which one. Run `git revert HEAD && git push`
to roll back. Previous deployed state at 5c6e219 stays good.

═══════════════════════════════════════════════════════════════
```

THEN STOP.

---

## SAFETY RULES

1. No commits without guardian + tests passing
2. No "while I'm here" refactors
3. Single commit
4. Do not touch Plan Mode visual layout — calculations and
   transparency only
5. Do not modify dashboard, bills tab, or recent commit logic
6. Do not modify Survival Forecast / borrow-estimate
7. Do not touch design system primitives (post-payday work)
8. Hard stop at 3.5 hours
9. After Step 1 investigation, if total estimated work > 3 hours,
   defer #49 (most ambitious) and proceed with #46 + #47 + #48
10. If #46 or #47 turns out Large after investigation, defer it too
    and confirm with John before continuing

---

## Run with

```
Read C:\Users\admin\slyght\MISSION-PLAN-MODE-WHATIF.md and execute it
exactly. Single commit + push + verification block. Stop after print.
```
