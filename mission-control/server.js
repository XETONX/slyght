#!/usr/bin/env node
/* ============================================================================
 * slyght — Mission Control server
 *
 * The ONE piece that turns the read-only cockpit page into a cockpit with hands.
 * A browser page cannot write to disk (sandbox); this Node process — started by
 * John, running with his permissions — does the writing, but ONLY through a
 * fixed, named, path-jailed set of actions. Built to the seven hard security
 * rules (see mission-control/SECURITY.md):
 *
 *   1. Localhost-only      — listen on 127.0.0.1, never 0.0.0.0.
 *   2. Allowlisted actions — a FIXED menu; no arbitrary exec / writeFile(path).
 *   3. Path-jailing        — every write resolves inside the slyght repo or is rejected.
 *   4. Origin-locked + token — writes need the right Origin stamp AND the start-time token.
 *   5. Manual start/stop   — `node mission-control/server.js`; Ctrl-C kills it.
 *   6. Deploy confirm      — deploy() (git push) needs explicit confirm:true.
 *   7. Written down        — this header + SECURITY.md.
 *
 * Start:  node mission-control/server.js   →  open the printed http://127.0.0.1:5050
 * ==========================================================================*/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PORT = 5050;
const HOST = '127.0.0.1';                              // RULE 1 — loopback only, hard-coded
const REPO = path.resolve(__dirname, '..');            // the slyght repo root (server lives in mission-control/)
const MC = __dirname;
const TOKEN = crypto.randomBytes(24).toString('base64url'); // RULE 4 — fresh per start
const ALLOWED_ORIGINS = new Set([`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`]);

// ── RULE 3: path-jail. Resolve the absolute target; reject anything that is not
//    inside the repo (defeats ../ climbs and absolute-path injection). ─────────
function jail(rel) {
  const t = path.resolve(REPO, rel);
  if (t !== REPO && !t.startsWith(REPO + path.sep)) throw new Error('path escape rejected: ' + rel);
  return t;
}
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'untitled';

// ── Anti-clobber: a full-file write that would shrink an existing file by >50%
//    is refused unless {force:true}. Protects the big hand-maintained docs from
//    an accidental wipe. (OPEN-BUGS never takes a full write at all — see below.)
function writeFull(abs, content, force) {
  if (fs.existsSync(abs) && !force) {
    const cur = fs.readFileSync(abs, 'utf8');
    if (content.length < cur.length * 0.5)
      throw new Error(`refused: would shrink ${path.basename(abs)} ${cur.length}→${content.length} (>50%); pass force:true to override`);
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return { ok: true, bytes: content.length, path: path.relative(REPO, abs) };
}

// ── RULE 2: the FIXED action menu. Each is a named function with a hard-coded
//    target. There is no generic exec or writeFile(anyPath). ──────────────────
let walkChild = null, walkLog = [];           // for runWalk streaming (RULE 2: fixed command)
const ACTIONS = {
  // Compose: a full brief MD lands in mission-control/briefs/<slug>.md
  writeBrief: ({ slug: s, content }) => writeFull(jail(path.join('mission-control', 'briefs', slug(s) + '.md')), String(content || ''), true),

  // Edit forms — full-content writes, path-jailed + anti-clobber guarded. The
  // page loads the real current file, appends the new entry client-side, and
  // sends the whole thing back, so existing content is preserved by construction.
  editFeatureMap: ({ content, force }) => writeFull(jail('FEATURE-MAP.md'), String(content || ''), force),
  editInvariants: ({ content, force }) => writeFull(jail('FINANCIAL-INVARIANTS.md'), String(content || ''), force),
  editRules:      ({ content, force }) => writeFull(jail('MISSION-RULES.md'), String(content || ''), force),
  editWalkSpec:   ({ name, content, force }) => writeFull(jail(path.join('docs', 'walk-and-judge', 'specs', slug(name) + '.md')), String(content || ''), force),

  // OPEN-BUGS — PROSE IS LOAD-BEARING (1064 lines of history). NEVER a full
  // rewrite. Only two surgical ops: append a new section, or replace ONE bug's
  // Status line in place. Everything else stays byte-for-byte.
  addBug: ({ block }) => {
    const abs = jail('OPEN-BUGS.md');
    const cur = fs.readFileSync(abs, 'utf8');
    const add = '\n' + String(block || '').trim() + '\n';
    fs.writeFileSync(abs, cur.replace(/\s*$/, '\n') + add);
    return { ok: true, appended: add.length };
  },
  setBugStatus: ({ bugNum, status }) => {
    const abs = jail('OPEN-BUGS.md');
    const cur = fs.readFileSync(abs, 'utf8');
    const lines = cur.split('\n');
    // find the "## <n>." heading, then the first "- **Status:**" line after it
    const head = new RegExp('^##\\s+' + String(bugNum).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.');
    let i = lines.findIndex(l => head.test(l));
    if (i < 0) throw new Error('bug #' + bugNum + ' not found');
    for (let j = i + 1; j < lines.length && !/^##\s/.test(lines[j]); j++) {
      if (/^- \*\*Status:\*\*/.test(lines[j])) {
        const old = lines[j];
        lines[j] = '- **Status:** ' + String(status || '').trim();
        fs.writeFileSync(abs, lines.join('\n'));
        return { ok: true, was: old.trim(), now: lines[j] };
      }
    }
    throw new Error('no Status line under bug #' + bugNum);
  },

  // RULE 2: fixed command. Optional group/spec scope is VALIDATED against the
  // registry — only known values become a --group=/--spec= arg, never raw input.
  runWalk: ({ group, spec } = {}) => {
    if (walkChild) return { ok: false, reason: 'a walk is already running' };
    const args = [path.join('scripts', 'walker', 'run-walk.js')];
    if (group || spec) {
      let reg = {}; try { reg = JSON.parse(fs.readFileSync(path.join(MC, 'specs.json'), 'utf8')); } catch (_) {}
      if (group && (reg.groups || []).includes(group)) args.push('--group=' + group);
      else if (spec && (reg.specs || []).some(s => s.file === spec)) args.push('--spec=' + spec);
      else return { ok: false, reason: 'unknown walk scope: ' + (group || spec) };
    }
    walkLog = [];
    walkChild = spawn(process.execPath, args, { cwd: REPO });
    const cap = (buf) => String(buf).split('\n').forEach(l => l.trim() && walkLog.push(l));
    walkChild.stdout.on('data', cap);
    walkChild.stderr.on('data', cap);
    walkChild.on('exit', (code) => { walkLog.push('@@WALK_EXIT ' + code); walkChild = null; });
    return { ok: true, started: true, scope: group || spec || 'all' };
  },

  // Persist John's per-case judgment. Path-jailed to one fixed JSON; caseId is a
  // map key (validated to safe chars), never a path.
  saveThoughts: ({ caseId, text }) => {
    if (!caseId || !/^[a-z0-9-]+$/i.test(caseId)) throw new Error('bad caseId');
    const abs = jail(path.join('mission-control', 'case-notes.json'));
    let notes = {}; try { notes = JSON.parse(fs.readFileSync(abs, 'utf8')); } catch (_) {}
    notes[caseId] = { text: String(text || '').slice(0, 20000), updatedAt: new Date().toISOString() };
    fs.writeFileSync(abs, JSON.stringify(notes, null, 2));
    return { ok: true, caseId };
  },

  // ── Command Deck: the Prompt Library store. Path-jailed to ONE fixed JSON;
  //    accepts a list of templates, validates each field's type + length, and
  //    rewrites the whole file (small, fully client-managed list — like
  //    case-notes.json / tickets-manual.json, NOT load-bearing prose). No path
  //    is ever derived from input.
  savePrompts: ({ list }) => {
    if (!Array.isArray(list)) throw new Error('savePrompts: list array required');
    if (list.length > 200) throw new Error('savePrompts: too many templates (max 200)');
    const seen = new Set();
    const clean = list.map((p, i) => {
      const id = String(p && p.id || '').trim();
      if (!/^[a-z0-9-]+$/i.test(id)) throw new Error('bad prompt id at index ' + i);
      if (seen.has(id)) throw new Error('duplicate prompt id: ' + id);
      seen.add(id);
      const vars = Array.isArray(p.vars) ? p.vars.slice(0, 20).map(vr => ({
        name:  String(vr && vr.name || '').replace(/[^\w]/g, '').slice(0, 40),
        label: String(vr && vr.label || '').slice(0, 120),
        kind:  vr && vr.kind === 'ticket' ? 'ticket' : 'text',
        placeholder: String(vr && vr.placeholder || '').slice(0, 120),
      })).filter(vr => vr.name) : [];
      return {
        id,
        title: String(p.title || '').slice(0, 200),
        body:  String(p.body || '').slice(0, 8000),
        vars,
      };
    });
    const abs = jail(path.join('mission-control', 'prompts.json'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify({ prompts: clean }, null, 2));
    return { ok: true, count: clean.length };
  },

  // ── Jarvis loop actions — each path-jailed to ticket-state.json / handoffs/.
  // The comment thread (John ↔ Jarvis ↔ CC), persisted with timestamps.
  addComment: ({ id, author, text }) => {
    if (!/^SLY-\d+$/.test(id)) throw new Error('bad ticket id');
    if (!['john', 'jarvis', 'cc'].includes(author)) throw new Error('bad author');
    const st = readState(); const t = st[id]; if (!t) throw new Error('no such ticket: ' + id);
    t.thread.push({ author, text: String(text || '').slice(0, 8000), ts: new Date().toISOString() });
    const from = t.status;                                                                              // ← capture before the earn
    if (t.status === 'Open' && author === 'john') { t.status = 'Discussing'; t.assignee = 'john'; }  // first comment earns Discussing
    logTransition(id, from, t.status, author);                                                          // ← log Open→Discussing (no-op if unchanged)
    t.lastActivity = new Date().toISOString(); writeState(st);
    return { ok: true, status: t.status, comments: t.thread.length };
  },
  // earned state transition — validated against the state machine; ConfirmedLive
  // cannot be a typed label, it must carry walk evidence.
  setStatus: ({ id, to, evidence }) => {
    if (!/^SLY-\d+$/.test(id)) throw new Error('bad ticket id');
    const st = readState(); const t = st[id]; if (!t) throw new Error('no such ticket: ' + id);
    if (!(TRANSITIONS[t.status] || []).includes(to)) throw new Error(`illegal transition ${t.status} → ${to}`);
    if (to === 'ConfirmedLive' && !(evidence && String(evidence).trim())) throw new Error('ConfirmedLive must be EARNED — attach walk evidence, not a label');
    const from = t.status;                                                                              // ← capture before the change
    t.status = to; t.assignee = assigneeFor(to); if (evidence) t.evidence = String(evidence).slice(0, 4000);
    logTransition(id, from, to, 'john');                                                                // ← driven from the board dropdown (John)
    t.lastActivity = new Date().toISOString(); writeState(st);
    return { ok: true, status: to, assignee: t.assignee };
  },
  // THE GATE — John's alignment collates the rich package + writes the handoff CC reads.
  alignHandoff: ({ id, decision }) => {
    if (!/^SLY-\d+$/.test(id)) throw new Error('bad ticket id');
    const st = readState(); const t = st[id]; if (!t) throw new Error('no such ticket: ' + id);
    const ticket = [...TICKETS(), ...MANUAL()].find(x => x.id === id); if (!ticket) throw new Error('no ticket spine for ' + id);
    if (!['Open', 'Discussing'].includes(t.status)) throw new Error(`can only align from Open/Discussing (now ${t.status})`);
    const abs = jail(path.join('mission-control', 'handoffs', id + '.md'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, collate(ticket, t, decision));
    const from = t.status;                                                                              // ← capture before align (Open or Discussing)
    t.status = 'Aligned'; t.assignee = 'cc';
    logTransition(id, from, 'Aligned', 'john');                                                         // ← THE GATE — log the align edge
    t.alignment = { decision: String(decision || 'agreed with the proposed fix').slice(0, 4000), ts: new Date().toISOString() };
    t.thread.push({ author: 'john', text: '✓ ALIGNED — handed to CC. ' + t.alignment.decision, ts: t.alignment.ts });
    t.lastActivity = t.alignment.ts; writeState(st);
    return { ok: true, status: 'Aligned', handoff: path.relative(REPO, abs), kickoff: `Read ${path.relative(REPO, abs)} and investigate ${id} — post results back into the ticket, my approval before push.` };
  },
  // John (or a walk) creates a ticket → manual store (never clobbered by regen).
  createTicket: ({ title, summary, surface, severity, type }) => {
    if (!title) throw new Error('title required');
    if (type && !['bug', 'feature', 'task'].includes(type)) throw new Error('bad type');
    const all = [...TICKETS(), ...MANUAL()]; const nextN = Math.max(0, ...all.map(t => +(t.id.replace('SLY-', '') || 0))) + 1; const id = 'SLY-' + nextN;
    const manualPath = jail(path.join('mission-control', 'tickets-manual.json'));
    let m = { tickets: [] }; try { m = JSON.parse(fs.readFileSync(manualPath, 'utf8')); } catch (_) {}
    m.tickets.push({ id, type: type || 'task', caseId: null, title: String(title).slice(0, 200), surface: surface || null, group: surface || 'planning', severity: severity || 'P2', kind: 'manual', summary: String(summary || '').slice(0, 2000), rich: { mechanism: '', rootCause: '(manual ticket — no walk evidence yet)', fix: '', files: [], evidence: null }, openBug: null, links: [] });
    fs.mkdirSync(path.dirname(manualPath), { recursive: true }); fs.writeFileSync(manualPath, JSON.stringify(m, null, 2));
    const stt = readState(); const now = new Date().toISOString(); stt[id] = { status: 'Open', assignee: 'john', thread: [], alignment: null, evidence: null, opened: now, lastActivity: now }; writeState(stt);
    return { ok: true, id };
  },
  // John removes a ticket. MANUAL tickets (tickets-manual.json) are deleted outright;
  // GENERATED tickets (the read-only spine) can't be removed from the spine, so we
  // tombstone them with state.deleted=true and mergedTickets() filters them out.
  // Path-jailed to the same two mutable stores createTicket touches. Irreversible
  // by design (the UI gates it behind a typed confirm).
  deleteTicket: ({ id }) => {
    if (!/^SLY-\d+$/.test(id)) throw new Error('bad ticket id');
    // does it exist anywhere in the merged spine?
    const inSpine  = TICKETS().some(t => t.id === id);
    const inManual = MANUAL().some(t => t.id === id);
    if (!inSpine && !inManual) throw new Error('no such ticket: ' + id);

    let removedManual = false;
    if (inManual) {
      const manualPath = jail(path.join('mission-control', 'tickets-manual.json'));
      let m = { tickets: [] }; try { m = JSON.parse(fs.readFileSync(manualPath, 'utf8')); } catch (_) {}
      const before = m.tickets.length;
      m.tickets = m.tickets.filter(t => t.id !== id);
      removedManual = m.tickets.length < before;
      fs.mkdirSync(path.dirname(manualPath), { recursive: true });
      fs.writeFileSync(manualPath, JSON.stringify(m, null, 2));
    }

    // Tombstone the state entry. For a generated (spine) ticket this is what hides it;
    // for a manual ticket it cleans up the orphaned state row too. mergedTickets()
    // drops anything with state.deleted === true.
    const st = readState();
    if (st[id]) { st[id].deleted = true; st[id].deletedAt = new Date().toISOString(); }
    else if (inSpine) { st[id] = { deleted: true, deletedAt: new Date().toISOString() }; } // generated ticket never commented on
    writeState(st);

    return { ok: true, id, kind: removedManual ? 'manual-removed' : 'tombstoned' };
  },
  // CC posts results BACK into the ticket — closes the loop. Optional transition.
  postResult: ({ id, found, fixed, evidence, to, propagate }) => {
    if (!/^SLY-\d+$/.test(id)) throw new Error('bad ticket id');
    const st = readState(); const t = st[id]; if (!t) throw new Error('no such ticket: ' + id);
    t.thread.push({ author: 'cc', text: `**CC result** — Found: ${found || '—'}\nFixed: ${fixed || '—'}\nEvidence: ${evidence || '—'}`.slice(0, 8000), ts: new Date().toISOString() });
    if (to) {
      if (!(TRANSITIONS[t.status] || []).includes(to)) throw new Error(`illegal transition ${t.status} → ${to}`);
      if (to === 'ConfirmedLive' && !(evidence && String(evidence).trim())) throw new Error('ConfirmedLive needs evidence');
      const from = t.status;                                                                            // ← capture before the change
      t.status = to; t.assignee = assigneeFor(to); if (evidence) t.evidence = String(evidence).slice(0, 4000);
      logTransition(id, from, to, 'cc');                                                                // ← CC's post-back transition
    }
    t.lastActivity = new Date().toISOString(); writeState(st);
    // PROPAGATE — Jarvis is the one place: on a terminal state, push the status to
    // the linked canonical record (surgical, prose preserved). The full reasoning
    // stays IN the ticket; OPEN-BUGS just gets the status + a pointer to SLY-N.
    const propagated = [];
    if (to && ['ConfirmedLive', 'Shipped'].includes(to) && propagate !== false) {
      const ticket = [...TICKETS(), ...MANUAL()].find(x => x.id === id);
      if (ticket && ticket.openBug) {
        try { ACTIONS.setBugStatus({ bugNum: ticket.openBug, status: `${to === 'Shipped' ? 'fixed' : 'fix confirmed live'} — Jarvis ${id} (${new Date().toISOString().slice(0, 10)})` }); propagated.push('OPEN-BUGS #' + ticket.openBug); } catch (e) {}
      }
    }
    return { ok: true, status: t.status, propagated };
  },

  // RULE 6: the one irreversible action. git push, hard-coded, and ONLY with
  // an explicit confirm:true (the UI also gates it behind a typed confirmation).
  deploy: ({ confirm }) => {
    if (confirm !== true) return { ok: false, reason: 'deploy refused: confirm:true required (UI confirm gate)' };
    return new Promise((resolve) => {
      const p = spawn('git', ['push'], { cwd: REPO });
      let out = '';
      p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
      p.on('exit', code => resolve({ ok: code === 0, code, output: out.slice(-2000) }));
    });
  },
};

// ── Allowlisted READS (GET). Read-only, localhost-only — no token required, but
//    still a FIXED map (no read-any-file). Every value is jail()'d at read time
//    in the /api/read handler, so each entry is repo-root-relative and read-only. ─
const READS = {
  // Security & governance
  security:       'SECURITY.md',
  'mc-security':  'mission-control/SECURITY.md',
  pipeline:       'docs/PIPELINE.md',
  rules:          'MISSION-RULES.md',
  // The contract
  invariants:     'FINANCIAL-INVARIANTS.md',
  featuremap:     'FEATURE-MAP.md',
  // Project
  openbugs:       'OPEN-BUGS.md',
  'john-knowledge': 'docs/JOHN-KNOWLEDGE.md',
  coverage:       'docs/walk-and-judge/coverage-map-2026-05-26.md',
};

// Default Prompt-Library templates — returned by /api/prompts when prompts.json
// is missing (first run). The Command Deck's "Add Template" → savePrompts writes
// the real file, after which these are no longer used. Title Case titles.
const PROMPT_DEFAULTS = [
  {
    id: 'investigate-ticket',
    title: 'Investigate A Ticket End-To-End',
    body: 'Investigate {ticket}: read its handoff package and run the full 6-tier pipeline. Walk the ledger first (S.txns are truth), confirm the finding is live with the strongest test, fix forward with code context, gate on full Guardian + boot self-test, then post results back into {ticket}. My approval before push.',
    vars: [{ name: 'ticket', label: 'Ticket', kind: 'ticket' }],
  },
  {
    id: 'walk-surface',
    title: 'Walk A Surface And Report Gaps',
    body: 'Walk the {surface} surface and report gaps. Drive the running app, capture every step, then map IS vs SHOULD: each divergence as symptom · INV-NN touched · file:line · severity. Plain English, real names. Report the gap list — do not code.',
    vars: [{ name: 'surface', label: 'Surface', kind: 'text', placeholder: 'e.g. Savings' }],
  },
  {
    id: 'opus-design-review',
    title: 'Ask Opus — Design Review',
    body: 'Ask Opus: design-review {topic}. Frame the problem, the constraints (single-file index.html, vanilla JS, single user John, 380px phone), the options considered, and the recommendation. Surface tradeoffs before any code. Premium-feel, plain English.',
    vars: [{ name: 'topic', label: 'Topic', kind: 'text', placeholder: 'e.g. the lock-state divergence' }],
  },
  {
    id: 'improve-cc-process',
    title: 'Improve CC Process',
    body: 'Improve CC process: {area}. Name the friction, the failure class it belongs to, and a concrete amendment to CLAUDE.md / the CC manual that would prevent it recurring. One rule, testable, plain English.',
    vars: [{ name: 'area', label: 'Area', kind: 'text', placeholder: 'e.g. verification discipline' }],
  },
  {
    id: 'premium-ux-review',
    title: 'Premium UX Review Of A Surface',
    body: 'Premium UX review of the {surface} surface on a 380×660 phone. Check contrast, info-density (4-question test), 44×44 touch targets, alive micro-motion, plain-English labels with real names. Return a prioritised punch-list (P0/P1/P2) with the concrete visible outcome for each.',
    vars: [{ name: 'surface', label: 'Surface', kind: 'text', placeholder: 'e.g. Dashboard' }],
  },
];
function latestWalk() {
  const root = jail(path.join('tests', 'walker-out'));
  if (!fs.existsSync(root)) return null;
  const dirs = fs.readdirSync(root).filter(d => fs.existsSync(path.join(root, d, 'walk.json'))).sort();
  if (!dirs.length) return null;
  const dir = dirs[dirs.length - 1];
  return { dir, walk: JSON.parse(fs.readFileSync(path.join(root, dir, 'walk.json'), 'utf8')) };
}
function listWalkSpecs() {
  const d = jail(path.join('docs', 'walk-and-judge', 'specs'));
  return fs.existsSync(d) ? fs.readdirSync(d).filter(f => f.endsWith('.md')).sort() : [];
}

// ── Jarvis tickets: spine (generated) + mutable state, merged for the API. ────
const TICKETS = () => { try { return JSON.parse(fs.readFileSync(path.join(MC, 'tickets.json'), 'utf8')).tickets || []; } catch { return []; } };
const MANUAL = () => { try { return JSON.parse(fs.readFileSync(path.join(MC, 'tickets-manual.json'), 'utf8')).tickets || []; } catch { return []; } };
const readState = () => { try { return JSON.parse(fs.readFileSync(path.join(MC, 'ticket-state.json'), 'utf8')); } catch { return {}; } };
const writeState = (s) => fs.writeFileSync(jail(path.join('mission-control', 'ticket-state.json')), JSON.stringify(s, null, 2));
// the earned-state machine — each transition is a legal edge, not a free text set
const TRANSITIONS = { Open: ['Discussing'], Discussing: ['Aligned', 'Open'], Aligned: ['Investigating', 'Discussing'], Investigating: ['ConfirmedLive', 'Shipped', 'Aligned'], ConfirmedLive: ['Shipped', 'Investigating'], Shipped: ['Investigating'] };
const STATUSES = ['Open', 'Discussing', 'Aligned', 'Investigating', 'ConfirmedLive', 'Shipped'];
const assigneeFor = (st) => (st === 'Aligned' || st === 'Investigating') ? 'cc' : 'john';
function mergedTickets() {
  const spine = [...TICKETS(), ...MANUAL()], state = readState();
  return {
    tickets: spine
      .filter(t => !(state[t.id] && state[t.id].deleted === true))   // tombstoned tickets are excluded everywhere
      .map(t => ({ ...t, state: state[t.id] || { status: 'Open', assignee: 'john', thread: [], alignment: null, opened: null, lastActivity: null } }))
  };
}
// the COLLATE step — assemble the rich package John's alignment triggers.
function collate(ticket, state, decision) {
  const age = state.opened ? Math.round((Date.now() - new Date(state.opened)) / 86400000) : 0;
  const ev = ticket.rich.evidence; let evTxt = '_(not walked)_';
  if (ev) evTxt = `Flow \`${ev.flow}\` (walk ${ev.walkDir}):\n` + (ev.steps || []).map(s => { const d = Object.entries(s.delta || {}).map(([k, v]) => `${k}: ${v}`).join(', '); return `- ${s.step}: lands [${(s.lands || []).join(', ') || 'NONE — no-op'}]${d ? ' · ' + d : ''}${s.probe ? '\n  probe: ' + JSON.stringify(s.probe) : ''}`; }).join('\n');
  const thread = (state.thread || []).map(c => `- **${c.author}** (${(c.ts || '').slice(0, 16)}): ${c.text}`).join('\n') || '_(no discussion)_';
  const links = (ticket.links || []).map(l => `- ${l.to} — ${l.why}`).join('\n') || '_(none)_';
  return `# Handoff: ${ticket.id} — ${ticket.title}

**${ticket.severity} · ${ticket.kind}** · surface: ${ticket.group} · open ${age} day(s) · aligned ${new Date().toISOString().slice(0, 16)}

## John's alignment decision (the trigger)
${decision || 'agreed with the proposed fix'}

## Summary (what John read)
${ticket.summary}

## The finding — investigate + resolve from this
### Mechanism
${ticket.rich.mechanism || '_(see root cause)_'}
### Root cause
${ticket.rich.rootCause}
### Walk evidence (from the running app)
${evTxt}
### Proposed fix
${ticket.rich.fix}
### Files
${(ticket.rich.files || []).map(f => '- ' + f).join('\n')}

## Discussion thread
${thread}

## Links / relationships
${links}

---
You're receiving this because John ALIGNED. Investigate + resolve the complete package,
then POST BACK into ${ticket.id} (what you found / fixed / evidence). Run the full
6-tier pipeline. Conservation + Guardian green gate. §8 plain-English. My approval before push.
`;
}

// ── Time-series history (the SERIES-metric substrate — see docs/jarvis/metrics-catalog).
// Two append-only stores, each path-jailed to ONE fixed file:
//   • history.jsonl   — one transition event per line {ticketId, from, to, by, ts}
//   • snapshots.json  — one board snapshot per day {date, total, byStatus, bySeverity, gaps, ts}
// Both are RUNTIME (gitignored). logTransition is fire-and-forget: a history-write failure must
// never break the user-facing action it rides inside, so it swallows its own errors.
const HISTORY_FILE   = path.join('mission-control', 'history.jsonl');
const SNAPSHOTS_FILE = path.join('mission-control', 'snapshots.json');

function logTransition(ticketId, from, to, by) {
  if (!from || !to || from === to) return;            // only real edges
  try {
    const abs = jail(HISTORY_FILE);                    // RULE 3 — fixed file, jailed
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.appendFileSync(abs, JSON.stringify({ ticketId, from, to, by: by || 'system', ts: new Date().toISOString() }) + '\n');
  } catch (_) { /* history is best-effort — never break the action it rides inside */ }
}

// Once per day, append a rolled-up board snapshot. Idempotent: if today's date is already
// the last record, do nothing. Computed from mergedTickets() (status/severity) + flows.json (gaps).
function snapshotToday() {
  try {
    const abs = jail(SNAPSHOTS_FILE);                  // RULE 3 — fixed file, jailed
    let arr = []; try { arr = JSON.parse(fs.readFileSync(abs, 'utf8')); if (!Array.isArray(arr)) arr = []; } catch (_) {}
    const date = new Date().toISOString().slice(0, 10);
    if (arr.length && arr[arr.length - 1].date === date) return { ok: true, skipped: 'already snapshotted ' + date };

    const tickets = mergedTickets().tickets;           // tombstoned already filtered out
    const byStatus = {}; STATUSES.forEach(s => byStatus[s] = 0);
    const bySeverity = { P0: 0, P1: 0, P2: 0 };
    tickets.forEach(t => {
      const st = (t.state && t.state.status) || 'Open';
      byStatus[st] = (byStatus[st] || 0) + 1;
      if (t.severity) bySeverity[t.severity] = (bySeverity[t.severity] || 0) + 1;
    });
    let gaps = 0;
    try { const f = JSON.parse(fs.readFileSync(path.join(MC, 'flows.json'), 'utf8')); gaps = (f.surfaces || []).reduce((a, s) => a + (s.counts ? s.counts.gaps : 0), 0); } catch (_) {}

    arr.push({ date, total: tickets.length, byStatus, bySeverity, gaps, ts: new Date().toISOString() });
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(arr, null, 2));
    return { ok: true, date, total: tickets.length };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ── HTTP ────────────────────────────────────────────────────────────────────
const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const p = url.pathname;

  // GET — page + allowlisted reads (no token; read-only, loopback only)
  if (req.method === 'GET') {
    if (p === '/' || p === '/index.html' || p === '/mission-control.html') {
      let html = fs.readFileSync(path.join(MC, 'mission-control.html'), 'utf8');
      html = html.replace('__MC_TOKEN__', TOKEN);          // RULE 4 — inject token into the same-origin page only
      return send(res, 200, html, 'text/html; charset=utf-8');
    }
    if (/^\/[a-z0-9_-]+\.(css|js)$/i.test(p)) {                 // static assets: any .css/.js basename in MC dir (path.basename strips any traversal)
      try { return send(res, 200, fs.readFileSync(path.join(MC, path.basename(p)), 'utf8'), p.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8'); }
      catch (e) { return send(res, 404, { error: e.message }); }
    }
    if (p === '/api/cases') { try { return send(res, 200, JSON.parse(fs.readFileSync(path.join(MC, 'cases.json'), 'utf8'))); } catch (e) { return send(res, 200, { cases: [], counts: {}, error: 'run: node scripts/mc/build-cases.js' }); } }
    if (p === '/api/specs') { try { return send(res, 200, JSON.parse(fs.readFileSync(path.join(MC, 'specs.json'), 'utf8'))); } catch (e) { return send(res, 404, { error: e.message }); } }
    if (p === '/api/notes') { try { return send(res, 200, JSON.parse(fs.readFileSync(path.join(MC, 'case-notes.json'), 'utf8'))); } catch (e) { return send(res, 200, {}); } }
    if (p === '/api/prompts') {
      try { return send(res, 200, JSON.parse(fs.readFileSync(jail(path.join('mission-control', 'prompts.json')), 'utf8'))); }
      catch (e) { return send(res, 200, { prompts: PROMPT_DEFAULTS, seeded: true }); }
    }
    if (p === '/api/tickets') return send(res, 200, mergedTickets());
    if (p === '/api/handoff') { try { return send(res, 200, { id: url.searchParams.get('id'), content: fs.readFileSync(jail(path.join('mission-control', 'handoffs', path.basename(url.searchParams.get('id') || '') + '.md')), 'utf8') }); } catch (e) { return send(res, 404, { error: e.message }); } }
    if (p === '/api/flows') { try { return send(res, 200, JSON.parse(fs.readFileSync(path.join(MC, 'flows.json'), 'utf8'))); } catch (e) { return send(res, 200, { surfaces: [], roster: [], coverage: {}, error: 'run scripts/mc/build-flows.js' }); } }
    if (p === '/api/history') {
      let events = [], snapshots = [];
      try {                                                                       // history.jsonl — last 500 events, newest LAST (chronological)
        const lines = fs.readFileSync(jail(HISTORY_FILE), 'utf8').split('\n').filter(Boolean);
        events = lines.slice(-500).map(l => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
      } catch (_) {}
      try { const a = JSON.parse(fs.readFileSync(jail(SNAPSHOTS_FILE), 'utf8')); if (Array.isArray(a)) snapshots = a; } catch (_) {}
      return send(res, 200, { events, snapshots });
    }
    if (p === '/api/shot') {  // serve a walk screenshot for the App Map "front" view (path-jailed to the latest walk dir)
      const rel = url.searchParams.get('f') || '';
      if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+\.png$/i.test(rel)) return send(res, 400, { error: 'bad shot path' });
      const w = latestWalk(); if (!w) return send(res, 404, { error: 'no walk' });
      try { const png = fs.readFileSync(jail(path.join('tests', 'walker-out', w.dir, rel))); res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }); return res.end(png); }
      catch (e) { return send(res, 404, { error: e.message }); }
    }
    if (p === '/api/gitstatus') {  // read-only git info for the Deploy view (fixed args, no shell)
      const run = (a) => { try { return require('child_process').execFileSync('git', a, { cwd: REPO }).toString().trim(); } catch (e) { return ''; } };
      return send(res, 200, {
        branch: run(['branch', '--show-current']),
        dirty: run(['status', '--porcelain']).split('\n').filter(Boolean),
        unpushed: run(['log', '@{u}..HEAD', '--oneline']).split('\n').filter(Boolean),
      });
    }
    if (p === '/api/walk-latest') { const w = latestWalk(); return send(res, 200, w || { dir: null, walk: null }); }
    if (p === '/api/walkspecs')   return send(res, 200, { specs: listWalkSpecs() });
    if (p === '/api/walkspec')    { try { return send(res, 200, { name: url.searchParams.get('name'), content: fs.readFileSync(jail(path.join('docs','walk-and-judge','specs', path.basename(url.searchParams.get('name')||''))), 'utf8') }, ); } catch (e) { return send(res, 404, { error: e.message }); } }
    if (p === '/api/walklog')     return send(res, 200, { lines: walkLog, running: !!walkChild });
    if (p === '/api/read') {
      const key = url.searchParams.get('name');
      if (!READS[key]) return send(res, 400, { error: 'not an allowlisted read: ' + key });
      try { return send(res, 200, { name: key, content: fs.readFileSync(jail(READS[key]), 'utf8') }); }
      catch (e) { return send(res, 404, { error: e.message, name: key }); }
    }
    return send(res, 404, { error: 'no such read' });
  }

  // POST /api/action — the only write path. RULE 4: origin + token. RULE 2: allowlist.
  if (req.method === 'POST' && p === '/api/action') {
    const origin = req.headers.origin;
    if (origin && !ALLOWED_ORIGINS.has(origin)) return send(res, 403, { error: 'origin not allowed: ' + origin });
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 2e6) req.destroy(); });
    req.on('end', async () => {
      let body; try { body = JSON.parse(raw || '{}'); } catch { return send(res, 400, { error: 'bad json' }); }
      if (body.token !== TOKEN) return send(res, 401, { error: 'bad or missing token' });
      const fn = ACTIONS[body.name];
      if (!fn) return send(res, 400, { error: 'not an allowlisted action: ' + body.name });
      try { return send(res, 200, await fn(body.args || {})); }
      catch (e) { return send(res, 400, { error: e.message, action: body.name }); }
    });
    return;
  }
  return send(res, 404, { error: 'not found' });
});

// RULE 1 + RULE 5 — bind loopback only; runs only while John keeps it running.
server.listen(PORT, HOST, () => {
  const snap = snapshotToday();                                                   // ← daily board snapshot (idempotent per day)
  console.log('\n  slyght · mission control');
  console.log('  ──────────────────────────────────────────────');
  console.log('  open:   http://' + HOST + ':' + PORT + '   (localhost-only)');
  console.log('  token:  ' + TOKEN + '   (auto-injected into the page)');
  console.log('  writes: allowlisted actions only, path-jailed to ' + REPO);
  console.log('  deploy: git push — needs typed confirm, never fires on its own');
  console.log('  history:' + (snap.skipped ? ' ' + snap.skipped : snap.ok ? ' snapshot ' + snap.date + ' (' + snap.total + ' tickets)' : ' snapshot failed: ' + snap.error));
  console.log('  stop:   Ctrl-C\n');
});
