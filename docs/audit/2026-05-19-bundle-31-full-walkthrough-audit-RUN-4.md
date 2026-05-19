# Bundle 31 Phase 1B — Full Walkthrough Audit

**Date:** 2026-05-19  
**Model:** claude-haiku-4-5-20251001  
**Surfaces audited:** 15 of 15  
**Findings:** 74 (P0: 0, P1: 37, P2: 37, P3: 0)  
**Total Haiku cost:** $0.0957  
**Duration:** 2.6 min  
**Aborted:** no  
**API call trace:** `docs/audit/2026-05-19T06-14-03-278Z-trace.jsonl` (one JSONL line per API call — request IDs, token counts, raw responses for verification)  

## Findings by severity

### P0 (0)

_None._

### P1 (37)

**p1b-001** `clarity` · dashboard-hero
- **Finding:** UNLOCK button on plan-locked banner has no verb clarity—does it unlock the plan, show details, or navigate elsewhere?
- **Evidence:** Green 'UNLOCK' button top-right of 'Plan active · locked 18 May' banner; no accompanying tooltip or microcopy explaining action outcome.
- **Fix complexity:** small

**p1b-002** `clarity` · dashboard-hero
- **Finding:** Running pace warning ($28.94 over) lacks visual hierarchy vs. MAX PER DAY card below it; user may miss the actionable alert in favor of the larger green callout.
- **Evidence:** Red warning text 'Running $28.94 over pace this week ⚠️' is small and grey-on-white in MAX PER DAY card; MAX PER DAY $30.00 card above dominates visual weight despite being contextual, not primary.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item 10

**p1b-004** `semantic` · dashboard-hero
- **Finding:** Liquid net worth label lacks definition; '$+9,398.91' is shown but unclear if this is investable surplus, buffer, or includes illiquid assets.
- **Evidence:** 'Liquid net worth · tap for full picture' with small link text; 'full picture' is vague and assumes John knows what 'liquid net worth' means vs. total net worth or emergency fund.
- **Fix complexity:** small

**p1b-006** `consistency` · dashboard-hero
- **Finding:** Cycle date ('18 May') is locked but 'Liquid net worth' and MAX PER DAY math may assume different cycle boundaries; no explicit statement of when cycle resets relative to payday (27 days shown).
- **Evidence:** 'Plan active · locked 18 May', '27 days to payday' progress bar, MAX PER DAY $30.00—no clear statement of whether all metrics reset on payday or 18 May or another date; could cause John to misalign spend decisions.
- **Fix complexity:** medium

**p1b-001** `clarity` · dashboard-scrolled-cards
- **Finding:** MAX PER DAY card shows $30.00 limit but lacks explicit statement of remaining budget for today, forcing cognitive load to calculate 'is $30 my limit or my remaining balance?'
- **Evidence:** MAX PER DAY card displays '$30.00' as primary value with subtext 'You're on track — spend wisely' but doesn't explicitly state 'You have $30 left today' or 'Daily limit: $30'
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item 10

**p1b-003** `consistency` · dashboard-scrolled-cards
- **Finding:** IMMEDIATE DEBTS section shows Property Deposit as '$5,681' with notation '➜P900/mo' and '27d to payday', but the '➜P900/mo' assumes rent context that should be labeled explicitly (e.g., 'Rent: $900/mo').
- **Evidence:** Property Deposit card under IMMEDIATE DEBTS displays '$5,681' and small-print '➜P900/mo · ~7 months (xtn rent = 0) ready counted' without clarifying that P900 is monthly rent obligation, not deposit repayment schedule.
- **Fix complexity:** small

**p1b-001** `clarity` · bills-tab-top
- **Finding:** Paid bills shown in calendar view with no visual distinction from unpaid, making it unclear which bills in the month have already cleared.
- **Evidence:** Calendar grid for April 2026 shows dates (21, 21, 25, 26) with bill entries below, but no P0/paid indicator badge like the red/green legend suggests should exist. Legend shows 'Bill' (red dot) and 'Payday' (green dot) and 'Bill + debt' (grey dot), but calendar entries lack these dots.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item 18 (Paid-this-month counter may undercount — suggests paid state tracking is inconsistent)

**p1b-003** `consistency` · bills-tab-top
- **Finding:** '$86' week total does not visibly sum the four listed bills ($37 + $9 + $24 + $16 = $86), but no explicit line-item breakdown shown to verify the math.
- **Evidence:** THIS WEEK section shows total '$86' in top right. Four bills listed below with prices $37, $9, $24, $16. While sum is correct, no subtotal line or itemized total row makes the arithmetic transparent to a scanning user.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item 1 (math/labeling on cycle aggregation) — may be related if THIS WEEK aggregation is unreliable elsewhere

**p1b-001** `consistency` · analysis-tab-pivot
- **Finding:** Total outflows ($8696.78) does not equal sum of visible category totals ($3194.00 + $1132.00 + $1098.00 = $5424.00), creating a $3272.78 unexplained gap.
- **Evidence:** Header shows 'Total outflows $8696.78' but the three displayed categories (Fixed, Debt repayment, Savings) sum to only $5424.00. The 'All time' period is selected, yet the category breakdown appears incomplete or the total is miscalculated.
- **Fix complexity:** medium
- **Overlaps Phase 1A:** Item 1 (math/labeling on cycle aggregation)

**p1b-002** `clarity` · analysis-tab-pivot
- **Finding:** Banner warning 'Debt categories doubling up?' is visually soft (pale orange background) and positioned after the total outflows metric, risking it gets skimmed or dismissed by a sleep-deprived user before scanning category detail.
- **Evidence:** The alert banner is styled in a muted peach/tan color and sits mid-screen; no icon emphasis or top-of-screen placement to signal urgency. A user speed-scanning 'Total outflows' might not register the warning before trusting the aggregate number.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item 2 (debt categories doubling — banner clarity assessment)

**p1b-005** `semantic` · analysis-tab-pivot
- **Finding:** 'Savings' is labeled as a spending category (appearing in 'WHERE YOUR MONEY WENT' section) with a dollar amount, but savings are money retained, not spent—this semantic inversion could mislead John into thinking he overspent or create confusion about net cash position.
- **Evidence:** The 'Savings' tile ($1098.00, 2 txns, 12.6%) is positioned alongside Fixed and Debt repayment under the 'Total outflows' header and in a section titled 'WHERE YOUR MONEY WENT', implying money left the account; if these are transfers to a savings account, the label and section context should clarify they are not outflows.
- **Fix complexity:** medium

**p1b-001** `semantic` · analysis-tab-essentials
- **Finding:** Essential vs Discretionary breakdown missing entirely from visible Analysis tab surface.
- **Evidence:** Screenshot shows 'WHERE YOUR MONEY WENT' section with Fixed ($3194.00), Debt repayment ($1132.00), and Savings ($1098.00) categories, but no Essential vs Discretionary card or breakdown is visible. The audit prompt references 'Essential vs Discretionary card (POST-FIX from Item 3)' but this card does not appear on the current screenshot.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item 3

**p1b-002** `consistency` · analysis-tab-essentials
- **Finding:** Category totals ($3194 + $1132 + $1098 = $5424) do not reconcile with stated 'Total outflows' ($8696.78).
- **Evidence:** Top of 'WHERE YOUR MONEY WENT' shows $8696.78 total; visible category cards sum to only $5424. A $3272.78 gap exists without explanation, suggesting either missing categories off-screen or incomplete data render on this tab view.
- **Fix complexity:** medium

**p1b-001** `clarity` · analysis-survival-forecast
- **Finding:** Primary action ('Remaining at payday' showing -$392.17 deficit) lacks clear next-step guidance; user sees the problem but not how to resolve it from this screen.
- **Evidence:** Large red '-$392.17' figure at bottom of 'BREAKDOWN TO PAYDAY' section has no adjacent call-to-action button or link. The 'If you need to borrow' section appears below as secondary content, forcing scroll to discover it's the intended path.
- **Fix complexity:** small

**p1b-003** `semantic` · analysis-survival-forecast
- **Finding:** 'Min living costs (27d × $40/day from history)' label uses plural 'd' but displays singular interval notation; more critically, it references historical averaging (Item 9 P1A context) rather than a user-configured budget, creating ambiguity about whether this is predictive or descriptive.
- **Evidence:** Label reads 'Min living costs (27d × $40/day from history)' with total '-$1080.00'. The phrase 'from history' signals retrospective calculation, not forward planning; a user seeing this during a deficit moment may not trust it reflects their actual survival minimum.
- **Fix complexity:** small
- **Overlaps Phase 1A:** 9

**p1b-001** `clarity` · plan-mode-root
- **Finding:** Settings button present but this appears to be the root dashboard, not a settings screen—visual affordance suggests navigation elsewhere but Settings link is top-right, creating ambiguity about current screen purpose.
- **Evidence:** 'Settings' link in top-right corner of what should be the main Plan mode dashboard; no breadcrumb or title clarifying this is root view, not a settings panel
- **Fix complexity:** small

**p1b-004** `semantic` · plan-mode-root
- **Finding:** SECURITY: 'Data & Backup' section lists 'API key, usage, costs' as description—API key exposure in settings menu requires verification that this UI does not display the key itself (common P0 leak vector).
- **Evidence:** 'Data & Backup' menu item with subtitle 'Snapshots, round-ups, export' contradicted by mention of 'API key' in audit context; actual screen content unclear
- **Fix complexity:** medium

**p1b-005** `clarity` · plan-mode-root
- **Finding:** 'Reset All Data — Wipe everything — no undo' is a destructive action placed at the foot of settings with only an inline icon warning; no confirmation modal mentioned and button is not greyed/disabled by default.
- **Evidence:** Red 'Reset All Data' text with orange warning icon at bottom of Settings list; no indication of two-step confirmation or cool-down period before irreversible wipe
- **Fix complexity:** small

**p1b-001** `consistency` · payday-plan-canvas
- **Finding:** Free money remainder ($1,770) does not equal incoming money ($8,623) minus essentials ($6,853); math is correct but the label 'Your free money this cycle' conflates remainder with discretionary capacity without accounting for debts or visible uncommitted allocations.
- **Evidence:** $1,770 shown in green REMAINDER tile; $8,623 − $6,853 = $1,770 is arithmetically sound, but the tile omits context that this $1,770 may already be partially allocated to Debts ($0 shown) or other non-essentials not visible on this view.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item 4 (allocation vocabulary)

**p1b-004** `semantic` · payday-plan-canvas
- **Finding:** Section header 'ESSENTIALS THIS CYCLE' marked as FIXED, but ANNUAL PROVISIONS ($298, 5 set-aside items) is semantically a non-immediate obligation, not a live essential; inconsistent classification within the 'essentials' group.
- **Evidence:** ANNUAL PROVISIONS card sits in ESSENTIALS section with FIXED label, but annual provisions are deferred costs, not immediate needs like BILLS, DEBTS, DAILY LIVING; FIXED badge suggests unchangeable, but 5 items are itemised and presumably editable.
- **Fix complexity:** medium

**p1b-001** `consistency` · payday-savings-subscreen
- **Finding:** Over-allocation math appears internally inconsistent: $930 surplus minus $298 provisions minus $100 safety buffer yields $532, not the stated $537 already assigned.
- **Evidence:** Pool to allocate section states '$930 surplus - $298 provisions - $100 safety buffer = $537' but arithmetic yields $532; header claims '$800 allocated' and '$537 already assigned of $537 this cycle' (100% of available pool), yet three goals below show $0 allocated each.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item 1, Item 3

**p1b-002** `consistency` · payday-savings-subscreen
- **Finding:** Goal allocation state contradicts header: 'already assigned of $537' claims full allocation, but all three visible goals (China holiday, Freedom buffer, Darwin Trip) display $0 in right-side amount badges.
- **Evidence:** Header subtitle '$537 already assigned' vs. three goal cards each showing '$0' — if $537 is already assigned, these cards should reflect partial or full amounts, not zero.
- **Fix complexity:** medium
- **Overlaps Phase 1A:** Item 4

**p1b-004** `semantic` · payday-savings-subscreen
- **Finding:** Pool-to-allocate math breakdown labels '$930 surplus' but source of this number is invisible—appears disconnected from visible income or cycle total, risking John's trust in calculation.
- **Evidence:** Footnote states '$930 surplus - $298 provisions - $100 safety buffer = $537' with no prior context showing how $930 was derived from the $800 payday amount or other income sources.
- **Fix complexity:** medium

**p1b-001** `clarity` · payday-upcoming-subscreen
- **Finding:** Two items show 'MARK AS BOUGHT' button while three show '✓ bought – tap to undo', creating inconsistent affordance for the same list action and unclear what triggers the state difference.
- **Evidence:** Fancy Dinner ($150) and Haircut ($80) show green 'MARK AS BOUGHT' button; Viola Flowers ($50), Dads car magazine ($13), and Body Wash ($40) show checkmark with undo text. No visual or semantic distinction between items explains the state difference.
- **Fix complexity:** medium
- **Overlaps Phase 1A:** Item 11 (no discoverable delete)

**p1b-002** `consistency` · payday-upcoming-subscreen
- **Finding:** Header claims '$333 · 3 of 5' but five items are visible on screen (Fancy Dinner, Viola Flowers, Dads car magazine, Body Wash, Haircut), creating math/counting incoherence.
- **Evidence:** Top of screen states '$333 · 3 of 5' but the ITEMS section displays exactly 5 distinct line items below. Total of visible prices ($150 + $50 + $13 + $40 + $80 = $333) matches the dollar figure but contradicts the '3 of 5' denominator.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Items 1, 3 (cycle aggregation math/labeling)

**p1b-005** `clarity` · payday-upcoming-subscreen
- **Finding:** 'MARK AS BOUGHT' button is visually identical in style to interactive state buttons but functionally initiates a purchase acknowledgment — label is a verb but the action's outcome (marking vs. actually buying) is ambiguous for a financial app.
- **Evidence:** Green button with uppercase text 'MARK AS BOUGHT' on Fancy Dinner and Haircut items. In a money-tracking app, 'MARK AS BOUGHT' could be confused with 'purchase this' (commitment) vs. 'acknowledge I already bought it' (record-keeping). No tooltip or microcopy clarifies.
- **Fix complexity:** small

**p1b-001** `clarity` · payday-bills-subscreen
- **Finding:** Two items with identical button labels ('MARK AS BOUGHT') create ambiguity about which items support undo vs which don't—Fancy Dinner and Haircut lack undo affordance while three items explicitly show 'bought – tap to undo', suggesting inconsistent purchase state tracking.
- **Evidence:** Fancy Dinner ($150) and Haircut ($80) have 'MARK AS BOUGHT' buttons; Viola Flowers ($50), Dads car magazine ($13), and Body Wash ($40) show '✓ bought – tap to undo'. No visual or textual explanation for why some items are already 'bought' and others aren't.
- **Fix complexity:** medium
- **Overlaps Phase 1A:** Item 16

**p1b-002** `consistency` · payday-bills-subscreen
- **Finding:** Total shown ($333) does not match sum of visible item prices: $150 + $50 + $13 + $40 + $80 = $333, but header claims '3 of 5' items—two items are missing from the visible list, making the total mathematically unverifiable on this view.
- **Evidence:** Header shows '$333 · 3 of 5 ITEMS' but five items are displayed (Fancy Dinner, Viola Flowers, Dads car magazine, Body Wash, Haircut). Either the header count is wrong or two additional items exist off-screen that should be included in the total.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item 1

**p1b-001** `consistency` · plan-mode-wrx
- **Finding:** Total shown ($333) doesn't visually match sum of visible items ($150 + $50 + $13 + $40 + $80 = $333), but the '3 of 5' indicator suggests 2 items are hidden—yet no scroll indicator or collapse affordance is visible to surface them.
- **Evidence:** Header shows '$333 · 3 of 5 ITEMS' but only 5 items rendered; if truly 3 of 5, math checks out, but the phrasing '3 of 5' contradicts showing all 5 items on screen. Ambiguity on whether hidden items exist.
- **Fix complexity:** small

**p1b-004** `semantic` · plan-mode-wrx
- **Finding:** Footer text 'Things you know you'll need to buy this cycle. The AI will know about these when you ask "can I afford X."' conflates **shopping list** (upcoming purchases) with **affordability constraint data**—unclear whether items marked bought actually feed affordability models or just log intent.
- **Evidence:** Footer claim about AI affordability modeling is aspirational; no indication whether 'bought' state actually removes items from future forecasts or just marks them visually. Semantically confuses planning intent with financial modeling input.
- **Fix complexity:** medium

**p1b-001** `clarity` · known-upcoming
- **Finding:** Two items show 'MARK AS BOUGHT' button while three show 'bought – tap to undo' with checkmark, creating visual inconsistency about purchase state within the same list.
- **Evidence:** Fancy Dinner ($150) and Haircut ($80) display green 'MARK AS BOUGHT' buttons; Viola Flowers ($50), Dads car magazine ($13), and Body Wash ($40) display green checkmark + 'bought – tap to undo' text. Same visual treatment suggests same state, but interaction differs.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item-11 (no-discoverable-delete on upcoming items — related but distinct: this is about inconsistent purchase-state UI)

**p1b-003** `semantic` · known-upcoming
- **Finding:** Item states are semantically ambiguous: 'MARK AS BOUGHT' and 'bought – tap to undo' both appear on items in the same upcoming cycle, conflating forecast/pending state with actual purchase state.
- **Evidence:** Fancy Dinner shows 'MARK AS BOUGHT' (unpurchased); Viola Flowers shows 'bought – tap to undo' (purchased). Both are in 'Known upcoming' list, yet one is unconfirmed and one is confirmed. No clear visual distinction (icon, badge, or border) separates forecast from historical.
- **Fix complexity:** medium

**p1b-001** `consistency` · known-upcoming
- **Finding:** Total shown ($333) does not match sum of visible items ($150 + $50 + $13 + $40 + $80 = $333), but header states '3 of 5' while 5 items are displayed, creating ambiguity about whether total represents only 3 items or all 5.
- **Evidence:** Header shows '$333 · 3 of 5' but all 5 items (Fancy Dinner, Viola Flowers, Dads car magazine, Body Wash, Haircut) are visible and sum to $333. The '3 of 5' contradicts the visible count.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item-1

**p1b-002** `clarity` · known-upcoming
- **Finding:** Two items show 'MARK AS BOUGHT' button (Fancy Dinner, Haircut) while three others show 'bought – tap to undo' state, with no visual distinction in styling between the two button states, risking accidental clicks.
- **Evidence:** Fancy Dinner and Haircut have green 'MARK AS BOUGHT' buttons; Viola Flowers, Dads car magazine, and Body Wash have checkmark + 'bought – tap to undo' text in similar green containers. John (on 4hrs sleep) could confuse the affordance.
- **Fix complexity:** small

**p1b-004** `clarity` · known-upcoming
- **Finding:** 'No date' appears on all five items with no indication of whether date is missing, unknown, or not yet set—ambiguous semantic signal for a financially-motivated user trying to plan.
- **Evidence:** Every item shows 'No date' below title in gray text; unclear if this means John hasn't set a date, the date field is optional, or if there's a data gap.
- **Fix complexity:** small

**p1b-001** `clarity` · known-upcoming
- **Finding:** Two items show 'MARK AS BOUGHT' button while three show '✓ bought – tap to undo', creating inconsistent state representation for the same item type (upcoming purchases).
- **Evidence:** Fancy Dinner ($150) and Haircut ($80) display 'MARK AS BOUGHT' (green button); Viola Flowers ($50), Dads car magazine ($13), and Body Wash ($40) display '✓ bought – tap to undo'. All five items are listed under 'Known upcoming' with 'No date'.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item-11 (no-discoverable-delete on upcoming items)

**p1b-002** `semantic` · known-upcoming
- **Finding:** Items marked '✓ bought – tap to undo' appear within a 'Known upcoming' section, which semantically contradicts their purchased state and may confuse John about whether these are future or past transactions.
- **Evidence:** Viola Flowers, Dads car magazine, and Body Wash all show checkmarks and 'bought' language while nested under 'Known upcoming' header with '$333 · 3 of 5' total.
- **Fix complexity:** medium

### P2 (37)

**p1b-003** `density` · dashboard-hero
- **Finding:** Daily cap explanation text is buried and lacks urgency given the over-pace state; 'Surplus above cap goes to debt repayment pool' reads as passive notification rather than impact statement.
- **Evidence:** '$30.00/day cap active. Surplus above cap goes to debt repayment pool.' banner—no link to rules, no estimate of how much is being redirected today, no sense of whether this is good or bad for John's goals.
- **Fix complexity:** medium

**p1b-005** `clarity` · dashboard-hero
- **Finding:** Property Deposit (via Mum) in IMMEDIATE DEBTS section is ambiguous on direction of obligation—is John owed this, or does he owe it?
- **Evidence:** 'Property Deposit (via Mum)' shown as $5,681 under 'IMMEDIATE DEBTS' but header does not clarify if this is a liability or an asset John has loaned out; 'via Mum' suggests family loan but not John's debt status.
- **Fix complexity:** small

**p1b-007** `dead` · dashboard-hero
- **Finding:** Tracked items link ('tap for canvas') under plan banner appears interactive but unclear what John will see or whether it's a shortcut or a debug artifact.
- **Evidence:** '11 tracked · tap for canvas' text under plan banner—'canvas' is non-standard jargon; user may not know if this opens a detailed view, a chart, or something else.
- **Fix complexity:** small

**p1b-002** `density` · dashboard-scrolled-cards
- **Finding:** Running pace warning ('Running $28.94 over pace this week ⚠️') uses yellow warning indicator but appears in a teal-themed card, creating weak visual urgency for a time-sensitive budget drift signal.
- **Evidence:** Yellow triangle ⚠️ icon on orange text stating pace overage sits within MAX PER DAY teal card; warning doesn't stand out relative to the 'You're on track' messaging directly above it.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item 10

**p1b-004** `clarity` · dashboard-scrolled-cards
- **Finding:** Property Deposit card shows two conflicting temporal markers: '$30 left today' (pacing context) and '27d to payday' (obligation context), creating ambiguity about whether this debt is payable today or in 27 days.
- **Evidence:** IMMEDIATE DEBTS Property Deposit card footer displays both '$30 left today' (right-aligned, pacing) and '27d to payday' (right-aligned, obligation date), suggesting dual urgency without clarifying priority.
- **Fix complexity:** small

**p1b-005** `semantic` · dashboard-scrolled-cards
- **Finding:** '$30/day cap active. Surplus above cap goes to debt repayment pool.' is policy/mechanic explanation, not a next action, and risks being skipped by John (4-hour-sleep consultant scanning quickly).
- **Evidence:** Green informational card stating cap mechanic and allocation rule appears between MAX PER DAY and running pace; uses passive voice and no verb ('Cap is active' not 'Your cap is active; surplus will auto-allocate').
- **Fix complexity:** small

**p1b-002** `density` · bills-tab-top
- **Finding:** BNPL entries (Stanmore Station Pharmacy, Uber Eats) both flagged 'FORTNIGHTLY' but appear in 'THIS WEEK' section, creating temporal confusion about recurrence vs. timing.
- **Evidence:** Two items (21 Apr entries) labeled 'FORTNIGHTLY' in green badges sit under 'THIS WEEK' heading dated 21–26 Apr. Fortnightly means every 2 weeks; unclear if this labels recurrence pattern or current billing cycle phase.
- **Fix complexity:** medium
- **Overlaps Phase 1A:** null

**p1b-004** `clarity` · bills-tab-top
- **Finding:** Bottom status line '$30 left today' is temporally ambiguous — unclear if it means 'budgeted remaining today' or 'due today' or 'unallocated for today'.
- **Evidence:** Footer shows 'NW: +$9,398.91 | $30 left today | 27d to payday'. 'Left' could mean available budget, remaining daily allowance, or unassigned funds, but label does not clarify context.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item 10 (MAX PER DAY + pace tile visual adjacency) — related to daily spending clarity

**p1b-005** `dead` · bills-tab-top
- **Finding:** Calendar navigation arrows (< >) visible but clicking them on April 2026 with bills already shown would leave 'THIS WEEK' section orphaned/stale if user navigates to a different month.
- **Evidence:** Month selector at top shows 'April 2026' with left/right arrows. 'THIS WEEK' section below is context-dependent but would not update label/content automatically if user clicks arrow to May 2026; suggests navigation may break week-view context.
- **Fix complexity:** medium
- **Overlaps Phase 1A:** null

**p1b-003** `density` · analysis-tab-pivot
- **Finding:** Period selector (Today/7 Days/30 Days/All time) shows '7 Days' active, but the three category cards below show 4 txns in Debt repayment and 2 txns in Fixed—unclear if these match the selected 7-day window or if they're stale from a prior selection.
- **Evidence:** '7 Days' button is highlighted in green, yet the card footer shows '$101.71/day' (Debt repayment) and '$456.29/day' (Fixed), which suggests per-day averages; without a clear date range label on each card, John cannot quickly verify the selected period is being honored.
- **Fix complexity:** small

**p1b-004** `clarity` · analysis-tab-pivot
- **Finding:** Category cards (Fixed, Debt repayment, Savings) have downward chevrons at the right edge but no visual cue (e.g., 'tap to expand', consistent icon style, or card border) indicating they are interactive, risking John treats them as inert display-only tiles.
- **Evidence:** Each category card displays a small gray downward chevron icon (▼) on the far right, but the chevron is low-contrast and the card itself has no affordance styling (no hover state visible, no button-like border, no 'See details' label).
- **Fix complexity:** small

**p1b-003** `clarity` · analysis-tab-essentials
- **Finding:** Debt categories alert ('Debt categories doubling up?') uses cautionary tone but offers no direct action button—only advice to 'edit older transactions.'
- **Evidence:** Yellow alert card with warning icon recommends editing transactions to consolidate Debt repayment ($1,132) + Loan ($788) under one category, but no 'Edit' or 'Merge' button is provided. John must navigate elsewhere to fix it.
- **Fix complexity:** small

**p1b-004** `density` · analysis-tab-essentials
- **Finding:** Per-day rates ($456.29/day Fixed, $101.71/day Debt repayment, $156.86/day Savings) add secondary cognitive load without clear decision context.
- **Evidence:** Each spending category card includes a daily pace figure (e.g., '$456.29/day' under Fixed). For a sleep-deprived consultant, this multiplies the metrics to parse without clarifying whether current pace is sustainable or alarming.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item 10 (MAX PER DAY + pace tile visual adjacency)

**p1b-005** `dead` · analysis-tab-essentials
- **Finding:** Small dropdown arrow on Debt repayment and Savings cards suggests collapsible detail, but interaction affordance is not obvious.
- **Evidence:** Downward-pointing chevrons appear on Debt repayment ($1132.00) and Savings ($1098.00) card rows, but no visual feedback (hover state, animation hint) signals they are tappable. Fixed card lacks this chevron, creating inconsistent affordance pattern.
- **Fix complexity:** small

**p1b-002** `density` · analysis-survival-forecast
- **Finding:** Bill list (Claude Max, BNPL items, Adobe, Spotify) presented as part of 'Unpaid bills (5)' without prioritization or urgency signal, despite some being 4–7 days away; user under sleep deprivation may miss which ones demand immediate attention.
- **Evidence:** 'Unpaid bills (5)' section lists 5 bills with due dates but no visual hierarchy (e.g., color coding, bold, icons) to highlight the Claude Max bill due in ~48 hours vs. Spotify due 26th. All rendered at same font weight and gray text.
- **Fix complexity:** medium

**p1b-004** `clarity` · analysis-survival-forecast
- **Finding:** Cycle plan warning (top, green box) states bills 'may already be reflected in your spent figure' but does not tell user whether the -$1080 min living cost or the -$425.78 unpaid bill total already includes those cycle-tracked items.
- **Evidence:** 'Cycle plan locked - 4 bills totalling $4540 already tracked — these are pre-committed and may already be reflected in your spent figure above.' This warning is ambiguous about scope: does it mean the $4540 affects the current balance, the unpaid bills list, or neither? No explicit link to how the $1080 and $425.78 figures are computed.
- **Fix complexity:** small
- **Overlaps Phase 1A:** 7

**p1b-005** `dead` · analysis-survival-forecast
- **Finding:** 'BREAKDOWN TO PAYDAY' section title appears static/informational but no visible toggle, collapse control, or interaction affordance; unclear if this is expandable or a fixed report section.
- **Evidence:** Heading 'BREAKDOWN TO PAYDAY' at top of balance/bills/costs breakdown has no chevron, +/− icon, or visual indicator of interactivity. Unclear whether John can minimize it or if it's always shown.
- **Fix complexity:** small

**p1b-002** `density` · plan-mode-root
- **Finding:** The footer quick-action bar (Dashboard, Bills, +, Chat, Analysis) is visible but unclear whether the current view IS the Dashboard or a sub-section within it; no visual indicator of active state in nav.
- **Evidence:** Bottom navigation shows 'Dashboard' as first option but no highlight/underline indicates it is selected; John scanning quickly could assume he's elsewhere
- **Fix complexity:** small

**p1b-003** `dead` · plan-mode-root
- **Finding:** Screenshot shows Settings menu items (Financial Data, Strategies, Notifications, etc.) but description states this should be 'Plan mode root view' with allocation tile, WRX card, and trip/goal cards—no such cards visible, suggesting either wrong screenshot or render failure.
- **Evidence:** Content shown is entirely Settings menu structure; no renderAllocateTile, WRX card, trip cards, or goal cards present despite audit description stating they should appear
- **Fix complexity:** medium
- **Overlaps Phase 1A:** Item 4 (renderAllocateTile expected), Item 13 (WRX card expected), Item 12 (trip/goal cards expected)

**p1b-002** `clarity` · payday-plan-canvas
- **Finding:** No visible call-to-action verb on the REMAINDER tile itself; user must infer they should tap it to allocate the $1,770, but the tile reads as display-only status.
- **Evidence:** Green REMAINDER tile ($1,770) has no button label, edit icon, or verb (e.g., 'Allocate', 'Review', 'Next'); appears passive compared to RE-PLAN button on Plan locked banner above.
- **Fix complexity:** small

**p1b-003** `density` · payday-plan-canvas
- **Finding:** Greyed-out text 'This is what you have to allocate toward savings goals + upcoming' below the REMAINDER figure adds explanatory noise that may distract from the primary action (allocating).
- **Evidence:** Light grey italicised helper text at bottom of green REMAINDER tile; for a sleep-deprived mobile-first user, this secondary prose competes with the dollar amount as visual anchor.
- **Fix complexity:** small

**p1b-005** `clarity` · payday-plan-canvas
- **Finding:** CLEAR button on DEBTS card is unexplained; user may misinterpret it as 'delete all debts' rather than 'clear filters' or 'mark as reviewed'.
- **Evidence:** DEBTS card ($0, None active) displays a green CLEAR button with no tooltip, context label, or affordance hint; for a user managing cash flow stress, a destructive action here would be high-risk.
- **Fix complexity:** small

**p1b-006** `dead` · payday-plan-canvas
- **Finding:** DAILY LIVING progress bar ($930, $30/day · 31 days) visually suggests a depletion or commitment tracker, but no interaction point or edit button is visible; unclear if user can adjust the daily rate or re-allocate mid-cycle.
- **Evidence:** DAILY LIVING card shows filled blue bar and fine-print math ($30/day · 31 days) but no edit icon, tap target label, or overflow menu; card reads as status-only.
- **Fix complexity:** small

**p1b-003** `clarity` · payday-savings-subscreen
- **Finding:** 'MARK AS ALLOCATED' button on every goal card is visually and functionally ambiguous: unclear whether it marks that specific goal or commits the entire $537 pool.
- **Evidence:** Three separate goal cards each have identical 'MARK AS ALLOCATED' button; no hover state or confirmation shown; John (time-constrained, low-sleep user) could accidentally allocate entire surplus to wrong goal.
- **Fix complexity:** medium
- **Overlaps Phase 1A:** Item 12

**p1b-005** `density` · payday-savings-subscreen
- **Finding:** Lifetime goal context ($5,000 target for China holiday, $10,000 for Freedom buffer, $800 for Darwin Trip) presented inline competes with immediate this-cycle allocation decision, risking John misreading progress vs. action.
- **Evidence:** Each goal card shows both lifetime target + percentage (4%, 0%, 89%) AND 'this cycle only' $0 allocation; for a fast-scanning user, the large 89% for Darwin Trip is visually dominant but irrelevant to the current $537 split decision.
- **Fix complexity:** small

**p1b-003** `clarity` · payday-upcoming-subscreen
- **Finding:** All items show 'No date' but list is labeled 'Known upcoming' — semantically conflicting: 'upcoming' typically implies a date is known, yet none are displayed.
- **Evidence:** Screen header 'Known upcoming', but every item displays 'No date' underneath the title. The label 'known' suggests the user or system has committed a date, but no dates appear.
- **Fix complexity:** small

**p1b-004** `density` · payday-upcoming-subscreen
- **Finding:** Footer text ('Things you know you'll need to buy this cycle...') is marketing/explanatory copy that competes for attention with actionable content and may confuse a sleep-deprived user about what they should do next on this screen.
- **Evidence:** Gray explanatory text at bottom of screen takes visual real estate and reads as help text, not next action. John (4hrs sleep, mobile-first) may misinterpret it as an error message or mandatory field label rather than optional context.
- **Fix complexity:** small

**p1b-003** `clarity` · payday-bills-subscreen
- **Finding:** Purchase state indicators are inconsistent: three items show explicit undo affordance ('✓ bought – tap to undo'), but two show a button to mark as bought, with no explanation of why some items are already marked purchased mid-cycle.
- **Evidence:** Viola Flowers, Dads car magazine, and Body Wash display '✓ bought – tap to undo' in green; Fancy Dinner and Haircut show 'MARK AS BOUGHT' button. No timestamp, 'auto-purchased' badge, or contextual label explains the state difference.
- **Fix complexity:** medium
- **Overlaps Phase 1A:** Item 7, Item 8, Item 16

**p1b-004** `density` · payday-bills-subscreen
- **Finding:** Footer text ('Things you know you'll need to buy this cycle...') is non-actionable and consumes visual real estate without clarifying whether items are auto-debit, manual, or predictive—adds cognitive load for a tired user scanning quickly.
- **Evidence:** Bottom of screen includes explanatory text about cycle context, but no items are labeled 'auto-debit', 'predicted', or 'manual', leaving John uncertain whether these are commitments or guesses.
- **Fix complexity:** small

**p1b-002** `clarity` · plan-mode-wrx
- **Finding:** Two items (Fancy Dinner, Haircut) show 'MARK AS BOUGHT' button, while three items (Viola Flowers, Dads car magazine, Body Wash) show '✓ bought – tap to undo'. No clear labeling of state transition or why some are pre-marked bought and others not.
- **Evidence:** Fancy Dinner ($150) and Haircut ($80) have green 'MARK AS BOUGHT' CTAs; others show checkmark + undo affordance. No legend or explanation of the toggle state or default behavior.
- **Fix complexity:** small

**p1b-003** `clarity` · plan-mode-wrx
- **Finding:** 'No date' label on all 5 items suggests scheduling/planning intent for this card, but no obvious way to add dates from this surface—no inline date picker or 'Add date' affordance visible on individual items.
- **Evidence:** Each item shows 'No date' as secondary text, but no date field, calendar icon, or 'Set date' button appears on any item card. User must guess whether dates are editable inline or require external flow.
- **Fix complexity:** medium

**p1b-002** `density` · known-upcoming
- **Finding:** Cycle total ($333, 3 of 5) is visually separated from item list by heading 'ITEMS', but no explanation of what the 5 items are or why only 3 shown contribute to total.
- **Evidence:** Header reads '$333 · 3 of 5' but the list shows 5 items ($150 + $50 + $13 + $40 + $80 = $333). Label '3 of 5' suggests 3 purchased and 2 unpurchased, but visual states contradict this: Fancy Dinner and Haircut are unmarked, yet count toward the $333 total.
- **Fix complexity:** medium
- **Overlaps Phase 1A:** Item-1 or Item-3 (cycle aggregation math/labeling)

**p1b-004** `clarity` · known-upcoming
- **Finding:** 'No date' label on all items is non-actionable noise; John cannot determine scheduling, recurrence, or urgency from this screen.
- **Evidence:** Every item displays 'No date' beneath the title. For a WMS consultant on 4hrs sleep relying on mobile-first UX, absence of date context on 'upcoming' items removes temporal grounding — he cannot scan to prioritize or confirm cycle membership.
- **Fix complexity:** small

**p1b-005** `dead` · known-upcoming
- **Finding:** '+ Add item' button at bottom appears inert; no affordance (hover, active state, or context) signals it is actionable or what 'add' means in context of a known-upcoming cycle.
- **Evidence:** Button text reads '+ Add item' with no verb beyond the '+' symbol. Unclear if this appends to current cycle, creates new forecast item, or triggers a different workflow. No visual feedback state visible.
- **Fix complexity:** small

**p1b-003** `density` · known-upcoming
- **Finding:** Three items marked 'bought' still occupy full card real estate and visual weight as unpurchased items, cluttering the 'upcoming' list and making it harder to scan what still needs action.
- **Evidence:** Body Wash ($40), Viola Flowers ($50), and Dads car magazine ($13) all show 'bought' state but take up same space as actionable 'Fancy Dinner' and 'Haircut' cards.
- **Fix complexity:** medium

**p1b-003** `consistency` · known-upcoming
- **Finding:** The header shows '$333 · 3 of 5', but the count logic is unclear: if 'bought' items are included in the 5-item total, the dollar sum should exclude them; if they're separate, the denominator should reflect only unpurchased items.
- **Evidence:** $333 total is displayed at top; Fancy Dinner ($150) + Haircut ($80) = $230 (unbought); Viola Flowers ($50) + Dads car magazine ($13) + Body Wash ($40) = $103 (bought). $230 ≠ $333, and the '3 of 5' ratio is ambiguous.
- **Fix complexity:** medium
- **Overlaps Phase 1A:** Item-1 or Item-3 (cycle aggregation math/labeling)

**p1b-004** `clarity` · known-upcoming
- **Finding:** 'No date' label on all five items may mask that John has no visibility into *when* these purchases will occur, conflating 'upcoming' (indefinite future) with 'imminent' (actionable soon).
- **Evidence:** All items display 'No date' below their names; the 'Known upcoming' title suggests actionable near-term planning, but zero temporal data is provided.
- **Fix complexity:** small

### P3 (0)

_None._

## Per-surface results

### Dashboard — hero (balance + alerts)
- ID: `dashboard-hero`
- Screenshot: `docs/audit/_screenshots/dashboard-hero.png`
- Findings: 7
  - P1 clarity: UNLOCK button on plan-locked banner has no verb clarity—does it unlock the plan, show details, or navigate elsewhere?
  - P1 clarity: Running pace warning ($28.94 over) lacks visual hierarchy vs. MAX PER DAY card below it; user may miss the actionable alert in favor of the larger green callout.
  - P2 density: Daily cap explanation text is buried and lacks urgency given the over-pace state; 'Surplus above cap goes to debt repayment pool' reads as passive notification rather than impact statement.
  - P1 semantic: Liquid net worth label lacks definition; '$+9,398.91' is shown but unclear if this is investable surplus, buffer, or includes illiquid assets.
  - P2 clarity: Property Deposit (via Mum) in IMMEDIATE DEBTS section is ambiguous on direction of obligation—is John owed this, or does he owe it?
  - P1 consistency: Cycle date ('18 May') is locked but 'Liquid net worth' and MAX PER DAY math may assume different cycle boundaries; no explicit statement of when cycle resets relative to payday (27 days shown).
  - P2 dead: Tracked items link ('tap for canvas') under plan banner appears interactive but unclear what John will see or whether it's a shortcut or a debug artifact.

### Dashboard — MAX PER DAY + running pace tiles
- ID: `dashboard-scrolled-cards`
- Screenshot: `docs/audit/_screenshots/dashboard-scrolled-cards.png`
- Findings: 5
  - P1 clarity: MAX PER DAY card shows $30.00 limit but lacks explicit statement of remaining budget for today, forcing cognitive load to calculate 'is $30 my limit or my remaining balance?'
  - P2 density: Running pace warning ('Running $28.94 over pace this week ⚠️') uses yellow warning indicator but appears in a teal-themed card, creating weak visual urgency for a time-sensitive budget drift signal.
  - P1 consistency: IMMEDIATE DEBTS section shows Property Deposit as '$5,681' with notation '➜P900/mo' and '27d to payday', but the '➜P900/mo' assumes rent context that should be labeled explicitly (e.g., 'Rent: $900/mo').
  - P2 clarity: Property Deposit card shows two conflicting temporal markers: '$30 left today' (pacing context) and '27d to payday' (obligation context), creating ambiguity about whether this debt is payable today or in 27 days.
  - P2 semantic: '$30/day cap active. Surplus above cap goes to debt repayment pool.' is policy/mechanic explanation, not a next action, and risks being skipped by John (4-hour-sleep consultant scanning quickly).

### Bills tab — monthly view top
- ID: `bills-tab-top`
- Screenshot: `docs/audit/_screenshots/bills-tab-top.png`
- Findings: 5
  - P1 clarity: Paid bills shown in calendar view with no visual distinction from unpaid, making it unclear which bills in the month have already cleared.
  - P2 density: BNPL entries (Stanmore Station Pharmacy, Uber Eats) both flagged 'FORTNIGHTLY' but appear in 'THIS WEEK' section, creating temporal confusion about recurrence vs. timing.
  - P1 consistency: '$86' week total does not visibly sum the four listed bills ($37 + $9 + $24 + $16 = $86), but no explicit line-item breakdown shown to verify the math.
  - P2 clarity: Bottom status line '$30 left today' is temporally ambiguous — unclear if it means 'budgeted remaining today' or 'due today' or 'unallocated for today'.
  - P2 dead: Calendar navigation arrows (< >) visible but clicking them on April 2026 with bills already shown would leave 'THIS WEEK' section orphaned/stale if user navigates to a different month.

### Analysis tab — spending pivot (top)
- ID: `analysis-tab-pivot`
- Screenshot: `docs/audit/_screenshots/analysis-tab-pivot.png`
- Findings: 5
  - P1 consistency: Total outflows ($8696.78) does not equal sum of visible category totals ($3194.00 + $1132.00 + $1098.00 = $5424.00), creating a $3272.78 unexplained gap.
  - P1 clarity: Banner warning 'Debt categories doubling up?' is visually soft (pale orange background) and positioned after the total outflows metric, risking it gets skimmed or dismissed by a sleep-deprived user before scanning category detail.
  - P2 density: Period selector (Today/7 Days/30 Days/All time) shows '7 Days' active, but the three category cards below show 4 txns in Debt repayment and 2 txns in Fixed—unclear if these match the selected 7-day window or if they're stale from a prior selection.
  - P2 clarity: Category cards (Fixed, Debt repayment, Savings) have downward chevrons at the right edge but no visual cue (e.g., 'tap to expand', consistent icon style, or card border) indicating they are interactive, risking John treats them as inert display-only tiles.
  - P1 semantic: 'Savings' is labeled as a spending category (appearing in 'WHERE YOUR MONEY WENT' section) with a dollar amount, but savings are money retained, not spent—this semantic inversion could mislead John into thinking he overspent or create confusion about net cash position.

### Analysis tab — Essential vs Discretionary card (POST-FIX from Item 3)
- ID: `analysis-tab-essentials`
- Screenshot: `docs/audit/_screenshots/analysis-tab-essentials.png`
- Findings: 5
  - P1 semantic: Essential vs Discretionary breakdown missing entirely from visible Analysis tab surface.
  - P1 consistency: Category totals ($3194 + $1132 + $1098 = $5424) do not reconcile with stated 'Total outflows' ($8696.78).
  - P2 clarity: Debt categories alert ('Debt categories doubling up?') uses cautionary tone but offers no direct action button—only advice to 'edit older transactions.'
  - P2 density: Per-day rates ($456.29/day Fixed, $101.71/day Debt repayment, $156.86/day Savings) add secondary cognitive load without clear decision context.
  - P2 dead: Small dropdown arrow on Debt repayment and Savings cards suggests collapsible detail, but interaction affordance is not obvious.

### Analysis tab — Survival Forecast
- ID: `analysis-survival-forecast`
- Screenshot: `docs/audit/_screenshots/analysis-survival-forecast.png`
- Findings: 5
  - P1 clarity: Primary action ('Remaining at payday' showing -$392.17 deficit) lacks clear next-step guidance; user sees the problem but not how to resolve it from this screen.
  - P2 density: Bill list (Claude Max, BNPL items, Adobe, Spotify) presented as part of 'Unpaid bills (5)' without prioritization or urgency signal, despite some being 4–7 days away; user under sleep deprivation may miss which ones demand immediate attention.
  - P1 semantic: 'Min living costs (27d × $40/day from history)' label uses plural 'd' but displays singular interval notation; more critically, it references historical averaging (Item 9 P1A context) rather than a user-configured budget, creating ambiguity about whether this is predictive or descriptive.
  - P2 clarity: Cycle plan warning (top, green box) states bills 'may already be reflected in your spent figure' but does not tell user whether the -$1080 min living cost or the -$425.78 unpaid bill total already includes those cycle-tracked items.
  - P2 dead: 'BREAKDOWN TO PAYDAY' section title appears static/informational but no visible toggle, collapse control, or interaction affordance; unclear if this is expandable or a fixed report section.

### Plan mode — root dashboard (POST-FIX from Item 4)
- ID: `plan-mode-root`
- Screenshot: `docs/audit/_screenshots/plan-mode-root.png`
- Findings: 5
  - P1 clarity: Settings button present but this appears to be the root dashboard, not a settings screen—visual affordance suggests navigation elsewhere but Settings link is top-right, creating ambiguity about current screen purpose.
  - P2 density: The footer quick-action bar (Dashboard, Bills, +, Chat, Analysis) is visible but unclear whether the current view IS the Dashboard or a sub-section within it; no visual indicator of active state in nav.
  - P2 dead: Screenshot shows Settings menu items (Financial Data, Strategies, Notifications, etc.) but description states this should be 'Plan mode root view' with allocation tile, WRX card, and trip/goal cards—no such cards visible, suggesting either wrong screenshot or render failure.
  - P1 semantic: SECURITY: 'Data & Backup' section lists 'API key, usage, costs' as description—API key exposure in settings menu requires verification that this UI does not display the key itself (common P0 leak vector).
  - P1 clarity: 'Reset All Data — Wipe everything — no undo' is a destructive action placed at the foot of settings with only an inline icon warning; no confirmation modal mentioned and button is not greyed/disabled by default.

### Payday Plan canvas — REMAINDER tile
- ID: `payday-plan-canvas`
- Screenshot: `docs/audit/_screenshots/payday-plan-canvas.png`
- Findings: 6
  - P1 consistency: Free money remainder ($1,770) does not equal incoming money ($8,623) minus essentials ($6,853); math is correct but the label 'Your free money this cycle' conflates remainder with discretionary capacity without accounting for debts or visible uncommitted allocations.
  - P2 clarity: No visible call-to-action verb on the REMAINDER tile itself; user must infer they should tap it to allocate the $1,770, but the tile reads as display-only status.
  - P2 density: Greyed-out text 'This is what you have to allocate toward savings goals + upcoming' below the REMAINDER figure adds explanatory noise that may distract from the primary action (allocating).
  - P1 semantic: Section header 'ESSENTIALS THIS CYCLE' marked as FIXED, but ANNUAL PROVISIONS ($298, 5 set-aside items) is semantically a non-immediate obligation, not a live essential; inconsistent classification within the 'essentials' group.
  - P2 clarity: CLEAR button on DEBTS card is unexplained; user may misinterpret it as 'delete all debts' rather than 'clear filters' or 'mark as reviewed'.
  - P2 dead: DAILY LIVING progress bar ($930, $30/day · 31 days) visually suggests a depletion or commitment tracker, but no interaction point or edit button is visible; unclear if user can adjust the daily rate or re-allocate mid-cycle.

### Payday — Savings sub-screen (POST-FIX from Item 4)
- ID: `payday-savings-subscreen`
- Screenshot: `docs/audit/_screenshots/payday-savings-subscreen.png`
- Findings: 5
  - P1 consistency: Over-allocation math appears internally inconsistent: $930 surplus minus $298 provisions minus $100 safety buffer yields $532, not the stated $537 already assigned.
  - P1 consistency: Goal allocation state contradicts header: 'already assigned of $537' claims full allocation, but all three visible goals (China holiday, Freedom buffer, Darwin Trip) display $0 in right-side amount badges.
  - P2 clarity: 'MARK AS ALLOCATED' button on every goal card is visually and functionally ambiguous: unclear whether it marks that specific goal or commits the entire $537 pool.
  - P1 semantic: Pool-to-allocate math breakdown labels '$930 surplus' but source of this number is invisible—appears disconnected from visible income or cycle total, risking John's trust in calculation.
  - P2 density: Lifetime goal context ($5,000 target for China holiday, $10,000 for Freedom buffer, $800 for Darwin Trip) presented inline competes with immediate this-cycle allocation decision, risking John misreading progress vs. action.

### Payday — Upcoming items sub-screen
- ID: `payday-upcoming-subscreen`
- Screenshot: `docs/audit/_screenshots/payday-upcoming-subscreen.png`
- Findings: 5
  - P1 clarity: Two items show 'MARK AS BOUGHT' button while three show '✓ bought – tap to undo', creating inconsistent affordance for the same list action and unclear what triggers the state difference.
  - P1 consistency: Header claims '$333 · 3 of 5' but five items are visible on screen (Fancy Dinner, Viola Flowers, Dads car magazine, Body Wash, Haircut), creating math/counting incoherence.
  - P2 clarity: All items show 'No date' but list is labeled 'Known upcoming' — semantically conflicting: 'upcoming' typically implies a date is known, yet none are displayed.
  - P2 density: Footer text ('Things you know you'll need to buy this cycle...') is marketing/explanatory copy that competes for attention with actionable content and may confuse a sleep-deprived user about what they should do next on this screen.
  - P1 clarity: 'MARK AS BOUGHT' button is visually identical in style to interactive state buttons but functionally initiates a purchase acknowledgment — label is a verb but the action's outcome (marking vs. actually buying) is ambiguous for a financial app.

### Payday — Bills sub-screen
- ID: `payday-bills-subscreen`
- Screenshot: `docs/audit/_screenshots/payday-bills-subscreen.png`
- Findings: 4
  - P1 clarity: Two items with identical button labels ('MARK AS BOUGHT') create ambiguity about which items support undo vs which don't—Fancy Dinner and Haircut lack undo affordance while three items explicitly show 'bought – tap to undo', suggesting inconsistent purchase state tracking.
  - P1 consistency: Total shown ($333) does not match sum of visible item prices: $150 + $50 + $13 + $40 + $80 = $333, but header claims '3 of 5' items—two items are missing from the visible list, making the total mathematically unverifiable on this view.
  - P2 clarity: Purchase state indicators are inconsistent: three items show explicit undo affordance ('✓ bought – tap to undo'), but two show a button to mark as bought, with no explanation of why some items are already marked purchased mid-cycle.
  - P2 density: Footer text ('Things you know you'll need to buy this cycle...') is non-actionable and consumes visual real estate without clarifying whether items are auto-debit, manual, or predictive—adds cognitive load for a tired user scanning quickly.

### Plan mode — WRX card
- ID: `plan-mode-wrx`
- Screenshot: `docs/audit/_screenshots/plan-mode-wrx.png`
- Findings: 4
  - P1 consistency: Total shown ($333) doesn't visually match sum of visible items ($150 + $50 + $13 + $40 + $80 = $333), but the '3 of 5' indicator suggests 2 items are hidden—yet no scroll indicator or collapse affordance is visible to surface them.
  - P2 clarity: Two items (Fancy Dinner, Haircut) show 'MARK AS BOUGHT' button, while three items (Viola Flowers, Dads car magazine, Body Wash) show '✓ bought – tap to undo'. No clear labeling of state transition or why some are pre-marked bought and others not.
  - P2 clarity: 'No date' label on all 5 items suggests scheduling/planning intent for this card, but no obvious way to add dates from this surface—no inline date picker or 'Add date' affordance visible on individual items.
  - P1 semantic: Footer text 'Things you know you'll need to buy this cycle. The AI will know about these when you ask "can I afford X."' conflates **shopping list** (upcoming purchases) with **affordability constraint data**—unclear whether items marked bought actually feed affordability models or just log intent.

### Settings — overview
- ID: `settings-overview`
- Screenshot: `docs/audit/_screenshots/settings-overview.png`
- Findings: 5
  - P1 clarity: Two items show 'MARK AS BOUGHT' button while three show 'bought – tap to undo' with checkmark, creating visual inconsistency about purchase state within the same list.
  - P2 density: Cycle total ($333, 3 of 5) is visually separated from item list by heading 'ITEMS', but no explanation of what the 5 items are or why only 3 shown contribute to total.
  - P1 semantic: Item states are semantically ambiguous: 'MARK AS BOUGHT' and 'bought – tap to undo' both appear on items in the same upcoming cycle, conflating forecast/pending state with actual purchase state.
  - P2 clarity: 'No date' label on all items is non-actionable noise; John cannot determine scheduling, recurrence, or urgency from this screen.
  - P2 dead: '+ Add item' button at bottom appears inert; no affordance (hover, active state, or context) signals it is actionable or what 'add' means in context of a known-upcoming cycle.

### Settings — Diagnostics section
- ID: `settings-diagnostics`
- Screenshot: `docs/audit/_screenshots/settings-diagnostics.png`
- Findings: 4
  - P1 consistency: Total shown ($333) does not match sum of visible items ($150 + $50 + $13 + $40 + $80 = $333), but header states '3 of 5' while 5 items are displayed, creating ambiguity about whether total represents only 3 items or all 5.
  - P1 clarity: Two items show 'MARK AS BOUGHT' button (Fancy Dinner, Haircut) while three others show 'bought – tap to undo' state, with no visual distinction in styling between the two button states, risking accidental clicks.
  - P2 density: Three items marked 'bought' still occupy full card real estate and visual weight as unpurchased items, cluttering the 'upcoming' list and making it harder to scan what still needs action.
  - P1 clarity: 'No date' appears on all five items with no indication of whether date is missing, unknown, or not yet set—ambiguous semantic signal for a financially-motivated user trying to plan.

### Settings — Data & Backup section
- ID: `settings-data-backup`
- Screenshot: `docs/audit/_screenshots/settings-data-backup.png`
- Findings: 4
  - P1 clarity: Two items show 'MARK AS BOUGHT' button while three show '✓ bought – tap to undo', creating inconsistent state representation for the same item type (upcoming purchases).
  - P1 semantic: Items marked '✓ bought – tap to undo' appear within a 'Known upcoming' section, which semantically contradicts their purchased state and may confuse John about whether these are future or past transactions.
  - P2 consistency: The header shows '$333 · 3 of 5', but the count logic is unclear: if 'bought' items are included in the 5-item total, the dollar sum should exclude them; if they're separate, the denominator should reflect only unpurchased items.
  - P2 clarity: 'No date' label on all five items may mask that John has no visibility into *when* these purchases will occur, conflating 'upcoming' (indefinite future) with 'imminent' (actionable soon).
