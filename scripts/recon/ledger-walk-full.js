#!/usr/bin/env node
// Composite Ledger Walk runner — orchestrates the four sub-walks and produces
// a unified BACKED / ORPHAN / AMBIGUOUS verdict report.
//
// Per ADR-H Step 0. Walk first; ship second.

const paidBills = require('./ledger-walk-paidbills.js');
const debts = require('./ledger-walk-debts.js');
const buckets = require('./ledger-walk-buckets.js');
const cycleTotals = require('./ledger-walk-cycle-totals.js');

console.log('################################################################');
console.log('#  LEDGER WALK — composite (Step 0 of ADR-H pipeline)          #');
console.log('################################################################\n');

// Note: each sub-script runs on import (require.main check). For the composite
// view we run them sequentially and consume their exported main() to fetch
// the structured result. The seed paidBills script doesn't export results;
// running it here for the console output is sufficient.

console.log('\n████████████████ 1/4 — paidBills walk ████████████████\n');
// The seed script auto-runs on import; output already printed above.

console.log('\n████████████████ 2/4 — debts walk ████████████████\n');
debts.main();

console.log('\n████████████████ 3/4 — buckets walk ████████████████\n');
buckets.main();

console.log('\n████████████████ 4/4 — cycle totals + honest headroom ████████████████\n');
const totals = cycleTotals.main();

console.log('\n\n################################################################');
console.log('#  COMPOSITE VERDICT                                            #');
console.log('################################################################\n');
console.log(`Honest headroom (txn-anchored):  $${totals.headroomFloor.toFixed(2)}`);
console.log(`Orphan paidBills flags:           ${totals.orphanFlags.length}`);
totals.orphanFlags.forEach(o => console.log(`  - ${o.key}  ($${o.amt})`));
console.log();
console.log('See sub-walk outputs above for per-domain verdicts.');
console.log('Standing rule: ship only what survives ledger backing.');
