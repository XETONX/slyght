# PLAN-mode Total Audit — 2026-05-14

> **Honey-jar protocol.** Every interactive element traced · every formula verified · every static string evaluated · every empty state confirmed · every transition checked · every cross-tile divergence mapped.
>
> **Scope.** (a) Deep walk: Payday Plan canvas + 5 sub-screens + canvas modals. (b) Light walk: PLAN-tab "mother" tiles — depth-gap observations queued for a Bundle-29 redesign proposal (Tier 3 SDD/ADR).
>
> **Success criterion.** John's tonight planning session runs end-to-end against shipped code: log payday → add bonus → allocate cycle → walk Darwin → adjust daily-living → trust the numbers.
>
> **Authored by** Claude (Opus 4.7 1M-context) per the v4 prompt. Walked under the Deliberation Protocol (5 personas · 3 tiers).

---

## State anchor

**File:** `state-snapshot.json` (byte-equal to live dump `slyght-state-2026-05-13 (1).json` exported 2026-05-13 ~20:55 AEST). App-state at audit time:

| Field | Value | Notes |
|---|---|---|
| `S.bal` | $11.72 | Pre-payday, tight |
| `S.payday` | 15 | Tomorrow per cycle definition |
| `S.paydayReceived` | `false` | John is paid in bank — NOT logged in app (deliberate for tonight) |
| `S.paydayReceivedDate` | `null` | |
| `S.income` | $7,282/mo | |
| `S.weekdayBudget` / `S.weekendBudget` | $30 · $100 | |
| `S.activePlan.cycleStartDate` | 2026-04-14 | |
| `S.activePlan.cycleEndDate` | 2026-05-14 | TODAY is last day of cycle |
| `S.activePlan.lockedAt` | `null` | Plan not locked this cycle |
| `S.activePlan.bonus` | `undefined` | Bonus not added yet — tonight's first action |
| `S.activePlan.dailyLivingFloor` | $25 | |
| `S.activePlan.bufferFloor` | $364 | |
| `S.activePlan.overrides` | 2 entries | `bill:Rent + Deposit Savings` ($3,000 no-change) · `savings:China Holiday` ($0) |
| `S.activePlan.ticks` (counts) | 0 across all 5 categories | Nothing ticked this cycle |
| `S.activePlan.knownUpcoming` | `[]` | Empty |
| `S.txns` | 144 entries | |
| `S._auditLog` | last 15 entries scanned | |

**Debts (4):**

- Property Deposit (via Mum) · $5,681.45 · `viaRent: true` · delay 2027-01-15
- Teachers Health · $259.41 · `paid: true` · delay 2026-05-01
- Borrowed from Michael · $500 · delay 2026-05-16
- Borrowed from Mum for Bowie vet · $217.50 · delay 2026-05-15 · `autoDebit: false`

**Savings buckets (4):**

- China Holiday · $96.62 / $4,000 · Virgin Money
- Rainy Day Fund · $0 / $2,000 · ING
- Rego & Insurance · $0 / $1,500 · Westpac
- Gifts & Celebrations · $0 / $500 · Other

**Plan intents (12 — canonical post-Phase-0):**

| Kind | Name | Bucket linkage |
|---|---|---|
| trip | Darwin | _(empty — unlinked)_ |
| trip | China | China Holiday |
| goal | Property Deposit | `__mum-account__` token |
| goal | Freedom buffer | Rainy Day Fund |
| goal | China holiday | China Holiday |
| provision | Teachers Health | Rego & Insurance |
| provision | Car service (KIA) | Rego & Insurance |
| provision | KIA registration | Rego & Insurance |
| provision | KIA green slip | Rego & Insurance |
| provision | KIA insurance (NRMA) | Rego & Insurance |
| goal | Kia detail | Kia detail |
| goal | Test goal | Test goal |

**Legacy mirror status:** `S.tripDefs` has 2 (Darwin · China). `S.goalDefs` has 3 (Property Deposit · Freedom buffer · China holiday). Phase 0 (seedV25) collapsed canonical entities into `S.planIntents` but left `tripDefs`/`goalDefs` in place per BUNDLE-28-NOTES. Drift check: see Cross-cutting pass §G.

**BRAIN bubbles loaded (13 functional):** audit · config · allocation · plan · assets · chat · cycle · savings · summary · dashboard · transaction · bills · debts. Plus meta: SOURCES · _SOURCE_SET.

**Pre-existing pollution flagged:**

- `planIntents` contains `Kia detail` (id `goal-1778651412318`) and `Test goal` (id `goal-1778652572947`) — test-artifact entries; surfaces will render them as real goals. Carry-over from earlier development; will appear in audit findings.
- `paidBills` has `2026-5-Google Microsoft-1` key — should be `Google One-1` per r60+r64 (`seedV18` retire + `seedV26` rename). Either seedV26 hasn't fired against this dump or there's drift. Note for §D stale-string sweep.

---

## STEP 2 — Surface walks

(Each surface = its own subsection per the v4 template: r46-r71 reconciliation FIRST · what's on screen · specific-vs-generic · interactive element trace · 8-grep audit · number divergence · static text · empty state · transition · density · tonight-session check · adjacent observations · verdict.)

---

## SURFACE 1: Payday Plan canvas root (`renderPaydayPlanRoot`)

**Capture:** `captures/slyght-layerV-2026-05-14-20-plan-payday-plan.png` (237 KB) · **Code:** `index.html` L9573–9755 · **State anchor:** dump 2026-05-13 20:55 AEST · **Entry:** `openPaydayPlan()` L9422 from PLAN-tab `renderAllocateTile` button L21309

### Round-46-to-71 reconciliation (FIRST)

- **r46 (`7a29624`)** "showing Mum the plan" polish landed three deliberate additions here:
  1. Prominent inline `＋ Add bonus` pill at L9641 when `bonus.included === false` (the pre-r46 ✏️-only entry-point was missed in user testing).
  2. **Mum-readable summary** at L9661–9665: "Of $X coming in, $Y is FIXED — $Z is yours to allocate." This is the bubble John flagged as "duplicate FIXED bubble" in his morning ask.
  3. 🔒 FIXED + ✋ YOURS section header badges at L9689 / L9724.
- **r47 (`381735d`)** added Annual Provisions as the 4th Essentials category at L9694–9700 (when `_provisionsTotal > 0`). The provisions row only renders if total > 0, so empty-state behaviour exists by elision rather than explicit message.
- **r46 also added drift banner** at L9620–9624 (locked-plan only) — fires when `paidPct < elapsedPct - sensitivity` and progress.bills.total > 0.

### What's on screen (engineering description)

1. Header cycle label (`#payday-cycle-label`) — "Cycle 14 Apr → 14 May · 0 days left" (today is cycle-end).
2. Hero "Money coming in this cycle" + monospace total (`fmt(snap.totalToPlan)`).
3. Net pay row + bonus control — either `＋ Add bonus` green-outline pill (when no bonus) OR `+$X bonus (expected/confirmed) ✏️` (when included).
4. Sub-line "$bal now → $projected when next pay hits" with green/red colour on projected.
5. **r46 Mum-readable summary bubble** — "Of $X coming in, $Y is FIXED (bills, debts, daily living) — $Z is yours to allocate."
6. Proportion bar (Bills blue · Debts red · Savings green · Upcoming amber · Living grey).
7. Bar caption: "Bills · Debts · Savings · Upcoming · Living".
8. ESSENTIALS section header with 🔒 FIXED badge.
9. 4 nav-rows (Bills · Debts · Daily living · Annual provisions if total>0) — each `<button class="payday-nav-row">` with icon · title · subtitle · chevron.
10. Essentials total subtotal line (right-aligned monospace).
11. 🎯 REMAINDER tile (large gradient-bg card) — "Remainder after essentials" · big monospace figure · breakdown "$X coming in − $Y essentials = $Z".
12. ALLOCATING THE REMAINDER header with ✋ YOURS badge.
13. 2 nav-rows (Savings goals · Known upcoming).
14. "Allocated so far" + "Still free" line.
15. 3 action rows: ⚙️ Auto-allocate · 💬 Ask AI · 🔒 Lock plan (or 🔓 Re-plan when locked).

### Specific-vs-generic

| Element | Verdict | Cite |
|---|---|---|
| "Money coming in this cycle" / "Of $X coming in, $Y is FIXED…" / "Essentials this cycle" / "Allocating the remainder" / "Still free" | [SPECIFIC] — John's vocabulary, plain English | L9636 / 9661–5 / 9689 / 9724 / 9736 |
| Bonus pill label `＋ Add bonus` | [SPECIFIC] — explicit affordance | L9641 |
| Cycle label "Cycle DD Mon → DD Mon · N days left" | [SPECIFIC] | L9582 |
| Drift banner copy "You're behind on bills this cycle — about X% off pace" | [SPECIFIC] but invisible in current state (plan unlocked → drift gate skipped) | L9623 |
| Tutorial overlay copy at L9471 | [SPECIFIC] — fires once per device | L9471 |
| All number values | [SPECIFIC] — derived from `BRAIN.plan.getSnapshot()` | L9576 |
| [MISSING] No mention of the upcoming **trip context** (Darwin 24 days out · $0 / $900 bucket) inline on root | The trip pressure is invisible here. Surfaces only when user drills into Savings sub-screen. **Audit flag.** | — |
| [MISSING] No mention of **WRX sale freedom** path. Live state has WRX listed at $25k which materially changes future cycles' freedom. Root canvas treats current cycle as if WRX is permanent. **Audit flag.** | — |

### Interactive element trace

| Element | WRITE path | Consumers | Propagation | Conflict? |
|---|---|---|---|---|
| `＋ Add bonus` / ✏️ Edit bonus | `openEditPaydayBonus()` (L10230) → `BRAIN.plan.setBonus(patch, PLAN_BONUS_EDIT)` (L17747) → `S.activePlan.income.bonus` + audit `plan_bonus_edit` + `save()` | renderPaydayPlanRoot reads `snap.income.bonus` (L9586–9589, 9637) · `BRAIN.plan.getSnapshot` reads same (L17399–17402) · projectedEndBalance includes `bonusAmt` (L17456) | renderPaydayPlanRoot re-fires from handler save callback (L10274) ✓ | **YES — rollover wipe.** See P0.1 root-cause below. |
| Bills nav row | `openPaydayCategory('payday-bills')` (L9543) → adds class + calls `renderPaydayBills` (L10819) | n/a (read-only navigation) | ✓ | — |
| Debts nav row | `openPaydayCategory('payday-debts')` → `renderPaydayDebts` | n/a | ✓ | — |
| Daily living nav row | `openPaydayCategory('payday-living')` → `renderPaydayLiving` | n/a | ✓ | — |
| Annual provisions row (conditional) | `explainAnnualProvisions()` (L2541) — info modal, no write | n/a | ✓ | — |
| Savings goals nav row | `openPaydayCategory('payday-savings')` → `renderPaydaySavings` | n/a | ✓ | — |
| Known upcoming nav row | `openPaydayCategory('payday-upcoming')` → `renderPaydayUpcoming` | n/a | ✓ | — |
| Auto-allocate | `openPaydayAutoAllocate()` (L10321) — multi-bucket allocation modal with weighted urgency | Writes overrides via BRAIN.plan.setOverride | Re-renders root + savings on apply (L10413–4) ✓ | — |
| Ask AI | `openPaydayAskAI()` — prefills chat input with structured plan context | reads BRAIN.plan.getSnapshot + direct readers | n/a (chat path) | — |
| Lock plan | `openPaydayLockPlan()` (search needed) | writes `lockedAt` + audit | re-renders root ✓ | — |
| Undo (header ↩️) | `paydayUndoLast()` (L9482) → `BRAIN.plan.undoLast` walks audit log | full canvas + sub-screen re-render (L9491–9504) ✓ | Bundle-27-open-bug #B28-13 was the savings $200 stale mirror; per CHANGELOG that was the `.savings` mirror — re-verify on Savings sub walk |

### 8-grep audit for `S.activePlan.income.bonus` (the bonus field)

1. **`S.X =` direct writes** — `BRAIN.plan.setBonus` only (L17752–17754); canonical ✓
2. **`S.X` direct reads outside canonical** — none found (all reads route through `BRAIN.plan.getSnapshot`)
3. **BRAIN readers** — `BRAIN.plan.getSnapshot` (L17399–17402); `BRAIN.plan.recommendAllocation` (L17784 — reads via getSnapshot transitively)
4. **Render consumers** — `renderPaydayPlanRoot` L9586/9637 · `openEditPaydayBonus` L10231 (re-reads snapshot on modal open) · canvas root projected-end calc (transitively via snap.derived)
5. **Audit-log refs** — `plan_bonus_edit` source tag (L17755); written by `setBonus`. Untyped reads = 0.
6. **AI context** — `_buildPaydayAskAIPrompt` reads `snap` from getSnapshot, includes bonus implicitly via `totalToPlan`. Direct readers in chat prompt skip bonus.
7. **Test fixtures** — current `state-snapshot.json` has no `S.activePlan.income` set (income object not present in dump; getSnapshot's fallback `{ netPay: 0, bonus: {...} }` fires)
8. **Migration paths** — `_emptyActivePlan` (L11280–11303) seeds default bonus `{amount: 0, included: false, status: 'expected'}` · `rolloverIfNeeded` (L17978) creates fresh _emptyActivePlan and **does NOT preserve `prevPlan.income.bonus`** (L17980–17983 preserves dailyLivingFloor / bufferFloor / driftSensitivity / streak only).

**Grep verdict:** Path is canonical and audit-clean, BUT the rollover migration drops bonus silently. That's the P0.1 root cause.

### Number divergence

| Number | Formula | Other renderers | Agree? |
|---|---|---|---|
| `snap.totalToPlan` | `netPay + (bonusActive ? bonusAmt : 0)` (L17402) | renderAllocateTile L21276 (PLAN-tab tile) reads same snapshot ✓ · Auto-allocate modal reads same ✓ · _buildPaydayAskAIPrompt uses direct readers — **divergence risk** if direct reader path doesn't include bonus | Mostly ✓ — Ask AI divergence flagged Cross-cut §B |
| `snap.bills.total` | `billsList.reduce((s, b) => s + _billAmt(b), 0)` with override fallback (L17415) | renderPaydayBills L10819 reads same path ✓ · renderAllocateTile reads same snapshot ✓ | ✓ |
| `essentialsTotal` (Mum summary + Essentials section + REMAINDER tile) | `bills + debts + dailyLiving.plannedTotal + _provisionsTotal` (L9684) | Computed twice in this fn (L9659 and L9684) — same formula but DUPLICATED code path. **DRY violation, not a bug.** | ✓ but DRY-violating |
| `remainder` (Mum summary "$Z" + REMAINDER tile big number) | `snap.totalToPlan - essentialsTotal` (L9685) | Same formula | ✓ |
| `discretionaryTotal` | `snap.savings.total + snap.knownUpcoming.total` (L9719) | Only here | ✓ |
| `stillFree` | `remainder - discretionaryTotal` (L9720) | Only here | ✓ |
| `projectedEndBalance` | `currentBalance + expectedSalaryStill + bonusAmt - (unpaidBills + debts + living + upcoming)` (L17456) | Only getSnapshot computes this | ✓ |

**Cross-tile metric to verify on PLAN-tab walk:** `renderAllocateTile` L21290 comment says "Same essentials calc the Canvas uses (renderPaydayPlanRoot ~L9215)." The line reference is stale (renderPaydayPlanRoot starts at L9573 not L9215); the comment is months behind. Logic still calls same getSnapshot so calculus matches. Comment correctness flagged Cross-cut §B.

### Static text audit

| String | Earns? | Stale? | Mental model? |
|---|---|---|---|
| "Money coming in this cycle" | ✓ | — | ✓ matches John |
| "Of $X coming in, $Y is FIXED (bills, debts, daily living) — $Z is yours to allocate." | ✓ | — | ✓ Mum-readable per r46 intent |
| "Bills · Debts · Savings · Upcoming · Living" caption | ⚠️ — captions the bar segments but tiny grey text under bar; serves as legend | — | **John's morning ask** "red and blue bar has no legend" — the legend EXISTS at L9669 but is grey-on-grey, font-size:11px, NOT colour-keyed to bar segments. Functionally not a legend. **Audit flag — see Tonight-session check.** |
| "Essentials this cycle" / "🔒 FIXED" | ✓ | — | ✓ |
| "Remainder after essentials" / 🎯 | ✓ | — | ✓ |
| "Allocating the remainder" / "✋ YOURS" | ✓ | — | ✓ |
| "Allocated so far" / "Still free" | ✓ | — | ✓ |
| "🔒 Lock plan" / "Commit this plan + start ticking items off" | ✓ | — | ✓ |
| Tutorial overlay copy L9471 | ⚠️ fires once per device, says "tick items as you handle them — real transactions fire" | ✓ ships-quality | — |
| Empty drift banner copy | ✓ | — | — (locked-only) |
| "no bonus this cycle" (when bonus.included false but exists) | ✓ but **subtle** — grey italic, easy to miss | — | — |

### Empty state

- Fresh `_emptyActivePlan` produces: bills total $0 (BRAIN.bills.getThisCycle returns ≥0) · debts total $0 only if no immediate debts · savings total $0 · upcoming items [] · living floor $30 · bufferFloor max(300, 5% of netPay).
- Drift banner: locked check first — skips for fresh plan.
- Provisions row: only renders if `_provisionsTotal > 0`. Empty state is row absent — no message. **Audit verdict:** acceptable because provisions config is in Settings/PLAN-tab; user knows. But "no provisions configured yet" hint could be added for new users.
- Bonus state: when bonus.included = false → `<span style="color:var(--text3)">no bonus this cycle</span>` + green pill ＋ Add bonus. Clear empty state ✓.
- All nav rows render even with $0 totals (label says e.g. "$0 · 0 of 0 paid" for bills with no bills). **Density risk** — empty nav-rows still occupy 60px each; on a fresh setup canvas looks bloated. Tonight John has populated state so not a tonight-blocker.

### Transition check

- **Enter:** Tap "Payday Plan" tile in PLAN-tab (`renderAllocateTile` L21309 button → `openPaydayPlan()` L9422).
- **Exit:** Header back button (search needed) → `closePaydayPlan()` L9510 removes `payday-active` class · or `_paydayExitToTab` L9526 (Phase 0.1 helper to navigate to a different tab cleanly).
- **Re-enter state:** `openPaydayPlan` runs `rolloverIfNeeded` on EVERY open (L9442). For non-end-of-cycle re-entries this returns `not-yet` and is a no-op → state persists ✓. **For end-of-cycle re-entries (TODAY) this fires the rollover wipe** — see P0.1.
- **Sub-screen back:** sub-screen `closePaydayCategory(subId)` removes payday-active class; parent canvas resumes ✓.
- **Bonus persistence across re-enter:** ⚠️ **BROKEN on cycle-end days** per P0.1 below.

### Density check

- Tap targets ≥44px: nav-rows are `.payday-nav-row` with padding — visually they look ~56-64px tall. ✓
- Text ≥12px: cycle label L9582 ok · bar caption L9669 is 11px (too small per UX contract minimum ≥12px). **Audit flag.**
- 380px viewport: Mum-summary text wraps at the right widths. Hero `font-size:32px` monospace fits. Bonus pill `padding:4px 10px` ~106px wide. ✓
- 4-question density check: pass on Mum summary; pass on REMAINDER tile (single huge number); pass on Essentials nav rows.

### Tonight-session check

This surface is the anchor for tonight's session. **Critical user flow:**

1. John opens app → taps PLAN → taps Payday Plan tile → canvas opens.
2. Today is cycle-end (2026-05-14 = cycleEndDate). `openPaydayPlan` → `rolloverIfNeeded` fires → new empty activePlan replaces current. **Bonus from before is wiped.** Auto-allocations from previous cycle are wiped.
3. John taps `＋ Add bonus` → enters amount → confirm. `setBonus` persists ✓. Render updates ✓.
4. John navigates to sub-screen → returns to root. `openPaydayCategory` and `closePaydayCategory` don't re-call rolloverIfNeeded — only `openPaydayPlan` does. So once rollover has fired once today, subsequent re-opens within today's session are stable. ✓
5. **BUT** — if John closes PLAN mode entirely and re-opens via `openPaydayPlan` later in the session, `rolloverIfNeeded` is checked again — but the new activePlan's cycleEndDate is now next month (June 14ish), so `now < endMs` and it returns 'not-yet'. ✓
6. **EDGE CASE:** if today's first canvas-open happens BEFORE John has logged payday (the deliberate setup), `paydayReceived` is still false and `getSnapshot.derived.expectedSalaryStill` adds netPay to projection. The Mum-summary "Of $X coming" includes that. ✓ for tonight.

**Verdict:** Surface works for tonight AFTER the rollover wipe lands. The wipe itself is acceptable IF John doesn't expect carryover. But the wipe is silent — no toast, no notification. Compare with the `🔁 New cycle started — N deferred item(s) carried over` toast at L9444 which only fires when carryItems > 0. **A "Cycle rolled over · prior plan archived" toast on every rollover (with `View prior cycle` link) would close the surprise gap.**

### Adjacent observations (Tier 1 deliberation)

| Observation | Persona room (E·D·CI·F·U vote) | Action |
|---|---|---|
| **Bar caption is not a legend.** L9669 grey-on-grey 11px "Bills · Debts · Savings · Upcoming · Living" doesn't tell the user which colour=which. Adding `<span style="color:var(--blue)">●</span> Bills · <span color="--red">●</span> Debts …` would make it a real legend. | E:yes / D:yes / CI:yes / F:neutral / U:yes — 4/5 converge | **🟡 fixable this session — P1 polish if time.** Tonight John specifically mentioned this in morning ask. |
| **Mum-summary vs REMAINDER tile potential redundancy.** Both render "essentials FIXED → remainder yours" structure. r46 added the bubble as the Mum-readable summary; the REMAINDER tile below is the same fact in a different form. | E:drop bubble · D:keep bubble (Mum-audience signal) · CI:drop (John flagged redundant) · F:neutral · U:drop (John = user) — 3-1-1 split | **🟡 surface to John — verdict needs your call. Personally I think drop the bubble + promote the proportion bar legend + leave REMAINDER tile as anchor.** |
| **Cycle label "0 days left" on cycle-end day.** Today's display is "Cycle 14 Apr → 14 May · 0 days left" — accurate but reads as "you've run out" when the user has just hit a NEW cycle. Better: detect cycle-end and show "Cycle ended — new cycle starts at payday on 15 May" with `→` to refresh. | E:yes / D:yes / CI:yes / F:neutral / U:yes — 4/5 converge | **🟡 fixable this session — short copy fix.** |
| **No "Mark payday landed today" affordance.** Adjacent surface — early-payday recognition. Not strictly canvas-root but bonus and early-payday are sibling tonight-session needs. | All 5 converge | **P0 — moved to Cross-cutting + P0.2 fix sprint.** |
| **`renderAllocateTile` stale comment** L21290 references "L9215" instead of L9573. Comment rot, no functional bug. | All 5 converge | **🟢 trivial fix during PLAN-tab walk.** |

### Verdict

🟡 **Fixable this session.** Three concrete fixes lift this surface from "John's tonight session works around the wipe" to "John's tonight session has no surprises":

1. **P0.1 — Preserve bonus through rollover.** In `rolloverIfNeeded` L17978–17983, conditionally carry `prevPlan.income.bonus` to newPlan when `bonus.status === 'expected'` (future-cycle intent). Confirmed `bonus.status === 'confirmed'` → don't carry (past-cycle accounting). Pair with an audit-log `plan_bonus_carried_to_new_cycle` event + a toast.
2. **🟡 Bar legend.** L9669 caption → coloured dots matching segments.
3. **🟡 Cycle-end label copy.** "0 days left" → "Cycle ended — payday tomorrow" when day = cycleEndDate and paydayReceived false.

(Mum-summary vs REMAINDER redundancy goes to your call — Tier-1 split logged above.)

John verdict (one line): _"The canvas mostly works, but on cycle-end days the bonus quietly disappears and that's the bug that's been hurting me."_

---

## SURFACE 2: Bills sub-screen (`renderPaydayBills`)

**Capture:** none — Layer V doesn't navigate into sub-screens (coverage gap, surfaced §F) · **Code:** `index.html` L10819–10930 · **DOM target:** `#payday-bills-body` · **Entry:** root canvas → Bills nav-row → `openPaydayCategory('payday-bills')` L9543

### Round-46-to-71 reconciliation

- **r47** added UNPAID-visible + PAID-collapsed-`<details>` split (L10905–10918). Before r47 paid bills cluttered the planning view.
- **r50** added monthly bills full-cycle view in Bills tab (parent surface, not this sub).
- **r51** tightened row density ~25% in this sub.

### What's on screen

1. Header summary: `$totalDollars · N of M paid` (uses **rendered** bills count, not snap.bills.items — addresses Bundle-27-era divergence).
2. Progress card: 8px-tall green progress bar + "$X paid / $Y total" caption.
3. Deferred-this-cycle section (amber) — only renders when any override has `deferred > 0`.
4. Before-payday section — UNPAID rows visible, PAID rows in `<details>` collapse-strip.
5. After-payday section — same shape.
6. Empty state: "No bills due this cycle. Recurring bills come from the Bills tab."
7. Footer hint + "Go to Bills →" pointer (uses `_paydayExitToTab('pg-cal')` per r3 Phase 0.1 fix).

### Specific-vs-generic

All bill names are real (rendered from `BILLS` array — currently John has Rent + Deposit Savings, KIA Loan, Optus, Stan, Adobe, Spotify, YouTube Premium, Allianz CTP, KIA Registration, Pet Insurance, Amazon Prime, etc.). Section labels "Before payday" / "After payday" are plain English ✓.

### Interactive element trace

| Element | WRITE | Consumers | Propagation |
|---|---|---|---|
| Bill row tap | `openEditPaydayBill(name)` L9856 → opens EDIT_MODAL with Paid/Deferred toggle + amount picker → `BRAIN.plan.setOverride('bill', name, amt, opts, PLAN_BILL_EDIT)` | renderPaydayBills + renderPaydayPlanRoot re-fire on save (L9926-7) | ✓ canonical |
| Tick checkbox | `paydayTick('bill', name, PLAN_BILLS_TICK)` L10699 → `BRAIN.plan.tickItem` + downstream txn record via legacy markPaid path | re-render bills + root | ✓ canonical |
| "Go to Bills →" | `_paydayExitToTab('pg-cal')` L9526 | closes stack cleanly | ✓ |

### 8-grep audit for `S.activePlan.overrides['bill:*']` and `S.activePlan.ticks.bill`

1. Direct writes: only `BRAIN.plan.setOverride` and `tickItem` (canonical) ✓
2. Direct reads outside canonical: render reads `S.activePlan.overrides` directly (L10832) — acceptable; this IS a render path consuming canonical state
3. BRAIN readers: getSnapshot consumes overrides via `_billAmt` (L17410)
4. Render consumers: renderPaydayBills · renderPaydayPlanRoot (via snap.bills) · renderAllocateTile (via snap.bills)
5. Audit-log refs: `plan_override_set` source `PLAN_BILL_EDIT` · `plan_tick` source `PLAN_BILLS_TICK`
6. AI context: `_buildPaydayAskAIPrompt` includes bills via getBillsDue direct reader (not via override — divergence risk §B)
7. Test fixtures: state-snapshot.json has `overrides['bill:Rent + Deposit Savings']` set ✓
8. Migration paths: `rolloverIfNeeded` carries deferred-with-`create_known_upcoming_next_cycle` action into newPlan's knownUpcoming (L17985–17998) ✓

### Number divergence

| Number | Source | Cross-tile? |
|---|---|---|
| `totalDollars` (header) | iter over `allBills` with override fallback (L10840) | ✓ matches getSnapshot.bills.total when override semantics consistent |
| `progressPct` | `paidDollars/totalDollars*100` (L10849) | unique to this sub — no other surface shows bills-progress % |
| Per-row `amt` | `ov ? ov.thisCycleAmount : b.amt` (L10888) | ✓ same path as getSnapshot._billAmt |

### Static text audit

- "Before payday" / "After payday" ✓ matches John's mental model.
- Empty state copy ✓ accurate.
- "Bills come from the Bills tab." — small footer hint, ✓ matches r3 wiring philosophy.
- `<details><summary>▸ N already paid ($X)</summary>` — paid-collapse-strip pattern is r47 ✓.

### Empty state

`<div class="subscreen-placeholder">No bills due this cycle.<br><br>Recurring bills come from the Bills tab. Add or edit them there.</div>` L10924. Explicit + actionable ✓.

### Transition check

- Enter: from root via `openPaydayCategory('payday-bills')` L9543.
- Exit: header back button → `closePaydayCategory('payday-bills')` L9561 OR "Go to Bills →" → exits PLAN-mode entirely to Bills tab.
- Re-enter state: persists across re-render ✓ (reads from `S.activePlan.overrides` + `BILLS`).

### Density check

- Row height (`_paydayRow`) ~56-64px ✓
- Section titles 14px ✓
- Deferred copy 14px, italic 12px ✓
- 380px viewport: progress bar 100% width, no overflow ✓
- 4-question density passes

### Tonight-session check

For tonight's planning, John will tap each bill row and either:
- Confirm "no change" via the toggle (Rent + Deposit Savings already has this set in current state) → fast pass.
- Defer something (e.g. KIA Loan if he's tight) → enters deferred amount + reason → carries to next cycle's Known Upcoming via rolloverIfNeeded.

**TONIGHT BLOCKER:** when canvas opens today (cycle-end), `rolloverIfNeeded` archives the current overrides into `planHistory` and the new cycle starts fresh. Bills overrides John set this cycle (e.g. Rent + Deposit Savings $3,000) are gone — he'll need to re-enter overrides for the new cycle. Acceptable since they're per-cycle.

### Adjacent observations

| Obs | Room (E·D·CI·F·U) | Action |
|---|---|---|
| Bills sub renders all `BILLS.filter(recurring && isBillDueThisMonth)`. The header subtitle says "$X total" — but if a bill is recurring `false` it's hidden. John's "Bowtie pet insurance" is in BILLS — should render. Verify via Layer V capture once sub-screen captures are added (§F). | E:audit / D:n/a / CI:audit / F:audit / U:audit | **🟡 verify on phone-test tonight.** |
| "Go to Savings →" footer link L10985 (in Debts sub, not Bills) — Bills sub has analogous "Go to Bills →" which exits to Bills *tab*, leaving PLAN mode. ✓ correct per `_paydayExitToTab`. | All converge | ✓ no action |

### Verdict

🟢 **Ship-quality.** No P0 issues. One Layer V coverage gap (sub-screen captures missing) and one minor verification item for tonight phone-walk.

John verdict: _"Bills sub-screen does its job. Trust it for tonight."_

---

_(Surface 2-3 walked above — Bills + Debts. Continuing with Daily Living · Savings · Upcoming.)_

## SURFACE 3: Debts sub-screen (`renderPaydayDebts`)

**Capture:** none (sub-screen gap §F) · **Code:** `index.html` L10932–10987 · **DOM target:** `#payday-debts-body` · **Entry:** `openPaydayCategory('payday-debts')`

### Round-46-to-71 reconciliation

- **r47** widened from `!paid && !viaRent` to `!paid` so viaRent debts show with distinct styling (🏠 VIA RENT tag + monthly contribution subline). Pre-r47 Canvas Debts showed 2 debts vs dashboard's 3 — divergence resolved.
- **r29** added `autoDebit` flag + 🤖 AUTO badge.
- **r50** AU date format helper `fmtAuDate` used on `due 15 May`.

### What's on screen

1. Header summary `_paydayShellHeader(snap, 'debt')` — total + count.
2. "Minimum payments" group with rows: name · subline `[🏠 VIA RENT | 🤖 AUTO] · X% APR · due DD Mon · $Y/mo via salary` · amount.
3. "Extra payments" hint card: "Set extra debt payments under Savings plan → KIA extra."
4. "Go to Savings →" pointer that closes debts sub and opens savings sub.

### Specific-vs-generic

Real debt names: Property Deposit (via Mum) · Borrowed from Michael · Borrowed from Mum for Bowie vet. Tags reflect actual schema flags. No placeholders ✓.

### Interactive element trace

| Element | WRITE | Propagation |
|---|---|---|
| Debt row tap | `openEditPaydayDebt(id||name)` L9983 → setOverride('debt', …, PLAN_DEBT_EDIT) | re-renders debts + root (L10007-8) ✓ |
| Tick | `paydayTick('debt', …, PLAN_DEBT_TICK)` → tickItem | ✓ |
| "Go to Savings →" | `closePaydayCategory('payday-debts');setTimeout(…openPaydayCategory('payday-savings'),50)` | OK but inline-handler with 50ms setTimeout is a code smell — should be a helper like `_paydaySwitchSub('payday-savings')` |

### 8-grep audit for `S.debts` / `S.activePlan.overrides['debt:*']`

S.debts canonical writers: `BRAIN.debts.{add, markPaid, unmark, update, delete}` (per FEATURE-MAP). Renderer here reads directly via `S.debts` filter — acceptable (it's a read). Overrides identical-to-bills pattern.

### Number divergence

| Number | Source |
|---|---|
| Per-row amt | `ov ? ov.thisCycleAmount : d.amt` ✓ same as getSnapshot._debtAmt |
| Sub-screen header total | via `_paydayShellHeader` — verify formula matches snap.debts.total |

(`_paydayShellHeader` needs reading to confirm — flagged for Cross-cut §B verification.)

### Static text audit

- "Minimum payments" / "Extra payments" ✓
- 🏠 VIA RENT / 🤖 AUTO badges ✓ specific
- Footer copy directing to "Savings plan → KIA extra" — clear

### Empty state

L10981: "No active debt minimums to cover this cycle. 🎉" — explicit ✓.

### Transition check

Standard sub-screen pattern ✓. Cross-sub navigation via `setTimeout(50ms)` — works but fragile.

### Density check

Sub-line with multiple chip-style tags can wrap awkwardly on 380px when both 🏠 VIA RENT + 🤖 AUTO + rate + due-date + monthly stack. Visual density check requires Layer V sub-screen capture (gap §F). **Verify on phone tonight.**

### Tonight-session check

Tonight John has:
- Property Deposit $5,681.45 viaRent (🏠 VIA RENT tag)
- Michael $500 due 16 May
- Bowie vet $217.50 due 15 May (no autoDebit)

The Michael debt is "Due 16 May" — tomorrow. John will see this row clearly. Tap → set override → carry forward or pay-in-full. ✓ Works.

**One thing:** "Extra payments" hint card directs to "Savings plan → KIA extra" but the KIA Loan is a viaRent debt with its own monthly. KIA-extra is for accelerating the KIA payoff. This is correct but the hint phrasing "Set extra debt payments under Savings plan → KIA extra" is KIA-specific — could read as a feature, not a category. **Minor copy nuance.**

### Adjacent observations

| Obs | Room | Action |
|---|---|---|
| `setTimeout(50ms)` cross-sub navigation L10985 | E:yes(refactor) / D:no / CI:yes / F:n/a / U:no — 2/5 | 🟢 not pressing; queue for Bundle 29 hygiene |
| Header total via `_paydayShellHeader` — formula not verified | All converge for check | **Add to Cross-cut §B verification list** |

### Verdict

🟢 **Ship-quality.** Tonight John will use this surface for the 3 active non-paid non-viaRent debts (Michael · Bowie vet · viaRent property). Renders are accurate; tap-targets correct. One micro-concern about row density with viaRent multi-tag rows on 380px — verify on tonight's phone walk.

---

## SURFACE 4: Daily Living sub-screen (`renderPaydayLiving`)

**Capture:** none (sub-screen gap) · **Code:** L11163–11227 · **DOM:** `#payday-living-body`

### Round-46-to-71 reconciliation

Not directly touched in r46–r71 by name. Stable since Bundle 27 Phase 3. Reads from `BRAIN.summary.total('last30days')` at L11176 — relies on Bundle 28 Phase 28.0.5 era summary bubble.

### What's on screen

1. Header: `$plannedTotal` (the total daily living budget for cycle).
2. **Current** card: `$X/day × N days = $Y` monospace formula.
3. **Floors** group: two editable rows — "Minimum daily" ($25) + "Safety buffer" ($364 from live state).
4. **Context** card (read-only): Status (Healthy/Tight/Below-floor) · Floor · Planned · Recent average from BRAIN.summary.
5. **About** card: explains formula `(To plan − Bills − Debts − Savings − Known upcoming) ÷ days` + "To increase your daily, reduce one of the categories above."

### Specific-vs-generic

All specific. The Status badge reads as actual computed state. Recent-average pulls real data from summary bubble. Floor + safety buffer values from `S.activePlan` ✓.

### Interactive element trace

| Element | WRITE | Propagation |
|---|---|---|
| "Minimum daily" row tap | `openEditPaydayLivingFloor()` L10645 → `BRAIN.plan.setDailyLivingFloor(amt, PLAN_DAILY_FLOOR_EDIT)` | re-renders living + root ✓ |
| "Safety buffer" row tap | `openEditPaydayBufferFloor()` L10670 → `BRAIN.plan.setBufferFloor(amt, PLAN_BUFFER_FLOOR_EDIT)` | re-renders living + root ✓ |

### 8-grep audit (dailyLivingFloor + bufferFloor)

Direct writes only via `setDailyLivingFloor` / `setBufferFloor` ✓. Reads via `S.activePlan.dailyLivingFloor` or `S.activePlan.bufferFloor` in: getSnapshot, renderPaydayLiving, getDynamicDailyBudget (search confirms). All consumers go through canonical state. Audit-log entries via `plan_daily_floor_edit` / `plan_buffer_floor_edit` ✓.

### Number divergence

| Number | Source | Cross-tile |
|---|---|---|
| `perDay` | `livingTotal / daysInCycle` (snap.dailyLiving.perDay) | Single source ✓ |
| `recent average` | `BRAIN.summary.total('last30days') / 30` | only this surface |

**Status threshold** uses `floor` and `floor * 1.2` — magic-number-ish. Not a bug, but tightens to floor's role.

### Static text audit

- "Daily living is what you spend on day-to-day stuff that **isn't** a known upcoming item" ✓ Plain English.
- Formula line `(To plan − Bills − Debts − Savings − Known upcoming) ÷ days` ✓ honest.
- "To increase your daily, reduce one of the categories above." ✓ actionable.

### Empty state

Always renders with computed defaults (floor $30 default, perDay $0 if all categories sum to plan total). No empty branch needed.

### Transition check

Standard sub-screen ✓.

### Density check

Floor + buffer rows ~64px ✓. Context card line-height 2 = readable. About card 14px line-height 1.6 = comfortable. 380px viewport: all rows fit.

### Tonight-session check

**Critical for tonight.** John explicitly said: "when I adjust living cost I can visualise what it will look like and if I can afford to live okay or its still tight."

- Tap Minimum daily → set $30 (or whatever) → save → re-render shows new floor.
- Recent-average comparison via BRAIN.summary tells him if his floor is realistic.
- Status badge gives immediate verdict (Healthy/Tight/Below floor).

⚠️ **One gap:** the "perDay" computed (snap.dailyLiving.perDay) is what's PLANNED — not what's been ACTUAL so far. If John's tonight session asks "am I on pace?", the "Recent average" gives one answer (last-30-days actual) and the Status gives another (planned-vs-floor). They don't directly reconcile. **Minor — surfacing for awareness, not P0.**

### Adjacent observations

| Obs | Room | Action |
|---|---|---|
| Status threshold magic `floor * 1.2` for "Tight" | E: extract const / D: n/a / CI: yes / F: ok / U: n/a — 3/5 | 🟢 minor, queue Bundle 29 hygiene |
| Recent average uses BRAIN.summary which assumes 30-day window — but planning is per-cycle (~30 days too, but not identical) | E: ok / D: ok / CI: align? / F: ok / U: ok — 1/5 fork | 🟢 acceptable approximation |

### Verdict

🟢 **Ship-quality.** Tonight John can adjust the floor + watch the Pool re-flow into discretionary. Works.

---

## SURFACE 5: Savings sub-screen (`renderPaydaySavings`) — THE BIG ONE

**Capture:** `captures/slyght-layerV-2026-05-14-18-plan-add-savings-modal.png` (modal only, not sub-screen body) · **Code:** L10989–11123 · **DOM:** `#payday-savings-body`

**Why this surface matters for tonight:** John's morning complaints clustered HERE — "savings goals are generic, can't see Freedom Buffer or Property Deposit · China appears 3× · Annual Provisions section · Add new savings target is just text · shopping list section needed."

### Round-46-to-71 reconciliation

- **r3 (Bundle 27 P3)** filtered out annual-provision buckets via `isProvisionBucket` regex (`/rego|insurance|service|provision/i`) at L10999. Per John 2026-05-13 quoted in code comment.
- **r5 (Bundle 28)** added the 3-button footer for + Goal · + Trip · + Bucket (L11116-11121). The "Add new savings target" hint precedes them. **John's morning "just text" likely refers to the HINT, not the missing CTAs** — they exist.
- **r6 (Phase 6.2)** added Trips section (L11027) — upcoming trips with allocation rows.
- **r9** added 🗑️ delete buttons on card siblings.
- **r51** added unlinked-trips section in Auto-allocate modal (sibling surface) with [+ Bucket] action.

### What's on screen

1. Header: `_paydayShellHeader(snap, 'savings')` — total + count of buckets.
2. **Pool to allocate** card — big monospace `$unallocated` + "left to split across goals" + "Already allocated this cycle: $X" if any.
3. **Upcoming trips** group (when trips exist) — Darwin + China rows with `$saved of $budget (X%) · in N days`.
4. **Your savings goals** group — bucket rows with emoji-by-name (China Holiday 🌏 · Rainy Day Fund 🌧️ · Gifts & Celebrations 🎁) showing `$saved of $target (X%)`.
5. **Annual provisions** info card (when provision buckets exist) — names them inline, explains they're managed in PLAN > Annual Provisions.
6. **Extra debt payment** group (when carloan > 0) — single KIA extra row with strategy hint.
7. Footer: "Add a new savings target:" hint + 3 buttons (🎯 Goal · ✈️ Trip · 💰 Bucket).

### Specific-vs-generic — THE CRITICAL TABLE

| Element | Verdict | Detail |
|---|---|---|
| Pool to allocate $X label | [SPECIFIC] | derives from snap.derived.freeTotal |
| Darwin trip row | [SPECIFIC] | Real trip + budget + days-until |
| China trip row | [SPECIFIC] | Real trip + budget + days-until |
| Bucket "China Holiday" row | [SPECIFIC] | Real bucket $96.62 / $4,000 |
| Bucket "Rainy Day Fund" row | [SPECIFIC-but-MISLABELED] | This bucket is what the **Freedom Buffer goal** in `S.goalDefs` is linked to (per `S.planIntents[freedom-buffer].bucketId === 'Rainy Day Fund'`). Renders as "Rainy Day Fund" — John sees the bucket name, not the goal name "Freedom Buffer". **John's "Can't see Freedom Buffer" complaint roots here.** |
| Bucket "Gifts & Celebrations" row | [SPECIFIC] | Real |
| **[MISSING] Property Deposit goal** | — | `S.goalDefs[apartment]` exists with target $50,000 + monthly $2,500. Intent links to `__mum-account__` token, NOT a real bucket. So `BRAIN.savings.getBuckets()` doesn't include it → not rendered. **John's "Can't see Property Deposit" complaint roots here.** |
| **[MISSING] Test goal / Kia detail** | — | `S.planIntents` has `Test goal` and `Kia detail` entries with bucketIds `"Test goal"` and `"Kia detail"` — IF those exist as buckets they'd render. Earlier dump showed no such buckets, so they don't render here either. But they DO clutter Goals tile on PLAN tab. State-pollution. **Cross-cut §A drag.** |
| **[MISSING] "Freedom Buffer" name** | — | Goal exists in `S.goalDefs.freedom-buffer.name === "Freedom buffer"` but the bucket is named "Rainy Day Fund" → renderer shows bucket name. Two stores diverge. |
| "Add new savings target:" hint | [SEMI-GENERIC] | Plain hint text, not a primary CTA. Followed by real buttons. **John's "just text" complaint — partially valid. The 3 buttons under it ARE real CTAs but the hint LOOKS like the affordance.** |
| Annual provisions card "🚗 Rego & Insurance" | [SPECIFIC] | Names the actual filtered-out bucket(s). |
| Annual provisions explainer "These are sinking funds…" | [SPECIFIC] | ✓ matches r47 architecture |

### Interactive element trace

| Element | WRITE | Propagation |
|---|---|---|
| Trip row tap | `openEditPaydayTripAlloc(t.id)` L10141 → setOverride('savings', 'trip-'+id, amt, …, PLAN_TRIP_ALLOC_EDIT) | re-renders savings + root ✓ |
| Bucket row tap | `openEditPaydaySavings(b.name)` L10016 → setOverride('savings', b.name, amt, …, PLAN_SAVINGS_EDIT) | re-renders savings + root ✓ |
| Tick (pre-lock) | `alert(_PAYDAY_TICK_HINT_PRE)` — native alert ⚠️ | none — and **native alert violates UX contract §6 "No native confirm() or alert()"** (per CC-MANUAL). **Audit P1.** |
| Tick (post-lock) | `paydayTick('savings', name, PLAN_SAVINGS_TICK)` | ✓ |
| KIA extra row tap | `openEditPaydayKiaExtra()` L10099 → setOverride('kia-extra', 'KIA', …, PLAN_KIA_EXTRA_EDIT) | ✓ |
| 🎯 Goal button | `addNewGoal()` — opens PLAN_MODAL goal-create flow | creates intent + S.goalDefs entry, re-renders ✓ |
| ✈️ Trip button | `addNewTrip()` — opens PLAN_MODAL trip-create flow | creates intent + S.tripDefs entry, re-renders ✓ |
| 💰 Bucket button | `openAddBucketModal()` | creates bucket via BRAIN.savings.addBucket, re-renders ✓ |

### 8-grep audit for `S.savingsBuckets` + `S.activePlan.overrides['savings:*']` + `S.activePlan.savings`

1. Direct writes: `BRAIN.savings.{setBucketSaved, addToBucket, addBucket, updateBucket, removeBucket}` for buckets; `BRAIN.plan.setOverride('savings',…)` for plan amounts ✓
2. Direct reads outside canonical: render reads `S.activePlan.savings` legacy mirror at L11005 — **fallback path only when override missing** (acceptable post-Bundle-27 P6.2)
3. BRAIN readers: getSnapshot (L17430-17440) reads buckets via BRAIN.savings.getBuckets + override fallback to legacy mirror
4. Render consumers: renderPaydaySavings, renderPaydayPlanRoot (via snap.savings), renderAllocateTile (PLAN-tab tile, same snapshot), renderGoalCards (PLAN-tab, different path), Settings Round-up dest dropdown
5. Audit-log refs: PLAN_SAVINGS_EDIT · PLAN_TRIP_ALLOC_EDIT · PLAN_KIA_EXTRA_EDIT · BUCKET_ADD · BUCKET_UPDATE · BUCKET_DELETE
6. AI context: snap.savings + bucket detail in `_buildPaydayAskAIPrompt` (verify includes intents vs buckets — §B)
7. Test fixtures: state-snapshot.json has 1 active override `savings:China Holiday`
8. Migration paths: seedV25 (Phase 0) populated S.planIntents from S.savingsBuckets + tripDefs/goalDefs

### Number divergence

| Number | Source | Cross-tile? |
|---|---|---|
| Pool $unallocated | `Math.max(0, snap.derived.freeTotal)` (L11012) | canonical via getSnapshot ✓ |
| Per-bucket override amt | `ov ? ov.thisCycleAmount : (+planSavings[b.name] || 0)` (L11061) | renderPaydayPlanRoot uses same path via snap.savings reduce ✓ |
| Per-trip override amt | `ov ? ov.thisCycleAmount : 0` (L11034) — note: no legacy fallback for trips | trips never had a legacy mirror, fine ✓ |
| Trip pct | `Math.round(saved / budget * 100)` (L11037) — `t.saved` reads from `PLAN.getTrips()` which mirrors bucket-linked saved via `PLAN.readSavedFromSource` | **Verify** that `t.saved` matches the linked bucket's actual saved. Per Bundle-7 OPEN-BUGS #1, the `goal/saved` propagation has been fragile. **Audit flag §G.** |

### Static text audit

- "Pool to allocate" / "left to split across goals" / "Tap a goal below to allocate part of your free money to it this cycle." ✓ specific
- "Upcoming trips" / "Allocate part of this cycle toward each trip's budget." ✓ specific
- "Your savings goals" / "Lifetime targets shown for context. The amount on the right is what you're putting in *this cycle only*." ✓ This explainer addresses a known confusion ✓
- "Annual provisions" + "These are sinking funds for yearly costs… They're managed in Plan mode under Annual Provisions — not here. When one is due this cycle it'll show in Bills." ✓ r47 architecture spelled out
- "Extra debt payment" + "pay over the minimum · {snowball|avalanche} strategy" ✓ specific
- "Add a new savings target:" — labeled as a hint, but **John's morning ask suggests this reads as a non-CTA**. The 3 buttons below ARE CTAs (with colour-coded background + border). The hint COULD be promoted to a section title or removed entirely; the buttons stand on their own.

### Empty state

- Pool: always renders.
- Trips: only renders when ≥1 trip with budget>0 and future endDate. Empty state = section absent.
- Buckets: only renders when ≥1 non-provision bucket. Empty state = section absent. ⚠️ If John deletes all his buckets, this section disappears silently — would be jarring. **Audit P2 — add "no goals yet · tap below to add one" empty state.**
- Annual provisions: only renders when provision-buckets exist.
- KIA extra: only renders when carloan > 0.
- All-empty case: just Pool + the 3-button footer. Functional but bare.

### Transition check

Standard sub-screen ✓.

### Density check

Each row ~56-64px. Multiple sections + multiple rows can scroll. 380px viewport: bucket name + subline can wrap if name is long ("Gifts & Celebrations" → 18 chars fits). 3-button footer at L11117-11121: each button `flex:1` ~120px wide, padded comfortably ✓.

### Tonight-session check

**This is the centre of gravity for tonight.** John's flow tonight:

1. Tap Savings goals nav row from canvas root → opens this sub-screen.
2. Sees Pool: e.g. `$Z left to split` (depends on bonus + essentials).
3. **Scans for his goals.** Property Deposit — MISSING. Freedom Buffer — RENDERED AS "Rainy Day Fund" (mislabeled). China Holiday — present ✓.
4. Walks Darwin trip allocation — current allocation $0. Taps → enters $X → save.
5. Walks China trip allocation — current allocation $0 (current override). Taps → adjusts.
6. Considers Property Deposit — **CAN'T from this screen.** Property Deposit goal is governed by `S.goalDefs.apartment.monthly = $2500` and the closed-loop landed in r70 (Property Deposit increments come from paying the Rent + Deposit Savings bill). So tonight when John ticks "Rent + Deposit Savings" as paid, $2,500 flows to PD goal via r70 path. The Savings sub doesn't need to allocate it.

**Net for tonight:** the surface mostly works but the **mental-model gap** is real:
- John expects to see Property Deposit as a goal allocation row (intuitive — it's where he's "saving" $2,500/mo).
- The actual mechanic is: paying Rent + Deposit Savings bill triggers the closed-loop. Not an allocation here.
- Freedom Buffer's bucket-name "Rainy Day Fund" is the legacy bucket; the goal name "Freedom buffer" is in `S.goalDefs`. Rendering bucket name loses goal-name context.

### Tonight-session P0/P1 candidates from this surface

**P0 — Render goal NAMES via intent linkage, not bucket NAMES.** When `S.planIntents` has a `kind: 'goal'` entry linked to a bucket, render the GOAL name with bucket as subline ("Freedom Buffer · stored in Rainy Day Fund $0/$9,000"). Same for Property Deposit ("Property Deposit · via Mum-managed account · $3,000/$50,000"). This single change closes John's morning "generic goals" complaint.

**P1 — "Add new savings target" hint phrasing.** Either drop the text and let the 3 buttons stand, or promote to a section title like "🎯 ADD" or "Want to track something new?"

**P1 — Empty state for "Your savings goals" section** when no non-provision buckets exist.

**P1 — Drop native `alert()` in pre-lock tick at L11048.** Use a toast or inline hint per UX contract §6.

### Adjacent observations

| Obs | Room | Action |
|---|---|---|
| Pre-lock alert() violates UX contract §6 | E: must fix / D: must fix / CI: must fix / F: n/a / U: yes — 4/5 converge | **🟡 fixable this session — P1 polish** |
| `S.planIntents` has 2 test-pollution entries (Test goal · Kia detail) — they'll render IF their bucket names exist | All converge | **Cross-cut §A · cleanup migration candidate, queue Bundle 29** |
| The bucket-vs-intent name mismatch IS the root of multiple complaints (Freedom Buffer label, Property Deposit missing). The Mother Bundle-29 redesign Tier-3 proposal MUST address this: intent-driven rendering. | All converge | **Tier 3 candidate — queue SDD draft in §E** |
| Trip `t.saved` propagation reliability per Bundle-7 OPEN-BUGS #1 | All converge | **Verify on §G cross-cut** |

### Verdict

🔴 **Needs John's call AND P0 fix.**

- 🔴 (John call): the bucket-vs-intent mismatch is the **single largest tonight-session UX gap**. Render Freedom Buffer + Property Deposit as goals (with bucket subline) OR keep current bucket-only rendering with explanation?
- P0 if approved: intent-driven goal rendering with bucket subline (~30-50 LOC change, audit-clean).
- 🟡 fixable this session: native alert L11048 → toast or inline hint.
- 🟡 fixable this session: empty-state for goals section.
- 🟡 fixable this session: hint-vs-CTA on the "Add new savings target" footer.

John verdict: _"Pool works, trips work, but the goals section doesn't speak my language — Property Deposit and Freedom Buffer are what I think about, not buckets."_

---

## SURFACE 6: Upcoming sub-screen (`renderPaydayUpcoming`)

**Capture:** none (sub-screen gap) · **Code:** L11125–11161 · **DOM:** `#payday-upcoming-body`

### Round-46-to-71 reconciliation

- **carried-from-prior-cycle** items get the 🔁 icon (L11141-2). Bundle 27 P6.1 rollover carry-over wiring.

### What's on screen

1. Header summary.
2. If items: "Items" group with rows: emoji-by-category · name · date · notes · amount.
3. Empty state: "No upcoming items yet. Things you know you'll need to buy this cycle — gifts, essentials, events, one-offs. Tap below to add."
4. Footer: "+ Add item" pointer + hint: "Things you know you'll need to buy this cycle. The AI will know about these when you ask 'can I afford X.'"

### Specific-vs-generic

Real item names. Category emoji-map (8 categories). ✓

### Interactive element trace

| Element | WRITE | Propagation |
|---|---|---|
| Item row tap | `openEditPaydayUpcoming(id)` L10195 → BRAIN.plan.{add/update/remove}KnownUpcoming | re-renders upcoming + root ✓ |
| Tick | `paydayTick('upcoming', id, PLAN_UPCOMING_TICK)` ✓ |
| "+ Add item" | `openEditPaydayUpcoming(null)` | ✓ |

### 8-grep audit for `S.activePlan.knownUpcoming`

All writes through `BRAIN.plan.{addKnownUpcoming, removeKnownUpcoming, updateKnownUpcoming}`. ✓ canonical. Audit tags: `known_upcoming_add` / `_remove` / `_update`. AI context: included via getSnapshot.knownUpcoming. Carried-over items via rolloverIfNeeded with source `CARRIED_FROM_PRIOR_CYCLE`.

### Number divergence

None — single renderer, single source.

### Static text audit

- "Items" / "+ Add item" ✓
- "Things you know you'll need to buy this cycle. The AI will know about these when you ask 'can I afford X.'" ✓ specific
- Empty state copy ✓ instructive

### Empty state

L11156: clear, actionable ✓.

### Transition check

Standard sub-screen ✓. Items carried via rollover get 🔁 icon — verifiable visual signal.

### Density check

Row pattern standard ✓.

### Tonight-session check

For tonight's session, John has `knownUpcoming: []` (live state). He may add 1-2 items if he anticipates a known purchase before next payday. Works ✓.

### Adjacent observations

No P0/P1 — surface is clean and audited.

### Verdict

🟢 **Ship-quality.**

---

## SURFACES 7-15: Canvas modals (combined walk)

All canvas modals use the `EDIT_MODAL.openCustom` / `openInfo` plumbing (Bundle 22 v3 Phase 4) — focus-locked, body-scroll-locked, Android back-button intercept, `{ok, reason?}` validation envelope. Per-modal compact walk below.

### SURFACE 7: `openEditPaydayBonus` (L10230) — Pay & bonus modal

**r46 promoted the entry-point pill.** Modal contents:

- Net pay input (number, monospace).
- "Include bonus?" toggle.
- Bonus amount quick-pick grid [500, 800, 1000, 1200, 1500, 2000, 3000] + Custom.
- Status dropdown: Expected (not in account yet) · Confirmed (already landed).
- Dim-section-when-toggle-off pattern (opacity 0.4).

**Save path:** L10268-10272 — netPay edit goes via `BRAIN.config.setIncome` AND manually patches `S.activePlan.income.netPay` (the activePlan mirror). Bonus via `BRAIN.plan.setBonus`. **Two-store mirror smell:** netPay lives at both `S.income` and `S.activePlan.income.netPay`. Manual sync at L10270 is the cleanup site. **Adjacent finding — Tier 1 / Bundle 29 hygiene.**

**Tonight-session check:** ✅ for tonight. John taps `＋ Add bonus` → enters $X → status: expected → save. setBonus persists ✓. Re-renders root ✓. The renderer shows the new bonus inline ✓.

**Sticky-state pairing:** the modal does NOT fix the rollover wipe — that's a separate fix in `rolloverIfNeeded` per P0.1.

🟢 modal works. P0 fix is upstream in rolloverIfNeeded.

### SURFACE 8: `openEditPaydayBill` (L9856) — r49 Paid/Defer toggle

**r49 replaced the percent-grid with a two-mode toggle.** Modal contents:
- Normal-amount label.
- Two-button mode toggle: ✅ **Pay in full** (default) · ↪ **Defer part**.
- Defer-fields panel (hidden unless defer-mode): amount input · "Add a late fee" checkbox · late-fee input · live "carries to next cycle: $X" preview.
- Reason dropdown (no-change / tight-month / trip-expense / unexpected-cost / bill-went-up / bill-went-down / other).

**Save path:** L9905-9933 — `BRAIN.plan.setOverride('bill', billName, amt, {reason, deferAction, lateFee}, PLAN_OVERRIDE_SET)`. If deferred, sets `deferAction: 'create_known_upcoming_next_cycle'` so `rolloverIfNeeded` carries the shortfall to next cycle's Known Upcoming.

**Tonight-session check:** ✅ John taps Rent + Deposit Savings → currently in full at $3,000 → can flip to defer if cash flow tight → carries shortfall to next cycle. Or set late-fee on top. Works.

**One minor:** `window._billEditMode` (L10/9908/9941) is a global window-scoped variable for toggle state. Functional but global-state code smell. Bundle 29 hygiene.

🟢 ship-quality.

### SURFACE 9: `openEditPaydayDebt` (L9983) — r49 simplified quick-picks

Modal contents (similar shape):
- Normal-amount label.
- Quick-pick grid [0, 25%, 50%, 75%, 100%] of normal (r49 dropped 125/150%).
- Reason dropdown.

**Save path:** `BRAIN.plan.setOverride('debt', id||name, amt, …, PLAN_OVERRIDE_SET)`.

**Tonight-session check:** ✅ John handles Michael ($500), Bowie vet ($217.50) — pays in full or partials. Property Deposit (viaRent) renders but is special-cased (no per-cycle minimum to set).

🟢 ship-quality.

### SURFACE 10: `openEditPaydaySavings` (L10016) — bucket allocation

Modal contents:
- Quick-pick grid [0, 100, 200, 300, 500, 750, 1000].
- Bucket-specific subline.

**Save path:** `BRAIN.plan.setOverride('savings', b.name, amt, …, PLAN_SAVINGS_EDIT)`.

**Tonight-session check:** ✅ for the buckets that render. **MIRRORS THE INTENT-VS-BUCKET MISMATCH** from Savings sub — John tapping "Rainy Day Fund" expects to be allocating to "Freedom Buffer." The modal title currently uses the bucket name. Goal-context could be added in the modal subtitle.

🟡 modal works but the mismatch propagates here. Goal-context subtitle would help.

### SURFACE 11: `openEditPaydayKiaExtra` (L10099) — KIA acceleration

Modal for adding extra-over-minimum payment on KIA loan. Quick-pick grid + Custom. Routes through `BRAIN.plan.setOverride('kia-extra', 'KIA', …, PLAN_KIA_EXTRA_EDIT)`.

**Tonight-session check:** ✅ John has KIA loan $23,214; can add $50-$500 extra to accelerate snowball/avalanche strategy. Strategy badge shows current strategy.

🟢 ship-quality.

### SURFACE 12: `openEditPaydayTripAlloc` (L10141) — trip allocation

Per-trip allocation modal. Quick-pick grid scaled to trip budget. Routes through `setOverride('savings', 'trip-'+id, amt, …, PLAN_TRIP_ALLOC_EDIT)`.

**Tonight-session check:** ✅ **CRITICAL for tonight.** John taps Darwin → enters allocation → save → carries to bucket-linked savings. Darwin's bucket linkage is empty (`bucketHint: ''`) — auto-allocate has a name-fallback r51 path that links by substring. Tonight if he sets a manual allocation here, it sets the override AND `_createBucketForTrip('Darwin')` (auto-allocate path) would create the bucket.

But manual trip-alloc tap doesn't auto-create the bucket — that's auto-allocate's path. John could set $300 Darwin allocation in the override, but it'd live in `S.activePlan.overrides['savings:trip-darwin-2026']` not in a bucket. **Adjacent finding:** the trip allocation override path doesn't propagate to a bucket without auto-allocate. Tonight if John manual-allocates Darwin, he expects the savings to materialise as a Darwin bucket — currently it just sits in override. **🟡 verify on phone tonight or audit fix.**

🟡 modal works but trip-alloc → bucket linkage is auto-allocate-only.

### SURFACE 13: `openEditPaydayLivingFloor` (L10645) + `openEditPaydayBufferFloor` (L10670)

Two minimal modals — quick-pick grid for floor value. Routes through `BRAIN.plan.setDailyLivingFloor` / `setBufferFloor`.

**Tonight-session check:** ✅ John adjusts daily floor; recompute fires; status badge updates. Works.

🟢 ship-quality.

### SURFACE 14: `openPaydayAutoAllocate` (L10321) — Auto-allocate

**The most sophisticated modal.** Contents (r48 + r49d + r51 + r52):

1. **"Already covered first (Essentials)" red-tinted block:** itemised — 🏠 Bills · 💳 Debts (minimums) · 📅 Daily living · 🏦 Annual provisions · 🛡 Safety buffer. **Closes John's r49 feedback "auto-allocate seemed to skip my essentials."**
2. **"Allocatable" green-tinted headline:** monospace value.
3. **Suggested split (urgency-weighted) list:** per-bucket lines with:
   - Urgency tag: 🔥 Nd (≤30d) / ⏰ Nd (≤90d) / "Nd" / "overdue".
   - "+ NEW BUCKET" tag (r52) for synthetic trip-bucket entries.
4. Footer hint: "📌 + NEW BUCKET items are trips without a linked bucket…" (when synthetics exist).
5. Apply button → `BRAIN.plan.applyRecommendation(CANVAS_AUTO_APPLY)` → re-renders root + savings.

**Tonight-session check:** ✅ **HUGELY VALUABLE for tonight.** John taps Auto-allocate → sees:
- His essentials already covered ($X bills + $Y debts + $Z living + provisions + buffer = locked).
- His allocatable amount.
- Suggested split — Darwin (24d out → 🔥 24d → big share), China (200d+ out → smaller), Rainy Day, Gifts.
- Apply → overrides set across buckets.

**Failure mode:** shortfall path (`rec.ok === false, reason: 'shortfall'`) → opens info modal with deficit + options. Clear ✓.

**One thing:** when Property Deposit / Freedom Buffer goals are mis-rendered upstream, the auto-allocate split here may exclude them or include them via bucket names. Need to trace if `recommendAllocation` weighs by buckets or intents. Per L17783-17839 — it weighs buckets, with intent-linkage to find associated trips. **Goals not directly weighted — Property Deposit (no bucket) excluded; Freedom Buffer weighted as Rainy Day Fund bucket.** Same mismatch propagates.

🟡 modal is excellent BUT inherits the bucket-vs-intent mismatch. Auto-allocate today won't propose anything for Property Deposit because no real bucket exists.

### SURFACE 15: `openPaydayLockPlan` (L10422) + `openPaydayUnlockPlan` (search needed)

Lock modal: confirmation with "After locking: ✓ Bills/Debts/Savings committed · ✓ Known Upcoming stays editable · ✓ Tick boxes activate." Tight-buffer warning. Routes through `BRAIN.allocation.lock` + stamps `S.activePlan.lockedAt`.

Unlock: similar pattern (search confirms exists via L9744 ref `openPaydayUnlockPlan`).

**Tonight-session check:** ✅ Once John has set bonus + overrides + allocations + adjusted living, he'll lock. After lock the tick UI activates for paydayTick.

🟢 ship-quality.

### SURFACE 16: `explainAnnualProvisions` (L2541)

Info modal listing each provision with per-month + annual figure. From earlier read: Teachers Health $86.47/mo · Car service $42/mo · KIA registration $39/mo · KIA green slip $46/mo · KIA insurance (NRMA) $85/mo = ~$298/mo. Pure read-only ✓.

**Tonight-session check:** ✅ Useful context.

🟢 ship-quality.

### SURFACE 17: `explainMaxPerDay` (L2709)

Info modal — the rich-HTML rebuild per r9. Hero gradient + progress bar + math breakdown + time math + timing-aware warning card. Linked from dashboard MAX PER DAY card; reachable from PLAN context via Daily Living sub explainer flow.

**Tonight-session check:** ✅ John may consult to understand "$26.85/day max."

🟢 ship-quality.

---

_(Surfaces 7-17 done — 9 canvas modals walked. Pattern: all use EDIT_MODAL canonical plumbing, all route writes through BRAIN.plan.* canonical writers with typed source tags, all re-render canvas root + their associated sub-screen on save. Two adjacent findings carried forward:_
- _Window-global `_billEditMode` — Bundle 29 hygiene._
- _Bucket-vs-intent mismatch propagates from Savings sub → openEditPaydaySavings + openEditPaydayTripAlloc + openPaydayAutoAllocate — all addressed by the same Tier 3 SDD draft in cross-cutting §E._)_

---

## SURFACES 18-21: PLAN-tab "mother" light walk

**Scope:** light pass — describe what's there, flag depth-gap vs canvas, queue Bundle-29 redesign Tier-3 proposal. NOT deep walk per John's tonight-focus directive.

**Anchor:** `renderPlanMode` L21144 composes: NW header → renderAllocateTile → renderWrxCard → renderTrips → renderGoalCards → renderSuperCard → renderAnnualProvisions → renderIncomeSimulator. Plus Expected Extra Income (`#bonus-list` L23263, populated by `addBonus` L8563 → renderBonusList).

### SURFACE 18: Liquid NW header + renderAllocateTile (PLAN-tab entry to canvas)

**Capture:** #14 plan-top.

- **Liquid NW header** L21175: large +$X figure with colour by sign + "What you can actually touch today" subtitle + super contribution callout (when super > 0) + "View NW breakdown" button to NetWorth modal.
- **renderAllocateTile** L21276: bridges PLAN-tab → canvas. r47-aligned: same `essentialsTotal = bills + debts + dailyLiving + provisions` formula as canvas root. ✓ no divergence.
- Subline includes "{daysRemaining} days until next payday · {N already allocated · } open full plan canvas".

🟢 ship-quality. Entry point clean.

### SURFACE 19: renderWrxCard (L20738)

**Capture:** #14 plan-top.

WRX status card — listed sale price · KIA loan balance · cash after payoff · freed-per-month. Reads from `S.wrxStatus`, `S.wrxValue`, `S.carloan`, `S.kiaEarlyRepayFee` (canonical writers via BRAIN.assets r13/r19 per CHANGELOG).

⚠️ **TONIGHT NOT-A-FOCUS but informative.** John has WRX listed at $25,000. Tile shows post-WRX-sale impact. Useful context but doesn't affect tonight's allocation planning.

🟢 ship-quality.

### SURFACE 20: renderTrips (L22067) — PLAN-tab Trips section

**Capture:** #17 plan-trips.

Renders `PLAN.getTrips()` cards. Pattern (sampled from renderGoalCards-adjacent structure): per-trip card with destination · dates · budget · saved · daysUntil · per-day average · 🗑️ delete affordance (r9).

**Tonight-session check:** ✅ John sees Darwin + China cards from PLAN-tab. Adjacent to canvas allocation but PLAN-tab is the trip-management surface.

🟢 ship-quality.

### SURFACE 21: renderGoalCards (L22422) — PLAN-tab Goals section (THE ANSWER TO "WHERE'S PROPERTY DEPOSIT")

**Capture:** #16 plan-goals.

**Key finding:** PLAN-tab Goals tile **DOES surface Property Deposit + Freedom Buffer by name** via `PLAN.getGoals()` → reads from `S.goalDefs`. John's morning "can't see Freedom Buffer or Property Deposit" is therefore an **AUDIT REFINEMENT:**

- ✅ Visible HERE on PLAN-tab (rich card with progress · 3-projection table · per-goal hint · 4 action buttons).
- ❌ Missing/mislabeled on canvas Savings sub (Surface 5 P0 finding).

The Goals tile is actually the **rich** surface — projections by 3 strategies (current monthly · post-WRX + food cuts · with quarterly bonus) with date estimates. Per-goal contextual hints ("Every quarterly bonus saves 3 months" for apartment goal; "June bonus could cover half this goal" for China). 4-button row: ✏️ Edit · + Add savings · ✅ Mark complete · 🗑️ Delete.

**Explicit China-3x dedup:** L22430-22432 comment: "China appears in both Trips (canonical, has dates) and Goals. Filter it out of the Goals section so it only renders once via renderTrips." So China-as-trip-AND-goal is intentionally filtered to render once. ✓ Addresses one face of John's morning duplicate-bucket complaint.

**The mother metaphor verified:** PLAN-tab Goals tile IS the rich/canonical goal surface; canvas Savings is the thinner derivative. **Bundle 29 Tier-3 proposal will MIRROR Goals-tile depth into canvas Savings, not the other way around.**

🟢 PLAN-tab Goals tile is ship-quality. The depth-gap is on the canvas side. **Adjacent finding:** test-pollution intents "Test goal" and "Kia detail" — `PLAN.getGoals()` filters by `S.goalDefs` not by `S.planIntents`, so they may not render on the PLAN-tab Goals tile. Need verification (capture #16 review). If they don't render here, they only pollute intents-based readers.

### SURFACE 22: renderSuperCard

Super balance display. Bundle 25.1 separated super from Liquid NW per John's directive "stick to liquid throughout the app." Card shows super-only context. ✓

### SURFACE 23: renderAnnualProvisions (L22798) — THE TILE JOHN WANTS REMOVED

**Capture:** #15 plan-provisions.

**Per John 2026-05-14:** "the PLAN-tab Annual Provisions tile is redundant" (answered §1 question).

Tile renders Teachers Health · Car service · KIA registration · KIA green slip · KIA insurance (NRMA) — each with per-month + annual figure. Total $298/mo. Read from `PLAN.getAnnualProvisions()` + `getCustomProvisions()`. Direct write to localStorage `slyght_provisions` (Bundle 29 canonical-writer candidate per FEATURE-MAP).

**Status:** r47 integrated provisions INTO canvas Essentials (`explainAnnualProvisions` modal accessible from canvas root). The PLAN-tab tile is now the only place to **edit** provisions — but it still **displays** them, which is the redundancy John flagged.

**Tier-2 proposal (scope reframe):** remove the display section from `renderAnnualProvisions` on PLAN-tab; replace with a single nav row "🏦 Annual provisions · $298/mo · 5 items → tap to manage" that opens an EDIT_MODAL with the items list + edit controls. This:
- Removes the duplicate display (canvas root + provisions modal handle showing).
- Preserves the edit-on-PLAN-tab affordance.
- Reduces PLAN-tab scroll length materially.

**Run the room (Tier 2):**
- Engineer: ✓ removes display redundancy, preserves edit affordance, contained scope (~1 file)
- Design lead: ✓ scroll-length reduction welcome on PLAN-tab; nav-row pattern matches canvas root style
- CI-leader: ✓ John explicit ask, single source-of-truth (display lives on canvas, edit lives on PLAN-tab)
- Financial-guardian: neutral; no math touched
- John-as-user: ✓ matches morning ask

**5/5 converge.** Surface as **P1 fix for this session** (gated by John's confirmation on the nav-row mechanic). Doesn't touch BRAIN architecture; pure UX consolidation.

🟡 fixable this session — Tier-2 reframe.

### SURFACE 24: renderIncomeSimulator + Expected Extra Income (`#bonus-list`)

**Capture:** sections visible in #14 plan-top tail.

Income simulator + bonus list. `addBonus()` L8563 pushes to `S.bonuses` array directly (Bundle 29 canonical-writer candidate). `bonus-list` div populated by `renderBonusList` (search not done; low priority).

**Tonight-session check:** likely not in critical path tonight. John's bonus tonight goes through canvas `openEditPaydayBonus` not this PLAN-tab list.

🟢 ship-quality but Bundle 29 hygiene queued.

### PLAN-tab light walk summary

PLAN-tab is the **mother**: Liquid NW header → cycle entry → long-term assets (WRX) → forward planning (Trips + Goals) → super → annual provisions → income simulator. The TILES THEMSELVES are mostly rich and well-developed (Goals tile especially). The depth-gap John sensed is asymmetric — Goals tile IS rich on PLAN-tab; canvas Savings sub is the surface that needs to MIRROR that depth (not the other way around). Bundle 29 Tier-3 proposal: intent-driven canvas Savings rendering with same data shape as Goals tile.

**Tier 2 fixable this session:** PLAN-tab Annual Provisions tile → nav-row pattern per John's explicit confirmation. Pending John's go.

**Tier 3 queued (SDD in cross-cut §E):** canvas Savings re-architecture to consume intents + render goal names + show projections similar to PLAN-tab Goals tile.

---

---

## STEP 2.2 — Cross-cutting passes

### §A — Duplicate canonicalisation map

| Entity | Surface 1 | Surface 2 | Surface 3+ | Canonical? |
|---|---|---|---|---|
| **China** | `S.savingsBuckets[China Holiday]` (bucket $96.62/$4000) | `S.tripDefs[China]` (trip 1-22 Dec $5000) | `S.planIntents[china]` (goal · bucketId 'China Holiday') + `S.planIntents[china-2026]` (trip · bucketId 'China Holiday') + `S.goalDefs[china]` | 4 surfaces. Phase 0 intents collapse + r46 trips/goals explicit dedup at L22430-32 ensures PLAN-tab Goals tile shows once via Trips. **Status: working but mirrors in 4 places.** Bundle 29 candidate: drop legacy tripDefs/goalDefs once readers migrate. |
| **Property Deposit** | `S.goalDefs[apartment]` (goal $3000/$50000) | `S.debts[Property Deposit (via Mum)]` (debt $5681.45 viaRent) | `S.planIntents[apartment]` (goal · bucketId `__mum-account__` token) | 3 surfaces; goal + debt are deliberately separate (the closed-loop r70 ties them). Intent's `__mum-account__` token means canvas Savings can't render it (no real bucket). **Audit gap: canvas Savings cannot surface Property Deposit because intent-to-bucket linkage uses a synthetic token.** |
| **Freedom Buffer / Rainy Day Fund** | `S.savingsBuckets[Rainy Day Fund]` ($0/$2000) | `S.goalDefs[freedom-buffer]` (name 'Freedom buffer' target $9000) | `S.planIntents[freedom-buffer]` (bucketId 'Rainy Day Fund') | **NAME MISMATCH**: bucket name ≠ goal name. Canvas Savings renders bucket name; PLAN-tab Goals tile renders goal name. **John's morning complaint roots here.** |
| **NRMA** | `S.bonuses`? `S.debts`? — paid via Mum special-case (memory `slyght_nrma_mum_flow`) | `S.planIntents[provision-kia-insurance-nrma]` (provision $85/mo, bucket 'Rego & Insurance') | `paidBills['2026-5-...']` historical | NRMA is **annual-provision-only** post-r60 seedV18 retirement. Not a BILLS entry; not a discrete debt. ✓ canonical. |
| **Teachers Health** | `S.debts[Teachers Health]` (paid · $259.41 · 2026-05-01) | `S.planIntents[provision-teachers-health]` (provision $86.47/mo) | `paidBills['2026-5-Teachers Health-1']` | Triple-state (debt + provision + paidBills) per memory `slyght_bills_provisions_overlap`. ✓ working but architectural complexity. |
| **Rego / Green Slip / Service** | Provisions only | Single bucket 'Rego & Insurance' ($0/$1500) collects sinking funds | — | ✓ canonical. r47 architecture: bucket = sinking fund, provisions = monthly commitments, bills = when due. |
| **Darwin** | `S.tripDefs[Darwin]` (trip $900 7-15 Jun) | `S.planIntents[darwin-2026]` (trip · bucketId `""` — UNLINKED) | — | **Unlinked trip.** r51 auto-allocate has name-fallback path; r52 "+NEW BUCKET" synthetic. ✓ working but the bucketHint=`""` is a small data smell. |
| **Test goal · Kia detail** | `S.planIntents[goal-1778651412318]` + `[goal-1778652572947]` | _(no matching S.goalDefs OR bucket — pollution)_ | — | **TEST POLLUTION** carried in intents only. Goals tile filters by `PLAN.getGoals()` reading `S.goalDefs` so these don't render there. Canvas Savings filters by bucket presence so they don't render there either. **Hidden pollution — visible only when reading planIntents directly.** Bundle 29 cleanup migration: drop intents without a backing goalDef or bucket. |

**Cross-cut verdict:** Phase 0 intents canonical layer EXISTS but isn't yet the sole source for all rendering. Mirror stores (tripDefs/goalDefs/buckets) drive different surfaces with different name fields → John's mismatch perception. **Cross-cut §E Tier-3 SDD addresses this.**

### §B — Formula coherence table

| Metric | Renderers | Formula(s) | Agree? |
|---|---|---|---|
| `totalToPlan` | canvas root (snap.totalToPlan) · renderAllocateTile · auto-allocate "covered first" block · Ask AI prompt | `netPay + (bonus.included ? bonus.amount : 0)` in getSnapshot ✓; Ask AI uses direct readers — **may not include bonus** | ⚠️ Verify Ask AI prompt path includes bonus. Likely divergent on stale bonus state. |
| `essentialsTotal` | canvas root L9684 · renderAllocateTile L21297 · canvas Mum-summary L9659 (computed twice in same fn) | `bills + debts + dailyLiving.plannedTotal + _provisionsTotal` r47 | ✓ aligned (r47 fixed earlier divergence) but DRY violation inside canvas root |
| `remainder` (canvas) / `stillFree` (PLAN-tab) | canvas REMAINDER tile · Mum-summary · renderAllocateTile | `totalToPlan - essentialsTotal` (canvas) vs `(totalToPlan - essentialsTotal) - (savings + knownUpcoming)` (PLAN-tab) — different! | ⚠️ PLAN-tab shows "still free AFTER allocations" while canvas shows "remainder BEFORE allocations split." Labels matter: PLAN-tab says "left to allocate", canvas says "Remainder after essentials". **Could read as inconsistent.** Audit verifies labels match meaning. |
| `bills.total` (cycle) | renderPaydayBills L10840 · getSnapshot L17415 | identical `_billAmt` path | ✓ |
| `debts.total` (cycle) | renderPaydayDebts L10952 via `_paydayShellHeader` · getSnapshot L17426 | `_debtAmt` with override fallback | ✓ pending shellHeader verification |
| `savings.total` (allocated this cycle) | renderPaydaySavings · getSnapshot L17436 | override-first then legacy mirror | ✓ post-Bundle-27 P6.2 |
| `dailyLiving.plannedTotal` | snap-only, single source | `floor * daysInCycle` L17445 | ✓ single |
| `provisionsTotal` | canvas root L9657 · canvas root L9680 (twice in same fn!) · renderAllocateTile L21296 | `PLAN.getTotalProvisions()` direct | ✓ but DRY violation in canvas root |
| `discretionary` (Today's spend) | dashboard footer · MAX PER DAY math · Analysis pivot · BRAIN.summary.total | various — Phase 28.0.5 migrated 5 renderers but `_NON_SPEND_CATS` vs `EXCLUDED_CATS` divergence still exists per OPEN-BUGS #6/#7/#8/#17 | ⚠️ Not directly PLAN-mode but feeds Daily Living recent-average. **Not in tonight scope.** |

**Cross-cut verdict:** r47-r50 era closed the major divergences in PLAN-mode formulas. Two minor concerns: (1) `Ask AI prompt` may not include bonus in `totalToPlan`-equivalent total (verify on Surface 14 audit); (2) DRY violation inside `renderPaydayPlanRoot` (computes `_provisionsTotal` + `essentialsTotal` twice — L9657/L9659 then L9680/L9684). **Both minor. Bundle 29 hygiene.**

### §C — Audit-tag coverage

**17 PLAN-related `BRAIN.audit.append` sites** — all typed, all sourced. Sample:

| Type | Source tag pattern | Site |
|---|---|---|
| `payday_plan_locked` | CANVAS_LOCK | L17307 |
| `payday_plan_unlocked` | CANVAS_UNLOCK | L17317 |
| `plan_override_set` | PLAN_OVERRIDE_SET / PLAN_BILL_EDIT / PLAN_DEBT_EDIT / PLAN_SAVINGS_EDIT / PLAN_TRIP_ALLOC_EDIT / PLAN_KIA_EXTRA_EDIT | L17593 |
| `plan_override_clear` | _ | L17604 |
| `plan_tick` / `plan_untick` | PLAN_BILLS_TICK / PLAN_DEBT_TICK / PLAN_SAVINGS_TICK / PLAN_KIA_EXTRA_TICK / PLAN_UPCOMING_TICK | L17707 / L17742 |
| `plan_bonus_edit` | PLAN_BONUS_EDIT | L17755 |
| `plan_daily_floor_edit` | PLAN_DAILY_FLOOR_EDIT | L17767 |
| `plan_buffer_floor_edit` | PLAN_BUFFER_FLOOR_EDIT | L17778 |
| `plan_cycle_rollover` | (auto) | L18001 |
| `plan_intent_added/updated/archived` | _ | L18212 etc. |
| `known_upcoming_add/remove/update` | _ | L17550 etc. |
| `affordability_query` | AI_AFFORDABILITY_QUERY | L17531 |

**Untagged write path candidates checked:**
- `_createBucketForTrip` (L10287) — routes through `BRAIN.savings.addBucket` (BUCKET_CREATE source) + audit-logged. ✓
- `applyRecommendation` (auto-allocate apply) — should audit. Search confirms — yes, applies each override via setOverride. ✓

**Cross-cut verdict:** ✓ no untagged PLAN-mode writes. Layer 1 clean.

### §D — Stale string sweep

`alert(` in PLAN-mode render code:
- **L11048**: `renderPaydaySavings` pre-lock tick hint `alert(_PAYDAY_TICK_HINT_PRE)`. **Violates UX contract §6.** Already flagged P1 in Surface 5.

Other `alert(`s exist app-wide (22 total) but most are in dashboard/Settings/bill-add paths and outside PLAN-mode scope per the prompt. Listed but not actioned:
- L2701: explainWeekProjection fallback alert
- L2881: explainMaxPerDay fallback alert
- L3315-3316: balance edit gates
- L4862: Math invariant banner alert
- L5028/5063: txn edit/delete error alerts
- L6773, 6805: debt-add validation alerts
- L8425/8461: bucket savings validation
- L8487-8493: bucket modal validation
- L8935-8937: bill-add validation
- L9005: HABIT CHECK
- L12932/12934: API key validation
- L16510: generic error
- L21370: showInfoTip fallback

Outside-PLAN-mode adjacents → **Noticed list** (do not start).

Stale phase / coming / TODO / WIP / stub strings: **none found** in PLAN-mode renderers via the grep filter. Codebase is clean of stub markers. ✓

**Cross-cut verdict:** one PLAN-mode alert() to fix (P1). Surrounding alerts are out of scope.

### §E — BRAIN overlap observation + Tier 3 SDD draft

BRAIN bubbles PLAN-mode touches: `plan` · `savings` · `bills` · `allocation` · `transaction` · `audit` · `summary`. Plus indirectly `cycle` · `config` · `assets`.

**Method-level overlap scan (observation only, no proposal):**

- `BRAIN.plan` methods: getSnapshot · queryAffordability · {add,remove,update}KnownUpcoming · setOverride · clearOverride · tickItem · untickItem · setBonus · setDailyLivingFloor · setBufferFloor · recommendAllocation · applyRecommendation · rolloverIfNeeded · undoLast · proposeAdjustment · applyProposal · rejectProposal · intent.{add,update,remove,_archive,setBucket,get,list,byKind,byBucket}.
- `BRAIN.savings` methods: getBuckets · getBucket · setBucketSaved · addToBucket · addBucket · updateBucket · removeBucket · getRoundUpDestinationName · setRoundUpDestination.
- `BRAIN.allocation` methods: lock · unlock · getLockedProgress.
- `BRAIN.audit` methods: append · appendReconLog · query · recent.

**Observed overlaps:**
- `BRAIN.plan.intent.*` (12 buckets-or-trips-or-goals-or-provisions descriptors) vs `BRAIN.savings.getBuckets()` (4 actual money buckets) — these are **complementary, not overlapping**: intents describe *purpose*, buckets hold *money*. ✓
- `BRAIN.allocation.lock` vs `BRAIN.plan` lock-stamp at L10465-9 — `BRAIN.allocation.lock` records the lock snapshot; `BRAIN.plan` stamps `S.activePlan.lockedAt` so getSnapshot reflects. **TWO writes from one action**: allocation.lock + manual activePlan.lockedAt patch. Minor overlap but architectural — `BRAIN.allocation.lock` could/should stamp activePlan.lockedAt itself. Bundle 30 candidate.
- `BRAIN.plan.recommendAllocation` reads from `BRAIN.savings.getBuckets` AND `BRAIN.plan.intent.byBucket` — composes cleanly.

**Cross-cut verdict on overlap:** healthy composition; no merge candidates. ✓

---

#### Tier 3 SDD draft: Intent-driven goal rendering on canvas Savings sub

**Scope:** SDD reference; the actual `docs/sdd/SDD-2026-05-14-intent-driven-savings.md` will be written during STEP 3 if John approves the proposal.

**Problem statement:** Canvas Savings sub-screen (`renderPaydaySavings`) iterates `BRAIN.savings.getBuckets()` and renders by bucket name. Two of John's primary goals — **Property Deposit** (linked to `__mum-account__` synthetic token) and **Freedom Buffer** (linked to bucket "Rainy Day Fund") — either don't render or render with mismatched names. PLAN-tab Goals tile (`renderGoalCards`) already renders these properly via `PLAN.getGoals()` → `S.goalDefs`. The canvas is the thinner surface.

**Proposed change:** Reframe `renderPaydaySavings` Bucket section to iterate `BRAIN.plan.intent.byKind('goal')` first, then non-goal-linked buckets second. Each goal row shows:
- Goal name (from intent or S.goalDefs)
- Bucket subline ("stored in Rainy Day Fund · $0 / $2000 bucket goal" OR "via Mum-managed account" for `__mum-account__` token)
- Cycle-allocation amount (override-first then legacy mirror, same as today)
- 4-button row matching PLAN-tab Goals tile (✏️ · + Add · ✅ · 🗑️) — affordance symmetry per Self-correction queue entry r9.

**Invariants that must hold:**
- All canonical writes still route through BRAIN.plan.setOverride.
- Cycle-allocation overrides keyed by `savings:<bucketName>` still resolve (back-compat for current overrides).
- Trips section unchanged.
- KIA extra section unchanged.
- Math invariants (totalToPlan, savings.total, etc.) unaffected.

**Rollback plan:** feature-flag `_renderPaydaySavingsV2` toggle; revert to current path if anything fails phone-verify.

**Surface to John:** **YES** — Tier 3 protocol requires John's "build it" / "queue it" call before any code touches. Recommend queueing for Bundle 29 (Mother redesign theme) — too big to fit tonight + needs design review.

**Personas FOR pass:** Engineer ✓ (renders the canonical intent layer) · Design lead ✓ (closes mental-model gap) · CI-leader ✓ (compounds — same data shape across canvas + PLAN-tab) · Financial-guardian ✓ (no math touched) · John ✓ (his exact morning ask) · Future-CC ✓ (intent-driven rendering is the doc'd architecture) · Future-John ✓ (long-term symmetry).

**Personas AGAINST pass:** Engineer: blast radius extends to override key migration if we change key shape (we won't — keep `savings:<bucketName>` keys) · Design lead: 4-button row may not fit tonight's 380px viewport in this surface · CI-leader: risk of doubling work if Bundle 30 rules-as-data lands before this · Financial-guardian: none · John: complexity might exceed payoff if other surfaces still bucket-drive · Future-CC: care needed not to break legacy mirror fallback.

**Synthesis:** 7/7 FOR, 5 AGAINST concerns all addressable. **Recommend queue Bundle 29.** Tonight's fix is to surface this in Summary as the highest-impact post-tonight improvement.

### §F — Boot self-test coverage

**Currently covered (PLAN-mode):**
- BRAIN.plan exists / getSnapshot callable / intent reachable / intent.list callable
- openPaydayPlan reachable / renderPaydayPlanRoot reachable
- openEditPaydayKiaExtra reachable / explainMaxPerDay reachable
- _paydayExitToTab reachable / _paydayProgressBar reachable

**Coverage gaps (should be added — per boot-self-test-pattern memory):**
- openEditPaydayBonus reachable
- openEditPaydayBill reachable
- openEditPaydayDebt reachable
- openEditPaydaySavings reachable
- openEditPaydayTripAlloc reachable
- openPaydayAutoAllocate reachable
- openPaydayLockPlan reachable
- paydayTick reachable
- _paydayRow reachable
- renderPaydayBills / renderPaydayDebts / renderPaydaySavings / renderPaydayUpcoming / renderPaydayLiving reachable
- renderAllocateTile reachable
- explainAnnualProvisions reachable
- BRAIN.plan.setBonus persists across re-render (functional, not reachability — for P0.1 verification)
- markPaydayLanded reachable (when added per P0.2)

**Cross-cut verdict:** ~14 entry-point reachability checks missing. Each ~1 line. **P1 batch add during STEP 3.**

### §G — Legacy mirror audit

| Pair | Status |
|---|---|
| `S.tripDefs` vs `S.planIntents[kind='trip']` | Drift check: 2 trips in both, names match (Darwin · China), bucketHints/bucketIds — `darwin-2026` intent has bucketId `""` (unlinked), `china-2026` has bucketId `'China Holiday'`. tripDefs doesn't store bucketHint per current schema. ✓ no drift; Bundle 29 candidate to drop tripDefs once readers migrate. |
| `S.goalDefs` vs `S.planIntents[kind='goal']` | Drift check: 3 goalDefs (Property Deposit · Freedom buffer · China holiday) vs 5 goal-kind intents (above 3 + Test goal + Kia detail). **Test goal + Kia detail are intent-only — pollution.** Bundle 29 cleanup: drop intents without backing goalDef. |
| `S.activePlan.savings` (legacy mirror) vs `S.activePlan.overrides['savings:*']` (canonical) | Post-Bundle 27 P6.2 the override is primary, mirror is fallback. ✓ no drift if undo flow is correct (Bundle 27 carry-over bug B28-13). |
| `S.activePlan.income.bonus` vs `S.activePlan.bonus` | Stored at `S.activePlan.income.bonus`. The audit doc's earlier "activePlan.bonus undefined" was technically true but trivially so (the field is at `.income.bonus` not `.bonus`). No mirror drift. |
| `S.bonuses` (PLAN-tab Expected Extra Income) vs `S.activePlan.income.bonus` (canvas) | **TWO different concepts**: `S.bonuses` is a static list of expected extra incomes (Bundle 16 era); `activePlan.income.bonus` is per-cycle bonus state. Not a mirror — different domains. Bundle 29 hygiene: consider whether bonuses array should populate the cycle bonus field. |
| `S.income` vs `S.activePlan.income.netPay` | Mirror pair. `openEditPaydayBonus` manually syncs at L10270. **Smell**: BRAIN.config.setIncome should propagate to activePlan.income.netPay too. Bundle 29 candidate. |
| `paidBills["2026-5-Google Microsoft-1"]` | r60+r64 should have renamed to `Google One-1` via seedV26. Current dump still has the old key. **Stale state** — either seedV26 didn't fire against this dump or migration ordering. **Verify on phone tonight or pre-tonight migration check.** |

**Cross-cut verdict:** mirrors are mostly intentional and audit-clean. 4 cleanup candidates queued for Bundle 29 hygiene + 1 stale-key concern needs verify-tonight.

---

## STEP 2.3 — Vision UI pass

**Captures referenced:** 14 plan-top · 15 plan-provisions · 16 plan-goals · 17 plan-trips · 18 plan-add-savings-modal · 19 plan-edit-trip-modal (FAILED capture · finding) · 20 plan-payday-plan · 41 modal-add-bucket-over-canvas · 49 modal-max-day-math · 50 modal-add-debt · 51 modal-edit-goal · 52 modal-add-trip.

**Vision findings (each cross-checked against render source):**

| Finding | Source confirms | Verdict |
|---|---|---|
| Bar caption at canvas root (L9669) renders 11px grey-on-grey · invisible as legend | `font-size:11px;color:var(--text3);text-align:center` | ⚠️ Confirmed not a legend; Surface 1 P1 already flagged. |
| Mum-summary bubble + REMAINDER tile + ESSENTIALS section all stack tightly | L9661-9714 | Tier-1 split (3-1-1) — needs John's call. |
| Capture #19 plan-edit-trip-modal: "no edit-trip button found (after WRX-scope filter)" — script failure | Layer V script `attemptStep` couldn't locate the edit-trip affordance | **Coverage gap — script's trip-edit selector needs update.** OR the affordance moved post-r9. Verify on phone tonight. |
| PLAN-tab Annual Provisions tile (capture #15) is a long list — 5 items × per-item rows | L22798 | Confirms John's "Annual Provisions section that should be removed realistically" → Tier-2 reframe to single nav-row proposed. |
| PLAN-tab Goals tile (capture #16) — 3 rich cards (Property Deposit · Freedom buffer · China filtered out — appears via Trips). Buttons row + projection table per card. | L22422-22507 | ✓ ship-quality. The "mother" depth-gap is asymmetric — canvas needs to mirror this depth, not the other way. |
| Capture #20 plan-payday-plan (237 KB — small file, suggests truncation OR sparse render) | Renders via `openPaydayPlan` → renderPaydayPlanRoot. Per LAYER-V-DEEP-ANALYSIS the script captures the parent slide-over view, not navigated-into sub-screens. | **Layer V coverage gap §F.** Sub-screen captures are missing — not currently navigable from capture script. |
| Sub-screen captures (Bills sub / Debts sub / Savings sub / Living sub / Upcoming sub / all canvas modals) — NOT in capture set | Confirmed by manifest scan | **Layer V coverage gap.** Bundle 29 candidate: extend script to open canvas + each sub-screen + each modal. |

**Density check from PNGs:**
- PLAN-tab Goals tile cards (~16 padding, 22px emoji header, 15px name, 12px description, 22px % large) on 412×915 viewport ✓ comfortable.
- Annual Provisions tile rows: 5 items densely listed, would feel even more redundant on John's phone today.
- Canvas root proportion bar segments visible BUT colours hard to distinguish on phone-grade displays without legend.

**Vision verdict:** confirmed two surface-level findings (bar legend missing, Annual Provisions redundancy). One coverage gap (sub-screen + modal captures missing from Layer V). One script bug (#19 trip-edit selector). No surprises beyond what the code walks already surfaced.

---

---

## STEP 2.4 — Summary

### Counts

- **Surfaces walked:** 24 (canvas root · 5 sub-screens · 11 canvas modals · 7 PLAN-tab mother tiles · NW header · cycle-entry tile · annual-provisions tile)
- **Interactive elements traced:** ~60 across canvas (every tap-target / input / toggle / button / nav-row)
- **Number divergences:** 2 minor (DRY violation in canvas root `_provisionsTotal` computed twice; Ask AI prompt may not include bonus in total — verify)
- **Generic-vs-specific findings:** 2 P0 (Property Deposit invisible on canvas Savings · Freedom Buffer mislabeled as Rainy Day Fund) + 1 P1 ("Add new savings target" hint reads as non-CTA)
- **Stale strings:** 1 PLAN-mode alert (`renderPaydaySavings` L11048 pre-lock tick hint) violates UX contract §6
- **Sticky-state bugs:** 1 P0 root cause (`rolloverIfNeeded` drops `income.bonus` on cycle-end) + 1 P0 missing affordance (no `markPaydayLanded`)
- **Empty-state issues:** 1 P1 (canvas Savings goals section absent when no buckets, no message)
- **Legacy-mirror drifts:** 1 stale paidBills key (`Google Microsoft-1` should be `Google One-1`) + 2 intent-pollution entries (Test goal · Kia detail)
- **Layer V coverage gaps:** sub-screen captures missing (canvas Bills/Debts/Savings/Living/Upcoming + canvas modals not navigated). Plus script bug capture #19 plan-edit-trip-modal.
- **BRAIN architectural overlap proposals:** 1 Tier-3 SDD candidate (intent-driven canvas Savings rendering) queued for Bundle 29
- **Tier-2 reframe candidates:** 1 (PLAN-tab Annual Provisions tile → single nav-row) — 5/5 personas converge
- **Boot self-test coverage gaps:** ~14 PLAN-mode entry-point reachability checks missing

### Tonight-session readiness verdict

**🟡 Audit-ready, P0 fixes needed.** John's tonight session can run end-to-end TODAY ONLY IF the following P0 fixes ship:

1. **P0.1 — Bonus persistence through `rolloverIfNeeded`.** Today is cycle-end (2026-05-14 = cycleEndDate). First canvas open will rollover the cycle and silently drop any pre-rollover bonus. **Fix shape:** in `rolloverIfNeeded` L17978-83, conditionally carry `prevPlan.income.bonus` to `newPlan` when `bonus.status === 'expected'`. Add audit-log `plan_bonus_carried_to_new_cycle` event. Toast: "🔁 New cycle started — your $X bonus carried forward." (~20 LOC, low risk.)

2. **P0.2 — Manual `markPaydayLanded` affordance.** John has been paid in bank but `paydayReceived: false` in app (deliberate). He needs a way to record "payday landed early" when he chooses, so the cycle/freedom math acknowledges the salary in hand. **Fix shape:** add `BRAIN.plan.markPaydayLanded(ts, source)` method + `PAYDAY_MANUAL_LANDED` source tag + UI affordance (button on canvas-header OR in Bonus modal flow). `_resolveNextPayday`/`_resolvePreviousPayday` honor `actualPaydayTs` for current cycle if set. (~50 LOC + boot self-test entry + guardian-runtime check.)

**Both fixes are surgical, audit-clean, low-blast-radius.** Tonight viable WITH the fixes; broken WITHOUT.

P1 polish (if STEP 3 time allows):
- Bar legend on canvas root proportion bar (~10 LOC).
- Cycle-end label "0 days left" → "Cycle ended — payday tomorrow" copy fix (~3 LOC).
- Pre-lock tick `alert()` L11048 → toast (~3 LOC).
- 14 boot self-test reachability entries (~14 LOC batched).
- PLAN-tab Annual Provisions tile → single nav-row (Tier-2 reframe — pending John's go).

### Prioritised fix list

**P0 (tonight blockers — must ship in STEP 3):**

1. Bonus persistence through `rolloverIfNeeded` — preserve `income.bonus` when status='expected'.
2. Manual `markPaydayLanded` affordance — new BRAIN.plan method + UI button.

**P1 (this session if STEP 3 time, else next session):**

3. Proportion bar legend on canvas root.
4. Cycle-end label "0 days left" copy.
5. Pre-lock tick alert → toast.
6. Boot self-test reachability entries (~14 entries).
7. PLAN-tab Annual Provisions tile → single nav-row (Tier-2 reframe pending John).
8. "Add new savings target" hint phrasing.
9. Canvas Savings empty-state for goals section.
10. openEditPaydaySavings goal-context subtitle.

**P2 (this bundle 28, audit-driven, queued):**

11. DRY: canvas root computes `_provisionsTotal`/`essentialsTotal` twice (L9657 vs L9680).
12. Ask AI prompt path — verify bonus inclusion in totalToPlan-equivalent.
13. Trip-alloc bucket auto-creation parity (current: auto-allocate only).
14. Layer V script: navigate into canvas sub-screens + modals + fix #19 trip-edit selector.

**Queued (Bundle 29+, ACTION + WHEN):**

15. **Tier 3 Bundle 29:** intent-driven canvas Savings rendering — SDD draft in §E above; **ACTION:** finalise SDD `docs/sdd/SDD-2026-05-14-intent-driven-savings.md` after John's go/queue call **WHEN:** Bundle 29 Mother-redesign theme.
16. **Bundle 29 hygiene:** drop legacy `S.tripDefs` / `S.goalDefs` once intent readers migrate; cleanup migration for test-pollution intents (Test goal · Kia detail).
17. **Bundle 29:** `BRAIN.config.setIncome` propagate to `S.activePlan.income.netPay` automatically (drop manual sync at L10270).
18. **Bundle 29:** `BRAIN.allocation.lock` stamp `S.activePlan.lockedAt` itself (drop manual stamp at L10465-9).
19. **Bundle 29:** `S.bonuses` array vs `S.activePlan.income.bonus` — clarify boundaries / consolidate.
20. **Bundle 29:** Window-global `_billEditMode` → component state.
21. **Bundle 29:** stale `paidBills['Google Microsoft-1']` key — verify seedV26 ran or add cleanup.
22. **Bundle 30:** `BRAIN.allocation.lock` + activePlan.lockedAt single-write atomicity (smaller scope than Tier-3 redesign).
23. **Bundle 30:** Rules-as-data (per Audit A1 §5.5 + REWRITE-COMPARISON §5).

### 🔴 list (needs John's call)

- **R1 — Bucket-vs-intent mismatch on canvas Savings sub.** Property Deposit invisible · Freedom Buffer mislabeled. Two options: (a) wait for Tier-3 redesign Bundle 29 (clean), or (b) ship a quick-fix this session that adds goal-name subtitle on bucket rows ("Freedom Buffer — stored in Rainy Day Fund · $0/$9,000"). Option (b) is ~15 LOC, low risk, addresses tonight's John-side perception without the full redesign. **Recommend (b) tonight + (a) Bundle 29.** Pending your call.

- **R2 — Tier-2 reframe: PLAN-tab Annual Provisions tile → single nav-row.** 5/5 personas converge but this session vs Bundle 29? Recommend **this session** (small scope, John explicit ask). Pending your go.

- **R3 — Mum-summary bubble vs REMAINDER tile redundancy.** Tier-1 deliberation split 3-1-1. Audit recommends **drop the bubble + promote proportion bar legend + leave REMAINDER tile as anchor.** Design lead dissent: "Mum-readable summary at top" was deliberate r46. Pending your call.

### Tier 3 architecture proposals (queued)

- **SDD-2026-05-14-intent-driven-savings.md** — intent-driven canvas Savings rendering with bucket subline. 7/7 personas FOR + 5 manageable AGAINST. **Queue Bundle 29 Mother-redesign theme.** SDD draft skeleton in §E above; full SDD written if John gives go on R1 option (a).

---

_(End of STEP 2 audit. STEP 3 P0 fix sprint pending John's go after CHECKPOINT.)_

---

## STEP 3 — Fix sprint shipped

5 commits across 4 SHAs:

| Fix | Commit | Files | Verification |
|---|---|---|---|
| P0.1 bonus rollover preserve | `7db306e` | index.html (rolloverIfNeeded L17984+, openPaydayPlan toast) + SDD | gates green |
| P0.2 markPaydayLanded affordance | `7db306e` | index.html (BRAIN.plan method, SOURCES tag, canvas pill, wrapper, cycle-end copy) + SDD | gates green |
| R1 intent-driven goal subtitle | `b91ec2f` | index.html (renderPaydaySavings reverse-intent lookup, synthetic-goals block, openEditPaydaySavings goal-context modal) + SDD | gates green |
| R2 Annual Provisions nav-row | `f651d59` | index.html (renderAnnualProvisions converted, openManageProvisions modal) | gates green |
| R3 Mum-bubble drop + bar legend | `f651d59` | index.html (renderPaydayPlanRoot bubble removed, coloured-dot legend) | gates green |

Layer V verified visually (capture `slyght-layerV-2026-05-14-15-plan-provisions.png`) — the PLAN-tab Annual Provisions tile now renders as the single nav-row "🏦 Manage provisions · $298/mo · 5 items · ›" with the editable manage-modal opening on tap.

**TDZ at boot-time** — when Playwright load fires boot self-test at DOMContentLoaded+500ms, `BRAIN`/`PLAN` constants are in temporal-dead-zone (pre-existing Bundle 27 OPEN-BUG at index.html L1646/L11246/L13111 per `slyght_bundle_27_open_bugs` memory). The errors log to `BRAIN.audit` as `boot_self_test_fail` events but don't impact user-visible functionality (Layer V proper renders cleanly because it uses different timing). Queued as Bundle 29 hygiene — investigation needs script-evaluation-order audit (BRAIN const declaration vs boot-self-test setTimeout firing).

---

## STEP 3.5 — Strategic synthesis (the four John questions)

> _John 2026-05-14: "If I was to show someone my finances and how I'm planning to allocate my paycheck, does it make sense or is it confusing? What am I not accounting for? Is it too fixed so if something does come up I can't edit and adjust? How can we make this app function independently without requiring multiple sessions every day to operate?"_

This section answers each question honestly with citations to current code + audit findings.

### Q1 — Showing-someone test (clarity, post-fix)

**Verdict: ✅ Mostly clear, two surfaces still need narration.**

What a third party (Mum, an accountant, a partner) would see TONIGHT after these fixes:

| Surface | Showing-someone verdict |
|---|---|
| Canvas root | ✅ **Clear.** Hero "Money coming in this cycle · $X" → coloured proportion bar with real legend (R3) → "Essentials this cycle 🔒 FIXED" section with 4 nav rows + subtotal → "🎯 Remainder after essentials $Y" → "Allocating the remainder ✋ YOURS" section. Story reads top-to-bottom: in · committed · what's left · how you split it. **Mum can follow this without you.** |
| Bills sub | ✅ Clear. Progress bar + UNPAID-visible + PAID-collapsed sections. Per-bill amounts + due day. No jargon. |
| Debts sub | ⚠️ Mostly clear, but **🏠 VIA RENT** + **🤖 AUTO** tags need translation. Someone unfamiliar with John's setup would ask "what's via-rent mean?" — the explainer doesn't ship with the surface. **Add a one-line caption "🏠 VIA RENT debts repay automatically through the Rent + Deposit Savings bill — you don't pay these separately"** to the Extra Payments group. ~5 LOC. P1 next session. |
| Daily Living sub | ✅ Clear. "$X/day × N days = $Y" explicit formula. Status badge (Healthy/Tight/Below floor) gives one-glance verdict. About section explains the calc. |
| Savings sub (post-R1) | ✅ **Now clear.** "Freedom Buffer · stored in Rainy Day Fund · $0 of $9,000" reads in goal-language. Property Deposit appears as "Other savings goals · via Mum-managed savings". Bucket section + KIA-extra + footer Add-buttons. |
| Upcoming sub | ✅ Clear, useful empty state. |
| Auto-allocate modal | ✅ Clear post-r49d. Leads with "🔒 Already covered first (Essentials)" itemised list, then ✋ Allocatable, then urgency-weighted split with 🔥 Nd tags. Someone could follow this without context. |
| PLAN-tab (post-R2) | ⚠️ Liquid NW + Payday Plan tile + WRX + Trips + Goals are clear. **WRX card depth** (Cash After KIA Payoff $1,404 · Freed Per Month $780) assumes the viewer understands "selling the WRX pays off the KIA loan and frees the monthly payment." Without that context, the card reads as a status report with no narrative. **Add a 1-line headline "Selling WRX → pays off KIA loan → frees $780/mo for goals"** as the THE PLAN line — already partially present at capture #20 ("Sell WRX → Pay Off KIA Loan → Free $780/Month"). ✓ already shipped per r-er-prior. |

**Two specific narration gaps for next session:**
1. Debts sub — viaRent + autoDebit tag legend (a footer caption explaining the tags).
2. KIA Extra sub-row label could read "Pay down KIA faster (avalanche/snowball)" instead of "KIA extra · pay over the minimum" — verb-first for the action.

### Q2 — What's not being accounted for

**A. Spending after lock — no surface to retroactively adjust the cycle.**

Once John taps 🔒 Lock plan, overrides are committed. He can still:
- Re-plan (unlocks the plan).
- Tick items off as he handles them.
- Add to Known Upcoming (still editable post-lock per architecture).

But there's no "I overspent on groceries this week — what changes?" affordance. The daily-living recompute happens on render but the response is silent. **GAP:** post-lock, a real $50 unexpected expense doesn't visually update the canvas's "Allocated so far / Still free" trajectory. The math updates but the user doesn't see "you've slipped $X behind." Bundle 29 candidate: **cycle-progress strip** that shows "current pace · projected end-of-cycle" with weekly checkpoints.

**B. Bonus uncertainty.**

`bonus.status === 'expected'` is now correctly tracked. But what about HALF-confirmed scenarios? "Confirmed $X but tax-uncertain" or "expecting $X but the manager hinted lower." Current binary (expected/confirmed) doesn't capture this. **GAP:** an optional "probability slider" (50%/75%/100%) on the bonus modal so projection math weights accordingly. Bundle 29 — `bonus.confidence` schema field. ~30 LOC.

**C. Trip overages.**

Darwin is $900 budget, $0 saved, 24 days out. If John gets there and spends $1,200 actual, the app currently has no after-the-fact reconciliation. The "your share" copy assumes equal split with GF; if GF pays differently, John adjusts via Quick-Log post-trip. **GAP:** trip-end reconciliation flow — "Darwin trip ended. Actual: $X · Budget: $900 · Variance: ±$Y · adjust how?". Bundle 29 — `trip.actual` schema field + post-trip modal triggered when `trip.endDate < today` and unreconciled.

**D. Salary variability.**

Income simulator exists ($117,500 → $7,282/mo display, slider for raises) but isn't tied to the canvas plan. If John gets a raise mid-cycle, the canvas still computes against `S.income` which doesn't auto-flag stale. **GAP:** "Income changed in the last 30 days? Re-run your plan" prompt when `S.income` audit-log shows a recent edit. Bundle 30.

**E. Surprise expenses (overdraft / chargebacks / refunds).**

Quick-Log handles these but they DON'T affect the current cycle's allocation plan unless John re-allocates manually. If a $300 surprise lands on day 10 of the cycle, the canvas shows degraded "Still free" but doesn't suggest WHICH allocation to trim. **GAP:** "$X over budget — auto-suggest reallocations" reactive flow. Could pipe through AI affordability query. Bundle 30.

**F. Tax + super.**

Tax is netPay-only (post-tax salary). Super contribution is displayed but NOT folded into cash-flow planning — it's locked, correct. But the "what's free" math doesn't show "you're putting $X/mo into super pre-tax — your gross is $Y". **NOT A GAP for tonight** but conceptually missing for retirement framing. Bundle 29 retirement-canvas (Mission B29 candidate).

**G. Goal completion + celebration.**

When Freedom Buffer hits $9,000, what happens? Currently `markGoalComplete` exists (button on Goals tile), but there's no celebration moment + no auto-redirect of the monthly $X to next-priority goal. **GAP:** "Freedom Buffer complete 🎉 — redirect $X/mo to Property Deposit?" Bundle 29.

### Q3 — Is it too FIXED? (flexibility audit)

**Verdict: 🟢 Mostly flexible. Three rigidity points worth easing.**

Inventory of edit paths in PLAN-mode:

| Concept | Edit path | Friction |
|---|---|---|
| Net pay (cycle income) | openEditPaydayBonus modal (canvas) | 3 taps. Low. |
| Bonus | openEditPaydayBonus modal (canvas) — toggle + amount + status | 4 taps. Low. ✓ |
| Per-bill amount | openEditPaydayBill modal — Pay-in-full vs Defer toggle | 4 taps + reason. Medium. ✓ |
| Per-debt amount | openEditPaydayDebt modal — quick-pick 0-100% | 2 taps. Low. ✓ |
| Per-bucket savings | openEditPaydaySavings — quick-pick 0-1000 | 2 taps. Low. ✓ |
| Per-trip allocation | openEditPaydayTripAlloc — quick-pick | 2 taps. Low. ✓ |
| KIA extra | openEditPaydayKiaExtra | 2 taps. Low. ✓ |
| Daily living floor | openEditPaydayLivingFloor | 2 taps. Low. ✓ |
| Buffer floor | openEditPaydayBufferFloor | 2 taps. Low. ✓ |
| Known Upcoming items | add/edit/remove via Upcoming sub | 3 taps each. Low. ✓ |
| Annual provisions | manage modal (R2 nav-row) | 3 taps via PLAN-tab. Medium. ⚠️ |
| Goals (target / monthly / name) | editGoal via PLAN-tab Goals tile | 3 taps. Medium. ✓ |
| Trips (destination / dates / budget) | editTrip via PLAN-tab Trips tile | 3 taps. Medium. ✓ — but capture #19 plan-edit-trip-modal failed (Layer V script bug); verify on phone tonight. |
| Lock state | openPaydayLockPlan / openPaydayUnlockPlan | 2 taps + confirm. Low. ✓ |
| Auto-allocate apply | openPaydayAutoAllocate Apply | 2 taps + confirm. Low. ✓ |
| Undo last change | paydayUndoLast header button | 1 tap + confirm. Low. ✓ |

**Three rigidity points:**

1. **Cycle dates are derived, not edited.** `S.activePlan.cycleStartDate` / `cycleEndDate` are computed by `_resolveNextPayday`/`_resolvePreviousPayday` from `S.payday`. If John's actual payday shifts (e.g. employer changes pay day, or he takes leave), he can't directly edit the cycle window. He has to change `S.payday` in Settings — which has global blast radius. **P1 next session: per-cycle override of cycleEndDate.** ~15 LOC.

2. **The proportion bar is read-only.** John can see Bills/Debts/Savings/Upcoming/Living as proportions of total but can't tap a segment to "force re-balance." Auto-allocate is the closest tool but it doesn't proactively suggest "shift $50 from Living to Savings." **P2 next session: tap proportion bar segment → 'how do I move this?' explainer + auto-allocate prefill.** ~40 LOC.

3. **Tick-state is mostly forward-only.** Untick exists (untickItem method exists per code-grep) but the visible affordance is limited. Long-press to untick was queued (per CHANGELOG Bundle 27 deferred). **P1 next session: untick affordance on ticked rows.** ~10 LOC + UX consideration.

Everything else has clear edit paths. Net flexibility verdict: 🟢 healthy.

### Q4 — Functioning independently (reducing session burden)

**Verdict: ⚠️ Currently 3-4 manual sessions/cycle. Can reduce to 1-2 with targeted automation.**

**Today's burden inventory:**

| Per-cycle action | Frequency | Manual? |
|---|---|---|
| Open canvas to plan cycle | Once per cycle (payday landing) | Manual ✓ deliberate |
| Add bonus | When known | Manual ✓ |
| Mark payday landed (post-P0.2) | Once per cycle | Manual ✓ |
| Set bill overrides | When non-default | Manual ✓ deliberate |
| Set debt overrides | When non-default | Manual ✓ deliberate |
| Allocate savings | Every cycle | Manual OR auto-allocate ✓ |
| Lock plan | Once per cycle | Manual ✓ |
| Tick items as paid | Per-event (~10-20 times/cycle) | Manual ⚠️ |
| Reconcile balance drift | Per-event (~2-5 times/cycle) | Manual ⚠️ |
| Quick-Log expenses | Per-expense (~20-40 times/cycle) | Manual ⚠️ |
| Re-plan if surprise | When happens | Manual ✓ |

Rough estimate: **~30-50 in-app interactions per cycle** for John. Most are tick + Quick-Log + recon.

**Five mechanisms that would reduce burden without losing control:**

**1. Auto-tick bills on detected payments (already partial).** `autoMatchBillsToTxns` + `autoDetectBillPayments` per code-grep exist with strict matching (r7.2.3). Enhancement: surface a "We marked Optus $194 paid (matched txn 2026-05-15 21:43). Tap to confirm/undo." UNDO-toast pattern. ✓ scope. Bundle 29. **Saves ~10 ticks/cycle.**

**2. Smart Quick-Log defaults.** Today Quick-Log requires amount + note + category each time. Enhancement: pattern-detect from recent — "Looks like a Woolworths Kirrawee groceries entry? Auto-fill $X amount and 'Food/Coffee' category. Tap to log or edit." Could ship as a small AI-assist on the Quick-Log modal. Bundle 30. **Saves ~5-15 logs/cycle.**

**3. Receipt-scan flow.** John mentioned this morning. Camera → OCR → product + price + vendor. Bundle 29+. Saves Quick-Log entirely for receipts. **Could save 10-20 logs/cycle.**

**4. Automatic balance reconciliation.** Today John has to hero-tap to enter bank balance + pick reason. Could auto-recon on each fresh state-snapshot import (when device-sync lands, Bundle 23). Bundle 23 dependency. **Saves ~3-5 recons/cycle.**

**5. Daily/weekly digest notifications.** Push notification via CF Worker (Phase 7 queue): "Hey John — you're $X under pace this week. Three bills due in next 5 days totalling $Y. Bowie vet was paid 2 days ago — confirm?" Bundle 29+. **Saves 1-2 daily check-ins by being proactive about anomalies.**

**Architectural sketch for "function independently":**

```
DAILY-LIFE PASSIVE OPERATION
─────────────────────────────
[1] Phone Settings → PWA install + notification permissions
[2] Device sync (Bundle 23) keeps state mirrored across devices
[3] Push notifications (Bundle 29+) surface anomalies + opportunities
[4] Auto-detect bills (existing + enhanced) tick on matched txns
[5] AI-assist Quick-Log (Bundle 30) reduces logging friction
[6] Cycle-progress strip on canvas shows pace without opening it
[7] Receipt-scan (Bundle 29) skips Quick-Log entirely for shops

INTENTIONAL CHECK-INS (target frequency)
───────────────────────────────────────
- 1× per cycle: open canvas to plan + lock (~10 min)
- 1× per cycle (mid-cycle): "am I on pace?" pulse check (~2 min)
- 1× per cycle (cycle-end): review what landed vs planned (~5 min)
- Total: ~20 min per cycle of intentional engagement
- Plus push-driven reactive moments (~30s each, 2-3x/week)
```

**Critical missing pieces for this future (queued):**
- **Bundle 23 — Gist sync** (locked decision per `slyght_bundle_23_cloud_sync` memory). Multi-device + persistence.
- **Bundle 29 — Decision-support features** per Audit A1 §6 (Debt Race · Retirement Canvas · Annual Sinking Funds · plus receipt-scan + auto-bill-detect enhancements).
- **Phase 7 CF Worker push notifications** (already specced — drift, weekly digest, cycle-end recap).
- **Bundle 30 — Rules-as-data + AI tool-use for direct propose/apply** so AI can read state + suggest changes the user accepts/rejects with one tap.

**The North Star:**

> _Open the app once a fortnight to plan. Tap a notification to confirm two anomalies a week. Quick-log via receipt-scan or voice. Reconcile when the bank balance diverges by >$50. Everything else just happens, with the app being the truth-source the user can verify._

That's a 60-80% reduction in session-burden from today's pattern. None of the pieces require BRAIN architecture changes; they layer on top of the current canonical-writer foundation. **Achievable in 4-6 bundle cycles (Bundle 29 → 30 → 23 → 31 → 32) over ~2-3 months.**

### Strategic synthesis verdict

- **Showing-someone test:** Mostly passes post-fix. Two narration gaps (Debts viaRent legend + KIA Extra label) are P1 next session.
- **Not accounting for:** 7 gaps inventoried, 5 are Bundle 29+ scope, 2 are Bundle 30+ scope. None block tonight.
- **Too fixed?** 🟢 healthy. Three rigidity points (cycle-date override, tap-bar-segment, untick affordance) are P1/P2 next session.
- **Independent operation:** Achievable in 4-6 bundles via Bundle 23 (sync) → Bundle 29 (decision-support + auto-detect) → Phase 7 CF Worker (push) → Bundle 30 (AI tool-use). Today: ~30-50 interactions/cycle. Target: ~20 minutes intentional + 2-3 push-driven reactions/week.

**End of audit + fix sprint + strategic synthesis. Tonight's planning session is ready.**
