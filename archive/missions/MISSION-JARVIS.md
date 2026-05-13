Read index.html fully.
Read slyght-worker/src/index.js fully.
Run node guardian-all.js.
Run node tests/core.test.js.

You are making SLYGHT's AI the brain of the entire app
and cleaning up the dashboard so it shows only what 
matters right now.

Design principles:
- SLYGHT dashboard = can I spend this right now?
- Plan Mode = where is my life going?
- AI chat = Jarvis — knows everything, acts on it
- Everything that answers "where is my life going" 
  moves to Plan Mode
- Net worth shown as LIQUID on dashboard, TOTAL in Plan Mode
- The AI system prompt must never have a stale hardcoded number

One fix at a time. Verify. Guardian after each.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 1 — DASHBOARD DECLUTTER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Remove these cards from the dashboard HTML entirely:
- Property Deposit (via Mum) card — dash-mum-card
- WRX tracker card — wrx-tracker-card  
- Long term liabilities section — lt-liabilities
- Affordability check card
- auditor-badge (dev tool, not user-facing)

These live in Plan Mode. Remove from dashboard only.
Do NOT delete the underlying functions — just 
remove the HTML div containers from the dashboard.

Dashboard order after removal:
1. Header (SLYGHT + weather + PLAN › + bells)
2. Balance hero + liquid net worth line
3. Payday progress bar
4. Survival mode banner (cautious/tight/critical only)
5. Weekly snapshot
6. You Can Spend Today
7. Immediate debts (unpaid only, due before payday)
8. Recent transactions (last 5)

That is all. Nothing else on the dashboard.

VERIFY: Search "wrx-tracker-card" — must NOT be 
rendered in dashboard HTML (function can still exist).
VERIFY: Search "dash-mum-card" — must NOT be rendered.
VERIFY: Search "lt-liabilities" — must NOT be rendered.
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 2 — LIQUID VS TOTAL NET WORTH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Net worth has two honest versions:

LIQUID (what you can access today):
  WRX value (can sell) + cash + mum account
  minus KIA loan minus immediate debts
  = roughly +$4,666

TOTAL (including illiquid super):
  Everything above + super balance
  = roughly +$68,161

Add to calculateNetWorth():
function calculateNetWorth() {
  const wrxValue = S.wrxStatus === 'sold' ? 0 
    : (S.wrxValue || 25000);
  const cashBalance = S.bal || 0;
  const mumAccount = S.mumAccountBalance || 0;
  const savings = (S.savingsBuckets || [])
    .reduce((s,b) => s + (b.saved||0), 0);
  const superBalance = S.superBalance || 0;
  
  const liquidAssets = wrxValue + cashBalance + 
    mumAccount + savings;
  const totalAssets = liquidAssets + superBalance;
  
  const kiaLoan = S.carloan || 0;
  const creditCard = S.cc || 0;
  const immediateDebts = (S.debts||[])
    .filter(d => !d.paid && !d.viaRent && d.amt > 0)
    .reduce((s,d) => s+d.amt, 0);
  const totalLiabilities = kiaLoan + creditCard + 
    immediateDebts;
  
  const liquidNet = parseFloat(
    (liquidAssets - totalLiabilities).toFixed(2)
  );
  const totalNet = parseFloat(
    (totalAssets - totalLiabilities).toFixed(2)
  );
  
  return {
    assets: parseFloat(totalAssets.toFixed(2)),
    liquidAssets: parseFloat(liquidAssets.toFixed(2)),
    liabilities: parseFloat(totalLiabilities.toFixed(2)),
    net: totalNet,        // total including super
    liquidNet: liquidNet, // what you can access now
    breakdown: {
      wrxValue,
      cashBalance,
      mumAccount,
      savings,
      superBalance,
      kiaLoan,
      creditCard,
      immediateDebts
    }
  };
}

On dashboard — show LIQUID net worth:
Find the net worth line in dashboard HTML.
Change to show nw.liquidNet with label:
"Liquid net worth · tap for full picture"

Format: +$4,666 in green or -$X in red.

In openNetWorthModal() show BOTH:
Top section: LIQUID NET WORTH +$4,666
  "What you could access today"
  
Then asset breakdown including Super row:
  WRX (listed): $25,000
  Virgin Money: $779
  Deposit account (Mum): $3,000
  Savings: $70
  Total liquid assets: $28,849
  
  KIA Loan: -$23,989
  Immediate debts: -$125
  Total liabilities: -$24,114
  
  LIQUID NET WORTH: +$4,735

Divider line.

Bottom section: TOTAL NET WORTH +$68,161
  "Including super (can't access until ~60)"
  Aware Super: $63,429
  This number matters for your long-term picture
  but not for today's spending decisions.

In Plan Mode NW header — show TOTAL net worth
(already does this — keep as-is).

Update tests/core.test.js:
Add test for liquidNet calculation.

VERIFY: Search "liquidNet" — must find in 
calculateNetWorth() and dashboard render.
VERIFY: Super appears as row in net worth modal.
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 3 — SURVIVAL FORECAST FREQUENCY FIX
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

getSurvivalForecast() at line ~2178 doesn't apply
isBillDueThisMonth — yearly/quarterly bills counted
every month in the forecast. Fix it.

Find getSurvivalForecast() or the function that
builds the projected run-out card in Analysis.

Find where it iterates BILLS and add the filter:
.filter(b => b.recurring !== false && 
             isBillDueThisMonth(b))

This ensures Teachers Health only shows in 
Feb/May/Aug/Nov and NRMA only shows in May.

VERIFY: Search "isBillDueThisMonth" appears in 
the survival forecast function.
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 4 — CLEAN THE SEED DATA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The initial seed (line ~1147) still creates ghost 
debts that migrations immediately delete. Clean the
seed so a fresh install starts clean.

In the initial S.debts seed array, remove:
- WRX fines + rego entry (all components paid)
- Afterpay $250.84 (old, cleared — new one added by migration)
- Owed to Michael (paid)
- CC overdue (paid)

Keep in seed:
- Property Deposit (via Mum) — active
- Afterpay — Concert Tickets $124.75 — active
  (note: _afterpayUpdated migration adds this,
   so either add to seed OR keep migration,
   not both)

Also fix the seed wrxValue: still shows 21000.
Change to 25000 to match the migration.

Also fix Settings input defaults:
- WRX value input: value="21000" → value="${S.wrxValue||25000}"
- Weekend budget input: value="180" → value="${S.weekendBudget||100}"

Deduplicate WRX value inputs:
There are two WRX value inputs in Settings
(set-wrx and s-wrx-value). 
Keep only one — remove s-wrx-value from the 
always-visible settings card.
Wire the saveWrxValue() to only update set-wrx.

Clear stale notifications:
Add migration in init():
if (!S._notifCleanV1) {
  // Remove notifications referencing paid debts
  const staleIds = [
    'urgent_Owed_to_Michael',
    'urgent_Parking_Fine',
    'warning_Optus'
  ];
  S.notifications = (S.notifications||[]).filter(n =>
    !staleIds.some(id => n.id?.startsWith(id))
  );
  S._notifCleanV1 = true;
  save();
}

VERIFY: Search initial seed — WRX fines NOT present.
VERIFY: wrxValue seed = 25000.
VERIFY: "_notifCleanV1" — must find.
VERIFY: Only ONE WRX value input in settings.
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 5 — FIX REMAINING PROMPT() IN PLAN MODE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

openBonusModal() at line 10108 still uses prompt().
Replace with PLAN_MODAL:

function openBonusModal() {
  PLAN_MODAL.open(
    PLAN_MODAL.header('Add Expected Bonus',
      'Factor a bonus into your payday plan') +
    PLAN_MODAL.field('Bonus Amount ($)', 
      'bonus-amount-input',
      S._pendingBonus || 2000, 'number',
      'Your quarterly bonus is usually ~$2,000 after tax. ' +
      'Add it here to see how it changes your allocations.') +
    PLAN_MODAL.info(
      'Rule: every bonus goes to your top priority goal first. ' +
      'Currently that\'s the China Holiday fund, ' +
      'then Property Deposit.'
    ) +
    PLAN_MODAL.btn('Add To Plan', 
      'confirmBonusAmount()', true) +
    PLAN_MODAL.btn('Cancel', 
      'PLAN_MODAL.close()', false)
  );
}

function confirmBonusAmount() {
  const amt = parseFloat(
    document.getElementById('bonus-amount-input')?.value
  );
  if (isNaN(amt) || amt <= 0) {
    showToast('Please Enter A Valid Amount');
    return;
  }
  S._pendingBonus = amt;
  save();
  PLAN_MODAL.close();
  renderPlanMode();
  showToast('✅ $' + amt.toLocaleString() + 
    ' Bonus Added To Payday Plan');
}

Wire checkForWrxSaleInterception() into onStateChange:
Find onStateChange() function.
Add at the top:
if (typeof checkForWrxSaleInterception === 'function') {
  checkForWrxSaleInterception();
}

VERIFY: Search "openBonusModal" — must use PLAN_MODAL.
VERIFY: Search "checkForWrxSaleInterception" in 
onStateChange — must find.
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 6 — JARVIS: THE AI SYSTEM PROMPT REBUILD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This is the most important fix in this session.
The AI brain must know everything about John's life
and never have a stale hardcoded number.

Find sendChatMessage() at line ~5768.
Find the systemPrompt string inside it.

Replace the ENTIRE system prompt with this:

const nwData = calculateNetWorth();
const todayStr = new Date().toDateString();
const todayTxns = S.txns.filter(t =>
  new Date(t.ts).toDateString() === todayStr && 
  !t.income && !t._isCorrection && !t._isRoundup
);
const todaySpent = todayTxns.reduce((s,t) => s+t.amt, 0);
const weekAgo = Date.now() - 7*86400000;
const weekTxns = S.txns.filter(t => 
  t.ts > weekAgo && !t.income && !t._isCorrection
);
const weekCats = {};
weekTxns.forEach(t => {
  weekCats[t.cat] = (weekCats[t.cat]||0) + t.amt;
});
const weekTopSpend = Object.entries(weekCats)
  .sort((a,b) => b[1]-a[1])
  .slice(0,3)
  .map(([k,v]) => k + ' $' + v.toFixed(0))
  .join(', ');

const mumDebt = findMumDebt();
const trips = PLAN?.getTrips ? PLAN.getTrips() : [];
const goals = PLAN?.getGoals ? PLAN.getGoals() : [];
const darwinTrip = trips.find(t => t.id === 'darwin-2026');
const chinaTrip = trips.find(t => t.id === 'china-2026');
const apGoal = goals.find(g => g.id === 'apartment');
const freedomGoal = goals.find(g => g.id === 'freedom-buffer');
const upcomingBills = getBillsDue()
  .sort((a,b) => a.day - b.day)
  .slice(0,5)
  .map(b => b.name + ' $' + b.amt + ' on ' + b.day + 'th')
  .join(', ');
const activeDebts = (S.debts||[])
  .filter(d => !d.paid && !d.viaRent)
  .map(d => d.name + ' $' + d.amt.toFixed(2) + 
    (d.delayDate ? ' due ' + d.delayDate : ''))
  .join('\n') || 'None';

const kiaInterestDaily = parseFloat(
  ((S.carloan||0) * (S.carLoanRate||9.87) / 100 / 365)
  .toFixed(2)
);

const systemPrompt = \`You are SLYGHT — John's personal 
financial brain. You are Jarvis from Iron Man. 
You know everything about his finances and life.
You are direct, specific and honest. 
Never generic. Always personal. Never say "I understand" 
or "Great question". Maximum 4 sentences for simple questions.

━━ LIVE STATE ━━ \${new Date().toLocaleString('en-AU')}

BALANCE: $\${S.bal.toFixed(2)} (Virgin Money)
LIQUID NET WORTH: \${nwData.liquidNet >= 0 ? '+' : ''}\$\${Math.abs(Math.round(nwData.liquidNet)).toLocaleString()}
TOTAL NET WORTH (incl super): \${nwData.net >= 0 ? '+' : ''}\$\${Math.abs(Math.round(nwData.net)).toLocaleString()}
PAYDAY: May \${S.payday} — in \${daysLeft()} days
MODE: \${getSurvivalMode()} — can spend $\${getDynamicDailyBudget().toFixed(2)}/day
TODAY: \${todayTxns.length > 0 
  ? 'spent $' + todaySpent.toFixed(2) + ' (' + 
    todayTxns.map(t => t.note + ' $' + t.amt).join(', ') + ')'
  : 'nothing logged yet'}
THIS WEEK: \${weekTopSpend || 'No spending logged'}

━━ UPCOMING BILLS ━━
\${upcomingBills || 'None before payday'}

━━ ACTIVE DEBTS ━━
\${activeDebts}

━━ SAVINGS & GOALS ━━
China Holiday fund: $\${S.savingsBuckets?.find(b => b.name==='China Holiday')?.saved?.toFixed(2)||'0'} of $\${chinaTrip?.budget||5000} target
Property deposit (Mum managing): $\${S.mumAccountBalance?.toLocaleString()||'3,000'} of $50,000 target
Freedom buffer: $\${freedomGoal?.saved?.toFixed(0)||'0'} of $\${freedomGoal?.target?.toLocaleString()||'9,000'}
KIA Loan (Firstmac): $\${(S.carloan||0).toLocaleString()} at \${S.carLoanRate||9.87}% — $\${kiaInterestDaily}/day interest

━━ LONG-TERM ━━
Aware Super (High Growth): $\${(S.superBalance||0).toLocaleString()}
Monthly super contribution: $1,311 (employer + salary sacrifice - fees)
Salary: $117,500 + super | Take-home: $\${(S.income||7282).toLocaleString()}/month

━━ UPCOMING LIFE EVENTS ━━
WRX: \${S.wrxStatus === 'listed' ? 'Listed for $' + (S.wrxValue||25000).toLocaleString() + ' on Carsales. When sold: pay off KIA loan ($' + Math.round(S.carloan||0).toLocaleString() + '), free $780/month.' 
  : S.wrxStatus === 'sold' ? 'SOLD ✅ — KIA paid off, $780/month freed'
  : 'NOT LISTED YET — costs $' + kiaInterestDaily + '/day in interest'}
Darwin trip: June 7-15 (flights/accom/car covered by uncle). Spending budget: $\${darwinTrip?.budget||900}. Saved: $\${darwinTrip?.saved||0}.
China trip: December 2026 with GF. Budget: $\${chinaTrip?.budget||5000}. Saved: $\${chinaTrip?.saved?.toFixed(0)||'70'}.
City2Surf: Aug 9, 2026 — \${getDaysToCity2Surf()} days away

━━ JOHN'S PATTERNS ━━
Food spend: ~$900/month (target $400) — biggest leak
Vaping: ~$200/month — quitting for City2Surf
FIFA packs: $116+ when bored — always regretted
Drinks out: $35-60 per session
Living paycheck to paycheck despite $117k income
Goal: own an apartment in Inner West/Meadowbank/Kogarah area
Mum manages his deposit savings account ($3k currently)
WRX listed — sale unlocks everything financially

━━ WHAT YOU CAN DO ━━
You can take these actions. Include ONE at end of response
if appropriate, formatted as [ACTION:{...}]:

log_txn: {"action":"log_txn","amt":X,"note":"...","cat":"..."}
mark_bill_paid: {"action":"mark_bill_paid","name":"...","day":X}
update_balance: {"action":"update_balance","amt":X,"reason":"..."}
update_super: {"action":"update_super","amt":X}
add_trip_savings: {"action":"add_trip_savings","tripId":"...","amt":X}
mark_wrx_listed: {"action":"mark_wrx_listed"}
mark_wrx_sold: {"action":"mark_wrx_sold","salePrice":X}
open_plan: {"action":"open_plan"}
no_spend: {"action":"no_spend"}

━━ RULES ━━
- Balance < $300: firm, no discretionary spending
- Always use specific dollar amounts
- Call out FIFA/vaping/UberEats by name when relevant
- WRX sale is the single most important financial event coming
- Every bonus should go to China then deposit, never lifestyle
- After WRX: $780/month freed — redirect to deposit savings
- Super grows automatically — don't touch it, just update balance quarterly
- Liquid net worth is what matters day to day, not the $68k total\`;

Also update executeChatAction() to handle new actions:

Add to the switch statement:

case 'update_super':
  if (action.amt > 0) {
    S.superBalance = action.amt;
    onStateChange('super_updated_chat');
    showToast('✅ Super Updated To $' + 
      action.amt.toLocaleString());
  }
  break;

case 'add_trip_savings':
  if (action.tripId && action.amt > 0) {
    const trips = PLAN.getTrips();
    const trip = trips.find(t => t.id === action.tripId);
    if (trip) {
      trip.saved = (trip.saved||0) + action.amt;
      PLAN.saveTrip(trip);
      showToast('✅ $' + action.amt + 
        ' Added To ' + trip.name);
    }
  }
  break;

case 'mark_wrx_listed':
  S.wrxStatus = 'listed';
  S.wrxListedDate = new Date().toISOString().substring(0,10);
  onStateChange('wrx_listed_chat');
  showToast('✅ WRX Marked As Listed');
  break;

case 'mark_wrx_sold':
  S.wrxStatus = 'sold';
  S.wrxSoldDate = new Date().toISOString().substring(0,10);
  S.wrxSalePrice = action.salePrice || S.wrxValue || 25000;
  onStateChange('wrx_sold_chat');
  checkForWrxSaleInterception();
  showToast('🎉 WRX SOLD — Time To Allocate The Proceeds');
  break;

case 'open_plan':
  if (typeof openPlanMode === 'function') openPlanMode();
  showToast('Opening Plan Mode...');
  break;

VERIFY: Search "liquidNet" in system prompt — must find.
VERIFY: Search "Darwin trip" in system prompt — must find.
VERIFY: Search "117,500" in system prompt — must find.
VERIFY: Search "update_super" in executeChatAction — must find.
VERIFY: Search "mark_wrx_sold" in executeChatAction — must find.
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 7 — WORKER AWARENESS UPDATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The Cloudflare worker sends notifications that 
reference outdated context. Update the worker's
KV state sync to include plan-mode data.

In index.html find where state is synced to worker
(the /sync or /state POST endpoint call).

Update the sync payload to include:
- superBalance
- mumAccountBalance  
- wrxStatus
- darwinTripDays (days until Darwin June 7)
- chinaTripBudget
- chinaTripSaved
- depositGoalProgress (mumAccountBalance / 50000)

In slyght-worker/src/index.js update the morning
notification to reference relevant context:

If wrxStatus === 'listed':
  Add to morning: "WRX listed X days — respond to 
  enquiries today"

If darwinTripDays <= 14 and darwinTripDays > 0:
  Add: "Darwin in X days — budget on track?"

If depositGoalProgress > 0:
  Add deposit progress to morning context

Update the morning alert body to include one of:
- WRX status reminder (if listed)
- Trip countdown (if within 30 days)
- Deposit milestone (if crossed 10%/25%/50%)

Deploy worker after changes:
cd slyght-worker && npx wrangler deploy && cd ..

VERIFY: Worker deployed successfully.
VERIFY: Sync payload includes superBalance.
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 8 — MINOR FIXES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Clean up remaining low-severity issues.

A) Unguarded console.log at line 1519:
Find the unguarded console.log in onStateChange.
Wrap it:
if (window.SLYGHT_DEBUG) {
  console.log('[SLYGHT]', reason, S.bal, mode);
}

B) getMaxDay() — add deprecation comment but 
keep for now (11 call sites too risky to refactor
without dedicated session). Add comment:
// TODO: deprecate — getDynamicDailyBudget() already returns ≥0

C) Weekend budget mismatch:
In getDynamicDailyBudget() change fallback:
S.weekendBudget || 100
to:
S.weekendBudget || 180

And in settings input change default:
value="${S.weekendBudget || 180}"

These should match.

D) Add unit test for liquidNet:
In tests/core.test.js add:

test('calculateNetWorth() liquidNet excludes super', () => {
  const nw = calculateNetWorth();
  // Liquid = WRX 25000 + bal 779.50 + mum 3000 + savings 67.22
  //          - KIA 23989.70 - debts 124.75
  expect(nw.liquidNet).toBeGreaterThan(4000);
  expect(nw.liquidNet).toBeLessThan(6000);
  // Super should NOT be in liquidNet
  expect(nw.liquidNet).toBeLessThan(nw.net);
});

E) Add "Add Bill" button to Bills tab:
Find the bills tab HTML.
Add a simple button at the top of bills-grouped:

<button onclick="openAddBillModal()" style="
  width:100%;padding:12px;margin-bottom:12px;
  background:rgba(255,255,255,0.06);
  border:1px dashed rgba(255,255,255,0.2);
  border-radius:12px;color:rgba(255,255,255,0.6);
  font-size:14px;cursor:pointer;min-height:48px">
  + Add A Bill
</button>

function openAddBillModal() {
  // Use the existing bill edit modal pattern
  // Open with empty bill object
  openBillModal(-1); // -1 = new bill
}

Check if openBillModal(-1) handles new bill creation.
If not, add handling:
If idx === -1, push new bill to BILLS on save
instead of updating existing.

VERIFY: liquidNet test passes in test suite.
VERIFY: "Add A Bill" button present in Bills tab.
VERIFY: Console.log guarded in onStateChange.
Run guardian. Run tests. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FINAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Run node guardian-all.js — must pass 100%.
Run node tests/core.test.js — must pass all tests.

Final verification:
1.  "wrx-tracker-card" NOT in dashboard render ✓
2.  "dash-mum-card" NOT in dashboard render ✓
3.  "lt-liabilities" NOT in dashboard render ✓
4.  "liquidNet" in calculateNetWorth ✓
5.  "liquidNet" in dashboard net worth display ✓
6.  Super as row in net worth modal ✓
7.  "isBillDueThisMonth" in survival forecast ✓
8.  "_notifCleanV1" migration ✓
9.  WRX seed value = 25000 ✓
10. Single WRX value input in settings ✓
11. "openBonusModal" uses PLAN_MODAL ✓
12. "checkForWrxSaleInterception" in onStateChange ✓
13. "117,500" in system prompt ✓
14. "Darwin trip" in system prompt ✓
15. "liquidNet" in system prompt ✓
16. "mark_wrx_sold" in executeChatAction ✓
17. "update_super" in executeChatAction ✓
18. "open_plan" in executeChatAction ✓
19. Worker deployed with new sync payload ✓
20. All unit tests passing ✓

git add index.html slyght-worker/src/index.js 
    tests/core.test.js
git commit -m "feat: Jarvis AI brain — live context, 9 actions, liquid NW, dashboard decluttered, super in NW, worker awareness"
git push
cd slyght-worker && npx wrangler deploy && cd ..