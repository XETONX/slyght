// Bundle 15.2 cleanup — one-shot data hygiene script.
// Removes: 15B test debt, ghost Borrowed from Michael (id:11/$450/05-15),
//          paidBills[2026-5-Test-11], "Test — paid" txn, two stale notifications.
// Adjusts: S.bal += $1 to reverse the Test-paid expense.
// Logs: single audit entry.
// Idempotent — safe to re-run.

const fs = require('fs');
const path = require('path');

const FIXTURE = path.resolve(__dirname, '..', 'state-snapshot.json');
const fx = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const S = fx.S;

const before = {
  debts: S.debts.length,
  paidBills: Object.keys(S.paidBills || {}).length,
  txns: S.txns.length,
  notifications: (S.notifications || []).length,
  bal: S.bal,
};

// 1. Remove 15B test debt (id:14) and ghost Michael (id:11, $450)
S.debts = S.debts.filter(d => {
  if (d.id === 14) return false;
  if (d.id === 11 && d.name === 'Borrowed from Michael') return false;
  return true;
});

// 2. Remove paidBills test key
if (S.paidBills && S.paidBills['2026-5-Test-11'] !== undefined) {
  delete S.paidBills['2026-5-Test-11'];
}

// 3. Remove the Test — paid txn and reverse balance
const testTxnIdx = S.txns.findIndex(t =>
  t && t.note === 'Test — paid' && t.amt === 1 && t.cat === 'Bills'
);
let balanceAdjustment = 0;
if (testTxnIdx >= 0) {
  const tx = S.txns[testTxnIdx];
  if (tx._balAffected && !tx.income) {
    balanceAdjustment = tx.amt;
    S.bal = parseFloat((S.bal + tx.amt).toFixed(2));
  }
  S.txns.splice(testTxnIdx, 1);
}

// 4. Remove stale notifications (ghost Michael $450, 15A test debt)
if (Array.isArray(S.notifications)) {
  S.notifications = S.notifications.filter(n => {
    if (!n || !n.msg) return true;
    if (n.msg.indexOf('Borrowed from Michael $450') !== -1) return false;
    if (n.msg.indexOf('Test debt 15A') !== -1) return false;
    return true;
  });
}

// 5. Audit log entry (append-only — preserve history)
if (!S.auditLog) S.auditLog = [];
S.auditLog.push({
  type: 'bundle-15.2-cleanup',
  source: 'migration',
  removed: {
    debts: ['15B test debt (id:14)', 'Ghost Borrowed from Michael $450 (id:11)'],
    paidBills: ['2026-5-Test-11'],
    txns: ['Test — paid -$1 (ts:1778499767230)'],
    notifications: ['ghost Michael $450', '15A test debt overdue'],
  },
  balanceAdjustment,
  ts: Date.now(),
});

const after = {
  debts: S.debts.length,
  paidBills: Object.keys(S.paidBills || {}).length,
  txns: S.txns.length,
  notifications: (S.notifications || []).length,
  bal: S.bal,
};

fs.writeFileSync(FIXTURE, JSON.stringify(fx, null, 2));

console.log('BEFORE:', before);
console.log('AFTER: ', after);
console.log('Saved.');
