# State of slyght — 2026-05-19 audit

**Date:** 2026-05-19 (post Bundle 31 + 32a + 32.0a + 32.1 + 32.2)
**Author:** CC (Opus 4.7) — autonomous audit per John's 2026-05-19 directive ("breaking down the walls and looking at the truth and mapping a design to what we've built")
**Method:** inventory pass across every ledger (OPEN-BUGS, FINANCIAL-INVARIANTS, ADRs, SDDs, FEATURE-MAP, bundle-32-scope, memory notes) + new `scripts/scenario-walk.js` framework with 5 user-journey scenarios (17 step assertions across daily-use, plan allocation, INV-32 refusal, lock/tick/unlock, activity log filter coherence).

This doc exists so the next session — and John, when he asks "can I trust the app" — has one place to read the truth.

---

## TL;DR

- App reconciled to bank ($1,113.61). No "crisis" status. Math integrity work is on a stable trajectory.
- 16 BRAIN bubbles operational. 32 financial invariants defined (5 shipped via Bundle 30, 1 via Bundle 32.2, 26 read-coverage). 4 invariant slots reserved pending design decisions.
- 5 user-journey scenarios pass end-to-end on real reconciled fixture: daily-use, plan-allocation, INV-32 refusal, lock+tick+unlock, activity-log filter coherence.
- 1 newly-surfaced framework gap: **no canonical `BRAIN.plan.lock` / `BRAIN.plan.unlock` writer** — lockedAt is mutated directly at 4+ call sites, in violation of CLAUDE.md §8. Tick was canonicalised (Bundle 27) but lock state was not. Candidate Bundle 32.7.
- FEATURE-MAP v2 migration: 1 of 9 surfaces ✅, 1 🟡, 7 ⏳. The v2 schema is sound; the migration is the constraint.
- ~19 of 40 OPEN-BUGS sections still open; the remainder are fixed/merged/cannot-reproduce. Top of-mind: FR-03 (AI overshoot), FR-06 (payday countdown drift), FR-07 (debt sub-screen vs canvas drift), filter-scatter cluster (#6B + #7 + #8 + #17).
- 4 ADRs pending sign-off (Bundle31-A/B/C/D — adhoc bucket UI, Quick Log savings, bucket detail, savings tick path).

If the question is "can John use every feature in confidence" — for the surfaces the scenario walker covers (daily expense logging, plan allocation, INV-32, lock+tick, activity filtering): yes. For the surfaces it doesn't cover yet (chat-AI, AI update_balance, debt sub-screen, multi-cycle nav, push notifications, settings IA): not yet — needs more scenarios.

---

## 1. Layer inventory

### BRAIN bubbles (canonical writer pattern surface)

| Bubble | Status | Bundle | Notes |
|---|---|---|---|
| `BRAIN.audit` | ✓ shipped | 28 | Append-only event log; 500-entry cap. The forensic backbone. |
| `BRAIN.balance` | ✓ shipped | 30 | `get` · `applyTxnDelta` · `reconcileTo` · `applyDelta` · `confirmNegativeOverride`. Closes FR-01. |
| `BRAIN.selfTest` | ✓ shipped | 30 | ~25+ invariant checks fire at boot. |
| `BRAIN.devInspect` | ✓ shipped | 30 | Extensible check registry behind Settings → Diagnostics. |
| `BRAIN.config` | ✓ shipped | 22 v3 | Bundle 22 settings IA root. |
| `BRAIN.allocation` | ✓ shipped | ≤27 | Goal/trip allocations with their OWN lock state (separate from S.activePlan). |
| `BRAIN.plan` | ✓ shipped | 27 | `getSnapshot` + `setOverride` (INV-32 gated) + `tickItem` + `untickItem` + `markPaydayLanded` + `setBonus` + `intent.*` + `rolloverIfNeeded`. **Gap:** no `lock`/`unlock` writer. |
| `BRAIN.assets` | ✓ shipped | 27 | WRX + super + non-liquid. |
| `BRAIN.chat` | ✓ shipped | 27 | Conversational AI bubble. |
| `BRAIN.cycle` | ✓ shipped | 27 | Cycle boundary helpers. |
| `BRAIN.savings` | ✓ shipped | 28 | Per-bucket get/set/list. |
| `BRAIN.summary` | ✓ shipped | 28 | Top-level money summary. |
| `BRAIN.dashboard` | ✓ shipped | 28 | Dashboard-specific reads. |
| `BRAIN.transaction` | ✓ shipped | 30 | `recordWithAllocation` envelope. Closes FR-01/FR-02. |
| `BRAIN.bills` | ✓ shipped | 14 / 31 | `getThisCycle` + `processAutoDebits` (Bundle 31 Item 16). |
| `BRAIN.debts` | ✓ shipped | 28 | Debt CRUD + payment routing. |

**Total: 16 BRAIN bubbles operational.** Boot self-test verifies ~25 reachability checks; smoke specs verify the value-shape per write site.

### Read-side canonical layer: `MODEL` + `BRAIN.plan.getSnapshot().derived`

- `MODEL` rebuilt on every `refreshModel()` call (DOMContentLoaded + after every write). 30+ named fields.
- `snap.derived` (Bundle 32.1) extends with allocation-tier canonical reads: `essentialsTotal` · `remainder` · `allocatedTotal` · `stillToAllocate` · `surplus`. Conservation law: `remainder === allocatedTotal + stillToAllocate` (smoke-verified).
- **Gap from Bundle 32 architectural diagnostic** (commit `e153d54`): read-side canonical layer is partially built. 4 of the 7 proposed phases shipped (32.0a/32.1/32.2 + admin debt). Remaining: 32.3 trip-aware survival forecast (ADR-worthy) · 32.4 essentialsVsDiscretionary drilldown · 32.5 hero cycle-spend visibility · 32.6 BRAIN.plan.resetCycle.

### Invariants (FINANCIAL-INVARIANTS.md)

**Shipped + enforced (smoke specs + write-time refusals):**

- INV-01..05 — cash/balance conservation
- INV-06..07 — net worth conservation
- INV-08..10 — free-money this cycle
- INV-11 — cross-surface coherence
- INV-12..26 — write-site discipline (most validated by Guardian + boot self-test)
- INV-28 — bucket destination free-money gate (`_skipFreeMoneyGate` + `_isRoundup` exemptions)
- INV-32 — savings over-allocation write-time refusal (Bundle 32.2)

**Reserved (pending decision before assigning enforcement code):**

- INV-27 — negative-balance warning policy (SDD-bundle-30 §C#1)
- INV-29 — plan-lock narrow semantics (SDD-bundle-30 §C#3) — **NOT** the same as INV-32 (collision discovered + renumbered in commit `6e84756`)
- INV-30 — FX fee handling (SDD-bundle-30 §C#4)
- INV-31 — round-up timing (SDD-bundle-30 §C#5)

5 pending invariant decisions still need John's sign-off. They're at the bottom of FINANCIAL-INVARIANTS.md, untouched since 2026-05-18 draft.

### Smoke spec coverage

Active specs in `tests/smoke/`:

- `_helpers.smoke.js` — fixture seed + boot helper
- `allocation-framing.smoke.js` — Bundle 31 Item 4 reframe
- `analysis-essentials.smoke.js` — Bundle 31 Item 3 cycle-bound classifier
- `autodebit-batch.smoke.js` — Bundle 31 Item 16 processor
- `diagnostics.smoke.js` — Bundle 30 1.A surface
- `inv32-over-allocation.smoke.js` — Bundle 32.2 write-time refusal (4 cases)
- `snap-derived-allocation.smoke.js` — Bundle 32.1 derived reader + conservation law (3 cases)
- `transaction-paths.smoke.js` — Bundle 30 Phase 1.B nine write sites

All 34/34 pass on real reconciled fixture. Total spec coverage is unit-level; the new `scripts/scenario-walk.js` adds journey-level coverage (5 scenarios, 17 step assertions — see §3).

---

## 2. FEATURE-MAP v2 migration status

| Surface | Status | Notes |
|---|---|---|
| Diagnostic surfaces | ✅ | All Bundle 30 1.A through 1.A.8 entries shipped |
| Transaction paths | 🟡 | 9 write-sites backfilled into v2; some site-specific gaps |
| Payday Plan canvas + sub-screens | ⏳ | INV-29 lock-narrowing prerequisite + Bundle 32.6 resetCycle |
| Dashboard | ⏳ | Hero + recent-spending entries needed |
| AI chat | ⏳ | FR-03 tool split prerequisite |
| Bills tab + Bills surfaces | ⏳ | Bundle 14 + 31 work to document |
| Analysis tab | ⏳ | Bundle 31 Item 3 partial + filter-scatter cleanup pending |
| Settings (excl. Diagnostics) | ⏳ | Bundle 22 v3 IA shipped but un-mapped |
| Onboarding / first-run | ⏳ | Lowest priority |

**1 of 9 ✅, 1 🟡, 7 ⏳.** This is a documentation bottleneck more than an architectural one — the v2 schema (status table + bubble + surface entries with state-fields/writers/readers/invariants/smoke-coverage) works; it just hasn't been backfilled for 7 of 9 surfaces. Estimated effort: 2-3 hours per surface to do well.

---

## 3. Scenario walker — new infrastructure (this session)

New file: `scripts/scenario-walk.js` — Playwright-based multi-step user-journey runner. Different from smoke specs (which test isolated writers) and from `walkthrough-audit.js` (which captures static surfaces for vision audit): scenario-walk performs **sequential actions as a real user would** and asserts state coherence at **every step**.

Catches the bug class John has been frustrated by: "click A, then B fails" / "surface 1 updates but surface 2 doesn't" / "state looks OK but audit log is missing an entry."

### Five scenarios shipped this session

| ID | Scenario | Steps | Verifies |
|---|---|---|---|
| `A-daily-use` | Daily expense logging | 4 | balance decrement · audit log entries · `MODEL.cycleSpent` · `MODEL.todaySpent` · hero subtitle |
| `B-allocation-workflow` | Plan-mode allocation | 3 | `BRAIN.plan.setOverride` · `snap.derived` conservation · canvas REMAINDER + PLAN dash tile cross-surface coherence |
| `C-over-allocation-refusal` | INV-32 user-facing | 3 | refusal contract · state unchanged on refusal · `inv32_refusal` audit entry · reduction-in-over-state allowed |
| `D-lock-tick-unlock` | Lock plan → tick bill → unlock | 4 | lock state transition · `BRAIN.plan.tickItem` balance/txn/audit coherence · unlock preserves state |
| `E-activity-filter-coherence` | Activity log filter math | 3 | `computeSpentInRange` exact semantic equivalence with `_NON_SPEND_CATS` filter · post-write delta correctness |

**Result: 5 / 5 scenarios pass · 17 / 17 step assertions green** on real reconciled `state-snapshot.json` fixture (post-2026-05-19 reconciliation). Frozen clock 2026-05-19T22:00 — distinct from smoke specs' 2026-05-05 baseline because scenario walking exercises POST-payday state.

### One framework gap surfaced

**`BRAIN.plan` has no canonical `lock` / `unlock` writer.** Lock state is mutated directly at `S.activePlan.lockedAt` from at least 4 call sites:

- `index.html:11584` — `S.activePlan.lockedAt = Date.now();` (lock confirm flow)
- `index.html:11806` — `S.activePlan.lockedAt = null;` (unlock confirm flow)
- `index.html:3307` — `S.activePlan.lockedAt = null;` (unlockPlanWithConfirm)
- `index.html:19929`-30 — `plan.lockedAt = Date.now();` (but this is on the SEPARATE `BRAIN.allocation` bubble's localStorage, not `S.activePlan`)

Per CLAUDE.md §8 "No bypassing canonical writers" this is a discipline gap. It hasn't caused observed bugs (Bundle 27 unlocked-→-locked smoke covers state correctness) but it's the kind of structural gap that lets future drift in (different call sites can forget to update related state like `lockedSnapshot`, `streakEligibility`, etc.).

**Candidate Bundle 32.7:** `BRAIN.plan.lock(opts, source)` + `BRAIN.plan.unlock(source)` canonical writers, 4 call sites migrated, smoke spec, audit-log entry standardised (`payday_plan_locked` / `payday_plan_unlocked`). Estimate ~60-80 LOC + spec + FEATURE-MAP entry. Low risk because the behaviour is already understood and tested.

### How to extend the walker

Each scenario in `scripts/scenario-walk.js` is a `{ id, name, description, steps[] }` shape. Each step is `{ description, action(page, ctx), asserts(page, ctx) → { ok, errors[], state } }`. Add a scenario by appending to `SCENARIOS`. Run with `node scripts/scenario-walk.js --scenario=<id>` (substring match supported). Run `--list` to see what's there. Output lands at `docs/audit/<ts>-scenario-walk.md` + `.jsonl` + per-step screenshots under `_scenario_screenshots/<id>/step-NN.png`.

---

## 4. Open work by ledger

### OPEN-BUGS (~19 open / 40 sections)

Top-priority groupings:

**Filter-scatter cluster (4 bugs resolve transitively via one fix — Bundle 32 phase G candidate):**
- #6 part-B — Strict `_NON_SPEND_CATS` migration for Essential vs Discretionary classifier
- #7 — `renderCutSliders` all-time vs monthly baseline mismatch
- #8 — Dashboard "running over/under pace" lax filter
- #17 — Cross-tile "today's spend" coherence (three renderers, three values)

**Field report criticals (from John's original FR):**
- ~~FR-01~~ — Cash hero. **FIXED Bundle 30.**
- ~~FR-02~~ — Bucket balances. **FIXED Bundle 30.**
- FR-03 — AI agent `update_balance` overshoots by ~$7k. **STILL OPEN.** Violates INV-20. CLAUDE.md §10 warns: don't trust this tool until FR-03 lands.
- FR-06 — Payday countdown 3 different values across surfaces. **STILL OPEN.** Violates INV-14.
- FR-07 — Debts sub-screen disagrees with canvas. **STILL OPEN.** Violates INV-11/INV-18.

**Bundle 31 carry-over (Phase 1A items not fixed):**
- Item 1 — Dashboard "$X this cycle" labelling (P1)
- Item 9 — `getMinDailySpend` uses 30-day historical not weekday/weekend (P1)
- Item 10 — MAX PER DAY visual adjacency (P2)
- Item 11 — No discoverable delete for upcoming items in unlocked plan (P1 UX)
- Item 12 — Goals/Buckets card external edit/add/delete (P1 UX)
- Item 13 — WRX card always-open clutters Plan dashboard (P1 UX)
- Item 14 — Analysis Opportunity Cost selects rent as worst category (P2 dead-weight)
- Item 15 — Analysis Month-on-Month doesn't compare months when `monthlyHistory` empty (P2)
- Item 17 — Opal $1 placeholder vs actual variable Opal fare (P3) — separate from Opal-API-integration ask

**Lower-priority (P2/P3):**
- #44 — Multi-delete UX friction (newly filed 2026-05-19; safe behaviour, friction-only)

### FINANCIAL-INVARIANTS pending decisions (5)

Untouched since 2026-05-18 draft. Each needs John's "yes / no / change to:" before enforcement code can land:

1. INV-27 — negative-balance warning threshold + UX
2. INV-29 — plan-lock narrow semantics (what's locked when locked?)
3. INV-30 — FX fee categorisation
4. INV-31 — round-up timing relative to parent txn
5. (Bonus) — what to do when a user reduces an over-allocated bucket (already implemented in Bundle 32.2 as "always allow improvements"; could be formalised as INV-33)

### ADRs (4 pending)

- ADR-Bundle31-A — Adhoc bucket allocation UI
- ADR-Bundle31-B — Quick Log savings bucket selection
- ADR-Bundle31-C — Bucket detail readonly view
- ADR-Bundle31-D — Savings tick override UI path

All four were drafted Bundle 31 but not actioned. They block the Bundle 31 plan-mode round of UX work.

### Bundle 32 phases (remaining)

Per `docs/bundle-32-scope.md`:

- **32.3** — Trip-aware survival forecast (ADR-worthy)
- **32.4** — `MODEL.essentialsVsDiscretionary` + drilldown
- **32.5** — Hero cycle-spend always-visible
- **32.6** — `BRAIN.plan.resetCycle` + UI button
- **32.7** — `BRAIN.plan.lock` / `unlock` canonical writers (**new this session**)
- **G** — Filter-scatter cleanup (#6B + #7 + #8 + #17)
- **H** — Pure UX polish residual (~15 findings from Phase 1B Run 2)

### Memory amendments

- AMENDMENT-001 to CC manual (proposed 2026-05-13): every Noticed item must include ACTION + WHEN. **Pending acceptance** for 6 days.

### Newly-asked items (from John's 2026-05-19 directive)

- **Opal API integration via API token.** Not yet scoped. Likely Transport NSW Open Data API. Use case probably "auto-import Opal tap-on/tap-off fares so the $1 placeholder doesn't drift." Needs: (a) confirm which API, (b) understand auth model, (c) decide local-vs-worker fetch, (d) integrate with txn write path. Estimate: medium-large bundle of its own.
- **Comprehensive design map** showing every feature works coherently with dynamic message propagation. Partial — scenario walker covers 5 journeys. Full coverage needs scenarios for: chat AI, AI update_balance, debt sub-screen, multi-cycle nav, push notifications, settings IA.

---

## 5. Recommended sequence

If the goal is "John can use every feature in confidence," the highest-leverage moves from here are (in order):

1. **Sign off the 5 FINANCIAL-INVARIANTS pending decisions** — unblocks INV-27/29/30/31 enforcement code + clarifies INV-33-shape policy. ~30 min of decisions, then implementation lands across multiple smaller bundles.

2. **Bundle 32.7 — `BRAIN.plan.lock` / `unlock` canonical writers** — closes the framework gap surfaced this session. ~2 hr.

3. **Bundle 32 phase G — filter-scatter cleanup** — single fix collapses 4 OPEN-BUGS, includes #17 which is John's most visible "doesn't make sense" complaint. ~3 hr.

4. **Scenarios F-J** — extend `scripts/scenario-walk.js` to cover: chat-AI happy path, AI update_balance (will surface FR-03), debt sub-screen, multi-cycle navigation, push notification triggers, settings IA. ~30 min per scenario. Reveals more bugs and gives John concrete evidence for "I can use this."

5. **Bundle 32.6 — `BRAIN.plan.resetCycle`** — closes the cycle-boundary canonical gap.

6. **Opal API integration scoping ADR** — `docs/adr/ADR-bundle-33-opal-integration.md`. Decide local-vs-worker fetch + auth model + cache strategy.

7. **FR-03 + FR-06 + FR-07** — the three remaining field-report criticals. Each gets its own bundle with INV-NN paired.

**Steps 1-3 are this-week-doable. Steps 4-5 are next-week. Step 6 is its own thing whenever John has the API token. Step 7 is the long tail.**

---

## 6. What's healthy

- The architecture (single-file + BRAIN bubbles + canonical writers + audit log + source tags + boot self-test + Guardian + smoke specs) is sound. Every Bundle 30+ violation has been caught at write-time or commit-time, not at user-facing-time.
- The fixture-currency discipline established Bundle 31 (refresh `state-snapshot.json` after every reconciliation) prevents the silent-stale-fixture class of failures.
- The trace-logging discipline established Bundle 31 (every API audit call writes JSONL with response_id + tokens + cost) makes vision audits verifiable.
- The full-Guardian-as-commit-gate discipline established Bundle 31 (not guardian-static alone) catches the runtime/all/static gap.
- Bundle 32.1's `snap.derived` canonical reader closes the cross-surface drift class for the allocation tier; Bundle 32.2's INV-32 closes the write-time over-allocation class. Both shipped this evening.
- This audit doc + scenario-walker mean the NEXT session starts grounded: one trace, one report, one list. Not three ledgers + retroactive triage.

---

## 7. What this audit didn't cover

Be honest: this is a structural inventory + a 5-scenario walk + ledger consolidation. It does NOT cover:

- **Visual / vision audit** — last Run 4 baseline was 2026-05-19 (committed `fa4d1a4`). No new vision audit this session; surface-level UX findings haven't been refreshed.
- **Phone-verify on 380px** — scenarios all pass programmatically; John still needs to phone-verify the BRAIN.plan.lock gap fix (when shipped) + any UI changes from G/H phases.
- **Push notification flows** — not in any scenario. The Cloudflare Worker integration is a separate vertical with its own potential gaps.
- **AI chat / update_balance** — known-broken (FR-03). No scenario walks it. CLAUDE.md §10 warns against trusting it.
- **Multi-cycle / time-travel** — every scenario uses frozen-clock 2026-05-19T22:00. Cycle boundary edge cases (paying a bill on the cycle start day vs day before) aren't covered.

These are gaps in this audit, not necessarily gaps in the app. They're the natural next targets for scenarios F-J.

---

**End of state-of-project audit.** Continue work from §5 sequence.
