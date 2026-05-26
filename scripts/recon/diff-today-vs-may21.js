#!/usr/bin/env node
// One-shot diff between today's KV pull and the May 21 oracle.
// Strips UTF-8 BOM (PowerShell Out-File -Encoding utf8 writes one).

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const todayPath = path.join(ROOT, 'tests', 'state-dump', 'live-2026-05-23.json');
const may21Path = path.join(ROOT, 'tests', 'state-dump', 'live-2026-05-21.json');

function loadJson(p) {
  let txt = fs.readFileSync(p, 'utf8');
  if (txt.charCodeAt(0) === 0xFEFF) txt = txt.slice(1); // strip BOM
  return JSON.parse(txt);
}

const today = loadJson(todayPath);
const may21 = loadJson(may21Path);

const T = today.S || today;
const M = may21.S || may21;

const fmt = (n) => '$' + (+n || 0).toFixed(2);
const pad = (s, n) => String(s).padEnd(n);

console.log('=== live-2026-05-23 vs live-2026-05-21 ===');
console.log(pad('Field', 32) + pad('2026-05-21', 22) + '2026-05-23');
console.log(''.padEnd(80, '-'));

const lines = [
  ['bal', fmt(M.bal), fmt(T.bal) + '  (delta ' + fmt(T.bal - M.bal) + ')'],
  ['txns count', M.txns?.length, T.txns?.length + '  (+' + (T.txns?.length - M.txns?.length) + ')'],
  ['paidBills keys', Object.keys(M.paidBills || {}).length, Object.keys(T.paidBills || {}).length + '  (delta ' + (Object.keys(T.paidBills || {}).length - Object.keys(M.paidBills || {}).length) + ')'],
  ['paydayReceived', M.paydayReceived, T.paydayReceived],
  ['paydayReceivedDate', M.paydayReceivedDate, T.paydayReceivedDate],
  ['activePlan.lockedAt', M.activePlan?.lockedAt || 'null', T.activePlan?.lockedAt || 'null'],
  ['activePlan.cycleStartDate', M.activePlan?.cycleStartDate, T.activePlan?.cycleStartDate],
  ['activePlan.cycleEndDate', M.activePlan?.cycleEndDate, T.activePlan?.cycleEndDate],
  ['bonus.amount', M.activePlan?.income?.bonus?.amount, T.activePlan?.income?.bonus?.amount],
  ['bonus.status', M.activePlan?.income?.bonus?.status, T.activePlan?.income?.bonus?.status],
  ['bonus.included', M.activePlan?.income?.bonus?.included, T.activePlan?.income?.bonus?.included],
  ['mumAccountBalance', fmt(M.mumAccountBalance), fmt(T.mumAccountBalance)],
  ['wrxValue', fmt(M.wrxValue), fmt(T.wrxValue)],
  ['superBalance', fmt(M.superBalance), fmt(T.superBalance)],
  ['carloan', fmt(M.carloan), fmt(T.carloan)],
  ['autodebitProcessingStartTs', new Date(M.autodebitProcessingStartTs || 0).toISOString().slice(0, 16), new Date(T.autodebitProcessingStartTs || 0).toISOString().slice(0, 16)],
  ['autodebitProcessingStartTs (local)', new Date(M.autodebitProcessingStartTs || 0).toString().slice(0, 24), new Date(T.autodebitProcessingStartTs || 0).toString().slice(0, 24)],
  ['planIntents count', M.planIntents?.length, T.planIntents?.length],
  ['weekdayBudget', M.weekdayBudget, T.weekdayBudget],
  ['weekendBudget', M.weekendBudget, T.weekendBudget],
  ['activePlan.dailyLivingFloor', M.activePlan?.dailyLivingFloor, T.activePlan?.dailyLivingFloor],
];
for (const [f, a, b] of lines) console.log(pad(f, 32) + pad(String(a), 22) + String(b));

console.log('\n=== unpaid debts today ===');
const ud = (T.debts || []).filter(d => !d.paid).map(d => ({ name: d.name, amt: d.amt, viaRent: !!d.viaRent, delayDate: d.delayDate }));
console.log(JSON.stringify(ud, null, 2));

console.log('\n=== paidBills DIFF (new keys today not in May 21) ===');
const m21Keys = new Set(Object.keys(M.paidBills || {}));
const newKeys = Object.keys(T.paidBills || {}).filter(k => !m21Keys.has(k));
console.log('new keys (' + newKeys.length + '):');
newKeys.forEach(k => console.log('  +', k, '=>', JSON.stringify(T.paidBills[k]).slice(0, 80)));
const removedKeys = Object.keys(M.paidBills || {}).filter(k => !(k in (T.paidBills || {})));
console.log('removed keys (' + removedKeys.length + '):');
removedKeys.forEach(k => console.log('  -', k));

console.log('\n=== paidBills keys for FUTURE bills (P0-5 candidates) ===');
// today 2026-05-23. cycle 2026-05-15 -> 2026-06-14. Look for paid-keys where bill day is still future.
const futureSuspects = Object.keys(T.paidBills || {}).filter(k => {
  const m = k.match(/^2026-(\d{1,2})-(.+?)-(\d{1,2})$/);
  if (!m) return false;
  const mo = parseInt(m[1]); const day = parseInt(m[3]);
  if (mo === 5 && day > 23) return true;
  if (mo === 6 && day <= 14) return true;
  return false;
});
console.log('future-billDate flagged as paid (' + futureSuspects.length + '):');
futureSuspects.forEach(k => console.log('  >>', k, '=>', JSON.stringify(T.paidBills[k]).slice(0, 100)));

console.log('\n=== new txns since latest May 21 ts ===');
const may21Cut = M.txns?.length ? Math.max(...M.txns.map(t => t.ts || 0)) : 0;
const newer = (T.txns || []).filter(t => (t.ts || 0) > may21Cut).sort((a, b) => b.ts - a.ts);
console.log('cutoff ts:', new Date(may21Cut).toISOString(), '  new txns:', newer.length);
newer.slice(0, 20).forEach(t => {
  const sign = t.income ? '+' : '-';
  const note = (t.note || '').replace(/[-￿]/g, '?').slice(0, 50);
  console.log('  ', new Date(t.ts).toISOString().slice(0, 16), sign + fmt(t.amt).padEnd(10), pad(t.cat || '', 16), '|', note);
});

// File meta
console.log('\n=== meta ===');
console.log('file size (today):', fs.statSync(todayPath).size, 'bytes');
console.log('file size (may21):', fs.statSync(may21Path).size, 'bytes');
