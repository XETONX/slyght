#!/usr/bin/env node
// Ledger walk: verify every paidBills flag against S.txns.
// Per the standing rule: flags are derived convenience; txns are ground truth.
// For each paidBills key, find the matching debit txn (if any) and surface:
//   - LEDGER-BACKED: flag is paid AND a matching txn exists → legitimate
//   - LEDGER-ORPHAN: flag is paid AND NO matching txn → phantom flag (real bug)
//   - LEDGER-EXTRA:  matching txn exists but no flag → missing flag (separate bug)
//
// Matching rule (conservative): amount within ±$2 AND payee-name keyword match
// AND txn ts within ±14 days of paidBills.ts (or _txnTs if present, used as canonical anchor).

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
const BILLS = today.BILLS || S.BILLS || [];

// Normalize a string for keyword matching: lowercase, strip non-alphanumeric.
function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function keywords(s) {
  return norm(s).split(/\s+/).filter(w => w.length >= 3);
}

// Try to find a debit txn that plausibly matches a paidBills key.
function findMatchingTxn(billName, billAmt, anchorTs) {
  const billKw = keywords(billName);
  const matches = [];
  for (const t of (S.txns || [])) {
    if (t.income) continue;
    if (t._isRoundup) continue;
    if (t._isCorrection) continue;
    // Amount within ±$2 (or ±5% for larger amounts)
    const tolerance = Math.max(2, Math.abs(billAmt || 0) * 0.05);
    if (Math.abs((+t.amt || 0) - (+billAmt || 0)) > tolerance) continue;
    // Date window ±14 days from anchor (if anchor given)
    if (anchorTs && Math.abs((t.ts || 0) - anchorTs) > 14 * 86400000) continue;
    // Keyword match in note
    const noteKw = keywords(t.note);
    const hasKwMatch = billKw.some(k => noteKw.includes(k));
    if (!hasKwMatch) continue;
    matches.push({ ts: t.ts, amt: t.amt, note: t.note, cat: t.cat });
  }
  return matches;
}

console.log('=== Ledger walk: paidBills flag verification ===\n');
console.log('Rule: flag paid:true is LEGITIMATE iff a matching debit txn exists in S.txns.\n');

const paidBills = S.paidBills || {};
const keys = Object.keys(paidBills);
console.log('Total paidBills entries:', keys.length, '\n');

const results = { backed: [], orphan: [], ambiguous: [] };

for (const key of keys) {
  const flag = paidBills[key];
  // Key format: YYYY-M-Name-DD
  const m = key.match(/^(\d{4})-(\d{1,2})-(.+?)-(\d{1,2})$/);
  if (!m) {
    console.log('?? UNPARSEABLE KEY:', key);
    continue;
  }
  const [, yr, mo, name, day] = m;
  // Find the bill entry to get its expected amount
  const billDef = BILLS.find(b => (b.name === name || norm(b.name) === norm(name)));
  const billAmt = billDef?.amt ?? (typeof flag === 'object' ? flag.amt : undefined);

  // Determine anchor timestamp for ±14d window
  let anchorTs;
  if (typeof flag === 'object') {
    anchorTs = flag._txnTs || flag.ts;
  }
  // If no anchor, use billDate (this cycle's occurrence of day-of-month)
  if (!anchorTs) {
    const billDate = new Date(parseInt(yr), parseInt(mo) - 1, parseInt(day));
    anchorTs = billDate.getTime();
  }

  const matches = findMatchingTxn(name, billAmt, anchorTs);
  const status = matches.length === 1 ? 'BACKED' : matches.length > 1 ? 'AMBIGUOUS' : 'ORPHAN';
  const summary = {
    key,
    flagShape: typeof flag === 'object' ? Object.keys(flag).join('+') : 'bool(true)',
    _txnTs: typeof flag === 'object' ? flag._txnTs : null,
    billAmt,
    matchCount: matches.length,
    matches: matches.slice(0, 3).map(m => ({ date: new Date(m.ts).toISOString().slice(0, 16), amt: m.amt, note: (m.note || '').slice(0, 50), cat: m.cat })),
  };
  results[status === 'BACKED' ? 'backed' : status === 'ORPHAN' ? 'orphan' : 'ambiguous'].push(summary);
}

console.log(`=== Results ===`);
console.log(`LEDGER-BACKED: ${results.backed.length}  (paid flag, matching txn — LEGITIMATE)`);
console.log(`LEDGER-ORPHAN: ${results.orphan.length}  (paid flag, NO matching txn — phantom flag SUSPECT)`);
console.log(`AMBIGUOUS:     ${results.ambiguous.length}  (paid flag, multiple plausible matches — review)\n`);

console.log('--- LEDGER-ORPHAN (the real P0-5 candidates) ---');
results.orphan.forEach(r => {
  console.log(`  ORPHAN: ${r.key}`);
  console.log(`    flag: ${r.flagShape}${r._txnTs ? ' _txnTs=' + new Date(r._txnTs).toISOString().slice(0, 16) : ''}`);
  console.log(`    billAmt: ${r.billAmt}`);
  console.log(`    matches: NONE`);
});

console.log('\n--- LEDGER-BACKED (verified legitimate) ---');
results.backed.forEach(r => {
  const ts = r._txnTs ? new Date(r._txnTs).toISOString().slice(0, 16) : '(no _txnTs anchor)';
  console.log(`  OK: ${r.key.padEnd(48)} txn@${ts} amt=${r.billAmt}`);
  if (r.matches[0]) console.log(`     → matched: ${r.matches[0].date} $${r.matches[0].amt} "${r.matches[0].note}" [${r.matches[0].cat}]`);
});

console.log('\n--- AMBIGUOUS (multiple matches; need John\'s eye) ---');
results.ambiguous.forEach(r => {
  console.log(`  ${r.key} — ${r.matchCount} candidate txns:`);
  r.matches.forEach(m => console.log(`     ${m.date} $${m.amt} "${m.note}" [${m.cat}]`));
});

// === The P0-5 question: re-evaluate Allianz CTP + KIA Rego specifically ===
console.log('\n=== P0-5 specific re-check: Allianz CTP + KIA Rego ===');
['Allianz CTP', 'KIA Registration'].forEach(name => {
  console.log(`\nLooking for "${name}":`);
  const billKw = keywords(name);
  const candidates = (S.txns || [])
    .filter(t => !t.income && !t._isRoundup && !t._isCorrection)
    .filter(t => {
      const noteKw = keywords(t.note);
      return billKw.some(k => noteKw.includes(k));
    })
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 10);
  if (candidates.length === 0) console.log('  (no candidate debit txns found)');
  candidates.forEach(t => console.log(`  ${new Date(t.ts).toISOString().slice(0, 16)} $${t.amt} "${t.note}" [${t.cat}]`));
});
