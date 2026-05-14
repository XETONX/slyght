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

---

## STEP 2.2 — Cross-cutting passes

_[Pending — runs after surface walks.]_

- A. Duplicate canonicalisation map
- B. Formula coherence table
- C. Audit-tag coverage
- D. Stale string sweep
- E. BRAIN overlap (deliberation-eligible per Tier 3)
- F. Boot self-test coverage
- G. Legacy mirror audit

---

## STEP 2.3 — Vision UI pass

_[Pending — runs after captures complete.]_

---

## STEP 2.4 — Summary

_[Pending — runs at end of STEP 2.]_

- Counts
- Tonight-session readiness verdict
- Prioritised fix list (P0 / P1 / P2 / queued)
- 🔴 list
- Tier 3 architecture proposals (if any)
