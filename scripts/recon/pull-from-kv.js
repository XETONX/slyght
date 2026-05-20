#!/usr/bin/env node
// pull-from-kv.js — Bundle 32a fixture-freshness substrate.
//
// Pulls the latest {S, BILLS} blob from the Cloudflare Worker's
// /pull-full-state endpoint and writes it to state-snapshot.json.
// The app (via _schedulePushFullState in index.html) debounce-uploads
// after every save() so this endpoint always has John's most recent
// state — typically within 30 seconds of his last interaction.
//
// Run before any smoke session that depends on current state:
//   npm run fixture:fresh
//   npm run smoke   (auto-runs fixture:fresh first via package.json)
//
// FAILURE MODE (intentional): graceful degradation, not hard fail.
//   - Worker unreachable / endpoint not deployed → WARN + keep
//     existing state-snapshot.json (smoke runs against stale fixture)
//   - 404 (app has never pushed) → WARN + keep existing fixture
//   - Bad shape (no .S or .BILLS) → WARN + keep existing fixture
//   - state-snapshot.json missing AND pull fails → EXIT 2 (can't run)
//
// Goal: surface fixture staleness in every smoke output, never silently
// proceed against synthetic state. But also don't block dev work when
// the worker is mid-deploy or John is offline.
//
// Usage:
//   node scripts/recon/pull-from-kv.js
//   node scripts/recon/pull-from-kv.js --url=<worker-url>
//   node scripts/recon/pull-from-kv.js --out=<path>
//   SKIP_FRESH_FIXTURE=1 node scripts/recon/pull-from-kv.js  (no-op)

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_WORKER = 'https://slyght-worker.johndounas.workers.dev';
const DEFAULT_OUT = path.join(PROJECT_ROOT, 'state-snapshot.json');

function parseArgs(argv) {
  const args = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

function log(level, msg) {
  const tag = { info: '[fixture:fresh]', warn: '[fixture:fresh] ⚠️', err: '[fixture:fresh] ❌', ok: '[fixture:fresh] ✓' }[level] || '[fixture:fresh]';
  console.log(tag + ' ' + msg);
}

function fmtBytes(n) {
  if (typeof n !== 'number' || !isFinite(n)) return 'n/a';
  if (n < 1024) return n + 'B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + 'kB';
  return (n / (1024 * 1024)).toFixed(2) + 'MB';
}

function fmtAge(ts) {
  if (!ts) return 'unknown';
  const ms = Date.now() - new Date(ts).getTime();
  if (!isFinite(ms)) return 'unknown';
  const min = Math.floor(ms / 60000);
  if (min < 60) return min + ' min ago';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + 'h ' + (min % 60) + 'm ago';
  const day = Math.floor(hr / 24);
  return day + 'd ' + (hr % 24) + 'h ago';
}

async function main() {
  if (process.env.SKIP_FRESH_FIXTURE === '1') {
    log('info', 'SKIP_FRESH_FIXTURE=1 — skipping pull, using existing state-snapshot.json');
    return 0;
  }

  const args = parseArgs(process.argv);
  const workerUrl = (args.url || DEFAULT_WORKER).replace(/\/$/, '');
  const outPath = args.out ? path.resolve(args.out) : DEFAULT_OUT;
  const existing = fs.existsSync(outPath);

  log('info', 'pulling from ' + workerUrl + '/pull-full-state');
  let res;
  try {
    res = await fetch(workerUrl + '/pull-full-state', {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
  } catch (e) {
    log('warn', 'network error: ' + e.message);
    if (!existing) {
      log('err', 'no existing state-snapshot.json — smoke cannot run');
      return 2;
    }
    let mtime = 'unknown';
    try { mtime = fs.statSync(outPath).mtime.toISOString(); } catch (_) {}
    log('warn', 'keeping existing state-snapshot.json (mtime: ' + mtime + ')');
    log('warn', 'smoke will run against STALE fixture — flag in any ship message');
    return 0;
  }

  if (res.status === 404) {
    log('warn', 'worker responded 404 — app has never pushed full state');
    log('warn', '  → either worker is missing the /pull-full-state endpoint (deploy with `cd slyght-worker && npx wrangler deploy`)');
    log('warn', '  → or John\'s app hasn\'t saved since the new push-on-save build deployed');
    if (existing) {
      log('warn', 'keeping existing state-snapshot.json');
      return 0;
    }
    log('err', 'no existing state-snapshot.json — smoke cannot run');
    return 2;
  }

  if (!res.ok) {
    log('warn', 'worker non-OK: ' + res.status + ' ' + res.statusText);
    if (existing) {
      log('warn', 'keeping existing state-snapshot.json');
      return 0;
    }
    return 2;
  }

  const lastPushed = res.headers.get('x-slyght-last-pushed-at');
  const byteSize = res.headers.get('x-slyght-byte-size');
  log('info', 'KV last push: ' + (lastPushed || 'unknown') + ' (' + fmtAge(lastPushed) + ') · ' + fmtBytes(parseInt(byteSize, 10) || 0));

  let body;
  try {
    body = await res.json();
  } catch (e) {
    log('warn', 'response not valid JSON: ' + e.message);
    if (existing) {
      log('warn', 'keeping existing state-snapshot.json');
      return 0;
    }
    return 2;
  }

  if (!body || typeof body !== 'object' || !body.S || !Array.isArray(body.BILLS)) {
    log('warn', 'KV blob missing .S or .BILLS — bad shape');
    if (existing) {
      log('warn', 'keeping existing state-snapshot.json');
      return 0;
    }
    return 2;
  }

  // Diff vs existing for visibility
  if (existing) {
    try {
      const prior = JSON.parse(fs.readFileSync(outPath, 'utf8'));
      const priorS = prior.S || prior;
      const priorTxns = (priorS.txns || []).length;
      const priorBal = priorS.bal;
      const priorIntents = (priorS.planIntents || []).length;
      const newTxns = (body.S.txns || []).length;
      const newBal = body.S.bal;
      const newIntents = (body.S.planIntents || []).length;
      const txnDelta = newTxns - priorTxns;
      const balDelta = (typeof newBal === 'number' && typeof priorBal === 'number') ? (newBal - priorBal) : null;
      const intentDelta = newIntents - priorIntents;
      log('info', 'diff: txns ' + priorTxns + ' → ' + newTxns + ' (' + (txnDelta >= 0 ? '+' : '') + txnDelta + ') · bal $' + (priorBal || 0).toFixed(2) + ' → $' + (newBal || 0).toFixed(2) +
        (balDelta !== null ? ' (' + (balDelta >= 0 ? '+' : '') + '$' + balDelta.toFixed(2) + ')' : '') +
        ' · intents ' + priorIntents + ' → ' + newIntents + ' (' + (intentDelta >= 0 ? '+' : '') + intentDelta + ')');
    } catch (_) {}
  }

  // Write atomically: write to .tmp then rename
  const tmpPath = outPath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(body, null, 0), 'utf8');
  fs.renameSync(tmpPath, outPath);
  log('ok', 'state-snapshot.json refreshed (' + fmtBytes(fs.statSync(outPath).size) + ')');
  return 0;
}

main().then((code) => process.exit(code || 0)).catch(e => {
  log('err', 'unexpected: ' + e.stack);
  process.exit(2);
});
