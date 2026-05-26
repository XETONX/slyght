# Spec 04 — Payday Plan: lock / unlock loop

**Story:** Sam plans the next payday on the canvas, allocates to buckets + bills, then LOCKS
it so the plan is committed. Unlock must cleanly release. The lock state is the prerequisite
for plan-ticks (Spec 01 Path B).

**Fixture:** positive (`state-snapshot.fake.json`).

## Level 1 — entry
Plan-mode → Payday canvas. `activePlan` lazy-inits on open.

## Level 2 — per control
| action | driver | expect S-delta | expect lands |
|---|---|---|---|
| open canvas | canvas open | `activePlan` initialised | — |
| set an allocation/override | `BRAIN.plan.setOverride` (INV-32 :21676) | override stored iff surplus≥0 | `plan_override_set` |
| lock plan | `BRAIN.plan.lock` :22075 | `activePlan.lockedAt` set | `payday_plan_locked` (observed ×2 — dual store) |
| unlock | unlock path | lock cleared | unlock audit |
| undo a canvas allocation | canvas-wide undo (Bundle 27) | reverses allocation | inverse lands |

## Level 3 — cross-surface (lock-state divergence — memory: 3 stores, 2 paths)
- Lock writes to **`S.activePlan.lockedAt` + BRAIN.allocation localStorage + legacy bool**
  (3 stores). After lock, walk all surfaces that READ lock state and confirm consistency.
- After lock, **Spec 01 Path B tick** must succeed (a locked override executes on tick).
- **Unlock** must clear ALL THREE stores (two unlock paths clear inconsistent subsets — ADR Bundle 32.7). Walk unlock → re-check each store.
- **Dashboard** "plan locked" indicator (if any) reflects state.

## Candidate findings
- `payday_plan_locked` fires twice (dual-store mirror) — confirm it's intentional, not double-write [pending].
- Unlock clears inconsistent subset of the 3 lock stores → stale lock [HIGH, ADR drafted, pending walk].
- Canvas undo doesn't unallocate savings mirror (Bundle 27 open bug — stale `.savings`) [pending].
