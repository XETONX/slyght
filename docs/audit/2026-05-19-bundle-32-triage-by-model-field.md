# Bundle 32 — Triage: Phase 1A + Phase 1B Run 2 findings mapped to MODEL extensions

**Date:** 2026-05-19 (evening, post-architectural-diagnostic)
**Status:** Triage report. No fixes. Bundle 32 phase ordering informed by this mapping.
**Source:** Walks all 72 Phase 1B Run 2 findings + 10 unresolved Phase 1A items + relevant OPEN-BUGS open entries; maps each to the 6 proposed MODEL extensions (32.1-32.6) + filter-scatter cluster + pure-UX-polish residual.

---

## TL;DR — leverage counts

| Bundle 32 phase | Findings collapsed | Notes |
|---|---|---|
| **32.1 — `MODEL.allocation`** | ~14 findings (8 cluster-inconsistency + 6 allocation-vocabulary) | Highest leverage. Resolves Phase 1A Items 4-6 cluster residuals + 6+ Run 2 findings about "free money" / "remainder" / "still to allocate" framing. |
| **32.2 — INV-29 over-allocation** | ~3 findings + 1 NEW BUG closed | Closes the "-$263 over allocated" data-integrity hole. Phase 1A Item 4 sub-bug residual. |
| **32.3 — Trip-aware survival forecast** | ~2 findings + 1 NEW ARCHITECTURAL BUG | ADR-worthy. Closes false-runout when trip-funded. Phase 1A Item 9 partially adjacent. |
| **32.4 — `MODEL.essentialsVsDiscretionary` drilldown** | ~5 findings (Analysis opacity cluster) | Phase 1A Item 3 residual opacity + Run 2 Analysis-tab visibility findings. |
| **32.5 — Hero cycle-spend always-visible** | ~3 findings (Phase 1A Item 1 + Run 2 hero ambiguity) | Layout decision; small scope. |
| **32.6 — `BRAIN.plan.resetCycle`** | 1 finding (NEW UX GAP) | New canonical writer + UI button. Recovery affordance. |
| **G — Filter-scatter cleanup** | OPEN-BUGS #6 part-B + #7 + #8 + #17 + 2 Run 2 findings | Cross-cutting; many surfaces collapse |
| **H — Pure UX polish (non-architectural)** | ~15 findings | Small-scope label/density/affordance fixes; not collateral of MODEL work |
| **I — Audit-script artifact (Welcome modal)** | **~23 findings** | NOT production bugs — audit script's Playwright beforeEach didn't dismiss the welcome modal that fires on first-time payday-plan canvas access. Fix the AUDIT script, discard these findings as production-relevant. |

**~46 of 72 Run 2 findings collapse into 32.1+32.2+32.4+G+I** — i.e., 64% of audit volume is structural, not 72 independent paper cuts.

---

## Meta-finding 0 — Audit-script artifact dominates Run 2 (23 findings)

**Pattern:** Run 2 captures opened the Payday Plan canvas + sub-screens via `openPaydayPlan()` and `openPaydayCategory()` in the script's `nav` functions. These calls fire the `Welcome to Payday Plan` onboarding modal (a 5-step instructional overlay) when not previously dismissed. The audit script's beforeEach didn't include a dismiss step (analogous to the EOD modal dismiss we shipped for diagnostics in Bundle 31 commit `e3a593f`).

**Consequence:** ~23 Phase 1B Run 2 findings are about the Welcome modal blocking access to canvas/sub-screens, NOT about real production UX issues. Examples:
- "Modal dialog blocks access to savings allocation data"
- "Modal dialog blocks interaction with underlying list"
- "Got it button alone does not indicate whether modal will reappear"
- "Behind the modal, MARK AS BOUGHT buttons are visible but unreachable"
- (×19 more variations on the same audit-script artifact)

**These findings are NOT actionable production work.** Action: extend `scripts/walkthrough-audit.js`'s splash-tap section (or new beforeEach equivalent) to dismiss the Welcome modal canonically — same pattern as the diagnostics smoke spec fix. Single audit-script fix invalidates these 23 findings as production-relevant.

**Bundle 32 phase 32.0a:** patch walkthrough-audit.js to dismiss Welcome modal + re-run Run 3 against refreshed fixture. ~10 LOC fix, ~$0.10 to re-run audit, gives clean baseline for triage.

---

## Phase 32.1 — `MODEL.allocation` (~14 findings collapse)

**Architectural extension:** Add canonical derived-state bundle:
```js
MODEL.allocation = {
  totalToPlan,            // cycle income (net pay + bonus)
  essentialsTotal,        // bills + debts + dailyLiving + provisions
  remainder,              // totalToPlan - essentialsTotal ("free money this cycle")
  savingsTotal,           // sum of savings overrides
  upcomingTotal,          // sum of knownUpcoming items
  allocatedTotal,         // savingsTotal + upcomingTotal
  stillToAllocate,        // remainder - allocatedTotal ("uncommitted")
  bufferReserved,         // safety buffer
  provisionsReserved,     // annual provisions monthly share
  allocatableToSavings,   // remainder - bufferReserved - provisionsReserved
};
```

**Phase 1A findings collapsed:**
- Items 4, 5, 6 (allocation cluster — $1,770 / $1,133 / $637 / $537 spread across surfaces)
- Item 1 (this-cycle labelling — partially overlaps with 32.5 too)

**Phase 1B Run 2 findings collapsed:**
- `dashboard-hero`: Liquid net worth without cycle context (P1 consistency)
- `payday-plan-canvas`: "YOUR FREE MONEY THIS CYCLE" tile label uses 'free' but constrained-allocation-pool (P1 clarity)
- `payday-plan-canvas`: "Total essentials $6,853" vs "Daily living $930" compositional ambiguity (P1 consistency)
- `dashboard-scrolled-cards`: "$1,113.61 + $5,681 debt" reconciliation to net worth path missing (P1 consistency)
- `bills-tab-top`: "BALANCE AFTER $1,627.83" doesn't reconcile with shown THIS WEEK $86 (P1 consistency, Item 18 overlap)
- `analysis-tab-pivot`: Total outflows $8696.78 vs visible category sum $5424 gap (P1 consistency, Item 1 overlap)
- `payday-plan-modal`: "The remainder is yours" passive vocabulary (P1 clarity, Item 4 overlap)
- `plan-mode-root`: bottom-strip NW + $30-left + 27d-payday competing without hierarchy (P2 consistency)

**Surface migrations needed (renderers swap local aggregator for MODEL.allocation.*):**
- `renderAllocateTile` (`index.html:24445-24510`)
- `renderPaydayPlanRoot` REMAINDER + "Allocating the remainder" sections (`:10334-10372`)
- `renderPaydaySavings` "Pool to allocate" header (`:12591-12614`)
- `renderHeroBalance` (or wherever bottom-strip aggregates display)

**Smoke spec:** `tests/smoke/model-allocation.smoke.js` — new spec. Assert `MODEL.allocation.remainder === MODEL.allocation.allocatedTotal + MODEL.allocation.stillToAllocate` (the conservation law). Plus per-surface "renders MODEL.allocation.X" assertions.

**Guardian rule:** `allocation-renderers-consume-MODEL.allocation` (static AST rule).

**Scope estimate:** ~80-120 LOC + 1 new smoke spec + Guardian rule + manual phone-verify checklist for 3 surfaces. **Session-shippable if focused (~75-90 min).**

---

## Phase 32.2 — INV-29 over-allocation write-time check (~3 findings collapse)

**Architectural addition:** New invariant + new validation in the override-write path.

**INV-29 proposed wording:** *"`sum(S.activePlan.overrides['savings:*'].thisCycleAmount) ≤ MODEL.allocation.allocatableToSavings`. Violated when: savings sub-screen shows '$X over allocated to goals'."*

**Phase 1A findings collapsed:**
- Item 4 sub-bug (tick conflated with assign — partially addressed by Item 4 label fix, but underlying integrity-hole not closed)
- (New) "-$263 over-allocated" data-integrity finding from 2026-05-19 phone walk

**Phase 1B Run 2 findings collapsed:**
- `payday-savings-subscreen`: "-$263 over allocated to goals" state visible behind modal (P1 consistency — the audit found it via debris on a Welcome-modal-blocked surface, but the state is real)
- `payday-savings-subscreen`: Darwin Trip card "0% / 68% progress" misalignment (P2 dead, may collapse adjacent)

**Surfaces affected by the new write-time check:**
- `openEditPaydaySavings` save handler (`index.html:~10974` area)
- `openEditPaydayUpcoming` save handler (`:~11115`)
- `openEditPaydayKiaExtra` save handler (`:~11002`)
- `openEditPaydayTripAlloc` save handler (`:~11049`)
- All four share the override-write pattern; INV-29 wraps the canonical override-set path

**Smoke spec:** extend `tests/smoke/autodebit-batch.smoke.js` style — synthetic over-allocation attempt, assert refusal + audit log `inv29_refusal` entry + state unchanged.

**Scope estimate:** ~60-80 LOC + INV registration + smoke spec. Depends on 32.1 (`MODEL.allocation.allocatableToSavings`). **Bundle together with 32.1 OR ship serially.**

---

## Phase 32.3 — Trip-aware survival forecast (~2 findings + ADR-grade architectural work)

**Architectural extension:** Refactor `getSurvivalForecast`'s day-by-day loop to consult trip schedules and savings buckets. New `MODEL.tripBufferedDays` derived count.

**Phase 1A findings collapsed:**
- Item 9 (min living costs sourced from history, not budget — partially adjacent; the historical-vs-budget question is separate from trip-buffer-blindness)

**Phase 1B Run 2 findings collapsed:**
- `analysis-survival-forecast`: "Cycle plan locked - 4 bills totalling $4540" warning vs current balance ambiguity (P1 semantic, Item 7 overlap — partially resolved by Item 16 batch handler but trip-buffer-blindness still exists)
- (New from phone walk): false-runout when Darwin trip is funded from bucket but forecast decrements main balance

**Scope:** Large. ADR-worthy before implementation. The day-by-day simulation drives multiple Dashboard/Analysis displays; regression risk non-trivial. Defer to dedicated session.

**Bundle 32 disposition:** ADR-E sibling. NOT recommended for this-session shipping unless John explicitly accepts the scope.

---

## Phase 32.4 — `MODEL.essentialsVsDiscretionary` + drilldown (~5 findings collapse)

**Architectural extension:** Lift the inline Essentials vs Discretionary iteration into a canonical reader exposing per-category breakdown. UI adds tap-to-expand drilldown showing the txn list summed into each bucket.

**Phase 1A findings collapsed:**
- Item 3 residual opacity (Bundle 31 fixed the math; transparency gap remains)

**Phase 1B Run 2 findings collapsed:**
- `analysis-tab-pivot`: "Total outflows $8696.78 vs visible $5424 gap" (P1 consistency — partly resolved by drilldown showing what's hidden)
- `analysis-tab-essentials`: Essential vs Discretionary breakdown not visible despite audit scope (P1 semantic, Item 3 overlap — Welcome-modal artifact may contribute; needs re-audit after 32.0a)
- `analysis-tab-pivot`: "13% / 36.7% / 12.6% percentages don't clarify denominator" (P1 semantic)
- `analysis-tab-pivot`: Collapse/expand chevrons subtle (P2 clarity — adjacent to drilldown affordance)

**Scope:** Medium. ~40-60 LOC + MODEL field + modal pattern reuse.

---

## Phase 32.5 — Hero cycle-spend always-visible (~3 findings collapse)

**Architectural change:** Promote cycle-spend to its own sub-line (not conditional fallback). May require small layout adjustment.

**Phase 1A findings collapsed:**
- Item 1 (this cycle labelling — partially overlaps 32.1 if MODEL.allocation includes cycle-spend cross-reference)

**Phase 1B Run 2 findings collapsed:**
- `dashboard-hero`: "Nothing spent today - $5,002 this cycle" contradictory framing (P2 semantic, Item 1 overlap)
- `dashboard-scrolled-cards`: "$5,002 this cycle" vs Property Deposit $5,681 cycle-boundary doubt (P2 semantic, Items 1+3 overlap)

**Scope:** Small. ~10-20 LOC.

---

## Phase 32.6 — `BRAIN.plan.resetCycle` (1 finding)

**New canonical writer + UI button:** Reset per-cycle plan state (overrides + ticks + savings + knownUpcoming) while preserving txns, bal, debts, bills.

**Phase 1A findings collapsed:**
- None directly (new finding from 2026-05-19 phone walk)

**Phase 1B Run 2 findings collapsed:**
- None directly

**Scope:** Small. ~30-50 LOC + new SOURCE + new BRAIN method.

**Bundle 32 disposition:** Standalone small fix. Could ship anytime; not prerequisite for or blocked by other phases.

---

## Filter-scatter cleanup (G) — OPEN-BUGS cluster

Cross-cutting cleanup. Migrate remaining lax-filter consumers to canonical helpers. NOT a MODEL extension per se — more like Guardian-rule enforcement of existing canonical readers.

**Closes:**
- OPEN-BUGS #6 part-B (strict `_NON_SPEND_CATS` migration)
- OPEN-BUGS #7 (renderCutSliders all-time vs monthly scope)
- OPEN-BUGS #8 (dashboard pace tile lax filter)
- OPEN-BUGS #17 (cross-tile today's spend coherence)

**Run 2 findings cross-ref:** "Daily pace figures compete visually with category totals without clear hierarchy" (P2 density on analysis-tab-pivot + analysis-tab-essentials)

**Scope:** Medium. ~50-80 LOC + new Guardian rule `today-spend-renderers-consume-MODEL.todaySpent`.

**Bundle 32 disposition:** Highest leverage AFTER 32.1 lands (because 32.1 establishes the canonical-reader pattern that G's migration would follow).

---

## Pure UX polish residual (H) — non-architectural, ~15 findings

These don't benefit from MODEL extension. They're individual label/density/affordance fixes that each shipping doesn't make the next easier.

**Phase 1A items:**
- 10 (MAX PER DAY + Running pace adjacency)
- 11 (no discoverable delete for upcoming items — partially adjacent to Item 11 OPEN-BUGS #44 just filed)
- 12 (Goals/Buckets card external buttons — Trips already inline)
- 13 (WRX always-open clutter)
- 14 (Opportunity Cost on rent — overlaps G filter-scatter)
- 15 (Month-on-Month doesn't compare — may want to just remove the tile)
- 17 (Opal $1 placeholder — data-design question)

**Phase 1B Run 2 sample (subset):**
- `dashboard-hero`: UNLOCK button affordance (P1 clarity)
- `bills-tab-top`: BNPL button noun-vs-verb (P1 semantic)
- `plan-mode-root`: Settings button styling (P1 clarity)
- `plan-mode-root`: bottom-nav icon-only labels (P2 clarity)
- `payday-bills-subscreen`: "No date" label ambiguous (P2 clarity)

**Bundle 32 disposition:** Triage individually. Each is ~5-15 LOC. Bundle by surface to maximize phone-verify efficiency.

---

## Recommended Bundle 32 phase ordering

| Order | Phase | Why this order |
|---|---|---|
| 1 | **32.0a (fix audit script Welcome modal dismiss)** | Cheapest. Discards 23 false findings before they pollute triage further. |
| 2 | **32.1 (`MODEL.allocation`)** | Foundation. Establishes the canonical-reader pattern. Collapses ~14 findings. Session-shippable. |
| 3 | **32.2 (INV-29)** | Closes data-integrity hole. Depends on 32.1. Can bundle with 32.1 if scope fits. |
| 4 | **G (filter-scatter cleanup)** | Mirrors 32.1 pattern. ~50-80 LOC. Closes 4 OPEN-BUGS. |
| 5 | **32.4 (`MODEL.essentialsVsDiscretionary` + drilldown)** | Adjacent to G + benefits from 32.1's pattern. |
| 6 | **32.5 (hero cycle-spend visibility)** | Small layout fix. Independent. |
| 7 | **32.6 (`BRAIN.plan.resetCycle`)** | Small UX gap fix. Independent. |
| 8 | **32.3 (trip-aware survival forecast)** | ADR-worthy. Largest scope. Deferred until ADR signed off. |
| 9 | **H (pure UX polish batch)** | Individual fixes. Spread across multiple bundles or land as time permits. |

---

## Session decision needed

**32.1 scope estimate:** ~80-120 LOC code + 1 smoke spec + 1 Guardian rule + 3 renderer migrations. **Estimate 75-90 min to ship cleanly** (define MODEL.allocation + migrate renderers + smoke + Guardian rule + commit + phone-verify checklist).

**Three options for this session:**

**(A) Ship 32.0a (audit script fix) + 32.1 (`MODEL.allocation`)** — high-leverage session, ~2 hours work, lands the architectural shift.

**(B) Commit triage doc + diagnostic, defer 32.1 to fresh kickoff session** — preserves the diagnostic + triage as anchors, picks up implementation with fresh judgment.

**(C) Ship 32.0a only** — quick win, gives clean audit baseline for next session.

**My read: (B) or (C).** It's late in the session; 32.1 is architecturally important enough that "do it tired" risk is real. The diagnostic + triage are themselves the high-value Bundle 32 anchors. Implementation benefits from fresh state.
