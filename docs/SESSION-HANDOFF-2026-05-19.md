# Session handoff — 2026-05-19 (Bundle 32 substrate-completion phase)

**Purpose:** any new CC session opens this file FIRST. Pick up exactly where the previous session left off. No re-litigation. No silent gaps.

**Last session ended:** 2026-05-19 late evening, John going to sleep after Finding 2 hero breakdown shipped (`bfe4c96`).
**Tip-of-main commit:** `bfe4c96` (origin/main · pushed). `git log --oneline` to verify.
**Outstanding phone-verify queue:** 2 items (Finding 1 bonus split + Finding 2 hero breakdown).

---

## 1. What slyght is + the mission

slyght = John's personal finance + lifestyle PWA. Single-file `index.html` (~24k lines). Hosted GitHub Pages at `xetonx.github.io/slyght`. Cloudflare Worker backs push notifications. For one user (John) specifically — not a portfolio, not for users-in-general. Decisions get judged against "does this help John daily?", not "is this elegant?".

**Trajectory mission** (per `docs/bundle-32-trajectory.md`):

slyght is being built as an **accountability OS substrate**. Finance is the first vertical. The substrate underneath is general — canonical writers, audit log, source tags, BRAIN bubbles, invariant-paired specs. Once substrate is complete, the AI layer (Bundle 33+) rides on it without hedging — agent reads `BRAIN.<bubble>.getSnapshot` deterministically, writes through canonical writers, can answer "what did John commit to this cycle" without DOM scraping.

City2Surf is **9 August 2026**. slyght should be a trusted app for both finance AND training by then. Substrate complete mid-June; AI layer through July; trusted app by 9 Aug. Soft deadline — slipping doesn't kill the project — but it's the forcing function that keeps Bundle 32 from becoming 6-month substrate-perfectionism.

---

## 2. The substrate columns (canonical-X migrations)

| Column | Bundle | What it locks down | Status |
|---|---|---|---|
| **1. Write substrate** | 30 | Every `S.X` mutation routes through `BRAIN.<domain>.<verb>` with source-tagged audit log. `recordWithAllocation` envelope covers all 9 transaction write sites. | ✓ shipped |
| **2. Allocation substrate (reads)** | 32.1 | `snap.derived` canonical allocation reader. Conservation law `remainder === allocatedTotal + stillToAllocate`. Cross-surface drift class closed. | ✓ shipped |
| **3. Lock-state substrate** | 32.7 Pass 1 | `BRAIN.plan.lock` / `unlock` / `isLocked` canonical writers + 5 call site migrations. Three lock stores no longer diverge. | ✓ shipped (Pass 1 complete) |
| **4. Render-truth substrate** | 32.3/32.4/32.5/32.6/G/8 | Display-tier truth aligns with logic-tier truth. Trip-aware survival forecast · essentials drilldown · hero cycle-spend breakdown · canonical reset · filter unification. | ~90% (see §4) |

When all four columns ✓ → substrate complete → INV-27..32 enforceable → architecture diagnostic from `e153d54` can be marked closed.

---

## 3. The trust pattern (emerged this week)

The **receipt-style conservation footer** is now LIVE in three places. It's the render-truth invariant made VISIBLE to the user:

1. **32.4 essentials drilldown** (commit `b49bf66`) — Analysis tab tile → sub-screen → "Σ of parts = $TOTAL"
2. **32.6 reset confirm modal** (commits `5cf1c63` + `694b207`) — receipt with WILL CLEAR + WILL KEEP sections, each row labeled with `data-receipt-row` attribute, smoke spec walks them and asserts each row's promise against post-reset state
3. **32.5 hero breakdown** (commit `bfe4c96`) — "Where the $7,282 sits now" with paid + upcoming + free + stacked bar + "Σ $X + $Y + $Z = $7,282 ✓"

The pattern is now battle-tested. Should formalize as **INV-33** or similar in a future bundle:

> Every breakdown surface that derives from snap.X aggregates MUST render a conservation receipt showing the arithmetic literally, AND have a smoke spec asserting:
> (a) each displayed value matches the snap.X source
> (b) the receipt arithmetic holds (LHS sum === RHS total)
> (c) post-mutation values track the snap.X source live

This is the "render-truth invariant" — column 4's defining property. NOT YET FORMALIZED as a numbered invariant; pattern is ready to be when John approves.

---

## 4. Where we are RIGHT NOW (column 4 — ~90%)

| Piece | Status | Notes |
|---|---|---|
| 32.3 conditional spend source — Pass 1 (additions) | ✓ shipped `bd1c9f1` | autoActivate + manualActivation + isActive + getActiveSpendingTrips on intent schema |
| 32.3 Pass 2 (forecast trip-awareness) | **values call pending** | Needs John's call on per-day spend uplift assumption (ADR-worthy) |
| 32.3 Pass 3 (consumer migration + data fixes) | not started | Section-structure correction logged in audit addendum — keep PLAN dashboard sections SEPARATE per intent kind |
| 32.3 Pass 4 (phase out old stores) | not started | Deferrable indefinitely |
| **32.4 essentials substrate + drilldown** | ✓ shipped `b551f46` + `b49bf66` | Substrate + sub-screen + receipt; works end-to-end |
| **32.5 hero substrate + breakdown** | ✓ shipped `bfe4c96` | TONIGHT. Awaiting phone-verify. |
| **32.6 substrate + UI + Finding-1 fix** | ✓ shipped `3dbbf5f` + `5cf1c63` + `694b207` | TONIGHT. Awaiting phone-verify. |
| **Phase G Pass 1.a/b/c** | ✓ shipped `fad5e2b` + `7c76d34` + `f463c04` | Closes OPEN-BUGS #7 + #8. Strict-discretionary canonical family on MODEL. |
| Phase G remaining migrations | not started | ~12 inline-filter sites in lower-traffic surfaces. Lower priority. |
| 32.7 Pass 2 | not started | Remove `BRAIN.allocation.lock/unlock` + legacy storage #3 readers. Deferrable indefinitely; no functional cost. |
| 32.8 render-truth invariant | not started but PATTERN IS LIVE | The receipt pattern is now in 3 surfaces; ready to formalize as invariant when John approves |

---

## 5. Phone-verify queue — TOP PRIORITY for next session start

**Two unverified UX changes shipped tonight.** Each has a PASS/FAIL checklist embedded in its commit message. John will phone-verify on 380px Galaxy S23 Ultra Chrome PWA viewport.

### Phone-verify item A — Finding 1 bonus split (commit `694b207`)

**Open:** PLAN canvas → ⋯ overflow → "Reset cycle…"

**PASS:**
- [ ] WILL CLEAR section shows row `Bonus inclusion ✓ active` (red side)
- [ ] WILL KEEP section shows row `Bonus amount $1,341` (green side; or your actual bonus amount)
- [ ] Cancel → state unchanged
- [ ] Reopen modal → tap `Reset cycle` → bonus.included flips to false BUT bonus.amount + .status preserved
- [ ] Plan dashboard now shows "+ Add bonus" affordance (de-included)
- [ ] Tapping "+ Add bonus" re-includes with the ORIGINAL amount auto-filled (because amount preserved)

**FAIL** (any of):
- Old combined row `Bonus included ✓ included ($X)` reappears
- Bonus amount = $0 after reset (means amount was wiped)
- Lock/Override rows broken

### Phone-verify item B — Finding 2 hero breakdown (commit `bfe4c96`)

**Open:** PLAN tab → tap "Payday Plan" → canvas opens → scroll past essentials grid

**PASS:**
- [ ] Panel header reads `Where the $7,282 sits now` (or your real money-coming-in figure)
- [ ] 3 lines visible with dots: solid (paid) · hollow (upcoming) · highlighted (free)
- [ ] Line amounts sum to money-coming-in total
- [ ] Stacked bar below 3 lines with segments scaled to $
- [ ] Receipt line: `Σ $X + $Y + $Z = $7,282 ✓`
- [ ] Account-balance-today row at bottom shows real balance (e.g. `$1,113.61`)

**FAIL** (any of):
- Old `🎯 Your free money this cycle $429` panel still appears (means cache or render path broken)
- Receipt arithmetic doesn't hold (sum ≠ total)
- Stacked bar missing or wrong proportions
- Account balance row missing

---

## 6. Tonight's session — 13 commits, all pushed

```
bfe4c96  feat(plan): Bundle 32.5 — hero "where the money sits" breakdown + lifecycle substrate
694b207  fix(plan): Bundle 32.6 Finding 1 — split bonus inclusion/amount; receipt-vs-reality smoke
6e1ded8  docs(design): vocabulary alignment principle — industry-standard terminology preferred
bd1c9f1  feat(plan): Bundle 32.3 Pass 1 — intent activation fields (additions only)
5cf1c63  feat(plan): Bundle 32.6 UI — Reset cycle overflow menu + receipt modal (copy locked)
f463c04  refactor(model): Phase G Pass 1.c — recentPace strict filter; closes OPEN-BUGS #8
7c76d34  refactor(analysis): Phase G Pass 1.b — renderCutSliders cycle-bound; closes OPEN-BUGS #7
fad5e2b  feat(model): Phase G Pass 1.a — strict-discretionary canonical family on MODEL
b49bf66  feat(analysis): Bundle 32.4 essentials drilldown — sub-screen + render-truth receipt
dad715d  docs(audit): bucket/goal/trip canonicalization + existing undo button investigations
cd7fc8f  docs(audit): Phase G filter-scatter investigation
3dbbf5f  feat(plan): Bundle 32.6 substrate — BRAIN.plan.resetCycle canonical writer
b551f46  feat(plan): Bundle 32.4 substrate — snap.derived.{essentialsBreakdown, discretionaryBreakdown}
```

### Investigation docs created tonight (worth reading at session start)

- `docs/audit/2026-05-19-savings-target-canonicalization.md` — 6-store map of "savings target" state · `S.planIntents` discovery (Bundle 28 Phase 0 shipped canonical store) · 7 decisions answered + Pass 3 section-structure addendum
- `docs/audit/2026-05-19-existing-undo-button-investigation.md` — 3 distinct undo mechanisms (transactional toast · canvas single-action · resetCycle nuclear) · 4 UI integration options · 3 confirm-modal copy drafts · 5 decisions answered
- `docs/audit/2026-05-19-phase-g-filter-scatter-audit.md` — 5 filter variants observed · canonical helper proposal · maps to OPEN-BUGS #6B/#7/#8/#17 · Option B (extend MODEL with strict-discretionary family) confirmed
- `docs/audit/2026-05-19-bundle-32-scenario-sweep.md` — 11 scenarios + 33 step assertions · catalogs architectural divergences
- `docs/audit/2026-05-19-state-of-project.md` — overall inventory · BRAIN bubble coverage · invariant ledger · OPEN-BUGS map
- `docs/adr/2026-05-19-invariant-lockdown.md` — INV-27/29/30/31/INV-33-shape dispositions
- `docs/adr/ADR-bundle-32-7-lock-state-canonicalisation.md` — three lock stores + recommended migration
- `docs/design/2026-05-19-vocabulary-alignment-principle.md` — industry-standard terminology principle (Rainy Day Fund > Freedom Buffer as first instance)

---

## 7. Invariant ledger (30 shipped, 0 pending)

```
INV-01..05    cash/balance conservation                                  ✓
INV-06..07    net worth                                                  ✓
INV-08..10    free-money this cycle                                      ✓
INV-11        cross-surface coherence                                    ✓
INV-12..26    write-site discipline                                      ✓
INV-27        negative balance write-time guard (30s TTL token)          ✓ tonight via f668227 (last session)
INV-28        bucket destination free-money gate                         ✓
INV-29        plan lock narrow semantics                                 ✓ shipped 6db5498 (last session)
INV-30        FX fee separate transactions (dormant — no UI surface yet) ✓ shipped 0f7b366 (last session)
INV-31        round-up timing immediate (Guardian anti-pattern rule)     ✓ shipped dd9d089 (last session)
INV-32        savings over-allocation write-time refusal                 ✓
INV-33-shape  always-allow-improvements                                  KILLED (superseded by INV-32 clause)
```

**Pending: 0.** All 5 RESERVED slots resolved.

**Future invariant candidate (ready to formalize):** the **render-truth invariant** — receipts conserve, snap.X agreement, smoke-asserted. Pattern is LIVE in 32.4 drilldown + 32.6 reset modal + 32.5 hero breakdown. Awaiting John's approval to number + document.

---

## 8. Open work (across all categories)

### Awaiting John's input
- **Phone-verify items A + B** (above) — top of next session
- **32.3 Pass 2 forecast values call** — per-day trip spend uplift assumption (ADR-worthy)

### Mechanical (CC can drive autonomously)
- **Phase G remaining migrations** — ~12 inline-filter sites in lower-traffic surfaces (cumulative drift, low individual impact). Pattern locked; per-commit migration shape established.
- **32.3 Pass 3** — consumer migration from `PLAN.getTrips/getGoals` to `BRAIN.plan.intent.byKind`. PLAN dashboard keeps 4 SEPARATE sections per kind (NOT consolidated — per addendum in canonicalization audit).
- **32.3 Pass 3 data fixes** — Darwin bucket creation · Freedom→Rainy Day Fund rename · Property Deposit hybrid linkedDebtId. All values calls John approved.
- **32.8 render-truth invariant formalization** — number it, document it, add Guardian rule that flags receipt surfaces without smoke spec.

### Deferred indefinitely (no functional cost)
- **32.7 Pass 2** — remove `BRAIN.allocation.lock/unlock` + legacy `slyght_payday_plan.locked` flag readers. Pass 1 hides the dual storage behind the canonical writers; Pass 2 removes the dead code.
- **32.3 Pass 4** — phase out `PLAN.getTrips/getGoals` once 0 readers remain.

### OPEN-BUGS state
- 40 sections total · ~17 still open (was 19 pre-session)
- **#7** closed by Phase G Pass 1.b (`7c76d34`)
- **#8** closed by Phase G Pass 1.c (`f463c04`)
- **#6B + #17** substantially-mitigated by Phase G substrate; remaining work is per-surface migrations
- **FR-03** AI `update_balance` overshoot — STILL OPEN, blocks AI layer trust. Bundle 33 candidate.
- **FR-06** payday countdown 3 different values — STILL OPEN. Violates INV-14.
- **FR-07** debts sub-screen vs canvas — STILL OPEN. Violates INV-11/INV-18.

---

## 9. Verification state — current baseline

- **92/92 smoke specs** passing
- **12/12 scenarios** A-L passing (`scripts/scenario-walk.js`)
- **Guardian (4 layers)** all PASSED at tip
- **Hash-grounded Haiku visual flow verifier** PASSED on scenario L last run (lock-flow integration test)

Smoke files (under `tests/smoke/`):
```
_helpers.smoke.js              — fixture seed + boot helper
allocation-framing.smoke.js
analysis-essentials.smoke.js
autodebit-batch.smoke.js
diagnostics.smoke.js
essentials-drilldown.smoke.js          ← 32.4 drilldown receipt-vs-reality
essentials-lifecycle-split.smoke.js    ← 32.5 substrate conservation
intent-activation.smoke.js              ← 32.3 Pass 1 activation matrix
inv27-negative-balance.smoke.js
inv29-plan-lock-semantics.smoke.js
inv30-fx-fee.smoke.js
inv31-roundup-timing.smoke.js
inv32-over-allocation.smoke.js
phase-g-discretionary-canonical.smoke.js  ← strict-discretionary canonical family
plan-hero-money-breakdown.smoke.js     ← 32.5 hero receipt-vs-reality
plan-lock-unlock.smoke.js
plan-reset-cycle.smoke.js
reset-cycle-ui.smoke.js                 ← 32.6 receipt-vs-reality including Finding-1 fix
snap-derived-allocation.smoke.js
snap-derived-breakdowns.smoke.js       ← 32.4 substrate conservation
transaction-paths.smoke.js
```

**To run regression locally:** `npm run smoke` (~50s) · `node scripts/scenario-walk.js` (~10s) · `npm run guardian` (~3s).

---

## 10. Architecture quick-reference

### BRAIN bubbles (16 operational)

`BRAIN.audit` · `BRAIN.balance` · `BRAIN.selfTest` · `BRAIN.devInspect` · `BRAIN.config` · `BRAIN.allocation` (legacy lock state; deprecated post-32.7) · `BRAIN.plan` (canonical + tickItem + lock/unlock/isLocked + resetCycle + intent.{isActive, getActiveSpendingTrips, setActivation}) · `BRAIN.assets` · `BRAIN.chat` · `BRAIN.cycle` · `BRAIN.savings` · `BRAIN.summary` · `BRAIN.dashboard` · `BRAIN.transaction` (recordWithAllocation envelope — covers 9 write sites) · `BRAIN.bills` (getThisCycle + processAutoDebits + markPaid) · `BRAIN.debts`.

### `snap.derived` canonical reader (the dominant column-4 substrate)

```
snap.derived = {
  // Bundle 32.1 — allocation breakdown
  surplus, allocatableToSavings, currentBalance, projectedEndBalance,
  essentialsTotal, remainder, allocatedTotal, stillToAllocate,
  savingsOverAllocated,
  // Bundle 32.4 — structural breakdown
  essentialsBreakdown: { bills, debts, dailyLiving, provisions },
  discretionaryBreakdown: { savings, knownUpcoming, stillToAllocate },
  // Bundle 32.5 — lifecycle split
  essentialsPaidTotal, essentialsUpcomingTotal,
}
```

**Conservation invariants** (all smoke-asserted):
- `essentialsBreakdown.sum === essentialsTotal`
- `discretionaryBreakdown.sum === remainder`
- `essentialsTotal + remainder === totalToPlan`
- `essentialsPaidTotal + essentialsUpcomingTotal === essentialsTotal`
- `paidTotal + upcomingTotal + remainder === totalToPlan` ← the 32.5 hero receipt

### `MODEL` strict-discretionary canonical family (Phase G)

```
MODEL.todayDiscretionarySpend       (strict — computeSpentInRange)
MODEL.weekDiscretionarySpend
MODEL.cycleDiscretionarySpend
MODEL.cycleDiscretionaryByCategory  (the categorized breakdown — closes #7)
```

Existing lax fields (kept for backward-compat during migration): `MODEL.todaySpent` (already strict), `MODEL.weekSpent` (lax — `getDiscretionarySpend` 4-cat exclusion), `MODEL.cycleSpent` (lax).

Consumers migrate from lax → strict per-commit. Closes Phase G; eliminates 15+ inline-filter divergence.

### `S.planIntents` canonical store (Bundle 28 Phase 0 + 32.3 Pass 1 additions)

```
S.planIntents[] = [{
  id, name, emoji,
  kind: 'trip'|'goal'|'provision'|'buffer',
  targetAmount, startDate, endDate, bucketId, category, notes,
  priority, archived, meta, createdAt, updatedAt,
  // Bundle 32.3 Pass 1 additions
  autoActivate,           // bool, default true
  manualActivation,       // 'on' | 'off' | null
}]
```

Readers: `BRAIN.plan.intent.{get, list, byKind, byBucket, isActive, getActiveSpendingTrips}`. Writers: `add, update, remove, setActivation`.

Pass 3 will migrate ~20 sites from legacy `PLAN.getTrips/getGoals` to `BRAIN.plan.intent.byKind`. **PLAN dashboard sections stay SEPARATE per kind** (4 sections; not consolidated).

### Lock state (post-32.7 Pass 1)

`BRAIN.plan.lock(opts, source)` + `BRAIN.plan.unlock(source)` + `BRAIN.plan.isLocked()` are the canonical writers/reader. All 5 call sites migrated. Dual-store sync to `BRAIN.allocation` happens inside the writer (legacy compat). After 32.7 Pass 2 (deferred), `BRAIN.allocation` lock state gets removed.

---

## 11. The autonomy contract (operating mode — current as of session end)

John's directive established mid-session: **drive scope, order, timing within approved pieces. Surface ONLY when a values judgment is required.**

### What CC drives autonomously
- Implementation patterns
- LOC budgets
- Test coverage depth
- Commit shape + granularity
- Whether to add Guardian rules
- Wall-clock pacing
- Investigation findings → audit docs (no code, surface for review)

### What requires John's surface BEFORE coding
- **Schema decisions with UX implications** (enum values, mode names, naming conventions)
- **Anything that changes what the user sees** (new numbers · changed numbers · layout changes)
- **Equally-defensible architectural patterns** where reasonable people disagree
- **Modal copy** — verbatim text before commit
- **Architectural divergence from an approved ADR**

### Halt conditions
- P0 data-integrity bug (real money math wrong) — halt + surface immediately
- Unexpected scope blowup (3hr → 6hr) — halt at natural break
- Substrate gap reveals migration is genuinely hard — surface scope options
- Smoke regression that can't be fixed in-session — halt + surface

### Surface format
1. State the finding
2. Show the data (counts · file:line refs · code snippets)
3. Present 2-3 options with my recommendation
4. Wait for direction

### Trust pattern (established this week)
- **Receipt-style modals** with `data-receipt-row` attributes + smoke specs that walk the rendered rows and assert each one's promise against post-mutation reality
- **Conservation footers** that render the math LITERALLY (`Σ $X + $Y + $Z = $TOTAL ✓`)
- **Render-truth invariant** — what the user sees IS what snap.X says IS what the math actually computes

---

## 12. Non-negotiable rules (from CLAUDE.md §8)

- **No bypassing canonical writers.** Every `S.X` mutation via `BRAIN.<domain>.<verb>`.
- **Source tags on every write.** From `BRAIN.SOURCES`.
- **Audit-log every dollar move.** With old, new, source, timestamp.
- **No native `confirm()` / `alert()` in flows.** Use `EDIT_MODAL.openCustom`.
- **44×44 minimum touch target.** Test viewport 380×660px.
- **Plain English.** "Living money" not "discretionary spend ratio."
- **Real names where known.** "Woolworths Kirrawee" not "Groceries."
- **Every number on screen is tappable.** Tap → explainer modal.
- **No commits with failing Guardian.** Full Guardian: `npm run guardian` runs all 4 layers.
- **No commits without phone-verify on 380px.** (Or surface PASS/FAIL block in commit if UI-change.)
- **Math invariants across surfaces.** Cross-surface coherence is required.
- **Every fix paired with a Playwright spec.** No fix ships without a regression spec.
- **Fixture currency.** `state-snapshot.json` must reflect most recent canonical state post-reconciliation.
- **Audit trace requirement.** Vision-based audit scripts MUST write per-API-call JSONL.
- **Investigate before coding for non-trivial changes.** Surface findings BEFORE implementing fixes when the work touches handlers, lock workflow, canonical writers, or invariants.

### Things to NOT do
- Don't propose framework migrations (React/Vue/Svelte/Vite/TypeScript)
- Don't reorganize `index.html` into `/src` directories
- Don't trust in-app AI `update_balance` tool until FR-03 lands (overshoots by ~$7k)
- Don't add TypeScript
- Don't run `npm run build` (doesn't exist)
- Don't init swarms or hive-minds
- Don't add features John didn't ask for

---

## 13. The vocabulary-alignment principle (new this session)

Per `docs/design/2026-05-19-vocabulary-alignment-principle.md`:

> slyght's user-facing vocabulary should match financial-planning industry standards where a standard exists. Inventions only when the invented term encodes meaning the standard term lacks.

**First instance:** "Freedom Buffer" → "Rainy Day Fund" (industry standard).

**Open instances flagged but not yet renamed:** see doc § "Open instances flagged but not yet renamed."

When proposing renames in future bundles, apply the 5-step decision tree in §"How to apply this principle."

---

## 14. Tactical recovery — exact session-resume protocol

For a new CC session resuming this work:

1. **Read this file first.** (You're doing that.)
2. **Read `CLAUDE.md`** (project root, ~5 min) for the standing rules.
3. **Read `docs/bundle-32-trajectory.md`** (~2 min) for the substrate thesis.
4. **Skim `git log --oneline -20`** to see what just shipped.
5. **Check `git status`** — should be clean post-push.
6. **Run `npm run smoke`** if you want to verify the baseline (~50s, 92 tests).
7. **Open the phone-verify queue (§5 above).** Wait for John's PASS/FAIL.
8. **If PASS:** ready for next direction. Highest-leverage next pieces:
   - 32.3 Pass 2 forecast — values call needed first
   - Phase G remaining migrations — mechanical, ~30 min per surface
   - 32.8 invariant formalization — small, locks in the trust pattern
9. **If FAIL on phone-verify:** halt + diagnose. Fix forward, don't revert blindly. Smoke + scenario-walk are the regression net.

### Things to ask John at session start (if he doesn't lead)
- Did Finding 1 phone-verify PASS or FAIL? (bonus split modal)
- Did Finding 2 phone-verify PASS or FAIL? (hero breakdown panel)
- 32.3 Pass 2 trip-uplift values call — ready to decide? (per-day trip spend assumption)

### Don't re-litigate
- Vocabulary principle (locked in this session)
- 32.3 4-mode taxonomy (`trip|goal|provision|buffer` — locked, no rename)
- 32.6 receipt copy (locked this session)
- Phase G Option B (extend snap.derived/MODEL + migrate consumers — locked, in progress)
- Receipt-as-trust pattern (now standard; propagates to future drilldowns)

---

## 15. What this whole project's heading toward

- **Mid-June:** substrate complete (32.7 Pass 2 + 32.3 Pass 2/3/4 + Phase G remaining + 32.8 invariant). All 4 columns ✓. All 30+ invariants enforceable. Architecture diagnostic closed.
- **Bundle 33 (mid-June onward):** AI layer migration. `update_balance` tool fix (FR-03) · cloud sync via GitHub Gist (Bundle 23 plan) · training-plan vertical scoped · daily nudges working.
- **July:** AI layer cohesive. Multi-device sync. Training-plan bubble. Cross-vertical accountability nudges.
- **Early August:** Confidence pass. Full scenario sweep on all bubbles. Phone-verify pass on real reconciled state.
- **9 August (City2Surf):** App is reliable enough that John isn't context-switched away from the run by an app bug. Both finance + training surfaces work coherently. The platform is trusted enough to use without questioning.

If at any point the substrate work stops compounding into the AI layer thesis, surface it. The substrate is a means, not an end.

---

## 16. Open questions / unresolved threads

- **Render-truth invariant numbering.** Pattern is live in 3 surfaces. Should it be INV-33 or INV-34 or something else? Document body needs drafting. Guardian rule could flag receipt surfaces without smoke spec.
- **32.3 trip uplift formula.** When forecast reads `getActiveSpendingTrips()`, what's the per-day uplift assumption? `trip.targetAmount / trip.days`? Historical spend pattern? Hybrid? John's values call.
- **Phase G remaining 12 sites.** Mechanical migration; could batch in one session. Each surface changes user-visible numbers slightly (drops drift). Values call on whether to batch or trickle.
- **Bundle 23 cloud sync via GitHub Gist.** Locked architectural decision; ~2-3hr work. Bundle 33-ish.
- **City2Surf training-plan vertical.** Scope not yet specced. Likely Bundle 33-34.

---

## 17. Where to look for context

```
CLAUDE.md                                       project root — read at every session start
docs/bundle-32-trajectory.md                    substrate-completion thesis (~2 min read)
docs/audit/2026-05-19-state-of-project.md       overall inventory (~5 min read)
docs/audit/2026-05-19-savings-target-canonicalization.md   for 32.3 work
docs/audit/2026-05-19-existing-undo-button-investigation.md  for 32.6 work
docs/audit/2026-05-19-phase-g-filter-scatter-audit.md  for Phase G work
docs/audit/2026-05-19-bundle-32-scenario-sweep.md  for scenario coverage map
docs/adr/2026-05-19-invariant-lockdown.md       for invariant dispositions
docs/adr/ADR-bundle-32-7-lock-state-canonicalisation.md  for lock work
docs/design/2026-05-19-vocabulary-alignment-principle.md  for naming decisions
FINANCIAL-INVARIANTS.md                         the 30 invariants + bodies
FEATURE-MAP.md                                  surface atlas (partial v2 migration)
OPEN-BUGS.md                                    40-section bug ledger
CHANGELOG.md                                    recent bundle history
scripts/scenario-walk.js                        12 user journeys + step-level assertions
scripts/lock-flow-verify.js                     Haiku visual flow verifier
scripts/walkthrough-audit.js                    vision-audit infrastructure
tests/smoke/                                    21 smoke spec files
state-snapshot.json                             reconciled fixture (2026-05-19 dump)
```

---

## 18. Trust check — what we've built tonight that makes the substrate real

- Three receipt-pattern surfaces with smoke specs walking displayed rows and asserting them against reality
- Conservation invariants spanning lifecycle + structural + receipt layers
- A vocabulary-alignment principle that prevents future translation tax against the AI layer
- An autonomy contract that lets CC ship mechanical work fast while surfacing the human-judgment decisions
- A scenario walker that catches order-dependent breakage at machine pace
- A hash-grounded Haiku visual verifier that doesn't get fooled by label-prior bias
- An invariant ledger with zero pending decisions for the first time since Bundle 30

What this means: the platform is provably honest to itself + the user. Receipts conserve. Numbers agree across surfaces. Lock state has one truth. Cycle math holds.

The trust scaffold for the AI layer is in place.

---

**End of handoff. Next CC: read this file, run smoke, await John's phone-verify, pick the next direction from §8.**
