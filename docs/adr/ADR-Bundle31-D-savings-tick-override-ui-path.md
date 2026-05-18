# ADR-Bundle31-D — Savings-tick override UI path investigation

## Status
Proposed (Bundle 31 candidate)

## Context

Phase 2 phone-verification (2026-05-18) hit an UNRESOLVED gap: John attempted to verify Phase 2.C's bucket-tick migration end-to-end by tapping a bucket row in the Payday Plan canvas Savings sub-screen of an UNLOCKED plan. He reported "still cannot find an allocation override affordance" after the tap.

CC subsequently code-read the path end-to-end and verified it EXISTS in code (`index.html:11005` `openEditPaydaySavings` → `EDIT_MODAL.openCustom` → quick-pick grid → Save → `BRAIN.plan.setOverride('savings', ...)`). The tap on the bucket-row card SHOULD open a modal with quick-pick chips for setting the override amount.

But John reported the affordance was not findable in the live app. Three candidate explanations remained unresolved at Bundle 30 close:
1. Modal opened but was visually missed
2. Tap didn't register (CSS layer interception or event-handler issue)
3. Modal did open but didn't render the expected UI

The phase verification proceeded through Checks A, B, E, F, G (markPaid bill + markPaid debt + payday-plan upcoming tick + activity log + Dev Inspect) which exercised the SAME `BRAIN.plan.tickItem` → `recordWithAllocation` writer chain. Writer correctness was thus established. The savings-specific UI path was deferred to this ADR rather than blocking Phase 3.

## Problem

There's a discrepancy between what the code reads as doing (opens a modal on tap) and what the deployed app does on John's phone (no visible affordance). One of three things is true:
- Visual / DPI / overlap issue at the device (modal opens but is hidden / off-screen / too small)
- Event-handler regression somewhere in the click chain (tap doesn't fire `openEditPaydaySavings`)
- Render-state issue (modal opens but EDIT_MODAL body is empty / misformatted under live conditions)

This is the first investigation item Bundle 31 ADR-D needs to walk: reproduce the gap on the deployed app with explicit Playwright DOM-driven test (not `page.evaluate` shortcut), capture screenshots at each step, identify which of the three explanations holds.

## Considered Options

- **D1:** Write a Playwright DOM-driven smoke that taps the actual bucket-row element + asserts the modal opens + captures screenshots at each transition. Identify root cause from there.
- **D2:** Add console.log instrumentation to `openEditPaydaySavings` entry + early returns + EDIT_MODAL.openCustom invocation. Deploy + ask John to reproduce + send console output.
- **D3:** Re-read the entire click-chain at the deployed-SHA level (CSS stacking, role="button" handling, EDIT_MODAL z-index vs canvas) for any regression Phase 2 might have introduced.
- **D4:** Pair-debug on John's device via remote chrome inspect (requires desktop tooling setup).

D1 should run first because it produces evidence; D2/D3/D4 are diagnostic options if D1 reveals the gap but not the cause.

## Decision
Pending (target Bundle 31 — first investigation item before other ADR-Bundle31-* work)

## Consequences

When this lands:
- Phase 2.C migration's UI-side verification gap closes
- Either the bug is found + fixed (real regression) OR the UX issue is named (discoverability / visual size / contrast)
- DOM-driven Playwright smoke for the savings override path becomes a regression guard (currently only writer-direct smoke exists)
- Related ADR-Bundle31-A/B/C may inform the fix direction (if the affordance is the issue, redesigning the surface may be cleaner than patching the existing one)

What stays the same regardless:
- Writer chain (`BRAIN.plan.tickItem` savings-bucket branch → `recordWithAllocation` with `_skipFreeMoneyGate:true` + bucket destination) — verified correct in Phase 2 smoke
- Other tick branches (debt, kia-extra, upcoming) — phone-verified working

## Discovery context

- Surfaced: Bundle 30 Phase 2 phone-verify, 2026-05-18 ("savings buckets tile on Dashboard" gap — followed by "still cannot find an allocation override affordance" after switching to Payday Plan canvas)
- Code-read confirmed path exists at `index.html:11005` + `12881` (row onTap → openEditPaydaySavings)
- Phase 2 acceptance: writer correctness established via Checks A/B/E/F/G; savings-tick UI deferred to this ADR
- Severity: MEDIUM (savings-tick is a core Phase 2 user path; production writer is correct; UI accessibility unclear)
- Priority: FIRST item for Bundle 31 — establishes whether other Bundle 31 work needs to compensate for an undiscoverable existing surface vs. add net-new surfaces
