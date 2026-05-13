# MISSION: FORECAST PAYDAY NETTING (Mission C)

## Why this mission exists

The Survival Forecast card on John's phone (Analysis tab, captured 
earlier today) shows:

```
BREAKDOWN TO PAYDAY
Current balance              +$381.35
Unpaid bills (3)             -$3089.19
  Pet Insurance — Bowtie (8th)   -$60.20
  Netflix (10th)                 -$28.99
  Rent + Deposit Savings (15th)  -$3000.00
Upcoming debts (1)           -$93.56
  Afterpay (14 May)              -$93.56
Min living costs (10d × $38.99)  -$389.90

Remaining at payday          -$3191.30
```

The math is internally consistent. The frame is wrong.

**The bug:** Rent + Deposit Savings is due day 15. Salary 
($7,282) also arrives day 15. The card counts the rent as 
outflow but doesn't credit the salary as inflow. The result is a 
panic-inducing -$3,191 number that doesn't reflect reality.

OPEN-BUGS this resolves:
- **#19** — Forecast doesn't credit upcoming income before payday
- **#2** — Probable side effect of #19 (forecast/dashboard 
  divergence on what payday means)
- **#3** — Probable side effect of #19 (recommendation to borrow 
  $3,200 is wildly off when payday salary covers most of the gap)

## The frame question (read carefully — this is the whole mission)

The forecast is answering a question. There are two reasonable 
questions, and the current code answers neither cleanly:

**Question A — "End of current cycle":** What's my balance the 
moment before payday lands? In this frame:
- Bills due strictly BEFORE day 15 are outflows (Pet Ins day 8, 
  Netflix day 10)
- Bills due ON day 15 are NEXT cycle's problem (Rent day 15, KIA 
  Loan day 15) — exclude
- Debts due before day 15 are outflows (Afterpay day 14)
- Salary on day 15 hasn't landed yet — exclude
- Living costs for days remaining (today through day 14) are 
  outflows

Output: "you'll have $X left at end-of-cycle, before salary lands"

**Question B — "Start of next cycle":** What's my balance the 
moment after payday lands? In this frame:
- All of Question A's outflows
- PLUS bills due ON day 15 (they hit same time as salary)
- PLUS salary as income
- PLUS any debts owed on payday morning

Output: "you'll have $X right after salary lands and same-day 
bills clear"

**Question A is the more useful frame for "do I need to survive 
until payday."** Question B is "what's my net position when the 
new cycle starts."

The current code mixes them: includes Rent (day 15 — Question B 
territory) but excludes Salary (also day 15 — Question A 
territory). That's the bug.

## Required reading before starting

1. PROJECT-EXTRACT-2026-05-05.md § 4.2 (MODEL fields, especially 
   any forecast-related fields like `survivalForecast`, `runOutDate`)
2. The Survival Forecast card render function (likely 
   `renderSurvivalForecast` or similar — search for the card's 
   text "Projected to run out" or "Remaining at payday")
3. The forecast computation function — wherever the "Remaining 
   at payday" math is built. Could be a helper, could be inline
4. `S.income` (currently 7282), `S.payday` (15), `S.paydayReceived` 
   (boolean), `MODEL.daysToPayday`
5. `getBillsDue()` and `getExpandedBills()` to see how upcoming 
   bills are computed
6. `S.debts` and how `delayDate` is interpreted

## What to do

### Step 1 — Investigation (no code, STOP gate)

Three sub-investigations.

#### 1A — Locate the forecast computation

Find where "Remaining at payday" is computed. Identify:
- Function name and line number
- What inputs it uses (balance, bills filter, debts filter, 
  living cost calc, income credit if any)
- The exact filter condition that decides which bills count
- The exact filter condition that decides which debts count
- Whether income is added at all (likely no, given the bug)

Print the current logic in pseudocode so it's explicit.

#### 1B — Decide the frame

Default recommendation: **Question A — "End of current cycle"**.

Reasoning: 
- The card title is "Projected to run out in 8 days (Tue, 12 
  May)" — that's a survival framing, asking "do I have enough to 
  reach payday."
- The "If you need to borrow" subcard reinforces survival framing 
  ("Minimum to borrow to survive").
- For survival math, the user wants to know "is my current 
  balance enough to hit payday WITHOUT new income arriving" — 
  Question A.

But surface for John's confirmation. Reasonable alternative if 
he prefers: **Question B with explicit framing** — change card 
title to "Net position after payday lands" and credit salary.

A worse path: combine both into a multi-frame card with two 
numbers. Dismiss this — adds complexity without clarity.

#### 1C — Specify the math precisely

For Question A (recommended frame):

```
upcomingBills = bills where bill.day < S.payday AND not paid
upcomingDebts = debts where delayDate < (next payday date) AND not paid
livingDays = MODEL.daysToPayday  (or daysLeft, post-Mission F)
livingCosts = livingDays * historicalDailySpend
remaining = S.bal - sum(upcomingBills) - sum(upcomingDebts) - livingCosts
```

Edge cases to confirm:
- What about bills due day 15 (payday day) — strict less-than? 
  Spec says yes, exclude.
- What about debts with delayDate ON payday — same logic, 
  exclude.
- If `S.paydayReceived === true`, the cycle has rolled over and 
  "next payday" is ~30 days out. The forecast should already 
  handle this via MODEL.daysToPayday post-rollover.
- Living costs: `historicalDailySpend` — what computes this? 
  Verify it's reasonable for current state. Card shows "$38.99 
  from history" which seems plausible.

Surface any of these edge cases that have unclear answers.

#### 1D — "If you need to borrow" downstream impact

The "Recommended amount (rounded): $3200" math is downstream of 
the forecast. Once the forecast is correct (probably small 
positive or small negative number, not -$3191), the borrow 
recommendation will collapse to "$0 — you don't need to borrow" 
or similar small amount.

Confirm: when remaining is positive or near-zero, does the 
"If you need to borrow" subcard hide entirely? Or does it show 
"$0 — no borrow needed"? Propose UX:
- Hide the subcard if remaining > $0
- Show "no borrow needed" reassurance text if remaining is 
  positive
- Show the borrow card only when remaining < some threshold 
  (e.g., remaining < -$100 = real survival concern)

### Step 1 deliverables

- Current logic in pseudocode
- Frame decision (Question A vs B), confirmed with John
- New math spec with edge cases resolved
- Borrow-card behavior decision
- List of any other downstream consumers of the forecast number 
  that may need updating

STOP for John's review.

### Step 2 — Implement (after approval)

In single pass:
- Update forecast computation to match agreed math
- Update card UI per borrow-card decision
- Add MODEL.survivalForecast field if forecast becomes a derived 
  value (consistent with MODEL discipline established earlier)

After change:
```
npm run guardian-static
npm test
npm run visual
```

Visual diff expected on Analysis baseline. The card's numbers 
will change dramatically — from -$3,191 to whatever the correct 
"end of cycle" math produces (probably a much smaller, possibly 
positive, number). Regen baseline via visual:update, commit 
along with code change.

### Step 3 — Verify

Layer 2 has an existing invariant `borrow-recommendation-sane` 
(or similar — check Layer 2 catalog). If the borrow recommendation 
goes to $0 or hides when remaining is positive, that invariant 
becomes a regression gate for this fix.

Run all gates:
```
npm run guardian-static    → exit 0
npm test                   → 36/36 passing
npm run visual             → analysis.png diff accepted, others clean
npm run guardian           → all gates green
```

On phone after deploy:
- Open Analysis tab. Survival Forecast card now shows correct 
  "remaining at payday" reflecting the right frame.
- Borrow recommendation either hidden or showing reasonable 
  small amount, not $3,200.
- Run-out date at top of card may shift — verify it's coherent 
  with new math.

### Step 4 — Commit and push

Single commit:

```
fix(forecast): correct payday-frame netting in Survival Forecast

Frame: end-of-current-cycle. Bills/debts due STRICTLY BEFORE 
payday day count as outflows. Bills/debts/income on payday day 
itself excluded — they belong to the next cycle's accounting.

Previous code mixed frames (counted day-15 rent as outflow but 
didn't credit day-15 salary as income). Result: card showed 
-$3,191 panic number that didn't reflect reality.

New math: balance - bills_before_payday - debts_before_payday - 
(daysToPayday * historicalDailySpend) = remaining_at_eod_cycle

Borrow card: hidden when remaining > $0, shows reassurance text. 
Visible only when remaining < -$100 (real survival concern).

Visual baseline regenerated for analysis.png.

Closes OPEN-BUGS #19, #2, #3.

Layer 2 borrow-recommendation-sane invariant becomes regression 
gate for this fix.
```

Push immediately.

## Constraints

- **Single frame, applied consistently.** No multi-frame cards.
- **No regressions** to any prior commit
- **Single commit** for math fix + UI update + baseline regen
- **36 tests must still pass** (consider adding 1-2 unit tests 
  for the forecast math at edge cases — bill exactly on payday, 
  debt exactly on payday, paydayReceived === true)
- **Layer 1 must still exit 0**
- **Layer 2 must still all pass on real state** — except MI-13 
  (legitimate per Mission B framing)
- **Visual diff on analysis.png is expected and accepted via 
  visual:update**
- **No new helper extraction** beyond MODEL.survivalForecast if 
  cleanly extractable

## Push back if

- Frame decision isn't clean cut (e.g., the card has two 
  audiences and needs both frames) — surface for design review
- Edge cases aren't cleanly resolvable (e.g., paydayReceived 
  flag interaction with forecast becomes complex)
- Living cost calculation has its own bug worth fixing in same 
  commit (or worth deferring)
- The borrow recommendation logic is more complex than expected 
  and warrants its own mission
- Other downstream consumers of forecast number surface that 
  affect dashboard or other tabs

## Estimate

Medium. Investigation is the bulk — getting the frame right 
matters more than the implementation. Once frame and math are 
agreed, the code change is small.

## Run with

```
Read C:\Users\admin\slyght\MISSION-FORECAST-NETTING.md and 
execute.

Step 1 first — investigate the forecast computation, decide the 
frame (recommend Question A — end-of-current-cycle), specify 
new math precisely. Print findings, STOP for John's review.

This fixes the -$3,191 Survival Forecast that's been sitting 
on John's phone. Math is internally consistent currently but 
mixes frames (counts day-15 rent as outflow, ignores day-15 
salary). Pick frame, apply consistently.

Closes OPEN-BUGS #19 (and likely #2, #3 as side effects).

Single commit including baseline regen for analysis.png.
```
