# MISSION: REALITY CHECK — SAFETY NET BEFORE PAYDAY PLAN V1

## ⚠️ Read this before any code

This mission is different in shape from prior ones. It is not a 
feature ship. It is infrastructure that prevents the regressions 
that have been silently shipping. John has surfaced six broken 
states in production tonight that none of our existing checks 
caught:

1. Dashboard says "$9,950 this cycle" when income is $7,282 (cycle 
   total math is wrong)
2. "Maximum: $0.00/day to survive" + "Spending alert. At this rate 
   you will not cover bills" both fire when today's spend is $0 
   (alert logic doesn't reflect actual rate)
3. "Tight — Teachers Health hits tomorrow" appears on dashboard 
   when Teachers Health was already paid May 1 (paid-bill state 
   not consulted by dashboard warnings)
4. Survival Forecast recommends borrowing $3,650 when reality is 
   ~$400-650 (borrow estimate doesn't net payday — this is the 
   bug from the Sunday audit that never shipped a fix)
5. "Spent so far: $0.00 (0 days)" on May 5, when the cycle has 
   been running for days (week-projection day counter broken)
6. Round-up transactions appear in Recent Spending as -$0 debits 
   instead of savings credits
7. Bills tab "Paid this month ✓ (4)" while monthly total still 
   counts those same bills as unpaid (filter and total disagree)
8. Adding debts via the Immediate Debts tile is broken — UI 
   regressed at some unknown commit, no detection

These are all in production right now. Guardian was green when 
each one shipped. Tests passed. Manual phone verification missed 
them because the surface area is too large to verify by hand 
every session.

This mission builds the safety net that catches this class of 
bug before it reaches John.

---

## DESIRED OUTCOME

After this mission ships, three new mechanisms exist:

**1. A regression smoke-test checklist.** A markdown file with 
30-50 specific interactive flows ("I can mark a bill paid," 
"Round-ups appear in savings not spending"). Reviewed before 
every push. Catches feature regressions like the broken debt-add.

**2. Math invariants enforced at runtime.** A `MathInvariants` 
module that runs on every render and asserts cross-tile math 
agreement. Fires a visible banner ("invariant violation: cycle 
spend $9,950 exceeds income $7,282") when something diverges. 
Not a unit test — a runtime sanity check that catches the math 
bugs in John's screenshots.

**3. A rendered-state review step.** Opus, before declaring a 
mission shipped, runs the rendered app in a headless browser, 
takes screenshots of dashboard / bills / analysis / plan in 
several states, and visually reviews them. Catches "the dashboard 
shows wrong numbers" before John finds it on his phone.

After this ships, every future mission's verification block 
includes "ran smoke test, ran invariants, reviewed rendered 
states" as load-bearing gates — not just "guardian green, tests 
pass."

---

## WHAT TO BUILD

### Part 1 — The Smoke Test Checklist

Read `C:\Users\admin\slyght\SMOKE-TEST.md`. A flat markdown 
file. Sections by tab. For each interactive feature, a one-line 
description of what should work. Examples:

```
## Dashboard
- [ ] Balance number displays and matches localStorage S.balance
- [ ] "Spent today" matches sum of today's S.txns excluding 
      _isCorrection and _isRoundup
- [ ] Tapping the + button opens the transaction logger
- [ ] "11 days to payday" counter updates when system date changes
- [ ] CRITICAL banner only fires when balance < threshold AND 
      days-to-payday > some-minimum

## Immediate Debts tile
- [ ] Existing debts render with name, amount, due date
- [ ] "+ Add Debt" button opens debt creation form
- [ ] New debt persists across page reload
- [ ] Marking a debt paid moves it out of immediate-debts list
- [ ] Round-trip edit-and-save preserves all fields

## Bills tab
- [ ] Calendar renders current month with bills marked
- [ ] Tapping a date shows the bills due that day
- [ ] "Pay now" / "Already paid" buttons mutate state correctly
- [ ] Marked-paid bills disappear from "this week" total
- [ ] "Paid this month ✓ (N)" count agrees with bills.filter(paid)

[... continue for Analysis, Plan, Settings, Chat ...]
```

Investigate the actual app to populate this. Don't make up 
features that don't exist; don't miss features that do. Aim for 
more than 150 items.

For each item that's CURRENTLY BROKEN as observed in John's 
screenshots, mark it `🔴 BROKEN — see investigation note`. These 
become the regression list to fix.

### Part 2 — Math Invariants Module

Add a `MathInvariants` namespace to index.html. It exposes:

- `MathInvariants.check()` — returns array of `{level, message, 
  details}` where level is 'fail' / 'warn'. Empty array if 
  everything reconciles.
- `MathInvariants.renderBanner()` — if check() returns failures, 
  renders a small red banner at the top of the dashboard with the 
  first violation. Tappable to expand to full list.

Invariants to check (start with these, expand as we find more):

```
1. Cycle spend reconciliation
   sum of S.txns where t.cycle === current && !_isCorrection 
   && !_isRoundup === MODEL.cycleSpent
   AND
   MODEL.cycleSpent <= S.income + sum(immediate debts active)
   (cycle spend cannot exceed earned + borrowed)

2. Paid bill agreement
   bills.filter(b => b.paidThisMonth).length === paidThisMonthCount 
   shown in Bills tab header

3. Week projection day counter
   weekProjection.daysIn === floor((today - cycleStart) / 1day) 
   bounded to 0-7

4. Round-up direction
   forall t in S.txns where t._isRoundup: 
     t.amount > 0 (savings, not spending) 
     OR t.linkedBucket exists

5. Survival forecast borrow estimate
   recommendedBorrow === max(0, |remainingAtPayday|) rounded up to 50
   AND
   when balance > sum(unpaid bills + immediate debts before payday),
     recommendedBorrow === 0

6. Dashboard alert consistency
   "hits tomorrow" warning for bill X requires X.paid === false 
   AND X.dueDate === tomorrow

7. Net worth components
   nwData.liquidNet === S.balance + savingsBuckets.total + 
     wrxValue - (immediate debts active) - (CC balance)
   AND nwData.net === liquidNet + super
```

Each invariant is one short function. Total module ~100-200 
lines. Runs on every renderAll() at the end.

When a violation fires, the banner says: "Math check failed: 
[specific message]. This means [what user should know]. Tap for 
details." Tap reveals all violations + values + which tile they 
relate to.

### Part 3 — Headless Rendered Review

Add a script `C:\Users\admin\slyght\smoke-render.js` that:

1. Spawns a headless browser (Playwright or Puppeteer; whichever 
   is simplest to set up — probably Playwright since it's bundled 
   easier on Windows).
2. Loads the local index.html with a synthetic `localStorage` 
   state (you'll need a test fixture — maybe based on a snapshot 
   of John's actual data, anonymized, or a synthetic one we 
   construct).
3. Takes screenshots of each tab.
4. Runs `MathInvariants.check()` in the browser context and 
   reports the result.
5. Runs the smoke test items that can be automated (clicking 
   buttons, checking elements exist).
6. Outputs a report: which tabs rendered, what invariants fired, 
   which smoke-test items passed/failed.

This isn't full E2E testing. It's "did the app render without 
breaking, did the math reconcile, did the obvious interactions 
work."

If Playwright/Puppeteer setup is non-trivial in the Windows 
environment, surface that and we discuss alternatives 
(screenshot-only tool, simpler check, etc.). Don't sink hours into 
tooling.

### Part 4 — Fix the Regressions Found

The smoke test will identify what's broken. For the 8 items 
already documented:

- For each, investigate the root cause
- Propose a fix
- Surface for confirmation before implementing

Some of these will be quick (round-up display, paid-bill filter 
disagreement). Some will be deeper (the survival forecast 
borrow-estimate is the audit bug from before — needs careful 
fix).

Group the fixes into 2-3 bundles by risk level. Ship low-risk 
bundle first as a separate commit. Higher-risk fixes (borrow 
estimate, cycle math) get their own commits with extra 
verification.

---

## WORK PLAN

### Step 1 — Investigation (60-90 min)

For each of the 8 known broken states, find the root cause in 
code. Print findings. No code yet.

```
| # | Symptom                          | Root cause | Risk | Fix shape |
|---|----------------------------------|------------|------|-----------|
| 1 | Cycle spend = $9,950             | ...        | ...  | ...       |
| 2 | $0/day + spending alert          | ...        | ...  | ...       |
| 3 | "Teachers Health hits tomorrow"  | ...        | ...  | ...       |
| 4 | Borrow estimate $3,650 vs ~$500  | ...        | ...  | ...       |
| 5 | "Spent so far: 0 days"           | ...        | ...  | ...       |
| 6 | Round-up shows as -$0 spending   | ...        | ...  | ...       |
| 7 | Paid count vs unpaid total disagree | ...     | ...  | ...       |
| 8 | Add debt to immediate debts broken | ...      | ...  | ...       |
```

STOP after Step 1. Print findings. Wait for John to confirm scope 
before any code.

### Step 2 — Build the smoke test (30-45 min)

Write SMOKE-TEST.md based on actual app investigation. More than 150 
items. Mark known-broken with 🔴.

### Step 3 — Build MathInvariants (60-90 min)

Add the module. Wire into renderAll(). Test that violations 
actually fire when state is in known-bad shape.

### Step 4 — Headless render setup (60-90 min, may abort)

Try to set up Playwright in the local environment. If it's 
straightforward, ship the smoke-render.js script. If it hits 
Windows/Node version friction beyond ~45 minutes, abort and ship 
a simpler version (just a manual "what to check" doc that John 
can review against, until we have time for the full setup).

### Step 5 — Fix low-risk regressions (60 min)

Bundle: round-up display direction, paid-bill filter agreement, 
"hits tomorrow" check against paid state. These are localized 
display fixes.

Single commit. MathInvariants validates before ship.

### Step 6 — Surface higher-risk regressions for separate commits

Borrow estimate fix and cycle-spend math probably need their own 
commits. After Step 5 is verified clean on phone, propose Step 6 
mission separately.

### Step 7 — Verification block

Generate a verification block that includes:
- Smoke test results (X/N items passing)
- Math invariants results (banner state)
- Rendered review results (if Playwright shipped)
- Phone checks for the regressions fixed

---

## CONSTRAINTS

- **No regressions to**: 56896d8, c800400, 5c6e219, 4a8cfba, 
  3c9b684, 7351f9e
- **Two commits maximum tonight** (Step 5 fixes + Steps 1-4 
  infrastructure) — separate so each is revertable independently
- **No new features** — this mission only fixes regressions and 
  builds verification infrastructure
- **MathInvariants must not throw under any state shape** — 
  defensive coding throughout, log violations, never crash render
- **The banner must be dismissible** — John can dismiss for the 
  session (NOT permanently — the violation persists, just 
  collapsed)
- **Smoke test items must be specific enough to verify** — "buttons 
  work" is bad; "tapping + Add Debt opens debt creation form" is good

---

## PUSH BACK IF

- Playwright setup is a multi-hour rabbithole (abort and ship 
  simpler version)
- Some "broken" states in screenshots are actually expected 
  behavior with explanation (e.g., "$9,950 cycle" might be 
  correct if cycle definition is different from what John 
  expects — surface this)
- An invariant you'd expect to add can't be cleanly defined 
  because the underlying concept is ambiguous (surface the 
  ambiguity, don't enforce something arbitrary)
- The fix for a regression turns out to be larger than expected 
  — defer to its own mission
- The 8 regressions overlap in unexpected ways (e.g., one root 
  cause produces 3 of the symptoms)

---

## VERIFICATION BLOCK FORMAT

```
═══════════════════════════════════════════════════════════════
REALITY CHECK — SAFETY NET SHIPPED to xetonx.github.io/slyght

Commit(s): <hash> [+ <hash> if Step 5 separate]
Tests: NN/NN passing
Guardian: 4/4 (advisory)
Math invariants: PASSING / N violations active
Smoke test: X/N items passing (Y items marked broken, Z fixed 
this commit)

INFRASTRUCTURE SHIPPED:
- SMOKE-TEST.md (N items, reviewed pre-push)
- MathInvariants module (N invariants enforced at render)
- [Headless render script — shipped / deferred / partial]

REGRESSIONS FIXED THIS COMMIT:
- [list with brief description]

REGRESSIONS DEFERRED TO FOLLOW-UP:
- [list with reason]

═══════════════════════════════════════════════════════════════
JOHN'S MANUAL VERIFICATION ON PHONE:

[generate steps that exercise the fixed regressions specifically, 
and confirm MathInvariants fires when expected]

═══════════════════════════════════════════════════════════════
```

---

## ESTIMATE

Honest range: 4-6 hours of agent tool-time across multiple 
sessions if needed. Hard cap of 3 hours per session. May need to 
split across two evenings.

Step 1 alone (investigation of 8 root causes) is the highest 
information-density work. Do that first. Even if everything else 
defers, the investigation alone produces value (it tells us the 
shape of what's wrong).

If the investigation reveals that one or more "broken states" are 
actually larger systemic issues than expected, surface and we 
re-scope. Don't try to fix everything in one mission.

---

## RUN WITH

```
Read C:\Users\admin\slyght\MISSION-REALITY-CHECK.md and execute. 
Step 1 first — investigate root causes of all 8 known regressions, 
print findings, STOP for confirmation before any code.

This mission ships infrastructure that catches the class of bug 
that's been silently regressing. Take it seriously. Don't pad. 
Don't underestimate. Surface anything that doesn't fit the plan 
above.

After this ships clean, Payday Plan v1 (
MISSION-PAYDAY-PLAN-V1.md) ships into a tested foundation.
```
