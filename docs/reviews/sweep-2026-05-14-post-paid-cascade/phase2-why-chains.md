# Phase 2 — Why-Chains

For each visible quirk/insight: grounded in source code + state, with the "smoking-gun" frame called out.

---

## C-01 🚨 BLOCKING — `rolloverIfNeeded()` silently wipes the lock+ticks every time the canvas is re-opened past 12h after cycle end

**Smoking gun:** captured during sweep run, NOT in a frame — the probe before re-opening showed `lockedAt: 1778764203512, ticksBillCount: 15, ageHours: 13.17`. After re-opening: `lockedAt: null, ticksBillCount: 0`. `_emptyActivePlan()` happens to produce the same `cycleId` because today (14 May) is the cycle boundary day, so the wipe is invisible to the user — they see the same cycle date but blank progress.

**Why-chain:**
- `openPaydayPlan()` at `index.html:9642` calls `BRAIN.plan.rolloverIfNeeded()` on every canvas open
- `rolloverIfNeeded` at `index.html:19820` runs the full archive+new-plan path when `now >= cycleEndDate AND ageMs >= 12h`
- 12h after cycle end ≈ early afternoon AEST on payday day. Most users open the canvas BETWEEN noon and midnight on payday — exactly the wipe window.
- The new plan has the same cycleStartDate (`_resolvePreviousPayday` returns yesterday's payday), so the canvas looks identical EXCEPT lockedAt is null and ticks are empty.
- **This is the user-perceived "PLAN gets wiped after every commit"** — the c9331c7 fix only closed the boot self-test path. The user-initiated open path still wipes.

**Severity:** BLOCKING — primary user workflow (lock in morning, mark off bills throughout the day) is silently destroyed past 12h.

**Fix sketch:**
1. Move the 12h boundary OR
2. Defer rollover until `cycleStartDate` of the NEW cycle has been crossed (clean cycle boundary, not "12h after end") OR
3. Only auto-rollover when there's NO work in progress; otherwise surface a banner asking the user to confirm rollover.

---

## C-02 🚨 HIGH — Dashboard banner "Bills tracked as paid early — tap to review" treats post-paid state as a WARNING, not a celebration

**Smoking gun:** frame 01 top — red/critical-styled banner with "Show me these bills" CTA.

**Why-chain:**
- `S.activePlan.ticks.bill["X"]` records timestamp `ts`. Some renderer compares `ts` against the actual bill's due date.
- If `ts < dueDate`, bill is "tracked early" — flagged as a discrepancy. (likely intentional anti-fraud / data-quality check)
- In John's actual workflow, he taps Mark-as-paid at payday lock-time before the due date for the cycle — so EVERY bill gets flagged as "tracked early".
- Effect: the very action the BIG BRAIN cascade is supposed to celebrate ("I marked all 15 paid!") gets buried under a red warning.

**Severity:** HIGH UX — punishes the happy path. Either downgrade to grey informational, or detect "intentional early mark inside lock window" and skip the warning.

---

## C-03 🚨 HIGH — Dashboard hero says "$11.72 left · CRITICAL" while the canvas root says "ALL PAID · 100%"

**Smoking gun:** frame 01 vs frame 10.
- Dashboard frame 01: hero `$11.72 · CRITICAL · $11.72 left · Maximum: $0.00/day to survive` + "Running $4,616.04 over pace this week"
- Canvas root frame 10: "Bills $5,248 · 15 of 15 paid · 100% · ALL PAID" + "Your free money this cycle $268"

**Why-chain:**
- Dashboard hero reads ACTUAL bank balance ($11.72 Virgin Money). Bills "paid" in BIG BRAIN doesn't move actual money.
- The dashboard's "CRITICAL" framing assumes balance reflects pending obligations. Once bills are "tracked" but not actually withdrawn, the dashboard still thinks $11.72 is the runway.
- Both views are arithmetically correct from their own POV; together they tell contradictory stories.

**Severity:** HIGH — this IS the "no misyncs" John has called out as north-star. The same workflow surfaces opposite emotions on adjacent screens.

**Fix sketch:** the dashboard needs a "post-tick projection" mode: show `actualBalance` AND `projectedBalanceAfterMarkedBillsLand`. The canvas already knows the cycle plan; share the math.

---

## C-04 🚨 HIGH — Bills tab strikes through bills as paid but Analysis tab acts as if nothing happened

**Smoking gun:** frame 04 (Bills tab shows ✓ on every tracked bill) vs frame 09 (Analysis bottom says "Projected to run out today" with no acknowledgement that $5,248 in bills are accounted for).

**Why-chain:**
- Bills tab renderer reads `S.activePlan.ticks.bill` AND/OR `isThisMonthlyBillPaid` (Bundle 14 BRAIN.bills bubble path). It honors the tick state visually.
- Analysis tab (`pg-spend`) reads actual transaction history only — `S.txns` / category aggregations. It has no knowledge of "marked paid in plan but no transaction yet".
- Result: Bills tab celebrates, Analysis catastrophizes.

**Severity:** HIGH — Analysis is John's "decision surface" (can I afford X). It should at minimum BADGE the runway view with "+$5,248 in bills pending burn-down" so he doesn't panic.

**Fix sketch:** Analysis runway calc reads `BRAIN.plan.getSnapshot().ticks` AND the lock state. When locked + ticks present, show "Expected to land — $X already allocated, won't burn balance".

---

## C-05 ⚠️ MEDIUM — Calendar shows "$31 ✓" on 14 May (today) — Afterpay marked TRACKED, but it has dot+strike treatment THAT ALSO appears for non-marked future bills

**Smoking gun:** frame 04 calendar — 14 May has strike `$31` with ✓ (today's tracked Afterpay). 28 May has plain `$31` (no strike) (future-not-yet-paid Afterpay debt). The visual distinction is subtle.

**Why-chain:**
- Strike-through uses `<s>` or `text-decoration` on bills that have `paidBills[]` entries OR `S.activePlan.ticks.bill[name]`.
- The calendar tile shows strikethrough AND a ✓ checkmark.
- Distinction from "due-future" vs "due-past-unpaid" is by color contrast only.

**Severity:** MEDIUM — not wrong but adds cognitive load. Could add subtle green tint to paid days.

---

## C-06 ⚠️ MEDIUM — "$5,248 · 15 of 15 paid · 100%" but Annual Provisions still says "5 set-aside items" rather than reflecting any post-paid context

**Smoking gun:** frame 10 — Essentials tile grid.

**Why-chain:**
- Annual Provisions is a separate category from Bills. Not affected by `ticks.bill`.
- Tag says [MONTHLY] which means "set aside monthly amount", not "monthly bill due now".
- User reading the tile sees "Bills ALL PAID · Provisions 5 items" — interprets Provisions as ALSO needing action.

**Severity:** MEDIUM — copy clarity. Could append "auto-saved" or "0 actions needed".

---

## C-07 💨 SMELL — Savings sub-screen post-paid shows "$0 left to split across goals" with $566 surplus − $298 provisions − $364 buffer = $0 (math hits zero exactly, no allocation possible)

**Smoking gun:** frame 13 — POOL TO ALLOCATE breakdown.

**Why-chain:**
- Bundle 28 Phase 0 buffer math: surplus $566 minus provisions $298 minus safety buffer $364 = -$96.
- Display floors at $0 (good — avoids negative-pool confusion) but the breakdown line still shows "$566 - $298 - $364 = $0" which reads as if the math worked out perfectly.
- Actual result: $-96 below safety, no allocation possible.

**Severity:** SMELL — the breakdown could say "= -$96 → $0 floor (below buffer)" to be transparent.

---

## C-08 💨 SMELL — Sub-screen Bills empty-success state "✓ All 7 bills in this section already paid" + "✓ All 8 bills in this section already paid" is informative but doesn't celebrate

**Smoking gun:** frame 11.

**Why-chain:**
- When every row in a section is ticked, the row list collapses to a single italic line per section.
- Good information design (don't repeat the obvious) but loses the dopamine hit John explicitly asked for ("celebrate it").

**Severity:** SMELL — bundle 29 "alive" pass candidate. Add 🎉 emoji + "Cycle bills are sorted" hero line.

---

## C-09 🎨 DESIGN — Debts sub-screen "0 of 2" header doesn't visually distinguish from a fresh-pre-lock view

**Smoking gun:** frame 12 — header "$718 · 0 of 2" with two Mark-as-paid buttons below.

**Why-chain:**
- Header `_paydayShellHeader(snap, 'debts')` formats "$X · N of M paid". Same template pre-lock and post-lock — same header.
- Pre-lock: rows have no Mark button (cards are read-only). Post-lock: rows have Mark button.
- User only knows they're in post-lock state by noticing the button. Header could announce "Locked · $718 still due — mark off as you pay".

**Severity:** DESIGN — minor.

---

## C-10 ⚠️ MEDIUM — Dashboard "Maximum: $0.00/day to survive" + canvas "Free money this cycle $268" disagree on what's left

**Smoking gun:** frame 01 says $0/day max. Frame 10 says $268 free money.

**Why-chain:**
- Dashboard "max per day" = `(actualBalance - reservedForBills - reservedForDebts) / daysUntilPayday`. With $11.72 balance and $5,248 + $718 reserved, result is negative → floored at $0.
- Canvas "free money" = post-payday-receipt projection: `nextPayCycleIncome - cycleEssentials - bufferFloor`.
- They're answering different questions but using language that sounds equivalent.

**Severity:** MEDIUM — calls for a unified "money clock" view that toggles between modes.

---

## C-11 💨 SMELL — Bills tab BNPL pill at bottom (frame 04 cut off) is the only "Add A Bill"-style action, hidden far below the calendar fold

**Smoking gun:** frame 04 bottom shows truncated `+ Add A Bill` + `BNPL` button row.

**Why-chain:**
- Action affordance below the fold of a long calendar means users won't discover Add Bill / BNPL easily.

**Severity:** SMELL — UX discoverability.

---

## C-12 ✅ CASCADE WORKING — multiple positive signals to call out

- Bills tab calendar correctly strikes through every paid day (frame 04)
- Bills tab list shows TRACKED tag on every this-cycle bill (frames 05-06)
- Canvas root Essentials tile correctly shows ALL PAID + 15 of 15 (frame 10)
- Sub-screen Bills shows full progress bar + empty-success state (frame 11)
- Sub-screen Debts correctly skips Mark-as button on viaRent-routed Property Deposit (frame 12)
- Dashboard banner DID surface the post-paid state, even if framing is wrong (C-02)
