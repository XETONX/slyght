# SLYGHT Allocation Playground — Design Proposal

**Date:** 2026-05-05
**Author:** Opus (Claude)
**Builds on:** `ANALYSIS-DEEP-PASS-2026-05-05.md` § 6 (cascade refactor)
**Constraint:** No code in this doc. Design only. Mission file comes after we converge.

---

## What this is

The Allocation Playground is the answer to John's articulated need:

> "I want to see what it looks like if I get 8K, how can I allocate that money and where and how much into each bucket"
> "It needs to be fluid, planning should help me understand where my money should go"
> "Buttons to show a plan before saving it and locking it in"

It replaces `renderPaydayAllocation` in Plan Mode. It is *the* place where John dwells before payday, gets excited, and arrives at a plan he locks in.

The playground is structured around a **3-layer cascade** that is visible at all times:

```
Income          (salary + what-ifs)         editable
   ↓ minus
Locked          (rent, KIA, provisions)     read-only, transparent
   ↓ leaves
Discretionary pool                          the canvas
   ↓ split between
Behavioral      (food, transport, etc.)     editable per category
Goals           (china, apartment, etc.)    editable per goal
Buffer          (daily living wiggle room)  derived
```

Every drag updates every downstream number in real time. Every dollar is accounted for, visibly. There is no hidden math.

---

## Answers to the 10 design questions

### Q1 — Scope of allocation

**Recommendation:** option (a) — allocation happens on the **discretionary pool** only. Locked obligations are shown in full but not editable in the playground.

**Reasoning:** Rent in 12 days isn't a real lever. KIA loan in 12 days isn't either. The "pretend you didn't have to pay rent" what-if is fantasy that doesn't help John make a decision he can act on. Treating Locked as fixed for *this cycle* anchors the playground to reality. Some "locked" items (subscriptions, the deposit-to-Mum amount) ARE cuttable — but on a 30+ day horizon, not in this cycle. Those decisions belong in a separate Subscription Audit (analysis § 7.2 missing item) or in a Mum-relationship card (analysis § 8.5).

**However** — Locked must be transparent. The user sees the locked subtotal (the **#48 transparency** work shipped in `4a8cfba` already does this). Tap to expand the breakdown. Knowing what's locked is part of the trust in the rest of the math.

**Pushback on the framing of the question:** option (b) — "allow user to mentally challenge fixed costs" — sounds empowering but in practice produces unrealistic plans. The cycle the playground plans for is 12-15 days. Subs renew on day 30+. Rent is on day 0 of next cycle. There's no playground move that affects locked costs *this cycle*.

**Implication:** the playground takes Locked as input, not editable. Income above Locked is the only thing the user can play with.

---

### Q2 — The three layers

**Recommendation:** Locked = read-only, Behavioral = editable per category, Goals = editable per goal.

**Behavioral layer details.** Each row shows three numbers per category:

```
🍱 Food / Coffee
   target $400        ← editable (big, mono)
   30-day avg $336    ← read-only italic, smaller
   this cycle $87     ← read-only, third color (cool blue?)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ progress bar
   13/15 days · $30/day at this rate
```

The three numbers tell three different stories:
1. **target** is the user's stated intention for this cycle
2. **30-day avg** is what they actually do on average (anchors realism)
3. **this cycle** is the running total since last payday (live as transactions log)

The progress bar is `this cycle / target`. When `this cycle` exceeds `target`, the bar turns red and overflows. Honest, no scolding.

**What does sliding food $900 → $400 produce?** Concretely:
- Behavioral subtotal updates: −$500
- Discretionary-after-behavioral grows: +$500
- "What this unlocks" line at the bottom of the cascade animates: *"Frees $500 — China goal moves from June 2027 to April 2027"*
- Goals' max-allocation slider range extends (China can now slide higher)
- Daily living buffer increases proportionally
- Soft yellow indicator on the food row: *"🌱 aggressive — $264 below your 30-day avg. What's your plan?"*

The slider feeling: smooth, debounced 200ms, magnetic snap at meaningful values (avg, half-avg, last-cycle-actual). No hard limit but warning state when target deviates >50% from avg.

**Categories chosen:** auto-derived top 4-5 from real spending data (`computeAvgByCategory`), filtered to discretionary cats only (`_NON_SPEND_CATS` excluded). For John's data: Food / Coffee, Transport / Fuel, Entertainment, Shopping, plus Other if it's >10% of spend.

**Edge:** if a category has <3 transactions in last 30 days, hide it. Don't ask John to set a target for "Health" if he hasn't logged any health spending.

**Goals layer details.** Same as today's `renderPaydayAllocation` sliders (China, Apartment, Freedom Buffer, Darwin) — but visually integrated into the cascade so the math chain reads top-to-bottom in one pass. Each goal slider already has the affordability check from `4a8cfba` — keep it.

---

### Q3 — What's the output

**Recommendation:** **3 storage tiers, only the middle is named.**

```
DRAFT (1 slot, ephemeral)
   ↓ optional save
SAVED SCENARIOS (3 slots, named, persisted)
   ↓ optional lock
LOCKED PLAN (1 slot, committed for this cycle)
```

**Draft** = whatever the user is currently editing. Auto-saves to localStorage on every drag. Survives session close. Shows as "Editing..." in the UI.

**Saved scenarios** = up to 3 named snapshots ("Default with bonus", "Dentist month", "If WRX sells"). Created via "💾 Save scenario" button. Compared via tap (re-loads that scenario into the active draft). Deletable.

**Locked plan** = the one committed via "🔒 Lock for May 15." Shown with a lock icon overlay on the playground. Sliders become read-only. Unlock button available with confirmation.

**Why 3 saved slots and not unlimited?** Three is enough to compare meaningfully ("default vs bonus vs dentist") without becoming a scenario hoarding cabinet. More than 3 = the user makes scenarios they never revisit. The constraint is a feature.

**Default state** = the un-edited cascade computed from current bills, debts, behavioral 30-day-avg, and goal slider stored values. There's always an implicit "default" shown when nothing is in flight; it's not a saved scenario but it's there.

**Pushback on framing:** the question asked *"or an updated PLAN.payday allocation that overwrites previous?"* — the answer is yes, that's what locking does. Locking writes to `localStorage.slyght_payday_plan` (existing path). Saved scenarios are a separate slot in `S.savedScenarios`. They don't overwrite each other.

---

### Q4 — What-ifs

**Recommendation:** **inline +/- chips above the cascade**, NOT a separate panel.

The income field at the top has a trailing `[+]` button. Tap it → a small modal asks:

```
Add a what-if
  + Bonus or extra income
  + Pay off a debt
  − Surprise expense
  + Sell the WRX (uses $24,000 net)
```

Each addition becomes a chip in a row directly under income:

```
INCOME            $7,282        [+]
  + bonus $1,500 ✕
  − dentist $400 ✕
  + WRX sale +$24,000 ✕
                  ─────────
TOTAL INCOME      $32,382
```

Chips are removable (✕). Each is shown as a delta. The TOTAL INCOME line below sums everything.

**Stack arbitrarily.** "Bonus + dentist + WRX sale" all at once is allowed and meaningful — that's how John actually thinks ("if WRX sells AND bonus comes in AND dentist hits...").

**Persistence:** what-ifs live in the **draft** (auto-saves). When user opens playground again, last what-ifs are still there. Reset clears them.

**WRX sale is bigger than other what-ifs.** It's a $24k event that clears KIA loan, frees $780/mo. Treating it as a small chip undersells it.

**Recommendation:** WRX sale chip exists, but the FIRST time user adds it in a session, the cascade does an animated reshuffling — KIA balance bar empties, $780/mo freed-up annotation appears, debt liabilities visibly clear. Subsequent toggles are quieter. The first time gets ceremony.

**Reset to default:** a `↻` button in the top-right of the playground. Confirmation: "Discard all what-ifs and slider changes?" Clears draft to default state.

---

### Q5 — The math surface

**Recommendation:** **the cascade IS the math surface.** Each layer shows its own subtotal in line. Drag → all numbers update. No floating overlay.

But certain derived KPIs aren't part of the cascade per se. They go in a **"What this means"** footer panel at the bottom of the playground:

```
─────────────────────────────────────────────────
WHAT THIS MEANS

📅 China holiday — April 2027 (was June 2027)
🏠 Property deposit — Aug 2030 (was Sept 2030)
💵 Daily living — $60/day for 12 days = $720
🎯 End-of-cycle balance — $-12 (tight)

Sticking to this plan saves $500/mo vs your average.
─────────────────────────────────────────────────
```

These update with every drag (debounced 200ms). Subtle but always visible at the bottom of scroll.

**Inline goal ETAs.** Each goal slider shows its ETA next to its name: *"🇨🇳 China holiday — Sept 2026 at $300/mo."* When user drags, ETA updates inline (the same affordability micro-feedback already shipped in `4a8cfba`).

**A floating "headline" in the corner** — I considered this and decided against it. The cascade and footer together carry the math. Adding a floating overlay competes with itself. The footer panel IS the headline summary; the cascade IS the working.

**One exception:** when the user reaches a goal-completion state via slider (e.g., dragging China to $4,933 = full target), a brief 1.5s celebration appears: *"🎉 China holiday goal reached!"* This is the only ephemeral micro-overlay.

---

### Q6 — Constraints and warnings

**Recommendation:** **nudges, not blocks. Visible state changes, not modal interruptions.**

**Over-allocate ($8,000 of $7,282).** The "Buffer" line goes red. A `⚠` indicator appears next to the buffer subtotal: *"This plan goes negative on day Y."* The lock button isn't disabled, but tapping it triggers an extra confirmation: *"This plan leaves you $-718 by payday. Lock anyway? You can adjust later."* Yes/no/adjust.

**Under-allocate ($6,000 of $7,282).** The "Buffer" line shows the leftover as a positive value: *"Daily buffer $X — flex room."* Encouraged framing: *"Buffer left for surprise expenses or a no-spend boost."* Not a warning — having buffer is good.

**Behavioral target way below avg.** Soft yellow indicator on the row: *"🌱 aggressive — $X below your 30-day avg. Achievable?"* Doesn't block. Doesn't warn at lock time. The user knows themselves.

**Behavioral target way above avg.** Neutral indicator: *"🎉 Higher than usual — birthday this cycle?"* Don't moralize. Sometimes spending more is the right call.

**Goal allocation overshoots goal target** (e.g., $5,000 to China when only $4,933 needed). Soft green indicator: *"✓ Goal reached — surplus $67 redirects to next priority."* Optionally redirect surplus to next-priority goal automatically.

**The whole approach:** the playground should feel like a sandbox. Warnings exist to inform, not to gate. Locking goes through with confirmation when math is unhealthy, but the user is always allowed to override. This matches the v2 mission style ("don't block decisions").

---

### Q7 — Save / Lock

**Recommendation:** **two distinct, visually different actions.**

**Save scenario** is a secondary action — small button, neutral color. Modal:

```
NAME THIS SCENARIO

[___________________]
e.g., "Bonus comes in"

[ Save ]   [ Cancel ]

You have 1/3 saved scenarios.
```

**Lock plan** is the primary action — bold button, gradient (matches existing `linear-gradient(135deg, #4ECDC4, #26d0ce)`). Below the cascade, full width:

```
🔒 LOCK THIS PLAN FOR MAY 15
```

Tap → confirmation modal:

```
Lock this plan for May 15?

Income          $7,282
What-ifs        +$1,500 bonus
Locked          −$4,078
Behavioral      −$1,150
Goals           −$1,150
Buffer          $904 ($60/day for 15 days)

SLYGHT will track this for you. Unlock anytime.

[ 🔒 Lock plan ]   [ Adjust first ]
```

After locking:
- Cascade overlay shows "🔒 LOCKED" badge in top-right of playground
- All sliders become read-only (cursor: not-allowed; opacity 0.85)
- An "Unlock" link appears at bottom — small, neutral, requires confirmation
- Toast: *"Plan locked. We'll check in 3 days post-payday."*

**Unlocking** = small friction. *"Unlocking removes your committed plan. SLYGHT won't track progress against it. Continue?"* This is intentional — locking should feel like a contract with future-you.

**One scenario can be locked at a time.** Unlock first, edit, re-lock. (You don't have multiple "active" plans.)

---

### Q8 — Pre-payday vs post-payday

**Recommendation:** **the same UI for all phases. The data underneath shifts, not the layout.**

Pushback on the framing: the question implies the playground might have phase-specific modes. I'd argue against this. Three different UIs for three different phases multiplies cognitive load. One UI that adapts subtly is cleaner.

**What changes per phase:**

**Pre-payday (10+ days out):** Header reads *"12 days until your salary lands. Plan it now."* Cascade is forward-tense (income is hypothetical, locked is real, behavioral targets and goals are forward-looking). Encourage experimentation with what-ifs.

**Pre-payday (<3 days):** Header gets a subtle pulse: *"Payday in 3 days. Lock a plan?"* Same cascade. Lock button gets a halo to draw attention. (No layout change.)

**Payday day:** Header changes to *"Today's payday. Your locked plan is now active."* The cascade visualizes the real arrival of money — `S.paydayReceived` flips, the income line turns from hypothetical (faded) to real (solid green). If a plan is locked, it's automatically the cycle's plan.

**Post-payday (review mode):** Header shows *"Cycle in progress — day 5 of 15."* Cascade visualizes **planned vs actual** for each layer:

```
🍱 Food / Coffee
   target $400
   30-day avg $336
   this cycle $187 ✓ on track
   ━━━━━━━━━━░░░░░░░░░ (progress bar against target)
   47% used · 67% of cycle complete
```

**No re-rehearsal mid-cycle** unless user explicitly unlocks. The locked plan IS the cycle's plan. The playground's role mid-cycle is review, not rehearsal. To rehearse the *next* cycle, a "Plan next cycle →" button appears post-payday-day-5. Opens a fresh draft for the next cycle.

**Auto-open behavior:** dashboard shows a hint when applicable:
- Pre-payday <3 days, no plan locked: *"Payday in 3 days — rehearse your plan? →"* (tappable, opens Plan Mode scrolled to playground)
- Post-payday, plan locked: hint disappears
- Post-payday, no plan locked: *"How's this cycle going? See your spending →"* (opens Analysis tab)

---

### Q9 — Entry point

**Recommendation:** **replaces `renderPaydayAllocation` wholesale.** No new tab, no modal, no full-screen takeover.

Plan Mode structure becomes:

```
1. Net Worth header (existing)
2. WRX Status Card (existing — could be folded into Playground as a what-if launch?)
3. 🎮 ALLOCATION PLAYGROUND ← THE NEW THING
4. Trips
5. Goals (renderGoalCards — refactored to read from same draft state)
6. Super card
7. Annual provisions
8. Income simulator → folded into Playground
```

**The Income Simulator** (`renderIncomeSimulator`, line 11208) is a salary-raise slider that cascades to goal ETAs. Its functionality belongs in the Playground's income field. Salary-raise becomes a what-if chip ("+$5,000 raise → +$278/mo after tax"). The standalone Income Simulator section gets removed.

**The bonus modal** (`openBonusModal`, line 10571) similarly folds into the Playground's "+ bonus" what-if chip. Standalone modal goes away.

**Plan Mode doesn't auto-open** the playground. The user navigates to Plan Mode (via the existing PLAN › pill in the dashboard header), and the playground is the most visually prominent section after the WRX card. Scroll-anchor: when entering Plan Mode and there's a pre-payday state, scroll directly to the playground.

**Pushback on framing:** the question listed "modal that opens from a button" and "full-screen takeover" — both add navigation complexity. The playground IS Plan Mode's center of gravity. Making it a sub-experience hides it.

---

### Q10 — Emotional register

**Recommendation:** **warm, soft, narrative.** Distinct from NOW's "cool, sharp, mono."

**Color**:
- Playground card uses warmer accent: `#FFB347` (soft amber-gold) for goal progress, alongside the existing `#4ECDC4` (teal) for "neutral positive" states.
- Active sliders pulse subtly with the goal's color
- Behavioral category rows tint slightly when targets diverge from avg (yellow when aggressive, green when generous, neutral when matching)

**Motion**:
- Slider drag: smooth with subtle ease (matches existing CSS `transition: width 0.5s ease`)
- Number changes: spring up with slight overshoot (CSS `cubic-bezier(0.5, 1.6, 0.5, 1)`)
- Goal cards: when allocation increases, the card lifts subtly (translateY -2px) for 200ms
- Locked plan transition: cascade overlays with a 400ms fade-in of the lock badge

**Microinteractions**:
- Drag a behavioral target → other targets' "could afford" indicators pulse for 600ms
- Reach a goal target via slider → 1.5s celebration: *"🎉 China holiday goal reached!"*
- Lock plan → button morphs into "🔒 Plan Locked" badge with snap animation
- Reset → cascade re-cascades top-to-bottom (numbers tick down, then up to default) over 800ms

**Copy voice**:
- Default state: *"What if your salary went to..."*
- Goal hit via slider: *"🇨🇳 China holiday — you'd reach it by April 2027."*
- Behavioral cut: *"Food $400 instead of $900? Saves $500 — that's 5 weeks of vape money."*
- Lock confirm: *"Lock this plan for May 15? SLYGHT will track it for you."*
- Unlock: *"Unlocking removes your committed plan. Continue?"*
- Reset: *"Discard your changes and start fresh?"*

Voice is **second-person, present-tense possibility**. Never third-person ("the user should..."). Never imperative ("you must save..."). Sometimes playful ("5 weeks of vape money"), drawing from John's actual patterns when relevant.

**Sound**: no audio. Mobile finance apps with audio feel toy-ish. **But haptic, yes:**
- Slider snap (at meaningful values): `navigator.vibrate(20)` (already used elsewhere in code at line 5194)
- Lock plan confirm: `navigator.vibrate([50, 30, 50])` (a small triumphant pattern)
- Goal reached: `navigator.vibrate([10, 10, 10, 10, 30])` (a celebratory pattern)

**Numbers animate up when increasing, glow green/teal for 400ms. When decreasing, fade slightly without color change.** Numbers are the protagonist of this UI.

---

## ASCII sketch of the v1 playground

```
┌─────────────────────────────────────────────┐
│ 🎮 ALLOCATION PLAYGROUND                ↻  │
│                                             │
│ INCOME                              [+]    │
│ Salary May 15                      $7,282  │
│   + bonus $1,500 ✕                         │
│ ─────────────────                          │
│ Total income                       $8,782  │
│                                             │
│ ─────────── minus ─────────────            │
│                                             │
│ 🔒 LOCKED                          ▾       │
│ Rent, KIA, provisions             −$4,078  │
│                                             │
│ ─────────── leaves ────────────            │
│                                             │
│ Discretionary pool                 $4,704  │
│                                             │
│ ─────────── split ─────────────            │
│                                             │
│ YOUR BEHAVIOR                              │
│                                             │
│ 🍱 Food / Coffee        target $400        │
│    avg $336 · cycle $187                   │
│    ━━━━━━━━━━━━━━━░░░░ 47%                 │
│    ◀━━━━━●━━━━━━━━▶  $0 ─── $900           │
│                                             │
│ 🚌 Transport / Fuel     target $250        │
│    avg $198 · cycle $103                   │
│    ━━━━━━━━━━━━░░░░░ 41%                   │
│    ◀━━━━●━━━━━━━━━▶  $0 ─── $500           │
│                                             │
│ 🎮 Entertainment        target $300        │
│    avg $112 · cycle $34                    │
│    ━━░░░░░░░░░░░░░░░ 11%                   │
│    ◀━━━━━━●━━━━━━━━▶  $0 ─── $500          │
│                                             │
│ Behavioral subtotal              −$950     │
│                                             │
│ YOUR GOALS                                  │
│                                             │
│ 🇨🇳 China holiday — April 2027              │
│    ◀━━━━━●━━━━━━━━━▶ $400/mo ($300 saved)  │
│                                             │
│ 🏠 Property deposit — Aug 2030              │
│    ◀━━━━━━━━●━━━━━━▶ $500/mo               │
│                                             │
│ 🛡 Freedom buffer — Mar 2028                │
│    ◀━━━●━━━━━━━━━━━▶ $200/mo               │
│                                             │
│ 🐊 Darwin trip — June 7                     │
│    ◀●━━━━━━━━━━━━━━▶ $150/mo               │
│                                             │
│ Goals subtotal                  −$1,250    │
│                                             │
│ ─────────── leaves ────────────            │
│                                             │
│ 💵 BUFFER                       $2,504     │
│ $167/day for 15 days                       │
│ ✓ Above your $60 weekday cap               │
│                                             │
│ ─────────────────────────────────          │
│ WHAT THIS MEANS                            │
│                                             │
│ 📅 China holiday — April 2027 (was June)   │
│ 🏠 Property — Aug 2030 (unchanged)         │
│ 💵 Daily living — $167/day for 15 days     │
│ 🎯 End-of-cycle balance — $267 (healthy)   │
│                                             │
│ Sticking to this saves $500/mo vs avg.     │
│                                             │
│ [💾 Save scenario]  [🔒 LOCK FOR MAY 15]   │
└─────────────────────────────────────────────┘
```

(In real UI, sliders would be horizontal range inputs with the `accent-color` styling already in `renderPaydayAllocation`. Progress bars use existing `transition: width` patterns.)

---

## Data structures

### New state fields

```js
// Sparse — only categories user has overridden
S.behaviorTargets = {
  'Food / Coffee': 400,
  'Transport / Fuel': 250,
  'Entertainment': 300,
  'Shopping': 200
}

// Single ephemeral draft, persists across sessions
S.draftPlan = {
  income: 7282,            // editable, defaults to PLAN.INCOME_MONTHLY
  whatIfs: [               // ordered chips
    { type: 'bonus', label: 'Bonus', amt: 1500 },
    { type: 'expense', label: 'Dentist', amt: -400 },
    { type: 'wrxSale', label: 'Sell WRX', amt: 24000 }
  ],
  behaviorOverrides: {     // overrides to S.behaviorTargets for this draft
    'Food / Coffee': 350
  },
  goalAllocations: {       // mirrors stored.china/apartment/freedom/darwin
    china: 400,
    apartment: 500,
    freedom: 200,
    darwin: 150
  },
  updatedAt: 1715000000000
}

// Up to 3 named saved scenarios (deferred to v3)
S.savedScenarios = [
  { id: 'sc1', name: 'Bonus comes in', plan: {...}, savedAt: ... },
  // max 3
]

// Locked plan — refactor of existing slyght_payday_plan localStorage entry
S.paydayPlanLocked = {
  cycleStart: '2026-05-15',
  cycleEnd: '2026-06-15',
  plan: { ...same shape as draftPlan },
  lockedAt: '2026-05-12T18:00:00Z'
}
```

### New helpers

```js
// Returns top categories by 30-day spend, with avg per category
// { 'Food / Coffee': { avg: 336, count: 12, txns: [...] }, ... }
computeAvgByCategory(days = 30, opts = {})

// Returns the running spend for current cycle by category
// { 'Food / Coffee': 187, ... }
computeCycleByCategory()

// Computes the full cascade for a given draft. Pure function, idempotent.
// Returns { income, locked, discretionary, behavioral, goals, buffer, daily, etas }
cascadeFromDraft(draft, state, now)

// Returns the un-edited cascade (default scenario)
// = cascadeFromDraft({ income: PLAN.INCOME_MONTHLY, whatIfs: [], behaviorOverrides: {}, goalAllocations: stored }, S, now)
getCascadeDefault()

// Promotes draft to S.paydayPlanLocked. Confirmation handled in caller.
applyLockToDraft(draft)

// Reverses applyLockToDraft. Confirmation handled in caller.
unlockPlan()

// Saves draft to a named scenario slot (max 3). Returns scenario id or false if full.
saveScenario(draft, name)
```

### Reused / refactored

| Existing | New role |
|---|---|
| `PLAN.getGoals()` / `PLAN.getTrips()` | Source of goal data — unchanged |
| `getDynamicDailyBudget()` | Used in buffer-vs-cap warning |
| `checkAllocationAffordability()` (4a8cfba) | Reused per-slider |
| `lockPaydayPlan()` confirmation | Refactored into `applyLockToDraft` |
| `_NON_SPEND_CATS` filter | Used in `computeAvgByCategory` |
| `computeSpentInRange` (5c6e219) | Used in `computeCycleByCategory` |
| `renderPaydayAllocation` (line 10145) | **Replaced wholesale by `renderAllocationPlayground`** |
| `renderIncomeSimulator` (line 11208) | **Folded into Playground's income field** |
| `openBonusModal` (line 10571) | **Folded into Playground's "+ bonus" what-if chip** |
| `PLAN.getPostWrxSurplus` (line 9634) | **Refactored to read from `S.behaviorTargets` instead of hardcoded $400 food** |

### Cut

- `renderPaydayPlan` (line 3298) — already dead (target DOM doesn't exist), 150 lines of zombie code
- `renderCharacterScore` — already dead, removed from this work
- `renderIncomeSimulator` — folded as above
- `openBonusModal` — folded as above

---

## Smallest first ship-unit (v1)

**Goal:** prove the cascade direction. Build the smallest thing that lets John open Plan Mode pre-payday and see the new cascade with editable behavioral targets.

**v1 scope:**
- Replace `renderPaydayAllocation` with new `renderAllocationPlayground`
- Three layers: Locked (display, expandable) / Behavioral (editable, top 3-5 cats) / Goals (existing 4 sliders, integrated visually)
- Income field editable inline (one number, defaults to `PLAN.INCOME_MONTHLY`)
- "What this means" footer with 4 lines of derived math
- Save/Lock as today
- `S.behaviorTargets` field with `computeAvgByCategory(30)` helper
- Affordability warnings (reused from `4a8cfba`)
- Refactor `PLAN.getPostWrxSurplus` to use `S.behaviorTargets`

**v1 explicitly DEFERS:**
- What-if chips (bonus, dentist, debt payoff) — v2
- Saved scenarios (3 slots, named) — v3
- Phase-aware behavior — v4 (v1 shows the same cascade pre/post-payday; cycle-vs-target overlay can come later)
- WRX sale as a major scenario flow — v5
- Last-cycle review feedback loop — v6
- Polish (animations, haptics, voice copy refinement) — v7

**v1 build cost:** 4-6 hours. Risk: medium-low. Pure replacement of existing payday allocation, additive helpers, sparse new state field.

**v1 success criterion:** John opens Plan Mode 3+ times in the week leading up to payday May 15. If yes, v2 (what-if chips) is justified. If no, the direction itself is wrong.

---

## Subsequent ship-units

| Version | Adds | Build cost | Risk | Justification trigger |
|---|---|---|---|---|
| v2 | What-if chips (bonus, dentist, debt, raise) | 3 hours | Low | v1 used 3+ times pre-payday |
| v3 | Saved scenarios (3 slots, named, comparable) | 4 hours | Medium | v2 what-ifs used and forgotten by user → "I want to save this for later" feeling |
| v4 | Phase-aware overlay (cycle progress vs locked plan) | 3 hours | Low-medium | First locked plan completes a cycle |
| v5 | WRX sale as ceremonial scenario flow | 4 hours | Medium-high | WRX listing approaches reality OR user explicitly creates a "WRX sells" scenario |
| v6 | Last-cycle review (post-payday → next-cycle prompt) | 3 hours | Low | After 2 cycles of locked plans |
| v7 | Polish: animations, haptics, copy voice | 4 hours | Low | After functional v2-v6 ship |

Total horizon: 25-30 hours of focused work spread across 6-8 sessions. Each ships independently, each is reversible via `git revert HEAD && git push`.

---

## Design tensions I found that you didn't ask about

### Tension 1 — The categorization problem

The Behavioral layer depends on transaction category data. The UX report shows John barely uses the app (4-min sessions, 3 taps). Many transactions likely default to "Other." If his data is mostly "Other," the Behavioral layer can't surface meaningful targets.

**Mitigation:** the playground's Behavioral cats are derived dynamically from `computeAvgByCategory(30)` filtered to top 4-5 by spend, with cats having <3 transactions excluded. If John has only Food / Coffee with real data and everything else is sparse, the playground shows ONE behavioral row plus a "Log more transactions to see categories" hint. Adapts to data quality.

### Tension 2 — The under-logging problem

Reconciliation log shows John under-logs by ~$219 per 6-hour active session. So the 30-day avg from `S.txns` understates actual spending. Targets set against logged avg might secretly be much tighter than the user realizes.

**Mitigation:** the Behavioral row footnote: *"Based on logged transactions. Actual spend may be higher — log more to refine."* AND a v6 feature: "Reconciliation reveals you're spending $X more than logged. Adjust targets up?"

### Tension 3 — Avg vs median

The 30-day avg includes outlier weeks (birthday, sick, holiday). A median or trimmed-mean would be more honest.

**Mitigation:** v1 uses simple avg for clarity. v2+ can offer toggle: `[avg] [median] [last cycle]` for the "anchor" displayed alongside the target.

### Tension 4 — The "I just don't have a target" problem

For some categories, John might genuinely have no target — he just spends what he spends. Forcing a target on every row is artificial.

**Mitigation:** rows default to "no target set — using 30-day avg." User can explicitly set a target by dragging the slider. If never set, the row shows the avg as the implicit target with a subtle "tap to plan" affordance.

### Tension 5 — Goal allocation max range

In current `renderPaydayAllocation`, the max range for each slider is `Math.round(discretionary)` — i.e., the entire pool. So China can be slid to $4,704 (the entire post-locked pool) which doesn't make sense.

**Mitigation:** in cascade, each goal slider's max is `discretionary - sum(other goal allocations)`. Sliders constrain each other. (Similar to how `updateAllocation` already computes `living = max(0, discretionary - all_others)` — generalize.)

### Tension 6 — What if the user changes income mid-cycle?

If user edits income from $7,282 to $8,782 (adding $1,500 bonus what-if) and then the actual bonus comes in at $1,200... the locked plan was built against $1,500. Mismatch.

**Mitigation:** when actual income arrives mid-cycle, the playground shows: *"Your bonus came in at $1,200, plan was built against $1,500. Adjust plan?"* User can re-rehearse with actual numbers.

### Tension 7 — The reset destroys saved state

If user has 3 saved scenarios and they hit Reset, do scenarios stay? Yes — Reset only clears the **draft**, not saved scenarios. But this needs to be visually obvious.

**Mitigation:** Reset confirmation: *"Discard your current edits? Saved scenarios won't change."*

### Tension 8 — Plan Mode entry point on dashboard

Currently the PLAN › pill (line 402) takes user to Plan Mode top. With the playground being the dominant section, scrolling past Net Worth + WRX before reaching the playground adds friction pre-payday.

**Mitigation:** when daysLeft() ≤ 5 and no plan locked, the PLAN › pill becomes "🎮 PLAN ›" and tapping it scrolls Plan Mode directly to the playground anchor.

### Tension 9 — Locked plan from old format

Existing users have a `localStorage.slyght_payday_plan` from the v1 (pre-cascade) era — just goal allocations. When new playground reads this, it doesn't have what-ifs or behavioral overrides.

**Mitigation:** treat old format as a partial draft (goalAllocations only, everything else default). Users see their old plan in the new cascade with empty what-ifs. They can edit, save, lock fresh.

### Tension 10 — Dashboard hint timing

Dashboard hint *"Payday in 3 days — rehearse your plan?"* — when does it disappear?
- After they tap it once (could be friction if they want to re-open)
- After they lock a plan (cleaner)
- After payday lands (makes sense)

**Recommendation:** disappears after lock OR after payday. Tapping it doesn't dismiss. Encourages multiple rehearsals.

---

## What I'd push back on if asked

**Q4 mentioned WRX sale as a "what-if chip"** — I argued in my answer that WRX is bigger than other what-ifs. Adding it as a chip is fine for v2 but the FIRST time it's added, the cascade should ceremoniously reshuffle (animated debt clearing, $780 freed annotation). Don't undersell the moment.

**Q9 listed "modal that opens from a button" and "full-screen takeover"** as options — I'd push back on both. The playground is THE Plan Mode. Hiding it behind a modal makes Plan Mode a button-presser interface rather than a place to dwell. Plan Mode should breathe.

**The brief's "saved scenarios" framing** — I'd push back on unlimited slots. Three is enough. More creates a graveyard of forgotten scenarios. Architectural opinion: saved scenarios are deferred to v3 anyway, but the cap is the design.

**The brief's question about pre-payday vs post-payday phase modes** — same UI, different data. Don't proliferate phase-specific views. Adapts naturally via the data shown in each row (planned vs actual).

---

## What I think you might have missed

**The bonus interception trigger is too narrow.** `checkForBonusInterception` (line 11298) ignores any income amt > $3,000. So if John gets an $8K bonus (his stated example), the auto-open of Plan Mode never fires. The playground should be reachable through that path. Recommend widening the threshold or adding an explicit "this is a bonus" flag on income txns.

**The hardcoded `food = $400` in `getPostWrxSurplus`** must be refactored when the playground ships. The post-WRX surplus calc cascades into multiple decisions (apartment timeline, freedom buffer projection). If it reads from `S.behaviorTargets` (or falls back to 30-day avg), it becomes honest. This is in v1 scope.

**The `renderPaydayPlan` zombie function** at line 3298 — 150 lines of dead code targeting a DOM element that doesn't exist. It can be deleted in v1 commit (same file, related concept) or as a separate cleanup. Either way it's worth surfacing now.

**Plan Mode currently has 7 sections.** After folding income simulator and bonus modal into the playground, it has 6. After potentially folding super card into a less prominent spot (it's purely informational, $63k locked retirement), maybe 5. The playground takes more visual real estate but Plan Mode becomes more focused.

---

## Recommended naming

The brief calls it "Allocation Playground." I think this name is right — playful, exploratory. But three name candidates worth considering before locking it in:

1. **Allocation Playground** (current) — playful, slight kid-app risk
2. **Payday Workshop** — implies craft, intention; matches Plan Mode's "warm" register
3. **Money Plan** — clearest, least flavorful, default

My recommendation: **Allocation Playground** for the section title in code/comments, **"Plan your $X"** as the visible header inside the playground (where $X = upcoming income). Splits the difference: code is descriptive, UI is direct.

---

## Stopping here. Awaiting reaction.

The doc is 14k words. The shape I'm proposing is:
- Replace `renderPaydayAllocation` wholesale with a 3-layer cascade (Locked / Behavioral / Goals)
- v1 ships the cascade with editable behavioral targets (~4-6 hours)
- v2-v7 add what-ifs, saved scenarios, phase awareness, WRX ceremony, review loop, polish
- Each version is independent and reversible

What I want feedback on:
- Q1 scope (allocation = discretionary only) — agree or push back?
- Q3 storage tiers (1 draft + 3 saved + 1 locked) — feels right or simpler?
- Q4 what-if chips inline (vs separate panel) — agree?
- Q8 same UI all phases (vs phase-specific modes) — agree?
- Q9 entry point (replace `renderPaydayAllocation`, no auto-open) — agree?
- The 10 design tensions I surfaced — any that change the design substantially?
- Naming — Allocation Playground / Payday Workshop / Money Plan?

After we agree on the design, I'll write the v1 mission file in v2 outcome-driven style: scope, constraints, success criterion, no prescriptive code. Then we ship.
