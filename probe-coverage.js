// Read-only probe. Mirrors the live S + BILLS from index.html (post-migrations
// — fresh seed already reflects all migration outcomes), then runs an
// instrumented buildCalendarEntries that logs every coverage decision.

// ── Live S (post-migrations) ──────────────────────────────────────────────
const S = {
  bal: 779.50,
  txns: [],
  bonuses: [],
  bid: 0,
  seg: '1m',
  income: 7282,
  payday: 15,
  carloan: 23989.70,
  carLoanRate: 9.87,
  cc: 0,
  carloanOriginal: 37400,
  ccLimit: 6000,
  pin: '',
  pinHash: '',
  monthlyHistory: [],
  income_log: [],
  iid: 0,
  debts: [
    { id: 7, name: 'Property Deposit (via Mum)', amt: 5681.45, rate: 0,
      priority: 1, paid: false, monthlyPayment: 2500, rentComponent: 500,
      debtComponent: 2500, accountBalance: 3000, accountTarget: 50000,
      delayDate: '2027-01-15', viaRent: true, originalAmt: 5681.45 },
    { id: 8, name: 'Afterpay — Concert Tickets', amt: 124.75, rate: 0,
      priority: 2, paid: false, delayDate: '2026-05-31' }
  ],
  nextDebtId: 9,
  savingsBuckets: [
    { id: 0, name: 'China Holiday', goal: 4000, saved: 61.82, account: 'ING' },
    { id: 1, name: 'Rainy Day Fund', goal: 2000, saved: 0, account: 'ING' },
    { id: 2, name: 'Rego & Insurance', goal: 1500, saved: 0, account: 'Westpac' },
    { id: 3, name: 'Gifts & Celebrations', goal: 500, saved: 0, account: 'Other' }
  ],
  nextBucketId: 4,
  paidBills: {},
  paydayReceived: false,
  wrxValue: 25000,
  superBalance: 63429.15,
  superFund: 'Aware Super',
  superMonthlyContrib: 1310.50,
  mumAccountBalance: 3000
};

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
  { name: 'Car Rego — WRX', amt: 462, day: 15, tag: 'Transport', recurring: true, freq: 'yearly', dueMonth: 3 },
  { name: 'NRMA KIA Insurance', amt: 1023.06, day: 2, tag: 'Insurance', recurring: true, freq: 'yearly', dueMonth: 4 },
  { name: 'Teachers Health', amt: 259.41, day: 1, tag: 'Health', recurring: true, freq: 'quarterly', dueMonths: [1, 4, 7, 10] }
];

// ── Instrumented buildCalendarEntries (mirrors index.html lines 2107–2186) ─
// Returns { map, coverageLog } where coverageLog records every (debt, bill,
// billDate, decision) pair the function evaluated.

function buildCalendarEntriesInstrumented(state, now) {
  const map = new Map();
  const coverageLog = [];
  const billsArr = state.BILLS || BILLS;
  const debts = state.debts || [];
  const paidBills = state.paidBills || {};

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
    if (!debt.coversBillName) return { covered: false, reason: 'no_coversBillName' };
    if (debt.coversBillName !== bill.name) return { covered: false, reason: 'name_mismatch' };
    if (!debt.delayDate) return { covered: false, reason: 'no_delayDate' };
    const debtDate = new Date(debt.delayDate.split('T')[0]);
    const sameMonth = debtDate.getFullYear() === billDate.getFullYear()
                   && debtDate.getMonth() === billDate.getMonth();
    if (!sameMonth) return { covered: false, reason: 'different_month' };
    return { covered: true, rule: 'explicit-link', word: debt.coversBillName };
  };

  const _add = (dateISO, entry) => {
    if (!map.has(dateISO)) map.set(dateISO, []);
    map.get(dateISO).push(entry);
  };

  // 1. Active debts with explicit delayDate.
  debts.filter(d => !d.paid && !d.viaRent && d.delayDate).forEach(d => {
    const dateISO = d.delayDate.split('T')[0];
    _add(dateISO, { type: 'debt', name: d.name, amt: d.amt });
  });

  // 2. Bills — walk a 13-month window centred on `now`.
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

      let coveredBy = null;
      for (const d of debtsForCoverage) {
        const result = _covers(d, b, billDate);
        if (result.covered) {
          coverageLog.push({
            dateISO,
            billName: b.name,
            billAmt: b.amt,
            debtName: d.name,
            debtAmt: d.amt,
            debtDate: d.delayDate,
            ...result
          });
          coveredBy = { debt: d, ...result };
          break;
        }
      }
      if (coveredBy) return; // bill suppressed
      _add(dateISO, { type: 'bill', name: b.name, amt: b.amt });
    });
  }

  return { map, coverageLog };
}

// ── Run ───────────────────────────────────────────────────────────────────
function runScenario(label, mockS, mockNow) {
  console.log('\n' + '═'.repeat(72));
  console.log('SCENARIO: ' + label);
  console.log('NOW: ' + mockNow.toISOString().slice(0, 10));
  console.log('═'.repeat(72));

  const { map, coverageLog } = buildCalendarEntriesInstrumented(mockS, mockNow);

  // 60-day window from mockNow.
  const startMs = mockNow.getTime();
  const endMs = startMs + 60 * 86400000;
  const datesInWindow = [...map.keys()]
    .filter(iso => {
      const t = new Date(iso + 'T00:00:00').getTime();
      return t >= startMs && t <= endMs;
    })
    .sort();

  console.log('\n── calendarEntries.get for May 1 + next 60 days ──');
  if (!datesInWindow.length) {
    console.log('  (no entries in window)');
  }
  for (const iso of datesInWindow) {
    const entries = map.get(iso);
    const total = entries.reduce((s, e) => s + e.amt, 0);
    console.log('  ' + iso + ' total=$' + total.toFixed(2) + '  ' +
      entries.map(e => `[${e.type}] ${e.name} $${e.amt}`).join(' + '));
  }

  console.log('\n── Coverage decisions where _covers() returned TRUE ──');
  if (!coverageLog.length) {
    console.log('  (none — no bill was suppressed by any debt)');
  } else {
    for (const log of coverageLog) {
      const verdict = isLegitimateMatch(log) ? '✅ likely correct' : '⚠️  SUSPICIOUS';
      console.log('  ' + verdict + ' on ' + log.dateISO);
      console.log('    debt: "' + log.debtName + '" ($' + log.debtAmt + ', due ' + log.debtDate + ')');
      console.log('    bill: "' + log.billName + '" ($' + log.billAmt + ')');
      console.log('    rule: ' + log.rule + (log.rule === 'health-keyword'
        ? ' (debt hit "' + log.debtHit + '", bill hit "' + log.billHit + '")'
        : ' (word="' + log.word + '")'));
      console.log('    daysApart: ' + log.daysApart.toFixed(2));
    }
  }
}

// Heuristic for "is this match legitimate?" — flags suspicious matches:
// - Big amount delta (>50% off) AND health-keyword rule = likely false positive.
// - Different "domain" words (insurance vs health) = suspect.
function isLegitimateMatch(log) {
  // If amounts differ by more than 50% and rule is health-keyword, suspicious.
  const amtRatio = Math.min(log.billAmt, log.debtAmt) / Math.max(log.billAmt, log.debtAmt);
  if (amtRatio < 0.5 && log.rule === 'health-keyword') return false;
  // If health hits are different keywords (e.g. debt=teacher, bill=insurance),
  // domains likely don't actually match.
  if (log.rule === 'health-keyword' && log.debtHit !== log.billHit) return false;
  return true;
}

// Scenario A: live S as currently shipped (no Teachers Health debt).
runScenario(
  'A. Live S as shipped (post-migrations, no user-added debts)',
  Object.assign({}, S, { BILLS }),
  new Date('2026-05-01T00:00:00')
);

// Scenario B: live S + a hypothetical Teachers Health debt due 2026-05-01.
// This is the bug pattern from the AUDIT-FOUNDATION report.
const stateB = Object.assign({}, S, {
  BILLS,
  debts: [
    ...S.debts,
    { id: 99, name: 'Teachers Health', amt: 259.41, paid: false, delayDate: '2026-05-01' }
  ]
});
runScenario(
  'B. Live S + user-added "Teachers Health" debt due 2026-05-01',
  stateB,
  new Date('2026-05-01T00:00:00')
);

// Scenario C: probe-only — what if John has multiple debts that look "insurance-y"?
const stateC = Object.assign({}, S, {
  BILLS,
  debts: [
    ...S.debts,
    { id: 100, name: 'Health Insurance Excess', amt: 500, paid: false, delayDate: '2026-05-04' },
    { id: 101, name: 'Vet Insurance Claim', amt: 200, paid: false, delayDate: '2026-05-06' }
  ]
});
runScenario(
  'C. Stress test — multiple "insurance-y" debts near monthly bills',
  stateC,
  new Date('2026-05-01T00:00:00')
);
