# SLYGHT Full System Audit — All Workstreams

AGENT 1 — PRINCIPAL ARCHITECT:
Perform a complete audit of the data architecture.

Map every field in the S object and answer:
- What is this field? What does it store?
- Where is it written? (which functions mutate it)
- Where is it read? (which functions consume it)
- Is it included in save()? In load()? In export?
- Does it ever get stale or out of sync?
- Is there a corresponding field elsewhere that should match it?

Specifically audit these known problem areas:
1. S.paidBills — what is the key format? Who reads it? Who writes it?
   Does getBillsDue() actually check it? Does renderBillsGrouped() check it?
   Does renderCalendar() check it? Does renderCalWeekSummary() check it?
   Does getGenuineSurplus() check it? Does getMaxDay() check it?
   FIND EVERY PLACE THAT ITERATES BILLS AND DOES NOT CHECK paidBills

2. S.debts[].paid — who reads it? 
   Does getActiveDebtsDueBeforePayday() check it?
   Does getNetWorth() check it?
   Does NOTIFY.generate() check it?
   Does the payday allocation plan check it?
   FIND EVERY PLACE THAT ITERATES DEBTS AND DOES NOT CHECK .paid

3. S.paydayReceived — find every projection or calculation that adds S.income
   without first checking S.paydayReceived === false
   
4. Fortnightly bills — does getExpandedBills() correctly generate BOTH occurrences?
   Does the second occurrence check paidBills independently?
   Can you mark one fortnightly payment paid without marking the other?

5. S.bal vs getLiveBal() — are there ANY places that still use S.bal directly
   in a calculation instead of getLiveBal()?

Produce: A complete field map of S object, and a list of every data inconsistency found.

AGENT 2 — LEAD ENGINEER:
Audit the complete calculation spider network.

For each canonical function trace EVERY caller:
- getLiveBal(): list every function that calls it
- getGenuineSurplus(): list every function that calls it — are they all consistent?
- getMaxDay(): list every function that calls it
- getBillsDue(): list every function that calls it — does each one use the result correctly?
- getExpandedBills(): list every function that calls it
- getActiveDebtsDueBeforePayday(): list every function that calls it
- getDailyBudget(): list every function that calls it
- getDynamicBuffer(): list every function that calls it
- daysLeft(): list every function that calls it

Then audit edge cases:
- What happens on April 30th (last day before payday on May 15)?
- What happens on May 1st (first day of new month)?
- What happens when ALL immediate debts are paid?
- What happens when ALL bills are marked paid?
- What happens when balance is exactly $0?
- What happens when surplus is exactly $0?
- What happens when the user has no transactions at all?
- What happens when daysLeft() returns exactly 1?
- What happens when a fortnightly bill falls on the same day as payday?
- What happens when two bills are due on the same day?
- What happens when all savings buckets are full?

For each edge case: what is the actual result? What should it be? Is there a bug?

Produce: Complete function call graph, edge case results table, list of bugs found.

AGENT 3 — QA LEAD:
Write and execute a complete test script for every user journey.

TEST SUITE 1 — HAPPY PATH:
Journey 1: New month starts (1st of month)
- paydayReceived resets to false ✓/✗
- paidBills resets ✓/✗
- Bills all show as unpaid ✓/✗
- Countdown to payday shows correctly ✓/✗
- Surplus shows negative (not yet paid) ✓/✗

Journey 2: Payday arrives (15th of month)
- User logs salary as income ✓/✗
- paydayReceived flips to true ✓/✗
- All payday countdown suppressed ✓/✗
- Payday plan auto-expands ✓/✗
- Surplus recalculates ✓/✗
- Safe/Day updates ✓/✗

Journey 3: User pays a bill
- Mark bill as paid ✓/✗
- Bill disappears from "Due Today" ✓/✗
- Bill disappears from "This Week" breakdown ✓/✗
- Bill disappears from "Monthly Summary" unpaid section ✓/✗
- getGenuineSurplus() increases ✓/✗
- getMaxDay() increases ✓/✗
- getBillsDue() total decreases ✓/✗
- Calendar dot removed for that date ✓/✗
- No notification fires for that bill ✓/✗

Journey 4: User clears a debt
- Mark debt as cleared ✓/✗
- S.bal decreases by debt amount ✓/✗
- Transaction logged in S.txns ✓/✗
- Debt disappears from tiles ✓/✗
- getActiveDebtsDueBeforePayday() decreases ✓/✗
- getGenuineSurplus() increases ✓/✗
- Notification for that debt removed ✓/✗
- Net worth improves ✓/✗
- Celebration animation shows ✓/✗

Journey 5: User logs a transaction
- S.bal decreases ✓/✗
- Transaction appears in history ✓/✗
- Safe/Day updates immediately ✓/✗
- TODAY metric updates ✓/✗
- Analysis tab category totals update ✓/✗
- If over daily budget: overspend warning shows ✓/✗
- Auto bill matching runs ✓/✗

TEST SUITE 2 — EDGE CASES:
- Log transaction same amount as a bill → does auto-match fire? ✓/✗
- Mark fortnightly car loan paid → does only this month's occurrence disappear? ✓/✗
- Set rent to non-recurring → does it vanish from ALL calculations immediately? ✓/✗
- Scan a document → does confidence < 0.75 show warning? ✓/✗
- Import data → are existing transactions preserved? ✓/✗
- Reset app → does API key survive if user chose to keep it? ✓/✗
- Open on February 28 → do all calculations use correct days? ✓/✗

TEST SUITE 3 — REGRESSION:
For every fix we've made this week, verify it still works:
- PIN hashed not plaintext ✓/✗
- API key not in export ✓/✗
- CC minimum recalculated in predictor loop ✓/✗
- viaRent debt excluded from net worth ✓/✗
- Paid debt notifications suppressed ✓/✗
- showToast() works everywhere ✓/✗
- getGenuineSurplus() includes debtsDue ✓/✗
- daysLeft() uses paydayReceived ✓/✗

Produce: Complete test results with ✓/✗ for every test, list of failing tests.

AGENT 4 — UX DESIGN LEAD:
Redesign the dashboard information hierarchy.

Current dashboard problems:
- Too many data points competing for attention
- Safe/Day at $6.97 is important but visually same weight as less important info
- "Over by $819 today" alarm is stale — those were debt payments not overspending
- SLYGHT Score showing before more important operational info
- Notifications panel broken positioning
- No clear "what do I do right now" answer

Redesign dashboard to answer these questions in order of importance:
1. What is my balance right now? (hero — already good)
2. How much can I spend today safely? (must be prominent, not buried)
3. Do I have any urgent actions needed today? (bills due, debts overdue)
4. How am I tracking this month? (secondary info)
5. What is my financial health trend? (tertiary — SLYGHT score etc)

Propose specific layout changes:
- What to remove from dashboard entirely
- What to make more prominent  
- What to collapse by default
- What to add that is missing
- How "Over by X today" should be smarter (exclude debt repayments from overspend)

Also fix: "Over by $819 today" should exclude debt repayments.
The daily budget overspend calculation must only count DISCRETIONARY spending.
Debt repayments of $1,705 should never trigger "over by" alert.
Fix getTodayDiscretionarySpend() to exclude: Debt repayment, Income, Savings, Bills, Transfer, Loan categories.
Wire this corrected figure to the "Over by" alert.
Wire this corrected figure to the TODAY metric tile.

AGENT 5 — BILLS DOMAIN EXPERT:
This is the most broken area. Fix everything.

THE CORE PROBLEM:
Paid bills are appearing in calculations because the paidBills check is inconsistent.

AUDIT every single function that touches bills:
1. getBillsDue() — does it filter paidBills? Show exact code.
2. getExpandedBills() — does it filter paidBills? Should it?
3. renderBillsGrouped() "Due Today" section — does it filter paidBills?
4. renderBillsGrouped() "This Week" section — does it filter paidBills?
5. renderBillsGrouped() Monthly table — does it filter paidBills?
6. renderCalWeekSummary() "This Week" breakdown — does it filter paidBills?
7. renderCalendar() dot rendering — does it remove dots for paid bills?
8. calDayClick() day panel — does it exclude paid bills from the list?
9. Payday allocation plan — does it exclude paid bills?
10. getDynamicBuffer() — does it exclude paid bills?

THE FIX:
Create ONE authoritative function:

function isThisMonthlyBillPaid(billName, billDay) {
  const key1 = new Date().getFullYear() + '-' + (new Date().getMonth()+1) + '-' + billName + '-' + billDay;
  const key2 = new Date().getFullYear() + '-' + (new Date().getMonth()+1) + '-' + billName;
  return S.paidBills[key1] === true || S.paidBills[key2] === true;
}

Apply this function in EVERY place that currently checks paidBills OR should check paidBills but doesn't.

SPECIFIC BUG — Car loan showing on April 16th:
Car Loan — Firstmac has paidBills key '2026-4-Car Loan — Firstmac-16' = true
When user selects April 16th in calendar, calDayClick() shows bills for that day.
It must check isThisMonthlyBillPaid('Car Loan — Firstmac', 16) and exclude it.
Fix calDayClick() to filter paid bills from the day panel list.

SPECIFIC BUG — Rent $3000 showing as charging today:
Rent has paidBills key '2026-4-Rent-15' = true
Any display of Rent as "due" or "charging" must check paidBills first.
Fix every place that shows Rent as a current obligation.

SPECIFIC BUG — This Week tile showing paid bills:
renderCalWeekSummary() computes weekTotal from bills in the next 7 days.
It must exclude any bill where isThisMonthlyBillPaid() returns true.
Fix the weekTotal calculation and the bill list displayed in This Week.

AGENT 6 — DEBT DOMAIN EXPERT:
Audit the complete debt calculation pipeline.

Map every debt field and verify:
- d.paid: does every calculation that should exclude paid debts actually do so?
- d.viaRent: is this correctly excluded from surplus AND net worth AND notifications?
- d.priority: is priority sort consistent between surplus suggestion and payday plan?
- d.rate: is interest calculated correctly for CC (19.99%)?
- d.monthlyPayment: is this displayed on the tile? Is it factored into projections?
- d.delayDate: are delayed debts correctly excluded from "due now" calculations?

Audit getActiveDebtsDueBeforePayday():
- Does it correctly include CC overdue? Pet Insurance? 
- Does it correctly exclude Afterpay (paid), Michael (paid), WRX debts (paid)?
- Does it correctly exclude Owed to Mum (viaRent)?
- What is the current calculated value? Is it correct?

Audit the surplus suggestion:
- Which debt is currently suggested as priority target?
- Is this correct given the user's debt list?
- Does changing debtStrategy setting actually change the suggestion?

Audit the payday plan:
- Does it show the correct debts in correct priority order?
- Does it exclude paid debts?
- Does it show Owed to Mum as "via rent — already counted"?
- Is the running balance calculation correct?

Fix all bugs found.

AGENT 7 — SECURITY AND DATA ARCHITECT:
Audit complete data integrity and monitoring accuracy.

MONITORING ACCURACY AUDIT:
The UX monitor should validate data accuracy not just count taps.
Extend UX.checks to include:

function validateScreenData() {
  const issues = [];
  const currentTab = getCurrentTab();
  
  if (currentTab === 'pg-bills') {
    // Check: no paid bills showing as due
    const paidShowingAsDue = Array.from(document.querySelectorAll('.bill-row'))
      .filter(row => {
        const billName = row.querySelector('.bill-name')?.textContent;
        const isPaid = row.querySelector('.paid-badge');
        const showingAsDue = !row.classList.contains('paid-bill');
        if (billName && !isPaid && showingAsDue) {
          const bill = BILLS.find(b => b.name === billName);
          if (bill && isThisMonthlyBillPaid(bill.name, bill.day)) {
            issues.push('Paid bill showing as due: ' + billName);
          }
        }
      });
  }
  
  if (currentTab === 'pg-dash') {
    // Check: over by alert excludes debt repayments
    const todayDiscretionary = getTodayDiscretionarySpend();
    const overByEl = document.querySelector('[id*="overspend"]');
    if (overByEl && overByEl.textContent.includes('Over by')) {
      const displayedAmt = parseFloat(overByEl.textContent.match(/\$[\d,]+/)?.[0]?.replace(/[$,]/g,'') || 0);
      const expectedOverBy = Math.max(0, todayDiscretionary - getDailyBudget());
      if (Math.abs(displayedAmt - expectedOverBy) > 1) {
        issues.push('Over by amount includes debt repayments — should show $' + expectedOverBy.toFixed(2) + ' not $' + displayedAmt.toFixed(2));
      }
    }
  }
  
  return issues;
}

Call validateScreenData() in the heartbeat tick.
Log any issues found to AUDITOR.

DATA INTEGRITY:
- Verify S.paidBills keys are consistent format across all writers
- Verify getExpandedBills() generated bills have same name format as BILLS array entries
  (fortnightly-generated bills must have exact same name for paidBills key matching)
- Verify import/export cycle is truly lossless — export then import then compare
- Add S.paidBills to the HEALTH.check() validation

AGENT 8 — COMPETITOR ANALYST:
Benchmark SLYGHT against YNAB, Frollo, and Pocketbook.

For each competitor audit:
YNAB:
- "Give every dollar a job" — does SLYGHT have equivalent? (savings buckets partial)
- Monthly budget reset — does SLYGHT reset correctly on 1st?
- Age of money metric — does SLYGHT have equivalent?
- Debt payoff feature — how does YNAB's compare to SLYGHT's?
- What YNAB has that SLYGHT should add

Frollo (Australian):
- Open banking/CDR feed — SLYGHT requires manual entry
- Transaction categorisation — Frollo auto-categorises from bank descriptions
- Goals feature — compare to SLYGHT savings buckets
- Insights — compare to SLYGHT analysis tab
- Bill tracking — compare to SLYGHT bills tab
- What Frollo has that SLYGHT should add

Pocketbook (Australian):
- Automatic transaction import — SLYGHT manual only
- Spending trends — compare to SLYGHT analysis
- Bill reminders — compare to SLYGHT notifications
- Budget alerts — compare to SLYGHT warnings
- What Pocketbook has that SLYGHT should add

For each gap identified: is it a quick add, medium effort, or major feature?
Prioritise the top 5 gaps that would most improve SLYGHT's daily usefulness.

AGENT 9 — FIELD EXPERT / SUPERUSER:
Test the app as a real person managing real money under stress.

Simulate these real scenarios:

SCENARIO 1 — Payday chaos (15th of month):
You just got paid. You're in a rush. You open SLYGHT.
- Does it tell you what to do immediately without reading anything?
- Is the payday plan obvious and actionable?
- Can you mark each payment as done with one tap?
- Does the balance update correctly after each tap?
- Does anything confuse you or require explanation?

SCENARIO 2 — "Can I afford this?" (mid-month):
You're at a shop. You want to buy something for $150.
- How many taps to get an answer?
- Is the answer clearly yes or no?
- Does it account for upcoming bills?
- Does it account for debts due?
- Would you trust this answer with real money?

SCENARIO 3 — End of month survival (12th of month):
$1,500 in account, $300 in bills due before payday.
- Does the dashboard correctly show you're in survival mode?
- Does it give you specific actionable advice?
- Does it tell you exactly what you can spend per day?
- Does it warn you about specific upcoming bills?

SCENARIO 4 — Just paid a debt (any time):
You just transferred $550 to Michael.
- How do you record this in SLYGHT?
- Does the balance update correctly?
- Does the debt tile disappear?
- Does the surplus change correctly?
- Is the whole flow under 30 seconds?

SCENARIO 5 — Received a bill in the mail:
You get a parking fine for $180 due in 14 days.
- Can you scan it? Does the scan work?
- Does it auto-populate the details correctly?
- Does it factor into your surplus immediately?
- Does it appear on the correct date in the calendar?

For each scenario: rate ease of use 1-10, list friction points, suggest improvements.

AGENT 10 — INTEGRATION CONSULTANT:
Verify every system talks to every other system correctly.

Map the complete integration web:
For every user action, verify the cascade of updates:

ACTION: User marks a bill as paid
Should trigger:
→ S.paidBills[key] = true
→ getBillsDue() result decreases
→ getGenuineSurplus() increases
→ getMaxDay() increases
→ getDynamicBuffer() recalculates
→ renderBillsGrouped() removes bill from Due Today/This Week
→ renderCalWeekSummary() updates projected balance
→ renderCalendar() removes dot from that date
→ calDayClick() panel excludes that bill
→ NOTIFY notification for that bill removed
→ Dashboard surplus tile updates
→ Dashboard Safe/Day tile updates
→ Payday plan excludes that bill
→ Monthly position card updates
→ renderAll() called

Verify ALL of these actually happen. Find any that are missing.

ACTION: User logs a transaction
Should trigger:
→ S.bal decreases (or increases if income)
→ S.txns entry appended
→ getLiveBal() returns new value
→ getAvgDailySpend() recalculates
→ getGenuineSurplus() recalculates
→ getMaxDay() recalculates
→ Dashboard balance hero updates
→ Dashboard Safe/Day updates
→ Dashboard TODAY metric updates
→ Dashboard surplus updates
→ Over by alert recalculates (discretionary only)
→ Analysis tab category totals update
→ autoMatchBillsToTxns() runs
→ AUDITOR records mutation
→ SNAPSHOTS.autoSnapshot() called
→ save() called
→ renderAll() called

Verify ALL of these actually happen. Find any that are missing.

ACTION: User marks a debt as cleared
→ S.bal decreases by debt.amt
→ S.txns entry appended with Debt repayment category
→ S.debts[idx].paid = true
→ getActiveDebtsDueBeforePayday() decreases
→ getGenuineSurplus() increases
→ getMaxDay() increases
→ getNetWorth() improves
→ Debt tile disappears from dashboard
→ Surplus suggestion updates to next priority debt
→ Payday plan updates
→ NOTIFY removes debt notification
→ Celebration animation shows
→ AUDITOR records mutation
→ SNAPSHOTS.autoSnapshot() called
→ save() called
→ renderAll() called

Verify ALL of these actually happen. Find any missing.

QUEEN — PROGRAMME DIRECTOR:
After all 10 agents complete their audits and fixes:

1. PROGRAMME STATUS REPORT:
For each agent: what they found, what they fixed, what remains outstanding

2. MASTER DEFECT LOG:
All bugs found across all agents, severity rated, fixed/outstanding status

3. INTEGRATION VERIFICATION:
Confirm every system talks correctly to every other system

4. READINESS ASSESSMENT:
Rate each area: Not Ready / Needs Work / Ready for UAT / Production Ready
- Dashboard
- Bills Tab
- Debt System
- Transactions
- Scanner
- Chat AI
- Notifications
- Analysis
- Settings
- Monitoring/Guardians
- Data Integrity
- Security

5. GO/NO-GO DECISION:
Is SLYGHT ready for daily production use?
What are the 5 remaining blockers if any?

6. PRODUCTION READINESS CHECKLIST:
[ ] No false information displayed anywhere
[ ] All paid bills excluded from all calculations
[ ] All paid debts excluded from all calculations
[ ] Dashboard answers "what do I do now" in 5 seconds
[ ] Every number traces to one canonical function
[ ] No contradicting numbers between screens
[ ] Guardian suite 100% passing
[ ] No JS errors in activity log during normal use
[ ] Export/import cycle lossless
[ ] Scanner adds items correctly
[ ] Chat AI reasoning correct
[ ] Notifications accurate and relevant

Run node guardian-all.js before and after all fixes.
Push with commit "feat: full project team audit — QA, SIT, UAT readiness — all systems verified"