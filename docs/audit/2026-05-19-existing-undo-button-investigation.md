# Existing undo button — investigation for 32.6 integration

**Date:** 2026-05-19
**Status:** Investigation. NO CODE CHANGE. Output for John's review before 32.6 UI integration.

---

## TL;DR

slyght has **TWO independent undo mechanisms**, neither of which does what `BRAIN.plan.resetCycle` does:

1. **App-wide transactional undo** — `saveUndoState()` / `undoLastAction()` + toast. JSON state-snapshot stash in `S._prevState`. Overwritten on each call. Triggered by specific mutations (debt edits, bill add/remove, txn log). 5-second toast affordance.

2. **Payday canvas single-action undo** — `paydayUndoLast()` calls `BRAIN.plan.undoLast()` which walks `S._auditLog` backward for the most recent reversible plan event. ↩️ button in canvas header. Reverses ONE event at a time.

`BRAIN.plan.resetCycle` (Bundle 32.6 substrate, just shipped) is a THIRD distinct operation: clears the entire plan to fresh-but-same-cycle state. Not a single-action undo — a nuclear reset.

The three operations are **complementary**, not overlapping. They serve different user intents.

---

## Mechanism 1 — app-wide transactional undo (existing, Bundle 3)

**Code:**
- `saveUndoState()` at `index.html:14355` — stashes `JSON.stringify(S+BILLS)` into `S._prevState`
- `undoLastAction()` at `index.html:14394` — restores from `S._prevState`
- `showUndoToast(msg)` at `index.html:14358` — transient 5s toast at bottom of screen
- Toast DOM: `#undo-toast` at `index.html:2072`

**Triggers** (each `saveUndoState()` call BEFORE the mutation):
- Debt re-sort (`:7191`)
- WRX proceeds allocation (`:7251`)
- Debt marked paid / cleared (`:7329`, `:7346`)
- Bill added / removed / deleted (`:7813`, `:7878`, `:7885`)
- Transaction logged (`:9418`, `:9679`)
- Some chat-AI actions (`:14015`, `:14345`)

**Scope:** single-action only — each `saveUndoState()` call overwrites the previous snapshot. The toast is the user-visible affordance; you must tap it within 5 seconds.

**NOT triggered by:**
- Payday plan canvas mutations (ticks, overrides, lock/unlock) — these have their own mechanism
- Settings edits (income, payday, asset edits) — no undo affordance
- Plan-mode intent edits

---

## Mechanism 2 — payday canvas single-action undo (Bundle 27 P6.4)

**Code:**
- `paydayUndoLast()` at `index.html:10010` — UI handler with native `confirm()` (§8 violation)
- `BRAIN.plan.undoLast(source)` at `index.html:21492` — canonical reverser

**UI affordance:** ↩️ button in payday canvas header at `index.html:27233`:
```html
<button onclick="paydayUndoLast()" aria-label="Undo last change"
        title="Undo your most recent plan change">↩️</button>
```

**REVERSIBLE_TYPES** (from `BRAIN.plan.undoLast` body):
- `plan_tick` → calls `untickItem(category, itemId, source)`
- `plan_override_set` → calls `clearOverride(category, itemId, source)`
- `plan_bonus_edit` → calls `setBonus(old, source)` (restoring previous bonus state)
- `known_upcoming_add` → calls `removeKnownUpcoming(id, source)`
- `known_upcoming_update` → calls `updateKnownUpcoming(id, old, source)`
- `plan_daily_floor_edit` → calls `setDailyLivingFloor(old, source)`
- `plan_buffer_floor_edit` → calls `setBufferFloor(old, source)`

**NOT REVERSIBLE via this mechanism:**
- `payday_plan_locked` / `payday_plan_unlocked` (no entry in REVERSIBLE_TYPES — Bundle 32.7 didn't add these)
- `payday_manual_landed` (paydayReceived flip)
- `plan_intent_added` / `plan_intent_update` / `plan_intent_remove` (Bundle 28 intent canonical writers — not undoable)
- `bill_mark_paid` from a tick (Bundle 30 envelope writes the bill-paid entry; undoing the plan_tick attempts to call `untickItem` which should reverse it, but this depends on `untickItem` doing the correct reversal)

**Scope:** single-action only — walks the audit log backward, finds the FIRST matching reversible type, reverses it. Once reversed, the audit log gets a new entry (untick / clearOverride / etc), so the next ↩️ tap reverses the SECOND-most-recent event, etc.

**Implementation gap noticed during this audit:** the in-app help text at `:9977` says "Tap ↩️ in the header to undo your most recent change." — but if the most recent change was a lock/unlock or an intent edit, the button silently does nothing useful (shows "Nothing to undo" toast). User-facing inconsistency between described behavior and actual scope.

---

## Mechanism 3 — `BRAIN.plan.resetCycle` (Bundle 32.6, just shipped, no UI yet)

**Code:** `BRAIN.plan.resetCycle(source)` at `index.html:20650+`.

**Scope:** clears the entire plan in one atomic operation:
- Unlocks the plan (lockedAt → null, dual-store synced to BRAIN.allocation)
- Clears all overrides, ticks, knownUpcoming, savings mirror, pendingProposals, streak gate
- Resets bonus.included → false (preserves amount + status)
- Preserves cycle identity (cycleId, dates) + user prefs (netPay, dailyLivingFloor, bufferFloor)

**Audit log:** compressed pre-state snapshot (counts only, not contents) — forensic recovery info without bloating the 500-entry cap.

**No UI invocation yet.** Waiting on John's UX call.

---

## How the three relate

| User intent | Right mechanism |
|---|---|
| "I just made a mistake (typo, wrong tap)" | ↩️ canvas undo (mechanism 2) — single action |
| "I just logged the wrong txn / paid the wrong bill" | undo toast (mechanism 1) — 5s window |
| "I want to start this whole cycle over" | **resetCycle** (mechanism 3) — nuclear reset |
| "I want to roll back to a specific point in the plan" | NOT YET SUPPORTED — would need timeline undo (out of scope) |

The three are complementary. The user explicitly said "investigate what it currently does BEFORE inventing a new affordance" — the answer is: the existing ↩️ doesn't do plan-reset, it does single-action canvas undo. The two operations are different. **Adding `resetCycle` as a separate affordance is the right call.**

---

## Integration options for resetCycle UI

### Option A — banner-adjacent button on locked plan
- Add a "Reset cycle" option **next to** the existing "Unlock" button on the locked-plan banner
- Visible only when plan is locked (resetting unlocked is less common)
- Bigger confirm modal (vs the lighter Unlock confirm)
- Distinct iconography — maybe `🔄` or `🆕` to signal "fresh start"
- Trade-off: makes the banner busier; two destructive affordances side-by-side

### Option B — canvas header overflow menu (· · ·)
- Add `· · ·` overflow menu in canvas header next to ↩️
- Menu items: Reset cycle · Lock/Unlock (when applicable) · maybe export/share
- Less prominent (good for destructive op) but discoverable for the user who's looking
- Trade-off: introduces a new UI pattern (overflow menu) — small carry cost

### Option C — Settings → Plan Reset
- Add a Plan Reset row in Settings → Financial Data sub-screen
- Furthest from where user wants it but matches the "destructive ops live in Settings" mental model
- Already-typed-RESET-gate makes sense here (it's not adjacent to the daily-use flow)
- Trade-off: low discoverability for "I want to start over right now"

### Option D — Reset as last item in the unlock confirm modal
- When user taps Unlock, the confirm modal includes a "Reset cycle (advanced)" link as a quiet alternative
- Single discoverable entry point + clear gradation ("just unlock" vs "wipe everything")
- Trade-off: mixes two distinct operations under one entry; user might tap "Reset" thinking it's just unlock

### My recommendation: **Option B (overflow menu)** + the resetCycle UI lives ONLY in the canvas

**Reasoning:**
- The canvas IS the plan; reset belongs there, not in Settings.
- Overflow menu pattern is established in many apps; users have a learned affordance for "the · · · menu has the destructive stuff."
- Doesn't crowd the banner.
- Doesn't conflict with the existing ↩️ (single-action) — both buttons in canvas header, distinct icons + tooltips.
- Future-extensible: same menu can later hold export/share/etc.

**Cost:** ~80-120 LOC (overflow menu component + 1 item + confirm modal + wire up). Phone-verify once.

---

## Confirm modal copy — three drafts

### Draft A — direct (Mum-friendly)

```
TITLE:  Reset this cycle?

HINT:   Start fresh with this cycle's plan.

BODY:
This clears EVERYTHING you've set for this cycle:
  • All allocation overrides (bills, debts, savings, upcoming)
  • All ticked items
  • The bonus inclusion (amount and status stay)

What stays the same:
  • Cycle dates and payday
  • Your income, daily-living floor, buffer floor

Tick history clears too — if you've already paid bills this
cycle, you'll need to re-tick them.

SAVE LABEL:  Reset cycle
CANCEL:      Keep my plan
```

### Draft B — minimal

```
TITLE:  Reset this cycle?

HINT:   This unlocks the plan and clears all your choices.

BODY:
Everything you've allocated, ticked, or bonused goes back
to default. Cycle dates + income stay. Can't be undone.

SAVE LABEL:  Reset cycle
CANCEL:      Cancel
```

### Draft C — receipt-style (matches the 32.4 drilldown footer pattern)

```
TITLE:  Reset cycle 2026-05-14?

HINT:   Snapshot of what clears below.

BODY:
WILL CLEAR
  • Overrides:        12
  • Ticked items:      8
  • Upcoming items:    2
  • Lock:           locked since 19 May
  • Bonus included:  ✓
  • Streak gate:    ✓

WILL KEEP
  • Cycle:          2026-05-14 → 2026-06-14
  • Net pay:        $7,282
  • Daily living:   $30/day
  • Buffer:         $364

This is recoverable from the planHistory snapshot
captured at lock time.

SAVE LABEL:  Yes, reset cycle
CANCEL:      Keep my plan
```

Draft C requires populating the counts dynamically at modal-open time (uses `BRAIN.plan.resetCycle`'s pre-state preview). Mechanically: call `resetCycle` with `dryRun:true` flag (need to add) that returns the preState without mutating; render the modal; on confirm, call without dryRun.

---

## What I recommend for ship

**UI:** Option B (canvas overflow menu).
**Copy:** Draft C (receipt-style). Matches the 32.4 drilldown footer pattern (proves the math). High-stakes operation deserves the precise scope display.
**Confirmation gate:** Single explicit confirm — no typed "RESET" requirement. The receipt-style modal itself surfaces the magnitude; typed gate adds friction without proportional safety gain.
**Additional small ADR-worthy decision:** add a `dryRun: true` option to `BRAIN.plan.resetCycle` so the modal can fetch pre-state counts without mutating. Low cost (~5 LOC).

---

## Decisions needed from John

1. **Option A/B/C/D** for surface placement. My pick: B (overflow menu).
2. **Draft A/B/C** for confirm modal copy. My pick: C (receipt-style).
3. **Typed-RESET gate:** yes or no? My pick: no (receipt-style modal is enough).
4. **`dryRun:true` parameter on resetCycle:** approve adding ~5 LOC for modal pre-flight?
5. **Bug surfaced in passing:** the help text at `:9977` claims ↩️ reverses "most recent change" but actually only covers REVERSIBLE_TYPES — missing lock/unlock + intent edits. Fix the help text, or extend REVERSIBLE_TYPES? My pick: extend (add `payday_plan_locked`/`unlocked` to REVERSIBLE_TYPES so ↩️ can step through lock-state transitions too). Adds 4-5 LOC.

---

**End of investigation. No code shipped. Awaiting John's decisions on the 5 questions above.**
