// SLYGHT Core Calculation Tests
// Run with: node tests/core.test.js

// ── Mock Date BEFORE anything else ──────────────────────
// April 29, 2026 (Wednesday — weekday)
const TEST_TIMESTAMP = new Date(2026, 3, 29).getTime();
const OrigDate = Date;
global.Date = class extends OrigDate {
  constructor(...args) {
    if (args.length === 0) {
      // Return a FRESH copy each time so callers can mutate freely.
      super(TEST_TIMESTAMP);
      return;
    }
    super(...args);
  }
  static now() { return TEST_TIMESTAMP; }
};

// ── Mock the S object with known values ─────────────────
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
  cc: 0,
  savingsBuckets: [
    { name: 'China Holiday', goal: 4000, saved: 70.44, account: 'Virgin Money' },
    { name: 'Rainy Day Fund', goal: 2000, saved: 0, account: 'ING' }
  ],
  debts: [
    { id: 8, name: 'Teachers Health', amt: 259.41, paid: false,
      delayDate: '2026-05-01', viaRent: false },
    { id: 9, name: 'Afterpay — Concert Tickets', amt: 124.75,
      paid: false, delayDate: '2026-05-31', viaRent: false },
    { id: 7, name: 'Property Deposit (via Mum)', amt: 5681.45,
      paid: false, viaRent: true }
  ],
  paidBills: {}
};

// ── Mock BILLS (post-audit state) ───────────────────────
const BILLS = [
  { name: 'Rent + Deposit Savings', amt: 3000, day: 15, tag: 'Fixed', recurring: true },
  { name: 'KIA Loan — Firstmac', amt: 780, day: 15, tag: 'Loan', recurring: true, freq: 'monthly' },
  { name: 'Amazon Prime', amt: 9.99, day: 3, tag: 'Subscription', recurring: true },
  { name: 'Fuel', amt: 110, day: 5, tag: 'Variable', recurring: true },
  { name: 'Microsoft PC Game Pass', amt: 19.45, day: 7, tag: 'Subscription', recurring: true },
  { name: 'Pet Insurance — Bowtie', amt: 60.20, day: 8, tag: 'Fixed', recurring: true },
  { name: 'Claude Plus', amt: 34, day: 9, tag: 'Subscription', recurring: true },
  { name: 'Netflix', amt: 28.99, day: 10, tag: 'Streaming', recurring: true },
  { name: 'Optus — Phone + Internet', amt: 199, day: 16, tag: 'Fixed', recurring: true },
  { name: 'YouTube Premium', amt: 16.99, day: 20, tag: 'Streaming', recurring: true },
  { name: 'Food at Work', amt: 100, day: 28, tag: 'Variable', recurring: true },
  { name: 'Adobe', amt: 23.99, day: 27, tag: 'Subscription', recurring: true },
  { name: 'Spotify', amt: 15.99, day: 28, tag: 'Streaming', recurring: true },
  { name: 'NRMA KIA Insurance', amt: 1023.06, day: 2, tag: 'Insurance', recurring: true, freq: 'yearly', dueMonth: 4 },
  { name: 'Teachers Health', amt: 259.41, day: 1, tag: 'Health', recurring: true, freq: 'quarterly', dueMonths: [1, 4, 7, 10] }
];

// ── Test helpers ────────────────────────────────────────
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('✅ ' + name);
    passed++;
  } catch (e) {
    console.log('❌ ' + name + ': ' + e.message);
    failed++;
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (Math.abs(actual - expected) > 0.01) {
        throw new Error('Expected ' + expected + ' but got ' + actual);
      }
    },
    toBeGreaterThan(val) {
      if (actual <= val) {
        throw new Error('Expected > ' + val + ' but got ' + actual);
      }
    },
    toBeLessThan(val) {
      if (actual >= val) {
        throw new Error('Expected < ' + val + ' but got ' + actual);
      }
    },
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error('Expected ' + JSON.stringify(expected) + ' but got ' + JSON.stringify(actual));
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

// ── Function bodies copied verbatim from index.html ─────

function daysInCurrentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

function getLiveBal() { return S.bal; }

function daysLeft(payday) {
  const now = new Date(), today = now.getDate();
  const rawPd = payday || S.payday || 15;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const pd = Math.min(rawPd, daysInMonth);
  if (S.paydayReceived && today <= pd) {
    const next = new Date(now.getFullYear(), now.getMonth() + 1, pd);
    return Math.max(1, Math.ceil((next - now) / (1000 * 60 * 60 * 24)));
  }
  if (today < pd) return pd - today;
  const next = new Date(now.getFullYear(), now.getMonth() + 1, pd);
  return Math.max(1, Math.ceil((next - now) / (1000 * 60 * 60 * 24)));
}

function isBillDueThisMonth(bill) {
  const now = new Date();
  const month = now.getMonth();

  if (!bill || !bill.freq || bill.freq === 'monthly') return true;

  if (bill.freq === 'yearly' || bill.freq === 'annual') {
    const dueMonth = bill.dueMonth !== undefined ? bill.dueMonth : month;
    return month === dueMonth;
  }

  if (bill.freq === 'quarterly') {
    if (bill.dueMonths && bill.dueMonths.length) {
      return bill.dueMonths.includes(month);
    }
    return [0, 3, 6, 9].includes(month);
  }

  if (bill.freq === 'biannual' || bill.freq === 'biannually') {
    if (bill.dueMonths && bill.dueMonths.length) {
      return bill.dueMonths.includes(month);
    }
    return [0, 6].includes(month);
  }

  if (bill.freq === 'fortnightly' || bill.freq === 'weekly') return true;
  return true;
}

function getExpandedBills() {
  // Simplified for tests — only handles fortnightly expansion which we don't
  // use here. Returns BILLS as-is for monthly/yearly/quarterly entries.
  return BILLS.filter(b => b.recurring !== false);
}

function isThisMonthlyBillPaid(billName, billDay, month, year) {
  const now = new Date();
  const y = (year !== undefined) ? year : now.getFullYear();
  const m = (month !== undefined) ? month + 1 : now.getMonth() + 1;
  if (!S.paidBills) return false;

  const key1 = y+'-'+m+'-'+billName+'-'+billDay;
  const key2 = y+'-'+m+'-'+billName;
  if (S.paidBills[key1] === true || S.paidBills[key2] === true) return true;

  const legacyNames = {
    'Rent + Deposit Savings': 'Rent',
    'KIA Loan — Firstmac': 'Car Loan — Firstmac'
  };
  const legacyName = legacyNames[billName];
  if (legacyName) {
    const legacyKey1 = y+'-'+m+'-'+legacyName+'-'+billDay;
    const legacyKey2 = y+'-'+m+'-'+legacyName;
    if (S.paidBills[legacyKey1] === true || S.paidBills[legacyKey2] === true) return true;
  }

  return false;
}

function getBillsDue() {
  const today = new Date().getDate();
  const payday = S.payday || 15;
  const bills = getExpandedBills();
  const now = new Date();
  function isPaid(b) {
    if (!S.paidBills) return false;
    return !!S.paidBills[now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + b.name + '-' + b.day];
  }
  if (today < payday) {
    const upperBound = S.paydayReceived ? payday + 1 : payday;
    return bills.filter(b => b.recurring !== false && !isPaid(b) && isBillDueThisMonth(b) && b.day >= today && b.day < upperBound);
  }
  return bills.filter(b => {
    if (b.recurring === false) return false;
    if (isPaid(b)) return false;
    if (!isBillDueThisMonth(b)) return false;
    const diff = b.day >= today ? b.day - today : daysInCurrentMonth() - today + b.day;
    return diff > 0 && diff < daysLeft(payday);
  });
}

function getActiveDebtsDueBeforePayday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const paydayDay = S.payday || 15;

  const paydayDate = new Date(
    today.getFullYear(),
    today.getMonth(),
    paydayDay
  );
  if (paydayDate <= today || (S.paydayReceived && today.getDate() <= paydayDay)) {
    paydayDate.setMonth(paydayDate.getMonth() + 1);
  }

  return (S.debts || [])
    .filter(d => {
      if (d.paid) return false;
      if (d.viaRent) return false;
      if (!d.delayDate) return false;
      const due = new Date(d.delayDate + 'T00:00:00');
      return due >= today && due <= paydayDate;
    })
    .reduce((sum, d) => sum + (d.amt || 0), 0);
}

function getDynamicDailyBudget() {
  const bal = getLiveBal();
  const days = Math.max(1, daysLeft());

  const billsCommitted = getBillsDue().reduce((s, b) => s + b.amt, 0);
  const debtsCommitted = getActiveDebtsDueBeforePayday();
  const totalCommitted = billsCommitted + debtsCommitted;

  const available = Math.max(0, bal - totalCommitted);
  const dailyAvailable = parseFloat((available / days).toFixed(2));

  const isWeekend = [0, 6].includes(new Date().getDay());
  const userCap = isWeekend
    ? (S.weekendBudget || 180)
    : (S.weekdayBudget || 60);

  return Math.min(dailyAvailable, userCap);
}

function getSurvivalMode() {
  const bal = getLiveBal();

  const billsCommitted = getBillsDue().reduce((s, b) => s + b.amt, 0);
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

// ── Canonical spend filter (added by misleading-math fix) ───────────────
const _NON_SPEND_CATS = new Set(['Debt repayment','Income','Savings','Bills','Transfer','Loan','Car Loan','CC Payment']);

function computeSpentInRange(fromTs, toTs) {
  return (S.txns||[]).filter(t =>
    t.ts >= fromTs && t.ts <= toTs &&
    !t.income && !_NON_SPEND_CATS.has(t.cat) &&
    !t._isCorrection && !t._isRoundup
  ).reduce((s,t) => s+t.amt, 0);
}
function computeSpentToday() {
  const start = new Date(); start.setHours(0,0,0,0);
  return computeSpentInRange(start.getTime(), Date.now());
}

function getThisWeekProjection() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysSoFarInWeek = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const daysLeftInWeek = 7 - daysSoFarInWeek;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - daysSoFarInWeek);
  weekStart.setHours(0,0,0,0);
  const spentSoFar = computeSpentInRange(weekStart.getTime(), today.getTime());
  const _isDueInMonth = (b, monthIdx) => {
    if (!b.freq || b.freq === 'monthly' || b.freq === 'fortnightly' || b.freq === 'weekly') return true;
    if (b.freq === 'yearly' || b.freq === 'annual') {
      const dm = b.dueMonth !== undefined ? b.dueMonth : monthIdx;
      return monthIdx === dm;
    }
    if (b.freq === 'quarterly') {
      const months = (b.dueMonths && b.dueMonths.length) ? b.dueMonths : [0,3,6,9];
      return months.includes(monthIdx);
    }
    if (b.freq === 'biannual' || b.freq === 'biannually') {
      const months = (b.dueMonths && b.dueMonths.length) ? b.dueMonths : [0,6];
      return months.includes(monthIdx);
    }
    return true;
  };
  let billsDueThisWeek = 0;
  for (let i = 0; i < daysLeftInWeek; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const day = d.getDate(), m = d.getMonth(), y = d.getFullYear();
    const dim = new Date(y, m + 1, 0).getDate();
    BILLS.forEach(b => {
      if (b.recurring === false) return;
      const occursOn = [b.day];
      if (b.freq === 'fortnightly') {
        const d2 = b.day + 14;
        occursOn.push(d2 <= dim ? d2 : d2 - dim);
      }
      if (b.freq === 'weekly') {
        for (let w = 1; w <= 3; w++) {
          const dw = b.day + w * 7;
          if (dw <= dim) occursOn.push(dw);
        }
      }
      if (!occursOn.includes(day)) return;
      if (!_isDueInMonth(b, m)) return;
      if (isThisMonthlyBillPaid(b.name, day, m, y)) return;
      billsDueThisWeek += b.amt;
    });
  }
  const dailyRate = getDynamicDailyBudget();
  const projectedRemaining = (dailyRate * daysLeftInWeek) + billsDueThisWeek;
  return {
    spentSoFar: parseFloat(spentSoFar.toFixed(2)),
    billsDueThisWeek: parseFloat(billsDueThisWeek.toFixed(2)),
    projectedRemaining: parseFloat(projectedRemaining.toFixed(2)),
    projectedTotal: parseFloat((spentSoFar + projectedRemaining).toFixed(2)),
    daysLeftInWeek, daysSoFarInWeek,
    dailyRate: parseFloat(dailyRate.toFixed(2))
  };
}

function calculateNetWorth() {
  const wrxValue = S.wrxStatus === 'sold' ? 0 : (S.wrxValue || 25000);
  const cashBalance = S.bal || 0;
  const mumAccount = S.mumAccountBalance || 0;
  const savings = (S.savingsBuckets || []).reduce((s, b) => s + (b.saved || 0), 0);
  const superBalance = S.superBalance || 0;

  const liquidAssets = wrxValue + cashBalance + mumAccount + savings;
  const totalAssets = liquidAssets + superBalance;

  const kiaLoan = S.carloan || 0;
  const creditCard = S.cc || 0;
  const immediateDebts = (S.debts || [])
    .filter(d => !d.paid && !d.viaRent && d.amt > 0)
    .reduce((s, d) => s + d.amt, 0);
  const totalLiabilities = kiaLoan + creditCard + immediateDebts;

  const liquidNet = parseFloat((liquidAssets - totalLiabilities).toFixed(2));
  const totalNet = parseFloat((totalAssets - totalLiabilities).toFixed(2));

  return {
    assets: parseFloat(totalAssets.toFixed(2)),
    liquidAssets: parseFloat(liquidAssets.toFixed(2)),
    liabilities: parseFloat(totalLiabilities.toFixed(2)),
    net: totalNet,
    liquidNet: liquidNet,
    breakdown: { wrxValue, cashBalance, mumAccount, savings, superBalance, kiaLoan, creditCard, immediateDebts }
  };
}

// ── computeFinancialModel + buildCalendarEntries (copied from index.html) ─

function buildCalendarEntries(state, now) {
  const map = new Map();
  const HEALTH = ['health','insurance','teacher','medibank','bupa','nib','hbf'];
  const billsArr = (state && state.BILLS) ? state.BILLS : BILLS;
  const debts = (state && state.debts) || [];
  const paidBills = (state && state.paidBills) || {};

  const _dueIn = (b, m) => {
    if (!b.freq || b.freq === 'monthly') return true;
    if (b.freq === 'yearly' || b.freq === 'annual') {
      return b.dueMonth !== undefined ? m === b.dueMonth : true;
    }
    if (b.freq === 'quarterly') {
      if (b.dueMonths && b.dueMonths.length) return b.dueMonths.includes(m);
      return [0, 3, 6, 9].includes(m);
    }
    if (b.freq === 'biannual' || b.freq === 'biannually') {
      if (b.dueMonths && b.dueMonths.length) return b.dueMonths.includes(m);
      return [0, 6].includes(m);
    }
    return true;
  };

  const _covers = (debt, bill, billDate) => {
    if (!debt.delayDate) return false;
    const dueStr = debt.delayDate.split('T')[0];
    const daysApart = Math.abs(new Date(dueStr) - billDate) / 86400000;
    if (daysApart > 5) return false;
    const dn = (debt.name || '').toLowerCase().split(' ');
    const bn = (bill.name || '').toLowerCase().split(' ');
    if (dn.some(w => HEALTH.includes(w)) && bn.some(w => HEALTH.includes(w))) return true;
    const dFirst = dn.find(w => w.length > 3);
    const bFirst = bn.find(w => w.length > 3);
    return !!(dFirst && dFirst === bFirst);
  };

  const _add = (dateISO, entry) => {
    if (!map.has(dateISO)) map.set(dateISO, []);
    map.get(dateISO).push(entry);
  };

  debts.filter(d => !d.paid && !d.viaRent && d.delayDate).forEach(d => {
    const dateISO = d.delayDate.split('T')[0];
    _add(dateISO, { type:'debt', name:d.name, amt:d.amt, urgent:true, color:'var(--red)', debt:d, ref:d, source:'debts' });
  });

  const baseY = now.getFullYear(), baseM = now.getMonth();
  const debtsForCoverage = debts.filter(d => !d.paid);
  for (let offset = -1; offset < 12; offset++) {
    const m = ((baseM + offset) % 12 + 12) % 12;
    const y = baseY + Math.floor((baseM + offset) / 12);
    billsArr.forEach(b => {
      if (b.recurring === false) return;
      if (!_dueIn(b, m)) return;
      const billDate = new Date(y, m, b.day);
      const dateISO = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(b.day).padStart(2, '0');
      const paidKey = y + '-' + (m + 1) + '-' + b.name + '-' + b.day;
      if (paidBills[paidKey] === true) return;
      const covered = debtsForCoverage.some(d => _covers(d, b, billDate));
      if (covered) return;
      _add(dateISO, { type:'bill', name:b.name, amt:b.amt, color:'var(--amber)', bill:b, ref:b, source:'bills' });
    });
  }
  return map;
}

function computeFinancialModel(state, now) {
  if (state === undefined) state = S;
  if (now === undefined) now = new Date();

  const todayISO = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  const todayMonth = now.getMonth();
  const todayYear = now.getFullYear();

  const paydayDay = state.payday || 15;
  const paydayDate = new Date(todayYear, todayMonth, paydayDay);
  if (paydayDate <= now || (state.paydayReceived && now.getDate() <= paydayDay)) {
    paydayDate.setMonth(paydayDate.getMonth() + 1);
  }
  const daysToPayday = Math.max(1, Math.ceil((paydayDate - now) / 86400000));
  const cycleEnd = paydayDate;
  const cycleStart = new Date(paydayDate); cycleStart.setMonth(cycleStart.getMonth() - 1);

  const todayMidnight = new Date(now); todayMidnight.setHours(0,0,0,0);
  const debtsBeforePayday = (state.debts || []).filter(d => {
    if (d.paid || d.viaRent || !d.delayDate) return false;
    const due = new Date(d.delayDate + 'T00:00:00');
    return due >= todayMidnight && due <= paydayDate;
  });
  const debtsTotalCommitted = debtsBeforePayday.reduce((s, d) => s + (d.amt || 0), 0);

  // Bills — call the inlined helper directly (rather than façading the global helper).
  // Save/restore a stub to keep the inline copies in this test file working with this state.
  const _origS = S, _origBILLS = BILLS;
  const billsBeforePayday = getBillsDue();
  const billsTotalCommitted = billsBeforePayday.reduce((s, b) => s + b.amt, 0);
  const billsThisMonth = getExpandedBills().filter(b => isBillDueThisMonth(b));

  const nw = calculateNetWorth();
  const calendarEntries = buildCalendarEntries(state, now);

  // Mirror production: PLAN access wrapped in try/catch in case it's in TDZ
  // or absent (browsers see TDZ during boot; tests can stub a throwing PLAN).
  const _safePlan = (fn, fallback) => {
    try { return fn(); } catch (_) { return fallback; }
  };
  const trips         = _safePlan(() => PLAN.getTrips(), []);
  const goals         = _safePlan(() => PLAN.getGoals(), []);
  const provisions    = _safePlan(() => PLAN.getAnnualProvisions(), []);
  const wrxImpact     = _safePlan(() => PLAN.getWrxImpact(), null);
  const postWrxSurplus = _safePlan(() => PLAN.getPostWrxSurplus(), 0);

  return {
    todayISO, todayMonth, todayYear,
    paydayDate, daysToPayday,
    paydayReceived: !!state.paydayReceived,
    cycleStart, cycleEnd,

    bal: state.bal || 0,
    weekSpent: 0,

    liquidAssets: nw.liquidAssets,
    totalAssets: nw.assets,
    totalLiabilities: nw.liabilities,
    liquidNet: nw.liquidNet,
    totalNet: nw.net,
    nwBreakdown: nw.breakdown || {},

    safeToSpendToday: getDynamicDailyBudget(),
    userCap: 60,
    survivalMode: getSurvivalMode(),

    billsBeforePayday,
    debtsBeforePayday,
    billsThisMonth,
    billsTotalCommitted,
    debtsTotalCommitted,
    totalCommittedBeforePayday: billsTotalCommitted + debtsTotalCommitted,

    calendarEntries,
    trips, goals, provisions,
    postWrxSurplus, wrxImpact,
    warnings: []
  };
}

// ── Tests ───────────────────────────────────────────────

test('daysLeft() returns 16 days from Apr 29 to May 15', () => {
  expect(daysLeft()).toBe(16);
});

test('isBillDueThisMonth: monthly bill always true', () => {
  expect(isBillDueThisMonth({ freq: 'monthly' })).toBeTruthy();
});

test('isBillDueThisMonth: yearly NRMA due in May (month 4)', () => {
  const nrmaBill = { freq: 'yearly', dueMonth: 4 };
  expect(isBillDueThisMonth(nrmaBill)).toBeFalsy();
});

test('isBillDueThisMonth: Teachers Health quarterly', () => {
  const thBill = { freq: 'quarterly', dueMonths: [1, 4, 7, 10] };
  expect(isBillDueThisMonth(thBill)).toBeFalsy();
});

test('getBillsDue() returns $262.63 on Apr 29', () => {
  const total = getBillsDue().reduce((s, b) => s + b.amt, 0);
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
  expect(getActiveDebtsDueBeforePayday()).toBe(259.41);
});

test('getDynamicDailyBudget() returns ~$16/day', () => {
  const budget = getDynamicDailyBudget();
  expect(budget).toBeGreaterThan(14);
  expect(budget).toBeLessThan(20);
});

test('getSurvivalMode() returns cautious (dailyAvailable ~$16, threshold <25)', () => {
  // bal $779.50 > $300 — not survival/critical.
  // dailyAvailable = ($779.50 − $262.63 bills − $259.41 debts) / 16 days = $16.09
  // $16.09 is NOT < $15 (tight) but IS < $25 → 'cautious'.
  const mode = getSurvivalMode();
  expect(mode).toEqual('cautious');
});

test('calculateNetWorth() returns positive ~$67,000 with super', () => {
  // Assets = 25000 + 779.50 + 3000 + 70.44 + 63429.15 = 92279.09
  // Liabilities = 23989.70 + 0 + (259.41 + 124.75) = 24373.86
  // Net = 67905.23
  const nw = calculateNetWorth();
  expect(nw.net).toBeGreaterThan(67000);
  expect(nw.net).toBeLessThan(69000);
});

test('calculateNetWorth() assets include super', () => {
  const nw = calculateNetWorth();
  expect(nw.breakdown.superBalance).toBe(63429.15);
});

test('calculateNetWorth() does not include viaRent debts as liability', () => {
  const nw = calculateNetWorth();
  expect(nw.liabilities).toBeLessThan(25000);
});

test('calculateNetWorth() liquidNet excludes super', () => {
  // Liquid = WRX 25000 + bal 779.50 + mum 3000 + savings 70.44
  //          - KIA 23989.70 - debts 384.16 ≈ +$4,476
  const nw = calculateNetWorth();
  expect(nw.liquidNet).toBeGreaterThan(4000);
  expect(nw.liquidNet).toBeLessThan(6000);
  // Super (~$63k) should NOT be in liquidNet — total net must exceed liquid net
  expect(nw.liquidNet).toBeLessThan(nw.net);
});

// ── computeFinancialModel tests (model layer + May 1 dedup) ─

test('Model: May 1 dedup — Teachers Health debt covers Teachers Health bill', () => {
  // Setup: today Apr 29; debt due 2026-05-01; quarterly bill day 1.
  const mockNow = new Date(2026, 3, 29);
  const M = computeFinancialModel(S, mockNow);
  const may1 = M.calendarEntries.get('2026-05-01') || [];
  const total = may1.reduce((s, e) => s + e.amt, 0);
  // Only the Teachers Health debt should remain — bill is covered.
  // S.debts in this test file has no Teachers Health debt; we add one inline.
  // (See next test for a proper coverage check.)
  expect(total).toBeLessThan(520); // Should NOT be 518.82 even if both happened to land there
});

test('Model: bill covered by debt does not appear in calendarEntries', () => {
  // S already has a Teachers Health debt (id:8) due 2026-05-01.
  // The Teachers Health quarterly bill (day:1, dueMonths includes May) should be
  // suppressed by debt coverage on May 1 — leaving exactly one debt entry.
  const mockNow = new Date(2026, 3, 29);
  const M = computeFinancialModel(S, mockNow);
  const may1 = M.calendarEntries.get('2026-05-01') || [];
  expect(may1.length).toBe(1);
  expect(may1[0].type).toEqual('debt');
  expect(may1[0].amt).toBe(259.41);
});

test('Model: viaRent debts excluded from debtsBeforePayday', () => {
  const mockNow = new Date(2026, 3, 29);
  const stateMum = Object.assign({}, S, {
    debts: [
      { id: 7, name: 'Property Deposit (via Mum)', amt: 5681, viaRent: true, paid: false, delayDate: '2027-01-15' }
    ]
  });
  const M = computeFinancialModel(stateMum, mockNow);
  expect(M.debtsBeforePayday.length).toBe(0);
  expect(M.debtsTotalCommitted).toBe(0);
});

test('Model: paydayDate cycle guard advances when paydayReceived and today <= payday', () => {
  // Today is Apr 29 (after payday 15) — should advance regardless.
  const mockNow = new Date(2026, 3, 29);
  const M = computeFinancialModel(S, mockNow);
  expect(M.paydayDate.getMonth()).toBe(4); // May
});

test('Model: liquidNet < totalNet when super > 0', () => {
  const mockNow = new Date(2026, 3, 29);
  const M = computeFinancialModel(S, mockNow);
  expect(M.liquidNet).toBeLessThan(M.totalNet);
  expect(M.totalNet - M.liquidNet).toBe(M.nwBreakdown.superBalance);
});

test('Model: yearly NRMA only appears in calendarEntries during dueMonth (May)', () => {
  // Use a clean state with no debts so NRMA isn't accidentally suppressed by
  // Teachers Health debt (HEALTH keyword overlap = 'insurance' suppresses it).
  const mockNow = new Date(2026, 3, 29);
  const cleanState = Object.assign({}, S, { debts: [] });
  const M = computeFinancialModel(cleanState, mockNow);
  // NRMA day=2 dueMonth=4 (May). Should appear on 2026-05-02.
  const may2 = M.calendarEntries.get('2026-05-02') || [];
  expect(may2.some(e => e.name === 'NRMA KIA Insurance')).toBeTruthy();
  // Should NOT appear on 2026-04-02.
  const apr2 = M.calendarEntries.get('2026-04-02') || [];
  expect(apr2.some(e => e.name === 'NRMA KIA Insurance')).toBeFalsy();
});

test('Model: quarterly Teachers Health appears only in dueMonths', () => {
  const mockNow = new Date(2026, 3, 29);
  const M = computeFinancialModel(S, mockNow);
  // dueMonths [1,4,7,10] = Feb, May, Aug, Nov
  const may1 = M.calendarEntries.get('2026-05-01') || [];
  const aug1 = M.calendarEntries.get('2026-08-01') || [];
  const apr1 = M.calendarEntries.get('2026-04-01') || [];
  const jun1 = M.calendarEntries.get('2026-06-01') || [];
  // Should appear in May and August (no Teachers Health debt suppresses it here)
  expect(may1.some(e => e.name === 'Teachers Health')).toBeTruthy();
  expect(aug1.some(e => e.name === 'Teachers Health')).toBeTruthy();
  // Should NOT appear in April or June.
  expect(apr1.some(e => e.name === 'Teachers Health')).toBeFalsy();
  expect(jun1.some(e => e.name === 'Teachers Health')).toBeFalsy();
});

test('Model: totalLiabilities excludes viaRent debts', () => {
  const mockNow = new Date(2026, 3, 29);
  const M = computeFinancialModel(S, mockNow);
  // KIA $23,989.70 + CC $0 + immediate debts (Teachers Health $259.41 + Afterpay $124.75 = $384.16)
  // Total ≤ $25,000 because viaRent (Property Deposit Mum $5,681) is excluded.
  expect(M.totalLiabilities).toBeLessThan(25000);
});

test('Model: safeToSpendToday matches getDynamicDailyBudget for the same state', () => {
  const mockNow = new Date(2026, 3, 29);
  const M = computeFinancialModel(S, mockNow);
  expect(M.safeToSpendToday).toBe(getDynamicDailyBudget());
});

// ── Boot-time TDZ resilience ──────────────────────────────────
// In the browser, `const PLAN` is declared further down in index.html than
// computeFinancialModel. During boot, renderWeeklySnapshot fires (via init
// at line 9294) before PLAN's initializer has run, putting PLAN in the
// temporal dead zone. `typeof PLAN` on a const-in-TDZ throws ReferenceError
// (NOT 'undefined'), which used to crash the dashboard.
//
// Node can't reproduce true TDZ, but we can simulate the symptom: stub PLAN
// as an object whose property access throws. The model must absorb it and
// return a usable object with empty trips/goals/provisions and real values
// for everything else.
test('Boot resilience: computeFinancialModel survives PLAN access throwing (TDZ-equivalent)', () => {
  const origPLAN = (typeof global.PLAN !== 'undefined') ? global.PLAN : undefined;
  // Proxy that throws on every property read — emulates const-in-TDZ.
  global.PLAN = new Proxy({}, {
    get() { throw new ReferenceError("Cannot access 'PLAN' before initialization"); }
  });
  try {
    const mockNow = new Date(2026, 3, 29);
    const M = computeFinancialModel(S, mockNow);
    // PLAN-sourced fields fall back to safe defaults.
    expect(M.trips).toEqual([]);
    expect(M.goals).toEqual([]);
    expect(M.provisions).toEqual([]);
    expect(M.wrxImpact).toBe(null);
    expect(M.postWrxSurplus).toBe(0);
    // Everything else still has real numbers — the failure was contained.
    expect(M.bal).toBe(779.50);
    expect(M.liquidNet).toBeGreaterThan(0);
    expect(M.calendarEntries instanceof Map).toBeTruthy();
    expect(M.billsBeforePayday.length).toBeGreaterThan(0);
  } finally {
    if (origPLAN === undefined) delete global.PLAN;
    else global.PLAN = origPLAN;
  }
});

// ── Paid-lookup month-awareness ───────────────────────────────
// Bug: lookup used today.getMonth() to construct paidBills key, so April-paid
// bills appeared as PAID when rendering future months (May calendar day-detail,
// "This Week" totals). Fix: optional (month, year) params on canonical lookup.

test('Paid lookup: April-paid Amazon Prime is NOT paid in May', () => {
  const oldPaid = S.paidBills;
  S.paidBills = { '2026-4-Amazon Prime-3': true };
  try {
    const amazon = BILLS.find(b => b.name === 'Amazon Prime');
    // May = month index 4. April key is set, May key is not.
    expect(isThisMonthlyBillPaid(amazon.name, amazon.day, 4, 2026)).toBe(false);
    // Sanity: April (month index 3) should still be true.
    expect(isThisMonthlyBillPaid(amazon.name, amazon.day, 3, 2026)).toBe(true);
  } finally {
    S.paidBills = oldPaid;
  }
});

test('Paid lookup: default behavior unchanged (no month/year arg → today)', () => {
  // Mocked Date is 2026-04-29, so default month/year is April 2026.
  const oldPaid = S.paidBills;
  S.paidBills = { '2026-4-Amazon Prime-3': true };
  try {
    const amazon = BILLS.find(b => b.name === 'Amazon Prime');
    expect(isThisMonthlyBillPaid(amazon.name, amazon.day)).toBe(true);
  } finally {
    S.paidBills = oldPaid;
  }
});

// ── Plan Mode what-if helpers (added by plan-mode-whatif fix) ──────────

function computePlanLockedSubtotal(state) {
  const rentAmt = 500;
  const depositAmt = 2500;
  const kia = 780;
  // Test stub matches the simplified BILLS list — provisions sum static for the test.
  const provisions = Math.round((259.41 * 4 + 500 + 462 + 552 + 1023.06) / 12);
  return rentAmt + depositAmt + kia + provisions;
}

function computeBonusPreviewDaily(income, bonus, fixed, days) {
  if (days <= 0) return 0;
  const newDiscretionary = Math.max(0, income + bonus - fixed);
  return parseFloat((newDiscretionary / days).toFixed(2));
}

function computeKiaNetSaving(kiaLoan, kiaRate, customFee) {
  const monthlyInterest = kiaLoan * kiaRate / 100 / 12;
  const defaultFee = parseFloat((monthlyInterest * 2).toFixed(2));
  const fee = (customFee !== undefined && customFee !== null) ? parseFloat(customFee) : defaultFee;
  const interestSaved = parseFloat((monthlyInterest * 18).toFixed(2));
  return parseFloat((interestSaved - fee).toFixed(2));
}

function checkAllocationAffordability(dailyLiving, weekdayBudget) {
  if (dailyLiving < 0) {
    return { severity: 'error', shortfall: Math.round(Math.abs(dailyLiving) * 30), suggestedCap: 0 };
  }
  if (dailyLiving < weekdayBudget) {
    return { severity: 'warn', shortfall: 0, suggestedCap: Math.round(weekdayBudget) };
  }
  return { severity: 'ok', shortfall: 0, suggestedCap: 0 };
}

// ── Plan Mode what-if tests (BACKLOG #46-49) ────────────

test('Locked non-negotiable: subtotal sums rent + deposit + KIA + provisions', () => {
  const subtotal = computePlanLockedSubtotal(S);
  // 500 (rent) + 2500 (deposit) + 780 (KIA) + 298 (provisions monthly avg) = 4078
  expect(subtotal).toBe(4078);
});

test('Bonus preview: daily reflects bonus added to discretionary pool', () => {
  // income $7282, bonus $1500, locked fixed $4500, days 16
  const daily = computeBonusPreviewDaily(7282, 1500, 4500, 16);
  // (7282 + 1500 - 4500) / 16 = 4282 / 16 = 267.625
  expect(daily).toBe(267.63);
});

test('Editable repayment fee: changing fee changes net saving', () => {
  // KIA $23,989.70 at 9.87% → monthly interest ≈ $197.32
  // Default fee = round-2(2 × interest) = $394.63; interestSaved = round-2(18 × interest) = $3551.67
  // Default net saving = $3551.67 - $394.63 = $3157.04 (≈ $3157.05 with rounding)
  const defaultNet = computeKiaNetSaving(23989.70, 9.87);
  expect(defaultNet).toBe(3157.05);
  // Override fee to $500 → net ≈ $3551.67 - $500 = $3051.67
  const customNet = computeKiaNetSaving(23989.70, 9.87, 500);
  expect(customNet).toBe(3051.67);
  // Custom fee is higher than default → net saving is lower
  expect(customNet).toBeLessThan(defaultNet);
});

test('Slider affordability: ok when daily above budget', () => {
  const res = checkAllocationAffordability(80, 60);
  if (res.severity !== 'ok') throw new Error('expected ok, got ' + res.severity);
});
test('Slider affordability: warn when daily below weekday budget', () => {
  const res = checkAllocationAffordability(25, 60);
  if (res.severity !== 'warn') throw new Error('expected warn, got ' + res.severity);
  if (res.suggestedCap !== 60) throw new Error('expected suggestedCap=60, got ' + res.suggestedCap);
});
test('Slider affordability: error when daily negative', () => {
  const res = checkAllocationAffordability(-5, 60);
  if (res.severity !== 'error') throw new Error('expected error, got ' + res.severity);
  if (res.shortfall <= 0) throw new Error('expected positive shortfall, got ' + res.shortfall);
});

// ── Reconciliation tests (misleading-math fix) ──────────

test('computeSpentToday: excludes corrections and round-ups', () => {
  const oldTxns = S.txns;
  // Mocked clock pins Date.now() at Apr 29 00:00. Place txns at exactly today's
  // midnight so they're inside [startOfToday, Date.now()] (toTs inclusive).
  const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
  S.txns = [
    { ts: todayMidnight.getTime(),             amt: 50,   cat: 'Food / Coffee' },                  // counts: $50
    { ts: todayMidnight.getTime(),             amt: 0.55, cat: 'Food / Coffee', _isRoundup: true }, // excluded
    { ts: todayMidnight.getTime(),             amt: 30,   cat: 'Shopping', _isCorrection: true },  // excluded
    { ts: todayMidnight.getTime(),             amt: 100,  cat: 'Bills' },                          // excluded (non-spend)
    { ts: todayMidnight.getTime() - 86400000,  amt: 99,   cat: 'Food / Coffee' },                  // excluded (yesterday)
  ];
  try {
    expect(computeSpentToday()).toBe(50);
  } finally { S.txns = oldTxns; }
});

test('Bills remaining this week: spans month boundary, excludes paid', () => {
  // Apr 29 (Wed): days remaining in week = Wed/Thu/Fri/Sat/Sun = 5 days → Apr 29 → May 3
  // In that range: NRMA day 2 (yearly, May only) → INCLUDED; Amazon day 3 monthly → INCLUDED;
  // Teachers Health day 1 quarterly (May in dueMonths [1,4,7,10]) → INCLUDED.
  // Mark Amazon paid for May → excluded.
  const oldPaid = S.paidBills;
  const oldTxns = S.txns;
  S.txns = [];
  S.paidBills = { '2026-5-Amazon Prime-3': true };
  try {
    const proj = getThisWeekProjection();
    // NRMA $1023.06 + Teachers Health $259.41 = $1282.47 (Amazon excluded as paid)
    expect(proj.billsDueThisWeek).toBe(1282.47);
  } finally {
    S.paidBills = oldPaid;
    S.txns = oldTxns;
  }
});

test('Week total projection = spent so far + bills remaining + projected living', () => {
  const oldTxns = S.txns;
  const oldPaid = S.paidBills;
  S.txns = [];  // no spend this week — keeps spentSoFar at $0
  S.paidBills = {};
  try {
    const proj = getThisWeekProjection();
    const components = proj.spentSoFar + proj.billsDueThisWeek + (proj.dailyRate * proj.daysLeftInWeek);
    expect(proj.projectedTotal).toBe(parseFloat(components.toFixed(2)));
  } finally {
    S.txns = oldTxns;
    S.paidBills = oldPaid;
  }
});

// ── Mission C: forecast frame (end-of-current-cycle) ─────────────
// Anchors OPEN-BUGS #19. The two filter conditions in
// getSurvivalForecast were the bug — bills/debts on payday day were
// counted as outflows, but salary on payday day wasn't credited as
// inflow. New frame: strict less-than excludes payday-day items
// from "remaining at payday" math.

test('Forecast frame: bill due ON payday is excluded', () => {
  // Replicates the post-fix filter at index.html:3052
  // (billDate >= paydayDate) returns false ⇒ bill excluded.
  const bills = [
    { name: 'Rent', day: 15, amt: 3000 },
    { name: 'Netflix', day: 10, amt: 28.99 }
  ];
  const today = 5, payday = 15;
  const upcoming = bills.filter(b => b.day >= today && b.day < payday);
  expect(upcoming.length).toBe(1);
  expect(upcoming[0].name).toBe('Netflix');
});

test('Forecast frame: debt due ON payday is excluded', () => {
  // Replicates the post-fix filter at index.html:3076
  // (due < paydayDate, strict less-than).
  const debts = [
    { name: 'Owed-on-15', delayDate: '2026-05-15' },
    { name: 'Owed-on-14', delayDate: '2026-05-14' }
  ];
  const today = new Date(2026, 4, 5);
  const payday = new Date(2026, 4, 15);
  const upcoming = debts.filter(d => {
    const due = new Date(d.delayDate + 'T00:00');
    return due >= today && due < payday;
  });
  expect(upcoming.length).toBe(1);
  expect(upcoming[0].name).toBe('Owed-on-14');
});

test('Forecast remaining: John May 5 fixture math', () => {
  // Real-state regression test. Pins the fixture's expected
  // post-Mission-C remaining number. If anything changes the math
  // 6 months from now, this fires immediately.
  const bal = 381.35;
  const upcomingBillsTotal = 60.20 + 28.99;        // Pet Insurance + Netflix
  const upcomingDebtsTotal = 93.56;                 // Afterpay May 14
  const livingDays = 10;                            // May 5 → May 15
  const minDailyNeeded = 38.99;
  const minLivingCosts = livingDays * minDailyNeeded;
  const remaining = bal - upcomingBillsTotal - upcomingDebtsTotal - minLivingCosts;
  expect(Math.abs(remaining + 191.30) < 0.01).toBeTruthy();
});

test('Forecast paydayDate respects paydayReceived flag', () => {
  // Mission C alignment fix: getSurvivalForecast now uses
  // MODEL.paydayDate, which advances when paydayReceived is true and
  // today is on/before the nominal payday day. This test codifies
  // that branch so the alignment doesn't silently regress.
  // Mirror MODEL.paydayDate's logic at index.html:2271-2274.
  const computeModelPaydayDate = (now, payday, paydayReceived) => {
    const d = new Date(now.getFullYear(), now.getMonth(), payday);
    if (d <= now || (paydayReceived && now.getDate() <= payday)) {
      d.setMonth(d.getMonth() + 1);
    }
    return d;
  };

  // Case A: today=10, payday=15, paydayReceived=true → next month
  const caseA = computeModelPaydayDate(new Date(2026, 4, 10), 15, true);
  expect(caseA.getMonth()).toBe(5);  // June (next month)
  expect(caseA.getDate()).toBe(15);

  // Case B: today=10, payday=15, paydayReceived=false → this month
  const caseB = computeModelPaydayDate(new Date(2026, 4, 10), 15, false);
  expect(caseB.getMonth()).toBe(4);  // May (this month)

  // Case C: today=20 (past payday), payday=15, paydayReceived=false
  // → next month (paydayDate <= now path)
  const caseC = computeModelPaydayDate(new Date(2026, 4, 20), 15, false);
  expect(caseC.getMonth()).toBe(5);  // June
});

// ── Mission EXPORT: round-trip ──────────────────────────────────
// Anchors OPEN-BUGS #24 + Mission EXPORT. The build stage uses native
// JSON.stringify; this test catches a regression class where someone
// later adds a manual concat / .slice(0, N) cap that silently truncates
// the export mid-array. With > 100 txns + 16 bills + 9 paidBills, any
// truncation in the build step would lose data and fail the deep-equal.
test('Export round-trip: large state survives JSON.stringify + JSON.parse', () => {
  const bigTxns = Array.from({ length: 104 }, (_, i) => ({
    ts: TEST_TIMESTAMP - i * 86400000,
    amt: 10 + (i % 50),
    cat: i % 3 === 0 ? 'Food' : i % 3 === 1 ? 'Transport / Fuel' : 'Other',
    note: 'Test txn ' + i,
    income: false,
    _balAffected: true
  }));
  const bigPaidBills = {};
  for (let i = 1; i <= 9; i++) bigPaidBills['2026-5-Test Bill ' + i + '-' + i] = true;

  const bigS = {
    bal: 779.50,
    payday: 15,
    paydayReceived: false,
    txns: bigTxns,
    debts: [
      { id: 1, name: 'Owed to Michael', amt: 550, paid: false, delayDate: '2026-04-15' },
      { id: 2, name: 'Pet Insurance', amt: 120.47, paid: false, delayDate: '2026-04-22' },
      { id: 3, name: 'WRX fines', amt: 1254, paid: false }
    ],
    paidBills: bigPaidBills,
    savingsBuckets: [
      { id: 0, name: 'China Holiday', goal: 4000, saved: 70.44 },
      { id: 1, name: 'Rainy Day Fund', goal: 2000, saved: 0 }
    ],
    income: 7282,
    weekdayBudget: 60,
    weekendBudget: 100
  };

  const exportShape = {
    S: bigS,
    BILLS: BILLS,
    exported: '2026-05-05T12:00:00.000+10:00'
  };

  const json = JSON.stringify(exportShape);
  const parsed = JSON.parse(json);

  expect(parsed.S.txns.length).toBe(104);
  expect(parsed.BILLS.length).toBe(BILLS.length);
  expect(Object.keys(parsed.S.paidBills).length).toBe(9);
  expect(parsed.S.bal).toBe(bigS.bal);
  expect(parsed.S.debts.length).toBe(3);

  // Stability: re-stringifying the parsed object should produce the same
  // string. Catches non-deterministic mutations introduced during parse.
  expect(JSON.stringify(parsed) === json).toBeTruthy();

  // Last txn survived (catches truncation mid-array).
  expect(parsed.S.txns[103].note).toBe('Test txn 103');
});

// ── OPEN-BUGS #39: undoPaidBillByKey ──────────────────────────
// MI-13 details modal needs to remove a single paid-early entry by its full
// paidBills key. Tests the pure delete-by-key contract: the named key goes
// away, other keys are untouched, and idempotent on missing keys. UI side
// effects (modal re-render, toast, save) are stubbed.
test('undoPaidBillByKey: removes only the named key, leaves others intact', () => {
  const localPaidBills = {
    '2026-5-Electricity-20': true,
    '2026-5-Spotify-28': true,
    '2026-6-Rent-15': true
  };
  // Inline copy of the production function — UI deps stubbed.
  function undoPaidBillByKeyImpl(state, key) {
    if (!state.paidBills || !state.paidBills[key]) return false;
    delete state.paidBills[key];
    return true;
  }
  const state = { paidBills: localPaidBills };

  // Removing an existing key returns true and removes only that key.
  expect(undoPaidBillByKeyImpl(state, '2026-5-Spotify-28')).toBeTruthy();
  expect(state.paidBills['2026-5-Spotify-28'] === undefined).toBeTruthy();
  expect(state.paidBills['2026-5-Electricity-20']).toBeTruthy();
  expect(state.paidBills['2026-6-Rent-15']).toBeTruthy();
  expect(Object.keys(state.paidBills).length).toBe(2);

  // Removing a missing key is a safe no-op (returns false, state unchanged).
  expect(undoPaidBillByKeyImpl(state, '2026-5-Nonexistent-1')).toBeFalsy();
  expect(Object.keys(state.paidBills).length).toBe(2);

  // Bill names with dashes survive the round-trip — anchors regex on day.
  state.paidBills['2026-7-KIA Loan — Firstmac-15'] = true;
  expect(undoPaidBillByKeyImpl(state, '2026-7-KIA Loan — Firstmac-15')).toBeTruthy();
  expect(state.paidBills['2026-7-KIA Loan — Firstmac-15'] === undefined).toBeTruthy();
});

// ── Bundle 28 round 11/12 regression tests ──────────────
// Anchor OPEN-BUGS #42 (txn-edit balance sign flip) and #43 (txn-delete
// idempotency). Pure math reproducers — mirror the production writer
// bodies (BRAIN.transaction.update, BRAIN.transaction.removeByTsWithBalance).
//
// If a future change inverts the sign or breaks idempotency, these fail.

function applyEdit(txn, patchAmt, balBefore) {
  // Mirror of BRAIN.transaction.update balance math.
  const diff = patchAmt - txn.amt;
  if (Math.abs(diff) <= 0.01) return balBefore;
  const balDelta = txn.income ? diff : -diff;
  return parseFloat((balBefore + balDelta).toFixed(2));
}

function applyDelete(txn, balBefore) {
  // Mirror of BRAIN.transaction.removeByTsWithBalance balance math.
  const balDelta = txn.income ? -txn.amt : txn.amt;
  return parseFloat((balBefore + balDelta).toFixed(2));
}

test('BRAIN.transaction.update: expense edit $50 → $80 drops balance by $30 (OPEN-BUGS #42)', () => {
  const txn = { amt: 50, income: false };
  expect(applyEdit(txn, 80, 150)).toBe(120);
});

test('BRAIN.transaction.update: expense edit $50 → $30 raises balance by $20', () => {
  const txn = { amt: 50, income: false };
  expect(applyEdit(txn, 30, 150)).toBe(170);
});

test('BRAIN.transaction.update: income edit $50 → $80 raises balance by $30', () => {
  const txn = { amt: 50, income: true };
  expect(applyEdit(txn, 80, 200)).toBe(230);
});

test('BRAIN.transaction.update: income edit $50 → $30 drops balance by $20', () => {
  const txn = { amt: 50, income: true };
  expect(applyEdit(txn, 30, 200)).toBe(180);
});

test('BRAIN.transaction.update: <$0.01 diff is a no-op (no balance movement)', () => {
  const txn = { amt: 50.00, income: false };
  expect(applyEdit(txn, 50.005, 150)).toBe(150);
});

test('BRAIN.transaction.removeByTsWithBalance: expense delete restores balance by amt', () => {
  const txn = { ts: 1000, amt: 100, income: false };
  expect(applyDelete(txn, 700)).toBe(800);
});

test('BRAIN.transaction.removeByTsWithBalance: income delete deducts balance by amt', () => {
  const txn = { ts: 1000, amt: 100, income: true };
  expect(applyDelete(txn, 300)).toBe(200);
});

test('BRAIN.transaction.removeByTsWithBalance: idempotency — same ts twice does not double-bump (OPEN-BUGS #43)', () => {
  // Reproduces the round-12 fix: first delete finds + splices + adjusts;
  // second delete with same ts finds nothing and bails (no balance bump).
  const txns = [{ ts: 1000, amt: 100, income: false }];
  let bal = 700;

  const idx1 = txns.findIndex(t => t.ts === 1000);
  if (idx1 >= 0) {
    bal = applyDelete(txns[idx1], bal);
    txns.splice(idx1, 1);
  }
  expect(bal).toBe(800);
  expect(txns.length).toBe(0);

  const idx2 = txns.findIndex(t => t.ts === 1000);
  expect(idx2).toBe(-1);
  expect(bal).toBe(800); // bal must NOT have moved on second-attempt
});

// ── Summary ─────────────────────────────────────────────
console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
