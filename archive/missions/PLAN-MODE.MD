Read index.html fully.
Run node guardian-all.js and confirm current state.
Execute each section ONE AT A TIME.
Verify each section exists in the file before continuing.
Run guardian after each section.

You are building a FUTURE PLANNING MODE for SLYGHT.
This is not another dashboard tab. It is a completely different
experience that slides in from the right when the user swipes
or taps a dedicated button.

The user is John — Sydney, $117,500/year, WMS Consultant.
He has never saved consistently in his life. He responds to
specific numbers, honest projections, and seeing progress visually.
He gets excited seeing money grow. He loses motivation with
abstract goals and generic advice.

Design philosophy before writing any code:

1. Every number must be live and recalculated. Nothing static.
   When John logs a transaction the plan updates automatically.
   When the WRX sells the entire timeline reshuffles instantly.

2. Goals must feel alive not bureaucratic. A goal card should
   feel like a savings jar you can see filling up, not a
   spreadsheet row. Progress bars, dates, monthly contributions
   visible at a glance.

3. Boring framing kills motivation. "Emergency fund" is boring.
   "Freedom buffer — 3 months if everything goes wrong" is not.
   Name things in John's language.

4. The plan responds to windfalls. When a bonus arrives or the
   WRX sells, the app should intercept the moment and help John
   allocate before the money disappears into daily spending.

5. Multiple timelines, one truth. Show current pace AND optimised
   pace side by side. Make the optimised path feel achievable
   not aspirational.

Study before implementing:
- Monzo's savings pots — visual, named, feel separate from balance
- Revolut's vaults — round-ups feed into goals, progress shown as
  percentage and projected date
- YNAB's age of money — one metric that shows financial health trend
- Wealthsimple's goal projection — shows two lines: current vs if you save more
- Apple's savings account — interest shown as it accrues daily, 
  makes saving feel active not passive
- Frollo's financial fitness — behaviour-based milestones not scores

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 1 — PLAN MODE ENTRY AND STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add a PLAN MODE toggle to the dashboard header.
A small "PLAN ›" pill button in the top right of the dashboard
next to the weather display.

When tapped, the plan mode slides in from the right
with a smooth CSS transition. The background shifts from
the dark dashboard black to a slightly different dark tone
(use a subtle blue-black: #0a0f1a) to signal mode change.

A "‹ NOW" button appears top left to slide back.

Plan mode has its own scroll area independent of the dashboard.
It does NOT use tabs. It is one long scrollable page with
clearly delineated sections.

Add to the HTML before closing </body>:

<div id="plan-mode" style="
  position: fixed;
  inset: 0;
  background: #0a0f1a;
  z-index: 500;
  transform: translateX(100%);
  transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  overflow-y: auto;
  padding-bottom: 100px;
">
  <!-- Header -->
  <div style="
    position: sticky;
    top: 0;
    background: #0a0f1a;
    padding: 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    z-index: 10;
  ">
    <button onclick="closePlanMode()" style="
      background: rgba(255,255,255,0.08);
      border: none;
      border-radius: 20px;
      color: #fff;
      padding: 8px 16px;
      font-size: 13px;
      cursor: pointer;
    ">‹ NOW</button>
    <div style="color: #fff; font-size: 15px; font-weight: 700;
      letter-spacing: 1px;">FUTURE PLAN</div>
    <div style="width: 70px;"></div>
  </div>

  <!-- Plan content rendered here -->
  <div id="plan-content" style="padding: 16px;"></div>
</div>

Add to CSS:
.plan-open { transform: translateX(0%) !important; }

Add functions:
function openPlanMode() {
  document.getElementById('plan-mode').classList.add('plan-open');
  renderPlanMode();
}
function closePlanMode() {
  document.getElementById('plan-mode').classList.remove('plan-open');
}

Add "PLAN ›" button to dashboard header area.

VERIFY: Search "plan-mode" — must find.
VERIFY: Search "openPlanMode" — must find.
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 2 — FINANCIAL ENGINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Before rendering anything, build the planning data engine.
This is the brain of the plan mode. All calculations flow from here.

Add before closing </script>:

const PLAN = {

  // John's known financial facts
  INCOME_MONTHLY: 7300,         // after tax
  BONUS_QUARTERLY: 2000,        // after tax, approximate
  INCOME_GROSS: 117500,

  // KIA details — read from S if stored, fallback to known
  getKiaLoan() {
    // Look for KIA in debts or use carloan as proxy
    // Both cars under parents' names, John manages payments
    const kia = S.debts?.find(d =>
      d.name?.toLowerCase().includes('kia') ||
      d.name?.toLowerCase().includes('car loan')
    );
    return kia?.amt || S.carloan || 23214;
  },

  getKiaRate() {
    return S.carLoanRate || 9.87;
  },

  getKiaDailyInterest() {
    return parseFloat((this.getKiaLoan() * this.getKiaRate() / 100 / 365).toFixed(2));
  },

  // WRX status and proceeds
  getWrxStatus() {
    return S.wrxStatus || 'unlisted';
  },

  getWrxProceeds() {
    const salePrice = S.wrxValue || 21000;
    const loanBalance = this.getKiaLoan();
    // Net proceeds after clearing loan
    return Math.max(0, salePrice - loanBalance);
  },

  // What gets freed monthly after WRX sells
  getMonthlyFreed() {
    const carLoanPayment = 780;
    const fuelMonthly = 110;
    const wrxInsurance = 85; // NRMA annual / 12
    return carLoanPayment + fuelMonthly + wrxInsurance;
  },

  // Annual provisions — costs that happen once or twice a year
  // averaged to monthly amounts
  getAnnualProvisions() {
    return [
      {
        name: 'Teachers Health',
        annual: 259.41 * 4, // quarterly
        monthly: parseFloat((259.41 * 4 / 12).toFixed(2)),
        frequency: 'quarterly',
        nextDue: '2026-08-01',
        bucket: 'provisions'
      },
      {
        name: 'Car service (KIA)',
        annual: 500,
        monthly: 42,
        frequency: 'biannual',
        nextDue: '2026-10-01',
        bucket: 'provisions'
      },
      {
        name: 'KIA registration',
        annual: 462,
        monthly: 39,
        frequency: 'annual',
        nextDue: '2027-04-01',
        bucket: 'provisions'
      },
      {
        name: 'KIA green slip',
        annual: 552,
        monthly: 46,
        frequency: 'annual',
        nextDue: '2027-04-01',
        bucket: 'provisions'
      },
      {
        name: 'KIA insurance (NRMA)',
        annual: 1023.06,
        monthly: 85,
        frequency: 'annual',
        nextDue: '2027-05-01',
        bucket: 'provisions'
      }
    ];
  },

  getTotalProvisions() {
    return this.getAnnualProvisions().reduce((s,p) => s + p.monthly, 0);
  },

  // Life events / trips
  getTrips() {
    const stored = JSON.parse(localStorage.getItem('slyght_trips') || '[]');
    // Merge with known trips if not already stored
    const defaults = [
      {
        id: 'darwin-2026',
        name: 'Darwin',
        emoji: '🐊',
        startDate: '2026-06-07',
        endDate: '2026-06-15',
        days: 9,
        covered: ['flights', 'accommodation', 'car hire'],
        budget: 900,
        saved: 0,
        gfSplitting: true,
        notes: 'Looking after uncle\'s dog. GF coming.'
      },
      {
        id: 'china-2026',
        name: 'China',
        emoji: '🇨🇳',
        startDate: '2026-12-01',
        endDate: '2026-12-22',
        days: 21,
        covered: [],
        budget: 5000, // her estimate excluding flights
        saved: S.savingsBuckets?.find(b => b.name === 'China Holiday')?.saved || 70.44,
        gfSplitting: true,
        stayingWithFamily: true,
        notes: 'Staying with her family and friends. Budget excludes flights.'
      }
    ];

    // Merge: use stored version if exists, else use default
    return defaults.map(def => {
      const stored_trip = stored.find(t => t.id === def.id);
      return stored_trip || def;
    }).concat(stored.filter(t => !defaults.find(d => d.id === t.id)));
  },

  saveTrip(trip) {
    const trips = this.getTrips();
    const idx = trips.findIndex(t => t.id === trip.id);
    if (idx >= 0) trips[idx] = trip;
    else trips.push(trip);
    localStorage.setItem('slyght_trips', JSON.stringify(trips));
  },

  // Goals
  getGoals() {
    const stored = JSON.parse(localStorage.getItem('slyght_goals') || '[]');
    const nw = calculateNetWorth ? calculateNetWorth() : { net: -7305 };

    const defaults = [
      {
        id: 'apartment',
        name: 'Apartment deposit',
        emoji: '🏠',
        description: 'Inner west / Meadowbank / Kogarah area. Parents as guarantors.',
        target: 50000,
        saved: S.savingsBuckets?.find(b => b.name === 'Rainy Day Fund')?.saved || 0,
        monthly: 0, // calculated dynamically
        targetDate: null, // calculated
        colour: '#4ECDC4',
        priority: 1,
        notes: 'With guarantors, $50k demonstrates genuine savings history. Budget $550-700k property.'
      },
      {
        id: 'freedom-buffer',
        name: 'Freedom buffer',
        emoji: '🛡️',
        description: '3 months expenses if everything goes wrong',
        target: 9000, // 3 × $3,000 monthly expenses
        saved: S.savingsBuckets?.find(b => b.name === 'Rainy Day Fund')?.saved || 0,
        monthly: 0,
        targetDate: null,
        colour: '#FF6B35',
        priority: 2,
        notes: 'First milestone: $1,000 buffer. Second: $3,000. Final: $9,000.'
      },
      {
        id: 'china',
        name: 'China holiday',
        emoji: '🇨🇳',
        description: 'End of 2026 with GF. Staying with family and friends.',
        target: 5000,
        saved: S.savingsBuckets?.find(b => b.name === 'China Holiday')?.saved || 70.44,
        monthly: 0,
        targetDate: '2026-11-01',
        colour: '#E74C3C',
        priority: 3,
        notes: 'Her estimate $5k excluding flights. Flights additional ~$1,200 return.'
      }
    ];

    return defaults.map(def => {
      const stored_goal = stored.find(g => g.id === def.id);
      return stored_goal ? { ...def, ...stored_goal } : def;
    }).concat(stored.filter(g => !defaults.find(d => d.id === g.id)));
  },

  saveGoal(goal) {
    const goals = this.getGoals();
    const idx = goals.findIndex(g => g.id === goal.id);
    if (idx >= 0) goals[idx] = goal;
    else goals.push(goal);
    localStorage.setItem('slyght_goals', JSON.stringify(goals));
  },

  // Monthly surplus after WRX sold
  getPostWrxSurplus() {
    const income = this.INCOME_MONTHLY;
    const fixedBills = BILLS
      .filter(b => b.recurring)
      .reduce((s,b) => s + b.amt, 0);
    const provisions = this.getTotalProvisions();
    const mumPayment = 500;
    const foodBudget = 400; // target
    const miscLiving = 300;

    return income - fixedBills - provisions - mumPayment - foodBudget - miscLiving;
  },

  // Months until a goal is reached
  monthsToGoal(goal, monthlyContribution) {
    const remaining = Math.max(0, goal.target - goal.saved);
    if (monthlyContribution <= 0) return 999;
    return Math.ceil(remaining / monthlyContribution);
  },

  // Date from months
  dateFromMonths(months) {
    if (months >= 999) return 'Not on current path';
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    return d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
  },

  // WRX impact simulation
  getWrxImpact() {
    const salePrice = S.wrxValue || 21000;
    const loanBalance = this.getKiaLoan();
    const netProceeds = Math.max(0, salePrice - loanBalance);
    const monthlyFreed = this.getMonthlyFreed();
    const currentSurplus = this.getPostWrxSurplus();

    // Early repayment interest saved
    const remainingLoanMonths = 24; // estimate
    const interestSaved = loanBalance * (this.getKiaRate() / 100 / 12) * remainingLoanMonths * 0.5;
    const earlyRepayFee = loanBalance * (this.getKiaRate() / 100 / 12) * 2; // 2 months interest

    return {
      salePrice,
      loanBalance,
      netProceeds,
      monthlyFreed,
      interestSaved: parseFloat(interestSaved.toFixed(2)),
      earlyRepayFee: parseFloat(earlyRepayFee.toFixed(2)),
      worthPayingOff: interestSaved > earlyRepayFee,
      newNetWorth: calculateNetWorth ? calculateNetWorth().net + netProceeds : 0
    };
  }
};

VERIFY: Search "const PLAN" — must find.
VERIFY: Search "getPostWrxSurplus" — must find.
VERIFY: Search "slyght_trips" — must find.
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 3 — PLAN MODE RENDERER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add the main render function for plan mode.
This builds the entire plan page dynamically from live data.

function renderPlanMode() {
  const el = document.getElementById('plan-content');
  if (!el) return;

  const nw = calculateNetWorth ? calculateNetWorth() : { net: -7305, assets: 21849, liabilities: 29154 };
  const wrxImpact = PLAN.getWrxImpact();
  const surplus = PLAN.getPostWrxSurplus();
  const trips = PLAN.getTrips();
  const goals = PLAN.getGoals();
  const provisions = PLAN.getAnnualProvisions();

  let html = '';

  // ── NET WORTH HEADER ─────────────────────────────────────
  const nwPositive = nw.net >= 0;
  html += `
  <div style="text-align:center;padding:20px 0 8px">
    <div style="font-size:12px;color:rgba(255,255,255,0.4);
      text-transform:uppercase;letter-spacing:2px;margin-bottom:8px">
      NET WORTH TODAY
    </div>
    <div style="font-size:42px;font-weight:800;
      color:${nwPositive ? '#4ECDC4' : '#FF6B35'};
      font-variant-numeric:tabular-nums">
      ${nwPositive ? '+' : ''}$${Math.abs(Math.round(nw.net)).toLocaleString()}
    </div>
    <div style="font-size:13px;color:rgba(255,255,255,0.4);margin-top:4px">
      ${nwPositive ? 'You\'re ahead' : 'The number that needs to change'}
    </div>
  </div>`;

  // ── WRX STATUS CARD ──────────────────────────────────────
  const wrxListed = S.wrxStatus === 'listed';
  const wrxSold = S.wrxStatus === 'sold';

  html += `
  <div style="background:${wrxSold ? 'rgba(78,205,196,0.1)' : wrxListed ?
    'rgba(255,107,53,0.08)' : 'rgba(231,76,60,0.08)'};
    border:1px solid ${wrxSold ? '#4ECDC4' : wrxListed ? '#FF6B35' : '#E74C3C'};
    border-radius:16px;padding:16px;margin-bottom:16px">
    <div style="display:flex;justify-content:space-between;align-items:center;
      margin-bottom:12px">
      <div style="font-size:13px;font-weight:700;color:#fff">
        🚗 WRX — ${wrxSold ? 'SOLD ✅' : wrxListed ? 'LISTED — waiting for buyer' : 'NOT LISTED'}
      </div>
      <div style="font-size:11px;color:rgba(255,255,255,0.4)">
        $${(PLAN.getKiaDailyInterest()).toFixed(2)}/day interest
      </div>
    </div>`;

  if (!wrxSold) {
    html += `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
      <div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:12px">
        <div style="color:rgba(255,255,255,0.4);font-size:10px;margin-bottom:4px">SALE PRICE</div>
        <div style="color:#fff;font-size:18px;font-weight:700">
          $${(S.wrxValue||21000).toLocaleString()}
        </div>
      </div>
      <div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:12px">
        <div style="color:rgba(255,255,255,0.4);font-size:10px;margin-bottom:4px">LOAN BALANCE</div>
        <div style="color:#FF6B35;font-size:18px;font-weight:700">
          $${Math.round(PLAN.getKiaLoan()).toLocaleString()}
        </div>
      </div>
      <div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:12px">
        <div style="color:rgba(255,255,255,0.4);font-size:10px;margin-bottom:4px">NET AFTER LOAN</div>
        <div style="color:${wrxImpact.netProceeds > 0 ? '#4ECDC4' : '#E74C3C'};
          font-size:18px;font-weight:700">
          ${wrxImpact.netProceeds > 0 ? '+' : ''}$${Math.round(wrxImpact.netProceeds).toLocaleString()}
        </div>
      </div>
      <div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:12px">
        <div style="color:rgba(255,255,255,0.4);font-size:10px;margin-bottom:4px">FREED/MONTH</div>
        <div style="color:#4ECDC4;font-size:18px;font-weight:700">
          +$${PLAN.getMonthlyFreed().toLocaleString()}
        </div>
      </div>
    </div>
    <div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:12px;
      margin-bottom:8px">
      <div style="color:rgba(255,255,255,0.6);font-size:12px;margin-bottom:4px">
        Early repayment: pay $${wrxImpact.earlyRepayFee.toFixed(0)} fee,
        save $${wrxImpact.interestSaved.toFixed(0)} in interest
      </div>
      <div style="color:${wrxImpact.worthPayingOff ? '#4ECDC4' : '#FF6B35'};
        font-size:13px;font-weight:600">
        ${wrxImpact.worthPayingOff
          ? '✅ Worth paying off early — saves $' +
            Math.round(wrxImpact.interestSaved - wrxImpact.earlyRepayFee).toLocaleString()
          : '⚠️ Check your contract — early repayment fee may not be worth it'}
      </div>
    </div>`;

    if (wrxListed) {
      html += `
      <div style="text-align:center;color:rgba(255,255,255,0.4);font-size:12px">
        Listed ${S.wrxListedDate ?
          Math.ceil((Date.now() - new Date(S.wrxListedDate)) / 86400000) + ' days ago'
          : 'recently'} ·
        Every day unlisted costs $${PLAN.getKiaDailyInterest().toFixed(2)}
      </div>`;
    }
  }

  html += `</div>`;

  // ── PAYDAY ALLOCATION ─────────────────────────────────────
  html += renderPaydayAllocation();

  // ── TRIPS ─────────────────────────────────────────────────
  html += renderTrips(trips);

  // ── GOALS ─────────────────────────────────────────────────
  html += renderGoalCards(goals, surplus);

  // ── ANNUAL PROVISIONS ─────────────────────────────────────
  html += renderAnnualProvisions(provisions);

  // ── INCOME GROWTH SIMULATOR ───────────────────────────────
  html += renderIncomeSimulator();

  el.innerHTML = html;

  // Wire sliders and interactive elements after render
  wirePaydaySliders();
  wireTripEditors();
  wireGoalEditors();
}

VERIFY: Search "renderPlanMode" — must find.
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 4 — PAYDAY ALLOCATION PLANNER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The most important section. Before payday John allocates
every dollar. The app holds him to it.

function renderPaydayAllocation() {
  const income = PLAN.INCOME_MONTHLY;
  const bonus = S._pendingBonus || 0;
  const total = income + bonus;
  const daysUntil = daysLeft();

  // Fixed allocations — non-negotiable
  const fixed = BILLS.filter(b => b.recurring && ['Fixed','Loan'].includes(b.tag))
    .reduce((s,b) => s + b.amt, 0);
  const provisions = PLAN.getTotalProvisions();
  const mumPayment = 500;
  const teachersHealth = S.debts.find(d =>
    d.name === 'Teachers Health' && !d.paid)?.amt || 0;

  const totalFixed = fixed + provisions + mumPayment + teachersHealth;
  const discretionary = Math.max(0, total - totalFixed);

  // Stored allocations
  const stored = JSON.parse(
    localStorage.getItem('slyght_payday_plan') || '{}'
  );

  const chinaGoal = PLAN.getGoals().find(g => g.id === 'china');
  const apartments = PLAN.getGoals().find(g => g.id === 'apartment');
  const freedomBuf = PLAN.getGoals().find(g => g.id === 'freedom-buffer');
  const darwinTrip = PLAN.getTrips().find(t => t.id === 'darwin-2026');

  // Default recommended allocations
  const defaults = {
    china: stored.china ?? 300,
    apartment: stored.apartment ?? 500,
    freedom: stored.freedom ?? 200,
    darwin: stored.darwin ?? 150,
    living: 0 // calculated as remainder
  };

  const allocatedGoals = defaults.china + defaults.apartment +
                         defaults.freedom + defaults.darwin;
  defaults.living = Math.max(0, discretionary - allocatedGoals);
  const dailyLiving = daysUntil > 0 ? defaults.living / daysUntil : 0;

  return `
  <div style="margin-bottom:16px">
    <div style="font-size:11px;color:rgba(255,255,255,0.4);text-transform:uppercase;
      letter-spacing:2px;margin-bottom:12px">NEXT PAYDAY — ${daysUntil} DAYS</div>

    <!-- Income bar -->
    <div style="background:rgba(255,255,255,0.05);border-radius:16px;padding:16px;
      margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <span style="color:rgba(255,255,255,0.6);font-size:13px">Arriving May 15</span>
        <span style="color:#4ECDC4;font-size:18px;font-weight:700">
          +$${total.toLocaleString()}
        </span>
      </div>
      ${bonus > 0 ? `
      <div style="font-size:12px;color:#FF6B35">
        Includes $${bonus.toLocaleString()} bonus 🎉
      </div>` : `
      <div style="font-size:12px;color:rgba(255,255,255,0.3)">
        Expecting a ~$2,000 quarterly bonus? 
        <span onclick="openBonusModal()" style="color:#4ECDC4;cursor:pointer">
          Add it →
        </span>
      </div>`}
    </div>

    <!-- Fixed commitments -->
    <div style="background:rgba(255,107,53,0.08);border-radius:12px;
      padding:14px;margin-bottom:8px">
      <div style="font-size:11px;color:#FF6B35;text-transform:uppercase;
        letter-spacing:1px;margin-bottom:8px">LOCKED — NON-NEGOTIABLE</div>
      ${[
        ['Rent', 3000],
        ['Car loan (Firstmac)', 780],
        ['Provisions (rego, service, health)', Math.round(provisions)],
        ['Owed to Mum', mumPayment],
        teachersHealth > 0 ? ['Teachers Health', teachersHealth] : null
      ].filter(Boolean).map(([name, amt]) => `
      <div style="display:flex;justify-content:space-between;
        padding:4px 0;font-size:13px">
        <span style="color:rgba(255,255,255,0.6)">${name}</span>
        <span style="color:#FF6B35">-$${amt.toLocaleString()}</span>
      </div>`).join('')}
      <div style="border-top:1px solid rgba(255,107,53,0.3);margin-top:8px;
        padding-top:8px;display:flex;justify-content:space-between">
        <span style="color:rgba(255,255,255,0.8);font-size:13px;font-weight:600">
          Remaining to allocate
        </span>
        <span style="color:#fff;font-size:15px;font-weight:700">
          $${discretionary.toLocaleString()}
        </span>
      </div>
    </div>

    <!-- Adjustable allocations -->
    <div style="background:rgba(78,205,196,0.06);border-radius:12px;
      padding:14px;margin-bottom:8px">
      <div style="font-size:11px;color:#4ECDC4;text-transform:uppercase;
        letter-spacing:1px;margin-bottom:12px">YOUR CHOICE — ADJUST THESE</div>

      ${[
        { id:'china', label:'🇨🇳 China holiday', colour:'#E74C3C',
          current: defaults.china, goal: chinaGoal },
        { id:'apartment', label:'🏠 Apartment deposit', colour:'#4ECDC4',
          current: defaults.apartment, goal: apartments },
        { id:'freedom', label:'🛡️ Freedom buffer', colour:'#FF6B35',
          current: defaults.freedom, goal: freedomBuf },
        { id:'darwin', label:'🐊 Darwin trip', colour:'#9B59B6',
          current: defaults.darwin, goal: darwinTrip }
      ].map(item => {
        const saved = item.goal?.saved || 0;
        const target = item.goal?.target || item.goal?.budget || 1000;
        const pct = Math.min(100, (saved / target * 100));
        return `
        <div style="margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;
            align-items:center;margin-bottom:6px">
            <span style="color:#fff;font-size:13px">${item.label}</span>
            <span style="color:${item.colour};font-size:14px;font-weight:700"
              id="alloc-val-${item.id}">$${item.current}</span>
          </div>
          <input type="range" id="alloc-${item.id}"
            min="0" max="${Math.round(discretionary)}" step="50"
            value="${item.current}"
            style="width:100%;accent-color:${item.colour};height:4px;
              margin-bottom:4px"
            oninput="updateAllocation('${item.id}', this.value)">
          <div style="display:flex;justify-content:space-between;
            font-size:10px;color:rgba(255,255,255,0.3)">
            <span>Saved: $${Math.round(saved).toLocaleString()} of $${target.toLocaleString()}</span>
            <span>${pct.toFixed(0)}% there</span>
          </div>
        </div>`;
      }).join('')}

      <!-- Living costs (remainder) -->
      <div style="border-top:1px solid rgba(255,255,255,0.08);
        padding-top:12px;margin-top:4px">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span style="color:rgba(255,255,255,0.6);font-size:13px">
            🍱 Living costs (food, transport, life)
          </span>
          <span style="color:#fff;font-size:14px;font-weight:700"
            id="alloc-val-living">$${Math.round(defaults.living)}</span>
        </div>
        <div style="font-size:12px;color:rgba(255,255,255,0.3)" id="daily-living-calc">
          = $${dailyLiving.toFixed(0)}/day for ${daysUntil} days
        </div>
      </div>

      <button onclick="lockPaydayPlan()" style="
        width:100%;padding:14px;margin-top:16px;
        background:linear-gradient(135deg, #4ECDC4, #26d0ce);
        border:none;border-radius:12px;
        color:#000;font-weight:800;font-size:15px;
        cursor:pointer;letter-spacing:0.5px">
        Lock this plan for May 15 →
      </button>
    </div>
  </div>`;
}

function updateAllocation(id, value) {
  const val = parseInt(value);
  document.getElementById('alloc-val-' + id).textContent = '$' + val;

  // Recalculate living costs
  const china = parseInt(document.getElementById('alloc-china')?.value || 0);
  const apartment = parseInt(document.getElementById('alloc-apartment')?.value || 0);
  const freedom = parseInt(document.getElementById('alloc-freedom')?.value || 0);
  const darwin = parseInt(document.getElementById('alloc-darwin')?.value || 0);

  const income = PLAN.INCOME_MONTHLY + (S._pendingBonus || 0);
  const fixed = BILLS.filter(b => b.recurring && ['Fixed','Loan'].includes(b.tag))
    .reduce((s,b) => s + b.amt, 0);
  const provisions = PLAN.getTotalProvisions();
  const discretionary = Math.max(0, income - fixed - provisions - 500);
  const living = Math.max(0, discretionary - china - apartment - freedom - darwin);
  const days = daysLeft();

  const livingEl = document.getElementById('alloc-val-living');
  const dailyEl = document.getElementById('daily-living-calc');
  if (livingEl) livingEl.textContent = '$' + Math.round(living);
  if (dailyEl) dailyEl.textContent =
    '= $' + (days > 0 ? (living/days).toFixed(0) : '0') + '/day for ' + days + ' days';

  // Auto-save
  const stored = JSON.parse(localStorage.getItem('slyght_payday_plan') || '{}');
  stored[id] = val;
  localStorage.setItem('slyght_payday_plan', JSON.stringify(stored));
}

function lockPaydayPlan() {
  const stored = JSON.parse(localStorage.getItem('slyght_payday_plan') || '{}');
  stored.locked = true;
  stored.lockedAt = new Date().toISOString();
  stored.payday = S.payday;
  localStorage.setItem('slyght_payday_plan', JSON.stringify(stored));
  showToast('✅ Plan locked — SLYGHT will hold you to this');

  // Update goal savings targets
  const goals = PLAN.getGoals();
  if (stored.china) {
    const chinaGoal = goals.find(g => g.id === 'china');
    if (chinaGoal) { chinaGoal.monthly = stored.china; PLAN.saveGoal(chinaGoal); }
  }
  if (stored.apartment) {
    const apGoal = goals.find(g => g.id === 'apartment');
    if (apGoal) { apGoal.monthly = stored.apartment; PLAN.saveGoal(apGoal); }
  }
}

function openBonusModal() {
  const amt = parseFloat(prompt('Expected bonus amount ($):') || '0');
  if (!isNaN(amt) && amt > 0) {
    S._pendingBonus = amt;
    save();
    renderPlanMode();
    showToast('Bonus of $' + amt + ' added to next payday plan');
  }
}

function wirePaydaySliders() {
  // Sliders are wired via oninput in HTML — no additional wiring needed
}

VERIFY: Search "renderPaydayAllocation" — must find.
VERIFY: Search "lockPaydayPlan" — must find.
VERIFY: Search "updateAllocation" — must find.
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 5 — TRIP PLANNER CARDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function renderTrips(trips) {
  const today = new Date();
  const upcoming = trips
    .filter(t => new Date(t.endDate) >= today)
    .sort((a,b) => new Date(a.startDate) - new Date(b.startDate));

  if (!upcoming.length) return '';

  let html = `
  <div style="margin-bottom:16px">
    <div style="display:flex;justify-content:space-between;align-items:center;
      margin-bottom:12px">
      <div style="font-size:11px;color:rgba(255,255,255,0.4);text-transform:uppercase;
        letter-spacing:2px">UPCOMING TRIPS</div>
      <button onclick="addNewTrip()" style="background:rgba(255,255,255,0.08);
        border:none;border-radius:20px;color:rgba(255,255,255,0.6);
        padding:6px 12px;font-size:11px;cursor:pointer">+ Add trip</button>
    </div>`;

  upcoming.forEach(trip => {
    const start = new Date(trip.startDate);
    const end = new Date(trip.endDate);
    const daysUntil = Math.ceil((start - today) / 86400000);
    const daysLong = Math.ceil((end - start) / 86400000) + 1;
    const monthsUntil = Math.ceil(daysUntil / 30);
    const remaining = Math.max(0, (trip.budget || 0) - (trip.saved || 0));
    const monthlyNeeded = monthsUntil > 0 ? Math.ceil(remaining / monthsUntil) : remaining;
    const pct = trip.budget > 0
      ? Math.min(100, ((trip.saved || 0) / trip.budget * 100))
      : 0;

    const isActive = today >= start && today <= end;
    const isPast = today > end;

    html += `
    <div style="background:rgba(255,255,255,0.04);border-radius:16px;
      padding:16px;margin-bottom:10px;
      border:1px solid rgba(255,255,255,0.06)" id="trip-${trip.id}">

      <div style="display:flex;justify-content:space-between;
        align-items:flex-start;margin-bottom:12px">
        <div>
          <div style="font-size:20px;margin-bottom:4px">${trip.emoji} ${trip.name}</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.4)">
            ${start.toLocaleDateString('en-AU', {day:'numeric',month:'short'})} –
            ${end.toLocaleDateString('en-AU', {day:'numeric',month:'short',year:'numeric'})}
            · ${daysLong} days
          </div>
        </div>
        <div style="text-align:right">
          ${isActive
            ? '<div style="color:#4ECDC4;font-size:12px;font-weight:700">YOU\'RE HERE ✈️</div>'
            : isPast
            ? '<div style="color:rgba(255,255,255,0.3);font-size:12px">COMPLETED</div>'
            : `<div style="color:rgba(255,255,255,0.6);font-size:12px">${daysUntil} days away</div>`}
        </div>
      </div>

      ${trip.covered && trip.covered.length > 0 ? `
      <div style="margin-bottom:10px">
        ${trip.covered.map(c => `
        <span style="background:rgba(78,205,196,0.15);color:#4ECDC4;
          font-size:10px;padding:3px 8px;border-radius:10px;
          margin-right:4px">✅ ${c}</span>`).join('')}
      </div>` : ''}

      <div style="display:flex;gap:12px;margin-bottom:12px">
        <div style="flex:1;background:rgba(255,255,255,0.05);
          border-radius:10px;padding:10px">
          <div style="color:rgba(255,255,255,0.4);font-size:10px;margin-bottom:4px">
            SPENDING BUDGET
          </div>
          <div style="color:#fff;font-size:18px;font-weight:700">
            $${(trip.budget || 0).toLocaleString()}
          </div>
          <div style="color:rgba(255,255,255,0.4);font-size:10px;margin-top:2px">
            $${daysLong > 0 ? Math.round(trip.budget / daysLong) : 0}/day avg
            ${trip.gfSplitting ? '(your share)' : ''}
          </div>
        </div>
        <div style="flex:1;background:rgba(255,255,255,0.05);
          border-radius:10px;padding:10px">
          <div style="color:rgba(255,255,255,0.4);font-size:10px;margin-bottom:4px">
            SAVED SO FAR
          </div>
          <div style="color:#4ECDC4;font-size:18px;font-weight:700">
            $${Math.round(trip.saved || 0).toLocaleString()}
          </div>
          <div style="color:rgba(255,255,255,0.4);font-size:10px;margin-top:2px">
            $${remaining.toLocaleString()} to go
          </div>
        </div>
      </div>

      <!-- Progress bar -->
      <div style="background:rgba(255,255,255,0.08);border-radius:4px;
        height:6px;margin-bottom:8px">
        <div style="background:linear-gradient(90deg,#4ECDC4,#26d0ce);
          width:${pct}%;height:100%;border-radius:4px;
          transition:width 0.5s ease"></div>
      </div>

      ${!isPast && monthlyNeeded > 0 ? `
      <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:10px">
        Save $${monthlyNeeded}/month to reach your budget by departure
      </div>` : ''}

      ${trip.notes ? `
      <div style="font-size:11px;color:rgba(255,255,255,0.3);
        font-style:italic;margin-bottom:10px">${trip.notes}</div>` : ''}

      <div style="display:flex;gap:8px">
        <button onclick="editTrip('${trip.id}')"
          style="flex:1;padding:8px;background:rgba(255,255,255,0.06);
          border:1px solid rgba(255,255,255,0.1);border-radius:8px;
          color:rgba(255,255,255,0.6);font-size:12px;cursor:pointer">
          ✏️ Edit budget
        </button>
        <button onclick="addTripSavings('${trip.id}')"
          style="flex:1;padding:8px;background:rgba(78,205,196,0.15);
          border:1px solid rgba(78,205,196,0.3);border-radius:8px;
          color:#4ECDC4;font-size:12px;cursor:pointer">
          + Add savings
        </button>
      </div>
    </div>`;
  });

  html += '</div>';
  return html;
}

function editTrip(tripId) {
  const trips = PLAN.getTrips();
  const trip = trips.find(t => t.id === tripId);
  if (!trip) return;

  const newBudget = parseFloat(
    prompt('Spending budget for ' + trip.name + ' ($):', trip.budget) || trip.budget
  );
  if (!isNaN(newBudget) && newBudget >= 0) {
    trip.budget = newBudget;
    PLAN.saveTrip(trip);
    renderPlanMode();
    showToast('✅ ' + trip.name + ' budget updated to $' + newBudget);
  }
}

function addTripSavings(tripId) {
  const trips = PLAN.getTrips();
  const trip = trips.find(t => t.id === tripId);
  if (!trip) return;

  const amt = parseFloat(prompt('Amount saved for ' + trip.name + ':') || '0');
  if (!isNaN(amt) && amt > 0) {
    trip.saved = (trip.saved || 0) + amt;
    PLAN.saveTrip(trip);
    renderPlanMode();
    showToast('✅ $' + amt + ' added to ' + trip.name + ' fund');
  }
}

function addNewTrip() {
  const name = prompt('Trip name:');
  if (!name) return;
  const emoji = prompt('Emoji (e.g. 🏖️):') || '✈️';
  const startDate = prompt('Start date (YYYY-MM-DD):') || '';
  const endDate = prompt('End date (YYYY-MM-DD):') || '';
  const budget = parseFloat(prompt('Spending budget ($):') || '0');

  const trip = {
    id: 'trip-' + Date.now(),
    name, emoji, startDate, endDate,
    days: startDate && endDate
      ? Math.ceil((new Date(endDate) - new Date(startDate)) / 86400000) + 1
      : 7,
    budget, saved: 0,
    covered: [],
    gfSplitting: false,
    notes: ''
  };

  PLAN.saveTrip(trip);
  renderPlanMode();
  showToast('✅ ' + name + ' trip added');
}

function wireTripEditors() {
  // Trip interactions wired via onclick in HTML
}

VERIFY: Search "renderTrips" — must find.
VERIFY: Search "editTrip" — must find.
VERIFY: Search "addNewTrip" — must find.
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 6 — GOAL CARDS WITH TIMELINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function renderGoalCards(goals, surplus) {
  let html = `
  <div style="margin-bottom:16px">
    <div style="display:flex;justify-content:space-between;align-items:center;
      margin-bottom:12px">
      <div style="font-size:11px;color:rgba(255,255,255,0.4);text-transform:uppercase;
        letter-spacing:2px">YOUR GOALS</div>
      <button onclick="addNewGoal()" style="background:rgba(255,255,255,0.08);
        border:none;border-radius:20px;color:rgba(255,255,255,0.6);
        padding:6px 12px;font-size:11px;cursor:pointer">+ Add goal</button>
    </div>`;

  goals.filter(g => !g.completed).forEach(goal => {
    const remaining = Math.max(0, goal.target - goal.saved);
    const pct = Math.min(100, (goal.saved / goal.target * 100));
    const monthlyAlloc = goal.monthly || 0;
    const postWrxSurplus = PLAN.getPostWrxSurplus();

    // Three scenarios
    const moAtCurrent = PLAN.monthsToGoal(goal, monthlyAlloc);
    const moPostWrx = PLAN.monthsToGoal(goal, monthlyAlloc + (postWrxSurplus * 0.3));
    const moWithBonus = Math.ceil(
      remaining / (monthlyAlloc + (PLAN.BONUS_QUARTERLY / 3))
    );

    const progressColour = pct >= 75 ? '#4ECDC4' : pct >= 40 ? '#FF6B35' : goal.colour;

    html += `
    <div style="background:rgba(255,255,255,0.04);border-radius:16px;
      padding:16px;margin-bottom:10px;
      border:1px solid rgba(255,255,255,0.06)">

      <div style="display:flex;justify-content:space-between;
        align-items:flex-start;margin-bottom:12px">
        <div>
          <div style="font-size:22px;margin-bottom:4px">${goal.emoji}</div>
          <div style="color:#fff;font-size:15px;font-weight:700">${goal.name}</div>
          <div style="color:rgba(255,255,255,0.4);font-size:11px;margin-top:2px">
            ${goal.description || ''}
          </div>
        </div>
        <div style="text-align:right">
          <div style="color:${progressColour};font-size:22px;font-weight:800">
            ${Math.round(pct)}%
          </div>
          <div style="color:rgba(255,255,255,0.3);font-size:10px">complete</div>
        </div>
      </div>

      <!-- Progress bar with milestone markers -->
      <div style="position:relative;background:rgba(255,255,255,0.08);
        border-radius:6px;height:8px;margin-bottom:8px">
        <div style="background:linear-gradient(90deg,${goal.colour},${progressColour});
          width:${pct}%;height:100%;border-radius:6px;
          transition:width 0.8s ease"></div>
        <!-- 25% milestone -->
        <div style="position:absolute;top:-2px;left:25%;width:2px;height:12px;
          background:rgba(255,255,255,0.15)"></div>
        <!-- 50% milestone -->
        <div style="position:absolute;top:-2px;left:50%;width:2px;height:12px;
          background:rgba(255,255,255,0.15)"></div>
        <!-- 75% milestone -->
        <div style="position:absolute;top:-2px;left:75%;width:2px;height:12px;
          background:rgba(255,255,255,0.15)"></div>
      </div>

      <div style="display:flex;justify-content:space-between;
        font-size:12px;color:rgba(255,255,255,0.4);margin-bottom:14px">
        <span>$${Math.round(goal.saved).toLocaleString()} saved</span>
        <span>$${goal.target.toLocaleString()} goal</span>
      </div>

      <!-- Timeline scenarios -->
      <div style="background:rgba(255,255,255,0.03);border-radius:10px;padding:12px;
        margin-bottom:12px">
        <div style="font-size:10px;color:rgba(255,255,255,0.3);
          text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">
          HOW LONG?
        </div>
        ${[
          {
            label: 'Saving $' + monthlyAlloc + '/month',
            months: moAtCurrent,
            colour: '#FF6B35'
          },
          {
            label: 'After WRX sold + food cuts',
            months: moPostWrx,
            colour: '#4ECDC4'
          },
          {
            label: 'With every quarterly bonus',
            months: moWithBonus,
            colour: '#9B59B6'
          }
        ].map(s => `
        <div style="display:flex;justify-content:space-between;
          align-items:center;padding:6px 0;
          border-bottom:1px solid rgba(255,255,255,0.04)">
          <span style="color:rgba(255,255,255,0.5);font-size:12px">${s.label}</span>
          <span style="color:${s.colour};font-size:13px;font-weight:700">
            ${s.months >= 999 ? '—' : PLAN.dateFromMonths(s.months)}
          </span>
        </div>`).join('')}
      </div>

      <!-- What gets you there faster -->
      ${goal.id === 'apartment' ? `
      <div style="font-size:12px;color:rgba(255,255,255,0.4);margin-bottom:12px">
        💡 Every quarterly bonus here saves 3 months.
        Every $500 food saving = 1 month earlier.
      </div>` : ''}

      ${goal.id === 'china' ? `
      <div style="font-size:12px;color:rgba(255,255,255,0.4);margin-bottom:12px">
        💡 June bonus could cover half this goal in one hit.
        Round-ups add ~$3/month automatically.
      </div>` : ''}

      <!-- Actions -->
      <div style="display:flex;gap:8px">
        <button onclick="editGoal('${goal.id}')"
          style="flex:1;padding:8px;background:rgba(255,255,255,0.06);
          border:1px solid rgba(255,255,255,0.1);border-radius:8px;
          color:rgba(255,255,255,0.6);font-size:12px;cursor:pointer">
          ✏️ Edit
        </button>
        <button onclick="addGoalSavings('${goal.id}')"
          style="flex:1;padding:8px;background:rgba(78,205,196,0.15);
          border:1px solid rgba(78,205,196,0.3);border-radius:8px;
          color:#4ECDC4;font-size:12px;cursor:pointer">
          + Add savings
        </button>
        <button onclick="markGoalComplete('${goal.id}')"
          style="padding:8px 12px;background:rgba(255,255,255,0.06);
          border:1px solid rgba(255,255,255,0.1);border-radius:8px;
          color:rgba(255,255,255,0.4);font-size:12px;cursor:pointer">
          ✅
        </button>
      </div>
    </div>`;
  });

  html += '</div>';
  return html;
}

function editGoal(goalId) {
  const goals = PLAN.getGoals();
  const goal = goals.find(g => g.id === goalId);
  if (!goal) return;
  const newTarget = parseFloat(prompt('Target amount ($):', goal.target) || goal.target);
  const newMonthly = parseFloat(prompt('Monthly contribution ($):', goal.monthly || 0) || 0);
  if (!isNaN(newTarget)) goal.target = newTarget;
  if (!isNaN(newMonthly)) goal.monthly = newMonthly;
  PLAN.saveGoal(goal);
  renderPlanMode();
  showToast('✅ ' + goal.name + ' updated');
}

function addGoalSavings(goalId) {
  const goals = PLAN.getGoals();
  const goal = goals.find(g => g.id === goalId);
  if (!goal) return;
  const amt = parseFloat(prompt('Amount to add to ' + goal.name + ':') || '0');
  if (!isNaN(amt) && amt > 0) {
    goal.saved = (goal.saved || 0) + amt;
    PLAN.saveGoal(goal);

    // Also update China Holiday bucket in S if applicable
    if (goalId === 'china') {
      const bucket = S.savingsBuckets?.find(b => b.name === 'China Holiday');
      if (bucket) { bucket.saved = goal.saved; save(); }
    }
    renderPlanMode();
    showToast('✅ $' + amt + ' added to ' + goal.name);
  }
}

function addNewGoal() {
  const name = prompt('Goal name (e.g. Holiday fund, New laptop):');
  if (!name) return;
  const emoji = prompt('Emoji:') || '🎯';
  const target = parseFloat(prompt('Target amount ($):') || '0');
  const monthly = parseFloat(prompt('How much will you save per month ($)?') || '0');
  const description = prompt('Description (optional):') || '';

  const goal = {
    id: 'goal-' + Date.now(),
    name, emoji, target, saved: 0, monthly,
    description, colour: '#4ECDC4',
    priority: 99
  };

  PLAN.saveGoal(goal);
  renderPlanMode();
  showToast('✅ ' + name + ' goal added');
}

function markGoalComplete(goalId) {
  if (!confirm('Mark this goal as complete?')) return;
  const goals = PLAN.getGoals();
  const goal = goals.find(g => g.id === goalId);
  if (goal) { goal.completed = true; PLAN.saveGoal(goal); }
  renderPlanMode();
  showToast('🎉 Goal complete!');
}

function wireGoalEditors() {
  // Wired via onclick
}

VERIFY: Search "renderGoalCards" — must find.
VERIFY: Search "addNewGoal" — must find.
VERIFY: Search "addGoalSavings" — must find.
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 7 — ANNUAL PROVISIONS + INCOME SIMULATOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function renderAnnualProvisions(provisions) {
  const total = PLAN.getTotalProvisions();
  const now = new Date();

  return `
  <div style="margin-bottom:16px">
    <div style="font-size:11px;color:rgba(255,255,255,0.4);text-transform:uppercase;
      letter-spacing:2px;margin-bottom:12px">ANNUAL PROVISIONS</div>
    <div style="background:rgba(255,255,255,0.04);border-radius:16px;padding:16px;
      border:1px solid rgba(255,255,255,0.06)">
      <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:12px">
        Put aside $${Math.round(total)}/month and you'll never be blindsided by
        annual costs again. These costs are real — they just don't feel urgent
        until they're due.
      </div>
      ${provisions.map(p => {
        const nextDue = new Date(p.nextDue);
        const monthsUntil = Math.max(0,
          (nextDue.getFullYear() - now.getFullYear()) * 12 +
          nextDue.getMonth() - now.getMonth()
        );
        return `
        <div style="display:flex;justify-content:space-between;align-items:center;
          padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
          <div>
            <div style="color:#fff;font-size:13px">${p.name}</div>
            <div style="color:rgba(255,255,255,0.3);font-size:11px">
              ${p.frequency} · $${p.annual.toLocaleString()}/yr ·
              due ${monthsUntil === 0 ? 'this month' : 'in ' + monthsUntil + ' months'}
            </div>
          </div>
          <div style="text-align:right">
            <div style="color:#FF6B35;font-size:14px;font-weight:700">
              $${p.monthly}/mo
            </div>
          </div>
        </div>`;
      }).join('')}
      <div style="display:flex;justify-content:space-between;padding-top:12px;
        margin-top:4px">
        <span style="color:rgba(255,255,255,0.6);font-size:13px;font-weight:600">
          Total to set aside
        </span>
        <span style="color:#FF6B35;font-size:15px;font-weight:800">
          $${Math.round(total)}/month
        </span>
      </div>
    </div>
  </div>`;
}

function renderIncomeSimulator() {
  const currentIncome = PLAN.INCOME_MONTHLY;
  const currentAnnual = PLAN.INCOME_GROSS;

  return `
  <div style="margin-bottom:32px">
    <div style="font-size:11px;color:rgba(255,255,255,0.4);text-transform:uppercase;
      letter-spacing:2px;margin-bottom:12px">INCOME GROWTH SIMULATOR</div>
    <div style="background:rgba(255,255,255,0.04);border-radius:16px;padding:16px;
      border:1px solid rgba(255,255,255,0.06)">

      <div style="font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:16px">
        A $5-10k raise feels small. Here's what it actually does to your timelines.
      </div>

      <div style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
          <span style="color:rgba(255,255,255,0.6);font-size:13px">
            Salary: <span id="sim-salary-display">$${currentAnnual.toLocaleString()}</span>
          </span>
          <span style="color:#4ECDC4;font-size:13px;font-weight:700"
            id="sim-monthly-display">
            $${currentIncome.toLocaleString()}/mo
          </span>
        </div>
        <input type="range" id="income-sim-slider"
          min="${currentAnnual}"
          max="${currentAnnual + 50000}"
          step="5000"
          value="${currentAnnual}"
          style="width:100%;accent-color:#4ECDC4;height:4px"
          oninput="updateIncomeSim(this.value)">
        <div style="display:flex;justify-content:space-between;
          font-size:10px;color:rgba(255,255,255,0.3);margin-top:4px">
          <span>Current: $${currentAnnual.toLocaleString()}</span>
          <span>+$50k: $${(currentAnnual + 50000).toLocaleString()}</span>
        </div>
      </div>

      <div id="income-sim-results" style="background:rgba(255,255,255,0.03);
        border-radius:10px;padding:12px">
        <div style="color:rgba(255,255,255,0.4);font-size:12px;text-align:center">
          Slide to see how a raise changes your timelines
        </div>
      </div>
    </div>
  </div>`;
}

function updateIncomeSim(annualSalary) {
  const annual = parseInt(annualSalary);
  const current = PLAN.INCOME_GROSS;
  const increase = annual - current;

  // Rough after-tax calculation (32.5% marginal for $120-180k)
  const taxRate = 0.325;
  const extraMonthly = Math.round((increase * (1 - taxRate)) / 12);
  const newMonthly = PLAN.INCOME_MONTHLY + extraMonthly;

  document.getElementById('sim-salary-display').textContent =
    '$' + annual.toLocaleString();
  document.getElementById('sim-monthly-display').textContent =
    '$' + newMonthly.toLocaleString() + '/mo';

  const goals = PLAN.getGoals();
  const chinaGoal = goals.find(g => g.id === 'china');
  const apGoal = goals.find(g => g.id === 'apartment');

  const chinaMonthly = (chinaGoal?.monthly || 300) + Math.round(extraMonthly * 0.2);
  const apMonthly = (apGoal?.monthly || 500) + Math.round(extraMonthly * 0.5);

  const chMonths = PLAN.monthsToGoal(chinaGoal || { saved: 70, target: 5000 }, chinaMonthly);
  const apMonths = PLAN.monthsToGoal(apGoal || { saved: 70, target: 50000 }, apMonthly);

  const resultsEl = document.getElementById('income-sim-results');
  if (!resultsEl) return;

  if (increase === 0) {
    resultsEl.innerHTML = `
    <div style="color:rgba(255,255,255,0.4);font-size:12px;text-align:center">
      Slide to see how a raise changes your timelines
    </div>`;
    return;
  }

  resultsEl.innerHTML = `
  <div style="font-size:13px;font-weight:700;color:#4ECDC4;margin-bottom:10px">
    +$${increase.toLocaleString()} raise = +$${extraMonthly}/month after tax
  </div>
  ${[
    { label: '🇨🇳 China holiday', date: PLAN.dateFromMonths(chMonths) },
    { label: '🏠 Apartment deposit', date: PLAN.dateFromMonths(apMonths) }
  ].map(r => `
  <div style="display:flex;justify-content:space-between;padding:6px 0;
    border-bottom:1px solid rgba(255,255,255,0.04)">
    <span style="color:rgba(255,255,255,0.6);font-size:12px">${r.label}</span>
    <span style="color:#4ECDC4;font-size:12px;font-weight:600">${r.date}</span>
  </div>`).join('')}
  <div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:8px">
    Rule: every raise goes straight to goals — never lifestyle.
    You don't feel it. Your future does.
  </div>`;
}

VERIFY: Search "renderAnnualProvisions" — must find.
VERIFY: Search "renderIncomeSimulator" — must find.
VERIFY: Search "updateIncomeSim" — must find.
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 8 — BONUS INTERCEPTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When John logs income tagged as bonus, intercept immediately
and open the plan mode with the bonus allocation pre-loaded.

In the transaction logging flow, after a transaction is saved,
check if it looks like a bonus:

function checkForBonusInterception(txn) {
  if (!txn.income) return;
  const isBonusLike = txn.amt >= 1000 &&
    (txn.note?.toLowerCase().includes('bonus') ||
     txn.amt === 2000 ||
     txn.cat === 'Income' &&
     txn.amt >= 1500 && txn.amt <= 3000);

  if (isBonusLike) {
    S._pendingBonus = txn.amt;
    save();
    setTimeout(() => {
      if (confirm(
        '🎉 Bonus received! $' + txn.amt + '\n\n' +
        'Open your plan to allocate it before it disappears into spending?'
      )) {
        openPlanMode();
      }
    }, 500);
  }
}

Call checkForBonusInterception(txn) after every income transaction
is logged in the logTransaction() or equivalent function.

Also add a bonus notification check when WRX sale is detected:
When S.wrxStatus changes to 'sold', automatically open plan mode
with a message: "WRX sold — time to allocate the proceeds."

VERIFY: Search "checkForBonusInterception" — must find.
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FINAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Run node guardian-all.js — must pass 100%.

Final verification — search for ALL:
1. "plan-mode" ✓
2. "openPlanMode" ✓
3. "const PLAN" ✓
4. "getPostWrxSurplus" ✓
5. "slyght_trips" ✓
6. "renderPlanMode" ✓
7. "renderPaydayAllocation" ✓
8. "lockPaydayPlan" ✓
9. "renderTrips" ✓
10. "renderGoalCards" ✓
11. "renderAnnualProvisions" ✓
12. "updateIncomeSim" ✓
13. "checkForBonusInterception" ✓

All 13 must be found before pushing.

git add index.html
git commit -m "feat: PLAN MODE — future planning, payday allocation, trip planner, goal cards, income simulator, annual provisions, bonus interception"
git push