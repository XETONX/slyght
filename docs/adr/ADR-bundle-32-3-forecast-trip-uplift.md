# ADR — Bundle 32.3 Pass 2 — Trip-aware survival forecast uplift formula

**Status:** Accepted
**Date:** 2026-05-20
**Bundle:** 32.3 Pass 2
**Author values call:** John (2026-05-20 batched directive — 4 values resolved in one message; CC executed autonomously)
**Supersedes:** N/A (first formal forecast trip-awareness ADR)
**Related:** `docs/audit/2026-05-19-savings-target-canonicalization.md` § "Pass 2 — survival forecast trip-awareness"

---

## Context

`getSurvivalForecast()` (`index.html:5536`) walks day-by-day from today to next payday, deducting bills/debts on their due dates plus a flat `minDailyNeeded` floor every day, to determine the cycle's run-out date and survival shortfall.

Pre-Pass-2, the forecast was **trip-blind**. The Darwin week (2026-06-07..2026-06-15) was treated identically to any other week — only the at-home baseline ($15-40/day food/transport) was deducted. John's $900 Darwin spending budget was invisible to the survival model. A trip-aware forecast was deferred from Bundle 32.3 Pass 1 (which added the activation-substrate fields `autoActivate` / `manualActivation` and the derived reader `getActiveSpendingTrips`) pending a values call.

## The values call

John's directive (2026-05-20):

1. **Formula:** `uplift = max(0, (target − Σcovered[].amount) / days)`. When net-of-coverage ≤ 0 (trip fully prepaid), uplift = 0.
2. **Schema:** `S.planIntents[].meta.covered` upgrades from string array (`['flights', 'accommodation']`) to object array (`[{name:'flights', amount:0}, ...]`). Backward-compat: missing `amount` defaults to 0 (conservative — treats item as not-yet-paid).
3. **Vs floor:** uplift **REPLACES** `minDailyNeeded` during the trip's spendWindow. Rationale: at-home baseline (groceries, coffee, commute) doesn't accrue while travelling; uplift IS the full daily cost during the trip. Outside the window, `minDailyNeeded` resumes — boundary transitions on day boundaries.
4. **Bucket coupling:** DEFERRED to Pass 3 (Darwin bucket creation · Property Deposit hybrid · Freedom Buffer → Rainy Day Fund rename). Pass 2 reads `meta.covered` as-is; no bucket migration here.

## Decision

Implement Pass 2 as substrate + logic only — no UI:

### Schema extension (seedV27)
One-shot pre-BRAIN migration (`slyght_seeded_v27_covered_v2` flag) walks `S.planIntents`, finds trip intents whose `meta.covered` contains string entries, and upgrades to `[{name, amount: 0}]`. Idempotent — per-entry check via `'amount' in e` skips already-upgraded objects. Audit-logged via `migration-covered-v2` source.

### Canonical readers on `BRAIN.plan.intent`
- `_parseDateLocal(s)` — parses `'YYYY-MM-DD'` as **local-midnight** (matches forecast iteration's local-midnight day boundaries; fixes a latent UTC-offset bug in Pass 1 `isActive()` where Sydney users would see trips skip their first 10 hours of activation).
- `_coveredAmount(intent)` — sums `meta.covered[].amount`; string entries (pre-migration) contribute 0 (conservative); 0 for non-trips.
- `getUpliftPerDay(intent)` — `max(0, (target − Σcovered) / days)`. 0 for non-trips, missing window, end < start, or fully-prepaid.
- `isActiveOn(id, date)` — date-parameterised activation check. Manual override (`'on'`/`'off'`) always wins regardless of date.
- `getActiveSpendingTrips(date)` — extended with optional date arg (defaults to `new Date()`); no-arg call preserves Pass 1 semantics.
- `isActive(id)` — refactored to delegate to `isActiveOn(id, new Date())`. Single source of truth.

### Forecast wiring (`getSurvivalForecast`)
Pre-compute two per-day cost arrays before the run-out loop:
- `perDayLivingCost[i]` — Σ uplifts on day `i` if any trip is active, else `minDailyNeeded`.
- `perDayComfortCost[i]` — same shape but max'd against `dailyMax` for the comfortable curve.

`minLivingCosts = Σ perDayLivingCost`, `comfortableLivingCosts = Σ perDayComfortCost`. The run-out loop deducts `perDayLivingCost[i-1]` instead of the flat `minDailyNeeded`. Returns three new transparency fields: `tripUpliftTotal`, `tripActiveDays`, `comfortableLivingCosts`.

**Conservation property:** the per-day array is the single source of truth — both the total displayed and the loop deductions read from it. Smoke-asserted in case 11.

## Consequences

### Numeric impact on John's live forecast (today, 2026-05-20 → next payday 2026-06-15)
Forecast horizon = 21 days. Darwin's spendWindow (Jun 7-15) overlaps the last 9 days. With seedV27 defaulting all 3 covered entries to `amount: 0` (no manual prepayment recorded yet), Darwin uplift = $900/9 = $100/day. Expected shift: `minLivingCosts` increases by ≈ 9 × ($100 − $25 baseline) = ≈ +$675. Survival shortfall and `comfortableShortfall` tighten by the same magnitude.

This is a **conservative pessimistic shift** — when John lands on his phone and the forecast tightens, the migration ran. If John remembers that flights/accom/car-hire are uncle-covered, he'll want to attach those `$ amounts` to `meta.covered` entries (Pass 3 UI) so uplift drops back toward 0.

### Backwards compatibility
- Pass 1 smoke (intent-activation.smoke.js) continues to pass — `isActive()` semantics unchanged (delegates).
- `getActiveSpendingTrips()` (no-arg) returns the same set as Pass 1 — defaults to today.
- Existing UI rendering of survival banner is unchanged structurally; the number tightens by ~$675 in the live fixture's Darwin scenario.
- Trip metadata legacy store `S.tripDefs` and its UI editor (`index.html:26743`) continue to operate on string-array `covered`. Pass 3 will migrate the editor to write structured `{name, amount}` objects via canonical writers and surface a per-line $ field.

### Future work (Pass 3 / Pass 4)
- UI: surface trip-uplift contribution row on the survival banner so John sees WHY the forecast tightened during trip days. Deferred to "alive Dashboard redesign" per the autonomy directive — should not be implemented against the current static UI.
- Migrate the Tripedit form (`saveTripEdit`) to write `{name, amount}` objects with a $ field per category. Backfill John's actual prepaid amounts.
- Bucket coupling — feed trip-bucket remaining balance as an offset to the uplift, OR model bucket→cash transfers as positive inflows during trip days.
- Cancellation handling: `manualActivation:'off'` already short-circuits the uplift via `isActiveOn` → already supported, no new work needed.

### Risks
- **Stale fixture:** state-snapshot.json reflects 2026-05-19 reconciliation. Smoke tests pass against it but John's actual phone state (May 20) may include unmigrated `meta.covered` entries if his localStorage was wiped or never seedV25'd. seedV27 is defensive — runs against whatever shape it finds and upgrades or skips per-entry.
- **Pessimism overshoot:** the migration defaults all coverage amounts to 0. Until John records actual prepaid $ in `meta.covered`, Darwin appears fully uncovered to the forecast despite uncle paying for flights/accom/car-hire. Net effect: forecast tighter than reality during Darwin week. Mitigation: Pass 3 UI ships before Jun 7 (Darwin start). If it doesn't, John can manually `BRAIN.plan.intent.update('darwin-2026', {meta:{...,covered:[{name:'flights',amount:420},...]}}, BRAIN.SOURCES.PLAN_INTENT_UPDATE)` in the console.

## Smoke coverage

`tests/smoke/trip-forecast-uplift.smoke.js` — 12 cases:

1. seedV27 migration (string → object, idempotent)
2. getUpliftPerDay — full coverage → 0
3. getUpliftPerDay — partial coverage → (target − covered) / days
4. getUpliftPerDay — zero coverage → target / days
5. getUpliftPerDay — non-trip kind → 0
6. getUpliftPerDay — missing window → 0
7. isActiveOn — inside/outside window with inclusive endDate
8. getActiveSpendingTrips(date) — back-to-back overlapping trips
9. Forecast — fully prepaid trip → minLivingCosts equals non-trip baseline
10. Forecast — uncovered trip in horizon raises minLivingCosts (9 active days × $100 = $900)
11. **CONSERVATION** — `minLivingCosts === Σ perDayLivingCost`; `totalNeeded === bills + debts + minLivingCosts`
12. Day-boundary — endDate uses uplift; endDate+1 uses minDailyNeeded

## Bug fixed in passing

Pass 1's `isActive()` parsed trip dates as **UTC midnight** (`new Date('2026-06-07')` → 2026-06-07T00:00:00Z = 2026-06-07T10:00 Sydney). For a Sydney user, the trip "activated" 10 hours late on the first day. Caught by case 10 (`tripActiveDays` was 8 instead of 9 on the first smoke run). Fixed via `_parseDateLocal()` which parses date-only strings as local-midnight. Pass 1 smoke continues to pass because its frozen clock (2026-05-19 22:00 +10:00) sits comfortably inside the activation window with no boundary sensitivity. Documented as a side-benefit, not a separate bundle.

## Definition of done

- [x] All 12 Pass 2 smoke cases pass
- [x] Full smoke suite passes (104/104; was 92 pre-Pass 2)
- [x] Scenario-walk passes (12/12 on 2 consecutive runs)
- [x] Guardian (4 layers) passes
- [x] Boot self-test adds 4 checks: seedV27, MIGRATION_COVERED_V2 source, getUpliftPerDay, isActiveOn
- [x] CHANGELOG entry recorded
- [x] Session-handoff §4 and §5 updated
