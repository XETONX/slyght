# slyght — Feature Map

> **Reference directory.** Every major UI surface → its render fn, DOM target,
> readers, writers, related state.
>
> **When working on a feature:** find its row here first. Grep this file for
> "where does X get computed" before chasing through 24k lines.
>
> **When fixing a bug:** the cross-references column tells you what else
> touches the same data so you don't break adjacent surfaces.
>
> Maintained by Claude Code. Updated as Bundle 28+ ships. Last updated: 2026-05-13.

## Sibling artifacts (read at session start per manual §3 Step 1)

| File | Purpose |
|---|---|
| `CC-PRINCIPAL-ENGINEER-MANUAL.md` | Operating manual. Outranks ship prompts. Read end-to-end on first session of the day. |
| `CHANGELOG.md` | Per-bundle ship log. Updated as part of every push (manual §3 Step 7). |
| `BUNDLE-NN-NOTES.md` | Active-bundle working ledger. Phase log + deferred items + cross-reference inspection queue. |
| `OPEN-BUGS.md` | Numbered bug ledger across all bundles. |
| `ARCHITECTURE.md` | Living architecture doc (Mermaid + component map + bottlenecks). |
| `docs/adr/` | Architecture Decision Records (one decision per file). |
| `docs/sdd/` | Software Design Documents (pre-implementation, for non-trivial work). |
| `docs/archive/` | Going-forward superseded docs. |
| `docs/manual-amendments/` | Per manual §15 — amendment proposals before manual edits. |
| `docs/ops/` | Operational runbooks (snapshot restore, redeploy, etc.). |
| `archive/` | Pre-Bundle-28 historical archive (missions/ship-prompts/audits/state-backups). |

---

## CURRENT — Dashboard tab (`#pg-dash`)

| Surface | Render fn | DOM target | Reads | Writes via | Cross-references |
|---|---|---|---|---|---|
| Hero balance | `renderAll` inline (~L4960) | `#h-bal` | `S.bal` via `getLiveBal()` | `openHeroBalEdit` → `confirmHeroBalEdit` → `runRecon` → `applyBalanceCorrection` → `BRAIN.transaction.recordCorrection` | Footer NW, Settings hero (removed), persistent strip |
| Today's spent text | `renderAll` inline (~L4965) | `#h-note` | `getTodaySpent()` + `S.txns` filter for Debt cat | `BRAIN.transaction.record` (LOG_EXPENSE) | Footer "$X left today", MAX PER DAY math |
| Liquid net worth | `renderAll` inline (~L4978) | `#nw-val` | `MODEL.liquidNet` from `calculateNetWorth()` | Various BRAIN.assets writers | NW modal, footer NW |
| Days to payday bar | `renderAll` inline (~L4985-5010) | `#pd-fill`, `#pd-lbl` | `MODEL.daysToPayday` | `BRAIN.config.setPayday` | MAX PER DAY math, Ask AI prompt |
| Survival banner | `renderSurvivalBanner` (~L2336) | `#dash-survival-banner` | `MODEL.survivalMode`, `getLiveBal`, `getActiveDebtsDueBeforePayday` | n/a (read-only render) | Alert cards, MAX PER DAY context |
| MAX PER DAY card | `renderAll` inline (~L5040) | `#max-day-display`, `#max-day-context`, `#pace-display` | `getDynamicDailyBudget()` (which reads S.bal, getBillsDue, getActiveDebtsDueBeforePayday, S.weekdayBudget/weekendBudget, getTodaySpent) | Cap edited via Settings → `BRAIN.config.setWeekdayBudget` / `BRAIN.config.setWeekendBudget` | Tap → `explainMaxPerDay()` modal (Bundle 28 P1) |
| Pace tile ("Running $X over pace") | `renderAll` inline (~L5012) | `#pace-display` | `computeSpentInRange` (strict — Bundle 28 round 5) | n/a | Phase 28.0.5 closed cross-tile divergence with hero |
| Alert cards | `renderAlerts` (~L5468) | `#dash-alerts` | `MODEL.shouldShowSpendingAlert`, `MODEL.survivalMode`, debts/bills math | n/a | Survival banner suppresses these when mode ≠ 'normal' |
| Immediate debts | `renderDebtTiles` | `#debt-grid` | `S.debts.filter(d => !d.paid && !d.viaRent)` | `BRAIN.debts.markPaid`/`unmark`/`update` | Add via `openAddDebtModal` → `saveNewDebt` → `BRAIN.debts.add` |
| Recent Spending | `renderDashTxns` | (~txn list area) | `S.txns` recent slice | Tap row → `editTransaction` → `txn-edit-modal` → `saveEditedTransaction` (DIRECT mutation — needs `BRAIN.transaction.update` Bundle 29) / `deleteEditedTransaction` (DIRECT — needs canonical) / `convertEditedTransactionToLoan` (Bundle 28 → `BRAIN.transaction.reclassify`) | Hero today, footer, Analysis pivot all read S.txns separately |
| Monthly position | `renderMonthlyPosition` | (~near alerts) | `MODEL` cycle fields, `getGenuineSurplus` | n/a (read) | Surplus tile |

**Modals on Dashboard:**
- `#h-bal-edit` (inline below hero) — balance edit UI
- `#recon-modal` — reason picker after balance change (z-index 620)
- `#debt-modal` — edit/clear debt (z-index 600)
- `#nw-modal` — Net Worth breakdown (z-index 600)
- `#txn-edit-modal` — edit transaction (incl Convert-to-loan) (z-index 600)
- `#add-debt-modal` — create new debt (z-index 600)
- `#bucket-modal` — edit savings bucket (z-index 600)
- `#add-bucket-modal` — create new bucket (z-index 600)
- `#quick-log-modal` — log transaction (z-index 600)
- `#cat-modal` — category detail (z-index 600)
- `#mark-paid-modal` — mark bill paid mode picker

---

## PLAN mode (`#plan-mode` slide-over)

Opens via `openPlanMode()` (L14460). z-index 500. Contains:

| Surface | Render fn | DOM target | Reads | Writes via |
|---|---|---|---|---|
| Liquid NW header | `renderPlanMode` inline (~L17518) | inline html | `nw.liquidNet`, `nw.breakdown.superBalance` | n/a |
| Payday Plan tile (Bundle 28.2: moved above WRX) | `renderAllocateTile` (~L18092) | inline html | `BRAIN.plan.getSnapshot()`, `BRAIN.allocation` | `openPaydayPlan()` → canvas |
| WRX status card | `renderWrxCard` (~L17558) | inline html | `S.wrxStatus`, `S.wrxValue`, `S.carloan`, `S.kiaEarlyRepayFee` | Direct mutation (Bundle 29 candidate for `BRAIN.assets.setWrxState`) |
| Trips section | `renderTrips` (~L19324) | inline html | `PLAN.getTrips()` | + Add trip → `addNewTrip` → `confirmNewTrip` → `PLAN.saveTrip` + `BRAIN.plan.intent.add` (Bundle 28 round 5) |
| Goals section | `renderGoalCards` (~L19797) | inline html | `PLAN.getGoals()` | + Add goal → `addNewGoal` → `confirmNewGoal` → `PLAN.saveGoal` + `BRAIN.plan.intent.add` |
| Goal card buttons | inline in renderGoalCards | each goal card | n/a | ✏️ `editGoal` · `addGoalSavings` · ✅ `markGoalComplete` · 🗑️ `confirmDeleteGoal` (Bundle 28 round 6) |
| Super card | `renderSuperCard` | inline html | `S.superBalance`, `S.superMonthlyContrib`, `S.superGrowthRate` | n/a (settings-bound) |
| Annual Provisions | `renderAnnualProvisions` (~L18980) | inline html | `PLAN.getAnnualProvisions()` + `getCustomProvisions()` | Direct localStorage `slyght_provisions` (Bundle 29 canonical writer candidate) |
| Income Simulator | `renderIncomeSimulator` | inline html | `S.income`, `S.bonusQuarterly` | `BRAIN.config.setIncome` |
| Expected Extra Income | inline | `#bonus-list` | `S.bonuses` array | `addBonus` → modal → `confirmBonusAmount` (direct write, Bundle 29 candidate) |

**Modal hoisted out of PLAN mode** (Bundle 28 round 6):
- `#plan-modal-overlay` — used by `PLAN_MODAL.open/close` for goal/trip/bonus dialogs. NOW at top-level body, z-index 601 applies globally.

---

## Payday Plan canvas (`#pg-payday-plan` slide-over over PLAN mode)

Opens via `openPaydayPlan()` (~L7679). z-index 510. Contains a root view + 5 sub-screens.

| Surface | Render fn | DOM target | Reads | Writes via |
|---|---|---|---|---|
| Canvas root | `renderPaydayPlanRoot` (~L7795) | `#pg-payday-plan-content` | `BRAIN.plan.getSnapshot()` | n/a (read) |
| Bills sub-screen | `renderPaydayBills` (~L8550) | `#payday-bills-body` | `BRAIN.bills.getThisCycle()`, `S.activePlan.overrides`, `S.activePlan.ticks.bill` | `openEditPaydayBill` → `BRAIN.plan.setOverride('bill', ...)` · tick → `paydayTick('bill', ...)` → `BRAIN.plan.tickItem` |
| Debts sub-screen | `renderPaydayDebts` (~L8665) | `#payday-debts-body` | `S.debts` filter !paid && !viaRent | `openEditPaydayDebt` → `BRAIN.plan.setOverride('debt', ...)` |
| Daily Living sub | `renderPaydayLiving` | `#payday-living-body` | `S.activePlan.dailyLivingFloor`, `snap.daysInCycle` | `openEditPaydayDailyFloor` → `BRAIN.plan.setDailyLivingFloor` |
| Savings sub-screen | `renderPaydaySavings` (~L8705) | `#payday-savings-body` | `BRAIN.savings.getBuckets()`, `PLAN.getTrips()`, `S.activePlan.overrides`/`ticks.savings`/`savings` | `openEditPaydaySavings`/`openEditPaydayTripAlloc` → `BRAIN.plan.setOverride('savings', ...)` · `openEditPaydayKiaExtra` (Bundle 28 round 1) → setOverride on 'kia-extra' |
| Upcoming sub | `renderPaydayUpcoming` (~L8833) | `#payday-upcoming-body` | `S.activePlan.knownUpcoming` | `BRAIN.plan.addKnownUpcoming`/`removeKnownUpcoming`/`updateKnownUpcoming` |
| Footer of Savings sub | inline in `renderPaydaySavings` (~L9219) | `#payday-savings-body` (end) | n/a | + 🎯 `addNewGoal` · + ✈️ `addNewTrip` · + 💰 `openAddBucketModal` (Bundle 28 round 5) |

**EDIT_MODAL** (canvas dialogs) — `.edit-modal` class, z-index 700. Used for every Payday-canvas editor. Created via `EDIT_MODAL.openCustom({title, hint, bodyHtml, onReady, save})` or `EDIT_MODAL.openInfo({title, body})`.

**Boot self-test** — fires DOMContentLoaded+500ms, ~25 checks (Bundle 27 onwards). Failures log to `console.error` + `BRAIN.audit` as `boot_self_test_fail`. Visible in Settings → Diagnostics → Activity Log.

---

## Settings (`#pg-settings`)

Bundle 22 v3 IA: Samsung-style root nav + 6 sub-screens (slide animations, z-index 5 within settings). Each sub-screen has settings-edit-rows. Tap to open `EDIT_MODAL`. Save → `BRAIN.config.set*` canonical writer.

| Sub-screen | Edits | Canonical writer |
|---|---|---|
| Financial Data | income, payday, weekday budget, weekend budget, super balance, mum balance, carloan, ccLimit | `BRAIN.config.set{Income,Payday,WeekdayBudget,WeekendBudget}` + `BRAIN.assets.set*` |
| Strategies | debt strategy (snowball/avalanche) | `BRAIN.config.setStrategy` |
| AI Assistant | api key, round-ups on/off, round-up destination, api alert threshold | (`S.apiKey` still direct, Bundle 29) + `BRAIN.config.setRoundUpsEnabled` + `BRAIN.savings.setRoundUpDestination` |
| Notifications | smart notifications toggle | (NOTIFY module direct writes — Bundle 29 → BRAIN.notifications) |
| Data & Backup | snapshots list, export, import, time machine | `SNAPSHOTS.take`/`SNAPSHOTS.restore` · `copyExport` · `buildFullExport` |
| Diagnostics | math health, activity log, build info, debug toggles | n/a (read-only) |

Hero balance was REMOVED from Settings Bundle 28 round 2 — dashboard hero is single source.

---

## State shape — where each field lives + writer

| `S.X` | Purpose | Canonical writer | Read by |
|---|---|---|---|
| `S.bal` | Current bank balance | `applyBalanceCorrection` (recon) + per-flow math | Hero, footer, MAX PER DAY, surplus calcs |
| `S.txns` | Transaction ledger | `BRAIN.transaction.record` / `recordCorrection` / `reclassify` / `removeByTs` | Analysis pivot, Recent Spending, getTodaySpent, etc. |
| `S.debts` | Debt entries | `BRAIN.debts.{add,markPaid,unmark,update,delete}` | Immediate Debts tile, MAX PER DAY math, debt strategies |
| `S.paidBills` | Paid-bill flags | `BRAIN.bills.{markPaid,unmark}` | Bills tab, getBillsDue, calendar markers |
| `S.savingsBuckets` | Savings money piles | `BRAIN.savings.{setBucketSaved,addToBucket,addBucket,updateBucket,removeBucket}` (Bundle 28) | Savings sub-screen, Goals (via bucket-link), AI context |
| `S.activePlan` | Per-cycle payday plan | `BRAIN.plan.{setOverride,clearOverride,tickItem,untickItem,addKnownUpcoming,removeKnownUpcoming,updateKnownUpcoming,setBonus,setDailyLivingFloor,setBufferFloor,lock,unlock,...}` | Canvas root + sub-screens, getSnapshot |
| `S.planIntents` | Canonical intent entities (Bundle 28 Phase 0) | `BRAIN.plan.intent.{add,update,remove,setBucket}` | (Future readers — currently parallel structure populated by seedV25) |
| `S.tripDefs` / `S.goalDefs` | Legacy trip/goal stores (pre-intents) | `PLAN.saveTrip` / `PLAN.saveGoal` (legacy — Bundle 29 migration to intents) | PLAN mode renderTrips, renderGoalCards |
| `S.income` / `S.payday` / `S.weekdayBudget` / `S.weekendBudget` | Config scalars | `BRAIN.config.set*` (Bundle 22 v3) | MAX PER DAY math, getDynamicDailyBudget |
| `S.debtStrategy` | "snowball" or "avalanche" | `BRAIN.config.setStrategy` | renderDebtTiles, getSurplusSuggestion |
| `S.mumAccountBalance` / `S.superBalance` / `S.cc` / `S.ccLimit` / `S.carloan` / `S.carloanOriginal` | Asset/liability balances | `BRAIN.assets.set*` (Bundle 24, partial) | calculateNetWorth, debt math |
| `S.wrxStatus` / `S.wrxValue` / `S.wrxSalePrice` | WRX sale state | Direct (Bundle 29 → `BRAIN.assets.setWrxState`) | WRX card, KIA payoff calc |
| `S.apiKey` | Anthropic API key | Direct (Bundle 29 → `BRAIN.config.setApiKey`) | Chat send |
| `S.paydayReceived` / `S.paydayReceivedDate` | Salary-landed flag | Direct in balance-edit + month rollover (Bundle 29 → BRAIN.cycle) | Hero text, MAX PER DAY context, banner |
| `S.chatHistory` | Chat ledger | Direct in sendChatMessage (Bundle 29 → BRAIN.chat) | Chat tab |
| `S.notifications` | In-app notifications | NOTIFY module (not BRAIN bubble — Bundle 29 candidate) | Notification bell |
| `S._auditLog` | Append-only mutation event log | `BRAIN.audit.append` | Diagnostics activity log, AI agent context |

---

## Critical helpers (pure readers — composable)

| Helper | Returns | Filter |
|---|---|---|
| `getLiveBal()` | Current real balance (S.bal + projection adjustments) | n/a |
| `getTodaySpent()` | Today's discretionary spend | `_NON_SPEND_CATS.has(cat)` excluded |
| `getDiscretionaryByCategory(from, to)` | { cat: {total, count, txns} } STRICT | excludes `_NON_SPEND_CATS` |
| `getAllOutflowsByCategory(from, to)` | { cat: {total, count, txns} } BROAD (Bundle 28 round 5) | excludes only income/corrections/roundups |
| `getDiscretionarySpend(from, to)` | Number — LAX filter | Bundle 28 round 5: deprecated in favour of strict OR all-outflows depending on intent |
| `getDynamicDailyBudget()` | Live max-per-day (cap-aware) | n/a — composes balance/bills/debts/days/cap/today-spent |
| `getGenuineSurplus()` | Balance-based "what's truly free" | n/a — Bundle 29 candidate to migrate consumers to BRAIN.plan.getSnapshot |
| `getBillsDue()` | Bills due BEFORE payday | excludes paid + non-recurring + future-month |
| `getActiveDebtsDueBeforePayday()` | Total debt minimums BEFORE payday | excludes paid + viaRent |
| `computeFinancialModel()` | Rebuilds MODEL — every render-time number | All canonical inputs |
| `_NON_SPEND_CATS` (Set) | Categories NOT counted as discretionary spend | `['Debt repayment','Income','Savings','Bills','Transfer','Loan','Car Loan','CC Payment']` |

---

## Layer V capture surfaces (visual regression)

`scripts/layerV-capture.js` (~611 lines) hits LIVE_URL (xetonx.github.io/slyght or local). Fixture: `state-snapshot.json`. 40+ captures across Dashboard / Bills / Plan / Chat / Analysis / Settings / Modals. Bundle 28 round 4 added captures #38-#42 for balance edit + z-index verification.

---

## How to add a new feature without breaking adjacent code

1. **Find the surface** in this map (or the nearest related surface)
2. **Identify the writer** — if no canonical writer exists, add one to BRAIN before mutating state
3. **Identify other readers** — which surfaces will see the change? Update or invalidate as needed
4. **Add boot self-test entry** for the new fn (mirrors the canary at L9460+)
5. **Layer V capture** of the new surface
6. **Update this map** — add the row before declaring done

---

## Self-correction queue (gaps I caught in retrospect)

- Round 6 — I bumped z-index numbers in round 4 without checking parent stacking context. Won't repeat: always check `transform` / `filter` / `opacity<1` on parents.
- Round 7 — I migrated dead renderers (renderTrend/renderCatBreakdown DOM IDs don't exist). Won't repeat: grep `id="X"` in DOM before migrating consumers of `$('X')`.
- Round 8 — I added `confirmNewGoal` intent creation in round 5 but forgot the matching `confirmDeleteGoal` intent removal. Won't repeat: add CREATE + DELETE pair in same round; cross-reference both in this map.
- Round 9 — I added a 🗑️ button to renderGoalCards in round 6 but DIDN'T add the parallel button to renderTrips cards AND didn't add an in-canvas delete affordance for bucket/trip rows in Savings sub-screen. John flagged both. Won't repeat: when adding an action to one card-type, audit ALL sibling card-types (goal/trip/bucket/provision) for the same affordance.
- Round 9 — I used `EDIT_MODAL.openInfo` with plain-pre-text body for explainers. That produced "just lines, not bubbles". Now I use rich HTML cards inside the body string + wrap in `<div style="white-space:normal">` to negate the pre-line CSS. Pattern locked: explainer/info modals use HTML cards, not plain text.
- Ongoing — when a render fn calls another (e.g. confirmDeleteGoal needs renderPaydaySavings refresh), check ALL surfaces that read the affected state, not just the obvious parent surface.

## Round 9 additions to the map

- `renderGoalCards` → 🗑️ button (round 6)
- `renderTrips` → 🗑️ button (round 9 — parallel to goal cards)
- `confirmDeleteTrip(tripId)` → new (round 9). Mirrors confirmDeleteGoal: removes from S.tripDefs + cascades auto-bucket cleanup + removes linked intent (for 'trip-*' ids) + refreshes PLAN mode + canvas
- `openEditPaydaySavings` → Delete-this-savings-goal footer button (round 9). Calls confirmDeleteBucketFromCanvas
- `openEditPaydayTripAlloc` → Delete-this-trip footer button (round 9). Calls confirmDeleteTrip
- `confirmDeleteBucketFromCanvas(bucketName)` → new (round 9). Wrapper for the canvas-context delete: removes bucket via BRAIN.savings.removeBucket + manual intent cascade + closes EDIT_MODAL + refreshes everywhere
- `explainMaxPerDay` → rich HTML rebuild (round 9). Hero gradient card + progress bar with colour-by-percentage + money breakdown grid table + time math + today's outflow split + timing-aware warning card
- `buildSpendingPivot` debt category tip → reformatted (round 9). Bulleted category list + bold total + recommendation in muted text

— end FEATURE-MAP.md —
