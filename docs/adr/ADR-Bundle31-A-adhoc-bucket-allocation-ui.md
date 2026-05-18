# ADR-Bundle31-A — Ad-hoc bucket allocation UI

## Status
Proposed (Bundle 31 candidate)

## Context

During Bundle 30 Phase 2 verification (2026-05-18), CC was tracing why phone-verify steps for "Quick Log $100 to a savings bucket via bucket quick-add" couldn't find the affordance. Code-read revealed that `renderChinaHolidayTracker` and the `+$10/+$50/+$100` quick-add buttons it rendered were dropped in Bundle 28 when the Settings IA changed (`#savings-buckets-content` target no longer exists). The functions remained in `index.html` as dead code through Bundle 30 until Bundle 30.5 cleanup removed them entirely.

Bundle 30 Phase 2.A added bucket-destination support to `BRAIN.transaction.recordWithAllocation` (with INV-28 free-money gating). The writer is correct and smoke-verified. But **no live UI surface invokes the bucket-destination code path with INV-28 enforcement enabled.** Payday-plan ticks pass `_skipFreeMoneyGate:true` (pre-committed). Round-ups pass `_isRoundup:true` (Q-2.3 inheritance). Quick Log Savings type doesn't set a destination at all (see ADR-Bundle31-B). Result: INV-28 is implemented but dormant in production.

This is acceptable for Bundle 30 (no FR-02 regression — payday-plan tick path correctly credits buckets) but leaves a feature gap: users who want to ad-hoc allocate to a bucket outside the payday plan have no path.

## Problem

There is no user-facing surface that:
1. Lets the user pick a savings bucket
2. Lets the user enter an arbitrary ad-hoc amount
3. Atomically decrements cash AND credits the bucket AND enforces INV-28

The closest existing flows either skip bucket selection (Quick Log Savings) or pre-commit via the payday plan (ticks bypass INV-28). The dropped Bundle 28 quick-add UI had this shape but was tied to a deleted dashboard tile.

### Gap A — INV-28 is currently a dormant gate

Logged from Bundle 30 Phase 2.F smoke coverage audit (2026-05-19):
**INV-28 (free-money refusal) ships correctly in `BRAIN.transaction.recordWithAllocation` but currently has zero production trigger.** All three live allocation paths bypass the gate:
- Payday-plan ticks pass `_skipFreeMoneyGate: true` (lock-time pre-committed)
- Round-ups pass `_isRoundup: true` (Q-2.3 inheritance exemption)
- Quick Log Savings type passes no destination (see ADR-Bundle31-B)
- Bucket quick-add UI was removed in Bundle 30.5.0 cleanup (was dead since Bundle 28)

The Phase 2.B smoke test passes by calling the writer directly via `page.evaluate`. Resolving ADR-Bundle31-A (or B) is the prerequisite for INV-28 having any production effect. Pick this option whose surface naturally triggers INV-28 on real user input; without one of A/B landing, the gate stays dormant.

**Cross-reference:** ADR-Bundle31-B for the related Quick Log Savings bucket-selection gap. The two ADRs share the "no production INV-28 trigger" root cause and likely resolve as a coordinated design.

## Considered Options

- **A1:** Re-introduce a bucket quick-add tile on Dashboard (closest to the deleted UX; tied to Dashboard real-estate)
- **A2:** Add an "Allocate to bucket" affordance inside the Payday Plan canvas Savings sub-screen for the un-planned case
- **A3:** Extend Quick Log Savings type with a bucket picker (overlap with ADR-Bundle31-B)
- **A4:** New "Allocate" tab or modal accessible from PLAN tab
- **A5:** Do nothing — users always go through payday-plan ticks (forces planning discipline; may be the intentional design)

## Decision
Pending (target Bundle 31 design session)

## Consequences

When this lands:
- INV-28 free-money gate activates in production (currently dormant)
- A new live caller of `recordWithAllocation` with bucket destination
- Phase 2.A's bucket-destination smoke test gains a real-world counterpart
- FEATURE-MAP gets a new entry under the chosen surface path

What stays the same regardless of which option:
- `recordWithAllocation` envelope contract (no writer changes needed)
- Round-up + payday-plan tick paths (already correct)
- BUCKET_QUICK_ADD source tag (already in `_SOURCE_SET`; ready to wire)

## Discovery context

- Surfaced: Bundle 30 Phase 2 verification, 2026-05-18
- Verified by: code-read finding "no live caller of bucket-destination envelope outside payday-plan tick + round-up"
- Related cleanup: Bundle 30.5 Commit 30.5.0 removed the dead bucket-modal flow
