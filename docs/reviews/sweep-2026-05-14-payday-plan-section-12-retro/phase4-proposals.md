# Phase 4 — Proposed changes

**Phase 5 STOP rule: NO Edit/Write to index.html until John approves the items below line-by-line.**

Findings ranked by category, then impact × confidence within category. Effort shown as naive → 2x adjusted per Opus manual §6.

---

## 🚨 Bugs (always-fix)

### Finding F-01: Savings double-count when trip-id override survives Apply

**Category:** 🚨 Bug
**What:** When user manually allocates to a trip (savings:trip-X), then auto-allocate Apply creates a bucket for the same trip (savings:Darwin), BOTH overrides persist. savingsTotal counts both. Lock-modal "Buffer is tight" warning fires falsely (or fires correctly but for the wrong reason). Real `freeTotal` is understated by the orphan trip-id amount.
**Where:**
- File: index.html
- Line(s): L19390-L19412 (applyRecommendation synth-bucket creation) + L18247-L18266 (getSnapshot savingsTotal sum)
- Surfaces: Savings sub-screen pool, canvas REMAINDER (indirect via savings.total), lock-confirm modal, auto-allocate Apply
- Frames affected: 08 ✓, 10 ✓, 11 ✓, 12 (manifests as "Buffer is tight $162 vs $364" warning)
**Why (grounded):** applyRecommendation creates the bucket + calls setOverride('savings', name, $755) but never clearOverride('savings', 'trip-' + tripId). The pre-existing trip-id override persists. My Batch D savingsTotal fix sums all `savings:*` keys → both counted. Net effect: $500 + $755 = $1,255 instead of $755.
**Effort (naive → 2x adjusted):** 30 min → 60 min, confidence high
**Risk if fix is wrong:** Could under-count savings if dedup is too aggressive; could leave orphan trip-id overrides if cleanup runs only at Apply (not at trip-card save).
**Cross-references:** FEATURE-MAP — savings.total drives lock-modal warning + canvas proportion bar Savings segment.
**CC's recommendation:** In applyRecommendation, after creating a bucket for a synth trip, ALSO call `clearOverride('savings', 'trip-' + trip.id)` for the matching trip. Belt-and-braces: ALSO add a dedup pass in getSnapshot's savingsTotal — when a trip-id override exists AND a bucket-name override exists for the same trip (via PLAN.getTrips name match), prefer the bucket override.
**John's call:** ____

---

### Finding F-02: Math sub-line equation doesn't balance ("$X surplus − $Y buffer = $Z")

**Category:** 🚨 Bug (display)
**What:** Savings sub-screen Pool to allocate sub-line shows "$1,907 surplus − $364 safety buffer = $1,245". Actual: $1,907 − $298 provisions − $364 buffer = $1,245. Provisions silently subtracted but not shown in the equation. Users who do the math see it doesn't balance.
**Where:**
- File: index.html
- Line(s): L11983-L11984 (savings pool math sub-line render)
- Surfaces: Savings sub-screen Pool to allocate
- Frames affected: 06, 08
**Why (grounded):** `surplusBeforeBuffer = Math.max(0, freeTotal)`. freeTotal omits provisions (per Bundle 27 baseline). allocatableToSavings subtracts provisions + buffer + savings.total. So display shows `freeTotal − buffer = allocatable` but reality is `freeTotal − provisions − buffer = allocatable`. Equation as printed is missing one term.
**Effort:** 15 min → 30 min, confidence high
**Risk:** Wrong choice of fix could confuse the math further. Need to pick A (show 3-term) or B (redefine surplus).
**Cross-references:** auto-allocate modal's "Already covered first" section already shows all 5 terms (bills/debts/living/provisions/buffer) correctly. The savings pool sub-line should match this transparency.
**CC's recommendation:** Option A — show all subtracted terms: "$1,907 surplus − $298 provisions − $364 buffer = $1,245". 3-term equation balances and matches auto-allocate's transparency. Low risk.
**John's call:** ____

---

### Finding F-08: Lock-shortfall check ignores provisions

**Category:** 🚨 Bug (financial-math)
**What:** Lock modal `remainder` uses `snap.derived.freeTotal` which omits the $298/month provisions. User can lock a plan that's actually short by ~$300 after provisions are honored. Tight-buffer warning fires but doesn't prevent lock.
**Where:**
- File: index.html
- Line(s): L10937 (`const remainder = snap.derived.freeTotal;`) + L10940-L10943 (`if (remainder < 0)` block)
- Surfaces: Lock-confirm modal validation, "Can't lock yet" block
- Frames affected: 12 (warning fires) — would also affect frames 21 (Scenario C lock allowed)
**Why (grounded):** freeTotal at L18244 = totalToPlan − bills − debts − savings − upcoming − living (no provisions, no buffer). Real shortfall check should use surplus = totalToPlan − bills − debts − upcoming − living − provisions − buffer (or at least include provisions in the subtraction).
**Effort:** 20 min → 40 min, confidence high
**Risk:** Switching to surplus would block lock in more cases. Some users might want to lock with deferred-provisions decisions. Mitigation: surface the math in the can't-lock copy so user knows exactly what to trim.
**Cross-references:** auto-allocate uses snap.derived.surplus already (post-Batch B canonicalisation). Lock-modal should match.
**CC's recommendation:** Switch `const remainder = snap.derived.freeTotal;` → `const remainder = snap.derived.surplus;` + update tight-buffer threshold to use surplus comparison too. Update copy in can't-lock modal to enumerate the math.
**John's call:** ____

---

### Finding F-09: Streak inflates on relock within same cycle

**Category:** 🚨 Bug (data)
**What:** `S.activePlan.streak` increments on EVERY successful lock. If user locks → unlocks → relocks, streak goes up twice for the same cycle.
**Where:**
- File: index.html
- Line(s): L11097 (`S.activePlan.streak = (+S.activePlan.streak || 0) + 1`)
- Surfaces: Locked banner streak badge, toast, AI prompt context
- Frames affected: 13 ("2 cycle streak" — first lock in test), 21 ("3 cycle streak" — second lock in test, same plan/cycle)
**Why (grounded):** Lock save handler unconditionally increments. No cycleId tracking field.
**Effort:** 30 min → 60 min, confidence medium (need to add a `lastStreakCycleId` field)
**Risk:** Could miss the increment if cycle-rollover logic doesn't reset the gate. Need to verify rollover clears `lastStreakCycleId`.
**Cross-references:** Streak is referenced in AI prompt + onboarding stats.
**CC's recommendation:** Track `S.activePlan.lastStreakedCycleId` (separate field). Increment only when `lastStreakedCycleId !== current cycleId`. Reset / re-increment on rolloverIfNeeded.
**John's call:** ____

---

## ⚠️ UX gaps with clear answers

### Finding F-10: Projection<0 shows red but offers no action

**Category:** ⚠️ UX clear
**What:** Canvas root shows "$X now → -$Y left to cover this cycle" in red whenever projection is negative. No actionable hint on what to do about it.
**Where:**
- File: index.html
- Line(s): L9788 (projection render)
- Surfaces: Canvas hero
- Frames affected: every frame in this sweep (negative projection is common in fixture)
**Why (grounded):** Display logic only renders the number + color, no advisory.
**Effort:** 20 min → 40 min, confidence high
**Risk:** Adding too much copy clutters the hero. Keep it as a single tappable hint.
**Cross-references:** "Can't lock yet" modal already enumerates the options (trim goal, defer bill, lower floor). Reuse that as the destination.
**CC's recommendation:** When projectedEndBalance < 0, append a small text/link "→ What can I do?" below the projection. Tap → modal with the same options as Can't-Lock.
**John's call:** ____

---

### Finding F-03: Toast covers Live-Preview rows + content (z-index sandwich)

**Category:** ⚠️ UX clear
**What:** Toast at bottom:180px z-index 800 overlays modal Live-Preview content (frames 03 Bonus modal, 06 savings, 10 auto-allocate footnote, 13/21 daily-living row).
**Where:**
- File: index.html
- Line(s): L13314 (toast positioning)
- Surfaces: Every toast occurrence
- Frames affected: 02, 03, 04, 05, 06, 08, 09, 10, 11, 12, 13, 17, 18, 19, 20, 21
**Why (grounded):** Toast z-index 800 (Bundle 28.x fix for canvas overlay) is higher than modal content (z-index 700). When toast is active, modal content is hidden.
**Effort:** 15 min → 30 min, confidence high
**Risk:** Lowering toast z-index could re-introduce the original "toast hidden behind canvas" bug. Need to scope the z-index reduction only when a modal is open.
**Cross-references:** Bundle 28.x raised z-index 500→800 to fix canvas-overlap. Now needs nuance.
**CC's recommendation:** Move toast position from bottom:180px to bottom:96px (closer to bottom edge, below typical Cancel/Save buttons). KEEP z-index 800. Less overlap with content.
**John's call:** ____

---

### Finding F-04: Slider markers (🎯 / 🚫) overlap recent-avg text row AND each other when close

**Category:** ⚠️ UX clear
**What:** Below the daily-living slider, the 🎯 recommended + 🚫 max marker chips can overlap (a) the slider track's vertical space pushing into the "Last 30 days you actually spent..." row below, and (b) each other when their dollar values map to close horizontal positions on the slider.
**Where:**
- File: index.html
- Line(s): L203-L205 (.lc-marker-rec / .lc-marker-max CSS) + L194 (.lc-slider-wrap padding-bottom)
- Surfaces: Daily Living card slider markers
- Frames affected: 05, 17
**Why (grounded):** `.lc-slider-wrap{padding:6px 0 26px}` reserves only 26px below the slider. Markers at top:18px (rec) and top:42px (max) need ~16px chip height each = bottom edge at ~58px from slider track. Padding ends at 32px. Overlap = 26px.
**Effort:** 15 min → 30 min
**Risk:** Increasing padding pushes the safety-buffer row further from the slider → more vertical space used.
**Cross-references:** Phase 3 also noted horizontal overlap when markers map to similar slider positions.
**CC's recommendation:** Increase `.lc-slider-wrap{padding-bottom: 56px}` (room for both stacked markers + their chip heights). Plus a horizontal-jitter: if `Math.abs(recPct - maxPct) < 8`, push max marker to top:60px (third row). Or render them side-by-side at the same vertical with chip text overlapping using zIndex but offset.
**John's call:** ____

---

### Finding F-07: 🗑 Delete this trip button placement in trip-allocation modal

**Category:** ⚠️ UX clear
**What:** A full-width red "🗑️ Delete this trip" button sits at the bottom of the trip-allocation modal. User came to allocate $X to Darwin; the destructive delete is one big tap away.
**Where:**
- File: index.html
- Line(s): L10569-L10572 (button render)
- Surfaces: Trip allocation modal (openEditPaydayTripAlloc)
- Frames affected: 07
**Why (grounded):** Delete has a confirm() prompt (verified at L23871). Still, the visual prominence is wrong — full-width red competes with the primary Save button.
**Effort:** 15 min → 30 min
**Risk:** Hiding the delete affordance could make trip cleanup harder. Compromise: smaller button or move to a settings/manage screen.
**CC's recommendation:** Shrink to a smaller "🗑 delete" link at top-right of the modal (or under the modal title), not full-width at bottom. Save remains the dominant action.
**John's call:** ____

---

### Finding F-11: Buffer-modal Live-Preview color semantics debatable

**Category:** ⚠️ UX clear
**What:** When user increases the buffer, the new buffer row shows in green (positive). But increasing buffer DECREASES the max-affordable-per-day — usually NOT what user wants when funds are tight. Color is misleading.
**Where:**
- File: index.html
- Line(s): L11023 (`kind: bufferDelta > 0 ? 'pos' : bufferDelta < 0 ? 'warn' : ''`)
- Surfaces: Buffer modal Live-Preview
- Frames affected: 15, 16
**Why (grounded):** Color classification favors "bigger buffer = safer = green" but the per-day max impact is negative. Two competing semantics.
**Effort:** 5 min → 10 min
**Risk:** Low.
**CC's recommendation:** Drop the kind class for buffer-delta row (`kind: ''`). Let the max-affordable row's amber/warn signal carry the story when buffer-up impacts daily-living capacity.
**John's call:** ____

---

## 🎨 UX gaps that need design (defer to Opus)

### Finding F-05: "✓ LANDED" bonus pill vs paydayReceived flag

**Category:** 🎨 UX defer
**What:** Bonus.status='confirmed' renders a green "✓ LANDED" pill but doesn't fire markPaydayLanded until LOCK. User sees LANDED in one place + "Pay landed today?" prompt in another, simultaneously.
**Where:** L9710-L9714 (bonus pill) + L11141 (lock-confirmed-fires-paydayLanded) + L9758 (Pay landed today? prompt)
**Surfaces:** Canvas hero bonus row + top-of-screen status pill
**Frames affected:** 20
**Effort:** 15 min naive → 30 min adjusted if Option A; could be 60+ min if Option B requires re-architecting the markPaydayLanded gate
**Risk:** Premature paydayLanded firing could lose user opt-out value (currently lock = commit).
**CC's recommendation:** Defer to Opus design pass. Options:
  - A: Fire markPaydayLanded immediately on bonus.confirmed save
  - B: Show a subtle "Lock the plan to record payday landed" microcopy near LANDED pill
  - C: Hide LANDED pill until paydayReceived=true (gate display by both flags)
**John's call:** ____

---

### Finding F-14: Cycle copy clarity ("Cycle ended — next payday begins this cycle ✓ Paid 14 May")

**Category:** 🎨 UX defer
**What:** Header says "Cycle 14 Apr → 14 May · Cycle ended — next payday begins this cycle ✓ Paid 14 May". On re-read it announces "today is payday for the new cycle" — but a user opening cold might find it paradoxical.
**Where:** Canvas header render
**Surfaces:** Every canvas frame
**Frames affected:** every frame
**Effort:** 15 min → 30 min copy revision
**Risk:** Bad copy can confuse more than improve.
**CC's recommendation:** Defer to Opus copy pass. Suggestion: split into two lines — "Cycle 14 Apr → 14 May (ended today)" + "Next cycle: 14 May → 13 Jun starts now ✓ payday landed".
**John's call:** ____

---

### Open question for John: rollover deferral escape hatch

**Category:** ❓ Question for John
**What:** When cycle has ended AND hasWork=true, the 12h-grace guard defers rollover. User has no UI to force a new cycle. Stuck in "cycle ended" until 12h passes.
**Where:** L19256-L19273 (rolloverIfNeeded grace guard)
**Frames affected:** Cross-cutting — frames 01, 04, 13, 18, 20, 21 all show the "Cycle 14 Apr → 14 May · Cycle ended" header
**John's call:** Pick one or hybrid:
- A: Tighten hasWork — only defer if `lockedAt || Object.keys(overrides).length > 0`. Drop bonus/upcoming/savings clauses since carry-forward handles them.
- B: Surface a "Start new cycle now" affordance when cycle ended + grace active.
- C: Keep current behavior — protective guard wins.
**CC's recommendation:** Option A. Bonus and knownUpcoming both carry forward already in rolloverIfNeeded — the guard was over-protective.
**John's call:** ____

---

## 💨 Code smells

### Finding F-12: Bonus chip re-select silently overwrites Custom-typed value

**Category:** 💨 Smell
**What:** User types $1,341 in Custom, then re-selects a $1,000 chip. The custom value is discarded silently. No "previous: $1,341" hint or undo affordance.
**Where:** L10073-L10082 (_wireQuickPickGrid). Chip click clears custom-input value.
**Frames affected:** Scenario A→C transition (frame 18→19 — bonus changed from $1,341 Custom to $1,000 chip)
**Effort:** 20 min → 40 min
**Risk:** Low.
**CC's recommendation:** Show a tiny "previous: $1,341" undo hint below chips when prior-state is a custom value. Tap to revert.
**John's call:** ____

---

### Finding F-13: Locked plan reads live S, not lockedSnapshot

**Category:** 💨 Smell (structural)
**What:** When plan is locked, canvas still reads live `S.bills`, `S.debts` for the rendered Essentials. If user edits a bill amount in Settings post-lock, the locked plan's displayed Essentials shift. lockedSnapshot exists but isn't surfaced.
**Where:** L17915 (BRAIN.allocation.lock stores snapshot) but getSnapshot reads live (L18234+)
**Frames affected:** Not directly visible in sweep, but structural risk
**Effort:** 60 min → 120 min — needs a full snap-read-from-lockedSnapshot mode
**Risk:** High change. Defer to a dedicated bundle.
**CC's recommendation:** Park as "follow-up sweep" — would need a scenario where bill amount changes post-lock to observe.
**John's call:** ____

---

### Finding F-06: Scenario B doesn't trigger IMPOSSIBLE (Layer V harness, not app)

**Category:** 💨 Smell (harness)
**What:** Layer V Section 12 Scenario B sets buffer to $1,000 expecting IMPOSSIBLE state. Math doesn't add up — to trigger IMPOSSIBLE the buffer needs to push max below floor ($1,725+). Current state at buffer=$1,000 is Tight, not Impossible.
**Where:** scripts/layerV-capture.js Section 12 Scenario B
**Frames affected:** 16, 17
**Effort:** 10 min → 20 min — update the scenario script
**Risk:** Low.
**CC's recommendation:** Update Scenario B to also push slider to $50/day so floor exceeds max. Or pick a Custom buffer value $1,800. Pick whichever cleanly demonstrates the IMPOSSIBLE state.
**John's call:** ____

---

## Findings summary

| ID | Category | Severity | Effort | Confidence | John's call |
|---|---|---|---|---|---|
| F-01 | 🚨 Bug | High (blocking financial-math) | 30→60 min | High | ____ |
| F-02 | 🚨 Bug (display) | High (visible math wrong) | 15→30 min | High | ____ |
| F-08 | 🚨 Bug (financial) | High | 20→40 min | High | ____ |
| F-09 | 🚨 Bug (data) | Medium | 30→60 min | Medium | ____ |
| F-10 | ⚠️ UX clear | High (common state) | 20→40 min | High | ____ |
| F-03 | ⚠️ UX clear | Medium | 15→30 min | High | ____ |
| F-04 | ⚠️ UX clear | Medium | 15→30 min | Medium | ____ |
| F-07 | ⚠️ UX clear | Medium | 15→30 min | Medium | ____ |
| F-11 | ⚠️ UX clear | Low | 5→10 min | Medium | ____ |
| F-05 | 🎨 UX defer | Low | 15→60 min | (design) | ____ |
| F-14 | 🎨 UX defer | Low | 15→30 min | (copy) | ____ |
| Rollover-escape | ❓ Question | Medium | 10→20 min | (decision) | ____ |
| F-12 | 💨 Smell | Low | 20→40 min | Low | ____ |
| F-13 | 💨 Smell (structural) | Low (latent) | 60→120 min | Low-Med | ____ |
| F-06 | 💨 Smell (harness) | Low | 10→20 min | High | ____ |

**Total naive effort:** ~285 min ≈ 4.75 hours
**Total adjusted effort:** ~620 min ≈ 10.3 hours

**Suggested ship-now batch (90 min):** F-01 + F-02 + F-08 + F-11. These are the blocking-financial + visible-math + lowest-risk wins.

**Phase 5 STOP — awaiting John's Y/N/alternative on each finding above.**
