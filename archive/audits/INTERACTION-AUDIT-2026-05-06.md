# Interaction-Layer Audit — 2026-05-06

> Audit of which interactive elements actually work, focused on the bills
> banner (Mission #45a outstanding) and Plan mode (OPEN-BUGS #11). Found
> three concrete UX-broken issues with code-level diagnoses.
>
> **Method:** Read every onclick handler in `index.html`, verified each
> backing function exists, examined Plan-mode persistence path and banner
> button styling. Code at HEAD `d0bc82e`.
>
> **Status:** Audit findings. Fix sketches included. Nothing shipped.

---

## Summary

| # | Surface | Bug | Severity | Fix complexity |
|---|---|---|---|---|
| 1 | Bills "tracked as paid early" banner | × and "Show me these bills" buttons render invisible due to `color:inherit` and 12% white opacity on the dark-red banner | High (visible every day, blocks the action the banner asks for) | Tiny — CSS-only |
| 2 | Plan mode "Add savings" on goals | Persistence split: `PLAN.saveGoal()` writes to `slyght_goals`, only `china` and `apartment` have dual-write to main state. `freedom-buffer` and user-added goals don't sync to the rest of the app | Medium (silent state divergence — value updates in Plan tab but not in Dashboard / Settings) | Small — extend the dual-write to all goals, or refactor onto single state |
| 3 | Analysis tab spending pivot | Tapping a transaction row in the expanded category view calls `openEditTxnModal()` which doesn't exist. Silent failure (no toast, no error visible to user) | Low–Medium (rows look tappable, do nothing) | Trivial — rename to existing `editTransaction()` |

Encouraging finding: **all 25 unique onclick handlers in Plan mode have defined backing functions** other than the one above. The Plan-mode interaction surface is wired correctly at the function-existence level. The bug class is *behavior of those functions*, not missing functions.

---

## Bug 1 — Bills banner buttons rendering invisible

### Code evidence

`index.html` line 412–417:

```html
<div id="math-invariant-banner" style="
    background: var(--red-dim);    /* dark red */
    color: var(--red);              /* red text */
    ...">
  <span id="mib-msg"></span>

  <button onclick="MathInvariants.showDetails(...)" style="
      background: rgba(255,255,255,0.12);   /* 12% white = barely visible */
      border: 1px solid rgba(255,255,255,0.25);
      color: inherit;                        /* inherits red — red text on red bg */
      ...">Show me these bills</button>

  <button onclick="MathInvariants.dismiss(...)" aria-label="Dismiss" style="
      background: none;                      /* transparent on red bg */
      color: inherit;                        /* red glyph on red bg */
      ...">×</button>
</div>
```

Both buttons have correctly-wired onclick handlers (`showDetails` and `dismiss` are real functions on `MathInvariants`). The bug is purely visual contrast.

### Fix

Replace the inline styles for the two buttons. Pick text-on-red-bg colors from the actual color palette:

```html
<!-- Show me these bills button — line 416 -->
<button onclick="MathInvariants.showDetails(...)" style="
    display: inline-block;
    background: rgba(255,255,255,0.18);
    border: 1px solid rgba(255,255,255,0.4);
    color: rgba(255,255,255,0.95);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    padding: 3px 9px;
    border-radius: 4px;
    margin-left: 6px;
">Show me these bills</button>

<!-- × dismiss — line 417 -->
<button onclick="MathInvariants.dismiss(...)" aria-label="Dismiss" style="
    position: absolute;
    right: 8px;
    top: 6px;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.25);
    color: rgba(255,255,255,0.95);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    padding: 4px 10px;
    border-radius: 4px;
">×</button>
```

This addresses the issue without changing any logic. Buttons remain tappable (already are), now visibly tappable.

**Verification path:** after the change, visit `https://xetonx.github.io/slyght/` on the phone, confirm both buttons are visible, tap each to confirm the action fires (× dismisses the banner, "Show me these bills" opens the MI-13 details modal).

---

## Bug 2 — Plan mode persistence split

### Code evidence

`index.html` line 11468 (`addGoalSavings` flow → `confirmGoalSavings`):

```js
function confirmGoalSavings(goalId) {
  const amt = parseFloat(document.getElementById('goal-save-amt')?.value || '0');
  if (isNaN(amt) || amt <= 0) {
    showToast('Please Enter A Valid Amount');
    return;
  }
  const goals = PLAN.getGoals();
  const goal = goals.find(g => g.id === goalId);
  if (!goal) return;
  goal.saved = (goal.saved || 0) + amt;
  PLAN.saveGoal(goal);                     // writes to slyght_goals localStorage
  if (goalId === 'china') {                // special case — dual-write
    const bucket = (S.savingsBuckets||[]).find(b => b.name === 'China Holiday');
    if (bucket) { bucket.saved = goal.saved; save(); }
  }
  if (goalId === 'apartment') {            // special case — dual-write
    S.mumAccountBalance = goal.saved;
    save();
  }
  // No fallback — freedom-buffer and user-added goals don't sync to S
  PLAN_MODAL.close();
  renderPlanMode();
  showToast('🎯 $' + amt.toLocaleString() + ' Added To ' + goal.name + '!');
}
```

`PLAN.saveGoal` (line 10110) writes to `localStorage.slyght_goals` — separate key from `slyght_v5` (the main state).

`PLAN.getGoals` (line 10076) merges defaults with stored values:
- For `china` goal default, `saved` is read from `S.savingsBuckets["China Holiday"]`
- For `freedom-buffer` default, `saved` is read from `S.savingsBuckets["Rainy Day Fund"]`
- Stored values from `slyght_goals` then override the defaults

### Why this is broken

For `china` and `apartment`, the dual-write keeps the two stores in sync. Add savings → both update → both reads agree. ✓

For `freedom-buffer` and any user-added goal, only `slyght_goals` updates:
- Plan tab shows the new value (it reads via `PLAN.getGoals()` → merge → stored override)
- Dashboard / Settings / anywhere else reading `S.savingsBuckets` directly → still sees the old value
- Result: silent state divergence. User thinks they added savings; the rest of the app disagrees. Trust loss.

This is the actual mechanism behind OPEN-BUGS #11. The bug entry there proposed three candidate failure modes; this is none of them — the handler runs, modal closes, state updates, BUT it updates the wrong state.

### Fix sketch

Two options, depending on appetite:

**Option A — extend the dual-write (small fix, fragile pattern continues):**
```js
// In confirmGoalSavings, after PLAN.saveGoal(goal):
const bucketName = bucketNameForGoal(goalId);  // mapping function: china → "China Holiday", freedom-buffer → "Rainy Day Fund", etc.
if (bucketName) {
  const bucket = (S.savingsBuckets||[]).find(b => b.name === bucketName);
  if (bucket) { bucket.saved = goal.saved; save(); }
}
```

**Option B — single source of truth (proper fix):**
- Goals stored only in `S.goals` (or derived purely from `S.savingsBuckets` + a static defaults table)
- Drop the separate `slyght_goals` localStorage key entirely
- `PLAN.getGoals()` reads from `S` only; `PLAN.saveGoal()` writes to `S` only
- One save path, no divergence possible

**Lean:** Option B is the right architectural answer (and aligns with the BILLS_VM architecture work — goals data should live in `S` so MODEL/VMs can consume it canonically). Option A is the right *immediate* answer if the architectural refactor isn't ready to ship yet. Both are non-trivial because of the migration question (existing `slyght_goals` data needs to be merged into S on load if you go Option B).

The same dual-localStorage pattern likely affects trips (`PLAN.saveTrip` writes to `slyght_trips`). Worth confirming during the fix work — same mechanism, different store.

---

## Bug 3 — Analysis tab spending pivot dead row tap

### Code evidence

`index.html` line 9856 (in `renderSpendingPivot`):

```js
html += '<div onclick="openEditTxnModal('+txnIdx+')" style="...cursor:pointer...">';
```

`openEditTxnModal` is not defined anywhere in the file. The function that handles transaction editing is `editTransaction(idx)`, defined at line 3086.

Other places that render tappable transaction rows (line 3660 in Recent Spending, line 5698 in dashboard transactions) correctly call `editTransaction(realIdx)`. Line 9856 is the only stale name.

### Why this is broken

Tapping an expanded-category transaction row in Analysis tab fires a ReferenceError silently. No toast, no console-visible-to-user error. The row has `cursor:pointer` so it advertises itself as tappable. From the user's perspective: I tap, nothing happens.

### Fix

One-line change at line 9856:

```js
// Before
html += '<div onclick="openEditTxnModal('+txnIdx+')" ...>';
// After
html += '<div onclick="editTransaction('+txnIdx+')" ...>';
```

That's it. The function it should call already exists and is in active use elsewhere.

---

## Plan mode handler-existence check (full result)

For completeness — every onclick handler in Plan mode (rendered between line 10573 and the modal handlers around line 11500), checked against function definitions:

```
✓ addNewGoal           defined
✓ addNewTrip           defined
✓ addTripSavings       defined
✓ editTrip             defined
✓ lockPaydayPlan       defined
✓ openBonusModal       defined
✓ prefillBonusAllocation  defined
✓ showNetWorthBreakdown   defined
✓ showSliderInfo       defined
✓ togglePlanLocked     defined
✓ unlockAndEdit        defined
✓ addGoalSavings       defined
✓ addBonus             defined (in modal flow)
✓ closePlanMode        defined
✓ editGoal             defined
✓ editProvision        defined
✓ markGoalComplete     defined
✓ confirmTripSavings   defined
✓ confirmGoalSavings   defined
✓ updateAllocation     defined
```

So the *function-existence* tier of Plan mode is solid. The bugs are in the *behavior* tier — what those functions do once they run. That's a meaningful distinction; means the fixes are about correcting logic, not adding missing wiring.

---

## What this changes in the larger plan

The architecture work (BILLS_VM, BRAIN consolidation, etc.) addresses the *parallel-implementation* bug class. These three bugs are different — they're interaction-layer correctness bugs:
- Bug 1 is a CSS contrast bug
- Bug 2 is a state-store split bug (a different parallel-implementation pattern, but at the persistence layer rather than the computation layer)
- Bug 3 is a stale function name

None of these get fixed automatically by the architecture migration. They want fixing as their own work.

**My recommendation on order:**
1. **Bug 1 (banner CSS) ships first** — tiny commit, immediate visible win, unblocks the action the banner asks for
2. **Bug 3 (spending pivot rename) ships next** — one-line fix, also tiny
3. **Bug 2 (Plan persistence)** is a real piece of work and should be its own mission. Worth holding it until either: the BILLS_VM-equivalent goals work happens in the architecture migration (where Option B becomes natural), OR you want a quick-and-dirty Option A patch first.

Bugs 1 and 3 together could be a single "interaction-hygiene" commit — both small, both pure surface fixes, both visible-quality wins. Bug 2 wants its own commit (and probably a small mission spec) because it touches persistence semantics.

---

## What I deliberately didn't audit

To keep this scoped:
- Settings tab interactive elements — same audit pattern would apply, separate sweep
- Dashboard tab interactive elements — same
- Chat tab — out of scope for this audit (UX patterns differ)
- Modal-open / modal-close lifecycle (where modals get stuck open or events leak)
- Touch-target sizes (some buttons may be too small for thumb taps)
- Keyboard / accessibility behavior

Each of these could be its own audit pass if you want them.
