# CC Pass 3 prompt — consumer migration to canonical readers + vocabulary alignment + Darwin bucket

## Read first (in this order, no skipping)

1. `SECURITY.md` — Phase A boundaries still in effect. Pass 3 doesn't touch auth/encryption/transmission, but every push from migrated readers must respect the namespaced KV path.
2. `docs/SESSION-HANDOFF-2026-05-19.md` — substrate column 4 status, autonomy contract.
3. `FINANCIAL-INVARIANTS.md` — the 30 shipped invariants. Pass 3 must not break any. Conservation invariants are the canary.
4. `docs/design/2026-05-19-vocabulary-alignment-principle.md` — the principle being applied in this bundle (Freedom Buffer → Rainy Day Fund example).
5. The Pass 2 + 32a + Phase A ADRs — the execution pattern proven across three bundles.
6. `index.html` — focus on every reader that currently calls `PLAN.getTrips()`, `PLAN.getGoals()`, `PLAN.getTripDefs()`, `PLAN.getGoalDefs()`, or reads `S.tripDefs` / `S.goalDefs` directly. These are the ~20 migration targets.
7. The Trip edit form code path — current `covered[]` array shape and the UI that writes it.

## What this bundle does

Pass 3 closes substrate column 4 to 100% by completing the consumer migration started in Pass 1+2. Three integrated pieces:

1. **Consumer migration** — ~20 readers off legacy `PLAN.getTrips()` / `PLAN.getGoals()` / `S.tripDefs` / `S.goalDefs` → canonical `BRAIN.plan.intent.byKind('trip')` / `byKind('goal')`. Every reader verified against snap.derived. Conservation invariants hold across the migration.

2. **Trip edit form upgrade** — `covered[]` array entries get the per-line `amount` field (the schema extension Pass 2 introduced). UI for users to set `{name: "flights", amount: 420}`, `{name: "accommodation", amount: 1120}` per booking line. Backward compat: entries without amount default to 0 (already locked from Pass 2).

3. **Canonical bucket migration** — three named changes shipped together because consumer migration touches every reader anyway:
   - **Darwin bucket creation** — Darwin trip becomes a canonical bucket (not just a trip def). Required for the alive UI's trip detail render to attach budget breakdown cleanly.
   - **Property Deposit hybrid unification** — currently exists as BOTH a debt-to-Mum AND a savings goal. Pass 3 unifies into a single hybrid bucket that tracks debt-paydown trajectory AND goal completion. Locked direction from prior sessions.
   - **Freedom Buffer → Rainy Day Fund rename** — vocabulary alignment per the principle doc. First instance of the principle being applied in production.

## Out of scope (per scope discipline that made Pass 2 + 32a + Phase A clean)

- **No additional vocabulary renames in this bundle.** Other candidates (essentials→fixed costs, discretionary→flexible spending, bucket→envelope, free-money→to-allocate) are deferred to a dedicated vocabulary bundle later. Pass 3 is already complex; bundling more vocabulary risks scope creep.
- **No legacy reader deletion** — Pass 3 migrates consumers to canonical readers. Legacy `S.tripDefs`/`S.goalDefs` and the `PLAN.getTrips()`/`PLAN.getGoals()` shims STAY in place, just stop having any callers in the codebase. Phase G or a future Pass 4 deletes legacy after 0-reader verification.
- **No UI redesign work.** The alive Dashboard / Trip detail / PLAN root redesign is a separate Bundle 33+ effort. Pass 3 keeps the current static UI; only the Trip edit form gets the new $-per-covered field. All other UI continues to render against the migrated readers.
- **No new invariants.** Pass 3 reuses existing conservation invariants. 32.8 render-truth invariant formalization is its own future bundle.
- **No multi-user / multi-device migration scenarios.** Single user, single device assumed throughout. Phase A architecture supports multi-device but Pass 3 doesn't exercise that.
- **No bank integration considerations.** Phase C scope.

If investigation reveals scope leak into any of the above, halt and surface. The temptation in consumer migration is "while I'm here, let me also..." — resist it.

## Apply the five-practice recipe (fourth application)

This is the fourth bundle in the pattern (Pass 2, 32a, Phase A, now Pass 3). The recipe has held across substrate, infrastructure, and security domains. Apply it to consumer migration:

**1. Read the full picture before writing.** Before touching code, spawn an Explore agent in parallel with your own read. Ten specific questions to map:

- Every call site of `PLAN.getTrips()` — file, line, what it does with the result
- Every call site of `PLAN.getGoals()` — same
- Every read of `S.tripDefs` and `S.goalDefs` directly (not via PLAN) — these are sneakier
- Every read of `S.planIntents` to understand current canonical shape
- The exact return shape of `BRAIN.plan.intent.byKind('trip')` vs legacy `PLAN.getTrips()` — what differs, what's added (e.g. the `amount` field on covered entries)
- The Trip edit form's current `covered[]` write path — file location, validation, save flow
- Property Deposit's current data shape — where it lives as debt vs where it lives as goal, what the union view should look like
- Freedom Buffer's current references throughout the codebase — string literals, IDs, smoke specs, copy
- Migration policy for in-progress data — if user has Property Deposit data in both forms today, which is authoritative? Does the unification have a values call?
- Any existing tests that lock the legacy shape — these will need updating in the same commit

By the time you touch code, no surprises about which readers exist or what shapes need to align.

**2. Reuse proven patterns; don't invent.** Pass 3's pieces should each feel like a sibling of something already shipped:

- Reader migration follows the same shape as Pass 1's MODEL-side canonicalization — read-by-kind via filter, return canonical shape, source-tagged
- Trip edit form `amount` field UI mimics the existing amount inputs in bills/transactions (same input component, same validation, same save pattern)
- Darwin bucket creation mimics the existing canonical bucket pattern from Pass 1
- Property Deposit hybrid unification mimics the pattern used for any existing dual-nature concept (if one exists; otherwise it's a single values call about which kind is primary)
- Freedom Buffer rename mimics any prior string-literal rename in the codebase (use `git log -S "Freedom Buffer"` to find prior renames if any)
- Smoke spec for migration shape verification mimics Pass 1's substrate smoke patterns

**3. Build conservation into the design, not bolted on.** The fundamental constraint: snap.derived after Pass 3 must equal snap.derived before Pass 3 for all data not touched by the Darwin/Property/Rainy-Day changes. Conservation is structural:

- Every migrated reader must return data that produces the same snap.derived output as the legacy reader did (excluding the explicit changes)
- The Darwin bucket creation must conserve: `sum(legacy Darwin trip allocations) === sum(canonical Darwin bucket allocations)` 
- Property Deposit unification must conserve: the union's `paid` + `outstanding` must equal the sum of the previous debt-side `paid` + the previous goal-side `saved`
- Freedom Buffer → Rainy Day Fund rename must conserve: byte-identical data, only the user-facing label and the internal ID change (or only label changes if ID is opaque)

Make the conservation invariant a smoke spec, not a hope. Run snap.derived before migration → capture → run migration → run snap.derived → diff. Diff must be zero for non-touched fields.

**4. Smoke specs designed to catch what could go wrong, not just confirm what should go right.** Required smoke spec categories for Pass 3:

- **READER_MIGRATION_PARITY** (~8 cases, one per major reader category): For each migrated reader, prove canonical reader returns equivalent data to legacy reader. Specifically test: edge cases like empty intents list, single intent, mixed kinds, deleted intents that legacy reader filters out — does canonical reader filter the same way?

- **TRIP_COVERED_AMOUNT_UI** (3 cases): User can enter amount on a covered entry; amount persists across save/reload; amount missing defaults to 0 (backward compat). Specifically test: entering a negative amount must validate; entering a non-number must validate; clearing an amount must store 0 not undefined.

- **DARWIN_BUCKET_CONSERVATION** (2 cases): Pre-migration Darwin trip allocations sum to X. Post-migration Darwin canonical bucket allocations sum to X. Conservation holds. Specifically test: any active reader of Darwin data sees the bucket version after migration, not stale legacy data.

- **PROPERTY_DEPOSIT_UNIFICATION** (3 cases): Pre-migration debt-side balance + goal-side savings = $X. Post-migration unified hybrid bucket shows same $X with both trajectories visible. Specifically test: the union doesn't double-count any transaction; the union doesn't lose any transaction.

- **RAINY_DAY_FUND_RENAME** (2 cases): All user-facing strings show "Rainy Day Fund" not "Freedom Buffer." Data continuity verified (the underlying intent's allocations preserved). Specifically test: search the entire codebase for remaining "Freedom Buffer" strings — should be zero.

- **CONSERVATION_GLOBAL** (1 case, the canary): Capture snap.derived pre-migration. Run all migrations. Capture snap.derived post-migration. For all fields not explicitly touched (i.e. not Darwin, not Property Deposit, not Rainy Day Fund), diff must be zero. This is the catch-all that proves nothing else broke.

Each test should be designed against a specific failure class. Like Pass 2's Case 10 caught the timezone bug, Pass 3's tests should catch:
- Reader migration that silently filters out a kind (legacy filter logic missed in canonical)
- Amount field that saves but doesn't reload (state shape mismatch)
- Property Deposit double-count (both debt-side and goal-side reading the same txn)
- Rainy Day Fund string left in a hardcoded copy block
- Conservation drift from any source

**5. Document values calls WHILE making them.** Write the ADR during the work. Decisions anticipated:

- Reader migration strategy: in-place edit each call site, or shim layer with deprecation log? (Recommendation: in-place edit. Shim is overhead with no benefit when callers are <20.)
- Property Deposit hybrid shape: which kind is primary on the unified bucket? Goal-side with debt as metadata, or debt-side with goal as metadata? (Surface this if investigation doesn't clarify.)
- Property Deposit migration data: if both sides have allocations today, are they additive or is one canonical? (Likely values call — surface during investigation.)
- Rainy Day Fund: is the internal ID also renamed, or just the user-facing label? (Recommendation: label-only if ID is opaque, otherwise both with migration. Surface during investigation.)
- Trip edit form UX for amount field: required or optional? If optional, what's the default — 0 (assumes not-yet-paid, conservative per Pass 2) or null (unknown)? (Locked from Pass 2: default 0.)

Every ADR decision goes in during the work, not after. CHANGELOG entry same commit. SECURITY.md not touched (Pass 3 doesn't change security posture).

## Values calls anticipated mid-implementation

Most decisions are locked or have recommendations above. Three may surface during investigation that need John before deciding:

- **Property Deposit primary kind** (goal-side or debt-side as the canonical shape)
- **Property Deposit existing data conflict** (if both sides have allocations, how to merge)
- **Rainy Day Fund ID rename scope** (label only, or ID + label)

If any other values call surfaces that isn't covered above or by SECURITY.md / FINANCIAL-INVARIANTS.md, halt and surface to John before deciding.

## Ship criteria (all required)

- All 6 smoke spec categories pass (READER_MIGRATION_PARITY, TRIP_COVERED_AMOUNT_UI, DARWIN_BUCKET_CONSERVATION, PROPERTY_DEPOSIT_UNIFICATION, RAINY_DAY_FUND_RENAME, CONSERVATION_GLOBAL)
- Existing 127 smoke specs all still pass (regression check)
- Scenario-walk 12/12 green (run twice to verify stability — Pass 2 had one flake on a 3rd run, watch for similar)
- Guardian 4-layer PASS
- Boot self-test: existing 17 checks (Pass 2 +4, Phase A +5, prior +8) all still pass. Pass 3 doesn't add new boot checks — the migrations are state-level, not infrastructure.
- All ~20 legacy reader call sites migrated (zero callers to `PLAN.getTrips()` / `PLAN.getGoals()` / `S.tripDefs` / `S.goalDefs` outside the legacy shim itself)
- Trip edit form ships with $-per-covered field, validates correctly
- Darwin canonical bucket exists, all allocations conserved
- Property Deposit unified into single hybrid bucket, conservation verified
- Rainy Day Fund label everywhere, Freedom Buffer string searches return zero
- ADR written, CHANGELOG updated, all in same commit
- Bundle 32.3 marked complete in `docs/bundle-32-trajectory.md`
- Substrate column 4 marked 100% complete

## Phone-verify after ship (for John's morning)

1. Open app. Visual check: anywhere "Freedom Buffer" appeared now shows "Rainy Day Fund."
2. Open PLAN canvas. Property Deposit shows unified — debt-paydown trajectory AND goal completion in one view.
3. Open Darwin trip detail. Budget breakdown renders against canonical bucket data.
4. Edit a trip → add a covered entry with an amount (e.g. flights $420). Save. Reload. Amount persists.
5. Add a $1 expense. Confirm: pushes to KV (Phase A namespacing intact), snap.derived recomputes (substrate intact), all hero numbers reconcile.
6. Conservation receipts on PLAN canvas + 32.6 reset modal + 32.5 hero breakdown still verify (the 3 render-truth surfaces).

## Surface back to John when

- Pass 3 is ready for review/phone-verify (commit pushed)
- Investigation reveals a values call that needs John before proceeding
- Any of the 3 anticipated mid-implementation values calls surface
- Investigation reveals scope leak that shouldn't be in Pass 3
- Conservation invariant fails in a way that requires design discussion
- Smoke spec uncovers a Phase B concern (note it, don't fix it, flag for Phase B bundle)

## Fixture state

Tested against post-Phase-A KV state (live, namespaced per device:366fcb8c…). Now that fixture workflow is live + auth'd, `npm run smoke` should pull fresh state. Pass 3 should test against the actual current fixture, not the stale May 19 one.

Numeric paths touched: all readers of trip/goal data, snap.derived (verified unchanged for non-touched fields), Property Deposit consolidation, save() (indirect via state shape change).

[CLAUDE.md §8 state-aware-ship-message contract — third instance.]

## After Pass 3 ships

Substrate column 4 reaches 100%. Open queue becomes:

- Phase G remaining migrations (12 inline-filter sites, mechanical)
- 32.8 render-truth invariant formalization (the receipt pattern, ~1-2hr doc work)
- FR-06 payday countdown 3-value drift (INV-14 violation)
- Phase B (encryption at rest under passphrase-derived key) — spec locked in SECURITY.md
- Bundle 33+ AI layer build — alive Dashboard UI redesign implementation against substrate-complete substrate
- Pass 4 (deferrable) — phase out legacy `S.tripDefs`/`S.goalDefs` once 0 readers (now possible after Pass 3 zeros the callers)

Pass 3 closes the loop on column 4. Everything downstream becomes possible.

---

**Execute autonomously per the autonomy contract in CLAUDE.md §11. Same discipline as Pass 2, 32a, Phase A. Fourth application of the recipe. Close column 4.**
