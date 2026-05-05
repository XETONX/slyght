# MISSION: GUARDIAN — LAYER 2 (RUNTIME)

## ⚠️ Read this before any code

Read `MISSION-GUARDIAN.md` first for the four-shape diagnostic, the
three-layer architecture, and the cross-cutting constraints. This
file specifies Layer 2 only.

Layer 2 is the **`MathInvariants` module inside `index.html`**. It
runs in the user's browser at the end of every `renderAll()`, checks
~10 invariants on the live state, and surfaces a tiered banner/card
when something diverges. Three severity tiers (warn / fail /
critical) with explicit dismissal psychology.

This layer ships as a single commit. Either before, after, or in
parallel with Layer 1. No dependency on Layer 1 or Layer 3.

---

## DESIRED OUTCOME

After this mission ships:

1. **The `MathInvariants` namespace exists in `index.html`** with
   ~10 invariants, runs at the end of every `renderAll()`, and
   stores violation history in `S._invariantViolationCounts`.

2. **A tiered banner/card system** lives at the top of the dashboard
   that surfaces violations:
   - `warn` — small banner, dismissible per-session, no escalation
   - `fail` — banner, dismiss once → second violation in same
     session = non-dismissible card
   - `critical` — non-dismissible card immediately, no banner stage

3. **Two new MODEL fields exist** to support state-based assertions
   (replacing the post-hoc DOM-reading anti-pattern):
   - `MODEL.tomorrowBill = {name, daysOut} | null` — populated by
     `computeFinancialModel`. Renderer at index.html:3160 reads from
     this. Invariant asserts the field matches an actual debt due
     tomorrow.
   - `MODEL.shouldShowSpendingAlert: boolean` — populated by
     `computeFinancialModel`. The two alert-firing renderers
     (line 2772, line 3640) gate on this. Invariant asserts the
     suppression condition.

4. **The bugs from RC1, RC8, RC10 plus a NaN-balance
   regression are all detectable** — running Layer 2 against
   pre-Bundle-A `git stash` of those changes would have produced
   a banner before John found them.

5. **Performance budget held** — invariants add ≤ 5 ms to
   `renderAll()` on real state (`state-snapshot.json` benchmark).

---

## WHY THE TIERED MODEL EXISTS

John's data (per ANALYSIS-DEEP-PASS § 2.6) shows he dismissed all
4 urgent notifications in a recent week — every one was eventually
resolved, but dismissal preceded resolution rather than blocked it.
Notification dismissal psychology defeats banners.

A flat "everything is dismissible" model degrades to noise. A flat
"nothing is dismissible" model makes the app unusable when an
invariant has a false positive. **Tiers solve both.**

| Tier | Mental model | What survives dismissal |
|---|---|---|
| `warn` | "FYI, this is small" | Nothing surfaces again until next session. |
| `fail` | "This is real, you can dismiss once" | Second violation in same session escalates to a non-dismissible card. |
| `critical` | "This is corruption, no dismissal" | Always visible until code/state is fixed. |

`fail` is the active tier — most invariants live here. The
escalation rule means: the first dismissal is "yeah I'll fix it";
the second is "you didn't, this is real."

---

## WHAT TO BUILD

### Part 1 — The `MathInvariants` namespace

Lives inside `<script>` in `index.html`. Position: after `MODEL` is
declared (line 2367-ish), before `renderAll` (line 3023). The module
exports:

```js
const MathInvariants = {
  // The catalog
  invariants: [
    { name: 'cycle-spend-bounded', tier: 'fail', check: () => {...} },
    { name: 'paid-count-agreement', tier: 'fail', check: () => {...} },
    // ... etc
  ],

  // Run all checks. Returns array of { rule, tier, message, details }
  // for any that fail.
  check() { /* ... */ },

  // After check(), surface in DOM. Banner for warn/fail, card for
  // critical or escalated-fail.
  render(violations) { /* ... */ },

  // User dismisses a banner. Records in S._invariantViolationCounts.
  dismiss(ruleName) { /* ... */ },

  // Reset counts (5-min background timeout, day rollover, manual)
  resetSession() { /* ... */ }
};

// Wired into renderAll at end:
//   ...existing renderAll body...
//   try { MathInvariants.render(MathInvariants.check()); } catch(e) {
//     console.warn('[invariants] render failed:', e);
//   }
// }
```

The `try/catch` around the call is **non-negotiable**. Layer 2 must
NEVER crash a render pass. If an invariant throws, log and continue.

### Part 2 — The invariant catalog

Each invariant is `{ name, tier, check(), message(violation) }`.
The `check()` returns either `null` (passing) or
`{ details, displayValue, expected }` (failing).

| Invariant | Tier | Anchored to | What it asserts |
|---|---|---|---|
| `cycle-spend-bounded` | fail | RC1 | `MODEL.cycleSpent <= S.income + activeImmediateDebtsTotal()`. (Allows for borrow scenarios where someone draws against debts.) |
| `paid-count-agreement` | fail | RC11 | `MODEL.billsThisMonth.filter(isThisMonthlyBillPaid).length + MODEL.billsThisMonth.filter(!isThisMonthlyBillPaid).length === MODEL.billsThisMonth.length` (the two filters partition cleanly). Both halves derive from canonical helpers — no DOM reads. |
| `borrow-recommendation-sane` | fail | RC8 | `getSurvivalForecast().recommendBorrow >= 0`. AND when `S.bal >= forecast.upcomingBillsTotal + forecast.upcomingDebtsTotal + forecast.minLivingCosts`, `recommendBorrow === 0` (no borrow needed when balance covers needs). |
| `roundup-direction` | fail | data-shape | `forall t in S.txns where t._isRoundup: t.amt > 0` AND there exists a savings bucket whose `saved` is at least the sum of round-ups directed to it. **Fail because data-shape violation: a `_isRoundup` txn with `amt <= 0` or no corresponding bucket credit means the roundup contract is broken (silent savings loss). Display fixes for RC5 are addressed elsewhere; this invariant catches the rarer-but-worse data-corruption scenario.** |
| `tomorrow-bill-matches-state` | fail | RC3 | **State-based, not DOM-based.** Asserts: if `MODEL.tomorrowBill` is non-null, then there exists a debt in `MODEL.debtsBeforePayday` whose `name === MODEL.tomorrowBill.name` AND whose `delayDate` is exactly tomorrow. Renderer at index.html:3160 reads from `MODEL.tomorrowBill` (refactored as part of this mission). |
| `net-worth-components-sum` | fail | data-shape | `Math.abs(MODEL.liquidNet - (S.bal + bucketTotal() + wrxValue() + mumAccount() - S.carloan - S.cc - immediateDebtsTotal())) < 0.02`. |
| `alert-coherence` | fail | RC4 | **State-based, not DOM-based.** If `getTodaySpent() === 0` AND `liveBal >= MODEL.totalCommittedBeforePayday + MODEL.daysToPayday * getMinDailySpend()`, then `MODEL.shouldShowSpendingAlert === false`. (The two alert-firing renderers at line 2772 and line 3640 gate on this MODEL field, refactored as part of this mission.) |
| `state-shape-balance` | critical | data corruption | `isFinite(S.bal)`. NaN, Infinity, undefined, or null — fires critical. |
| `state-shape-txns` | critical | data corruption | `S.txns` is an array AND every element has `typeof t.ts === 'number'` AND every element has `typeof t.amt === 'number' && isFinite(t.amt)`. |
| `state-shape-paidbills` | critical | data corruption | Every value in `S.paidBills` is exactly `true` (no `false`, no objects, no strings). |
| `consistency-fail-not-marked-ok` | fail | RC10 | The most recent N entries in `AUDITOR.log` whose `action === 'CONSISTENCY_FAIL'` all have `ok: false`. (Regression check — Bundle A fixed this; an invariant prevents recurrence.) |

**Total: 11 invariants.** 7 `fail` + 3 `critical` + 0 `warn` after refactor.

(Was 12 in the previous spec. Dropped: `footer-equals-header` — moved
to Layer 1 as a static rule `nw-renderers-consume-MODEL.liquidNet`,
because the right place to enforce "renderers use MODEL.liquidNet
directly" is at code-write time, not at render time. Refactored:
`tomorrow-bill-text-matches-state` and `alert-coherence` — both now
state-based instead of DOM-reading, see new MODEL fields above.)

### Part 2.5 — New MODEL fields (refactor required as part of this mission)

Two MODEL fields must be added to `computeFinancialModel` so the
relevant invariants can assert on state instead of reading DOM
post-hoc. Both are derived purely from existing state — no new
calculations, just lifting decisions out of renderers.

**`MODEL.tomorrowBill`** (replaces the hardcoded "Teachers Health"
text logic at index.html:3160):

```js
// Inside computeFinancialModel, after debtsBeforePayday is built:
const _t0 = new Date(now); _t0.setHours(0,0,0,0);
const tomorrowDebt = (state.debts || []).find(d => {
  if (d.paid || d.viaRent || !d.delayDate) return false;
  const due = new Date(d.delayDate.split('T')[0] + 'T00:00:00');
  return Math.round((due - _t0) / 86400000) === 1;
});
const tomorrowBill = tomorrowDebt
  ? { name: tomorrowDebt.name, daysOut: 1 }
  : null;
// Returned in MODEL: { ..., tomorrowBill, ... }
```

The Bundle-A fix at index.html:3160 reads from `_m.debtsBeforePayday[0]`
inline. **Refactor**: replace the inline computation with a read from
`MODEL.tomorrowBill`. Inline at the renderer becomes:

```js
const _next = _m.tomorrowBill;
ctxText = _next ? 'Tight — ' + _next.name + ' hits tomorrow'
                : 'Tight — cover your essentials first';
```

**`MODEL.shouldShowSpendingAlert`** (replaces the inline suppression
logic at index.html:2772 and 3640):

```js
// Inside computeFinancialModel:
const recentPace = getDiscretionarySpend(now.getTime() - 7*86400000, now.getTime()) / 7;
const days = Math.max(1, daysToPayday);
const minDaily = (typeof getMinDailySpend === 'function') ? getMinDailySpend() : 25;
const phase = getMonthPhase();
const todayMs = todayMidnight.getTime();
const todaySpent = (typeof computeSpentInRange === 'function')
  ? computeSpentInRange(todayMs, now.getTime()) : 0;
const balCoversWithMinDaily = (state.bal || 0) >=
  (billsTotalCommitted + debtsTotalCommitted) + (days * minDaily);
const trajectoryUnderfunded = (state.bal || 0) - (recentPace * days)
  < (billsTotalCommitted + debtsTotalCommitted);
const phaseSuppresses = phase === 'PRE_PAYDAY' || phase === 'PAYDAY';
const zeroSpendSuppresses = todaySpent === 0 && balCoversWithMinDaily;
const shouldShowSpendingAlert = trajectoryUnderfunded
  && !phaseSuppresses
  && !zeroSpendSuppresses;
// Returned in MODEL: { ..., shouldShowSpendingAlert, ... }
```

**Refactor**: both renderer call-sites (line 2772 and line 3640)
collapse to:

```js
if (shouldShowAlert && _m.shouldShowSpendingAlert) {
  // emit the alert
}
```

This is the architectural payoff: the alert decision lives in MODEL
once. Two renderers consume it identically. Layer 2's invariant
asserts on the MODEL field, not on DOM scrape.

The refactor is part of this mission's commit — invariants and the
MODEL fields they assert on ship together. Don't ship the invariants
without the refactor, or you're reading state that doesn't exist yet.

### Part 3 — State storage for tracking + escalation

Add to `S`:

```js
S._invariantViolationCounts = S._invariantViolationCounts || {};
// Shape: { 'rule-name': { count: 1, firstSeenTs: 1234567890, lastSeenTs: 1234567890 } }
```

Persisted via the normal `save()` path so it survives reload.
Reset rules:
- **Day rollover** — at start of `renderAll()`, if last-seen day !== today's day, reset all counts.
- **5-minute background timeout** — `document.visibilitychange` listener. When `visibilityState === 'hidden'`, record `S._invariantsHiddenAt = Date.now()`. When `visibilityState === 'visible'`, if `Date.now() - S._invariantsHiddenAt > 5 * 60 * 1000`, reset all counts.
- **Manual** — Settings tab adds a "Reset math health session" button.

### Part 4 — Banner + card UI

**Banner** (warn tier or first-violation fail tier):

```html
<div id="math-invariant-banner" style="display:none;
  background:var(--red-dim); border-bottom:1px solid var(--red-border);
  color:var(--red); padding:8px 16px; font-size:13px;
  position:sticky; top:0; z-index:50;">
  <span id="mib-msg"></span>
  <button onclick="MathInvariants.dismiss('rule-name')"
    style="float:right; background:none; border:none; color:inherit;
    font-size:18px; line-height:1; cursor:pointer">×</button>
  <button onclick="MathInvariants.showDetails('rule-name')"
    style="float:right; margin-right:8px; background:none; border:none;
    color:inherit; font-size:11px; cursor:pointer; text-decoration:underline">
    details
  </button>
</div>
```

Inserts above `.hero-section` on dashboard. Tap × dismisses (per
session). Tap "details" expands inline to show `expected` vs `actual`
with line/file references and a one-line "what this means."

**Card** (critical tier or escalated fail tier):

```html
<div id="math-invariant-card" style="display:none;
  background:var(--red-dim); border:1px solid var(--red-border);
  border-radius:var(--r-sm); padding:16px;
  margin:12px 16px; color:var(--red); font-size:13px;">
  <div style="font-weight:700; margin-bottom:6px">⚠️ Math reconciliation failed</div>
  <div id="mic-msg"></div>
  <div id="mic-details" style="font-size:11px; color:var(--text2); margin-top:8px"></div>
  <!-- No dismiss button -->
</div>
```

Inserts inside `.hero-section`, above the balance. **No close button.**
Persists until invariant passes. If multiple critical invariants fail,
list them all in one card.

### Part 5 — Performance budget

Each invariant must run in O(N) where N is small (txns, debts, bills,
all under 100 entries each). Total budget for all 12 invariants:
**≤ 5 ms on `state-snapshot.json` data**. Measure with `performance.now()`
during development.

If any single invariant exceeds 1 ms, optimize it. If the total
exceeds 5 ms, profile and either tighten or move expensive checks to
a less-frequent cadence (e.g. only on certain renderAll triggers, not
every input event).

### Part 6 — Settings tab integration

Add a "Math Health" panel to Settings:

```
MATH HEALTH

Current state: ✅ All invariants passing
Last check: 14:23:01

Recent violations (last 24h):
  cycle-spend-bounded     2 occurrences
  paid-count-agreement    1 occurrence

[Reset Session Counts]    [Run Check Now]
```

Shows the violation history (`S._invariantViolationCounts`).
Provides manual reset and force-rerun.

---

## WORK PLAN

### Step 1 — Investigation (15 min)

Read every invariant in the catalog. For each, identify:
- The exact `MODEL` field or helper call it depends on
- Whether the dependency exists today (Bundle B finished —
  most should)
- Edge cases that could produce false positives
- Any invariant that needs a new helper to be writable

Print findings. Stop and surface anything ambiguous before coding.

### Step 2 — Build the namespace skeleton (45 min)

Add the `MathInvariants` namespace to `index.html` after `MODEL`
declaration. Implement:
- The catalog scaffold (rule names + tiers, no `check()` bodies yet)
- `MathInvariants.check()` that runs all rules and returns violations
- `MathInvariants.render()` that no-ops for now
- The `try/catch` wiring at end of `renderAll()`
- The state storage in `S._invariantViolationCounts` + reset rules

Run guardians, confirm no regressions. The skeleton should be a
no-op on screen but live in code.

### Step 3 — Implement the invariants (90 min)

For each rule:
1. Write the `check()` body.
2. Test against current state (`state-snapshot.json` if loaded, or
   live state).
3. Verify it passes on clean state.
4. Synthesize a corrupted state that should make it fail (e.g. set
   `S.bal = NaN`, mock a `S.paidBills` value of `false`, etc.) and
   verify it fires.

Don't skip the corruption test. An invariant that never fires in
testing is one that won't fire in production either.

### Step 4 — Build the banner + card UI (45 min)

Implement `MathInvariants.render()` for real. Insert the static
HTML at the right DOM positions. Style to match NOW aesthetic
(red-dim background, mono font, terse).

Add the dismiss handler. Add escalation logic — track per-session
counts, escalate `fail` to card on second violation.

### Step 5 — Performance check (15 min)

Wrap `MathInvariants.check()` with `performance.now()`. Run on
`state-snapshot.json` 100 times, take median. Confirm ≤ 5 ms.

If over budget, profile each invariant individually. Optimize the
slowest. Re-measure.

### Step 6 — Settings panel (30 min)

Add the Math Health panel to the Settings tab. Wire up Reset Session
Counts and Run Check Now buttons.

### Step 7 — Verify on phone (30 min)

After commit + push + deploy:
- Open app fresh, confirm no banners (clean state)
- Open Settings → Math Health → confirm panel renders
- Synthesize a violation locally (e.g. via console:
  `S.paidBills['fake-key'] = false; renderAll();`) — confirm
  banner fires
- Tap dismiss → confirm gone for session
- Trigger again → confirm escalates to card
- Wait 6 minutes with app backgrounded, reopen → confirm reset
- Console: `S.bal = NaN; renderAll();` → confirm critical card
  fires immediately, no dismiss button

### Step 8 — Commit + push

Single commit. Push to main. Phone verification within an hour of
deploy.

---

## CONSTRAINTS

- **No regressions to:** 56896d8, c800400, 5c6e219, 4a8cfba, 3c9b684,
  7351f9e, a8952c9, ae2bbef
- **Layer 2 must NEVER crash `renderAll()`.** Every call wrapped in
  try/catch; failures logged and rendering continues.
- **Performance budget: ≤ 5 ms total** on real state.
- **Banner survives reload, dismissal does not.** A user who dismisses
  the banner sees it again on next browser open (only "session"
  dismissal lasts one session).
- **Critical tier has no dismiss button** — the only way to clear it
  is to fix the underlying state (or code).
- **Escalation triggers on second occurrence in same session** —
  defined as continuous app-open + 5-min-background timeout + day
  rollover.
- **Single commit.** Reversibility.

---

## PUSH BACK IF

- An invariant in the catalog turns out to depend on a helper that
  doesn't exist or doesn't compute the value the invariant assumes —
  surface and either build the helper or remove the invariant
- Performance is over budget after Step 5 optimization — surface and
  scope down (drop the heaviest invariant, or run a subset on each
  render and rotate)
- A `critical` invariant has any plausible false-positive scenario —
  downgrade to `fail` (critical must be true corruption only)
- The banner aesthetic clashes with NOW design — surface and discuss
  before shipping; better to delay a session than ship something
  jarring
- A reset rule edge case appears (e.g. timezone change mid-session,
  clock skew) — surface and refine the definition before locking it in

---

## VERIFICATION BLOCK FORMAT

```
═══════════════════════════════════════════════════════════════
GUARDIAN LAYER 2 SHIPPED to xetonx.github.io/slyght

Commit: <hash>
Tests: NN/NN passing
Guardians: 4/4 (existing) + 1/1 (Layer 1, if shipped) — all green
Layer 2 invariants: 12 active

LAYER 2 SUMMARY:
- MathInvariants namespace at index.html:NNNN
- 12 invariants registered (8 fail / 3 critical / 1 warn)
- Banner + card UI wired into dashboard
- State tracking in S._invariantViolationCounts
- Settings tab "Math Health" panel
- Performance: NN.N ms median per renderAll on snapshot data

INVARIANTS REGISTERED (name, tier, anchor):
- [list each invariant]

═══════════════════════════════════════════════════════════════
JOHN'S MANUAL VERIFICATION ON PHONE:

1. Hard-refresh dashboard
2. ✅ Expect: no banner, no card visible (clean state)
3. Open Settings → scroll to "Math Health"
4. ✅ Expect: "All invariants passing", last-check timestamp,
   "Reset Session Counts" + "Run Check Now" buttons
5. Open browser console (or use Time Machine to restore a
   corrupted snapshot)
6. Run: `S.paidBills['test-fake-key-1'] = false; renderAll()`
7. ✅ Expect: banner appears at top of dashboard with
   `state-shape-paidbills` violation message
8. Tap × on banner
9. ✅ Expect: banner gone
10. Run the corruption again, then again (third time)
11. ✅ Expect: non-dismissible card appears (escalation)
12. Run: `delete S.paidBills['test-fake-key-1']; renderAll()`
13. ✅ Expect: card disappears
14. Run: `S.bal = NaN; renderAll()`
15. ✅ Expect: red card appears immediately (critical tier),
    NO dismiss button visible
16. Run: `S.bal = 779.50; renderAll()`
17. ✅ Expect: card disappears

═══════════════════════════════════════════════════════════════
```

---

## RUN WITH

```
Read C:\Users\admin\slyght\MISSION-GUARDIAN.md, then
C:\Users\admin\slyght\MISSION-GUARDIAN-LAYER-2.md, and execute.

Start with Step 1 (investigation). Read every invariant, confirm
its dependencies exist post-Bundle-B, surface anything ambiguous.
STOP after Step 1, print findings, wait for confirmation.

This mission ships the runtime layer of the Guardian system.
Single commit. Tiered banner with explicit dismissal psychology.
Layer 2 must never crash renderAll.
```
