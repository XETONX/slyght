#!/usr/bin/env node
/* ============================================================================
 * slyght — App Map flow-trace merger (Phase 1)
 *
 * Each surface's COMPLETE intended journey (IS-vs-SHOULD, real slyght steps,
 * gaps in-place) is hand-traced into mission-control/flows/<surface>.json — one
 * file per surface IS the checkpoint (a crash mid-grind keeps completed surfaces).
 * This merges them into mission-control/flows.json (+ a roster of all surfaces,
 * traced vs not-yet, so the App Map is honest about coverage), gzipped.
 *
 * is-status per step: ok | gap (missing rung) | dead (never reached) |
 * fires-anyway (fires regardless — usually the harm) | broken (present but wrong).
 *     node scripts/mc/build-flows.js
 * ==========================================================================*/
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const MC = path.resolve(__dirname, '..', '..', 'mission-control');
const FLOWDIR = path.join(MC, 'flows');

// the full surface roster — App Map shows traced vs not-yet (honest coverage)
const ROSTER = [
  { id: 'dashboard', name: 'Dashboard' }, { id: 'bills', name: 'Bills & calendar' },
  { id: 'savings', name: 'Savings & goals' }, { id: 'plan', name: 'Payday plan' },
  { id: 'analysis', name: 'Analysis' }, { id: 'debts', name: 'Debts' },
  { id: 'ai', name: 'AI chat' }, { id: 'settings', name: 'Settings' }, { id: 'nav', name: 'Nav / onboarding' },
];

const traced = fs.existsSync(FLOWDIR)
  ? fs.readdirSync(FLOWDIR).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(FLOWDIR, f), 'utf8')))
  : [];
const tracedIds = new Set(traced.map(s => s.id));

const surfaces = traced.map(s => {
  const steps = s.steps || [];
  const counts = { total: steps.length, gaps: steps.filter(x => x.is === 'gap' || x.is === 'broken').length, dead: steps.filter(x => x.is === 'dead').length, firesAnyway: steps.filter(x => x.is === 'fires-anyway').length };
  return { ...s, counts };
});

const roster = ROSTER.map(r => ({ ...r, traced: tracedIds.has(r.id), ticket: (traced.find(t => t.id === r.id) || {}).ticket || null }));
const out = {
  generatedAt: new Date().toISOString(),
  coverage: { traced: surfaces.length, total: ROSTER.length },
  roster,
  surfaces,
};
const json = JSON.stringify(out, null, 2);
fs.writeFileSync(path.join(MC, 'flows.json'), json);
fs.writeFileSync(path.join(MC, 'flows.json.gz'), zlib.gzipSync(json));
console.log(`flows.json: ${surfaces.length}/${ROSTER.length} surfaces traced (${surfaces.map(s => s.id).join(', ')}); ${surfaces.reduce((n, s) => n + s.counts.gaps, 0)} gaps in place`);
