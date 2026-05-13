# MISSION — Bundle 28: PLAN Mode Deep Dive

> Scoping doc. 2026-05-13 morning, day after Bundle 27 shipped.
> Author: Claude Opus 4.7. Audience: John + Opus (ship-prompt drafter).
> Mode: pre-ship audit + UX redesign + bug bundle. NOT a ship prompt yet.

---

## 0. Why this bundle exists

Bundle 27 landed the Payday Plan canvas — backend solid, but on first real-use morning John found multiple stubs, broken nav, a Savings sub-screen that doesn't visualise the story he's trying to tell, and theme-overlap that creates duplicated entities across surfaces (China appears 3×, NRMA / Teachers Health / Rego / Green Slip span 2-4 surfaces each). He also flagged the higher-level question: **does PLAN mode actually help me visualise my money over month → cycle → quarter → year?** This bundle answers that with a redesign, not just a bug fix.

The brief, in his words:
1. Bundle all the bugs found
2. Heavy deep dive on PLAN mode UX (work with Opus on the redesign)
3. No regressions on what shipped Bundle 27
4. No duplicate paths — link overlapping themes back, don't create new routes
5. Improve barriers (guardian static + runtime + invariants)
6. Treat it like usability testers banging on the canvas — does it tell a coherent money story?

---

## 1. Bug bundle — confirmed in code

Twelve issues confirmed via direct read against `index.html`. Carry-over from Bundle 27 close-out marked `[27→]`.

| # | Bug | Location | Severity |
|---|---|---|---|
| **B28-1** | "Ask AI" toast says "full context wiring lands Phase 7" but Phase 7 context IS wired in chat system prompt | `index.html:8366-8370` | Cosmetic (user-visible lie) |
| **B28-2** | KIA Extra editor still a `alert('Phase 6 candidate')` stub | `index.html:8818` | Functional (slot is unusable) |
| **B28-3** | Bills sub-screen "Go to Bills →" lands on PLAN mode Darwin Trips, not Bills tab | `index.html:8657` | Nav broken |
| **B28-4** | PLAN-mode tile order: Payday Plan sits below WRX tile | `renderPlanMode L17546↔17550` | IA wrong |
| **B28-5** | Auto-allocate operates on remainder only — no Full vs Remaining mode | `BRAIN.plan.recommendAllocation` | Feature gap |
| **B28-6** | Bills sub-screen shows paid items inline (noise) instead of focusing on what's left to cover | `renderPaydayBills L8551-8659` | UX |
| **B28-7** | Savings sub-screen splits Goals + Trips harshly, no visual progress bars on rows, wrong-feeling account refs | `renderPaydaySavings L8701-8827` | UX |
| **B28-8** | China duplication — appears as `savingsBuckets['China Holiday']` + `PLAN.trips['china-2026']` + `PLAN.goals['china']` | L1809 / L16935 / L16994 | Data shape |
| **B28-9** | Annual Provisions live as separate PLAN-tile + are mirrored hint in Savings sub — should be folded into Savings allocation flow | L17560 / L18980 / L16901 | IA |
| **B28-10** | Theme overlap — Teachers Health / NRMA / WRX Rego / WRX Green Slip span 2-4 surfaces each, no canonical lookup | matrix below | Architectural |
| **B28-11** | Empty states missing on Bills / Savings / Upcoming sub-screens (Phase 8 spec gap) | L8551 / L8702 / L8830 | Polish |
| **B28-12** | Stale Phase-6-era comment in `openPaydayAskAI` | L8364-8366 | Hygiene |
| `[27→]` **B28-13** | Undo on savings allocation leaves stale `S.activePlan.savings[bucketName]` mirror — display shows old $200 after override cleared | `BRAIN.plan.undoLast` / `getSnapshot` savings calc | Functional (carry-over from Bundle 27) |
| `[27→]` **B28-14** | TDZ errors at `index.html:1646` (BRAIN), `:11246` (_planScrollSavedY), `:13111` (PLAN) | boot path | Cleanliness (no user impact) |
| **B28-15** | Orphan handler `paydayUntick` defined L8471, never invoked | L8471 | Dead code |
| **B28-16** | Duplicate surplus calc: legacy `getGenuineSurplus` (L2292) coexists with `BRAIN.plan.getSnapshot` (canonical) | L2292 | Architectural debt |
| **B28-17** | Three Phase-7 crons still missing — weekly digest, end-of-cycle recap, deferred-rollover (rollover logic exists in `_emptyActivePlan` L15107 but no cron fires) | none (worker-side) | Deferred — needs CF Worker repo |

---

## 2. Cross-surface entity overlap matrix

The architectural root of the duplication noise. **Every cell with 2+ surfaces is a candidate for collapsing to a single canonical entity with views.**

| Entity | BILLS | S.debts | AnnualProvisions | savingsBuckets | PLAN.trips | PLAN.goals |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| **China Holiday** | – | – | – | ✓ `'China Holiday'` (L1809, goal 4000) | ✓ `'china-2026'` (L16935, budget 5000) | ✓ `'china'` (L16994, target 5000) |
| **Teachers Health** | ✓ quarterly (L1850, $259.41) | ✓ via arrears flow (L10963 cmt) | ✓ (L16904, $259.41 × 4) | – | – | – |
| **NRMA KIA Insurance** | (removed seed v21) | ✓ v18 seed (L11144) | ✓ (L16908) | (sinking fund partial) | – | – |
| **WRX Rego** | ✓ yearly (L1848, $462) | ✓ v17 paid (L11027) | ✓ named "KIA registration" (L16906, $462) | ✓ `'Rego & Insurance'` (L1811, goal 1500) | – | – |
| **WRX Green Slip** | – | ✓ v17 paid (L11030) | ✓ named "KIA green slip" (L16907, $552) | (folded into Rego & Insurance) | – | – |
| **KIA Service** | – | – | ✓ biannual (L16905, $500) | (no bucket) | – | – |

**What this tells us:**
- The data is **fine** if you read it as: BILLS is the cycle-due ledger, AnnualProvisions is the sinking-fund target list, savingsBuckets is the actual money pile, S.debts holds historical/paid items.
- It's **fragile** because nothing canonicalises the relationship. Each surface reads its own slice and the user sees them as four separate things instead of four views of the same fact.
- The renaming drift (AnnualProvisions still says "KIA registration" / "KIA green slip" even though the WRX has been sold and the KIA's relevant items now sit in BILLS / savingsBuckets) confirms there is no single name resolver. **Fix is a registry, not a rename.**

---

## 3. PLAN-mode IA redesign

### 3.1 Tile order (today → target)

Current top-down in `renderPlanMode` (L17496):
```
Liquid NW header → WRX tile → Payday Plan tile → Trips → Goals → Super → Annual Provisions → Income Simulator
```

Target:
```
Liquid NW header
↓
[Payday Plan]      ← this cycle (most-frequent context)
↓
[Trips + Goals]    ← merged tile (see §4)
↓
[WRX tile]         ← long-term snapshot (less frequent)
↓
[Annual Provisions] ← merged into Savings (see §5)
↓
[Super]
↓
[Income Simulator]
```

**Rationale (per John 2026-05-13):** monthly cycle is more relevant than the long-term WRX calc; the user opens PLAN mode to answer "how am I doing right now?" before "how am I doing strategically?"

### 3.2 Tile hierarchy principle

The PLAN-mode root is **a story told in time order**, narrowest-frame first:
- **Now / this cycle** → Payday Plan canvas (Bundle 27)
- **3–12 months** → Trips + Goals (combined surface, see §4)
- **1–3 years** → WRX status, Super, Income Simulator
- **Cross-cutting** → Provisions (folded into Savings flow, see §5)

This is the "tell a story" axis John named. Each layer should answer one question and link cleanly to the next.

---

## 4. Trips + Goals merge (the China-duplicate fix)

### 4.1 Problem
"China" lives in three places (savingsBucket, trip, goal). To the user this is ONE thing — the holiday — that has:
- A name + emoji + dates
- A target budget
- An actual saved amount
- An account it's drawn from
- A position on the calendar

### 4.2 Proposed shape
Introduce a single canonical entity: **`PLAN.intents`** (or `PLAN.savingsTargets` — naming TBD).

```
intent {
  id: 'china-2026',
  name: 'China',
  emoji: '🇨🇳',
  kind: 'trip' | 'goal' | 'provision' | 'buffer',
  targetAmount: 5000,
  startDate: '2026-12-01',   // optional, only for trips
  endDate:   '2026-12-22',
  bucketId:  'china-holiday', // points at the bucket holding the money
  category:  'travel',
  notes:     '',
  archived:  false
}
```

The bucket holds the *money*; the intent describes the *purpose*. One bucket can serve multiple intents (e.g. "Freedom Buffer" funds both emergency and small-trip headroom).

### 4.3 Migration path
- `seedV25_collapseDuplicates`: scan `savingsBuckets[]`, `PLAN.trips[]`, `PLAN.goals[]` for name overlap → produce a single intents list + reassign saved amounts to the bucket. Idempotent.
- Old reads (`PLAN.getTrips()`, `PLAN.getGoals()`) become thin views over `PLAN.intents` filtered by kind. Backwards-compat preserved.
- Guardian static rule: `no-direct-trips-goals-write` — forces writes through `BRAIN.plan.intent.set`.

---

## 5. Savings sub-screen redesign (the big one)

The current sub-screen splits Goals / Trips / Provisions hint / KIA Extra into four read-mostly sections with text-only % indicators. John wants to **see** the money draining from payday and pouring into each target.

### 5.1 Target layout

```
┌────────────────────────────────────────────────────────┐
│ ◀ Savings + future money         this cycle: $XXX     │
├────────────────────────────────────────────────────────┤
│ POOL TO ALLOCATE                                        │
│ ┌───────────────────────────────────────────────────┐  │
│ │ ▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░  $480 of $1,200       │  │
│ │ (drains as you allocate below)                    │  │
│ └───────────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────┤
│ UPCOMING — within 3 months                              │
│ ┌───────────────────────────────────────────────────┐  │
│ │ 🇨🇳 China           in 230 days                    │  │
│ │ ▓▓▓░░░░░░░░░░░░░  $62 of $5,000  (1%)              │  │
│ │ + $0 this cycle  [edit]  [tick when paid]          │  │
│ └───────────────────────────────────────────────────┘  │
│ ┌───────────────────────────────────────────────────┐  │
│ │ 🚗 KIA Rego        due 12 Jul (Annual Provision)  │  │
│ │ ▓▓▓▓▓▓▓▓░░░░░░░  $380 of $462  (82%)              │  │
│ │ + $40 this cycle  [edit]  [tick]                   │  │
│ └───────────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────┤
│ LONG-TERM GOALS                                         │
│ ┌───────────────────────────────────────────────────┐  │
│ │ 🛡️ Freedom Buffer  no deadline                     │  │
│ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓░░  $1,250 of $1,500  (83%)          │  │
│ │ + $50 this cycle  [edit]  [tick]                   │  │
│ └───────────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────┤
│ EXTRA DEBT — KIA loan                                   │
│ + $0 this cycle  [edit]  ← no longer a stub             │
└────────────────────────────────────────────────────────┘
```

### 5.2 Visual mechanics

- **Pool bar** at top: live-shrinks as the user allocates. Same vis pattern shows growth-into-targets below.
- **Per-row progress bar**: shows lifetime fill (saved / target). When user types an amount, a faint "ghost" segment animates to the right, showing the proposed new fill.
- **Time-to-completion micro-text**: "at $40/cycle = ready by 12 Jul" for time-bound items.
- **Sort order**: by deadline ASC within Upcoming; by % complete ASC within Long-term (so the closest-to-done floats up — small dopamine).

### 5.3 Section logic

- **Upcoming** = anything with `endDate` within 90 days OR `kind === 'provision'`. Provisions fold in here because they ARE near-term cashflow events.
- **Long-term goals** = `kind === 'goal'` OR `kind === 'trip'` with `endDate > 90 days`.
- **Extra debt** = the KIA-extra slot, now with full edit modal matching `openEditPaydaySavings`.

### 5.4 Annual Provisions fold-in

Replace the current Annual Provisions tile at PLAN-root with a slimmer **"Annual money map"** info card (no editing surface — just shows the year ahead). Editing happens inside Savings sub-screen under Upcoming. The `getCustomProvisions()` data source stays — it just feeds the Savings view, not its own tile.

This is John's explicit ask: *"annual provisions should be moved in as it's part of planning to ensure I put money away for the future debts."*

---

## 6. Auto-allocate — Full vs Remaining mode

Current `BRAIN.plan.recommendAllocation` operates only on what's left after manual edits. John wants choice.

### Proposed modes

| Mode | Behaviour | When to use |
|---|---|---|
| **Full plan** | Wipes user edits, computes fresh allocation across all categories using saved priorities | Starting from scratch / "redo from zero" |
| **Top up remainder** | Keeps user's manual allocations, distributes only the leftover | The current behaviour, surfaced as one option |
| **Cancel** | Closes modal, no change | – |

UX: the existing Auto-allocate button becomes a 3-button modal. Default highlight on **Top up remainder** (safer — preserves intent).

Both modes log to `BRAIN.audit` with distinct source tags: `PLAN_AUTOALLOCATE_FULL` vs `PLAN_AUTOALLOCATE_REMAINDER` so the user can trace which was last used.

---

## 7. Bills sub-screen redesign — "what's left to cover"

Current behaviour: shows all bills due this cycle, paid items inline with ticked checkmark. John reads paid items as noise.

### Proposed

- **Default view: unpaid only.** "What you still need to cover this cycle."
- **Collapse strip**: "✓ 3 paid this cycle · $410 already covered  [show]" — expandable into a paid list. Default collapsed.
- **Empty state**: "All bills covered for this cycle. 🎉 [show paid items]"

Same data sources, different render contract. Tick → row animates into the collapsed strip rather than just gaining a checkmark.

---

## 8. Money-story language across surfaces

John named the design goal: PLAN mode should tell a story across **month → cycle → quarter → year**. Today each surface speaks its own dialect. Proposed shared vocabulary:

| Frame | Says | Owns |
|---|---|---|
| **Today** | "$X spent · $Y budget · $Z left" | Dashboard pace tile |
| **This cycle** (since last payday → next payday) | "$X earned · $Y allocated · $Z unallocated · streak N" | Payday Plan canvas root |
| **This month** | "$X net flow · $Y top category" | Analysis tab |
| **This quarter** | "$X to Annual Provisions · $Y to Goals · $Z to Trips" | NEW — Savings sub-screen header summary |
| **This year** | "Net worth trajectory · provisions coverage · goals on track / off track" | PLAN mode hero header (Liquid NW) |

Consistent verbs: **earned · allocated · committed · paid · saved**. No mixing of "spent / used / paid out" — the audit log already standardises this; the UI hasn't.

---

## 9. Guardian additions — improve barriers

Per John's ask. Each new barrier prevents a class of regression we'd otherwise have to catch by eye.

### 9.1 Static (Layer 1)

- `no-stale-phase-message` — flag string literals containing `Phase \d+ candidate` / `coming Phase \d` / `lands Phase \d`. Forces removal once a phase has shipped.
- `no-direct-intents-write` — `PLAN.intents` mutations must go through `BRAIN.plan.intent.set`. Mirrors `no-direct-debts-mutation`.
- `payday-canvas-stub-free` — sub-screen render fns can't contain `alert(...Phase` strings.

### 9.2 Runtime structural (Layer 2)

- "Every PLAN tile in `renderPlanMode` is reachable from a navigator" — verifies tile-order is intentional (no orphan tile silently dropped).
- "Every `Go to X` link inside Payday Plan canvas resolves to a real `goPage(...)` target" — would have caught B28-3.
- "`BRAIN.plan.undoLast` leaves `getSnapshot().savings.total` equal to `getSnapshot().savings.total` pre-write" — would have caught B28-13.

### 9.3 Boot self-test (Layer 3)

Add to the existing canary at L7712-ish:
- `'KIA-extra editor reachable'` — verify it's no longer an alert stub.
- `'Auto-allocate mode dialog opens'` — verify Full/Remainder dialog wired.
- `'China entity is canonical'` — verify after seedV25 there's exactly one canonical record for any name appearing in ≥2 of {buckets, trips, goals}.

---

## 10. Phased ship order (Bundle 28 phases)

The bundle is bigger than a single ship; we phase to keep blast radius small. **Each phase ships independently and is verified on phone before next phase begins.**

| Phase | Scope | Files touched | Risk | Notes |
|---|---|---|---|---|
| **28.0** | Backend prereqs — `PLAN.intents` schema, seedV25 migration, `BRAIN.plan.intent.set` writer, new SOURCES tags | `index.html` BRAIN.plan + state migration | Medium | No UI change. Boot self-test verifies canonical entities. |
| **28.1** | Bug cleanup — B28-1 (stale toast), B28-2 (KIA editor wired), B28-3 (Go to Bills fix), B28-12 (stale comment), B28-15 (orphan paydayUntick removed), B28-13 (undo savings mirror fix) | `index.html` Payday Plan canvas | Low | Pure fix-up. No new surfaces. |
| **28.2** | PLAN-mode tile reorder — B28-4 swap WRX ↔ Payday Plan; new tile hierarchy per §3.1 | `renderPlanMode` | Low | Cosmetic. Layer V screenshot regression. |
| **28.3** | Savings sub-screen redesign — visual progress bars, Upcoming-vs-Long-term split, Provisions fold-in, KIA Extra editor | `renderPaydaySavings` + new CSS + new editor modal | Medium-High | Biggest UX change. Pre-screenshot all current Savings flows. |
| **28.4** | Bills sub-screen redesign — unpaid default, paid collapse strip, empty state | `renderPaydayBills` | Low | Layer V baseline update. |
| **28.5** | Auto-allocate Full / Remainder modes | `BRAIN.plan.recommendAllocation` + new modal | Medium | New source tags + audit-log shape. |
| **28.6** | Empty states across Bills / Savings / Upcoming (B28-11) | sub-screen renderers | Low | Polish. |
| **28.7** | TDZ cleanup B28-14 (L1646 / L11246 / L13111) | boot order | Low | Audit-log noise reduction. |
| **28.8** | Guardian additions per §9 | guardian-static.js + guardian-runtime.js + boot self-test | Low | Barrier-improvement. Runs in CI. |
| *(deferred)* | Phase-7 crons (weekly digest / end-of-cycle recap / deferred-rollover) | CF Worker repo | – | Out of Bundle 28 scope per Bundle 27 note. |
| *(deferred)* | `getGenuineSurplus` → `BRAIN.plan.getSnapshot` consolidation B28-16 | callers across index.html | Medium | Polish — defer to Bundle 29. |

---

## 11. Regression protection plan

Before any phase ships:

1. **Layer V capture** of every surface this bundle touches (PLAN root, Payday canvas root, all 5 sub-screens, Bills tab, Annual Provisions tile area). Baseline locked.
2. **Manual phone walk script**: open PLAN → tap Payday Plan → walk each sub-screen → tap every nav link → verify destination → return → re-open. Time-boxed 5 min per phase.
3. **Audit-log diff**: snapshot `BRAIN.audit.recent(50)` pre-deploy → run phase → snapshot post-deploy → diff. Any new error-class entries are blockers.
4. **Boot self-test** must report zero failures on first load post-deploy.

Per `slyght_audit_before_shape_change.md` — every shape change (seedV25, intents schema) gets an 8-grep audit naming every reader/writer of the old shape BEFORE the migration ships.

---

## 12. What this bundle deliberately does NOT do

- Does not add CF Worker push notifications (Phase 7 carry-over — separate bundle).
- Does not refactor `getGenuineSurplus` callers (B28-16 — defer to 29).
- Does not touch BILLS tab itself, only the Payday-canvas Bills sub-screen.
- Does not introduce cloud sync (Bundle 23 — still queued post-19/20).
- Does not change debt-strategy UX or WRX accounting.
- Does not ship long-press untick gesture (Bundle 27 deferred).

---

## 13. Resolved decisions (John 2026-05-13)

| # | Decision | Effect on this doc |
|---|---|---|
| **Q1** | `PLAN.intents` accepted in concept, needs explanation — see §14.1 | §4 fleshed out below |
| **Q2** | Annual Provisions fold INTO the Payday Plan canvas (either as its own sub-screen tile OR alongside Bills in Essentials) — NOT a PLAN-mode root tile anymore | §14.4 picks the sub-screen path with rationale |
| **Q3** | Auto-allocate default = "Top up remainder" highlighted | §14.5 commits to this |
| **Q4** | Bills paid items collapsed by default AND placed BELOW unpaid (not above) | §14.4 reflects new ordering |
| **Q5** | Full pre-design with code-shape, BRAIN naming, guardian gap mapping, button reuse — go deep | §14-§17 are the answer |
| **Q6** | Trace root cause of "Go to Bills" as part of the deep scope | §18 traces it |

---

## 14. Phase-by-phase architectural pre-design

This section answers Q5 — *"plan out the features, what code you would be using, the potential flaws within that code that would slip through guardian, naming conventions to BRAIN that enforce the architecture we are leaning to."*

Each phase below specifies: new entities + writers + readers + sources, file:line touch points, failure modes, the guardian rule that catches each failure mode, and the principle from §19 that the UI satisfies.

### 14.0 Phase 28.0 — Backend prereq: `PLAN.intents` canonical entity

#### Q1 deep-dive — what is `PLAN.intents`?

Today, "China" lives as three records (savings bucket / trip / goal). Each was added in a different bundle (buckets Bundle 8, trips Bundle 16, goals Bundle 18 sketch). Each surface reads its own slice. The user sees three Chinas; the data sees three Chinas; the only thing that knows they're one thing is **John's head.**

`PLAN.intents` is the **canonical "thing I'm putting money aside for"** entity. One intent = one purpose. Multiple views (Trips tab, Goals tab, Savings sub-screen Upcoming, AnnualProvisions roll-up) all read the same intent list filtered by `kind`. The savings bucket holds the actual money; the intent describes the purpose; the bucket-to-intent relationship is many-to-many in principle (one bucket can fund multiple intents — e.g. Freedom Buffer covers both emergency and small-trip headroom).

**Why "intent" not "savingsTarget" not "goal":**
- `goal` is taken — already a record kind
- `savingsTarget` excludes provisions (which are sinking-fund commitments toward a future *bill*, not a savings goal in the user-sense)
- `intent` is general — *"a thing I'm intending to put money toward"* — and accommodates new kinds without renaming (e.g. future `kind: 'invest'`)
- The Stripe / Notion industry precedent for "intent" is "the thing the user is trying to do" — consistent

**Schema:**
```js
intent = {
  id: 'china-2026',                // stable kebab-case; never mutates
  name: 'China',                   // user-editable display
  emoji: '🇨🇳',                    // user-editable
  kind: 'trip' | 'goal' | 'provision' | 'buffer',
  targetAmount: 5000,              // dollars
  startDate: '2026-12-01',         // optional; required for trips + provisions with a deadline
  endDate:   '2026-12-22',         // optional; required for trips
  bucketId:  'china-holiday',      // FK → savingsBuckets — where the money lives
  category:  'travel',             // free-text taxonomy (travel / vehicle / health / etc.)
  notes:     '',                   // user-editable
  priority:  3,                    // 1=high → 5=low; used by auto-allocate
  archived:  false,                // soft delete
  createdAt: 1700000000000,
  updatedAt: 1700000000000
}
```

#### New BRAIN methods

```js
BRAIN.plan.intent = {
  add(intentLike, source)            // returns { ok, id, reason? }
  update(id, patch, source)          // partial update; rejects unknown fields
  remove(id, source)                 // sets archived:true; never hard-deletes
  get(id)                            // returns intent or null
  list({ kind, archived, bucketId }) // filtered view (default archived:false)
  byKind(kind)                       // convenience
  byBucket(bucketId)                 // all intents drawing from this bucket
  setBucket(id, bucketId, source)    // re-link to a different bucket
}
```

Every writer (`add`, `update`, `remove`, `setBucket`) validates `source` against `_SOURCE_SET`, appends to `BRAIN.audit`, and calls `save()`. Pattern mirrors `BRAIN.debts` exactly.

#### Legacy reads stay back-compat (during transition)

```js
PLAN.getTrips = () => BRAIN.plan.intent.byKind('trip').map(_intentToLegacyTripShape)
PLAN.getGoals = () => BRAIN.plan.intent.byKind('goal').map(_intentToLegacyGoalShape)
PLAN.getAnnualProvisions = () => BRAIN.plan.intent.byKind('provision').map(_intentToLegacyProvisionShape)
```

Once every renderer reads from `BRAIN.plan.intent.list(...)` directly, the legacy mappers are deletable (Bundle 29+ candidate). Until then they preserve every existing call site.

#### Migration — `seedV25_collapseIntents`

Runs once per device, gated by `S.seededV25`. Snapshot taken first (`SNAPSHOTS.take('pre-seedV25-intents')`) for rollback.

Algorithm:
1. Build merge candidates by name (case-insensitive, trimmed): every `S.savingsBuckets[].name`, `S.tripDefs[].name`, `S.goalDefs[].name`.
2. For each unique name, pick the dominant record (priority: trip > goal > bucket — date-bound wins; if no trip, goal target wins; else bucket).
3. Materialize an intent per dominant record. Link `bucketId` to the matching bucket (create one if no bucket exists — sinking funds need a money pile).
4. Drop `S.tripDefs` and `S.goalDefs` into `S._legacyTripDefs` / `S._legacyGoalDefs` (kept for one bundle, then dropped Bundle 29).
5. Annual Provisions hardcoded list (`PLAN.getAnnualProvisions` defaults at L16901) becomes 5 seeded intents with `kind:'provision'`, all linked to `bucketId:'rego-insurance-service'` (the existing Rego & Insurance bucket).

#### New SOURCES tags

Added to both `BRAIN.SOURCES` and `BRAIN._SOURCE_SET`:

```js
PLAN_INTENT_ADD:          'plan-intent-add',
PLAN_INTENT_UPDATE:       'plan-intent-update',
PLAN_INTENT_REMOVE:       'plan-intent-remove',
PLAN_INTENT_LINK_BUCKET:  'plan-intent-link-bucket',
MIGRATION_INTENTS_V1:     'migration-intents-v1',
```

#### Failure modes + guardian rule that catches each

| Failure mode | What goes wrong | Catch |
|---|---|---|
| Renderer reads `S.tripDefs` directly post-migration | Stale shape, drift returns | Static rule `no-direct-legacy-plan-defs-read` — flag `S._legacyTripDefs` reads outside migration helpers |
| New writer bypasses `BRAIN.plan.intent.add` | Adds a fourth shape silently | Static rule `no-direct-intents-write` — `PLAN.intents.push / .splice / =` only in writer fn bodies |
| Source tag typo | Writer rejects at runtime, audit fires | `_SOURCE_SET` validation + Layer 2 runtime test "every BRAIN.SOURCES entry has matching _SOURCE_SET literal" |
| Migration runs twice | Idempotency via `S.seededV25` flag | Layer 2 runtime test "seedV25 idempotent — running twice produces no diff" |
| Migration loses data | Pre-migration snapshot enables rollback | Boot self-test: "BRAIN.plan.intent.list().length >= 1 if seedV25 ran" |

### 14.1 Phase 28.1 — Bug cleanup (the highway sweep)

Six fixes, all small, all touching code already audited.

| Bug | Fix | File:line |
|---|---|---|
| **B28-1** stale Ask AI toast | Replace L8369 toast string with `'Ask the AI — current plan context is included'` | `index.html:8369` |
| **B28-2** KIA Extra alert stub | Implement `openEditPaydayKiaExtra()` using `EDIT_MODAL.openCustom` mirroring `openEditPaydaySavings`. Replace L8818 `onTap` with the new opener. | new fn beside L8818; opener call updated |
| **B28-3** Go to Bills broken nav | Introduce `_paydayExitToTab(tabId)` helper (see §18). Replace all 2 occurrences of `closePaydayPlan(); goPage('pg-...')` inline. | new helper near L7758; call sites L8657 + L8825 |
| **B28-12** stale phase comment | Replace L8364-8366 comment with `// Routes to chat tab — chat system prompt embeds plan-context snapshot.` | L8364-8366 |
| **B28-15** orphan paydayUntick | Delete `paydayUntick` fn at L8471 (verified no callers). Future long-press untick wires through `BRAIN.plan.tickItem`/`untickItem` directly. | L8471 deletion |
| **B28-13** undo savings mirror | In `BRAIN.plan.undoLast`, for entries with `type === 'plan_override_set'` and `key.startsWith('savings:')`: after `clearOverride`, also `delete S.activePlan.savings[itemId]`. | BRAIN.plan.undoLast body |

#### Failure modes

| Failure | Catch |
|---|---|
| `_paydayExitToTab` forgets to close PLAN-mode shell | Layer 2 runtime test "after _paydayExitToTab('pg-cal'), no `.payday-active` and no `.plan-mode-active` classes remain on document" |
| KIA Extra editor diverges from openEditPaydaySavings shape | Static rule `payday-editors-must-use-EDIT_MODAL` — every `openEditPayday*` fn must call `EDIT_MODAL.openCustom` |
| Undo fix misses a code path | Boot self-test "undo of $X savings allocation reduces `snap.savings.total` by $X" |
| Stale phase comment regression | Static rule `no-stale-phase-message` (see §17) |

### 14.2 Phase 28.2 — PLAN-mode tile reorder (cosmetic, low risk)

Swap L17546 ↔ L17550 in `renderPlanMode`. Update inline tile-order comment to reflect §3.2 time-axis principle.

Failure mode: Layer V baseline mismatch — accept new baseline as the canonical PLAN-mode capture. Capture before AND after, store both in `slyght/visual-baselines/`.

### 14.3 Phase 28.3 — Savings sub-screen redesign (the biggest UX phase)

#### New components

```js
_paydayProgressBar(opts)
// opts: { saved, target, ghost, color, height, label }
// Renders: container div with two stacked spans:
//   <span class="pb-fill" style="width:Xpct;background:color"></span>
//   <span class="pb-ghost" style="width:Ypct;background:color-alpha"></span>
// Plain CSS (no SVG). 8px height by default. ghost segment animates in via
// CSS transition when opts.ghost > 0.
```

```js
_paydaySavingsRow(opts)
// Extends _paydayRow with an embedded _paydayProgressBar below the sub line.
// opts: { ...paydayRowOpts, saved, target, ghostThisCycle }
```

#### New render function

`renderPaydaySavings()` rewritten. Structure follows §5.1 mockup:

```
1. POOL TO ALLOCATE
   - _paydayProgressBar(saved: poolAllocated, target: poolTotal, color: amber)
   - "$XXX left to split across goals"

2. UPCOMING (intents where kind in ['provision', 'trip'] AND endDate < 90 days from now)
   - Sorted by endDate ASC
   - Each row: _paydaySavingsRow with ghostThisCycle showing override amount

3. LONG-TERM GOALS (intents where kind in ['goal', 'trip'] AND endDate > 90 days OR no endDate)
   - Sorted by % complete ASC (closer-to-done sinks lower? OR floats up? — confirm in §13.7 below)
   - Each row: _paydaySavingsRow

4. EXTRA DEBT
   - KIA Extra row — uses _paydaySavingsRow with target = current S.carloan balance
   - Tap → openEditPaydayKiaExtra (no more alert stub)
```

#### New BRAIN methods

```js
BRAIN.plan.getSnapshot()  // extended return
// .savings.byKind = { provisions: [...], trips: [...], goals: [...], buffer: [...] }
// .savings.byKind.provisions[i] = {
//   intentId, name, emoji, targetAmount, savedAmount, daysUntilDue,
//   thisCycleAmount, paceMatch: bool  // is current $/cycle on track to hit target?
// }
```

```js
BRAIN.plan.queryAllocationGhost(intentId, proposedAmount)
// Pure (no writes). Returns:
// { poolAfter, savedAfter, pctAfter, paceAfter, paceMatch, dailyLivingImpact }
// Used by the editor modal to show "if you allocate $X, here's what changes"
// without committing. Renderer reads this on every keystroke.
```

#### Failure modes

| Failure | Catch |
|---|---|
| Ghost segment doesn't clear after commit | Boot self-test "renderPaydaySavings produces 0 .pb-ghost elements with non-zero width when no override is pending" |
| Long-list perf (50+ intents) | Hard cap on Upcoming section: top 10 by deadline; "see all (N)" link below if more |
| Provisions render in BOTH Annual Provisions tile (deleted) AND Savings sub | Static rule `no-orphan-annual-provisions-tile` — `renderAnnualProvisions` must not be called from renderPlanMode after this phase |
| KIA Extra row uses different row helper than rest | Static rule `payday-rows-canonical` — `renderPayday*` body must call `_paydayRow` or `_paydaySavingsRow` for every row |
| Ghost calc reads stale override | `queryAllocationGhost` is pure; takes proposedAmount as arg, never reads from S.activePlan.overrides for this intent |

### 14.4 Phase 28.4 — Bills sub-screen + Annual Provisions folded in

#### Layout (per Q4 answer: paid below, collapsed)

```
1. UNPAID BILLS (this cycle)        ← top
2. ANNUAL PROVISIONS due this cycle  ← if any provision intents have a deadline this cycle
3. COLLAPSE STRIP                    ← bottom, collapsed
   "✓ 3 paid · $410 covered  [show]"
```

#### Provisions folded — the rule

For each `provision` intent: if `endDate` falls within current cycle (now → next payday), render it in Bills sub-screen alongside regular bills (with a 🚗 prefix to distinguish). The intent's `targetAmount` is the cycle's expected payment; tick → marks paid + draws from `bucketId`. Outside the cycle window the provision lives in Savings sub-screen Upcoming section.

This satisfies John's Q2: provisions feel like "essentials this cycle" when they're due, otherwise they're "future money allocations" in Savings. Same data; placement is deadline-driven, not surface-driven.

#### New component

```js
_paydayCollapseStrip(opts)
// opts: { label, count, total, defaultOpen, contentFn }
// Renders: a row that toggles content visibility on tap. Default collapsed.
// Header shows "✓ N paid · $X covered  [show]"; expanded shows contentFn().
// Internal state stored in component (not state machine) — closes again on
// next re-render unless user has explicitly opened.
```

#### Empty state

```
All bills covered for this cycle. 🎉
[show paid items ▼]
```

#### Failure modes

| Failure | Catch |
|---|---|
| Provision shows in BOTH Bills (deadline this cycle) AND Savings (Upcoming) | Static rule `no-intent-rendered-twice` — `_paydaySavingsRow` must not be called for same `intentId` in both renderPaydayBills and renderPaydaySavings within one render pass (runtime check on a shared render-set) |
| Collapse strip persists state across cycles | Component re-instantiates on each `renderPaydayBills` call → state resets naturally |
| Tick animation interrupts the write | Animate on the AFTER frame — `requestAnimationFrame` post BRAIN.plan.tickItem |

### 14.5 Phase 28.5 — Auto-allocate Full vs Remainder

#### New modal

```js
openPaydayAutoAllocateChoice()
// Three-button modal via EDIT_MODAL.openCustom:
//   - "Top up remainder" (highlighted default; routes to recommendAllocationRemainder)
//   - "Full plan (wipe edits)" (secondary; routes to recommendAllocationFull
//      with confirm step: "This will wipe your manual allocations this cycle.
//      A snapshot is taken so you can undo. Continue?")
//   - "Cancel"
```

#### New BRAIN methods

```js
BRAIN.plan.recommendAllocationRemainder(source)
// Existing behaviour, renamed from recommendAllocation. Returns
// { ok, applied: { itemId: amount }, poolBefore, poolAfter }.

BRAIN.plan.recommendAllocationFull(source)
// 1. SNAPSHOTS.take('pre-autoallocate-full')
// 2. For every existing override in S.activePlan.overrides: clearOverride()
// 3. Run remainder recommendation against fresh pool
// 4. Return same shape
// Audit log entry: { type: 'plan_autoallocate_full', prevSnapshotId, ... }
```

#### Default highlight rationale

Per Q3: "Top up remainder" is non-destructive. Full mode requires a confirm step on top of being non-default. Two gates before wiping work.

#### Failure modes

| Failure | Catch |
|---|---|
| Full mode wipes without snapshot | Boot self-test "BRAIN.plan.recommendAllocationFull writes a SNAPSHOTS entry before clearing" |
| User mashes Full → confirm: irreversible | The confirm dialog is the gate; SNAPSHOTS.restore is the recovery |
| Modal default differs from Q3 decision | Layer V baseline screenshot of modal — "Top up remainder" must have `.btn-primary` class |

### 14.6 Phase 28.6 — Empty states (Phase 8 spec gap)

Add a single empty-state branch to each of:
- `renderPaydayBills` (L8551-) — "All bills covered 🎉 [show paid below]"
- `renderPaydaySavings` (L8701-) — "Nothing to allocate. Add a goal or trip in PLAN mode."
- `renderPaydayUpcoming` (L8830-) — "No known upcoming items. Add one when something is on the horizon."
- `renderPaydayLiving` (L8868-) — "$X/day floor — tap to set."
- `renderPaydayDebts` (L8661-) — "All debts cleared." (rare but possible)

Failure mode: empty state itself throws → boot self-test confirms each sub-screen renders against an empty-S synthetic state.

### 14.7 Phase 28.7 — TDZ cleanup

Three offenders from yesterday's audit log:
- L1646 `BRAIN` access in onStateChange path firing before BRAIN init
- L11246 `_planScrollSavedY` accessed before declaration
- L13111 `PLAN` access before initialisation

Approach: read each site, identify the early-boot caller, either:
(a) move the declaration earlier in the file (preferred for `let`/`const` declared after the user — should always be possible to hoist by ~50 lines)
(b) guard the caller with `typeof X !== 'undefined' && X.method` (only when hoisting breaks ordering)

Failure mode: regress → new TDZ error in audit log on first 5s post-boot. Boot self-test entry: "Zero `boot_self_test_fail` entries with `Cannot access` substring within first 5s".

### 14.8 Phase 28.8 — Guardian additions

Three new static rules + three new Layer 2 structural checks + four new boot self-test entries. Full spec in §17.

---

## 15. Component & button pattern catalogue

Bundle 28 must REUSE these. New components only when the catalogue lacks a fit. The architectural promise of this catalogue: **a row that doesn't use `_paydayRow` is a bug.**

### 15.1 Canonical row helpers

| Helper | Location | Use when | Don't use when |
|---|---|---|---|
| `_paydayRow(opts)` | L8504 | Any tappable row in a Payday-canvas sub-screen | Settings rows (use `settings-edit-row` markup) |
| `_paydaySavingsRow(opts)` | **NEW Bundle 28** | Savings sub-screen rows that need progress bar | Bills/Debts rows (those don't show lifetime progress) |
| `_paydayProgressBar(opts)` | **NEW Bundle 28** | Anywhere a savings-pool, intent-progress, or pace bar is needed | Performance: don't put one inside every row of a 50+ list — cap at top 10 |
| `_paydayCollapseStrip(opts)` | **NEW Bundle 28** | Bills sub-screen paid items, future "see all" toggles | Modal content (modals already manage their own state) |
| `_paydayShellHeader(snap, kind)` | L8521 | Sub-screen top status line ("$X · N of M paid") | Anywhere outside a sub-screen body |

### 15.2 Canonical CSS classes (already in stylesheet)

| Class | What it does | Reuse where |
|---|---|---|
| `settings-edit-row` | Tappable row with chevron — 44×44 min target | Every editable row in canvas |
| `settings-pointer-row` | Footer "go-to-X" link row | New `_paydayExitToTab` helper calls render here |
| `settings-group-card` | Grouped row container with rounded corners | Wrap each `_paydayRow` group |
| `settings-group-title` | Section header above a group-card | Section labels (Upcoming, Long-term goals, etc.) |
| `settings-section-hint` | Subtle explanatory paragraph below title | Inline help text |
| `subscreen-back` | Back button (top-left of sub-screen) — 44×44 enforced | Each new sub-screen if any |
| `payday-active` | Slide-over visibility class on `#pg-payday-plan` | Set by openPaydayPlan; cleared by closePaydayPlan |
| `has-active-subscreen` | On `#pg-payday-plan` — scroll-locks the canvas root | Set on sub-screen open |

### 15.3 Modal openers

| Opener | Use for | Failure mode |
|---|---|---|
| `EDIT_MODAL.openCustom(opts)` | Any editable value (amount / text / picker) | Each call must pass `onSave` + `onCancel` — Layer 2 test "every EDIT_MODAL.openCustom invocation has both" |
| `EDIT_MODAL.openInfo(opts)` | Read-only explainer (the "what's this made of?" modal — see §19 P1) | Must NOT expose Save button — info-only |
| `PLAN_MODAL.btn(label, fn, isClose)` | Modal button construction inside legacy PLAN-modals | Bundle 28 prefers EDIT_MODAL for new modals |

### 15.4 Anti-patterns Bundle 28 must avoid

- `<button onclick="alert(...)">` — placeholder stubs. Static rule `payday-canvas-no-alert-stub` fires.
- `<a onclick="closePaydayPlan(); goPage(...)">` inline — must use `_paydayExitToTab(...)`. Static rule `no-nav-to-tab-without-stack-cleanup`.
- Direct `S.savingsBuckets[i].saved = ...` writes — must route through `BRAIN.savings.setBucketSaved`. Existing rule.
- Direct `PLAN.intents.push(...)` — must use `BRAIN.plan.intent.add`. New rule.
- New SOURCE strings inline (e.g. `BRAIN.audit.append({src: 'my-thing'})`) — must add to BRAIN.SOURCES enum. New Layer 2 test (see §17).

---

## 16. BRAIN naming conventions (architecture-enforcing)

This codifies how Bundle 28's new methods/sources are named, and why. **The naming is the architecture.** If the name doesn't fit the rules, the architecture isn't fitting either — pause and rethink.

### 16.1 Bubble names

- Singular noun, lowercase: `BRAIN.bills`, `BRAIN.debts`, `BRAIN.plan`, `BRAIN.config`
- NOT plural ("BRAIN.transactions" is wrong; "BRAIN.transaction" is right — the bubble OWNS the concept)
- NOT manager / service / handler suffix
- New bubble criteria: (a) ≥3 distinct canonical writers, (b) cross-cutting state that ≥2 surfaces read, (c) AI-readable concept boundary — "user can describe this bubble's job in one sentence"

Bundle 28 does NOT introduce a new bubble. `PLAN.intents` lives inside `BRAIN.plan` (already a bubble) under a sub-namespace `BRAIN.plan.intent`. Pattern matches `BRAIN.savings.bucket` precedent.

### 16.2 Method verbs

Limited vocabulary. Any new method must use one of these:

| Verb | Meaning | Example |
|---|---|---|
| `get` | Read one | `BRAIN.plan.intent.get(id)` |
| `list` | Read many (with filter) | `BRAIN.plan.intent.list({kind:'trip'})` |
| `set` | Replace a field | `BRAIN.config.setIncome(amt, src)` |
| `add` | Append to a collection | `BRAIN.plan.intent.add(intent, src)` |
| `update` | Patch one record | `BRAIN.plan.intent.update(id, patch, src)` |
| `remove` | Soft-delete one | `BRAIN.plan.intent.remove(id, src)` |
| `clear` | Wipe (entry / category) | `BRAIN.plan.clearOverride(cat, id, src)` |
| `record` | Append immutable event | `BRAIN.transaction.record(txn, src)` |
| `mark` | Status flag | `BRAIN.bills.markPaid(bill, src)` |
| `unmark` | Reverse a mark | `BRAIN.bills.unmark(key, src)` |
| `query` | Read computation (pure, no write) | `BRAIN.plan.queryAffordability(amount)` |
| `recommend` | Compute a suggested action | `BRAIN.plan.recommendAllocationFull(src)` |
| `apply` | Commit a previously-queried/recommended action | `BRAIN.plan.applyProposal(id, src)` |

Anything else needs explicit justification. `do*`, `handle*`, `process*`, `manage*` are banned by Layer 2 runtime test "no-imperative-verbs-on-BRAIN".

### 16.3 SOURCES tag shape

`{SURFACE}_{ACTION}_{TARGET}` — uppercase constant, kebab-case literal.

Examples:
- `PLAN_INTENT_ADD` → `'plan-intent-add'`
- `SETTINGS_INCOME_EDIT` → `'settings-income-edit'`
- `MIGRATION_INTENTS_V1` → `'migration-intents-v1'`

Rules:
- Constant must appear in BOTH `BRAIN.SOURCES` (Object.freeze) AND `BRAIN._SOURCE_SET` (Set). Layer 2 test "every-SOURCES-entry-in-SOURCE_SET" already exists implicitly through writer validation; we add an explicit Layer 1 rule (see §17.1.4).
- Literal must be kebab-case lowercase — no underscores, no PascalCase.
- New SOURCE per write site, not per writer fn (so a chat-driven intent edit uses `CHAT` source, not `PLAN_INTENT_UPDATE`).

### 16.4 Audit log entry shape

```js
{ type: 'plan_intent_set', intentId: 'china-2026', patch: {...}, src: 'plan-intent-update', ts: 1700000000 }
```

- `type` is snake_case past-tense ("plan_intent_set", not "setIntent" or "intent-set")
- `src` matches a `BRAIN._SOURCE_SET` literal
- `ts` is epoch ms
- Other fields per writer (intentId, amount, etc.)

This shape feeds AI context — the chat system prompt's "recent activity" digest reads audit entries. Consistent shape = consistent AI reasoning.

---

## 17. Guardian barriers — expanded catalogue

§9 sketched these; here's the full rule text with code-shape so Opus can drop them in.

### 17.1 Layer 1 static rules (new in Bundle 28)

#### 17.1.1 `no-stale-phase-message`
**Catches:** B28-1, B28-12 class. Strings like "coming Phase 7" / "Phase 6 candidate" that survive past the phase they reference.

**AST visitor pseudocode:**
```js
// Walk all string literals + template literals in the script body.
// Flag any matching: /Phase\s+\d+\s+(candidate|coming|lands)/i
// Allow-list: comments tagged // guardian-allow: no-stale-phase-message — <reason>
```
Severity: warn (becomes fail after one bundle's grace).

#### 17.1.2 `no-direct-intents-write`
**Catches:** Bypass of `BRAIN.plan.intent.add/update/remove`.

```js
// Flag: PLAN.intents.push(...) | .splice(...) | PLAN.intents = ...
// Exempt fn body set: { add, update, remove, load, seedV25_collapseIntents }
```
Severity: fail.

#### 17.1.3 `payday-canvas-no-alert-stub`
**Catches:** B28-2 class. `alert('... Phase X candidate ...')` or similar in Payday-canvas render fns.

```js
// Walk fn declarations whose name matches /^renderPayday/.
// Within each, flag any CallExpression where callee === 'alert' AND
// the first arg string contains /Phase\s+\d+\s+candidate/i.
```
Severity: fail.

#### 17.1.4 `every-SOURCES-entry-in-SOURCE_SET`
**Catches:** SOURCES constant added without the matching `_SOURCE_SET` literal — writer would reject at runtime.

```js
// Parse BRAIN.SOURCES Object.freeze keys + values; parse _SOURCE_SET literals.
// Diff. Either side missing → fail.
```
Severity: fail.

#### 17.1.5 `no-nav-to-tab-without-stack-cleanup`
**Catches:** B28-3 class. Inline `closePaydayPlan(); goPage(...);` patterns.

```js
// Walk all string literal onclick attrs in Payday-canvas render fns.
// Flag any matching /closePaydayPlan\(\)\s*;\s*goPage\(/  unless preceded
// by `_paydayExitToTab(` (so the helper IS the allowed pattern).
```
Severity: fail.

#### 17.1.6 `payday-rows-canonical`
**Catches:** Hand-rolled row markup in Payday-canvas renderers when `_paydayRow` / `_paydaySavingsRow` would do.

```js
// Within /^renderPayday/ fn bodies, count `_paydayRow(` + `_paydaySavingsRow(`
// calls vs. inline `<button class="settings-edit-row"` template literals.
// Inline markup that isn't routed through the helper → warn.
```
Severity: warn (educational — manual review on exception).

### 17.2 Layer 2 runtime structural checks (new)

Run in `guardian-runtime.js` against synthetic `TEST_S` after BRAIN init.

#### 17.2.1 "Payday Plan canvas wiring is intact" (extended from Bundle 27)
Verify the existing structural check still passes AND extend with:
- `BRAIN.plan.intent.add` callable
- `_paydayExitToTab` defined
- `openEditPaydayKiaExtra` defined (post Phase 28.1)

#### 17.2.2 "Every PLAN-mode root tile is reachable"
Render `renderPlanMode()` against TEST_S; assert each tile fn returns non-empty HTML AND has a unique container class. Catches accidental tile drop during reorders.

#### 17.2.3 "Every Go-to-X handler routes through _paydayExitToTab"
Grep rendered HTML from all `renderPayday*` calls; assert every `onclick` that mentions `goPage(` also mentions `_paydayExitToTab(` OR is in an allow-listed legacy site (none in Bundle 28).

#### 17.2.4 "Intents canonical — no duplicate names across kinds"
Post-seedV25, assert no name appears in `>1` intent record (case-insensitive). Catches incomplete migration.

#### 17.2.5 "Undo of plan_override_set leaves snapshot invariant"
Apply override → snapshot total → undoLast → re-snapshot → assert `total === pre-write total`. Catches B28-13 class.

### 17.3 Boot self-test additions

Append to the existing canary at L9450-ish:

```js
['BRAIN.plan.intent reachable', () => typeof BRAIN.plan.intent === 'object'
                                  && typeof BRAIN.plan.intent.add === 'function'],
['openEditPaydayKiaExtra reachable', () => typeof openEditPaydayKiaExtra === 'function'],
['openPaydayAutoAllocateChoice reachable', () => typeof openPaydayAutoAllocateChoice === 'function'],
['_paydayExitToTab reachable', () => typeof _paydayExitToTab === 'function'],
```

These run on every device load and surface in `Settings → Diagnostics → Activity Log` as `boot_self_test_fail` entries on regression — same pattern that caught Bundle 27's `savingsObj` typo within 30 min.

### 17.4 Allow-list discipline

Per `slyght_guardian_philosophy.md`: allow-blocks need justified reasons (migration / pre-BRAIN / canonical helper). **Never add to "make test pass."** When a Bundle 28 rule fires:
1. Is the rule wrong? Fix the rule.
2. Is the code wrong? Fix the code.
3. Is the code a justified exception? Add `// guardian-allow: <rule> — <reason> (removable when X)` with X being a concrete trigger (a future bundle, a state change, etc.).

---

## 18. "Go to Bills" root-cause trace

Read of the relevant code:

- `closePaydayPlan()` (L7758) — removes `payday-active` class from `#pg-payday-plan` AND `has-active-subscreen` AND any active sub-screen. **Does NOT close PLAN mode.**
- `goPage(id)` (L2836) — closes `.modal-overlay.open`, closes `.settings-subscreen.settings-active`, removes `.screen.active` from all `.screen` elements, sets target as active, calls `renderAll()`. **Does NOT close PLAN mode.**

PLAN mode is a slide-over panel separate from the tab-level `.screen` elements. Its visibility is governed by a different class (likely `.plan-mode-open` on the panel itself or on `<body>`). When the user taps "Go to Bills" inside the canvas:

1. `closePaydayPlan()` removes `payday-active` → the Payday canvas slides away
2. `goPage('pg-cal')` activates the Bills tab in the underlying tab stack AND fires `renderAll()`
3. **PLAN mode is still on top.** The user sees PLAN mode where they last were — which is the Trips section (Darwin trip).

So they're not actually "landing on Bills" — they're landing on PLAN mode root, scrolled to wherever they were before opening the canvas, with Bills tab quietly active underneath PLAN mode.

### Fix

Introduce `_paydayExitToTab(tabId)`:

```js
function _paydayExitToTab(tabId) {
  // 1. Close any open Payday sub-screen
  document.querySelectorAll('.payday-subscreen.payday-active')
    .forEach(s => s.classList.remove('payday-active'));
  // 2. Close the Payday Plan canvas
  closePaydayPlan();
  // 3. Close PLAN mode itself (the slide-over containing the canvas)
  if (typeof closePlanMode === 'function') {
    closePlanMode();
  } else {
    // Defensive fallback — toggle the known PLAN-mode class
    document.body.classList.remove('plan-mode-open');
    const pgPlan = document.getElementById('pg-plan');
    if (pgPlan) pgPlan.classList.remove('active');
  }
  // 4. Navigate to the target tab
  if (typeof goPage === 'function') goPage(tabId);
}
```

Then update the two call sites:
- L8657: `onclick="_paydayExitToTab('pg-cal')"` (Go to Bills)
- L8825: `onclick="_paydayExitToTab('pg-spend')"` (+ Add bucket)

### Validation gates

- Static rule §17.1.5 prevents future inline `closePaydayPlan(); goPage(...)` patterns
- Layer 2 §17.2.3 confirms every Go-to-X uses the helper
- Boot self-test §17.3 confirms `_paydayExitToTab` exists
- Manual phone walk in §11 confirms user lands on Bills tab, not on PLAN mode root

**Caveat:** I haven't read `closePlanMode` or located the exact class controlling PLAN-mode visibility. Ship-time first task is to confirm the class name. If `closePlanMode` doesn't exist, the helper's fallback handles it; either way the fix lands.

---

## 19. Interactive money-story principle (the design north star)

John's words: *"a smooth highway of information flowing in PLAN mode that makes sense and the user can play around with it and understand what's happening with his money and why instead of just being told and having static shit that doesn't work with me as a curious person who wants to understand."*

Translating that to design principles:

### P1 — Every number is tappable
Every dollar figure on screen taps to an "info modal" (`EDIT_MODAL.openInfo`) that shows *what it's made of*. Example: tap "$1,200 free this cycle" → modal shows `Income $2,400 − Bills $850 − Debts $250 − Daily Living $100 = $1,200`.

Implementation pattern:
```js
// Wrap any rendered $X in:
<span class="explorable" onclick="explainNumber('free-this-cycle')">$1,200</span>
```
Single `explainNumber(key)` dispatcher reads a registry of explanations. Each registry entry returns the breakdown HTML.

### P2 — Allocations show live ghost-vs-real delta
When the user types an amount in an editor, the underlying surface shows:
- The pool shrinks (ghost segment in pool progress bar)
- The intent grows (ghost segment in intent progress bar)
- Pace projection updates ("at this rate, ready by 12 Jul")
- Squeeze warning if daily-living would dip under floor

Implementation: `BRAIN.plan.queryAllocationGhost(intentId, proposedAmount)` (see §14.3) is pure and re-callable on every keystroke. The renderer wires `oninput` on the amount field.

### P3 — Time-frame zoom on the same number
A small chip cluster lets the user re-frame any aggregate:

```
[Today] [Cycle] [Month] [Quarter] [Year]
```

Tap "Year" on `$1,200 free this cycle` → `$28,800 free annualised`. Same canonical number, different frame. Implementation: a new `BRAIN.plan.frameAmount(value, frame)` pure helper that scales by cycles-per-frame.

### P4 — Audit log entries are user-readable
Today the audit log shows `{type:'plan_override_set', ...}` to devs. Bundle 28 adds a humanReadable formatter so the Diagnostics → Activity Log surfaces "You allocated $200 to China at 9:14 am" instead of JSON. Bundle 28 ships the formatter for new audit shapes; older types backfill in Bundle 29.

### P5 — Numbers don't lie — guardians catch divergence
If two surfaces show different numbers for the same concept, Layer 2 fires. §17.2 adds the structural checks for intents-canonical and undo-invariant. Future Bundle 29+ adds tile-coherence invariants per OPEN-BUGS #17.

### What this means for Bundle 28's scope

Phases 28.0-28.7 build the substrate (canonical intents, visual progress, modal patterns) that makes P1-P5 implementable. P1 (every number tappable) ships in Phase 28.3's Savings sub-screen redesign as the proof of concept; the `explorable` class becomes the gateway pattern Bundle 29 generalises to every tile.

The principle answers John's "play around and understand": every number is a question the user can ask. The answer is one tap away. The state is reversible. The story is told in the user's own choice of time frame.

---

## 20. Refined phased ship order

Per Q5 — pre-design first, then ship phases that are tightly scoped, each independently verifiable.

| Phase | Scope | Lines touched | Risk | Verify-by |
|---|---|---|---|---|
| **28.0** | `PLAN.intents` schema + writer + seedV25 migration + new SOURCES + legacy read-shims | BRAIN.plan extension, ~250 LOC new + ~80 LOC migration | Medium | Boot self-test "intents canonical"; Layer 2 idempotency test; phone walk confirms no regressions to existing Trips/Goals/Provisions rendering |
| **28.1** | Bug cleanup: B28-1,-2,-3,-12,-13,-15 — `_paydayExitToTab` helper, KIA Extra editor, undo savings mirror, stale toast/comment, orphan removal | ~6 fn signatures, ~150 LOC | Low | Manual phone walk per fix; B28-13 has a boot self-test |
| **28.2** | PLAN-mode tile reorder L17546↔L17550 | 2 lines + comment | Trivial | Layer V capture before/after |
| **28.3** | Savings sub-screen redesign — `_paydaySavingsRow`, `_paydayProgressBar`, new `renderPaydaySavings`, `BRAIN.plan.queryAllocationGhost`, KIA Extra editor wired | ~500 LOC + CSS for progress bars | High | Pre-screenshot every flow; new boot self-tests; phone walk on Savings sub-screen for each kind (trip / goal / provision / KIA extra) |
| **28.4** | Bills sub-screen — unpaid first, provisions-due-this-cycle inline, paid items collapse strip below | `renderPaydayBills` + `_paydayCollapseStrip` ~200 LOC | Medium | Boot self-test "no intent rendered twice"; Layer V baseline |
| **28.5** | Auto-allocate Full/Remainder choice modal + snapshot-before-Full | New modal + 2 BRAIN methods ~120 LOC | Medium | Boot self-test "snapshot recorded before Full"; manual confirm-dialog walk |
| **28.6** | Empty states across 5 sub-screens | ~40 LOC | Low | Boot self-test each sub-screen renders against empty TEST_S |
| **28.7** | TDZ cleanup (L1646 / L11246 / L13111) | ~3 declarations moved | Low | Boot self-test "zero Cannot access errors in first 5s" |
| **28.8** | Guardian additions — 6 static rules + 5 Layer 2 checks + 4 boot self-test entries | guardian-static.js + guardian-runtime.js + boot self-test block | Low | Each rule has a test fixture; `npm run guardian-static && npm run guardian-runtime` green |
| *(deferred)* | Phase-7 worker crons | CF Worker repo | — | Bundle 29 candidate |
| *(deferred)* | `getGenuineSurplus` consolidation | Cross-file | Medium | Bundle 29 candidate |
| *(deferred)* | P1-P3 generalisation beyond Savings sub-screen | Cross-surface | — | Bundle 29 candidate |

### Why this order

- **28.0 first** — every downstream phase reads through `BRAIN.plan.intent.list(...)`. Shipping the substrate before the UX prevents double-wiring.
- **28.1 immediately after** — fast visible wins. KIA Extra and Go-to-Bills are user-facing pain points that should clear before the bigger redesign so John can phone-walk a clean canvas.
- **28.2 trivial** — bundle with 28.1 if convenient.
- **28.3 third** — biggest UX phase; ships only after 28.0's intents are stable.
- **28.4-28.7 incremental polish** — each can ship independently.
- **28.8 last** — guardian rules need real code to enforce. Shipping rules before the code they protect = false negatives.

### Regression-protection cadence (per §11)

Each phase: pre-screenshot affected surfaces → ship → Layer V re-capture → audit-log diff → manual phone walk → if clean, proceed to next phase. Per `slyght_audit_before_shape_change.md`, Phase 28.0's seedV25 gets the 8-grep audit before ship.

---

## 21. Next step

This doc is now the engineering pre-design for Bundle 28. From here:
1. John reviews — flags anything that doesn't match intent.
2. I convert to `CLAUDE-CODE-SHIP-PROMPT-28.md` — the executable spec for Opus, phase-by-phase, with the literal code shapes from §14 baked in as ship instructions.
3. Phase 28.0 ships first as a standalone PR (migration + intents writer + back-compat shims) so John can phone-verify nothing breaks before the bigger UX phases land.

— end MISSION-BUNDLE-28-PLAN-MODE-DEEP-DIVE.md —
