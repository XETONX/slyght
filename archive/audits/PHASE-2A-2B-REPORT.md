# Phase 2A + 2B Report — 29 April 2026

Foundation rebuild session. The May 1 double-count bug is structurally fixed,
and `computeFinancialModel(state, now)` is the single source of truth for
the dashboard, bills tab, and calendar.

## Shipped (10 commits, all green at commit time)

| Step | Commit | Description |
|---|---|---|
| 1 | `8e6ea61` | **Quick fix**: `isBillCoveredByDebt(bill, renderMonth, renderYear)` accepts the rendered month/year and uses them for the `billDate` constructor. Calendar call site updated to pass the values it's rendering for. Bills-tab call site keeps default fallback (today's month). |
| 2 | `43faa2d` | **Façade**: `computeFinancialModel(state, now)` + `buildCalendarEntries(state, now)` + `MODEL` global + `refreshModel()`. Wired into `load()` (after migrations) and `renderAll()` (top of every render pass). Calendar entries built fresh with rendered-month-aware coverage. Façade fields delegate to existing helpers. |
| 3 | `6e53052` | **9 new unit tests**. Inlined model + buildCalendarEntries into `tests/core.test.js`. Tests cover: May 1 dedup, viaRent exclusion, payday cycle guard, liquidNet < totalNet, yearly NRMA freq filter, quarterly Teachers Health freq filter, totalLiabilities excludes viaRent, safeToSpendToday matches getDynamicDailyBudget. |
| 4.2 | `fdfd3e4` | Dashboard liquid NW tile reads `MODEL.liquidNet`. |
| 4.3 | `e1317a3` | Footer strip reads `MODEL.liquidNet`, `MODEL.safeToSpendToday`, `MODEL.daysToPayday`. |
| 4.4 | `a48740c` | "You can spend today" card reads `MODEL.safeToSpendToday`. Sub-line reads `MODEL.debtsTotalCommitted`. |
| 4.5 | `c6d3519` | Survival banner reads `MODEL.survivalMode`, `MODEL.safeToSpendToday`, `MODEL.daysToPayday`, `MODEL.bal`. |
| 4.6 | `3a0d1f6` | Weekly snapshot tile reads `MODEL.weekSpent`, `MODEL.safeToSpendToday`. (Top-3 categories still inline — out of scope.) |
| 5 | `95417f1` | Bills tab `renderBillsGrouped` reads `MODEL.billsThisMonth`. Inline `isPaid` row check now calls canonical `isThisMonthlyBillPaid()` for legacy-name awareness. |
| 6 | `753f14e` | Calendar `getCalendarDayItems(day, month, year)` is now a 4-line Map lookup against `MODEL.calendarEntries.get(dateISO)`. The dedup happens once at model build time. **42 lines of inline calendar logic deleted.** |

## Test results

- **Unit tests: 23/23 passing** (14 pre-existing + 9 new model tests)
- **Guardian: 4/4 PASSED** (Core, Logic, UI, Runtime) · 50/50 runtime checks
- Final guardian + test run: 29/04/2026 8:17 PM AEST

## May 1 verification (the headline bug)

Test `Model: bill covered by debt does not appear in calendarEntries` confirms:
- Given today = 2026-04-29 and a Teachers Health debt due 2026-05-01,
- `MODEL.calendarEntries.get('2026-05-01')` returns **exactly one entry**
  (the debt, $259.41 type=`debt`),
- The Teachers Health quarterly bill (which would otherwise also land on
  May 1 because dueMonths includes May) is **suppressed by the coverage
  check** that now uses the rendered month (May), not today's month
  (April).

The dedup is structural, not patched per call site. `getCalendarDayItems`
is now a pure Map lookup; it cannot reintroduce the bug because there's
no inline coverage logic left in render code.

## Skipped / Known-incomplete

| Item | Reason |
|---|---|
| Step 4.1 — dashboard hero balance | Already reads `S.bal` directly; no MODEL field would change the read. Verified, left alone. |
| Step 4.7 — Recent transactions list | Already reads `S.txns` correctly. No MODEL field needed. |
| Step 4.8 — Immediate debts grid | Shape mismatch: `renderDebtTiles` shows ALL active debts (`!paid && !viaRent`), but `MODEL.debtsBeforePayday` is the filtered subset (only those with `delayDate` between now and payday). Per mission rules, deferred to next session — would need a `MODEL.allActiveDebts` field. |
| Plan Mode renderers | Phase 2C (next session). |
| Jarvis prompt | Phase 2C (next session). |
| Worker contract | Phase 2C (next session). |

## Discovered, deferred (out-of-scope findings)

1. **HEALTH keyword overlap is too broad.** The coverage logic returns
   true when a debt and bill share *any* HEALTH keyword. `Teachers Health`
   debt has `'health'`/`'teacher'` and `NRMA KIA Insurance` bill has
   `'insurance'` — both are in the keyword list, so a Teachers Health
   debt falsely "covers" an NRMA insurance bill on similar dates. Caught
   while writing the unit test for yearly NRMA — had to scope the test to
   a clean-state scenario. Real fix: tighten coverage to require a
   meaningful name overlap (e.g. matching first significant word *and*
   matching keyword class), not just any keyword overlap.
2. **Inline copy of model in tests is ~150 lines** that duplicates the
   index.html implementation. If the model body changes in production
   code, tests will silently drift. Worth investigating a tiny extraction
   into a `model.js` that both consume — but that's a build-system change
   beyond Phase 2.
3. **`isBillCoveredByDebt` (line 1713)** still exists for the Bills-tab
   call site (4356) that uses the today-fallback default. Once Phase 2C
   migrates the bills tab fully through MODEL, this helper can be
   removed entirely (the model build has its own internal `_covers`).
4. **`MODEL.billsBeforePayday` and `MODEL.debtsBeforePayday` arrays do
   NOT consume the calendar dedup**. They're populated from the legacy
   façade helpers (`getBillsDue`, raw debt filter). So a future "is the
   May 1 obligation already counted in totals?" check would need to use
   the calendar's deduped view, not these arrays. Worth aligning in
   Phase 2C.

## For next session (Phase 2C)

- **Plan Mode renderer migration** — payday allocation sliders, trip
  cards, goal cards, super card, annual provisions, income simulator.
  All read from `MODEL.trips`, `MODEL.goals`, `MODEL.provisions`,
  `MODEL.postWrxSurplus`, `MODEL.wrxImpact`.
- **Jarvis prompt** — collapse the inline state-collection in
  `sendChatMessage` into a single block of `MODEL.*` reads.
- **Worker contract** — `PUSH.syncState()` payload becomes a subset of
  `MODEL`. Worker side updated to consume the new shape.
- **Deduplicate billsBeforePayday vs calendarEntries**. Today they can
  disagree if a debt covers a bill — the calendar suppresses but the
  array doesn't. Make `MODEL.billsBeforePayday` consume the deduped
  calendar view (or shared internal helper).
- **Tighten HEALTH coverage** (Discovered finding #1).
- **Delete the obsoleted helpers** (Section 6.4 from AUDIT-FOUNDATION.md):
  `calculateNetWorthBreakdown`, `getNetWorth`, `getMaxDay`,
  `getDailyBudget`, `getNoSpendStreak`, possibly `isBillCoveredByDebt`,
  parts of `getDynamicBuffer`. Only after a full day of John using the
  new MODEL with no regressions reported.

## For next session (Phase 2D — kill list)

- SLYGHT Score subsystem (~120 lines) — Mum-test failure
- Daily Character Score → simplify to no-spend evenings only (~200 → ~30 lines)
- Goal Tracker on Analysis tab — Plan Mode is canonical
- Settings duplicates: Bonuses card, Bills list (both also in Bills tab)
- 17 unguarded `console.log` calls in PUSH/SCAN code
- `_wrxPriceUpdated`, `_afterpayUpdated` migrations (already in seed)
- `mumDebt.accountBalance` / `accountTarget` fields (set, never read)

## Time

- Start: ~8:02 PM AEST
- Final commit: ~8:17 PM AEST
- **Total: ~15 minutes** (well under the 3-hour budget — the disciplined
  one-fix-per-commit cadence and façade-first strategy meant nothing
  needed to be re-done).
- 10 commits, all guardian + tests green at commit time.
- 0 reverts. 0 force-pushes. Linear history.
