# MISSION: FOUNDATION REBUILD (Phase 2A + 2B)

## ⚠️ Read this header before doing anything

This is a **structural rebuild session**, not a feature session. You are
introducing a single source of truth for all financial calculations and
migrating the dashboard, bills, and calendar tabs to read from it.

**Estimated time:** 2.5–3 hours. **Hard stop at 3 hours** — partial work
must end at a clean commit.

**Reference document:** `C:\Users\admin\slyght\AUDIT-FOUNDATION.md`. You
wrote this in the previous session. It contains the full diagnosis. Read
it first if anything in this mission is unclear.

**What you are NOT doing in this session:**
- Plan Mode renderer migration (next session)
- Jarvis prompt migration (next session)
- Worker contract update (next session)
- The kill list (SLYGHT Score, Character Score simplification, Goal
  Tracker removal — next session)
- ANY feature additions

**What you ARE doing:**
- Quick fix: line 1713 `isBillCoveredByDebt()` month-blindness bug
- Build `computeFinancialModel(state, now)` as a single source of truth
- Migrate **only** dashboard, bills tab, and calendar to read from it
- Update unit tests against the model
- Update guardians as needed

---

## SUCCESS CRITERIA

You are done when ALL of these are true:

1. May 1 in the calendar shows the Teachers Health debt OR the bill,
   not both. The total is $259.41, not $518.82.
2. `computeFinancialModel(S, new Date())` exists, returns the full
   `FinancialModel` interface from AUDIT-FOUNDATION.md Section 6.3.
3. Dashboard hero (balance, NW, safe-to-spend, survival banner, weekly
   snapshot, debt grid) reads from `MODEL` not from individual helpers.
4. Bills tab reads from `MODEL.billsBeforePayday` and
   `MODEL.billsThisMonth`.
5. Calendar reads from `MODEL.calendarEntries.get(dateISO)`.
6. All 14 existing unit tests still pass.
7. 9 new unit tests from AUDIT-FOUNDATION.md Section 6.7 pass.
8. Guardian suite passes 50/50 (or higher if new checks added).
9. The app loads, balance shows correctly, no console errors on boot.
10. Every commit in this session passed guardian + tests at commit time.

---

## CONSTRAINTS

- **Use `today.getMonth()` ONLY in the model build, never in render code.**
  Render code reads pre-computed data. This is the discipline that prevents
  the May 1 bug from returning.
- **`computeFinancialModel(state, now = new Date())`** — `now` is a
  parameter, not a closure. Tests inject mocked dates.
- **The model recomputes after migrations finish, not just after `load()`
  completes.** Add explicit `MODEL = computeFinancialModel(S, new Date())`
  call after migration block.
- **Commit after each renderer migrated.** Guardian + tests pass at every
  commit. If a commit breaks something, revert that one commit, do not
  pile fixes on top.
- **Do not delete the obsolete helpers in this session.** They become
  shims that call the model, but they stay in the codebase. Deletion is
  next session, after John has used the new model for a day.

---

## WORK PLAN (in strict order)

### Step 1 — Quick fix the May 1 bug (15 min)

Open `index.html` line 1710 area, function `isBillCoveredByDebt(bill)`.

The bug: it builds `billDate = new Date(today.getFullYear(),
today.getMonth(), bill.day)`. This uses TODAY's month, not the rendered
month, so when the calendar renders May 1 from April 29, billDate is
constructed as April 1 and never matches a May debt.

Fix: change the function signature to accept the rendered month/year
explicitly:

```js
function isBillCoveredByDebt(bill, renderMonth, renderYear) {
  // ... use renderMonth and renderYear, not today.getMonth()
}
```

Update all call sites (`getCalendarDayItems` is the main one) to pass
the month/year they're rendering for.

**Commit message:** `fix(calendar): isBillCoveredByDebt uses rendered month not today's month — fixes May 1 double-count`

Run guardian. Run tests. If both pass, push commit. If either fails,
debug before proceeding.

This is your **safety commit**. If everything else in this session goes
sideways, John keeps the May 1 fix.

---

### Step 2 — Add `computeFinancialModel(S, now)` as a façade (45 min)

Add the function near line 1590 (next to `getLiveBal`), BEFORE any
render function but AFTER all helper functions it depends on.

Implementation strategy: **start as a façade.** Each model field calls
the existing helper internally. This means the function is correct by
construction (it's just a different shape) but doesn't introduce
calculation drift.

Example:

```js
function computeFinancialModel(state = S, now = new Date()) {
  const todayISO = now.toISOString().slice(0, 10);
  const todayMonth = now.getMonth();
  const todayYear = now.getFullYear();

  // ... resolve paydayDate using the canonical daysLeft logic, but
  // factor it out so the model can call it with `now` injected.

  const billsBeforePayday = getBillsDue();      // façade
  const debtsBeforePayday = getActiveDebtsDueBeforePayday();
  // ...

  // Calendar entries — this is the ONE place where we don't façade.
  // We build calendarEntries fresh, with rendered-month-aware coverage,
  // because that's the bug we're killing.
  const calendarEntries = buildCalendarEntries(state, now);

  return {
    todayISO, todayMonth, todayYear,
    paydayDate, daysToPayday, paydayReceived,
    bal: state.bal,
    safeToSpendToday: getDynamicDailyBudget(),
    survivalMode: getSurvivalMode(),
    billsBeforePayday,
    debtsBeforePayday,
    billsThisMonth: getExpandedBills().filter(b => isBillDueInMonth(b, todayMonth)),
    calendarEntries,
    liquidNet: calculateNetWorth().liquidNet,
    totalNet: calculateNetWorth().net,
    nwBreakdown: calculateNetWorth().breakdown,
    weekSpent: getDiscretionarySpend(weekAgo(now), now),
    cycleSpent: getDiscretionarySpend(cycleStart, now),
    noSpendStreak: getNoSpendStreak(),
    userCap: getDailyBudget(),
    warnings: [],
    // trips, goals, provisions, postWrxSurplus, wrxImpact —
    // populate from PLAN.* getters
    trips: PLAN.getTrips(),
    goals: PLAN.getGoals(),
    provisions: PLAN.getAnnualProvisions(),
  };
}
```

Then add a global `MODEL` updater:

```js
let MODEL = null;
function refreshModel() {
  MODEL = computeFinancialModel(S, new Date());
}
```

Call `refreshModel()`:
- After migrations complete in `load()`
- At the top of `renderAll()`
- At the start of each chat send
- (NOT in `onStateChange` yet — wait until renderers actually consume it)

**Build `buildCalendarEntries(state, now)` as a NEW function** that does
the dedup correctly:

```js
function buildCalendarEntries(state, now) {
  const map = new Map();
  // For each date in the next ~60 days:
  // 1. Find debts where delayDate matches → push as type:'debt'
  // 2. Find bills where day matches AND month is in dueMonths
  //    AND no debt covers this bill in THIS month/year
  // 3. Use the rendered month, not today's month, for coverage check
  // 4. Mark each entry with covered:bool, ref to source object
  return map;
}
```

This is the function that ACTUALLY fixes the structural bug. The Step 1
patch was a tactical fix; this is the strategic one.

**Commit message:** `feat(model): introduce computeFinancialModel façade with rendered-month-aware calendar dedup`

Guardian. Tests. Push.

---

### Step 3 — Add unit tests (30 min)

Open `tests/core.test.js`. Add the 9 tests from AUDIT-FOUNDATION.md
Section 6.7. Adjust to fit the test framework already in use (Node's
`assert` based on the existing 14 tests).

Critical: tests must pass `now` to the model. Example:

```js
test('Calendar entries on cross-month dates use rendered month', () => {
  const mockNow = new Date('2026-04-29T00:00:00Z');
  const mockS = {
    bal: 779.50,
    debts: [{name:'Teachers Health', amt:259.41, paid:false, delayDate:'2026-05-01'}],
    payday: 15,
    paydayReceived: false,
    // ... minimum fields
  };
  const M = computeFinancialModel(mockS, mockNow);
  const may1 = M.calendarEntries.get('2026-05-01') || [];
  const total = may1.reduce((s, e) => s + e.amt, 0);
  assert.strictEqual(total, 259.41, 'May 1 should not double-count');
});
```

You will need a small helper at the top of `tests/core.test.js` to
construct a minimum valid `S` object for tests. Do not import the live
S from `index.html` — make a `mockState()` factory.

**Commit message:** `test: add 9 model tests covering May 1 dedup, payday cycle, NW split, viaRent exclusion`

Run tests. **All 23 must pass** (14 old + 9 new). If any old test fails,
the model façade introduced drift — debug.

Guardian. Push.

---

### Step 4 — Migrate dashboard renderers one at a time (60 min)

Order of migration (from least to most risky):

1. **Dashboard hero balance** — already reads `S.bal`, no change needed
   except to read `MODEL.bal` for consistency. Verify, don't disturb.
2. **Liquid NW tile** — change `calculateNetWorth().liquidNet` → `MODEL.liquidNet`.
3. **Footer strip** — same swap.
4. **Safe-to-spend-today card** — `getDynamicDailyBudget()` →
   `MODEL.safeToSpendToday`.
5. **Survival banner** — `getSurvivalMode()` → `MODEL.survivalMode`,
   `getDynamicDailyBudget()` → `MODEL.safeToSpendToday`.
6. **Weekly snapshot tile** — `getDiscretionarySpend(weekAgo, now)` →
   `MODEL.weekSpent`. Top-3 categories stay inline for now (out of scope).
7. **Recent transactions list** — no change (reads `S.txns` directly,
   correctly).
8. **Immediate debts grid** — change `S.debts.filter(...)` to read from
   `MODEL.debtsBeforePayday` if shape matches; otherwise leave for next
   session.

**Commit after EACH renderer migrated.** Guardian + tests after each
commit. Eight commits in this step.

Commit message format:
`refactor(dash): <renderer> reads from MODEL`

If any commit breaks the dashboard visually (open the live URL or load
`index.html` locally to verify), revert that one commit and skip that
renderer for now. Note in the final report which renderers were skipped.

---

### Step 5 — Migrate Bills tab (20 min)

`renderBillsGrouped` (line 4290 area):

- Replace `getExpandedBills().filter(...)` with `MODEL.billsThisMonth`
  for the month-scoped filter.
- The "this week" / "today" / "next" grouping logic stays the same — it
  bins by date diff. Just feeds from MODEL now.
- The inline `isPaid` check at line 4338 should call the canonical
  `isThisMonthlyBillPaid` (per AUDIT-FOUNDATION Section 3 fragility note).

**Commit message:** `refactor(bills): renderBillsGrouped reads from MODEL.billsThisMonth, isPaid uses canonical`

Guardian. Tests. Push.

---

### Step 6 — Migrate Calendar (20 min)

This is the test case for the whole rebuild.

`getCalendarDayItems(day, month, year)`:

```js
function getCalendarDayItems(day, month, year) {
  const dateISO = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  return MODEL.calendarEntries.get(dateISO) || [];
}
```

That's it. The whole function becomes a Map lookup. Dedup happened in
the model build.

**Manual verification step:**
1. Open the app. Navigate to Calendar tab. Render May 2026.
2. Tap May 1.
3. Confirm: ONE entry showing Teachers Health $259.41, NOT two entries
   summing to $518.82.

If the manual check fails: the bug is in `buildCalendarEntries` from
Step 2. Debug there, not here.

**Commit message:** `refactor(calendar): getCalendarDayItems is now a MODEL.calendarEntries lookup — fixes May 1 double-count structurally`

Guardian. Tests. Push.

---

### Step 7 — Final validation (15 min)

1. Run guardian — full 50/50 pass required.
2. Run all 23 unit tests — all pass.
3. Open the app fresh. Click through every tab: Home, Bills, Analysis,
   Plan Mode (just visually — no migration here yet), Settings.
4. Open the calendar to May 2026, tap May 1, confirm no double-count.
5. Open the calendar to August 2026, tap Aug 1 (next Teachers Health
   quarterly), confirm same correct behaviour.
6. Tap the dashboard balance tile, confirm balance edit modal still
   works.
7. Take a state snapshot: should match expected values from current
   live state (balance $779.50, NW ~$5,251 liquid, 16d to payday,
   cautious mode, $X/day safe to spend).

If anything fails verification, the failure goes in the final report
under "KNOWN-INCOMPLETE" — do NOT push more commits trying to fix in the
last 15 min.

---

### Step 8 — Final commit and report

Write a one-page summary at `C:\Users\admin\slyght\PHASE-2A-2B-REPORT.md`:

```
# Phase 2A + 2B Report — <date>

## Shipped
- Step 1: May 1 quick fix (commit hash)
- Step 2: computeFinancialModel + buildCalendarEntries (commit hash)
- Step 3: 9 new unit tests (commit hash)
- Step 4: <N> dashboard renderers migrated (commit hashes)
- Step 5: Bills tab migrated (commit hash)
- Step 6: Calendar migrated, May 1 fixed structurally (commit hash)

## Test results
- Unit tests: 23/23 passing
- Guardian: X/X passing

## Skipped / Known-incomplete
- <renderer> — reason
- <renderer> — reason

## For next session (Phase 2C)
- Plan Mode renderer migration (sliders, trip cards, goal cards, super card)
- Jarvis prompt migration to single MODEL.* block
- Worker contract: update push payload to consume MODEL subset
- Delete obsoleted helper functions (Section 6.4 from AUDIT-FOUNDATION.md)

## For next session (Phase 2D — kill list)
- SLYGHT Score subsystem (~120 lines)
- Daily Character Score → simplify to no-spend evenings only (~200 → ~30 lines)
- Goal Tracker on Analysis tab (Plan Mode is canonical)
- Settings duplicates: Bonuses, Bills list
- 17 unguarded console.logs
- _wrxPriceUpdated, _afterpayUpdated migrations (already in seed)
```

Final commit message: `docs: Phase 2A+2B report`

---

## SAFETY RULES

1. **No commits without guardian + tests passing.** Period.
2. **No "let me just refactor this small thing while I'm here."** Stick
   to the plan. Drift kills sessions.
3. **If at any step you find another bug not in scope** — write it in
   the report under "Discovered, deferred" and keep moving. We deal with
   it next session.
4. **If at hour 2:30 you are mid-step**, finish that step's commit, then
   stop. Do not start a new step in the last 30 minutes.
5. **No git force-push, no rebase.** Linear history. If a commit is
   wrong, `git revert` it.
6. **Do not modify the worker** in this session. Worker contract update
   is Phase 2C.
7. **Do not modify Plan Mode renderers** in this session. Phase 2C.
8. **Do not delete any feature** in this session. Phase 2D.

---

## Run with

```
Read C:\Users\admin\slyght\MISSION-FOUNDATION-REBUILD.md and execute it
exactly. Reference C:\Users\admin\slyght\AUDIT-FOUNDATION.md for full
context. Stay in scope. Commit after every step. Guardian + tests must
pass at every commit. Hard stop at 3 hours. Write final report at
PHASE-2A-2B-REPORT.md.
```
