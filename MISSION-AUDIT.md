Read index.html fully — every line.
Run node guardian-all.js and confirm baseline.

You are conducting a full audit and repair of SLYGHT.
This is not a feature session. This is a correctness session.

PHILOSOPHY:
- A wrong number is worse than no number
- Dead code creates confusion and bugs
- Every calculation must be traceable and honest
- Fix the foundation before adding anything

APPROACH:
- One fix at a time
- Verify the fix worked before continuing
- Run guardian after every fix
- If a fix breaks guardian, revert and find a better approach
- Do not add features — only fix what is broken or misleading

Read the full diagnostic report context:
The app currently shows $3.20/day max spend when it should 
show ~$32/day. Root causes confirmed:

BUG 1: WRX fines debt $1,254 — ghost debt, all cleared
BUG 2: getActiveDebtsDueBeforePayday() priority catch-all
BUG 3: getBillsDue() ignores freq — yearly/quarterly 
        bills counted every month
BUG 4: getBucketTotal() subtracted from S.bal — 
        buckets are in different accounts
BUG 5: paidBills keys orphaned after bill rename
BUG 6: getSurvivalMode() triggers on broken dailyMax

Additional issues to audit and fix:
- Dead debt entries showing in dashboard
- Double counting in payday allocation
- Bills calendar showing wrong months
- Net worth inconsistency between footer and dashboard
- Any other calculation errors found during audit

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 1 — DELETE GHOST DEBT AND CLEAN DEBTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WRX fines debt (id:3, amt:$1,254, paid:false) is 
a ghost. Every component was paid separately:
- Parking fine $140 → paid (id:5 in debts, paid:true)
- WRX Rego $462 → paid (id:3 was wrong, rego paid as txn)
- Green Slip $552 → paid (id:6 in debts, paid:true)
- Pink slip $51 → paid as transaction

The debt id:3 "WRX fines" must be deleted.
Also clean up other ghost/stale debts.

Add this migration in init() after load():

if (!S._debtAuditV1) {
  // Delete WRX fines ghost debt — all components paid
  S.debts = S.debts.filter(d => 
    !(d.name === 'WRX fines' || 
      d.name === 'WRX Rego' ||
      (d.name === 'Parking Fine' && d.paid === true) ||
      (d.name === 'Pet Insurance' && d.paid === true) ||
      (d.name === 'Afterpay' && d.paid === true && d.amt === 250.84) ||
      (d.name === 'WRX Green Slip' && d.paid === true) ||
      (d.name === 'Owed to Michael' && d.paid === true) ||
      (d.name === 'CC overdue' && d.paid === true) ||
      (d.name === 'NRMA KIA INSURANCE' && d.paid === true)
    )
  );
  
  // Mark Owed to Michael as paid — was cleared Apr 2026
  const michael = S.debts.find(d => 
    d.name === 'Owed to Michael'
  );
  if (michael) michael.paid = true;
  
  // Mark Pet Insurance as paid — was cleared Apr 2026
  const petIns = S.debts.find(d => 
    d.name === 'Pet Insurance' && d.amt === 120.47
  );
  if (petIns) petIns.paid = true;
  
  // Mark Parking Fine as paid
  const parkFine = S.debts.find(d => 
    d.name === 'Parking Fine'
  );
  if (parkFine) parkFine.paid = true;
  
  S._debtAuditV1 = true;
  save();
}

After migration S.debts should only have:
ACTIVE (paid:false, not viaRent):
- Teachers Health $259.41 (due May 1 — direct debit tomorrow)
- Afterpay — Concert Tickets $124.75 (due May 31)

VIA RENT (managed separately):
- Property Deposit (via Mum) — not counted as liability

PAID (hidden from all displays):
- Everything else

VERIFY: After migration, count active debts.
Should be exactly 2 active non-viaRent debts.
Search "_debtAuditV1" — must find.
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 2 — getActiveDebtsDueBeforePayday()
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Current bug: debts with no delayDate AND priority <= 3
are always counted as due before payday via catch-all.
This is wrong — no due date means not scheduled.

Find getActiveDebtsDueBeforePayday() (line ~1495).

Replace entirely with:

function getActiveDebtsDueBeforePayday() {
  const today = new Date();
  today.setHours(0,0,0,0);
  
  const paydayDate = new Date(
    today.getFullYear(), 
    today.getMonth(), 
    S.payday || 15
  );
  if (paydayDate <= today) {
    paydayDate.setMonth(paydayDate.getMonth() + 1);
  }
  
  return (S.debts || [])
    .filter(d => {
      if (d.paid) return false;
      if (d.viaRent) return false;
      
      // ONLY include debts with an explicit due date
      // that falls between now and payday
      if (!d.delayDate) return false;
      
      const due = new Date(d.delayDate + 'T00:00:00');
      return due >= today && due <= paydayDate;
    })
    .reduce((sum, d) => sum + (d.amt || 0), 0);
}

This removes the priority catch-all entirely.
A debt is only counted if it has an explicit due date
before the next payday. Period.

VERIFY: With current debts, getActiveDebtsDueBeforePayday()
should return $259.41 (Teachers Health due May 1 only).
Afterpay concerts due May 31 > May 15 so excluded.
WRX fines deleted in Fix 1 so irrelevant.

Manually verify: search for the function, confirm
the priority catch-all is gone.
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 3 — getBillsDue() FREQUENCY FILTER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Current bug: yearly and quarterly bills counted 
every month because getBillsDue() ignores freq field.
NRMA $1,023 and Teachers Health $259 inflate committed
by ~$1,282 every month they're not due.

Find getBillsDue() (line ~1934).

Add frequency filtering. A bill should only be included
in getDue calculations if it's actually due THIS month:

Add this helper before getBillsDue():

function isBillDueThisMonth(bill) {
  const now = new Date();
  const month = now.getMonth(); // 0-11
  const year = now.getFullYear();
  
  if (!bill.freq || bill.freq === 'monthly') return true;
  
  if (bill.freq === 'yearly' || bill.freq === 'annual') {
    // Only due in the specific month it's configured for
    // Use bill.dueMonth if set, otherwise use current month
    // as approximation (bill will be marked paid when done)
    const dueMonth = bill.dueMonth !== undefined 
      ? bill.dueMonth 
      : month;
    return month === dueMonth;
  }
  
  if (bill.freq === 'quarterly') {
    // Due every 3 months — check if this is a due month
    // Teachers Health: due in Feb, May, Aug, Nov (months 1,4,7,10)
    // Use bill.dueMonths array if set, else use quarters from Jan
    if (bill.dueMonths && bill.dueMonths.length) {
      return bill.dueMonths.includes(month);
    }
    // Default: due in Jan, Apr, Jul, Oct (months 0,3,6,9)
    return [0, 3, 6, 9].includes(month);
  }
  
  if (bill.freq === 'biannual' || bill.freq === 'biannually') {
    if (bill.dueMonths && bill.dueMonths.length) {
      return bill.dueMonths.includes(month);
    }
    return [0, 6].includes(month);
  }
  
  return true; // default to monthly if unknown
}

Now update the BILLS array to add due month metadata
for non-monthly bills. Add in the BILLS array definition:

For Car Rego — WRX:
{
  name: 'Car Rego — WRX',
  amt: 462,
  day: 15,
  tag: 'Transport',
  recurring: true,
  freq: 'yearly',
  dueMonth: 3  // April = month index 3
}

For NRMA KIA Insurance:
{
  name: 'NRMA KIA Insurance',
  amt: 1023.06,
  day: 2,
  tag: 'Insurance',
  recurring: true,
  freq: 'yearly',
  dueMonth: 4  // May = month index 4
}

For Teachers Health:
{
  name: 'Teachers Health',
  amt: 259.41,
  day: 1,
  tag: 'Health',
  recurring: true,
  freq: 'quarterly',
  dueMonths: [1, 4, 7, 10]  // Feb, May, Aug, Nov
}

Now update getBillsDue() to use isBillDueThisMonth():

In the filter conditions add:
&& isBillDueThisMonth(b)

So the filter becomes:
bills.filter(b => 
  b.recurring !== false && 
  !isPaid(b) && 
  isBillDueThisMonth(b) &&  // ADD THIS
  b.day >= today && 
  b.day < upperBound
)

And the after-payday filter:
bills.filter(b => {
  if (b.recurring === false) return false;
  if (isPaid(b)) return false;
  if (!isBillDueThisMonth(b)) return false;  // ADD THIS
  const diff = b.day >= today 
    ? b.day - today 
    : daysInCurrentMonth() - today + b.day;
  return diff > 0 && diff < daysLeft(payday);
});

VERIFY: getBillsDue() for April 29 should return:
- Amazon Prime $9.99 (day 3, May)
- Fuel $110 (day 5, May)
- Microsoft Game Pass $19.45 (day 7, May)
- Pet Insurance $60.20 (day 8, May)
- Claude Plus $34 (day 9, May)
- Netflix $28.99 (day 10, May)
Total: $262.63

Teachers Health $259.41 is due May 1 — 
it should appear as a DEBT (direct debit tomorrow)
not a bill in this cycle. Handled by getActiveDebtsDueBeforePayday.

NRMA $1,023 — due month is May (dueMonth:4).
Today is April so NOT included. ✅

Search "isBillDueThisMonth" — must find.
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 4 — REMOVE BUCKET TOTAL FROM DAILY BUDGET
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Current bug: getBucketTotal() is subtracted from 
S.bal in getDynamicDailyBudget(). But bucket savings
are in ING/Westpac/Other — not in Virgin Money.
Subtracting them double-counts money that isn't there.

Find getDynamicDailyBudget() (line ~1368).

Find this line:
const committed = getBillsDue().reduce((s,b) => s+b.amt, 0)
                + getActiveDebtsDueBeforePayday()
                + getBucketTotal();

Change to:
const committed = getBillsDue().reduce((s,b) => s+b.amt, 0)
                + getActiveDebtsDueBeforePayday();

Remove getBucketTotal() from the committed calculation.

Bucket savings are tracked separately in savingsBuckets.
They are NOT in S.bal so should never be subtracted from it.

VERIFY: Search getDynamicDailyBudget — confirm 
getBucketTotal() is NOT in the committed line.
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 5 — PAIDBILLS KEY MIGRATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Current bug: renaming "Rent" to "Rent + Deposit Savings"
orphaned all paidBills keys for rent.
Next month rent will show as unpaid even if it was paid.

Add migration in init() after load():

if (!S._paidBillsKeyMigrationV1) {
  // Migrate old Rent keys to new name
  const oldKeys = Object.keys(S.paidBills || {})
    .filter(k => k.includes('-Rent-') && 
                 !k.includes('Deposit'));
  oldKeys.forEach(oldKey => {
    const newKey = oldKey.replace('-Rent-', 
      '-Rent + Deposit Savings-');
    S.paidBills[newKey] = true;
    // Keep old key too for safety
  });
  
  // Migrate old "Car Loan — Firstmac" to "KIA Loan — Firstmac"
  const carLoanKeys = Object.keys(S.paidBills || {})
    .filter(k => k.includes('Car Loan'));
  carLoanKeys.forEach(oldKey => {
    const newKey = oldKey.replace(
      'Car Loan — Firstmac', 
      'KIA Loan — Firstmac'
    );
    S.paidBills[newKey] = true;
  });
  
  S._paidBillsKeyMigrationV1 = true;
  save();
}

Also update isThisMonthlyBillPaid() to check both 
old and new key formats as a safety net:

function isThisMonthlyBillPaid(billName, billDay) {
  const y = new Date().getFullYear();
  const m = new Date().getMonth() + 1;
  if (!S.paidBills) return false;
  
  // Check current key
  const key1 = y+'-'+m+'-'+billName+'-'+billDay;
  const key2 = y+'-'+m+'-'+billName;
  if (S.paidBills[key1] || S.paidBills[key2]) return true;
  
  // Check legacy keys for renamed bills
  const legacyNames = {
    'Rent + Deposit Savings': 'Rent',
    'KIA Loan — Firstmac': 'Car Loan — Firstmac'
  };
  const legacyName = legacyNames[billName];
  if (legacyName) {
    const legacyKey1 = y+'-'+m+'-'+legacyName+'-'+billDay;
    const legacyKey2 = y+'-'+m+'-'+legacyName;
    if (S.paidBills[legacyKey1] || S.paidBills[legacyKey2]) 
      return true;
  }
  
  return false;
}

VERIFY: Search "_paidBillsKeyMigrationV1" — must find.
VERIFY: Search "legacyNames" in isThisMonthlyBillPaid — must find.
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 6 — getSurvivalMode() HONEST CALCULATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Current bug: getSurvivalMode() returns 'tight' whenever
dailyMax < 20. With the broken dailyMax = $0, everything
shows as tight/survival even when John is fine.

Fix getSurvivalMode() to not depend on getDynamicDailyBudget()
— that creates a circular dependency. Use balance and
committed bills directly:

function getSurvivalMode() {
  const bal = getLiveBal();
  
  // Calculate honest committed amount
  const billsCommitted = getBillsDue()
    .reduce((s,b) => s+b.amt, 0);
  const debtsCommitted = getActiveDebtsDueBeforePayday();
  const totalCommitted = billsCommitted + debtsCommitted;
  const available = Math.max(0, bal - totalCommitted);
  const days = Math.max(1, daysLeft());
  const dailyAvailable = available / days;
  
  if (bal < 100) return 'critical';
  if (bal < 300) return 'survival';
  if (dailyAvailable < 15) return 'tight';
  if (dailyAvailable < 25) return 'cautious';
  return 'normal';
}

With fixed bills: available = 779.50 - 262.63 - 259.41 
                            = $257.46
dailyAvailable = 257.46 / 16 = $16.09
Mode: 'tight' ← actually correct given the situation

The mode label itself is honest now because it's based
on real available cash not a broken calculation.

VERIFY: Search getSurvivalMode — confirm it uses 
getBillsDue() + getActiveDebtsDueBeforePayday()
and NOT getDynamicDailyBudget().
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 7 — getDynamicDailyBudget() SIMPLIFIED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Now that the inputs are fixed, simplify the function.
The current version has 4 nested if/else branches
with different caps that are confusing and wrong.

Replace getDynamicDailyBudget() with:

function getDynamicDailyBudget() {
  const bal = getLiveBal();
  const days = Math.max(1, daysLeft());
  
  // What's committed before payday
  const billsCommitted = getBillsDue()
    .reduce((s,b) => s+b.amt, 0);
  const debtsCommitted = getActiveDebtsDueBeforePayday();
  const totalCommitted = billsCommitted + debtsCommitted;
  
  // What's genuinely available for daily spending
  const available = Math.max(0, bal - totalCommitted);
  const dailyAvailable = parseFloat(
    (available / days).toFixed(2)
  );
  
  // Apply user budget caps based on day type
  const isWeekend = [0, 6].includes(new Date().getDay());
  const userCap = isWeekend 
    ? (S.weekendBudget || 100) 
    : (S.weekdayBudget || 60);
  
  // Never exceed user cap, never return negative
  return Math.min(dailyAvailable, userCap);
}

This is honest, traceable, and simple.
With the fixed inputs:
- bal: $779.50
- billsCommitted: $262.63
- debtsCommitted: $259.41 (Teachers Health)
- available: $257.46
- days: 16
- dailyAvailable: $16.09
- userCap (weekday): $60
- result: min($16.09, $60) = $16.09/day

That's the honest number. Tight but real.

Note: $16.09 not $30.69 because Teachers Health
$259.41 is due tomorrow and must be reserved.
After it hits tomorrow: available = $516.87,
daily = $32.30/day. The app will update automatically.

VERIFY: Search getDynamicDailyBudget — confirm 
getBucketTotal is gone and logic is simplified.
VERIFY: The function returns ~$16 today.
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 8 — DASHBOARD DISPLAY FIXES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

With calculations fixed, update dashboard displays.

A) "You Can Spend Today" card:
The display must show the actual result of 
getDynamicDailyBudget() with a contextual sub-line.

Add below the dollar amount:
- If dailyBudget < 20: "Tight — Teachers Health hits tomorrow"
- If dailyBudget < 30: "Cautious — cover your essentials first"  
- If dailyBudget >= 30: "You're on track — spend wisely"

B) Survival mode banner:
Must use getSurvivalMode() result.
'tight' → amber banner: 
  "Tight This Week — $X/day Max"
'cautious' → yellow banner:
  "Cautious Mode — Watch Your Spending"
'normal' → no banner (don't show if everything is fine)
'survival' → red banner
'critical' → red flashing banner

C) Weekly snapshot pace:
Must use getDiscretionarySpend() — already fixed
in a previous session. Verify it's still correct.

D) Net worth in footer and dashboard tap:
Both must use calculateNetWorth().net
Verify both show the same number with correct sign.

VERIFY: getDynamicDailyBudget result shows on dashboard.
VERIFY: Survival mode banner uses getSurvivalMode().
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 9 — BILLS CALENDAR AND TAB CLEANUP  
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A) Bills tab "This Week" section:
Must only show bills due in the next 7 days
that are actually due this month (using isBillDueThisMonth).
Currently includes Health Insurance monthly average 
which is wrong — Teachers Health is quarterly.

Update the This Week calculation:
const sevenDaysFromNow = new Date();
sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

const thisWeekBills = BILLS.filter(b => {
  if (!b.recurring) return false;
  if (!isBillDueThisMonth(b)) return false;  // frequency check
  const billDate = new Date(
    now.getFullYear(), now.getMonth(), b.day
  );
  const key = now.getFullYear() + '-' + 
    (now.getMonth()+1) + '-' + b.name + '-' + b.day;
  if (S.paidBills?.[key]) return false;  // already paid
  return billDate > now && billDate <= sevenDaysFromNow;
});

B) Monthly bills list:
Show only:
- UNPAID bills due this month (using isBillDueThisMonth)
- Collapsed "Paid this month (X)" section below

The total at top should say:
"Due This Month: $X remaining"
Not just a number — context matters.

C) Bills calendar dots:
Only show dots for bills that are actually due 
in that calendar month (isBillDueThisMonth check
applied to the rendered month, not current month).

When rendering a different month than current, 
check if the bill's frequency means it's due that month.

D) Projected survival forecast:
The "Projected to run out" card in Analysis must use
the fixed getBillsDue() and getActiveDebtsDueBeforePayday().
Verify it's reading from the corrected functions.

VERIFY: "This Week" shows correct bills for May 1-6.
Should show: Teachers Health $259.41 (tomorrow).
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 10 — PLAN MODE CALCULATION FIXES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Plan mode has its own calculation issues now that
core data is corrected.

A) PLAN.getTotalProvisions() reads from wrong source:
Currently reads PLAN.getAnnualProvisions() always.
If user has edited provisions via editProvision(),
those edits are stored in localStorage but ignored
in the payday allocation total.

Fix:
getTotalProvisions() {
  const provisions = typeof getCustomProvisions === 'function'
    ? getCustomProvisions()
    : this.getAnnualProvisions();
  return provisions.reduce((s,p) => s + (p.monthly || 0), 0);
},

B) Payday allocation locked section:
Currently includes a separate "Teachers Health" line
if there's a Teachers Health debt. But Teachers Health
is now a bill (quarterly), not a debt.
Remove the teachersHealth debt lookup:

const teachersHealth = 0; // handled via quarterly bill

C) Available calculation in payday planner:
The discretionary amount must use fixed functions:

const income = PLAN.INCOME_MONTHLY + (S._pendingBonus || 0);
const mumTotal = 3000; // $500 rent + $2,500 deposit (fixed)
const billsNextCycle = BILLS
  .filter(b => b.recurring && 
    b.tag !== 'Fixed' &&  // exclude rent
    b.tag !== 'Loan' &&   // exclude KIA loan
    isBillDueThisMonth(b) // only bills due this month
  )
  .reduce((s,b) => s+b.amt, 0);
const provisions = PLAN.getTotalProvisions(); // from custom
const discretionary = Math.max(0, 
  income - mumTotal - billsNextCycle - provisions
);

D) Goal tracker timelines in Analysis tab:
The "At current pace" calculation uses monthlyContribution
which is often 0 if not set. If 0, show:
"Not saving toward this yet — set a monthly amount"
Instead of "Not achievable now" or "∞ months".

E) Income simulator in Plan mode:
PLAN.INCOME_MONTHLY is hardcoded as 7300.
Should read from S.income (7282) for accuracy.
Update:
INCOME_MONTHLY: S.income || 7282,

But PLAN is defined as a const object at init time.
Change to a getter:
get INCOME_MONTHLY() { return S.income || 7282; },

VERIFY: PLAN.getTotalProvisions() uses getCustomProvisions.
VERIFY: teachersHealth line removed from payday locked section.
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 11 — DEAD CODE AND ORPHAN CLEANUP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Search for and clean up these known issues:

A) getNetWorth() wrapper:
Claude Code noted getNetWorth() exists alongside 
calculateNetWorth() as a thin wrapper.
If all call sites now use calculateNetWorth() directly,
delete getNetWorth() to avoid confusion.
Check every call site first — if any still use 
getNetWorth(), update them to calculateNetWorth().

B) getBucketTotal():
After removing it from getDynamicDailyBudget(),
check if it's used anywhere else.
If only used in the now-fixed function, and 
the bucket totals are shown via savingsBuckets 
renders elsewhere, consider removing or keeping 
for bucket display purposes only.
Do NOT remove if it's used in any rendering function.

C) Seed data consistency:
The seed that runs on first install must be consistent
with live data. Check:
- S.carloan seed = 0 (correct — loads from localStorage)
- S.wrxValue seed = 25000 (updated in Fix 1 of data model)
- S.income seed = 7282 (verify)
- S.weekdayBudget seed = 60 (verify — was 30 in some places)
- S.weekendBudget seed = 100 (verify)

D) Duplicate function definitions:
Search for any function defined more than once.
If duplicates exist, keep the most recent/correct
version and remove the older one.

E) Console.log cleanup:
Search for console.log statements left from debugging.
Remove any that log sensitive data (balances, debts).
Keep only critical error logs.

F) Health Insurance (qtrly avg) bill:
The old "Health Insurance (qtrly avg)" $119.04 monthly
bill should have been removed in a previous session.
Verify it's gone. If still present, remove it.
Teachers Health quarterly at $259.41 is the correct entry.

VERIFY: getNetWorth() — if deleted, no remaining call sites.
VERIFY: "Health Insurance (qtrly avg)" — must NOT be found.
VERIFY: No duplicate function definitions for core functions.
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 12 — SUPERANNUATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add superannuation to net worth and plan mode.

John's super:
- Fund: Aware Super (High Growth)
- Current balance: $63,429.15
- Employer contribution: $1,150/month
- Tax contributions: $172.50/month (salary sacrifice)
- Fees: ~$12/month (admin and account)
- Net monthly growth from contributions: 
  $1,150 + $172.50 - $12 = $1,310.50/month
  Plus investment returns (high growth ~8-10% p.a.)

Add to S:
S.superBalance = S.superBalance || 63429.15;
S.superFund = S.superFund || 'Aware Super';
S.superMonthlyContrib = S.superMonthlyContrib || 1310.50;

Add migration in init():
if (!S._superAdded) {
  S.superBalance = 63429.15;
  S.superFund = 'Aware Super';
  S.superMonthlyContrib = 1310.50; // net after fees
  S.superGrowthRate = 0.085; // 8.5% p.a. high growth estimate
  S._superAdded = true;
  save();
}

Update calculateNetWorth() to include super as an asset:
// Super is an asset but illiquid (can't access until ~60)
// Include it but note it separately
const superBalance = S.superBalance || 0;
const totalAssets = wrxValue + cashBalance + 
  mumAccount + savings + superBalance;

In the net worth breakdown modal show super separately:
['Aware Super (Illiquid Until ~60)', superBalance]

Also add a note:
"Super is included in net worth but cannot be 
accessed until retirement age."

Add super to Plan Mode — create a super card in 
renderPlanMode() after the goals section:

function renderSuperCard() {
  const balance = S.superBalance || 0;
  const monthlyContrib = S.superMonthlyContrib || 1310.50;
  const growthRate = S.superGrowthRate || 0.085;
  
  // Project balance at retirement (~35 years)
  // FV = PV(1+r)^n + PMT * ((1+r)^n - 1) / r
  // Where r = monthly rate, n = months to retirement
  const yearsToRetirement = 35;
  const monthlyRate = growthRate / 12;
  const months = yearsToRetirement * 12;
  const fv = balance * Math.pow(1 + monthlyRate, months) +
    monthlyContrib * 
    (Math.pow(1 + monthlyRate, months) - 1) / monthlyRate;
  
  // 1 year projection
  const fv1yr = balance * Math.pow(1 + monthlyRate, 12) +
    monthlyContrib * 
    (Math.pow(1 + monthlyRate, 12) - 1) / monthlyRate;

  // 5 year projection  
  const fv5yr = balance * Math.pow(1 + monthlyRate, 60) +
    monthlyContrib * 
    (Math.pow(1 + monthlyRate, 60) - 1) / monthlyRate;

  return `
  <div style="background:rgba(255,255,255,0.04);
    border-radius:16px;padding:16px;margin-bottom:16px;
    border:1px solid rgba(255,255,255,0.06)">
    
    <div style="display:flex;justify-content:space-between;
      align-items:center;margin-bottom:16px">
      <div>
        <div style="color:#fff;font-size:15px;font-weight:700">
          🏦 Superannuation
        </div>
        <div style="color:rgba(255,255,255,0.4);font-size:12px;
          margin-top:4px">
          Aware Super · High Growth
        </div>
      </div>
      <div style="text-align:right">
        <div style="color:#4ECDC4;font-size:20px;font-weight:800">
          $${Math.round(balance).toLocaleString()}
        </div>
        <div style="color:rgba(255,255,255,0.3);font-size:11px">
          Current Balance
        </div>
      </div>
    </div>

    <!-- Monthly contributions -->
    <div style="background:rgba(255,255,255,0.05);
      border-radius:10px;padding:12px;margin-bottom:12px">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;
        gap:8px;text-align:center">
        <div>
          <div style="color:rgba(255,255,255,0.4);font-size:10px;
            margin-bottom:4px">Employer</div>
          <div style="color:#4ECDC4;font-size:14px;font-weight:700">
            $1,150
          </div>
          <div style="color:rgba(255,255,255,0.3);font-size:10px">
            /month
          </div>
        </div>
        <div>
          <div style="color:rgba(255,255,255,0.4);font-size:10px;
            margin-bottom:4px">Your Extra</div>
          <div style="color:#4ECDC4;font-size:14px;font-weight:700">
            $173
          </div>
          <div style="color:rgba(255,255,255,0.3);font-size:10px">
            /month
          </div>
        </div>
        <div>
          <div style="color:rgba(255,255,255,0.4);font-size:10px;
            margin-bottom:4px">Fees</div>
          <div style="color:#FF6B35;font-size:14px;font-weight:700">
            -$12
          </div>
          <div style="color:rgba(255,255,255,0.3);font-size:10px">
            /month
          </div>
        </div>
      </div>
    </div>

    <!-- Projections -->
    <div style="font-size:11px;color:rgba(255,255,255,0.4);
      text-transform:uppercase;letter-spacing:1px;
      margin-bottom:8px">
      Projected Balance
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;
      gap:8px;margin-bottom:12px">
      ${[
        ['1 Year', fv1yr],
        ['5 Years', fv5yr],
        ['Retirement', fv]
      ].map(([label, val]) => `
      <div style="background:rgba(255,255,255,0.05);
        border-radius:10px;padding:10px;text-align:center">
        <div style="color:rgba(255,255,255,0.4);font-size:10px;
          margin-bottom:4px">${label}</div>
        <div style="color:#4ECDC4;font-size:13px;font-weight:700">
          $${val >= 1000000 
            ? (val/1000000).toFixed(1) + 'M' 
            : Math.round(val/1000) + 'k'}
        </div>
      </div>`).join('')}
    </div>

    <div style="color:rgba(255,255,255,0.3);font-size:11px;
      line-height:1.5">
      Projected at 8.5% p.a. (High Growth estimate). 
      Actual returns will vary. Cannot access until ~age 60.
    </div>
    
    <button onclick="updateSuperBalance()" style="
      width:100%;margin-top:12px;padding:10px;
      background:rgba(255,255,255,0.06);
      border:1px solid rgba(255,255,255,0.1);
      border-radius:10px;color:rgba(255,255,255,0.6);
      font-size:13px;cursor:pointer">
      📊 Update Balance
    </button>
  </div>`;
}

function updateSuperBalance() {
  PLAN_MODAL.open(
    PLAN_MODAL.header('Update Super Balance',
      'Check your Aware Super app for current balance') +
    PLAN_MODAL.field('Current Balance ($)', 
      'super-balance-input',
      S.superBalance || 63429.15, 'number',
      'Log into Aware Super or check your last statement.') +
    PLAN_MODAL.info(
      'Updating regularly keeps your net worth and ' +
      'retirement projections accurate. ' +
      'Your employer contributes $1,150/month automatically.'
    ) +
    PLAN_MODAL.btn('Update', 'confirmSuperBalance()', true) +
    PLAN_MODAL.btn('Cancel', 'PLAN_MODAL.close()', false)
  );
}

function confirmSuperBalance() {
  const val = parseFloat(
    document.getElementById('super-balance-input')?.value
  );
  if (!isNaN(val) && val > 0) {
    S.superBalance = val;
    onStateChange('super_updated');
    PLAN_MODAL.close();
    renderPlanMode();
    showToast('✅ Super Balance Updated');
  }
}

Add renderSuperCard() call in renderPlanMode()
after renderGoalCards() and before 
renderAnnualProvisions().

Also add super balance as editable in Settings
under My Financial Data:
Label: "Superannuation Balance"
Field: saves to S.superBalance

VERIFY: Search "renderSuperCard" — must find.
VERIFY: Search "superBalance" — must find in 
        calculateNetWorth() and renderSuperCard().
VERIFY: Search "confirmSuperBalance" — must find.
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 13 — UNIT TEST SUITE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create a test file that verifies core calculations
are correct. This prevents regression — we never
go back to $3.20/day without catching it immediately.

Create C:\Users\admin\slyght\tests\core.test.js:

// SLYGHT Core Calculation Tests
// Run with: node tests/core.test.js

// Mock the S object with known values
const S = {
  bal: 779.50,
  payday: 15,
  paydayReceived: true,
  carloan: 23989.70,
  carLoanRate: 9.87,
  wrxValue: 25000,
  wrxStatus: 'listed',
  mumAccountBalance: 3000,
  superBalance: 63429.15,
  income: 7282,
  weekdayBudget: 60,
  weekendBudget: 100,
  savingsBuckets: [
    {name:'China Holiday', goal:4000, saved:70.44, account:'Virgin Money'},
    {name:'Rainy Day Fund', goal:2000, saved:0, account:'ING'}
  ],
  debts: [
    {id:8, name:'Teachers Health', amt:259.41, paid:false, 
     delayDate:'2026-05-01', viaRent:false},
    {id:9, name:'Afterpay — Concert Tickets', amt:124.75, 
     paid:false, delayDate:'2026-05-31', viaRent:false},
    {id:7, name:'Property Deposit (via Mum)', amt:5681.45,
     paid:false, viaRent:true}
  ],
  paidBills: {}
};

// Mock BILLS (post-audit state)
const BILLS = [
  {name:'Rent + Deposit Savings', amt:3000, day:15, 
   tag:'Fixed', recurring:true},
  {name:'KIA Loan — Firstmac', amt:780, day:15, 
   tag:'Loan', recurring:true, freq:'monthly'},
  {name:'Amazon Prime', amt:9.99, day:3, 
   tag:'Subscription', recurring:true},
  {name:'Fuel', amt:110, day:5, 
   tag:'Variable', recurring:true},
  {name:'Microsoft PC Game Pass', amt:19.45, day:7, 
   tag:'Subscription', recurring:true},
  {name:'Pet Insurance — Bowtie', amt:60.20, day:8, 
   tag:'Fixed', recurring:true},
  {name:'Claude Plus', amt:34, day:9, 
   tag:'Subscription', recurring:true},
  {name:'Netflix', amt:28.99, day:10, 
   tag:'Streaming', recurring:true},
  {name:'Optus — Phone + Internet', amt:199, day:16, 
   tag:'Fixed', recurring:true},
  {name:'YouTube Premium', amt:16.99, day:20, 
   tag:'Streaming', recurring:true},
  {name:'Food at Work', amt:100, day:28, 
   tag:'Variable', recurring:true},
  {name:'Adobe', amt:23.99, day:27, 
   tag:'Subscription', recurring:true},
  {name:'Spotify', amt:15.99, day:28, 
   tag:'Streaming', recurring:true},
  {name:'NRMA KIA Insurance', amt:1023.06, day:2, 
   tag:'Insurance', recurring:true, freq:'yearly', dueMonth:4},
  {name:'Teachers Health', amt:259.41, day:1, 
   tag:'Health', recurring:true, freq:'quarterly',
   dueMonths:[1,4,7,10]}
];

// ── Test helpers ────────────────────────────────────────
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('✅ ' + name);
    passed++;
  } catch(e) {
    console.log('❌ ' + name + ': ' + e.message);
    failed++;
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (Math.abs(actual - expected) > 0.01) {
        throw new Error(
          'Expected ' + expected + ' but got ' + actual
        );
      }
    },
    toBeGreaterThan(val) {
      if (actual <= val) {
        throw new Error(
          'Expected > ' + val + ' but got ' + actual
        );
      }
    },
    toBeLessThan(val) {
      if (actual >= val) {
        throw new Error(
          'Expected < ' + val + ' but got ' + actual
        );
      }
    },
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(
          'Expected ' + JSON.stringify(expected) + 
          ' but got ' + JSON.stringify(actual)
        );
      }
    },
    toBeTruthy() {
      if (!actual) throw new Error('Expected truthy but got ' + actual);
    },
    toBeFalsy() {
      if (actual) throw new Error('Expected falsy but got ' + actual);
    }
  };
}

// ── Mock date: April 29, 2026 ───────────────────────────
// Override Date for testing
const TEST_DATE = new Date(2026, 3, 29); // April 29, 2026
const OrigDate = Date;
global.Date = class extends OrigDate {
  constructor(...args) {
    if (args.length === 0) return TEST_DATE;
    super(...args);
  }
  static now() { return TEST_DATE.getTime(); }
};

// ── Copy core functions from index.html ─────────────────
// (Claude Code: copy these function bodies verbatim from 
//  the fixed index.html — do not rewrite them)

// Functions to copy:
// - daysLeft()
// - isBillDueThisMonth()
// - getBillsDue()
// - getActiveDebtsDueBeforePayday()
// - getDynamicDailyBudget()
// - getSurvivalMode()
// - calculateNetWorth()
// - getLiveBal()

// ── Tests ───────────────────────────────────────────────

test('daysLeft() returns 16 days from Apr 29 to May 15', () => {
  expect(daysLeft()).toBe(16);
});

test('isBillDueThisMonth: monthly bill always true', () => {
  expect(isBillDueThisMonth({freq:'monthly'})).toBeTruthy();
});

test('isBillDueThisMonth: yearly NRMA due in May (month 4)', () => {
  // April = month 3, NRMA due in month 4 (May)
  // So in April it should NOT be due
  const nrmaBill = {freq:'yearly', dueMonth:4};
  // Current mock date is April (month 3)
  expect(isBillDueThisMonth(nrmaBill)).toBeFalsy();
});

test('isBillDueThisMonth: Teachers Health quarterly', () => {
  // dueMonths: [1,4,7,10] = Feb, May, Aug, Nov
  // April (month 3) is NOT in that list
  const thBill = {freq:'quarterly', dueMonths:[1,4,7,10]};
  expect(isBillDueThisMonth(thBill)).toBeFalsy();
});

test('getBillsDue() returns $262.63 on Apr 29', () => {
  const total = getBillsDue().reduce((s,b) => s+b.amt, 0);
  // Amazon Prime $9.99 + Fuel $110 + Game Pass $19.45 
  // + Pet Insurance $60.20 + Claude Plus $34 + Netflix $28.99
  expect(total).toBe(262.63);
});

test('getBillsDue() excludes NRMA yearly (not due in April)', () => {
  const bills = getBillsDue();
  const hasNrma = bills.some(b => b.name === 'NRMA KIA Insurance');
  expect(hasNrma).toBeFalsy();
});

test('getBillsDue() excludes Teachers Health (quarterly, not April)', () => {
  const bills = getBillsDue();
  const hasTH = bills.some(b => b.name === 'Teachers Health');
  expect(hasTH).toBeFalsy();
});

test('getActiveDebtsDueBeforePayday() = $259.41 (Teachers Health only)', () => {
  // Teachers Health due May 1, before payday May 15
  // Afterpay Concert due May 31, after payday — excluded
  expect(getActiveDebtsDueBeforePayday()).toBe(259.41);
});

test('getDynamicDailyBudget() returns ~$16/day', () => {
  // bal $779.50 - bills $262.63 - TH $259.41 = $257.46
  // $257.46 / 16 days = $16.09
  const budget = getDynamicDailyBudget();
  expect(budget).toBeGreaterThan(14);
  expect(budget).toBeLessThan(20);
});

test('getSurvivalMode() returns tight not critical', () => {
  // bal $779.50 > $300, dailyAvailable ~$16 < $25
  const mode = getSurvivalMode();
  expect(mode).toEqual('tight');
});

test('calculateNetWorth() returns positive ~$4,422', () => {
  const nw = calculateNetWorth();
  expect(nw.net).toBeGreaterThan(4000);
  expect(nw.net).toBeLessThan(5000);
});

test('calculateNetWorth() assets include super', () => {
  const nw = calculateNetWorth();
  expect(nw.breakdown.superBalance).toBe(63429.15);
});

test('calculateNetWorth() does not include viaRent debts as liability', () => {
  const nw = calculateNetWorth();
  // Property Deposit (via Mum) should NOT be in liabilities
  expect(nw.liabilities).toBeLessThan(25000); // just KIA loan + small debts
});

// ── Summary ─────────────────────────────────────────────
console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);

Create tests directory and this file.
Run: node tests/core.test.js
All tests must pass before pushing.

VERIFY: File exists at tests/core.test.js
VERIFY: node tests/core.test.js exits with code 0
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FINAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Run node guardian-all.js — must pass 100%.
Run node tests/core.test.js — must pass 100%.

Final verification — search for ALL:
1.  "_debtAuditV1" ✓
2.  "isBillDueThisMonth" ✓
3.  "dueMonth" in BILLS ✓
4.  "dueMonths" in BILLS ✓
5.  "_paidBillsKeyMigrationV1" ✓
6.  "legacyNames" in isThisMonthlyBillPaid ✓
7.  "getBucketTotal" NOT in getDynamicDailyBudget ✓
8.  "getActiveDebtsDueBeforePayday" uses delayDate only ✓
9.  "renderSuperCard" ✓
10. "superBalance" in calculateNetWorth ✓
11. "confirmSuperBalance" ✓
12. "tests/core.test.js" exists ✓
13. "Health Insurance (qtrly avg)" NOT found ✓
14. "WRX fines" NOT in active debts ✓

git add index.html tests/core.test.js
git commit -m "fix: core calculation audit — ghost debt removed, bill frequency filtering, bucket double-count fixed, survival mode honest, super added, unit tests"
git push