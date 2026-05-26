# Spec 01 — Darwin Trip: both savings paths (Quick Log vs Plan-tick)

**Story (adviser frame):** Sam wants to put $300 toward the Darwin Trip goal. There are two
routes in the app. A good adviser asks: do BOTH credit the goal, and does either warn if Sam
can't afford it? **Status: WALKED 2026-05-26 — Path A ✗ BROKEN, Path B ✓ WORKS.**

**Fixtures:** positive (`state-snapshot.fake.json`) for the clean contrast; also run on
`state-snapshot.fake.overcommitted.json` to confirm the affordability gate + that the no-picker
bug is state-independent (it is — reproduces on both).

## Level 1 — entry
Dashboard → Quick Log FAB (Path A) and Plan-mode → Payday canvas → Savings sub-screen (Path B).

## Level 2 — Path A (Quick Log → Savings)
| step | action | driver | expect S-delta | expect lands |
|---|---|---|---|---|
| 1 | dashboard baseline | — | bal 4800 · Darwin 800 | — |
| 2 | open Quick Log | `openQuickLogModal` index.html:10154 | modal | — |
| 3 | select "Savings" cat | — | **bucket/goal picker SHOULD render** (it does NOT — :10154-10291 has no picker) | — |
| 4 | enter $300 | page.fill | — | — |
| 5 | submit | `quickLogTxn` index.html:10311 → `recordWithAllocation` :24524 | bal 4800→4500 · **Darwin SHOULD 1100** | `txn_record`,`balance_apply_delta`, **`bucket_saved_change`** |
**OBSERVED ✗:** Darwin stayed 800, **no `bucket_saved_change`** — cash left, goal uncredited.
No affordability warning on the over-committed fixture either.

## Level 2 — Path B (Plan-tick)
| step | action | driver | expect | lands (observed) |
|---|---|---|---|---|
| 4 | set Darwin override $300 | `BRAIN.plan.setOverride` (INV-32 gate :21676) | accepted iff surplus≥0 | positive: `plan_override_set` ✓ · overcommitted: `inv32_refusal` |
| 5 | lock plan | `BRAIN.plan.lock` :22075 | locked | `payday_plan_locked` ×2 (dual-store mirror) |
| 6 | tick Darwin | `paydayTick` :13055 | bal −300 · **Darwin +300** | `txn_record`,`balance_apply_delta`,**`bucket_saved_change`**,`plan_tick` ✓ |
**OBSERVED ✓ (positive fixture):** Darwin 800→1100, bal 4800→4500. Correct.

## Level 3 — cross-surface
- After a successful credit, **Savings tab** Darwin tile must read 1100/4000 (28%). Verify.
- **Net Worth (Dashboard + Analysis)** must NOT change from an internal cash→bucket transfer
  (INV-06). Walk to confirm NW is unchanged (a bug here = double-count, FR-01/02 class).
- **Analysis** spend categories must NOT count the savings move as discretionary spend.

## Candidate findings
- Quick Log → Savings has **no destination picker** → silent uncredited save [✗ CONFIRMED].
- INV-32 refusal surfaces raw token `inv32-over-allocation` (CLAUDE.md §8 plain-English) [pending].
- Plan-tick on a state with no override silently no-ops (no toast) [pending].
