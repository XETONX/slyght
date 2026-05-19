# Bundle 31 Phase 1B — Full Walkthrough Audit

**Date:** 2026-05-19  
**Model:** claude-haiku-4-5-20251001  
**Surfaces audited:** 15 of 15  
**Findings:** 72 (P0: 0, P1: 35, P2: 37, P3: 0)  
**Total Haiku cost:** $0.0873  
**Duration:** 2.3 min  
**Aborted:** no  
**API call trace:** `docs/audit/2026-05-19T04-05-24-694Z-trace.jsonl` (one JSONL line per API call — request IDs, token counts, raw responses for verification)  

## Findings by severity

### P0 (0)

_None._

### P1 (35)

**p1b-001** `clarity` · dashboard-hero
- **Finding:** UNLOCK button on Plan-locked state lacks affordance for what unlocking does or costs.
- **Evidence:** Green 'UNLOCK' button appears in top-right of Plan-locked banner without explanation. John (4hrs sleep, mobile-first) may tap it reflexively without understanding consequence.
- **Fix complexity:** small

**p1b-002** `consistency` · dashboard-hero
- **Finding:** Liquid net worth (+$9,398.91) shown without cycle context; unclear if this is snapshot, start-of-cycle, or cumulative.
- **Evidence:** 'Liquid net worth' label with tap-for-full-picture affordance but no timestamp or cycle anchor (compare: balance shows 'this cycle', spend shows 'today').
- **Fix complexity:** small

**p1b-005** `clarity` · dashboard-hero
- **Finding:** Property Deposit (via rent) shown under IMMEDIATE DEBTS with no link to or visibility of the rent obligation itself; appears orphaned.
- **Evidence:** '$5,681' debt labeled 'Property Deposit (via Mum)' with note '$630/mo - 3 months' but no parent rent line visible. Unclear if this is rolled into rent or separate liability.
- **Fix complexity:** medium

**p1b-001** `clarity` · dashboard-scrolled-cards
- **Finding:** MAX PER DAY $30.00 cap is stated as active, but 'Running $28.94 over pace this week' suggests cumulative overage across multiple days, creating ambiguity about whether the cap is enforced daily or is a soft advisory.
- **Evidence:** MAX PER DAY card shows '$30.00' with 'You're on track' copy, immediately followed by warning-colored text 'Running $28.94 over pace this week' — no clarification of whether $28.94 is already deducted from future daily budgets or represents debt.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item 10

**p1b-002** `consistency` · dashboard-scrolled-cards
- **Finding:** Liquid net worth shown as '+$9,398.91' on main balance, but Property Deposit (immediate debt) is listed as '$5,681' with note 'NW: +$9,398.91' — unclear if the deposit has already been subtracted from the displayed $1,113.61 Virgin Money balance or if it's a separate liability.
- **Evidence:** 'Liquid net worth +$9,398.91' label at top; Property Deposit card at bottom shows '$5,681' and repeats 'NW: +$9,398.91' — no visible calculation path showing how $1,113.61 + $5,681 debt reconciles to +$9,398.91 net worth.
- **Fix complexity:** medium

**p1b-001** `clarity` · bills-tab-top
- **Finding:** The '+Add A Bill' button and 'BNPL' button are both visually prominent but only one (BNPL) appears actionable in this context; unclear which action John should take first.
- **Evidence:** '+Add A Bill' (left side, tan background) and 'BNPL' button (right side, blue background) are horizontally aligned with similar visual weight, but BNPL appears to be a filter/view toggle while +Add A Bill is a creation action—their relationship is ambiguous.
- **Fix complexity:** small

**p1b-002** `consistency` · bills-tab-top
- **Finding:** BALANCE AFTER ($1,627.83) does not arithmetically reconcile with shown THIS WEEK total ($86) against stated payday timing ('27d to payday').
- **Evidence:** THIS WEEK section shows $86 in bills due (21st, 21st, 25th, 26th), but BALANCE AFTER is $1,627.83. Over 27 days, only $86 is shown; no visibility into remaining ~20 days of April's committed spend, creating gap between partial view and final balance claim.
- **Fix complexity:** medium
- **Overlaps Phase 1A:** Item-18

**p1b-004** `semantic` · bills-tab-top
- **Finding:** BNPL button is labeled as a noun (product category) not a verb, and its current state (selected? unselected?) is not visually distinct.
- **Evidence:** 'BNPL' button (blue, right side) has no indicator of whether it's a filter toggle that's currently active, or a quick-add button—no checkmark, active state styling, or hover affordance visible.
- **Fix complexity:** small

**p1b-001** `consistency` · analysis-tab-pivot
- **Finding:** Total outflows ($8696.78) does not equal sum of visible category spend ($3194 + $1132 + $1098 = $5424), creating a $3272.78 unexplained gap.
- **Evidence:** Top of Analysis screen shows 'Total outflows $8696.78' but the three category cards below sum to only $5424.00. Remaining categories either hidden or math is incorrect.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item-1

**p1b-002** `clarity` · analysis-tab-pivot
- **Finding:** Debt categories doubling banner is present but does not make the recommended next action unambiguous for a tired user.
- **Evidence:** Yellow warning banner states 'Debt categories doubling up?' and mentions $1,912 across 2 categories (Debt repayment $1,132 + Loan $788), but the banner only recommends editing older transactions—does not surface whether John should merge, delete, or leave as-is.
- **Fix complexity:** medium
- **Overlaps Phase 1A:** Item-2

**p1b-004** `semantic` · analysis-tab-pivot
- **Finding:** Transaction count labels ('2 txns', '4 txns', '2 txns') and percentages (36.7%, 13%, 12.6%) do not clarify what denominator or time window is used.
- **Evidence:** Cards show '4 txns · 13%' for Debt repayment and '2 txns · 36.7%' for Fixed without context: 13% of what? 36.7% of what? Over which period?
- **Fix complexity:** small

**p1b-001** `semantic` · analysis-tab-essentials
- **Finding:** Essential vs Discretionary breakdown shown nowhere on this surface despite being in audit scope; only Fixed, Debt repayment, and Savings categories visible.
- **Evidence:** Surface description references 'Essential vs Discretionary card' but screenshot shows only Fixed ($3194.00), Debt repayment ($1132.00), and Savings ($1098.00) — no Essential/Discretionary split card present on visible scroll area.
- **Fix complexity:** medium
- **Overlaps Phase 1A:** Item 3

**p1b-002** `consistency` · analysis-tab-essentials
- **Finding:** Total outflows ($8696.78) does not equal sum of visible category cards ($3194.00 + $1132.00 + $1098.00 = $5424.00); missing ~$3272.78 in visible breakdown.
- **Evidence:** Header shows 'Total outflows $8696.78' but three visible category cards sum to only $5424.00; remaining balance unexplained on current visible surface.
- **Fix complexity:** medium
- **Overlaps Phase 1A:** Item 3

**p1b-005** `semantic` · analysis-tab-essentials
- **Finding:** 'Debt categories doubling up?' alert references $1,912 across 2 categories, but suggests editing transactions to consolidate — unclear whether app should auto-reconcile or if user action is required for trust.
- **Evidence:** Alert banner recommends editing 'older transactions' to use 'Debt repayment' label; tone is advisory but doesn't explicitly state whether this mismatch will auto-correct or impact future calculations.
- **Fix complexity:** medium

**p1b-001** `clarity` · analysis-survival-forecast
- **Finding:** Primary action button ('+ button' in green at bottom) has no visible label describing its function in this context.
- **Evidence:** Large green '+' button at screen bottom center with no accompanying text—John may not know if it adds a bill, expense, or something else from this screen.
- **Fix complexity:** small

**p1b-004** `semantic` · analysis-survival-forecast
- **Finding:** 'Cycle plan locked - 4 bills totalling $4540' warning references pre-committed amounts, but does not clarify whether these are already deducted from the 'Current balance' figure displayed above.
- **Evidence:** Warning states 'these are pre-committed and may already be reflected in your spent figure' but John sees +$113.61 balance *before* understanding if $4540 is already subtracted; creates ambiguity for urgent decision-making.
- **Fix complexity:** medium
- **Overlaps Phase 1A:** Item 7

**p1b-001** `clarity` · plan-mode-root
- **Finding:** Settings button in top-right corner has no visual affordance (no icon, no button styling) — appears as plain text link, easily missed by fast-scanning user.
- **Evidence:** 'Settings' text in top-right corner of header — lacks button styling, icon, or container that signals interactivity compared to bottom nav buttons.
- **Fix complexity:** small

**p1b-003** `semantic` · plan-mode-root
- **Finding:** SECURITY: 'AI Assistant' settings tile shows 'API key, usage, costs' — if this screen displays actual API key values, PII/auth credential exposure risk.
- **Evidence:** 'AI Assistant' tile with subtitle 'API key, usage, costs' — unclear if key is masked or visible in the child screen.
- **Fix complexity:** small

**p1b-006** `dead` · plan-mode-root
- **Finding:** Settings page is displayed but no actual plan-mode tiles (renderAllocateTile, WRX card, trip/goal cards) are visible — user is shown Settings menu instead of Plan root dashboard, violating stated surface description.
- **Evidence:** Screenshot shows Settings menu, not the Plan mode root view with allocation tile, WRX card, and trip/goal cards mentioned in surface description.
- **Fix complexity:** large

**p1b-001** `clarity` · payday-plan-canvas
- **Finding:** Modal instruction step 5 describes transaction-time ticking behavior ('tick items as you handle them') but doesn't clarify whether this is retroactive (user manually ticks after payment) or prospective (auto-tick on payment detection), creating ambiguity about workflow.
- **Evidence:** Modal text: 'After locking, tick items as you handle them — real transactions fire and your balance updates.' No mention of manual vs automatic trigger or timing relative to actual money movement.
- **Fix complexity:** small

**p1b-003** `consistency` · payday-plan-canvas
- **Finding:** Visible canvas behind modal shows 'Total essentials: $6,853' but modal step 2 states 'Subtract essentials (bills + debts + daily living)' without confirming whether 'daily living' tile ($930) is already included in that $6,853 total or is a separate add; if separate, visual total becomes ambiguous.
- **Evidence:** Behind modal: 'Total essentials $6,853' label and visible 'Daily living $930' tile below it. Modal instruction groups these three categories but doesn't confirm compositional relationship.
- **Fix complexity:** small

**p1b-001** `clarity` · payday-savings-subscreen
- **Finding:** Modal dialog 'Welcome to Payday Plan' blocks access to savings allocation data; unclear if this is first-time UX or persistent interruption.
- **Evidence:** Full-screen modal with 5-step instructional text overlays the entire savings sub-screen, including the $263 over-allocated state and Darwin Trip goal card below. User cannot act on savings decisions until dismissing.
- **Fix complexity:** small

**p1b-003** `clarity` · payday-savings-subscreen
- **Finding:** 'Got it' button alone does not indicate whether modal will reappear; no checkbox for 'Don't show again' or indication of permanence.
- **Evidence:** Green 'Got it' button at bottom of modal—typical dismiss gesture—but no affordance showing whether this onboarding is one-time or repeats on next cycle view.
- **Fix complexity:** small

**p1b-001** `clarity` · payday-upcoming-subscreen
- **Finding:** Modal dialog blocks interaction with underlying list; user cannot act on upcoming items while onboarding tooltip is displayed.
- **Evidence:** Full-screen 'Welcome to Payday Plan' modal overlays the Fancy Dinner ($150) and Haircut ($80) items. The 'Got it' button is the only path forward, forcing dismissal before any item action is possible.
- **Fix complexity:** small

**p1b-001** `clarity` · payday-bills-subscreen
- **Finding:** Modal dialog ('Welcome to Payday Plan') blocks access to the bills list John needs to interact with, creating friction on a screen designed for quick daily decision-making.
- **Evidence:** Full-screen white modal with 5-step instructional text overlays the entire 'Known upcoming' bills list ($333, Fancy Dinner $150, Haircut $80) and 'MARK AS BOUGHT' buttons.
- **Fix complexity:** small

**p1b-005** `consistency` · payday-bills-subscreen
- **Finding:** Total ($333) claims to be '3 of 5' items, but only 2 items are visible on screen (Fancy Dinner + Haircut), suggesting a rendering or scrolling issue or the count is stale.
- **Evidence:** Header shows '$333 · 3 of 5' but the visible list shows Fancy Dinner ($150) + Haircut ($80) = $230 of the stated $333, and only 2 items visible (not 3).
- **Fix complexity:** medium

**p1b-001** `clarity` · plan-mode-wrx
- **Finding:** Welcome modal blocks interaction with the plan canvas; no indication of how to dismiss or whether this is mandatory first-time setup vs. persistent help.
- **Evidence:** Full-screen modal overlay with 'Got it' button is only affordance; no close button (X), back arrow, or tap-outside dismissal visible; John must tap the button to proceed.
- **Fix complexity:** small

**p1b-003** `clarity` · plan-mode-wrx
- **Finding:** Behind the modal, 'MARK AS BOUGHT' buttons are visible but unreachable; unclear whether the modal is modal-blocking or merely overlay.
- **Evidence:** Dark overlay behind modal with visible button text ('MARK AS BOUGHT') creates ambiguity: is the canvas frozen or just obscured? No visual indication of disabled state on background elements.
- **Fix complexity:** small

**p1b-005** `clarity` · plan-mode-wrx
- **Finding:** 'Mistake?' affordance in modal references a button in the header, but the button is not visible in the current screenshot — user cannot verify it exists or know how to locate it.
- **Evidence:** Modal text states 'Mistake? Tap [undo icon] in the header to undo your most recent change' but no header with undo button is visible in this frame; creates doubt about whether the feature exists.
- **Fix complexity:** small

**p1b-001** `clarity` · settings-overview
- **Finding:** Modal overlay obscures the Settings page content entirely, making it impossible to audit the actual settings interface that should be visible.
- **Evidence:** White modal dialog 'Welcome to Payday Plan' covers the full background Settings view; no Settings configuration rows are visible to evaluate.
- **Fix complexity:** small

**p1b-003** `dead` · settings-overview
- **Finding:** Modal 'Got it' button appears to close the welcome dialog, but no mechanism is shown to re-open Settings configuration rows or navigate away from this modal state.
- **Evidence:** 'Got it' button (green, bottom of modal) dismisses the overlay, but the underlying Settings page structure remains unobservable in this screenshot.
- **Fix complexity:** small

**p1b-001** `clarity` · payday-plan-modal
- **Finding:** Modal onboarding language uses passive construction ('The remainder is yours') that obscures the actual planning workflow John must execute.
- **Evidence:** Step 3 states 'The remainder is yours to allocate — savings goals upcoming purchases extra debt payments' without clear verbs or sequencing; John must infer he needs to *actively allocate* after subtraction, but the phrasing suggests funds are already allocated.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item 4 (allocation vocabulary)

**p1b-002** `clarity` · payday-plan-modal
- **Finding:** Step 5 ('After locking, tick items as you handle them') introduces a second transactional interaction model ('tick items') distinct from the primary plan-lock-allocate flow, creating ambiguity about whether 'handling' items is the same as 'allocating' in Step 3.
- **Evidence:** Modal instruction step 5 references 'tick items as you handle them' and 'real transactions fire' — but John hasn't yet seen how to transition from 'allocation' (Step 3) to 'ticking' items; the connection between these workflows is invisible in onboarding.
- **Fix complexity:** medium

**p1b-001** `clarity` · payday-plan-onboarding-modal
- **Finding:** Modal instruction step 5 describes post-lock workflow ('tick items as you handle them') but doesn't clarify that locking the plan STOPS real-time balance updates until unlock, creating ambiguity about when John should expect live data refresh.
- **Evidence:** Step 5 text: 'After locking, tick items as you handle them — real transactions fire and your balance updates.' The phrase 'real transactions fire' is vague about whether this happens during lock (contradicting step 4's 'lock the plan') or after unlock.
- **Fix complexity:** small

**p1b-003** `dead` · known-upcoming-items
- **Finding:** The 'MARK AS BOUGHT' button on Fancy Dinner ($150, 'No date') and Haircut ($80, 'No date') is actionable but semantically incorrect—items with no scheduled date should not offer purchase-confirmation until a date is set, risking John marking bought items he hasn't actually transacted.
- **Evidence:** Two items visible behind modal: 'Fancy Dinner' and 'Haircut' both show 'No date' yet display 'MARK AS BOUGHT' buttons in full interactive state. Item header shows '$333 · 3 of 5', but 2 items shown have no date anchor.
- **Fix complexity:** medium
- **Overlaps Phase 1A:** Item 11 (no-discoverable-delete on upcoming items)

### P2 (37)

**p1b-003** `density` · dashboard-hero
- **Finding:** $30/day cap + pace banner creates cognitive overload when read together: 'Running $28.94 over pace' + '$30 left today' + '27 days to payday' requires mental math to determine if he's in danger.
- **Evidence:** MAX PER DAY tile shows $30 cap + 'You're on track' claim, but immediately below it 'Running $28.94 over pace this week' in red warning. John must reconcile whether week-pace and day-cap are in conflict.
- **Fix complexity:** medium
- **Overlaps Phase 1A:** Item 10

**p1b-004** `semantic` · dashboard-hero
- **Finding:** 'Nothing spent today - $5,002 this cycle' is contradictory framing: 'nothing' + large number creates whiplash without clarity on whether $5K is good/bad/expected.
- **Evidence:** Balance hero states 'Nothing spent today' but immediately shows '$5,002 this cycle' as secondary. For a sleep-deprived user, this reads as 'I'm safe' + 'I'm over' simultaneously.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item 1

**p1b-006** `dead` · dashboard-hero
- **Finding:** Immediate Debts 'Auto-sort' button visible but no context on what sorting options exist or current sort order.
- **Evidence:** 'Auto-sort ↓' toggle in top-right of IMMEDIATE DEBTS section with no menu visible and no indication of active sort state.
- **Fix complexity:** small

**p1b-003** `clarity` · dashboard-scrolled-cards
- **Finding:** '$30 left today' on Property Deposit card is ambiguous — unclear whether this is remaining budget, remaining balance on the deposit, or time-based countdown.
- **Evidence:** Property Deposit (via Mum) card footer shows '$30 left today' without context; user seeing both '$30.00/day cap' and '$30 left today' in quick succession may conflate separate concepts.
- **Fix complexity:** small

**p1b-004** `semantic` · dashboard-scrolled-cards
- **Finding:** '$5,002 this cycle' under 'Nothing spent today' is contradicted by the Property Deposit amount ($5,681) and running-over-pace warning, creating doubt about cycle boundary or spend categorization.
- **Evidence:** Dashboard states 'Nothing spent today - $5,002 this cycle' while Immediate Debts section shows $5,681 in an active item tagged 'VIA RENT' — no indication whether rent is excluded from 'spent' or if cycle definition differs between views.
- **Fix complexity:** medium
- **Overlaps Phase 1A:** Items 1, 3

**p1b-005** `density` · dashboard-scrolled-cards
- **Finding:** MAX PER DAY card includes both a hard cap statement and a secondary 'surplus goes to debt' explanation, competing for attention when the primary action (spend wisely) should dominate.
- **Evidence:** MAX PER DAY card contains: headline, copy 'You're on track', warning text 'Running $28.94 over pace', and fine-print explanation about surplus allocation — John on 4hrs sleep will likely parse only the top line and miss the debt-pool detail.
- **Fix complexity:** small

**p1b-003** `density` · bills-tab-top
- **Finding:** NW: +$9,398.91 (net worth delta) is displayed at bottom with equal visual prominence to 'MONTHLY BILLS $4,673', but context for the NW delta is missing—John won't know if that's good/bad or why.
- **Evidence:** Bottom bar shows 'NW: +$9,398.91' | '$30 left today' | '27d to payday'—three competing claims with no labels explaining the NW figure's timeframe or composition.
- **Fix complexity:** small

**p1b-005** `clarity` · bills-tab-top
- **Finding:** The calendar navigation (< April 2026 >) is modal-year-only; user cannot see future months' bills at a glance despite the 27-day payday countdown implying multi-month planning relevance.
- **Evidence:** Single-month calendar view with left/right arrows; no quick-view of May or June bills to assess runway or spike risk across payday cycles.
- **Fix complexity:** medium

**p1b-003** `density` · analysis-tab-pivot
- **Finding:** Daily pace figures ($456.29/day, $101.71/day, $156.86/day) compete visually with category totals without clear hierarchy or use case.
- **Evidence:** Each category card displays both a large total (e.g., '$3194.00') and a smaller daily pace ('$456.29/day') with no label explaining when John would use daily pace vs. total for decision-making.
- **Fix complexity:** small

**p1b-005** `clarity` · analysis-tab-pivot
- **Finding:** Collapse/expand toggles (downward chevrons) on category cards are visually subtle and may not signal interactivity to a sleep-deprived user.
- **Evidence:** Small downward-pointing chevron (▼) appears top-right of Debt repayment and Savings cards but is not clearly labeled as 'tap to expand' or similar; no visual feedback (hover state, color change) shown.
- **Fix complexity:** small

**p1b-006** `dead` · analysis-tab-pivot
- **Finding:** Screen appears to cut off below Savings category; partial visibility of a fourth item suggests hidden content not accessible from current scroll position.
- **Evidence:** Bottom of screen shows truncated text starting with 'NW: +$9,398.91' and navigation bar, indicating category cards may continue below visible area without scroll affordance visually obvious.
- **Fix complexity:** small

**p1b-003** `clarity` · analysis-tab-essentials
- **Finding:** Collapsible category cards lack visual affordance (no chevron/arrow icon visible) making expand/collapse interaction discoverable only by trial.
- **Evidence:** Debt repayment and Savings rows show small downward chevrons only on far right margin; Fixed category shows none — inconsistent expand affordance across cards.
- **Fix complexity:** small

**p1b-004** `density` · analysis-tab-essentials
- **Finding:** Per-day rates ($456.29/day, $101.71/day, $156.86/day) add noise without direct actionability; John on 4hr sleep won't parse whether these are warnings or context.
- **Evidence:** Each category shows daily burn rate in lighter text; unclear if these should trigger concern or are purely informational; no threshold or comparison point provided.
- **Fix complexity:** medium
- **Overlaps Phase 1A:** Item 10 (MAX PER DAY adjacency)

**p1b-002** `density` · analysis-survival-forecast
- **Finding:** 'What to cut instead of borrowing' section appears incomplete—only one suggestion ('Meal prep') with a savings figure shown, but heading suggests multiple alternatives should be listed.
- **Evidence:** Section shows '• Meal prep instead of buying lunch — saves ~$245' followed by '• His work' and then cut off; visual layout suggests content is truncated or render failure.
- **Fix complexity:** small

**p1b-003** `clarity` · analysis-survival-forecast
- **Finding:** Balance line item ('Current balance +$113.61') sits directly above unpaid bills section without visual separation, risking misreading as part of the bills list.
- **Evidence:** No divider or spacing clearly delineates 'Current balance' (+$113.61 in green) from 'Unpaid bills (5)' header; green positive value could be visually conflated with debt section.
- **Fix complexity:** small

**p1b-002** `density` · plan-mode-root
- **Finding:** Six settings tiles visible on settings page (Financial Data, Strategies, Notifications, AI Assistant, Data & Backup, Diagnostics) — none are grayed, disabled, or indicate prerequisite setup, creating ambiguity about which are critical for John's immediate workflow.
- **Evidence:** Settings menu shows full list of toggles without visual hierarchy or status indicators (no badges, no 'not configured' states, no 'required' markers).
- **Fix complexity:** medium

**p1b-004** `clarity` · plan-mode-root
- **Finding:** Bottom nav buttons (Dashboard, Bills, Chat, Analysis) are all icon-only with no labels visible; '+' center button is unlabeled — John at 4hrs sleep may tap wrong button or be unsure of center button purpose.
- **Evidence:** Bottom navigation bar shows five icon buttons with no text labels; center green '+' button is icon-only without tooltip or label.
- **Fix complexity:** small

**p1b-005** `consistency` · plan-mode-root
- **Finding:** Bottom-left corner shows 'NW: +$9,398.91' and '$30 left today' and '27d to payday' — no clear visual separation or hierarchy; unclear which is primary, which is secondary, or if they're all current/accurate.
- **Evidence:** Bottom-left widget displays three data points (Net Worth, Daily Budget Remaining, Days to Payday) in tight spacing without clear visual grouping or labels; no timestamps shown.
- **Fix complexity:** small

**p1b-002** `density` · payday-plan-canvas
- **Finding:** Welcome modal occupies full screen on a canvas John is actively trying to use (Payday Plan is live, locked state visible behind modal), forcing read-through before returning to task; modal lacks 'skip' or 'dismiss' option for returning users.
- **Evidence:** Modal blocks entire canvas view; only 'Got it' button visible (no X, back, or skip affordance); John is a 'often on 4hrs sleep' power user likely to need rapid re-entry.
- **Fix complexity:** small

**p1b-004** `clarity` · payday-plan-canvas
- **Finding:** 'YOUR FREE MONEY THIS CYCLE' tile label uses 'free' but this is actually 'allocatable remainder after essentials'—word choice could mislead a sleep-deprived user into thinking this is discretionary surplus rather than constrained allocation pool.
- **Evidence:** Tile header reads '$1,770 / YOUR FREE MONEY THIS CYCLE' above 'Allocating the remainder' section, conflating 'free' (unconstrained) with 'remainder' (constrained by prior subtraction).
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item 4 (allocation vocabulary collision) — may be adjacent refinement needed

**p1b-005** `dead` · payday-plan-canvas
- **Finding:** Modal welcome text references 'Mistake? Tap ↩️ in the header to undo your most recent change' but this undo affordance is not visible in the current canvas header (only back arrow and locked-state icon visible); user cannot verify affordance exists before dismissing modal.
- **Evidence:** Modal text explicitly directs user to header undo button; visible canvas header shows navigation arrow and lock icon, no undo button visible or discoverable without closing modal.
- **Fix complexity:** medium

**p1b-002** `density` · payday-savings-subscreen
- **Finding:** Modal includes 5 sequential steps with inline formatting noise ($, +, −, —) that increases cognitive load for a sleep-deprived user scanning for next action.
- **Evidence:** Step 3 reads 'The remainder is yours to allocate — savings goals + upcoming purchases + extra debt payments.' with three operators and two types of dashes; Step 5 similarly packed with 'tick items as you handle them — real transactions fire and your balance updates.'
- **Fix complexity:** small

**p1b-004** `consistency` · payday-savings-subscreen
- **Finding:** Modal step 4 says 'Lock the plan when you're happy' but John cannot see the lock UI or current plan state while modal is open; messaging is forward-looking but evidence is blocked.
- **Evidence:** Modal instruction references locking action and happiness checkpoint, but savings screen (showing -$263 over-allocation and Darwin Trip at 68% of goal) is fully obscured.
- **Fix complexity:** medium

**p1b-005** `dead` · payday-savings-subscreen
- **Finding:** Darwin Trip card visible below modal appears partially rendered or cut off; unclear if it is interactive or a rendering artifact.
- **Evidence:** Bottom of modal shows top portion of Darwin Trip card ($0, 68% progress bar) but card is visually incomplete and likely non-interactive while modal is in focus.
- **Fix complexity:** small

**p1b-002** `clarity` · payday-upcoming-subscreen
- **Finding:** 'MARK AS BOUGHT' button appears below Haircut but visual alignment suggests it may apply to the entire list rather than the single item.
- **Evidence:** Two 'MARK AS BOUGHT' buttons visible (one under Fancy Dinner, one under Haircut), but button placement relative to item rows is ambiguous—no clear visual grouping or indentation indicating which item each button controls.
- **Fix complexity:** small

**p1b-003** `density` · payday-upcoming-subscreen
- **Finding:** Onboarding modal contains 5 sequential steps that may overload a sleep-deprived user trying to quickly scan the feature; step numbering could discourage engagement.
- **Evidence:** 'Welcome to Payday Plan' modal lists steps 1–5 in paragraph form. John (4hrs sleep, mobile-first) may not absorb all context before dismissing; no progressive disclosure or collapsible sections offered.
- **Fix complexity:** medium

**p1b-004** `clarity` · payday-upcoming-subscreen
- **Finding:** Undo affordance mentioned in modal ('tap ↩️ in the header') is not visible on current screen, creating a mismatch between instruction and available UI.
- **Evidence:** Modal text states 'Mistake? Tap ↩️ in the header to undo your most recent change.' No ↩️ icon is visible in the header of the upcoming items list shown behind the modal.
- **Fix complexity:** small

**p1b-002** `clarity` · payday-bills-subscreen
- **Finding:** CTA button 'Got it' uses low-action verb ('got it' = acknowledgment) rather than imperative verb matching the modal's purpose (e.g., 'Start planning' or 'Close').
- **Evidence:** Green button at bottom of modal reads 'Got it' — conversational but ambiguous about what action closes the modal or moves to next state.
- **Fix complexity:** small

**p1b-003** `density` · payday-bills-subscreen
- **Finding:** Instructional modal (steps 1–5) is dense with planning narrative that may not be timely for a user in daily-use mode (4hrs sleep, mobile-first, task-driven); steps 4–5 conflate 'locking' and 'ticking' in a way that could confuse the ticking workflow visible behind the modal.
- **Evidence:** Modal text spans steps 1–5 with nested instructions (e.g., 'Lock the plan when you're happy. After locking, tick items as you handle them'). User cannot see the actual 'MARK AS BOUGHT' buttons to learn by doing.
- **Fix complexity:** medium

**p1b-004** `clarity` · payday-bills-subscreen
- **Finding:** 'No date' label on both Fancy Dinner and Haircut items provides no actionable signal — unclear whether this means 'date not set,' 'date unknown,' or 'this is a recurring item with flexible timing.'
- **Evidence:** Below item titles: 'No date' appears on both Fancy Dinner ($150) and Haircut ($80), with no icon or affordance to set/edit the date.
- **Fix complexity:** small

**p1b-002** `density` · plan-mode-wrx
- **Finding:** Welcome modal contains 5 sequential numbered steps but no visual hierarchy or progressive disclosure — all steps equally weighted and static.
- **Evidence:** Steps 1–5 listed as plain text without icons, collapsible sections, or emphasis on critical-path actions (e.g., 'lock the plan' in step 4 is buried among others).
- **Fix complexity:** medium

**p1b-004** `semantic` · plan-mode-wrx
- **Finding:** Step 3 conflates 'savings goals' and 'upcoming purchases' as equivalent allocations, but in the item list below, 'Fancy Dinner' ($150) is shown without a savings/goal label — ambiguous which bucket it belongs to.
- **Evidence:** Modal says 'remainder is yours to allocate — savings goals, upcoming purchases, extra debt payments' but item list shows expense items without category tags; unclear if 'Fancy Dinner' is a goal or a planned purchase.
- **Fix complexity:** medium

**p1b-002** `clarity` · settings-overview
- **Finding:** Modal contains instructional content (5-step onboarding) presented as if this is John's first encounter with Payday Plan, but he is an active user with 3-of-5 upcoming items already logged.
- **Evidence:** 'Welcome to Payday Plan' header + numbered instructional steps (1–5) + 'This is your monthly planning canvas' suggest new-user onboarding, contradicting the active usage state visible behind the modal.
- **Fix complexity:** medium

**p1b-003** `dead` · payday-plan-modal
- **Finding:** Modal presents 5 sequential steps but shows a primary call-to-action ('Got it') that dismisses all guidance without confirming understanding or offering a guided walkthrough.
- **Evidence:** 'Got it' button at modal base is the only exit; no 'Show me', 'Next', or 'Tour' option to scaffold John through the actual UI after dismissal.
- **Fix complexity:** small

**p1b-004** `density` · known-upcoming
- **Finding:** Modal overlay obscures 67% of the 'Known upcoming' list while onboarding; a sleep-deprived user may dismiss the modal without registering the items visible beneath.
- **Evidence:** White modal centered on screen covers 'Fancy Dinner ($150)' and 'Haircut ($80)' items and '+ Add item' option; visual weight of modal text dominates the underlying data.
- **Fix complexity:** small

**p1b-002** `clarity` · payday-plan-onboarding-modal
- **Finding:** Onboarding modal uses 'net pay + bonus' in step 1 without clarifying whether bonus is optional, recurring, or one-time—critical for John's monthly plan ceiling math.
- **Evidence:** Step 1: 'See what's coming in (net pay + bonus).' No qualifier on bonus predictability or frequency.
- **Fix complexity:** small

**p1b-004** `consistency` · known-upcoming-items
- **Finding:** Total shown as '$333 · 3 of 5' but visible items (Fancy Dinner $150 + Haircut $80) sum to $230, leaving $103 unaccounted for and unclear which 2 of the 5 items are hidden or off-screen.
- **Evidence:** Header states '$333 · 3 of 5' but only 2 items visible behind modal ($150 + $80 = $230). Math suggests 1 hidden item or a third item partially obscured above the modal.
- **Fix complexity:** small

### P3 (0)

_None._

## Per-surface results

### Dashboard — hero (balance + alerts)
- ID: `dashboard-hero`
- Screenshot: `docs/audit/_screenshots/dashboard-hero.png`
- Findings: 6
  - P1 clarity: UNLOCK button on Plan-locked state lacks affordance for what unlocking does or costs.
  - P1 consistency: Liquid net worth (+$9,398.91) shown without cycle context; unclear if this is snapshot, start-of-cycle, or cumulative.
  - P2 density: $30/day cap + pace banner creates cognitive overload when read together: 'Running $28.94 over pace' + '$30 left today' + '27 days to payday' requires mental math to determine if he's in danger.
  - P2 semantic: 'Nothing spent today - $5,002 this cycle' is contradictory framing: 'nothing' + large number creates whiplash without clarity on whether $5K is good/bad/expected.
  - P1 clarity: Property Deposit (via rent) shown under IMMEDIATE DEBTS with no link to or visibility of the rent obligation itself; appears orphaned.
  - P2 dead: Immediate Debts 'Auto-sort' button visible but no context on what sorting options exist or current sort order.

### Dashboard — MAX PER DAY + running pace tiles
- ID: `dashboard-scrolled-cards`
- Screenshot: `docs/audit/_screenshots/dashboard-scrolled-cards.png`
- Findings: 5
  - P1 clarity: MAX PER DAY $30.00 cap is stated as active, but 'Running $28.94 over pace this week' suggests cumulative overage across multiple days, creating ambiguity about whether the cap is enforced daily or is a soft advisory.
  - P1 consistency: Liquid net worth shown as '+$9,398.91' on main balance, but Property Deposit (immediate debt) is listed as '$5,681' with note 'NW: +$9,398.91' — unclear if the deposit has already been subtracted from the displayed $1,113.61 Virgin Money balance or if it's a separate liability.
  - P2 clarity: '$30 left today' on Property Deposit card is ambiguous — unclear whether this is remaining budget, remaining balance on the deposit, or time-based countdown.
  - P2 semantic: '$5,002 this cycle' under 'Nothing spent today' is contradicted by the Property Deposit amount ($5,681) and running-over-pace warning, creating doubt about cycle boundary or spend categorization.
  - P2 density: MAX PER DAY card includes both a hard cap statement and a secondary 'surplus goes to debt' explanation, competing for attention when the primary action (spend wisely) should dominate.

### Bills tab — monthly view top
- ID: `bills-tab-top`
- Screenshot: `docs/audit/_screenshots/bills-tab-top.png`
- Findings: 5
  - P1 clarity: The '+Add A Bill' button and 'BNPL' button are both visually prominent but only one (BNPL) appears actionable in this context; unclear which action John should take first.
  - P1 consistency: BALANCE AFTER ($1,627.83) does not arithmetically reconcile with shown THIS WEEK total ($86) against stated payday timing ('27d to payday').
  - P2 density: NW: +$9,398.91 (net worth delta) is displayed at bottom with equal visual prominence to 'MONTHLY BILLS $4,673', but context for the NW delta is missing—John won't know if that's good/bad or why.
  - P1 semantic: BNPL button is labeled as a noun (product category) not a verb, and its current state (selected? unselected?) is not visually distinct.
  - P2 clarity: The calendar navigation (< April 2026 >) is modal-year-only; user cannot see future months' bills at a glance despite the 27-day payday countdown implying multi-month planning relevance.

### Analysis tab — spending pivot (top)
- ID: `analysis-tab-pivot`
- Screenshot: `docs/audit/_screenshots/analysis-tab-pivot.png`
- Findings: 6
  - P1 consistency: Total outflows ($8696.78) does not equal sum of visible category spend ($3194 + $1132 + $1098 = $5424), creating a $3272.78 unexplained gap.
  - P1 clarity: Debt categories doubling banner is present but does not make the recommended next action unambiguous for a tired user.
  - P2 density: Daily pace figures ($456.29/day, $101.71/day, $156.86/day) compete visually with category totals without clear hierarchy or use case.
  - P1 semantic: Transaction count labels ('2 txns', '4 txns', '2 txns') and percentages (36.7%, 13%, 12.6%) do not clarify what denominator or time window is used.
  - P2 clarity: Collapse/expand toggles (downward chevrons) on category cards are visually subtle and may not signal interactivity to a sleep-deprived user.
  - P2 dead: Screen appears to cut off below Savings category; partial visibility of a fourth item suggests hidden content not accessible from current scroll position.

### Analysis tab — Essential vs Discretionary card (POST-FIX from Item 3)
- ID: `analysis-tab-essentials`
- Screenshot: `docs/audit/_screenshots/analysis-tab-essentials.png`
- Findings: 5
  - P1 semantic: Essential vs Discretionary breakdown shown nowhere on this surface despite being in audit scope; only Fixed, Debt repayment, and Savings categories visible.
  - P1 consistency: Total outflows ($8696.78) does not equal sum of visible category cards ($3194.00 + $1132.00 + $1098.00 = $5424.00); missing ~$3272.78 in visible breakdown.
  - P2 clarity: Collapsible category cards lack visual affordance (no chevron/arrow icon visible) making expand/collapse interaction discoverable only by trial.
  - P2 density: Per-day rates ($456.29/day, $101.71/day, $156.86/day) add noise without direct actionability; John on 4hr sleep won't parse whether these are warnings or context.
  - P1 semantic: 'Debt categories doubling up?' alert references $1,912 across 2 categories, but suggests editing transactions to consolidate — unclear whether app should auto-reconcile or if user action is required for trust.

### Analysis tab — Survival Forecast
- ID: `analysis-survival-forecast`
- Screenshot: `docs/audit/_screenshots/analysis-survival-forecast.png`
- Findings: 4
  - P1 clarity: Primary action button ('+ button' in green at bottom) has no visible label describing its function in this context.
  - P2 density: 'What to cut instead of borrowing' section appears incomplete—only one suggestion ('Meal prep') with a savings figure shown, but heading suggests multiple alternatives should be listed.
  - P2 clarity: Balance line item ('Current balance +$113.61') sits directly above unpaid bills section without visual separation, risking misreading as part of the bills list.
  - P1 semantic: 'Cycle plan locked - 4 bills totalling $4540' warning references pre-committed amounts, but does not clarify whether these are already deducted from the 'Current balance' figure displayed above.

### Plan mode — root dashboard (POST-FIX from Item 4)
- ID: `plan-mode-root`
- Screenshot: `docs/audit/_screenshots/plan-mode-root.png`
- Findings: 6
  - P1 clarity: Settings button in top-right corner has no visual affordance (no icon, no button styling) — appears as plain text link, easily missed by fast-scanning user.
  - P2 density: Six settings tiles visible on settings page (Financial Data, Strategies, Notifications, AI Assistant, Data & Backup, Diagnostics) — none are grayed, disabled, or indicate prerequisite setup, creating ambiguity about which are critical for John's immediate workflow.
  - P1 semantic: SECURITY: 'AI Assistant' settings tile shows 'API key, usage, costs' — if this screen displays actual API key values, PII/auth credential exposure risk.
  - P2 clarity: Bottom nav buttons (Dashboard, Bills, Chat, Analysis) are all icon-only with no labels visible; '+' center button is unlabeled — John at 4hrs sleep may tap wrong button or be unsure of center button purpose.
  - P2 consistency: Bottom-left corner shows 'NW: +$9,398.91' and '$30 left today' and '27d to payday' — no clear visual separation or hierarchy; unclear which is primary, which is secondary, or if they're all current/accurate.
  - P1 dead: Settings page is displayed but no actual plan-mode tiles (renderAllocateTile, WRX card, trip/goal cards) are visible — user is shown Settings menu instead of Plan root dashboard, violating stated surface description.

### Payday Plan canvas — REMAINDER tile
- ID: `payday-plan-canvas`
- Screenshot: `docs/audit/_screenshots/payday-plan-canvas.png`
- Findings: 5
  - P1 clarity: Modal instruction step 5 describes transaction-time ticking behavior ('tick items as you handle them') but doesn't clarify whether this is retroactive (user manually ticks after payment) or prospective (auto-tick on payment detection), creating ambiguity about workflow.
  - P2 density: Welcome modal occupies full screen on a canvas John is actively trying to use (Payday Plan is live, locked state visible behind modal), forcing read-through before returning to task; modal lacks 'skip' or 'dismiss' option for returning users.
  - P1 consistency: Visible canvas behind modal shows 'Total essentials: $6,853' but modal step 2 states 'Subtract essentials (bills + debts + daily living)' without confirming whether 'daily living' tile ($930) is already included in that $6,853 total or is a separate add; if separate, visual total becomes ambiguous.
  - P2 clarity: 'YOUR FREE MONEY THIS CYCLE' tile label uses 'free' but this is actually 'allocatable remainder after essentials'—word choice could mislead a sleep-deprived user into thinking this is discretionary surplus rather than constrained allocation pool.
  - P2 dead: Modal welcome text references 'Mistake? Tap ↩️ in the header to undo your most recent change' but this undo affordance is not visible in the current canvas header (only back arrow and locked-state icon visible); user cannot verify affordance exists before dismissing modal.

### Payday — Savings sub-screen (POST-FIX from Item 4)
- ID: `payday-savings-subscreen`
- Screenshot: `docs/audit/_screenshots/payday-savings-subscreen.png`
- Findings: 5
  - P1 clarity: Modal dialog 'Welcome to Payday Plan' blocks access to savings allocation data; unclear if this is first-time UX or persistent interruption.
  - P2 density: Modal includes 5 sequential steps with inline formatting noise ($, +, −, —) that increases cognitive load for a sleep-deprived user scanning for next action.
  - P1 clarity: 'Got it' button alone does not indicate whether modal will reappear; no checkbox for 'Don't show again' or indication of permanence.
  - P2 consistency: Modal step 4 says 'Lock the plan when you're happy' but John cannot see the lock UI or current plan state while modal is open; messaging is forward-looking but evidence is blocked.
  - P2 dead: Darwin Trip card visible below modal appears partially rendered or cut off; unclear if it is interactive or a rendering artifact.

### Payday — Upcoming items sub-screen
- ID: `payday-upcoming-subscreen`
- Screenshot: `docs/audit/_screenshots/payday-upcoming-subscreen.png`
- Findings: 4
  - P1 clarity: Modal dialog blocks interaction with underlying list; user cannot act on upcoming items while onboarding tooltip is displayed.
  - P2 clarity: 'MARK AS BOUGHT' button appears below Haircut but visual alignment suggests it may apply to the entire list rather than the single item.
  - P2 density: Onboarding modal contains 5 sequential steps that may overload a sleep-deprived user trying to quickly scan the feature; step numbering could discourage engagement.
  - P2 clarity: Undo affordance mentioned in modal ('tap ↩️ in the header') is not visible on current screen, creating a mismatch between instruction and available UI.

### Payday — Bills sub-screen
- ID: `payday-bills-subscreen`
- Screenshot: `docs/audit/_screenshots/payday-bills-subscreen.png`
- Findings: 5
  - P1 clarity: Modal dialog ('Welcome to Payday Plan') blocks access to the bills list John needs to interact with, creating friction on a screen designed for quick daily decision-making.
  - P2 clarity: CTA button 'Got it' uses low-action verb ('got it' = acknowledgment) rather than imperative verb matching the modal's purpose (e.g., 'Start planning' or 'Close').
  - P2 density: Instructional modal (steps 1–5) is dense with planning narrative that may not be timely for a user in daily-use mode (4hrs sleep, mobile-first, task-driven); steps 4–5 conflate 'locking' and 'ticking' in a way that could confuse the ticking workflow visible behind the modal.
  - P2 clarity: 'No date' label on both Fancy Dinner and Haircut items provides no actionable signal — unclear whether this means 'date not set,' 'date unknown,' or 'this is a recurring item with flexible timing.'
  - P1 consistency: Total ($333) claims to be '3 of 5' items, but only 2 items are visible on screen (Fancy Dinner + Haircut), suggesting a rendering or scrolling issue or the count is stale.

### Plan mode — WRX card
- ID: `plan-mode-wrx`
- Screenshot: `docs/audit/_screenshots/plan-mode-wrx.png`
- Findings: 5
  - P1 clarity: Welcome modal blocks interaction with the plan canvas; no indication of how to dismiss or whether this is mandatory first-time setup vs. persistent help.
  - P2 density: Welcome modal contains 5 sequential numbered steps but no visual hierarchy or progressive disclosure — all steps equally weighted and static.
  - P1 clarity: Behind the modal, 'MARK AS BOUGHT' buttons are visible but unreachable; unclear whether the modal is modal-blocking or merely overlay.
  - P2 semantic: Step 3 conflates 'savings goals' and 'upcoming purchases' as equivalent allocations, but in the item list below, 'Fancy Dinner' ($150) is shown without a savings/goal label — ambiguous which bucket it belongs to.
  - P1 clarity: 'Mistake?' affordance in modal references a button in the header, but the button is not visible in the current screenshot — user cannot verify it exists or know how to locate it.

### Settings — overview
- ID: `settings-overview`
- Screenshot: `docs/audit/_screenshots/settings-overview.png`
- Findings: 3
  - P1 clarity: Modal overlay obscures the Settings page content entirely, making it impossible to audit the actual settings interface that should be visible.
  - P2 clarity: Modal contains instructional content (5-step onboarding) presented as if this is John's first encounter with Payday Plan, but he is an active user with 3-of-5 upcoming items already logged.
  - P1 dead: Modal 'Got it' button appears to close the welcome dialog, but no mechanism is shown to re-open Settings configuration rows or navigate away from this modal state.

### Settings — Diagnostics section
- ID: `settings-diagnostics`
- Screenshot: `docs/audit/_screenshots/settings-diagnostics.png`
- Findings: 4
  - P1 clarity: Modal onboarding language uses passive construction ('The remainder is yours') that obscures the actual planning workflow John must execute.
  - P1 clarity: Step 5 ('After locking, tick items as you handle them') introduces a second transactional interaction model ('tick items') distinct from the primary plan-lock-allocate flow, creating ambiguity about whether 'handling' items is the same as 'allocating' in Step 3.
  - P2 dead: Modal presents 5 sequential steps but shows a primary call-to-action ('Got it') that dismisses all guidance without confirming understanding or offering a guided walkthrough.
  - P2 density: Modal overlay obscures 67% of the 'Known upcoming' list while onboarding; a sleep-deprived user may dismiss the modal without registering the items visible beneath.

### Settings — Data & Backup section
- ID: `settings-data-backup`
- Screenshot: `docs/audit/_screenshots/settings-data-backup.png`
- Findings: 4
  - P1 clarity: Modal instruction step 5 describes post-lock workflow ('tick items as you handle them') but doesn't clarify that locking the plan STOPS real-time balance updates until unlock, creating ambiguity about when John should expect live data refresh.
  - P2 clarity: Onboarding modal uses 'net pay + bonus' in step 1 without clarifying whether bonus is optional, recurring, or one-time—critical for John's monthly plan ceiling math.
  - P1 dead: The 'MARK AS BOUGHT' button on Fancy Dinner ($150, 'No date') and Haircut ($80, 'No date') is actionable but semantically incorrect—items with no scheduled date should not offer purchase-confirmation until a date is set, risking John marking bought items he hasn't actually transacted.
  - P2 consistency: Total shown as '$333 · 3 of 5' but visible items (Fancy Dinner $150 + Haircut $80) sum to $230, leaving $103 unaccounted for and unclear which 2 of the 5 items are hidden or off-screen.
