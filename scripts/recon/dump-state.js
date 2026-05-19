#!/usr/bin/env node
// dump-app-state.js — one-off reconciliation prep tool.
//
// Seeds a Playwright headless chromium session with John's exported state,
// loads the deployed slyght, lets BRAIN initialise + boot self-test fire,
// then extracts the live state PLUS BRAIN-derived computed values
// (net worth, surplus, days-to-payday) that John sees in his app.
//
// Usage:
//   node scripts/dump-app-state.js --state-file=<path>
//   node scripts/dump-app-state.js --state-file=<path> --url=<url> --out-dir=<dir>
//
// Default URL: https://xetonx.github.io/slyght/?cb=<timestamp>
// Default out: tests/state-dump/

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_URL = 'https://xetonx.github.io/slyght/';
const DEFAULT_OUT = path.join(PROJECT_ROOT, 'tests', 'state-dump');

function parseArgs(argv) {
  const args = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

function fmtUSD(n) {
  if (typeof n !== 'number' || !isFinite(n)) return 'n/a';
  const s = Math.abs(n).toFixed(2);
  return (n < 0 ? '-$' : '$') + s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  return d.toISOString().replace('T', ' ').slice(0, 16) + 'Z';
}

function tsSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args['state-file']) {
    console.error('ERROR: --state-file=<path> required');
    console.error('Get the file via: Settings → Data & Backup → 📁 Download Export (file)');
    process.exit(2);
  }

  const statePath = path.resolve(args['state-file']);
  if (!fs.existsSync(statePath)) {
    console.error(`ERROR: file not found: ${statePath}`);
    process.exit(2);
  }

  const cacheBust = Date.now();
  const url = (args.url || DEFAULT_URL) + (args.url && args.url.includes('?') ? '&' : '?') + 'cb=' + cacheBust;
  const outDir = args['out-dir'] ? path.resolve(args['out-dir']) : DEFAULT_OUT;
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`[1/6] Reading export file: ${statePath}`);
  const raw = fs.readFileSync(statePath, 'utf8');
  let exported;
  try {
    exported = JSON.parse(raw);
  } catch (e) {
    console.error(`ERROR: file is not valid JSON — ${e.message}`);
    process.exit(2);
  }
  if (!exported.S || !exported.BILLS) {
    console.error('ERROR: file missing required top-level keys S and/or BILLS');
    console.error('Expected shape: { S: {...}, BILLS: [...], exported: "...", ... }');
    console.error('Got keys: ' + Object.keys(exported).join(', '));
    process.exit(2);
  }
  console.log(`      exported: ${exported.exported || '(unknown)'}`);
  console.log(`      S keys: ${Object.keys(exported.S).length} · BILLS entries: ${exported.BILLS.length} · txns: ${(exported.S.txns || []).length}`);

  console.log(`[2/6] Launching headless chromium against ${url}`);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 },
    serviceWorkers: 'block',
  });

  // Seed localStorage BEFORE first navigation. Per index.html:2305, the app
  // persists state as `slyght_v5` = JSON.stringify({S, BILLS}). Strip the
  // export envelope, keep just S + BILLS for the seed.
  const seedPayload = JSON.stringify({ S: exported.S, BILLS: exported.BILLS });
  await ctx.addInitScript((payload) => {
    try {
      window.localStorage.setItem('slyght_v5', payload);
    } catch (e) {
      console.error('addInitScript: localStorage seed failed', e);
    }
  }, seedPayload);

  const page = await ctx.newPage();
  page.on('pageerror', (err) => console.warn(`      [page error] ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.warn(`      [console.error] ${msg.text()}`);
  });

  console.log(`[3/6] Loading page + waiting for BRAIN to initialise`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    return typeof window.BRAIN !== 'undefined'
      && typeof window.S !== 'undefined'
      && Array.isArray(window.S.txns);
  }, { timeout: 20000 });
  // Boot self-test fires at DOMContentLoaded + 500ms (per CLAUDE.md §3).
  // Wait an extra beat to let MODEL settle and derived values compute.
  await page.waitForTimeout(800);

  console.log(`[4/6] Extracting state from running app`);
  const dump = await page.evaluate(() => {
    const safe = (fn, fallback) => { try { return fn(); } catch (e) { return { _error: e.message, fallback }; } };
    const S = window.S || {};
    const BILLS = window.BILLS || [];

    const txnsSorted = (S.txns || [])
      .slice()
      .sort((a, b) => {
        const ad = a && a.date ? new Date(a.date).getTime() : 0;
        const bd = b && b.date ? new Date(b.date).getTime() : 0;
        return bd - ad;
      });

    const auditLog = Array.isArray(S._auditLog) ? S._auditLog : [];

    return {
      meta: {
        capturedAt: new Date().toISOString(),
        appVersion: safe(() => window.APP_VERSION || null, null),
        userAgent: navigator.userAgent,
      },
      raw: {
        bal: S.bal,
        txnsTotal: (S.txns || []).length,
        txnsLast60: txnsSorted.slice(0, 60),
        savingsBuckets: S.savingsBuckets || [],
        debts: (S.debts || []).filter(d => !d.paid),
        debtsAll: S.debts || [],
        bills: BILLS,
        paidBills: S.paidBills || {},
        activePlan: S.activePlan || null,
        auditLogTotal: auditLog.length,
        auditLogLast200: auditLog.slice(-200),
        payday: S.payday,
        paydayReceived: S.paydayReceived,
        paydayAmount: S.paydayAmount,
        bonuses: S.bonuses || [],
      },
      derived: {
        netWorth: safe(() => (typeof getNetWorth === 'function' ? getNetWorth() : null), null),
        genuineSurplus: safe(() => (typeof getGenuineSurplus === 'function' ? getGenuineSurplus() : null), null),
        survivalMode: safe(() => (typeof getSurvivalMode === 'function' ? getSurvivalMode() : null), null),
        slyghtScore: safe(() => (typeof SLYGHT_SCORE !== 'undefined' && SLYGHT_SCORE.calculate ? SLYGHT_SCORE.calculate() : null), null),
        model: safe(() => (typeof MODEL !== 'undefined' ? {
          daysToPayday: MODEL.daysToPayday,
          paydayDate: MODEL.paydayDate,
        } : null), null),
        brainBalance: safe(() => (window.BRAIN && BRAIN.balance && typeof BRAIN.balance.get === 'function' ? BRAIN.balance.get() : null), null),
        bootSelfTest: safe(() => (window.BRAIN && BRAIN.selfTest && BRAIN.selfTest.last ? BRAIN.selfTest.last : null), null),
      },
    };
  });

  await browser.close();

  const slug = tsSlug();
  const jsonPath = path.join(outDir, `slyght-state-${slug}.json`);
  const mdPath = path.join(outDir, `slyght-state-${slug}-summary.md`);

  console.log(`[5/6] Writing dump → ${path.relative(PROJECT_ROOT, jsonPath)}`);
  fs.writeFileSync(jsonPath, JSON.stringify(dump, null, 2));

  console.log(`[6/6] Generating summary → ${path.relative(PROJECT_ROOT, mdPath)}`);
  fs.writeFileSync(mdPath, renderSummary(dump, { sourceFile: statePath, url }));

  console.log('');
  console.log('DONE.');
  console.log(`  JSON dump:  ${jsonPath}`);
  console.log(`  Summary:    ${mdPath}`);
  console.log('');
}

function renderSummary(dump, opts) {
  const { raw, derived, meta } = dump;
  const lines = [];

  lines.push(`# slyght state dump — ${meta.capturedAt}`);
  lines.push('');
  lines.push(`> Generated by \`scripts/dump-app-state.js\` from \`${opts.sourceFile}\`.`);
  lines.push(`> Loaded against: \`${opts.url}\`.`);
  lines.push('');

  // ─── Section: Headline numbers ─────────────────────────────────────
  lines.push('## Headline numbers');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('|---|---|');
  lines.push(`| Hero balance (\`S.bal\`) | **${fmtUSD(raw.bal)}** |`);
  if (derived.brainBalance != null && !derived.brainBalance._error) {
    lines.push(`| BRAIN.balance.get() | ${fmtUSD(derived.brainBalance)} |`);
  }
  if (derived.netWorth && !derived.netWorth._error) {
    const nw = derived.netWorth;
    lines.push(`| Net worth (net) | ${fmtUSD(nw.net != null ? nw.net : nw)} |`);
    if (nw.assets != null) lines.push(`| Assets | ${fmtUSD(nw.assets)} |`);
    if (nw.liabilities != null) lines.push(`| Liabilities | ${fmtUSD(nw.liabilities)} |`);
  }
  if (typeof derived.genuineSurplus === 'number') {
    lines.push(`| Genuine surplus | ${fmtUSD(derived.genuineSurplus)} |`);
  }
  if (derived.survivalMode) {
    lines.push(`| Survival mode | ${derived.survivalMode} |`);
  }
  if (derived.model && derived.model.daysToPayday != null) {
    lines.push(`| Days to payday | ${derived.model.daysToPayday} |`);
    if (derived.model.paydayDate) {
      lines.push(`| Payday date | ${fmtDateTime(derived.model.paydayDate)} |`);
    }
  }
  if (derived.slyghtScore && derived.slyghtScore.total != null) {
    lines.push(`| SLYGHT Score | ${derived.slyghtScore.total} |`);
  }
  lines.push(`| Txns total | ${raw.txnsTotal} |`);
  lines.push(`| Audit log entries | ${raw.auditLogTotal} |`);
  lines.push('');

  // ─── Section: Boot self-test ─────────────────────────────────────
  if (derived.bootSelfTest) {
    const bst = derived.bootSelfTest;
    lines.push('## Boot self-test');
    lines.push('');
    if (bst._error) {
      lines.push(`Error reading boot self-test: ${bst._error}`);
    } else {
      lines.push(`- Last run: ${fmtDateTime(bst.timestamp || bst.ranAt)}`);
      lines.push(`- Total: ${bst.total} · Pass: ${bst.passed != null ? bst.passed : bst.pass} · Fail: ${bst.failed != null ? bst.failed : bst.fail}`);
      const failures = (bst.results || []).filter(r => !r.ok && !r.pass);
      if (failures.length) {
        lines.push('');
        lines.push('Failures:');
        for (const f of failures) lines.push(`  - ${f.name || f.check}: ${f.message || f.reason || ''}`);
      }
    }
    lines.push('');
  }

  // ─── Section: Last 60 transactions ─────────────────────────────────
  lines.push(`## Last 60 transactions (of ${raw.txnsTotal})`);
  lines.push('');
  lines.push('| # | Date | Amount | Category | Source | Note |');
  lines.push('|---:|---|---:|---|---|---|');
  raw.txnsLast60.forEach((t, i) => {
    const date = t.date ? fmtDateTime(t.date) : '';
    const amt = typeof t.amt === 'number' ? fmtUSD(t.amt) : (typeof t.amount === 'number' ? fmtUSD(t.amount) : '');
    const cat = t.cat || t.category || '';
    const src = t.source || t.src || '';
    const note = (t.note || t.label || t.description || '').toString().replace(/\|/g, '\\|').slice(0, 60);
    lines.push(`| ${i + 1} | ${date} | ${amt} | ${cat} | ${src} | ${note} |`);
  });
  lines.push('');

  // ─── Section: Active plan ─────────────────────────────────────────
  lines.push('## Active payday plan');
  lines.push('');
  const ap = raw.activePlan;
  if (!ap) {
    lines.push('_No active plan._');
  } else {
    lines.push(`- Locked: ${ap.locked ? 'YES' : 'no'}`);
    if (ap.lockedAt) lines.push(`- Locked at: ${fmtDateTime(ap.lockedAt)}`);
    if (ap.paydayDate) lines.push(`- For payday: ${ap.paydayDate}`);
    if (Array.isArray(ap.allocations)) {
      lines.push('');
      lines.push('### Allocations / line items');
      lines.push('');
      lines.push('| # | Label | Amount | Override | Ticked? | Bucket |');
      lines.push('|---:|---|---:|---:|:---:|---|');
      ap.allocations.forEach((a, i) => {
        const amt = typeof a.amt === 'number' ? fmtUSD(a.amt) : (typeof a.amount === 'number' ? fmtUSD(a.amount) : '');
        const ov = a.override != null ? fmtUSD(a.override) : '';
        const ticked = a.ticked || a.allocated || a.marked ? '✓' : '';
        const bucket = a.bucket || a.bucketId || '';
        const label = (a.label || a.name || a.id || '').toString().replace(/\|/g, '\\|');
        lines.push(`| ${i + 1} | ${label} | ${amt} | ${ov} | ${ticked} | ${bucket} |`);
      });
    }
    if (Array.isArray(ap.items)) {
      lines.push('');
      lines.push('### items');
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(ap.items, null, 2));
      lines.push('```');
    }
  }
  lines.push('');

  // ─── Section: Debts ──────────────────────────────────────────────
  lines.push(`## Debts (active: ${raw.debts.length} · total in S.debts: ${raw.debtsAll.length})`);
  lines.push('');
  lines.push('| # | Name | Balance | Min payment | Paid off so far | Status |');
  lines.push('|---:|---|---:|---:|---:|:---:|');
  raw.debtsAll.forEach((d, i) => {
    const bal = typeof d.amt === 'number' ? fmtUSD(d.amt) : (typeof d.balance === 'number' ? fmtUSD(d.balance) : '');
    const minP = typeof d.minPayment === 'number' ? fmtUSD(d.minPayment) : (typeof d.min === 'number' ? fmtUSD(d.min) : '');
    const paid = typeof d.paidOff === 'number' ? fmtUSD(d.paidOff) : '';
    const status = d.paid ? 'paid' : (d.archived ? 'archived' : 'active');
    lines.push(`| ${i + 1} | ${d.name || ''} | ${bal} | ${minP} | ${paid} | ${status} |`);
  });
  lines.push('');

  // ─── Section: Bills ──────────────────────────────────────────────
  const paidKeys = Object.keys(raw.paidBills || {});
  lines.push(`## Bills (${raw.bills.length} entries · ${paidKeys.length} marked paid this period)`);
  lines.push('');
  lines.push('| # | Name | Amount | Frequency | Due / next | After payday? | Paid this period? |');
  lines.push('|---:|---|---:|---|---|:---:|:---:|');
  raw.bills.forEach((b, i) => {
    const amt = typeof b.amt === 'number' ? fmtUSD(b.amt) : (typeof b.amount === 'number' ? fmtUSD(b.amount) : '');
    const freq = b.freq || b.frequency || '';
    const due = b.dueDate || b.due || b.nextDue || '';
    const afterPayday = (b.afterPayday || b.postPayday) ? '✓' : '';
    const billKey = b.id || b.name;
    const paid = paidKeys.includes(billKey) ? '✓ ' + fmtDateTime(raw.paidBills[billKey]) : '';
    lines.push(`| ${i + 1} | ${b.name || ''} | ${amt} | ${freq} | ${due} | ${afterPayday} | ${paid} |`);
  });
  lines.push('');

  // ─── Section: Savings buckets ────────────────────────────────────
  lines.push(`## Savings buckets (${raw.savingsBuckets.length})`);
  lines.push('');
  lines.push('| # | Name | Saved | Target | % of target |');
  lines.push('|---:|---|---:|---:|---:|');
  let bucketTotal = 0;
  raw.savingsBuckets.forEach((b, i) => {
    const saved = typeof b.saved === 'number' ? b.saved : 0;
    bucketTotal += saved;
    const target = typeof b.target === 'number' ? b.target : null;
    const pct = (target && target > 0) ? Math.round((saved / target) * 100) + '%' : '';
    lines.push(`| ${i + 1} | ${b.name || b.id || ''} | ${fmtUSD(saved)} | ${target != null ? fmtUSD(target) : ''} | ${pct} |`);
  });
  lines.push(`| | **Total saved across buckets** | **${fmtUSD(bucketTotal)}** | | |`);
  lines.push('');

  // ─── Section: Audit log — last 7 days grouped by source ──────────
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const recent = (raw.auditLogLast200 || []).filter(e => {
    const t = e.ts || e.timestamp || e.time;
    if (!t) return false;
    const tn = typeof t === 'number' ? t : new Date(t).getTime();
    return (now - tn) <= sevenDaysMs;
  });
  const bySource = {};
  for (const e of recent) {
    const src = e.source || e.src || e.action || '(no source)';
    if (!bySource[src]) bySource[src] = [];
    bySource[src].push(e);
  }
  const sortedSources = Object.keys(bySource).sort((a, b) => bySource[b].length - bySource[a].length);
  lines.push(`## Audit log — last 7 days (${recent.length} of last 200) grouped by source`);
  lines.push('');
  if (!sortedSources.length) {
    lines.push('_No audit entries in the last 7 days._');
  } else {
    for (const src of sortedSources) {
      const entries = bySource[src];
      lines.push(`### \`${src}\` — ${entries.length} entries`);
      lines.push('');
      lines.push('| Time | Action | Field | Old → New | OK? |');
      lines.push('|---|---|---|---|:---:|');
      for (const e of entries.slice(0, 25)) {
        const ts = e.ts || e.timestamp || e.time;
        const t = ts ? fmtDateTime(typeof ts === 'number' ? new Date(ts).toISOString() : ts) : '';
        const action = e.action || '';
        const field = e.field || e.key || '';
        const oldV = e.old != null ? String(e.old).slice(0, 30) : '';
        const newV = e.new != null ? String(e.new).slice(0, 30) : '';
        const delta = (oldV || newV) ? `${oldV} → ${newV}` : '';
        const ok = e.ok === false ? '✗' : (e.ok === true ? '✓' : '');
        lines.push(`| ${t} | ${action} | ${field} | ${delta} | ${ok} |`);
      }
      if (entries.length > 25) lines.push(`| ... | (${entries.length - 25} more) | | | |`);
      lines.push('');
    }
  }

  // ─── Section: Files written ──────────────────────────────────────
  lines.push('---');
  lines.push('');
  lines.push('Generated by `scripts/dump-app-state.js`. Companion JSON dump in the same directory has full unfiltered state for any deeper investigation.');
  lines.push('');

  return lines.join('\n');
}

main().catch((err) => {
  console.error('\nFATAL:', err.stack || err.message);
  process.exit(1);
});
