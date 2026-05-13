# MISSION — Payday Plan v1 (Allocation Cascade)

**Status:** ready to execute on confirmation
**Style:** v2 outcome-driven (per `MISSION-COMBINED-STYLE-AND-BACKLOG.md` Part 1)
**Builds on:** `ANALYSIS-DEEP-PASS-2026-05-05.md` § 6 + `PLAYGROUND-DESIGN-2026-05-05.md`
**Single commit. Manual phone verification gate. Reversible via `git revert HEAD && git push`.**

---

## Context

Plan Mode currently displays the cycle but doesn't generate thinking. John has articulated wanting to open Plan Mode *before* payday and play with where his money goes — *"I want to see what it looks like if I get 8K, how can I allocate that money and where and how much into each bucket"* — *"buttons to show a plan before saving it and locking it in."*

Payday is May 15 (10 days away as of this mission's date). This is the window in which a generative Plan Mode would matter most.

The deep analysis identified three honest problems:

1. **Plan Mode does math against numbers that aren't his.** `PLAN.getPostWrxSurplus` (line 9634) hardcodes food at $400 while the system prompt at line 6083 says actual is $900. Hardcoded $110 fuel, $85 KIA insurance. Estimates baked in 4+ months ago that no longer match his life.

2. **The current allocation surface treats living costs as a remainder, not a lever.** `renderPaydayAllocation` (line 10145) shows: Income → minus Locked → Discretionary → goal sliders divide it → "Living Costs" is whatever's left. That's backwards for thinking. John's biggest lever — his stated $900/mo food spend — isn't editable anywhere.

3. **The bonus interception threshold is too narrow.** `checkForBonusInterception` (line 11298) ignores any amount > $3,000. John's "$8K" example never triggers the auto-open flow.

## Desired outcome

After this ships, when John opens Plan Mode in the days before payday:

1. He sees a cascade of layers — Income → Locked → Behavioral → Goals → Buffer — top-to-bottom, with subtotals at each layer
2. He can drag Behavioral targets per category (food, transport, etc.) and watch every downstream number react in real time
3. He can stack what-if chips above the cascade — bonus, dentist, debt payoff, WRX sale, raise — each removable, all stackable
4. He can save a draft (auto-persists) and lock it for the cycle (committed plan)
5. The hardcoded food $400 in `getPostWrxSurplus` reads from `S.behaviorTargets` instead — the cascade is the source of truth
6. An $8K (or any size) bonus auto-opens this surface as before — threshold is widened
7. If a previous cycle's locked plan exists, it migrates cleanly into the new shape with no data loss
8. The dashboard, bills tab, and remaining Plan Mode sections (Trips, Super, Provisions) are not touched

## Hard constraints

1. **No regressions to:**
   - `56896d8` — TDZ resilience for boot-time PLAN access
   - `c800400` — paidBills month-aware lookup
   - `5c6e219` — misleading-math fixes (canonical `computeSpentInRange`, `getThisWeekProjection`)
   - `4a8cfba` — Plan Mode what-if (locked transparency, bonus preview, editable repayment fee, slider affordability)
   - `3c9b684` — tile cleanup
   - `7351f9e` — architecture / where things live (Time Machine to Settings, goals to Plan Mode only, etc.)

2. **Single commit.** All work in one atomic change. Tests + Guardian must pass before commit. Push only after green.

3. **Don't redesign visually beyond the playground itself.** The dashboard hero, bills tab calendar, remaining Plan Mode tiles (Trips, Super, Provisions) are out of scope.

4. **Don't introduce new semantic colors.** Existing palette is stable: `--green` (good), `--red` (debt/danger), `--amber` (warning), and Plan Mode's `#4ECDC4` teal (neutral positive). Achieve warmth through motion + haptic + microinteractions, not new hues.

5. **Manual phone verification before declaring success.** Generate verification steps that exercise the actual changes, not a template.

6. **Migration must be defensive.** Per the lesson from MISSION-TILE-CLEANUP v2 #5 deferral (`saveSettings` was load-bearing on `s-income`), do not assume the new code path eliminates the old. The migration must read both old and new shapes gracefully. If migration fails, fall back to default cascade with an audit log entry. Never lose a user's existing locked plan silently.

7. **Test coverage required for new cascade math.** At minimum:
   - `cascadeFromDraft` produces correct subtotals for a known draft
   - Behavioral target overrides flow through to discretionary remainder
   - What-if chip cumulative income (bonus + dentist + WRX) computes correctly
   - Lock soft-blocks on over-allocation (buffer < 0)
   - Migration from old locked-plan shape preserves goal allocations

8. **All phase transitions must be handled.** Pre-payday (draft visible, locked plan if exists), payday day, post-payday (cascade shows planned vs actual), cycle boundary (locked plan auto-archives, draft persists with live recompute).

## What you must investigate before writing code

The proposal table below tells you what to build. The investigation phase verifies *how cleanly the existing code accommodates it*. Surface anything that contradicts the proposal before implementing.

Required checks:
- Read `renderPaydayAllocation` (line 10145) end-to-end. Confirm what's reusable.
- Read `PLAN.getPostWrxSurplus` (line 9634), `PLAN.getGoals()` (line 9592), `PLAN.getTrips()` (line 9558), `getDynamicDailyBudget()` (line 1442). Confirm the data sources you'll consume.
- Read existing `localStorage.slyght_payday_plan` shape via `lockPaydayPlan` (line 10463) and `confirmLockPaydayPlan` (line 10499). This is the data you must migrate.
- Read `checkForBonusInterception` (line 11298). Confirm the threshold widening leaves all existing flows intact.
- Read `_NON_SPEND_CATS` (line 1423) and `computeSpentInRange` (line 1613). Confirm reusing these for `computeAvgByCategory` produces consistent filtering.
- Read `renderIncomeSimulator` (line 11208) and `openBonusModal` (line 10571). Confirm folding their UX into the cascade doesn't break callers elsewhere (chat-action `open_plan` at line 10589, etc.).
- **Run `node tests/core.test.js` and `npm test` to confirm 35/35 + 4/4 baseline before any edits.**

If investigation reveals one of the following, **stop and surface to me before continuing**:
- The migration path requires touching `saveSettings` or another shared handler in a way that creates a #5-style dependency
- Folding `renderIncomeSimulator` breaks an unexpected caller
- The cascade math has an edge case the design doc didn't anticipate (e.g., negative income from large dentist what-if)
- The test infrastructure can't reasonably cover one of the required test cases
- Investigation suggests v1 scope is too large for a single commit and we should split

## Permission to push back

If you see a better approach than what's described, surface it. Specifically:

- If naming "Payday Plan" feels wrong once you see it on screen, propose alternative
- If a layer in the cascade should be merged or split differently
- If the chip-strip UX collides with mobile keyboard or screen real estate
- If the Lock soft-block message has better phrasing
- If migration risk is higher than estimated and a safer staging path exists

Don't silently work around. Ask.

## What v1 includes (the proposal table)

| Item | What | Source data | New code |
|---|---|---|---|
| **Cascade renderer** | Replaces `renderPaydayAllocation` with `renderAllocationCascade`. Same call site in `renderPlanMode` (line 10129). | All existing PLAN data | ~250 lines |
| **Income field with chips** | Editable income + stackable what-if chips (bonus, dentist, debt payoff, WRX sale, raise). Each chip is a `{type, label, amt}` in `S.draftPlan.whatIfs`. Chip add UI: small modal-style picker. Chip remove: ✕. | `PLAN.INCOME_MONTHLY`, existing `_pendingBonus` (deprecated) | ~80 lines |
| **Locked summary line** | Reuses `4a8cfba` collapsible breakdown. Read-only. Shows Locked subtotal computed from BILLS (Fixed + Loan tag) + provisions. | Existing | ~10 lines (reuse) |
| **Behavioral panel** | 3-5 rows. Each row: category icon + name, target (editable slider), 30-day avg (read-only italic), this-cycle real (read-only). Categories auto-derived from top discretionary spend. | `S.txns` via new `computeAvgByCategory(30)` | ~120 lines |
| **Goals panel** | Same 4 sliders as today (china, apartment, freedom, darwin) but reading from `S.draftPlan.goalAllocations`. Goals data unioned from `PLAN.getGoals()` + `PLAN.getTrips()` deduped by id. | Existing | ~60 lines (refactor) |
| **Buffer line** | Derived: discretionary − behavioral − goals. Shows daily living rate for remaining cycle days. Red if negative, green if positive, neutral if exactly zero. | Derived | ~15 lines |
| **"What this means" footer** | 4 lines: goal ETAs (China, Apartment), daily living, end-of-cycle balance. Updates with debounced 200ms on every drag. | Reuses `PLAN.monthsToGoal`, `PLAN.dateFromMonths` | ~30 lines |
| **Save / Lock / Unlock / Reset** | Save: persists draft (auto, no UI gesture needed beyond sliding — draft auto-saves to localStorage). Lock: confirmation modal, writes to `S.paydayPlanLocked`. Unlock: small friction confirmation. Reset: clears draft to default cascade with confirmation. | Refactor of existing `lockPaydayPlan` | ~50 lines |
| **Lock soft-block on over-allocation** | If buffer < 0 at lock time, show modal: *"You've allocated $X more than you have. Adjust before locking."* No "lock anyway" option. | New | ~15 lines |
| **`computeAvgByCategory(days)`** | Returns `{Food: $X, Transport: $Y, ...}`. Mirrors `computeSpentInRange` filtering. Excludes `_NON_SPEND_CATS`, corrections, round-ups. | `S.txns` | ~20 lines |
| **`computeCycleByCategory()`** | Returns running spend this cycle by category. | `S.txns`, `MODEL.cycleStart` | ~15 lines |
| **`cascadeFromDraft(draft, state, now)`** | Pure function. Returns `{income, locked, discretionary, behavioral, goals, buffer, daily, etas, warnings}`. Deterministic. Tested. | All inputs | ~60 lines |
| **`getCascadeDefault()`** | The un-edited cascade. Equivalent to `cascadeFromDraft({…defaults})`. | Existing | ~10 lines |
| **`S.behaviorTargets`** | New sparse state field. Only categories user has overridden. Lookup with fallback to 30-day avg. | New | ~5 lines |
| **`S.draftPlan`** | Single ephemeral draft. Persists across sessions. Auto-saves on every drag. Schema: `{income, whatIfs[], behaviorOverrides{}, goalAllocations{}, updatedAt}` | New | ~5 lines |
| **`S.paydayPlanLocked`** | Refactored from `localStorage.slyght_payday_plan`. New schema with cycleStart, cycleEnd, plan reference. | Refactor | ~20 lines |
| **Refactor `PLAN.getPostWrxSurplus`** | Replace hardcoded `food = 400` with `S.behaviorTargets['Food / Coffee'] ?? computeAvgByCategory(30)['Food / Coffee'] ?? 400`. Same fallback chain for fuel, kiaInsurance. | New | ~10 lines |
| **Widen `checkForBonusInterception`** | Remove the `<= 3000` upper bound. Trigger on any income txn with note containing "bonus" OR explicit user flag. | Existing | ~5 lines |
| **Delete dead zombie code** | Remove `renderPaydayPlan` (line 3298, ~150 lines), `renderMumCard`, `renderLtTiles`, `renderWrxTracker`, `renderCharacterScore` orphan render functions + their calls in `renderAll`. | Cleanup | ~-200 lines (net negative) |
| **Fold `renderIncomeSimulator`** | Salary-raise becomes a what-if chip. Remove the standalone section in `renderPlanMode`. | Cleanup | ~-50 lines (net negative) |
| **Fold `openBonusModal`** | Bonus becomes a what-if chip. Remove the standalone modal flow. Update chat-action `open_plan` (if it references) to point at the cascade. | Cleanup | ~-40 lines (net negative) |
| **Phase handling** | Pre-payday: cascade shows draft (or locked if exists). Post-payday: cascade shows planned vs actual overlay (running cycle spend per category). Cycle boundary: locked plan auto-archives, draft persists with live recompute. | New | ~50 lines |
| **CSS layer styling** | Layered card structure (visual hierarchy: Income > Locked > Behavioral > Goals > Buffer). Number spring animation on increase (cubic-bezier 0.5 1.6 0.5 1). Chip strip flex-wrap layout. Locked overlay (opacity 0.85, "🔒 LOCKED" badge, sliders read-only). | New | ~80 lines CSS |
| **Tests** | `cascadeFromDraft` math, behavioral overrides, what-if cumulative, lock soft-block, migration from old locked plan. | New | ~80 lines |

**Total net code change:** approximately +900 lines added, -440 lines removed = **+460 net lines**. The replacement renderer is bigger than what it replaces, but the dead-code deletions soak up most of that.

## What v1 explicitly does NOT include

Per your direction "v1 must be complete experience without v2-v7":

- **No saved scenarios** (3-slot named scenarios). Chip toggling is the full what-if mechanism.
- **No phase-specific UI modes**. Same cascade everywhere; data underneath shifts.
- **No WRX ceremonious reshuffle animation**. WRX chip behaves like any other chip.
- **No new amber-gold accent color**. Existing palette only.
- **No automated bill payment integration**. Auto-detect (`autoDetectBillPayments`) keeps working as today; cascade just reads the result.
- **No location-aware category defaults** (analysis § 8.3). Standalone future mission.
- **No reconciliation gap tile** (analysis Pattern 4 in § 4). Standalone future mission.
- **No Mum-relationship card** (analysis § 8.5). Standalone future mission.

These are deliberately deferred. v1 ships as a complete tool that doesn't depend on any of them.

## Migration path

**Risk:** existing users have `localStorage.slyght_payday_plan` with shape:
```js
{ china: 300, apartment: 500, freedom: 200, darwin: 150,
  locked: true, lockedAt: '...', payday: 15 }
```

**v1 shape for `S.paydayPlanLocked`:**
```js
{ cycleStart: '2026-04-15', cycleEnd: '2026-05-15',
  plan: { income: 7282, whatIfs: [], behaviorOverrides: {},
          goalAllocations: { china: 300, apartment: 500, freedom: 200, darwin: 150 } },
  lockedAt: '...' }
```

**Migration logic** (run once on boot, idempotent):
1. Read `localStorage.slyght_payday_plan`
2. If shape matches old (has top-level `china/apartment/freedom/darwin` keys but no `plan` wrapper):
   - Wrap as `{plan: {goalAllocations: <oldKeys>, income: PLAN.INCOME_MONTHLY, whatIfs: [], behaviorOverrides: {}}, lockedAt: <preserved>, cycleStart: <derived>, cycleEnd: <derived>}`
   - Save back to `localStorage.slyght_payday_plan`
   - Audit log entry: `MIGRATION_PAYDAY_PLAN_V1`
3. If shape matches new: no-op
4. If shape unrecognized or parse fails: log to audit log, treat as no locked plan, do not throw

**Defensive read in `renderAllocationCascade`:** Try new shape first, fall back to old shape, fall back to "no plan." Never throw on read.

**Test:** synthesize a v0 locked plan in `core.test.js`, confirm migration produces a valid v1 shape with goal allocations preserved.

## Phase handling specifics

| Phase | Cycle status | What cascade shows |
|---|---|---|
| Pre-payday, no plan locked | `daysLeft() > 0`, `S.paydayPlanLocked` empty/expired | Cascade with current draft (auto-loaded). All sliders editable. Save/Lock buttons available. |
| Pre-payday, plan locked | `daysLeft() > 0`, `S.paydayPlanLocked.cycleEnd > now` | Cascade with locked plan loaded. Sliders read-only with "🔒 LOCKED" overlay. Unlock button at bottom. |
| Payday day | `today === payday day` | Same as pre-payday-locked, but header changes to "Payday — your locked plan is active." |
| Post-payday (cycle in progress) | `daysLeft() > 0`, locked plan exists | Cascade shows planned vs actual: Behavioral rows display "this cycle" running spend against target. Buffer line shows planned vs actual remaining. |
| Cycle boundary | `S.paydayPlanLocked.cycleEnd <= now` | Locked plan auto-archives (move to `S.archivedPlans[]`, capped at last 6). Draft persists with live recompute (Q8 option c). Header: "Cycle complete. Plan next cycle?" |

**Boundary edge cases:**
- Cycle boundary fires once per renderAll. Idempotent (don't archive twice).
- If `S.paydayPlanLocked` has unrecognized shape, treat as expired and trigger archive.
- Draft's `whatIfs` array survives boundary as-is. User can remove individual chips.
- `S.behaviorTargets` survive boundary. They're "this is my intent for spending" not cycle-specific.

## Tests required

In `tests/core.test.js`, add:

1. **`computeAvgByCategory(30)` returns expected categories from known txn set**
   Setup: 5 food txns ($60 total in last 30d), 3 transport txns ($30 total). Expect: `{Food / Coffee: $60, Transport / Fuel: $30}` (or similar based on real category names).

2. **`cascadeFromDraft` correctness**
   Given draft `{income: 7282, whatIfs: [], behaviorOverrides: {Food: 400}, goalAllocations: {china: 300, apartment: 500, freedom: 200, darwin: 150}}`, expect:
   - `cascade.income === 7282`
   - `cascade.locked === <computed from BILLS+provisions>`
   - `cascade.discretionary === income − locked`
   - `cascade.behavioral === sum of behaviorOverrides + 30day-avg-fallback`
   - `cascade.goals === sum of goalAllocations`
   - `cascade.buffer === discretionary − behavioral − goals`
   - `cascade.daily === buffer / daysLeft()`

3. **What-if chips cumulative income**
   Add chips: `[{type: 'bonus', amt: 1500}, {type: 'expense', amt: -400}]`. Expect `cascade.income === 7282 + 1500 − 400 === 8382`.

4. **Lock soft-block on over-allocation**
   Setup: cascade with negative buffer (over-allocated). Call `applyLockToDraft(draft)`. Expect: returns `{ok: false, reason: 'overallocated', shortfall: <amt>}`. Does not write to `S.paydayPlanLocked`.

5. **Migration from v0 locked plan**
   Setup: `localStorage.slyght_payday_plan = '{"china":300,"apartment":500,"freedom":200,"darwin":150,"locked":true,"lockedAt":"..."}'`. Call migration function. Expect: re-read produces v1 shape with `plan.goalAllocations.china === 300`, etc., and `lockedAt` preserved.

6. **Cycle boundary archives locked plan**
   Setup: `S.paydayPlanLocked.cycleEnd = '2026-04-15'` (past). Call cycle-boundary check. Expect: `S.paydayPlanLocked` cleared, `S.archivedPlans` has 1 entry.

7. **Behavioral overrides flow into `getPostWrxSurplus`**
   Setup: `S.behaviorTargets = {Food / Coffee: 600}`. Call `PLAN.getPostWrxSurplus()`. Expect: result reflects $600 food, not $400.

## Verification block (manual phone)

After commit + push, John verifies on phone:

```
═══════════════════════════════════════════════════════════════
PAYDAY PLAN v1 SHIPPED to xetonx.github.io/slyght

Commit: <hash>
Tests: NN/NN passing
Guardian: 4/4 (advisory — manual verification is the gate)

═══════════════════════════════════════════════════════════════
JOHN'S MANUAL VERIFICATION ON PHONE:

Wait ~60 seconds for GitHub Pages to redeploy.
Hard-refresh xetonx.github.io/slyght on phone.

[ ] 1. Open Plan Mode. Scroll to "Plan your $7,282 ›" section.
       Confirm: cascade visible with 5 layers (Income, Locked,
       Behavioral, Goals, Buffer). Each layer shows its subtotal.
       Confirm: locked breakdown collapsible (4a8cfba behavior
       preserved).

[ ] 2. Tap "+ what-if" → add a $1,500 bonus chip.
       Confirm: chip appears above cascade with ✕. Income line
       updates to $8,782. All downstream numbers cascade.
       Tap ✕ on the chip. Numbers return to $7,282.

[ ] 3. Drag the Food behavioral slider down to $400.
       Confirm: behavioral subtotal updates. Buffer line grows.
       "What this means" footer updates (China ETA earlier).
       Goal allocation sliders' "could afford" indicators react.

[ ] 4. Try to over-allocate: drag goal sliders + behavioral until
       buffer is negative. Tap "🔒 Lock for May 15."
       Confirm: modal appears: "You've allocated $X more than
       you have. Adjust before locking." NO "lock anyway" option.
       Adjust until buffer ≥ $0. Tap Lock again. Confirmation
       modal succeeds.

[ ] 5. After locking: cascade overlay shows "🔒 LOCKED" badge.
       All sliders read-only. Unlock link at bottom.
       Tap Unlock → confirmation. Confirm sliders editable again.

[ ] 6. Open chat (PUSH stays subscribed). Confirm chat still
       works without errors. (Tests checkForBonusInterception
       widening didn't break anything.)

[ ] 7. Open dashboard. Confirm "Spent today" still displays
       correctly. (No regression to 5c6e219.)

[ ] 8. Open Bills tab. Tap May 1 in calendar. Confirm Teachers
       Health still shows paid. (No regression to c800400.)

[ ] 9. Open Plan Mode. Confirm Trips, Super, Annual Provisions
       still render. (Cascade only replaced Payday Allocation
       and Income Simulator.)

[ ] 10. Reload the app. Confirm draft persists (whatever you
        had in chips and sliders is still there).

[ ] 11. Settings → Activity Log. Confirm a `MIGRATION_PAYDAY_PLAN_V1`
        entry exists if you had a locked plan before this update.

═══════════════════════════════════════════════════════════════
ROLLBACK:
If anything fails: git revert HEAD && git push.
Previous deployed state at 7351f9e stays good.
═══════════════════════════════════════════════════════════════
```

## Honest estimate

**Human-engineer effort:** 6-10 hours of focused work, including investigation gate, implementation, test writing, manual verification setup, mission iteration.

**My (agent) effort:** 60-120 minutes of contiguous tool-time. The style guide observed *"estimates of 2-3 hours frequently shipped in 5-15 minutes"* — that bias applies here too. I'd commit to a self-bound budget: **if the work passes 3 hours of agent-time, stop and surface for review.**

**Risk distribution:**
- Implementation correctness: low-medium (cascade math is testable, render is pattern-match to existing code)
- Migration cleanness: medium (v0 → v1 shape change, must be defensive)
- Test coverage completeness: low (math is deterministic)
- Phase-handling edge cases: medium (cycle boundary, post-payday overlay, draft persistence across cycles)
- Visual polish meeting "warm without new colors" standard: low-medium (motion + microinteractions only)
- Net regression risk to prior 6 commits: low if migration works, medium if migration mishandles old data

**Highest single risk:** the migration. If `localStorage.slyght_payday_plan` has a shape we don't recognize, the cascade must degrade gracefully (treat as no locked plan, log to audit, continue). Bake this into investigation phase: the first thing I check before any edits is what shapes exist in real localStorage data.

**Second-highest risk:** folding `renderIncomeSimulator` and `openBonusModal`. Both have callers I haven't fully traced. Investigation phase will trace them. If a non-cascade caller exists (e.g., chat AI action `open_plan` directly invokes `openBonusModal`), I need a compatibility shim.

## Investigation gate (per v2 style)

Before writing any code, I will:

1. Run `npm test` to confirm 35/35 + 4/4 baseline
2. Read all the file locations listed in "What you must investigate before writing code"
3. Search for callers of `renderPaydayAllocation`, `renderIncomeSimulator`, `openBonusModal`
4. Confirm the migration path against actual locked-plan shape
5. Print a brief findings table: anything surprising, anything I want to discuss

**Then STOP. Wait for confirmation before writing code.**

This protects against:
- An unexpected caller breaking the fold-in plan
- A migration corner case the design doc didn't anticipate
- A test infrastructure gap that would force test-skipping

## Stop conditions during execution

If during implementation any of the following happen, **stop and surface to me**:
- A test I expected to pass is failing for a non-trivial reason
- The migration logic produces a different shape than expected for a known input
- A side effect of folding `renderIncomeSimulator` breaks an unrelated tile
- A phase-transition edge case requires a design decision the doc didn't cover
- The work crosses 3 hours of agent-time

## Run with

```
Read C:\Users\admin\slyght\MISSION-PAYDAY-PLAN-V1.md and execute
it exactly. Investigation gate first, STOP for confirmation
before writing code. Single commit + push + verification block.
Stop after print.
```
