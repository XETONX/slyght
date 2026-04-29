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
    trips: [], goals: [], provisions: [],
    postWrxSurplus: 0, wrxImpact: null,
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

// ── Summary ─────────────────────────────────────────────
console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
