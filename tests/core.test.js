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

// ── Summary ─────────────────────────────────────────────
console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
