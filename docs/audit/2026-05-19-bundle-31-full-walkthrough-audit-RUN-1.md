# Bundle 31 Phase 1B — Full Walkthrough Audit

**Date:** 2026-05-19  
**Model:** claude-haiku-4-5-20251001  
**Surfaces audited:** 15 of 15  
**Findings:** 56 (P0: 0, P1: 30, P2: 26, P3: 0)  
**Total Haiku cost:** $0.0718  
**Duration:** 1.9 min  
**Aborted:** no  

## Findings by severity

### P0 (0)

_None._

### P1 (30)

**p1b-001** `clarity` · dashboard-hero
- **Finding:** Modal dialog appears without clear dismissal path — user must choose one of three actions or be trapped.
- **Evidence:** End of day check modal (center of screen) has three buttons but no X/back affordance visible; 'Accept & move on' is lowest-friction but semantically ambiguous about what 'move on' means.
- **Fix complexity:** small

**p1b-002** `consistency` · dashboard-hero
- **Finding:** Modal totals mismatch: 'Total: $17' stated but only one line item shown (YouTube Premium — $17); unclear if this is the complete list or if other debits are hidden.
- **Evidence:** 'Yesterday (18/5) these were scheduled to debit:' header followed by single bullet, then 'Total: $17. If they came out, update your balance.' — no indication of whether more items are collapsed or if list is complete.
- **Fix complexity:** small

**p1b-004** `semantic` · dashboard-hero
- **Finding:** 'Mark as untracked — adjust balance' button label is passive and vague; unclear whether John controls the adjustment or if the system auto-corrects.
- **Evidence:** Button text does not explicitly state 'I will manually adjust' vs 'system will auto-adjust' — for a sleep-deprived user making a financial decision, this is a critical semantic gap.
- **Fix complexity:** small

**p1b-001** `clarity` · end-of-day-check-modal
- **Finding:** Three action buttons present but visual hierarchy doesn't signal which is the 'safe' default path for a tired user who might tap quickly.
- **Evidence:** Green 'Log the missing transaction now' button, gray 'Mark as untracked — adjust balance' button, and gray 'Accept & move on' button all appear equally weighted; green suggests 'do this' but middle option is destructive (adjusts balance without logging).
- **Fix complexity:** small

**p1b-002** `semantic` · end-of-day-check-modal
- **Finding:** Modal presents $17 YouTube Premium debit as a factual 'scheduled to debit' but offers no visibility into whether this is a recurring subscription renewal or one-time charge, leaving John uncertain whether to log or accept.
- **Evidence:** Text states 'Yesterday (18/5) these were scheduled to debit:' with YouTube Premium — $17 listed, but no subscription frequency indicator (monthly/annual), next charge date, or ability to view the original subscription.
- **Fix complexity:** medium
- **Overlaps Phase 1A:** Item 7 (auto-debit absence of scheduler)

**p1b-004** `clarity` · end-of-day-check-modal
- **Finding:** 'Mark as untracked — adjust balance' button uses a dash-separated label that reads more like a description than an action verb, creating ambiguity about what 'adjust' means (reduce, increase, replace?).
- **Evidence:** Button label 'Mark as untracked — adjust balance' does not clearly signal whether this removes the transaction from tracking, manually sets the balance, or flags it for review.
- **Fix complexity:** small

**p1b-001** `clarity` · end-of-day-check-modal
- **Finding:** Modal presents three mutually-exclusive actions with unclear priority hierarchy; green CTA is 'Log missing transaction' but user's actual need (confirm debit happened or didn't) maps ambiguously across all three buttons.
- **Evidence:** Three buttons: green 'Log the missing transaction now' (suggests debit didn't post), gray 'Mark as untracked — adjust balance' (suggests manual correction), gray 'Accept & move on' (suggests acceptance). User context is 'these were scheduled to debit' but CTA hierarchy doesn't reflect whether John should verify-then-log, or is already certain.
- **Fix complexity:** medium
- **Overlaps Phase 1A:** Item-7, Item-8 (auto-debit UX confusion)

**p1b-002** `consistency` · end-of-day-check-modal
- **Finding:** Modal states 'Yesterday (18/5) these were scheduled to debit' but does not indicate whether the $17 YouTube Premium charge actually cleared the account yet (pending vs. posted status).
- **Evidence:** Text reads 'If they came out, update your balance' — conditional language that implies uncertainty, but no affordance shown to John to CHECK whether it posted; three action buttons assume he already knows the answer.
- **Fix complexity:** small

**p1b-001** `clarity` · analysis-tab-pivot
- **Finding:** Modal dialog presents three mutually-exclusive actions (Log / Mark untracked / Accept & move on) without clear guidance on which John should choose based on his situation.
- **Evidence:** End of day check modal shows YouTube Premium $17 scheduled debit with three buttons of equal visual weight; no explanatory text distinguishes when to use each (e.g., 'If it posted:' vs 'If it didn't:').
- **Fix complexity:** small

**p1b-002** `semantic` · analysis-tab-pivot
- **Finding:** Modal says 'If they came out, update your balance' but doesn't specify what 'update your balance' means—adjust manually, auto-reconcile, or something else.
- **Evidence:** Text reads 'Total: $17. If they came out, update your balance.' with no verb attached to the action John should take.
- **Fix complexity:** small

**p1b-001** `clarity` · analysis-tab-essentials
- **Finding:** Modal dialog 'End of day check' visually dominates the Analysis tab content, making it unclear whether the user should act on the modal or dismiss it first to see the underlying Essential vs Discretionary card.
- **Evidence:** Full-screen white modal overlays the Analysis tab with three action buttons ('Log the missing transaction now', 'Mark as untracked — adjust balance', 'Accept & move on'), but no visual hierarchy or skip affordance makes the user's primary intent clear—especially for a sleep-deprived consultant scanning quickly.
- **Fix complexity:** small

**p1b-003** `clarity` · analysis-tab-essentials
- **Finding:** 'Mark as untracked — adjust balance' button label is a compound action (mark AND adjust) without clarifying what 'adjust' means or what balance impact occurs.
- **Evidence:** Button text 'Mark as untracked — adjust balance' uses a dash to combine two verbs; unclear whether this removes the $17 from spend tracking, revises the total outflows ($586.24), or both.
- **Fix complexity:** small

**p1b-001** `clarity` · analysis-survival-forecast
- **Finding:** End of day check modal presents a transaction ($17 YouTube Premium) that may or may not have cleared, with three equally-weighted options, but no clear guidance on which action John should take first or what the consequences are.
- **Evidence:** Modal titled 'End of day check' with three buttons: 'Log the missing transaction now' (green, primary), 'Mark as untracked — adjust balance' (secondary), and 'Accept & move on' (tertiary). The modal doesn't explain what happens to the runout forecast in each case, or whether John should wait for the transaction to actually post.
- **Fix complexity:** medium
- **Overlaps Phase 1A:** Item 7

**p1b-003** `semantic` · analysis-survival-forecast
- **Finding:** Button label 'Log the missing transaction now' is ambiguous: unclear whether it means 'record this transaction' or 'immediately debit it' — for a sleep-deprived consultant, this could lead to double-logging or misunderstanding timing.
- **Evidence:** 'Log the missing transaction now' button uses verb phrase that doesn't clearly signal whether this modifies local tracking only or triggers actual payment processing.
- **Fix complexity:** small

**p1b-001** `clarity` · plan-mode-root
- **Finding:** End-of-day check modal blocks access to primary navigation and dashboard content; unclear whether dismissing it allows natural workflow or creates data-entry friction.
- **Evidence:** Modal dialog overlays entire screen with three buttons: 'Log the missing transaction now' (green, primary), 'Mark as untracked — adjust balance' (secondary), 'Accept & move on' (tertiary). On a 4-hour-sleep user, which action closes the modal without additional steps is ambiguous.
- **Fix complexity:** small

**p1b-003** `consistency` · plan-mode-root
- **Finding:** Modal states 'Total: $17. If they came out, update your balance' but does not show the current balance before or after the action; user cannot verify impact.
- **Evidence:** Modal text says 'Total: $17. If they came out, update your balance.' but no balance figures (current, projected, or delta) are displayed in the modal or nearby.
- **Fix complexity:** small

**p1b-005** `semantic` · plan-mode-root
- **Finding:** SECURITY/DATA: Modal references 'yesterday (18/5)' but current screenshot date context is not visible; if date has drifted, user may unknowingly log/mark transactions from the wrong day.
- **Evidence:** Modal states 'Yesterday (18/5) these were scheduled to debit' with no visible calendar indicator or current-date anchor on screen to confirm today's date.
- **Fix complexity:** small

**p1b-001** `clarity` · payday-plan-canvas
- **Finding:** Welcome modal blocks access to the canvas data; no clear dismiss pattern beyond 'Got it' button, forcing interaction before John can assess his remainder allocation.
- **Evidence:** Modal dialog overlays entire canvas with welcome instructions; only actionable element is 'Got it' button at bottom.
- **Fix complexity:** small

**p1b-003** `clarity` · payday-plan-canvas
- **Finding:** Error icon (🔧) mentioned in step 4 of modal ('Tap 🔧 in the header to undo') is not visible in the canvas behind the modal, breaking the instructional reference.
- **Evidence:** Modal instructs to tap 'blue square' icon in header (step 4), but header is obscured; unclear if that icon exists or is discoverable after dismissal.
- **Fix complexity:** small

**p1b-001** `clarity` · payday-savings-subscreen
- **Finding:** Modal dialog lacks visual escape affordance—no close button (X) visible, forcing user to tap 'Got it' even if they want to dismiss without confirming understanding.
- **Evidence:** Welcome modal occupies full-width with only a single green 'Got it' button at bottom; no close icon in top-right or overlay tap-to-dismiss behavior indicated.
- **Fix complexity:** small

**p1b-004** `clarity` · payday-savings-subscreen
- **Finding:** Behind modal, '$0 allocated' label is visible but its denominator (total to allocate, or total income for cycle?) is not shown in the visible portion—John cannot validate the claim without closing the modal first.
- **Evidence:** Background shows '$0' with context-only text cut off by modal; post-fix should show 'of $Y' but denominator is obscured.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item 4, Item 5

**p1b-001** `clarity` · payday-upcoming-subscreen
- **Finding:** Modal onboarding blocks the primary task (viewing/managing upcoming items) with a wall of text that must be dismissed before any interaction is possible.
- **Evidence:** Welcome to Payday Plan modal occupies full viewport with 5-point instructional list and single 'Got it' button; the empty upcoming list and add-item CTA are completely hidden behind it.
- **Fix complexity:** small

**p1b-003** `clarity` · payday-upcoming-subscreen
- **Finding:** The undo affordance mentioned in the modal ('Tap 🔄 in the header to undo your most recent change') is referenced but the header is not visible in the current viewport, leaving the user unable to immediately verify or locate this control.
- **Evidence:** Modal text states 'Mistake? Tap 🔄 in the header to undo your most recent change' but the header is obscured by the modal itself; user cannot see or locate the 🔄 button until after dismissing.
- **Fix complexity:** small

**p1b-001** `clarity` · payday-bills-subscreen
- **Finding:** Modal onboarding blocks access to the Bills sub-screen itself — user cannot see bill state, paid/unpaid toggles, or auto-debit badges until dismissing the modal.
- **Evidence:** Full-screen modal 'Welcome to Payday Plan' overlays the entire canvas; 'Got it' button is the only path forward. Background shows blurred 'Known upcoming' section but Bills list is completely hidden.
- **Fix complexity:** small

**p1b-003** `dead` · payday-bills-subscreen
- **Finding:** Empty state 'Add what you know is coming' with calendar icon is visible but the Bills sub-screen should already be populated with bills for this cycle (per onboarding step 1: 'See what's coming').
- **Evidence:** Modal says 'See what's coming (net pay + bonus)' as step 1; background shows 'SO · 0 of 0' counter and empty state with add prompt, suggesting either no bills exist OR the screen failed to hydrate before modal appeared.
- **Fix complexity:** medium

**p1b-001** `clarity` · plan-mode-wrx
- **Finding:** Welcome modal lacks dismissal clarity—'Got it' button is only affordance, no visible close/skip option, creating friction for returning users who see this repeatedly.
- **Evidence:** Modal dialog with single green 'Got it' button at bottom; no X close button, no outside-tap dismiss indicator, no 'don't show again' checkbox.
- **Fix complexity:** small

**p1b-003** `clarity` · plan-mode-wrx
- **Finding:** Step 5 language ('tick items as you handle them — real transactions fire and balance updates') is imprecise on causality: unclear whether ticking drives real transaction fire or reflects completed real transactions.
- **Evidence:** Ambiguous phrasing in step 5; 'tick items as you handle them' could mean user marks planned items, but 'real transactions fire' suggests system-initiated—creates risk John thinks manual tick *causes* bank posting vs. *records* it.
- **Fix complexity:** small

**p1b-001** `clarity` · settings-overview
- **Finding:** Modal dialog obscures the Settings page entirely, making it impossible to audit the actual settings layout or configuration rows that should be visible.
- **Evidence:** A 'Welcome to Payday Plan' modal overlay covers the full screen with instructional content. The Settings page underneath is completely hidden behind this modal.
- **Fix complexity:** small

**p1b-001** `clarity` · welcome-payday-plan-modal
- **Finding:** Modal instructions reference 'tap ⬆️ in the header' to undo, but no header is visible in the current view—creates ambiguity about where/how to access undo.
- **Evidence:** Text states 'Mistake? Tap ⬆️ in the header to undo your most recent change' but header is not shown in this modal context; user must infer where the button lives.
- **Fix complexity:** small

**p1b-002** `clarity` · payday-plan-onboarding-modal
- **Finding:** 'Mistake? Tap [icon] in the header to undo your most recent change' references a UI element (header icon) not visible in this modal, creating ambiguity about scope and discoverability.
- **Evidence:** Text at bottom of modal directs user to tap an icon in 'the header' but modal appears to be a full-screen overlay with its own header; unclear whether this refers to the app header behind the modal or a control within the modal itself.
- **Fix complexity:** small

### P2 (26)

**p1b-003** `density` · dashboard-hero
- **Finding:** Modal blocks access to underlying dashboard data during a reconciliation task; user cannot reference current balance or other context while deciding whether transaction occurred.
- **Evidence:** Modal is full-screen overlay; Virgin Money balance ($11.72) and any spend pace info behind it are completely obscured during the decision.
- **Fix complexity:** medium

**p1b-005** `clarity` · dashboard-hero
- **Finding:** 'Log the missing transaction now' uses domain jargon ('log') without context; user may not know if this opens a form, auto-adds the debit, or requires manual entry.
- **Evidence:** Green button (highest visual priority) has verb 'Log' but no indication of next UX state — whether it's a modal, form, or instant action.
- **Fix complexity:** small

**p1b-003** `density` · end-of-day-check-modal
- **Finding:** Modal title 'End of day check' is non-specific; a sleep-deprived user may not immediately understand what action is needed or why this is interrupting their flow.
- **Evidence:** 'End of day check' heading provides no context about whether this is a reconciliation prompt, a missing-transaction detection, or a routine balance verification.
- **Fix complexity:** small

**p1b-005** `consistency` · dashboard-virgin-money-balance
- **Finding:** Balance display shows '$11.72' but modal references a potential $17 debit; no real-time recalculation preview is shown, so John cannot see what balance would be if the transaction posted.
- **Evidence:** Top of screen shows Virgin Money balance at $11.72; modal presents $17 YouTube Premium charge from yesterday but no 'projected balance after this posts' warning or preview.
- **Fix complexity:** medium

**p1b-003** `density` · bills-tab-top
- **Finding:** Modal overlays the monthly Bills calendar view entirely; user cannot see the broader April 2026 context (other bills, distribution, payday alignment) while resolving the debit check.
- **Evidence:** Modal occupies full screen depth on top of calendar grid. For a 'daily-use' mobile-first consultant auditing daily cash position, inability to cross-reference the $17 charge against the month's overall payday/bill rhythm may force unnecessary context-switching.
- **Fix complexity:** medium

**p1b-004** `clarity` · bills-tab-top
- **Finding:** 'Mark as untracked — adjust balance' button labels action as a choice but provides no visibility into what 'adjust balance' means operationally (which balance, by how much, in which direction).
- **Evidence:** Button text is vague; John must guess whether selecting this removes the transaction from tracking, or just flags it as unreconciled. On a 4-hour sleep workday, this friction invites John to tap 'Accept & move on' reflexively rather than make intentional choice.
- **Fix complexity:** small

**p1b-003** `density` · analysis-tab-pivot
- **Finding:** Modal occupies 60% of screen with a single $17 transaction check; for a sleep-deprived consultant, the visual dominance may not match the severity of a routine scheduled debit verification.
- **Evidence:** White modal dialog centered on dark background with large whitespace; single line item (YouTube Premium $17) takes up minimal space relative to button array below.
- **Fix complexity:** small

**p1b-004** `dead` · analysis-tab-pivot
- **Finding:** Period selector buttons (Today / 7 Days / 30 Days / All time) appear behind the modal, visually inert, creating ambiguity about whether the analysis pivot data shown in the background is stale or applies to the current selection.
- **Evidence:** Top of screen shows time-period buttons (7 Days highlighted in green) but they are obscured by the modal overlay; unclear if John is reviewing data from the selected period or a different time window.
- **Fix complexity:** small

**p1b-002** `density` · analysis-tab-essentials
- **Finding:** Critical financial alert ('Projected to run out today') is relegated to lower visual weight beneath the modal, risking John missing a solvency warning while resolving the transaction check.
- **Evidence:** Red alert box with warning icon ('Projected to run out today (Wed, 20 May)') appears below the modal and underlying Analysis content; combined with modal overlay, the urgency signal is obscured by a non-blocking reconciliation task.
- **Fix complexity:** medium

**p1b-004** `semantic` · analysis-tab-essentials
- **Finding:** Modal states 'If they came out, update your balance' but does not explain the reconciliation pathway: does John update manually, or does selecting an action auto-correct the $586.24 total?
- **Evidence:** Modal text says 'Total: $17. If they came out, update your balance.' without stating whether the $586.24 total already includes or excludes this $17, or what the correct total should be post-action.
- **Fix complexity:** medium

**p1b-002** `density` · analysis-survival-forecast
- **Finding:** The modal interrupts the primary forecast view without context: user cannot see current balance or runout date while deciding how to handle the uncleared transaction, forcing them to close/reopen or rely on memory.
- **Evidence:** Modal is full-screen overlay that obscures the 'Current balance +$11.72' and unpaid bills summary visible behind it; forecast tile is completely hidden.
- **Fix complexity:** medium

**p1b-004** `consistency` · analysis-survival-forecast
- **Finding:** Modal references 'Yesterday (18/5)' but the main surface says 'today (Wed, 20 May)' — a 2-day gap that could indicate stale data or timezone/batch-processing lag that John should know about before deciding.
- **Evidence:** Modal header: 'Yesterday (18/5) these were scheduled to debit'; main tile header: 'Projected to run out today (Wed, 20 May)'. The 2-day discrepancy is not explained.
- **Fix complexity:** small

**p1b-002** `clarity` · plan-mode-root
- **Finding:** Button label 'Mark as untracked — adjust balance' conflates two distinct actions (marking + adjustment) in a single click; user cannot preview what balance adjustment will occur.
- **Evidence:** 'Mark as untracked — adjust balance' button (middle gray button) combines marking logic with balance mutation. No preview or confirmation of the adjustment amount before commit.
- **Fix complexity:** medium

**p1b-004** `density` · plan-mode-root
- **Finding:** Modal appears to be a reactive 'exception handler' for a missed debit rather than part of the primary plan workflow; disrupts plan-mode intent on entry.
- **Evidence:** Modal headline 'End of day check' and content ('Yesterday (18/5) these were scheduled to debit') suggest this is a catch-up/reconciliation dialog, not a dashboard state. Blocks plan-mode root from rendering beneath.
- **Fix complexity:** medium

**p1b-002** `density` · payday-plan-canvas
- **Finding:** Welcome modal contains 5 sequential numbered steps when John likely wants to see his current allocation state immediately on first visit to this canvas.
- **Evidence:** Steps 1–5 in modal body; step 5 references 'tick items as you handle them' but John cannot see the canvas to understand what that means until dismissing.
- **Fix complexity:** medium

**p1b-002** `density` · payday-savings-subscreen
- **Finding:** Onboarding modal consumes entire viewport for a list of 5 sequential steps that could be progressive disclosure or inline, delaying John's access to actual data entry on a mobile-first device where screen real estate is premium.
- **Evidence:** Modal with icon, heading, 5 numbered instructions, and single CTA takes ~70% of screen height; steps 4–5 are post-lock workflow (not pre-lock decision-making).
- **Fix complexity:** medium

**p1b-003** `semantic` · payday-savings-subscreen
- **Finding:** Step 3 in onboarding states 'remainder is yours to allocate — savings goals, upcoming purchases, extra debt payments' but does not clarify whether 'remainder' is the same as the 'still to split' shown in the header after dismissing this modal, risking cognitive friction on re-entry.
- **Evidence:** Modal describes abstract allocation logic; background shows '$0 allocated' which may contradict 'remainder is yours' if user previously made allocations.
- **Fix complexity:** small
- **Overlaps Phase 1A:** Item 4

**p1b-002** `density` · payday-upcoming-subscreen
- **Finding:** Onboarding modal mixes UI instruction (steps 1–4 on how to use the plan) with post-action behavior (step 5 about ticking items after locking), creating cognitive load for first-time use without clear separation of learn vs. do.
- **Evidence:** Steps 1–4 are setup/planning instructions; step 5 describes transaction lifecycle behavior unrelated to the immediate task of adding upcoming items.
- **Fix complexity:** medium

**p1b-002** `clarity` · payday-bills-subscreen
- **Finding:** Onboarding instructions reference 'tick items as you handle them' and 'real transactions fire' but do not explain what the Bills sub-screen *shows* — i.e., is this a forecast, a ledger, or a to-do list?
- **Evidence:** Steps 1–5 in modal describe workflow but never clarify whether bills here are due-soon, already auto-debited, or waiting for manual action.
- **Fix complexity:** small

**p1b-002** `density` · plan-mode-wrx
- **Finding:** Welcome modal lists 5 sequential steps as equal-weight instructions without visual hierarchy, forcing a tired user (John: 4hrs sleep avg) to parse all before understanding core value.
- **Evidence:** Steps 1–5 all plain text, no bolding of critical steps, no emoji/icon differentiation beyond initial handwave icon; step lengths vary (1-line to 3-line).
- **Fix complexity:** small

**p1b-002** `clarity` · settings-overview
- **Finding:** Modal contains 5 numbered steps without clear mapping to which Settings rows or UI elements they correspond, forcing users to dismiss and then hunt for where each step applies.
- **Evidence:** Steps 1–5 describe workflow (see what's coming, subtract essentials, allocate remainder, lock plan, tick items) but don't reference specific Settings UI elements by name (e.g., 'Payday frequency setting', 'Debt strategy dropdown').
- **Fix complexity:** medium

**p1b-003** `density` · settings-overview
- **Finding:** Onboarding modal appears on Settings page, not during initial app setup or in a dedicated Onboarding flow, suggesting either stale dismissal state or misplaced entry point.
- **Evidence:** 'Welcome to Payday Plan' modal is displayed on what should be a functional Settings overview page; no indication this is the user's first visit or that they have opted into help.
- **Fix complexity:** medium

**p1b-002** `density` · welcome-payday-plan-modal
- **Finding:** Five sequential numbered steps create cognitive load; steps 4–5 describe post-lock workflow (ticking items, balance updates) that are disconnected from the primary planning action, risking confusion about when/how to act.
- **Evidence:** Steps 1–3 describe the planning workflow; steps 4–5 pivot to transaction reconciliation—no visual separation or 'Later:' prefix to distinguish phases.
- **Fix complexity:** medium

**p1b-003** `clarity` · welcome-payday-plan-modal
- **Finding:** 'Got it' button is generic and does not signal what state John is entering (e.g., does it save a plan, dismiss the tutorial, or unlock editing?).
- **Evidence:** 'Got it' button label provides no verb or outcome clarity; user must guess whether dismissal launches the canvas or confirms understanding.
- **Fix complexity:** small

**p1b-001** `clarity` · payday-plan-onboarding-modal
- **Finding:** Modal presents 5-step methodology without clear indication of whether this is a one-time tutorial or persistent reference, risking John missing critical context on re-entry.
- **Evidence:** The 'Welcome to Payday Plan' modal (screenshot shows onboarding flow) lists 5 steps but no breadcrumb, step counter, or 'skip' option visible; unclear if this repeats on every session or appears once.
- **Fix complexity:** small

**p1b-003** `density` · payday-plan-onboarding-modal
- **Finding:** Modal combines procedural instruction (steps 1–5) with error-recovery guidance (undo note) in a single view, diluting focus on the primary action ('Got it') for a sleep-deprived user scanning quickly.
- **Evidence:** Instruction text occupies ~70% of modal, with undo/mistake guidance as a secondary paragraph at the bottom; no visual hierarchy (e.g., accent color, bold) distinguishes critical steps from optional recovery.
- **Fix complexity:** medium

### P3 (0)

_None._

## Per-surface results

### Dashboard — hero (balance + alerts)
- ID: `dashboard-hero`
- Screenshot: `docs/audit/_screenshots/dashboard-hero.png`
- Findings: 5
  - P1 clarity: Modal dialog appears without clear dismissal path — user must choose one of three actions or be trapped.
  - P1 consistency: Modal totals mismatch: 'Total: $17' stated but only one line item shown (YouTube Premium — $17); unclear if this is the complete list or if other debits are hidden.
  - P2 density: Modal blocks access to underlying dashboard data during a reconciliation task; user cannot reference current balance or other context while deciding whether transaction occurred.
  - P1 semantic: 'Mark as untracked — adjust balance' button label is passive and vague; unclear whether John controls the adjustment or if the system auto-corrects.
  - P2 clarity: 'Log the missing transaction now' uses domain jargon ('log') without context; user may not know if this opens a form, auto-adds the debit, or requires manual entry.

### Dashboard — MAX PER DAY + running pace tiles
- ID: `dashboard-scrolled-cards`
- Screenshot: `docs/audit/_screenshots/dashboard-scrolled-cards.png`
- Findings: 5
  - P1 clarity: Three action buttons present but visual hierarchy doesn't signal which is the 'safe' default path for a tired user who might tap quickly.
  - P1 semantic: Modal presents $17 YouTube Premium debit as a factual 'scheduled to debit' but offers no visibility into whether this is a recurring subscription renewal or one-time charge, leaving John uncertain whether to log or accept.
  - P2 density: Modal title 'End of day check' is non-specific; a sleep-deprived user may not immediately understand what action is needed or why this is interrupting their flow.
  - P1 clarity: 'Mark as untracked — adjust balance' button uses a dash-separated label that reads more like a description than an action verb, creating ambiguity about what 'adjust' means (reduce, increase, replace?).
  - P2 consistency: Balance display shows '$11.72' but modal references a potential $17 debit; no real-time recalculation preview is shown, so John cannot see what balance would be if the transaction posted.

### Bills tab — monthly view top
- ID: `bills-tab-top`
- Screenshot: `docs/audit/_screenshots/bills-tab-top.png`
- Findings: 4
  - P1 clarity: Modal presents three mutually-exclusive actions with unclear priority hierarchy; green CTA is 'Log missing transaction' but user's actual need (confirm debit happened or didn't) maps ambiguously across all three buttons.
  - P1 consistency: Modal states 'Yesterday (18/5) these were scheduled to debit' but does not indicate whether the $17 YouTube Premium charge actually cleared the account yet (pending vs. posted status).
  - P2 density: Modal overlays the monthly Bills calendar view entirely; user cannot see the broader April 2026 context (other bills, distribution, payday alignment) while resolving the debit check.
  - P2 clarity: 'Mark as untracked — adjust balance' button labels action as a choice but provides no visibility into what 'adjust balance' means operationally (which balance, by how much, in which direction).

### Analysis tab — spending pivot (top)
- ID: `analysis-tab-pivot`
- Screenshot: `docs/audit/_screenshots/analysis-tab-pivot.png`
- Findings: 4
  - P1 clarity: Modal dialog presents three mutually-exclusive actions (Log / Mark untracked / Accept & move on) without clear guidance on which John should choose based on his situation.
  - P1 semantic: Modal says 'If they came out, update your balance' but doesn't specify what 'update your balance' means—adjust manually, auto-reconcile, or something else.
  - P2 density: Modal occupies 60% of screen with a single $17 transaction check; for a sleep-deprived consultant, the visual dominance may not match the severity of a routine scheduled debit verification.
  - P2 dead: Period selector buttons (Today / 7 Days / 30 Days / All time) appear behind the modal, visually inert, creating ambiguity about whether the analysis pivot data shown in the background is stale or applies to the current selection.

### Analysis tab — Essential vs Discretionary card (POST-FIX from Item 3)
- ID: `analysis-tab-essentials`
- Screenshot: `docs/audit/_screenshots/analysis-tab-essentials.png`
- Findings: 4
  - P1 clarity: Modal dialog 'End of day check' visually dominates the Analysis tab content, making it unclear whether the user should act on the modal or dismiss it first to see the underlying Essential vs Discretionary card.
  - P2 density: Critical financial alert ('Projected to run out today') is relegated to lower visual weight beneath the modal, risking John missing a solvency warning while resolving the transaction check.
  - P1 clarity: 'Mark as untracked — adjust balance' button label is a compound action (mark AND adjust) without clarifying what 'adjust' means or what balance impact occurs.
  - P2 semantic: Modal states 'If they came out, update your balance' but does not explain the reconciliation pathway: does John update manually, or does selecting an action auto-correct the $586.24 total?

### Analysis tab — Survival Forecast
- ID: `analysis-survival-forecast`
- Screenshot: `docs/audit/_screenshots/analysis-survival-forecast.png`
- Findings: 4
  - P1 clarity: End of day check modal presents a transaction ($17 YouTube Premium) that may or may not have cleared, with three equally-weighted options, but no clear guidance on which action John should take first or what the consequences are.
  - P2 density: The modal interrupts the primary forecast view without context: user cannot see current balance or runout date while deciding how to handle the uncleared transaction, forcing them to close/reopen or rely on memory.
  - P1 semantic: Button label 'Log the missing transaction now' is ambiguous: unclear whether it means 'record this transaction' or 'immediately debit it' — for a sleep-deprived consultant, this could lead to double-logging or misunderstanding timing.
  - P2 consistency: Modal references 'Yesterday (18/5)' but the main surface says 'today (Wed, 20 May)' — a 2-day gap that could indicate stale data or timezone/batch-processing lag that John should know about before deciding.

### Plan mode — root dashboard (POST-FIX from Item 4)
- ID: `plan-mode-root`
- Screenshot: `docs/audit/_screenshots/plan-mode-root.png`
- Findings: 5
  - P1 clarity: End-of-day check modal blocks access to primary navigation and dashboard content; unclear whether dismissing it allows natural workflow or creates data-entry friction.
  - P2 clarity: Button label 'Mark as untracked — adjust balance' conflates two distinct actions (marking + adjustment) in a single click; user cannot preview what balance adjustment will occur.
  - P1 consistency: Modal states 'Total: $17. If they came out, update your balance' but does not show the current balance before or after the action; user cannot verify impact.
  - P2 density: Modal appears to be a reactive 'exception handler' for a missed debit rather than part of the primary plan workflow; disrupts plan-mode intent on entry.
  - P1 semantic: SECURITY/DATA: Modal references 'yesterday (18/5)' but current screenshot date context is not visible; if date has drifted, user may unknowingly log/mark transactions from the wrong day.

### Payday Plan canvas — REMAINDER tile
- ID: `payday-plan-canvas`
- Screenshot: `docs/audit/_screenshots/payday-plan-canvas.png`
- Findings: 3
  - P1 clarity: Welcome modal blocks access to the canvas data; no clear dismiss pattern beyond 'Got it' button, forcing interaction before John can assess his remainder allocation.
  - P2 density: Welcome modal contains 5 sequential numbered steps when John likely wants to see his current allocation state immediately on first visit to this canvas.
  - P1 clarity: Error icon (🔧) mentioned in step 4 of modal ('Tap 🔧 in the header to undo') is not visible in the canvas behind the modal, breaking the instructional reference.

### Payday — Savings sub-screen (POST-FIX from Item 4)
- ID: `payday-savings-subscreen`
- Screenshot: `docs/audit/_screenshots/payday-savings-subscreen.png`
- Findings: 4
  - P1 clarity: Modal dialog lacks visual escape affordance—no close button (X) visible, forcing user to tap 'Got it' even if they want to dismiss without confirming understanding.
  - P2 density: Onboarding modal consumes entire viewport for a list of 5 sequential steps that could be progressive disclosure or inline, delaying John's access to actual data entry on a mobile-first device where screen real estate is premium.
  - P2 semantic: Step 3 in onboarding states 'remainder is yours to allocate — savings goals, upcoming purchases, extra debt payments' but does not clarify whether 'remainder' is the same as the 'still to split' shown in the header after dismissing this modal, risking cognitive friction on re-entry.
  - P1 clarity: Behind modal, '$0 allocated' label is visible but its denominator (total to allocate, or total income for cycle?) is not shown in the visible portion—John cannot validate the claim without closing the modal first.

### Payday — Upcoming items sub-screen
- ID: `payday-upcoming-subscreen`
- Screenshot: `docs/audit/_screenshots/payday-upcoming-subscreen.png`
- Findings: 3
  - P1 clarity: Modal onboarding blocks the primary task (viewing/managing upcoming items) with a wall of text that must be dismissed before any interaction is possible.
  - P2 density: Onboarding modal mixes UI instruction (steps 1–4 on how to use the plan) with post-action behavior (step 5 about ticking items after locking), creating cognitive load for first-time use without clear separation of learn vs. do.
  - P1 clarity: The undo affordance mentioned in the modal ('Tap 🔄 in the header to undo your most recent change') is referenced but the header is not visible in the current viewport, leaving the user unable to immediately verify or locate this control.

### Payday — Bills sub-screen
- ID: `payday-bills-subscreen`
- Screenshot: `docs/audit/_screenshots/payday-bills-subscreen.png`
- Findings: 3
  - P1 clarity: Modal onboarding blocks access to the Bills sub-screen itself — user cannot see bill state, paid/unpaid toggles, or auto-debit badges until dismissing the modal.
  - P2 clarity: Onboarding instructions reference 'tick items as you handle them' and 'real transactions fire' but do not explain what the Bills sub-screen *shows* — i.e., is this a forecast, a ledger, or a to-do list?
  - P1 dead: Empty state 'Add what you know is coming' with calendar icon is visible but the Bills sub-screen should already be populated with bills for this cycle (per onboarding step 1: 'See what's coming').

### Plan mode — WRX card
- ID: `plan-mode-wrx`
- Screenshot: `docs/audit/_screenshots/plan-mode-wrx.png`
- Findings: 3
  - P1 clarity: Welcome modal lacks dismissal clarity—'Got it' button is only affordance, no visible close/skip option, creating friction for returning users who see this repeatedly.
  - P2 density: Welcome modal lists 5 sequential steps as equal-weight instructions without visual hierarchy, forcing a tired user (John: 4hrs sleep avg) to parse all before understanding core value.
  - P1 clarity: Step 5 language ('tick items as you handle them — real transactions fire and balance updates') is imprecise on causality: unclear whether ticking drives real transaction fire or reflects completed real transactions.

### Settings — overview
- ID: `settings-overview`
- Screenshot: `docs/audit/_screenshots/settings-overview.png`
- Findings: 3
  - P1 clarity: Modal dialog obscures the Settings page entirely, making it impossible to audit the actual settings layout or configuration rows that should be visible.
  - P2 clarity: Modal contains 5 numbered steps without clear mapping to which Settings rows or UI elements they correspond, forcing users to dismiss and then hunt for where each step applies.
  - P2 density: Onboarding modal appears on Settings page, not during initial app setup or in a dedicated Onboarding flow, suggesting either stale dismissal state or misplaced entry point.

### Settings — Diagnostics section
- ID: `settings-diagnostics`
- Screenshot: `docs/audit/_screenshots/settings-diagnostics.png`
- Findings: 3
  - P1 clarity: Modal instructions reference 'tap ⬆️ in the header' to undo, but no header is visible in the current view—creates ambiguity about where/how to access undo.
  - P2 density: Five sequential numbered steps create cognitive load; steps 4–5 describe post-lock workflow (ticking items, balance updates) that are disconnected from the primary planning action, risking confusion about when/how to act.
  - P2 clarity: 'Got it' button is generic and does not signal what state John is entering (e.g., does it save a plan, dismiss the tutorial, or unlock editing?).

### Settings — Data & Backup section
- ID: `settings-data-backup`
- Screenshot: `docs/audit/_screenshots/settings-data-backup.png`
- Findings: 3
  - P2 clarity: Modal presents 5-step methodology without clear indication of whether this is a one-time tutorial or persistent reference, risking John missing critical context on re-entry.
  - P1 clarity: 'Mistake? Tap [icon] in the header to undo your most recent change' references a UI element (header icon) not visible in this modal, creating ambiguity about scope and discoverability.
  - P2 density: Modal combines procedural instruction (steps 1–5) with error-recovery guidance (undo note) in a single view, diluting focus on the primary action ('Got it') for a sleep-deprived user scanning quickly.
