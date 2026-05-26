#!/usr/bin/env node
// Ledger walk: verify every S.savingsBuckets[].saved against the sum of allocation events.
// Per the standing rule: flags are derived convenience; txns are ground truth.
//
// Reconcile rule:
//   - For each bucket, sum all Savings-category txns (and roundup txns) whose note
//     references the bucket name (or "Round-up → <bucket>" pattern)
//   - Sum any explicit "Transfer FROM/TO <bucket>" income/outflow events
//   - Compare to bucket.saved
//   - Match within $1 tolerance → BACKED
//   - bucket.saved > ledgerSum → OVER-CLAIMED (claiming more saved than txns show)
//   - bucket.saved < ledgerSum → UNDER-CLAIMED (txns show more than displayed)
//
// Note: this is a coarse check — bucket allocation can also happen via direct
// BRAIN.savings.setBucketSaved writes (e.g. seedV29 trip-bucket-link migration)
// which don't produce txns. Treat OVER/UNDER as SUSPECT, surface for John.

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

function bucketKeywordsFor(name) {
  const n = norm(name);
  // Extract content words ≥3 chars; e.g. "Rainy Day Fund" → ["rainy","day","fund"]
  return n.split(/\s+/).filter(w => w.length >= 3);
}

function noteMatchesBucket(note, bucketKw) {
  const nn = norm(note);
  return bucketKw.some(k => nn.includes(k));
}

function main() {
  const today = loadJson(todayPath);
  const S = today.S || today;
  const buckets = S.savingsBuckets || [];
  const txns = S.txns || [];

  console.log('=== Ledger walk: S.savingsBuckets.saved verification ===\n');
  console.log('Rule: bucket.saved should reconcile to sum of allocation txns referencing the bucket.\n');
  console.log('Total buckets:', buckets.length, '\n');

  const fmt = (n) => '$' + (+n || 0).toFixed(2);
  const results = [];

  for (const b of buckets) {
    const name = b.name;
    const claimed = +b.saved || 0;
    const bucketKw = bucketKeywordsFor(name);
    if (bucketKw.length === 0) {
      results.push({ name, claimed, ledgerSum: 0, status: 'NO-KEYWORDS', evidence: [] });
      continue;
    }
    // Sum savings-category txns + roundup txns whose note references this bucket
    let ledgerSum = 0;
    const evidence = [];
    for (const t of txns) {
      const cat = t.cat || '';
      const isSavingsCat = cat === 'Savings';
      const isRoundup = !!t._isRoundup;
      const isTransfer = cat === 'Transfer' || cat === 'Income';
      if (!isSavingsCat && !isRoundup && !isTransfer) continue;
      if (!noteMatchesBucket(t.note || '', bucketKw)) continue;
      // For transfer-style txns, "FROM <bucket>" means withdrawal (subtract), "TO <bucket>" means deposit (add)
      const nn = norm(t.note);
      const isFrom = nn.includes('from ' + bucketKw[0]) || (nn.includes('transfer') && nn.includes('from'));
      const signedAmt = t.income ? +t.amt : -(+t.amt);
      // For Savings-cat outflows ("China Holiday round-ups" without income flag), they add TO bucket
      // i.e. money LEAVES bal and lands IN bucket
      const adjustedAmt = isSavingsCat || isRoundup ? +t.amt : signedAmt;
      // Skip refund-out-of-bucket transfers via heuristic
      if (isTransfer && isFrom && t.income) {
        // "Transfer FROM <bucket>" + income flag → bucket → bal (subtract from bucket)
        ledgerSum -= +t.amt;
        evidence.push({ direction: 'OUT', amt: t.amt, date: new Date(t.ts).toISOString().slice(0, 10), note: (t.note || '').slice(0, 50) });
        continue;
      }
      ledgerSum += adjustedAmt;
      evidence.push({ direction: adjustedAmt >= 0 ? 'IN' : 'OUT', amt: Math.abs(adjustedAmt), date: new Date(t.ts).toISOString().slice(0, 10), note: (t.note || '').slice(0, 50) });
    }
    ledgerSum = Math.round(ledgerSum * 100) / 100;
    const diff = +(claimed - ledgerSum).toFixed(2);
    let status;
    if (Math.abs(diff) < 1) status = 'BACKED';
    else if (diff > 0) status = 'OVER-CLAIMED';
    else status = 'UNDER-CLAIMED';
    results.push({ name, claimed, ledgerSum, diff, status, evidence: evidence.slice(-10) });
  }

  console.log('=== Verdict counts ===');
  for (const s of ['BACKED', 'OVER-CLAIMED', 'UNDER-CLAIMED', 'NO-KEYWORDS']) {
    console.log(`${s.padEnd(16)} ${results.filter(r => r.status === s).length}`);
  }
  console.log();

  console.log('--- Per-bucket detail ---');
  for (const r of results) {
    console.log(`\n${r.name}`);
    console.log(`  claimed.saved: ${fmt(r.claimed)}   ledgerSum: ${fmt(r.ledgerSum)}   diff: ${fmt(r.diff || 0)}   status: ${r.status}`);
    if (r.evidence.length === 0) {
      console.log('    (no matching txns found)');
    } else {
      console.log('    recent evidence (last 10):');
      r.evidence.forEach(e => console.log(`      ${e.direction.padEnd(3)} ${fmt(e.amt).padEnd(10)} ${e.date}  ${e.note}`));
    }
  }

  // Note about migrations / direct writes
  console.log('\n--- Caveats ---');
  console.log('Direct BRAIN.savings.setBucketSaved writes (e.g. seedV29 trip-bucket-link migration)');
  console.log('do not produce txns; OVER/UNDER-CLAIMED may reflect those legitimate one-shots,');
  console.log('not bugs. Audit log (S._auditLog) holds those events for cross-check.');

  return results;
}

if (require.main === module) main();
module.exports = { main };
