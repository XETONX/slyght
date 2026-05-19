# Bundle 32 — Architectural Diagnostic

**Date:** 2026-05-19 (evening, post-Bundle-31 phone walk)
**Status:** Investigation only. No fixes. Findings to be triaged at Bundle 32 kickoff.
**Trigger:** John's phone-walk findings + architectural diagnosis ("framework too rigid, doesn't dynamically update, more workers needed for updates across the app").

---

## TL;DR

John's diagnosis is correct in shape, wrong in name. The problem isn't "more workers" (background-task vocabulary); it's that the **read-side / canonical derived-state layer is incomplete**.

BRAIN bubbles solved the write-side (canonical writers, source tags, audit log — every dollar move auditable). The equivalent canonical-readers / derived-state layer (MODEL) was started in Layer 2 but never finished:
- `MODEL.cycleSpent` exists ✓
- `MODEL.daysToPayday` exists ✓
- `MODEL.totalCommittedBeforePayday` exists ✓
- `MODEL.survivalForecast` exists ✓
- **`MODEL.remainder` (free money this cycle)** — **MISSING** (each renderer computes its own)
- **`MODEL.stillToAllocate` (uncommitted portion)** — **MISSING**
- **`MODEL.allocatedTotal` (savings + upcoming)** — **MISSING**
- **`MODEL.allocatableToSavings` (post-buffer pool)** — **MISSING** (lives in `snap.derived.allocatableToSavings`, a different derived-state container from MODEL)
- **`MODEL.tripBufferedDays` (days when bucket-funded spending offsets main balance)** — **MISSING entirely**

Symptoms surface in the phone walk:
- PLAN dashboard $637 vs Canvas $1,170 (different surfaces, different derived values, same source)
- Savings goals -$263 over-allocated (no write-time INV check; only display-side red warning)
- Projected runout treats main balance as sole source (trip-bucket blindness)
- Essentials vs Discretionary opaque (no drilldown to inputs)
- "This cycle" field hides when today has activity (conditional fallback, not always-on metric)

Bundle 32 high-leverage move: **extend MODEL into a complete canonical-derived-state layer**, then migrate renderers to consume MODEL fields rather than re-derive. Mirrors Bundle 30's canonical-writers migration on the read side.

---

## What's IN MODEL today (`computeFinancialModel` at `index.html:4407-4561`)

```
todayISO, todayMonth, todayYear
paydayDate, daysToPayday, paydayReceived
cycleStart, cycleEnd
bal, todaySpent, weekSpent, cycleSpent, noSpendStreak
liquidAssets, totalAssets, totalLiabilities, liquidNet, totalNet, nwBreakdown
safeToSpendToday, userCap, survivalMode
billsBeforePayday, debtsBeforePayday, billsThisMonth
billsTotalCommitted, debtsTotalCommitted, totalCommittedBeforePayday
calendarEntries
trips, goals, provisions
postWrxSurplus, wrxImpact
tomorrowBill, shouldShowSpendingAlert, survivalForecast
warnings
```

Half-built. Has the source-of-truth scaffolding (cycle bounds, payday, bills/debts inventories), but stops short of the derived values renderers need most.

---

## What's NOT in MODEL — the gap

The PLAN-mode "allocation triangle" lives in `BRAIN.plan.getSnapshot()` (`index.html:~19929`), which is a DIFFERENT derived-state container. So there are TWO parallel derived-state layers:
- `MODEL.*` — built by `computeFinancialModel`, shared by Dashboard / Bills tab / Analysis tab
- `BRAIN.plan.getSnapshot().*` — built by the plan bubble, shared by PLAN-mode surfaces

These don't cross-reference. The Canvas REMAINDER tile computes `remainder = snap.totalToPlan - essentialsTotal`; the PLAN dashboard tile (post-Bundle-31) computes `stillToAllocate = remainder - allocatedTotal`. Both correct independently. **But neither is canonical** — they're co-computed in renderer code.

Each renderer that wants to show "free money this cycle" or "still to allocate" re-derives. Drift is structural.

---

## Findings

### Finding 1 — Cluster inconsistency: PLAN dashboard $637 vs Canvas $1,170 (same source, different framing)

**Phone-walk evidence:** PLAN dashboard shows ~$637; Payday Plan canvas shows "$1,170 free money this cycle". User reports no confidence in what either represents.

**Code paths:**
- PLAN dashboard tile: `renderAllocateTile` at `index.html:24445-24510` (Bundle 31 Item 4 reframed headline to `stillToAllocate = remainder - allocatedTotal`, subtitle "$X already assigned of $Y this cycle")
- Canvas REMAINDER tile: `renderPaydayPlanRoot` REMAINDER card at `index.html:10334-10345` ("Your free money this cycle" = `remainder = snap.totalToPlan - essentialsTotal`)

**Math (using phone-walk numbers):**
- Canvas `remainder` = $1,170
- PLAN dashboard `stillToAllocate` = $637
- Implied `allocatedTotal` = $1,170 − $637 = $533

These are **different concepts** (total post-essentials vs uncommitted-after-allocations) — internally consistent, externally confusing because both surfaces look authoritative and use similar vocabulary.

**Bundle 31 Item 4 didn't resolve this.** The Item 4 fix gave the PLAN dashboard tile clearer internal framing (still-to-allocate + already-assigned subtitle) but didn't unify with Canvas. Canvas keeps "free money this cycle" as a positive total; PLAN dashboard surfaces the gap. User's mental model wants ONE number that means "what's free for me to assign right now," not two.

**Architectural root cause:** No `MODEL.remainder` or `MODEL.stillToAllocate` canonical readers. Both surfaces re-derive from `snap` independently. Without a canonical reader, every new surface re-introduces the divergence.

**Proposed fix shape:**
- Define `MODEL.allocation = { totalToPlan, essentialsTotal, remainder, allocatedTotal, stillToAllocate, allocatableToSavings, bufferReserved, provisionsReserved }` as a single derived bundle
- Migrate renderAllocateTile + renderPaydayPlanRoot to consume `MODEL.allocation.*` instead of re-deriving
- Add Guardian rule: `allocation-renderers-consume-MODEL.allocation` (mirrors the proposed `today-spend-renderers-consume-MODEL.todaySpent`)
- Vocabulary decision: pick ONE number as the headline across both surfaces. My read: **still-to-allocate** as the headline (action-oriented), with **remainder** as the subtitle context. Same number across surfaces removes the confusion. Requires the Canvas-side rewrite that Item 4 didn't do.

**Scope:** medium (define MODEL.allocation, migrate 2 renderers, Guardian rule, smoke spec). ~50-80 LOC + careful regression coverage.

---

### Finding 2 — Over-allocation has no write-time INV check (NEW BUG: savings goals -$263)

**Phone-walk evidence:** Savings sub-screen shows "-$263 over allocated to goals". The negative number means user's per-goal allocations exceed the savings pool, but the writes succeeded anyway.

**Code paths:**
- Savings allocation write: `openEditPaydaySavings` modal save path → writes to `S.activePlan.overrides['savings:<bucketName>'] = {thisCycleAmount, normalAmount}` (no validation)
- Pool calculation (read-side): `renderPaydaySavings` at `index.html:12591-12614` shows `allocatable = snap.derived.allocatableToSavings` and `allocated = snap.savings.total`. When `allocated > allocatable`, displays "$X over-allocated" red.
- INV-28 ("refuses allocation exceeding free_money_remaining"): fires at `BRAIN.transaction.recordWithAllocation` — but plan-time allocation override writes DON'T go through `recordWithAllocation` (no txn yet, just an override). INV-28 is **dormant** for this code path.

**Current state of INV-28** (per smoke spec `transaction-paths.smoke.js:309` + the known-state note "INV28_DORMANT_GATE"): the gate has no live UI surface that triggers it in production. Bundle 30.5.0 removed the dead bucket-quick-add UI flow. The smoke spec is the only exercise.

**Architectural root cause:** Override-write path bypasses INV-28. There's no plan-time sibling rule. The display side surfaces the over-allocation as a red warning, but the WRITE accepted invalid state.

**FINANCIAL-INVARIANTS.md doesn't have a rule for this.** INV-29 candidate: *"`sum(S.activePlan.overrides['savings:*'].thisCycleAmount) ≤ snap.derived.allocatableToSavings`. Violated when: savings sub-screen shows '-$X over allocated to goals'."*

**Proposed fix shape:**
- Add INV-29 to FINANCIAL-INVARIANTS.md (awaiting John's sign-off per the pending-decisions discipline)
- Write-time: `openEditPaydaySavings` save handler validates against `snap.derived.allocatableToSavings - sum(other-bucket overrides)`. Refuses with toast + keeps modal open if exceeded
- Display-side: keep the existing red "over allocated" indicator as defense-in-depth for legacy override states
- Add boot-time recovery: if state arrives over-allocated (legacy), surface a one-tap "trim the most-recent override" remediation

**Scope:** medium-large. Touches multiple modal save handlers (savings, upcoming, kia-extra all share the override pattern). ~80-120 LOC + new INV registration + smoke spec.

---

### Finding 3 — Projected runout is trip-blind (NEW ARCHITECTURAL BUG)

**Phone-walk evidence:** User has $800 allocated to Darwin trip in bucket. Trip dates June 7-15 (8 days). During the trip, spending comes from the savings bucket, not main balance. Projected runout treats main balance as sole source — says "you'll run out before payday" when user is actually covered.

**Code path:**
- `getSurvivalForecast` at `index.html:5447-5592` — simulates day-by-day balance decrement
- Loop at `:5540-5560`: each day, decrements `tempBal -= upcomingBill.amt + upcomingDebt.amt + minDailyNeeded`
- `minDailyNeeded` from `getMinDailySpend` at `:5431-5445` (60% of last-30-day average, clamped to [$20, $40])
- **No awareness of:**
  - Trip schedules (`PLAN.getTrips()` exists in MODEL but not consulted by survival forecast)
  - Savings bucket allocations targeted at trips (`snap.savings.*` or `S.savingsBuckets` not consulted)
  - Whether `minDailyNeeded` should come from main balance (home days) or trip bucket (trip days)

**Architectural root cause:** Survival forecast is bills+debts-aware but trip-blind. Treats every day as a home day. Three independent failure modes:
1. Trip funded by separate bucket → main balance preserved → forecast over-decrements
2. Trip funded from main balance → forecast under-decrements (current would need explicit trip-budget addition)
3. Mixed (some bucket, some main) → forecast can't model

**Proposed fix shape (architecture, not surface):**
- Extend the day-by-day loop to consult `trips` + `PLAN.getTrips()` for the cycle window
- For each day within an active trip: subtract `tripBudget/tripDays` from the trip's saved bucket, NOT from `tempBal`. If bucket runs out mid-trip, overflow to `tempBal`.
- Add `MODEL.tripBufferedDays` — derived count of cycle days that have full bucket coverage. Surfaces in survival forecast as "X home days + Y trip-bucket days".
- New invariant candidate INV-30: *"Survival forecast accounts for trip-funded days separately from main-balance days."*

**Scope:** large. Refactors the survival-forecast loop and needs careful regression coverage (the simulation drives multiple Dashboard/Analysis displays). ~150-200 LOC + tests.

**Defer or ship?** Architectural-grade. Probably ADR-worthy before implementation.

---

### Finding 4 — "This cycle" field missing from Dashboard hero

**Phone-walk evidence:** The "$X this cycle" sub-line that previously appeared in the Dashboard hero is gone.

**Code path:** `index.html:6224-6230` (the hero `h-note` conditional):
```js
if (_parts.length > 0) {
  hn.textContent = _parts.join(' · ');           // <-- 3-way join: spent today + debt + bills
} else if (cycleSpent > 0) {
  hn.textContent = 'Nothing spent today · ' + fmt(cycleSpent) + ' this cycle';
} else {
  hn.textContent = 'Enter your Virgin Money balance to start';
}
```

`_parts` is built from TODAY's outflows (`_todayDiscSpent`, `_todayDebtTotal`, `_todayBillTotal`). When today has ANY of these, the "this cycle" fallback gets suppressed.

**git log -S "this cycle"** shows the relevant commits. Bundle 31's commits modified "this cycle" mentions in subtitles + labels (Items 3 + 4 + 16) but **none modified the hero conditional itself**. The conditional has had this shape since Bundle 28 round 24 (the `_parts` construction at `:6203`).

**Diagnosis:** Not a regression. Working as designed — "this cycle" is the FALLBACK when today has no activity, not an always-on metric.

User's expectation: cycle-spend should be always visible. The conditional's framing ("Nothing spent today · ...") only makes sense WHEN today is empty.

**Architectural framing:** This is a UX vocabulary issue, not a code regression. The cycle-spend metric is high-value (always relevant to a payday-15 user) but the hero gives it inconsistent visibility.

**Proposed fix shape:**
- Option A: Always show "$X this cycle" as a separate sub-line (not the conditional fallback). The today's-activity line + cycle-spend coexist.
- Option B: Promote cycle-spend to its own tile (small footprint, always visible, taps to drilldown).
- Option C: Status quo (accept current conditional behavior).

**Scope:** small. ~10-20 LOC. Layout decision more than logic.

---

### Finding 5 — Essentials vs Discretionary opaque (Bundle 31 Item 3 partial)

**Phone-walk evidence:** Numbers look "less inflated" (Bundle 31 cycle-bound filter worked) but user has no visibility into WHAT txns are being summed into each side.

**Code path:** `index.html:5917-5952`. Bundle 31 commit `17481ff` added the cycle-start filter. The classifier is unchanged: ESSENTIAL_KEYS = `['Fixed','Loan','Transport / Fuel','Food / Coffee','Health','Savings']` + 'Fuel' alias. Everything else falls into discretionary.

**What's missing:** Drilldown. The card shows totals + percentages. There's no per-category txn list, no tap-to-expand, no "show me the 8 txns that sum to $X in essentials".

**Architectural framing:** This is the "every number tappable" principle (CLAUDE.md §8) not being honored for this tile. Tappable wiring exists for spending pivot (`pivotToggle`), bill rows, debt rows. The Essential vs Discretionary card doesn't have it.

**Proposed fix shape:**
- Wrap each side in a tap handler that opens a modal listing the txns summed into that bucket
- Reuse `EDIT_MODAL.openInfo` pattern + the txn-list rendering from the spending pivot's expand-rows
- Could also expose `MODEL.essentialsVsDiscretionary.{essentials, discretionary, byCategory}` as a canonical reader so the drilldown reads from MODEL rather than re-running the inline iteration

**Scope:** small-medium. ~40-60 LOC + new MODEL field.

---

### Finding 6 — No "reset plan to payday baseline" feature (NEW UX GAP)

**Phone-walk evidence:** When state is cooked (over-allocated, ticks confused, etc), user has no recovery short of losing actual logged txns.

**Code paths:**
- `RESET_FLOW` at `index.html:13871-13999` — full data nuke, 3-stage countdown. Way too heavy.
- `BRAIN.plan.rolloverIfNeeded` at `:20892` — auto-fires at cycle end but defers when `hasWork` is set
- No "soft reset" — clear `S.activePlan.overrides + .ticks + .savings + .knownUpcoming` while KEEPING `S.txns`, `S.debts`, `S.bills`, `S.bal`, etc.

**Architectural framing:** Plan state is recoverable in principle (overrides are just per-cycle commitments; clearing them gets you back to "plan from scratch"). But there's no UI affordance.

**Proposed fix shape:**
- Add a "Reset this cycle's plan" button in PLAN mode (or Settings → Data)
- Confirms with a clear stage-1 hint: "This clears your savings allocations, ticks, and upcoming items for this cycle. Your transactions, debts, bills, and balance stay intact."
- Single canonical writer: `BRAIN.plan.resetCycle(source)` that clears `S.activePlan.overrides`, `.ticks.*`, `.savings`, `.knownUpcoming`. Preserves `cycleId`, `lockedAt`, `bonus` (configurable).
- New SOURCE: `PLAN_CYCLE_RESET`

**Scope:** small. ~30-50 LOC including the modal stage.

---

## Cross-cutting architectural root cause

**The framework's read-side / canonical-derived-state layer is half-finished.**

Bundle 30 established BRAIN bubbles + canonical writers + source tags + audit log — the write side. Every dollar move is auditable. That's solid.

The **read side** has:
- `MODEL.*` for cross-tab derived state (Dashboard, Bills, Analysis)
- `BRAIN.plan.getSnapshot().*` for PLAN-mode derived state
- These don't cross-reference. Renderers re-derive between them.

When a derived value (like "free money this cycle") matters across surfaces, each surface re-implements. **Drift is structural.**

The Phase 1A "filter scatter" finding (7 parallel discretionary-filter lists), the Phase 1B Run 2 cross-surface consistency findings, the cluster inconsistency Finding 1 above, the trip-blindness Finding 3 — all manifestations of the same underlying gap.

**John's diagnosis "framework too rigid, doesn't dynamically update" is correct in shape:** he's noticing that one surface's update doesn't propagate to another surface's view. **The diagnosis "more workers needed" is wrong in name** (workers = background tasks, not the issue). The right vocabulary is **"complete the canonical derived-state layer."**

---

## Proposed Bundle 32 reorientation

Phase 1B's 72 raw findings + 11 Phase 1A carry-overs are SYMPTOMS. Triaging them individually fixes paper cuts.

**The high-leverage move: extend MODEL into a complete canonical-derived-state layer, then migrate consumers.** Mirrors the Bundle 30 canonical-writers migration on the read side.

Proposed Bundle 32 phases:

| Phase | Scope | Output |
|---|---|---|
| **32.0 — Triage** | Map Phase 1B Run 2 findings to MODEL-extension candidates; identify which are surface-side fixes vs architectural | One canonical backlog |
| **32.1 — `MODEL.allocation`** | Add canonical allocation derived-state (Finding 1). Migrate `renderAllocateTile` + Canvas REMAINDER tile. Guardian rule. | Removes PLAN/Canvas drift permanently |
| **32.2 — Over-allocation write-time INV** | Finding 2: INV-29 candidate. Block over-allocation at override save. | Closes "-$263 over allocated" symptom |
| **32.3 — Trip-aware survival forecast** | Finding 3: ADR-worthy. Refactor day-by-day loop. | Closes false-runout when trip-bucket-funded |
| **32.4 — Essentials drilldown + MODEL extension** | Finding 5: tap-to-see-txns + `MODEL.essentialsVsDiscretionary` | Closes opacity |
| **32.5 — Hero cycle-spend always-visible** | Finding 4: separate sub-line, not conditional | Closes "this cycle" missing |
| **32.6 — Plan reset feature** | Finding 6: `BRAIN.plan.resetCycle` + UI button | Closes recovery gap |

Each phase is ship-and-verify-able independently. 32.1 and 32.2 are highest leverage (they target the cluster inconsistency cause + close a real data-integrity hole).

---

## What this diagnostic does NOT cover

- Phase 1B Run 2's 72 findings individually (still need triage; many will collapse into the MODEL-extension fixes above)
- Phase 1A's 11 carry-overs (some collapse: Item 1 "this cycle labelling" → Finding 4; Items 4-6 cluster → Finding 1; Item 14 Opportunity Cost → adjacent to Finding 5)
- OPEN-BUGS filter-scatter cluster (#6 part-B, #7, #8, #17 — all collapse into the canonical-reader migration)
- FINANCIAL-INVARIANTS.md 5 pending decisions
- ADR-E reconciliation contract

These remain queued. The architectural reorientation doesn't eliminate them; it changes their fix shape (most become "migrate to MODEL field X" rather than "audit and patch this specific surface").

---

## Investigation cost

Time: ~25 min reading + diagnosis. Files read: `index.html:4407-4561` (computeFinancialModel), `:6200-6230` (hero conditional), `:5447-5592` (getSurvivalForecast), `:24445-24510` (renderAllocateTile), `:10334-10345` (Canvas REMAINDER), `:12591-12614` (renderPaydaySavings pool), `:19929+` (BRAIN.plan.getSnapshot). git log -S "this cycle" archaeology.

No code changes. No commits. Diagnostic report only, per your instruction.
