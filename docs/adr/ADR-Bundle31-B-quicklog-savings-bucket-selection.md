# ADR-Bundle31-B — Quick Log Savings type bucket selection

## Status
Proposed (Bundle 31 candidate)

## Context

During Bundle 30 Phase 2 verification audit (2026-05-18, §6 "Adjacent finding"), CC traced the user-facing paths to bucket interactions. The Quick Log modal offers a Type chip row with options `Expense / Savings / Income / Transfer` (since Bundle 28 round 38). When the user picks `Savings` type, `selectTxnType` auto-sets `cat='Savings'` and hides the category row. The user enters an amount + note, taps Log.

Code path at `index.html:9591+` routes through `BRAIN.transaction.recordWithAllocation({direction:'outflow', cat:'Savings'}, LOG_EXPENSE)` — WITHOUT a `destination` field. Result: cash decrements correctly (INV-01), a Savings-cat outflow appears in the txn ledger, but **no bucket is credited.** The user gets "$50 moved out, somewhere into savings" with no record of which savings target it relates to.

This may be intentional (interpretation: "I moved money to my savings account in the bank; tracking which bucket is handled separately via payday plan or round-ups") OR a UX gap (interpretation: "I expected to pick which bucket this goes into, like the quick-add UI used to do").

## Problem

Quick Log Savings type produces an asymmetric outcome:
- Cash side: correct (decrements)
- Ledger side: correct (Savings-cat outflow appears)
- Bucket side: **silently missing** — bucket.saved doesn't change

From the user's perspective, "I logged $50 to savings" means different things depending on mental model. The current behaviour matches the "bank account transfer" mental model. It does NOT match the "credit my Darwin bucket" mental model.

The asymmetry isn't a math bug (cash and ledger reconcile) but it IS a UX coherence gap: every other allocation path (payday-plan tick, round-ups, the now-removed quick-add) credits a specific bucket. Quick Log Savings is the lone exception.

### Gap A — INV-28 is currently a dormant gate

Logged from Bundle 30 Phase 2.F smoke coverage audit (2026-05-19):
**INV-28 (free-money refusal) ships correctly in `BRAIN.transaction.recordWithAllocation` but currently has zero production trigger.** Quick Log Savings is one of the three live allocation paths that bypass the gate (no destination set → INV-28 condition `hasBucketDest && cat in {Savings,Transfer}` is false → gate skipped). If B1 (bucket picker in Quick Log Savings) is chosen, INV-28 activates naturally for this path — ad-hoc allocations would be gated, matching the intent.

**Cross-reference:** ADR-Bundle31-A for the broader ad-hoc-bucket-allocation UI gap. The two ADRs share the "no production INV-28 trigger" root cause; B's resolution may make A unnecessary OR may want a different surface; coordinate the design.

## Considered Options

- **B1:** Add a bucket picker UI to the Quick Log Savings type (a row that appears when type=Savings, replacing the hidden category row)
- **B2:** Default Quick Log Savings to "bank-side movement only" (current behaviour) but add a separate "Allocate to bucket" flow elsewhere (overlap with ADR-Bundle31-A)
- **B3:** Remove the Savings type from Quick Log entirely — force bucket allocation through Payday Plan canvas only (forces planning discipline; reduces UX surface)
- **B4:** Make Savings type implicitly credit the round-up destination bucket (uses the existing destination setting; one-bucket-only constraint)
- **B5:** Document current behaviour explicitly with on-screen hint ("Savings amount is bank-side only; use Payday Plan to allocate to specific buckets") — minimum-change option

## Decision
Pending (target Bundle 31 design session — coupled with ADR-Bundle31-A decision)

## Consequences

When this lands (B1 + B2 + B3 + B4 all activate INV-28 for the chosen path):
- New live caller of `recordWithAllocation` bucket-destination envelope
- Bucket credit matches user mental model
- Activity log shows bucket-credited entry alongside cash-decremented entry
- INV-02 + INV-12 now exercised by a real production flow (currently only smoke-tested)

What stays the same:
- `recordWithAllocation` envelope contract
- Round-up + payday-plan tick paths

If B5 chosen: zero code change; documentation only. Acceptable if current behaviour IS the intent.

## Discovery context

- Surfaced: Bundle 30 Phase 2 verification audit, 2026-05-18 §6
- Verified by: code-read at `index.html:9591+` showing `recordWithAllocation` call without `destination` field
- Related: ADR-Bundle31-A (both are about ad-hoc bucket allocation paths)
