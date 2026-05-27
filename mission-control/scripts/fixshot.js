// Capture a screenshot of the FIXED app for a ticket — the "what the new screen looks like" preview (#36).
// Run by the server: node fixshot.js <id> <worktreePath> <outPng>. Serves the worktree's fixed
// index.html FAKE-seeded (never real money), drives a per-ticket sequence (or the landing), and
// screenshots to <outPng>. Deterministic + server-controlled (not a drone) so the capture is reliable.
'use strict';
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const [, , ID, WT, OUT] = process.argv;
if (!ID || !WT || !OUT) { console.error('usage: fixshot.js <id> <worktree> <out>'); process.exit(2); }
const PORT = 4590 + Math.floor(Math.random() * 80);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/index.html';
  const fp = path.join(WT, p);
  fs.readFile(fp, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': TYPES[path.extname(fp)] || 'text/plain' }); res.end(d); });
});

// Per-ticket drive sequences — open the app to the state that shows the fix. Extend as fixes land;
// the default just captures the seeded landing (the fixed app, running). Each is best-effort.
const SEQUENCES = {
  'SLY-1': () => { openQuickLogModal(); const c = document.querySelector('#ql-type-chips button[data-type="savings"]'); if (c) selectTxnType(c, 'savings'); },
};

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const fx = JSON.parse(fs.readFileSync(path.join(WT, 'state-snapshot.json'), 'utf8'));
  const seed = { S: Object.assign({}, fx.S || {}), BILLS: fx.BILLS || [] };
  if (fx.paidBills && !seed.S.paidBills) seed.S.paidBills = fx.paidBills;
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
  await pg.addInitScript((s) => { try { localStorage.setItem('slyght_v5', JSON.stringify(s)); localStorage.setItem('slyght_seeded_v13', '1'); localStorage.setItem('slyght_seeded_v12', '1'); localStorage.setItem('slyght_seeded_v11', '1'); } catch (_) {} }, seed);
  await pg.goto('http://localhost:' + PORT + '/', { waitUntil: 'domcontentloaded' });
  await pg.waitForFunction(() => typeof BRAIN !== 'undefined', { timeout: 7000 }).catch(() => {});
  await pg.evaluate(() => { if (typeof splashTap === 'function') splashTap(); }).catch(() => {});
  await pg.waitForTimeout(400);
  const seqSrc = SEQUENCES[ID];
  if (seqSrc) { try { await pg.evaluate('(' + seqSrc.toString() + ')()'); await pg.waitForTimeout(350); } catch (_) {} }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await pg.screenshot({ path: OUT });
  await b.close(); server.close();
  process.exit(0);
})().catch(e => { try { server.close(); } catch (_) {} console.error(e && e.message); process.exit(1); });
