# ADR — Bundle 32.3 Pass 3 — Consumer migration + Darwin link + Property Deposit hybrid + Rainy Day Fund rename

**Status:** Accepted
**Date:** 2026-05-20
**Bundle:** 32.3 Pass 3 (closes substrate column 4 — render-truth)
**Authoritative spec:** CC-PROMPT-PASS-3.md · `docs/design/2026-05-19-vocabulary-alignment-principle.md`
**Related:** ADR-bundle-32-3-forecast-trip-uplift.md (Pass 2) · ADR-bundle-32a-push-on-save-and-fixture-freshness.md · ADR-bundle-32-phase-a-device-tokens.md

---

## Context

Pass 1 (May 19) shipped the activation substrate on `S.planIntents` (autoActivate, manualActivation, isActive, getActiveSpendingTrips). Pass 2 (May 20 morning) wired the canonical store into `getSurvivalForecast` with net-of-covered trip uplift. Pass 3 closes the loop: **every legacy reader migrates to the canonical store, schema-extension UI ships, three named migrations land together**.

Per John's 2026-05-20 directive, three values calls resolved in advance:
1. **Property Deposit:** dual-store + hybrid view reader (Option 1)
2. **Property Deposit data:** complementary, no merge (resolved by investigation — single source at `S.mumAccountBalance`)
3. **Rainy Day Fund:** ID + label rename together (3 hardcoded references migrate)

Updated scope from John: Darwin bucket is verify-and-link (already exists as `'Darwin Trip'`, not create). Property Deposit smoke focuses on hybrid reader correctness, not data merge.

## Decisions

### Reader migration via legacy-view helpers (transition pattern)
- New module-scope `_tripLegacyView(intent)` and `_goalLegacyView(intent)` near `save()`. Translates canonical `S.planIntents` entry → pre-Pass-3 legacy shape (budget=targetAmount, saved=bucket-lookup, covered=meta.covered, etc.).
- Mass-replace `PLAN.getTrips()` → `BRAIN.plan.intent.byKind('trip').map(_tripLegacyView)` (43 sites). Defensive existence-guards (`PLAN.getTrips && ...`) stay as harmless property checks; the actual call path is canonical.
- Same pattern for `PLAN.getGoals()` (15 sites).
- Direct `S.tripDefs` / `S.goalDefs` reads in 5 render sites (synthetic-goal name/emoji lookup) migrated to `_goalLegacyView(intent)` — the canonical intent has all the legacy fields needed, no S.goalDefs scan required.
- `confirmDeleteTrip` and `confirmDeleteGoal` now call `BRAIN.plan.intent.remove()` first (canonical writer, audit-logged), then prune legacy stores for back-compat.
- Verification: smoke test 1h grep-asserts zero `PLAN.getTrips()` / `PLAN.getGoals()` references in `index.html`.

### `_tripLegacyView` / `_goalLegacyView` shape — transition utility
- Returns a plain object matching the pre-Pass-3 shape that legacy consumers expect.
- For trips: `budget`, `saved` (resolved via bucket lookup), `bucketHint`, `covered` (from meta), `gfSplitting` (from meta), `days` (from meta).
- For goals: `target` (=targetAmount), `saved` (apartment → S.mumAccountBalance, others → bucket lookup), `monthly`, `targetDate`, `colour`, `description` (from meta).
- These helpers are deliberately impure: they translate canonical fields to legacy aliases. Pass 4 (deferrable) deletes them when consumers organically migrate to canonical field names.

### Property Deposit hybrid reader
- New `BRAIN.plan.intent.getHybridPropertyDeposit()` returns combined view: `{id:'apartment', name, emoji, target, savedTowardTarget, stillOwedToMum, monthlyPayment, rentComponent, debtComponent, viaRent, delayDate, _goalIntentId, _debtId, _hybrid:true}`.
- Sources: goal intent `'apartment'` + debt `redirectGoal:'apartment'` (or name starting with "Property Deposit") + `S.mumAccountBalance`.
- Dual-store preserved — no entries deleted. Render integration (PLAN canvas + Debts tab routing through this reader) deferred to Bundle 33 UI redesign per "Pass 3 keeps the current static UI" scope. The substrate ships in Pass 3; render integration is the redesign's job.

### Trip edit form $-per-covered field
- Adds a `<input type="number">` next to each `covered` checkbox in `editTrip()`. Inputs `0` by default (matches seedV27's conservative default). Right-aligned, mono font, $ prefix for clarity.
- `confirmEditTrip()` reads each amount, applies `parseFloat + isFinite + Math.max(0, ...)` validation (negative or NaN → 0).
- Saves to TWO targets: (a) `BRAIN.plan.intent.update(tripId, {meta: {covered: [{name, amount}, ...]}}, BRAIN.SOURCES.PLAN_TRIP_EDIT)` for the canonical store, (b) legacy `trip.covered = [name strings]` via `PLAN.saveTrip()` for back-compat with any consumer still reading `S.tripDefs`.
- Form reads existing amounts from canonical `BRAIN.plan.intent.get(tripId).meta.covered` (object shape post-seedV27) with legacy string-array fallback for edge cases.

### Darwin bucket — verify-and-link (seedV29)
- Audit revealed Darwin Trip bucket ALREADY exists in fixture (id:9, saved:$800). Pre-Pass-3 the link was implicit via name-matching in render code.
- New `seedV29` migration: walks `S.planIntents`, for known trip ids without `bucketId` (currently `'darwin-2026'` and `'china-2026'`), sets `bucketId` to the matching bucket name. Idempotent via `slyght_seeded_v29_trip_bucket_link` flag. Conservative — does not invent buckets.
- Result: `_tripLegacyView(darwin-2026).saved` now resolves to `Darwin Trip` bucket's saved without scanning all buckets.

### Freedom Buffer → Rainy Day Fund rename (seedV28 — ID + label)
- Per John's 2026-05-20 values call: rename BOTH the intent ID (`freedom-buffer` → `rainy-day-fund`) AND the intent name (`Freedom buffer` → `Rainy Day Fund`).
- Bucket name was already `Rainy Day Fund` (correct since pre-Pass-3). Only the intent diverged.
- `seedV28` migration: walks `S.planIntents`, finds id=`'freedom-buffer'`, renames id+name. Idempotent via `slyght_seeded_v28_rdf_rename` flag + per-entry check. New `BRAIN.SOURCES.MIGRATION_RDF_RENAME` source tag.
- Hardcoded references updated (3 active + 4 comments): chat system prompt, payday modal find-by-id, PLAN.getGoals defaults, seedV25 defaults, mapping table.
- User-facing copy updated in 4 places: HTML strong tag in goals tile, payday option label, payday detail title, chat AI prompt text.
- Smoke spec 5b: greps `index.html` for `/freedom[- ]buffer/gi` outside the seedV28 allow-block. Asserts zero hits.
- seedV28 IIFE wrapped in `// guardian-allow-block-start: rdf-legacy-string` / `-end` because the migration body MUST reference the legacy strings to perform the rename — load-bearing references.

### Pre-BRAIN migration pattern preserved
- seedV28 and seedV29 both follow the seedV25/26/27 pattern: pre-BRAIN IIFE, reads/writes localStorage directly, idempotent flag, writes to `S.auditLog` array (BRAIN.audit unavailable pre-load).
- Each migration sets its flag LAST so partial migration retries cleanly on next boot.

## Conservation guarantees

Smoke spec category 6 (CONSERVATION_GLOBAL) verifies post-migration snap.derived still holds the Pass 2 invariants:
- `essentialsBreakdown.sum === essentialsTotal`
- `essentialsPaidTotal + essentialsUpcomingTotal === essentialsTotal`
- `essentialsTotal + remainder === totalToPlan`
- `balance > 0` (sanity)

Migration touches three named entities (Darwin link, Property Deposit hybrid reader exposure, Freedom Buffer → Rainy Day Fund rename). All other snap.derived fields are unchanged by design — readers swapped to canonical source returning identical values via the legacy view.

## Verification (all green)

- **146/146 smoke** (was 127; +19 Pass 3 cases across 6 categories)
- **12/12 scenario-walk × 2 runs** (no flake)
- **4-layer Guardian PASS** — "safe to push"
- **All prior smoke specs unchanged** — intent-activation (Pass 1) · trip-forecast-uplift (Pass 2) · push-on-save (32a) · phase-a-auth (Phase A) · essentials/hero/reset-cycle (32.4/32.5/32.6) all green

### Smoke spec breakdown — `tests/smoke/pass-3-consumer-migration.smoke.js`

1. **READER_MIGRATION_PARITY** (8 cases): byKind ↔ legacy count equivalence · trip legacy view field shape · saved resolves to bucket · goal legacy view post-RDF-rename · apartment goal saved via mumAccount · archive filtering · empty result · static grep of PLAN.getTrips()/getGoals() = 0 in code
2. **TRIP_COVERED_AMOUNT_UI** (3 cases): amount persists via BRAIN.plan.intent.update · validation coerces negative/NaN/empty to 0 · post-edit Pass 2 uplift uses new amount
3. **DARWIN_BUCKET_CONSERVATION** (2 cases): Darwin Trip bucket exists + linked via seedV29 · legacy view's saved equals bucket.saved
4. **PROPERTY_DEPOSIT_UNIFICATION** (3 cases): hybrid reader returns combined view · no double-count (savedTowardTarget === mumBal) · no missing data (stillOwedToMum === debt.amt)
5. **RAINY_DAY_FUND_RENAME** (2 cases): seedV28 renamed intent preserves allocations · zero legacy strings outside allow-block
6. **CONSERVATION_GLOBAL** (1 case, the canary): Pass 2 invariants all hold post-migration

## Known gaps / deferred

- **Property Deposit render integration** — hybrid reader is exposed; actual PLAN canvas + Debts tab render through it is Bundle 33 UI redesign scope. Pass 3 ships substrate, not render.
- **Pass 4 (legacy store deletion)** — `S.tripDefs` and `S.goalDefs` still populated by PLAN.saveTrip / PLAN.saveGoal for back-compat. Once 0 consumers read them (Pass 3 zeroed callers but the shims still populate), Pass 4 can delete the stores. Deferrable indefinitely — no functional cost.
- **`_tripLegacyView` / `_goalLegacyView` removal** — transition helpers stay until consumers migrate to canonical field names (targetAmount instead of budget, etc.). Phase G or a future bundle handles.
- **Other vocabulary renames** — essentials→fixed costs, discretionary→flexible spending, etc. — explicitly deferred to a dedicated vocabulary bundle.

## Definition of done

- [x] All 6 smoke spec categories pass (19/19 first try)
- [x] 127 existing smoke specs still pass (146/146 total)
- [x] Scenario-walk 12/12 × 2 runs
- [x] Guardian 4-layer PASS
- [x] All PLAN.getTrips() / PLAN.getGoals() callers migrated (zero outside legacy shim — verified by smoke 1h)
- [x] Trip edit form ships with $-per-covered field, validates correctly
- [x] Darwin bucket exists, linked via seedV29
- [x] Property Deposit hybrid reader (`BRAIN.plan.intent.getHybridPropertyDeposit`) callable
- [x] Rainy Day Fund label + ID rename complete, zero legacy strings (verified by smoke 5b)
- [x] ADR written, CHANGELOG updated, bundle-trajectory marked substrate-complete, handoff updated — all in same commit
- [x] Bundle 32.3 marked complete
- [x] Substrate column 4 marked 100%
- [ ] Phone-verify on John's morning (queue per the prompt's checklist)
