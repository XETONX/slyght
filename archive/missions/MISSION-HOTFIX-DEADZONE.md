# MISSION: HOTFIX — TEMPORAL DEAD ZONE

## ⚠️ Read this header before any code touches the file

A latent bug shipped in `a76f297` (Phase 2A+2B): `computeFinancialModel`
references the `PLAN` const before its initializer runs in some browser
load orderings. When this happens, model build throws, `MODEL` stays
null, and any renderer that reads `MODEL.X` falls back to `'—'` or `0`
on the live phone app — while renderers that read `S` directly still
work, producing the half-broken dashboard John has been seeing
intermittently for the last day.

DevTools confirms the error:
```
Uncaught ReferenceError: Cannot access 'PLAN' before initialization
  at computeFinancialModel (slyght/:2238:17)
  at renderWeeklySnapshot (slyght/:9416:23)
```

This mission fixes that. Nothing else.

**Estimated time:** 30 minutes. Hard stop at 60 minutes.

**Scope is brutally narrow.** No Phase 2C work. No coverage-link logic.
No feature changes. No "while I'm here" cleanup. Fix the dead zone,
ship, verify, done.

---

## ⚠️ CRITICAL — GIT HYGIENE FIRST

There are 6 unpushed Phase 2C commits sitting on top of `a76f297` that
must NOT ship in this fix. They're not ready and the user will re-deploy
them in a separate session.

**Step 0 (do this BEFORE anything else):**

1. Run `git log --oneline -10` and confirm the top 6 commits are the
   Phase 2C work (5b147b4, b369fb5, 4a07d09, 9475c96, 52cbf33, 1c01031).
   If the count is different or the messages don't match, STOP and ask.
2. Run `git status` and confirm clean working tree (no uncommitted
   changes).
3. Create a safety branch holding the Phase 2C commits:
   `git branch phase-2c-pending`
4. Reset main back to `a76f297`:
   `git reset --hard a76f297`
5. Confirm: `git log --oneline -3` should show `a76f297` at the top.

You are now on `a76f297`. Phase 2C work is preserved on
`phase-2c-pending` and can be cherry-picked later. The hotfix happens
here, on top of the deployed code, so it lands on top of what's
actually live.

If any of Step 0 fails or feels weird — STOP and ask the user before
typing more git commands.

---

## ⚠️ PUSH POLICY

This fix DOES need to push (unlike Phase 2C). After the fix commit lands
and tests pass, push to `main`. The user will then manually verify on
phone. If verification fails, the user will revert and ping back.

So:
- Make the fix commit
- Run guardian + tests locally
- Run `git push origin main`
- Print the verification block
- STOP — let the user verify on phone

DO NOT touch `phase-2c-pending` branch. That's the user's to handle.

---

## SUCCESS CRITERIA

1. `computeFinancialModel` no longer throws when `PLAN` is in its
   temporal dead zone. PLAN access is wrapped in try/catch returning
   safe defaults.
2. `refreshModel()` has a top-level try/catch: if `computeFinancialModel`
   throws for ANY reason, MODEL is set to a complete stub (every field
   present, sensible zero/empty defaults), AND a one-time
   `console.error` is logged with the underlying error.
3. The stub model is structured so EVERY renderer that reads
   `MODEL.X` gets a non-undefined value. `liquidNet: 0`,
   `safeToSpendToday: 0`, `daysToPayday: 0`, `survivalMode: 'normal'`,
   `billsBeforePayday: []`, `debtsBeforePayday: []`,
   `billsThisMonth: []`, `calendarEntries: new Map()`, `trips: []`,
   `goals: []`, `provisions: []`, `nwBreakdown: { wrxValue: 0,
   cashBalance: 0, mumAccount: 0, savings: 0, superBalance: 0,
   kiaLoan: 0, creditCard: 0, immediateDebts: 0 }`, `weekSpent: 0`,
   `cycleSpent: 0`, `noSpendStreak: 0`, `userCap: 0`, `warnings: []`,
   plus any other fields the live renderers consume.
4. A new unit test verifies that calling `computeFinancialModel` with
   PLAN forced to undefined still produces a valid model (no throw,
   trips/goals/provisions are empty arrays).
5. All 23 existing unit tests still pass.
6. Guardian passes 50/50.
7. Pushed to `origin main`.
8. User-verifiable on phone: refreshing xetonx.github.io/slyght shows
   real NW, real safe-to-spend, real debt list, real recent spending.

---

## CONSTRAINTS

- **Only modify `index.html`** and possibly `tests/core.test.js`. Nothing
  else.
- **No structural changes to PLAN itself.** Don't move it, don't refactor
  it. Treat it as immutable for this mission. The fix lives entirely
  inside `computeFinancialModel` and `refreshModel`.
- **No new dependencies on PLAN at the top level of the model.** If PLAN
  is in its dead zone, the model still produces a valid result for
  everything that DOESN'T need PLAN (balance, NW, bills, debts, calendar
  entries, safe-to-spend, etc).
- **Don't delete PLAN access entirely.** When PLAN IS available (the
  common case), `trips`, `goals`, `provisions` should still populate
  correctly. The fix is graceful degradation, not removal.
- **Do not modify the phase-2c-pending branch.** Hands off.

---

## WORK PLAN

### Step 0 — Git hygiene (5 min)

See "GIT HYGIENE FIRST" section above. Execute exactly. Confirm the
state before continuing.

After completion, print:
```
GIT STATE CONFIRMED:
- main is at a76f297 (Phase 2A+2B docs)
- phase-2c-pending branch holds 6 commits ahead of a76f297
- Working tree clean
Proceeding to Step 1.
```

---

### Step 1 — Find the offending PLAN access (3 min)

Open `index.html`. Locate `computeFinancialModel`. Find every line
inside it that references `PLAN`. There should be 3 (trips, goals,
provisions) but verify by grep.

Print the line numbers and the exact code lines. Don't write any code
yet.

---

### Step 2 — Wrap PLAN access in safe accessor (10 min)

Define a small helper at the top of `computeFinancialModel`, BEFORE any
PLAN reference:

```js
const _safePlan = (fn, fallback) => {
  try {
    if (typeof PLAN === 'undefined') return fallback;
    return fn();
  } catch (e) {
    return fallback;
  }
};
```

Then replace each PLAN call site:

```js
// Was: trips: PLAN.getTrips(),
trips: _safePlan(() => PLAN.getTrips(), []),

// Was: goals: PLAN.getGoals(),
goals: _safePlan(() => PLAN.getGoals(), []),

// Was: provisions: PLAN.getAnnualProvisions(),
provisions: _safePlan(() => PLAN.getAnnualProvisions(), []),
```

If there are other PLAN references (e.g. `PLAN.INCOME_MONTHLY`,
`PLAN.getCustomProvisions()`) — wrap them the same way with appropriate
fallbacks.

**Do NOT use `typeof PLAN !== 'undefined'` outside the helper.** The
helper is the single chokepoint. Every PLAN read in the model goes
through it.

---

### Step 3 — Add safe stub fallback in refreshModel (10 min)

Find `refreshModel()` (or wherever `MODEL = computeFinancialModel(...)`
is assigned).

Wrap it:

```js
function refreshModel() {
  try {
    MODEL = computeFinancialModel(S, new Date());
  } catch (err) {
    if (!window._modelErrorLogged) {
      console.error('[MODEL] Build failed, using safe stub:', err);
      window._modelErrorLogged = true;
    }
    MODEL = _emptyModel();
  }
}

function _emptyModel() {
  return {
    todayISO: new Date().toISOString().slice(0, 10),
    todayMonth: new Date().getMonth(),
    todayYear: new Date().getFullYear(),
    paydayDate: new Date(),
    daysToPayday: 0,
    paydayReceived: false,
    bal: (typeof S !== 'undefined' && S.bal) || 0,
    todaySpent: 0,
    weekSpent: 0,
    cycleSpent: 0,
    noSpendStreak: 0,
    liquidAssets: 0,
    totalAssets: 0,
    totalLiabilities: 0,
    liquidNet: 0,
    totalNet: 0,
    nwBreakdown: {
      wrxValue: 0, cashBalance: 0, mumAccount: 0, savings: 0,
      superBalance: 0, kiaLoan: 0, creditCard: 0, immediateDebts: 0
    },
    safeToSpendToday: 0,
    userCap: 0,
    survivalMode: 'normal',
    billsBeforePayday: [],
    debtsBeforePayday: [],
    billsThisMonth: [],
    billsTotalCommitted: 0,
    debtsTotalCommitted: 0,
    totalCommittedBeforePayday: 0,
    calendarEntries: new Map(),
    trips: [],
    goals: [],
    provisions: [],
    postWrxSurplus: 0,
    wrxImpact: null,
    warnings: ['Model build failed — using safe stub']
  };
}
```

**Audit each field of the live `computeFinancialModel` return.** If it
returns a field not in the stub above, ADD that field to the stub with
a sensible default. The goal: every renderer that ever reads `MODEL.X`
sees a defined value.

The single global flag `window._modelErrorLogged` prevents log spam if
the model errors on every render.

---

### Step 4 — Add the dead-zone unit test (5 min)

Append to `tests/core.test.js`:

```js
test('Model builds safely when PLAN is undefined (temporal dead zone)', () => {
  // Save and unset PLAN to simulate the dead zone
  const realPlan = (typeof PLAN !== 'undefined') ? PLAN : undefined;
  // eslint-disable-next-line no-global-assign
  if (typeof global !== 'undefined') global.PLAN = undefined;

  let M;
  let threw = false;
  try {
    M = computeFinancialModel(S, new Date(2026, 3, 29));
  } catch (e) {
    threw = true;
  } finally {
    if (typeof global !== 'undefined') global.PLAN = realPlan;
  }

  expect(threw).toBe(false);
  expect(Array.isArray(M.trips)).toBe(true);
  expect(Array.isArray(M.goals)).toBe(true);
  expect(Array.isArray(M.provisions)).toBe(true);
  expect(M.trips.length).toBe(0);
  expect(M.goals.length).toBe(0);
  expect(M.provisions.length).toBe(0);
  // Other fields should still populate normally:
  expect(typeof M.liquidNet).toBe('number');
  expect(typeof M.safeToSpendToday).toBe('number');
  expect(M.calendarEntries instanceof Map).toBe(true);
});
```

If the test framework needs adjustment for how `PLAN` is exposed in the
node test environment, adjust the global-stubbing approach. The
assertion is what matters: model build does not throw and PLAN-dependent
fields gracefully default to empty arrays.

---

### Step 5 — Run guardian + tests (3 min)

```
node guardian-all.js
node tests/core.test.js
```

Both must pass green. 24/24 tests (23 prior + 1 new). 50/50 guardian.

If anything fails, debug. Don't proceed to push if either is red.

---

### Step 6 — Single commit and push (2 min)

```
git add index.html tests/core.test.js
git commit -m "fix(model): safe PLAN access + stub fallback prevents temporal dead zone crash on phone"
git push origin main
```

---

### Step 7 — Print verification block and STOP

```
═══════════════════════════════════════════════════════════════
HOTFIX SHIPPED to xetonx.github.io/slyght

Commit: <hash> fix(model): safe PLAN access + stub fallback
Tests: 24/24 passing
Guardian: 50/50 passing
Push: origin main confirmed

phase-2c-pending branch preserved with 6 commits, untouched.

═══════════════════════════════════════════════════════════════
JOHN'S MANUAL VERIFICATION ON PHONE:

[ ] 1. Wait ~60 seconds for GitHub Pages to redeploy.
[ ] 2. On phone: hard-refresh xetonx.github.io/slyght
       (long-press refresh, "Empty cache and hard reload" if available;
        otherwise close all tabs and reopen).
[ ] 3. Dashboard: confirm
       - Balance shows $779.50
       - "$X spent today · $X in debt payments" is real
       - Liquid net worth (inline tile) shows +$5,251
       - "16 days to payday" or correct day count
       - "YOU CAN SPEND TODAY" shows a real number, NOT $0
       - Footer strip shows "NW: +$5,251" and "$X today" and
         "16d to payday" — NO em-dashes
       - Immediate Debts list shows Teachers Health and Afterpay
       - Recent Spending shows recent transactions
[ ] 4. Tap NW tile — modal opens with full breakdown ($5,251.46)
[ ] 5. Open Bills tab — calendar shows colour markers for upcoming bills
[ ] 6. Open Analysis tab — pivot, score, forecast all populate
[ ] 7. Open DevTools console (or Chrome remote devtools from desktop):
       NO red ReferenceError.
       At most: one '[MODEL] Build failed, using safe stub' warning
       per session — and ONLY if PLAN dead zone is hit. Common case:
       no warnings at all.

If ALL pass: hotfix successful. Phase 2C work next session.
If ANY fail: report which item, then run `git revert HEAD && git push`
to roll back. State will be back at a76f297.

═══════════════════════════════════════════════════════════════
```

THEN STOP. Do not continue. Do not touch phase-2c-pending. Do not start
Phase 2C work.

---

## SAFETY RULES

1. Step 0 git hygiene is non-negotiable. Get to `a76f297` with Phase 2C
   preserved on a branch BEFORE writing any code.
2. Single commit. Do not split this into multiple. The whole thing is
   one atomic hotfix.
3. No new features. No refactors outside the model build and refresh.
4. No deletion of any function or feature.
5. If the test in Step 4 doesn't fit the existing test framework
   cleanly, simplify the test rather than restructuring the framework.
6. Hard stop at 60 minutes. If something is weird at 50 minutes, abort,
   `git reset --hard a76f297`, report the problem, leave Phase 2C
   branch alone.

---

## Run with

```
Read C:\Users\admin\slyght\MISSION-HOTFIX-DEADZONE.md and execute it
exactly. Begin with Step 0 git hygiene — confirm state and reset main
to a76f297 with Phase 2C preserved on a branch. This hotfix DOES push
to origin main after tests pass. Stop after the verification block.
```
