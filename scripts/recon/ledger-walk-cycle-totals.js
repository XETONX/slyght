#!/usr/bin/env node
// Ledger walk: compute the HONEST headroom + cycle conservation, using txn-anchored
// paid-detection (not flag-trust). Outputs:
//   - billsTotal, billsPaid, billsUnpaid (from ledger-verified isPaidInCycle)
//   - debtsTotal, debtsPaid, debtsUnpaid (excluding viaRent)
//   - livingRemaining (per-day floor × days-to-cycle-end, trip-uplift-aware)
//   - safeToSpendHeadroom (cash − billsUnpaid − livingRemaining)
//   - the per-bill verdict for each BILLS entry under the txn-anchored rule
//
// The keystone: this output should match what slyght's hero number WOULD say
// if isPaidInCycle were txn-anchored. Acid test: ~−$88, NOT −$1,116.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const todayPath = path.join(ROOT, 'tests', 'state-dump', 'live-2026-05-23.json');

function loadJson(p) {
  let txt = fs.readFileSync(p, 'utf8');
  if (txt.charCodeAt(0) === 0xFEFF) txt = txt.slice(1);
  return JSON.parse(txt);
}

function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function keywords(s) {
  return norm(s).split(/\s+/).filter(w => w.length >= 3);
}

// TXN-ANCHORED isPaidInCycle:
//   paidBills[key] flag true AND has _txnTs → BACKED
//   paidBills[key] flag true (bare boolean or no _txnTs) AND matching debit txn exists → BACKED
//   paidBills[key] flag true AND NO matching debit txn → SUSPECT-treat-as-unpaid
//   no paidBills[key] entry → unpaid
function isPaidInCycle_txnAnchored(billName, billAmt, billDay, billMonth, billYear, paidBills, txns) {
  const key = `${billYear}-${billMonth}-${billName}-${billDay}`;
  const flag = paidBills[key];
  if (!flag) return { paid: false, reason: 'no-flag' };

  // Object shape with _txnTs is the strong signal
  if (typeof flag === 'object' && flag._txnTs) {
    return { paid: true, reason: 'flag-with-txnTs', evidence: { ts: new Date(flag._txnTs).toISOString().slice(0, 16) } };
  }

  // Bare true OR object without _txnTs — must verify against ledger
  const billKw = keywords(billName);
  // Anchor: bill cycle date (year-month-day)
  const anchorTs = new Date(parseInt(billYear), parseInt(billMonth) - 1, parseInt(billDay)).getTime();
  for (const t of txns) {
    if (t.income) continue;
    if (t._isRoundup) continue;
    if (t._isCorrection) continue;
    const tolerance = Math.max(2, Math.abs(billAmt || 0) * 0.05);
    if (Math.abs((+t.amt || 0) - (+billAmt || 0)) > tolerance) continue;
    if (Math.abs((t.ts || 0) - anchorTs) > 14 * 86400000) continue;
    const noteKw = keywords(t.note);
    if (!billKw.some(k => noteKw.includes(k))) continue;
    return { paid: true, reason: 'ledger-backed', evidence: { ts: new Date(t.ts).toISOString().slice(0, 16), amt: t.amt, note: (t.note || '').slice(0, 50) } };
  }
  return { paid: false, reason: 'flag-orphan-suspect' };
}

function main() {
  const today = loadJson(todayPath);
  const S = today.S || today;
  const BILLS = today.BILLS || S.BILLS || [];
  const fmt = (n) => '$' + (+n || 0).toFixed(2);

  // Cycle boundaries
  const cycleStart = S.activePlan?.cycleStartDate ? new Date(S.activePlan.cycleStartDate + 'T00:00:00') : null;
  const cycleEnd = S.activePlan?.cycleEndDate ? new Date(S.activePlan.cycleEndDate + 'T00:00:00') : null;
  const now = new Date();
  const cycleStartMs = cycleStart?.getTime();
  const cycleEndMs = cycleEnd?.getTime();
  const daysRemaining = cycleEndMs ? Math.max(0, Math.round((cycleEndMs - now.getTime()) / 86400000)) : null;

  console.log('=== Ledger walk: cycle totals (txn-anchored) ===\n');
  console.log(`Today:           ${now.toISOString().slice(0, 16)}`);
  console.log(`Cycle start:     ${S.activePlan?.cycleStartDate || 'n/a'}`);
  console.log(`Cycle end:       ${S.activePlan?.cycleEndDate || 'n/a'}`);
  console.log(`Days remaining:  ${daysRemaining}`);
  console.log(`Floor (daily):   ${fmt(S.activePlan?.dailyLivingFloor || 30)}\n`);

  // === Bills walk ===
  console.log('--- Bills (txn-anchored isPaidInCycle) ---');
  const cycleMonth = cycleStart ? cycleStart.getMonth() + 1 : (now.getMonth() + 1);
  const cycleYear = cycleStart ? cycleStart.getFullYear() : now.getFullYear();
  let billsTotal = 0, billsPaid = 0, billsUnpaid = 0;
  const orphanFlags = [];
  const billRows = [];

  for (const b of BILLS) {
    const day = b.day || b.dueDay;
    if (!day) continue;
    const amt = +b.amt || 0;
    billsTotal += amt;
    // Bill cycle resolution: if day < payday day → bill falls in cycleMonth+1, else cycleMonth
    const payday = S.payday || 15;
    const billMonth = day < payday ? cycleMonth + 1 : cycleMonth;
    const billYear = billMonth > 12 ? cycleYear + 1 : cycleYear;
    const adjustedMonth = billMonth > 12 ? billMonth - 12 : billMonth;
    const v = isPaidInCycle_txnAnchored(b.name, amt, day, adjustedMonth, billYear, S.paidBills || {}, S.txns || []);
    if (v.paid) {
      billsPaid += amt;
    } else {
      billsUnpaid += amt;
    }
    if (v.reason === 'flag-orphan-suspect') {
      orphanFlags.push({ name: b.name, amt, key: `${billYear}-${adjustedMonth}-${b.name}-${day}` });
    }
    billRows.push({ name: b.name, amt, day, reason: v.reason, paid: v.paid });
  }

  console.log(`  billsTotal:      ${fmt(billsTotal)}`);
  console.log(`  billsPaid:       ${fmt(billsPaid)}  (ledger-verified)`);
  console.log(`  billsUnpaid:     ${fmt(billsUnpaid)}  (genuinely still owed)`);
  console.log(`  conservation:    paid + unpaid = ${fmt(billsPaid + billsUnpaid)}  vs  total ${fmt(billsTotal)}  → ${Math.abs(billsPaid + billsUnpaid - billsTotal) < 0.01 ? 'OK' : 'BREAK'}`);
  if (orphanFlags.length > 0) {
    console.log(`  ORPHAN FLAGS (treated as unpaid by txn-anchored rule):`);
    orphanFlags.forEach(o => console.log(`    - ${o.key.padEnd(50)} ${fmt(o.amt)}`));
  }

  // === Debts walk (non-viaRent unpaid only) ===
  console.log('\n--- Debts (excluding viaRent) ---');
  let immediateDebts = 0;
  const debtRows = [];
  for (const d of (S.debts || [])) {
    if (d.viaRent) continue;
    if (d.paid) continue;
    immediateDebts += +d.amt || 0;
    debtRows.push({ name: d.name, amt: d.amt, delayDate: d.delayDate });
  }
  console.log(`  immediateDebtsTotal (unpaid, non-viaRent): ${fmt(immediateDebts)}`);
  if (debtRows.length > 0) {
    debtRows.forEach(d => console.log(`    - ${d.name.padEnd(40)} ${fmt(d.amt)}  delayDate=${d.delayDate || 'n/a'}`));
  } else {
    console.log('    (no active immediate debts)');
  }

  // === Living remaining ===
  console.log('\n--- Living remaining ---');
  const floor = +S.activePlan?.dailyLivingFloor || 30;
  // Simplest model: floor × daysRemaining. Real snap uses trip-uplift-aware perDayLivingCost.
  // For honest-number purposes, this is a tight lower bound.
  const livingRemainingFloor = floor * (daysRemaining || 0);
  console.log(`  Floor × daysRemaining = ${fmt(floor)} × ${daysRemaining} = ${fmt(livingRemainingFloor)}`);
  console.log('  (Real snap.dailyLiving.plannedTotal adds trip uplift; this is a lower-bound estimate)');

  // === Headroom ===
  const cash = +S.bal || 0;
  const headroomFloor = +(cash - billsUnpaid - livingRemainingFloor).toFixed(2);
  console.log('\n--- Honest headroom (txn-anchored) ---');
  console.log(`  cash:              ${fmt(cash)}`);
  console.log(`  − billsUnpaid:     ${fmt(billsUnpaid)}`);
  console.log(`  − livingRemaining: ${fmt(livingRemainingFloor)} (floor-only estimate)`);
  console.log(`  ─────────────────────`);
  console.log(`  headroom:          ${fmt(headroomFloor)}`);
  console.log();

  // Acid test
  console.log('--- ACID TEST ---');
  console.log('Expected: hero ~−$88 (honest)');
  console.log(`Computed: ${fmt(headroomFloor)}`);
  const safeRange = headroomFloor >= -200 && headroomFloor <= 100;
  console.log(`Within sane range (-$200 ≤ headroom ≤ +$100)? ${safeRange ? 'YES' : 'NO — INVESTIGATE'}`);

  return { cash, billsTotal, billsPaid, billsUnpaid, immediateDebts, livingRemainingFloor, headroomFloor, orphanFlags, billRows, debtRows };
}

if (require.main === module) main();
module.exports = { main };
