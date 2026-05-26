#!/usr/bin/env node
// Ledger walk: verify every S.debts[].paid flag against S.txns.
// Per the standing rule: flags are derived convenience; txns are ground truth.
// Output verdict per debt: BACKED / ORPHAN / AMBIGUOUS / UNPAID.

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

// Find debit txn(s) that plausibly match a debt by name + amount.
function findMatchingTxn(txns, debtName, debtAmt, anchorTs) {
  const debtKw = keywords(debtName);
  const matches = [];
  for (const t of txns) {
    if (t.income) continue;
    if (t._isRoundup) continue;
    if (t._isCorrection) continue;
    // Debt-clearance txns typically use cat: 'Debt repayment' or contain 'cleared'/'paid' in note
    const note = norm(t.note);
    const looksLikeDebtClear = note.includes('cleared') || note.includes('paid') || (t.cat === 'Debt repayment');
    if (!looksLikeDebtClear) continue;
    // Amount tolerance: debts often pay exact amount; allow ±$5 or ±10% for partial-pay scenarios
    const tolerance = Math.max(5, Math.abs(debtAmt || 0) * 0.10);
    if (Math.abs((+t.amt || 0) - (+debtAmt || 0)) > tolerance) continue;
    // Date window ±30d from anchor (debt-payment timing can be loose)
    if (anchorTs && Math.abs((t.ts || 0) - anchorTs) > 30 * 86400000) continue;
    // Keyword match in note
    const noteKw = keywords(t.note);
    const hasKwMatch = debtKw.some(k => noteKw.includes(k));
    if (!hasKwMatch) continue;
    matches.push({ ts: t.ts, amt: t.amt, note: t.note, cat: t.cat });
  }
  return matches;
}

function main() {
  const today = loadJson(todayPath);
  const S = today.S || today;
  const debts = S.debts || [];

  console.log('=== Ledger walk: S.debts paid flag verification ===\n');
  console.log('Rule: debt.paid:true is LEGITIMATE iff a matching debt-clearance debit txn exists.\n');
  console.log('Total debts:', debts.length, '\n');

  const results = { backed: [], orphan: [], ambiguous: [], unpaid: [], viaRent: [] };

  for (const d of debts) {
    const anchorTs = d.paidAt || null;
    if (d.viaRent) {
      results.viaRent.push({ name: d.name, amt: d.amt, paid: d.paid });
      continue;
    }
    if (!d.paid) {
      results.unpaid.push({ name: d.name, amt: d.amt, delayDate: d.delayDate });
      continue;
    }
    // d.paid === true — verify
    const matches = findMatchingTxn(S.txns || [], d.name, d.amt, anchorTs);
    const status = matches.length === 1 ? 'backed' : matches.length > 1 ? 'ambiguous' : 'orphan';
    results[status].push({
      name: d.name,
      amt: d.amt,
      paidAt: d.paidAt ? new Date(d.paidAt).toISOString().slice(0, 16) : null,
      matchCount: matches.length,
      matches: matches.slice(0, 3).map(m => ({ date: new Date(m.ts).toISOString().slice(0, 16), amt: m.amt, note: (m.note || '').slice(0, 60), cat: m.cat })),
    });
  }

  console.log('=== Verdict counts ===');
  console.log(`BACKED:    ${results.backed.length}  (debt.paid, matching clearance txn — LEGITIMATE)`);
  console.log(`ORPHAN:    ${results.orphan.length}  (debt.paid, NO matching txn — phantom-paid SUSPECT)`);
  console.log(`AMBIGUOUS: ${results.ambiguous.length}  (debt.paid, multiple plausible matches)`);
  console.log(`UNPAID:    ${results.unpaid.length}  (active debts)`);
  console.log(`VIA-RENT:  ${results.viaRent.length}  (excluded from immediate)\n`);

  console.log('--- ORPHAN (suspect paid-debts without ledger backing) ---');
  if (results.orphan.length === 0) console.log('  (none)\n');
  results.orphan.forEach(r => {
    console.log(`  ORPHAN: ${r.name.padEnd(40)} amt=$${r.amt}  paidAt=${r.paidAt || 'n/a'}  matches=NONE`);
  });

  console.log('\n--- BACKED (verified) ---');
  results.backed.forEach(r => {
    const m = r.matches[0];
    console.log(`  OK: ${r.name.padEnd(40)} amt=$${r.amt}  paidAt=${r.paidAt || 'n/a'}`);
    if (m) console.log(`     -> matched: ${m.date} $${m.amt} "${m.note}" [${m.cat}]`);
  });

  if (results.ambiguous.length > 0) {
    console.log('\n--- AMBIGUOUS (review) ---');
    results.ambiguous.forEach(r => {
      console.log(`  ${r.name} amt=$${r.amt} — ${r.matchCount} candidate txns:`);
      r.matches.forEach(m => console.log(`     ${m.date} $${m.amt} "${m.note}" [${m.cat}]`));
    });
  }

  console.log('\n--- ACTIVE (unpaid, non-viaRent — the real "immediate debts") ---');
  if (results.unpaid.length === 0) console.log('  (none)');
  results.unpaid.forEach(r => console.log(`  ${r.name.padEnd(40)} amt=$${r.amt}  delayDate=${r.delayDate || 'n/a'}`));

  console.log('\n--- VIA-RENT (separated from immediate) ---');
  if (results.viaRent.length === 0) console.log('  (none)');
  results.viaRent.forEach(r => console.log(`  ${r.name.padEnd(40)} amt=$${r.amt}  paid=${r.paid}`));

  // Return for composite use
  return results;
}

if (require.main === module) main();
module.exports = { main };
