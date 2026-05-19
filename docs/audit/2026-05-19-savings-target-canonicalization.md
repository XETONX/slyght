# Bucket / Goal / Trip canonicalization — investigation

**Date:** 2026-05-19
**Status:** Investigation. NO CODE CHANGE. Output for John's review before Bundle 32.3 ADR drafting.
**Prerequisite for:** Bundle 32.3 (conditional spend source abstraction + survival forecast trip-awareness)
**Related discoveries:** lock-state divergence (Bundle 32.7 — three stores), filter-scatter (Phase G — five filter variants). This is the third same-pattern finding in three weeks.

---

## TL;DR

slyght has **6 parallel stores** that each carry some aspect of "savings target" state, with **naming drift across all 6**:

| Store | Type | Holds | Bundle era |
|---|---|---|---|
| `S.savingsBuckets[]` | array | balance ledger (`saved` field — single source of truth) | 7 |
| `S.tripDefs[]` | array | trip metadata + dates + budget target | 8 |
| `S.goalDefs[]` | array | goal metadata + monthly pace + target date + colour | 8 |
| `S.activePlan.overrides['savings:NAME']` | map | per-cycle PLANNED allocation | 27 |
| `S.activePlan.savings[NAME]` | map | legacy mirror of per-cycle allocation | pre-27 |
| `slyght_payday_plan` localStorage (BRAIN.allocation) | object | top-level allocation per goal (china/apartment/freedom/darwin) | 26 |

PLAN.readSavedFromSource already canonicalised the **saved-balance read** (it always derives from `S.savingsBuckets` or `S.mumAccountBalance`) — that's Bundle 8 work that landed cleanly. But **everything else is still divergent**: metadata, names, per-cycle allocation keys, target dates, mode (trip vs goal).

This audit catalogs the divergence + proposes a canonical `SavingsTarget` shape that subsumes tripDefs + goalDefs + the BRAIN.allocation top-level keys, while preserving `S.savingsBuckets` as the underlying balance ledger.

---

## Concrete naming drift (4 variants for "China")

| Store | Field | Value |
|---|---|---|
| `S.tripDefs[china-2026]` | `id` / `name` | `'china-2026'` / `'China'` |
| `S.goalDefs[china]` | `id` / `name` | `'china'` / `'China holiday'` (lowercase h) |
| `S.savingsBuckets['China Holiday']` | `name` | `'China Holiday'` (capital H) |
| BRAIN.allocation localStorage | key | `'china'` (no name field — just a slug key) |

Four different identifiers for the same conceptual entity. Renderers pick one based on which store they read from. No single "what is this savings target's name" reader exists.

### Same problem with Freedom buffer

| Store | Identifier |
|---|---|
| `S.goalDefs[freedom-buffer]` | name: `'Freedom buffer'` |
| `S.savingsBuckets[Rainy Day Fund]` | name: `'Rainy Day Fund'` ← **completely different name** |
| BRAIN.allocation | key: `'freedom'` |
| `PLAN.readSavedFromSource` | hardcodes the mapping: goal `'freedom-buffer'` → bucket `'Rainy Day Fund'` |

The freedom-buffer → Rainy Day Fund link is hidden inside `readSavedFromSource`'s hardcoded mapping table. If you rename either side, the link silently breaks.

### Property Deposit is genuinely THREE concepts on one account

| Store | Entry | Meaning |
|---|---|---|
| `S.goalDefs[apartment]` | name: `'Property Deposit'`, target: `50000` | Savings target |
| `S.debts[7]` | name: `'Property Deposit (via Mum)'`, amt: `5681.45` | What's still owed to Mum |
| `S.mumAccountBalance` | `3000` | Current saved-toward-deposit balance |
| BRAIN.allocation | key: `'apartment'` | Per-cycle allocation slug |

This isn't pure drift — Property Deposit IS legitimately a savings goal AND a debt being repaid (because Mum is fronting the deposit). The audit captures this; canonicalisation needs to preserve both aspects, not collapse them.

### Darwin: in tripDefs only, not in goalDefs

| Store | Entry |
|---|---|
| `S.tripDefs[darwin-2026]` | name: `'Darwin'`, dates June 7–15 |
| `S.goalDefs` | **missing** |
| `S.savingsBuckets` | **missing** (no Darwin bucket) |
| BRAIN.allocation | key: `'darwin'` |

Darwin has TRIP metadata + a per-cycle allocation slot, but no balance-bucket and no goal entry. Where does Darwin's `saved` come from? `readSavedFromSource` doesn't have a mapping → falls back to 0 or to the stored `saved` field if any. This is a real data gap — when John allocates $200 to Darwin, where does that balance live?

---

## Renderers per store (sites that read each)

### `S.savingsBuckets` — 20+ read sites
- Hero NW computation (`:3142`)
- Liquid NW (`:3545`, `:8270`)
- `PLAN.readSavedFromSource` (the canonical reader, used everywhere)
- Round-up destination resolver (`:9512`)
- BRAIN.savings.getBucket / getBuckets
- Chat AI context (`:14545` — hardcoded "China Holiday" name in the system prompt!)
- Plan canvas Savings sub-screen
- Reconciliation imports

### `PLAN.getTrips()` — 9+ read sites
- `_safePlan` in computeFinancialModel (`:4484`)
- Trip rendering in plan-mode (`:9856`)
- Survival forecast hook (`:10755`)
- Multiple plan/canvas surfaces (`:11073`, `:11334`, `:11674`, `:12642`)
- Settings → diagnostics (`:13968`)
- Chat AI context (`:14723`)
- Intent migration (`:15810`)

### `PLAN.getGoals()` — 8+ read sites
- `_safePlan` in computeFinancialModel (`:4485`)
- Plan-mode top-level goals section (`:9862`)
- "Update Plan" flow (`:11675`)
- Diagnostics (`:13969`)
- Chat AI context (`:14724`)
- Intent migration (`:15812`)

### `S.activePlan.overrides['savings:*']` — 5+ read sites
- BRAIN.plan.getSnapshot (the canonical reader)
- INV-32 over-allocation check
- INV-29 plan-lock guard (just shipped)
- Renderer `renderPaydaySavings`
- The savings sub-screen edit modals

### `slyght_payday_plan` localStorage (BRAIN.allocation)
- BRAIN.allocation API (canonical reader)
- Legacy `confirmLockPaydayPlan` (just migrated Bundle 32.7 Pass 1.e)
- Property Deposit / China / Freedom / Darwin slug-keyed allocation amounts

---

## What's legitimately different vs what's drift

### Legitimate differences

- **Trips have spendWindow (startDate/endDate); goals don't.** Trip mode auto-activates within the window per John's intuition. This is a real semantic distinction worth preserving.
- **Trips have `covered` (categories already paid via the trip, e.g. flights/accommodation); goals don't.** Real metadata.
- **Goals have `monthly` pace target; trips don't (typically have a one-shot budget).** Real distinction.
- **Property Deposit is both a goal AND a debt** (Mum fronted the deposit; John repays via $2,500/month). These ARE two concepts on one underlying account — canonical model must preserve both.

### Drift (no legitimate reason)

- **Naming inconsistency** (China vs China holiday vs China Holiday vs china) — pure drift.
- **Goal-id vs trip-id vs bucket-name vs slug** — four parallel identifier systems for the same entity. No reason.
- **Two separate metadata stores (tripDefs + goalDefs)** with overlapping fields — drift.
- **Freedom buffer vs Rainy Day Fund** — pure renaming drift; goal-name and bucket-name should match or have explicit linking.
- **Per-cycle allocation keys (`savings:NAME`) vs BRAIN.allocation slug keys** — two different keying systems for the same per-cycle allocation concept.

---

## Proposed canonical shape

```js
// S.savingsTargets — single store replacing S.tripDefs + S.goalDefs
// + extending the per-cycle allocation key model.
//
// Resolves all 4 modes (per John's intuition):
//   'goal'      — open-ended savings target (no end date; pace via monthly)
//   'trip'      — spendWindow-bound; auto-activates during window
//   'emergency' — buffer; never "spent" intentionally; tap when needed
//   'sinking'   — annual provisions accumulating monthly toward a recurring
//                 cost (Rego, Insurance, Health). Bills tab counterpart.

S.savingsTargets = [
  {
    id: 'china',                      // stable identifier (snake-case)
    name: 'China Holiday',            // display name — SINGLE source of truth
    emoji: '🇨🇳',
    mode: 'trip',                     // goal | trip | emergency | sinking
    target: 5000,                     // total target amount
    bucketName: 'China Holiday',      // → S.savingsBuckets[name].saved
    savedFromAsset: null,             // alt: 'mumAccountBalance' for apartment

    // Mode-specific
    spendWindow: {                    // only when mode === 'trip'
      startDate: '2026-12-01',
      endDate: '2026-12-22',
    },
    autoActivate: true,               // trip auto-actives during window
    manualActivation: null,           // null = follow auto; true/false = override
                                      // ("toggle off if cancelled")
    covered: ['flights','accommodation'],  // trip context — what's pre-paid

    // Common metadata
    monthlyPace: 0,                   // optional pace target
    targetDate: '2026-12-22',         // optional deadline
    colour: '#E74C3C',
    priority: 3,
    description: '...',
    notes: '...',

    // Audit
    createdAt: ts,
    updatedAt: ts,
    archivedAt: null,                 // soft-delete; readers filter on this
  },
  // ... entries for apartment (mode:goal, savedFromAsset:mumAccountBalance),
  // freedom (mode:emergency, bucketName:'Rainy Day Fund' — preserves user's
  // bucket name choice via explicit mapping), darwin (mode:trip,
  // bucketName:'Darwin Holiday' — NEW bucket needed since none exists yet),
  // and the sinking funds (Rego/Insurance/Health currently in Annual Provisions)
],
```

**Saved-balance derivation** (preserves Bundle 8's read canonicalisation):
- `mode:goal|trip|emergency` and `bucketName` set → `saved = S.savingsBuckets[bucketName].saved || 0`
- `savedFromAsset:'mumAccountBalance'` → `saved = S.mumAccountBalance`
- `mode:sinking` → may compute from `S.activePlan.provisions` accumulator
- Neither set → data gap, surfaced as `_ungrounded:true` warning

**Per-cycle allocation key** (replaces the `savings:NAME` shape):
- Per-cycle allocations use `targetId` consistently: `S.activePlan.overrides['savings:china']`, `'savings:apartment'`, `'savings:freedom'`, `'savings:darwin'`
- Migration: rewrite existing `savings:China Holiday`, `savings:Rainy Day Fund`, etc. keys to `savings:china`, `savings:freedom` (lookup via bucketName → target id reverse map)

---

## Migration path

### Phase 1 — Build canonical store (mechanical)

1. Add `S.savingsTargets = []` field to state shape (defaults to empty).
2. On boot, if empty AND `S.tripDefs.length + S.goalDefs.length > 0`:
   - Merge tripDefs + goalDefs into `S.savingsTargets` with mode assigned per source (trip vs goal)
   - Resolve bucketName mappings via the existing `readSavedFromSource` table
   - Stamp createdAt/updatedAt from the source data where available
   - Audit-log `savings_targets_migration_v1` with counts + the merged shape
3. Both old stores remain READ-COMPATIBLE via facade — `PLAN.getTrips()` and `PLAN.getGoals()` continue to work, sourced from `S.savingsTargets` filtered by mode.
4. Writers `PLAN.saveTrip` / `PLAN.saveGoal` route into `S.savingsTargets` and update fields appropriately.

**Time estimate:** 3-4 hours mechanical (migration + facade + smoke spec covering the merged data shape).

### Phase 2 — Migrate consumers to canonical reader

1. Add `BRAIN.savings.getTargets({ mode? })` canonical reader.
2. Migrate ~20 read sites one-by-one to use it instead of `PLAN.getTrips` / `PLAN.getGoals` / inline `S.savingsBuckets` filters.
3. Each migration commit phone-verifies the affected surface.

**Time estimate:** 4-6 hours across multiple sessions.

### Phase 3 — Remove legacy stores

1. Once 0 readers of `PLAN.getTrips` / `PLAN.getGoals` remain, delete the methods.
2. Wipe `S.tripDefs` / `S.goalDefs` on next save (one-shot localStorage cleanup with backup snapshot).

**Time estimate:** 1 hour. Deferrable indefinitely.

---

## INV-34 candidate

> **INV-34: All savings-target metadata mutations route through `BRAIN.savings.setTarget(id, patch, source)`. Direct mutation of `S.savingsTargets` is forbidden outside the writer + migration path.**

Mirrors the pattern from INV-29 (plan-lock), INV-31 (round-up timing). Guardian rule `no-direct-savingstargets-mutation` enforces.

---

## Open question for John before ADR drafting

**The Property Deposit double-concept**: keep as TWO entries (one in savings_targets for the savings aspect, one in S.debts for the repayment aspect) or unify into a single hybrid entry with both savings+debt facets?

Going with TWO entries (status quo) is safer and matches the underlying reality (deposit-building vs amount-still-owed are conceptually separable). The canonical model documents the linkage via a `linkedDebtId` field on the savings target.

Alternative: hybrid entry. Cleaner-feeling but conflates two different state machines. Worse.

**Recommendation: TWO entries with explicit linkedDebtId. Need John's confirmation before ADR locks the shape.**

---

## Scope split recommendation

The user asked: "If the canonicalization investigation reveals the migration is genuinely hard, surface BEFORE committing to ADR scope. We can split: Pass 1 = canonical store + migration, Pass 2 = spendMode + survival forecast integration."

**Verdict from this audit:** the migration IS substantive (Phase 1 alone is 3-4 hours mechanical + 4-6 hours of consumer migrations) but NOT genuinely hard. The Bundle 8 `readSavedFromSource` work already canonicalised the balance read; this audit's migration just extends that pattern to metadata + naming + per-cycle keys.

**Recommend the split anyway** for safety:
- **Pass 1 (Bundle 32.3.a):** canonical `S.savingsTargets` store + migration from tripDefs/goalDefs + facade for PLAN.getTrips/getGoals + INV-34 enforcement + smoke spec. NO consumer migrations yet. ~4 hours.
- **Pass 2 (Bundle 32.3.b):** spendMode-conditional survival forecast (trip-aware) + Manage Targets UI consolidation + per-cycle allocation key migration. ~6-8 hours.

Pass 1 unlocks Pass 2 (the trip-aware forecast can read `mode + spendWindow` directly from canonical targets). Pass 1 ships safely without breaking any current UI.

---

## Decisions needed from John

1. **Confirm the 4-mode taxonomy:** `goal | trip | emergency | sinking`. Anything missing? "Sinking" maps to Annual Provisions (Rego, Insurance, Health) — confirm this is the right pairing.
2. **Confirm Property Deposit handling:** two entries (savings_target + debt) with `linkedDebtId`, OR unify to single hybrid entry?
3. **Confirm Darwin gets a new bucket:** currently no `S.savingsBuckets` entry for Darwin. Migration needs to create `'Darwin Holiday'` bucket (or similar name). What name does John want?
4. **Confirm Freedom buffer ↔ Rainy Day Fund linking:** keep the bucket named "Rainy Day Fund" and link via `bucketName`, OR rename the bucket to "Freedom buffer"?
5. **Confirm split scope:** Pass 1 (~4h, substrate + migration) and Pass 2 (~6-8h, consumer migration + spendMode forecast) as separate bundles? Or one bigger Pass 1.

---

**End of investigation. No code shipped. Awaiting John's decisions on the 5 questions above before ADR drafting.**

---

## BREAKING FINDING (post-write discovery)

While drafting this audit I grep'd one more time and discovered **the canonical store John is asking for already exists**. Bundle 28 Phase 0 shipped:

- **`S.planIntents[]`** — the canonical store, exact shape John described
- **`BRAIN.plan.intent.add / update / get / list / byKind / byBucket`** — canonical writers + readers at `index.html:21578`
- **`seedV25()` migration** at `index.html:15817` — merges existing tripDefs + goalDefs + AnnualProvisions into `S.planIntents`, gated by `slyght_seeded_v25` localStorage flag

### What's in S.planIntents today

Schema (per `BRAIN.plan.intent` docstring at `:21563`):

```js
{
  id            string  stable kebab-case (never mutates)
  name          string  user-editable display name
  emoji         string
  kind          'trip' | 'goal' | 'provision' | 'buffer'   ← already 4 modes
  targetAmount  number
  startDate     string  'YYYY-MM-DD' optional               ← spendWindow start
  endDate       string  'YYYY-MM-DD' optional               ← spendWindow end
  bucketId      string  S.savingsBuckets[].name (FK)        ← canonical link to balance
  category      string  free-text
  notes         string
  priority      number  1=high → 5=low
  archived      boolean soft-delete
  meta          object  kind-specific extras
  createdAt     number  epoch ms
  updatedAt     number  epoch ms
}
```

### Mapping to John's 4-mode taxonomy

| John's proposed | Existing `kind` | Match |
|---|---|---|
| `goal` | `goal` | ✓ exact |
| `trip` | `trip` | ✓ exact (already has startDate/endDate) |
| `emergency` | `buffer` | ✓ semantic match (rename optional) |
| `sinking` | `provision` | ✓ semantic match (rename optional) |

### What's already migrated

The `seedV25()` boot migration at `:15817-:15950` is idempotent + flag-gated. It builds intents from:
- **Trips:** Darwin 2026, China 2026 (with covered/gfSplitting/notes in meta)
- **Goals:** Property Deposit (apartment), Freedom buffer, China holiday
- **Provisions:** Teachers Health, Car service KIA, KIA registration, KIA green slip, KIA insurance (NRMA)

Each entry is created with `bucketHint` pointing at the corresponding `S.savingsBuckets` entry (or `__mum-account__` token for Property Deposit). Naming inconsistencies (China vs China Holiday) ARE preserved as separate intents with the same bucket — by design, since they represent different aspects (trip itinerary vs savings goal target).

### What's NOT done (the actual 32.3 work)

Per the Phase 0 docstring at `:21556-:21561`:

> "Phase 0 is ADDITIVE only — existing PLAN.getTrips / getGoals / getAnnualProvisions readers are NOT touched. seedV25 populates the intents from current state so the structure exists in parallel. Subsequent phases (28.0.x / 28.1+) migrate readers one surface at a time, each phone-verified."

The **20+ reader migration** is the remaining work. Plus a few additions to round out the user's spec:

1. **Auto-activate logic** for trip mode within spendWindow — needs new fields `autoActivate: bool` (default true) + `manualActivation: 'on'|'off'|null` (null = follow auto)
2. **survival forecast trip-awareness** — reads intents with `kind:'trip'` and active spendWindow, applies different spend assumptions
3. **20 consumer migrations** from `PLAN.getTrips()` / `PLAN.getGoals()` / inline `S.savingsBuckets` lookups → `BRAIN.plan.intent.byKind('trip')` / `byKind('goal')` / etc.
4. **Phase out** `PLAN.getTrips` / `PLAN.getGoals` once 0 readers remain (Pass 3, indefinitely deferrable)

### Revised scope for Bundle 32.3

**Pass 1 — additions only (NO migration)** — ~2 hours:
- Add `autoActivate` + `manualActivation` fields to intent schema + writer support
- Add `BRAIN.plan.intent.isActive(id)` helper that resolves auto-vs-manual
- Add `getActiveSpendingTrips()` derived reader for forecast consumption
- Smoke spec: auto-activation within spendWindow · manual override · saved-balance derivation via bucketId

**Pass 2 — survival forecast trip-awareness** — ~2 hours:
- `getSurvivalForecast()` reads active trips, computes per-day spend uplift during trip days
- Smoke spec asserts forecast diverges from baseline during trip days, matches baseline outside
- ADR-worthy decision: how much daily spend uplift? Use trip.targetAmount / trip.days as the per-day flow, OR use historical spend pattern? **Values judgment for John.**

**Pass 3 — consumer migrations** — ~4-6 hours across multiple sessions:
- Migrate ~20 readers from PLAN.getTrips/getGoals to BRAIN.plan.intent.byKind
- One commit per surface, phone-verify between

**Pass 4 — phase out (deferrable indefinitely)**:
- Remove `PLAN.getTrips` / `PLAN.getGoals` once 0 readers remain
- Wipe `S.tripDefs` / `S.goalDefs` on next save

### Revised decisions needed from John (5 questions above + 2 new)

**6. The kind taxonomy is already shipped as `trip | goal | provision | buffer`. John proposed renaming to `trip | goal | sinking | emergency`. Keep as-is (no migration overhead) or rename (1-line schema change + migration of any audit-log historical entries)?**

**7. The Bundle 28 Phase 0 + seedV25 migration ALREADY HAPPENED on John's device when he booted post-Bundle-28. `S.planIntents` is already populated with his real data. We do not need a fresh migration — we just need to add fields + migrate consumers. Confirm understanding before I proceed.**

---

**The 32.3 scope just got 60% smaller because Bundle 28 already did the hardest part. The architectural mess John flagged IS real, but the canonical-store substrate is already shipped — what remained were the consumer migrations + the trip-awareness derived state.**
