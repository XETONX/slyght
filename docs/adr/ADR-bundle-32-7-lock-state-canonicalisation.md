# ADR-Bundle32.7 — Lock state canonicalisation

**Status:** Draft, awaiting John's decision
**Date:** 2026-05-19
**Author:** CC (Opus 4.7) — autonomous scenario-walker surfaced framework gap; further investigation revealed a deeper architectural divergence
**Related:** INV-29 (RESERVED — plan-lock narrow semantics; SDD-bundle-30 §C#3) · CLAUDE.md §8 ("No bypassing canonical writers" · "No native confirm() / alert() in flows") · Bundle 32 architectural diagnostic `e153d54`

---

## Problem

slyght has **three independent storage locations** that each claim to represent "is the plan locked?", and they drift apart depending on which UI path the user takes.

### The three lock-state stores

| # | Storage | Set by | Cleared by | Read by |
|---|---|---|---|---|
| 1 | `S.activePlan.lockedAt` (number \| null) | canvas Lock confirm save() flow (`:11584`) · `BRAIN.allocation.lock` does NOT set this | `openPaydayUnlockPlan` (`:11806`) · `unlockPlanWithConfirm` (`:3307`) | `BRAIN.plan.getSnapshot` → `snap.lockedAt` (the primary reader) |
| 2 | `slyght_payday_plan.lockedAt` (ts) — managed by `BRAIN.allocation` bubble (`:19926`) | `BRAIN.allocation.lock(snapshot, source)` — called from canvas Lock flow `:11574` AND legacy "Plan Lock — SLYGHT Will Hold You To This" flow `:25368` | `BRAIN.allocation.unlock(source)` — called ONLY from `openPaydayUnlockPlan` `:11800` | `BRAIN.allocation.isLocked()` (canonical), `BRAIN.allocation.getPlan().lockedAt` |
| 3 | `slyght_payday_plan.locked` (bool) — direct write on same localStorage key | legacy `:25373` `reread.locked = true` direct mutation | Never explicitly cleared anywhere in the codebase | "non-BRAIN consumers (e.g., existing UI conditional checks)" per comment `:25369` |

### How they drift

**Path A — Canvas Lock then Canvas Unlock:** all three stay in sync. Lock sets #1 + #2 (not #3 since canvas Lock doesn't touch the legacy key). Unlock clears #1 + #2.

**Path B — Legacy Lock ("Plan Lock — SLYGHT Will Hold You To This") then Canvas Unlock:** sets #2 + #3 but NOT #1. After Canvas Unlock, #2 is cleared but #3 remains stale-locked forever.

**Path C — Canvas Lock then `unlockPlanWithConfirm` (the "Unlock" inline button at `:3303`):** lock sets #1 + #2. unlockPlanWithConfirm clears ONLY #1. #2 stays stale-locked — `BRAIN.allocation.isLocked()` returns true, but `snap.lockedAt` is null. Any UI surface that reads #2 sees the plan as locked; surfaces that read #1 see it as unlocked.

**Path C is the most likely real-world divergence** because `unlockPlanWithConfirm` is the user-facing "Unlock" button on the locked-plan banner (`:3295`), which fires from r77 (John 2026-05-15 ask: "until i say no"). Any code path reading `BRAIN.allocation.isLocked()` after this flow runs gets stale data.

### Additional discipline violations encountered while mapping

- **CLAUDE.md §8 "No native `confirm()` / `alert()` in flows":** both unlock paths use `window.confirm` (`:11799` and `:3305`). Should be `EDIT_MODAL.openConfirm`.
- **No canonical `BRAIN.plan.lock` / `BRAIN.plan.unlock` writer:** the canvas Lock save() handler directly mutates `S.activePlan.lockedAt` + manages streak idempotency + does save() error handling + round-trip verify + audit-log mismatch — all inline in a 60-line modal save callback (`:11583-:11618`). This logic should live in a canonical writer.
- **Audit-log type inconsistency:** lock emits `payday_plan_locked` (via `BRAIN.allocation.lock`) AND `lock_persist_mismatch` (inline). Unlock emits `payday_plan_unlocked` (via `BRAIN.allocation.unlock`) from path B and `plan_unlocked_by_user` (inline) from path C. Three audit-log types for two concepts.

### How this connects to INV-29

INV-29 ("plan-lock narrow semantics") is RESERVED in FINANCIAL-INVARIANTS.md per SDD-bundle-30 §C#3. The reservation reads:

> "Plan lock prevents modification of `S.activePlan.overrides` only. Other state (transactions, balance corrections, bill payments) remains editable while plan is locked. **Status: Reserved pending decision.**"

This ADR's resolution is a PREREQUISITE for INV-29's decision. You cannot define "what locked means" semantically if "is it locked" returns different answers across three storage locations.

---

## Options

### Option A — Unify on `S.activePlan.lockedAt` as single source of truth

- Add canonical writers `BRAIN.plan.lock(opts, source)` and `BRAIN.plan.unlock(source)`.
- Both writers update ONLY `S.activePlan.lockedAt` + audit-log standardised entries + streak idempotency.
- `BRAIN.allocation.isLocked()` becomes a DELEGATE that reads `S.activePlan.lockedAt`.
- Remove `BRAIN.allocation.lock` / `unlock` writers (or keep as thin wrappers).
- Migrate 3 lock + 2 unlock call sites to canonical writers.
- Remove the legacy `slyght_payday_plan.locked` boolean (verify no live readers first).
- Migration: ~120 LOC + smoke spec + scenario-walk updates.

**Pro:** `S.activePlan` is already the dominant truth source (most snapshots read it). Aligns with Bundle 27+ direction. Lock state co-located with all other plan state (cycleId, overrides, ticks, savings). One save() call persists everything atomically.
**Con:** `BRAIN.allocation` was Bundle 23-ish; touching its surface risks regressions in older flows (the legacy "Plan Lock — SLYGHT Will Hold You To This" path at `:25368` which I haven't fully traced). Some UI may read `slyght_payday_plan.locked` directly without going through `BRAIN.allocation` — need grep audit first.

### Option B — Unify on `BRAIN.allocation` as single source of truth

- Make `BRAIN.allocation.lock` / `unlock` the canonical writers.
- Add `BRAIN.plan.lockedAt` as a delegate that reads `BRAIN.allocation.getPlan().lockedAt`.
- Remove `S.activePlan.lockedAt` (after migrating all readers).
- Migrate 3 lock + 2 unlock call sites.

**Pro:** `BRAIN.allocation` already has the canonical-writer pattern in place. Storage separation (lock state lives in its own localStorage key, not bundled into the giant `slyght_v5` blob) could be argued as cleaner.
**Con:** Loses atomicity with other plan state. After lock, `S.activePlan` and `slyght_payday_plan` are out of sync unless both are saved. Bundle 27+ work has been concentrating plan state in `S.activePlan`; this option reverses that direction. ~150 LOC + the burden of teaching the codebase that "lock state lives elsewhere."

### Option C — Keep both stores, add a single canonical reader + writer pair

- Add `BRAIN.plan.lock(opts, source)` that updates BOTH `S.activePlan.lockedAt` AND calls `BRAIN.allocation.lock(snapshot, source)`.
- Add `BRAIN.plan.unlock(source)` that clears BOTH.
- Add `BRAIN.plan.isLocked()` that returns `!!(S.activePlan.lockedAt) || BRAIN.allocation.isLocked()` (OR-ed for safety) OR `!!(S.activePlan.lockedAt) && BRAIN.allocation.isLocked()` (AND-ed for strictness — would surface drift as "not locked").
- All other readers migrate to `BRAIN.plan.isLocked()`.

**Pro:** Lowest migration cost; no removal of existing surface. Both old and new callers keep working.
**Con:** Doesn't actually solve the architectural problem — divergence is still possible if anyone writes to either store outside the canonical writer. Codifies the dual-storage as intentional, which it isn't.

### Option D — Recommended: phased Option A

Do Option A in two passes:

**Pass 1 (Bundle 32.7a — this session or next):** Add `BRAIN.plan.lock` / `BRAIN.plan.unlock` canonical writers. Migrate the 3 lock + 2 unlock call sites. Both writers internally call `BRAIN.allocation.lock` / `unlock` to keep storage #2 in sync. Migrate `unlockPlanWithConfirm` and `openPaydayUnlockPlan` to use `EDIT_MODAL.openConfirm` (closes §8 native-confirm violation). Add scenario D step revisions to use canonical writers. **Effect: lock/unlock state is canonical — no divergence possible from caller code. The dual-storage is now hidden behind the writer.**

**Pass 2 (Bundle 33-ish — needs grep audit + careful migration):** Remove `BRAIN.allocation.lock` / `unlock` writers entirely. Migrate any direct readers of `slyght_payday_plan.lockedAt` and `slyght_payday_plan.locked` to `BRAIN.plan.isLocked()`. Storage #2 + #3 deleted (or kept as deprecated read-only for backwards compatibility).

**Pro:** Pass 1 gives immediate discipline win + closes the user-facing divergence bug (path C) without touching the dual-storage architecture. Pass 2 is a follow-up cleanup that can be deferred indefinitely with no functional cost.
**Con:** Two-bundle migration vs one. Slight risk of "pass 1 ships, pass 2 never happens" leaving dual-storage permanently.

---

## Recommendation

**Option D, Pass 1.** Pass 1 closes the user-facing divergence bug (Path C) and the §8 native-confirm violations within ~80-100 LOC. Pass 2 can be deferred to a quiet bundle without any functional risk. INV-29 can be defined immediately after Pass 1 ships.

**Pass 1 scope:**

1. Add to `BRAIN.plan`:
   - `lock(opts, source)` — takes `{ snapshot: optional, fromCycleId: optional }`. Sets `S.activePlan.lockedAt = Date.now()`, handles streak idempotency via `lastStreakedCycleId`, calls `BRAIN.allocation.lock(snapshot, source)` for dual-store sync, calls `save()` with surfaced failure, does round-trip verify, audit-logs `payday_plan_locked` (consolidated type).
   - `unlock(source)` — clears `S.activePlan.lockedAt`, clears `lastStreakedCycleId`, calls `BRAIN.allocation.unlock(source)` for dual-store sync, calls `save()`, audit-logs `payday_plan_unlocked` (consolidated type).
   - `isLocked()` — returns `!!(S.activePlan && S.activePlan.lockedAt)` (the dominant reader).

2. Add to `BRAIN.SOURCES`:
   - `PLAN_LOCK_USER` (canvas Lock save handler)
   - `PLAN_LOCK_LEGACY_FLOW` (Plan Mode "Plan Lock" button at `:25368`)
   - `PLAN_UNLOCK_CANVAS` (canvas Re-plan flow at `:11798`)
   - `PLAN_UNLOCK_INLINE` (banner Unlock button at `:3303`)

3. Migrate 5 call sites to canonical writers:
   - `:11574` + `:11583-:11618` → `BRAIN.plan.lock(opts, BRAIN.SOURCES.PLAN_LOCK_USER)`
   - `:11800-:11808` → `BRAIN.plan.unlock(BRAIN.SOURCES.PLAN_UNLOCK_CANVAS)` + replace `window.confirm` with `EDIT_MODAL.openConfirm`
   - `:3303-:3314` → `BRAIN.plan.unlock(BRAIN.SOURCES.PLAN_UNLOCK_INLINE)` + replace `window.confirm` with `EDIT_MODAL.openConfirm`
   - `:25368` → `BRAIN.plan.lock({ snapshot }, BRAIN.SOURCES.PLAN_LOCK_LEGACY_FLOW)` + remove the `reread.locked = true` direct mutation (storage #3 stops being written)

4. Smoke spec `tests/smoke/plan-lock-unlock.smoke.js` — 5 cases: lock-via-canvas, lock-via-legacy, unlock-via-canvas, unlock-via-inline, dual-store-sync-verify.

5. Scenario-walk D revision: steps 2 + 4 use canonical writers instead of direct mutation. Step 1 (audit) updates: `hasCanonicalLock: true` becomes a pass-condition once Pass 1 ships.

6. FEATURE-MAP v2 entry for `BRAIN.plan.lock` + `BRAIN.plan.unlock` + `BRAIN.plan.isLocked`.

7. CLAUDE.md §5 update + CHANGELOG entry.

**Pass 1 estimate:** ~120 LOC (writers ~50 + migrations ~40 + smoke ~30) + 30 min for FEATURE-MAP + 15 min for CLAUDE.md/CHANGELOG. **~3 hours total** including phone-verify on 380px (lock + unlock paths).

**Risk:** Low. Pass 1 doesn't remove any existing surface; `BRAIN.allocation.lock/unlock` still callable. If a regression appears, revert is straightforward.

**Decision needed from John:**
- A / B / C / D (recommended D Pass 1)
- If D Pass 1: green-light to ship next session, or wait for INV-29 sign-off first?

---

## What this ADR doesn't decide

- **INV-29 semantic content.** Once Pass 1 ships, `BRAIN.plan.isLocked()` is the canonical reader. The question "when locked, what's editable" remains a separate decision (the SDD-bundle-30 §C#3 reservation).
- **`BRAIN.allocation` bubble fate.** Pass 2 is the cleanup; not in scope here.
- **Other lock concepts.** `S.activePlan.activePlan.lockedSnapshot` and `S.planHistory` lock entries are separate state (history of previous lock points) — not touched by this ADR.

---

**End of ADR.**
