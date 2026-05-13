# Step 3 — Parallel-Implementation Divergence Map

> Consolidated audit of every place where the same logical value is
> computed in two or more code paths. Built from existing project
> docs (PROJECT-EXTRACT § 4.4, OPEN-BUGS) plus a fresh code search
> for unlogged candidates. Working artifact for fix triage; not a
> mission spec.
>
> **Date:** 2026-05-06
> **Scope:** read-only audit, no commits
> **Source files consulted:** `index.html` (HEAD = `d0bc82e`),
> `OPEN-BUGS.md`, `PROJECT-EXTRACT-2026-05-05.md` § 4.3 / § 4.4,
> `MISSION-DAYSLEFT-MIGRATION.md`, `MISSION-MISLEADING-MATH.md`

---

## Key reframe before reading the table

`PROJECT-EXTRACT § 4.3` documents that **two helpers can encode
two different concepts using the same code shape**, and that's
intentional, not a bug:

| Concept | Helper | Filter | Use case |
|---|---|---|---|
| Discretionary spend (broad) | `getDiscretionarySpend` | LAX (4 cats) | "user's net outflow excluding structural transfers" |
| Discretionary spend (strict) | `computeSpentInRange` | STRICT (8 cats) | "what the user is actually spending on cuttable categories" |

This means some "divergences" are actually two metrics labeled the
same way. Fix is to **distinguish the labels**, not to converge the
math. Other divergences are genuine parallel-impl bugs where the
math should be the same and isn't. The map below distinguishes
the two classes.

---

## Inventory — known parallel implementations

### A. Genuine parallel-impl bugs (math should converge)

| # | Concept | Canonical | Inline / parallel sites | Tracked | Status | User-visible? |
|---|---|---|---|---|---|---|
| A1 | Days until payday | `MODEL.daysToPayday` (L2275) | `daysLeft(S.payday)` × 12 sites: L1482, 1507, 1518, 1525, 1760, 1831, 2166, 2889, 3198, 3496, 5098, 5666 | OPEN-BUGS #22 | Open. MI-15 catches at runtime. Mission F (`MISSION-DAYSLEFT-MIGRATION.md`) specs the migration but not yet shipped. | Indirect — only when Feb-31 clamping or payday-morning gating produces visible drift |
| A2 | Daily safe-to-spend | `getDynamicDailyBudget()` | `renderAlerts` adjustedDay (L3016), `checkAfford` (L5347) — both subtract `getDynamicBuffer()` and bucket totals which canonical no longer does | AUDIT-FOUNDATION § 1.1 | NOT in OPEN-BUGS. Pre-Bundle-B remnant. | Yes — alerts and afford checks can disagree with the headline daily limit |
| A3 | Today's spending | `MODEL.todaySpent` | Footer strip `updatePersistentStrip`, dashboard "Over by $X today" alert renderer, Analysis tab today display — three independent computations | OPEN-BUGS #17 | Open. Specs a 2-commit fix: repoint all three to `MODEL.todaySpent` + add Layer 1 rule `today-spend-renderers-consume-MODEL.todaySpent`. | **Yes, daily.** John's phone 2026-05-05: footer `$22`, dashboard `Over by $44`, Analysis `$74.09` — same concept, three numbers. |
| A4 | Daily living-cost (forecast) | (no canonical — that's part of the problem) | Three forecast tiles: `$38.65`, `$41.56`, `$16.56` — different filter scopes / windows / categorizations | OPEN-BUGS #15 | Open. Layer 2 calibration target. Likely fix: name two distinct concepts (`MODEL.minDailySpend` vs `MODEL.recentPace`) and repoint. | **Yes, daily.** Visible on John's phone 2026-05-05. |
| A5 | All-time category sum | (no canonical — that's part of the problem) | `renderTrend` (~L5060), `renderCatBreakdown` (~L5074), category-overspend flags (~L4960) | OPEN-BUGS #6 | Open. Same family as A3. | Indirect — affects Trend tab and category cards |
| A6 ⚠️ | Net worth (projected) | `calculateNetWorth()` (L1753) | **`PREDICTOR.project()` inline** at L8255: `bal + (S.wrxValue\|\|0) + getBucketTotal() - cc - car - activeDebts` | **NOT in OPEN-BUGS** | Newly surfaced (Step 3.2b). Three concrete divergences from canonical: (1) `mumAccount` ignored entirely (~$5,681 off if non-zero per memory), (2) WRX `sold` status not respected (uses raw `S.wrxValue`), (3) debt filter loosened (no `d.amt > 0` check). | Yes — projection card in dashboard shows NW values that won't match the headline NW |
| A7 | Live balance fallback | `getLiveBal()` (L1658) | Inline `S.bal \|\| 0` / `state.bal \|\| 0` at L2453, L2725 | NOT in OPEN-BUGS | Minor. Edge-case divergence only when `S.bal` is undefined. | No |
| A8 | paydayDate (second instance) | (intended canonical) | Parallel implementation pattern, second occurrence | OPEN-BUGS #31 | Open. | Unknown — needs surfacing |

### B. Labeling bugs (different metrics, same UI copy)

| # | Surface | What it shows | What it actually computes | Trust impact |
|---|---|---|---|---|
| B1 | Dashboard pace tile (L3878) | "Running $56.29 over pace this week ⚠️" | `abs((weekSpent / 7) − dailyBudget)` over **rolling 7-day window** using **LAX filter** (`getDiscretionarySpend`). Reads as: "your daily-avg over the last 7 days vs your daily budget." | Same copy fronts two different metrics → user can't tell why numbers don't match between tabs |
| B2 | Bills calendar pace tile (L5303) | "Running $100.80 over pace — slow down" | `spentSoFar − (dailyRate × daysSoFarInWeek)` over **calendar Mon-to-now** using **STRICT filter** (`computeSpentInRange`). Reads as: "you're $X past where you should be by this point in the week." | Same as above — different question, same label |

**This is the screenshot finding from earlier in this session** ($56.29 vs $100.80). It maps to OPEN-BUGS #8 but #8 only names the filter divergence; the **time-window divergence** (rolling 7d vs calendar Mon-to-now) is a second axis. Per § 4.3 framing, both filters may be intentionally different — but the labels imply they should match. **Worth amending #8 with this distinction before its fix is scheduled**, because #8's current proposed fix ("change dashboard to strict like 'spent today'") would make B1 and B2 share a filter but they'd still differ on time window. The trust problem persists either way unless labels distinguish them.

### C. Two intentional helpers (not bugs — flagged for awareness)

Per PROJECT-EXTRACT § 4.3 — these are NOT to be merged:

| Concept | Helpers | Filter |
|---|---|---|
| Discretionary spend in range | `getDiscretionarySpend` (lax) vs `computeSpentInRange` (strict) | Lax includes Bills/Transfer/Car Loan/CC Payment; strict excludes |
| Bills-due iteration | `_isDueInMonth` inside `getThisWeekProjection` vs global `isBillDueThisMonth` | Intentional copy for date-range iteration |
| Coverage check | `_covers` inside `buildCalendarEntries` vs global `isBillCoveredByDebt` | State-pure vs global; planned to delete global once Bills tab fully through MODEL |

**Layer 1 candidate (per § 4.3):** Static rule that any tile/renderer
explicitly opts into one helper or the other. Right now nothing
prevents a new tile from picking the wrong one.

---

## What's missing from the existing audit

PROJECT-EXTRACT § 4.4 is from 2026-05-05. Things not in § 4.4 that
this map adds:

1. **A6 — PREDICTOR.project net-worth inline** (newly found, biggest miss)
2. **A7 — `liveBal` inline fallback pattern** (minor)
3. **The time-window axis of B1 vs B2** (extends OPEN-BUGS #8)
4. **The labeling-vs-computation distinction** as a separate bug class

---

## Recommended fix order (engineering-cost vs trust-impact)

Sorted by *user-visible impact per unit of fix complexity*. Each
item has a clean prior-art mission spec or an obvious shape; none
require new architectural decisions before starting.

| Order | Item | Why first | Effort estimate |
|---|---|---|---|
| 1 | **A3** — Cross-tile today's spend (#17) | Visible on John's phone every day. Three numbers for the same concept is the loudest trust killer. Fix is mechanical (repoint to `MODEL.todaySpent`). Layer 1 rule already specced. | Small (2 commits per #17 spec) |
| 2 | **A4** — Three different daily-cost figures (#15) | Same daily visibility as A3. Slightly bigger because requires naming the two distinct concepts before repointing. | Small-Medium |
| 3 | **B1/B2** — Pace tile labeling | Direct screenshot evidence of trust loss ($56.29 vs $100.80). Cheapest possible fix — change copy to "Daily avg vs budget" and "Week-to-date vs pace" so the difference is named. No math change required. | Tiny (copy change) |
| 4 | **A6** — PREDICTOR.project net-worth | Newly surfaced — should at minimum get a `MathInvariant` to detect (mirroring MI-15 for daysLeft). Migration to `calculateNetWorth()` is the proper fix. | Small (one function rewrite) |
| 5 | **A1** — daysLeft migration (#22, Mission F) | Already specced and ready. MI-15 catches divergence at runtime so it's not actively bleeding. Larger effort because 12 call sites. | Medium (Mission F sized) |
| 6 | **A2, A5, A8** — remaining divergences | Lower visibility, can ride alongside the above as opportunity arises. | Variable |

---

## Systemic recommendation

The pattern across these is: **runtime invariants catch divergence
where they exist**. MI-15 (Mission F) catches A1. OPEN-BUGS #17
proposes the same pattern for A3 (Layer 1 static rule). The
recommended generalization:

For each concept in the table above that *should* converge (Class A),
add a `MathInvariant` that fires when two computation paths produce
different values for the same input state. This is the "numbers
reconcile" check from earlier in the session — it's already the
right pattern, MI-15 is the proof of concept, and it should be the
discipline going forward whenever a new canonical helper is named.

Layer 1 static rules (per § 4.3 candidate) handle the
*compile-time* version: prevent new tiles from inlining when a
canonical exists. Layer 2 invariants handle the *runtime* version:
detect when existing parallels disagree.

Both gates together = no parallel-impl bug ships unnoticed.

---

## What this map is NOT

- Not a mission spec — no STOP gates, no execution flow
- Not committing anything — `index.html` is unchanged
- Not picking which fixes to ship — the order above is a *recommendation*, John retains the call
- Not closing OPEN-BUGS items — those remain authoritative; this map cross-references them

---

## Next decision points (Step 3.3+)

If this map is accepted as the working view:

- **3.3** — Diff the computation logic for each Class A item to confirm whether they SHOULD converge (vs being § 4.3-style intentional divergences misclassified)
- **3.4** — Per true Class A divergence: surface code with line numbers, surface user-facing impact (which surface displays which value)
- **3.5** — Scheduling decision: which fixes ship in what order (likely deferred until you have bandwidth — this is product-call work, not engineering-call work)

Per discipline: stopping here. Not initiating 3.3 without explicit go.

---

## Addendum (added after live Layer 1 + Layer 2 runs)

Running `guardian-static.js` against `index.html` produced three findings relevant to this map:

### Newly surfaced parallel-impl candidates

| # | Concept | Site | Filter | Class |
|---|---|---|---|---|
| A9 | "Recent discretionary" for cut suggestions | `renderSurvivalForecast` L3424 | Inline `['Debt repayment','Savings','Loan','Income','Bills']` — 5 cats. Matches NEITHER lax (4 cats) nor strict (8 cats). | A — genuine parallel-impl |
| A10 | Inline category filter array | `openQuickLogModal` L5728 | Inline 3-cat array | A — genuine parallel-impl |

A9 is fed into the "Meal prep instead of buying lunch — saves ~$X this week" cut suggestion. The X figure is computed against a third filter definition. The code already has an `allow` comment acknowledging it should migrate to `getDiscretionaryByCategory(weekAgo, now)` post-Layer-2.

The fact that Layer 1 *correctly flagged both sites* is the most important finding: **the guardian works, the rule class is well-targeted, the bugs are visible to the static analyzer.** They're sitting at WARN, not ERROR — that's why they don't block.

### Layer status (verified 2026-05-06)

- Layer 1: 16 rules active, 30 warnings, 0 errors. Allow-list 23 entries (0 unused).
- Layer 2 runtime: 47/50 passing (3 known fixture-drift items per HANDOFF).
- Unit tests: 41/41 passing.

---

## Why this keeps happening — root cause

Three factors compound:

1. **Per-value canonicalization, not per-view.** Helpers exist for individual values (`MODEL.todaySpent`, `MODEL.daysToPayday`, `calculateNetWorth`). But views (especially Bills tab) compose multiple values, and even when each value is canonical, the *view* can present numbers that don't reconcile *with each other*. The view-as-system has no canonical structure.

2. **Static rules detect, don't enforce.** Layer 1 has rules that catch the parallel-impl pattern (proven this session — `no-third-discretionary-filter-array` flagged A9 and A10). But they fire WARN, not ERROR. So new instances ship anyway. Existing instances accumulate in the allow-list under "deferred."

3. **UI copy is freeform.** No registered vocabulary maps user-facing phrases to canonical data sources. Anyone can write "Running over pace" anywhere with any underlying math. Result: B1/B2 — same label, different metrics, and no compile-time signal.

## Systemic remediation — three layers of defense

### 1. Promote selected static rules from WARN to ERROR (cheap, immediate)
For the bug class that hurts user trust most — the parallel-implementation rules — change severity from WARN to ERROR. Existing instances get explicitly added to `audit/allow-list.json` with a tracking ID. New instances cannot ship. The discipline cost is one allow-list-update per legitimate exception.

**Candidate rules for promotion:**
- `no-third-discretionary-filter-array` (caught A9, A10)
- `no-bare-non-income-filter-on-txns` (the rule with the comment at L3419)
- Any RC2-anchored rule

### 2. View-Model pattern for the Bills tab (medium, big trust win)
One `BILLS_VIEW_MODEL` object, computed once per render, that holds the entire (today → payday) timeline as data. Every tile in Bills tab reads from it. No tile does its own date math, its own filter, its own "sum bills due in window."

Same pattern as `MODEL.todaySpent` but at the *view* level. Applies the canonicalization principle to view-level coherence, not just value-level.

Contents (sketch):
- Today's date, payday date, days between
- Live balance
- Bills before payday (deduped, paid-aware)
- Active debts before payday
- Income events before payday
- Running balance after each event
- Survival math (max-per-day) derived from the above
- Pace metrics (cumulative drift, rolling 7-day avg) — both computed from same source so labeling is the only thing that distinguishes them

### 3. Labeled-metric registry (longer-term, prevents recurrence)
Every user-facing money/time/count phrase maps to exactly one canonical computation. New Layer 1 rule: any UI string matching a registered phrase must read its data from the registry binding. Otherwise FAIL.

**Effect:** The *class* of "two surfaces with the same label, different math" becomes structurally impossible. Solves the B1/B2 labeling-bug class at commit time.

## Bills tab as fulcrum — specific recommendation

Bills tab is the operational surface — you use it to decide whether to spend. Other tabs are reference. Every minute Bills tab is untrustworthy has a real cost (decisions made on bad numbers).

Recommendation: rebuild Bills tab around its data, not its tiles. The current architecture is "screen with several tiles, each doing its own math." Better: a single timeline view of (today → payday) where every event with a dollar value (bill, debt, income, transaction) is on the timeline, and every tile is a different lens onto that timeline.

This gives:
- **Calendar** — when things happen (timeline rendered as month grid)
- **Running balance** — consequence (timeline rendered as cumulative chart)
- **Bills due this week** — filter on timeline (next 7 days, bill events)
- **Survival projection** — math derived from timeline (lowest-balance forecast)
- **Pace** — delta between expected and actual, derived from timeline

All from one source. Reconciliation becomes mechanical — if the calendar shows a $194 Optus bill on day 16, the running-balance tile shows -$194 on day 16, period. They cannot disagree.


---

## Architectural extension — view-model pattern generalizes upward

(Added 2026-05-06 after John's feedback session.)

The view-model pattern applies to *every* tab, not just Bills. And above the per-tab layer, two more layers complete the architecture: the Brain (cross-tab orchestration) and the Agent (AI assistant, future).

**Five-layer stack (bottom → top):**

1. **S (raw state)** — `bal`, `txns`, `BILLS`, `debts`, `savingsBuckets`, `paidBills`. The only mutable layer.
2. **MODEL (per-value canonical helpers)** — `todaySpent`, `daysToPayday`, `liquidNet`, `billsBeforePayday`, etc. Computed from S. Already partially exists.
3. **Per-tab view-models** — `DASH_VM`, `BILLS_VM`, `PLAN_VM`, `ANALYSIS_VM`. Each holds the timeline / structure / derived data its tab needs. Computed from MODEL. Doesn't exist yet — this is the gap the divergence map identified.
4. **The Brain** — cross-tab orchestration, alerts, recommendations, the financial state machine (PRE_PAYDAY / TIGHT / SURVIVAL / etc.). Currently scattered across `renderAlerts`, `getSurvivalMode`, `MathInvariants`, `PERSONALITY`, `CHARACTER`. Naming it as a layer consolidates the cross-tab reasoning.
5. **The Agent (future)** — AI assistant. Reads the Brain, suggests actions, executes with consent. Plugs in via the Anthropic API path that already exists in the codebase.

**Direction rules:** data flows upward (each layer reads only from below). Mutations happen only at S. All upper layers recompute from changes to S. This eliminates the parallel-implementation bug class structurally — there is exactly one path from raw state to any displayed value.

## Calendar as anchor — feature map and what each requires

Per John's feedback, the interactive calendar is the highest-leverage surface. Four feature requests, mapped to the work each requires:

| Feature | What it requires | Class |
|---|---|---|
| Edit bill frequency on calendar | Modal exposing all `freq` values; propagation rules for retroactive edits (product call needed) | UI + small schema |
| Afterpay / BNPL / pay-in-4 | New debt shape: `instalments: [{date, amount, paid}]`. Calendar renders each instalment as its own event. | Schema extension |
| Missed-payment detection | Detector that notices an expected event has passed without a corresponding transaction. Surfaces a banner/alert. | Brain-layer logic |
| Transaction upload + auto-match | Reconciliation engine: bank CSV import, fuzzy-match against expected timeline (vendor/amount/date), three buckets (confirmed / probable / unmatched), audit trail. | Significant new engine |

The first three are natural extensions of the BILLS_VM. The fourth is its own piece of work and deserves a dedicated mission spec — it's a reconciliation engine, not a UI feature. Trust impact is the highest of the four because every transaction gains provenance ("matched to Pet Insurance bill, day 6, confirmed").

