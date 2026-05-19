# Bundle 31 Phase 1B — Audit Diff (Run 1 vs Run 2)

**Date:** 2026-05-19  
**Purpose:** compare audit findings between Run 1 (stale fixture, $11.72 hero, paydayReceived=false, audit log at 281) and Run 2 (refreshed fixture, $1,113.61 hero, paydayReceived=true, audit log at 500) to separate fixture artifacts from real findings.

**Run 1 commit:** eb01778 (audit doc: `2026-05-19-bundle-31-full-walkthrough-audit-RUN-1.md`)  
**Run 2 commit:** this commit (audit doc: `2026-05-19-bundle-31-full-walkthrough-audit.md`)  
**Run 2 trace:** `docs/audit/2026-05-19T04-05-24-694Z-trace.jsonl` (15 calls, 37KB; api_response_id is null due to logging bug fixed in this same commit — token counts + cost + raw responses verifiable; Anthropic console cross-ref will work on the NEXT audit run)  

## Summary

| Metric | Run 1 | Run 2 | Delta |
|---|---|---|---|
| Total findings | 56 | 72 | +16 |
| P0 | 0 | 0 | 0 |
| P1 | 30 | 35 | +5 |
| P2 | 26 | 37 | +11 |
| P3 | 0 | 0 | 0 |

No P0 in either run. Real-state audit produced more findings (+16 total) across both P1 and P2 — consistent with "stale fixture masked some real UX gaps" hypothesis.

## Per-screen side-by-side

LLM phrasings differ between runs for the same underlying issue. Auto-classification of "Run 1 only / Run 2 only / both" is unreliable without manual matching. **Recommendation:** triage Run 2 findings as the actionable set (they reflect real state). Use Run 1 column as cross-check — if a Run 2 finding has no Run 1 echo, it may be a NEW issue exposed by refreshed state. If a Run 2 finding has a Run 1 echo, it is CONFIRMED real (both runs noticed it).

### `analysis-survival-forecast`

Run 1: 4 finding(s) · Run 2: 4 finding(s)

**Run 1 findings (stale-fixture state):**
- P1 `clarity` · End of day check modal presents a transaction ($17 YouTube Premium) that may or may not have cleared, with three equally-weighted options, but no clear guidance on which action John should take first or what the consequences are.
- P1 `semantic` · Button label 'Log the missing transaction now' is ambiguous: unclear whether it means 'record this transaction' or 'immediately debit it' — for a sleep-deprived consultant, this could lead to double-logging or misunderstanding timing.
- P2 `density` · The modal interrupts the primary forecast view without context: user cannot see current balance or runout date while deciding how to handle the uncleared transaction, forcing them to close/reopen or rely on memory.
- P2 `consistency` · Modal references 'Yesterday (18/5)' but the main surface says 'today (Wed, 20 May)' — a 2-day gap that could indicate stale data or timezone/batch-processing lag that John should know about before deciding.

**Run 2 findings (refreshed-fixture / real-state):**
- P1 `clarity` · Primary action button ('+ button' in green at bottom) has no visible label describing its function in this context.
- P1 `semantic` · 'Cycle plan locked - 4 bills totalling $4540' warning references pre-committed amounts, but does not clarify whether these are already deducted from the 'Current balance' figure displayed above.
- P2 `density` · 'What to cut instead of borrowing' section appears incomplete—only one suggestion ('Meal prep') with a savings figure shown, but heading suggests multiple alternatives should be listed.
- P2 `clarity` · Balance line item ('Current balance +$113.61') sits directly above unpaid bills section without visual separation, risking misreading as part of the bills list.

### `analysis-tab-essentials`

Run 1: 4 finding(s) · Run 2: 5 finding(s)

**Run 1 findings (stale-fixture state):**
- P1 `clarity` · Modal dialog 'End of day check' visually dominates the Analysis tab content, making it unclear whether the user should act on the modal or dismiss it first to see the underlying Essential vs Discretionary card.
- P1 `clarity` · 'Mark as untracked — adjust balance' button label is a compound action (mark AND adjust) without clarifying what 'adjust' means or what balance impact occurs.
- P2 `density` · Critical financial alert ('Projected to run out today') is relegated to lower visual weight beneath the modal, risking John missing a solvency warning while resolving the transaction check.
- P2 `semantic` · Modal states 'If they came out, update your balance' but does not explain the reconciliation pathway: does John update manually, or does selecting an action auto-correct the $586.24 total?

**Run 2 findings (refreshed-fixture / real-state):**
- P1 `semantic` · Essential vs Discretionary breakdown shown nowhere on this surface despite being in audit scope; only Fixed, Debt repayment, and Savings categories visible.
- P1 `consistency` · Total outflows ($8696.78) does not equal sum of visible category cards ($3194.00 + $1132.00 + $1098.00 = $5424.00); missing ~$3272.78 in visible breakdown.
- P1 `semantic` · 'Debt categories doubling up?' alert references $1,912 across 2 categories, but suggests editing transactions to consolidate — unclear whether app should auto-reconcile or if user action is required for trust.
- P2 `clarity` · Collapsible category cards lack visual affordance (no chevron/arrow icon visible) making expand/collapse interaction discoverable only by trial.
- P2 `density` · Per-day rates ($456.29/day, $101.71/day, $156.86/day) add noise without direct actionability; John on 4hr sleep won't parse whether these are warnings or context.

### `analysis-tab-pivot`

Run 1: 4 finding(s) · Run 2: 6 finding(s)

**Run 1 findings (stale-fixture state):**
- P1 `clarity` · Modal dialog presents three mutually-exclusive actions (Log / Mark untracked / Accept & move on) without clear guidance on which John should choose based on his situation.
- P1 `semantic` · Modal says 'If they came out, update your balance' but doesn't specify what 'update your balance' means—adjust manually, auto-reconcile, or something else.
- P2 `density` · Modal occupies 60% of screen with a single $17 transaction check; for a sleep-deprived consultant, the visual dominance may not match the severity of a routine scheduled debit verification.
- P2 `dead` · Period selector buttons (Today / 7 Days / 30 Days / All time) appear behind the modal, visually inert, creating ambiguity about whether the analysis pivot data shown in the background is stale or applies to the current selection.

**Run 2 findings (refreshed-fixture / real-state):**
- P1 `consistency` · Total outflows ($8696.78) does not equal sum of visible category spend ($3194 + $1132 + $1098 = $5424), creating a $3272.78 unexplained gap.
- P1 `clarity` · Debt categories doubling banner is present but does not make the recommended next action unambiguous for a tired user.
- P1 `semantic` · Transaction count labels ('2 txns', '4 txns', '2 txns') and percentages (36.7%, 13%, 12.6%) do not clarify what denominator or time window is used.
- P2 `density` · Daily pace figures ($456.29/day, $101.71/day, $156.86/day) compete visually with category totals without clear hierarchy or use case.
- P2 `clarity` · Collapse/expand toggles (downward chevrons) on category cards are visually subtle and may not signal interactivity to a sleep-deprived user.
- P2 `dead` · Screen appears to cut off below Savings category; partial visibility of a fourth item suggests hidden content not accessible from current scroll position.

### `bills-tab-top`

Run 1: 2 finding(s) · Run 2: 5 finding(s)

**Run 1 findings (stale-fixture state):**
- P2 `density` · Modal overlays the monthly Bills calendar view entirely; user cannot see the broader April 2026 context (other bills, distribution, payday alignment) while resolving the debit check.
- P2 `clarity` · 'Mark as untracked — adjust balance' button labels action as a choice but provides no visibility into what 'adjust balance' means operationally (which balance, by how much, in which direction).

**Run 2 findings (refreshed-fixture / real-state):**
- P1 `clarity` · The '+Add A Bill' button and 'BNPL' button are both visually prominent but only one (BNPL) appears actionable in this context; unclear which action John should take first.
- P1 `consistency` · BALANCE AFTER ($1,627.83) does not arithmetically reconcile with shown THIS WEEK total ($86) against stated payday timing ('27d to payday').
- P1 `semantic` · BNPL button is labeled as a noun (product category) not a verb, and its current state (selected? unselected?) is not visually distinct.
- P2 `density` · NW: +$9,398.91 (net worth delta) is displayed at bottom with equal visual prominence to 'MONTHLY BILLS $4,673', but context for the NW delta is missing—John won't know if that's good/bad or why.
- P2 `clarity` · The calendar navigation (< April 2026 >) is modal-year-only; user cannot see future months' bills at a glance despite the 27-day payday countdown implying multi-month planning relevance.

### `dashboard-hero`

Run 1: 5 finding(s) · Run 2: 6 finding(s)

**Run 1 findings (stale-fixture state):**
- P1 `clarity` · Modal dialog appears without clear dismissal path — user must choose one of three actions or be trapped.
- P1 `consistency` · Modal totals mismatch: 'Total: $17' stated but only one line item shown (YouTube Premium — $17); unclear if this is the complete list or if other debits are hidden.
- P1 `semantic` · 'Mark as untracked — adjust balance' button label is passive and vague; unclear whether John controls the adjustment or if the system auto-corrects.
- P2 `density` · Modal blocks access to underlying dashboard data during a reconciliation task; user cannot reference current balance or other context while deciding whether transaction occurred.
- P2 `clarity` · 'Log the missing transaction now' uses domain jargon ('log') without context; user may not know if this opens a form, auto-adds the debit, or requires manual entry.

**Run 2 findings (refreshed-fixture / real-state):**
- P1 `clarity` · UNLOCK button on Plan-locked state lacks affordance for what unlocking does or costs.
- P1 `consistency` · Liquid net worth (+$9,398.91) shown without cycle context; unclear if this is snapshot, start-of-cycle, or cumulative.
- P1 `clarity` · Property Deposit (via rent) shown under IMMEDIATE DEBTS with no link to or visibility of the rent obligation itself; appears orphaned.
- P2 `density` · $30/day cap + pace banner creates cognitive overload when read together: 'Running $28.94 over pace' + '$30 left today' + '27 days to payday' requires mental math to determine if he's in danger.
- P2 `semantic` · 'Nothing spent today - $5,002 this cycle' is contradictory framing: 'nothing' + large number creates whiplash without clarity on whether $5K is good/bad/expected.
- P2 `dead` · Immediate Debts 'Auto-sort' button visible but no context on what sorting options exist or current sort order.

### `dashboard-scrolled-cards`

Run 1: 0 finding(s) · Run 2: 5 finding(s)

**Run 1 findings (stale-fixture state):**
_(none)_

**Run 2 findings (refreshed-fixture / real-state):**
- P1 `clarity` · MAX PER DAY $30.00 cap is stated as active, but 'Running $28.94 over pace this week' suggests cumulative overage across multiple days, creating ambiguity about whether the cap is enforced daily or is a soft advisory.
- P1 `consistency` · Liquid net worth shown as '+$9,398.91' on main balance, but Property Deposit (immediate debt) is listed as '$5,681' with note 'NW: +$9,398.91' — unclear if the deposit has already been subtracted from the displayed $1,113.61 Virgin Money balance or if it's a separate liability.
- P2 `clarity` · '$30 left today' on Property Deposit card is ambiguous — unclear whether this is remaining budget, remaining balance on the deposit, or time-based countdown.
- P2 `semantic` · '$5,002 this cycle' under 'Nothing spent today' is contradicted by the Property Deposit amount ($5,681) and running-over-pace warning, creating doubt about cycle boundary or spend categorization.
- P2 `density` · MAX PER DAY card includes both a hard cap statement and a secondary 'surplus goes to debt' explanation, competing for attention when the primary action (spend wisely) should dominate.

### `dashboard-virgin-money-balance`

Run 1: 1 finding(s) · Run 2: 0 finding(s)

**Run 1 findings (stale-fixture state):**
- P2 `consistency` · Balance display shows '$11.72' but modal references a potential $17 debit; no real-time recalculation preview is shown, so John cannot see what balance would be if the transaction posted.

**Run 2 findings (refreshed-fixture / real-state):**
_(none)_

### `end-of-day-check-modal`

Run 1: 6 finding(s) · Run 2: 0 finding(s)

**Run 1 findings (stale-fixture state):**
- P1 `clarity` · Three action buttons present but visual hierarchy doesn't signal which is the 'safe' default path for a tired user who might tap quickly.
- P1 `semantic` · Modal presents $17 YouTube Premium debit as a factual 'scheduled to debit' but offers no visibility into whether this is a recurring subscription renewal or one-time charge, leaving John uncertain whether to log or accept.
- P1 `clarity` · 'Mark as untracked — adjust balance' button uses a dash-separated label that reads more like a description than an action verb, creating ambiguity about what 'adjust' means (reduce, increase, replace?).
- P1 `clarity` · Modal presents three mutually-exclusive actions with unclear priority hierarchy; green CTA is 'Log missing transaction' but user's actual need (confirm debit happened or didn't) maps ambiguously across all three buttons.
- P1 `consistency` · Modal states 'Yesterday (18/5) these were scheduled to debit' but does not indicate whether the $17 YouTube Premium charge actually cleared the account yet (pending vs. posted status).
- P2 `density` · Modal title 'End of day check' is non-specific; a sleep-deprived user may not immediately understand what action is needed or why this is interrupting their flow.

**Run 2 findings (refreshed-fixture / real-state):**
_(none)_

### `known-upcoming`

Run 1: 0 finding(s) · Run 2: 1 finding(s)

**Run 1 findings (stale-fixture state):**
_(none)_

**Run 2 findings (refreshed-fixture / real-state):**
- P2 `density` · Modal overlay obscures 67% of the 'Known upcoming' list while onboarding; a sleep-deprived user may dismiss the modal without registering the items visible beneath.

### `known-upcoming-items`

Run 1: 0 finding(s) · Run 2: 2 finding(s)

**Run 1 findings (stale-fixture state):**
_(none)_

**Run 2 findings (refreshed-fixture / real-state):**
- P1 `dead` · The 'MARK AS BOUGHT' button on Fancy Dinner ($150, 'No date') and Haircut ($80, 'No date') is actionable but semantically incorrect—items with no scheduled date should not offer purchase-confirmation until a date is set, risking John marking bought items he hasn't actually transacted.
- P2 `consistency` · Total shown as '$333 · 3 of 5' but visible items (Fancy Dinner $150 + Haircut $80) sum to $230, leaving $103 unaccounted for and unclear which 2 of the 5 items are hidden or off-screen.

### `payday-bills-subscreen`

Run 1: 3 finding(s) · Run 2: 5 finding(s)

**Run 1 findings (stale-fixture state):**
- P1 `clarity` · Modal onboarding blocks access to the Bills sub-screen itself — user cannot see bill state, paid/unpaid toggles, or auto-debit badges until dismissing the modal.
- P1 `dead` · Empty state 'Add what you know is coming' with calendar icon is visible but the Bills sub-screen should already be populated with bills for this cycle (per onboarding step 1: 'See what's coming').
- P2 `clarity` · Onboarding instructions reference 'tick items as you handle them' and 'real transactions fire' but do not explain what the Bills sub-screen *shows* — i.e., is this a forecast, a ledger, or a to-do list?

**Run 2 findings (refreshed-fixture / real-state):**
- P1 `clarity` · Modal dialog ('Welcome to Payday Plan') blocks access to the bills list John needs to interact with, creating friction on a screen designed for quick daily decision-making.
- P1 `consistency` · Total ($333) claims to be '3 of 5' items, but only 2 items are visible on screen (Fancy Dinner + Haircut), suggesting a rendering or scrolling issue or the count is stale.
- P2 `clarity` · CTA button 'Got it' uses low-action verb ('got it' = acknowledgment) rather than imperative verb matching the modal's purpose (e.g., 'Start planning' or 'Close').
- P2 `density` · Instructional modal (steps 1–5) is dense with planning narrative that may not be timely for a user in daily-use mode (4hrs sleep, mobile-first, task-driven); steps 4–5 conflate 'locking' and 'ticking' in a way that could confuse the ticking workflow visible behind the modal.
- P2 `clarity` · 'No date' label on both Fancy Dinner and Haircut items provides no actionable signal — unclear whether this means 'date not set,' 'date unknown,' or 'this is a recurring item with flexible timing.'

### `payday-plan-canvas`

Run 1: 3 finding(s) · Run 2: 5 finding(s)

**Run 1 findings (stale-fixture state):**
- P1 `clarity` · Welcome modal blocks access to the canvas data; no clear dismiss pattern beyond 'Got it' button, forcing interaction before John can assess his remainder allocation.
- P1 `clarity` · Error icon (🔧) mentioned in step 4 of modal ('Tap 🔧 in the header to undo') is not visible in the canvas behind the modal, breaking the instructional reference.
- P2 `density` · Welcome modal contains 5 sequential numbered steps when John likely wants to see his current allocation state immediately on first visit to this canvas.

**Run 2 findings (refreshed-fixture / real-state):**
- P1 `clarity` · Modal instruction step 5 describes transaction-time ticking behavior ('tick items as you handle them') but doesn't clarify whether this is retroactive (user manually ticks after payment) or prospective (auto-tick on payment detection), creating ambiguity about workflow.
- P1 `consistency` · Visible canvas behind modal shows 'Total essentials: $6,853' but modal step 2 states 'Subtract essentials (bills + debts + daily living)' without confirming whether 'daily living' tile ($930) is already included in that $6,853 total or is a separate add; if separate, visual total becomes ambiguous.
- P2 `density` · Welcome modal occupies full screen on a canvas John is actively trying to use (Payday Plan is live, locked state visible behind modal), forcing read-through before returning to task; modal lacks 'skip' or 'dismiss' option for returning users.
- P2 `clarity` · 'YOUR FREE MONEY THIS CYCLE' tile label uses 'free' but this is actually 'allocatable remainder after essentials'—word choice could mislead a sleep-deprived user into thinking this is discretionary surplus rather than constrained allocation pool.
- P2 `dead` · Modal welcome text references 'Mistake? Tap ↩️ in the header to undo your most recent change' but this undo affordance is not visible in the current canvas header (only back arrow and locked-state icon visible); user cannot verify affordance exists before dismissing modal.

### `payday-plan-modal`

Run 1: 0 finding(s) · Run 2: 3 finding(s)

**Run 1 findings (stale-fixture state):**
_(none)_

**Run 2 findings (refreshed-fixture / real-state):**
- P1 `clarity` · Modal onboarding language uses passive construction ('The remainder is yours') that obscures the actual planning workflow John must execute.
- P1 `clarity` · Step 5 ('After locking, tick items as you handle them') introduces a second transactional interaction model ('tick items') distinct from the primary plan-lock-allocate flow, creating ambiguity about whether 'handling' items is the same as 'allocating' in Step 3.
- P2 `dead` · Modal presents 5 sequential steps but shows a primary call-to-action ('Got it') that dismisses all guidance without confirming understanding or offering a guided walkthrough.

### `payday-plan-onboarding-modal`

Run 1: 3 finding(s) · Run 2: 2 finding(s)

**Run 1 findings (stale-fixture state):**
- P1 `clarity` · 'Mistake? Tap [icon] in the header to undo your most recent change' references a UI element (header icon) not visible in this modal, creating ambiguity about scope and discoverability.
- P2 `clarity` · Modal presents 5-step methodology without clear indication of whether this is a one-time tutorial or persistent reference, risking John missing critical context on re-entry.
- P2 `density` · Modal combines procedural instruction (steps 1–5) with error-recovery guidance (undo note) in a single view, diluting focus on the primary action ('Got it') for a sleep-deprived user scanning quickly.

**Run 2 findings (refreshed-fixture / real-state):**
- P1 `clarity` · Modal instruction step 5 describes post-lock workflow ('tick items as you handle them') but doesn't clarify that locking the plan STOPS real-time balance updates until unlock, creating ambiguity about when John should expect live data refresh.
- P2 `clarity` · Onboarding modal uses 'net pay + bonus' in step 1 without clarifying whether bonus is optional, recurring, or one-time—critical for John's monthly plan ceiling math.

### `payday-savings-subscreen`

Run 1: 4 finding(s) · Run 2: 5 finding(s)

**Run 1 findings (stale-fixture state):**
- P1 `clarity` · Modal dialog lacks visual escape affordance—no close button (X) visible, forcing user to tap 'Got it' even if they want to dismiss without confirming understanding.
- P1 `clarity` · Behind modal, '$0 allocated' label is visible but its denominator (total to allocate, or total income for cycle?) is not shown in the visible portion—John cannot validate the claim without closing the modal first.
- P2 `density` · Onboarding modal consumes entire viewport for a list of 5 sequential steps that could be progressive disclosure or inline, delaying John's access to actual data entry on a mobile-first device where screen real estate is premium.
- P2 `semantic` · Step 3 in onboarding states 'remainder is yours to allocate — savings goals, upcoming purchases, extra debt payments' but does not clarify whether 'remainder' is the same as the 'still to split' shown in the header after dismissing this modal, risking cognitive friction on re-entry.

**Run 2 findings (refreshed-fixture / real-state):**
- P1 `clarity` · Modal dialog 'Welcome to Payday Plan' blocks access to savings allocation data; unclear if this is first-time UX or persistent interruption.
- P1 `clarity` · 'Got it' button alone does not indicate whether modal will reappear; no checkbox for 'Don't show again' or indication of permanence.
- P2 `density` · Modal includes 5 sequential steps with inline formatting noise ($, +, −, —) that increases cognitive load for a sleep-deprived user scanning for next action.
- P2 `consistency` · Modal step 4 says 'Lock the plan when you're happy' but John cannot see the lock UI or current plan state while modal is open; messaging is forward-looking but evidence is blocked.
- P2 `dead` · Darwin Trip card visible below modal appears partially rendered or cut off; unclear if it is interactive or a rendering artifact.

### `payday-upcoming-subscreen`

Run 1: 3 finding(s) · Run 2: 4 finding(s)

**Run 1 findings (stale-fixture state):**
- P1 `clarity` · Modal onboarding blocks the primary task (viewing/managing upcoming items) with a wall of text that must be dismissed before any interaction is possible.
- P1 `clarity` · The undo affordance mentioned in the modal ('Tap 🔄 in the header to undo your most recent change') is referenced but the header is not visible in the current viewport, leaving the user unable to immediately verify or locate this control.
- P2 `density` · Onboarding modal mixes UI instruction (steps 1–4 on how to use the plan) with post-action behavior (step 5 about ticking items after locking), creating cognitive load for first-time use without clear separation of learn vs. do.

**Run 2 findings (refreshed-fixture / real-state):**
- P1 `clarity` · Modal dialog blocks interaction with underlying list; user cannot act on upcoming items while onboarding tooltip is displayed.
- P2 `clarity` · 'MARK AS BOUGHT' button appears below Haircut but visual alignment suggests it may apply to the entire list rather than the single item.
- P2 `density` · Onboarding modal contains 5 sequential steps that may overload a sleep-deprived user trying to quickly scan the feature; step numbering could discourage engagement.
- P2 `clarity` · Undo affordance mentioned in modal ('tap ↩️ in the header') is not visible on current screen, creating a mismatch between instruction and available UI.

### `plan-mode-root`

Run 1: 5 finding(s) · Run 2: 6 finding(s)

**Run 1 findings (stale-fixture state):**
- P1 `clarity` · End-of-day check modal blocks access to primary navigation and dashboard content; unclear whether dismissing it allows natural workflow or creates data-entry friction.
- P1 `consistency` · Modal states 'Total: $17. If they came out, update your balance' but does not show the current balance before or after the action; user cannot verify impact.
- P1 `semantic` · SECURITY/DATA: Modal references 'yesterday (18/5)' but current screenshot date context is not visible; if date has drifted, user may unknowingly log/mark transactions from the wrong day.
- P2 `clarity` · Button label 'Mark as untracked — adjust balance' conflates two distinct actions (marking + adjustment) in a single click; user cannot preview what balance adjustment will occur.
- P2 `density` · Modal appears to be a reactive 'exception handler' for a missed debit rather than part of the primary plan workflow; disrupts plan-mode intent on entry.

**Run 2 findings (refreshed-fixture / real-state):**
- P1 `clarity` · Settings button in top-right corner has no visual affordance (no icon, no button styling) — appears as plain text link, easily missed by fast-scanning user.
- P1 `semantic` · SECURITY: 'AI Assistant' settings tile shows 'API key, usage, costs' — if this screen displays actual API key values, PII/auth credential exposure risk.
- P1 `dead` · Settings page is displayed but no actual plan-mode tiles (renderAllocateTile, WRX card, trip/goal cards) are visible — user is shown Settings menu instead of Plan root dashboard, violating stated surface description.
- P2 `density` · Six settings tiles visible on settings page (Financial Data, Strategies, Notifications, AI Assistant, Data & Backup, Diagnostics) — none are grayed, disabled, or indicate prerequisite setup, creating ambiguity about which are critical for John's immediate workflow.
- P2 `clarity` · Bottom nav buttons (Dashboard, Bills, Chat, Analysis) are all icon-only with no labels visible; '+' center button is unlabeled — John at 4hrs sleep may tap wrong button or be unsure of center button purpose.
- P2 `consistency` · Bottom-left corner shows 'NW: +$9,398.91' and '$30 left today' and '27d to payday' — no clear visual separation or hierarchy; unclear which is primary, which is secondary, or if they're all current/accurate.

### `plan-mode-wrx`

Run 1: 3 finding(s) · Run 2: 5 finding(s)

**Run 1 findings (stale-fixture state):**
- P1 `clarity` · Welcome modal lacks dismissal clarity—'Got it' button is only affordance, no visible close/skip option, creating friction for returning users who see this repeatedly.
- P1 `clarity` · Step 5 language ('tick items as you handle them — real transactions fire and balance updates') is imprecise on causality: unclear whether ticking drives real transaction fire or reflects completed real transactions.
- P2 `density` · Welcome modal lists 5 sequential steps as equal-weight instructions without visual hierarchy, forcing a tired user (John: 4hrs sleep avg) to parse all before understanding core value.

**Run 2 findings (refreshed-fixture / real-state):**
- P1 `clarity` · Welcome modal blocks interaction with the plan canvas; no indication of how to dismiss or whether this is mandatory first-time setup vs. persistent help.
- P1 `clarity` · Behind the modal, 'MARK AS BOUGHT' buttons are visible but unreachable; unclear whether the modal is modal-blocking or merely overlay.
- P1 `clarity` · 'Mistake?' affordance in modal references a button in the header, but the button is not visible in the current screenshot — user cannot verify it exists or know how to locate it.
- P2 `density` · Welcome modal contains 5 sequential numbered steps but no visual hierarchy or progressive disclosure — all steps equally weighted and static.
- P2 `semantic` · Step 3 conflates 'savings goals' and 'upcoming purchases' as equivalent allocations, but in the item list below, 'Fancy Dinner' ($150) is shown without a savings/goal label — ambiguous which bucket it belongs to.

### `settings-overview`

Run 1: 3 finding(s) · Run 2: 3 finding(s)

**Run 1 findings (stale-fixture state):**
- P1 `clarity` · Modal dialog obscures the Settings page entirely, making it impossible to audit the actual settings layout or configuration rows that should be visible.
- P2 `clarity` · Modal contains 5 numbered steps without clear mapping to which Settings rows or UI elements they correspond, forcing users to dismiss and then hunt for where each step applies.
- P2 `density` · Onboarding modal appears on Settings page, not during initial app setup or in a dedicated Onboarding flow, suggesting either stale dismissal state or misplaced entry point.

**Run 2 findings (refreshed-fixture / real-state):**
- P1 `clarity` · Modal overlay obscures the Settings page content entirely, making it impossible to audit the actual settings interface that should be visible.
- P1 `dead` · Modal 'Got it' button appears to close the welcome dialog, but no mechanism is shown to re-open Settings configuration rows or navigate away from this modal state.
- P2 `clarity` · Modal contains instructional content (5-step onboarding) presented as if this is John's first encounter with Payday Plan, but he is an active user with 3-of-5 upcoming items already logged.

### `welcome-payday-plan-modal`

Run 1: 3 finding(s) · Run 2: 0 finding(s)

**Run 1 findings (stale-fixture state):**
- P1 `clarity` · Modal instructions reference 'tap ⬆️ in the header' to undo, but no header is visible in the current view—creates ambiguity about where/how to access undo.
- P2 `density` · Five sequential numbered steps create cognitive load; steps 4–5 describe post-lock workflow (ticking items, balance updates) that are disconnected from the primary planning action, risking confusion about when/how to act.
- P2 `clarity` · 'Got it' button is generic and does not signal what state John is entering (e.g., does it save a plan, dismiss the tutorial, or unlock editing?).

**Run 2 findings (refreshed-fixture / real-state):**
_(none)_

## Triage actions

Per session discipline (Bundle 32 = fresh judgment for prioritisation): treat Run 2 as the authoritative actionable set. Do not fix Phase 1B findings this session beyond the 5 already committed (da904c2, 2fd28ff, 17481ff, 9d956c0, ca71d6e). Bundle 32 kickoff will triage Run 2 findings into P0/P1/P2/P3 backlog with fresh judgment.

Run 1 report retained (`-RUN-1.md`) for the historical "what stale fixture produced" diagnostic record. Not actionable.
