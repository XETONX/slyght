# Rewrite Comparison + Migration Plan — 2026-05-13

> Output of the long-form investigation following Audit A1.
> Sibling docs: `AUDIT-A1-2026-05-13.md`, `MISSION-BUNDLE-28-PLAN-MODE-DEEP-DIVE.md`.
> Pilot reference impl: `slyght/experiments/savings-subscreen-v2.js`.
> Author: Claude Code (Opus 4.7).
> Stance: this doc is the bridge between "audit findings" and "ship prompt." It says what changes, why, how to migrate, and which fight to pick first.

---

## 1. The pilot rewrite — what it demonstrates

`slyght/experiments/savings-subscreen-v2.js` is a working reference implementation showing nine architectural shifts in concrete code:

1. **`PLAN.intents` canonical entity** — one record per purpose, replaces 3× duplicate China
2. **`BRAIN.plan.intent.{add,update,remove,setBucket,get,list,byKind,byBucket}`** — canonical writer surface
3. **`queryAllocationGhost(intentId, proposedAmount)`** — pure, re-callable on every keystroke; returns "if you committed this, what changes"
4. **`_paydayProgressBar(opts)`** — reusable progress component, CSS-only, supports ghost segment for pending allocations
5. **`_paydaySavingsRow(opts)`** — extends `_paydayRow` with embedded progress bar
6. **`_paydayCollapseStrip(opts)`** — collapsible section pattern (Bundle 28.4 Bills paid items)
7. **`renderPaydaySavings_v2()`** — rewritten with Pool → Upcoming → Long-term → KIA-extra structure, sorted by deadline/% complete, with empty states
8. **`openEditPaydayKiaExtra()`** — real editor replacing the `alert('Phase 6 candidate')` stub at L8818
9. **`_paydayExitToTab(tabId)` + `explainNumber(key)`** — fixes B28-3 nav bug; introduces P1 "every number tappable" pattern

Plus two declarative invariant samples in `experiments/invariants/`:
- `no-stale-phase-string.json` — schema for the Layer 1 rule from Audit §17.1.1
- `no-direct-intents-write.json` — schema for the Layer 1 rule enforcing canonical writers

### Why a sketch, not a full index.html copy

Copying 1MB of `index.html` would duplicate code that's already git-tracked. The pilot is **focused new code that lands in `index.html` per Bundle 28.3** — the migration table in §3 maps each pilot fn to its destination line range.

---

## 2. Quantified before/after

| Dimension | Current (index.html) | Pilot (savings-subscreen-v2.js) | Delta |
|---|---|---|---|
| Lines for `renderPaydaySavings` | ~125 (L8701-8827) | ~115 + 4 helpers (~330 total) | **+205 LOC** but ×3 helpers reusable across surfaces |
| Source of "China" data | 3 places (bucket / trip / goal) | 1 record + 3 views | **−2 sources of truth** |
| "Number → math" exploration | 1 surface (Net Worth modal) | N surfaces via `explainNumber()` registry | **+P1 principle live** |
| Cross-tile coherence enforcement | inline `S.txns.filter` 10+ sites | every read through `BRAIN.plan.getSnapshot` | **structural, not vigilance-based** |
| Layer 1 rule shape | imperative AST visitor (~30-100 LOC per rule) | declarative JSON (~10-20 lines per rule) | **−70% per rule** |
| Layer 1 rules John-readable? | No (acorn AST API knowledge required) | Yes (regex + allow-list + fixtures in JSON) | **AI/human extensible** |
| KIA Extra editor | `alert('Phase 6 candidate')` | full `EDIT_MODAL.openCustom` | **stub gone** |
| "Go to Bills" nav | inline 2-call pattern | `_paydayExitToTab(...)` + guardian rule | **stack-aware** |
| Auto-allocate modes | remainder-only | Full + Remainder choice modal (in Bundle 28.5) | **user agency** |
| Annual Provisions placement | separate PLAN-mode tile | deadline-driven (Savings sub OR Bills sub) | **placement = data, not duplication** |

### Architecture-level delta

| Pattern | Current | Future (pilot) |
|---|---|---|
| Data shape | `S.savingsBuckets`, `PLAN.trips`, `PLAN.goals`, `S.annualProvisions` — four lists | `S.planIntents` + `S.savingsBuckets` — one purpose list, one money list |
| Mutation safety | per-bubble canonical writers | extended to intents; every entity-class has its bubble.entity sub-namespace |
| Component reuse | 1 helper (`_paydayRow`) | 4 helpers + `EDIT_MODAL` + `PLAN_MODAL` |
| Number transparency | one-off modals | registry-backed via `NUMBER_EXPLAINERS` |
| Rules-as-code vs data | 17 rules in 1,396 lines of JS | rules as JSON the generic engine evaluates |

---

## 3. Direct-replacement candidates (drop-in patches NOW)

The pilot is structured so some pieces can land **independent of Bundle 28.0** (the intents migration). Patches you could ship today, in order of lowest risk:

### 3.1 Replace the stale Ask AI toast — 1 line, 0 risk
**index.html:8369** — change the toast string:
```diff
- showToast('Ask the AI about your plan — full context wiring lands Phase 7')
+ showToast('Ask the AI — current plan context is included')
```

### 3.2 Replace stale Phase 7 comment — 3 lines, 0 risk
**index.html:8364-8366** — replace:
```diff
- // Phase 6 stub for Ask AI — navigates to chat tab; Phase 7 will wire the
- // full plan-context system-prompt extension via BRAIN.plan.getSnapshot().
+ // Routes to chat tab. The chat system prompt embeds BRAIN.plan.getSnapshot()
+ // for affordability + plan context.
```

### 3.3 Delete the orphan `paydayUntick` — ~20 lines, 0 risk
**index.html:8471** — verified no callers (grep clean). Delete the fn.

### 3.4 Introduce `_paydayExitToTab(tabId)` + replace 2 call sites — ~30 lines, low risk
Add the helper near `closePaydayPlan` (L7758). Update L8657 + L8825 to use the helper. **Fixes B28-3.**

### 3.5 Add `_paydayProgressBar(opts)` helper — ~25 lines, 0 risk
Drop in alongside `_paydayRow` (L8504). No callers change until Bundle 28.3 ships. Lays groundwork.

### 3.6 Replace KIA Extra `alert` with real editor — ~40 lines, low risk
Add `openEditPaydayKiaExtra` alongside `openEditPaydaySavings`. Update L8818 to reference it.

### 3.7 Add `boot self-test` entries for new fns — ~6 lines, 0 risk
Extend the canary at L9450+ with the four new probes from `AUDIT-A1-2026-05-13.md` §17.3.

**Subtotal: ~100 lines of changes, ~30 mins, no migration required.** These could ship as **Bundle 28.0.1 "Hygiene quick wins"** before the bigger intents migration.

---

## 4. Phased migration plan

The full pilot requires the intents migration. Sequencing:

### Phase 28.0 — Intents migration (backend prereq, no UI)
**What ships:**
- `S.planIntents = []` schema field
- `BRAIN.plan.intent.*` writers (verbatim from pilot)
- 5 new SOURCES tags (`PLAN_INTENT_ADD`, `PLAN_INTENT_UPDATE`, `PLAN_INTENT_REMOVE`, `PLAN_INTENT_LINK_BUCKET`, `MIGRATION_INTENTS_V1`)
- `seedV25_collapseIntents` migration — scans savingsBuckets / PLAN trips / PLAN goals / AnnualProvisions defaults, produces single intent list per name-cluster
- Back-compat shims: `PLAN.getTrips() = () => BRAIN.plan.intent.byKind('trip').map(_intentToLegacyTripShape)`, same for goals + provisions
- Snapshot taken before migration: `SNAPSHOTS.take('pre-seedV25-intents')`

**Risk:** Medium. Data-shape change. Per `slyght_audit_before_shape_change.md` — 8-grep audit required before ship:
- `S.savingsBuckets` readers (~10 sites)
- `PLAN.trips` readers (~6 sites)
- `PLAN.goals` readers (~6 sites)
- `PLAN.getAnnualProvisions` readers (~3 sites)
- `S.tripDefs`, `S.goalDefs` direct reads
- Save() shape preservation
- Snapshot replay compatibility
- AI chat context export

**Verification:** boot self-test "intents canonical" + Layer 2 "seedV25 idempotent" + manual phone walk on all existing Trips/Goals/Provisions rendering.

### Phase 28.0.1 — Hygiene quick wins (§3 above)
Land §3.1 through §3.7 in one commit. Independent of Phase 28.0; can ship in parallel.

### Phase 28.0.5 — Cross-tile metric canonicalisation (NEW — from Audit §3.1)
**What ships:**
- Migrate 5 high-impact renderers to `MODEL.todaySpent` / `BRAIN.summary.total`:
  - `renderTrend` (L5060)
  - `renderCatBreakdown` (L5074)
  - `renderCutSliders` (L5005)
  - Dashboard pace tile (L3174)
  - Footer persistent strip (`updatePersistentStrip`)
- Add Layer 1 rule `cross-tile-metric-canonical` per Audit §3.1

**Risk:** Medium. Closes OPEN-BUGS #6, #8, #12, #15, #17 in one stroke.

### Phase 28.1-28.8 — per Bundle 28 v2 doc
Already specced in `MISSION-BUNDLE-28-PLAN-MODE-DEEP-DIVE.md` §14. After Phase 28.0 ships, the pilot code lifts almost verbatim into Phase 28.3.

### Phase 28.9 — Retro + memory + ARCHITECTURE.md update
Per Audit recommendation.

---

## 5. Layer audit synthesis (the three layer agents)

This section consolidates the 3 parallel layer audits run during this investigation.

### 5.1 Layer 1 (guardian-static.js) — Engineer's findings

**Inventory:** 17 active rules across 1,396 lines of imperative AST code (acorn + walk.simple). Helper sets configure allow-lists per rule. Override comments: `// guardian-allow: <rule> — <reason> (removable when X)`.

**Top 5 bugs slipping through:**
1. Cross-tile metric divergence — no rule for parallel surplus implementations
2. Stale phase strings — no rule for `'Phase \d+'` literals (proposed §17.1.1)
3. Broken nav links inside Payday canvas — no rule for `goPage` w/o stack cleanup
4. Direct intents writes — no rule yet (proposed §17.1.2)
5. Empty-state UI hygiene — no detection

**Strongest single shift:** Move from "rules are code" to "rules are data." Today, adding a rule requires ~30-100 LOC of acorn AST visitor code. In data form, a rule is ~10 lines of JSON (see `experiments/invariants/no-stale-phase-string.json`). One generic walker instantiates all rules by reading the catalog. **Cost drops from "hours of implementation" to "minutes of design."**

### 5.2 Layer 2 (guardian-runtime.js) — Engineer's findings

**Inventory:** 40 tests across 11 sections in ~775 lines. Uses synthetic state OR real `state-snapshot.json`. Categories: balance integrity, debt state, bills state, surplus/maxday, spending, net worth, data integrity, mock go-live scenarios, audit log, dynamic calc, new systems wiring.

**Structural weakness:** Tests hardcode expected values ("Pet Insurance only paid"). It's a snapshot probe, not an invariant specification.

**Improvement:** Invariant-first structure — assert N invariants over M datasets (real + synthetic + edge-case). Tests become data; the harness becomes a 50-line loop.

### 5.3 Layer 3 (MathInvariants) + Boot Self-Test — Engineer's findings

**MathInvariants inventory:** 13 invariants at index.html:3492-3868. Critical tier (state-shape-balance, txns, paidbills), fail tier (cycle-spend-bounded, alert-coherence, etc.), consistency tier (monthly-history-schema, liquid-vs-total-nw).

**Boot Self-Test inventory:** 10 checks at index.html:9451-9490. BRAIN bubble reachability + Payday Plan canvas wiring.

**Top 5 coverage gaps:**
1. Stale savings-mirror sync (B28-13 adjacent) — needs cross-object invariant
2. Cross-tile metric divergence — needs explicit coherence check across renderers
3. Phase-N stub strings — Layer 1 territory
4. Async BRAIN bubble init races — boot self-test should call methods inside try/catch
5. Defensive UI activation order — brittle to detect; pair-review or style rule

**Highest-leverage refactor:** Consolidate the three "today's spend" computations into single `MODEL.todaySpent` + add Layer 3 invariant that renderers consume it. Solves OPEN-BUGS #17 + future drift in one stroke. **80% of cross-tile drift bugs vanish.**

### 5.4 Layer V (scripts/layerV-capture.js) — Engineer's findings

**Harness shape:** 611 lines, procedural Playwright. 37 captures hardcoded as sequential step + shoot pairs. Output: `manifest.json` with idx/slug/file/status/size.

**OPEN-BUGS #33 truncation root cause:** Line 48 has `fullPage: false` — Playwright captures viewport only (412×915). Settings + Bills tail content invisible.

**Fix:** Line 48 → `fullPage: true`. Investigate CSS constraint on `<body>` / `.pg-settings` that may artificially cap `scrollHeight`. Trivial fix to a known-high-impact bug.

**AI-readability gaps:**
1. Manifest is pixel-opaque — no semantic tags per capture
2. Capture specs are procedural — broken DOM selectors silently fall back to pixel offsets
3. No assertion mechanism — no baseline diff, only screenshots

**Biggest missing piece:** Declarative capture config + semantic manifest output. Captures should carry structured metadata ("accordion closed", "tile present", "modal visible") that Claude can reason over without vision API calls.

### 5.5 Cross-layer recommendation

Each layer is well-implemented per its design; **none is shaped to be AI-rearrangeable**. The single recommendation that compounds across all four:

**Make rules / invariants / capture specs DATA, not code.**

| Layer | From | To |
|---|---|---|
| Layer 1 | 17 imperative AST visitors | 17 JSON rule files in `slyght/invariants/static/` |
| Layer 2 | 40 hardcoded tests | 15 invariants × 3 datasets in `slyght/invariants/runtime/` |
| Layer 3 | 13 inline array entries | 13 JSON files in `slyght/invariants/render-time/` |
| Boot ST | 10 inline array entries | per-bubble `.registerBootTest()` decorator pattern |
| Layer V | 611-line procedural Playwright | 37 JSON capture specs + generic harness runtime |

This unifies "what to enforce" as readable data. An AI agent (or a human) can add, edit, or remove rules by editing JSON — no acorn knowledge required. The existing imperative code becomes generic engines that consume the catalogs.

**Bundle path:** This refactor doesn't fit Bundle 28 (UX scope). It belongs in a future **Bundle 30 — Rules as data**. Until then, every new Bundle 28 rule should be drafted as JSON first (per `experiments/invariants/*.json`) and translated to imperative for now — building the catalog before the engine.

---

## 6. Bundle 28 vs Bundle 23 — the decision

You asked: ship Bundle 28 (PLAN-mode UX) or Bundle 23 (Cloud sync via GitHub Gist)?

### Bundle 28 case
- **User-visible pain.** China duplication, Go-to-Bills broken nav, KIA Extra stub, stale Ask AI toast — all corrosive to daily use.
- **Foundation for everything downstream.** `PLAN.intents` (Bundle 28.0) is required by Savings sub-screen redesign, Annual Provisions fold-in, AI agent reasoning about "what is China."
- **Pilot already exists.** Most of Bundle 28.3 is implemented in `experiments/savings-subscreen-v2.js` — porting + wiring is ~half the work of writing from scratch.
- **Audit A1 says so.** "Bundle 28 cleanup is the right next move" — quoted from the strategic verdict.

### Bundle 23 case
- **Multi-device + dump-drift risk.** `slyght_dump_live_drift.md` documents that NRMA went stale within 24 min of a fresh export.
- **Phone wipe = data wipe.** Sole device, sole truth — no recovery beyond pin'd snapshots.
- **Unlocks AI agent writes.** A persistent cloud-side store is the substrate for future agent mutations (Bundle 24+).

### My reasoning — Bundle 28 first. Three reasons:

1. **Sync before canonicalisation = syncing the mess.** If Bundle 23 ships first, every device gets China-as-3-records. The cloud Gist becomes the canonical store of the FRAGMENTED shape. When Bundle 28.0 then migrates, every device has to seedV25 over its own Gist mirror — much higher coordination complexity than migrating in one place first.

2. **Bundle 23's own preconditions aren't met.** From `ARCHITECTURE.md` §11: *"Cloud sync via GitHub Gist. Per Opus: wait until Note 7 migrated + snapshots proven firing 1-2 weeks in production."* Note 7 (BRAIN.summary migration of renderers) hasn't happened. Snapshots are firing but the cross-tile metric divergence (OPEN-BUGS #17) means the data being snapshotted is internally inconsistent.

3. **Bundle 28's pain is daily; Bundle 23's pain is occasional.** John uses Payday Plan canvas every payday cycle (every 2 weeks). The broken Go-to-Bills nav and stub KIA editor are felt every cycle. Phone-wipe is a once-per-multi-year event; offline-export still works as recovery.

**One nuance:** Bundle 23 should NOT wait for "Bundle 28 plus Bundles 19 + 20" as the existing ARCHITECTURE.md prescribes. After Bundle 28 (intents canonical) lands, Bundle 23 can ship next — the Bundle 19 + 20 deps were about payload size, which is less urgent than dump-drift risk. Tentative re-sequence:

```
Bundle 28 (Plan-mode + intents)
  ↓
Bundle 23 (Gist sync)
  ↓
Bundle 29 (Decision-support features — Debt Race + Retirement Canvas + Annual Sinking Funds)
  ↓
Bundle 19/20 migrations (BRAIN.summary consumers + archive tiering)
  ↓
Bundle 30 (Rules as data — refactor toward Lego architecture)
```

This pivots the queue toward John's biggest *current* decisions (debt race, retirement, intents) before payload-optimisation work.

---

## 7. Final clutter scan — answer to "anything else?"

Root is clean. 13 MD files, no zips, no state dumps, no orphan PNGs/scripts. Two non-MD root items worth noting (not clutter, just FYI):

- **`runtime-report.json` (12.4 KB, 2026-05-13)** — fresh guardian-runtime output. Active. Leave.
- **`_check.js`** — already archived in pass 2.

The wider repo has a few non-blocking observations:
- `captures/` regenerates on Layer V run; if you don't need cross-run history, consider `.gitignoring` it
- `playwright-report/`, `test-reports/`, `test-results/` likely all gitignorable (47+ MB)
- `node_modules/` (50 MB) — gitignored already, just noting size

These are .gitignore hygiene, not cleanup. Defer to a Bundle 30+ housekeeping.

---

## 8. What I'm about to commit

Per your authorization. Single commit covering the audit + cleanup + pilot:

```
git add -A
git commit -m "Audit A1 + cleanup + pilot rewrite: 6-lens audit, archive 136 docs,
              ship Bundle 28 scope, pilot Savings sub-screen for Bundle 28.3"
```

This is one commit because it's one coherent piece of work (the morning's investigation). If you'd rather split it into 3 commits (audit, cleanup-move, pilot+comparison), let me know — I haven't run it yet.

— end REWRITE-COMPARISON-2026-05-13.md —
