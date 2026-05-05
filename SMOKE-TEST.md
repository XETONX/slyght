# SLYGHT — SMOKE TEST CHECKLIST

A flat list of every interactive feature and behavioral guarantee 
the app is supposed to provide. Walked manually before every push 
that touches user-facing surface area. Items marked 🔴 are known 
broken as of 2026-05-05; items marked ⚠️ are degraded/uncertain; 
items marked ✓ are believed working but should still be checked.

**Use:** Before pushing, walk the relevant section(s) on phone or 
in headless render. Each ❌ found becomes either a fix-this-commit 
item or a documented regression with a follow-up mission.

**Scope:** Production app at xetonx.github.io/slyght and local dev 
at C:\Users\admin\slyght\index.html.

---

## DASHBOARD (NOW)

### Balance + headline
- [ ] Balance number displays and matches localStorage S.balance
- [ ] "Spent today" displays correct value and matches sum of 
      today's S.txns excluding `_isCorrection` and `_isRoundup`
- [ ] "Spent today" tile is tappable and shows breakdown by 
      category for today
- [ ] "$X this cycle" sub-line equals sum of cycle.txns 
      (excluding corrections and round-ups) — must NOT exceed 
      S.income for the cycle 🔴 (showing $9,950 vs income $7,282)
- [ ] "11 days to payday" counter is correct relative to today's 
      date and S.payday
- [ ] Liquid net worth shows liquidNet (NOT net inclusive of 
      super) per 7351f9e architecture
- [ ] "Liquid net worth · tap for full picture" is actually 
      tappable and opens a breakdown modal

### Header buttons / icons
- [ ] PLAN button visible, tappable, navigates to Plan Mode
- [ ] Camera/scan icon visible — taps open scan/upload flow 🔴 
      (scanning screenshot and uploading files needs to work)
- [ ] Notifications bell shows accurate unread count 🔴 (button 
      pressable, can clear notifications)
- [ ] Notifications panel: each notification can be individually 
      cleared
- [ ] Notifications panel: "clear all" works
- [ ] History/cycle icon (the curved arrow) opens cycle history 
      or whatever it's bound to
- [ ] Weather widget renders or fails silently — never crashes 
      the dashboard
- [ ] Settings tab accessible in desktop and mobile site ✓ (Bundle A — added Settings nav-btn)

### CRITICAL / survival mode banner
- [ ] Fires only when balance < threshold AND days-to-payday > 
      configured minimum
- [ ] "Maximum: $X/day to survive" matches MathInvariants math 
      ⚠️ (currently shows $0/day with $99 balance and 11 days 
      remaining — math is wrong)
- [ ] Banner tappable opens detail / explanation
- [ ] Dismissible for the session (not permanently)

### Spending alerts
- [ ] "Spending alert. At this rate you will not cover bills" 
      fires only when CURRENT pace (not stale data) projects 
      under-funded payday 🔴 (firing today with $0 spend)
- [ ] "Bills won't clear. You're -$X short" matches survival 
      forecast bottom-line number — must agree across tiles
- [ ] Tone is informational not shaming
- [ ] Tappable to detail / suggestion

### "This Week" tile
- [ ] Total amount = sum of category chips
- [ ] Category chips render with correct totals
- [ ] "$X/day · Budget $Y/day · over/under pace" calculation 
      uses today's actual elapsed days (not 0 days) ✓ (Bundle A — Mondays now show "today")
- [ ] City2Surf countdown displays
- [ ] Tile tappable to drill into category-detail (analysis tab 
      pivot)

### "Tight — X hits tomorrow" warning
- [ ] Only fires when bill X is unpaid AND due tomorrow ✓ (Bundle A — uses actual debt name + days-out)
- [ ] Auto-clears when bill marked paid
- [ ] Warning text matches the actual upcoming bill

### Immediate Debts tile
- [ ] Existing debts render with name, amount, due date, % bar
- [ ] "+ Add Debt" button visible AND opens debt creation form 🔴
- [ ] New debt persists across page reload
- [ ] Auto-sort toggle changes order based on due date / amount 🔴
- [ ] Marking a debt paid moves it out of immediate-debts list
- [ ] Round-trip edit-and-save preserves all fields
- [ ] Auto-sort updating any other messages that advise to pay 
      debts (consistency across tiles)
- [ ] When auto-sort changes, related dashboard alerts re-evaluate

### Recent Spending
- [ ] Last N transactions display, newest first
- [ ] Round-up entries flagged distinctly (not as red debit) ✓ (Bundle A — 🏦 badge + +$X.XX format)
- [ ] Correction entries flagged distinctly (✎ or similar)
- [ ] Tapping a transaction opens edit/delete UI
- [ ] Editing persists; deletion removes from S.txns and 
      adjusts S.balance correctly
- [ ] Date column shows relative time ("today, 11:16am" / 
      "yesterday") not raw "03/5 11:16"

### Quick log (+ button)
- [ ] + button opens transaction logger
- [ ] Form has amount, category, note, optional date-time
- [ ] Submitting persists to S.txns and updates balance
- [ ] Cancel discards correctly

### Footer / persistent bottom strip
- [ ] NW: $X matches calculateNetWorth().liquidNet
- [ ] "$X today" matches dashboard "Spent today"
- [ ] "Nd to payday" matches header counter
- [ ] All values agree across header and footer

---

## BILLS TAB

### Calendar
- [ ] Current month renders with day grid
- [ ] Bills appear on correct days with amount label
- [ ] Today's date highlighted
- [ ] Bill colors: paid = green, unpaid = red, multiple = amber
- [ ] Multi-bill days marked with "Multiple" indicator
- [ ] Previous/next month navigation works
- [ ] Tapping a day with bills opens day-detail modal 🔴 (clicking 
      individual days for breakdown of that day's bill)
- [ ] Day-detail shows each bill with "Pay now" / "Already paid" 
      / "Skip this month" / "Cancel" buttons
- [ ] Variable expenses (Fuel, etc.) have a "Cancel" button so 
      user can dismiss without paying or adjusting balance 🔴
- [ ] "Pay now" creates a transaction and marks bill paid for 
      this month
- [ ] "Already paid" marks bill paid without creating txn (for 
      bills paid by direct debit etc.)
- [ ] Tappable into next-month days from current month view 
      (BACKLOG #7)

### "This Week" section
- [ ] Bills for current week (Mon-Sun, or based on cycle?) listed 
      with date, amount, category, paid status
- [ ] Each row shows linking transaction when paid (verify it's 
      actually paid this week, not from prior period) 🔴
- [ ] Totals at top match sum of unpaid bills in section
- [ ] Tappable rows expand to show full bill detail + linked txn 
      🔴 (breakdown to show linking transaction to verify paid)
- [ ] "Real balance after bills" calculation is correct
- [ ] "Due Today" if exists is tappable to a day breakdown 🔴

### Dynamic Week Projection
- [ ] "Spent so far: $X (Y days)" shows correct elapsed days from 
      cycle start (NOT 0 days when cycle has been running) ✓ (Bundle A — Mondays show "today", 1 day vs N days handled)
- [ ] Bills remaining = sum of unpaid bills for the week
- [ ] Projected daily × days = week total — math reconciles
- [ ] "Running $X under/over pace" tone is informational

### Monthly Bills
- [ ] All monthly bills listed with day-of-month, name, amount
- [ ] Paid bills moved to "Paid this month ✓ (N)" collapsible 
      section
- [ ] N matches actual count of paid:true bills in current month 🔴
- [ ] Monthly Total (Unpaid) = sum of bills.filter(b => 
      !b.paidThisMonth).amount 🔴 (currently disagreeing with 
      "paid this month" count)
- [ ] Each row shows linked debit transaction when paid — and 
      ensures the transaction is from THIS month not bleeding 
      from prior month 🔴
- [ ] Breakdown calculation visible/tappable to flag 
      discrepancies 🔴

### Cycle boundary handling
- [ ] When current date crosses payday, paid bills from previous 
      month reset to unpaid for the new month 🔴 (database 
      time/date awareness — months move over and bills don't 
      re-charge)
- [ ] paidBills filter month-aware per c800400 — verify still 
      correct
- [ ] Annual/quarterly bills (if any) only mark paid in months 
      they actually charge

### Add A Bill
- [ ] "+ Add A Bill" button visible
- [ ] Form covers name, amount, frequency (monthly/weekly/etc.), 
      day-of-month, category
- [ ] Submitting persists to S.bills (or wherever)
- [ ] Persists across reload
- [ ] BACKLOG #15: placement of the button

### Expected Extra Income
- [ ] Should NOT be on Bills tab (per John — belongs in Plan 
      Mode) ✓ (Bundle A — moved to Plan Mode below allocation cascade)

---

## ANALYSIS TAB

### "Projected to run out" / Survival Forecast card
- [ ] Run-out date math correct: balance / min-living-cost-per-day
- [ ] Run-out date is editable / tappable for what-if scenarios 🔴
- [ ] Breakdown to payday shows: current balance, unpaid bills 
      (with each itemized), upcoming debts (itemized), min living 
      costs (days × $/day from history)
- [ ] "Min living costs" $/day from history matches actual 
      computeAvgDailySpend() over recent period
- [ ] "Remaining at payday" = balance - bills - debts - living
- [ ] If remaining is positive, the survival card downgrades from 
      red to amber/info

### "If you need to borrow" tile
- [ ] Minimum borrow = max(0, |remainingAtPayday|) 🔴 (currently 
      showing $3,650 when reality is closer to $400-650)
- [ ] Borrow calculation factors in that payday is coming AND 
      expected extra income from Plan Mode 🔴
- [ ] Recommended amount rounded to nearest 50
- [ ] "With $X borrowed daily budget = $Y/day" math correct
- [ ] Warning text discourages borrowing
- [ ] Suggestion list of cuts ("no takeaway, no subscriptions, no 
      discretionary") is contextual, not generic

### "Where your money went" / Spending pivot
- [ ] Time range toggle: Today / 7 days / 30 days / All time 🔴
- [ ] Category list with totals, sorted descending
- [ ] Total of categories = total discretionary spend in period 🔴
- [ ] Subcategories expand on tap (e.g., Food → Coffee, Takeaway, 
      Groceries) 🔴
- [ ] Each row shows # transactions and average per transaction
- [ ] Tapping a category drills into transaction list for that 
      category in that period

### "What to cut" suggestions
- [ ] Suggestions correct given current state — calculations valid 
      🔴 (e.g., "groceries $100" suggested when user has only $20)
- [ ] Each suggestion has an "execute" or "set target" action 🔴
- [ ] Suggestions are based on actual spending patterns, not 
      generic templates
- [ ] Disabled / hidden when balance > comfortable threshold

### Time Machine
- [ ] State Snapshots list renders (canonical home is now Settings 
      per 7351f9e — verify Analysis card was deleted)
- [ ] Should NOT appear on Analysis tab anymore

### Verify deletions from 3c9b684 stayed deleted
- [ ] No SLYGHT Score tile
- [ ] No Spending DNA tile
- [ ] No 90-day forecast tile
- [ ] No Worst 5 vs Baseline tile
- [ ] No duplicate Spending-by-Category tile (the canonical 
      interactive pivot at top is the only one)
- [ ] No duplicate "$X due this week" tile
- [ ] Character Score simplified to no-spend-evening only (or 
      removed entirely — verify against latest)

### Verify architecture moves from 7351f9e
- [ ] No Goals tab content here (Plan Mode owns goals)
- [ ] No Financial Progress tile here
- [ ] No Income Received tile here
- [ ] No Emergency Fund tile here

---

## PLAN MODE

(Note: Allocation Playground v1 not yet shipped — verify current 
Plan Mode against pre-playground design.)

### Net Worth header
- [ ] Headline shows liquidNet (NOT total net inclusive of super)
- [ ] Sub-label clarifies what's included
- [ ] WRX tease line shows projected net after KIA payoff if WRX 
      is unsold
- [ ] "See Breakdown" tappable, opens detail modal showing all 
      asset/debt categories with super clearly labeled long-term

### Locked / non-negotiable section
- [ ] Renders with rent, KIA, provisions itemized
- [ ] Tappable / expandable per 4a8cfba — verify still working
- [ ] Total matches sum of items
- [ ] Editable repayment fee from 4a8cfba persists across reload

### Discretionary / payday allocation
- [ ] Sliders render with current values
- [ ] Sliders draggable, snap to reasonable increments
- [ ] Affordability warning fires when allocations exceed available
- [ ] Affordability calc considers behavioral spending
- [ ] Daily $/day display updates live as sliders move

### Bonus preview / Income simulator
- [ ] "Expected bonus" input accepts amounts
- [ ] Preview block appears with allocation projection
- [ ] $8K bonus fires preview correctly (per audit — currently 
      threshold may be too narrow) ✓ (Bundle A — threshold widened: amt≥1500 with cat=Income)
- [ ] China Holiday goal value updates with bonus allocation
- [ ] Reset clears the preview

### Goals section
- [ ] Goal cards render: Property Deposit, Freedom Buffer, etc.
- [ ] China appears exactly once (in Trips section, not 
      duplicated as Goal Card per 7351f9e)
- [ ] Each card shows current vs target, % bar, ETA
- [ ] Tappable to edit
- [ ] ETA recalculates from current allocation pace

### Trips section
- [ ] China Holiday card renders with date
- [ ] Other trips if any render
- [ ] Allocatable from playground (when shipped)

### Lock plan button
- [ ] Visible, tappable
- [ ] Opens confirmation popup before locking ✓ (Bundle A — unconditional confirm() before locking)
- [ ] Lock persists state to S.paydayPlan or similar
- [ ] Locked state visually indicated
- [ ] Unlocking has small friction but is possible

### Modal / popup containment
- [ ] When breakdown popup opens, underlying page scroll is 
      locked
- [ ] Backdrop / dim background visible
- [ ] Popup has clear border/edge
- [ ] BACKLOG #45

---

## CHAT TAB

### Message persistence
- [ ] Messages persist within a session 🔴 (cache messages after a 
      day to keep interaction)
- [ ] Messages persist across page reloads
- [ ] Long-conversation history remains accessible (cache after 
      a day)

### Sending messages
- [ ] Input area visible and not blocked by other UI 🔴 (Net Worth 
      bar must not block chat)
- [ ] Send button or enter-key sends
- [ ] User's message appears immediately
- [ ] AI response streams in or appears on completion
- [ ] Errors shown to user clearly

### Visibility
- [ ] Messages shown to user directly without needing to scroll 
      for the latest 🔴
- [ ] Auto-scroll to bottom on new message
- [ ] Older messages accessible by scrolling up

### Clear chat
- [ ] Clear chat button visible 🔴
- [ ] Confirmation before clearing
- [ ] Actually clears the history (functionality works) 🔴

### API key handling
- [ ] API key entered in Settings persists across sessions
- [ ] API key NOT stripped during deployments 🔴
- [ ] Missing API key produces clear error message, not silent 
      failure

### Context
- [ ] Chat has access to current financial state (balance, bills, 
      debts, recent spending) 
- [ ] Chat references actual data not generic answers
- [ ] open_plan / chat actions fire correctly when AI invokes

---

## SETTINGS TAB

### Top "📊 My Financial Data" panel
- [ ] Income field editable
- [ ] WRX value editable  
- [ ] Mum balance editable
- [ ] Super balance editable
- [ ] Edits persist across reload
- [ ] Export / Import / Snapshot buttons present
- [ ] Each button does what its label says (BACKLOG #38 — clarify 
      what "Export Claude Code" does)

### Income / Payday section (lower form)
- [ ] Payday day-of-month editable
- [ ] Weekday budget editable
- [ ] Weekend budget editable
- [ ] Saves persist (saveSettings still works after 7351f9e — 
      since #5 was deferred, both income inputs still exist; 
      verify both still save)

### Debts section
- [ ] All debt fields editable
- [ ] Debt strategy selector (avalanche/snowball/etc) works

### Bills section
- [ ] Bills editable from Settings (currently dual-edit with Bills 
      tab — BACKLOG #39)
- [ ] Edits persist
- [ ] Add bill from here works

### Savings section
- [ ] Emergency Fund dynamic 90-day calc visible (canonical home 
      after 7351f9e)
- [ ] Round-up toggle visible
- [ ] Round-up indicator shows what's been rounded up recently 
      🔴 (BACKLOG #37)

### State Snapshots
- [ ] Shows past snapshots with restore buttons
- [ ] Each snapshot has timestamp, label
- [ ] Restore actually restores state (with confirmation)
- [ ] List collapsible (BACKLOG #40 — show last 5 expandable)

### Activity Log / Data Health Check
- [ ] Activity log shows recent app events
- [ ] Failures (CONSISTENCY_FAIL etc) actually logged as failures 
      ✓ (Bundle A — CONSISTENCY_FAIL now forces ok:false in AUDITOR.record)
- [ ] Auto-clear to clean state when no recent errors (BACKLOG 
      #44)

### PIN / Security
- [ ] PIN can be set
- [ ] PIN required on app open (if enabled)
- [ ] PIN reset flow works

---

## TRANSACTION LOGGER (the + flow)

- [ ] Amount input numeric
- [ ] Category selector with all categories
- [ ] Note field free text
- [ ] Date defaults to today, editable
- [ ] Time defaults to now, editable
- [ ] Default category based on time-of-day (BACKLOG #7 — 
      morning=coffee, etc.)
- [ ] Submit creates txn in S.txns with correct fields
- [ ] Submit updates S.balance
- [ ] Submit closes the modal
- [ ] Cancel discards without saving
- [ ] Round-up if enabled creates a SECOND transaction with 
      `_isRoundup: true` and links to a savings bucket 🔴

---

## SAVINGS BUCKETS

- [ ] Each bucket shows name, current, target, % bar
- [ ] Round-up auto-deposits go to designated bucket
- [ ] Round-up entries in bucket history match `_isRoundup` 
      transactions
- [ ] Manual deposit/withdraw works
- [ ] Bucket totals included in liquidNet calculation
- [ ] China bucket round-ups visible somewhere 🔴 (currently 
      $0.43/week silently accumulating)

---

## NOTIFICATIONS / SMART PUSH

(Backend-side, harder to smoke-test on client. But:)

- [ ] Notification permission flow works (on-demand request)
- [ ] In-app notifications cell readable / not cut off (BACKLOG 
      #36) ✓ (Bundle A — text-wrap CSS: white-space:normal, word-wrap)
- [ ] In-app notifications dismissible
- [ ] Push notifications actually arriving (BACKLOG #43) 🔴 — 
      verify against Cloudflare Worker logs

---

## CROSS-CUTTING / GLOBAL

### Date and time awareness
- [ ] App correctly identifies "today" using device date
- [ ] Cycle boundary detection works (when payday hits, cycle 
      rolls over) 🔴
- [ ] Bills don't double-charge across month boundary 🔴
- [ ] "Days into cycle" / "days to payday" math correct

### Math reconciliation across tiles
- [ ] Footer NW = Header net worth = Plan Mode net worth
- [ ] Footer "$X today" = Dashboard "Spent today"
- [ ] Bills "Real balance after bills" = Survival forecast 
      "Remaining at payday" (when scoped to same period)
- [ ] Survival forecast min-living matches Analysis "Where your 
      money went" 30-day average
- [ ] Liquid net worth on dashboard = Plan Mode net worth header

### Persistence / state integrity
- [ ] localStorage saves on every state mutation
- [ ] Hard refresh restores correct state
- [ ] Corrupted state recovers gracefully (or surfaces clearly)
- [ ] State migrations from older versions don't break

### Performance
- [ ] App opens in < 3 seconds on phone
- [ ] No console errors on initial load
- [ ] No console errors on tab switching
- [ ] No errors when adding/editing transactions

### Mobile-specific
- [ ] All text legible on phone-width viewport
- [ ] All buttons tappable (44px+ minimum)
- [ ] No horizontal scroll
- [ ] Modals fit screen, dismissible
- [ ] PWA install banner appears on first visit (or per user 
      gesture)

### Desktop-specific
- [ ] Layout doesn't break above 1200px
- [ ] Settings accessible (mentioned 🔴)
- [ ] All mobile features available on desktop

### Accessibility (light pass)
- [ ] Color is not sole indicator of state (red/green also have 
      icons or labels)
- [ ] Keyboard navigation reaches all interactive elements (for 
      desktop)

---

## REGRESSION-CRITICAL — DO NOT BREAK

These are the load-bearing fixes shipped in prior commits. Any 
push must verify these still work:

### From 56896d8 (TDZ resilience)
- [ ] App boots without "PLAN is not defined" or similar TDZ 
      errors
- [ ] Initial render completes even if some data is missing

### From c800400 (paidBills month-aware)
- [ ] Marking a bill paid on May 1 (Teachers Health) shows it 
      paid for May
- [ ] In June, Teachers Health re-appears as unpaid for June 🔴 
      (verify month rollover)

### From 5c6e219 (misleading-math fixes)
- [ ] Dashboard "Spent today" matches Analysis "Spent today"
- [ ] No category filter mismatch between tiles

### From 4a8cfba (Plan Mode what-if)
- [ ] Locked tile expandable
- [ ] Bonus preview fires
- [ ] Editable repayment fee persists
- [ ] Slider affordability warnings fire

### From 3c9b684 (tile cleanup)
- [ ] Deleted tiles remain deleted (verify against above 
      Analysis section)

### From 7351f9e (architecture)
- [ ] Time Machine in Settings, not Analysis
- [ ] No Goals tab content in Analysis
- [ ] China Holiday in Trips section only
- [ ] Both income inputs still save (#5 deferred)

---

## PROCESS NOTES

**When this checklist gets walked:**
- Before every push that modifies user-facing surface area
- After completing a mission, before declaring shipped
- Periodically (weekly) to catch silent regressions

**How to walk it:**
- Don't try to walk every item every push — walk the SECTIONS 
  affected by the change, plus REGRESSION-CRITICAL always
- Use phone for full mobile pass
- Use headless render for fast pass when smoke-render.js exists
- Check state in dev tools for math reconciliation

**When something fails:**
- Mark with date and 🔴 in this file
- Decide: fix this commit, or ship as known-broken with 
  follow-up mission
- Never silently leave a regression unflagged

**This file is LIVING:**
- Add items when new features ship
- Add items when bugs surface (so we don't miss them again)
- Remove items when features are deliberately deprecated
- John adds items when he notices things he uses that aren't 
  listed
