#!/usr/bin/env node
/* ============================================================================
 * slyght — Jarvis ticket spine generator
 *
 * Turns the deep cases (mission-control/cases.json) into TICKETS:
 *   - mission-control/tickets.json  — the SPINE (generated, read-only): SLY-N id,
 *     the lean `summary` John reads + the `rich` block that feeds the CC handoff,
 *     finding `kind`, relationship `links`. Regenerable from cases.
 *   - mission-control/ticket-state.json — the MUTABLE workflow state (status, the
 *     comment thread, alignment decision, assignee, timestamps). Owned by the
 *     server's allowlisted actions; this script only SEEDS it if missing and
 *     NEVER overwrites existing state (John's discussion is load-bearing).
 *
 * The server merges spine + state for /api/tickets. Run after cases refresh:
 *     node scripts/mc/build-tickets.js
 * ==========================================================================*/
'use strict';
const fs = require('fs');
const path = require('path');
const MC = path.resolve(__dirname, '..', '..', 'mission-control');
const cases = JSON.parse(fs.readFileSync(path.join(MC, 'cases.json'), 'utf8')).cases || [];

// stable SLY-N by case order; map caseId → ticketId
const tickets = cases.map((c, i) => ({
  id: 'SLY-' + (i + 1),
  type: 'bug',                    // bug (from a finding) | feature | task — reserved for planning
  caseId: c.id,
  title: c.title,
  surface: c.surface || null,
  group: c.group,
  severity: c.severity,
  kind: c.status,                 // finding kind: confirmed | candidate | tracked (≠ workflow status)
  summary: c.plain,               // LEAN — what John reads
  rich: {                         // DEEP — what feeds the CC handoff payload
    mechanism: c.mechanism || '',
    rootCause: c.rootCause || '',
    fix: c.fix || '',
    files: c.files || [],
    evidence: c.evidence || null,
  },
  openBug: c.openBug || null,
}));

// relationship hints: same-surface siblings + the canonical OPEN-BUGS record
const byId = Object.fromEntries(tickets.map(t => [t.caseId, t.id]));
tickets.forEach(t => {
  const links = [];
  tickets.forEach(o => { if (o.id !== t.id && o.surface && o.surface === t.surface) links.push({ to: o.id, why: `same surface (${t.surface})` }); });
  if (t.openBug) links.push({ to: 'OPEN-BUGS #' + t.openBug, why: 'canonical bug record' });
  t.links = links.slice(0, 4);
});

fs.writeFileSync(path.join(MC, 'tickets.json'), JSON.stringify({ generatedAt: new Date().toISOString(), count: tickets.length, tickets }, null, 2));

// seed mutable state ONLY if absent — never clobber John's threads/status
const statePath = path.join(MC, 'ticket-state.json');
if (!fs.existsSync(statePath)) {
  const now = new Date().toISOString();
  const state = {};
  tickets.forEach(t => { state[t.id] = { status: 'Open', assignee: 'john', thread: [], alignment: null, evidence: null, opened: now, lastActivity: now }; });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  console.log(`tickets.json: ${tickets.length} · ticket-state.json SEEDED (${tickets.length} @ Open)`);
} else {
  // add state rows for any NEW tickets without disturbing existing ones
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const now = new Date().toISOString(); let added = 0;
  tickets.forEach(t => { if (!state[t.id]) { state[t.id] = { status: 'Open', assignee: 'john', thread: [], alignment: null, evidence: null, opened: now, lastActivity: now }; added++; } });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  console.log(`tickets.json: ${tickets.length} · ticket-state.json preserved (+${added} new)`);
}
