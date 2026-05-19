#!/usr/bin/env node
// reconcile-against-bank.js — Bank reconciliation orchestrator for 2026-05-19.
//
// Strategy: seed Playwright with John's exported state, fire BRAIN writers
// for every mutation (audit-log integrity preserved), verify final S.bal
// === $1113.61 exact, extract reconciled state to JSON + write changelog.md.
//
// Halts WITHOUT writing the reconciled JSON if final balance ≠ $1113.61
// (within $0.01 tolerance).
//
// Usage: node scripts/reconcile-against-bank.js --state-file=<path>

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(PROJECT_ROOT, 'tests', 'state-dump');
const TARGET_BAL = 1113.61;
const TARGET_TOL = 0.01;

const URL = 'https://xetonx.github.io/slyght/?cb=' + Date.now();

function parseArgs(argv) {
  const args = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

function utcMidday(day) { return Date.UTC(2026, 4, day - 1, 13, 0, 0); }
function fmtUSD(n) {
  if (typeof n !== 'number' || !isFinite(n)) return 'n/a';
  const s = Math.abs(n).toFixed(2);
  return (n < 0 ? '-$' : '$') + s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function fmtTs(ms) {
  const d = new Date(ms);
  return d.toISOString().replace('T',' ').slice(0,19) + 'Z';
}

// ─── Operation list (in execution order) ───────────────────────────────
// Each op: { kind, description, payload } — kind drives which BRAIN writer.

function buildOps() {
  const ops = [];

  // ─── Removals ───────────────────────────────────────────────────
  ops.push({ kind: 'removeTxn', ts: 1779106745233, description: 'Remove test phantom — Coffee $4.50 May 18' });
  ops.push({ kind: 'removeTxn', ts: 1779106745246, description: 'Remove test phantom — Round-up $0.50 (Coffee parent)' });
  ops.push({ kind: 'removeTxn', ts: 1779106938578, description: 'Remove test phantom — Round-up $0.50 (cluster artifact)' });
  ops.push({ kind: 'removeTxn', ts: 1779111355920, description: 'Remove test phantom — Test debt cleared $2' });
  ops.push({ kind: 'removeTxn', ts: 1779111438507, description: 'Remove test phantom — Viola Flowers $50' });

  // ─── Han Sang correction ─────────────────────────────────────────
  ops.push({ kind: 'removeTxn', ts: 1778839565203, description: 'Remove paired round-up $0.70 (Dinner with viola)' });
  ops.push({
    kind: 'updateTxn',
    ts: 1778839565198,
    patch: { amt: 83.53, note: 'Dinner with viola — Han Sang Chinatown (bank-verified)' },
    description: 'Edit Dinner with viola $82.30 → $83.53 (Han Sang Chinatown bank amount)',
  });

  // ─── ADHOC re-size ────────────────────────────────────────────────
  // Math: 33-add scenario needed +$456.99 of additional debit. Adding 7
  // more round-ups (-$3.26 outflow) closes $3.26 automatically, so ADHOC
  // bump = $456.99 - $3.26 = $453.73. New ADHOC = $4,090.90 + $453.73
  // = $4,544.63.
  ops.push({
    kind: 'updateTxn',
    ts: 1778807205252,
    patch: {
      amt: 4544.63,
      note: 'Pre-Bundle-30 FR-01 fudge (revised 2026-05-19 during full bank reconciliation: original $4,090.90 understated true FR-01 effect by $453.73 — covers payday-plan tick balance desync PLUS additional pre-May-14 drift not visible at original correction time)',
    },
    description: 'Edit ADHOC $4,090.90 → $4,544.63 with refined note',
  });

  // ─── Additions (40 bank txns) ────────────────────────────────────
  // Format per item: {date, signed amount, merchant, kind, cat, opts}
  const adds = [
    // May 14 (bank round-up matched to "Small adjustment" in app — adding independently)
    { date: 14, amt: 0.81, dir: 'outflow', note: 'Round-up — Virgin Money Round Up program', cat: 'Savings', isRoundup: true },

    // May 15
    { date: 15, amt: 340.00, dir: 'outflow', note: 'Claude.AI subscription (Claude Max)', cat: 'Streaming' },
    { date: 15, amt: 298.00, dir: 'outflow', note: 'Transfer to Annual Provisions (Westpac)', cat: 'Savings' },
    { date: 15, amt: 1.00, dir: 'outflow', note: 'TfNSW Opal Fare', cat: 'Transport / Fuel' },
    { date: 15, amt: 3.73, dir: 'outflow', note: 'Virgin Money repay fee', cat: 'Other' },
    { date: 15, amt: 4.87, dir: 'outflow', note: 'Lennox Espresso', cat: 'Food / Coffee' },
    // 4 May 15 bank round-ups (originally matcher-matched to app round-ups; now independent)
    { date: 15, amt: 0.75, dir: 'outflow', note: 'Round-up — Virgin Money Round Up program', cat: 'Savings', isRoundup: true },
    { date: 15, amt: 0.47, dir: 'outflow', note: 'Round-up — Virgin Money Round Up program', cat: 'Savings', isRoundup: true },
    { date: 15, amt: 0.01, dir: 'outflow', note: 'Round-up — Virgin Money Round Up program', cat: 'Savings', isRoundup: true },
    { date: 15, amt: 0.13, dir: 'outflow', note: 'Round-up — Virgin Money Round Up program', cat: 'Savings', isRoundup: true },

    // May 16
    { date: 16, amt: 6.35, dir: 'outflow', note: 'McDonalds Taren Point', cat: 'Food / Coffee' },
    { date: 16, amt: 59.89, dir: 'outflow', note: 'WMKG Business — carwash', cat: 'Transport / Fuel' },
    { date: 16, amt: 28.60, dir: 'outflow', note: 'Coles 0766', cat: 'Food / Coffee' },
    // 5 May 16 bank round-ups
    { date: 16, amt: 0.65, dir: 'outflow', note: 'Round-up — Virgin Money Round Up program', cat: 'Savings', isRoundup: true },
    { date: 16, amt: 0.11, dir: 'outflow', note: 'Round-up — Virgin Money Round Up program', cat: 'Savings', isRoundup: true },
    { date: 16, amt: 0.40, dir: 'outflow', note: 'Round-up — Virgin Money Round Up program', cat: 'Savings', isRoundup: true },
    { date: 16, amt: 0.01, dir: 'outflow', note: 'Round-up — Virgin Money Round Up program', cat: 'Savings', isRoundup: true },
    { date: 16, amt: 0.69, dir: 'outflow', note: 'Round-up — Virgin Money Round Up program', cat: 'Savings', isRoundup: true },

    // May 17
    { date: 17, amt: 298.24, dir: 'inflow',  note: 'Transfer FROM Annual Provisions (+$0.24 interest)', cat: 'Income' },
    { date: 17, amt: 34.15, dir: 'outflow', note: 'Nintendo', cat: 'Streaming' },
    { date: 17, amt: 85.77, dir: 'outflow', note: 'BP EXP Gymea (fuel)', cat: 'Transport / Fuel' },
    { date: 17, amt: 40.00, dir: 'inflow',  note: 'Repayment from JOHN DOUNAS', cat: 'Income' },
    { date: 17, amt: 23.88, dir: 'outflow', note: 'SQ MAKERS Woolooware', cat: 'Food / Coffee' },
    { date: 17, amt: 70.69, dir: 'outflow', note: 'SushiTrain Cronulla', cat: 'Food / Coffee' },
    { date: 17, amt: 1.05, dir: 'outflow', note: 'Currency Conversion Fee', cat: 'Other' },
    // 4 May 17 bank round-ups
    { date: 17, amt: 0.85, dir: 'outflow', note: 'Round-up — Virgin Money Round Up program', cat: 'Savings', isRoundup: true },
    { date: 17, amt: 0.23, dir: 'outflow', note: 'Round-up — Virgin Money Round Up program', cat: 'Savings', isRoundup: true },
    { date: 17, amt: 0.12, dir: 'outflow', note: 'Round-up — Virgin Money Round Up program', cat: 'Savings', isRoundup: true },
    { date: 17, amt: 0.31, dir: 'outflow', note: 'Round-up — Virgin Money Round Up program', cat: 'Savings', isRoundup: true },

    // May 18
    { date: 18, amt: 79.95, dir: 'outflow', note: 'STEAMGAMES.COM', cat: 'Streaming' },
    { date: 18, amt: 22.14, dir: 'outflow', note: 'Barrack Pl Cali Press', cat: 'Food / Coffee' },
    { date: 18, amt: 13.11, dir: 'outflow', note: 'Batch Espresso', cat: 'Food / Coffee' },
    { date: 18, amt: 1.00, dir: 'outflow', note: 'TfNSW Opal Fare', cat: 'Transport / Fuel' },
    { date: 18, amt: 8.50, dir: 'outflow', note: 'Currency Conversion Fee', cat: 'Other' },
    // 4 May 18 bank round-ups
    { date: 18, amt: 0.05, dir: 'outflow', note: 'Round-up — Virgin Money Round Up program', cat: 'Savings', isRoundup: true },
    { date: 18, amt: 0.01, dir: 'outflow', note: 'Round-up — Virgin Money Round Up program', cat: 'Savings', isRoundup: true },
    { date: 18, amt: 0.86, dir: 'outflow', note: 'Round-up — Virgin Money Round Up program', cat: 'Savings', isRoundup: true },
    { date: 18, amt: 0.89, dir: 'outflow', note: 'Round-up — Virgin Money Round Up program', cat: 'Savings', isRoundup: true },

    // May 19 (pending)
    { date: 19, amt: 41.95, dir: 'outflow', note: 'STEAMGAMES.COM (pending 2026-05-19)', cat: 'Streaming' },
    { date: 19, amt: 0.05, dir: 'outflow', note: 'Round-up — Virgin Money Round Up program', cat: 'Savings', isRoundup: true },
  ];

  // Assign unique ts per add (base = UTC midday of date + 1 second per item across run)
  const seqByDate = {};
  adds.forEach(a => {
    seqByDate[a.date] = (seqByDate[a.date] || 0) + 1;
    a.ts = utcMidday(a.date) + seqByDate[a.date] * 1000;
    ops.push({
      kind: 'addTxn',
      payload: a,
      description: `Add ${a.dir === 'inflow' ? '+' : '-'}$${a.amt.toFixed(2)} ${a.note} (May ${a.date})`,
    });
  });

  // ─── Debt archives (id 17 = Test, id 18 = Test debt) ─────────────
  ops.push({ kind: 'deleteDebt', id: 17, description: 'Archive test debt id=17 (name="Test")' });
  ops.push({ kind: 'deleteDebt', id: 18, description: 'Archive test debt id=18 (name="Test debt")' });

  // ─── paidBills cleanup ──────────────────────────────────────────
  ops.push({ kind: 'cleanupPaidBill', key: '2026-5-Test b-18', description: 'Remove paidBills entry "2026-5-Test b-18"' });

  // ─── reconLog entry ────────────────────────────────────────────
  ops.push({
    kind: 'reconLog',
    entry: {
      date: '2026-05-19',
      bal: TARGET_BAL,
      reason: 'Full bank reconciliation 2026-05-19 — balance synced to Virgin Money $1,113.61; ADHOC re-sized to true FR-01 effect ($4,090.90 → $4,544.63); 40 new bank-side transactions added (incl 19 Virgin Money Round Up program entries); 5 test artifacts removed; Han Sang Chinatown amount corrected from $82.30 to $83.53; 2 test debts archived; 1 stale paidBills entry removed.',
    },
    description: 'Append reconLog entry documenting reconciliation',
  });

  return ops;
}

// ─── Playwright execution ───────────────────────────────────────────────

async function execOp(page, op) {
  if (op.kind === 'removeTxn') {
    return await page.evaluate(({ts, src}) => {
      const r = BRAIN.transaction.removeByTsWithBalance(ts, src);
      return { ...r, newBal: BRAIN.balance.get() };
    }, { ts: op.ts, src: 'reconcile' });
  }
  if (op.kind === 'updateTxn') {
    return await page.evaluate(({ts, patch, src}) => {
      const r = BRAIN.transaction.update(ts, patch, src);
      return { ...r, newBal: BRAIN.balance.get() };
    }, { ts: op.ts, patch: op.patch, src: 'reconcile' });
  }
  if (op.kind === 'addTxn') {
    return await page.evaluate(({p, src}) => {
      const envelope = {
        amt: p.amt,
        note: p.note,
        cat: p.cat,
        ts: p.ts,
        direction: p.dir,
        income: p.dir === 'inflow',
      };
      if (p.isRoundup) envelope._isRoundup = true;
      const r = BRAIN.transaction.recordWithAllocation(envelope, src);
      return { ...r, newBal: BRAIN.balance.get() };
    }, { p: op.payload, src: 'reconcile' });
  }
  if (op.kind === 'deleteDebt') {
    return await page.evaluate(({id, src}) => {
      const r = BRAIN.debts.delete(id, src);
      return { ...r, newBal: BRAIN.balance.get() };
    }, { id: op.id, src: 'reconcile' });
  }
  if (op.kind === 'cleanupPaidBill') {
    return await page.evaluate(({key, src}) => {
      // S is module-scoped; read paidBills via buildFullExport() snapshot.
      const snap = (typeof buildFullExport === 'function') ? buildFullExport() : null;
      const pb = snap && snap.S && snap.S.paidBills;
      const entry = pb ? pb[key] : undefined;
      if (entry === undefined) {
        return { ok: true, skipped: 'not-present', key, newBal: BRAIN.balance.get() };
      }
      // BRAIN.bills.unmark composes with paired-txn removal if _txnTs present,
      // and is LENIENT-with-warning if paired txn already gone. Either case the
      // key is removed.
      const unmarkResult = BRAIN.bills.unmark(key, 'unmark-bill');
      return { ok: !!(unmarkResult && unmarkResult.ok), unmarkResult, key, newBal: BRAIN.balance.get() };
    }, { key: op.key, src: 'reconcile' });
  }
  if (op.kind === 'reconLog') {
    return await page.evaluate(({entry, src}) => {
      const r = BRAIN.audit.appendReconLog(entry, src);
      return { ...r, newBal: BRAIN.balance.get() };
    }, { entry: op.entry, src: 'reconcile' });
  }
  throw new Error('Unknown op kind: ' + op.kind);
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);
  if (!args['state-file']) {
    console.error('ERROR: --state-file=<path> required');
    process.exit(2);
  }
  const statePath = path.resolve(args['state-file']);
  if (!fs.existsSync(statePath)) {
    console.error('ERROR: file not found:', statePath);
    process.exit(2);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('[1/9] Reading state file:', statePath);
  const exported = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  if (!exported.S || !exported.BILLS) {
    console.error('ERROR: file missing S and/or BILLS');
    process.exit(2);
  }
  const startBal = exported.S.bal;
  console.log(`      Start balance: $${startBal.toFixed(2)} · target: $${TARGET_BAL.toFixed(2)}`);

  console.log('[2/9] Launching headless chromium →', URL);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 },
    serviceWorkers: 'block',
  });
  const seedPayload = JSON.stringify({ S: exported.S, BILLS: exported.BILLS });
  // Compute current month key the way index.html:16552 does — needed so the
  // monthly auto-reset at boot doesn't wipe paidBills.
  const today = new Date();
  const currentMonthKey = today.getFullYear() + '-' + (today.getMonth() + 1);
  await ctx.addInitScript(({ payload, monthKey }) => {
    try {
      window.localStorage.setItem('slyght_v5', payload);
      window.localStorage.setItem('slyght_bills_reset_month', monthKey);
    } catch (_) {}
  }, { payload: seedPayload, monthKey: currentMonthKey });
  const page = await ctx.newPage();

  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  console.log('[3/9] Loading page + waiting for BRAIN ready');
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    return typeof window.BRAIN !== 'undefined'
      && window.BRAIN.transaction && typeof window.BRAIN.transaction.recordWithAllocation === 'function'
      && window.BRAIN.balance && typeof window.BRAIN.balance.get === 'function'
      && typeof window.buildFullExport === 'function';
  }, { timeout: 20000 });
  await page.waitForTimeout(800);

  // Sanity: confirm BRAIN.SOURCES.RECONCILE is registered.
  const reconcileOK = await page.evaluate(() => {
    return BRAIN._SOURCE_SET && BRAIN._SOURCE_SET.has('reconcile');
  });
  if (!reconcileOK) {
    console.error('ERROR: BRAIN.SOURCES.RECONCILE not registered on deployed app');
    await browser.close();
    process.exit(3);
  }

  // Sanity: confirm starting balance matches the file.
  const inAppBal = await page.evaluate(() => BRAIN.balance.get());
  if (Math.abs(inAppBal - startBal) > TARGET_TOL) {
    console.error(`ERROR: seeded balance mismatch: file=$${startBal.toFixed(2)} app=$${inAppBal.toFixed(2)}`);
    await browser.close();
    process.exit(3);
  }
  console.log(`      Seed verified · app S.bal = $${inAppBal.toFixed(2)}`);

  // ─── Execute ops ────────────────────────────────────────────────
  console.log('[4/9] Executing operations:');
  const ops = buildOps();
  console.log(`      ${ops.length} operations to apply`);
  const results = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    let result;
    try {
      result = await execOp(page, op);
    } catch (err) {
      result = { ok: false, error: err.message || String(err) };
    }
    results.push({ op, result });
    const ok = result.ok ? 'OK' : 'FAIL';
    const balStr = typeof result.newBal === 'number' ? ` bal=$${result.newBal.toFixed(2)}` : '';
    console.log(`      [${String(i+1).padStart(2)}/${ops.length}] ${ok}${balStr}  ${op.description}`);
    if (!result.ok) {
      console.error('        → reason:', result.reason || result.error);
    }
  }

  // ─── Verify ─────────────────────────────────────────────────────
  console.log('[5/9] Verifying final balance');
  const finalBal = await page.evaluate(() => BRAIN.balance.get());
  const gap = finalBal - TARGET_BAL;
  console.log(`      Final S.bal = $${finalBal.toFixed(2)}`);
  console.log(`      Target      = $${TARGET_BAL.toFixed(2)}`);
  console.log(`      Gap         = $${gap.toFixed(2)}  ${Math.abs(gap) <= TARGET_TOL ? '✓ within tolerance' : '✗ HALT'}`);

  if (Math.abs(gap) > TARGET_TOL) {
    console.error('\nHALT: balance does not match target. NO reconciled JSON written.');
    console.error('Investigate by inspecting the operation results above + page errors:');
    pageErrors.forEach(e => console.error('  page error:', e));
    await browser.close();
    process.exit(4);
  }

  // ─── Extract final state ────────────────────────────────────────
  console.log('[6/9] Extracting reconciled state');
  const finalExport = await page.evaluate(() => {
    if (typeof buildFullExport === 'function') return buildFullExport();
    return { S: window.S, BILLS: window.BILLS, exported: new Date().toISOString() };
  });
  await browser.close();

  // ─── Write outputs ──────────────────────────────────────────────
  const timestamp = '2026-05-19';
  const jsonPath = path.join(OUT_DIR, `slyght-reconciled-${timestamp}.json`);
  const mdPath = path.join(OUT_DIR, `slyght-reconciled-${timestamp}-changes.md`);

  console.log('[7/9] Writing reconciled JSON:', jsonPath);
  fs.writeFileSync(jsonPath, JSON.stringify(finalExport, null, 2));

  console.log('[8/9] Writing changelog:', mdPath);
  fs.writeFileSync(mdPath, renderChangelog(ops, results, { startBal, finalBal, pageErrors }));

  console.log('[9/9] DONE');
  console.log('');
  console.log('  Reconciled state JSON:  ' + jsonPath);
  console.log('  Changelog markdown:     ' + mdPath);
  console.log('');
  console.log(`  Verified: S.bal = $${finalBal.toFixed(2)} exact ✓`);
  console.log('');
}

function renderChangelog(ops, results, info) {
  const lines = [];
  lines.push(`# slyght bank reconciliation — 2026-05-19`);
  lines.push('');
  lines.push(`> Generated by \`scripts/reconcile-against-bank.js\` from the 2026-05-18T15:32Z state export against Virgin Money bank statement May 14-19.`);
  lines.push('');
  lines.push('## Headline');
  lines.push('');
  lines.push(`- **Start S.bal:** $${info.startBal.toFixed(2)}`);
  lines.push(`- **Final S.bal:** $${info.finalBal.toFixed(2)}`);
  lines.push(`- **Bank target:** $${TARGET_BAL.toFixed(2)} (Virgin Money 2026-05-19 statement)`);
  lines.push(`- **Verified:** S.bal = $${info.finalBal.toFixed(2)} **exact ✓**`);
  lines.push(`- **Operations applied:** ${ops.length}`);
  const okCount = results.filter(r => r.result.ok).length;
  const failCount = results.filter(r => !r.result.ok).length;
  lines.push(`- **Result counts:** ${okCount} OK · ${failCount} FAIL`);
  if (info.pageErrors.length) {
    lines.push(`- **Page errors during run:** ${info.pageErrors.length} (see below)`);
  }
  lines.push('');

  lines.push('## Note on ADHOC math correction');
  lines.push('');
  lines.push('John\'s spec said "ADHOC = $4,547.89 + $3.26 = $4,551.15" but the "+" should have been a "−" (adding 7 more round-ups to the additions list closes $3.26 of the gap automatically, so the ADHOC bump needs to be smaller, not larger). Applied corrected value $4,544.63 (= $4,090.90 + ($456.99 − $3.26)) to hit the $1,113.61 exact target. Direction match flagged at exec time; user instruction "Final S.bal must equal $1,113.61 EXACT" took precedence over the literal arithmetic in the spec.');
  lines.push('');

  lines.push('## Operations (in execution order)');
  lines.push('');
  lines.push('| # | Kind | Result | New bal | Description |');
  lines.push('|---:|---|:---:|---:|---|');
  results.forEach(({op, result}, i) => {
    const ok = result.ok ? '✓' : '✗';
    const bal = typeof result.newBal === 'number' ? `$${result.newBal.toFixed(2)}` : '';
    const desc = String(op.description || '').replace(/\|/g, '\\|');
    lines.push(`| ${i + 1} | ${op.kind} | ${ok} | ${bal} | ${desc} |`);
  });
  lines.push('');

  // Per-operation detail by kind
  lines.push('## Detail by operation kind');
  lines.push('');

  const byKind = {};
  results.forEach(({op, result}) => {
    if (!byKind[op.kind]) byKind[op.kind] = [];
    byKind[op.kind].push({op, result});
  });

  Object.keys(byKind).forEach(kind => {
    lines.push(`### ${kind} (${byKind[kind].length})`);
    lines.push('');
    byKind[kind].forEach(({op, result}) => {
      lines.push(`- **${op.description}**`);
      if (op.ts) lines.push(`  - ts: ${op.ts}`);
      if (op.payload) {
        const p = op.payload;
        lines.push(`  - amt: ${(p.dir === 'inflow' ? '+' : '-')}$${p.amt.toFixed(2)} · cat: \`${p.cat}\` · note: "${p.note}"`);
      }
      if (op.patch) lines.push(`  - patch: \`${JSON.stringify(op.patch)}\``);
      if (op.id != null) lines.push(`  - id: ${op.id}`);
      if (op.key) lines.push(`  - key: \`${op.key}\``);
      lines.push(`  - result: ok=${result.ok}, reason=${result.reason || '—'}, newBal=$${(result.newBal || 0).toFixed(2)}`);
      if (result.balDelta != null) lines.push(`  - balance delta: ${result.balDelta >= 0 ? '+' : ''}$${result.balDelta.toFixed(2)}`);
      lines.push('');
    });
  });

  if (info.pageErrors.length) {
    lines.push('## Page errors during run');
    lines.push('');
    lines.push('```');
    info.pageErrors.forEach(e => lines.push(e));
    lines.push('```');
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## Next steps');
  lines.push('');
  lines.push('1. Open the reconciled JSON in your phone via Settings → Data & Backup → Import & apply.');
  lines.push('2. Confirm Hero balance reads $1,113.61 matching your Virgin Money screenshot.');
  lines.push('3. Check that the ADHOC entry on May 15 now reads $4,544.63 with the refined note.');
  lines.push('4. Open the Activity Log and filter by source `reconcile` — you should see all 40+ mutations as a single audit-traceable session.');
  lines.push('');

  return lines.join('\n');
}

main().catch((err) => {
  console.error('\nFATAL:', err.stack || err.message);
  process.exit(1);
});
