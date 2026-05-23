#!/usr/bin/env node
// Ledger walk: trace the bonus. Per John's flag — is the $1,341 bonus
// already in S.bal (landed with salary, spent down) or in a separate
// bucket (genuinely unspent and addable)?
//
// Decides whether the TO RECOVER bonus lever is honest (bucket-anchored)
// or double-counting (S.bal-anchored).

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const todayPath = path.join(ROOT, 'tests', 'state-dump', 'live-2026-05-23.json');

function loadJson(p) {
  let txt = fs.readFileSync(p, 'utf8');
  if (txt.charCodeAt(0) === 0xFEFF) txt = txt.slice(1);
  return JSON.parse(txt);
}

const today = loadJson(todayPath);
const S = today.S || today;
const fmt = (n) => '$' + (+n || 0).toFixed(2);

console.log('=== Ledger walk: BONUS trace ===\n');

const bonus = S.activePlan?.income?.bonus;
console.log('S.activePlan.income.bonus:');
console.log('  amount:   ', bonus?.amount);
console.log('  status:   ', bonus?.status);
console.log('  included: ', bonus?.included);
console.log();

console.log('Cycle:');
console.log('  start:    ', S.activePlan?.cycleStartDate);
console.log('  end:      ', S.activePlan?.cycleEndDate);
console.log('  payday:   ', S.payday);
console.log('  paydayReceived:    ', S.paydayReceived);
console.log('  paydayReceivedDate:', S.paydayReceivedDate);
console.log();

const cycleStartMs = S.activePlan?.cycleStartDate
  ? new Date(S.activePlan.cycleStartDate + 'T00:00:00').getTime()
  : 0;

console.log('Current S.bal:', fmt(S.bal));
console.log();

// 1. Find any credit txn with amount near $1,341 (income:true)
console.log('--- Step 1: credit txns near $1,341 (income:true) ---');
const nearBonus = (S.txns || [])
  .filter(t => t.income && Math.abs((+t.amt || 0) - 1341) < 50)
  .sort((a, b) => b.ts - a.ts);
if (nearBonus.length === 0) {
  console.log('  (no $1,341-ish credit txns found)');
} else {
  nearBonus.forEach(t => console.log(
    '  ', new Date(t.ts).toISOString().slice(0, 16),
    fmt(t.amt).padEnd(10),
    `"${(t.note || '').slice(0, 60)}"`,
    `[${t.cat || ''}]`,
    t._inCycle ? '(this cycle)' : ''
  ));
}
console.log();

// 2. Find the salary credit + check if amount > S.income (suggests bonus folded in)
console.log('--- Step 2: salary credit this cycle (>$5k income txn) ---');
const bigCredits = (S.txns || [])
  .filter(t => t.income && (+t.amt || 0) > 5000 && (t.ts || 0) >= cycleStartMs)
  .sort((a, b) => b.ts - a.ts);
if (bigCredits.length === 0) {
  console.log('  (no >$5k income txns this cycle — salary may not have hit S.txns)');
} else {
  bigCredits.forEach(t => console.log(
    '  ', new Date(t.ts).toISOString().slice(0, 16),
    fmt(t.amt).padEnd(10),
    `"${(t.note || '').slice(0, 60)}"`,
    `[${t.cat || ''}]`
  ));
}
console.log();

// 3. S.income (declared monthly) vs total cycle income — if cycle income > S.income, bonus likely folded
console.log('--- Step 3: cycle income reconciliation ---');
console.log('  S.income (declared monthly):', fmt(S.income));
const cycleIncome = (S.txns || [])
  .filter(t => t.income && (t.ts || 0) >= cycleStartMs && !t._isCorrection)
  .reduce((s, t) => s + (+t.amt || 0), 0);
console.log('  Σ cycle income txns:        ', fmt(cycleIncome));
const cycleIncomeMinusSmallStuff = (S.txns || [])
  .filter(t => t.income && (t.ts || 0) >= cycleStartMs && !t._isCorrection && (+t.amt || 0) > 1000)
  .reduce((s, t) => s + (+t.amt || 0), 0);
console.log('  Σ cycle large income (>$1k):', fmt(cycleIncomeMinusSmallStuff));
const diff = cycleIncome - (+S.income || 0);
console.log('  Δ vs S.income:              ', fmt(diff),
  diff > 1000 ? '  → bonus or extra income likely folded into a credit' :
  diff < -1000 ? '  → cycle income BELOW declared (salary not yet hit?)' :
  '  → roughly matches monthly salary');
console.log();

// 4. Bonus bucket check — is there a savings bucket named "bonus" or similar?
console.log('--- Step 4: bonus-related savings buckets ---');
const bonusBuckets = (S.savingsBuckets || []).filter(b => /bonus|payday\s*extra/i.test(b.name || ''));
if (bonusBuckets.length === 0) {
  console.log('  (no buckets matching /bonus|payday extra/ — bonus NOT in a dedicated bucket)');
} else {
  bonusBuckets.forEach(b => console.log('  ', b.name.padEnd(30), 'saved=' + fmt(b.saved), 'target=' + fmt(b.target)));
}
console.log();

// 5. Verdict
console.log('=== VERDICT ===');
const bonusInBucket = bonusBuckets.length > 0 && bonusBuckets.some(b => Math.abs((+b.saved || 0) - (+bonus?.amount || 0)) < 100);
const bonusFoldedInSalary = bigCredits.some(t => (+t.amt || 0) > (+S.income || 0) + 500);
const separateBonusTxn = nearBonus.length > 0;

console.log('Bonus in dedicated bucket?     ', bonusInBucket ? 'YES — bucket-isolated, unspent' : 'NO');
console.log('Bonus folded into salary credit?', bonusFoldedInSalary ? 'LIKELY — salary credit > declared S.income' : 'NO');
console.log('Separate $1,341 credit txn?    ', separateBonusTxn ? 'YES — credit landed as own txn' : 'NO');
console.log();

if (bonusInBucket) {
  console.log('→ Bonus is BUCKET-ISOLATED. The lever can safely show it as addable headroom');
  console.log('  IF the inclusion mechanic moves it from bucket→S.bal. Verify the include action.');
} else if (bonusFoldedInSalary || separateBonusTxn) {
  console.log('→ Bonus is IN S.bal (landed with salary or as standalone credit).');
  console.log('  Current S.bal ALREADY contains the bonus AND reflects spending since.');
  console.log('  TO RECOVER lever "Include $X bonus → +$Y headroom" is DOUBLE-COUNTING.');
  console.log('  John is right. Revert the lever.');
} else {
  console.log('→ INCONCLUSIVE. Bonus state unclear. Surface to John for explicit answer.');
}
