# ADR-Bundle31-C — Read-only bucket detail surface

## Status
Proposed (Bundle 31 candidate)

## Context

Surfaced during Bundle 30 Phase 1.B verification (2026-05-18) and refined during Bundle 30.5 cleanup. Originally logged in FEATURE-MAP v2 as `Finding: Bucket row tap goes only to edit/add, not detail view`.

After Bundle 30.5 code-read, the actual situation is: tapping a bucket row in the Payday Plan canvas Savings sub-screen opens `EDIT_MODAL.openCustom` via `openEditPaydaySavings` (`index.html:11005`). This modal is for setting the per-cycle allocation override — an EDIT affordance, not a READ-ONLY detail view.

What's missing:
- A surface that shows the bucket's current balance with cents precision (the canvas rows truncate to whole dollars)
- A list of recent credits flowing into this bucket (round-ups, payday-plan allocations, manual additions)
- The contributing transactions (back-referenced via `linkedTo` when INV-30 FX-fee work lands)
- Goal context: target amount, progress %, estimated time to goal at current rate

Currently the user can derive this by:
1. Filtering Activity Log by source `roundup` + visual scan for bucket name
2. Tapping the bucket row (opens EDIT modal — context-poor for detail purposes)
3. Tapping the Net Worth modal (shows aggregate bucket total only)

The data exists in S + audit log. The presentation gap is the missing surface.

## Problem

Cents-level bucket credit tracing requires multi-step user effort across the audit log + state inspection. There is no single tap-target that answers: "What's in my Darwin bucket, where did each dollar come from, and when?"

## Considered Options

- **C1:** Add a dedicated bucket-detail screen accessed from PLAN tab → Goals card → tap. New screen layer. Most discoverable.
- **C2:** Add a "Details" tab to the existing `EDIT_MODAL` when opened on a bucket. Lower discoverability but no new screen.
- **C3:** Add a long-press on bucket row → detail popover. Hidden gesture; works but undiscoverable.
- **C4:** Add a read-only "details" view as a hovering card BELOW the row when expanded. Inline detail.
- **C5:** Surface bucket detail in the existing Dev Inspect panel (Bundle 30 1.A.8) — developer surface, not user-facing. Easy ship; doesn't close the user gap.
- **C6:** Do nothing — users derive from Activity Log + state inspection. Acceptable if low priority.

## Decision
Pending (target Bundle 31 design session)

## Consequences

When this lands:
- New surface in FEATURE-MAP v2
- Reads from: `S.savingsBuckets[i]`, `S._auditLog` filtered by bucket-credit entries, `S.txns` filtered by `linkedTo` (post-INV-30 FX-fee work)
- No writer changes
- Bucket-level cents-precision becomes accessible without console / audit-log grep

What stays the same:
- Bucket data model (no schema changes)
- Existing edit modal (`openEditPaydaySavings`) keeps its current role
- All canonical writers

## Discovery context

- Originally surfaced: Bundle 30 Phase 1.B verification 2026-05-18
- Refined: Bundle 30.5 cleanup 2026-05-18 (code-read corrected the original speculation about a dashboard-tile path; verified actual path is Payday Plan canvas)
- Severity: LOW-MEDIUM (UX discoverability gap; not a math bug — bucket credits are correct per Phase 2.C smoke)
- Related: ADR-Bundle31-A + B (all three concern bucket UX surface area)
