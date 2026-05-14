# CLAUDE-CODE-SHIP-PROMPT-28.md — Bundle 28: Plan-Mode Deep Dive

> **Audience:** Claude Code (Opus 4.7 in slyght/ working dir).
> **Author of this spec:** Claude Code Opus 4.7, 2026-05-13.
> **Lineage:** Synthesises `MISSION-BUNDLE-28-PLAN-MODE-DEEP-DIVE.md` + `AUDIT-A1-2026-05-13.md` + `REWRITE-COMPARISON-2026-05-13.md` + pilot at `experiments/savings-subscreen-v2.js` into an executable ship plan.
> **Bundle ID:** 28
> **Builds on:** Bundle 27 (Payday Plan canvas + BRAIN.plan).

---

## 0. Read before you ship

Before opening `index.html`, read these in order:

1. `slyght/MISSION-BUNDLE-28-PLAN-MODE-DEEP-DIVE.md` — full scope + UX redesign + theme-overlap map (§1-§20)
2. `slyght/AUDIT-A1-2026-05-13.md` — 6-lens structural audit findings; this bundle absorbs root causes #1 and #2
3. `slyght/REWRITE-COMPARISON-2026-05-13.md` — direct-replacement candidates (§3) + layer audit synthesis (§5)
4. `slyght/experiments/savings-subscreen-v2.js` — **canonical reference impl for Phase 28.3**. Code lifts almost verbatim from here. Do NOT re-derive; port.
5. `slyght/experiments/invariants/*.json` — declarative invariant samples (NOT shipped this bundle; Bundle 30 target)
6. `slyght/ARCHITECTURE.md` — current canonical-writer pattern + 11 BRAIN bubbles
7. Auto-memory entries: `slyght_bundle_27_shipped.md`, `slyght_bundle_28_scoped.md`, `slyght_audit_a1_2026_05_13.md`, `slyght_rewrite_pilot_2026_05_13.md`, `slyght_per_bundle_discipline.md`, `slyght_audit_before_shape_change.md`, `slyght_edit_discipline_audit_first.md`

---

## 1. Hard constraints

1. **Single file.** All shipped code lives in `slyght/index.html`. No new top-level JS files. `experiments/` exists for reference only — DO NOT load it from `index.html`.
2. **Read bytes before each edit.** Per `slyght_edit_discipline_audit_first.md` — `Read` the relevant lines, then ONE atomic `str_replace` per logical change. No intermediate `_OBSOLETE_*` placeholders.
3. **Audit shape-readers before any shape change.** Per `slyght_audit_before_shape_change.md` — for Phase 28.0 (intents migration), grep all readers of `S.savingsBuckets`, `PLAN.trips`, `PLAN.goals`, `PLAN.getAnnualProvisions` BEFORE writing the migration. Document the grep results inline in the seedV25 commit.
4. **Three-layer guard discipline.** Every new write path takes a `source` arg validated against `_SOURCE_SET`. Every entity-class mutation logs to `BRAIN.audit`. Adding to `BRAIN.SOURCES` requires matching `_SOURCE_SET` literal (Layer 2 will assert this — Phase 28.8).
5. **Pre-ship snapshot before any seed migration.** `SNAPSHOTS.take('pre-seedV25-intents')` runs FIRST inside the migration body — before any mutation.
6. **Phone-walk between phases.** This is multi-phase. After each Phase ships and commits, John phone-verifies before next phase starts. No batched ship.
7. **No new BRAIN bubble.** PLAN.intents lives inside `BRAIN.plan` as `BRAIN.plan.intent` sub-namespace. Mirrors `BRAIN.savings.bucket` precedent.

---

## 2. Pre-ship audit checklist (STOP gate)

Run this before Phase 28.0 commits. Output as a comment block in the commit body OR a transient file `slyght/audit/bundle-28-prereqs.json` that gets removed after ship.

```
[ ] Grep S.savingsBuckets readers — list each file:line + intent
[ ] Grep PLAN.trips readers — list each file:line + intent
[ ] Grep PLAN.goals readers — list each file:line + intent
[ ] Grep PLAN.getAnnualProvisions readers — list each file:line + intent
[ ] Grep S.tripDefs / S.goalDefs direct accesses
[ ] Verify save() shape contract preserved
[ ] Verify snapshot replay path compatible
[ ] Verify AI chat context export reads via getSnapshot, not raw S
```

If any reader is incompatible with the back-compat shims, **STOP** and surface to John before continuing.

---

## 3. Bug bundle (for context)

Every bug landed by this bundle is listed in `MISSION-BUNDLE-28-PLAN-MODE-DEEP-DIVE.md §1`. Quick reference:

| ID | Bug | Lands in Phase |
|---|---|---|
| B28-1 | Stale "Ask AI" toast | 28.0.1 |
| B28-2 | KIA Extra editor stub | 28.0.1 |
| B28-3 | "Go to Bills" routes to Darwin Trips | 28.0.1 |
| B28-4 | PLAN tile order — Payday Plan below WRX | 28.2 |
| B28-5 | Auto-allocate remainder-only | 28.5 |
| B28-6 | Bills sub-screen shows paid inline | 28.4 |
| B28-7 | Savings sub-screen — split, wrong refs, no progress | 28.3 |
| B28-8 | China duplication | 28.0 |
| B28-9 | Annual Provisions should fold into Savings flow | 28.4 (deadline-driven placement) |
| B28-10 | Theme overlap (NRMA / Teachers Health / Rego / Green Slip) | 28.0 (intents canonicalisation) |
| B28-11 | Empty states missing on Bills / Savings / Upcoming | 28.6 |
| B28-12 | Stale Phase 6 comment | 28.0.1 |
| B28-13 | Undo savings leaves stale mirror (carry-over from 27) | 28.0.1 |
| B28-14 | TDZ errors L1646 / L11246 / L13111 | 28.7 |
| B28-15 | Orphan `paydayUntick` at L8471 | 28.0.1 |
| B28-16 | Duplicate surplus calc (legacy + canonical) | Bundle 29 (deferred) |
| B28-17 | Phase-7 worker crons | Bundle 29 (deferred — needs CF Worker repo) |

---

## 4. Phase 28.0 — Backend prereq: `PLAN.intents` canonical entity

**Goal:** introduce the canonical entity that collapses China-as-3-records and the NRMA / Teachers Health / Rego / Green Slip cross-surface overlaps. Pure backend — no UI changes this phase.

### 4.1 What ships

- `S.planIntents = []` schema field (initialised by load() if missing)
- `BRAIN.plan.intent` sub-namespace with full writers — port verbatim from `experiments/savings-subscreen-v2.js §1` (the file is the canonical reference)
- 5 new `BRAIN.SOURCES`:
  - `PLAN_INTENT_ADD: 'plan-intent-add'`
  - `PLAN_INTENT_UPDATE: 'plan-intent-update'`
  - `PLAN_INTENT_REMOVE: 'plan-intent-remove'`
  - `PLAN_INTENT_LINK_BUCKET: 'plan-intent-link-bucket'`
  - `MIGRATION_INTENTS_V1: 'migration-intents-v1'`
  - Both `SOURCES` enum AND `_SOURCE_SET` literal must include each. Layer 1 rule in Phase 28.8 will enforce.
- `seedV25_collapseIntents` migration — gated by `S.seededV25`. Algorithm in MISSION doc §14.0.
- Back-compat shims:
  - `PLAN.getTrips = () => BRAIN.plan.intent.byKind('trip').map(_intentToLegacyTripShape)`
  - `PLAN.getGoals = () => BRAIN.plan.intent.byKind('goal').map(_intentToLegacyGoalShape)`
  - `PLAN.getAnnualProvisions = () => BRAIN.plan.intent.byKind('provision').map(_intentToLegacyProvisionShape)`
  - Mapper helpers `_intentToLegacy*Shape` preserve every field the legacy callers read.

### 4.2 Migration algorithm

1. `SNAPSHOTS.take('pre-seedV25-intents')`
2. Build name-cluster map (case-insensitive trimmed) over `S.savingsBuckets[].name`, `S.tripDefs[].name`, `S.goalDefs[].name`, and the 5 hardcoded AnnualProvisions entries.
3. For each unique name, pick dominant record (priority: trip > goal > bucket; date-bound wins).
4. Create one intent per name-cluster. Link `bucketId` to the matching bucket (create bucket if none exists — sinking funds need a money pile).
5. Drop legacy `S.tripDefs` / `S.goalDefs` into `S._legacyTripDefs` / `S._legacyGoalDefs` (preserved for one bundle).
6. Set `S.seededV25 = true`.
7. `save()`.

### 4.3 Failure modes + guards

| Failure | Guard |
|---|---|
| Renderer reads `S.tripDefs` directly post-migration | Static rule `no-direct-legacy-plan-defs-read` (Phase 28.8) |
| New writer bypasses `BRAIN.plan.intent.add` | Static rule `no-direct-intents-write` (Phase 28.8 — schema at `experiments/invariants/no-direct-intents-write.json`) |
| Source tag missing from `_SOURCE_SET` | Layer 2 runtime test (Phase 28.8) |
| Migration runs twice | `S.seededV25` flag + Layer 2 test "seedV25 idempotent" |
| Migration loses data | Pre-migration snapshot enables rollback |

### 4.4 Verification gate

- Layer 2 test added: "seedV25 idempotent — running twice produces no diff"
- Boot self-test entry: `'BRAIN.plan.intent reachable'` per Phase 28.8 §17.3
- Manual phone walk: open PLAN mode, verify existing Trips / Goals / Provisions still render correctly. They should be byte-identical to pre-migration because the back-compat shims preserve the legacy shape.

### 4.5 Commit

```
bundle 28 phase 0: PLAN.intents canonical entity + seedV25 migration

introduces BRAIN.plan.intent.* writer surface. seedV25 collapses
duplicate entities (china, nrma, teachers health, rego, green slip)
into a single intents list. back-compat shims preserve legacy
PLAN.getTrips/getGoals/getAnnualProvisions reads. no UI changes.
```

---

## 5. Phase 28.0.1 — Hygiene quick wins (independent of intents migration)

**Goal:** seven small fixes that ship together. Each is 1-50 LOC. Independent of 28.0; can ship same day or in parallel.

### 5.1 What ships

| # | Fix | File:Line |
|---|---|---|
| 1 | B28-1 — stale Ask AI toast string | `index.html:8369` |
| 2 | B28-12 — stale Phase 6 comment | `index.html:8364-8366` |
| 3 | B28-15 — delete orphan `paydayUntick` | `index.html:8471` |
| 4 | `_paydayExitToTab(tabId)` helper — port from `experiments/savings-subscreen-v2.js §8`; place near `closePaydayPlan` (L7758) | new helper after L7791 |
| 5 | B28-3 — update 2 call sites to use helper | L8657 + L8825 |
| 6 | B28-2 — `openEditPaydayKiaExtra()` — port from `experiments/savings-subscreen-v2.js §7`; place near `openEditPaydaySavings` | new fn + L8818 onTap update |
| 7 | B28-13 — fix undo savings mirror — in `BRAIN.plan.undoLast`, for entries where `type === 'plan_override_set'` and key starts with `'savings:'`, also `delete S.activePlan.savings[itemId]` after `clearOverride` |

### 5.2 Verification

- After each fix, run guardian-static + grep for the bug pattern to verify it doesn't reappear.
- Phone walk: tap "Go to Bills" → confirm lands on Bills tab (not Darwin Trips). Tap KIA Extra row → confirm editor opens. Allocate $200 to savings → undo → confirm pool restores fully.

### 5.3 Commit

```
bundle 28 phase 0.1: hygiene quick wins (7 fixes)

- B28-1: replace stale Ask AI toast string
- B28-2: replace KIA Extra alert stub with real editor
- B28-3: introduce _paydayExitToTab helper, fix Go to Bills nav
- B28-12: replace stale Phase 6 comment
- B28-13: undoLast clears stale .savings mirror
- B28-15: delete orphan paydayUntick fn
```

---

## 6. Phase 28.0.5 — Cross-tile metric canonicalisation

**Goal:** close cross-tile metric divergence (Audit A1 root cause #2). Five high-impact renderers migrate to consume `MODEL.todaySpent` / `BRAIN.summary.total`.

### 6.1 What ships

Migrate 5 renderers off inline `S.txns.filter(...)`:

| Renderer | Current location | Target API |
|---|---|---|
| `renderTrend` | L5060 | `BRAIN.summary.byCategory(range)` |
| `renderCatBreakdown` | L5074 | `BRAIN.summary.byCategory(range)` |
| `renderCutSliders` | L5005 | `BRAIN.summary.byCategory({range: 'cycle'})` |
| Dashboard pace tile | L3174 | `MODEL.todaySpent` + `MODEL.recentPace` |
| Footer `updatePersistentStrip` | grep `updatePersistentStrip` | `MODEL.todaySpent` |

For each migration:
1. Read current inline filter.
2. Identify equivalent canonical helper (most exist; if missing, add to `BRAIN.summary`).
3. Replace inline read.
4. Verify numerical equivalence on `state-snapshot.json` fixture.

### 6.2 New Layer 1 static rule (also Phase 28.8 target)

`cross-tile-metric-canonical` — bans inline `S.txns.filter(...)` outside `TXNS_FILTER_HELPERS` set (already exists in guardian-static.js). Add to the rule catalog.

### 6.3 Failure modes

| Failure | Guard |
|---|---|
| Migrated renderer produces different value than pre-migration | Layer 2 test asserts equivalence on fixture |
| New `S.txns.filter` site added | New Layer 1 rule |
| Numerical drift on real John state | Manual phone walk: compare footer / dashboard / Analysis "spent today" — all three must agree |

### 6.4 Verification

Closes OPEN-BUGS #6, #8, #12, #15, #17 simultaneously. Phone walk must confirm cross-tile coherence.

### 6.5 Commit

```
bundle 28 phase 0.5: cross-tile metric canonicalisation

migrate 5 renderers (renderTrend, renderCatBreakdown, renderCutSliders,
dashboard pace tile, footer persistent strip) to consume MODEL.todaySpent
and BRAIN.summary.byCategory. closes cross-tile divergence (audit A1
root cause #2). adds Layer 1 rule cross-tile-metric-canonical.
```

---

## 7. Phase 28.1 — Bug cleanup (remaining)

Most bugs landed in 28.0.1. Phase 28.1 catches any residual carry-over found during 28.0 / 28.0.1 phone walks. Often this phase is empty; commit it anyway as a checkpoint.

If empty, skip and renumber subsequent phases.

---

## 8. Phase 28.2 — PLAN-mode tile reorder

**Goal:** B28-4. Payday Plan tile above WRX tile in PLAN mode root.

### 8.1 What ships

In `renderPlanMode` (L17496):
1. Swap L17546 (`renderWrxCard()`) with L17550 (`renderAllocateTile()`)
2. Update the inline tile-order comment to reflect the new time-axis principle (per MISSION doc §3.2)

### 8.2 Verification

- Layer V capture before + after; new baseline accepted.
- Phone walk: open PLAN mode, confirm Payday Plan tile is now second (after Net Worth header, before WRX).

### 8.3 Commit

```
bundle 28 phase 2: PLAN tile reorder — payday plan above WRX (B28-4)
```

---

## 9. Phase 28.3 — Savings sub-screen redesign (biggest UX phase)

**Goal:** B28-7. Port the pilot from `experiments/savings-subscreen-v2.js` into `index.html`.

### 9.1 What ships — port from experiments/

The pilot file is the **canonical reference**. Port these sections in order:

| Pilot §  | Lands in index.html as |
|---|---|
| §3 `_paydayProgressBar(opts)` | new helper after `_paydayRow` (L8504) |
| §4 `_paydaySavingsRow(opts)` | new helper after `_paydayProgressBar` |
| §6 `renderPaydaySavings_v2` body | **replace** L8701-8827 (the existing `renderPaydaySavings`) |
| §2 `BRAIN.plan.queryAllocationGhost(intentId, proposedAmount)` | new method on BRAIN.plan |
| §9 `explainNumber(key)` + `NUMBER_EXPLAINERS` registry | new global function + registry object |
| `openEditPaydayIntent(intentId)` | new modal opener — pattern matches existing `openEditPaydaySavings`, but operates on intent + queries `queryAllocationGhost` on every keystroke |

### 9.2 CSS additions

`_paydayProgressBar` uses inline styles in the pilot. For ship, lift the styles into a stylesheet rule block near the existing `.payday-*` rules:

```css
.pb-container { position:relative;width:100%;height:8px;background:var(--bg3);border-radius:4px;overflow:hidden;margin:4px 0; }
.pb-fill { position:absolute;left:0;top:0;height:100%;background:var(--green);transition:width 0.3s ease-out; }
.pb-ghost { position:absolute;top:0;height:100%;background:var(--green);opacity:0.4;transition:width 0.15s ease-out; }
.pb-label { font-size:11px;color:var(--text3);margin-top:2px; }
.explorable { cursor:pointer;border-bottom:1px dotted var(--text3); }
```

### 9.3 Annual Provisions placement (deadline-driven)

Per MISSION doc §14.4: provisions follow deadline, not surface. For each `provision` intent:
- If `endDate` falls within current cycle (now → next payday): renders in **Bills sub-screen** (Phase 28.4) with 🚗 prefix
- Otherwise: renders in **Savings sub-screen Upcoming** section

Remove `renderAnnualProvisions` tile from `renderPlanMode` (L17560). Add a static rule `no-orphan-annual-provisions-tile` in Phase 28.8.

### 9.4 Failure modes

| Failure | Guard |
|---|---|
| Ghost segment persists after commit | Boot self-test "renderPaydaySavings produces 0 .pb-ghost elements with non-zero width when no override pending" |
| Long-list perf (>50 intents) | Hard cap on Upcoming section: top 10 by deadline; "see all (N)" link below |
| Provision rendered in both Bills + Savings | Static rule `no-intent-rendered-twice` (Phase 28.8) |
| KIA Extra row uses non-canonical helper | Static rule `payday-rows-canonical` (Phase 28.8) |
| Ghost calc reads stale override | `queryAllocationGhost` is pure; takes `proposedAmount` as arg, never reads `S.activePlan.overrides[intent]` for the intent being queried |

### 9.5 Verification

- Boot self-test for ghost-cleanup invariant
- Layer V capture: new baseline for `payday-savings-*` surfaces
- Phone walk: edit a savings allocation → live ghost bar shrinks pool / grows intent / shows pace projection / shows squeeze warning if floor breached

### 9.6 Commit

```
bundle 28 phase 3: savings sub-screen redesign

ports the pilot from experiments/savings-subscreen-v2.js. introduces
_paydayProgressBar + _paydaySavingsRow + queryAllocationGhost +
explainNumber registry. annual provisions fold in by deadline (within
cycle → Bills sub; otherwise → Savings Upcoming section). drops the
PLAN-mode annual-provisions tile.
```

---

## 10. Phase 28.4 — Bills sub-screen "what's left to cover"

**Goal:** B28-6 + B28-9 (provision fold-in). Unpaid bills first; paid items collapsed below; provisions due this cycle inline.

### 10.1 What ships

In `renderPaydayBills` (L8551-8659):
1. Reorder: render unpaid bills first (top), provisions-due-this-cycle inline (with 🚗 prefix), then collapse strip with paid items (bottom, collapsed by default)
2. `_paydayCollapseStrip(opts)` helper — port from `experiments/savings-subscreen-v2.js §5`
3. Empty-state branch: "All bills covered for this cycle. 🎉 [show paid items]"

### 10.2 Provision fold-in logic

```js
// In renderPaydayBills, after gathering this-cycle bills:
const provisionsDue = BRAIN.plan.intent.byKind('provision')
  .filter(i => i.endDate &&
    new Date(i.endDate) > new Date() &&
    new Date(i.endDate) < snap.nextPaydayDate);
// Render provisionsDue rows alongside bills, with intent.emoji prefix.
```

### 10.3 Failure modes

| Failure | Guard |
|---|---|
| Collapse state persists across cycles | Component re-instantiates on each `renderPaydayBills` call → state resets naturally |
| Provision shows in BOTH Bills + Savings | Static rule `no-intent-rendered-twice` (Phase 28.8) |
| Tick animation interrupts write | Animate on AFTER frame (`requestAnimationFrame` post `BRAIN.plan.tickItem`) |

### 10.4 Verification

Phone walk: confirm unpaid bills first, paid collapse-strip at bottom, "show paid items" expands inline. Tick a bill → row animates into the collapsed strip.

### 10.5 Commit

```
bundle 28 phase 4: bills sub-screen redesign

unpaid bills first, provisions-due-this-cycle inline, paid items in
collapsed strip at bottom. _paydayCollapseStrip helper introduced.
empty-state branch added.
```

---

## 11. Phase 28.5 — Auto-allocate Full vs Remainder

**Goal:** B28-5. Two-mode auto-allocate with safer default.

### 11.1 What ships

- `openPaydayAutoAllocateChoice()` — new modal via `EDIT_MODAL.openCustom`:
  - **Top up remainder** (highlighted default — safer)
  - **Full plan (wipe edits)** — secondary; confirm step "This will wipe your manual allocations this cycle. A snapshot is taken so you can undo. Continue?"
  - **Cancel**
- `BRAIN.plan.recommendAllocationRemainder(source)` — existing behaviour, renamed from `recommendAllocation`
- `BRAIN.plan.recommendAllocationFull(source)`:
  1. `SNAPSHOTS.take('pre-autoallocate-full')`
  2. For every entry in `S.activePlan.overrides`: `clearOverride(...)`
  3. Run remainder recommendation against fresh pool
  4. Returns same shape as remainder mode
  - Audit entry: `{type: 'plan_autoallocate_full', prevSnapshotId, ...}`
- 2 new `BRAIN.SOURCES`:
  - `PLAN_AUTOALLOCATE_FULL: 'plan-autoallocate-full'`
  - `PLAN_AUTOALLOCATE_REMAINDER: 'plan-autoallocate-remainder'`

### 11.2 Update existing auto-allocate button

Replace single-action handler with `onclick="openPaydayAutoAllocateChoice()"`.

### 11.3 Failure modes

| Failure | Guard |
|---|---|
| Full mode wipes without snapshot | Boot self-test "BRAIN.plan.recommendAllocationFull writes a SNAPSHOTS entry before clearing" |
| User mashes Full → irreversible | Confirm dialog is the gate; SNAPSHOTS.restore is recovery |
| Modal default differs from Q3 decision | Layer V baseline screenshot — "Top up remainder" must have `.btn-primary` class |

### 11.4 Verification

Phone walk: open modal → confirm "Top up remainder" highlighted default → run Remainder → verify partial allocation → reset → run Full → confirm snapshot taken (visible in Settings > Snapshots) → undo restores state.

### 11.5 Commit

```
bundle 28 phase 5: auto-allocate full vs remainder modes (B28-5)
```

---

## 12. Phase 28.6 — Empty states

**Goal:** B28-11. Each Payday sub-screen gets an empty-state branch.

Add to:
- `renderPaydayBills` — "All bills covered 🎉 [show paid below]"
- `renderPaydaySavings` — handled in Phase 28.3 already (pilot includes this)
- `renderPaydayUpcoming` (L8830) — "No known upcoming items. Add one when something is on the horizon."
- `renderPaydayLiving` (L8868) — "$X/day floor — tap to set."
- `renderPaydayDebts` (L8661) — "All debts cleared." (rare but possible)

### 12.1 Verification

Boot self-test: each sub-screen renders without throwing against an empty-S synthetic state. Add 5 entries to the self-test catalog.

### 12.2 Commit

```
bundle 28 phase 6: empty states for all 5 payday sub-screens (B28-11)
```

---

## 13. Phase 28.7 — TDZ cleanup

**Goal:** B28-14. Eliminate three audit-log noise sources.

### 13.1 What ships

Three sites:
- L1646 — `BRAIN` access before initialisation
- L11246 — `_planScrollSavedY` access before declaration
- L13111 — `PLAN` access before initialisation

For each:
1. Read context around the site
2. Identify the early caller
3. Prefer **hoist the declaration** (move `let X = ...` / `const X = ...` earlier in file)
4. If hoisting breaks ordering, guard the caller: `if (typeof X !== 'undefined' && X.method) { ... }`

### 13.2 Verification

Boot self-test new entry: "Zero `boot_self_test_fail` entries with `Cannot access` substring within first 5s post-boot."

Phone walk: refresh app, check Settings > Diagnostics > Activity Log → zero new TDZ errors in past 5 seconds.

### 13.3 Commit

```
bundle 28 phase 7: TDZ cleanup at L1646 / L11246 / L13111 (B28-14)
```

---

## 14. Phase 28.8 — Guardian additions

**Goal:** lock in the rules + tests that catch every class of bug this bundle's predecessors hit.

### 14.1 New Layer 1 static rules (6)

Add to `guardian-static.js` RULES array. For each, the full AST visitor spec + test fixtures + allow-list contexts are in `MISSION-BUNDLE-28-PLAN-MODE-DEEP-DIVE.md §17.1`. Names + scope:

1. `no-stale-phase-message` — flag string literals `/Phase\s+\d+\s+(candidate|coming|lands|stub)/i`. Schema in `experiments/invariants/no-stale-phase-string.json`. Severity: warn.
2. `no-direct-intents-write` — `S.planIntents.push/splice/=` only inside writer fn bodies. Schema in `experiments/invariants/no-direct-intents-write.json`. Severity: fail.
3. `payday-canvas-no-alert-stub` — `alert('...Phase')` in `renderPayday*` fn bodies. Severity: fail.
4. `every-SOURCES-entry-in-SOURCE_SET` — diff `BRAIN.SOURCES` keys against `_SOURCE_SET` literals. Severity: fail.
5. `no-nav-to-tab-without-stack-cleanup` — inline `closePaydayPlan(); goPage(...)` patterns must route through `_paydayExitToTab(...)`. Severity: fail.
6. `payday-rows-canonical` — `renderPayday*` fns must use `_paydayRow` / `_paydaySavingsRow` for every row. Severity: warn.
7. `cross-tile-metric-canonical` — already added in Phase 28.0.5, restated here for inventory.

Add allow-list entries to `slyght/audit/allow-list.json` only where existing legacy code must be sanctioned during the bundle. **Never** add allow-list entries to make tests pass — fix the code per `slyght_guardian_philosophy.md`.

### 14.2 New Layer 2 runtime structural checks (5)

Add to `guardian-runtime.js`:

1. **"Payday Plan canvas wiring is intact"** (extended from Bundle 27 — add intents wiring + `_paydayExitToTab` defined + `openEditPaydayKiaExtra` defined)
2. **"Every PLAN-mode root tile is reachable"** — render `renderPlanMode()` against TEST_S; assert each tile fn returns non-empty HTML AND has a unique container class
3. **"Every Go-to-X handler routes through `_paydayExitToTab`"** — grep rendered HTML from all `renderPayday*` calls; assert every `onclick` mentioning `goPage(` also mentions `_paydayExitToTab(`
4. **"Intents canonical — no duplicate names across kinds"** — post-seedV25, assert no name appears in >1 intent record (case-insensitive)
5. **"Undo of plan_override_set leaves snapshot invariant"** — apply override → snapshot total → undoLast → re-snapshot → assert `total === pre-write total`

### 14.3 Boot self-test additions (4)

Extend the canary at L9450+ with:

```js
['BRAIN.plan.intent reachable',
  () => typeof BRAIN.plan.intent === 'object' && typeof BRAIN.plan.intent.add === 'function'],
['openEditPaydayKiaExtra reachable',
  () => typeof openEditPaydayKiaExtra === 'function'],
['openPaydayAutoAllocateChoice reachable',
  () => typeof openPaydayAutoAllocateChoice === 'function'],
['_paydayExitToTab reachable',
  () => typeof _paydayExitToTab === 'function'],
```

### 14.4 Verification

Run `npm run guardian-static && npm run guardian-runtime && npm run visual` — all gates green before commit.

### 14.5 Commit

```
bundle 28 phase 8: guardian additions (6 static + 5 runtime + 4 boot self-test)

closes the rule classes that caught B28-1, B28-3, B28-13, the cross-tile
divergence (audit A1 root cause #2), and the future intents-canonical
enforcement.
```

---

## 15. Phase 28.9 — Retro + memory + ARCHITECTURE update

**Goal:** close-out hygiene. No code changes.

### 15.1 What ships

1. `slyght_bundle_28_shipped.md` memory entry (template below)
2. `slyght_bundle_28_open_bugs.md` memory entry (carry-overs to Bundle 29)
3. Update `slyght/ARCHITECTURE.md`:
   - §4 BRAIN bubble table — add `BRAIN.plan.intent` sub-namespace under `BRAIN.plan`
   - §11 GAPs — mark Bundle 16.5 (BRAIN.assets), 18 (PLAN bubble) — PLAN bubble is now mostly shipped via Bundle 27 + 28
   - §13 Roadmap — replace with the revised sequence: 28 → 23 → 29 → 19/20 → 30
4. Schedule next audit trigger per `slyght_audit_a1_2026_05_13.md` cadence — Bundle 32 default, or earlier on trigger

### 15.2 Memory entry template

```markdown
---
name: slyght — Bundle 28 SHIPPED (PLAN-mode deep dive + intents)
description: <date> — Bundle 28 complete. PLAN.intents canonical entity collapses China/NRMA/Teachers Health/Rego/Green Slip duplicates. Savings sub-screen redesigned with visual progress. 17 bugs closed. 6 new guardian rules + 5 runtime checks + 4 boot self-tests.
type: project
---

Bundle 28 shipped <date> across N commits. Ship spec lives at
slyght/CLAUDE-CODE-SHIP-PROMPT-28.md. Pilot reference at
slyght/experiments/savings-subscreen-v2.js.

## What landed
[Phase-by-phase summary]

## Architecture state after Bundle 28
[Updated bubble count, SOURCES count, etc.]

## What CAN'T this bundle do (Bundle 29 candidates)
- B28-16 getGenuineSurplus consolidation
- B28-17 Phase-7 worker crons
- Retirement Readiness Canvas (audit recommendation)
- Debt Payoff Race tool (audit recommendation)
- KIA Loan ground-truth reconciliation (still unfixed per memory)
- Net Worth trend math fix (OPEN-BUGS #13)
```

### 15.3 Commit

```
bundle 28 phase 9: retro + memory + architecture update
```

---

## 16. Verification gates (final)

Before the bundle is considered shipped:

1. **All Phase commits landed.** Each phase has its own commit; no batched commits across phases.
2. **`npm run guardian-static` green.**
3. **`npm run guardian-runtime` green.** (50 + 5 new = 55 tests)
4. **`npm run visual` (Layer V) green.** New baselines accepted for Savings + Bills sub-screens + PLAN tile reorder.
5. **Boot self-test reports zero failures** on first page load post-deploy.
6. **Phone walk script** (from `MISSION-BUNDLE-28-PLAN-MODE-DEEP-DIVE.md §11`) complete:
   - PLAN root tile order is correct
   - Payday Plan canvas opens
   - Each sub-screen renders correctly with new layout
   - Go to Bills lands on Bills tab
   - KIA Extra editor opens (not alert)
   - Allocate → ghost bar shows → tick → commit → audit log entry visible
   - Undo restores fully
   - China appears once in Savings sub-screen (not 3×)
7. **No new `boot_self_test_fail` entries** in Settings > Diagnostics > Activity Log within first 5s post-boot.

---

## 17. Failure modes for the bundle as a whole

| Failure | Recovery |
|---|---|
| Phase 28.0 migration corrupts data | `SNAPSHOTS.restore('pre-seedV25-intents')` |
| Phase 28.3 port introduces render exception | Defensive UI activation (see `slyght_boot_self_test_pattern.md`) — fallback message shows; user sees error not silent break |
| Layer V baseline mismatch unrelated to bundle | Investigate; do NOT auto-accept |
| New SOURCES tag missing from `_SOURCE_SET` | Layer 2 catches; fail before commit |
| Cross-tile divergence reappears | Layer 1 `cross-tile-metric-canonical` catches |

---

## 18. What this bundle deliberately does NOT do

Re-stated from `MISSION-BUNDLE-28-PLAN-MODE-DEEP-DIVE.md §12`:

- CF Worker push notifications (Bundle 29 candidate)
- `getGenuineSurplus` → `BRAIN.plan.getSnapshot` consolidation (Bundle 29 polish)
- KIA Loan ground-truth reconciliation (Bundle 29)
- Net Worth trend math fix (Bundle 29)
- Bills tab itself (only the Payday-canvas Bills sub-screen)
- Cloud sync (Bundle 23 — comes AFTER 28 per audit decision)
- Long-press untick gesture
- Retirement Readiness Canvas (Bundle 29 — audit recommendation)
- Debt Payoff Race tool (Bundle 29 — audit recommendation)
- Rules-as-data refactor (Bundle 30)

---

## 19. After this bundle

Per audit recommendation: schedule **Bundle 29 — Decision-support features** next. Three tools:
1. Retirement Readiness Canvas (super contribution rate + projection + shortfall)
2. Debt Payoff Race (visualise WRX-proceeds against Mum-debt + Afterpay payoff in <90 days)
3. Annual Sinking Funds row in PLAN canvas (already partially in 28.4 — extend with monthly sinking-fund math)

After Bundle 29: Bundle 23 (Gist sync) per revised sequence.

---

## 20. Tone + working contract reminder

Per `slyght_per_bundle_discipline.md`:
- Notes-as-I-go in commit bodies + memory
- BRAIN-as-north-star (every mutation through a bubble writer)
- PLAN-mode UX language (the "future" the user is building toward)
- Long-form responses — explain reasoning, not just code
- Preauthorize within reason — proceed without asking for trivial decisions; STOP for shape changes / destructive ops

Per `slyght_audit_before_shape_change.md`:
- Phase 28.0 IS a shape change. 8-grep audit required before commit.

Per `slyght_edit_discipline_audit_first.md`:
- Read bytes first, then ONE atomic str_replace per logical edit.

Per `slyght_guardian_philosophy.md`:
- Guard bugs, don't silence rules. Allow-blocks need justified reasons with removability conditions.

— end CLAUDE-CODE-SHIP-PROMPT-28.md —
