# Pass 3 phone-verify findings — PLAN allocation trip-awareness gap + trips-list display bug

**Date:** 2026-05-21
**Trigger:** John's phone-verify on commit `dd8dcdc` (Pass 3 ship). Two bugs surfaced.
**Status:** Investigation complete; values call pending; no code yet.

---

## TL;DR

**Bug 2 is a substrate gap, not a column-4 regression.** Pass 2 made `getSurvivalForecast` trip-aware (commit `e71c6fb`). The PLAN allocation calc (`snap.derived.{essentialsTotal, remainder, allocatedTotal, stillToAllocate}`) is a **separate code path** that was never in Pass 2's scope. Pass 2's ADR explicitly **deferred bucket coupling** ("feed trip-bucket remaining balance as an offset to the uplift") to Pass 3; Pass 3 then scoped consumer migration + renames + UI affordance, not the allocation math. So column 4 closed correctly for its scope — but PLAN allocation trip-awareness is an unscoped gap.

**Bug 1 is a 5-LOC display bug** — `_tripLegacyView` passes `meta.covered` through as-is after the Pass 2 schema upgrade (`[{name, amount}]`), but two legacy renderers stringify entries with `${c}` / `.join(', ')`.

---

## Bug 2 — PLAN allocation is trip-blind

### Code receipts

**The split paths.**

| Path | Trip-aware? | Reads | Where |
|---|---|---|---|
| `getSurvivalForecast` (Pass 2) | ✓ | `BRAIN.plan.intent.getActiveSpendingTrips(dayDate)` + `getUpliftPerDay(t)` per-day | `index.html:5811-5837` |
| `BRAIN.plan.getSnapshot` → `snap.derived` | ✗ | `floor × daysInCycle` static | `index.html:21110-21111`, `21164-21167` |

**Forecast path** (`index.html:5811-5837`):
```js
const perDayLivingCost = new Array(days);
for (let i = 0; i < days; i++) {
  const dayDate = new Date(today); dayDate.setDate(today.getDate() + i + 1);
  let uplift = 0;
  if (BRAIN.plan.intent.getActiveSpendingTrips) {
    const activeTrips = BRAIN.plan.intent.getActiveSpendingTrips(dayDate);
    for (const t of activeTrips) uplift += BRAIN.plan.intent.getUpliftPerDay(t);
  }
  perDayLivingCost[i] = uplift > 0 ? uplift : minDailyNeeded;
}
const minLivingCosts = perDayLivingCost.reduce((s, v) => s + v, 0);
```

**Allocation path** (`index.html:21110-21167`):
```js
const floor = +p.dailyLivingFloor || 30;
const livingTotal = floor * daysInCycle;           // STATIC. No trip awareness.
// …
const essentialsTotal = billsTotal + debtsTotal + livingTotal + _provsForMax;
const remainder       = totalToPlan - essentialsTotal;
const allocatedTotal  = savingsTotal + upcomingTotal;
const stillToAllocate = remainder - allocatedTotal;
```

`renderAllocateTile` (`index.html:26411`): `isOvercommitted = remainder < 0`. So "Over committed by $167" = `snap.derived.remainder ≈ -$167`, computed from a trip-blind `livingTotal`.

### Where Pass 2 said "later"

Pass 2 ADR (`docs/adr/ADR-bundle-32-3-forecast-trip-uplift.md:64-67`), Future work section:
> - Bucket coupling — feed trip-bucket remaining balance as an offset to the uplift, OR model bucket→cash transfers as positive inflows during trip days.

Pass 3 then scoped: consumer migration, Darwin canonical link, PD hybrid, RDF rename, $-per-covered form. **Bucket coupling at the allocation level: still deferred.**

### Why buffer change doesn't move "over committed" — by design, not bug

Modal handler `index.html:12625-12631`:
```js
const r = BRAIN.plan.setBufferFloor(amt, BRAIN.SOURCES.PLAN_BUFFER_FLOOR_EDIT);
if (!r.ok) return r;
renderPaydayLiving();
if (typeof renderPaydayPlanRoot === 'function') renderPaydayPlanRoot();
```
Re-render fires correctly. **The number doesn't move because `remainder` doesn't include buffer.**

Buffer only enters:
- `surplusVal = max(0, totalToPlan − bills − debts − upcoming − living − provisions − buffer)` (`index.html:21189`) → drives `allocatableToSavings`
- `maxAffordablePerDay = (totalToPlan − bills − debts − savings − upcoming − provisions − buffer) / daysInCycle` (`index.html:21137-21140`) → drives MAX PER DAY tile

`remainder` (the "over committed" source) is `totalToPlan − essentialsTotal`, and `essentialsTotal` is `bills + debts + dailyLiving + provisions`. **Buffer is excluded by design** — it's a savings-pool reserve, not a cycle obligation.

This is a mental-model mismatch, not a bug. But it's UX-breaking: John changed the buffer expecting the over-commitment to ease and saw nothing move. The label "over committed" implies "your obligations exceed your inflow" — buffer feels like an obligation.

### Is "$167 over committed" the right magnitude?

Today 2026-05-21 → next payday 2026-06-15 = ~25 days. Darwin = Jun 7-15 = 9 days. Floor ~$30/day → static `livingTotal ≈ $750`.

Three possible truths:

| Semantics | livingTotal | Direction vs current $167 |
|---|---|---|
| **A** Current (trip-blind) | $750 | over-commit $167 (baseline) |
| **B** Pass 2 forecast (uplift replaces floor during trip) | $30×16 + $100×9 = $1,380 | over-commit ≈ **$797 WORSE** |
| **C** Bucket-credited (trip days zero-out because savings.trip carries the cost) | $30×16 = $480 | over-commit ≈ **$103 BETTER** (probably not over-committed) |

The current number is wrong in BOTH directions depending on which semantics is correct. **The PLAN tile cannot answer "how much can I safely spend" today because the math doesn't know about the trip.**

---

## Bug 1 — Trip list renders `[object Object]`

**Root cause** — `_tripLegacyView` passes `meta.covered` array through with no shape adjustment:

`index.html:2420`:
```js
covered: Array.isArray(m.covered) ? m.covered : [],
```

After seedV27 ran, `m.covered = [{name:'flights', amount:0}, ...]`. Two renderers treat entries as strings:

`index.html:27282`:
```js
${trip.covered.map(c => `<span …>✅ ${c}</span>`).join('')}
```

`index.html:27337-27338`:
```js
trip.covered?.length
  ? 'Already covered: ' + trip.covered.join(', ') + …
```

Each `${object}` and `join(',')` invokes `Object.prototype.toString` → `[object Object]`.

**Fix:** translate `meta.covered` to `.name` strings inside `_tripLegacyView` (preserves legacy display contract), OR map to `.name` at both call sites. Recommend the former — single point of fix, legacy callers get back what they had pre-Pass-2 (string array). Post-substrate, those renderers will eventually consume canonical and the legacy view dies.

LOC estimate: ~3 lines. Smoke addition: 1 case (display non-empty, no "[object Object]" substring).

---

## Values call (Bug 2)

**The core question:** when a trip is active during a cycle, should the trip's daily cost be (A) added to per-day living, (B) zero-replaced because the trip bucket already holds the money, or (C) the net-of-bucket residual?

| Option | Semantic | Surface coherence | John's mental model fit | Substrate cost |
|---|---|---|---|---|
| **A** Propagate Pass 2 to allocation | uplift REPLACES floor during trip days | forecast = allocation (coherent) | "trips make me spend more" — pessimistic | low — copy forecast's per-day loop into snap |
| **B** Trip bucket covers, no daily during trip | floor × (daysInCycle − tripDays) | forecast ≠ allocation (diverges) | matches this bug report exactly | medium — special case in snap; forecast stays pessimistic |
| **C** Net-of-bucket residual (recommended) | `daily_during_trip = max(0, (target − covered − bucket.saved) / days)` | forecast = allocation if both adopt | matches model: covered + saved → 0; underfunded → real residual | medium — extend `getUpliftPerDay` to optionally net bucket; ~30 LOC + smoke |
| **D** Status quo + UX clarification | leave math, fix labels | unchanged | weakest fit | trivial — but doesn't solve "how much can I spend" |

**Recommendation: Option C.**

Reasons:
1. Single coherent semantics across forecast + allocation (cross-surface invariant; CLAUDE.md §7 financial-logic contract).
2. Matches John's mental model when buckets are funded: "Darwin is covered by trip budget" → daily living near zero during trip.
3. Graceful degradation when underfunded: residual shows the actual short John would feel.
4. Closes the "bucket coupling deferred" thread from Pass 2 ADR — substrate finally complete on this axis.
5. The bucket+covered+target conservation is testable: smoke spec asserts `bucket.saved + Σcovered + (uplift × days) >= target` after migration.

**Side decision needed** — buffer-in-essentials labeling:
- α (recommended): keep math as-is; relabel headline or add sub-line so "over committed" doesn't imply buffer is part of it. e.g. "Over committed by $X (allocations exceed money in). Buffer adjusts separately.".
- β: include buffer in `essentialsTotal`. Re-routes the whole conservation law and three smoke specs.

Recommend α — semantics are correct; UX label change is ~5 LOC.

---

## Recommended scope

**Bundle 32.3 Pass 2.5** (or 32.9 — number TBD): "trip-aware PLAN allocation + bucket coupling".

- Extend `BRAIN.plan.intent.getUpliftPerDay(intent, opts={})` with `opts.netOfBucket=true` mode → reads `S.savingsBuckets` for the linked bucket and returns `max(0, (target − Σcovered − bucket.saved) / days)`. Existing forecast call continues to use default (covered-only) until forecast is migrated. ADR locks the dual-mode contract.
- Add per-day living loop to `BRAIN.plan.getSnapshot` mirroring `getSurvivalForecast`'s pattern. Compute `livingTotalTripAdjusted` from `Σ perDay`. New `snap.derived` fields: `livingTotalTripAdjusted`, `tripUpliftInAllocation`, `tripActiveDaysInCycle`.
- `essentialsTotal` uses `livingTotalTripAdjusted` (NOT `livingTotal`). `livingTotal` retained for back-compat / forensic.
- Migrate forecast to opt-in to `netOfBucket` mode so forecast + allocation are coherent. Single ADR covers both.
- UX label fix: "Over committed by $X" → add sub-line clarifying buffer is separate.
- Smoke: 6-8 cases (per-day loop conservation, bucket-funded → trip-day zero, bucket-empty → uplift propagates, post-rebucket recompute, post-buffer-change unchanged remainder, smoke on the receipt surfaces).
- Receipt update: hero breakdown's `Σ` line shows trip-uplift contribution explicitly.

**Estimate:** 2-3 hours including smoke + ADR + receipt update. Substrate, not a patch.

**Bug 1 bundles with this OR ships as Pass 3 hotfix (~5 LOC + 1 smoke) ahead of 2.5.**

---

## What I haven't done

- No code changes.
- No new BRAIN bubble proposed.
- Have NOT yet verified the bucket-saved → covered conservation against John's actual phone state. Once values call lands I'll fixture-fresh and confirm Darwin's `savings.trip-darwin-2026` bucket holds what we expect.
- Have NOT investigated whether `MODEL.cycleDiscretionarySpend` (Phase G strict-discretionary) has parallel trip-blindness. If it does, scope expands. Worth a 10-minute check after direction is set.

---

## Asks of John

1. **Option A / B / C / D** for trip semantics in PLAN allocation? (My rec: C, net-of-bucket residual.)
2. **α / β** for buffer-in-essentials? (My rec: α, fix label not math.)
3. Scope this as **Pass 2.5** under Bundle 32.3, or open **Bundle 32.9** as a follow-up? (My rec: open 32.9; 32.3 was declared closed and reopening invites scope creep.)
4. **Bug 1 — hotfix now or roll into 32.9?** (My rec: hotfix now — bare 5 LOC + 1 smoke; restores trip list legibility immediately.)
