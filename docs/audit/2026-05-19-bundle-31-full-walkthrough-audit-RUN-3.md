# Bundle 31 Phase 1B — Full Walkthrough Audit

**Date:** 2026-05-19  
**Model:** claude-haiku-4-5-20251001  
**Surfaces audited:** 15 of 15  
**Findings:** 72 (P0: 0, P1: 36, P2: 35, P3: 1)  
**Total Haiku cost:** $0.0917  
**Duration:** 2.5 min  
**Aborted:** no  
**API call trace:** `docs/audit/2026-05-19T05-43-23-679Z-trace.jsonl` (one JSONL line per API call — request IDs, token counts, raw responses for verification)  

## Findings by severity

### P0 (0)

_None._

### P1 (36)

**p1b-001** `clarity` · dashboard-hero
- **Finding:** MAX PER DAY tile shows $30.00 spend allowance, but the red warning banner directly below states 'Running $28.94 over pace this week' — creating contradictory guidance about whether John is within or violating his daily cap.
- **Evidence:** MAX PER DAY section displays '$30.00' with 'You're on track — spend wisely' reassurance, immediately followed by red alert 'Running $28.94 over pace this week ⚠️' — visual hierarchy and message conflict.
- **Fix complexity:** medium
- **Overlaps Phase 1A:** Item 10

**p1b-002** `semantic` · dashboard-hero
- **Finding:** The banner 'Nothing spent today - $5,002 this cycle' uses 'cycle' terminology without defining cycle boundary; the top alert shows 'Plan active · locked 18 May' but cycle definition (start/end dates) is not visible on hero surface.
- **Evidence:** 'Plan active · locked 18 May' and '$5,002 this cycle' appear with no corresponding cycle-start date or payday countdown context visible on dashboard hero — only 'tap for canvas' affordance.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item 1

**p1b-004** `clarity` · dashboard-hero
- **Finding:** The UNLOCK button on the 'Plan active · locked 18 May' banner has no visible affordance label or explanation — unclear to a tired/scanning user whether this is a one-time action, security gate, or feature toggle.
- **Evidence:** Green 'UNLOCK' button on the plan-locked banner, no accompanying help text, tooltip, or micro-copy explaining what unlocking does or triggers.
- **Fix complexity:** small

**p1b-001** `clarity` · dashboard-scrolled-cards
- **Finding:** MAX PER DAY card uses ambiguous language ('You're on track — spend wisely') that doesn't clearly communicate the actionable constraint or consequence of exceeding $30.
- **Evidence:** MAX PER DAY $30.00 card shows 'You're on track — spend wisely' as guidance text, but doesn't explain what happens if daily cap is breached or whether $30 is a hard limit or soft target.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item 10

**p1b-005** `clarity` · dashboard-scrolled-cards
- **Finding:** SECURITY: Liquid net worth value (+$9,398.91) is displayed in full precision on primary dashboard without obfuscation, visible to shoulder-surfers—sensitive financial snapshot.
- **Evidence:** Liquid net worth displayed as '+$9,398.91' in plain text at top of dashboard, no blur/obfuscation option visible despite sensitivity of total net worth.
- **Fix complexity:** medium

**p1b-001** `clarity` · bills-tab-top
- **Finding:** The BNPL label is visually prominent and clickable-looking, but its interaction target and purpose relative to the bill list is ambiguous.
- **Evidence:** Top right: blue pill button labeled 'BNPL' with no verb, no context explaining whether it filters, creates a new BNPL bill, or opens a scheduler. Sits isolated in dashed box.
- **Fix complexity:** small

**p1b-002** `consistency` · bills-tab-top
- **Finding:** THIS WEEK total ($86) and individual bill amounts don't visually sum or align with BALANCE AFTER ($1,627.83), creating ambiguity about whether THIS WEEK is a subset or independent.
- **Evidence:** $37 + $9 + $24 + $16 = $86 shown in THIS WEEK. BALANCE AFTER shown as $1,627.83. No visual indicator of whether $86 is deducted from balance or independent, and MONTHLY BILLS total ($4,673) dwarfs both.
- **Fix complexity:** medium
- **Overlaps Phase 1A:** Item 18

**p1b-004** `semantic` · bills-tab-top
- **Finding:** FORTNIGHTLY and MONTHLY frequency labels are visually equal in weight despite inconsistent billing cycles, potentially causing John to misremember whether Uber Eats repeats every 2 or 4 weeks.
- **Evidence:** BNPL–Uber Eats shows 'FORTNIGHTLY' in green; Adobe and Spotify show 'MONTHLY' in green. No visual differentiation (e.g., icon, color, or emphasis) to signal irregular vs. standard cycles.
- **Fix complexity:** small

**p1b-001** `consistency` · analysis-tab-pivot
- **Finding:** Total outflows ($8696.78) does not equal sum of visible category totals ($3194.00 + $1132.00 + $1098.00 = $5424.00), creating 37% unexplained gap.
- **Evidence:** Top of screen shows 'Total outflows $8696.78'. Three category cards below show Fixed ($3194.00), Debt repayment ($1132.00), and Savings ($1098.00). Partial card at bottom appears cut off. Math: $5424 visible vs $8696.78 stated = $3272.78 missing.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item 1

**p1b-002** `density` · analysis-tab-pivot
- **Finding:** Banner warning 'Debt categories doubling up?' appears visually low-urgency (beige/tan background, small icon) relative to the scale of the issue ($1,912 across 2 categories) and the recommendation text buried in small gray font.
- **Evidence:** Alert banner positioned mid-screen with muted color palette and icon-text arrangement that reads as informational rather than actionable. Recommendation text ('use one category') is in smaller gray font below the amount, easily missed during rapid scan.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item 2

**p1b-001** `semantic` · analysis-tab-essentials
- **Finding:** Essential vs Discretionary card absent from visible screenshot despite being named in audit brief.
- **Evidence:** Screenshot shows Fixed ($3194), Debt repayment ($1132), and Savings ($1098) categories totaling ~$5424, but no Essential vs Discretionary breakdown card is visible in the middle scroll area as described in the surface description.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item 3

**p1b-002** `consistency` · analysis-tab-essentials
- **Finding:** Total outflows ($8696.78) does not match sum of visible category spend cards ($5424 visible), creating unexplained $3272.78 gap.
- **Evidence:** Header shows 'Total outflows $8696.78' but visible categories (Fixed $3194 + Debt repayment $1132 + Savings $1098) sum to only ~$5424; scrollable categories below the fold are cut off, making verification impossible on single screen.
- **Fix complexity:** small
- **Overlaps Phase 1A:** null

**p1b-005** `semantic` · analysis-tab-essentials
- **Finding:** Debt categories warning ('Debt categories doubling up?') shows $1,912 across 2 categories but does not reconcile against Debt repayment $1132.00 shown below.
- **Evidence:** Warning banner lists 'Debt repayment $1,132 + Loan $788 = $1,920' (≈$1,912 stated), but the main Debt repayment card below shows only $1,132.00 with 4 transactions; Loan category not visible in cards, creating reconciliation ambiguity.
- **Fix complexity:** medium
- **Overlaps Phase 1A:** Item 3

**p1b-001** `clarity` · analysis-survival-forecast
- **Finding:** The 'Remaining at payday' figure (-$392.17) is displayed prominently without explicit call-to-action context, and the adjacent 'If you need to borrow' section feels like a secondary suggestion rather than the primary decision path for a user in deficit.
- **Evidence:** The red -$392.17 label under 'Remaining at payday' occupies visual weight equal to the 'borrow' section below it, but 'Remaining at payday' is a diagnosis, not an action. John, sleep-deprived, may not immediately connect the red number to the 'borrow' section as the required next action.
- **Fix complexity:** small

**p1b-004** `semantic` · analysis-survival-forecast
- **Finding:** The 'Cycle plan locked' warning lists 4 bills totalling $4540 as 'already tracked — these are pre-committed' but does not clarify the date range of the cycle or whether the $4540 overlaps the 'Remaining at payday' calculation.
- **Evidence:** The warning states 'pre-committed and may already be reflected in your spent figure above' — the hedging word 'may' introduces ambiguity. For a stressed user, 'may already be reflected' is not actionable clarity; it should confirm yes/no and show the visual relationship between cycle-locked and remaining balance.
- **Fix complexity:** medium
- **Overlaps Phase 1A:** item-7

**p1b-001** `clarity` · plan-mode-root
- **Finding:** Settings link in header has no visual affordance; appears as plain text in same weight as title, not obviously tappable.
- **Evidence:** 'Settings' text top-right, same font weight and color treatment as 'SLYGHT' logo — no button styling, chevron, or hover state visible
- **Fix complexity:** small

**p1b-003** `clarity` · plan-mode-root
- **Finding:** Bottom nav shows 5 tappable zones (Dashboard, Bills, +, Chat, Analysis) but current screen context is unclear — no active indicator visible on 'Dashboard' or any nav item.
- **Evidence:** Bottom navigation bar shows icons with labels but no visual distinction (highlight, underline, or badge) indicating which screen is active; user cannot confirm they're on root dashboard
- **Fix complexity:** small

**p1b-001** `consistency` · payday-plan-canvas
- **Finding:** Free money remainder ($1,770) does not reconcile visibly with the incoming cycle total ($8,623) minus essentials ($6,853).
- **Evidence:** $8,623 coming in − $6,853 essentials = $1,770 free money shown. Math is correct, but no on-screen formula or breakdown shows HOW $1,770 was derived from the cycle total, forcing trust in invisible calculation.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item 4 (allocation vocabulary reframed to 'still to allocate'), but that addressed headline labeling, not the derivation transparency.

**p1b-003** `semantic` · payday-plan-canvas
- **Finding:** Subtext 'This is what you have to allocate toward savings goals + upcoming' is imprecise: it conflates the remainder ($1,770) with WHAT YOU *MUST* allocate, when it is actually WHAT YOU *CAN* allocate.
- **Evidence:** Tooltip under $1,770: 'This is what you have to allocate toward savings goals + upcoming'. 'Have to' implies obligation; the UI elsewhere frames this as discretionary 'free money'. Language mismatch creates uncertainty about whether user is obligated to spend/save the remainder or if it's flexible buffer.
- **Fix complexity:** small

**p1b-001** `consistency` · payday-savings-subscreen
- **Finding:** Pool allocation math is internally inconsistent: $930 surplus minus $298 provisions minus $100 safety buffer should equal $532, but the display shows $537 already assigned.
- **Evidence:** $930 surplus − $298 provisions − $100 safety buffer = $532, but subtitle states '$537 already assigned of $800 this cycle'. $537 exceeds the $800 header allocation.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item 5

**p1b-002** `consistency` · payday-savings-subscreen
- **Finding:** Goal card allocations sum to more than available: China holiday $0 + Freedom buffer $0 + Darwin Trip $0 = $0 current, but $800 is marked allocated with $537 already assigned; three $0 cards suggest no funds have flowed to any goal despite the 'already assigned' claim.
- **Evidence:** All three visible goal cards show '$0' allocation, yet subtitle claims '$537 already assigned of $800 this cycle'. No visible allocation to any goal.
- **Fix complexity:** medium

**p1b-005** `semantic` · payday-savings-subscreen
- **Finding:** '-$263 over-allocated to goals' label is semantically inverted: the pool is under-allocated (surplus remains), not over-allocated; negative framing contradicts the visual state of three unfunded goals.
- **Evidence:** Header shows '-$263 over-allocated to goals' in red, but $800 pool still contains unassigned funds; Darwin Trip at 89% suggests room exists, not overspend. Label should indicate funds still to allocate, not a deficit.
- **Fix complexity:** medium
- **Overlaps Phase 1A:** Item 4

**p1b-001** `clarity` · payday-upcoming-subscreen
- **Finding:** Two items (Fancy Dinner, Haircut) show 'MARK AS BOUGHT' button, while three others show '✓ bought – tap to undo' with checkmarks, creating inconsistent affordance for the same action type.
- **Evidence:** Fancy Dinner ($150) and Haircut ($80) display green 'MARK AS BOUGHT' buttons; Viola Flowers ($50), Dads car magazine ($13), Body Wash ($40) display '✓ bought – tap to undo' states. Same list, same item type, two different UI patterns.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item 11

**p1b-004** `semantic` · payday-upcoming-subscreen
- **Finding:** Total shown ($333) and item count (3 of 5) don't reconcile visually: screen shows 5 items but header says '3 of 5' — unclear whether this means 3 bought out of 5 planned, or 3 visible of 5 total.
- **Evidence:** Header: '$333 · 3 of 5'. Five items rendered on screen: Fancy Dinner, Viola Flowers, Dads car magazine, Body Wash, Haircut. No label clarifies what the '3 of 5' represents (bought? allocated? visible?).
- **Fix complexity:** small

**p1b-001** `clarity` · payday-bills-subscreen
- **Finding:** Two items with identical button states ('MARK AS BOUGHT') create ambiguity about whether Fancy Dinner and Haircut have different paid/unpaid semantics than the three items showing '✓ bought – tap to undo'.
- **Evidence:** Fancy Dinner ($150) and Haircut ($80) display 'MARK AS BOUGHT' buttons in mint-green; Viola Flowers ($50), Dads car magazine ($13), and Body Wash ($40) display '✓ bought – tap to undo' in mint-green. No visual distinction between 'unpurchased' and 'purchased' states.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item 7–8 (auto-debit visual treatment)

**p1b-002** `consistency` · payday-bills-subscreen
- **Finding:** Header total '$333 · 3 of 5' does not match visible item count: 5 items are displayed (Fancy Dinner, Viola Flowers, Dads car magazine, Body Wash, Haircut), contradicting the '3 of 5' label.
- **Evidence:** Header shows '$333 · 3 of 5 ITEMS'; footer shows '+ Add item'. Counting visible items yields 5 (150 + 50 + 13 + 40 + 80 = $333). The denominator '5' matches visible items, but the numerator '3' does not—unclear whether it means 3 purchased, 3 unpurchased, or a pagination artifact.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item 1–3 (cycle aggregation math)

**p1b-001** `clarity` · plan-mode-wrx
- **Finding:** Fancy Dinner item shows no date yet has a 'MARK AS BOUGHT' button, creating ambiguity about whether this is a future plan or an immediate purchase decision.
- **Evidence:** Fancy Dinner card displays 'No date' in subtitle, but the teal 'MARK AS BOUGHT' button is present and prominent, suggesting John should act now despite having scheduled no date.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item 11

**p1b-002** `clarity` · plan-mode-wrx
- **Finding:** Haircut item also shows 'No date' with 'MARK AS BOUGHT' button, duplicating the ambiguity from Fancy Dinner; unclear if undated items should be actionable in Plan mode.
- **Evidence:** Haircut card displays 'No date' yet has teal 'MARK AS BOUGHT' button, identical pattern to Fancy Dinner.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item 11

**p1b-004** `clarity` · plan-mode-wrx
- **Finding:** '✓ bought – tap to undo' text on already-purchased items (Viola Flowers, Dads car magazine, Body Wash) is not obviously interactive; tap target and affordance are unclear.
- **Evidence:** Three items show green confirmation text with checkmarks and undo instruction, but no visual button, underline, or tap-target highlight; for a sleep-deprived user, it may not register as interactive.
- **Fix complexity:** small

**p1b-001** `clarity` · known-upcoming
- **Finding:** Two items show 'MARK AS BOUGHT' button while three show '✓ bought – tap to undo' with no visual distinction in styling between the two states, creating ambiguity about purchase status at a glance.
- **Evidence:** Fancy Dinner ($150) and Haircut ($80) display 'MARK AS BOUGHT' in teal; Viola Flowers ($50), Dads car magazine ($13), and Body Wash ($40) show checkmark + 'bought – tap to undo' in same teal styling. John scanning quickly may misread state.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item 11

**p1b-002** `consistency` · known-upcoming
- **Finding:** $333 total shown as '3 of 5' items, but visible items sum to $333 (150+50+13+40+80 = $333) — meaning 2 hidden items have $0 value or the display is misleading about what '3 of 5' represents.
- **Evidence:** Header states '$333 · 3 of 5 ITEMS'. Five items are rendered (Fancy Dinner, Viola Flowers, Dads car magazine, Body Wash, Haircut). If only 3 of 5 are shown, 2 items should be off-screen or hidden; current view contradicts the '3 of 5' label.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item 1

**p1b-001** `clarity` · known-upcoming
- **Finding:** Two items show "MARK AS BOUGHT" button while three show "✓ bought – tap to undo" with identical visual styling, creating ambiguity about purchase state and what action is available.
- **Evidence:** Fancy Dinner ($150) and Haircut ($80) display green "MARK AS BOUGHT" buttons; Viola Flowers ($50), Dads car magazine ($13), and Body Wash ($40) display green checkmarks with "bought – tap to undo" text. Identical mint background and button treatment obscures the state difference.
- **Fix complexity:** small

**p1b-002** `consistency` · known-upcoming
- **Finding:** Total shown ($333) does not visually account for which items are marked "bought" — unclear whether total is pre-purchase or post-purchase, or if bought items should be subtracted.
- **Evidence:** $333 appears at top as "$333 · 3 of 5"; five items listed with prices ($150 + $50 + $13 + $40 + $80 = $333), but three are marked bought. The "3 of 5" counter suggests 3 items remain, but $333 is the sum of all five prices, not the three unbought items ($150 + $80 = $230).
- **Fix complexity:** medium
- **Overlaps Phase 1A:** Item-3

**p1b-004** `clarity` · known-upcoming
- **Finding:** "No date" label on all five items suggests dates are missing or irrelevant, but appears on a screen titled "Known upcoming" — semantically contradictory.
- **Evidence:** Each item (Fancy Dinner, Viola Flowers, Dads car magazine, Body Wash, Haircut) shows "No date" below the title. If items are known-upcoming, a date should be predictable or informational; absence is either a data-entry gap or a labeling error.
- **Fix complexity:** medium

**p1b-001** `clarity` · known-upcoming
- **Finding:** Two items show 'MARK AS BOUGHT' button while three others show 'bought – tap to undo' checkmark, creating inconsistent affordance for the same action category.
- **Evidence:** Fancy Dinner ($150) and Haircut ($80) display green 'MARK AS BOUGHT' buttons; Viola Flowers ($50), Dads car magazine ($13), and Body Wash ($40) display checkmarks with 'bought – tap to undo' text. Same list, same item type, different UI patterns.
- **Fix complexity:** small

**p1b-003** `semantic` · known-upcoming
- **Finding:** All five items lack explicit date information (shown as 'No date'), making it unclear whether these are truly 'upcoming' or just unscheduled.
- **Evidence:** Every item in the 'Known upcoming' list displays 'No date' beneath its title. For a list explicitly titled 'upcoming', absence of dates undermines the semantic meaning of the label.
- **Fix complexity:** medium

### P2 (35)

**p1b-003** `density` · dashboard-hero
- **Finding:** Liquid net worth (+$9,398.91) displayed below balance hero with 'tap for full picture' but no context on whether this includes or excludes the Property Deposit debt ($5,681) visible lower on screen, risking misunderstanding of true liquidity.
- **Evidence:** Liquid net worth line with 'tap for full picture' shown mid-screen, while IMMEDIATE DEBTS section below shows $5,681 property deposit — unclear if the net worth figure already nets this out.
- **Fix complexity:** medium

**p1b-005** `consistency` · dashboard-hero
- **Finding:** '27 days to payday' progress bar is visual-only with no accompanying numeric countdown (e.g., 'Payday: 2026-06-15') — inconsistent with other date-dependent elements like 'locked 18 May' which are explicit.
- **Evidence:** Progress bar under MAX PER DAY showing '27 days to payday' with no date label, while 'Plan active · locked 18 May' above uses explicit date notation.
- **Fix complexity:** small

**p1b-002** `semantic` · dashboard-scrolled-cards
- **Finding:** 'Running $28.94 over pace this week' uses 'over' which is ambiguous—could mean ahead-of-budget or exceeding-budget depending on context, causing cognitive friction for a tired user.
- **Evidence:** Warning triangle badge + 'Running $28.94 over pace this week' text. The word 'over' without 'budget' or 'target' is semantically unclear.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item 10

**p1b-003** `consistency` · dashboard-scrolled-cards
- **Finding:** MAX PER DAY cap ($30) and 'Nothing spent today' statement create a logical disconnect when read together—unclear whether the $30 is a daily allowance, a ceiling, or a projected pace metric.
- **Evidence:** MAX PER DAY $30.00 card sits directly below 'Nothing spent today - $5,002 this cycle' and '27 days to payday' context. User hasn't spent today, yet MAX PER DAY is active/displayed as a live constraint.
- **Fix complexity:** medium
- **Overlaps Phase 1A:** Item 10

**p1b-004** `density` · dashboard-scrolled-cards
- **Finding:** MAX PER DAY card includes both a constraint ($30), guidance ('You're on track'), secondary data ('Surplus above cap goes to debt repayment pool'), and a math reference ('TAP FOR MATH'), competing for cognitive weight on a single tile.
- **Evidence:** MAX PER DAY tile contains: headline, dollar amount, guidance text, secondary info box (green), and a tappable 'TAP FOR MATH' link—four distinct information layers on one card.
- **Fix complexity:** medium

**p1b-003** `density` · bills-tab-top
- **Finding:** Day-of-month date badges (21, 21, 25, 26) on bill cards are low-contrast and easily missed when scanning for payment due urgency.
- **Evidence:** Tan/beige rounded box with dark text on left of each bill entry (e.g., '21', '25', '26'). No visual hierarchy separating TODAY from future due dates.
- **Fix complexity:** small

**p1b-005** `clarity` · bills-tab-top
- **Finding:** The '+ Add A Bill' button is left-aligned and stylistically inconsistent with the prominent green floating action button at the bottom of the screen, creating redundant/competing primary actions.
- **Evidence:** Left-aligned '+ Add A Bill' text link at mid-screen; green circular '+' button in bottom nav. No indication whether they do the same thing or which should be used.
- **Fix complexity:** small

**p1b-006** `dead` · bills-tab-top
- **Finding:** Legend row (Bill red dot, Payday green dot, Bill+debt orange dot) is present but no Bill+debt items are visible on the April 2026 calendar, making the legend entry appear orphaned.
- **Evidence:** Three-item legend below calendar header; calendar grid shows no orange dots or items labeled as 'Bill + debt'. Suggest legend items are conditional or upcoming months feature debt.
- **Fix complexity:** small

**p1b-003** `clarity` · analysis-tab-pivot
- **Finding:** Category cards (Fixed, Debt repayment, Savings) display a downward chevron/caret icon but no affordance suggesting what tapping them does (collapse/drill-down/details unclear).
- **Evidence:** Each category card has a small down-chevron icon on the right side (visible on Debt repayment and Savings rows). No label, tooltip hint, or visual indication of interactivity state. John may assume these are labels rather than buttons.
- **Fix complexity:** small

**p1b-004** `semantic` · analysis-tab-pivot
- **Finding:** '7 Days' period is selected but 'Plan active - locked 18 May' header and transaction count ('11 tracked') may refer to a different time window, creating ambiguity about what John is actually viewing.
- **Evidence:** Green '7 Days' button is selected at top. Below, the locked plan dated '18 May' and '11 tracked' transactions do not clearly anchor to the 7-day window. If the plan lock or tracking count applies to a broader period, the pivot is showing mixed temporal contexts.
- **Fix complexity:** small

**p1b-003** `clarity` · analysis-tab-essentials
- **Finding:** Savings categorized alongside Essential and Discretionary spending, semantically incorrect—savings is allocation/direction, not expense type.
- **Evidence:** Savings ($1098.00) appears as a transaction category card with transaction count and daily pace, grouped visually with Fixed and Debt repayment as if it were an outflow category, when it should be a separate savings/allocation metric.
- **Fix complexity:** medium
- **Overlaps Phase 1A:** null

**p1b-004** `density` · analysis-tab-essentials
- **Finding:** Daily pace metrics ($456.29/day, $101.71/day, $156.86/day) add cognitive load without clear relevance to 7-day filtered view.
- **Evidence:** Each category card displays '/day' pace rates; on a 7-day window these rates are less actionable than period totals, and John (on 4hrs sleep, mobile-first) may misinterpret daily rates as predictive spend.
- **Fix complexity:** small
- **Overlaps Phase 1A:** null

**p1b-002** `density` · analysis-survival-forecast
- **Finding:** The 'BREAKDOWN TO PAYDAY' section lists unpaid bills with due dates and amounts, but omits which bills are already cycle-locked (flagged in phase 1A Item 7) — this creates ambiguity about whether the user should take action on bills already deducted.
- **Evidence:** 'Unpaid bills (5)' shows Claude Max, BNPL Stanmore, BNPL Uber Eats, Adobe, Spotify with amounts, but the warning note above says 'these are pre-committed and may already be reflected in your spent figure above' — users cannot visually distinguish which bills are locked vs. pending.
- **Fix complexity:** medium
- **Overlaps Phase 1A:** item-7

**p1b-003** `clarity` · analysis-survival-forecast
- **Finding:** 'Min living costs (27d × $40/day from history)' label is confusing: it states a calculation method but not whether this is a target, a baseline, or a warning threshold—John may not know if he should optimize toward or away from this number.
- **Evidence:** The label reads as methodological (27d × $40/day from history) rather than prescriptive. The -$1080.00 amount is presented as a debit line item alongside bills, implying it's an obligation, but the note in Phase 1A (Item 9) indicates this is sourced from historical average, not a budget or commitment.
- **Fix complexity:** small
- **Overlaps Phase 1A:** item-9

**p1b-005** `clarity` · analysis-survival-forecast
- **Finding:** The 'What to cut instead of borrowing' section shows only meal-prep savings (-$245) with 1 incomplete suggestion ('His work' truncated or cut off), reducing credibility of the cut recommendation.
- **Evidence:** Under 'What to cut instead of borrowing' the second bullet reads '• His work' with no description, then jumps to the balance tile '+$9,398.91'. This appears to be truncated or a rendering error, leaving John without a complete cost-cutting roadmap.
- **Fix complexity:** small

**p1b-006** `density` · analysis-survival-forecast
- **Finding:** The bottom status bar shows '+$9,398.91' (Dashboard balance) and '$30 left today' in close visual proximity without clear semantic separation, risking misreading—a sleep-deprived user may conflate the large positive balance with today's daily allowance.
- **Evidence:** '+$9,398.91' (in green, Dashboard balance) is immediately adjacent to '$30 left today' (also in green text, but a daily micro-metric). The color and weight make both appear equally important, but they operate on different time scales (total vs. today).
- **Fix complexity:** small

**p1b-002** `density` · plan-mode-root
- **Finding:** Settings menu shows 8 options with mixed priority levels (API costs, health checks, v0.247) competing visually with critical user actions; 'Reset All Data' warning is bottom-buried and easily missed on mobile.
- **Evidence:** Settings list includes 'Diagnostics' (health checks, activity log) and 'AI Assistant' (API costs) alongside core financial actions; 'Reset All Data' with warning icon is last item, easily scrolled past on 4-hour-sleep quick taps
- **Fix complexity:** medium

**p1b-004** `dead` · plan-mode-root
- **Finding:** Large empty white space below bottom nav (roughly 200px) suggests either a render error or hidden element; no content justifies this gap on mobile-first layout.
- **Evidence:** Screenshot ends with visible footer metrics (NW: +$9,398.91 | $30 left today | 27d to payday) followed by bottom nav, then significant white space with no content or visual reason
- **Fix complexity:** small

**p1b-005** `semantic` · plan-mode-root
- **Finding:** '$30 left today' label is ambiguous on a settings/menu screen — appears to be a dashboard metric but is displayed in settings view, risking John misinterpreting his remaining daily budget when buried in configuration.
- **Evidence:** Footer shows '$30 left today' as a live metric while viewing Settings panel; context switch between settings configuration and live budget state is not explicitly signaled
- **Fix complexity:** small

**p1b-002** `clarity` · payday-plan-canvas
- **Finding:** Remainder tile ($1,770) is styled as a green card with large currency; it dominates visual hierarchy despite being a DERIVED remainder, not an actionable account balance or commitment.
- **Evidence:** Green card with $1,770 + subtext '—$8,623 coming in − $6,853 essentials' occupies significant real estate. No verb-based CTA anchors the tile (e.g., 'Allocate', 'Review', 'Lock'). Visually mimics account-balance prominence but is secondary to actual allocations below.
- **Fix complexity:** medium

**p1b-004** `clarity` · payday-plan-canvas
- **Finding:** 'Allocating the remainder' section label suggests an ongoing action, but the tiles below (Savings, Upcoming) appear to be STATIC summaries, not allocation interfaces.
- **Evidence:** Section heading 'ALLOCATING THE REMAINDER' (present tense, imperative tone) is followed by read-only summary cards (Savings $930, Upcoming $298). No input fields, +/− buttons, or drag targets visible. User may expect an interactive allocator but encounters display-only cards.
- **Fix complexity:** medium
- **Overlaps Phase 1A:** Item 4 (reframed headlines to 'still to allocate'), but that addressed labeling. This flags the mismatch between heading tone and actual interactivity.

**p1b-005** `density` · payday-plan-canvas
- **Finding:** 'Total essentials' ($6,853) is de-emphasized at bottom-right of the essentials grid, visually competing with four category tiles above it; John scanning quickly may miss it as the actual essentials sum.
- **Evidence:** ESSENTIALS THIS CYCLE section shows Bills ($5,624), Debts ($0), Daily Living ($930), Annual Provisions ($298) as prominent tiles. 'Total essentials $6,853' is small gray text flush-right at the bottom. Layout suggests equal importance of all 5 elements rather than hierarchy (4 line items → 1 total).
- **Fix complexity:** small

**p1b-003** `clarity` · payday-savings-subscreen
- **Finding:** All three goal cards present identical 'MARK AS ALLOCATED' button with no visual distinction between funded vs. unfunded goals, creating ambiguity about whether buttons allocate funds or confirm existing allocations.
- **Evidence:** Darwin Trip (89% funded, $800/$800 progress bar full) and China Holiday ($200/$5000, 4%) both display the same green 'MARK AS ALLOCATED' button without variation in label or state.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item 12

**p1b-004** `density` · payday-savings-subscreen
- **Finding:** The '$0 allocated' display on every goal card adds visual noise without communicating actionability; it's unclear whether this means 'not yet allocated this cycle' or 'no lifetime allocation'.
- **Evidence:** Right-aligned '$0' labels on China Holiday, Freedom Buffer, and Darwin Trip cards; combined with 'this cycle only' clarification in header, creates redundant/conflicting scope signals.
- **Fix complexity:** small

**p1b-002** `clarity` · payday-upcoming-subscreen
- **Finding:** No visible way to delete or remove items marked 'bought' or in 'MARK AS BOUGHT' state; 'tap to undo' implies reversibility but doesn't address removal intent.
- **Evidence:** '✓ bought – tap to undo' only offers undo; 'MARK AS BOUGHT' offers no secondary action. A user who marked an item incorrectly or changed their mind has no discoverable delete path.
- **Fix complexity:** medium
- **Overlaps Phase 1A:** Item 11

**p1b-003** `density` · payday-upcoming-subscreen
- **Finding:** Bottom explanatory text ('Things you know you'll need to buy this cycle...') is low visual priority despite being the only guidance on what 'upcoming' means; high-frequency user (John) may bypass it entirely.
- **Evidence:** Explanatory sentence placed at screen foot in light gray text, after 5 items and '+ Add item' button. No inline or header explanation of list purpose or cycle scope.
- **Fix complexity:** small

**p1b-005** `consistency` · payday-upcoming-subscreen
- **Finding:** 'No date' label on all items contradicts the screen title 'Known upcoming' and the footer text 'need to buy this cycle'; if items have no date, how do they fit a cycle plan?
- **Evidence:** All 5 items display 'No date' below their labels. Screen is titled 'Known upcoming' and footer says 'know you'll need to buy this cycle.' Missing dates makes the 'upcoming' and 'cycle' framing semantically weak.
- **Fix complexity:** medium

**p1b-003** `clarity` · payday-bills-subscreen
- **Finding:** Interactive affordance mismatch: 'No date' label on all items suggests a date-picker or event-binding interaction, but no tap target or icon indicates how to set dates.
- **Evidence:** Each item card shows 'No date' in gray text below the title (e.g., under 'Fancy Dinner', 'Viola Flowers'). No calendar icon, tap indicator, or chevron is visible to signal interactivity.
- **Fix complexity:** small

**p1b-004** `density` · payday-bills-subscreen
- **Finding:** Footer disclaimer ('Things you know you'll need to buy this cycle...') occupies space but provides no actionable guidance for John; may distract from primary task of reviewing bill states.
- **Evidence:** Gray explanatory text at bottom of screen: 'Things you know you'll need to buy this cycle. The AI will know about these when you ask "can I afford X."' This is procedural/aspirational copy, not a warning or required action.
- **Fix complexity:** small

**p1b-003** `consistency` · plan-mode-wrx
- **Finding:** Total shown as '$333 · 3 of 5' but five items are visible on screen (Fancy Dinner, Viola Flowers, Dads car magazine, Body Wash, Haircut); math does not account for all visible items.
- **Evidence:** Header states '$333 · 3 of 5' but Fancy Dinner ($150) + Viola Flowers ($50) + Dads car magazine ($13) + Body Wash ($40) + Haircut ($80) = $333 total; if $333 is the total of ALL 5 items, the label '3 of 5' is semantically incorrect for this view.
- **Fix complexity:** medium
- **Overlaps Phase 1A:** Item 1

**p1b-005** `density` · plan-mode-wrx
- **Finding:** Footer disclaimer 'Things you know you'll need to buy this cycle...' appears only at bottom and uses generic language that may not clarify the difference between Plan mode and other budget surfaces.
- **Evidence:** Small gray text at bottom: 'Things you know you'll need to buy this cycle. The AI will know about these when you ask "can I afford X."' is low visual weight and assumes John already understands cycle semantics.
- **Fix complexity:** small

**p1b-003** `density` · known-upcoming
- **Finding:** Footer text 'Things you know you'll need to buy this cycle...' is passive and uninformative; for a sleep-deprived consultant, it doesn't clarify purpose (e.g., 'Track recurring purchases to improve budget forecasting').
- **Evidence:** Grey helper text at bottom is vague and adds no actionable insight; doesn't explain why John should care about this list or how it affects his financial visibility.
- **Fix complexity:** small

**p1b-004** `clarity` · known-upcoming
- **Finding:** 'No date' label on all items suggests these are undated recurring/scheduled buys, but the UI doesn't explain whether John can set dates, why dates are absent, or if that's by design.
- **Evidence:** Every item shows 'No date' in grey; no affordance to tap and add a date is visible. Unclear if this is intentional (known, unscheduled spending) or a data gap.
- **Fix complexity:** medium

**p1b-003** `density` · known-upcoming
- **Finding:** Boilerplate footer text ('Things you know you'll need to buy this cycle...') competes visually with actionable content and adds no decision-critical information for a fast-scanning user.
- **Evidence:** Bottom of screen contains gray text explaining the cycle concept; for a task-focused consultant on 4hrs sleep, this explanatory prose delays access to the primary action (+ Add item button).
- **Fix complexity:** small

**p1b-002** `clarity` · known-upcoming
- **Finding:** No visual distinction or ordering logic apparent between items marked 'bought' vs. those still available to purchase in the same list.
- **Evidence:** Items without dates are interleaved regardless of purchase status. A user scanning to decide what still needs action cannot quickly separate 'already acquired' from 'still to buy' without reading each status badge.
- **Fix complexity:** medium

### P3 (1)

**p1b-005** `dead` · analysis-tab-pivot
- **Finding:** Partially visible category card at bottom of screen (shows '$700...') is cut off, suggesting incomplete render or scroll friction that may leave John uncertain if there are more categories below.
- **Evidence:** Bottom of screen shows truncated amount and label for a fourth category. No clear scroll affordance or indication of hidden content.
- **Fix complexity:** small

## Per-surface results

### Dashboard — hero (balance + alerts)
- ID: `dashboard-hero`
- Screenshot: `docs/audit/_screenshots/dashboard-hero.png`
- Findings: 5
  - P1 clarity: MAX PER DAY tile shows $30.00 spend allowance, but the red warning banner directly below states 'Running $28.94 over pace this week' — creating contradictory guidance about whether John is within or violating his daily cap.
  - P1 semantic: The banner 'Nothing spent today - $5,002 this cycle' uses 'cycle' terminology without defining cycle boundary; the top alert shows 'Plan active · locked 18 May' but cycle definition (start/end dates) is not visible on hero surface.
  - P2 density: Liquid net worth (+$9,398.91) displayed below balance hero with 'tap for full picture' but no context on whether this includes or excludes the Property Deposit debt ($5,681) visible lower on screen, risking misunderstanding of true liquidity.
  - P1 clarity: The UNLOCK button on the 'Plan active · locked 18 May' banner has no visible affordance label or explanation — unclear to a tired/scanning user whether this is a one-time action, security gate, or feature toggle.
  - P2 consistency: '27 days to payday' progress bar is visual-only with no accompanying numeric countdown (e.g., 'Payday: 2026-06-15') — inconsistent with other date-dependent elements like 'locked 18 May' which are explicit.

### Dashboard — MAX PER DAY + running pace tiles
- ID: `dashboard-scrolled-cards`
- Screenshot: `docs/audit/_screenshots/dashboard-scrolled-cards.png`
- Findings: 5
  - P1 clarity: MAX PER DAY card uses ambiguous language ('You're on track — spend wisely') that doesn't clearly communicate the actionable constraint or consequence of exceeding $30.
  - P2 semantic: 'Running $28.94 over pace this week' uses 'over' which is ambiguous—could mean ahead-of-budget or exceeding-budget depending on context, causing cognitive friction for a tired user.
  - P2 consistency: MAX PER DAY cap ($30) and 'Nothing spent today' statement create a logical disconnect when read together—unclear whether the $30 is a daily allowance, a ceiling, or a projected pace metric.
  - P2 density: MAX PER DAY card includes both a constraint ($30), guidance ('You're on track'), secondary data ('Surplus above cap goes to debt repayment pool'), and a math reference ('TAP FOR MATH'), competing for cognitive weight on a single tile.
  - P1 clarity: SECURITY: Liquid net worth value (+$9,398.91) is displayed in full precision on primary dashboard without obfuscation, visible to shoulder-surfers—sensitive financial snapshot.

### Bills tab — monthly view top
- ID: `bills-tab-top`
- Screenshot: `docs/audit/_screenshots/bills-tab-top.png`
- Findings: 6
  - P1 clarity: The BNPL label is visually prominent and clickable-looking, but its interaction target and purpose relative to the bill list is ambiguous.
  - P1 consistency: THIS WEEK total ($86) and individual bill amounts don't visually sum or align with BALANCE AFTER ($1,627.83), creating ambiguity about whether THIS WEEK is a subset or independent.
  - P2 density: Day-of-month date badges (21, 21, 25, 26) on bill cards are low-contrast and easily missed when scanning for payment due urgency.
  - P1 semantic: FORTNIGHTLY and MONTHLY frequency labels are visually equal in weight despite inconsistent billing cycles, potentially causing John to misremember whether Uber Eats repeats every 2 or 4 weeks.
  - P2 clarity: The '+ Add A Bill' button is left-aligned and stylistically inconsistent with the prominent green floating action button at the bottom of the screen, creating redundant/competing primary actions.
  - P2 dead: Legend row (Bill red dot, Payday green dot, Bill+debt orange dot) is present but no Bill+debt items are visible on the April 2026 calendar, making the legend entry appear orphaned.

### Analysis tab — spending pivot (top)
- ID: `analysis-tab-pivot`
- Screenshot: `docs/audit/_screenshots/analysis-tab-pivot.png`
- Findings: 5
  - P1 consistency: Total outflows ($8696.78) does not equal sum of visible category totals ($3194.00 + $1132.00 + $1098.00 = $5424.00), creating 37% unexplained gap.
  - P1 density: Banner warning 'Debt categories doubling up?' appears visually low-urgency (beige/tan background, small icon) relative to the scale of the issue ($1,912 across 2 categories) and the recommendation text buried in small gray font.
  - P2 clarity: Category cards (Fixed, Debt repayment, Savings) display a downward chevron/caret icon but no affordance suggesting what tapping them does (collapse/drill-down/details unclear).
  - P2 semantic: '7 Days' period is selected but 'Plan active - locked 18 May' header and transaction count ('11 tracked') may refer to a different time window, creating ambiguity about what John is actually viewing.
  - P3 dead: Partially visible category card at bottom of screen (shows '$700...') is cut off, suggesting incomplete render or scroll friction that may leave John uncertain if there are more categories below.

### Analysis tab — Essential vs Discretionary card (POST-FIX from Item 3)
- ID: `analysis-tab-essentials`
- Screenshot: `docs/audit/_screenshots/analysis-tab-essentials.png`
- Findings: 5
  - P1 semantic: Essential vs Discretionary card absent from visible screenshot despite being named in audit brief.
  - P1 consistency: Total outflows ($8696.78) does not match sum of visible category spend cards ($5424 visible), creating unexplained $3272.78 gap.
  - P2 clarity: Savings categorized alongside Essential and Discretionary spending, semantically incorrect—savings is allocation/direction, not expense type.
  - P2 density: Daily pace metrics ($456.29/day, $101.71/day, $156.86/day) add cognitive load without clear relevance to 7-day filtered view.
  - P1 semantic: Debt categories warning ('Debt categories doubling up?') shows $1,912 across 2 categories but does not reconcile against Debt repayment $1132.00 shown below.

### Analysis tab — Survival Forecast
- ID: `analysis-survival-forecast`
- Screenshot: `docs/audit/_screenshots/analysis-survival-forecast.png`
- Findings: 6
  - P1 clarity: The 'Remaining at payday' figure (-$392.17) is displayed prominently without explicit call-to-action context, and the adjacent 'If you need to borrow' section feels like a secondary suggestion rather than the primary decision path for a user in deficit.
  - P2 density: The 'BREAKDOWN TO PAYDAY' section lists unpaid bills with due dates and amounts, but omits which bills are already cycle-locked (flagged in phase 1A Item 7) — this creates ambiguity about whether the user should take action on bills already deducted.
  - P2 clarity: 'Min living costs (27d × $40/day from history)' label is confusing: it states a calculation method but not whether this is a target, a baseline, or a warning threshold—John may not know if he should optimize toward or away from this number.
  - P1 semantic: The 'Cycle plan locked' warning lists 4 bills totalling $4540 as 'already tracked — these are pre-committed' but does not clarify the date range of the cycle or whether the $4540 overlaps the 'Remaining at payday' calculation.
  - P2 clarity: The 'What to cut instead of borrowing' section shows only meal-prep savings (-$245) with 1 incomplete suggestion ('His work' truncated or cut off), reducing credibility of the cut recommendation.
  - P2 density: The bottom status bar shows '+$9,398.91' (Dashboard balance) and '$30 left today' in close visual proximity without clear semantic separation, risking misreading—a sleep-deprived user may conflate the large positive balance with today's daily allowance.

### Plan mode — root dashboard (POST-FIX from Item 4)
- ID: `plan-mode-root`
- Screenshot: `docs/audit/_screenshots/plan-mode-root.png`
- Findings: 5
  - P1 clarity: Settings link in header has no visual affordance; appears as plain text in same weight as title, not obviously tappable.
  - P2 density: Settings menu shows 8 options with mixed priority levels (API costs, health checks, v0.247) competing visually with critical user actions; 'Reset All Data' warning is bottom-buried and easily missed on mobile.
  - P1 clarity: Bottom nav shows 5 tappable zones (Dashboard, Bills, +, Chat, Analysis) but current screen context is unclear — no active indicator visible on 'Dashboard' or any nav item.
  - P2 dead: Large empty white space below bottom nav (roughly 200px) suggests either a render error or hidden element; no content justifies this gap on mobile-first layout.
  - P2 semantic: '$30 left today' label is ambiguous on a settings/menu screen — appears to be a dashboard metric but is displayed in settings view, risking John misinterpreting his remaining daily budget when buried in configuration.

### Payday Plan canvas — REMAINDER tile
- ID: `payday-plan-canvas`
- Screenshot: `docs/audit/_screenshots/payday-plan-canvas.png`
- Findings: 5
  - P1 consistency: Free money remainder ($1,770) does not reconcile visibly with the incoming cycle total ($8,623) minus essentials ($6,853).
  - P2 clarity: Remainder tile ($1,770) is styled as a green card with large currency; it dominates visual hierarchy despite being a DERIVED remainder, not an actionable account balance or commitment.
  - P1 semantic: Subtext 'This is what you have to allocate toward savings goals + upcoming' is imprecise: it conflates the remainder ($1,770) with WHAT YOU *MUST* allocate, when it is actually WHAT YOU *CAN* allocate.
  - P2 clarity: 'Allocating the remainder' section label suggests an ongoing action, but the tiles below (Savings, Upcoming) appear to be STATIC summaries, not allocation interfaces.
  - P2 density: 'Total essentials' ($6,853) is de-emphasized at bottom-right of the essentials grid, visually competing with four category tiles above it; John scanning quickly may miss it as the actual essentials sum.

### Payday — Savings sub-screen (POST-FIX from Item 4)
- ID: `payday-savings-subscreen`
- Screenshot: `docs/audit/_screenshots/payday-savings-subscreen.png`
- Findings: 5
  - P1 consistency: Pool allocation math is internally inconsistent: $930 surplus minus $298 provisions minus $100 safety buffer should equal $532, but the display shows $537 already assigned.
  - P1 consistency: Goal card allocations sum to more than available: China holiday $0 + Freedom buffer $0 + Darwin Trip $0 = $0 current, but $800 is marked allocated with $537 already assigned; three $0 cards suggest no funds have flowed to any goal despite the 'already assigned' claim.
  - P2 clarity: All three goal cards present identical 'MARK AS ALLOCATED' button with no visual distinction between funded vs. unfunded goals, creating ambiguity about whether buttons allocate funds or confirm existing allocations.
  - P2 density: The '$0 allocated' display on every goal card adds visual noise without communicating actionability; it's unclear whether this means 'not yet allocated this cycle' or 'no lifetime allocation'.
  - P1 semantic: '-$263 over-allocated to goals' label is semantically inverted: the pool is under-allocated (surplus remains), not over-allocated; negative framing contradicts the visual state of three unfunded goals.

### Payday — Upcoming items sub-screen
- ID: `payday-upcoming-subscreen`
- Screenshot: `docs/audit/_screenshots/payday-upcoming-subscreen.png`
- Findings: 5
  - P1 clarity: Two items (Fancy Dinner, Haircut) show 'MARK AS BOUGHT' button, while three others show '✓ bought – tap to undo' with checkmarks, creating inconsistent affordance for the same action type.
  - P2 clarity: No visible way to delete or remove items marked 'bought' or in 'MARK AS BOUGHT' state; 'tap to undo' implies reversibility but doesn't address removal intent.
  - P2 density: Bottom explanatory text ('Things you know you'll need to buy this cycle...') is low visual priority despite being the only guidance on what 'upcoming' means; high-frequency user (John) may bypass it entirely.
  - P1 semantic: Total shown ($333) and item count (3 of 5) don't reconcile visually: screen shows 5 items but header says '3 of 5' — unclear whether this means 3 bought out of 5 planned, or 3 visible of 5 total.
  - P2 consistency: 'No date' label on all items contradicts the screen title 'Known upcoming' and the footer text 'need to buy this cycle'; if items have no date, how do they fit a cycle plan?

### Payday — Bills sub-screen
- ID: `payday-bills-subscreen`
- Screenshot: `docs/audit/_screenshots/payday-bills-subscreen.png`
- Findings: 4
  - P1 clarity: Two items with identical button states ('MARK AS BOUGHT') create ambiguity about whether Fancy Dinner and Haircut have different paid/unpaid semantics than the three items showing '✓ bought – tap to undo'.
  - P1 consistency: Header total '$333 · 3 of 5' does not match visible item count: 5 items are displayed (Fancy Dinner, Viola Flowers, Dads car magazine, Body Wash, Haircut), contradicting the '3 of 5' label.
  - P2 clarity: Interactive affordance mismatch: 'No date' label on all items suggests a date-picker or event-binding interaction, but no tap target or icon indicates how to set dates.
  - P2 density: Footer disclaimer ('Things you know you'll need to buy this cycle...') occupies space but provides no actionable guidance for John; may distract from primary task of reviewing bill states.

### Plan mode — WRX card
- ID: `plan-mode-wrx`
- Screenshot: `docs/audit/_screenshots/plan-mode-wrx.png`
- Findings: 5
  - P1 clarity: Fancy Dinner item shows no date yet has a 'MARK AS BOUGHT' button, creating ambiguity about whether this is a future plan or an immediate purchase decision.
  - P1 clarity: Haircut item also shows 'No date' with 'MARK AS BOUGHT' button, duplicating the ambiguity from Fancy Dinner; unclear if undated items should be actionable in Plan mode.
  - P2 consistency: Total shown as '$333 · 3 of 5' but five items are visible on screen (Fancy Dinner, Viola Flowers, Dads car magazine, Body Wash, Haircut); math does not account for all visible items.
  - P1 clarity: '✓ bought – tap to undo' text on already-purchased items (Viola Flowers, Dads car magazine, Body Wash) is not obviously interactive; tap target and affordance are unclear.
  - P2 density: Footer disclaimer 'Things you know you'll need to buy this cycle...' appears only at bottom and uses generic language that may not clarify the difference between Plan mode and other budget surfaces.

### Settings — overview
- ID: `settings-overview`
- Screenshot: `docs/audit/_screenshots/settings-overview.png`
- Findings: 4
  - P1 clarity: Two items show 'MARK AS BOUGHT' button while three show '✓ bought – tap to undo' with no visual distinction in styling between the two states, creating ambiguity about purchase status at a glance.
  - P1 consistency: $333 total shown as '3 of 5' items, but visible items sum to $333 (150+50+13+40+80 = $333) — meaning 2 hidden items have $0 value or the display is misleading about what '3 of 5' represents.
  - P2 density: Footer text 'Things you know you'll need to buy this cycle...' is passive and uninformative; for a sleep-deprived consultant, it doesn't clarify purpose (e.g., 'Track recurring purchases to improve budget forecasting').
  - P2 clarity: 'No date' label on all items suggests these are undated recurring/scheduled buys, but the UI doesn't explain whether John can set dates, why dates are absent, or if that's by design.

### Settings — Diagnostics section
- ID: `settings-diagnostics`
- Screenshot: `docs/audit/_screenshots/settings-diagnostics.png`
- Findings: 4
  - P1 clarity: Two items show "MARK AS BOUGHT" button while three show "✓ bought – tap to undo" with identical visual styling, creating ambiguity about purchase state and what action is available.
  - P1 consistency: Total shown ($333) does not visually account for which items are marked "bought" — unclear whether total is pre-purchase or post-purchase, or if bought items should be subtracted.
  - P2 density: Boilerplate footer text ('Things you know you'll need to buy this cycle...') competes visually with actionable content and adds no decision-critical information for a fast-scanning user.
  - P1 clarity: "No date" label on all five items suggests dates are missing or irrelevant, but appears on a screen titled "Known upcoming" — semantically contradictory.

### Settings — Data & Backup section
- ID: `settings-data-backup`
- Screenshot: `docs/audit/_screenshots/settings-data-backup.png`
- Findings: 3
  - P1 clarity: Two items show 'MARK AS BOUGHT' button while three others show 'bought – tap to undo' checkmark, creating inconsistent affordance for the same action category.
  - P2 clarity: No visual distinction or ordering logic apparent between items marked 'bought' vs. those still available to purchase in the same list.
  - P1 semantic: All five items lack explicit date information (shown as 'No date'), making it unclear whether these are truly 'upcoming' or just unscheduled.
