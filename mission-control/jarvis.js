/* ============================================================================
 * Jarvis — slyght mission control. The ticketing platform + CC intermediary.
 * Hash router · board (kanban by status) · ticket detail (the case-view skin) ·
 * the core loop: discuss thread → "get Jarvis's take" → ALIGN gate → collate
 * handoff → CC posts back. Reads /api/tickets; writes via the allowlisted actions.
 * ==========================================================================*/
'use strict';
const TOKEN = window.MC_TOKEN;
const J = { tickets: [], filter: { surface: '', severity: '', type: '', status: '', search: '', sort: 'activity', view: 'all' }, flows: null, autotickets: null, walk: null, mapFace: 'back', mapSurface: null, cal: null, dep: null, ccspend: null };
const STATUSES = ['Open', 'Gathering', 'Discussing', 'Aligned', 'Investigating', 'ConfirmedLive', 'Shipped'];
const STATUS_LABEL = { Open: 'Open', Gathering: 'Gathering', Discussing: 'Discussing', Aligned: 'Aligned', Investigating: 'Investigating', ConfirmedLive: 'Confirmed live', Shipped: 'Shipped' };
// What each status MEANS, who holds the ball, and what's needed — so a status word is never bare.
const STATUS_INFO = {
  Open:          { mean: 'Logged, not started yet',      who: 'you',    need: 'Build the case, or discuss it' },
  Gathering:     { mean: 'Drones are investigating',     who: 'jarvis', need: 'Wait — evidence is filling in' },
  Discussing:    { mean: "You're working it out",         who: 'you',    need: 'Decide, or ask Jarvis' },
  Aligned:       { mean: "You've signed off the fix",     who: 'cc',     need: 'Hand it to CC to implement' },
  Investigating: { mean: 'CC is implementing the fix',    who: 'cc',     need: 'Wait for CC' },
  ConfirmedLive: { mean: 'Fix proven on a walk',          who: 'you',    need: 'Ship it' },
  Shipped:       { mean: 'Done & pushed live',            who: '—',      need: 'Nothing — complete' },
};
const CASE_SLOT_KEYS = ['rootCause', 'surface', 'fix', 'conformance', 'intent', 'design', 'acceptance', 'breakdown'];
const DEPLOY_BRANCHES_C = ['main'];   // mirror of server DEPLOY_BRANCHES — only main may ship to the live app
// The ONE right next step for a ticket, by stage. Drives the prominent NEXT banner + keeps the page
// from showing a wall of co-equal buttons. kind: go (you act) | wait (drones/CC) | done.
function nextAction(t) {
  const cf = t.caseFile || {}; const status = t.state.status;
  const complete = ((cf.audit && cf.audit.verdict) || '') === 'COMPLETE';
  const hasRes = !!cf.resolution;
  const anyCase = CASE_SLOT_KEYS.some(k => cf[k]);
  const fixDone = !!cf.fixImplemented;          // execute-fix drone implemented it in the worktree
  const sandbox = cf.sandbox || null;           // sandbox-confirm verdict (PASS/FAIL)
  const verify = cf.verify || null;             // deterministic Guardian + smoke gate result
  if (status === 'Shipped')        return { label: 'Done', why: 'Shipped and live — nothing left.', kind: 'done' };
  if (status === 'ConfirmedLive')  return { label: 'Ship it', why: 'Verified &amp; sandbox-confirmed. Review the diff &amp; push in Deploy.', fn: `location.hash='#/deploy'`, kind: 'go' };
  if (fdLive(t.id))                return { label: 'Drones working — sit tight', why: 'A drone is on this now. Findings/results land in the case file.', kind: 'wait' };
  // The fix loop: implemented → confirm in sandbox → VERIFY (Guardian + smoke) → ready to ship.
  if (sandbox && sandbox.verdict === 'PASS' && verify && verify.ok) return { label: 'Mark ready to ship', why: 'Sandbox-confirmed AND verified (Guardian clean + smoke green). This commits the fix on main and moves it to Deploy.', fn: `markReadyToShip('${t.id}')`, kind: 'go' };
  if (sandbox && sandbox.verdict === 'PASS' && verify && !verify.ok) return { label: 'Verification failed — re-run the fix', why: 'The gate found ' + ((verify.guardian && verify.guardian.newFindings.length ? verify.guardian.newFindings.length + ' new Guardian finding(s)' : '') || (verify.smoke && verify.smoke.failed ? verify.smoke.failed + ' smoke failure(s)' : 'a problem')) + '. Re-run execute-fix.', fn: `executeFix('${t.id}')`, kind: 'go' };
  if (sandbox && sandbox.verdict === 'PASS') return { label: 'Verify (Guardian + smoke)', why: 'Sandbox walk passed. Run the deterministic gate — Guardian (no new findings) + the ticket&rsquo;s smoke spec — before it can ship.', fn: `verifyFix('${t.id}')`, kind: 'go' };
  if (sandbox && sandbox.verdict === 'FAIL') return { label: 'Sandbox failed — re-run the fix', why: 'The sandbox walk found the fix doesn&rsquo;t work yet (see the verdict below). Re-run execute-fix.', fn: `executeFix('${t.id}')`, kind: 'go' };
  if (fixDone)                     return { label: 'Walk it in the sandbox', why: 'Fix implemented on an isolated main worktree — confirm it actually works (FAKE-seeded) before shipping.', fn: `confirmInSandbox('${t.id}')`, kind: 'go' };
  if (status === 'Aligned')        return { label: 'Execute the fix', why: 'You approved the plan — a drone implements it on an isolated main worktree (nothing pushes; you review the diff).', fn: `executeFix('${t.id}')`, kind: 'go' };
  if (status === 'Investigating')  return { label: 'Execute the fix', why: 'Handed to CC but no fix yet — run the execute-fix drone to implement it on a main worktree.', fn: `executeFix('${t.id}')`, kind: 'go' };
  if (complete && !hasRes)         return { label: 'Compose the resolution', why: 'The case is complete. Get the plain-English resolution, then align.', fn: `composeResolution('${t.id}')`, kind: 'go' };
  if (complete && hasRes)          return { label: 'Align — sign off the fix', why: 'Resolution&rsquo;s ready. Align to hand it to the fix drone.', fn: `align('${t.id}')`, kind: 'go' };
  if (!anyCase)                    return { label: 'Build the case', why: 'No evidence yet — deploy drones to investigate it for you.', fn: `buildCase('${t.id}')`, kind: 'go' };
  return { label: 'Continue the case', why: 'Some evidence is in. Keep building, or run the auditor to check if it&rsquo;s complete.', fn: `buildCase('${t.id}')`, kind: 'go' };
}
function renderNextBanner(t) {
  const a = nextAction(t); const si = STATUS_INFO[t.state.status] || {};
  const btn = a.fn ? `<button class="nx-btn" onclick="${a.fn}">${a.label} &rarr;</button>` : '';
  return `<div class="nx nx-${a.kind}">
    <div class="nx-main">
      <div class="nx-k">NEXT${a.kind === 'wait' ? ' &middot; waiting' : a.kind === 'done' ? '' : ' &middot; your move'}</div>
      <div class="nx-label">${a.label}</div>
      <div class="nx-why">${a.why}</div>
    </div>
    <div class="nx-side">
      ${btn}
      <button class="nx-status" onclick="statusLegend()" title="What the statuses mean"><span class="pill sm s-${t.state.status}">${STATUS_LABEL[t.state.status]}</span><span class="nx-status-need">${esc(si.need || '')}</span></button>
    </div>
  </div>`;
}
function statusLegend() {
  const rows = Object.keys(STATUS_INFO).map(s => `<div class="sl-row"><span class="pill sm s-${s}">${STATUS_LABEL[s]}</span><div class="sl-txt"><b>${esc(STATUS_INFO[s].mean)}</b><span>holds: ${esc(STATUS_INFO[s].who)} &middot; ${esc(STATUS_INFO[s].need)}</span></div></div>`).join('');
  modal(`<h2>What the statuses mean</h2><p>Every ticket flows through these stages. The status tells you who holds the ball and what&rsquo;s needed next.</p><div class="sl-list">${rows}</div><div class="btns"><button class="btn" onclick="closeModal()">Got it</button></div>`);
}
// The 3-tick readiness chip — the contract's home on a ticket. Only on align-able states (pre-Aligned).
function renderReadinessChip(t) {
  if (!['Open', 'Gathering', 'Discussing'].includes((t.state || {}).status)) return '';
  const r = ticketReady(t);
  const tick = (ok, label, detail) => `<span class="rdy-item rdy-${ok ? 'ok' : 'no'}" title="${esc(detail)}">${ok ? '&check;' : '&times;'} ${label}</span>`;
  return `<button class="rdy ${r.ready ? 'rdy-ready' : 'rdy-blocked'}" onclick="readinessLegend('${t.id}')" title="The ready-to-align contract — click for detail">
    <span class="rdy-k">${r.ready ? '&check; READY TO ALIGN' : 'NOT READY TO ALIGN'}</span>
    ${tick(r.caseBacked, 'Case backed', r.caseBacked ? 'A fix is proposed (or the case is COMPLETE)' : 'No proposed fix yet — build the case first')}
    ${tick(r.questionsAnswered, r.questionsAnswered ? 'Questions answered' : r.openQ + ' open', r.questionsAnswered ? 'No open questions' : r.openQ + ' open question(s) — answer before aligning')}
    ${tick(r.findingsLogged, r.findingsLogged ? 'Findings logged' : r.unlogged + ' unlogged', r.findingsLogged ? 'Every surfaced finding is logged' : r.unlogged + ' surfaced finding(s) not yet logged')}
  </button>`;
}
// (a) — triage-rank surfacing: shows the Triage Commander's per-ticket verdict (severity assessment,
// why, recommended drone, learn-for-John) right under the NEXT banner. Persists Jarvis's architectural
// judgment onto the ticket UI, even though the underlying t.severity stays user-owned. Empty when there's
// no triage data for this ticket — never noisy.
function renderTriageVerdict(t) {
  const tr = J._triage; if (!tr || !tr.plan || !Array.isArray(tr.plan.issues)) return '';
  const issue = tr.plan.issues.find(i => i.ticketId === t.id); if (!issue) return '';
  const sevClass = issue.severity === 'P0' ? 's-P0' : issue.severity === 'P1' ? 's-P1' : 's-P2';
  return `<div class="tv">
    <div class="tv-k"><span aria-hidden="true">✦</span> JARVIS TRIAGE <span class="pill sm ${sevClass}">${esc(issue.severity || '?')}</span> <span class="tv-conf">${esc(issue.confidence || '?')}-conf</span></div>
    <div class="tv-why">${esc(issue.why || '')}</div>
    ${issue.learnForJohn ? `<div class="tv-learn"><b>Learn:</b> ${esc(issue.learnForJohn)}</div>` : ''}
    ${issue.recommendedDrone ? `<div class="tv-rec"><b>Recommended drone:</b> ${esc(issue.recommendedDrone)}</div>` : ''}
  </div>`;
}
// One-click chain — when the (b) readiness gate would refuse, this is the Flightdeck card's NEXT action.
// Jarvis fans out: jarvisAskAll on open Qs · dispatchScoped fix-proposal on missing fix. Auto-log (d) catches
// new findings on drone completion, intake-enrichment (e) categorizes resulting sub-tickets. The card is
// John's high-level intent ("close this ticket"); the chain is Jarvis's keyboard underneath.
async function gatherCaseDetails(id) {
  const t = get(id); if (!t) return;
  const r = ticketReady(t);
  if (r.ready) { align(id); return; }
  // Fire the drones + register them in J.ccjobs client-side IMMEDIATELY so fdLive(id) flips true and
  // the ticket moves to IN FLIGHT on next render (otherwise we'd wait for the next /api/ccjobs poll).
  const fires = []; const fired = [];
  const register = (key, task) => { J.ccjobs = J.ccjobs || {}; J.ccjobs[key] = { status: 'running', id, task, mode: 'gather', model: 'sonnet', started: Date.now() }; };
  if (!r.questionsAnswered) fires.push(action('jarvisAskAll', { id, confirm: true }).then(rr => { fired.push(r.openQ + ' open Q' + (r.openQ === 1 ? '' : 's')); if (rr && rr.dispatched) register(rr.dispatched, 'jarvis-chat'); }).catch(() => {}));
  if (!r.caseBacked) fires.push(action('dispatchScoped', { id, task: 'fix-proposal', confirm: true }).then(rr => { fired.push('fix-proposal'); if (rr && rr.dispatched) register(rr.dispatched, 'fix-proposal'); }).catch(() => {}));
  if (!fires.length) {
    toast('Open the case file to log the surfaced findings', 'ok');
    location.hash = '#/ticket/' + id; return;
  }
  await Promise.all(fires);
  if (!fired.length) { toast('Could not dispatch — open the ticket to retry', 'err'); return; }
  // One consolidated toast (avoid the second-toast-overwrites-the-first race) + the dsp watch chain
  // that paints the Agents-Running chip + ensures the live banner (same pattern as boardBuildCase).
  toast(`Jarvis is gathering ${id}: ${fired.join(' + ')} — watch the topbar`, 'ok');
  J.dspWatch = id;
  if ('Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (_) {} }
  await load();
  const h = location.hash || '';
  if (h.startsWith('#/overview') || h === '#/' || h === '') viewFlightdeck();
  dspStartPoll(id); dspRenderTopbar(); dspEnsureBannerTimer();
}
function readinessLegend(id) {
  const t = get(id); const r = ticketReady(t);
  const row = (ok, label, why) => `<div class="sl-row"><span class="pill sm s-${ok ? 'Shipped' : 'Open'}">${ok ? '&check;' : '&times;'}</span><div class="sl-txt"><b>${label}</b><span>${why}</span></div></div>`;
  modal(`<h2>Ready-to-align contract &mdash; ${esc(id)}</h2>
    <p>Align hands the fix to CC, so the ticket should be worked before you sign off. Three things must hold &mdash; or you can sign off anyway on your authority (it&rsquo;s logged on the ticket).</p>
    <div class="sl-list">
      ${row(r.caseBacked, 'Case backed', r.caseBacked ? 'A fix is proposed or the case is COMPLETE.' : 'No proposed fix yet. Build the case, or force-align if you already know the fix.')}
      ${row(r.questionsAnswered, 'Questions answered', r.questionsAnswered ? 'No open questions.' : r.openQ + ' open question(s). Use &ldquo;Ask Jarvis&rdquo; to answer them all.')}
      ${row(r.findingsLogged, 'Findings logged', r.findingsLogged ? 'Every surfaced finding is logged.' : r.unlogged + ' finding(s) surfaced by drones aren&rsquo;t logged yet &mdash; log or dismiss them in the case file.')}
    </div>
    <div class="btns">${r.ready ? `<button class="btn green" onclick="closeModal();align('${id}')">&check; Align</button>` : `<button class="btn danger" onclick="closeModal();forceAlign('${id}')">Align anyway &mdash; I&rsquo;m signing off</button>`}<button class="btn" onclick="closeModal()">Close</button></div>`);
}

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
async function api(p) { const r = await fetch(p); return r.json(); }
async function action(name, args) {
  const r = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, args: args || {}, token: TOKEN }) });
  const j = await r.json(); if (!r.ok || j.ok === false) { toast(j.error || j.reason || 'failed', 'err'); throw new Error(j.error || j.reason); } return j;
}
function toast(m, k) {
  // Premium voice: ensure the first LETTER is capitalised. Skips leading non-letters
  // (✓, “, digits, the em-dash) and never down-cases — so "SLY-1 → Aligned", "CC drone…"
  // and already-Title-Case strings pass through unchanged; "comment added" → "Comment added".
  let s = String(m == null ? '' : m);
  s = s.replace(/^([^A-Za-z]*)([a-z])/, (_, lead, ch) => lead + ch.toUpperCase());
  const t = $('toast'); t.textContent = s; t.className = 'on ' + (k || ''); setTimeout(() => t.className = k || '', 2800);
}
function modal(html) { $('modal').innerHTML = html; $('scrim').classList.add('on'); }
function closeModal() { $('scrim').classList.remove('on'); }
const ago = iso => { if (!iso) return '—'; const d = Math.round((Date.now() - new Date(iso)) / 86400000); return d <= 0 ? 'today' : d + ' day' + (d > 1 ? 's' : ''); };
const when = iso => iso ? new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const sevCls = s => s === 'P0' ? 'p-p0' : s === 'P1' ? 'p-p1' : 'p-p2';

/* ── label helpers ───────────────────────────────────────────────────────
 * niceSurface(id): maps a surface/group id (the raw lowercase strings in the
 * ticket model + flows roster) to a curated Title-Case display name. Falls back
 * to cap() for anything not in the map (future surfaces, 'planning', 'other',
 * 'tracked', etc.) so nothing ever renders raw-lowercase again.
 * cap(s): first-letter-upper per word — for kind ('confirmed') + type ('bug') tags. */
const SURFACE_NAMES = {
  dashboard: 'Dashboard',
  bills:     'Bills',
  savings:   'Savings',
  plan:      'Payday Plan',
  analysis:  'Analysis',
  debts:     'Debts',
  ai:        'AI Chat',
  settings:  'Settings',
  nav:       'Nav / Onboarding',
  planning:  'Planning',
  tracked:   'Tracked',
  other:     'Other',
};
function niceSurface(id) {
  if (id == null || id === '') return '—';
  return SURFACE_NAMES[id] || cap(String(id));
}
function cap(s) {
  return String(s == null ? '' : s)
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || '—';
}

/* Auto-ticketing — count UNTRACKED App-Map gaps (mirror of server.js autoTicket).
 * A step is untracked when it's gap-class (gap/broken/dead/fires-anyway) AND has no per-step
 * `ticket` AND its surface has no top-level `ticket`. Reads the already-loaded J.flows; returns 0
 * before flows load. The SERVER de-dupes against auto-tickets.json, so on a re-run this client
 * number may be >= the server's `created` — that's expected and the toast shows the real count. */
const AT_GAP_CLASS = new Set(['gap', 'broken', 'dead', 'fires-anyway']);
function countUntrackedGaps() {
  if (!J.flows || !J.flows.surfaces) return 0;
  const minted = J.autotickets instanceof Set ? J.autotickets : null;   // gapKeys already auto-ticketed (server dedupe)
  return J.flows.surfaces.reduce((n, s) => {
    if (s.ticket) return n;                                  // surface-level ticket covers its gaps
    return n + (s.steps || []).filter(st =>
      AT_GAP_CLASS.has(st.is) &&
      !st.ticket &&
      !(minted && minted.has(s.id + ':' + st.n))             // already minted on a prior auto-ticket run
    ).length;
  }, 0);
}

/* Hydrate J.autotickets — the Set of gapKeys the server has already auto-ticketed
 * (keys of auto-tickets.json via the read-only /api/autotickets). countUntrackedGaps()
 * subtracts these so the App-Map badge reads true after a run. Best-effort: on any
 * failure leave the Set empty (badge falls back to the flows-only count). */
async function loadAutoTickets() {
  try { const r = await api('/api/autotickets'); J.autotickets = new Set(r.keys || []); }
  catch (_) { J.autotickets = J.autotickets || new Set(); }
}

/* ── data ─────────────────────────────────────────────────────────────── */
async function load() {
  const [t, tr] = await Promise.all([api('/api/tickets'), api('/api/triage').catch(() => null)]);
  J.tickets = t.tickets || [];
  if (tr && !tr.empty) J._triage = tr;   // makes the per-ticket triage verdict available to every view
}
const get = id => J.tickets.find(t => t.id === id);
// the ticket id currently open in the detail view (null elsewhere) — drives the live drone banner
const currentTicketId = () => { const m = (location.hash || '').match(/#\/ticket\/(SLY-\d+)/i); return m ? m[1] : null; };

/* Topbar system-status strip — live mini-stats from J.tickets / J.flows.
 * Safe to call anytime: degrades gracefully before flows/tickets load. */
function renderTopbarStatus() {
  const el = $('sysStatus'); if (!el) return;
  const ts = J.tickets || [];
  const total = ts.length;
  const p0 = ts.filter(t => t.severity === 'P0' && t.state.status !== 'Shipped').length;
  const gaps = J.flows
    ? (J.flows.surfaces || []).reduce((n, s) => n + (s.counts ? s.counts.gaps : 0), 0)
    : null;
  // Health = % of tickets either Shipped or ConfirmedLive (a soft "how green are we" read)
  const done = ts.filter(t => ['Shipped', 'ConfirmedLive'].includes(t.state.status)).length;
  const health = total ? Math.round(done / total * 100) : null;

  const stat = (n, label, cls) =>
    `<span class="sys-stat ${cls || ''}"><b>${n}</b> ${label}</span>`;

  el.innerHTML =
    `<span class="sys-live"><span class="sys-dot"></span> Live · localhost</span>` +
    `<span class="sys-sep"></span>` +
    stat(total, 'Tickets') +
    stat(p0, 'P0', p0 ? 'sys-p0' : '') +
    (gaps != null ? stat(gaps, 'Gaps', gaps ? 'sys-amber' : '') : '') +
    (health != null ? stat(health + '%', 'Health', health >= 60 ? 'sys-green' : 'sys-amber') : '') +
    `<span id="dspAgents" class="dsp-agents"></span>`;
  dspRenderTopbar();   // paint the Agents-Running chip from the last /api/ccjobs poll (if any)
}

/* RETIRED (2026-05-28): the "Now" focus bar duplicated the Flightdeck telemetry strip (and disagreed
 * with it). Per John's cohesion note — kill the Now bar, keep the per-ticket NEXT-move banner. The
 * Flightdeck telemetry is the pipeline pulse on the home; the ticket NEXT banner is the next-move signal.
 * Kept as a no-op (clears its host) so route()/callers and nowJump() references don't break. */
function renderNowBar() {
  const host = $('nowBar'); if (host) host.innerHTML = '';
}
function renderNowBar_retired() {
  const host = $('nowBar'); if (!host) return;
  const ts = J.tickets || [];
  const st = t => (t.state || {}).status;
  const bySev = a => a.slice().sort((x, y) => SEVRANK[x.severity] - SEVRANK[y.severity]);
  const readyShip  = bySev(ts.filter(t => st(t) === 'ConfirmedLive'));
  const readyAlign = bySev(ts.filter(t => { const cf = t.caseFile || {}; return cf.audit && cf.audit.verdict === 'COMPLETE' && ['Gathering', 'Discussing'].includes(st(t)); }));
  const alignIds = new Set(readyAlign.map(t => t.id));
  const needYou   = bySev(ts.filter(t => ['Open', 'Discussing'].includes(st(t)) && !alignIds.has(t.id)));
  const gathering = ts.filter(t => st(t) === 'Gathering');
  const inFlight  = ts.filter(t => ['Aligned', 'Investigating'].includes(st(t)));
  // Stash the segments so nowJump() can route by COUNT (1 → that ticket; >1 → Board pre-filtered).
  J._now = { ship: readyShip, align: readyAlign, need: needYou, gather: gathering, flight: inFlight };
  const seg = (arr, label, tone, key) => arr.length
    ? `<button class="now-seg now-${tone}" title="${esc(arr.map(t => t.id).slice(0, 10).join(', '))}" onclick="nowJump('${key}')"><b class="now-n">${arr.length}</b> <span class="now-l">${label}</span></button>`
    : '';
  const segs = [
    seg(readyShip, 'Ready to ship', 'green', 'ship'),
    seg(readyAlign, 'Ready to align', 'violet', 'align'),
    seg(needYou, 'Need you', 'amber', 'need'),
    seg(gathering, 'Gathering', 'indigo', 'gather'),
    seg(inFlight, 'In flight', 'teal', 'flight'),
  ].filter(Boolean);
  host.innerHTML = segs.length
    ? `<div class="now-wrap"><span class="now-title">Now</span>${segs.join('')}<a class="now-all" href="#/recommend">Recommends →</a></div>`
    : '';
}
// Route a Now-bar segment by COUNT: exactly one → straight to that ticket; more than one → the
// Board pre-filtered to the segment's view (fixes "it keeps bringing me back to SLY-1"). readyAlign
// has no single board view, so it goes to Recommends (its natural home) when there's more than one.
function nowJump(key) {
  const arr = (J._now || {})[key] || [];
  if (!arr.length) return;
  if (arr.length === 1) { goHash('#/ticket/' + arr[0].id); return; }
  if (key === 'align') { goHash('#/recommend'); return; }
  const base = { surface: '', severity: '', type: '', status: '', search: '', sort: 'activity', view: 'all', group: '' };
  const f = { ship: { view: 'live' }, need: { view: 'judgment' }, flight: { view: 'flight' }, gather: { status: 'Gathering' } }[key] || {};
  J.filter = { ...base, ...f };
  goHash('#/board');
}
// Navigate, but force a re-render when the hash is ALREADY the target — setting location.hash to
// its current value fires no hashchange event, so a filter-only jump (board→board) would silently
// no-op. This is why clicking a second Now segment "did nothing" until you went somewhere else first.
function goHash(h) {
  if (location.hash === h) route();
  else location.hash = h;
}

/* ════════════════════════ OVERVIEW (the whole story) ════════════════════ */
const SEVRANK = { P0: 0, P1: 1, P2: 2 };
/* ════════════════════════ FLIGHTDECK — the management home ════════════════════
 * One screen to run it all: tickets grouped by ACTION NEEDED (the pipeline stage), not a flat
 * list — so parallel work never feels endless. Columns flow left->right: NEEDS YOU -> CAN BUNDLE
 * -> READY TO FIX -> IN FLIGHT -> READY TO DEPLOY. See FLIGHTDECK-RETHINK.md. */
function fdLive(id) { const s = (J.sweeps || {})[id]; return (s && s.status === 'running') || Object.values(J.ccjobs || {}).some(j => j.id === id && j.status === 'running'); }
function fdDone(t) { return ['ConfirmedLive', 'Shipped'].includes(t.state.status); }
function fdCaseComplete(t) { return ((t.caseFile && t.caseFile.audit && t.caseFile.audit.verdict) || '') === 'COMPLETE'; }
function fdOpenQ(t) { const cf = t.caseFile || {}; let n = 0; ['rootCause', 'surface', 'fix', 'conformance', 'intent', 'design', 'acceptance'].forEach(k => { const s = cf[k]; if (s && Array.isArray(s.openQuestions)) n += s.openQuestions.length; }); return n; }
// (b) READINESS CONTRACT — a ticket is "ready to align" only when its case backs a fix, every open
// question is answered, and every surfaced finding is logged. The gate GUIDES; John can always
// force-align (his sign-off is authoritative — logged as an override). Mirrored server-side in alignHandoff.
function fdUnloggedFindings(t) {
  const cf = t.caseFile || {};
  // "decided" = either logged as a ticket (spinoffLogged) OR evaluated by auto-log and not qualifying
  // (spinoffEvaluated). Both count as resolved — the gate only counts findings still awaiting a decision.
  const decided = new Set([...(cf.spinoffLogged || []), ...(cf.spinoffEvaluated || [])]);
  const out = new Set();
  ['rootCause', 'surface', 'fix', 'conformance'].forEach(k => { const s = cf[k]; if (!s) return; (s.unmappedTerritory || []).forEach(v => { const x = (typeof v === 'string' ? v : JSON.stringify(v)).trim(); if (x && !decided.has(x)) out.add(x); }); });
  return [...out];
}
function ticketReady(t) {
  const cf = t.caseFile || {};
  const caseBacked = !!(cf.fix && cf.fix.fix) || ((cf.audit && cf.audit.verdict) === 'COMPLETE');
  const openQ = fdOpenQ(t);
  const unlogged = fdUnloggedFindings(t).length;
  return { ready: caseBacked && openQ === 0 && unlogged === 0, caseBacked, questionsAnswered: openQ === 0, findingsLogged: unlogged === 0, openQ, unlogged };
}
const FD_COLS = [
  { key: 'needs',  lbl: 'Needs You',        sub: 'Your call',        tone: 'needs'  },
  { key: 'bundle', lbl: 'Epics',            sub: 'Grouped work',     tone: 'bundle' },
  { key: 'fix',    lbl: 'Ready to Fix',     sub: 'Hand to CC',       tone: 'fix'    },
  { key: 'flight', lbl: 'In Flight',        sub: 'Drones working',   tone: 'flight' },
  { key: 'deploy', lbl: 'Ready to Deploy',  sub: 'Your push',        tone: 'deploy' },
];
function viewFlightdeck() {
  const v = $('view'); v.className = 'view fdeck';
  const ts = J.tickets || [];
  const bySev = a => a.slice().sort((x, y) => SEVRANK[x.severity] - SEVRANK[y.severity]);

  // Assign each non-shipped, non-epic ticket to ONE column, by pipeline priority.
  const live = [], deploy = [], fix = [], needs = [];
  ts.filter(t => t.type !== 'epic' && t.state.status !== 'Shipped').forEach(t => {
    if (fdLive(t.id) || t.state.status === 'Investigating') live.push(t);
    else if (t.state.status === 'ConfirmedLive') deploy.push(t);
    else if (t.state.status === 'Aligned' || fdCaseComplete(t)) fix.push(t);
    else needs.push(t);
  });
  const bundles = ts.filter(t => t.type === 'epic').map(e => {
    const kids = ts.filter(k => k.epic === e.id && k.type !== 'epic');
    return { e, total: kids.length, done: kids.filter(fdDone).length, open: kids.filter(k => !fdDone(k)).length, hot: kids.some(k => fdLive(k.id)) };
  }).filter(g => g.open > 0).sort((a, b) => b.open - a.open);
  const sets = { needs: bySev(needs), bundle: bundles, fix: bySev(fix), flight: bySev(live), deploy: bySev(deploy) };

  const airborne = ts.filter(t => fdLive(t.id)).length;
  const tri = (J._triage && J._triage.plan) || null;
  const sitrepLine = tri && tri.summaryForJohn ? esc(tri.summaryForJohn)
    : 'Ask Jarvis to read your whole backlog — architecture, invariants, live numbers — and tell you what actually matters.';
  const triMeta = (J._triage && J._triage.ts) ? 'Jarvis read this ' + when(J._triage.ts) : 'no triage yet';

  // COMPRESSED CARD — one helper for every ticket column. Top row = id/sev/state-pill/⋯more.
  // Title. Status line (diagnostic). One primary button (or no button + live status). Card click opens ticket.
  const card = (t, opts = {}) => `<div class="fd-card${opts.cls ? ' ' + opts.cls : ''}" data-sev="${t.severity}" onclick="location.hash='#/ticket/${t.id}'" tabindex="0" onkeydown="if(event.key==='Enter')location.hash='#/ticket/${t.id}'">
      <div class="fd-card-top">
        <span class="fd-id">${t.id}</span>
        <span class="fd-sevtag s-${t.severity}">${t.severity}</span>
        <span class="fd-state">${esc(STATUS_LABEL[(t.state || {}).status] || '')}</span>
        ${opts.more || ''}
      </div>
      <div class="fd-title">${esc(String(t.title || '').slice(0, 90))}</div>
      ${opts.statusLine ? `<div class="fd-statusline">${opts.statusLine}</div>` : ''}
      ${opts.prog != null ? `<div class="fd-prog"><span style="width:${opts.prog}%"></span></div>` : ''}
      ${opts.actions ? `<div class="fd-card-acts" onclick="event.stopPropagation()">${opts.actions}</div>` : ''}
    </div>`;

  // The unified state-machine for the PRIMARY card button — fuses nextAction's transitions with the
  // (b) readiness gate. Returns {label, kind:'go'|'wait'|'done', fn?}. The column decides PLACEMENT;
  // the card decides ACTION. One source of truth for "what's the next move on this ticket."
  const cardPrimaryAction = t => {
    const st = t.state || {}, status = st.status, cf = t.caseFile || {};
    if (status === 'Shipped') return { label: 'Done', kind: 'done' };
    if (status === 'ConfirmedLive') return { label: 'Ship it →', kind: 'go', fn: `location.hash='#/deploy'` };
    if (fdLive(t.id)) return { label: null, kind: 'wait' };   // drone in flight — status line says enough
    const sandbox = cf.sandbox, verify = cf.verify, fixDone = !!cf.fixImplemented;
    if (sandbox && sandbox.verdict === 'PASS' && verify && verify.ok) return { label: 'Mark ready to ship →', kind: 'go', fn: `markReadyToShip('${t.id}')` };
    if (sandbox && sandbox.verdict === 'PASS' && verify) return { label: 'Re-run fix (verify failed)', kind: 'go', fn: `executeFix('${t.id}')` };
    if (sandbox && sandbox.verdict === 'PASS') return { label: 'Verify (Guardian + smoke)', kind: 'go', fn: `verifyFix('${t.id}')` };
    if (sandbox && sandbox.verdict === 'FAIL') return { label: 'Re-run fix (sandbox failed)', kind: 'go', fn: `executeFix('${t.id}')` };
    if (fixDone) return { label: 'Walk it in the sandbox →', kind: 'go', fn: `confirmInSandbox('${t.id}')` };
    if (status === 'Aligned' || status === 'Investigating') return { label: 'Re-deploy CC', kind: 'go', fn: `dispatchToCC('${t.id}')` };
    const r = ticketReady(t), res = cf.resolution, complete = cf.audit && cf.audit.verdict === 'COMPLETE';
    if (r.ready && res) return { label: '✓ Align & deploy CC →', kind: 'go', fn: `align('${t.id}')` };
    if (r.ready && complete && !res) return { label: 'Compose & align →', kind: 'go', fn: `composeResolution('${t.id}')` };
    const hasAnyCase = ['rootCause', 'surface', 'fix', 'conformance'].some(k => cf[k]);
    if (hasAnyCase) return { label: '↻ Close the gaps', kind: 'go', fn: `gatherCaseDetails('${t.id}')` };
    return { label: '⚡ Investigate', kind: 'go', fn: `boardBuildCase('${t.id}')` };
  };

  // The diagnostic status line under the title — one sentence telling John WHERE it's stuck.
  // Replaces the per-state tag-pills that just echoed the status word ("aligned", "case complete").
  const cardStatusLine = t => {
    const status = (t.state || {}).status;
    if (status === 'Shipped') return '✓ shipped';
    if (status === 'ConfirmedLive') return '✓ verified live — ready to ship';
    if (fdLive(t.id)) {
      const jobs = Object.values(J.ccjobs || {}).filter(j => j.id === t.id && j.status === 'running');
      const tasks = [...new Set(jobs.map(j => j.task).filter(Boolean))].slice(0, 2).join(' + ');
      const elapsed = (jobs[0] && jobs[0].started) ? Math.round((Date.now() - jobs[0].started) / 60000) : 0;
      return `drones working · ${elapsed}m · ${esc(tasks || 'investigating')}`;
    }
    if (status === 'Aligned' || status === 'Investigating') return 'CC dispatched — awaiting result';
    const r = ticketReady(t);
    if (r.ready) return '✓ ready to advance';
    const gaps = [];
    if (!r.caseBacked) gaps.push('no proposed fix');
    if (!r.questionsAnswered) gaps.push(r.openQ + ' open Q' + (r.openQ === 1 ? '' : 's'));
    if (!r.findingsLogged) gaps.push(r.unlogged + ' unlogged finding' + (r.unlogged === 1 ? '' : 's'));
    if (!gaps.length) return 'no case yet — fire Investigate';
    return gaps.length + ' gap' + (gaps.length === 1 ? '' : 's') + ': ' + esc(gaps.join(' · '));
  };

  // The ⋯ more-menu — granular escape hatch for the 5% case where John wants a specific drone fire
  // instead of the primary "advance" path. Native <details>/<summary> = click-outside-to-close free.
  const cardMoreMenu = t => `<details class="fd-more" onclick="event.stopPropagation()">
    <summary class="fd-more-btn" title="More actions" aria-label="More actions">⋯</summary>
    <div class="fd-more-list" onclick="event.stopPropagation()">
      <button class="fd-more-item" onclick="location.hash='#/ticket/${t.id}'">Open ticket</button>
      <button class="fd-more-item" onclick="askQuestionAll('${t.id}')">Ask Jarvis (answer open Qs)</button>
      <button class="fd-more-item" onclick="boardBuildCase('${t.id}')">Re-investigate (build case)</button>
      <button class="fd-more-item" onclick="composeResolution('${t.id}')">Compose resolution only</button>
      <button class="fd-more-item" onclick="dispatchToCC('${t.id}')">Hand to CC (configured)</button>
      <button class="fd-more-item" onclick="viewHandoff('${t.id}')">View handoff package</button>
    </div>
  </details>`;

  // One renderer for every ticket column — placement is decided upstream by case-status routing,
  // the card decides the action. The four ticket columns collapse into ONE renderCard.
  const renderCard = t => {
    const a = cardPrimaryAction(t);
    const actions = a.fn
      ? `<button class="fd-btn fd-btn-go" onclick="${a.fn}">${a.label}</button>`
      : a.label ? `<span class="fd-liveact"><span class="fd-livedot"></span> ${esc(a.label)}</span>` : '';
    return card(t, { statusLine: cardStatusLine(t), actions, more: cardMoreMenu(t), cls: fdLive(t.id) ? 'fd-card-live' : '' });
  };

  const renderers = {
    needs: renderCard,
    fix: renderCard,
    flight: renderCard,
    deploy: renderCard,
    bundle: g => `<div class="fd-card fd-bundle${g.hot ? ' fd-card-live' : ''}" onclick="location.hash='#/epic/${g.e.id}'" tabindex="0" onkeydown="if(event.key==='Enter')location.hash='#/epic/${g.e.id}'">
        <div class="fd-card-top"><span class="fd-id">${g.e.id}</span><span class="fd-bundle-n">${g.done}/${g.total}</span>${g.hot ? '<span class="fd-livedot"></span>' : ''}</div>
        <div class="fd-title">${esc(String(g.e.title || '').slice(0, 64))}</div>
        <div class="fd-prog fd-prog-bundle"><span style="width:${g.total ? Math.round(g.done / g.total * 100) : 0}%"></span></div>
        <div class="fd-card-acts" onclick="event.stopPropagation()"><a class="fd-btn" href="#/epic/${g.e.id}">Open workspace &rarr;</a><span class="fd-bundle-open">${g.open} open</span></div>
      </div>`,
  };

  const telem = FD_COLS.map((c, i) => {
    const n = sets[c.key].length;
    return `<button class="fd-tm fd-tm-${c.tone}${n ? ' on' : ''}" onclick="fdScrollTo('${c.key}')" style="--d:${i * 50}ms">
        <b class="fd-tm-n">${n}</b><span class="fd-tm-l">${c.lbl.toLowerCase()}</span>
      </button>`;
  }).join('<span class="fd-tm-flow" aria-hidden="true">&rsaquo;</span>');

  const cols = FD_COLS.map((c, i) => {
    const items = sets[c.key];
    const body = items.length ? items.map(renderers[c.key]).join('') : `<div class="fd-col-empty">${c.key === 'needs' ? 'All clear.' : c.key === 'flight' ? 'No drones in the air.' : c.key === 'deploy' ? 'Nothing ready.' : c.key === 'bundle' ? 'No epics with open work.' : 'Nothing yet.'}</div>`;
    return `<section class="fd-col fd-${c.tone}" id="fdcol-${c.key}" style="--d:${i * 70}ms">
        <div class="fd-col-h"><div class="fd-col-htext"><span class="fd-col-lbl">${c.lbl}</span><span class="fd-col-sub">${c.sub}</span></div><span class="fd-col-n">${items.length}</span></div>
        <div class="fd-col-rail"></div>
        <div class="fd-col-list">${body}</div>
      </section>`;
  }).join('');

  v.innerHTML = `
    <div class="cc-bg" aria-hidden="true"></div>
    <header class="fd-hero">
      <div class="fd-hero-top">
        <div class="fd-brandwrap">
          <div class="fd-brand"><span class="fd-brand-glow">FLIGHT</span>DECK</div>
          <div class="fd-air ${airborne ? 'on' : ''}"><span class="fd-radar"></span> ${airborne} drone${airborne === 1 ? '' : 's'} in the air</div>
        </div>
        <div class="fd-hero-acts">
          <button class="fd-cta" onclick="askJarvisTriage()"><span aria-hidden="true">&#10022;</span> Ask Jarvis what matters</button>
          <a class="fd-ghost" href="#/briefing">Briefing &rarr;</a>
          <a class="fd-ghost" href="#/board">Board &rarr;</a>
        </div>
      </div>
      <div class="fd-read"><span class="fd-read-k">JARVIS&rsquo;S READ</span> ${sitrepLine} <span class="fd-read-meta">&middot; ${triMeta}</span></div>
      <div class="fd-telem">${telem}</div>
    </header>
    <div class="fd-board">${cols}</div>`;
  dspEnsureBannerTimer();
}
function fdScrollTo(key) { const el = document.getElementById('fdcol-' + key); if (el) { el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); el.classList.remove('fd-flash'); void el.offsetWidth; el.classList.add('fd-flash'); } }

/* ════════════════════════ (c) DEDUPE — collapse the auto-spawned backlog ═══════════════════
 * Read model: group non-shipped tickets that are the SAME issue, by deterministic signals — a shared
 * FR-NN / INV-NN reference in title+summary (the canonical-bug signal: SLY-27 ≡ SLY-75 ≡ FR-07), or a
 * link hub (2+ tickets pointing at one). Each group proposes a survivor (most case evidence, tie-break
 * the original/lowest id); John picks the keeper + merges. The server merge PRESERVES every dupe's key
 * info into the keeper before tombstoning. Suggest→click — nothing merges without John. */
const idNum = t => +String((t && t.id) || '').replace(/\D/g, '') || 0;
function dedupeGroups() {
  const ts = (J.tickets || []).filter(t => t.type !== 'epic' && (t.state || {}).status !== 'Shipped');
  const byId = {}; ts.forEach(t => byId[t.id] = t);
  const groups = []; const claimed = new Set();
  const refsOf = t => { const m = ((t.title || '') + ' ' + (t.summary || '')).match(/\b(?:FR|INV)-\d+\b/gi); return m ? [...new Set(m.map(x => x.toUpperCase()))] : []; };
  // signal 1 — shared FR-NN / INV-NN canonical-bug reference (highest confidence)
  const byRef = {}; ts.forEach(t => refsOf(t).forEach(ref => { (byRef[ref] = byRef[ref] || []).push(t); }));
  Object.keys(byRef).sort().forEach(ref => {
    const arr = byRef[ref].filter(t => !claimed.has(t.id));
    if (arr.length < 2) return;
    const sorted = arr.slice().sort((a, b) => (caseScore(b) - caseScore(a)) || (idNum(a) - idNum(b)));
    sorted.forEach(t => claimed.add(t.id));
    groups.push({ key: ref, kind: 'token', reason: 'Same canonical bug ' + ref, survivor: sorted[0], dupes: sorted.slice(1) });
  });
  // signal 2 — link hub: 2+ tickets pointing at one via links.to (related cluster)
  const inbound = {}; ts.forEach(t => (t.links || []).forEach(l => { if (byId[l.to]) (inbound[l.to] = inbound[l.to] || []).push(t); }));
  Object.keys(inbound).forEach(hubId => {
    if (claimed.has(hubId)) return;
    const hub = byId[hubId]; const kids = (inbound[hubId] || []).filter(t => !claimed.has(t.id) && t.id !== hubId);
    if (!hub || kids.length < 2) return;
    [hub, ...kids].forEach(t => claimed.add(t.id));
    groups.push({ key: 'hub-' + hubId, kind: 'hub', reason: kids.length + ' tickets linked to ' + hubId, survivor: hub, dupes: kids });
  });
  return groups.sort((a, b) => b.dupes.length - a.dupes.length);
}
async function viewDedupe() {
  const v = $('view'); v.className = 'view ddx';
  v.innerHTML = `<header class="ddx-head"><h1 class="ddx-h1">Dedupe</h1></header><div class="ddx-empty">Loading clusters…</div>`;
  let cr; try { cr = await api('/api/cluster'); } catch (_) {}
  J._cluster = (cr && !cr.empty) ? cr : null;
  renderDedupe();
}
// Render deterministic groups (high-confidence: shared FR/INV or link hub) + Jarvis semantic groups
// (from the cluster report) DISTINCTLY. A ticket claimed by a deterministic group is excluded from
// semantic ones. First semantic pass is dry-run (propose-only) until John marks it reviewed.
function renderDedupe() {
  const v = $('view'); if (!v || !v.classList.contains('ddx')) return;
  const byId = {}; (J.tickets || []).forEach(t => byId[t.id] = t);
  // CLAIM PRIORITY: FR/INV token (highest — same named bug) → semantic (Opus meaning) → link-hub
  // (lowest — incidental links must not steal a keeper from a semantic cluster). This is the fix for
  // the link-hub stealing SLY-28 (a PIN-cluster parent) and orphaning its sub-findings.
  const raw = dedupeGroups();
  const tokenG = raw.filter(g => g.kind === 'token').map(g => ({ ...g, semantic: false }));
  const hubG = raw.filter(g => g.kind === 'hub');
  const claimed = new Set();
  tokenG.forEach(g => { claimed.add(g.survivor.id); g.dupes.forEach(d => claimed.add(d.id)); });
  const detBySurv = {}; tokenG.forEach(g => detBySurv[g.survivor.id] = g);
  const cr = J._cluster; const sem = [];
  if (cr && Array.isArray(cr.groups)) cr.groups.forEach((g, i) => {
    const fresh = (g.dupes || []).filter(id => byId[id] && !claimed.has(id));
    if (detBySurv[g.survivor]) { fresh.forEach(id => { detBySurv[g.survivor].dupes.push(byId[id]); claimed.add(id); }); return; }  // fold into shared token keeper
    const survivor = byId[g.survivor];
    if (!survivor || claimed.has(survivor.id) || !fresh.length) return;
    [survivor.id, ...fresh].forEach(id => claimed.add(id));
    sem.push({ key: 'sem-' + i, reason: g.reason, survivor, dupes: fresh.map(id => byId[id]), semantic: true });
  });
  // link-hubs LAST — only their members not already claimed by a token or semantic group
  const hubShown = [];
  hubG.forEach(g => {
    if (claimed.has(g.survivor.id)) return;
    const fresh = g.dupes.filter(d => !claimed.has(d.id));
    if (fresh.length < 2) return;
    claimed.add(g.survivor.id); fresh.forEach(d => claimed.add(d.id));
    hubShown.push({ ...g, dupes: fresh, semantic: false });
  });
  const det = [...tokenG, ...hubShown];
  const all = [...det, ...sem];
  J._ddx = {}; all.forEach(g => J._ddx[g.key] = { survivor: g.survivor.id, ids: [g.survivor.id, ...g.dupes.map(d => d.id)], semantic: g.semantic });
  const total = (J.tickets || []).filter(t => t.type !== 'epic' && (t.state || {}).status !== 'Shipped').length;
  const after = total - all.reduce((n, g) => n + g.dupes.length, 0);
  const reviewed = !!(cr && cr.reviewed);
  const dryRun = !!(cr && cr.dryRun && !reviewed);

  const row = t => `<div class="ddx-tk"><a href="#/ticket/${t.id}">${t.id}</a><span class="ddx-sev s-${t.severity}">${t.severity}</span><span class="ddx-tt">${esc(String(t.title || '').slice(0, 92))}</span></div>`;
  const card = g => {
    const opts = [g.survivor, ...g.dupes].sort((a, b) => idNum(a) - idNum(b));
    const reason = g.semantic
      ? `<span class="ddx-tag ddx-tag-sem">Jarvis · semantic</span> ${esc(g.reason || 'same root cause')}`
      : `<span class="ddx-tag ddx-tag-det">High confidence</span> ${esc(g.reason)}`;
    return `<section class="ddx-group ${g.semantic ? 'ddx-sem' : 'ddx-det'}">
      <div class="ddx-g-h"><span class="ddx-g-reason">${reason}</span><span class="ddx-g-n">${g.dupes.length + 1} &rarr; 1</span></div>
      <div class="ddx-keep"><span class="ddx-k-lbl">KEEP</span>
        <select class="ddx-survivor" onchange="ddxPick('${g.key}',this.value)">${opts.map(t => `<option value="${t.id}"${t.id === g.survivor.id ? ' selected' : ''}>${esc(t.id + ' · ' + String(t.title || '').slice(0, 52))}</option>`).join('')}</select></div>
      <div class="ddx-merge-lbl">Merge in — key info preserved into the keeper:</div>
      ${g.dupes.map(row).join('')}
      <div class="ddx-acts"><button class="btn ${g.semantic ? '' : 'primary'}" onclick="doMergeGroup('${g.key}')">Merge ${g.dupes.length} into keeper &rarr;</button></div>
    </section>`;
  };
  const semHeader = `<div class="ddx-sec-h ddx-sec-sem">Jarvis semantic clusters <span class="ddx-sec-sub">— LLM judgment, verify each${cr && cr.realCount ? ` · Jarvis estimates ~${cr.realCount} real issues` : ''}</span></div>`;
  const semBody = sem.length
    ? (dryRun
      ? `<div class="ddx-dry">First semantic pass — <b>propose-only</b>. Verify each group (merge them one at a time), then unlock bulk merge. <button class="btn sm" onclick="markClusterReviewed()">I&rsquo;ve reviewed these → enable Merge all</button></div>`
      : `<div class="ddx-allbar"><button class="btn green" onclick="doMergeAll('sem')">Merge all ${sem.length} semantic groups</button></div>`)
      + `<div class="ddx-groups">${sem.map(card).join('')}</div>`
    : `<div class="ddx-empty ddx-empty-sem">${cr ? 'No further semantic dupes beyond the deterministic groups.' : 'Not run yet — run the Jarvis cluster pass to catch the auto-spawned sub-findings deterministic signals can&rsquo;t see.'}</div>`;

  v.innerHTML = `
    <header class="ddx-head">
      <h1 class="ddx-h1">Dedupe</h1>
      <p class="ddx-sub">Collapse the auto-spawned backlog. Deterministic groups (shared <b>FR/INV</b> or link hub) are high-confidence; <b>Jarvis semantic</b> groups are LLM judgment — verify each. Merging carries every dupe&rsquo;s key info into the keeper, then tombstones it (recoverable).</p>
      <div class="ddx-stat"><b>${total}</b> active &rarr; <b class="ddx-after">${after}</b> if all ${all.length} group${all.length === 1 ? '' : 's'} merge · <button class="btn sm" onclick="runClusterPass()">${cr ? 'Re-run' : 'Run'} Jarvis cluster pass</button></div>
    </header>
    <div class="ddx-sec-h">High confidence (deterministic)</div>
    ${det.length ? `<div class="ddx-allbar"><button class="btn green" onclick="doMergeAll('det')">Merge all ${det.length} deterministic groups</button></div><div class="ddx-groups">${det.map(card).join('')}</div>` : '<div class="ddx-empty">No deterministic clusters — FR/INV refs and link hubs are clean.</div>'}
    ${semHeader}
    ${semBody}`;
}
function ddxPick(key, survivorId) { if (J._ddx && J._ddx[key]) J._ddx[key].survivor = survivorId; }
async function doMergeGroup(key) {
  const g = (J._ddx || {})[key]; if (!g) return;
  const into = g.survivor; const from = g.ids.filter(id => id !== into); if (!from.length) return;
  try { const r = await action('mergeTickets', { into, from, confirm: true }); toast(`Merged ${r.count} into ${into}`, 'ok'); await load(); viewDedupe(); } catch (e) {}
}
function doMergeAll(scope) {
  const groups = J._ddx || {};
  const keys = Object.keys(groups).filter(k => scope === 'det' ? !groups[k].semantic : scope === 'sem' ? groups[k].semantic : true);
  if (!keys.length) return;
  J._mergeAllScope = scope;
  const totalDupes = keys.reduce((n, k) => n + (groups[k].ids.length - 1), 0);
  modal(`<h2>Merge all ${keys.length} ${scope === 'sem' ? 'semantic ' : scope === 'det' ? 'deterministic ' : ''}groups?</h2><p>${totalDupes} ticket(s) fold into their keepers — each keeper absorbs the key info first. Recoverable: dupes are tombstoned, not deleted.</p><div class="btns"><button class="btn green" onclick="doMergeAllGo()">Merge all</button><button class="btn" onclick="closeModal()">Cancel</button></div>`);
}
async function doMergeAllGo() {
  closeModal(); const scope = J._mergeAllScope; const groups = J._ddx || {};
  const keys = Object.keys(groups).filter(k => scope === 'det' ? !groups[k].semantic : scope === 'sem' ? groups[k].semantic : true);
  let done = 0;
  for (const k of keys) { const g = groups[k]; const from = g.ids.filter(id => id !== g.survivor); if (!from.length) continue; try { const r = await action('mergeTickets', { into: g.survivor, from, confirm: true }); done += r.count; } catch (e) {} }
  toast(`Merged ${done} tickets into their keepers`, 'ok'); await load(); viewDedupe();
}
async function runClusterPass() {
  try { await action('clusterBacklog', { confirm: true }); toast('Jarvis is clustering the backlog — Opus is reading every ticket. Re-open Dedupe in ~a minute.', 'ok'); } catch (e) {}
}
async function markClusterReviewed() {
  try { await action('clusterReviewed', {}); toast('Reviewed — semantic bulk merge unlocked', 'ok'); viewDedupe(); } catch (e) {}
}
async function viewOverview() {
  if (!J.flows) J.flows = await api('/api/flows');
  const v = $('view'); v.className = 'view maxw'; const ts = J.tickets;
  const by = s => ts.filter(t => t.state.status === s).length;
  const needsJohn = ts.filter(t => ['Open', 'Discussing'].includes(t.state.status)).sort((a, b) => SEVRANK[a.severity] - SEVRANK[b.severity]);
  const inFlight = ts.filter(t => ['Aligned', 'Investigating'].includes(t.state.status)).length;
  const confirmed = ts.filter(t => t.kind === 'confirmed').sort((a, b) => SEVRANK[a.severity] - SEVRANK[b.severity]);
  const gaps = (J.flows.surfaces || []).reduce((n, s) => n + (s.counts ? s.counts.gaps : 0), 0);
  const sevCount = x => ts.filter(t => t.severity === x).length;
  const p0 = sevCount('P0'), shipped = by('Shipped');

  // Clean short surface labels: surfaces[].name is the LONG descriptive string
  // ("Analysis — where my money went…") and was getting truncated. roster[].name
  // is the curated short label keyed by the same id, so prefer that; fall back to
  // the long name clipped at the first em-/en-/hyphen separator.
  const roster = Object.fromEntries((J.flows.roster || []).map(r => [r.id, r.name]));
  const shortName = s => roster[s.id] || String(s.name || s.id).split(/\s+[—–-]\s+/)[0].trim();

  // A clickable stat card. dest is a hash route; the whole card navigates.
  const stat = (n, label, dest, opts = {}) => {
    const tone = opts.tone ? ` ov2-${opts.tone}` : '';
    const hint = opts.hint ? `<div class="ov2stat-hint">${esc(opts.hint)}</div>` : '';
    return `<button type="button" class="ov2stat${tone}" onclick="location.hash='${dest}'">
        <div class="ov2stat-n">${n}</div>
        <div class="ov2stat-l">${esc(label)}</div>
        ${hint}
        <span class="ov2stat-go" aria-hidden="true">→</span>
      </button>`;
  };

  // Status breakdown rows (premium bars, Title Case labels).
  const statusRows = STATUSES.map(s => {
    const c = by(s); if (!c) return '';
    return `<div class="sb2row" onclick="J.filter={surface:'',severity:'',type:'',status:'${s}',search:'',sort:'activity',view:'all'};location.hash='#/board'">
        <span class="pill sm s-${s}">${STATUS_LABEL[s]}</span>
        <div class="sb2track"><div class="sb2fill" style="width:${Math.round(c / Math.max(1, ts.length) * 100)}%"></div></div>
        <span class="sb2n">${c}</span>
      </div>`;
  }).join('');

  // Gaps-by-surface chart — full short names, clickable rows → that surface's map.
  const gbs = (() => {
    const ss = (J.flows.surfaces || []).slice().sort((a, b) => (b.counts ? b.counts.gaps : 0) - (a.counts ? a.counts.gaps : 0));
    const mx = Math.max(1, ...ss.map(x => x.counts ? x.counts.gaps : 0));
    return ss.map(s => {
      const g = s.counts ? s.counts.gaps : 0;
      const tone = g >= 3 ? 'red' : g >= 1 ? 'amber' : 'green';
      const w = Math.max(g ? 6 : 2, Math.round(g / mx * 100));
      return `<div class="gbsrow gbs-${tone}" onclick="location.hash='#/map/${s.id}'" title="Open the ${esc(niceSurface(s.id))} map">
          <span class="gbslabel">${esc(niceSurface(s.id))}</span>
          <div class="gbstrack"><div class="gbsbar" style="width:${w}%"></div></div>
          <span class="gbsnum">${g}</span>
          <span class="gbsgo" aria-hidden="true">→</span>
        </div>`;
    }).join('');
  })();

  v.innerHTML = `
    <header class="ov2head">
      <div>
        <h1>Overview</h1>
        <p class="subtitle">The whole slyght project in one place — what needs you, what's in flight, what's broken.</p>
      </div>
      <a class="ov2head-link" href="#/map">Open full App Map →</a>
    </header>

    <section class="ov2stats">
      ${stat(ts.length, 'Tickets', '#/board', { hint: 'Everything, unfiltered' })}
      ${stat(needsJohn.length, 'Need Your Judgment', "#/board?status=needs", { tone: 'amber', hint: 'Open + discussing' })}
      ${stat(inFlight, 'In Flight (CC)', '#/board?status=flight', { tone: 'teal', hint: 'Aligned + investigating' })}
      ${stat(p0, 'P0 Critical', '#/board?sev=P0', { tone: 'red', hint: 'Highest severity' })}
      ${stat(shipped, 'Shipped', '#/board?status=Shipped', { tone: 'green', hint: 'Done & live' })}
      ${stat(gaps, 'App-Map Gaps', '#/map', { hint: `${J.flows.coverage.traced}/${J.flows.coverage.total} surfaces traced` })}
    </section>

    <section class="ov2grid">
      <div class="ov2panel ov2-map">
        <div class="ov2panel-h">
          <div>
            <h2 class="ov2-title">The App At A Glance</h2>
            <p class="ov2-sub">Cash at the hub, every surface a spoke — colour shows how broken. Tap any surface.</p>
          </div>
          <a class="ov2-pill-link" href="#/map">Full Map →</a>
        </div>
        <div class="ov2-mapwrap"><svg id="hub" viewBox="0 0 940 600" width="100%"></svg></div>
        <div class="hublegend ov2-legend">
          <span><i class="dot g"></i> Clean</span>
          <span><i class="dot a"></i> 1–2 gaps</span>
          <span><i class="dot r"></i> 3+ gaps</span>
        </div>
      </div>

      <div class="ov2col">
        <div class="ov2panel ov2-judgment">
          <div class="ov2panel-h">
            <div>
              <h2 class="ov2-title">Need Your Judgment</h2>
              <p class="ov2-sub">Sorted by severity — these are waiting on a decision from you.</p>
            </div>
            <span class="ov2-count">${needsJohn.length}</span>
          </div>
          <div class="ov2list">
            ${needsJohn.slice(0, 6).map(t => ovRow(t, true)).join('') || '<div class="empty">Nothing waiting on you — all clear.</div>'}
          </div>
          ${needsJohn.length > 6 ? `<button type="button" class="ov2-more" onclick="location.hash='#/board?status=needs'">+${needsJohn.length - 6} more on the Board →</button>` : ''}
        </div>

        <div class="ov2panel ov2-status">
          <div class="ov2panel-h">
            <h2 class="ov2-title">Status Breakdown</h2>
            <span class="ov2-count">${ts.length}</span>
          </div>
          <div class="sb2list">${statusRows}</div>
        </div>
      </div>
    </section>

    <section class="ov2grid ov2grid-2">
      <div class="ov2panel ov2-gaps">
        <div class="ov2panel-h">
          <div>
            <h2 class="ov2-title">Gaps By Surface</h2>
            <p class="ov2-sub">How broken each surface is — tap a row to open its map.</p>
          </div>
          <span class="ov2-count">${gaps}</span>
        </div>
        <div class="gbslist">${gbs}</div>
      </div>

      <div class="ov2panel ov2-confirmed">
        <div class="ov2panel-h">
          <div>
            <h2 class="ov2-title">Confirmed Findings</h2>
            <p class="ov2-sub">What the walk + map caught and proved live.</p>
          </div>
          <span class="ov2-count">${confirmed.length}</span>
        </div>
        <div class="ov2list">
          ${confirmed.map(t => ovRow(t, false)).join('') || '<div class="empty">No confirmed findings yet.</div>'}
        </div>
      </div>
    </section>`;
  drawHub(J.flows);
}
function ovRow(t, showStatus) {
  const tag = showStatus
    ? `<span class="pill sm s-${t.state.status}">${STATUS_LABEL[t.state.status]}</span>`
    : `<span class="pill sm k-${t.kind}">${esc(niceSurface(t.group))}</span>`;
  return `<div class="ov2row" onclick="location.hash='#/ticket/${t.id}'">
      <span class="pill sm ${sevCls(t.severity)}">${t.severity}</span>
      <span class="ov2t">${esc(t.title)}</span>
      ${tag}
      <span class="ov2id">${t.id}</span>
      <span class="ov2-rowgo" aria-hidden="true">→</span>
    </div>`;
}

/* ════════════════════════ BOARD (premium list view) ════════════════════ */
// Saved views — each sets a filter preset. `match(t)` is the extra predicate the
// base filters AND against; null = no extra constraint.
const BOARD_VIEWS = [
  { id: 'all',       label: 'All',            match: null },
  { id: 'judgment',  label: 'Needs Judgment', match: t => ['Open', 'Discussing'].includes(t.state.status) },
  { id: 'flight',    label: 'In Flight',      match: t => ['Aligned', 'Investigating'].includes(t.state.status) },
  { id: 'live',      label: 'Confirmed Live', match: t => t.state.status === 'ConfirmedLive' },
  { id: 'shipped',   label: 'Shipped',        match: t => t.state.status === 'Shipped' },
  { id: 'p0',        label: 'P0 Critical',    match: t => t.severity === 'P0' },
];
const BOARD_SORTS = [
  { id: 'leverage', label: 'Leverage (what to do next)' },
  { id: 'activity', label: 'Last activity' },
  { id: 'opened',   label: 'Newest' },
  { id: 'oldest',   label: 'Oldest' },
  { id: 'severity', label: 'Severity' },
  { id: 'status',   label: 'Status' },
];

function viewBoard() {
  const v = $('view'); const ts = J.tickets; const f = J.filter;
  if (!f.view) f.view = 'all';
  if (!f.sort) f.sort = 'activity';
  const view = BOARD_VIEWS.find(x => x.id === f.view) || BOARD_VIEWS[0];
  const q = (f.search || '').trim().toLowerCase();

  // every filter ANDed together — view preset + status + type + severity + surface + search
  let shown = ts.filter(t =>
    (!view.match || view.match(t)) &&
    (!f.status   || t.state.status === f.status) &&
    (!f.type     || t.type === f.type) &&
    (!f.severity || t.severity === f.severity) &&
    (!f.surface  || t.group === f.surface) &&
    (!q || (t.title + ' ' + t.id + ' ' + (t.group || '') + ' ' + (t.summary || '')).toLowerCase().includes(q))
  );
  shown = sortTickets(shown, f.sort);

  const surfaces = [...new Set(ts.map(t => t.group))].filter(Boolean).sort();
  const viewCount = id => { const vw = BOARD_VIEWS.find(x => x.id === id); return ts.filter(t => !vw.match || vw.match(t)).length; };
  const anyFilter = f.status || f.type || f.severity || f.surface || q || f.view !== 'all' || f.sort !== 'activity';

  v.className = 'view maxw';
  v.innerHTML = `
    <div class="bd2-head">
      <div class="bd2-titlewrap">
        <h1 class="bd2-h1">Tickets <span class="bd2-crumb">/ ${esc(view.label)}</span></h1>
        <p class="bd2-sub">The whole slyght project as a worklist — read the summary, discuss with Jarvis, align, and CC posts results back here.</p>
      </div>
      <div class="bd2-headactions">
        <div class="bd2-search">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M9 3.5a5.5 5.5 0 1 0 3.4 9.83l3.13 3.14a1 1 0 0 0 1.42-1.42l-3.14-3.13A5.5 5.5 0 0 0 9 3.5Zm0 2a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z"/></svg>
          <input id="bd2Search" type="search" placeholder="Search tickets, ids, surfaces…" value="${esc(f.search || '')}"
                 oninput="setFilter('search', this.value)" autocomplete="off">
        </div>
        <button class="bd2-create" onclick="newTicket()">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4a1 1 0 0 1 1 1v4h4a1 1 0 1 1 0 2h-4v4a1 1 0 1 1-2 0v-4H5a1 1 0 1 1 0-2h4V5a1 1 0 0 1 1-1Z"/></svg>
          Create New Ticket
        </button>
      </div>
    </div>

    <div class="bd2-views" role="tablist">
      ${BOARD_VIEWS.map(x => `
        <button class="bd2-chip ${f.view === x.id ? 'on' : ''}" role="tab" aria-selected="${f.view === x.id}" onclick="applyView('${x.id}')">
          ${esc(x.label)}<span class="bd2-chipn">${viewCount(x.id)}</span>
        </button>`).join('')}
    </div>

    <div class="bd2-toolbar">
      ${bd2Select('Status', 'status', f.status, STATUSES.map(s => [s, STATUS_LABEL[s]]))}
      ${bd2Select('Type', 'type', f.type, ['bug', 'feature', 'task'].map(x => [x, x[0].toUpperCase() + x.slice(1)]))}
      ${bd2Select('Priority', 'severity', f.severity, [['P0', 'P0 · Critical'], ['P1', 'P1 · High'], ['P2', 'P2 · Normal']])}
      ${bd2Select('Surface', 'surface', f.surface, surfaces.map(s => [s, niceSurface(s)]))}
      <div class="bd2-tb-spacer"></div>
      <div class="bd2-sortwrap">
        <span class="bd2-sortlbl">Group</span>
        <div class="bd2-selwrap">
          <select class="bd2-sel" onchange="setBoardGroup(this.value)" aria-label="Group by">
            <option value="">No grouping</option>
            <option value="epic"${f.group === 'epic' ? ' selected' : ''}>Epic</option>
            <option value="severity"${f.group === 'severity' ? ' selected' : ''}>Priority</option>
            <option value="surface"${f.group === 'surface' ? ' selected' : ''}>Surface</option>
            <option value="status"${f.group === 'status' ? ' selected' : ''}>Status</option>
          </select>
          ${BD2_CHEVRON}
        </div>
      </div>
      <div class="bd2-sortwrap">
        <span class="bd2-sortlbl">Sort</span>
        <div class="bd2-selwrap">
          <select class="bd2-sel" onchange="setFilter('sort', this.value)" aria-label="Sort by">
            ${BOARD_SORTS.map(s => `<option value="${s.id}" ${f.sort === s.id ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}
          </select>
          ${BD2_CHEVRON}
        </div>
      </div>
      ${anyFilter ? `<button class="bd2-reset" onclick="resetFilters()">Reset</button>` : ''}
    </div>

    <div class="bd2-countbar">
      <span class="bd2-count"><b>${shown.length}</b> ticket${shown.length === 1 ? '' : 's'}</span>
      <span class="bd2-countsep">of ${ts.length} total</span>
      ${shown.length ? `<button class="bd2-selall" onclick="bd2SelectAll()">Select these ${shown.length}</button>` : ''}
    </div>
    <div id="bd2Bulk"></div>

    <div class="bd2-list" role="list">
      ${shown.length
        ? (f.group ? renderGroupedBoard(boardGroups(shown, f.group)) : shown.map(ticketRow).join(''))
        : `<div class="bd2-empty">
             <div class="bd2-empty-ic">🔍</div>
             <div class="bd2-empty-h">No tickets match these filters</div>
             <div class="bd2-empty-b">Try a different saved view, clear the search, or reset the filter bar.</div>
             ${anyFilter ? `<button class="bd2-reset solid" onclick="resetFilters()">Reset filters</button>` : ''}
           </div>`}
    </div>`;
  bd2RenderBulkBar();   // restore the bulk-organise bar if rows are selected
}
// Group the board by epic / priority / surface (Stage 2b — the sprawl-tamer).
function setBoardGroup(v) { J.filter.group = v || ''; viewBoard(); }
function toggleBoardGroup(key) { J._boardCollapsed = J._boardCollapsed || {}; J._boardCollapsed[key] = !J._boardCollapsed[key]; viewBoard(); }
function boardGroups(shown, mode) {
  if (mode === 'epic') {
    const epics = (J.tickets || []).filter(t => t.type === 'epic');
    const groups = epics.map(e => ({ key: e.id, label: e.id + ' · ' + String(e.title || '').slice(0, 50), epic: e, tickets: shown.filter(t => t.epic === e.id && t.type !== 'epic') }));
    const noEpic = shown.filter(t => t.type !== 'epic' && !t.epic);
    if (noEpic.length) groups.push({ key: '__none', label: 'No epic', epic: null, tickets: noEpic });
    return groups.filter(g => g.tickets.length || g.epic);
  }
  if (mode === 'severity') return ['P0', 'P1', 'P2'].map(s => ({ key: s, label: s + (s === 'P0' ? ' · Critical' : s === 'P1' ? ' · High' : ' · Normal'), tickets: shown.filter(t => t.severity === s) })).filter(g => g.tickets.length);
  if (mode === 'surface') return [...new Set(shown.map(t => t.group))].filter(Boolean).sort().map(s => ({ key: s, label: niceSurface(s), tickets: shown.filter(t => t.group === s) }));
  if (mode === 'status') return STATUSES.map(s => ({ key: s, label: (STATUS_LABEL[s] || s) + (STATUS_INFO[s] ? ' · ' + STATUS_INFO[s].need : ''), tickets: shown.filter(t => t.state.status === s) })).filter(g => g.tickets.length);   // absorbed from Roadmap
  return [];
}
function renderGroupedBoard(groups) {
  if (!groups.length) return '<div class="bd2-group-empty">Nothing to group.</div>';
  return groups.map(g => {
    const collapsed = (J._boardCollapsed || {})[g.key];
    const done = g.tickets.filter(t => ['ConfirmedLive', 'Shipped'].includes((t.state || {}).status)).length;
    return `<div class="bd2-group${collapsed ? ' collapsed' : ''}">
      <div class="bd2-group-head" onclick="toggleBoardGroup('${esc(g.key)}')">
        <span class="bd2-group-tw" aria-hidden="true">${collapsed ? '▸' : '▾'}</span>
        <span class="bd2-group-label">${esc(g.label)}</span>
        <span class="bd2-group-n">${done}/${g.tickets.length}</span>
        ${g.epic ? `<a class="bd2-group-open" href="#/ticket/${g.epic.id}" onclick="event.stopPropagation()">open epic →</a>` : ''}
      </div>
      ${collapsed ? '' : (g.tickets.length ? g.tickets.map(ticketRow).join('') : '<div class="bd2-group-empty">No tickets in this group.</div>')}
    </div>`;
  }).join('');
}

// custom-styled select for the filter bar; value '' = "All <Label>"
function bd2Select(label, key, value, opts) {
  return `<div class="bd2-selwrap ${value ? 'active' : ''}">
    <select class="bd2-sel" aria-label="${esc(label)}" onchange="setFilter('${key}', this.value)">
      <option value="">All ${esc(label)}</option>
      ${opts.map(([val, lbl]) => `<option value="${esc(val)}" ${value === val ? 'selected' : ''}>${esc(lbl)}</option>`).join('')}
    </select>
    ${BD2_CHEVRON}
  </div>`;
}

// REPLACE FUNCTION: ticketCard  (renamed ticketRow — wide list row)
function ticketRow(t) {
  const st = t.state, status = st.status, assignee = st.assignee;
  const nexts = TRANSITIONS_CLIENT[status] || [];
  const onCC = assignee === 'cc';
  const links = (t.links || []).length;
  const sel = BD2_SELECTED.has(t.id);
  return `<div class="bd2-row${sel ? ' sel' : ''}" role="listitem" data-id="${t.id}" onclick="rowOpen(event,'${t.id}')">
    <label class="bd2-check" onclick="event.stopPropagation()">
      <input type="checkbox" ${sel ? 'checked' : ''} onchange="bd2ToggleSelect('${t.id}', this.checked)">
      <span class="bd2-checkbox"></span>
    </label>

    <div class="bd2-rowbody">
      <div class="bd2-rowtop">
        <span class="bd2-title">${esc(t.title)}</span>
      </div>
      <div class="bd2-meta">
        <span class="bd2-id">${t.id}</span>
        <span class="bd2-dot">·</span>
        <span class="bd2-surface">${esc(niceSurface(t.group || t.surface))}</span>
        <span class="bd2-dot">·</span>
        <span class="bd2-age">opened ${ago(st.opened)}</span>
        <span class="bd2-dot">·</span>
        <span class="bd2-act">active ${ago(st.lastActivity)}</span>
        ${links ? `<span class="bd2-dot">·</span><span class="bd2-links">🔗 ${links} link${links === 1 ? '' : 's'}</span>` : ''}
        ${t.dueDate ? `<span class="bd2-dot">·</span><span class="fld-duechip ${fldDueTone(t.dueDate)}" title="Due ${esc(t.dueDate)}">${esc(fldDueLabel(t.dueDate))}</span>` : ''}
        ${t.bundle ? `<span class="bd2-dot">·</span><span class="fld-bundlechip" title="Bundle: ${esc(t.bundle)}">◈ ${esc(t.bundle)}</span>` : ''}
        ${t.kind && t.kind !== 'manual' ? `<span class="pill sm k-${t.kind}">${esc(cap(t.kind))}</span>` : ''}
      </div>
    </div>

    <div class="bd2-controls" onclick="event.stopPropagation()">
      <!-- STATUS — live earned-state dropdown -->
      <div class="bd2-ctrl bd2-statusctrl">
        <span class="bd2-ctrl-k">Status</span>
        <div class="bd2-selwrap status s-${status}">
          <select class="bd2-sel bd2-statussel s-${status}" aria-label="Status" onchange="changeStatus('${t.id}', this.value, this)">
            <option value="${status}" selected>${STATUS_LABEL[status]}</option>
            ${nexts.length ? `<optgroup label="Move to →">${nexts.map(s => `<option value="${s}">${STATUS_LABEL[s]}</option>`).join('')}</optgroup>` : ''}
          </select>
          ${BD2_CHEVRON}
        </div>
      </div>

      <!-- TYPE — live editable (setMeta) -->
      <div class="bd2-ctrl">
        <span class="bd2-ctrl-k">Type</span>
        <div class="fld-selwrap k-${t.type}">
          <select class="fld-sel k-${t.type}" aria-label="Type for ${t.id}" onchange="setMeta('${t.id}','type',this.value)">
            ${[['bug', 'Bug'], ['feature', 'Feature'], ['task', 'Task']].map(([v, l]) => `<option value="${v}" ${t.type === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
          ${BD2_CHEVRON}
        </div>
      </div>

      <!-- PRIORITY (severity) — live editable (setMeta) -->
      <div class="bd2-ctrl">
        <span class="bd2-ctrl-k">Priority</span>
        <div class="fld-selwrap ${sevCls(t.severity)}">
          <select class="fld-sel ${sevCls(t.severity)}" aria-label="Priority for ${t.id}" onchange="setMeta('${t.id}','severity',this.value)">
            ${[['P0', 'P0'], ['P1', 'P1'], ['P2', 'P2']].map(([v, l]) => `<option value="${v}" ${t.severity === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
          ${BD2_CHEVRON}
        </div>
      </div>

      <!-- CASE — one-click parallel sweep straight from the board (no need to open the ticket) -->
      <div class="bd2-ctrl bd2-buildctrl">
        <span class="bd2-ctrl-k">Case</span>
        ${bd2BuildControl(t, status)}
      </div>

      <!-- ASSIGNEE — derived from status; chip filters by who-owns-it bucket -->
      <div class="bd2-ctrl bd2-assignee">
        <span class="bd2-ctrl-k">Assignee</span>
        <button class="bd2-who ${onCC ? 'cc' : 'john'}" title="${onCC ? 'CC — investigating' : 'John — needs judgment'}">
          <span class="bd2-avatar">${onCC ? 'CC' : 'J'}</span>
          <span class="bd2-wholbl">${onCC ? 'CC' : 'John'}</span>
        </button>
      </div>
    </div>
  </div>`;
}
// The board's per-row case control — live sweep state, a ready-to-look badge, or a one-click Build.
function bd2BuildControl(t, status) {
  const sweeping = (J.sweeps || {})[t.id] && J.sweeps[t.id].status === 'running';
  const cf = t.caseFile || {}; const cs = caseScore(t);
  const ready = cf.audit && cf.audit.verdict === 'COMPLETE';
  if (sweeping) return `<span class="bd2-building" title="Drones scoping this ticket now"><span class="bd2-bdot"></span> scoping ${cs}/5</span>`;
  if (['ConfirmedLive', 'Shipped'].includes(status)) return `<span class="bd2-caseck">&check; done</span>`;
  if (ready) return `<a class="bd2-caseready" href="#/ticket/${t.id}" title="Case complete — your call">case ready &rarr;</a>`;
  return `<button class="bd2-build" onclick="boardBuildCase('${t.id}')" title="Build the case — a parallel read-only drone sweep, no need to open the ticket">&#9889; ${cs ? 'case ' + cs + '/5' : 'Build'}</button>`;
}
// One-click build-the-case from the board — dispatch, watch, re-render in place. Parallel work,
// minimal friction: you only open a ticket when it needs your decision.
async function boardBuildCase(id) {
  try {
    await action('buildCase', { id, confirm: true });
    toast(`Building the case on ${id} — drones out`, 'ok');
    if ('Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (_) {} }
    J.dspWatch = id; await load();
    if ((location.hash || '').startsWith('#/board')) viewBoard();
    dspStartPoll(id); dspRenderTopbar(); dspEnsureBannerTimer();
  } catch (e) { /* action() already toasted */ }
}

/* ── board state + helpers ────────────────────────────────────────────── */
// client mirror of the server's earned-state machine (server.js TRANSITIONS)
const TRANSITIONS_CLIENT = {
  Open: ['Gathering', 'Discussing'],
  Gathering: ['Discussing', 'Aligned', 'Open'],
  Discussing: ['Gathering', 'Aligned', 'Open'],
  Aligned: ['Investigating', 'Discussing'],
  Investigating: ['ConfirmedLive', 'Shipped', 'Aligned'],
  ConfirmedLive: ['Shipped', 'Investigating'],
  Shipped: ['Investigating'],
};
const SEVRANK_BD = { P0: 0, P1: 1, P2: 2 };
const STATUSRANK = Object.fromEntries(STATUSES.map((s, i) => [s, i]));
const BD2_SELECTED = new Set();  // checkbox selection (UI only — ready for future bulk ops)

const BD2_CHEVRON = '<svg class="bd2-chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function sortTickets(arr, sort) {
  const a = arr.slice();
  if (sort === 'opened')   return a.sort((x, y) => new Date(y.state.opened) - new Date(x.state.opened));
  if (sort === 'oldest')   return a.sort((x, y) => new Date(x.state.opened) - new Date(y.state.opened));
  if (sort === 'severity') return a.sort((x, y) => (SEVRANK_BD[x.severity] - SEVRANK_BD[y.severity]) || (new Date(y.state.lastActivity) - new Date(x.state.lastActivity)));
  if (sort === 'status')   return a.sort((x, y) => (STATUSRANK[x.state.status] - STATUSRANK[y.state.status]) || (SEVRANK_BD[x.severity] - SEVRANK_BD[y.severity]));
  if (sort === 'leverage') return a.sort((x, y) => (scoreTicket(y).total - scoreTicket(x).total) || (SEVRANK_BD[x.severity] - SEVRANK_BD[y.severity]));   // absorbed from Recommends
  // default: last activity, newest first
  return a.sort((x, y) => new Date(y.state.lastActivity) - new Date(x.state.lastActivity));
}

// due-date chip label + tone — relative ("Due today", "Due in 3d", "5d overdue") and
// severity-of-time colour (overdue = red, ≤3 days = amber, else neutral).
function fldDayDelta(iso) { const d = new Date(iso + 'T00:00:00'); const t0 = new Date(); t0.setHours(0,0,0,0); return Math.round((d - t0) / 86400000); }
function fldDueLabel(iso) {
  const n = fldDayDelta(iso);
  if (isNaN(n)) return 'Due ' + iso;
  if (n < 0)  return `Due · ${Math.abs(n)}d overdue`;
  if (n === 0) return 'Due · today';
  if (n === 1) return 'Due · tomorrow';
  if (n <= 14) return `Due · in ${n}d`;
  return 'Due · ' + iso.slice(5);    // MM-DD for far-out
}
function fldDueTone(iso) { const n = fldDayDelta(iso); return isNaN(n) ? '' : n < 0 ? 'fld-due-over' : n <= 3 ? 'fld-due-soon' : 'fld-due-ok'; }

// generic filter setter — search updates J.filter live WITHOUT re-rendering the whole
// view (so the input keeps focus/caret); everything else re-routes.
let bd2SearchTimer = null;
function setFilter(key, value) {
  J.filter[key] = value;
  if (key === 'search') {
    // debounce the list re-render so typing stays smooth and the box keeps focus
    clearTimeout(bd2SearchTimer);
    bd2SearchTimer = setTimeout(() => { rerenderBoardKeepSearch(); }, 130);
    return;
  }
  route();
}
function applyView(id) { J.filter.view = id; route(); }
function resetFilters() {
  J.filter.status = ''; J.filter.type = ''; J.filter.severity = '';
  J.filter.surface = ''; J.filter.search = ''; J.filter.view = 'all'; J.filter.sort = 'activity';
  route();
}

// re-render board but restore the search box focus + caret (route() rebuilds innerHTML)
function rerenderBoardKeepSearch() {
  const old = $('bd2Search'); const caret = old ? old.selectionStart : null;
  viewBoard();
  const nu = $('bd2Search');
  if (nu) { nu.focus(); if (caret != null) { try { nu.setSelectionRange(caret, caret); } catch (_) {} } }
}

// STATUS change → the earned state machine. Server validates the edge + ConfirmedLive
// evidence; on rejection action() toasts the error and we reload to snap back to truth.
async function changeStatus(id, to, sel) {
  const t = get(id); if (!t || to === t.state.status) { if (sel) sel.value = t ? t.state.status : to; return; }
  // ConfirmedLive is EARNED, never typed. Snap the dropdown back to truth and open the
  // Confirm-From-Walk flow: it shows the actual walk evidence (or why there is none) and
  // confirms via confirmFromWalk({id}) — the server reads the walk, no free-text param.
  if (to === 'ConfirmedLive') {
    if (sel) sel.value = t.state.status;     // don't optimistically move; the walk earns it
    return confirmFromWalk(id);
  }
  try {
    await action('setStatus', { id, to });   // NB: no `evidence` — only ConfirmedLive carried it, and it's gone
    toast(`${t.id} → ${STATUS_LABEL[to]}`, 'ok');
  } catch (e) { /* action() already toasted the rejection */ }
  await load();   // re-pull truth either way
  route();        // re-render the board (illegal change snaps the dropdown back)
}

// row open — ignores clicks that originated on a control (those stopPropagation)
function rowOpen(e, id) { location.hash = '#/ticket/' + id; }

function bd2ToggleSelect(id, on) {
  if (on) BD2_SELECTED.add(id); else BD2_SELECTED.delete(id);
  const row = document.querySelector(`.bd2-row[data-id="${id}"]`);
  if (row) row.classList.toggle('sel', on);
  bd2RenderBulkBar();
}
// Bulk-organise bar — appears when rows are selected. Assign-to-epic, bundle, sweep, or close clutter
// in one move (the anti-clutter management John wants, from the Board). #35.
function bd2RenderBulkBar() {
  const host = document.getElementById('bd2Bulk'); if (!host) return;
  const n = BD2_SELECTED.size;
  if (!n) { host.innerHTML = ''; return; }
  const epics = (J.tickets || []).filter(t => t.type === 'epic');
  host.innerHTML = `<div class="bd2-bulk-bar">
    <span class="bd2-bulk-n">${n} selected</span>
    <div class="bd2-selwrap active"><select class="bd2-sel" aria-label="Assign to epic" onchange="bulkAssignEpic(this.value);this.value=''">
      <option value="">Assign to epic…</option>${epics.map(e => `<option value="${e.id}">${esc(e.id + ' · ' + String(e.title || '').slice(0, 34))}</option>`).join('')}<option value="__new">+ New epic…</option>
    </select>${BD2_CHEVRON}</div>
    <button class="btn sm" onclick="bulkSetBundle()">Bundle…</button>
    <button class="btn sm" onclick="bulkSweep()">⚡ Build case · all</button>
    <button class="btn sm bd2-bulk-del" onclick="bulkClose()">Close</button>
    <button class="btn sm" onclick="bd2ClearSel()">Clear</button>
  </div>`;
}
function bd2SelectAll() {
  document.querySelectorAll('.bd2-row').forEach(r => { const id = r.dataset.id; if (!id) return; BD2_SELECTED.add(id); r.classList.add('sel'); const cb = r.querySelector('input[type=checkbox]'); if (cb) cb.checked = true; });
  bd2RenderBulkBar();
}
function bd2ClearSel() {
  BD2_SELECTED.forEach(id => { const r = document.querySelector(`.bd2-row[data-id="${id}"]`); if (r) { r.classList.remove('sel'); const cb = r.querySelector('input[type=checkbox]'); if (cb) cb.checked = false; } });
  BD2_SELECTED.clear(); bd2RenderBulkBar();
}
async function bulkAssignEpic(v) {
  if (!v) return;
  let epicId = v;
  if (v === '__new') { const name = prompt('New epic name:'); if (!name) return; try { const r = await action('createTicket', { title: name, type: 'epic', summary: 'Epic created from bulk organise' }); epicId = r.id; } catch (e) { return; } }
  const ids = [...BD2_SELECTED];
  for (const id of ids) { try { await action('setMeta', { id, field: 'epic', value: epicId }); } catch (e) {} }
  toast(`Assigned ${ids.length} ticket${ids.length === 1 ? '' : 's'} to ${epicId}`, 'ok');
  BD2_SELECTED.clear(); await load(); viewBoard();
}
async function bulkSetBundle() {
  const name = prompt('Bundle name for the selected tickets:'); if (!name) return;
  const ids = [...BD2_SELECTED];
  for (const id of ids) { try { await action('setMeta', { id, field: 'bundle', value: name }); } catch (e) {} }
  toast(`Bundled ${ids.length} as "${name}"`, 'ok'); BD2_SELECTED.clear(); await load(); viewBoard();
}
async function bulkSweep() {
  const ids = [...BD2_SELECTED]; if (!ids.length) return;
  if (!confirm(`Build the case on ${ids.length} tickets? Spawns parallel read-only drone sweeps.`)) return;
  toast(`Sweeping ${ids.length} tickets…`, 'ok');
  for (const id of ids) { try { await action('buildCase', { id, confirm: true }); } catch (e) {} }
  BD2_SELECTED.clear(); await load(); viewBoard(); dspStartPoll(); dspRenderTopbar(); dspEnsureBannerTimer();
}
async function bulkClose() {
  const ids = [...BD2_SELECTED]; if (!ids.length) return;
  if (!confirm(`Close (delete) ${ids.length} tickets? This removes them from the backlog — can't be undone.`)) return;
  for (const id of ids) { try { await action('deleteTicket', { id }); } catch (e) {} }
  toast(`Closed ${ids.length} ticket${ids.length === 1 ? '' : 's'}`, 'ok'); BD2_SELECTED.clear(); await load(); viewBoard();
}

/* ════════════════════════ CASE FILE — evidence checklist + scoped drones ════════════
 * The heart of the investigation workflow. Reads t.caseFile (drone-gathered slots) + the
 * auditor verdict, shows what's gathered vs missing, and dispatches a scoped GATHER drone per
 * slot. The auditor row is the funnel: COMPLETE → ready to align; GAP → one targeted re-dig. */
function taskKeyFromDrone(d) {
  d = String(d || '').toLowerCase();
  if (d.includes('root')) return 'root-cause';
  if (d.includes('surface') || d.includes('locate')) return 'locate-surface';
  if (d.includes('fix')) return 'fix-proposal';
  if (d.includes('conform')) return 'conformance';
  if (d.includes('walk')) return 'walk';
  return 'root-cause';
}
// Resolve the GAP's re-dig target robustly: a vague nextDig ("Gather") that maps to root-cause when
// root-cause is already filled, or no drone named, → the first MISSING/THIN/empty slot. Fixes SLY-1.
function ccNextDigTask(t, audit) {
  const cf = t.caseFile || {};
  const slotToTask = { rootCause: 'root-cause', surface: 'locate-surface', fix: 'fix-proposal', conformance: 'conformance' };
  const filled = { rootCause: !!(cf.rootCause && cf.rootCause.rootCause), surface: !!(cf.surface && cf.surface.surface), fix: !!(cf.fix && cf.fix.fix), conformance: !!(cf.conformance && cf.conformance.driftVerdict) };
  const slots = audit.slots || {};
  const firstGap = Object.keys(slotToTask).find(k => ['MISSING', 'THIN', 'CONTRADICTORY'].includes(slots[k]) || !filled[k]);
  const drone = (audit.nextDig && audit.nextDig.drone) || '';
  let task = drone ? taskKeyFromDrone(drone) : '';
  if (task === 'walk') return 'walk';
  // vague drone (didn't name a real slot) but defaulted to a filled root-cause → use the real gap
  if (!task || (task === 'root-cause' && filled.rootCause && !/root/i.test(drone))) task = firstGap ? slotToTask[firstGap] : task;
  return task || (firstGap ? slotToTask[firstGap] : 'root-cause');
}
// Run a scoped dig then auto re-audit so the GAP re-converges (John's SLY-1 "doesn't update" fix).
function digThenAudit(id, task) {
  const lbl = TASK_LABEL[task] || task;
  modal(`<h2>Run ${esc(lbl)} + re-audit</h2>
    <p>Runs a read-only <b>${esc(lbl.toLowerCase())}</b> drone on ${esc(id)}, then <b>automatically re-runs the auditor</b> so the gap re-checks and clears. ~a few minutes.</p>
    <div class="btns"><button class="btn primary" onclick="doDigThenAudit('${id}','${task}')"><span aria-hidden="true">▶</span> Run + re-audit</button><button class="btn" onclick="closeModal()">Cancel</button></div>`);
}
async function doDigThenAudit(id, task) {
  closeModal();
  try {
    await action('digThenAudit', { id, task, confirm: true });
    toast(`${TASK_LABEL[task] || task} drone dispatched — re-audits when it lands`, 'ok');
    if ('Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (_) {} }
    J.ccjobs = J.ccjobs || {}; J.ccjobs[id + '#' + task] = { status: 'running', id, task, mode: 'gather', model: 'sonnet', started: Date.now() };
    J.dspWatch = id;
    await load(); if ((location.hash || '').includes('/ticket/' + id)) viewTicket(id);
    dspStartPoll(id); dspRenderTopbar(); dspRenderTicketBanner(id); dspEnsureBannerTimer();
  } catch (e) { /* action() already toasted */ }
}
// Per-type case-file rows (dynamic templates, WS-5): a BUG gathers a diagnostic case; a FEATURE
// gathers a build case (intent → surfaces → design → acceptance → conformance); a TASK gets a
// lightweight breakdown. Each row owns one caseFile slot. The auditor + spin-off blocks are shared.
function caseRows(t) {
  const cf = t.caseFile || {};
  if (t.type === 'feature') {
    return [
      { task: 'intent', slotKey: 'intent', label: 'Intent & goal', filled: !!(cf.intent && cf.intent.intent),
        summary: (cf.intent && cf.intent.intent) ? esc(String(cf.intent.intent).slice(0, 160)) : '' },
      { task: 'locate-surface', slotKey: 'surface', label: 'Surfaces affected', filled: !!(cf.surface && cf.surface.surface),
        summary: (cf.surface && cf.surface.surface) ? esc(cf.surface.surface) : '' },
      { task: 'design', slotKey: 'design', label: 'Design — the shape', filled: !!(cf.design && cf.design.design),
        summary: (cf.design && cf.design.design) ? esc(String(cf.design.design).slice(0, 160)) : '', dep: !(cf.intent && cf.intent.intent) ? 'needs intent first' : '' },
      { task: 'acceptance', slotKey: 'acceptance', label: 'Acceptance criteria', filled: !!(cf.acceptance && cf.acceptance.criteria),
        summary: (cf.acceptance && Array.isArray(cf.acceptance.criteria)) ? esc(cf.acceptance.criteria.length + ' criteria · ' + String(cf.acceptance.criteria[0] || '').slice(0, 90)) : '', dep: !(cf.design && cf.design.design) ? 'needs a design first' : '' },
      { task: 'conformance', slotKey: 'conformance', label: 'Conformance (FIT)', filled: !!(cf.conformance && cf.conformance.driftVerdict),
        summary: (cf.conformance && cf.conformance.driftVerdict) ? esc(cf.conformance.driftVerdict) + (cf.conformance.notes ? ' — ' + esc(String(cf.conformance.notes).slice(0, 90)) : '') : '' },
    ];
  }
  if (t.type === 'task') {
    return [
      { task: 'breakdown', slotKey: 'breakdown', label: 'Steps & done-when', filled: !!(cf.breakdown && cf.breakdown.steps),
        summary: (cf.breakdown && Array.isArray(cf.breakdown.steps)) ? esc(cf.breakdown.steps.length + ' step' + (cf.breakdown.steps.length === 1 ? '' : 's') + (cf.breakdown.doneWhen ? ' · done when: ' + String(cf.breakdown.doneWhen).slice(0, 80) : '')) : '' },
    ];
  }
  // bug (default) — the diagnostic shape
  const rc = cf.rootCause || {};
  return [
    { task: 'root-cause', slotKey: 'rootCause', label: 'Root cause & mechanism', filled: !!rc.rootCause,
      summary: rc.rootCause ? esc(String(rc.rootCause).slice(0, 150)) : '',
      extra: (rc.files && rc.files.length) ? `<div class="cf-files">${rc.files.length} file${rc.files.length === 1 ? '' : 's'} · ledger: ${esc(String(rc.ledgerVerdict || 'n/a').slice(0, 40))}</div>` : '' },
    { task: 'locate-surface', slotKey: 'surface', label: 'Surface (App Map)', filled: !!(cf.surface && cf.surface.surface),
      summary: (cf.surface && cf.surface.surface) ? esc(cf.surface.surface) + (cf.surface.mapStale ? ' (map stale)' : '') : '' },
    { task: 'fix-proposal', slotKey: 'fix', label: 'Proposed fix', filled: !!(cf.fix && cf.fix.fix),
      summary: (cf.fix && cf.fix.fix) ? esc(String(cf.fix.fix).slice(0, 150)) : '', dep: !rc.rootCause ? 'needs root cause first' : '' },
    { task: 'conformance', slotKey: 'conformance', label: 'Conformance (FIT)', filled: !!(cf.conformance && cf.conformance.driftVerdict),
      summary: (cf.conformance && cf.conformance.driftVerdict) ? esc(cf.conformance.driftVerdict) + (cf.conformance.notes ? ' — ' + esc(String(cf.conformance.notes).slice(0, 90)) : '') : '', dep: !(cf.fix && cf.fix.fix) ? 'needs a proposed fix first' : '' },
    { task: 'walk', slotKey: 'walk', label: 'Walk evidence (live proof)', filled: !!(t.rich && t.rich.evidence), walk: true,
      summary: (t.rich && t.rich.evidence) ? 'walked' : '' },
  ];
}
function renderCaseFile(t) {
  const cf = t.caseFile || {};
  const rc = cf.rootCause || {};
  const audit = cf.audit || null;
  // scoped drones running on THIS ticket right now (live), keyed by task
  const running = {}; Object.values(J.ccjobs || {}).forEach(v => { if (v.id === t.id && v.status === 'running' && v.task) running[v.task] = true; });
  const sv = (audit && audit.slots) || {};   // per-slot auditor verdicts
  const rows = caseRows(t);                   // type-aware: bug / feature / task
  const filled = rows.filter(r => r.filled).length;
  const res = cf.resolution || null;          // the composed end-of-investigation resolution (dual narrative)
  const resRunning = !!(J.ccjobs && J.ccjobs[t.id + '#resolution'] && J.ccjobs[t.id + '#resolution'].status === 'running');
  const ca = cf.codeAudit || null;            // code-alignment audit verdict (the gate before Deploy)
  const caRunning = !!(J.ccjobs && J.ccjobs[t.id + '#code-audit'] && J.ccjobs[t.id + '#code-audit'].status === 'running');
  const sb = cf.sandbox || null;              // sandbox-confirm verdict (the walk that gates ready-to-ship)
  const sbRunning = !!(J.ccjobs && J.ccjobs[t.id + '#sandbox'] && J.ccjobs[t.id + '#sandbox'].status === 'running');
  const vf = cf.verify || null;               // deterministic Guardian + smoke gate result (the pre-ship gate)
  const vfRunning = !!(J.ccjobs && J.ccjobs[t.id + '#verify'] && J.ccjobs[t.id + '#verify'].status === 'running');
  const ux = cf.uxReview || null;             // UX drone's frontend-design review
  const uxRunning = !!(J.ccjobs && J.ccjobs[t.id + '#ux'] && J.ccjobs[t.id + '#ux'].status === 'running');
  const fixShot = cf.fixShot || null;         // captured preview of the fixed screen (#36)
  const shotRunning = !!(J.ccjobs && J.ccjobs[t.id + '#fixshot'] && J.ccjobs[t.id + '#fixshot'].status === 'running');

  const rowsHtml = rows.map(r => {
    const v = sv[r.slotKey] || '';
    const dot = r.filled ? (v === 'THIN' ? 'cf-dot-thin' : v === 'CONTRADICTORY' ? 'cf-dot-bad' : 'cf-dot-done') : 'cf-dot-empty';
    const badge = (r.filled && v) ? `<span class="cf-verdict cf-v-${v.toLowerCase()}">${esc(v)}</span>` : '';
    let action;
    if (running[r.task]) action = `<span class="cf-running"><span class="cf-spin" aria-hidden="true"></span> running…</span>`;
    else if (r.walk) action = `<button class="btn sm" onclick="goWalkDrone('${esc(t.group || '')}')">${r.filled ? 'Re-walk' : 'Walk'}</button>`;
    else action = `<button class="btn sm${r.filled ? '' : ' primary'}" onclick="digScoped('${t.id}','${r.task}')"${(r.dep && !r.filled) ? ` title="${esc(r.dep)}"` : ''}>${r.filled ? 'Re-dig' : 'Dig'}</button>`;
    const body = r.filled
      ? `<div class="cf-sum">${r.summary}</div>${r.extra || ''}`
      : `<div class="cf-emptyrow">${r.dep ? `<span class="cf-dep">${esc(r.dep)}</span>` : 'not gathered yet'}</div>`;
    return `<div class="cf-row${r.filled ? ' cf-filled' : ''}">
      <span class="cf-dot ${dot}" aria-hidden="true"></span>
      <div class="cf-bd"><div class="cf-name">${r.label}${badge}</div>${body}</div>
      <div class="cf-act">${action}</div>
    </div>`;
  }).join('');

  // The auditor funnel row
  let auditHtml;
  if (running['auditor']) {
    auditHtml = `<span class="cf-running"><span class="cf-spin" aria-hidden="true"></span> auditor verifying…</span>`;
  } else if (!audit) {
    auditHtml = `<span class="cf-audit-msg">Not audited yet — the auditor verifies completeness, merges findings, and decides if a targeted re-dig is needed.</span><button class="btn sm" onclick="runAudit('${t.id}')">Audit case</button>`;
  } else if (audit.verdict === 'COMPLETE') {
    const composeBtn = res ? '' : resRunning
      ? `<span class="cf-running"><span class="cf-spin" aria-hidden="true"></span> composing…</span>`
      : `<button class="btn sm primary" onclick="composeResolution('${t.id}')"><span aria-hidden="true">✦</span> Compose resolution</button>`;
    auditHtml = `<span><span class="cf-audit-tag cf-v-complete">✓ Complete</span> ready to align${(audit.caveats && audit.caveats.length) ? ` · ${audit.caveats.length} caveat(s)` : ''}</span><button class="btn sm" onclick="runAudit('${t.id}')">Re-audit</button>${composeBtn}`;
  } else {
    const nd = audit.nextDig || null;
    const ndTask = ccNextDigTask(t, audit);   // robust: handles vague "Gather" / already-filled → first MISSING slot
    // The Walk Drone is a separate mechanism (not a scoped task) → route to goWalkDrone, never digScoped('walk').
    let ndBtn;
    if (ndTask === 'walk') ndBtn = `<button class="btn sm primary" onclick="goWalkDrone('${esc(t.group || '')}')">Run Walk Drone</button>`;
    else if (ndTask) ndBtn = `<button class="btn sm primary" onclick="digThenAudit('${t.id}','${esc(ndTask)}')">Run suggested dig</button>`;
    else ndBtn = `<button class="btn sm" onclick="runAudit('${t.id}')">Re-audit</button>`;
    auditHtml = `<span><span class="cf-audit-tag cf-v-gap">Gap</span> ${nd ? `needs <b>${esc(TASK_LABEL[ndTask] || nd.drone || '')}</b> — ${esc(String(nd.why || nd.scope || '').slice(0, 120))}` : 'more evidence needed'}</span>` + ndBtn;
  }
  const merged = (audit && audit.verdict === 'COMPLETE' && audit.merged) ? `<div class="cf-merged">${mdToHtml(audit.merged)}</div>` : '';
  // The resolution — the dual narrative (story for John + technical brief for CC). Rendered at the TOP
  // of the case file when present, because it's the headline: what this all means + what CC will do.
  const resolutionBlock = res ? `
    <div class="cf-resolution">
      <div class="cf-res-h"><span aria-hidden="true">✦</span> Resolution <span class="cf-res-sub">— the story, and the brief for CC</span></div>
      ${res.story ? `<div class="cf-res-story">${esc(res.story)}</div>` : (res.raw ? `<div class="cf-res-story">${esc(res.raw)}</div>` : '')}
      ${(res.problem || res.resolution || res.verify) ? `<div class="cf-res-kvs">
        ${res.problem ? `<div class="cf-res-kv"><span>Problem</span> ${esc(res.problem)}</div>` : ''}
        ${res.resolution ? `<div class="cf-res-kv"><span>${t.type === 'feature' ? 'Build' : t.type === 'task' ? 'Do' : 'Fix'}</span> ${esc(res.resolution)}</div>` : ''}
        ${res.verify ? `<div class="cf-res-kv"><span>Verify</span> ${esc(res.verify)}</div>` : ''}
      </div>` : ''}
      ${res.technical ? `<details class="cf-res-tech"><summary>Technical brief — for CC</summary><div class="cf-res-techbody txt md">${mdToHtml(res.technical)}</div></details>` : ''}
      ${ca ? `<div class="cf-codeaudit cf-ca-${esc(String(ca.verdict || '').toLowerCase())}"><b>Code audit: ${esc(ca.verdict || '?')}</b> ${esc(String(ca.summary || '').slice(0, 200))}</div>` : ''}
      <div class="cf-res-acts">
        <button class="btn sm cf-res-recompose" onclick="composeResolution('${t.id}')">Recompose</button>
        ${caRunning ? '<span class="cf-running"><span class="cf-spin" aria-hidden="true"></span> auditing the code…</span>' : `<button class="btn sm" onclick="runCodeAudit('${t.id}')" title="Verify the committed fix against BRAIN, invariants, architecture &amp; Guardian">${ca ? 'Re-audit code' : 'Code-audit the fix'}</button>`}
      </div>
    </div>` : '';
  // UX drone block — the frontend-design specialist's review. Shows on UX-flavoured tickets (or once run):
  // summary + the glitch cause + concrete findings, plus a one-click "Run UX review".
  const uxRelevant = ux || uxRunning || /\b(ux|ui|visual|layout|flash|glitch|flicker|strob|reload|re-?render|render|animation|animate|transition|spacing|align|responsive|design|screen|style|css|theme|motion|jank|stutter)\b/i.test([t.title, t.summary, t.group, t.type].join(' '));
  const uxBlock = uxRelevant ? `
    <div class="cf-ux">
      <div class="cf-ux-h"><span aria-hidden="true">✦</span> UX review <span class="cf-ux-tag">frontend-design</span></div>
      ${ux ? `<div class="cf-ux-body">
        ${ux.summary ? `<div class="cf-ux-sum">${esc(ux.summary)}</div>` : ''}
        ${ux.glitch ? `<div class="cf-ux-glitch"><b>Glitch:</b> ${esc(ux.glitch)}</div>` : ''}
        ${(Array.isArray(ux.findings) ? ux.findings : []).slice(0, 8).map(f => `<div class="cf-ux-find cf-ux-sev-${esc(String(f.severity || 'med'))}"><span class="cf-ux-sevtag">${esc(f.severity || '?')}</span> <b>${esc(f.issue || '')}</b>${f.cause ? ` <code>${esc(f.cause)}</code>` : ''}${f.fix ? `<div class="cf-ux-fix">&rarr; ${esc(f.fix)}</div>` : ''}</div>`).join('')}
      </div>` : `<div class="cf-ux-empty">${uxRunning ? 'Walking the surface + reading the render path…' : 'Bring in the frontend-design drone — it judges the surface against slyght&rsquo;s design system and diagnoses flash / jank to the re-render path.'}</div>`}
      <div class="cf-ux-acts">${uxRunning ? '<span class="cf-running"><span class="cf-spin" aria-hidden="true"></span> reviewing…</span>' : `<button class="btn sm${ux ? '' : ' primary'}" onclick="uxReview('${t.id}')">${ux ? 'Re-run UX review' : 'Run UX review'}</button>`}</div>
    </div>` : '';
  // The sandbox-confirm gate — shows once a fix is implemented: walk the fixed app, PASS → ready to ship.
  const sandboxBlock = (sb || sbRunning || cf.fixImplemented) ? `
    <div class="cf-sandbox cf-sb-${sb ? esc(String(sb.verdict || '').toLowerCase()) : (sbRunning ? 'running' : 'pending')}">
      <div class="cf-sb-h"><span aria-hidden="true">◎</span> Sandbox confirm ${sb ? `— <b>${esc(sb.verdict || '?')}</b>` : (sbRunning ? '— walking the fixed app…' : '— fix implemented, not yet confirmed')}</div>
      ${sb && sb.reason ? `<div class="cf-sb-reason">${esc(String(sb.reason).slice(0, 400))}</div>` : ''}
      <div class="cf-sb-acts">
        ${sbRunning ? '<span class="cf-running"><span class="cf-spin" aria-hidden="true"></span> walking the sandbox…</span>' : `<button class="btn sm${sb ? '' : ' primary'}" onclick="confirmInSandbox('${t.id}')">${sb ? 'Re-confirm in sandbox' : 'Walk it in the sandbox'}</button>`}
        ${sb && sb.verdict === 'PASS' && !(vf && vf.ok) ? `<button class="btn sm primary" onclick="verifyFix('${t.id}')">Verify (Guardian + smoke) &rarr;</button>` : ''}
      </div>
    </div>` : '';
  // The deterministic pre-ship GATE (2026-05-28) — Guardian (no new findings) + the ticket's own smoke spec.
  // Server-run, not a drone, so the verdict is trustworthy. markReadyToShip + deploy are hard-gated on it.
  const verifyBlock = (vf || vfRunning || (sb && sb.verdict === 'PASS')) ? `
    <div class="cf-verify cf-vf-${vf ? (vf.ok ? 'pass' : 'fail') : (vfRunning ? 'running' : 'pending')}">
      <div class="cf-vf-h"><span aria-hidden="true">⛉</span> Pre-ship gate ${vf ? `— <b>${vf.ok ? 'PASS' : 'FAIL'}</b>` : (vfRunning ? '— running Guardian + smoke…' : '— not yet run')}</div>
      ${vf ? `<div class="cf-vf-lines">
        <div class="cf-vf-line"><span class="cf-vf-${vf.guardian && vf.guardian.newFindings.length ? 'bad' : 'ok'}">${vf.guardian && vf.guardian.newFindings.length ? '✕' : '✓'}</span> Guardian — ${vf.guardian ? (vf.guardian.newFindings.length ? `${vf.guardian.newFindings.length} NEW finding(s): ${esc(vf.guardian.newFindings.map(f => f.rule + '@L' + f.line).join(', '))}` : `no new findings (${vf.guardian.failTotal} pre-existing on main)`) : '—'}</div>
        <div class="cf-vf-line"><span class="cf-vf-${vf.smoke && vf.smoke.ran && !vf.smoke.failed ? 'ok' : 'bad'}">${vf.smoke && vf.smoke.ran && !vf.smoke.failed ? '✓' : '✕'}</span> Smoke — ${vf.smoke ? (vf.smoke.ran ? `${vf.smoke.passed}/${vf.smoke.passed + vf.smoke.failed} passed${vf.smoke.specs && vf.smoke.specs.length ? ` (${esc(vf.smoke.specs.join(', '))})` : ''}` : esc(vf.smoke.reason || 'did not run')) : '—'}</div>
      </div>` : ''}
      <div class="cf-vf-acts">
        ${vfRunning ? '<span class="cf-running"><span class="cf-spin" aria-hidden="true"></span> verifying…</span>' : `<button class="btn sm${vf && vf.ok ? '' : ' primary'}" onclick="verifyFix('${t.id}')">${vf ? 'Re-verify' : 'Run the gate'}</button>`}
        ${vf && vf.ok ? `<button class="btn sm primary" onclick="markReadyToShip('${t.id}')">Mark ready to ship &rarr;</button>` : ''}
      </div>
    </div>` : '';
  // What the fixed screen looks like (#36) — a captured preview from the FAKE-seeded fixed app.
  const fixShotBlock = (fixShot || shotRunning || cf.fixImplemented) ? `
    <div class="cf-fixshot">
      <div class="cf-fs-h"><span aria-hidden="true">◇</span> What the fixed screen looks like</div>
      ${fixShot ? `<a href="/api/fixshot?id=${t.id}&t=${encodeURIComponent(fixShot.ts)}" target="_blank" rel="noopener"><img class="cf-fs-img" src="/api/fixshot?id=${t.id}&t=${encodeURIComponent(fixShot.ts)}" alt="Fixed ${esc(t.id)} screen" loading="lazy"></a>`
        : `<div class="cf-fs-empty">${shotRunning ? 'Capturing the fixed app (FAKE-seeded)…' : 'Capture a preview of the fix running in the sandbox.'}</div>`}
      <div class="cf-fs-acts">${shotRunning ? '<span class="cf-running"><span class="cf-spin" aria-hidden="true"></span> capturing…</span>' : `<button class="btn sm" onclick="captureFixShot('${t.id}')">${fixShot ? 'Re-capture' : 'Capture fixed screen'}</button>`}</div>
    </div>` : '';

  // Spin-off findings — split into THREE buckets so the list isn't noise (Stage 2c):
  //   • Potential tickets  (unmappedTerritory) — real out-of-scope findings → loggable, with "Log all"
  //   • Open questions     (openQuestions)     — decisions to answer in-thread, NOT tickets
  //   • Case-quality notes (audit caveats)     — notes about THIS investigation, never tickets
  const logged = cf.spinoffLogged || [];
  const collect = (whichKey) => {
    const out = [];
    ['rootCause', 'surface', 'fix', 'conformance'].forEach(k => { const slot = cf[k]; if (!slot) return; (slot[whichKey] || []).forEach(v => { const x = (typeof v === 'string' ? v : JSON.stringify(v)).trim(); if (x) out.push(x); }); });
    return [...new Set(out)].filter(x => !logged.includes(x));
  };
  const newTickets = collect('unmappedTerritory');
  const questions = collect('openQuestions');
  const caveats = [...new Set((cf.audit && cf.audit.caveats || []).map(c => String(c || '').trim()).filter(Boolean))];
  J._spin = J._spin || {}; J._spin[t.id] = newTickets;       // logSpinoff indexes into Potential-tickets
  J._questions = J._questions || {}; J._questions[t.id] = questions;   // askQuestionJarvis indexes into Open-questions
  const cfBucket = (label, items, opts) => items.length ? `
    <div class="cf-spinoff-bucket">
      <div class="cf-spinoff-h">${label} <span class="cf-spinoff-n">${items.length}</span>${opts.logAll && items.length > 1 ? `<button class="btn sm cf-logall" onclick="logAllSpinoffs('${t.id}')">Log all ${items.length}</button>` : ''}</div>
      ${items.slice(0, 12).map((x, i) => `<div class="cf-spinoff-row"><span class="cf-spinoff-t">${esc(x.slice(0, 180))}</span>${opts.log ? `<button class="btn sm" onclick="logSpinoff('${t.id}',${i})">Log</button>` : ''}${opts.ask ? `<button class="btn sm" onclick="askQuestionJarvis('${t.id}',${i})">Ask Jarvis</button>` : ''}</div>`).join('')}
    </div>` : '';
  const spinoffBlock = (newTickets.length || questions.length || caveats.length) ? `
    <div class="cf-spinoff">
      ${cfBucket('Potential tickets', newTickets, { log: true, logAll: true })}
      ${cfBucket('Open questions — ask Jarvis to work them', questions, { ask: true })}
      ${cfBucket('Case-quality notes (auditor)', caveats, {})}
    </div>` : '';

  const sw = (J.sweeps || {})[t.id];
  const sweepRunning = sw && sw.status === 'running';
  return `<div class="card cf-card">
    <div class="cf-cardhead">
      <div class="label">Case file — ${t.type === 'feature' ? 'the build' : t.type === 'task' ? 'the work' : 'evidence'}</div>
      <div class="cf-headright">
        <span class="cf-progress">${filled}/${rows.length} gathered</span>
        ${(J.ccjobs && J.ccjobs[t.id + '#organize'] && J.ccjobs[t.id + '#organize'].status === 'running')
          ? `<span class="cf-sweep"><span class="cf-spin" aria-hidden="true"></span> organizing…</span>`
          : `<button class="btn sm" onclick="jarvisOrganize('${t.id}')" title="Jarvis suggests epic / bundle / related tickets"><span aria-hidden="true">✦</span> Organize</button>`}
        ${sweepRunning
          ? `<span class="cf-sweep"><span class="cf-spin" aria-hidden="true"></span> Building · ${esc(sw.step)}${sw.cycle ? ` (audit ${sw.cycle})` : ''}</span>`
          : (filled >= rows.length || (audit && audit.verdict === 'COMPLETE'))
            ? ''
            : `<button class="btn sm primary" onclick="buildCase('${t.id}')">⚡ ${filled ? 'Continue building' : 'Build the case'}</button>`}
      </div>
    </div>
    ${resolutionBlock}
    ${uxBlock}
    ${sandboxBlock}
    ${verifyBlock}
    ${fixShotBlock}
    <div class="cf-list">${rowsHtml}</div>
    <div class="cf-auditrow">${auditHtml}</div>
    ${merged}
    ${renderOrganize(t)}
    ${spinoffBlock}
  </div>`;
}
// Jarvis organize suggestion (Stage 2d) — epic / bundle / related / closes-with, with Apply buttons.
// Jarvis suggestions — only the ACTIONABLE, NOT-YET-APPLIED rows (epic/bundle). Once you apply one
// (t.epic / t.bundle now match), that row drops; when all are satisfied the whole bubble disappears.
// Related/closes-with are NOT here — they live in the persistent Linked-tickets tile (renderLinkedTickets).
function renderOrganize(t) {
  const o = (t.caseFile || {}).organize; if (!o) return '';
  const rows = [];
  if (o.epic && /^SLY-\d+$/.test(o.epic) && t.epic !== o.epic) rows.push(`<div class="org-row"><span class="org-k">Epic</span><span class="org-v">${esc(o.epic)}</span><button class="btn sm" onclick="applyOrganize('${t.id}','epic','${esc(o.epic)}')">Apply</button></div>`);
  else if ((!o.epic || !/^SLY-\d+$/.test(o.epic)) && o.newEpic && !t.epic) rows.push(`<div class="org-row"><span class="org-k">New epic</span><span class="org-v">${esc(o.newEpic)}</span><button class="btn sm" onclick="createEpicFrom('${t.id}','${esc(String(o.newEpic).replace(/'/g, ''))}')">Create &amp; assign</button></div>`);
  if (o.bundle && t.bundle !== o.bundle) rows.push(`<div class="org-row"><span class="org-k">Bundle</span><span class="org-v">${esc(o.bundle)}</span><button class="btn sm" onclick="applyOrganize('${t.id}','bundle','${esc(String(o.bundle).replace(/'/g, ''))}')">Apply</button></div>`);
  if (!rows.length) return '';
  return `<div class="cf-organize"><div class="cf-spinoff-h"><span aria-hidden="true">✦</span> Jarvis suggests <span class="cf-spinoff-hint">— apply to organize</span></div>${rows.join('')}</div>`;
}
async function applyOrganize(id, field, value) {
  try { await action('setMeta', { id, field, value }); toast(field + ' set', 'ok'); await load(); if ((location.hash || '').includes('/ticket/' + id)) viewTicket(id); } catch (e) {}
}
// Persistent Linked-tickets tile — related (links + Jarvis-suggested) + closes-with. Lives in the siderail.
function renderLinkedTickets(t) {
  const o = (t.caseFile || {}).organize || {};
  const linkIds = (t.links || []).map(l => l.to).filter(x => /^SLY-\d+$/.test(x));
  const related = [...new Set([...linkIds, ...(o.related || [])])].filter(x => /^SLY-\d+$/.test(x) && x !== t.id);
  const closesWith = [...new Set(o.closesWith || [])].filter(x => /^SLY-\d+$/.test(x) && x !== t.id);
  if (!related.length && !closesWith.length) return '';
  const row = id => { const tk = get(id); return `<div class="kv"><span class="k"><a href="#/ticket/${id}">${id}</a></span><span class="v lk-title">${tk ? esc(String(tk.title || '').slice(0, 38)) : ''}</span></div>`; };
  return `<div class="siderail lk-rail">
    <div class="sh">Linked tickets</div>
    ${related.length ? `<div class="lk-grp">Related</div>${related.map(row).join('')}` : ''}
    ${closesWith.length ? `<div class="lk-grp">Closes when this ships</div>${closesWith.map(row).join('')}` : ''}
  </div>`;
}
// The bundle bubble — when a ticket is in motion, surface related/sibling tickets and offer to
// bring them INTO this investigation (sweep in parallel) or bundle them, vs keep them separate.
// John's ask: "ensure we are always working in parallel." Sources: epic siblings + organize.related + links.
function renderBundleBubble(t) {
  const status = (t.state || {}).status;
  if (!['Gathering', 'Discussing', 'Aligned', 'Investigating'].includes(status)) return '';
  if ((J._bundleDismissed || {})[t.id]) return '';
  const o = (t.caseFile || {}).organize || {};
  const notDone = x => !['ConfirmedLive', 'Shipped'].includes((x.state || {}).status);
  const epicSibs = t.epic ? (J.tickets || []).filter(x => x.epic === t.epic && x.id !== t.id && x.type !== 'epic') : [];
  const relIds = [...new Set([...(o.related || []), ...epicSibs.map(x => x.id), ...((t.links || []).map(l => l.to))])].filter(x => /^SLY-\d+$/.test(x) && x !== t.id);
  const rel = relIds.map(get).filter(Boolean).filter(notDone);
  if (!rel.length) return '';
  J._bundleRel = J._bundleRel || {}; J._bundleRel[t.id] = rel.map(x => x.id);
  return `<div class="card bundle-bubble">
    <div class="bundle-h"><span aria-hidden="true">&#10022;</span> Jarvis: ${rel.length} related ticket${rel.length === 1 ? '' : 's'} &mdash; bring into this investigation?</div>
    <p class="bundle-note">Work in parallel: CC can scope these alongside <b>${t.id}</b>, or keep them separate. ${t.epic ? `Siblings under epic ${t.epic}` : 'Related by surface / links'}.</p>
    <div class="bundle-list">${rel.map(x => `<a class="bundle-item" href="#/ticket/${x.id}"><span class="pill sm ${sevCls(x.severity)}">${x.severity}</span> <b>${x.id}</b> ${esc(String(x.title || '').slice(0, 54))}</a>`).join('')}</div>
    <div class="bundle-acts">
      <button class="btn sm brief-deploy" onclick="bundleSweepAll('${t.id}')">&#9889; Sweep all in parallel</button>
      <button class="btn sm" onclick="bundleMark('${t.id}')">Mark as a bundle</button>
      <button class="btn sm" onclick="bundleDismiss('${t.id}')">Keep separate</button>
    </div>
  </div>`;
}
async function bundleSweepAll(id) {
  const rel = (J._bundleRel || {})[id] || [];
  toast(`Sweeping ${id} + ${rel.length} related in parallel…`, 'ok');
  if ('Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (_) {} }
  for (const rid of [id, ...rel]) { try { await action('buildCase', { id: rid, confirm: true }); } catch (e) {} }
  J.dspWatch = id; await load(); if ((location.hash || '').includes('/ticket/' + id)) viewTicket(id);
  dspStartPoll(id); dspRenderTopbar(); dspEnsureBannerTimer();
}
async function bundleMark(id) {
  const rel = (J._bundleRel || {})[id] || []; const t = get(id);
  const name = prompt('Bundle name for these tickets:', (t && t.bundle) || (t ? t.id + ' bundle' : 'bundle'));
  if (!name) return;
  try {
    await action('setMeta', { id, field: 'bundle', value: name });
    for (const rid of rel) { try { await action('setMeta', { id: rid, field: 'bundle', value: name }); } catch (e) {} }
    toast(`Bundled ${rel.length + 1} tickets as "${name}"`, 'ok');
    await load(); if ((location.hash || '').includes('/ticket/' + id)) viewTicket(id);
  } catch (e) { /* action() already toasted */ }
}
function bundleDismiss(id) { J._bundleDismissed = J._bundleDismissed || {}; J._bundleDismissed[id] = true; if ((location.hash || '').includes('/ticket/' + id)) viewTicket(id); }

function jarvisOrganize(id) {
  modal(`<h2><span aria-hidden="true">✦</span> Jarvis: organize ${esc(id)}</h2>
    <p>Jarvis reads this ticket + the whole ticket list and suggests an <b>epic</b>, <b>bundle</b>, <b>related</b> tickets, and what would <b>close when this ships</b>. Read-only; ~a minute.</p>
    <div class="btns"><button class="btn primary" onclick="doJarvisOrganize('${id}')"><span aria-hidden="true">✦</span> Organize</button><button class="btn" onclick="closeModal()">Cancel</button></div>`);
}
async function doJarvisOrganize(id) {
  closeModal();
  try {
    await action('jarvisOrganize', { id, confirm: true });
    toast('Jarvis is organizing…', 'ok');
    J.ccjobs = J.ccjobs || {}; J.ccjobs[id + '#organize'] = { status: 'running', id, task: 'organize', mode: 'gather', model: 'sonnet', started: Date.now() };
    J.dspWatch = id;
    await load(); if ((location.hash || '').includes('/ticket/' + id)) viewTicket(id);
    dspStartPoll(id); dspRenderTopbar(); dspEnsureBannerTimer();
  } catch (e) { /* action() already toasted */ }
}
// Create a new epic from Jarvis's suggested name + assign this ticket to it.
async function createEpicFrom(id, name) {
  try {
    const r = await action('createTicket', { title: name, type: 'epic', summary: 'Epic created from Jarvis organize on ' + id });
    await action('setMeta', { id, field: 'epic', value: r.id });
    toast(`Created epic ${r.id} + assigned ${id}`, 'ok');
    await load(); if ((location.hash || '').includes('/ticket/' + id)) viewTicket(id);
  } catch (e) { /* action() already toasted */ }
}
// Dispatch a scoped GATHER drone (light confirm — it's read-only + on your plan, no cost-cap friction).
function digScoped(id, task) {
  if (task === 'walk') { const tk = get(id); goWalkDrone(tk ? tk.group : ''); return; }   // walk isn't a scoped task
  const labels = { 'root-cause': 'Root-cause dig', 'locate-surface': 'Locate surface', 'fix-proposal': 'Fix proposal', 'conformance': 'Conformance', 'auditor': 'Auditor', 'intent': 'Intent', 'design': 'Design', 'acceptance': 'Acceptance criteria', 'breakdown': 'Breakdown' };
  const lbl = labels[task] || task;
  modal(`<h2>Dispatch ${esc(lbl)} drone</h2>
    <p>Spawns a <b>read-only</b> CC drone scoped to <b>${esc(lbl.toLowerCase())}</b> on ${esc(id)}. It edits nothing, runs on your plan, takes a few minutes, and <b>auto-fills the case file</b> when done.</p>
    <div class="btns"><button class="btn primary" onclick="doDigScoped('${id}','${task}')"><span aria-hidden="true">▶</span> Dispatch</button><button class="btn" onclick="closeModal()">Cancel</button></div>`);
}
async function doDigScoped(id, task) {
  closeModal();
  try {
    await action('dispatchScoped', { id, task, confirm: true });
    toast(`${TASK_LABEL[task] || task} drone dispatched on ${id}`, 'ok');
    if ('Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (_) {} }
    J.ccjobs = J.ccjobs || {};
    J.ccjobs[id + '#' + task] = { status: 'running', id, task, mode: 'gather', model: 'sonnet', reasoning: 'off', started: Date.now() };
    await load();
    if ((location.hash || '').includes('/ticket/' + id)) viewTicket(id);
    dspStartPoll(id); dspRenderTopbar(); dspRenderTicketBanner(id); dspEnsureBannerTimer();
  } catch (e) { /* action() already toasted */ }
}
function runAudit(id) {
  modal(`<h2>Run the auditor</h2>
    <p>The auditor verifies the gathered evidence, <b>merges &amp; dedupes</b> findings into one case, and decides: <b>Complete</b> (ready to align) or <b>Gap</b> — and if a gap, names exactly one targeted re-dig. Hard-capped so it always converges. Read-only; runs on your plan.</p>
    <div class="btns"><button class="btn primary" onclick="doDigScoped('${id}','auditor')"><span aria-hidden="true">▶</span> Run auditor</button><button class="btn" onclick="closeModal()">Cancel</button></div>`);
}
// "Build the case" — the parallel sweep. Fans out the scoped drones in a converging DAG + auditor.
function buildCase(id) {
  const t = get(id) || {};
  const flow = t.type === 'feature'
    ? `<b>intent + surfaces</b> (parallel), then <b>design</b>, <b>acceptance</b>, <b>conformance</b>, and the <b>auditor</b>`
    : t.type === 'task'
      ? `a <b>breakdown</b> (steps + done-when), then the <b>auditor</b>`
      : `<b>root cause + surface</b> (parallel), then <b>fix</b>, <b>conformance</b>, and the <b>auditor</b>`;
  modal(`<h2><span aria-hidden="true">⚡</span> Build the case — ${esc(id)}</h2>
    <p>Fans out the scoped drones for this <b>${esc(t.type || 'bug')}</b> — ${flow}. On a gap it runs one targeted re-dig and re-audits, then converges. Fills the whole case file so you can align in one read.</p>
    <p class="cf-sweep-note">read-only drones · runs on your plan · converges automatically · never pushes or deploys.</p>
    <div class="btns"><button class="btn primary" onclick="doBuildCase('${id}')"><span aria-hidden="true">⚡</span> Build the case</button><button class="btn" onclick="closeModal()">Cancel</button></div>`);
}
async function doBuildCase(id) {
  closeModal();
  try {
    await action('buildCase', { id, confirm: true });
    toast(`Building the case on ${id} — drones dispatched`, 'ok');
    if ('Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (_) {} }
    J.dspWatch = id;
    await load();
    if ((location.hash || '').includes('/ticket/' + id)) viewTicket(id);
    dspStartPoll(id); dspRenderTopbar(); dspRenderTicketBanner(id); dspEnsureBannerTimer();
  } catch (e) { /* action() already toasted */ }
}
// Compose the end-of-investigation resolution (dual narrative) — an Opus drone synthesises the
// complete case into a plain-English story for John + a technical brief for CC. Read-only.
async function composeResolution(id) {
  try {
    await action('composeResolution', { id, confirm: true });
    toast('Composing the resolution — Opus is synthesising the case', 'ok');
    if ('Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (_) {} }
    J.ccjobs = J.ccjobs || {}; J.ccjobs[id + '#resolution'] = { status: 'running', id, task: 'resolution', mode: 'gather', model: 'opus', started: Date.now() };
    J.dspWatch = id; await load(); if ((location.hash || '').includes('/ticket/' + id)) viewTicket(id);
    dspStartPoll(id); dspRenderTopbar(); dspEnsureBannerTimer();
  } catch (e) { /* action() already toasted */ }
}
// Execute the fix on main — a drone implements it in an ISOLATED main worktree (cockpit untouched),
// runs Guardian, commits. NOTHING pushes; the diff lands in Deploy for John to review + push.
async function executeFix(id) {
  if (!confirm('Run the execute-fix drone for ' + id + '?\n\n• Implements the fix in an ISOLATED main worktree — your cockpit branch is untouched.\n• Runs Guardian, commits the change. NOTHING is pushed.\n• You review the diff in Deploy and push.\n\nThis is an Opus drone editing your live app code; it can take several minutes.')) return;
  try {
    const r = await action('executeFixOnMain', { id, confirm: true });
    toast(`Execute-fix drone running on ${id} (main worktree) — the diff will land for your review`, 'ok');
    if ('Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (_) {} }
    J.ccjobs = J.ccjobs || {}; J.ccjobs[id + '#execute-fix'] = { status: 'running', id, task: 'execute-fix', mode: 'fix', model: 'opus', started: Date.now() };
    J.dspWatch = id; dspStartPoll(id); dspRenderTopbar(); dspEnsureBannerTimer();
    if ((location.hash || '').includes('/ticket/' + id)) viewTicket(id);
  } catch (e) { /* action() already toasted */ }
}
// Walk/confirm the implemented fix in the sandbox (the worktree's fixed app, FAKE-seeded) — proves
// it works before ready-to-ship. A drone runs the smoke / drives the surface + judges. PASS/FAIL.
async function confirmInSandbox(id) {
  try {
    await action('confirmInSandbox', { id, confirm: true });
    toast(`Confirming ${id} in the sandbox — walking the fixed app (FAKE-seeded)`, 'ok');
    if ('Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (_) {} }
    J.ccjobs = J.ccjobs || {}; J.ccjobs[id + '#sandbox'] = { status: 'running', id, task: 'sandbox', mode: 'fix', model: 'opus', started: Date.now() };
    J.dspWatch = id; dspStartPoll(id); dspRenderTopbar(); dspEnsureBannerTimer();
    if ((location.hash || '').includes('/ticket/' + id)) viewTicket(id);
  } catch (e) { /* action() already toasted */ }
}
// Capture the fixed screen (#36) — server drives the worktree's fixed app + screenshots the surface;
// the ticket then shows "what the fixed screen looks like". Re-renders the ticket when it lands.
async function captureFixShot(id) {
  try {
    await action('captureFixShot', { id, confirm: true });
    toast(`Capturing the fixed screen for ${id}…`, 'ok');
    J.ccjobs = J.ccjobs || {}; J.ccjobs[id + '#fixshot'] = { status: 'running', id, task: 'fixshot', mode: 'capture', model: '—', started: Date.now() };
    J.dspWatch = id; dspStartPoll(id); dspRenderTopbar(); dspEnsureBannerTimer();
    if ((location.hash || '').includes('/ticket/' + id)) viewTicket(id);
  } catch (e) { /* action() already toasted */ }
}
// Dispatch the UX drone (2026-05-28) — the frontend-design specialist. Walks the surface + reads the
// render code, judges against the design discipline (always loaded), proposes system-respecting changes
// (incl. flash/reload glitch diagnosis). Read-only — records caseFile.uxReview. Re-renders on landing.
async function uxReview(id) {
  try {
    await action('uxReview', { id, confirm: true });
    toast(`UX drone on ${id} — frontend-design review (walks the surface + render path)…`, 'ok');
    if ('Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (_) {} }
    J.ccjobs = J.ccjobs || {}; J.ccjobs[id + '#ux'] = { status: 'running', id, task: 'ux', mode: 'gather', model: 'opus', started: Date.now() };
    J.dspWatch = id; dspStartPoll(id); dspRenderTopbar(); dspEnsureBannerTimer();
    if ((location.hash || '').includes('/ticket/' + id)) viewTicket(id);
  } catch (e) { /* action() already toasted */ }
}
// Run the deterministic pre-ship GATE (2026-05-28) — server runs Guardian + the ticket's smoke spec in
// the worktree and records a trustworthy PASS/FAIL. Gates markReadyToShip + deploy. Re-renders on landing.
async function verifyFix(id) {
  try {
    await action('verifyFix', { id, confirm: true });
    toast(`Verifying ${id} — Guardian + smoke on the fixed worktree…`, 'ok');
    if ('Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (_) {} }
    J.ccjobs = J.ccjobs || {}; J.ccjobs[id + '#verify'] = { status: 'running', id, task: 'verify', mode: 'gate', model: '—', started: Date.now() };
    J.dspWatch = id; dspStartPoll(id); dspRenderTopbar(); dspEnsureBannerTimer();
    if ((location.hash || '').includes('/ticket/' + id)) viewTicket(id);
  } catch (e) { /* action() already toasted */ }
}
// Mark a sandbox-confirmed fix ready to ship — commits the worktree fix + earns ConfirmedLive → Deploy.
async function markReadyToShip(id) {
  try {
    const r = await action('markReadyToShip', { id, confirm: true });
    toast(`${id} → ready to ship${r.committed ? ' (fix committed on main)' : ''}. Review the diff in Deploy and push.`, 'ok');
    await load(); if ((location.hash || '').includes('/ticket/' + id)) viewTicket(id);
  } catch (e) { /* action() already toasted */ }
}
// Run the code-alignment auditor on a ticket's committed fix (BRAIN / invariants / architecture / Guardian).
async function runCodeAudit(id) {
  try {
    await action('codeAudit', { id, confirm: true });
    toast('Code-alignment audit running — BRAIN · invariants · architecture · Guardian', 'ok');
    if ('Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (_) {} }
    J.ccjobs = J.ccjobs || {}; J.ccjobs[id + '#code-audit'] = { status: 'running', id, task: 'code-audit', mode: 'gather', model: 'opus', started: Date.now() };
    J.dspWatch = id; dspStartPoll(id); dspRenderTopbar(); dspEnsureBannerTimer();
  } catch (e) { /* action() already toasted */ }
}
// Ask Jarvis ALL of a ticket's open questions at once → one clean threaded reply.
async function askQuestionAll(id) {
  try {
    const r = await action('jarvisAskAll', { id, confirm: true });
    toast(`Jarvis is answering ${r.questions || ''} question${r.questions === 1 ? '' : 's'} on ${id}`, 'ok');
    J.ccjobs = J.ccjobs || {}; J.ccjobs[id + '#jarvis-chat'] = { status: 'running', id, task: 'jarvis-chat', mode: 'gather', model: 'sonnet', started: Date.now() };
    J.dspWatch = id; dspStartPoll(id); dspRenderTopbar(); dspEnsureBannerTimer();
  } catch (e) { /* action() already toasted */ }
}
// Log a spin-off finding (by index into J._spin[parentId]) as a new ticket linked back to the parent.
function logSpinoff(parentId, idx) {
  const text = ((J._spin || {})[parentId] || [])[idx] || '';
  if (!text) { toast('finding not found', 'err'); return; }
  J._pendingSpinoff = { parentId, text };   // original text → recorded as logged so the list clears
  const title = text.length > 90 ? text.slice(0, 87) + '…' : text;
  modal(`<h2>Log as new ticket</h2>
    <p>Create a ticket from this spin-off finding, auto-linked back to <b>${esc(parentId)}</b>. Edit before creating.</p>
    <div class="label">Title</div><input id="soTitle" value="${esc(title)}" maxlength="200">
    <div class="label" style="margin-top:10px">Detail</div><textarea id="soSummary">${esc(text)}</textarea>
    <div class="dsp-tunes" style="margin-top:10px">
      <div class="dsp-tune"><label class="dsp-tune-lbl" for="soType">Type</label><div class="dsp-selwrap"><select id="soType" class="dsp-sel"><option value="bug" selected>Bug</option><option value="task">Task</option><option value="feature">Feature</option></select></div></div>
      <div class="dsp-tune"><label class="dsp-tune-lbl" for="soSev">Severity</label><div class="dsp-selwrap"><select id="soSev" class="dsp-sel"><option value="P2" selected>P2</option><option value="P1">P1</option><option value="P0">P0</option></select></div></div>
    </div>
    <div class="btns"><button class="btn primary" onclick="doLogSpinoff('${parentId}')">Create ticket</button><button class="btn" onclick="closeModal()">Cancel</button></div>`);
}
async function doLogSpinoff(parentId) {
  const title = ($('soTitle').value || '').trim(); if (!title) { toast('title required', 'err'); return; }
  const summary = ($('soSummary').value || '').trim();
  const type = ($('soType') ? $('soType').value : 'bug'); const severity = ($('soSev') ? $('soSev').value : 'P2');
  const parent = get(parentId);
  try {
    const r = await action('createTicket', { title, summary, type, severity, surface: parent ? parent.group : null, parent: parentId, spinoffText: (J._pendingSpinoff || {}).text, epic: parent ? parent.epic : null });
    closeModal(); toast(`Created ${r.id} — linked to ${parentId}`, 'ok');
    await load();
    if ((location.hash || '').includes('/ticket/' + parentId)) viewTicket(parentId);
  } catch (e) { /* action() already toasted */ }
}
// Bulk-log every Potential-ticket finding at once → N child tickets, inheriting the parent's epic
// (so they land in the same bundle/epic, shaping a release). Per John 2026-05-27.
function logAllSpinoffs(parentId) {
  const items = (J._spin || {})[parentId] || [];
  if (!items.length) { toast('nothing to log', 'err'); return; }
  modal(`<h2>Log all ${items.length} findings as tickets</h2>
    <p>Creates ${items.length} tickets, each linked to <b>${esc(parentId)}</b>${(get(parentId) || {}).epic ? ` and under epic <b>${esc(get(parentId).epic)}</b>` : ''}. Pick the category they share.</p>
    <div class="dsp-tunes" style="margin-top:6px">
      <div class="dsp-tune"><label class="dsp-tune-lbl" for="laType">Type</label><div class="dsp-selwrap"><select id="laType" class="dsp-sel"><option value="bug" selected>Bug</option><option value="task">Task</option></select></div></div>
      <div class="dsp-tune"><label class="dsp-tune-lbl" for="laSev">Severity</label><div class="dsp-selwrap"><select id="laSev" class="dsp-sel"><option value="P2" selected>P2</option><option value="P1">P1</option></select></div></div>
    </div>
    <div class="btns"><button class="btn primary" onclick="doLogAllSpinoffs('${parentId}')">Create ${items.length} tickets</button><button class="btn" onclick="closeModal()">Cancel</button></div>`);
}
async function doLogAllSpinoffs(parentId) {
  const items = ((J._spin || {})[parentId] || []).slice();
  const parent = get(parentId);
  const type = $('laType') ? $('laType').value : 'bug'; const severity = $('laSev') ? $('laSev').value : 'P2';
  closeModal(); toast(`Logging ${items.length} tickets…`, 'ok');
  let n = 0, last = '';
  for (const text of items) {
    const title = text.length > 90 ? text.slice(0, 87) + '…' : text;
    try { const r = await action('createTicket', { title, summary: text, type, severity, surface: parent ? parent.group : null, parent: parentId, spinoffText: text, epic: parent ? parent.epic : null }); n++; last = r.id; } catch (e) {}
  }
  toast(`Created ${n} ticket${n === 1 ? '' : 's'} from findings${last ? ' (…' + last + ')' : ''}`, 'ok');
  await load();
  if ((location.hash || '').includes('/ticket/' + parentId)) viewTicket(parentId);
}

// Epic assignment dropdown — lists existing epics; setMeta('epic',...) re-parents the story.
function epicSelect(t) {
  const epics = (J.tickets || []).filter(x => x.type === 'epic' && x.id !== t.id);
  const cur = t.epic || '';
  const opts = ['<option value="">— no epic —</option>']
    .concat(epics.map(e => `<option value="${e.id}"${e.id === cur ? ' selected' : ''}>${esc(e.id + ' · ' + String(e.title || '').slice(0, 38))}</option>`));
  if (cur && !epics.some(e => e.id === cur)) opts.push(`<option value="${cur}" selected>${esc(cur)} (missing)</option>`);
  return `<select class="fld-bundle fld-epic${cur ? ' set' : ''}" onchange="setMeta('${t.id}','epic',this.value)" aria-label="Epic for ${t.id}">${opts.join('')}</select>`;
}
// Epic roll-up — the stories under this epic + done/total, shown on an epic ticket.
function renderEpicChildren(epic) {
  const kids = (J.tickets || []).filter(x => x.epic === epic.id);
  const done = kids.filter(k => ['ConfirmedLive', 'Shipped'].includes((k.state || {}).status)).length;
  return `<div class="siderail epic-rail">
    <div class="sh">Stories in this epic <span class="epic-count">${done}/${kids.length}</span></div>
    <a class="btn sm full" href="#/epic/${epic.id}" style="margin-bottom:8px">Open epic workspace &rarr;</a>
    ${kids.length
      ? kids.map(k => `<div class="kv"><span class="k"><a href="#/ticket/${k.id}">${k.id}</a></span><span class="v"><span class="pill sm s-${(k.state || {}).status}">${STATUS_LABEL[(k.state || {}).status] || (k.state || {}).status}</span></span></div>`).join('')
      : '<div class="epic-empty">No stories yet — set this epic on other tickets via their Epic field.</div>'}
  </div>`;
}

/* ════════════════════════ EPIC WORKSPACE — the deep epic view ════════════
 * John: "the EPIC depth is nowhere near deep enough — hard to track what's linked and in what
 * order to complete them." This is the workspace: the goal (human story), a progress bar, the
 * single DO THIS NEXT, the ordered children (reorder + dependencies + case-completeness), and a
 * technical rollup for Jarvis/CC. #/epic/SLY-N. */
const isEpicDone = k => ['ConfirmedLive', 'Shipped'].includes((k.state || {}).status);
const isBlocked = k => (k.blockedBy || []).some(b => { const bt = get(b); return bt && !isEpicDone(bt); });
// Case-file completeness 0-5 (root &middot; surface &middot; fix &middot; conformance &middot; audit) &mdash; the "how built out is this" signal.
function caseScore(k) {
  const cf = k.caseFile || {}; let n = 0;
  if (cf.rootCause && cf.rootCause.rootCause) n++;
  if (cf.surface && cf.surface.surface) n++;
  if (cf.fix && cf.fix.fix) n++;
  if (cf.conformance && cf.conformance.driftVerdict) n++;
  if (cf.audit && cf.audit.verdict) n++;
  return n;
}
// Child order: explicit epic.childOrder if set, else heuristic (not-done first &middot; unblocked first &middot; severity).
function epicChildOrder(epic, kids) {
  if (Array.isArray(epic.childOrder) && epic.childOrder.length) {
    const idx = {}; epic.childOrder.forEach((x, i) => idx[x] = i);
    return kids.slice().sort((a, b) => (idx[a.id] == null ? 999 : idx[a.id]) - (idx[b.id] == null ? 999 : idx[b.id]));
  }
  return kids.slice().sort((a, b) => (isEpicDone(a) - isEpicDone(b)) || (isBlocked(a) - isBlocked(b)) || (SEVRANK[a.severity] - SEVRANK[b.severity]));
}
function viewEpic(id) {
  const epic = get(id); const v = $('view'); v.className = 'view maxw';
  if (!epic) { v.innerHTML = `<a class="backlink" onclick="goBack();return false" href="#/board">&lsaquo; Back</a><div class="empty">Epic not found.</div>`; return; }
  if (epic.type !== 'epic') {   // not an epic &mdash; offer to promote, but show what we can
    v.innerHTML = `<a class="backlink" onclick="goBack();return false" href="#/board">&lsaquo; Back</a>
      <div class="empty">${esc(id)} isn&rsquo;t an epic. <button class="btn sm" onclick="setMeta('${id}','type','epic')">Make it an epic</button> <a class="btn sm" href="#/ticket/${id}">Open as ticket</a></div>`;
    return;
  }
  const kids = (J.tickets || []).filter(x => x.epic === id);
  const ordered = epicChildOrder(epic, kids);
  const total = kids.length, done = kids.filter(isEpicDone).length;
  const pct = total ? Math.round(done / total * 100) : 0;
  const next = ordered.find(k => !isEpicDone(k) && !isBlocked(k));
  const inFlight = kids.filter(k => ['Aligned', 'Investigating', 'Gathering'].includes((k.state || {}).status));
  const surfaces = [...new Set(kids.map(k => k.group).filter(Boolean))];

  // a sibling option list (for the "blocked by" picker)
  const siblingOpts = (childId, cur) => ordered.filter(k => k.id !== childId)
    .map(k => `<option value="${k.id}"${(cur || []).includes(k.id) ? ' selected' : ''}>${esc(k.id + ' &middot; ' + String(k.title || '').slice(0, 30))}</option>`).join('');

  const childRow = (k, i) => {
    const dn = isEpicDone(k), bl = isBlocked(k);
    const blockers = (k.blockedBy || []).filter(b => { const bt = get(b); return bt && !isEpicDone(bt); });
    const cs = caseScore(k);
    const sweeping = (J.sweeps || {})[k.id] && J.sweeps[k.id].status === 'running';
    return `<div class="ew-row${dn ? ' ew-done' : ''}${bl ? ' ew-blocked' : ''}${next && next.id === k.id ? ' ew-next' : ''}">
      <div class="ew-seq">${i + 1}</div>
      <div class="ew-reorder">
        <button class="ew-arrow" title="Move up" ${i === 0 ? 'disabled' : ''} onclick="epicReorder('${id}','${k.id}',-1)">&#9650;</button>
        <button class="ew-arrow" title="Move down" ${i === ordered.length - 1 ? 'disabled' : ''} onclick="epicReorder('${id}','${k.id}',1)">&#9660;</button>
      </div>
      <div class="ew-main">
        <div class="ew-top">
          <a class="ew-id" href="#/ticket/${k.id}">${k.id}</a>
          <span class="pill sm ${sevCls(k.severity)}">${k.severity}</span>
          <span class="pill sm s-${(k.state || {}).status}">${STATUS_LABEL[(k.state || {}).status] || (k.state || {}).status}</span>
          <span class="ew-case" title="Case file ${cs} of 5 slots filled">case ${cs}/5</span>
          ${sweeping ? '<span class="ew-sweeping"><span class="ew-dot"></span> drones in</span>' : ''}
          ${bl ? `<span class="ew-blk">&#9940; blocked by ${blockers.map(esc).join(', ')}</span>` : ''}
        </div>
        <div class="ew-title">${esc(k.title)}</div>
      </div>
      <div class="ew-act">
        ${!dn ? `<button class="btn sm brief-deploy" onclick="doBuildCase('${k.id}')" title="Build the case &mdash; parallel drone sweep">&#9889; build</button>` : '<span class="ew-doneck">&check; done</span>'}
        <div class="dsp-selwrap ew-blkpick"><select class="dsp-sel ew-blksel" onchange="epicSetBlocked('${k.id}', this)" aria-label="Blocked by"><option value="">blocked by&hellip;</option>${siblingOpts(k.id, k.blockedBy)}</select></div>
      </div>
    </div>`;
  };

  v.innerHTML = `
    <a class="backlink" onclick="goBack();return false" href="#/board">&lsaquo; Back</a>
    <div class="ew-head">
      <div class="ew-headmain">
        <div class="pills"><span class="pill k-epic">Epic</span><span class="meta">${epic.id}</span></div>
        <h1>${esc(epic.title)}</h1>
        ${epic.summary ? `<p class="ew-goal">${esc(epic.summary)}</p>` : ''}
      </div>
      <div class="ew-progresswrap">
        <div class="ew-pct">${pct}%</div>
        <div class="ew-bar"><span style="width:${pct}%"></span></div>
        <div class="ew-prog-l">${done} of ${total} done${inFlight.length ? ` &middot; ${inFlight.length} in motion` : ''}</div>
      </div>
    </div>

    ${next ? `<div class="ew-next-card">
      <div class="ew-next-h">&#9656; DO THIS NEXT</div>
      <a class="ew-next-id" href="#/ticket/${next.id}">${next.id} &middot; ${esc(next.title)}</a>
      <div class="ew-next-why">${esc(String(next.summary || '').slice(0, 200))}</div>
      <div class="ew-next-act">
        <a class="btn sm" href="#/ticket/${next.id}">open &rarr;</a>
        <button class="btn sm brief-deploy" onclick="doBuildCase('${next.id}')">&#9889; build the case</button>
      </div>
    </div>` : (total && done === total ? `<div class="ew-alldone">&check; Every story in this epic is done. Ready to close.</div>` : '')}

    <div class="ticketgrid">
      <div class="ticketmain">
        <div class="ew-children-h">
          <span>Stories in order <small>&mdash; drag-free reorder with &#9650;&#9660;; the order respects blockers</small></span>
          <button class="btn sm" onclick="epicAutoOrder('${id}')" title="Sort by dependencies + severity">Auto-order</button>
        </div>
        ${ordered.length ? ordered.map(childRow).join('') : '<div class="ew-empty">No stories under this epic yet. Set this epic on tickets via their <b>Epic</b> field, or use &ldquo;Log all&rdquo; on an investigation&rsquo;s spin-offs (they inherit the epic).</div>'}
      </div>
      <div class="ticketside">
        <div class="siderail">
          <div class="sh">Epic at a glance</div>
          <div class="kv"><span class="k">Stories</span><span class="v">${total}</span></div>
          <div class="kv"><span class="k">Done</span><span class="v">${done}</span></div>
          <div class="kv"><span class="k">In motion</span><span class="v">${inFlight.length}</span></div>
          <div class="kv"><span class="k">Blocked</span><span class="v">${kids.filter(isBlocked).length}</span></div>
        </div>
        <div class="siderail">
          <div class="sh">Technical footprint <span class="cf-spinoff-hint">&mdash; for Jarvis / CC</span></div>
          ${surfaces.length ? `<div class="ew-surfaces">${surfaces.map(s => `<a class="ew-surface" href="#/map/${s}">${esc(niceSurface(s))}</a>`).join('')}</div>` : '<div class="epic-empty">No surfaces mapped yet.</div>'}
          <p class="ew-tech-note">These are the App-Map surfaces this epic&rsquo;s stories touch &mdash; the blast radius CC inherits when it picks one up.</p>
        </div>
        <div class="siderail">
          <div class="sh">Sweep them in parallel</div>
          <p class="dz-note" style="color:var(--label)">Build the case on every open story at once &mdash; drones scope them while you focus on decisions.</p>
          <button class="btn full" onclick="epicSweepAll('${id}')">&#9889; Build all open cases</button>
        </div>
      </div>
    </div>`;
  dspEnsureBannerTimer();
}
// Reorder a child within the epic: materialise the current order, move the child, persist childOrder.
async function epicReorder(epicId, childId, dir) {
  const epic = get(epicId); if (!epic) return;
  const kids = (J.tickets || []).filter(x => x.epic === epicId);
  const order = epicChildOrder(epic, kids).map(k => k.id);
  const i = order.indexOf(childId); const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return;
  [order[i], order[j]] = [order[j], order[i]];
  try { await action('setEpicOrder', { id: epicId, order }); await load(); if ((location.hash || '').includes('/epic/' + epicId)) viewEpic(epicId); } catch (e) {}
}
async function epicAutoOrder(epicId) {
  const epic = get(epicId); if (!epic) return;
  // write the heuristic order explicitly so John has a sensible starting sequence to tweak
  const kids = (J.tickets || []).filter(x => x.epic === epicId);
  const cleared = { ...epic, childOrder: null };   // force the heuristic (ignore any saved order)
  const order = epicChildOrder(cleared, kids).map(k => k.id);
  try { await action('setEpicOrder', { id: epicId, order }); toast('Ordered by dependencies + severity', 'ok'); await load(); if ((location.hash || '').includes('/epic/' + epicId)) viewEpic(epicId); } catch (e) {}
}
async function epicSetBlocked(childId, sel) {
  const v = sel.value; if (!v) return;
  const child = get(childId); const cur = (child && child.blockedBy) || [];
  const next = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v];   // toggle
  try { await action('setBlockedBy', { id: childId, ids: next }); toast(cur.includes(v) ? 'Dependency removed' : 'Marked blocked by ' + v, 'ok'); await load(); const ep = (J.tickets || []).find(x => x.id === childId); const epicId = ep && ep.epic; if (epicId && (location.hash || '').includes('/epic/' + epicId)) viewEpic(epicId); } catch (e) {}
}
async function epicSweepAll(epicId) {
  const kids = (J.tickets || []).filter(x => x.epic === epicId && !isEpicDone(x));
  if (!kids.length) { toast('nothing open to sweep', 'err'); return; }
  if (!confirm(`Build the case on all ${kids.length} open stories in ${epicId}? Spawns parallel read-only drone sweeps.`)) return;
  toast(`Sweeping ${kids.length} stories&hellip;`, 'ok');
  for (const k of kids) { try { await action('buildCase', { id: k.id, confirm: true }); } catch (e) {} }
  J.dspWatch = epicId; await load(); if ((location.hash || '').includes('/epic/' + epicId)) viewEpic(epicId);
  dspStartPoll(epicId); dspRenderTopbar(); dspEnsureBannerTimer();
}

/* ════════════════════════ TICKET DETAIL (the case-view skin) ════════════ */
function viewTicket(id) {
  const t = get(id); const v = $('view');
  if (!t) { v.innerHTML = `<a class="backlink" href="#/board">‹ Board</a><div class="empty">Ticket not found.</div>`; return; }
  const st = t.state, status = st.status, assignee = st.assignee;
  const cur = (t.rich.mechanism || '').slice(0, 180);
  const aft = (t.rich.fix || '').slice(0, 180);
  const ev = t.rich.evidence;
  const sync = [t.openBug ? `OPEN-BUGS #${t.openBug}` : null, ev ? 'feature map (' + niceSurface(t.group) + ')' : null].filter(Boolean);
  v.className = 'view maxw';
  v.innerHTML = `
    <a class="backlink" href="#/board">‹ Board</a>
    <div class="tk-head">
      <div>
        <div class="pills">
          <span class="pill ${sevCls(t.severity)}">${t.severity}${t.severity === 'P0' ? ' · Critical' : ''}</span>
          <span class="pill s-${status}">${STATUS_LABEL[status]}</span>
          <span class="pill k-${t.kind}">${esc(cap(t.kind))}</span>
          <span class="meta">${t.id} · ${esc(niceSurface(t.group))}</span>
        </div>
        <h1>${esc(t.title)}</h1>
      </div>
    </div>
    <div id="dspTicketBanner"></div>
    ${renderNextBanner(t)}
    ${renderReadinessChip(t)}
    ${renderTriageVerdict(t)}
    <div class="ticketgrid">
      <div class="ticketmain">
        <div class="card">
          <div class="label">What's happening</div>
          <p class="summary">${esc(t.summary)}</p>
          ${cur || aft ? `<div class="twocol">
            <div class="mini cur"><div class="h">Now</div><div class="b">${esc(cur)}${cur.length >= 200 ? '…' : ''}</div></div>
            <div class="mini aft"><div class="h">After fix</div><div class="b">${esc(aft)}${aft.length >= 200 ? '…' : ''}</div></div>
          </div>` : ''}
          ${t.rich.rootCause ? `<details class="deep"><summary><span class="tw">▸</span> Technical depth — mechanism, root cause, walk evidence, files</summary><div class="dbody">
            ${t.rich.mechanism ? `<p><b>Mechanism.</b> ${esc(t.rich.mechanism)}</p>` : ''}
            <p><b>Root cause.</b> ${esc(t.rich.rootCause)}</p>
            ${ev ? `<div class="label" style="margin-top:14px">Walk evidence — ${esc(ev.flow)} (${esc(ev.walkDir)})</div>${renderTrace(ev)}` : ''}
            ${(t.rich.files || []).length ? `<div class="label" style="margin-top:14px">Files</div>${t.rich.files.map(f => `<code class="fileline">${esc(f)}</code>`).join('')}` : ''}
            ${t.rich.fix ? `<p style="margin-top:12px"><b>Proposed fix.</b> ${esc(t.rich.fix)}</p>` : ''}
          </div></details>` : ''}
          ${t.group && t.group !== 'tracked' && t.group !== 'planning' ? `<div style="margin-top:14px"><a class="btn sm" href="#/map/${t.group}">View this surface on the App Map →</a></div>` : ''}
        </div>
        ${renderCaseFile(t)}
        ${renderBundleBubble(t)}
        <div class="card">
          <div class="cf-cardhead">
            <div class="label">Discuss with Jarvis — then align to hand to CC</div>
          </div>
          <div class="fmtbar" role="toolbar" aria-label="Formatting">
            <button type="button" class="fmtbtn" title="Bold" onclick="fmtCmt('bold')"><b>B</b></button>
            <button type="button" class="fmtbtn" title="Italic" onclick="fmtCmt('italic')"><i>I</i></button>
            <button type="button" class="fmtbtn" title="Heading" onclick="fmtCmt('h')">H</button>
            <button type="button" class="fmtbtn" title="Bulleted list" onclick="fmtCmt('ul')">• List</button>
            <button type="button" class="fmtbtn" title="Numbered list" onclick="fmtCmt('ol')">1. List</button>
            <button type="button" class="fmtbtn fmtbtn-mono" title="Inline / block code" onclick="fmtCmt('code')">&lt;/&gt;</button>
            <span class="fmtbar-sep"></span>
            <button type="button" class="fmtbtn fmtbtn-attach" title="Attach a file (image, CSV, txt, pdf…)" onclick="pickAttach('${t.id}')"><span aria-hidden="true">📎</span> Attach</button>
            <input type="file" id="attachInput" class="att-input" accept="image/*,.csv,.txt,.log,.json,.md,.pdf" onchange="doAttach('${t.id}', this)">
            <span class="fmtbar-hint">Markdown — renders when posted</span>
          </div>
          <div class="composer">
            <textarea id="cmt" placeholder="Refine the fix, add a constraint, ask a question…  (toolbar above inserts Markdown)"></textarea>
          </div>
          <div class="composer-actions">
            <span class="composer-hint">Type a note, then post it — or ask Jarvis (he reads the ticket + evidence and replies in the thread).</span>
            <div class="composer-btns">
              <button class="btn" onclick="comment('${t.id}')">Post comment</button>
              <button class="btn primary" onclick="askJarvis('${t.id}')"><span aria-hidden="true">✦</span> Ask Jarvis</button>
            </div>
          </div>
          <div class="btns">
            ${['Open', 'Discussing', 'Gathering'].includes(status)
              ? `<button class="btn green" onclick="align('${t.id}')">&#10003; Aligned — hand to CC</button>
                 <button class="btn dsp-btn dsp-btn-locked" type="button" disabled
                   title="Align this ticket first to dispatch — CC needs the handoff package">
                   <span class="dsp-btn-ic" aria-hidden="true">▶</span> Dispatch to CC
                   <span class="dsp-locked-hint">Align this ticket first to dispatch</span>
                 </button>`
              : `<button class="btn" onclick="viewHandoff('${t.id}')">View handoff package</button>
                 <button class="btn dsp-btn" onclick="dispatchToCC('${t.id}')" title="Spawn a real CC drone on this ticket's handoff package">
                   <span class="dsp-btn-ic" aria-hidden="true">▶</span> Dispatch to CC
                 </button>`}
          </div>
          ${(st.thread || []).length ? `<div class="cf-cardhead cf-history-head">
            <div class="cf-history-label">Discussion · ${(st.thread || []).length} comment${(st.thread || []).length === 1 ? '' : 's'}</div>
            ${(st.thread || []).length > 1 ? `<button class="btn sm" onclick="toggleThreadSort()" title="Toggle comment order">${threadSort === 'newest' ? 'Newest first' : 'Oldest first'} ⇅</button>` : ''}
          </div>` : ''}
          <div class="thread" id="thread">${renderThread(st.thread, t.id)}</div>
        </div>
      </div>
      <div class="ticketside">
        <div class="siderail tk-statusrail">
          <div class="sh">Status</div>
          <div class="tk-statusnow"><span class="pill sm s-${status}">${STATUS_LABEL[status]}</span></div>
          <div class="tk-statusneed">${esc((STATUS_INFO[status] || {}).need || '')}</div>
          <div class="kv"><span class="k">Owner</span><span class="v">${assignee === 'cc' ? 'CC' : 'John'}</span></div>
        </div>
        <div class="siderail">
          <div class="sh">Details</div>
          <div class="kv fld-kv"><span class="k">Type</span><span class="v">
            ${fldSelect(t.id, 'type', t.type, [['bug', 'Bug'], ['feature', 'Feature'], ['task', 'Task'], ['epic', 'Epic']], 'fld-type-' + t.type)}
          </span></div>
          ${t.type !== 'epic' ? `<div class="kv fld-kv"><span class="k">Epic</span><span class="v">${epicSelect(t)}</span></div>` : ''}
          <div class="kv fld-kv"><span class="k">Severity</span><span class="v">
            ${fldSelect(t.id, 'severity', t.severity, [['P0', 'P0 · Critical'], ['P1', 'P1 · High'], ['P2', 'P2 · Normal']], sevCls(t.severity))}
          </span></div>
          <div class="kv fld-kv"><span class="k">Bundle</span><span class="v">
            <input type="text" class="fld-bundle${t.bundle ? ' set' : ''}" list="fld-bundles" maxlength="60"
              value="${esc(t.bundle || '')}" placeholder="e.g. Bundle 33"
              onchange="setMeta('${t.id}','bundle',this.value)" aria-label="Bundle for ${t.id}">
          </span></div>
          <div class="kv"><span class="k">Surface</span><span class="v">${esc(niceSurface(t.group))}</span></div>
          <div class="kv"><span class="k">Age</span><span class="v">${ago(st.opened)}</span></div>
        </div>
        ${fldBundleDatalist()}
        ${t.type === 'epic' ? renderEpicChildren(t) : ''}
        ${renderLinkedTickets(t)}
        <button class="tk-delete" onclick="askDelete('${t.id}')" title="Permanently remove this ticket — can't be undone">Delete ticket</button>
      </div>
    </div>`;
  dspRenderTicketBanner(t.id);        // paint the live "drone out" strip if one is running on this ticket
  dspEnsureBannerTimer();             // keep the elapsed clock ticking while it runs
}
/* Minimal, dependency-free, XSS-safe Markdown → HTML for thread comments.
 * CC drones post Markdown (## headings, **bold**, lists, `code`, --- rules); John/Jarvis
 * comments are usually plain text (which renders unchanged). SECURITY: we esc() the whole
 * string FIRST, then re-introduce ONLY the specific tags we generate below — so any literal
 * HTML in a comment stays inert (&lt;script&gt;), and no untrusted attribute/URL is emitted. */
function mdInline(s) {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>');
}
function mdToHtml(raw) {
  const lines = esc(String(raw || '')).split('\n');
  let html = '', inUl = false, inOl = false, inCode = false, code = [];
  const closeLists = () => { if (inUl) { html += '</ul>'; inUl = false; } if (inOl) { html += '</ol>'; inOl = false; } };
  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      if (inCode) { html += '<pre class="md-pre">' + code.join('\n') + '</pre>'; code = []; inCode = false; }
      else { closeLists(); inCode = true; }
      continue;
    }
    if (inCode) { code.push(line); continue; }
    const t = line.trim();
    if (t === '') { closeLists(); continue; }
    if (/^(---+|___+|\*\*\*+)$/.test(t)) { closeLists(); html += '<hr class="md-hr">'; continue; }
    let m;
    if ((m = t.match(/^#{1,6}\s+(.*)$/))) { closeLists(); html += '<div class="md-h">' + mdInline(m[1]) + '</div>'; continue; }
    if ((m = t.match(/^[-*+]\s+(.*)$/))) { if (inOl) { html += '</ol>'; inOl = false; } if (!inUl) { html += '<ul class="md-ul">'; inUl = true; } html += '<li>' + mdInline(m[1]) + '</li>'; continue; }
    if ((m = t.match(/^\d+\.\s+(.*)$/))) { if (inUl) { html += '</ul>'; inUl = false; } if (!inOl) { html += '<ol class="md-ol">'; inOl = true; } html += '<li>' + mdInline(m[1]) + '</li>'; continue; }
    closeLists(); html += '<p class="md-p">' + mdInline(t) + '</p>';
  }
  if (inCode) html += '<pre class="md-pre">' + code.join('\n') + '</pre>';
  closeLists();
  return html;
}
// Render one attachment inside a comment bubble. Image → inline preview (click to open full),
// anything else → a download chip. The <img src>/<a href> are built by us from the server's
// fixed /api/attachment route with an encoded id+filename — no untrusted URL is emitted.
function fmtBytes(n) { return n == null ? '' : n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; }
function renderAttach(att, id) {
  if (!att || !att.file) return '';
  const url = '/api/attachment?id=' + encodeURIComponent(id) + '&name=' + encodeURIComponent(att.file);
  const size = fmtBytes(att.size);
  if (/^image\//.test(att.mime || '')) {
    return `<a class="att-img" href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" alt="${esc(att.name)}" loading="lazy"></a>` +
           `<div class="att-cap">${esc(att.name)}${size ? ' · ' + size : ''}</div>`;
  }
  return `<a class="att-file" href="${esc(url)}" target="_blank" rel="noopener" download="${esc(att.name)}">` +
         `<span class="att-file-ic" aria-hidden="true">📎</span><span class="att-file-n">${esc(att.name)}</span>` +
         `${size ? `<span class="att-file-s">${size}</span>` : ''}</a>`;
}
let threadSort = 'newest';   // 'newest' (top) | 'oldest'
function toggleThreadSort() { threadSort = threadSort === 'newest' ? 'oldest' : 'newest'; const cur = currentTicketId(); if (cur) viewTicket(cur); }
function renderThread(thread, id) {
  if (!thread || !thread.length) return '<div class="empty">No discussion yet. Add a comment, or get Jarvis\'s take.</div>';
  const items = threadSort === 'newest' ? thread.slice().reverse() : thread.slice();
  return items.map(c => {
    const av = c.author === 'john' ? 'J' : c.author === 'jarvis' ? 'Jv' : 'CC';
    const name = c.author === 'john' ? 'John' : c.author === 'jarvis' ? 'Jarvis' : 'CC';
    const align = /ALIGNED/.test(c.text || '') ? ' align' : '';
    const body = (c.text && c.text.trim()) ? `<div class="txt md">${mdToHtml(c.text)}</div>` : '';
    const at = c.attach ? `<div class="att">${renderAttach(c.attach, id)}</div>` : '';
    return `<div class="cmt ${c.author}${align}"><div class="av">${av}</div><div class="bub"><span class="who">${name}<span class="ts">${when(c.ts)}</span></span>${body}${at}</div></div>`;
  }).join('');
}
function renderTrace(ev) {
  return `<div class="trace">${(ev.steps || []).map(s => {
    const lands = s.lands && s.lands.length ? `<span class="lands">lands: [${s.lands.join(', ')}]</span>` : '<span class="miss">lands: [] (no-op)</span>';
    const delta = Object.keys(s.delta || {}).length ? ' · <span class="delta">' + Object.entries(s.delta).map(([k, vv]) => `${k}: ${vv}`).join(' · ') + '</span>' : '';
    return `<div class="st"><b>${esc(s.step)}</b> — ${esc(s.action || '')}<br>${lands}${delta}${s.probe ? `<div class="probe">${esc(JSON.stringify(s.probe, null, 2))}</div>` : ''}</div>`;
  }).join('')}</div>`;
}

/* ── loop actions ─────────────────────────────────────────────────────── */
async function refreshTicket(id) { await load(); route(); }

/* ── EDITABLE TICKET METADATA (setMeta) ──────────────────────────────────────
 * One generic setter calls the allowlisted server action and re-pulls truth, then
 * re-renders whatever view is showing (ticket detail / board / planning / calendar)
 * — same reload+re-render contract as comment()/changeStatus()/askDelete(). On a
 * server rejection action() already toasts; we still reload so the control snaps
 * back to the real value. */
async function setMeta(id, field, value) {
  const t = get(id);
  const before = t ? (field === 'dueDate' ? t.dueDate : field === 'bundle' ? t.bundle : t[field]) : null;
  const v = (value == null ? '' : String(value)).trim();
  if ((before || '') === v) return;                 // no-op — nothing changed
  try {
    await action('setMeta', { id, field, value: v });
    const LBL = { type: 'Type', severity: 'Severity', dueDate: 'Due date', bundle: 'Bundle' };
    toast(`${id} · ${LBL[field]} ${v ? 'set to ' + v : 'cleared'}`, 'ok');
  } catch (e) { /* action() already toasted the rejection */ }
  await load();   // re-pull truth either way
  route();        // re-render the current view (illegal/failed edit snaps back to truth)
}

// premium custom select for an editable meta field (matches .bd2-sel chrome).
// `valCls` toggles a colour class so the closed select reads like the value pill.
function fldSelect(id, field, value, opts, valCls) {
  return `<span class="fld-selwrap ${valCls || ''}">
    <select class="fld-sel ${valCls || ''}" aria-label="${esc(field)} for ${id}"
      onchange="setMeta('${id}','${field}',this.value)">
      ${opts.map(([val, lbl]) => `<option value="${esc(val)}" ${value === val ? 'selected' : ''}>${esc(lbl)}</option>`).join('')}
    </select>
    ${BD2_CHEVRON}
  </span>`;
}

// existing bundles → a shared <datalist> so the Bundle input autocompletes what's
// already in use (no free-for-all typos; still allows a brand-new bundle name).
function fldBundles() {
  return [...new Set((J.tickets || []).map(t => t.bundle).filter(Boolean))].sort();
}
function fldBundleDatalist() {
  return `<datalist id="fld-bundles">${fldBundles().map(b => `<option value="${esc(b)}">`).join('')}</datalist>`;
}
async function comment(id) {
  const text = ($('cmt').value || '').trim(); if (!text) { toast('write something first', 'err'); return; }
  try { await action('addComment', { id, author: 'john', text }); toast('comment added', 'ok'); await refreshTicket(id); } catch (e) {}
}

/* ── Composer formatting toolbar ──────────────────────────────────────────────
 * Inserts Markdown around the textarea selection (which renderThread now renders).
 * applyFmt is pure (value+selection in → value+selection out) so it's testable; fmtCmt
 * just wires it to the #cmt element and restores the selection. */
function applyFmt(v, s, e, kind) {
  const sel = v.slice(s, e);
  const wrap = (tok) => ({ value: v.slice(0, s) + tok + sel + tok + v.slice(e), selStart: s + tok.length, selEnd: s + tok.length + sel.length });
  if (kind === 'bold') return wrap('**');
  if (kind === 'italic') return wrap('*');
  if (kind === 'code') {
    if (sel.includes('\n')) { const nv = v.slice(0, s) + '```\n' + sel + '\n```' + v.slice(e); return { value: nv, selStart: s + 4, selEnd: s + 4 + sel.length }; }
    return wrap('`');
  }
  // block kinds (ul / ol / h): rewrite every line the selection touches
  const lineStart = v.lastIndexOf('\n', s - 1) + 1;
  const base = (e > s && v[e - 1] === '\n') ? e - 1 : e;
  const nlAfter = v.indexOf('\n', base);
  const lineEnd = nlAfter === -1 ? v.length : nlAfter;
  let n = 1;
  const mapped = v.slice(lineStart, lineEnd).split('\n').map(l => {
    const m = l.match(/^(\s*)(.*)$/);
    const rest = m[2].replace(/^([-*+]\s+|\d+\.\s+|#{1,6}\s+)/, '');   // strip any existing prefix first
    if (kind === 'ul') return m[1] + '- ' + rest;
    if (kind === 'ol') return m[1] + (n++) + '. ' + rest;
    return m[1] + '## ' + rest;
  }).join('\n');
  return { value: v.slice(0, lineStart) + mapped + v.slice(lineEnd), selStart: lineStart, selEnd: lineStart + mapped.length };
}
function fmtCmt(kind) {
  const ta = $('cmt'); if (!ta) return;
  const r = applyFmt(ta.value, ta.selectionStart, ta.selectionEnd, kind);
  ta.value = r.value; ta.focus(); ta.setSelectionRange(r.selStart, r.selEnd);
}

/* ── File attachments ─────────────────────────────────────────────────────────
 * The composer's caption text rides along, so John can write a note AND attach a
 * screenshot in one bubble. File → base64 → attachFile action → server jails + stores
 * + records a thread entry; we refresh to show it. 12MB client guard mirrors the server. */
function pickAttach(id) { const inp = $('attachInput'); if (inp) { inp.value = ''; inp.click(); } }
function fileToB64(f) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result || ''); resolve(s.slice(s.indexOf(',') + 1)); };
    r.onerror = () => reject(new Error('could not read file'));
    r.readAsDataURL(f);
  });
}
async function doAttach(id, input) {
  const f = input && input.files && input.files[0]; if (!f) return;
  if (f.size > 12 * 1024 * 1024) { toast('file too large (max 12MB)', 'err'); return; }
  toast('uploading ' + f.name + '…', 'ok');
  let b64; try { b64 = await fileToB64(f); } catch (e) { toast(e.message, 'err'); return; }
  const caption = (($('cmt') && $('cmt').value) || '').trim();
  try {
    await action('attachFile', { id, name: f.name, dataB64: b64, caption });
    if ($('cmt')) $('cmt').value = '';
    toast('attached', 'ok'); await refreshTicket(id);
  } catch (e) { /* action() already toasted */ }
}
// Live Jarvis chat — posts John's message, then spawns a read-only headless-Claude Jarvis that reads
// the ticket + evidence + thread and replies as a 'jarvis' comment. Folds in the old "Go deeper".
async function askJarvis(id) {
  const ta = $('cmt'); const text = ((ta && ta.value) || '').trim();
  if (!text) { toast('write your question first', 'err'); return; }
  try {
    await action('addComment', { id, author: 'john', text });
    if (ta) ta.value = '';
    await action('jarvisChat', { id, confirm: true });
    toast('Jarvis is thinking…', 'ok');
    if ('Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (_) {} }
    J.ccjobs = J.ccjobs || {};
    J.ccjobs[id + '#jarvis-chat'] = { status: 'running', id, task: 'jarvis-chat', mode: 'gather', model: 'sonnet', started: Date.now() };
    J.dspWatch = id;
    await load();
    if ((location.hash || '').includes('/ticket/' + id)) viewTicket(id);
    dspStartPoll(id); dspRenderTopbar(); dspRenderTicketBanner(id); dspEnsureBannerTimer();
  } catch (e) { /* action() already toasted */ }
}
// Fold an open question into a Jarvis conversation — posts it + Jarvis works it in-thread, which
// then informs next steps (deeper dig / a different action). Per John's open-questions ask.
async function askQuestionJarvis(id, idx) {
  const q = ((J._questions || {})[id] || [])[idx]; if (!q) { toast('question not found', 'err'); return; }
  try {
    await action('addComment', { id, author: 'john', text: 'Open question for Jarvis — work this and tell me the next step: ' + q });
    await action('jarvisChat', { id, confirm: true });
    toast('Jarvis is working that question…', 'ok');
    if ('Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (_) {} }
    J.ccjobs = J.ccjobs || {}; J.ccjobs[id + '#jarvis-chat'] = { status: 'running', id, task: 'jarvis-chat', mode: 'gather', model: 'sonnet', started: Date.now() };
    J.dspWatch = id;
    await load(); if ((location.hash || '').includes('/ticket/' + id)) viewTicket(id);
    dspStartPoll(id); dspRenderTopbar(); dspRenderTicketBanner(id); dspEnsureBannerTimer();
  } catch (e) { /* action() already toasted */ }
}
// (b) THE READINESS GATE — clicking Align on a not-ready ticket shows the contract (what's missing +
// the force-align path) instead of the decision modal. Ready → straight to the decision. The server
// enforces the same contract in alignHandoff, so the gate can't be bypassed by a stale client.
function align(id) {
  const r = ticketReady(get(id));
  if (!r.ready) { readinessLegend(id); return; }
  alignModal(id, false);
}
function forceAlign(id) { alignModal(id, true); }   // authoritative sign-off past the gate (logged)
function alignModal(id, force) {
  modal(`<h2>&#10003; Aligned — hand to CC</h2>
    ${force ? '<p class="rdy-warn">&#9888; Signing off past the readiness gate — this override is logged on the ticket.</p>' : ''}
    <p>This is the gate. Jarvis collates the rich finding + your whole thread + this decision + links + age into one package and hands it to CC. State → <b>Aligned</b>.</p>
    <div class="label" style="margin-top:8px">Your alignment decision</div>
    <textarea id="alignDec" placeholder="e.g. Agreed — fix as proposed. Or: change it — do X instead because…">Agreed with the proposed fix.</textarea>
    <input type="hidden" id="alignForce" value="${force ? '1' : ''}">
    <div class="btns"><button class="btn green" onclick="doAlign('${id}')">Confirm — collate &amp; hand to CC</button><button class="btn" onclick="closeModal()">Cancel</button></div>`);
}
async function doAlign(id) {
  const decision = ($('alignDec').value || '').trim();
  const force = !!($('alignForce') && $('alignForce').value === '1');
  try {
    await action('alignHandoff', { id, decision, force });
    // Auto-chain: dispatch the CC drone in safe PLAN mode (read+analyse, no file edits). Kills the
    // legacy copy-paste-the-kickoff workflow — Align now means "Aligned + drone investigating."
    let drone = null;
    try {
      drone = await action('dispatchCC', { id, confirm: true, mode: 'plan', model: 'sonnet', reasoning: 'off' });
      if (drone && drone.dispatched) { J.ccjobs = J.ccjobs || {}; J.ccjobs[drone.dispatched] = { status: 'running', id, task: 'cc', mode: 'plan', model: 'sonnet', started: Date.now() }; }
    } catch (_) { /* dispatch failed; show graceful fallback */ }
    closeModal();
    const droneOK = !!(drone && drone.dispatched);
    modal(`<h2>&check; Aligned${droneOK ? ' + CC drone deployed' : ''}</h2>
      <p>${esc(id)} is now <b>Aligned</b>. ${droneOK
        ? 'A CC drone is investigating in <b>plan mode</b> (read + analyse only — no file edits). It posts back to the ticket thread when done; the Flightdeck auto-updates.'
        : 'CC dispatch failed — re-dispatch from the ticket or the card&rsquo;s &ldquo;Hand to CC&rdquo; button.'}</p>
      <div class="btns">
        <button class="btn primary" onclick="closeModal();location.hash='#/ticket/${id}'">Open ticket</button>
        <button class="btn" onclick="viewHandoff('${id}')">View handoff package</button>
        <button class="btn" onclick="closeModal()">Done</button>
      </div>`);
    J.dspWatch = id;
    await load();
    if ((location.hash || '').includes('/ticket/' + id)) viewTicket(id);  // refresh the card behind the modal → status flips to Aligned live
    if (droneOK) { dspStartPoll(id); dspRenderTopbar(); dspEnsureBannerTimer(); }
  } catch (e) {}
}
/* ════════════════════ CONFIRM FROM WALK (earned ConfirmedLive) ═══════════════
 * The brief's defining promise: ConfirmedLive is EARNED from walk evidence, not a
 * typed label. This replaces the old window.prompt. It previews the latest walk for
 * the ticket's surface (via /api/walk-confirm — read-only), and only offers a confirm
 * button when a real, recent, passing walk exists. The button calls the allowlisted
 * confirmFromWalk({id}); the SERVER re-reads the walk and earns the transition — the
 * client passes NO evidence. ─────────────────────────────────────────────────────── */
async function confirmFromWalk(id) {
  const t = get(id);
  if (!t) { toast('ticket not found', 'err'); return; }
  const surface = t.surface || t.group || null;
  const niceS = niceSurface(surface);

  let r;
  try { r = await api('/api/walk-confirm?id=' + encodeURIComponent(id)); }
  catch (e) { toast('could not read walk status', 'err'); return; }
  if (r.error) { toast(r.error, 'err'); return; }

  const head = `<h2>Confirm ${esc(id)} live — from walk evidence</h2>
    <p>ConfirmedLive is <b>earned</b>, never typed. Jarvis checks the latest Walk Drone
       run for the <b>${esc(niceS)}</b> surface — only a real, recent, <b>passing</b> walk
       can confirm this ticket live.</p>`;

  // ── NOT eligible — explain why + offer the Walk Drone shortcut, no confirm button. ──
  if (!r.eligible) {
    const why =
      !r.scope                 ? `<b>${esc(niceS)}</b> isn't a walkable surface yet — there's no walk flow that exercises it, so ConfirmedLive can't be earned from a walk here.`
      : !r.canEdge             ? `This ticket is <b>${esc(STATUS_LABEL[r.status] || r.status)}</b>. ConfirmedLive can only be earned from <b>Investigating</b> or <b>Shipped</b> — dispatch/investigate it first.`
      : r.walkDir == null      ? `<b>No walk yet</b> for ${esc(niceS)}. Deploy the Walk Drone for <b>${esc(niceS)}</b> first, then come back and confirm.`
      : !r.anyPresent          ? `The latest walk (<code>${esc(r.walkDir)}</code>) didn't cover ${esc(niceS)}. Run the Walk Drone scoped to <b>${esc(niceS)}</b>.`
      : !r.fresh               ? `The latest ${esc(niceS)} walk is <b>${esc(String(r.ageDays))} days old</b> — too stale to vouch for current code. Re-run the Walk Drone.`
      : !r.anyPassing          ? `The latest ${esc(niceS)} walk has <b>failing step(s)</b>. Fix the issue and re-walk before confirming live.`
      : 'Not eligible yet.';
    modal(`${head}
      <div class="cw-empty">
        <div class="cw-empty-ic" aria-hidden="true">◎</div>
        <div class="cw-empty-msg">${why}</div>
      </div>
      ${renderWalkVerdicts(r.flows)}
      <div class="btns">
        ${r.scope && r.canEdge ? `<button class="btn primary" onclick="goWalkDrone('${esc(surface || '')}')"><span aria-hidden="true">◎</span> Deploy the Walk Drone</button>` : ''}
        <button class="btn" onclick="closeModal()">Close</button>
      </div>`);
    return;
  }

  // ── Eligible — show the passing walk as proof + the confirm button. ──
  modal(`${head}
    <div class="cw-proof">
      <div class="cw-proof-h"><span class="cw-tick" aria-hidden="true">✓</span> Passing walk found</div>
      <div class="cw-kv"><span class="k">Walk</span><span class="v"><code>${esc(r.walkDir)}</code></span></div>
      <div class="cw-kv"><span class="k">Walked</span><span class="v">${when(r.walkedAt)} · ${esc(String(r.ageDays))} day(s) ago</span></div>
      <div class="cw-kv"><span class="k">Scope</span><span class="v">${esc(niceS)}</span></div>
    </div>
    ${renderWalkVerdicts(r.flows)}
    <p class="cw-note">Confirming records this walk (id, timestamp, scope, step results) as the proof on the ticket — walk-attested, not a label.</p>
    <div class="btns">
      <button class="btn green" onclick="doConfirmWalk('${esc(id)}')"><span aria-hidden="true">&#10003;</span> Confirm From Walk</button>
      <button class="btn" onclick="closeModal()">Cancel</button>
    </div>`);
}

// Render the per-flow walk verdicts (proof detail — clean vs errored steps).
function renderWalkVerdicts(flows) {
  if (!flows || !flows.length) return '';
  return `<div class="cw-flows">${flows.map(v => {
    if (!v.found) return `<div class="cw-flow miss"><span class="cw-flow-dot">○</span> <b>${esc(v.flow)}</b> — not in the latest walk</div>`;
    const bad = (v.steps || []).filter(s => s.error);
    const cls = v.passing ? 'pass' : 'fail';
    const dot = v.passing ? '●' : '✕';
    const tail = v.passing
      ? `<span class="cw-flow-tail">${(v.steps || []).length} step(s), all clean</span>`
      : `<span class="cw-flow-tail err">${bad.length} failing step(s)</span>`;
    return `<div class="cw-flow ${cls}"><span class="cw-flow-dot">${dot}</span> <b>${esc(v.flow)}</b>${v.title ? ` — ${esc(v.title)}` : ''} ${tail}</div>`;
  }).join('')}</div>`;
}

// Deploy the Walk Drone for this surface, then route to the Command deck for the live log.
// Runs directly when the surface is a known walkable group; otherwise sends you to the deck to pick one.
async function goWalkDrone(surface) {
  closeModal();
  const walkable = (typeof CMD_WALK_GROUPS !== 'undefined') && CMD_WALK_GROUPS.some(([v]) => v && v === surface);
  if (!walkable) { location.hash = '#/command'; toast('Pick a walkable surface on the Command deck', 'ok'); return; }
  try {
    const r = await action('runWalk', { group: surface });
    if (r && r.started) {
      J.walk = Object.assign({}, J.walk, { deploying: true, scope: surface, startedAt: Date.now() });
      toast(`Walk Drone deployed · ${niceSurface(surface)}`, 'ok');
      startWalkStatusPoll();
      location.hash = '#/command';   // the live fleet lives in the Command Centre (renders in place — no flash)
    } else { toast((r && r.reason) || 'walk not started', 'err'); }
  } catch (e) { /* action() already toasted */ }
}
// The Walk Drone is NOT a ccJob (separate walkChild/walklog mechanism), so it won't appear in the
// ccjobs poll. This global poll keeps J.walk fresh from /api/walklog and re-renders the fleet/topbar
// so the walk shows up as a running drone like the others. Self-stops when the walk finishes.
let walkStatusPoll = null;
function startWalkStatusPoll() {
  if (walkStatusPoll) return;
  walkStatusPoll = setInterval(async () => {
    let j; try { j = await api('/api/walklog'); } catch (_) { return; }
    const lines = j.lines || [];
    const last = [...lines].reverse().find(l => !l.startsWith('@@WALK_EXIT')) || '';
    J.walk = Object.assign({}, J.walk, { deploying: !!j.running, lineCount: lines.length, lastLine: last });
    dspRenderTopbar();
    if ((location.hash || '').slice(1).split('?')[0].split('/')[1] === 'agents-fleet') viewAgentsFleet();
    if (!j.running) {
      clearInterval(walkStatusPoll); walkStatusPoll = null;
      // Report the OUTCOME — a walk on a surface with no specs exits in seconds with "(none)" and
      // otherwise says nothing, which looks like a silent failure. Make it explicit.
      const flows = lines.filter(l => l.startsWith('@@FLOW_DONE')).length;
      const noFlows = flows === 0 || lines.some(l => /→\s*\(none\)/.test(l));
      if (noFlows) toast(`Walk finished — no walk flows exist for ${niceSurface(J.walk.scope || 'all')} yet (nothing to walk)`, 'err');
      else toast(`Walk complete — ${flows} flow${flows === 1 ? '' : 's'} walked · captures in tests/walker-out`, 'ok');
      J.walk = Object.assign({}, J.walk, { deploying: false, done: true, flows });
      if ((location.hash || '').slice(1).split('?')[0].split('/')[1] === 'agents-fleet') viewAgentsFleet();
    }
  }, 1000);
}

// The earn — call confirmFromWalk({id}). NO evidence param. On success: toast + refresh
// the ticket (the server has posted the proof comment + flipped the status).
async function doConfirmWalk(id) {
  try {
    const r = await action('confirmFromWalk', { id });   // server reads the walk; no free text sent
    closeModal();
    toast(`${id} → Confirmed live (walk ${r.walkDir})`, 'ok');
  } catch (e) { /* action() already toasted the server's reason (no/stale/failing walk) */ return; }
  await load();
  route();            // re-render board / ticket detail with the new status + proof comment
}

async function viewHandoff(id) {
  const r = await api('/api/handoff?id=' + id);
  modal(`<h2>Handoff package — ${id}</h2><p>The rich collated payload CC investigates from (vs the summary you read):</p>
    <pre>${esc(r.content || r.error || '(not generated — align first)')}</pre>
    <div class="btns"><button class="btn" onclick="closeModal()">Close</button></div>`);
}

/* ════════════════════════ DISPATCH TO CC (the real drone) ═══════════════════
 * Closes the manual copy-paste loop. The confirm modal explains exactly what this
 * does — spawns a REAL headless Claude Code drone (costs tokens, capped $1.50 /
 * 40 turns, NEVER pushes) — and offers the SAFE default (Investigate, plan-mode,
 * read-only) vs the opt-in Fix-on-branch (acceptEdits). Dispatch needs an explicit
 * typed confirm. On success we toast + poll /api/ccjobs (same shape/cadence as the
 * walklog poll); when this ticket's job flips to done/failed we reload + re-render
 * the ticket so the drone's posted comment shows in the thread.
 * ──────────────────────────────────────────────────────────────────────────── */
let dspMode = 'plan';          // module-scope toggle for the confirm modal
let dspModel = 'sonnet';       // model select  — sonnet (default) | opus
let dspReasoning = 'off';      // reasoning ctrl — off (default) | think | deep
let dspPoll = null;            // single active /api/ccjobs poller

function dispatchToCC(id) {
  const t = get(id);
  if (!t) { toast('ticket not found', 'err'); return; }
  dspMode = 'plan';            // always reset to the SAFE defaults on open
  dspModel = 'sonnet';
  dspReasoning = 'off';
  modal(`<h2>Dispatch ${esc(id)} to CC</h2>
    <p>This spawns a <b>real headless Claude Code drone</b> on this ticket's handoff package — it
       runs Claude Code on your machine, costs tokens, and <b>never runs git push or deploys</b>.
       Its result posts straight back into the ticket thread when it finishes.</p>
    <div class="dsp-modes" role="radiogroup" aria-label="Dispatch mode">
      <button type="button" class="dsp-mode on" id="dspModePlan" role="radio" aria-checked="true"
        onclick="dspSetMode('plan')">
        <span class="dsp-mode-h"><span class="dsp-mode-tick" aria-hidden="true">●</span> Investigate <span class="dsp-mode-tag dsp-tag-safe">Safe · default</span></span>
        <span class="dsp-mode-b">Read + analyse only. Proposes the precise fix with file:line + evidence. <b>Edits nothing.</b> (plan mode)</span>
      </button>
      <button type="button" class="dsp-mode" id="dspModeFix" role="radio" aria-checked="false"
        onclick="dspSetMode('fix')">
        <span class="dsp-mode-h"><span class="dsp-mode-tick" aria-hidden="true">○</span> Fix on branch <span class="dsp-mode-tag dsp-tag-write">Edits files</span></span>
        <span class="dsp-mode-b">Investigates AND implements the fix on the current branch (acceptEdits). Still <b>never pushes</b>; review the diff before you deploy.</span>
      </button>
    </div>

    <div class="dsp-tunes">
      <div class="dsp-tune">
        <label class="dsp-tune-lbl" for="dspModelSel">Model</label>
        <div class="dsp-selwrap">
          <select id="dspModelSel" class="dsp-sel" aria-label="Model" onchange="dspSetModel(this.value)">
            <option value="sonnet" selected>Sonnet — fast &amp; cheap</option>
            <option value="opus">Opus — deeper, costs more</option>
          </select>
        </div>
      </div>
      <div class="dsp-tune">
        <label class="dsp-tune-lbl" for="dspReasonSel">Reasoning</label>
        <div class="dsp-selwrap">
          <select id="dspReasonSel" class="dsp-sel" aria-label="Reasoning" onchange="dspSetReasoning(this.value)">
            <option value="off" selected>Off — answer directly</option>
            <option value="think">Think — step by step</option>
            <option value="deep">Deep think — reason hard</option>
          </select>
        </div>
      </div>
    </div>

    <div class="dsp-cost" id="dspCost"></div>

    <div class="dsp-confirm">
      <div class="dsp-confirm-label">Type <code>dispatch</code> to confirm</div>
      <input id="dspConfirm" placeholder="dispatch" autocomplete="off"
        oninput="document.getElementById('dspGo').disabled = (this.value.trim().toLowerCase() !== 'dispatch')">
    </div>
    <div class="btns">
      <button class="btn primary" id="dspGo" disabled onclick="doDispatch('${id}')">
        <span aria-hidden="true">▶</span> Dispatch Drone
      </button>
      <button class="btn" onclick="closeModal()">Cancel</button>
    </div>`);
  dspRenderCost();             // paint the initial cost note (sonnet · off → $1.50 cap)
  setTimeout(() => { const el = $('dspConfirm'); if (el) el.focus(); }, 30);
}

// Mode toggle for the confirm modal (radio-style; updates the typed-confirm-independent state).
function dspSetMode(mode) {
  dspMode = mode === 'fix' ? 'fix' : 'plan';
  const plan = $('dspModePlan'), fix = $('dspModeFix');
  if (plan) { plan.classList.toggle('on', dspMode === 'plan'); plan.setAttribute('aria-checked', dspMode === 'plan'); plan.querySelector('.dsp-mode-tick').textContent = dspMode === 'plan' ? '●' : '○'; }
  if (fix)  { fix.classList.toggle('on', dspMode === 'fix');   fix.setAttribute('aria-checked', dspMode === 'fix');   fix.querySelector('.dsp-mode-tick').textContent = dspMode === 'fix' ? '●' : '○'; }
  dspRenderCost();
}

// Model + Reasoning selects — validated client-side too (server re-validates, this is just UX).
function dspSetModel(v)     { dspModel = v === 'opus' ? 'opus' : 'sonnet'; dspRenderCost(); }
function dspSetReasoning(v) { dspReasoning = ['off', 'think', 'deep'].includes(v) ? v : 'off'; dspRenderCost(); }

// Live cost note — mirrors the server's budget rule (opus → $3, sonnet → $1.50; reasoning raises
// token use within the same hard cap). Always shows the budget that WILL apply.
function dspRenderCost() {
  const host = $('dspCost'); if (!host) return;
  const modelLbl = dspModel === 'opus' ? 'Opus' : 'Sonnet';
  const rsnLbl = dspReasoning === 'deep' ? 'deep thinking' : dspReasoning === 'think' ? 'step-by-step thinking' : 'no extra thinking';
  // No $ cap here on purpose — spend rides your plan, and showing a cap just discourages dispatch.
  // Usage awareness lives in the topbar meter. Keep only the safety reassurance.
  host.className = 'dsp-cost';
  host.innerHTML =
    `<span class="dsp-cost-ic" aria-hidden="true">▶</span>` +
    `<span><b>${modelLbl}</b> · ${esc(rsnLbl)} — runs on your plan; <b>never pushes or deploys</b>.</span>`;
}

async function doDispatch(id) {
  const el = $('dspConfirm');
  if (!el || el.value.trim().toLowerCase() !== 'dispatch') { toast('type “dispatch” to confirm', 'err'); return; }
  const mode = dspMode, model = dspModel, reasoning = dspReasoning;
  try {
    const r = await action('dispatchCC', { id, confirm: true, mode, model, reasoning });
    closeModal();
    const rsnTag = reasoning === 'deep' ? ' · deep think' : reasoning === 'think' ? ' · think' : '';
    toast(`CC drone dispatched on ${id} — ${mode === 'fix' ? 'Fix' : 'Investigate'} · ${model === 'opus' ? 'Opus' : 'Sonnet'}${rsnTag}`, 'ok');
    // ask for desktop-notification permission on this click (a user gesture); harmless if already set
    if ('Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (_) {} }
    // optimistically seed the job so the live banner shows instantly (the poll corrects it in ~1.5s)
    J.ccjobs = J.ccjobs || {};
    J.ccjobs[id] = { status: 'running', id, mode, model, reasoning, started: Date.now() };
    await load();
    if ((location.hash || '').includes('/ticket/' + id)) viewTicket(id);   // status flips to Investigating live
    dspStartPoll(id);          // watch THIS ticket's job; reload+re-render on done/failed
    dspRenderTopbar();         // light up the Agents-Running indicator immediately
    dspRenderTicketBanner(id); // and the in-ticket "drone out" strip
    dspEnsureBannerTimer();    // start the elapsed clock
  } catch (e) { /* action() already toasted the rejection */ }
}

// Poll /api/ccjobs (same cadence as the walklog poll). Drives BOTH the topbar indicator and the
// per-ticket reload. `watchId` (optional) is the ticket whose completion should reload the detail.
function dspStartPoll(watchId) {
  if (watchId) J.dspWatch = watchId;
  if (dspPoll) return;         // single shared poller
  let lastWatchRunning = 0;    // running-drone count on the watched ticket last tick
  let lastSig = '';            // signature of the job/sweep set — re-render live views when it changes
  dspPoll = setInterval(async () => {
    let resp; try { resp = await api('/api/ccjobs'); } catch (_) { return; }
    const jobs = (resp && resp.jobs) || {};
    J.ccjobs = jobs;
    J.ccspend = (resp && resp.spend) || J.ccspend || null;   // cache running total for the meter
    J.sweeps = (resp && resp.sweeps) || J.sweeps || {};      // cache sweep progress
    dspRenderTopbar();
    dspRenderTicketBanner(currentTicketId());                // keep the in-ticket banner live

    // Job/sweep set changed (a drone started/finished, or the sweep advanced) → refresh data and
    // re-render whichever live view is showing, so case-file slots fill in slot-by-slot.
    const sig = Object.entries(jobs).map(([k, v]) => k + ':' + v.status).sort().join('|') + '#' + JSON.stringify(J.sweeps);
    if (sig !== lastSig) {
      lastSig = sig;
      await load();
      renderNowBar();
      const cur = currentTicketId();
      const rt = (location.hash || '').slice(1).split('?')[0].split('/')[1];
      if (cur) viewTicket(cur);
      else if (rt === 'agents-fleet') viewAgentsFleet();
      else if (rt === 'architecture') viewArchitecture();
      else if (rt === 'briefing') { if (J._chat) loadBriefingChat(); else renderBriefing(); }   // chat reloads its thread; legacy briefing does an in-place body update
      else if (rt === 'command') renderCCFleet();   // fleet-only update — no full re-render, no flash
      else if (rt === 'board') viewBoard();            // live build-case state on the rows
      else if (rt === 'overview' || !rt) viewFlightdeck();   // Flightdeck auto-refresh: drone lands → card flips state without F5
      else if (rt === 'dedupe') viewDedupe();          // dedupe view live-updates as merges/auto-logs change the backlog
      else if (rt === 'epic' && (location.hash.split('/')[2])) viewEpic(location.hash.split('/')[2].split('?')[0]);
    }

    // Watch a TICKET: when its last running drone finishes AND no sweep is mid-flight, toast + notify.
    const w = J.dspWatch;
    const wRunning = w ? Object.values(jobs).filter(v => v.id === w && v.status === 'running').length : 0;
    const wSweeping = w && (J.sweeps || {})[w] && J.sweeps[w].status === 'running';
    if (w && wRunning === 0 && lastWatchRunning > 0 && !wSweeping) {
      toast(`CC drones on ${w} finished — results posted`, 'ok');
      dspNotify(`CC drones on ${w} finished`, 'Evidence posted to the ticket.');
      J.dspWatch = null;
    }
    lastWatchRunning = wRunning;

    // Keep polling while anything runs OR a sweep is mid-flight (drones launch between ticks).
    const anyRunning = Object.values(jobs || {}).some(v => v.status === 'running');
    const sweepRunning = Object.values(J.sweeps || {}).some(s => s.status === 'running');
    if (!anyRunning && !J.dspWatch && !sweepRunning) { clearInterval(dspPoll); dspPoll = null; }
  }, 1500);
}

// Paint the topbar "Agents Running" indicator from J.ccjobs (cached by the poll). Shows a pulsing
// count + one clickable chip per running drone (→ its ticket). Empty when nothing is running, so
// it costs zero visual weight at rest. Reuses the .sys-* / .cmd-live-dot language.
function dspRenderTopbar() {
  const host = $('dspAgents'); if (!host) return;
  const jobs = J.ccjobs || {};
  const running = Object.entries(jobs).filter(([, v]) => v.status === 'running');

  // Usage meter (replaces the old $-spend chip) — estimated spend this month vs a tunable
  // budget, green→amber→red. Persists at rest so usage is always glanceable.
  const meter = dspUsageMeter(J.ccspend);
  const walkRunning = !!(J.walk && J.walk.deploying);
  const count = running.length + (walkRunning ? 1 : 0);

  if (!count) { host.innerHTML = meter; return; }

  // Count only (no per-drone chips — they spread across the topbar). Click → the Fleet page.
  host.innerHTML =
    `<span class="sys-sep"></span>` +
    `<button type="button" class="dsp-agents-wrap" title="${count} drone${count === 1 ? '' : 's'} running — open the Command Centre" onclick="location.hash='#/command'">
       <span class="dsp-live-dot" aria-hidden="true"></span>
       <b class="dsp-agents-n">${count}</b>
       <span class="dsp-agents-l">Agent${count === 1 ? '' : 's'} Running</span>
     </button>` +
    meter;
}
// The topbar usage gauge + its detail modal. Estimated $ (API list prices) this month vs a tunable
// budget anchor — a rough awareness gauge, NOT a read of the real Anthropic plan quota.
function dspUsageMeter(sp) {
  if (!sp || (sp.month_usd == null && sp.total_usd == null)) return '';
  const month = +sp.month_usd || 0, today = +sp.today_usd || 0, budget = +sp.monthBudget || 600;
  const pct = budget > 0 ? Math.max(0, Math.min(100, (month / budget) * 100)) : 0;
  const tone = pct >= 85 ? 'red' : pct >= 60 ? 'amber' : 'green';
  return `<span class="sys-sep"></span>` +
    `<button type="button" class="usage-meter usage-${tone}" onclick="usageDetail()"
       title="Estimated Claude usage this month — a rough gauge, not your real plan quota. Today ~$${today.toFixed(2)} · Month ~$${month.toFixed(2)} of ~$${budget}.">` +
      `<span class="usage-bar"><span class="usage-fill" style="width:${pct.toFixed(0)}%"></span></span>` +
      `<span class="usage-lbl">~$${month.toFixed(0)}<span class="usage-sub">est./mo</span></span>` +
    `</button>`;
}
function usageDetail() {
  const sp = J.ccspend || {};
  const month = +sp.month_usd || 0, today = +sp.today_usd || 0, total = +sp.total_usd || 0;
  const budget = +sp.monthBudget || 600, dayB = +sp.dayBudget || 60, runs = +sp.count || 0;
  modal(`<h2>Claude usage — estimate</h2>
    <p>A rough awareness gauge of CC-drone usage, valued at API list prices. <b>This is an estimate, not your real plan quota</b> — there's no local way to read your actual Anthropic limit, so the bands sit against a budget you can tune (you're on Max 20x, so there's plenty of headroom).</p>
    <div class="kv"><span class="k">Today</span><span class="v">~$${today.toFixed(2)} <span style="color:var(--muted)">of ~$${dayB}</span></span></div>
    <div class="kv"><span class="k">This month</span><span class="v">~$${month.toFixed(2)} <span style="color:var(--muted)">of ~$${budget}</span></span></div>
    <div class="kv"><span class="k">Lifetime</span><span class="v">~$${total.toFixed(2)} · ${runs} run${runs === 1 ? '' : 's'}</span></div>
    <p style="color:var(--muted);font-size:13px;margin-top:12px">Tune the bands in <code>server.js</code> (<code>MONTH_BUDGET_USD</code> / <code>DAY_BUDGET_USD</code>).</p>
    <div class="btns"><button class="btn" onclick="closeModal()">Close</button></div>`);
}

// Live "drone out" banner on the ticket detail — paints from J.ccjobs (kept fresh by the poll).
// Shows an elapsed clock + mode/model/turns while a drone runs on THIS ticket; clears when it's
// done (the posted result comment is the durable record). No-op when nothing is running here.
const TASK_LABEL = { 'root-cause': 'Root-cause dig', 'locate-surface': 'Locate surface', 'fix-proposal': 'Fix proposal', 'conformance': 'Conformance', 'auditor': 'Auditor', 'intent': 'Intent', 'design': 'Design', 'acceptance': 'Acceptance', 'breakdown': 'Breakdown', 'resolution': 'Resolution', 'code-audit': 'Code audit', 'execute-fix': 'Execute fix', 'sandbox': 'Sandbox confirm', 'verify': 'Pre-ship gate', 'fixshot': 'Screen capture', 'ux': 'UX review', 'jarvis-chat': 'Jarvis', 'system-audit': 'System audit', 'organize': 'Jarvis organize', 'triage': 'Triage' };
// Where a drone's chip/row links — real tickets go to the ticket; the SYSTEM auditor goes to Architecture.
const agentHref = id => (String(id || '').startsWith('SLY-') ? '#/ticket/' + id : '#/architecture');
function dspRenderTicketBanner(id) {
  const host = $('dspTicketBanner'); if (!host) return;
  if (!id) { host.innerHTML = ''; return; }
  // ALL running drones on this ticket (a "Build the case" sweep runs several at once, keyed id#task)
  const mine = Object.values(J.ccjobs || {}).filter(v => v.id === id && v.status === 'running');
  if (!mine.length) { host.innerHTML = ''; return; }
  const rows = mine.map(j => {
    const ms = j.started ? Date.now() - j.started : 0;
    const clock = Math.floor(ms / 60000) + ':' + String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
    const what = j.task ? (TASK_LABEL[j.task] || j.task) : (j.mode === 'fix' ? 'Fix on branch' : 'Investigate');
    const model = j.model === 'opus' ? 'Opus' : 'Sonnet';
    const turns = j.turns != null ? ' · ' + j.turns + ' turns' : '';
    return `<span class="dsp-banner-job"><span class="dsp-banner-jobname">${esc(what)}</span> <span class="dsp-banner-jobmeta">${model}${turns} · <span class="dsp-banner-clock">${clock}</span></span></span>`;
  }).join('');
  host.innerHTML =
    `<div class="dsp-banner">
       <span class="dsp-banner-dot" aria-hidden="true"></span>
       <span class="dsp-banner-main"><b>${mine.length} drone${mine.length === 1 ? '' : 's'} out</b> on ${esc(id)}</span>
       <span class="dsp-banner-jobs">${rows}</span>
       <span class="dsp-banner-cap">never pushes or deploys</span>
     </div>`;
}
let dspBannerTimer = null;
// Tick the banner clock once a second while any drone runs; self-stops when none remain.
function dspEnsureBannerTimer() {
  if (dspBannerTimer) return;
  dspBannerTimer = setInterval(() => {
    const id = currentTicketId();
    const rt2 = (location.hash || '').slice(1).split('?')[0].split('/')[1];
    if (id) dspRenderTicketBanner(id);
    else if (rt2 === 'agents-fleet') viewAgentsFleet();   // tick the fleet clocks
    else if (rt2 === 'command') renderCCFleet();          // fleet-only update — no full re-render, no flash
    if (!Object.values(J.ccjobs || {}).some(v => v.status === 'running')) { clearInterval(dspBannerTimer); dspBannerTimer = null; }
  }, 1000);
}
// Desktop notification when a drone finishes — fires even if you're on another tab or app.
function dspNotify(title, body) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const n = new Notification(title, { body, tag: 'mc-drone', renotify: true });
      n.onclick = () => { window.focus(); n.close(); };
    }
  } catch (_) {}
}

// On boot, do one /api/ccjobs read so a drone started in a previous page-load still shows in the
// topbar, and resume polling if any are still running. Cheap, read-only, fire-and-forget.
async function dspBootPoll() {
  let resp; try { resp = await api('/api/ccjobs'); } catch (_) { return; }
  const jobs = (resp && resp.jobs) || {};
  J.ccjobs = jobs;
  J.ccspend = (resp && resp.spend) || null;
  dspRenderTopbar();
  dspRenderTicketBanner(currentTicketId());
  if (Object.values(jobs).some(v => v.status === 'running')) { dspStartPoll(); dspEnsureBannerTimer(); }
}

function newTicket() {
  const surfaces = [
    ['dashboard', 'Dashboard'], ['bills', 'Bills'], ['savings', 'Savings'],
    ['plan', 'Plan'], ['analysis', 'Analysis'], ['debts', 'Debts'],
    ['ai', 'AI'], ['settings', 'Settings'], ['nav', 'Navigation'],
    ['planning', 'Planning'], ['other', 'Other'],
  ];
  modal(`<h2>New ticket</h2>
    <p>Open a ticket for John to triage. Bugs, features, or tasks — it lands on the board as Open.</p>
    <form class="nt-form" onsubmit="return false">
      <div class="nt-row">
        <div class="nt-field">
          <label for="ntType">Type</label>
          <div class="nt-select">
            <select id="ntType">
              <option value="bug">Bug</option>
              <option value="feature">Feature</option>
              <option value="task" selected>Task</option>
            </select>
          </div>
        </div>
        <div class="nt-field">
          <label for="ntSev">Severity</label>
          <div class="nt-select">
            <select id="ntSev">
              <option value="P0">P0 · Critical</option>
              <option value="P1">P1</option>
              <option value="P2" selected>P2</option>
            </select>
          </div>
        </div>
        <div class="nt-field">
          <label for="ntSurface">Surface</label>
          <div class="nt-select">
            <select id="ntSurface">
              ${surfaces.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
      <div class="nt-field">
        <label for="ntTitle">Title</label>
        <input id="ntTitle" placeholder="Short, specific — what the ticket is about" autocomplete="off">
      </div>
      <div class="nt-field">
        <label for="ntSummary">Summary</label>
        <textarea id="ntSummary" placeholder="What it is, in plain terms — what should happen, what happens now"></textarea>
      </div>
    </form>
    <div class="btns"><button class="btn primary" onclick="doCreate()">Create ticket</button><button class="btn" onclick="closeModal()">Cancel</button></div>`);
  setTimeout(() => { const el = document.getElementById('ntTitle'); if (el) el.focus(); }, 30);
}
async function doCreate() {
  const title = ($('ntTitle').value || '').trim();
  if (!title) { toast('title required', 'err'); document.getElementById('ntTitle').focus(); return; }
  try {
    const r = await action('createTicket', {
      title,
      summary: ($('ntSummary').value || '').trim(),
      surface: $('ntSurface').value,
      severity: $('ntSev').value,
      type: $('ntType').value,
    });
    closeModal();
    toast('created ' + r.id, 'ok');
    await load();
    location.hash = '#/ticket/' + r.id;
  } catch (e) {}
}
function askDelete(id) {
  const t = get(id);
  const title = t ? t.title : id;
  modal(`<h2>Delete ${esc(id)}?</h2>
    <p>This permanently removes <b>${esc(id)} — ${esc(title)}</b> from the board, its thread, and any
    handoff state. This can't be undone.</p>
    <div class="confirm-danger">
      <div class="cd-label">Type <code>${esc(id)}</code> to confirm</div>
      <input id="delConfirm" placeholder="${esc(id)}" autocomplete="off"
        oninput="document.getElementById('delGo').disabled = (this.value.trim() !== '${esc(id)}')">
    </div>
    <div class="btns">
      <button class="btn danger" id="delGo" disabled onclick="doDelete('${id}')">Delete ticket</button>
      <button class="btn" onclick="closeModal()">Cancel</button>
    </div>`);
  setTimeout(() => { const el = document.getElementById('delConfirm'); if (el) el.focus(); }, 30);
}
async function doDelete(id) {
  const el = document.getElementById('delConfirm');
  if (!el || el.value.trim() !== id) { toast('type the ticket id to confirm', 'err'); return; }
  try {
    await action('deleteTicket', { id });
    closeModal();
    toast('deleted ' + id, 'ok');
    await load();
    location.hash = '#/board';
  } catch (e) {}
}

/* ════════════════════════ AUTO-TICKETING ════════════════════════════════════
 * One confirmed press mints one ticket per UNTRACKED App-Map gap (server de-dupes
 * via auto-tickets.json, so re-running is safe). Confirm modal → action('autoTicket',
 * {confirm:true}) → toast → reload + go to the Board so John sees the new tickets. */
function autoTicketGaps() {
  const n = countUntrackedGaps();
  if (!n) { toast('No untracked gaps — every gap is already on a ticket', 'ok'); return; }
  modal(`<h2>Auto-Ticket Untracked Gaps</h2>
    <p>Create <b>${n}</b> ticket${n === 1 ? '' : 's'} from untracked App-Map gaps?
       They’ll appear on the Board as type <b>Bug</b> (kind: Auto), opened and waiting on your
       judgment. Already-tracked gaps and ones ticketed on a previous run are skipped.</p>
    <div class="btns">
      <button class="btn primary" onclick="doAutoTicket()">Create ${n} ticket${n === 1 ? '' : 's'}</button>
      <button class="btn" onclick="closeModal()">Cancel</button>
    </div>`);
}
async function doAutoTicket() {
  try {
    const r = await action('autoTicket', { confirm: true });
    closeModal();
    const made = r.created || 0;
    toast(made ? `Created ${made} ticket${made === 1 ? '' : 's'}`
               : (r.skipped ? `All ${r.skipped} gaps already ticketed` : 'No untracked gaps'),
          'ok');
    await load();                 // re-pull the board truth (new tickets now in J.tickets)
    await loadAutoTickets();      // refresh the minted-gapKey set so the badge reads true
    location.hash = '#/board';    // navigate so John sees them
  } catch (e) { /* action() already toasted the rejection */ }
}

/* ════════════════════════ APP MAP (Phase 1 — IS vs SHOULD) ════════════ */
/* ════════════════════════ APP-MAP RELATIONSHIP MODEL ════════════════════
 * The REAL slyght money graph (inferred from each surface's reads/writes in
 * flows.json). Three layers + a frame group:
 *   orchestrator → movers → hub → ledger, with AI reading the hub.
 * Node ids MUST match J.flows surface ids (dashboard, bills, savings, plan,
 * analysis, debts, ai, settings, nav) so click → '#/map/<id>' opens the
 * existing detail view and the gap counts line up.
 * ──────────────────────────────────────────────────────────────────────── */
const RELATIONSHIPS = {
  // layer 0 = orchestrators/readers (top) · 1 = money movers · 2 = hub · 3 = ledger
  // col is a hint within the layer (0..1), used to spread nodes horizontally.
  nodes: [
    { id: 'plan',      title: 'Payday Plan', sub: 'orchestrator',   layer: 0, col: 0.30, kind: 'flow'  },
    { id: 'ai',        title: 'AI Chat',     sub: 'reads state',    layer: 0, col: 0.80, kind: 'flow'  },

    { id: 'savings',   title: 'Savings',     sub: 'goals',          layer: 1, col: 0.12, kind: 'flow'  },
    { id: 'bills',     title: 'Bills',       sub: 'due & paid',     layer: 1, col: 0.36, kind: 'flow'  },
    { id: 'debts',     title: 'Debts',       sub: 'pay down',       layer: 1, col: 0.60, kind: 'flow'  },

    { id: 'dashboard', title: 'Cash',        sub: 'Dashboard · the hub', layer: 2, col: 0.36, kind: 'hub' },

    { id: 'analysis',  title: 'Analysis',    sub: 'the ledger',     layer: 3, col: 0.36, kind: 'flow' },

    // app frame — boot + config, off to the side, not in the money flow
    { id: 'nav',       title: 'Nav',         sub: 'boot · routing', layer: 0, col: 1.0, kind: 'frame' },
    { id: 'settings',  title: 'Settings',    sub: 'config',         layer: 1, col: 1.0, kind: 'frame' },
  ],
  // directed, labelled edges. flavor drives colour/dash:
  //   'allocate' (violet)  'cash' (green, money into the hub)
  //   'debit' (amber)      'read' (blue, dashed)   'frame' (grey, dashed)
  edges: [
    // Payday Plan is the orchestrator — explicit, labelled allocation edges
    { from: 'plan', to: 'savings', label: 'allocates to', flavor: 'allocate' },
    { from: 'plan', to: 'bills',   label: 'allocates to', flavor: 'allocate' },
    { from: 'plan', to: 'debts',   label: 'allocates to', flavor: 'allocate' },
    { from: 'plan', to: 'dashboard', label: 'debits cash', flavor: 'debit' },

    // the three movers push/pull money through the cash hub
    { from: 'savings', to: 'dashboard', label: 'moves cash', flavor: 'cash' },
    { from: 'bills',   to: 'dashboard', label: 'debits cash', flavor: 'cash' },
    { from: 'debts',   to: 'dashboard', label: 'debits cash', flavor: 'cash' },

    // Analysis reads the ledger (which aggregates every flow above)
    { from: 'analysis', to: 'dashboard', label: 'reads ledger', flavor: 'read' },

    // AI summarises live state — balance, surplus, the plan/goal intents
    { from: 'ai', to: 'dashboard', label: 'reads balance', flavor: 'read' },
    { from: 'ai', to: 'plan',      label: 'reads intents', flavor: 'read' },

    // app frame — boot/config wrap the whole app, not the money flow
    { from: 'nav',      to: 'settings',  label: 'app frame', flavor: 'frame' },
    { from: 'settings', to: 'dashboard', label: 'configures', flavor: 'frame' },
  ],
};

/* ════════════════════════ APP MAP — relationship graph ════════════════════ */
/* ════════════════════════ FEATURE MAP — the constellation ════════════════════
 * A force-directed graph of how slyght fits together: surfaces are hubs, tickets orbit their
 * surface (colour = severity, dim = done), epics gather their stories. Cooling physics sim in
 * vanilla JS + SVG; pan / zoom / hover-highlight / click-through. Per John's reference image. */
const SVGNS = 'http://www.w3.org/2000/svg';
async function viewGraphMap() {
  if (!J.flows) J.flows = await api('/api/flows');
  const v = $('view'); v.className = 'view fmap';
  v.innerHTML = `
    <div class="cc-bg" aria-hidden="true"></div>
    <aside class="fmap-side">
      <div class="fmap-brand"><span class="fmap-brand-glow">FEATURE</span> MAP</div>
      <div class="fmap-sub">how slyght fits together — surfaces, tickets &amp; epics by relationship</div>
      <div class="fmap-side-h">Surfaces</div>
      <div class="fmap-surfaces" id="fmapSurfaces"></div>
      <div class="fmap-side-h">Legend</div>
      <div class="fmap-legend">
        <span class="fmap-lg"><i class="fmap-dot fdh-surface"></i> Surface</span>
        <span class="fmap-lg"><i class="fmap-dot fdh-epic"></i> Epic</span>
        <span class="fmap-lg"><i class="fmap-dot fdh-p0"></i> P0</span>
        <span class="fmap-lg"><i class="fmap-dot fdh-p1"></i> P1</span>
        <span class="fmap-lg"><i class="fmap-dot fdh-p2"></i> P2</span>
        <span class="fmap-lg"><i class="fmap-dot fdh-done"></i> Done</span>
        <span class="fmap-lg"><i class="fmap-dot fdh-live"></i> Drones in</span>
      </div>
    </aside>
    <div class="fmap-stage">
      <div class="fmap-controls">
        <button class="fmap-ctrl" onclick="fmapZoom(1.25)" title="Zoom in">+</button>
        <button class="fmap-ctrl" onclick="fmapZoom(0.8)" title="Zoom out">&minus;</button>
        <button class="fmap-ctrl" onclick="fmapReset()" title="Re-centre">reset</button>
      </div>
      <svg id="fmapSvg" class="fmap-svg" viewBox="0 0 1000 720" preserveAspectRatio="xMidYMid meet" role="img" aria-label="slyght feature map"><g id="fmapView"></g></svg>
      <div class="fmap-tip" id="fmapTip"></div>
    </div>`;
  fmapBuild();
}
function fmapBuild() {
  const ts = (J.tickets || []).filter(t => t.state.status !== 'Shipped');
  const surfaceIds = [...new Set([...(J.flows.surfaces || []).map(s => s.id), ...ts.map(t => t.group).filter(Boolean)])];
  const gapOf = id => { const s = (J.flows.surfaces || []).find(x => x.id === id); return s && s.counts ? s.counts.gaps : 0; };
  const nodes = [], idx = {};
  const add = n => { n.i = nodes.length; idx[n.key] = n.i; nodes.push(n); return n.i; };
  surfaceIds.forEach(id => add({ key: 's:' + id, type: 'surface', label: niceSurface(id), surface: id, gaps: gapOf(id), r: 16 }));
  ts.filter(t => t.type === 'epic').forEach(t => add({ key: 'e:' + t.id, type: 'epic', label: t.id, ref: t, r: 11 }));
  ts.filter(t => t.type !== 'epic').forEach(t => add({ key: 't:' + t.id, type: 'ticket', label: t.id, ref: t, sev: t.severity, done: ['ConfirmedLive'].includes(t.state.status), live: fdLive(t.id), r: t.severity === 'P0' ? 8 : t.severity === 'P1' ? 6.5 : 5.5 }));
  const edges = [];
  ts.filter(t => t.type !== 'epic').forEach(t => {
    if (t.group && idx['s:' + t.group] != null) edges.push({ s: idx['t:' + t.id], t: idx['s:' + t.group], k: 'surf' });
    if (t.epic && idx['e:' + t.epic] != null) edges.push({ s: idx['t:' + t.id], t: idx['e:' + t.epic], k: 'epic' });
  });
  // init positions: surfaces on an inner ring, others scattered around
  const W = 1000, H = 720, cx = W / 2, cy = H / 2;
  const surf = nodes.filter(n => n.type === 'surface');
  surf.forEach((n, k) => { const a = k / surf.length * Math.PI * 2; n.x = cx + Math.cos(a) * 180; n.y = cy + Math.sin(a) * 150; });
  nodes.forEach(n => { if (n.x == null) { const a = Math.random() * Math.PI * 2, rr = 120 + Math.random() * 260; n.x = cx + Math.cos(a) * rr; n.y = cy + Math.sin(a) * rr; } n.vx = 0; n.vy = 0; });

  const g = $('fmapView'); g.innerHTML = '';
  const eEls = edges.map(e => { const ln = document.createElementNS(SVGNS, 'line'); ln.setAttribute('class', 'fmap-edge fmap-edge-' + e.k); g.appendChild(ln); return ln; });
  const nEls = nodes.map(n => {
    const grp = document.createElementNS(SVGNS, 'g');
    grp.setAttribute('class', 'fmap-node fn-' + n.type + (n.type === 'ticket' ? ' fn-' + n.sev + (n.done ? ' fn-done' : '') + (n.live ? ' fn-live' : '') : (n.type === 'surface' && n.gaps >= 3 ? ' fn-hot' : '')));
    const c = document.createElementNS(SVGNS, 'circle'); c.setAttribute('r', n.r); grp.appendChild(c);
    if (n.type !== 'ticket') { const tx = document.createElementNS(SVGNS, 'text'); tx.setAttribute('class', 'fmap-nlabel'); tx.setAttribute('y', n.r + 13); tx.textContent = n.label; grp.appendChild(tx); }
    grp.addEventListener('mouseenter', () => fmapHover(n.i, true));
    grp.addEventListener('mouseleave', () => fmapHover(n.i, false));
    grp.addEventListener('click', (ev) => { ev.stopPropagation(); fmapClick(n); });
    g.appendChild(grp); return grp;
  });

  J._fmap = { nodes, edges, eEls, nEls, alpha: 1, tx: 0, ty: 0, scale: 1, W, H, cx, cy, adj: buildAdj(nodes, edges) };
  // sidebar surfaces
  const sd = $('fmapSurfaces');
  if (sd) sd.innerHTML = surf.sort((a, b) => b.gaps - a.gaps).map(n => `<button class="fmap-srow${n.gaps >= 3 ? ' hot' : ''}" onmouseenter="fmapHover(${n.i},true)" onmouseleave="fmapHover(${n.i},false)" onclick="location.hash='#/map/${n.surface}'"><span class="fmap-sname">${esc(n.label)}</span><span class="fmap-sgaps">${n.gaps || ''}</span></button>`).join('');
  fmapBindStage();
  fmapTick();
}
function buildAdj(nodes, edges) { const a = nodes.map(() => new Set()); edges.forEach(e => { a[e.s].add(e.t); a[e.t].add(e.s); }); return a; }
function fmapTick() {
  const M = J._fmap; if (!M || !document.getElementById('fmapSvg')) return;   // auto-stop when view changes
  const { nodes, edges } = M;
  if (M.alpha > 0.02) {
    const REP = 2600, GRAV = 0.015;
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j]; let dx = a.x - b.x, dy = a.y - b.y; let d2 = dx * dx + dy * dy || 0.1;
      const f = REP / d2; const d = Math.sqrt(d2); const ux = dx / d, uy = dy / d;
      a.vx += ux * f; a.vy += uy * f; b.vx -= ux * f; b.vy -= uy * f;
    }
    edges.forEach(e => {
      const a = nodes[e.s], b = nodes[e.t]; const L = e.k === 'epic' ? 70 : 64; const K = 0.02;
      let dx = b.x - a.x, dy = b.y - a.y; const d = Math.sqrt(dx * dx + dy * dy) || 0.1; const f = (d - L) * K;
      const ux = dx / d, uy = dy / d; a.vx += ux * f; a.vy += uy * f; b.vx -= ux * f; b.vy -= uy * f;
    });
    nodes.forEach(n => {
      n.vx += (M.cx - n.x) * GRAV; n.vy += (M.cy - n.y) * GRAV;
      n.vx *= 0.82; n.vy *= 0.82; n.x += n.vx * M.alpha; n.y += n.vy * M.alpha;
    });
    M.alpha *= 0.99;
  }
  // paint
  M.edges.forEach((e, k) => { const a = M.nodes[e.s], b = M.nodes[e.t]; const ln = M.eEls[k]; ln.setAttribute('x1', a.x); ln.setAttribute('y1', a.y); ln.setAttribute('x2', b.x); ln.setAttribute('y2', b.y); });
  M.nodes.forEach((n, k) => M.nEls[k].setAttribute('transform', `translate(${n.x.toFixed(1)},${n.y.toFixed(1)})`));
  requestAnimationFrame(fmapTick);
}
function fmapApplyView() { const M = J._fmap; if (!M) return; $('fmapView').setAttribute('transform', `translate(${M.tx},${M.ty}) scale(${M.scale})`); }
function fmapZoom(f) { const M = J._fmap; if (!M) return; M.scale = Math.max(0.3, Math.min(3, M.scale * f)); fmapApplyView(); }
function fmapReset() { const M = J._fmap; if (!M) return; M.tx = 0; M.ty = 0; M.scale = 1; M.alpha = Math.max(M.alpha, 0.3); fmapApplyView(); }
function fmapBindStage() {
  const svg = $('fmapSvg'); if (!svg) return;
  let dragging = false, lx = 0, ly = 0;
  svg.onmousedown = e => { dragging = true; lx = e.clientX; ly = e.clientY; svg.classList.add('grabbing'); };
  window.addEventListener('mousemove', e => { if (!dragging || !J._fmap) return; J._fmap.tx += e.clientX - lx; J._fmap.ty += e.clientY - ly; lx = e.clientX; ly = e.clientY; fmapApplyView(); });
  window.addEventListener('mouseup', () => { dragging = false; svg.classList.remove('grabbing'); });
  svg.onwheel = e => { e.preventDefault(); fmapZoom(e.deltaY < 0 ? 1.12 : 0.89); };
}
function fmapHover(i, on) {
  const M = J._fmap; if (!M) return; const g = $('fmapView'); if (!g) return;
  if (!on) { g.classList.remove('fmap-focus'); M.nEls.forEach(el => el.classList.remove('fmap-hi', 'fmap-dim')); M.eEls.forEach(el => el.classList.remove('fmap-hi')); const tip = $('fmapTip'); if (tip) tip.style.display = 'none'; return; }
  const near = M.adj[i]; g.classList.add('fmap-focus');
  M.nEls.forEach((el, k) => { if (k === i || near.has(k)) { el.classList.add('fmap-hi'); el.classList.remove('fmap-dim'); } else { el.classList.add('fmap-dim'); el.classList.remove('fmap-hi'); } });
  M.eEls.forEach((el, k) => el.classList.toggle('fmap-hi', M.edges[k].s === i || M.edges[k].t === i));
  const n = M.nodes[i]; const tip = $('fmapTip');
  if (tip) { const r = n.ref; tip.innerHTML = n.type === 'surface' ? `<b>${esc(n.label)}</b><span>surface · ${n.gaps} gap${n.gaps === 1 ? '' : 's'}</span>` : n.type === 'epic' ? `<b>${esc(r.id)}</b><span>epic · ${esc(String(r.title || '').slice(0, 40))}</span>` : `<b>${esc(r.id)} · ${r.severity}</b><span>${esc(String(r.title || '').slice(0, 46))}</span>`; tip.style.display = 'block'; }
}
function fmapClick(n) { if (n.type === 'surface') location.hash = '#/map/' + n.surface; else if (n.ref) location.hash = (n.type === 'epic' ? '#/epic/' : '#/ticket/') + n.ref.id; }
async function viewMap(surfaceId) {
  if (!J.flows) J.flows = await api('/api/flows');
  if (!J.autotickets) await loadAutoTickets();
  if (surfaceId) return renderSurfaceFlow(surfaceId);   // ← UNCHANGED: per-surface detail
  const f = J.flows, v = $('view'); v.className = 'view maxw';
  const totalGaps = (f.surfaces || []).reduce((n, s) => n + (s.counts ? s.counts.gaps : 0), 0);
  const untracked = countUntrackedGaps();
  v.innerHTML = `
    <div class="at-maphead">
      <h1>App Map</h1>
      <button type="button" class="at-btn" ${untracked ? '' : 'disabled'}
        onclick="autoTicketGaps()"
        title="${untracked ? 'Create tickets for App-Map gaps that aren’t tracked yet' : 'No untracked gaps — every gap is already on a ticket'}">
        <span class="at-btn-ic" aria-hidden="true">+</span>
        Auto-Ticket Untracked Gaps<span class="at-btn-n">${untracked}</span>
      </button>
    </div>
    <p class="subtitle">How slyght actually fits together — <b>Payday Plan</b> allocates to Savings, Bills and Debts; those move money through the <b>Cash</b> hub; <b>Analysis</b> reads the ledger and <b>AI Chat</b> reads your live state. Node colour = how broken (gap count). Click any surface for its <b>what SHOULD happen</b> vs <b>what IS</b> ladder. ${f.coverage.traced || 0}/${f.coverage.total || 0} Surfaces Traced · ${totalGaps} Gaps.</p>
    <div class="treewrap"><svg id="apptree" width="100%" role="img" aria-label="slyght relationship map"></svg></div>
    <div class="treelegend">
      <span class="tl-grp">Health</span>
      <span><i class="dot g"></i> Clean</span><span><i class="dot a"></i> 1–2 Gaps</span><span><i class="dot r"></i> 3+ Gaps</span>
      <span class="tl-sep"></span>
      <span class="tl-grp">Relationship</span>
      <span><i class="ln allocate"></i> Allocates To</span><span><i class="ln cash"></i> Moves Cash</span><span><i class="ln read"></i> Reads</span><span><i class="ln frame"></i> App Frame</span>
      <span style="margin-left:auto" class="meta">Tap Any Surface →</span>
    </div>`;
  drawAppTree('apptree', f);
}
/* Layered relationship graph: orchestrator → movers → hub → ledger (+ frame).
 * Curved, labelled edges; severity-coloured nodes; hover + click → surface. */
function drawAppTree(elId, f) {
  const el = $(elId); if (!el) return;
  const surf = Object.fromEntries((f.surfaces || []).map(s => [s.id, s]));
  const ros  = Object.fromEntries((f.roster || []).map(r => [r.id, r]));

  // ── canvas geometry (viewBox units; scales to container width) ──
  const W = 1180, padX = 90;
  // y-band per layer (orchestrators on top, ledger at the base)
  const LY = { 0: 120, 1: 330, 2: 540, 3: 720 };
  const H = 820;
  const NW = 176, NH = 78;                 // node box size
  const FRAME_X = W - 150;                 // app-frame column lives on the right

  // gap → palette (matches drawHub / the .dot legend)
  const sev = g => g >= 3 ? { s: '#b42318', b: '#fdeaea', t: '#7a160f' }   // red
                 : g >= 1 ? { s: '#b54708', b: '#fef6e7', t: '#7a3206' }   // amber
                 :          { s: '#067647', b: '#e7f6ec', t: '#044d2f' };  // green
  const grey = { s: '#98a2b3', b: '#f0f1f4', t: '#667085' };               // untraced
  const EDGE = {
    allocate: { c: '#6941c6', dash: '', w: 2.4, lab: '#6941c6', labbg: '#f4f0fe' }, // violet
    cash:     { c: '#067647', dash: '', w: 2.6, lab: '#067647', labbg: '#e7f6ec' }, // green
    debit:    { c: '#b54708', dash: '', w: 2.2, lab: '#b54708', labbg: '#fef6e7' }, // amber
    read:     { c: '#175cd3', dash: '7 5', w: 1.8, lab: '#175cd3', labbg: '#eaf1fb' }, // blue dashed
    frame:    { c: '#98a2b3', dash: '4 5', w: 1.6, lab: '#667085', labbg: '#f0f1f4' }, // grey dashed
  };

  // ── place nodes ──
  const pos = {};
  RELATIONSHIPS.nodes.forEach(n => {
    let cx;
    if (n.kind === 'frame') cx = FRAME_X;
    else cx = padX + n.col * (W - 2 * padX - 220);   // spread within the money column
    pos[n.id] = { x: cx, y: LY[n.layer], n };
  });

  // ── helpers ──
  const cubic = (x1, y1, x2, y2) => {       // vertical-ish curve between two centres
    const my = (y1 + y2) / 2;
    return `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
  };
  // attach edge to box edge (top/bottom) rather than centre, so arrows read cleanly
  const anchor = (p, toward) => {
    const half = NH / 2 + 2;
    return toward === 'down' ? { x: p.x, y: p.y + half } : { x: p.x, y: p.y - half };
  };

  // ── arrowhead defs + soft glow ──
  let defs = `<defs>`;
  Object.entries(EDGE).forEach(([k, e]) => {
    defs += `<marker id="ah-${elId}-${k}" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto" markerUnits="userSpaceOnUse">
      <path d="M0,0 L9,4.5 L0,9 Z" fill="${e.c}"/></marker>`;
  });
  defs += `<filter id="ns-${elId}" x="-30%" y="-30%" width="160%" height="160%">
    <feDropShadow dx="0" dy="2" stdDeviation="3.5" flood-color="#101828" flood-opacity="0.14"/></filter></defs>`;

  // ── edges (drawn first, under nodes) ──
  let edges = '', labels = '';
  RELATIONSHIPS.edges.forEach(ed => {
    const a = pos[ed.from], b = pos[ed.to]; if (!a || !b) return;
    const e = EDGE[ed.flavor] || EDGE.read;
    const down = b.y > a.y;
    const A = anchor(a, down ? 'down' : 'up');
    const B = anchor(b, down ? 'up'   : 'down');
    edges += `<path class="te-edge te-${ed.flavor}" d="${cubic(A.x, A.y, B.x, B.y)}" fill="none"
      stroke="${e.c}" stroke-width="${e.w}" ${e.dash ? `stroke-dasharray="${e.dash}"` : ''}
      stroke-linecap="round" marker-end="url(#ah-${elId}-${ed.flavor})" opacity="0.9"/>`;
    // label chip at the curve midpoint
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
    const lw = ed.label.length * 6.4 + 16;
    labels += `<g class="te-lab" pointer-events="none">
      <rect x="${mx - lw / 2}" y="${my - 11}" width="${lw}" height="22" rx="11" fill="${e.labbg}" stroke="${e.c}" stroke-opacity="0.45"/>
      <text x="${mx}" y="${my + 4}" text-anchor="middle" font-size="11.5" font-weight="600" fill="${e.lab}">${esc(titleCase(ed.label))}</text>
    </g>`;
  });

  // ── nodes ──
  let nodes = '';
  RELATIONSHIPS.nodes.forEach(n => {
    const p = pos[n.id];
    const gaps = surf[n.id] && surf[n.id].counts ? surf[n.id].counts.gaps : 0;
    const traced = ros[n.id] ? ros[n.id].traced : true;
    const ticket = ros[n.id] ? ros[n.id].ticket : null;
    const c = n.kind === 'frame' ? grey : (traced ? sev(gaps) : grey);
    const isHub = n.kind === 'hub';
    const w = isHub ? NW + 28 : NW, h = isHub ? NH + 14 : NH;
    const x = p.x - w / 2, y = p.y - h / 2;
    const healthTxt = n.kind === 'frame' ? 'app frame'
      : !traced ? 'untraced'
      : gaps === 0 ? 'clean' : `${gaps} gap${gaps === 1 ? '' : 's'}`;

    nodes += `<g class="te-node ${isHub ? 'is-hub' : ''} ${n.kind === 'frame' ? 'is-frame' : ''}"
        tabindex="0" role="button" aria-label="${esc(n.title)} — ${esc(healthTxt)}"
        onclick="location.hash='#/map/${n.id}'"
        onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();location.hash='#/map/${n.id}'}"
        style="cursor:pointer">
      <rect class="te-box" x="${x}" y="${y}" width="${w}" height="${h}" rx="16"
        fill="${isHub ? '#0d2818' : c.b}" stroke="${isHub ? '#067647' : c.s}" stroke-width="${isHub ? 2.5 : (gaps >= 3 ? 2.5 : 1.75)}"
        filter="url(#ns-${elId})"/>
      <text x="${p.x}" y="${p.y - 8}" text-anchor="middle" font-size="${isHub ? 20 : 17}" font-weight="700"
        fill="${isHub ? '#ffffff' : '#101828'}">${esc(titleCase(n.title))}</text>
      <text x="${p.x}" y="${p.y + 13}" text-anchor="middle" font-size="12"
        fill="${isHub ? '#5dcaa5' : c.t}">${esc(n.sub)}</text>
      ${n.kind === 'frame'
        ? `<text x="${p.x}" y="${p.y + 30}" text-anchor="middle" font-size="10.5" fill="#98a2b3">frame</text>`
        : isHub
          ? `<text x="${p.x}" y="${p.y + 31}" text-anchor="middle" font-size="11.5" font-weight="600" fill="#5dcaa5">${esc(healthTxt)}</text>`
          : `<g><rect x="${p.x - 38}" y="${p.y + 19}" width="76" height="18" rx="9" fill="${c.s}" opacity="0.14"/>
             <text x="${p.x}" y="${p.y + 32}" text-anchor="middle" font-size="11" font-weight="700" fill="${c.t}">${esc(healthTxt)}</text></g>`}
    </g>`;
  });

  el.setAttribute('viewBox', `0 0 ${W} ${H}`);
  el.innerHTML = defs + edges + labels + nodes;
}

/* Title Case helper for node + edge labels (kept local to the map). */
function titleCase(s) {
  const small = /^(to|of|the|a|an|in|on|and|or|vs)$/i;
  return String(s || '').split(' ').map((w, i) =>
    (i > 0 && small.test(w)) ? w.toLowerCase()
      : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
function drawHub(f) {
  const roster = f.roster || [], surf = Object.fromEntries((f.surfaces || []).map(s => [s.id, s]));
  const cx = 470, cy = 300, R = 205, n = roster.length;
  const sevColor = g => g >= 3 ? { s: '#e24b4a', b: '#fdeaea' } : g >= 1 ? { s: '#b54708', b: '#fef6e7' } : { s: '#067647', b: '#e7f6ec' };
  let edges = '', nodes = '';
  roster.forEach((r, i) => {
    const a = (-90 + i * (360 / n)) * Math.PI / 180, x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
    const gaps = surf[r.id] && surf[r.id].counts ? surf[r.id].counts.gaps : 0;
    const c = r.traced ? sevColor(gaps) : { s: '#98a2b3', b: '#f0f1f4' };
    edges += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${c.s}" stroke-width="${gaps >= 3 ? 3 : 2}" ${gaps >= 3 ? 'stroke-dasharray="6 5"' : ''} opacity="0.5"/>`;
    nodes += `<g class="hubnode" onclick="location.hash='#/map/${r.id}'" style="cursor:pointer">
      <circle cx="${x}" cy="${y}" r="46" fill="${c.b}" stroke="${c.s}" stroke-width="${gaps >= 3 ? 3 : 2}"/>
      <text x="${x}" y="${y - 4}" text-anchor="middle" fill="#101828" font-size="15" font-weight="600">${esc(r.name.split(' ')[0])}</text>
      ${r.traced ? `<text x="${x}" y="${y + 15}" text-anchor="middle" fill="${c.s}" font-size="12" font-weight="700">${gaps} gap${gaps === 1 ? '' : 's'}</text>` : `<text x="${x}" y="${y + 15}" text-anchor="middle" fill="#98a2b3" font-size="11">untraced</text>`}
      ${r.ticket ? `<text x="${x}" y="${y + 32}" text-anchor="middle" fill="#667085" font-size="10">${r.ticket}</text>` : ''}
    </g>`;
  });
  $('hub').innerHTML = edges + nodes
    + `<g><circle cx="${cx}" cy="${cy}" r="58" fill="#0d2818" stroke="#067647" stroke-width="2.5"/>`
    + `<text x="${cx}" y="${cy - 6}" text-anchor="middle" fill="#fff" font-size="18" font-weight="700">cash</text>`
    + `<text x="${cx}" y="${cy + 16}" text-anchor="middle" fill="#5dcaa5" font-size="13">the hub</text></g>`;
}
const SURF_FLOW = { savings: 'darwin-A-quicklog', bills: 'bills-mark-paid', plan: 'plan-lock', ai: 'ai-provenance', dashboard: 'log-transaction' };
async function renderSurfaceFlow(id) {
  const s = (J.flows.surfaces || []).find(x => x.id === id), v = $('view');
  if (!s) { v.innerHTML = `<a class="backlink" href="#/map">‹ App Map</a><div class="empty">Not traced yet.</div>`; return; }
  if (J.mapSurface !== id) { J.mapFace = 'back'; J.mapSurface = id; }   // reset to Flow on a fresh surface
  const face = J.mapFace || 'back';
  v.innerHTML = `
    <a class="backlink" href="#/map">‹ App Map</a>
    <div class="card">
      <h1>${esc(s.name)}</h1>
      <p class="summary">${esc(s.summary)} ${s.ticket ? `· <a href="#/ticket/${s.ticket}">${s.ticket}</a>` : ''}</p>
      <div class="facetoggle">
        <button class="ftab ${face === 'back' ? 'on' : ''}" onclick="setFace('${id}','back')">Flow — how it's wired</button>
        <button class="ftab ${face === 'touch' ? 'on' : ''}" onclick="setFace('${id}','touch')">Touchpoints — data wiring</button>
        <button class="ftab ${face === 'front' ? 'on' : ''}" onclick="setFace('${id}','front')">Screen — now vs after fix</button>
      </div>
      <div id="faceBody"></div>
    </div>`;
  if (face === 'front') renderFront(s); else if (face === 'touch') renderTouchpoints(s); else renderBack(s);
}
function renderTouchpoints(s) {
  const reads = [...new Set(s.steps.flatMap(x => x.reads || []))];
  const writes = [...new Set(s.steps.flatMap(x => x.writes || []))];
  const handlers = [...new Set(s.steps.filter(x => x.file && x.file !== '—').map(x => x.file))];
  const gapStep = s.steps.find(x => x.is === 'gap' || x.is === 'broken');
  const gapData = new Set([...((gapStep || {}).reads || []), ...((gapStep || {}).writes || [])]);
  const tickets = J.tickets.filter(t => t.group === s.id || t.surface === s.id);
  const rows = Math.max(reads.length, writes.length, 1);
  const H = Math.max(300, 64 + rows * 56), cx = 450, cy = H / 2;
  const node = (x, y, label, color, bg) => `<g class="tp-node"><rect x="${x - 96}" y="${y - 17}" width="192" height="34" rx="9" fill="${bg}" stroke="${color}" stroke-width="1.5"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-size="12" font-weight="600" fill="${color}" style="font-family:ui-monospace,monospace">${esc(label.length > 27 ? label.slice(0, 25) + '…' : label)}</text></g>`;
  let svg = '';
  reads.forEach((r, i) => { const y = cy - ((reads.length - 1) * 56) / 2 + i * 56; const bad = gapData.has(r); const col = bad ? '#b42318' : '#175cd3', bg = bad ? '#fdeaea' : '#eaf1fb'; svg += `<line x1="216" y1="${y}" x2="${cx - 102}" y2="${cy}" stroke="${col}" stroke-width="1.5" opacity=".45"${bad ? ' stroke-dasharray="5 4"' : ''}/>` + node(120, y, r, col, bg); });
  writes.forEach((w, i) => { const y = cy - ((writes.length - 1) * 56) / 2 + i * 56; const bad = gapData.has(w); const col = bad ? '#b42318' : '#067647', bg = bad ? '#fdeaea' : '#e7f6ec'; svg += `<line x1="${cx + 102}" y1="${cy}" x2="684" y2="${y}" stroke="${col}" stroke-width="1.5" opacity=".45"/>` + node(780, y, w, col, bg); });
  svg += `<g><rect x="${cx - 105}" y="${cy - 28}" width="210" height="56" rx="14" fill="#0d2818" stroke="#067647" stroke-width="2"/><text x="${cx}" y="${cy - 3}" text-anchor="middle" fill="#fff" font-size="16" font-weight="700">${esc(s.name.split(' ')[0])}</text><text x="${cx}" y="${cy + 16}" text-anchor="middle" fill="#5dcaa5" font-size="11">${reads.length} reads · ${writes.length} writes</text></g>`;
  $('faceBody').innerHTML = `
    <div class="tpgrid">
      <div>
        <div class="tpmapwrap"><svg id="tpmap" viewBox="0 0 900 ${H}">
          <text x="120" y="26" text-anchor="middle" font-size="12" font-weight="700" fill="#475467">Reads — depends on</text>
          <text x="780" y="26" text-anchor="middle" font-size="12" font-weight="700" fill="#475467">Writes — effects</text>${svg}</svg></div>
        <div class="tplegend"><span><i style="background:#175cd3"></i> reads</span><span><i style="background:#067647"></i> writes / effects</span><span><i style="background:#b42318"></i> involved in the gap</span></div>
        ${handlers.length ? `<div class="siderail" style="margin-top:14px"><div class="sh">Key handlers (file:line)</div>${handlers.slice(0, 8).map(h => `<code class="fileline">${esc(h)}</code>`).join('')}</div>` : ''}
      </div>
      <div class="tp-side">
        <div class="siderail"><div class="sh">Tickets on this surface (${tickets.length})</div>
          ${tickets.length ? tickets.map(t => `<div class="tpticket" onclick="location.hash='#/ticket/${t.id}'"><span class="pill sm ${sevCls(t.severity)}">${t.severity}</span><span class="tt">${esc(t.title)}</span><span class="meta">${t.id}</span></div>`).join('') : '<div class="empty">none on this surface</div>'}
        </div>
        ${s.ticket ? `<a class="btn primary" style="width:100%;justify-content:center;display:inline-flex;margin-top:4px" href="#/ticket/${s.ticket}">Open ${s.ticket} →</a>` : ''}
      </div>
    </div>`;
}
function renderBack(s) {
  const gap = s.steps.find(x => x.is === 'gap' || x.is === 'broken'), harm = s.steps.find(x => x.is === 'fires-anyway' || x.is === 'dead');
  $('faceBody').innerHTML = `
    <div class="ladhead"><div>What should happen</div><div>What happens now</div></div>
    ${s.steps.map(ladderRow).join('')}
    <div class="plainbox"><div class="label">The whole thing, plain</div>
      <div class="pb">This is a ${s.steps.length}-step journey.${gap ? ` Step ${gap.n} — <b>${esc(gap.title)}</b> — is the break (${gap.is === 'gap' ? 'a missing rung' : 'a broken rung'}).` : ''}${harm ? ` Because of it, <b>${esc(harm.title)}</b> ${harm.is === 'fires-anyway' ? 'fires anyway — that\'s the loss' : 'is never reached'}.` : ''} The fix is the rung — tracked as ${s.ticket ? `<a href="#/ticket/${s.ticket}">${s.ticket}</a>` : 'a ticket'}.</div></div>`;
}
async function renderFront(s) {
  const flow = SURF_FLOW[s.id];
  if (!flow) { $('faceBody').innerHTML = `<div class="empty">No live screen capture for this surface yet — it has no wired walk flow. The <b>Flow</b> view shows how it's wired; once a walk covers it, the real screen lands here.</div>`; return; }
  if (!J.walk) J.walk = await api('/api/walk-latest');
  const fl = ((J.walk.walk && J.walk.walk.flows) || []).find(f => f.flow === flow);
  const frames = fl ? (fl.steps || []).filter(st => st.screenshot).map(st => st.screenshot).slice(-3) : [];
  const gap = s.steps.find(x => x.is === 'gap' || x.is === 'broken');
  $('faceBody').innerHTML = `
    <div class="nowafter">
      <div class="na-col"><div class="na-h now">Now — the real screen today</div>
        <div class="shots">${frames.length ? frames.map(f => `<img class="shot" src="/api/shot?f=${encodeURIComponent(f)}" alt="${esc(f)}" loading="lazy">`).join('') : '<div class="empty">no frames captured for this flow</div>'}</div>
        <div class="meta">real capture · walk ${esc(J.walk.dir || '')} · flow ${esc(flow)}</div></div>
      <div class="na-col"><div class="na-h after">After fix</div>
        <div class="aftercard">${gap ? `<b>${esc(gap.title)}</b> — the rung the fix adds.<br><br>${esc(gap.plain)}` : 'This surface is healthy — no fix needed.'}${s.ticket ? `<br><br>Tracked as <a href="#/ticket/${s.ticket}">${s.ticket}</a> — the fix detail + walk evidence live on the ticket.` : ''}</div>
        <div class="meta">annotation — the real after-fix screen lands when ${s.ticket || 'the fix'} ships</div></div>
    </div>`;
}
function setFace(id, f) { J.mapFace = f; renderSurfaceFlow(id); }
function ladderRow(st) {
  const LBL = { ok: '✓ works', gap: '✗ Missing — the gap', dead: '— never reached', 'fires-anyway': '⚠ fires anyway — the harm', broken: '✗ wrong rung' };
  const cls = st.is === 'ok' ? 'ok' : st.is === 'dead' ? 'dead' : st.is === 'fires-anyway' ? 'fire' : 'gap';
  const ticket = st.ticket ? ` <a href="#/ticket/${st.ticket}" class="gaplink">${st.ticket} →</a>` : '';
  return `<div class="ladrow">
    <div class="should"><div class="rung ${cls}">${st.n}</div><div class="rinfo"><div class="rt">${esc(st.title)}</div><div class="rsub">${esc(st.plain)}</div>${st.file && st.file !== '—' ? `<code class="fileline">${esc(st.file)}</code>` : ''}</div></div>
    <div class="iscell is-${cls}"><div class="islbl">${LBL[st.is] || '—'}${ticket}</div>${st.wired && st.is !== 'ok' ? `<div class="rsub">${esc(st.wired)}</div>` : ''}${(st.writes || []).length ? `<div class="rsub">writes: ${st.writes.map(esc).join(', ')}</div>` : ''}</div>
  </div>`;
}

/* ════════════════════════ CALENDAR (month grid) ════════════════════════
 * A real month calendar. Weekday headers, 6-week cell grid, today highlighted,
 * working prev/next month nav (recomputes the grid). Plots any ticket carrying
 * a target/due date — none do yet, so a truthful in-grid strip says so. The
 * grid itself is genuinely premium so it reads as a real calendar, not a stub.
 * ──────────────────────────────────────────────────────────────────────── */
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WEEKDAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
// tolerant date read — lights up the day the model gains a target/due field
const ticketDate = t => (t && t.dueDate) || (t && t.state && (t.state.target || t.state.due)) || (t && (t.due || t.target)) || null;
const ymd = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

function viewCalendar() {
  const v = $('view'); v.className = 'view maxw';
  // J.cal holds the month being viewed; default to the current month
  if (!J.cal) { const n = new Date(); J.cal = { y: n.getFullYear(), m: n.getMonth() }; }
  const { y, m } = J.cal;
  const today = new Date(); const todayKey = ymd(today);

  // bucket scheduled tickets by day key (none have dates yet → map stays empty)
  const scheduled = {};
  J.tickets.forEach(t => {
    const iso = ticketDate(t); if (!iso) return;
    const d = new Date(iso); if (isNaN(d)) return;
    const k = ymd(d); (scheduled[k] = scheduled[k] || []).push(t);
  });
  const totalScheduled = Object.values(scheduled).reduce((n, a) => n + a.length, 0);

  // grid maths — Monday-first, always 6 rows (42 cells) so the grid never reflows
  const first = new Date(y, m, 1);
  const lead = (first.getDay() + 6) % 7;            // 0=Mon … 6=Sun
  const start = new Date(y, m, 1 - lead);
  const cells = [];
  for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); cells.push(d); }

  const cellHtml = d => {
    const inMonth = d.getMonth() === m;
    const key = ymd(d);
    const isToday = key === todayKey;
    const items = scheduled[key] || [];
    return `<div class="cal-cell${inMonth ? '' : ' cal-out'}${isToday ? ' cal-today' : ''}">
      <div class="cal-daynum">${isToday ? '<span class="cal-todaydot">' + d.getDate() + '</span>' : d.getDate()}</div>
      ${items.slice(0, 3).map(t => `<div class="cal-evt ${sevCls(t.severity)}" title="${esc(t.title)}" onclick="location.hash='#/ticket/${t.id}'">${esc(t.title)}</div>`).join('')}
      ${items.length > 3 ? `<div class="cal-more">+${items.length - 3} more</div>` : ''}
    </div>`;
  };

  v.innerHTML = `
    <h1>Calendar</h1>
    <p class="subtitle">Tickets plotted against their due dates — colour shows severity, click any to open it. Set a due date on a ticket (its Details rail) and it lands on the day it's due.</p>
    <div class="cal-wrap">
      <div class="cal-bar">
        <div class="cal-title">${MONTHS[m]} ${y}</div>
        <div class="cal-nav">
          <button class="cal-navbtn" onclick="calStep(-1)" aria-label="Previous month">‹</button>
          <button class="btn sm" onclick="calToday()">Today</button>
          <button class="cal-navbtn" onclick="calStep(1)" aria-label="Next month">›</button>
        </div>
      </div>
      <div class="cal-grid cal-head">${WEEKDAYS.map(w => `<div class="cal-wd">${w}</div>`).join('')}</div>
      <div class="cal-grid cal-body">${cells.map(cellHtml).join('')}</div>
      ${totalScheduled === 0
        ? `<div class="cal-empty"><span class="cal-empty-dot"></span> No scheduled items yet — set a target date on a ticket to see it here. The grid above is live; dated tickets land on the day they're due.</div>`
        : `<div class="cal-foot"><span class="meta">${totalScheduled} scheduled item${totalScheduled === 1 ? '' : 's'} this view</span></div>`}
    </div>`;
}
function calStep(delta) {
  let { y, m } = J.cal; m += delta;
  if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
  J.cal = { y, m }; viewCalendar();
}
function calToday() { const n = new Date(); J.cal = { y: n.getFullYear(), m: n.getMonth() }; viewCalendar(); }

/* ════════════════════════ PLANNING (roadmap board) ══════════════════════
 * Linear-style planning surface. Features lane (type==='feature' — empty today,
 * honest), a Releases concept (grouped by a future `bundle` field — none exist,
 * so a real "Group into a release" affordance instead of fake bundles), and the
 * highest-severity bugs surfaced as candidates for the next release.
 * ──────────────────────────────────────────────────────────────────────── */
const SEVRANK_P = { P0: 0, P1: 1, P2: 2 };
function viewPlanning() {
  const v = $('view'); v.className = 'view maxw'; const ts = J.tickets;
  const features = ts.filter(t => t.type === 'feature');
  const tasks = ts.filter(t => t.type === 'task');
  // release candidates = open P0/P1 bugs, highest severity first, freshest activity first
  const candidates = ts
    .filter(t => t.type === 'bug' && ['P0', 'P1'].includes(t.severity) && t.state.status !== 'Shipped')
    .sort((a, b) => SEVRANK_P[a.severity] - SEVRANK_P[b.severity] || new Date(b.state.lastActivity || 0) - new Date(a.state.lastActivity || 0));
  // group tickets that carry a `bundle` (set via setMeta) into release lanes
  const bundles = {};
  ts.forEach(t => { if (t.bundle) (bundles[t.bundle] = bundles[t.bundle] || []).push(t); });
  const bundleNames = Object.keys(bundles).sort();
  const hasBundles = bundleNames.length > 0;

  const planCard = t => `<div class="plan-card" onclick="location.hash='#/ticket/${t.id}'">
    <div class="plan-card-top"><span class="pill sm k-${t.kind}">${esc(cap(t.type))}</span><span class="pill sm ${sevCls(t.severity)}">${t.severity}</span></div>
    <div class="plan-card-t">${esc(t.title)}</div>
    <div class="plan-card-foot"><span class="meta">${t.id} · ${esc(niceSurface(t.group))}</span><span class="pill sm s-${t.state.status}">${STATUS_LABEL[t.state.status]}</span></div>
  </div>`;

  v.innerHTML = `
    <h1>Planning</h1>
    <p class="subtitle">The roadmap — what's planned, what's a candidate for the next release, and how it groups into bundles. ${ts.length} tickets in the project · ${features.length} feature${features.length === 1 ? '' : 's'} planned · ${candidates.length} bug${candidates.length === 1 ? '' : 's'} flagged for the next release.</p>

    <div class="plan-cols">
      <section class="plan-lane">
        <div class="plan-lane-h"><span class="plan-lane-title">Features</span><span class="plan-lane-ct">${features.length}</span><button class="btn sm" onclick="newTicket()">+ New Feature</button></div>
        <p class="plan-lane-sub">Net-new capability — e.g. bank integration, Opal.</p>
        ${features.length
          ? features.map(planCard).join('')
          : `<div class="plan-empty">
              <div class="plan-empty-icon">◇</div>
              <div class="plan-empty-t">No features planned yet</div>
              <div class="plan-empty-b">Every ticket today is a bug fix. When you scope net-new work — bank integration, Opal, anything — create it as a Feature and it lands here as a roadmap card.</div>
              <button class="btn primary sm" onclick="newTicket()">+ New Feature</button>
            </div>`}
        ${tasks.length ? `<div class="plan-lane-h" style="margin-top:18px"><span class="plan-lane-title">Tasks</span><span class="plan-lane-ct">${tasks.length}</span></div>${tasks.map(planCard).join('')}` : ''}
      </section>

      <section class="plan-lane">
        <div class="plan-lane-h"><span class="plan-lane-title">Candidates For Next Release</span><span class="plan-lane-ct">${candidates.length}</span></div>
        <p class="plan-lane-sub">Highest-severity open bugs — the strongest case for what ships next.</p>
        ${candidates.length
          ? candidates.slice(0, 8).map(planCard).join('') + (candidates.length > 8 ? `<a href="#/board" class="meta plan-morelink">+${candidates.length - 8} more on the Board →</a>` : '')
          : `<div class="plan-empty"><div class="plan-empty-t">Nothing flagged</div><div class="plan-empty-b">No open P0/P1 bugs — the next release is yours to scope.</div></div>`}
      </section>
    </div>

    <h2 class="section-h">Releases</h2>
    <p class="meta" style="margin:-6px 0 14px">Group what ships together into a bundle. Bundles aren't in the ticket model yet — grouping is the next step.</p>
    <div class="plan-releases">
      ${hasBundles
        ? `<div class="fld-releasegrid">${bundleNames.map(b => fldReleaseCard(b, bundles[b])).join('')}</div>
           <div class="fld-release-add"><button class="btn primary" onclick="planGroupRelease()">Group More Into A Release</button></div>`
        : `
        <div class="plan-release-empty">
          <div class="plan-release-empty-l">
            <div class="plan-empty-t">No releases grouped yet</div>
            <div class="plan-empty-b">A release is a set of tickets that ship together (a bundle). Group ship-ready tickets into a bundle and they'll show here as a planned cycle with its own card.</div>
          </div>
          <button class="btn primary" onclick="planGroupRelease()">Group Into A Release</button>
        </div>`}
    </div>`;
}

// one release lane — all tickets sharing a `bundle`, with a ship-progress bar.
function fldReleaseCard(name, tickets) {
  const ts = tickets.slice().sort((a, b) => SEVRANK_P[a.severity] - SEVRANK_P[b.severity]);
  const done = ts.filter(t => ['ConfirmedLive', 'Shipped'].includes(t.state.status)).length;
  const pct = Math.round(done / Math.max(1, ts.length) * 100);
  const earliestDue = ts.map(t => t.dueDate).filter(Boolean).sort()[0] || null;
  return `<section class="fld-release">
    <div class="fld-release-h">
      <span class="fld-release-name">◈ ${esc(name)}</span>
      <span class="fld-release-ct">${done}/${ts.length} shipped</span>
    </div>
    ${earliestDue ? `<div class="fld-release-due">First due ${esc(earliestDue)}</div>` : ''}
    <div class="fld-release-track"><div class="fld-release-fill" style="width:${Math.max(pct ? 6 : 0, pct)}%"></div></div>
    <div class="fld-release-list">
      ${ts.map(t => `<div class="fld-release-row" onclick="location.hash='#/ticket/${t.id}'">
        <span class="pill sm ${sevCls(t.severity)}">${t.severity}</span>
        <span class="fld-release-tt">${esc(t.title)}</span>
        <span class="pill sm s-${t.state.status}">${STATUS_LABEL[t.state.status]}</span>
        <span class="meta">${t.id}</span>
      </div>`).join('')}
    </div>
  </section>`;
}
function planGroupRelease() {
  const ts = J.tickets;
  // A release groups SHIP-READY tickets only — a ticket becomes ship-ready when
  // its fix is Confirmed Live (verified in the running app). Open/Discussing/
  // Aligned/Investigating work isn't ready to ship; Shipped is already out.
  // Sorted highest-severity first, then freshest activity.
  const shipReady = ts.filter(t => t.state.status === 'ConfirmedLive')
    .sort((a, b) => SEVRANK_P[a.severity] - SEVRANK_P[b.severity]
      || new Date(b.state.lastActivity || 0) - new Date(a.state.lastActivity || 0));
  const existing = fldBundles();
  modal(`<h2>Group Into A Release</h2>
    <p>Releases group tickets that ship together as a bundle — slyght's existing cadence (Bundle 30, 31, 32…). Only <b>ship-ready</b> tickets qualify: a ticket becomes ship-ready when its fix is <b>Confirmed Live</b> (verified in the running app). Name the bundle, tick the tickets, and this writes the grouping — they'll appear in the Releases lane.</p>
    ${shipReady.length
      ? `<div class="label" style="margin-top:10px">Bundle name</div>
    <input id="fldBundleName" list="fld-bundles" maxlength="60" placeholder="e.g. Bundle 33" autocomplete="off">
    ${fldBundleDatalist()}
    <div class="label" style="margin-top:14px">Ship-ready tickets — tick the ones to include</div>
    <div class="plan-modal-list">
      ${shipReady.slice(0, 20).map(t => `<label class="plan-modal-row fld-pickrow">
        <input type="checkbox" class="fld-pick" value="${t.id}" checked>
        <span class="pill sm ${sevCls(t.severity)}">${t.severity}</span>
        <span class="tt">${esc(t.title)}</span>
        ${t.bundle ? `<span class="fld-bundlechip" title="Currently in ${esc(t.bundle)}">◈ ${esc(t.bundle)}</span>` : ''}
        <span class="meta">${t.id}</span>
      </label>`).join('')}
    </div>
    <div class="btns" style="margin-top:16px">
      <button class="btn primary" onclick="fldDoGroupRelease()">Group Into Release</button>
      <button class="btn" onclick="closeModal()">Cancel</button>
    </div>`
      : `<div class="plan-empty" style="margin-top:6px"><div class="plan-empty-icon">◇</div><div class="plan-empty-t">No tickets are ship-ready yet</div><div class="plan-empty-b">A ticket becomes ship-ready when its fix is Confirmed Live — verified in the running app. Move a ticket to Confirmed Live on the Board (it's earned: it needs walk evidence), and it'll show here as part of the next release.</div></div>
    <div class="btns"><button class="btn" onclick="closeModal()">Close</button></div>`}`);
  setTimeout(() => { const el = $('fldBundleName'); if (el) el.focus(); }, 30);
}

// write the bundle onto every ticked ship-ready ticket, then refresh Planning once.
async function fldDoGroupRelease() {
  const name = ($('fldBundleName').value || '').trim();
  if (!name) { toast('name the bundle first', 'err'); const el = $('fldBundleName'); if (el) el.focus(); return; }
  if (name.length > 60) { toast('bundle name too long (max 60)', 'err'); return; }
  const ids = [...document.querySelectorAll('.fld-pick:checked')].map(c => c.value);
  if (!ids.length) { toast('tick at least one ticket', 'err'); return; }
  let ok = 0;
  for (const id of ids) {
    try { await action('setMeta', { id, field: 'bundle', value: name }); ok++; }
    catch (e) { /* action() toasts each rejection; keep going */ }
  }
  closeModal();
  toast(`Grouped ${ok} ticket${ok === 1 ? '' : 's'} into ${name}`, 'ok');
  await load();
  if ((location.hash || '').includes('/planning')) viewPlanning(); else route();
}

/* ════════════════════════ INSIGHTS (command-centre telemetry) ═══════════
 * A real analytics dashboard computed purely from J.tickets + J.flows — an
 * App Health Score gauge, severity / status-funnel / type / surface charts, a
 * walk-coverage gauge, an aging list, and a live activity feed derived from
 * ticket state (thread comments + status earns + alignments). No time-series
 * history exists yet, so everything is framed as a current snapshot ("Since
 * Tracking") — no fake trends. Namespaced ins-*; tokens + existing helpers.
 * ──────────────────────────────────────────────────────────────────────── */
const INS_FRAMED_GAPS = 202;   // gaps the framing exercise scoped across the app

async function viewInsights() {
  if (!J.flows) J.flows = await api('/api/flows');
  const v = $('view'); v.className = 'view maxw';
  const ts = J.tickets, n = ts.length || 1;

  /* ── derived metrics ──────────────────────────────────────────────────── */
  const by      = s => ts.filter(t => t.state.status === s).length;
  const sevCount = x => ts.filter(t => t.severity === x).length;
  const typeCount = x => ts.filter(t => t.type === x).length;
  const p0 = sevCount('P0'), p1 = sevCount('P1'), p2 = sevCount('P2');
  const shipped = by('Shipped'), confirmedLive = by('ConfirmedLive');
  const done = shipped + confirmedLive;
  const openP0 = ts.filter(t => t.severity === 'P0' && !['Shipped', 'ConfirmedLive'].includes(t.state.status)).length;

  const flows = J.flows || {};
  const surfaces = flows.surfaces || [];
  const roster = flows.roster || [];
  const cov = flows.coverage || { traced: 0, total: 0 };
  const gaps = surfaces.reduce((a, s) => a + (s.counts ? s.counts.gaps : 0), 0);
  const dead = surfaces.reduce((a, s) => a + (s.counts ? s.counts.dead : 0), 0);
  const firesAnyway = surfaces.reduce((a, s) => a + (s.counts ? s.counts.firesAnyway : 0), 0);
  const runnableSpecs = surfaces.reduce((a, s) => a + (s.counts ? s.counts.total : 0), 0);

  /* ── App Health Score — composite 0–100 (4 weighted drivers) ──────────────
   * Each driver is a 0–1 health ratio (1 = perfect); the score is their
   * weighted sum × 100. Drivers chosen for honest signal, not vanity:
   *   • Critical pressure (35%) — open P0s drag hardest; 0 P0 = full marks.
   *   • Gap coverage      (30%) — gaps found vs the 202 framed; fewer = better.
   *   • Walk coverage     (20%) — surfaces traced vs total.
   *   • Shipped ratio     (15%) — done (Shipped+ConfirmedLive) vs all tickets. */
  const dCrit  = openP0 === 0 ? 1 : Math.max(0, 1 - openP0 / 5);          // 5 open P0s → 0
  const dGaps  = Math.max(0, 1 - gaps / INS_FRAMED_GAPS);
  const dWalk  = cov.total ? cov.traced / cov.total : 0;
  const dShip  = done / n;
  const score  = Math.round((dCrit * 0.35 + dGaps * 0.30 + dWalk * 0.20 + dShip * 0.15) * 100);
  const band   = score >= 75 ? { label: 'Healthy', tone: 'green' }
               : score >= 50 ? { label: 'At Risk', tone: 'amber' }
               :               { label: 'Critical', tone: 'red' };

  // the 2–3 drivers that move the needle most, worst-first, as readable lines
  const driverDefs = [
    { k: 'crit', tone: openP0 ? 'red' : 'green', h: dCrit,
      label: openP0 ? `${openP0} Open P0 Critical` : 'No Open P0s',
      hint:  openP0 ? 'Highest-severity work still in flight — the heaviest drag.' : 'No critical tickets in flight — top driver is clean.' },
    { k: 'gaps', tone: gaps >= 12 ? 'red' : gaps >= 1 ? 'amber' : 'green', h: dGaps,
      label: `${gaps} App-Map Gaps`,
      hint:  `Found across the walk vs the ${INS_FRAMED_GAPS} framed — ${Math.round(dGaps * 100)}% clear.` },
    { k: 'walk', tone: dWalk >= 1 ? 'green' : dWalk >= 0.6 ? 'amber' : 'red', h: dWalk,
      label: `${cov.traced}/${cov.total} Surfaces Traced`,
      hint:  dWalk >= 1 ? 'Every surface has a runnable walk — full coverage.' : 'Some surfaces are not yet walked.' },
    { k: 'ship', tone: dShip >= 0.4 ? 'green' : dShip >= 0.15 ? 'amber' : 'amber', h: dShip,
      label: `${done} Of ${ts.length} Shipped Or Live`,
      hint:  `${Math.round(dShip * 100)}% of tracked tickets are done or confirmed live.` },
  ];
  const drivers = driverDefs.slice().sort((a, b) => a.h - b.h).slice(0, 3);

  /* ── SVG donut: severity distribution (P0 / P1 / P2) ──────────────────── */
  const sevSlices = [
    { label: 'P0 · Critical', val: p0, color: 'var(--red)'   },
    { label: 'P1 · High',     val: p1, color: 'var(--amber)' },
    { label: 'P2 · Normal',   val: p2, color: 'var(--label)' },
  ];
  const donut = insDonut(sevSlices, ts.length, 'Tickets');

  /* ── status funnel: Open → … → Shipped ───────────────────────────────── */
  const funnelMax = Math.max(1, ...STATUSES.map(by));
  const funnel = STATUSES.map(s => {
    const c = by(s), w = Math.max(c ? 7 : 2, Math.round(c / funnelMax * 100));
    return `<button type="button" class="ins-funrow s-${s}"
        onclick="J.filter={surface:'',severity:'',type:'',status:'${s}',search:'',sort:'activity',view:'all'};location.hash='#/board'"
        title="Open the ${esc(STATUS_LABEL[s])} tickets on the Board">
        <span class="ins-funlbl">${esc(STATUS_LABEL[s])}</span>
        <span class="ins-funtrack"><span class="ins-funbar" style="width:${w}%"></span></span>
        <span class="ins-funn">${c}</span>
      </button>`;
  }).join('');

  /* ── tickets by type (horizontal bars) ────────────────────────────────── */
  const typeDefs = [
    { id: 'bug',     label: 'Bugs',     tone: 'red'   },
    { id: 'feature', label: 'Features', tone: 'violet'},
    { id: 'task',    label: 'Tasks',    tone: 'teal'  },
  ];
  const typeMax = Math.max(1, ...typeDefs.map(d => typeCount(d.id)));
  const typeBars = typeDefs.map(d => {
    const c = typeCount(d.id), w = Math.max(c ? 7 : 2, Math.round(c / typeMax * 100));
    return `<button type="button" class="ins-bar ins-${d.tone}"
        onclick="setFilter('type','${d.id}');location.hash='#/board'"
        title="Filter the Board to ${esc(d.label)}">
        <span class="ins-barlbl">${esc(d.label)}</span>
        <span class="ins-bartrack"><span class="ins-barfill" style="width:${w}%"></span></span>
        <span class="ins-barn">${c}</span>
      </button>`;
  }).join('');

  /* ── tickets by surface (top surfaces by ticket count) ────────────────── */
  const ros = Object.fromEntries(roster.map(r => [r.id, r.name]));
  const shortName = g => (ros[g] || String(g || '—')).split(/\s+[—–\/]\s+/)[0].split(' ')[0];
  const bySurfaceMap = {};
  ts.forEach(t => { const g = t.group || t.surface || 'other'; bySurfaceMap[g] = (bySurfaceMap[g] || 0) + 1; });
  const surfaceRows = Object.entries(bySurfaceMap).sort((a, b) => b[1] - a[1]);
  const surfMax = Math.max(1, ...surfaceRows.map(r => r[1]));
  const surfaceBars = surfaceRows.map(([g, c]) => {
    const w = Math.max(7, Math.round(c / surfMax * 100));
    return `<button type="button" class="ins-bar ins-accent"
        onclick="setFilter('surface','${esc(g)}');location.hash='#/board'"
        title="Filter the Board to the ${esc(shortName(g))} surface">
        <span class="ins-barlbl">${esc(shortName(g))}</span>
        <span class="ins-bartrack"><span class="ins-barfill" style="width:${w}%"></span></span>
        <span class="ins-barn">${c}</span>
      </button>`;
  }).join('');

  /* ── walk-coverage gauge (ring) + the three honest counters ───────────── */
  const covPct = cov.total ? Math.round(cov.traced / cov.total * 100) : 0;
  const covRing = insRing(covPct, `${cov.traced}/${cov.total}`, 'Surfaces', covPct >= 100 ? 'green' : covPct >= 60 ? 'amber' : 'red');

  /* ── aging: oldest open tickets by state.opened ───────────────────────── */
  const OPEN_STATES = ['Open', 'Discussing', 'Aligned', 'Investigating'];
  const aging = ts
    .filter(t => OPEN_STATES.includes(t.state.status) && t.state.opened)
    .sort((a, b) => new Date(a.state.opened) - new Date(b.state.opened))
    .slice(0, 6);
  const agingRows = aging.length
    ? aging.map((t, i) => `<button type="button" class="ins-agerow" onclick="location.hash='#/ticket/${t.id}'">
        <span class="ins-agerank">${i + 1}</span>
        <span class="pill sm ${sevCls(t.severity)}">${t.severity}</span>
        <span class="ins-aget">${esc(t.title)}</span>
        <span class="ins-agemeta"><span class="pill sm s-${t.state.status}">${STATUS_LABEL[t.state.status]}</span><span class="ins-ageid">${t.id}</span></span>
        <span class="ins-agedays">opened ${esc(ago(t.state.opened))}</span>
        <span class="ins-rowgo" aria-hidden="true">→</span>
      </button>`).join('')
    : `<div class="ins-empty">No open tickets — nothing aging.</div>`;

  /* ── live activity feed: comments + status earns + alignments, ts desc ──
   * Each ticket carries a thread of {author,text,ts}; alignments are stamped
   * separately. We flatten every event across every ticket into one stream,
   * tag the kind, sort newest-first, and render "actor · what · when (ago)". */
  const feed = insBuildFeed(ts).slice(0, 14);
  const feedRows = feed.length
    ? feed.map(e => `<button type="button" class="ins-feedrow" onclick="location.hash='#/ticket/${e.id}'">
        <span class="ins-feedav ins-av-${e.actorKey}">${e.avatar}</span>
        <span class="ins-feedbody">
          <span class="ins-feedtop"><b class="ins-feedactor">${esc(e.actor)}</b> ${esc(e.verb)} <span class="ins-feedid">${e.id}</span></span>
          <span class="ins-feedwhat">${e.what}</span>
        </span>
        <span class="ins-feedwhen" title="${esc(when(e.ts))}">${esc(ago(e.ts))}</span>
      </button>`).join('')
    : `<div class="ins-empty">No activity recorded yet — comments, status changes and alignments will stream here.</div>`;

  /* ── render ───────────────────────────────────────────────────────────── */
  v.innerHTML = `
    <header class="ov2head">
      <div>
        <h1>Insights</h1>
        <p class="subtitle">Command-centre telemetry — one composite health read, the analytics behind it, and a live stream of everything happening across the project.</p>
      </div>
      <span class="ins-snaptag">Snapshot · Since Tracking</span>
    </header>

    <section class="ins-top">
      <!-- App Health Score — the hero gauge -->
      <div class="ins-panel ins-health ins-h-${band.tone}">
        <div class="ins-panel-h">
          <div>
            <h2 class="ins-title">App Health Score</h2>
            <p class="ins-sub">A composite of critical pressure, gap coverage, walk coverage and shipped ratio.</p>
          </div>
        </div>
        <div class="ins-healthbody">
          ${insScoreRing(score, band)}
          <div class="ins-drivers">
            <div class="ins-drivers-h">Top Drivers</div>
            ${drivers.map(d => `<div class="ins-driver ins-d-${d.tone}">
              <span class="ins-driver-dot"></span>
              <span class="ins-driver-txt"><b>${esc(d.label)}</b><span class="ins-driver-hint">${esc(d.hint)}</span></span>
            </div>`).join('')}
          </div>
        </div>
      </div>

      <!-- analytics chart row beside the gauge -->
      <div class="ins-chartcol">
        <div class="ins-panel">
          <div class="ins-panel-h"><h2 class="ins-title">Severity Distribution</h2><span class="ov2-count">${ts.length}</span></div>
          <div class="ins-donutwrap">
            ${donut}
            <div class="ins-legend">
              ${sevSlices.map(s => `<div class="ins-legrow"><span class="ins-legdot" style="background:${s.color}"></span><span class="ins-leglbl">${esc(s.label)}</span><span class="ins-legn">${s.val}</span></div>`).join('')}
            </div>
          </div>
        </div>
        <div class="ins-panel">
          <div class="ins-panel-h"><h2 class="ins-title">Status Funnel</h2><span class="ov2-count">Open → Shipped</span></div>
          <div class="ins-funnel">${funnel}</div>
        </div>
      </div>
    </section>

    <section class="ins-grid3">
      <div class="ins-panel">
        <div class="ins-panel-h"><h2 class="ins-title">Tickets By Type</h2></div>
        <div class="ins-bars">${typeBars}</div>
      </div>
      <div class="ins-panel">
        <div class="ins-panel-h"><h2 class="ins-title">Tickets By Surface</h2><span class="ov2-count">${surfaceRows.length}</span></div>
        <div class="ins-bars ins-bars-scroll">${surfaceBars || '<div class="ins-empty">No tickets yet.</div>'}</div>
      </div>
      <div class="ins-panel ins-cov">
        <div class="ins-panel-h">
          <div><h2 class="ins-title">Walk Coverage</h2><p class="ins-sub">How much of the app has a runnable walk.</p></div>
        </div>
        <div class="ins-covbody">
          ${covRing}
          <div class="ins-covstats">
            <div class="ins-covstat"><span class="ins-covn">${cov.traced}/${cov.total}</span><span class="ins-covl">Surfaces Walked</span></div>
            <div class="ins-covstat"><span class="ins-covn">${runnableSpecs}</span><span class="ins-covl">Runnable Specs</span></div>
            <div class="ins-covstat ins-cov-warn"><span class="ins-covn">${gaps}</span><span class="ins-covl">Gaps Found</span></div>
            <div class="ins-covstat ins-cov-warn"><span class="ins-covn">${dead + firesAnyway}</span><span class="ins-covl">Dead · Fires Anyway</span></div>
          </div>
        </div>
      </div>
    </section>

    <section class="ins-grid2">
      <div class="ins-panel ins-aging">
        <div class="ins-panel-h">
          <div><h2 class="ins-title">Oldest Open Tickets</h2><p class="ins-sub">Ranked by how long they have been open — the staleness watch.</p></div>
          <span class="ov2-count">${aging.length}</span>
        </div>
        <div class="ins-agelist">${agingRows}</div>
      </div>

      <div class="ins-panel ins-feed">
        <div class="ins-panel-h">
          <div><h2 class="ins-title">Live Activity Feed</h2><p class="ins-sub">Comments, status changes and alignments across every ticket — newest first.</p></div>
          <span class="ins-livedot" aria-hidden="true"></span>
        </div>
        <div class="ins-feedlist">${feedRows}</div>
      </div>
    </section>

    <section class="ins-trendsect" id="insTrends">
      <div class="ins-panel trend-seed"><div class="trend-empty"><span class="trend-empty-ic">📈</span><div class="trend-empty-h">Loading Trends…</div></div></div>
    </section>`;

  insTrends();   // ← fill the Trends section async (reads /api/history); leaves NOW-metrics instant
}

/* ── Insights helpers (kept local to the section) ─────────────────────────── */

// the big score ring — a conic-gradient gauge with the number + band label inside
function insScoreRing(score, band) {
  const deg = Math.round(score / 100 * 360);
  const col = band.tone === 'green' ? 'var(--green)' : band.tone === 'amber' ? 'var(--amber)' : 'var(--red)';
  const soft = band.tone === 'green' ? 'var(--green-bg)' : band.tone === 'amber' ? 'var(--amber-bg)' : 'var(--red-bg)';
  return `<div class="ins-scorering" style="--ins-deg:${deg}deg;--ins-col:${col};--ins-soft:${soft}">
      <div class="ins-scorehole">
        <span class="ins-scoreval">${score}</span>
        <span class="ins-scoreunit">/ 100</span>
        <span class="ins-scoreband ins-b-${band.tone}">${esc(band.label)}</span>
      </div>
    </div>`;
}

// a small SVG donut from weighted slices; renders a centred total in the hole
function insDonut(slices, total, centreLabel) {
  const C = 84, R = 58, SW = 22, circ = 2 * Math.PI * R;
  const sum = slices.reduce((a, s) => a + s.val, 0) || 1;
  let off = 0, segs = '';
  slices.forEach(s => {
    if (!s.val) return;
    const len = s.val / sum * circ;
    segs += `<circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="${s.color}" stroke-width="${SW}"
      stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-off}"
      transform="rotate(-90 ${C} ${C})" class="ins-donutseg"/>`;
    off += len;
  });
  return `<svg class="ins-donut" viewBox="0 0 ${C * 2} ${C * 2}" width="168" height="168" role="img" aria-label="Severity distribution">
      <circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="var(--card2)" stroke-width="${SW}"/>
      ${segs}
      <text x="${C}" y="${C - 4}" text-anchor="middle" font-size="34" font-weight="700" fill="var(--head)">${total}</text>
      <text x="${C}" y="${C + 20}" text-anchor="middle" font-size="13" font-weight="600" fill="var(--muted)">${esc(centreLabel)}</text>
    </svg>`;
}

// a single-value progress ring (walk coverage); pct 0–100, toned
function insRing(pct, big, small, tone) {
  const C = 70, R = 50, SW = 14, circ = 2 * Math.PI * R;
  const len = Math.max(0, Math.min(100, pct)) / 100 * circ;
  const col = tone === 'green' ? 'var(--green)' : tone === 'amber' ? 'var(--amber)' : 'var(--red)';
  return `<svg class="ins-covring" viewBox="0 0 ${C * 2} ${C * 2}" width="148" height="148" role="img" aria-label="Walk coverage ${pct} percent">
      <circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="var(--card2)" stroke-width="${SW}"/>
      <circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="${col}" stroke-width="${SW}" stroke-linecap="round"
        stroke-dasharray="${len} ${circ - len}" transform="rotate(-90 ${C} ${C})" class="ins-covarc"/>
      <text x="${C}" y="${C - 2}" text-anchor="middle" font-size="26" font-weight="700" fill="var(--head)">${esc(big)}</text>
      <text x="${C}" y="${C + 20}" text-anchor="middle" font-size="13" font-weight="600" fill="var(--muted)">${esc(small)}</text>
    </svg>`;
}

// flatten every ticket's events (comments + alignment + status earn) into one
// newest-first stream. Each event: {id, ts, actor, actorKey, avatar, verb, what}.
function insBuildFeed(ts) {
  const events = [];
  const avOf = a => a === 'john' ? 'J' : a === 'jarvis' ? 'Jv' : 'CC';
  const nameOf = a => a === 'john' ? 'John' : a === 'jarvis' ? 'Jarvis' : 'CC';
  ts.forEach(t => {
    const st = t.state || {};
    (st.thread || []).forEach(c => {
      const isAlign = /✓?\s*ALIGNED/.test(c.text || '');
      const isCC = c.author === 'cc' && /\*\*CC result\*\*/.test(c.text || '');
      events.push({
        id: t.id, ts: c.ts, actor: nameOf(c.author), actorKey: c.author, avatar: avOf(c.author),
        verb: isAlign ? 'aligned' : isCC ? 'posted results on' : 'commented on',
        what: `<span class="ins-feedtitle">${esc(t.title)}</span> · ${esc((c.text || '').replace(/\s+/g, ' ').slice(0, 96))}${(c.text || '').length > 96 ? '…' : ''}`,
        kind: isAlign ? 'align' : 'comment',
      });
    });
    // a derived "status" event from lastActivity for tickets that earned a terminal
    // state but carry no matching thread line (keeps the feed honest + alive)
    if (st.status && ['Aligned', 'Investigating', 'ConfirmedLive', 'Shipped'].includes(st.status)) {
      const hasThreadAt = (st.thread || []).some(c => c.ts === st.lastActivity);
      if (!hasThreadAt && st.lastActivity) {
        events.push({
          id: t.id, ts: st.lastActivity, actor: st.assignee === 'cc' ? 'CC' : 'John',
          actorKey: st.assignee === 'cc' ? 'cc' : 'john', avatar: st.assignee === 'cc' ? 'CC' : 'J',
          verb: 'moved to ' + (STATUS_LABEL[st.status] || st.status), what: `<span class="ins-feedtitle">${esc(t.title)}</span>`,
          kind: 'status',
        });
      }
    }
  });
  return events
    .filter(e => e.ts)
    .sort((a, b) => new Date(b.ts) - new Date(a.ts));
}

/* ── Trends (the SERIES-metric section — reads /api/history) ───────────────────
 * viewInsights() paints an empty <div id="insTrends"> placeholder; this fills it
 * async so the existing NOW-metrics render instantly and trends stream in.
 * Honest sparse state: <2 snapshots → a "history starts now" message, never a
 * misleading flat/blank chart. Title Case labels throughout. */
async function insTrends() {
  const host = $('insTrends'); if (!host) return;
  let h; try { h = await api('/api/history'); } catch (_) { h = { events: [], snapshots: [] }; }
  J.history = h;
  const snaps  = (h.snapshots || []).slice();
  const events = (h.events || []).slice();

  // sparse guard — one snapshot is just "today", you need ≥2 to draw a trend
  if (snaps.length < 2) {
    host.innerHTML = `
      <div class="ins-panel trend-seed">
        <div class="ins-panel-h"><div>
          <h2 class="ins-title">Trends Over Time</h2>
          <p class="ins-sub">Velocity, status trends and gaps-over-time — built from the daily history.</p>
        </div></div>
        <div class="trend-empty">
          <span class="trend-empty-ic" aria-hidden="true">📈</span>
          <div class="trend-empty-h">History Starts Now</div>
          <div class="trend-empty-b">Trends fill in as you use Jarvis — one snapshot per day. ${snaps.length === 1 ? 'Day one is logged; come back tomorrow for the first line.' : 'Open Jarvis tomorrow to log day two.'}</div>
        </div>
      </div>`;
    return;
  }

  /* ── A) tickets-by-status over time — small stacked area/line (from snapshots) ── */
  const STK = ['Open', 'Discussing', 'Aligned', 'Investigating', 'ConfirmedLive', 'Shipped'];
  const statusArea = trendStackedArea(snaps, STK);

  /* ── B) velocity — transitions/day (from events) ── */
  const perDay = {};
  events.forEach(e => { const d = (e.ts || '').slice(0, 10); if (d) perDay[d] = (perDay[d] || 0) + 1; });
  // span every day from first snapshot to today so quiet days read as 0 (honest flatlines)
  const days = trendDateSpan(snaps[0].date, new Date().toISOString().slice(0, 10)).slice(-21);
  const velRows = days.map(d => ({ d, n: perDay[d] || 0 }));
  const velMax = Math.max(1, ...velRows.map(r => r.n));
  const velBars = velRows.map(r => {
    const hpct = Math.max(r.n ? 8 : 2, Math.round(r.n / velMax * 100));
    return `<span class="trend-velcol" title="${esc(trendNiceDay(r.d))}: ${r.n} transition${r.n === 1 ? '' : 's'}">
        <span class="trend-velbar" style="height:${hpct}%"></span>
        <span class="trend-vellbl">${esc(r.d.slice(8))}</span>
      </span>`;
  }).join('');
  const velTotal = velRows.reduce((a, r) => a + r.n, 0);

  /* ── C) gaps over time — single tonal line (from snapshots) ── */
  const gapsLine = trendLine(snaps.map(s => ({ x: s.date, y: s.gaps || 0 })), 'var(--accent)');
  const gapFirst = snaps[0].gaps || 0, gapLast = snaps[snaps.length - 1].gaps || 0;
  const gapDelta = gapLast - gapFirst;
  const gapTone  = gapDelta < 0 ? 'green' : gapDelta > 0 ? 'red' : 'muted';
  const gapWord  = gapDelta < 0 ? `▼ ${Math.abs(gapDelta)} closed` : gapDelta > 0 ? `▲ ${gapDelta} opened` : 'No change';

  host.innerHTML = `
    <div class="ins-panel trend-status">
      <div class="ins-panel-h"><div>
        <h2 class="ins-title">Tickets By Status Over Time</h2>
        <p class="ins-sub">How the board's shape has shifted across the last ${snaps.length} snapshots — one per day.</p>
      </div><span class="ov2-count">${snaps.length}d</span></div>
      <div class="trend-areawrap">${statusArea}</div>
      <div class="trend-legend">
        ${STK.map(s => `<span class="trend-legrow"><i class="trend-legdot trend-dot-${s}"></i>${esc(STATUS_LABEL[s] || s)}</span>`).join('')}
      </div>
    </div>

    <div class="ins-grid2 trend-grid">
      <div class="ins-panel trend-velocity">
        <div class="ins-panel-h"><div>
          <h2 class="ins-title">Velocity</h2>
          <p class="ins-sub">Status transitions per day — how fast the board is moving.</p>
        </div><span class="ov2-count">${velTotal} / ${days.length}d</span></div>
        <div class="trend-velchart">${velBars}</div>
      </div>

      <div class="ins-panel trend-gaps">
        <div class="ins-panel-h"><div>
          <h2 class="ins-title">Gaps Over Time</h2>
          <p class="ins-sub">App-Map gaps across the series — closing beats finding.</p>
        </div><span class="trend-delta trend-d-${gapTone}">${esc(gapWord)}</span></div>
        <div class="trend-linewrap">${gapsLine}</div>
        <div class="trend-gapscale"><span>${esc(snaps[0].date.slice(5))}</span><span>${gapLast} now</span><span>${esc(snaps[snaps.length - 1].date.slice(5))}</span></div>
      </div>
    </div>`;
}

/* ── CSS-less chart helpers (pure SVG/markup, tokens via CSS) ─────────────────── */

// inclusive list of YYYY-MM-DD between two dates (cap 120 days for safety)
function trendDateSpan(fromISO, toISO) {
  const out = []; const d = new Date(fromISO + 'T00:00:00'); const end = new Date(toISO + 'T00:00:00');
  for (let i = 0; i < 120 && d <= end; i++) { out.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1); }
  return out.length ? out : [toISO];
}
function trendNiceDay(iso) { try { return new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }); } catch (_) { return iso; } }

// stacked area of status counts across snapshots → an SVG with one <polygon> band per status.
// Each band is the cumulative stack, so they read as layers. Width spans the snapshot count.
function trendStackedArea(snaps, keys) {
  const W = 560, H = 150, PAD = 4;
  const n = snaps.length; if (n < 2) return '';
  const totals = snaps.map(s => keys.reduce((a, k) => a + ((s.byStatus && s.byStatus[k]) || 0), 0));
  const maxTotal = Math.max(1, ...totals);
  const xAt = i => PAD + i / (n - 1) * (W - 2 * PAD);
  const yAt = v => H - PAD - (v / maxTotal) * (H - 2 * PAD);
  // build cumulative upper edges per key, bottom→top
  let lower = snaps.map(() => 0);
  const bands = keys.map(k => {
    const upper = snaps.map((s, i) => lower[i] + ((s.byStatus && s.byStatus[k]) || 0));
    const top = upper.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`);
    const bot = lower.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).reverse();
    lower = upper;
    return `<polygon class="trend-band trend-fill-${k}" points="${top.concat(bot).join(' ')}"/>`;
  }).join('');
  // faint vertical gridlines at each snapshot
  const grid = snaps.map((s, i) => `<line class="trend-grid" x1="${xAt(i).toFixed(1)}" y1="${PAD}" x2="${xAt(i).toFixed(1)}" y2="${H - PAD}"/>`).join('');
  return `<svg class="trend-svg" viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="none" role="img" aria-label="Tickets by status over time">${grid}${bands}</svg>`;
}

// single tonal line + soft fill for a [{x,y}] series (gaps over time).
function trendLine(series, stroke) {
  const W = 360, H = 120, PAD = 6;
  const n = series.length; if (n < 2) return '';
  const maxY = Math.max(1, ...series.map(p => p.y));
  const xAt = i => PAD + i / (n - 1) * (W - 2 * PAD);
  const yAt = v => H - PAD - (v / maxY) * (H - 2 * PAD);
  const pts = series.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.y).toFixed(1)}`);
  const area = `${PAD},${H - PAD} ${pts.join(' ')} ${(W - PAD)},${H - PAD}`;
  const dots = series.map((p, i) => `<circle class="trend-linedot" cx="${xAt(i).toFixed(1)}" cy="${yAt(p.y).toFixed(1)}" r="2.6"/>`).join('');
  return `<svg class="trend-svg" viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="none" role="img" aria-label="Gaps over time">
      <polygon class="trend-linefill" points="${area}"/>
      <polyline class="trend-linestroke" points="${pts.join(' ')}" style="stroke:${stroke}"/>
      ${dots}
    </svg>`;
}

/* ════════════════════════ ROADMAP (now · next · shipped) ════════════════
 * A premium delivery roadmap built from the earned-state machine — no new
 * data, no `bundle` field needed. Three lanes mapped straight off status:
 *   NOW      = Aligned + Investigating  (actively being worked by CC)
 *   NEXT     = Open + Discussing        (queued; severity-sorted, P0 first)
 *   SHIPPED  = ConfirmedLive + Shipped  (proven live / done)
 * Clean horizontal kanban-roadmap. Cards → #/ticket/<id>, severity pill,
 * surface in Title Case, age. Honest where a lane is empty. Reads J.tickets.
 * ──────────────────────────────────────────────────────────────────────── */
const RM_SEVRANK = { P0: 0, P1: 1, P2: 2 };

// The three lanes, in delivery order. `tone` drives the lane's accent rail +
// header dot; `statuses` is the set of earned states it gathers.
const RM_LANES = [
  {
    id: 'now', title: 'Now', tone: 'teal',
    sub: 'Actively being worked — aligned and handed to CC, or under investigation.',
    statuses: ['Aligned', 'Investigating'],
    empty: 'Nothing in flight right now. Align a ticket on the Board to hand it to CC and it lands here.',
  },
  {
    id: 'next', title: 'Next', tone: 'amber',
    sub: 'Queued and waiting on a decision — highest severity first.',
    statuses: ['Open', 'Discussing'],
    empty: 'The queue is clear — nothing open or under discussion. The next move is yours to scope.',
  },
  {
    id: 'shipped', title: 'Recently Shipped / Confirmed', tone: 'green',
    sub: 'Proven live in the running app, or shipped and done.',
    statuses: ['ConfirmedLive', 'Shipped'],
    empty: 'Nothing confirmed live or shipped yet — fixes land here once their evidence is proven.',
  },
];

// surface id → Title Case label (surfaces are lowercase ids like "dashboard").
// "ai"/"nav" read better upper-cased; everything else is word-cased.
const rmSurface = s => {
  const v = String(s == null ? '' : s).trim();
  if (!v) return '—';
  if (v === 'ai' || v === 'nav') return v.toUpperCase();
  return v.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

// Sort within a lane: severity (P0→P2), then freshest activity first.
function rmSort(arr) {
  return arr.slice().sort((a, b) =>
    (RM_SEVRANK[a.severity] - RM_SEVRANK[b.severity]) ||
    (new Date(b.state.lastActivity || 0) - new Date(a.state.lastActivity || 0)));
}

function viewRoadmap() {
  const v = $('view'); v.className = 'view maxw'; const ts = J.tickets;

  // bucket once: every ticket falls into exactly one lane via its status
  const laneTickets = {};
  RM_LANES.forEach(l => { laneTickets[l.id] = rmSort(ts.filter(t => l.statuses.includes(t.state.status))); });
  const shipReady = ts.filter(t => t.state.status === 'ConfirmedLive').length;  // the honest "ready to ship" count

  // header summary — counts that mirror the lanes, plus the ship-ready signal
  const summary = `
    <div class="rm-summary">
      ${RM_LANES.map(l => `
        <button type="button" class="rm-sum rm-sum-${l.tone}" onclick="rmFocusLane('${l.id}')" title="Jump to ${esc(l.title)}">
          <span class="rm-sum-n">${laneTickets[l.id].length}</span>
          <span class="rm-sum-l">${esc(l.title)}</span>
        </button>`).join('')}
      <div class="rm-sum rm-sum-ship" title="Tickets with a Confirmed Live fix — ready to ship">
        <span class="rm-sum-n">${shipReady}</span>
        <span class="rm-sum-l">Ship-Ready</span>
      </div>
    </div>`;

  v.innerHTML = `
    <header class="rm-head">
      <div>
        <h1>Roadmap</h1>
        <p class="subtitle">The whole project as a delivery flow — what's moving now, what's queued next, and what's landed. Built live from each ticket's earned status. Tap any card to open it.</p>
      </div>
      <a class="rm-head-link" href="#/planning">Open Planning →</a>
    </header>
    ${summary}
    <div class="rm-lanes">
      ${RM_LANES.map(l => rmLane(l, laneTickets[l.id])).join('')}
    </div>`;
}

// One lane = header (title · count · dot) + its sorted cards (or an honest empty).
function rmLane(lane, tickets) {
  return `<section class="rm-lane rm-lane-${lane.tone}" id="rm-lane-${lane.id}">
    <div class="rm-lane-h">
      <span class="rm-lane-dot" aria-hidden="true"></span>
      <span class="rm-lane-title">${esc(lane.title)}</span>
      <span class="rm-lane-ct">${tickets.length}</span>
    </div>
    <p class="rm-lane-sub">${esc(lane.sub)}</p>
    <div class="rm-lane-body">
      ${tickets.length
        ? tickets.map(rmCard).join('')
        : `<div class="rm-empty"><span class="rm-empty-dot" aria-hidden="true"></span>${esc(lane.empty)}</div>`}
    </div>
  </section>`;
}

// A roadmap card — clickable → ticket, severity pill, status pill, surface (Title
// Case) + age in the foot. Mirrors the .plan-card language (premium, hover-lift).
function rmCard(t) {
  const st = t.state;
  return `<article class="rm-card ${sevCls(t.severity)}" role="button" tabindex="0"
      onclick="location.hash='#/ticket/${t.id}'"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();location.hash='#/ticket/${t.id}'}">
    <div class="rm-card-top">
      <span class="pill sm ${sevCls(t.severity)}">${t.severity}</span>
      <span class="pill sm s-${st.status}">${STATUS_LABEL[st.status]}</span>
      <span class="rm-card-go" aria-hidden="true">→</span>
    </div>
    <div class="rm-card-t">${esc(t.title)}</div>
    <div class="rm-card-foot">
      <span class="rm-card-surface">${esc(rmSurface(t.group || t.surface))}</span>
      <span class="rm-card-dot">·</span>
      <span class="rm-card-id">${t.id}</span>
      <span class="rm-card-age">active ${ago(st.lastActivity)}</span>
    </div>
  </article>`;
}

// Summary chip → scroll its lane into view + a brief highlight (no re-render).
function rmFocusLane(id) {
  const el = $('rm-lane-' + id); if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.classList.add('rm-flash');
  setTimeout(() => el.classList.remove('rm-flash'), 900);
}

/* ════════════════════════ RECOMMEND (Jarvis: what to ship next) ══════════
 * Jarvis proactively ranks every NON-shipped ticket by LEVERAGE — a weighted
 * blend of severity, age, readiness, surface-criticality and link/blast. It then
 * surfaces (a) anything Confirmed Live as "ship it now", and (b) the top ~8 to
 * pick up next, each with the WHY (the factors that ranked it) + quick actions.
 *
 * Pure read model: scoreTicket() is deterministic from a ticket's own fields, so
 * the ranking is explainable — every points line traces back to a named factor.
 * ──────────────────────────────────────────────────────────────────────────── */

// ── scoring weights ──────────────────────────────────────────────────────────
// Each factor returns a 0..1 "intensity", multiplied by its WEIGHT (the max points
// that factor can contribute). Total max ≈ 100. Tuned so SEVERITY and READINESS
// dominate (what + how-ready), AGE and SURFACE modulate (how-urgent + how-much-it-
// -touches-money), and BLAST is a tie-breaker (how-many-things-hang-off-it).
const REC_WEIGHTS = {
  severity:   32,   // P0 vs P2 — biggest lever. What's actually critical.
  readiness:  26,   // how close to landing. ConfirmedLive = "ship now"; Open = needs John.
  age:        14,   // open-staleness. Older untouched tickets rot — nudge them up.
  surface:    12,   // cash-surface criticality. Money surfaces outrank cosmetic ones.
  dependency: 16,   // (a) — real dependency-leverage: closesWith + blocks + gates-an-epic. The "next-move = unblocks the most" signal. Replaces the old blast=links/4 (8pt tie-breaker), bumped to a primary lever.
};

// SEVERITY intensity — P0 critical, P1 high, P2 normal.
const REC_SEV = { P0: 1.0, P1: 0.6, P2: 0.28 };

// READINESS intensity — how far along the earned-state machine a ticket is.
// ConfirmedLive tops it: the fix is PROVEN live, it just needs the ship gesture
// ("ship it now"). Aligned/Investigating are in CC's hands (in flight). Open/
// Discussing still need John's judgment, which is itself high-leverage attention.
const REC_READY = {
  ConfirmedLive: 1.0,    // proven live → ship it now
  Investigating: 0.62,   // CC is on it
  Aligned:       0.70,   // handed off, freshest in-flight intent
  Gathering:     0.60,   // drones building the case — close to a decision
  Discussing:    0.55,   // needs John — a decision unblocks it
  Open:          0.50,   // needs John — untriaged
};

// SURFACE criticality — the cash surfaces touch money, so a bug there is felt
// daily and directly. These outrank cosmetic/meta surfaces. Keyed by group id.
const REC_CASH = new Set(['savings', 'bills', 'debts', 'plan', 'dashboard']);
const REC_SURFACE = g => REC_CASH.has(g) ? 1.0
  : (g === 'analysis' || g === 'ai') ? 0.55      // money-adjacent (reads/explains cash)
  : 0.32;                                          // settings / nav / planning / other

// AGE intensity — days a ticket has been open, saturating at ~21 days so a single
// ancient ticket can't run away with the ranking. Newer = lower; week-old = high.
function recAgeIntensity(openedIso) {
  if (!openedIso) return 0.3;
  const days = Math.max(0, (Date.now() - new Date(openedIso)) / 86400000);
  return Math.min(1, days / 21);                   // 0d→0, 21d+→1, linear between
}

// (a) DEPENDENCY-LEVERAGE intensity — real signal, not raw link count. Counts other tickets that
// closeWith this one (close when it ships) + tickets blocked-BY this one (clearing it unblocks them).
// Bumps for "gates an epic" (a child of an epic that's itself unblocked = the next move on that epic).
// Saturates at 5 dependents. Returns the breakdown so the WHY line can name the specific leverage.
function recDependencyLeverage(t) {
  const ts = J.tickets || [];
  let closes = 0, unblocks = 0;
  ts.forEach(o => {
    if (!o || o.id === t.id) return;
    const cw = ((o.caseFile || {}).organize || {}).closesWith || [];
    if (cw.includes(t.id)) closes++;
    if ((o.blockedBy || []).includes(t.id)) unblocks++;
  });
  const blocked = (t.blockedBy || []).some(b => { const x = ts.find(y => y.id === b); return x && (x.state || {}).status !== 'Shipped'; });
  const gatesEpic = !!t.epic && !blocked;
  let intensity = Math.min(1, (closes + unblocks) / 5);
  if (gatesEpic && intensity < 1) intensity = Math.min(1, intensity + 0.2);
  return { closes, unblocks, gatesEpic, intensity };
}

// Score one ticket. Returns { total, factors:[{key,label,pts,why}] } so the view
// can show BOTH the number and the human "why". factors are sorted by pts desc.
function scoreTicket(t) {
  const st = t.state || {};
  const cash = REC_CASH.has(t.group);
  const dep = recDependencyLeverage(t);   // (a) — closes/unblocks/gates-an-epic; replaces raw blast
  const f = [
    { key: 'severity', label: 'Severity',
      i: REC_SEV[t.severity] != null ? REC_SEV[t.severity] : 0.4,
      why: t.severity === 'P0' ? 'P0 · critical' : t.severity === 'P1' ? 'P1 · high' : 'P2 · normal' },
    { key: 'readiness', label: 'Readiness',
      i: REC_READY[st.status] != null ? REC_READY[st.status] : 0.4,
      why: st.status === 'ConfirmedLive' ? 'verified live — ship it'
         : st.status === 'Aligned' ? 'aligned — handed to CC'
         : st.status === 'Investigating' ? 'CC investigating'
         : 'needs your judgment' },
    { key: 'surface', label: 'Surface',
      i: REC_SURFACE(t.group),
      why: cash ? 'cash surface (' + niceSurface(t.group) + ')' : niceSurface(t.group) + ' surface' },
    { key: 'age', label: 'Age',
      i: recAgeIntensity(st.opened),
      why: 'open ' + ago(st.opened) },
    { key: 'dependency', label: 'Dependency', i: dep.intensity,
      why: (dep.closes || dep.unblocks)
        ? [dep.closes ? 'closes ' + dep.closes + ' when shipped' : '', dep.unblocks ? 'unblocks ' + dep.unblocks : '', dep.gatesEpic ? 'gates an epic' : ''].filter(Boolean).join(' · ')
        : (dep.gatesEpic ? 'gates an epic' : 'no dependents') },
  ];
  let total = 0;
  const factors = f.map(x => {
    const pts = Math.round(x.i * REC_WEIGHTS[x.key]);
    total += pts;
    return { key: x.key, label: x.label, pts, why: x.why };
  }).sort((a, b) => b.pts - a.pts);
  return { total, factors };
}

// The top reasons line — the 2-3 factors that ranked it, in plain English.
// Always leads with severity if P0/P1, then the next-strongest non-trivial factors.
function recWhy(scored) {
  // keep factors that actually contributed meaningfully (>= 4 pts), max 3
  const top = scored.factors.filter(x => x.pts >= 4).slice(0, 3);
  return (top.length ? top : scored.factors.slice(0, 2)).map(x => x.why).join(' · ');
}

function viewRecommend() {
  const v = $('view'); v.className = 'view maxw';
  const ts = J.tickets || [];

  // score every NON-shipped ticket; rank by leverage (ties → severity, then fresher)
  const ranked = ts
    .filter(t => t.state && t.state.status !== 'Shipped')
    .map(t => ({ t, s: scoreTicket(t) }))
    .sort((a, b) =>
      (b.s.total - a.s.total) ||
      (SEVRANK[a.t.severity] - SEVRANK[b.t.severity]) ||
      (new Date(b.t.state.lastActivity || 0) - new Date(a.t.state.lastActivity || 0)));

  const shipReady = ranked.filter(x => x.t.state.status === 'ConfirmedLive');
  // What John is actively working on (in flight) vs what's queued (open, by priority).
  const WORKING = ['Gathering', 'Discussing', 'Aligned', 'Investigating'];
  const working = ranked.filter(x => WORKING.includes(x.t.state.status));
  const nextUp = ranked.filter(x => x.t.state.status === 'Open').slice(0, 8);
  const top = ranked.length ? ranked[0] : null;
  const maxScore = ranked.length ? ranked[0].s.total : 1;

  // Jarvis-voice opener — adapts to what's actually on the board.
  const voice = !ranked.length
    ? `Everything's shipped — there's nothing for me to recommend right now. Clean board.`
    : shipReady.length
      ? `Here's where I'd put your attention next. ${shipReady.length} fix${shipReady.length === 1 ? ' is' : 'es are'} verified live and ready to ship — I'd clear ${shipReady.length === 1 ? 'it' : 'those'} first, then work down the ranked list.`
      : `Here's where I'd put your attention next. Nothing's ship-ready yet, so the highest-leverage move is ${top.t.state.status === 'Open' || top.t.state.status === 'Discussing' ? 'a decision from you on ' + top.t.id : 'pushing ' + top.t.id + ' forward'}.`;

  // ── Ship-Ready Now callout ──────────────────────────────────────────────
  const shipReadyBlock = shipReady.length ? `
    <section class="rec-shipready">
      <div class="rec-sr-head">
        <span class="rec-sr-ic" aria-hidden="true">✓</span>
        <div>
          <h2 class="rec-sr-title">Ship-Ready Now</h2>
          <p class="rec-sr-sub">Verified live in the running app — these earned Confirmed Live. Ship them.</p>
        </div>
        <span class="rec-sr-count">${shipReady.length}</span>
      </div>
      <div class="rec-sr-list">
        ${shipReady.map(x => recShipRow(x.t, x.s)).join('')}
      </div>
    </section>` : '';

  // ── What you're working on (in flight) ──────────────────────────────────
  const workingBlock = working.length ? `
    <section class="rec-working">
      <div class="rec-next-head">
        <div>
          <h2 class="rec-next-title">What you're working on</h2>
          <p class="rec-next-sub">In flight — discussing, aligned, and under investigation. Pick up where you left off.</p>
        </div>
        <span class="rec-next-count">${working.length}</span>
      </div>
      <div class="rec-list">${working.map(x => recWorkRow(x.t)).join('')}</div>
    </section>` : '';

  // ── Next up — open tickets by priority (pull when you have capacity) ─────
  const nextBlock = `
    <section class="rec-next">
      <div class="rec-next-head">
        <div>
          <h2 class="rec-next-title">Next up — by priority</h2>
          <p class="rec-next-sub">Open tickets you haven't started, ranked by leverage — severity, money impact, and what hangs off them. Pull from here when you have capacity.</p>
        </div>
        <span class="rec-next-count">${nextUp.length}</span>
      </div>
      <div class="rec-list">
        ${nextUp.length
          ? nextUp.map((x, i) => recRow(x.t, x.s, i + 1, maxScore)).join('')
          : `<div class="rec-empty"><span class="rec-empty-dot" aria-hidden="true"></span>No unstarted tickets — you're caught up on the open queue.</div>`}
      </div>
    </section>`;

  v.innerHTML = `
    <header class="rec-head">
      <div>
        <h1>Jarvis Recommends</h1>
        <p class="subtitle">What I'd ship next — every open ticket ranked by leverage, with the reasoning shown.</p>
      </div>
      <a class="rec-head-link" href="#/roadmap">Open Roadmap →</a>
    </header>

    <div class="rec-voice">
      <span class="rec-voice-av" aria-hidden="true">Jv</span>
      <p class="rec-voice-txt">${esc(voice)}</p>
    </div>

    ${shipReadyBlock}
    ${workingBlock}
    ${nextBlock}`;
}
// Compact "working on" row — status + severity + title + surface + last-touched → ticket.
function recWorkRow(t) {
  const st = t.state || {};
  return `<div class="rec-work-row" role="button" tabindex="0"
      onclick="location.hash='#/ticket/${t.id}'"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();location.hash='#/ticket/${t.id}'}">
    <span class="pill sm s-${st.status}">${STATUS_LABEL[st.status] || st.status}</span>
    <span class="pill sm ${sevCls(t.severity)}">${t.severity}</span>
    <span class="rec-work-t">${esc(t.title)}</span>
    <span class="rec-work-surface">${esc(niceSurface(t.group || t.surface))}</span>
    <span class="rec-work-meta">${ago(st.lastActivity)}</span>
    <span class="rec-sr-go" aria-hidden="true">Open →</span>
  </div>`;
}

// Ship-ready row — green, "ship it now" framing. Whole row → ticket.
function recShipRow(t, scored) {
  return `<div class="rec-sr-row" role="button" tabindex="0"
      onclick="location.hash='#/ticket/${t.id}'"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();location.hash='#/ticket/${t.id}'}">
    <span class="pill sm ${sevCls(t.severity)}">${t.severity}</span>
    <span class="rec-sr-t">${esc(t.title)}</span>
    <span class="rec-sr-surface">${esc(niceSurface(t.group || t.surface))}</span>
    <span class="rec-sr-id">${t.id}</span>
    <span class="rec-sr-go" aria-hidden="true">Ship →</span>
  </div>`;
}

// Recommended row — rank chip · title · WHY line · score · quick actions.
// score is shown as both the number and a leverage bar (relative to the top score).
function recRow(t, scored, rank, maxScore) {
  const st = t.state || {};
  const pct = Math.max(6, Math.round(scored.total / Math.max(1, maxScore) * 100));
  const aligned = st.status === 'Aligned' || st.status === 'Investigating';
  const needsJohn = st.status === 'Open' || st.status === 'Discussing';
  return `<div class="rec-row ${sevCls(t.severity)}" role="button" tabindex="0"
      onclick="location.hash='#/ticket/${t.id}'"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();location.hash='#/ticket/${t.id}'}">
    <span class="rec-rank">${rank}</span>
    <div class="rec-body">
      <div class="rec-rowtop">
        <span class="rec-t">${esc(t.title)}</span>
        <span class="pill sm s-${st.status}">${STATUS_LABEL[st.status]}</span>
      </div>
      <div class="rec-meta">
        <span class="pill sm ${sevCls(t.severity)}">${t.severity}</span>
        <span class="rec-why">${esc(recWhy(scored))}</span>
        <span class="rec-id">${t.id}</span>
      </div>
    </div>
    <div class="rec-scorewrap" title="Leverage = how much this is worth doing now: severity + how much money it touches + readiness + how many other tickets hang off it. Higher = sooner. (${scored.total} of ${maxScore})">
      <div class="rec-score-n">${scored.total}</div>
      <div class="rec-score-l">leverage ⓘ</div>
      <div class="rec-score-track"><div class="rec-score-fill" style="width:${pct}%"></div></div>
    </div>
    <div class="rec-actions" onclick="event.stopPropagation()">
      <a class="rec-act" href="#/ticket/${t.id}">Open →</a>
      ${aligned ? `<span class="rec-dispatch-hint" title="Aligned — handed to CC. Open the ticket to view the handoff or dispatch a drone.">▶ Dispatch-ready</span>` : ''}
      ${needsJohn ? `<span class="rec-needs-hint" title="Open or discussing — a decision from you unblocks it.">Needs you</span>` : ''}
    </div>
  </div>`;
}

/* ════════════════════════ COMMAND DECK ══════════════════════════════════
 * Agent Library + Prompt Library. One route (#/command), two tabs.
 * - Walk Drone DEPLOYS for real: action('runWalk',{group}) then polls
 *   /api/walklog (same shape app.js uses: { lines, running }). Honest label.
 * - Every other agent's Deploy COPIES a CC mission prompt (no autonomous
 *   spawn without CC). Modal + Copy button, ticket context optional.
 * - Prompts come from GET /api/prompts (server seeds defaults if the file is
 *   missing). John can ADD/EDIT/DELETE templates → action('savePrompts',{list}).
 * State lives on J.* (added lazily — no edit to the J literal required).
 * ──────────────────────────────────────────────────────────────────────── */

// The 9 real walk surfaces (mirror of specs.json "groups"; only these are valid
// runWalk scopes server-side). Label = Title Case; value = the group id.
const CMD_WALK_GROUPS = [
  ['',          'All Runnable Surfaces'],
  ['dashboard', 'Dashboard'], ['bills', 'Bills'], ['savings', 'Savings'],
  ['plan', 'Plan'], ['ai', 'AI'], ['analysis', 'Analysis'],
  ['debts', 'Debts'], ['settings', 'Settings'], ['nav', 'Navigation'],
];

// The agent roster. `kind:'walk'` is the one that runs for real; the rest are
// `kind:'prompt'` — Deploy copies a CC mission prompt built from `template`.
// {ticket} / {group} / {topic} placeholders fill from the deploy modal.
const CMD_AGENTS = [
  {
    id: 'walk-drone', name: 'Walk Drone', kind: 'walk', glyph: '◎', tone: 'teal',
    role: 'Drives the running app and screenshots every step',
    produces: 'A walk dir under tests/walker-out — per-flow steps, deltas, lands[], PNG captures',
    inputs: 'A surface scope (or all runnable). Reads the app live; writes nothing to state.',
  },
  {
    id: 'trace-drone', name: 'Trace Drone', kind: 'prompt', glyph: '◇', tone: 'violet',
    role: 'Maps one surface IS-vs-SHOULD — what it does now vs what the spec says it should',
    produces: 'A gap list for the surface (each gap → a candidate ticket on the Board)',
    inputs: 'A surface + its walk evidence. Reads FEATURE-MAP + the flow.',
    template:
`Trace the {group} surface — IS vs SHOULD.

Read the {group} walk evidence (latest tests/walker-out flow for this surface) and
its row in FEATURE-MAP.md. For each thing the surface SHOULD do (per the spec /
invariants), state what it ACTUALLY does now from the walk steps + lands[]. List
every divergence as a numbered gap: symptom · which INV-NN it touches (if any) ·
file:line · suggested severity (P0/P1/P2). Plain English, real names. Do NOT code —
report the gap list so I can open tickets.{ticketCtx}`,
  },
  {
    id: 'auditor', name: 'Auditor', kind: 'prompt', glyph: '✓', tone: 'green',
    role: 'Verifies a finding is real and live — strongest-test-first, not a label',
    produces: 'A PASS/FAIL verdict with the evidence that proves it (or disproves it)',
    inputs: 'A ticket / claim. Runs the strongest simulation (close+replay storageState).',
    template:
`Audit this finding — is it real and live?

Verify with strongest-test-first discipline: skip weak rounds, go straight to the
strongest simulation (close + replay storageState, not page.reload). Walk S.txns
(Ledger Walk Step 0) before promoting any state-derived claim. Return a PASS/FAIL
verdict with the exact evidence that proves it in the RUNNING app — fixture date +
fresh:yes/no. Name the state source explicitly. No "looks like" without follow-up.{ticketCtx}`,
  },
  {
    id: 'ux-expert', name: 'UX Expert', kind: 'prompt', glyph: '◈', tone: 'amber',
    role: 'Premium-feel UX review on a 380px phone viewport',
    produces: 'A prioritised UX punch-list — contrast, info-density, touch targets, motion',
    inputs: 'A surface or capture set. Reviews against slyght premium-feel discipline.',
    template:
`Premium UX review of the {group} surface (380×660 phone viewport).

Check: text contrast (numbers always --text, never small --text3 on --bg3/4);
info-density (4-question check before any inline breakdown — tap-for-detail beats
clutter); 44×44 touch targets; "alive" micro-motion without jank; plain-English
labels, real names. Return a prioritised punch-list (P0/P1/P2) with the concrete
visible outcome for each, not CSS jargon.{ticketCtx}`,
  },
  {
    id: 'integrator', name: 'Integrator', kind: 'prompt', glyph: '⛓', tone: 'blue',
    role: 'Merges built parts into index.html surgically and keeps invariants green',
    produces: 'One atomic integration + Guardian-green gate + a phone-verify block',
    inputs: 'The built parts (drop-in blocks). Audits readers before any shape change.',
    template:
`Integrate the built parts into index.html.

Read the target bytes FIRST, then ONE atomic edit per block — no intermediate
_OBSOLETE_ placeholders. Before any value-shape change, grep every reader. Route
through canonical writers + BRAIN.SOURCES tags + audit log. Gate on full Guardian
(npm run guardian — all + static + runtime) and the boot self-test. End with a
PASS/FAIL phone-verify block (Open · Do · PASS · FAIL).{ticketCtx}`,
  },
];

const cmdAgent = id => CMD_AGENTS.find(a => a.id === id);
const cmdGroupLabel = g => (CMD_WALK_GROUPS.find(x => x[0] === g) || [g, g])[1];

/* ════════════════════════ DEPLOY (the careful last mile) ════════════════════
 * Surfaces the prod state + the ONE irreversible action (server deploy() → git push,
 * RULE 6, confirm-gated). Reads /api/gitstatus (now upstream-aware). The push lives
 * behind a TYPED-confirm modal mirroring Dispatch/Delete: type `deploy` to arm.
 * Never runs on its own; never auto-fires; this is the only way prod changes go live.
 * ──────────────────────────────────────────────────────────────────────────── */
async function viewDeploy() {
  const v = $('view'); v.className = 'view maxw';
  v.innerHTML = `
    <header class="dep-head">
      <div>
        <h1>Deploy</h1>
        <p class="subtitle">The careful last mile — the one irreversible action. This runs
          <code>git push</code> from your local repo and is the only way prod changes go live.</p>
      </div>
      <button class="dep-refresh" type="button" onclick="depRefresh()" title="Re-read git state">
        <span aria-hidden="true">⟳</span> Refresh
      </button>
    </header>
    <div id="depBody"><div class="dep-loading">Reading git state…</div></div>`;
  await depLoad();
}

// Pull /api/gitstatus into J.dep, then paint. Used by the view + the Refresh button +
// the post-push refresh (same reload+re-render contract as the rest of the app).
async function depLoad() {
  try { J.dep = await api('/api/gitstatus'); }
  catch (e) { const b = $('depBody'); if (b) b.innerHTML = `<div class="dep-err">Couldn't read git state — is the server running? <span>${esc(e.message || e)}</span></div>`; return; }
  try { J.depWt = await api('/api/worktree'); } catch (_) { J.depWt = { exists: false }; }   // fixes staged on the main worktree
  try { J.depLog = await api('/api/deploylog'); } catch (_) { J.depLog = { deploys: [] }; }   // pushes → live tracking
  depRender();
}
// Deploy-status tracking — after a push, poll the live site (server probe) until it confirms LIVE.
async function depCheckStatus(silent) {
  try { const r = await action('deployStatus', {}); if (r && r.deploy) { J.depLog = J.depLog || { deploys: [] }; J.depLog.deploys = [r.deploy, ...((J.depLog.deploys || []).slice(1))]; } if (!silent && r && r.deploy && r.deploy.status === 'live') toast('Live on GitHub Pages ✓', 'ok'); }
  catch (_) {}
  if ((location.hash || '').includes('/deploy')) depRender();
}
function depStartStatusPoll() {
  if (J._depPoll) clearInterval(J._depPoll);
  let n = 0;
  J._depPoll = setInterval(async () => {
    n++;
    const d = (J.depLog && J.depLog.deploys || [])[0];
    if (!d || d.status === 'live' || n > 40) { clearInterval(J._depPoll); J._depPoll = null; return; }   // stop at live or ~10 min
    await depCheckStatus(true);
  }, 15000);
}
async function depRefresh() { const b = $('depBody'); if (b) b.innerHTML = `<div class="dep-loading">Re-reading git state…</div>`; await depLoad(); }

function depRender() {
  const g = J.dep || {};
  const body = $('depBody'); if (!body) return;

  const branch     = g.branch || '(detached / unknown)';
  const hasUp      = g.hasUpstream === true;
  const upstream   = g.upstream || null;
  const ahead      = hasUp ? (g.ahead || 0) : 0;
  const dirty      = Array.isArray(g.dirty) ? g.dirty : [];
  const dirtyN     = dirty.length;
  const unpushed   = Array.isArray(g.unpushed) ? g.unpushed : [];
  // SAFETY: only `main` is a deploy branch. On the cockpit branch (mission-control) a push would
  // publish the tool to the live app — the server hard-refuses, and the UI blocks + explains here.
  const isDeploy = (DEPLOY_BRANCHES_C).includes(branch);

  // The three deploy states:
  //   1. NO UPSTREAM  — branch tracks no remote. CANNOT push with a bare `git push`.
  //                     Button disabled; explain the branch has never been pushed.
  //   2. NOTHING AHEAD — upstream exists, 0 commits ahead. Button disabled, "Nothing to push".
  //   3. READY         — upstream exists, ≥1 commit ahead. Button armed (behind typed confirm).
  const state = !hasUp ? 'no-upstream' : ahead === 0 ? 'nothing' : 'ready';

  // ── status hero ──
  const upRow = hasUp
    ? `<div class="dep-stat"><span class="dep-stat-k">Tracking</span>
         <span class="dep-stat-v dep-ok">${esc(upstream)}</span></div>`
    : `<div class="dep-stat dep-stat-warn"><span class="dep-stat-k">Tracking</span>
         <span class="dep-stat-v dep-warn">No upstream — branch not on a remote</span></div>`;

  const aheadRow = !hasUp
    ? `<div class="dep-stat"><span class="dep-stat-k">Ahead of origin</span>
         <span class="dep-stat-v dep-muted">— (no remote)</span></div>`
    : `<div class="dep-stat"><span class="dep-stat-k">Ahead of origin</span>
         <span class="dep-stat-v ${ahead ? 'dep-accent' : 'dep-muted'}">${ahead} commit${ahead === 1 ? '' : 's'}</span></div>`;

  const dirtyRow = `<div class="dep-stat"><span class="dep-stat-k">Uncommitted changes</span>
      <span class="dep-stat-v ${dirtyN ? 'dep-warn' : 'dep-ok'}">${dirtyN ? dirtyN + ' file' + (dirtyN === 1 ? '' : 's') : 'Working tree clean'}</span></div>`;

  // ── unpushed commit list (subjects only — sha stripped for readability) ──
  const commitList = unpushed.length
    ? `<div class="dep-commits">
         <div class="dep-commits-h">${ahead} commit${ahead === 1 ? '' : 's'} waiting to ship</div>
         <ul class="dep-commitlist">
           ${unpushed.slice(0, 30).map(line => {
             const sp = line.indexOf(' ');
             const sha = sp > 0 ? line.slice(0, sp) : '';
             const subj = sp > 0 ? line.slice(sp + 1) : line;
             return `<li><code class="dep-sha">${esc(sha)}</code> <span class="dep-subj">${esc(subj)}</span></li>`;
           }).join('')}
           ${unpushed.length > 30 ? `<li class="dep-more">+${unpushed.length - 30} more…</li>` : ''}
         </ul>
       </div>`
    : '';

  // ── dirty file note (count + first few names; informational, NOT a blocker — git push
  //    only ships committed work, so uncommitted files simply won't go) ──
  const dirtyNote = dirtyN
    ? `<div class="dep-dirtynote">
         <b>${dirtyN} uncommitted file${dirtyN === 1 ? '' : 's'}</b> in the working tree — these
         <b>won't</b> be pushed (only committed work ships). Commit them first if they should go live.
         <div class="dep-dirtyfiles">${dirty.slice(0, 8).map(l => `<code>${esc(l)}</code>`).join('')}${dirtyN > 8 ? `<span class="dep-more">+${dirtyN - 8} more</span>` : ''}</div>
       </div>`
    : '';

  // ── staged fixes on the main worktree (execute-fix commits) — the real ship path when the cockpit
  //    checkout is on mission-control. The deploy action pushes from wherever main is checked out.
  const wt = J.depWt || {};
  const wtReady = !!(wt.exists && wt.ahead > 0 && !isDeploy);
  const wtSection = (wt.exists && wt.ahead > 0) ? `
    <div class="dep-wt">
      <div class="dep-wt-h"><span aria-hidden="true">◎</span> ${wt.ahead} fix${wt.ahead === 1 ? '' : 'es'} staged on the <code>main</code> worktree — ready to ship</div>
      <ul class="dep-commitlist">${(wt.commits || []).slice(0, 20).map(line => {
        const sp = line.indexOf(' '); const sha = sp > 0 ? line.slice(0, sp) : ''; const subj = sp > 0 ? line.slice(sp + 1) : line;
        const m = subj.match(/^(SLY-\d+)/); const tk = m && get(m[1]);
        return `<li><code class="dep-sha">${esc(sha)}</code> <span class="dep-subj">${esc(subj)}</span>${tk ? ` <a class="dep-tkt" href="#/ticket/${m[1]}">${m[1]} →</a>` : ''}</li>`;
      }).join('')}</ul>
      ${wt.diffstat ? `<div class="dep-wt-stat">${esc(wt.diffstat)}</div>` : ''}
      <div class="dep-wt-note">Cockpit (<code>${esc(branch)}</code>) is untouched. Review the diff in <code>slyght-deploy</code>, then push — it ships from the worktree's <code>main</code>.</div>
    </div>` : '';

  // ── branch-safety banner — the live app ships from `main`; the cockpit lives on `mission-control`.
  const branchBanner = isDeploy
    ? `<div class="dep-branchbar dep-bb-ok"><b>✓ On the deploy branch (${esc(branch)}).</b> A push here updates the live app.</div>`
    : wtReady
      ? `<div class="dep-branchbar dep-bb-ok"><b>✓ ${wt.ahead} fix${wt.ahead === 1 ? '' : 'es'} ready on the main worktree.</b> The cockpit (<code>${esc(branch)}</code>) is untouched; the push ships from the worktree's <code>main</code>.</div>`
      : `<div class="dep-branchbar dep-bb-bad"><b>⛔ You're on <code>${esc(branch)}</code>, not a deploy branch, and nothing is staged on the main worktree.</b> Run Execute-fix on an aligned ticket to stage a change; pushing the cockpit is hard-refused.</div>`;

  // ── the push button — armed when on a deploy branch + ahead, OR when fixes are staged on the worktree.
  let pushBtn, hint;
  if (wtReady) {
    pushBtn = `<button class="dep-push dep-push-ready" onclick="depAskPush()"><span class="dep-push-ic" aria-hidden="true">⬆</span> Ship ${wt.ahead} fix${wt.ahead === 1 ? '' : 'es'} to GitHub</button>`;
    hint = `<div class="dep-hint">Pushes <b>${wt.ahead} commit${wt.ahead === 1 ? '' : 's'}</b> from the main worktree to <code>origin/main</code> — the live app. You'll type <code>deploy</code> to confirm; nothing fires until then.</div>`;
  } else if (!isDeploy) {
    pushBtn = `<button class="dep-push" disabled title="Pushing is blocked on a non-deploy branch"><span class="dep-push-ic" aria-hidden="true">⬆</span> Push to GitHub</button>`;
    hint = `<div class="dep-hint dep-hint-warn">Push is <b>blocked</b> on <code>${esc(branch)}</code>, and nothing is staged on the main worktree. Only <code>${DEPLOY_BRANCHES_C[0]}</code> may ship — so the cockpit can never reach your live app by accident.</div>`;
  } else if (state === 'no-upstream') {
    pushBtn = `<button class="dep-push" disabled title="This branch has no remote tracking branch">
        <span class="dep-push-ic" aria-hidden="true">⬆</span> Push to GitHub</button>`;
    hint = `<div class="dep-hint dep-hint-warn">Branch <code>${esc(branch)}</code> has no upstream. A bare
      <code>git push</code> won't know where to go. Set a remote first (e.g.
      <code>git push -u origin ${esc(branch)}</code> from your terminal), then this button will arm.</div>`;
  } else if (state === 'nothing') {
    pushBtn = `<button class="dep-push" disabled title="Nothing to push">
        <span class="dep-push-ic" aria-hidden="true">⬆</span> Push to GitHub</button>`;
    hint = `<div class="dep-hint">Nothing to push — <code>${esc(branch)}</code> is level with
      <code>${esc(upstream)}</code>. Prod is up to date.</div>`;
  } else {
    pushBtn = `<button class="dep-push dep-push-ready" onclick="depAskPush()">
        <span class="dep-push-ic" aria-hidden="true">⬆</span> Push to GitHub</button>`;
    hint = `<div class="dep-hint">Pushes <b>${ahead} commit${ahead === 1 ? '' : 's'}</b> to
      <code>${esc(upstream)}</code>. You'll type <code>deploy</code> to confirm — nothing fires until then.</div>`;
  }

  // ── deploy-status tracking — the last push and whether it's actually live yet ──
  const lastDep = (J.depLog && J.depLog.deploys || [])[0] || null;
  const depStatusSection = lastDep ? (() => {
    const st = lastDep.status || 'building';
    const cls = st === 'live' ? 'dep-ds-live' : (lastDep.probeError ? 'dep-ds-err' : 'dep-ds-building');
    const badge = st === 'live' ? '✓ LIVE' : (lastDep.probeError ? '⚠ probe failed' : '◷ Building…');
    const when = (iso) => { try { return new Date(iso).toLocaleString(); } catch (_) { return iso; } };
    const tks = (lastDep.tickets || []).map(id => `<a class="dep-tkt" href="#/ticket/${esc(id)}">${esc(id)}</a>`).join(' ');
    return `
    <div class="dep-ds ${cls}">
      <div class="dep-ds-h"><span class="dep-ds-badge">${badge}</span> Last deploy &mdash; <code>${esc((lastDep.sha || '').slice(0, 7))}</code> to <code>${esc(lastDep.branch || 'main')}</code>${tks ? ' · ' + tks : ''}</div>
      <div class="dep-ds-pipe">
        <span class="dep-ds-step done">Pushed ${esc(when(lastDep.ts))}</span>
        <span class="dep-ds-arrow">→</span>
        <span class="dep-ds-step ${st === 'live' ? 'done' : 'active'}">GitHub Pages ${st === 'live' ? 'deployed' : 'building'}</span>
        <span class="dep-ds-arrow">→</span>
        <span class="dep-ds-step ${st === 'live' ? 'done' : ''}">Live${lastDep.liveAt ? ' ' + esc(when(lastDep.liveAt)) : ''}</span>
        <span class="dep-ds-arrow">→</span>
        <span class="dep-ds-step phone">Your phone (refresh the app)</span>
      </div>
      ${st === 'live'
        ? `<div class="dep-ds-note">Live at <a href="${esc(lastDep.liveUrl || 'https://xetonx.github.io/slyght/')}" target="_blank" rel="noopener">the site</a>. On your S23: fully close the slyght app (swipe it away) and reopen — twice if needed — so the service worker picks up the new version.</div>`
        : `<div class="dep-ds-note">${lastDep.probeError ? 'Could not reach the live site to confirm (' + esc(String(lastDep.probeError).slice(0, 80)) + '). ' : 'GitHub Actions builds + deploys Pages (~1–2 min). '}<button class="btn sm" onclick="depCheckStatus(false)">Check now</button></div>`}
    </div>`;
  })() : '';

  body.innerHTML = `
    ${depStatusSection}
    ${branchBanner}
    ${wtSection}
    <div class="dep-grid">
      <div class="dep-main">
        <div class="dep-card dep-state-${state}">
          <div class="dep-card-h">
            <span class="dep-branch-ic" aria-hidden="true">⎇</span>
            <div>
              <div class="dep-branch">${esc(branch)}</div>
              <div class="dep-branch-sub">${hasUp ? 'tracking ' + esc(upstream) : 'local only — no remote'}</div>
            </div>
            <span class="dep-state-badge dep-badge-${state}">${state === 'ready' ? 'Ready to push' : state === 'nothing' ? 'Up to date' : 'No remote'}</span>
          </div>
          <div class="dep-stats">${upRow}${aheadRow}${dirtyRow}</div>
        </div>
        ${commitList}
        ${dirtyNote}
      </div>
      <aside class="dep-side">
        <div class="dep-pushcard">
          ${pushBtn}
          ${hint}
        </div>
        <div class="dep-note">
          <div class="dep-note-h">What this does</div>
          <p>Runs <code>git push</code> from the local repo. This is the <b>only</b> way prod changes
             go live (GitHub Pages deploys from the pushed branch). It never fires on its own —
             every push is a manual, typed-confirm action.</p>
        </div>
      </aside>
    </div>`;
}

/* ── the typed-confirm modal (mirrors Dispatch's dsp-confirm: type `deploy` to arm) ── */
function depAskPush() {
  const g = J.dep || {}; const wt = J.depWt || {};
  const ahead = g.ahead || 0, upstream = g.upstream || 'origin/main';
  // Allow the push when on a deploy branch + ahead, OR when fixes are staged on the main worktree
  // (the deploy action pushes from wherever main is checked out — branch-guarded server-side).
  const fromWt = !!(wt.exists && wt.ahead > 0 && !DEPLOY_BRANCHES_C.includes(g.branch));
  const n = fromWt ? wt.ahead : ahead;
  if (!fromWt && (!g.hasUpstream || ahead === 0)) { toast('Nothing to push', 'err'); return; }
  modal(`<h2>Push ${n} commit${n === 1 ? '' : 's'} to GitHub</h2>
    <p>This runs <b>git push</b>${fromWt ? ' from the <b>main worktree</b> (your cockpit branch is untouched)' : ''} to <code>${esc(fromWt ? 'origin/main' : upstream)}</code> — the
       <b>one irreversible action</b>. It's the only way prod changes go live. Review the staged
       fix${n === 1 ? '' : 'es'} behind this dialog first; nothing fires until you type the word below.</p>
    <div class="dep-confirm">
      <div class="dep-confirm-label">Type <code>deploy</code> to confirm</div>
      <input id="depConfirm" placeholder="deploy" autocomplete="off"
        oninput="document.getElementById('depGo').disabled = (this.value.trim().toLowerCase() !== 'deploy')">
    </div>
    <div class="btns">
      <button class="btn green" id="depGo" disabled onclick="doDeploy()">
        <span aria-hidden="true">⬆</span> Push to GitHub
      </button>
      <button class="btn" onclick="closeModal()">Cancel</button>
    </div>`);
  setTimeout(() => { const el = $('depConfirm'); if (el) el.focus(); }, 30);
}

/* ── doDeploy — the server call. confirm:true (RULE 6) AND the typed gate above. ── */
async function doDeploy() {
  const el = $('depConfirm');
  if (!el || el.value.trim().toLowerCase() !== 'deploy') { toast('type “deploy” to confirm', 'err'); return; }
  const go = $('depGo'); if (go) { go.disabled = true; go.innerHTML = '<span aria-hidden="true">⬆</span> Pushing…'; }
  try {
    const r = await action('deploy', { confirm: true });   // server: spawn('git', ['push']) → {ok, code, output}
    closeModal();
    if (r.ok) {
      toast(`Pushed${r.shipped && r.shipped.length ? ' — ' + r.shipped.join(', ') + ' shipped' : ''}. Tracking deploy…`, 'ok');
      if (r.deploy) { J.depLog = J.depLog || { deploys: [] }; J.depLog.deploys = [r.deploy, ...(J.depLog.deploys || [])]; }
      depStartStatusPoll();   // poll the live site until GitHub Pages serves the new bytes
    } else {
      // surface the git output so a rejected/failed push is visible (not silently swallowed)
      modal(`<h2>Push failed</h2>
        <p>git push exited with code <b>${esc(String(r.code))}</b>. Output:</p>
        <pre>${esc(r.output || r.reason || '(no output)')}</pre>
        <div class="btns"><button class="btn" onclick="closeModal()">Close</button></div>`);
      toast('Push failed — see details', 'err');
    }
  } catch (e) {
    // action() already toasted the rejection (bad token / confirm / origin)
    if (go) { go.disabled = false; go.innerHTML = '<span aria-hidden="true">⬆</span> Push to GitHub'; }
    return;
  }
  await depLoad();   // re-read git state → ahead should now be 0, button disables itself
}

/* ── view: Agent Library (default Command tab) ──────────────────────────── */
function viewCommand() {
  const v = $('view'); v.className = 'view maxw';
  const running = !!(J.walk && J.walk.deploying);
  v.innerHTML = `
    ${cmdHeader('agents')}
    <section class="cmd-agentgrid">
      ${CMD_AGENTS.map(a => cmdAgentCard(a, running)).join('')}
    </section>`;
  // If a walk was already streaming when we navigated back, re-attach the poll UI.
  if (running) cmdReflectWalk();
}

function cmdAgentCard(a, running) {
  const real = a.kind === 'walk';
  const deployable = real ? !running : true;
  const cta = real
    ? (running ? 'Walking…' : 'Deploy — Run Walk')
    : 'Deploy — Copy Mission Prompt';
  const honesty = real
    ? `<span class="cmd-tag cmd-tag-live">Runs for real</span>`
    : `<span class="cmd-tag">Copies a mission prompt for CC</span>`;
  return `<article class="cmd-card cmd-${a.tone}" id="cmd-card-${a.id}">
    <div class="cmd-card-h">
      <span class="cmd-glyph" aria-hidden="true">${a.glyph}</span>
      <div class="cmd-card-titles">
        <h2 class="cmd-card-name">${esc(a.name)}</h2>
        <p class="cmd-card-role">${esc(a.role)}</p>
      </div>
      ${honesty}
    </div>
    <dl class="cmd-meta">
      <div class="cmd-meta-row"><dt>Produces</dt><dd>${esc(a.produces)}</dd></div>
      <div class="cmd-meta-row"><dt>Inputs</dt><dd>${esc(a.inputs)}</dd></div>
    </dl>
    <div class="cmd-card-foot">
      <button class="cmd-deploy${real ? ' cmd-deploy-live' : ''}" ${deployable ? '' : 'disabled'}
        onclick="cmdDeploy('${a.id}')">
        <span class="cmd-deploy-ic" aria-hidden="true">${real ? '▶' : '⧉'}</span> ${cta}
      </button>
      ${real ? `<div class="cmd-walkstatus" id="cmd-walkstatus" aria-live="polite"></div>` : ''}
    </div>
  </article>`;
}

/* ── deploy dispatch ────────────────────────────────────────────────────── */
function cmdDeploy(agentId) {
  const a = cmdAgent(agentId); if (!a) return;
  if (a.kind === 'walk') return cmdDeployWalkModal(a);
  return cmdDeployPromptModal(a);
}

// Walk Drone — pick a scope, then actually run it.
function cmdDeployWalkModal(a) {
  modal(`<h2>Deploy ${esc(a.name)}</h2>
    <p>This runs for real — the walker drives the running app and captures every step.
       Pick a surface (or run all runnable). Server validates the scope; nothing else can be passed.</p>
    <label class="cmd-flbl" for="cmdWalkGroup">Surface scope</label>
    <div class="cmd-selwrap">
      <select id="cmdWalkGroup" class="cmd-sel">
        ${CMD_WALK_GROUPS.map(([val, lbl]) => `<option value="${esc(val)}">${esc(lbl)}</option>`).join('')}
      </select>
    </div>
    <div class="btns">
      <button class="btn primary" onclick="cmdRunWalk()"><span aria-hidden="true">▶</span> Deploy &amp; Run</button>
      <button class="btn" onclick="closeModal()">Cancel</button>
    </div>`);
}

// The real run + live poll — same contract app.js uses (/api/walklog → {lines,running}).
let cmdWalkPoll = null;
async function cmdRunWalk() {
  const group = ($('cmdWalkGroup') ? $('cmdWalkGroup').value : '') || '';
  try {
    const r = await action('runWalk', group ? { group } : {});
    if (!r.started) { toast(r.reason || 'a walk is already running', 'err'); return; }
  } catch (e) { return; }  // action() already toasted the rejection
  J.walk = Object.assign({}, J.walk, { deploying: true, scope: group || 'all' });
  closeModal();
  toast('Walk Drone deployed — ' + cmdGroupLabel(group), 'ok');
  // If the Agent Library is on screen, light up the live status line + button.
  cmdReflectWalk();
  cmdWalkSeen = 0;
  clearInterval(cmdWalkPoll);
  cmdWalkPoll = setInterval(async () => {
    let j; try { j = await api('/api/walklog'); } catch (_) { return; }
    const lines = j.lines || [];
    const st = $('cmd-walkstatus');
    if (st) {
      // last meaningful line as a one-line ticker
      const last = [...lines].reverse().find(l => !l.startsWith('@@WALK_EXIT')) || 'starting…';
      st.innerHTML = `<span class="cmd-live-dot"></span> Walking · ${lines.length} line${lines.length === 1 ? '' : 's'}
        <span class="cmd-live-last">${esc(last.replace(/^@@/, '').slice(0, 80))}</span>`;
    }
    if (!j.running) {
      clearInterval(cmdWalkPoll); cmdWalkPoll = null;
      J.walk = Object.assign({}, J.walk, { deploying: false });
      const exit = (lines.find(l => l.startsWith('@@WALK_EXIT')) || '').split(' ')[1];
      if (st) st.innerHTML = `<span class="cmd-done-dot"></span> Walk complete${exit && exit !== '0' ? ` (exit ${esc(exit)})` : ''} — captures in tests/walker-out`;
      toast('Walk complete — rebuild evidence with node scripts/mc/build-cases.js', 'ok');
      // re-enable the Deploy button if still on the Agents tab
      const btn = document.querySelector('#cmd-card-walk-drone .cmd-deploy');
      if (btn) { btn.disabled = false; btn.querySelector('.cmd-deploy-ic') && (btn.innerHTML = `<span class="cmd-deploy-ic" aria-hidden="true">▶</span> Deploy — Run Walk`); }
    }
  }, 600);
}
let cmdWalkSeen = 0;

// Reflect an in-flight walk in the Agents tab (disable button, show live status).
function cmdReflectWalk() {
  const btn = document.querySelector('#cmd-card-walk-drone .cmd-deploy');
  if (btn && J.walk && J.walk.deploying) {
    btn.disabled = true;
    btn.innerHTML = `<span class="cmd-deploy-ic" aria-hidden="true">▶</span> Walking…`;
  }
  const st = $('cmd-walkstatus');
  if (st && J.walk && J.walk.deploying) st.innerHTML = `<span class="cmd-live-dot"></span> Walking…`;
}

// The prompt agents — build the mission prompt from template (+ optional ticket).
function cmdDeployPromptModal(a) {
  const needsGroup = /\{group\}/.test(a.template);
  const tOpts = J.tickets.slice().sort((x, y) => (SEVRANK_BD[x.severity] - SEVRANK_BD[y.severity]));
  modal(`<h2>Deploy ${esc(a.name)}</h2>
    <p>${esc(a.role)}. Real autonomous spawning needs CC, so this <b>copies a ready-to-paste
       mission prompt</b> — fill the fields, copy, and start the mission in Claude Code.</p>
    ${needsGroup ? `
      <label class="cmd-flbl" for="cmdAgGroup">Surface</label>
      <div class="cmd-selwrap"><select id="cmdAgGroup" class="cmd-sel" onchange="cmdRenderPrompt('${a.id}')">
        ${CMD_WALK_GROUPS.filter(x => x[0]).map(([val, lbl]) => `<option value="${esc(val)}">${esc(lbl)}</option>`).join('')}
      </select></div>` : ''}
    <label class="cmd-flbl" for="cmdAgTicket">Ticket context (optional)</label>
    <div class="cmd-selwrap"><select id="cmdAgTicket" class="cmd-sel" onchange="cmdRenderPrompt('${a.id}')">
      <option value="">No ticket — general mission</option>
      ${tOpts.map(t => `<option value="${esc(t.id)}">${esc(t.id)} · ${esc(t.title)}</option>`).join('')}
    </select></div>
    <label class="cmd-flbl">Mission prompt</label>
    <pre id="cmdPromptOut">${esc(cmdFillAgentPrompt(a, '', ''))}</pre>
    <div class="btns">
      <button class="btn primary" onclick="cmdCopy('cmdPromptOut')"><span aria-hidden="true">⧉</span> Copy Mission Prompt</button>
      <button class="btn" onclick="closeModal()">Close</button>
    </div>`);
}
function cmdRenderPrompt(agentId) {
  const a = cmdAgent(agentId); if (!a) return;
  const group = $('cmdAgGroup') ? $('cmdAgGroup').value : '';
  const ticket = $('cmdAgTicket') ? $('cmdAgTicket').value : '';
  $('cmdPromptOut').textContent = cmdFillAgentPrompt(a, group, ticket);
}
function cmdFillAgentPrompt(a, group, ticketId) {
  let out = a.template.replace(/\{group\}/g, group ? cmdGroupLabel(group) : 'target');
  const t = ticketId ? get(ticketId) : null;
  const ctx = t
    ? `\n\nTicket context — ${t.id} (${t.severity} · ${t.group}):\n` +
      `Title: ${t.title}\nSummary: ${t.summary}\n` +
      (t.rich && t.rich.rootCause ? `Root cause: ${t.rich.rootCause}\n` : '') +
      (t.rich && (t.rich.files || []).length ? `Files: ${t.rich.files.join('; ')}\n` : '') +
      `Post results back into ${t.id} on the Board.`
    : '';
  return out.replace(/\{ticketCtx\}/g, ctx);
}

/* ════════════════════════ PROMPT LIBRARY (Command tab 2) ════════════════ */
// Templates load from /api/prompts (server seeds defaults). Shape:
//   { id, title, body, vars:[{ name, label, kind?:'ticket'|'text', placeholder? }] }
// {name} tokens in body fill from the form; a 'ticket' var offers a J.tickets dropdown.
async function viewPrompts() {
  const v = $('view'); v.className = 'view maxw';
  if (!J.prompts) { try { J.prompts = (await api('/api/prompts')).prompts || []; } catch (_) { J.prompts = []; } }
  v.innerHTML = `
    ${cmdHeader('prompts')}
    <section class="cmd-promptbar">
      <p class="cmd-promptbar-note">Reusable mission prompts with <code>{variables}</code>. Click one to fill it in. Your own templates are saved to <code>mission-control/prompts.json</code>.</p>
      <button class="cmd-addbtn" onclick="cmdEditPrompt(null)"><span aria-hidden="true">＋</span> Add Template</button>
    </section>
    <section class="cmd-promptlist">
      ${J.prompts.length
        ? J.prompts.map(cmdPromptRow).join('')
        : `<div class="cmd-empty"><div class="cmd-empty-ic">⌨</div><div class="cmd-empty-h">No templates yet</div><div class="cmd-empty-b">Add your first reusable mission prompt.</div></div>`}
    </section>`;
}
function cmdPromptRow(p) {
  const varCount = (p.vars || []).length;
  return `<article class="cmd-prow">
    <button class="cmd-prow-main" onclick="cmdUsePrompt('${esc(p.id)}')">
      <span class="cmd-prow-titles">
        <span class="cmd-prow-title">${esc(p.title)}</span>
        <span class="cmd-prow-preview">${esc((p.body || '').slice(0, 120))}${(p.body || '').length > 120 ? '…' : ''}</span>
      </span>
      ${varCount ? `<span class="cmd-prow-vars">${varCount} variable${varCount === 1 ? '' : 's'}</span>` : ''}
      <span class="cmd-prow-go" aria-hidden="true">→</span>
    </button>
    <div class="cmd-prow-actions">
      <button class="cmd-iconbtn" title="Edit template" onclick="cmdEditPrompt('${esc(p.id)}')">Edit</button>
      <button class="cmd-iconbtn cmd-iconbtn-danger" title="Delete template" onclick="cmdDeletePrompt('${esc(p.id)}')">Delete</button>
    </div>
  </article>`;
}

// USE — fill the variables, see the live output, copy.
function cmdUsePrompt(id) {
  const p = (J.prompts || []).find(x => x.id === id); if (!p) return;
  const vars = p.vars || [];
  const tOpts = J.tickets.slice().sort((x, y) => (SEVRANK_BD[x.severity] - SEVRANK_BD[y.severity]));
  const field = vr => {
    if (vr.kind === 'ticket') {
      return `<div class="cmd-selwrap"><select class="cmd-sel cmd-varin" data-var="${esc(vr.name)}" onchange="cmdRenderFilled('${esc(id)}')">
        <option value="">Pick a ticket…</option>
        ${tOpts.map(t => `<option value="${esc(t.id)}">${esc(t.id)} · ${esc(t.title)}</option>`).join('')}
      </select></div>`;
    }
    return `<input class="cmd-varin" data-var="${esc(vr.name)}" placeholder="${esc(vr.placeholder || vr.label)}" oninput="cmdRenderFilled('${esc(id)}')" autocomplete="off">`;
  };
  modal(`<h2>${esc(p.title)}</h2>
    <p>Fill the variables — the prompt updates live. Copy it, then run the mission in CC.</p>
    ${vars.length ? `<div class="cmd-varform">${vars.map(vr => `
      <label class="cmd-flbl">${esc(vr.label || vr.name)} <code>{${esc(vr.name)}}</code></label>
      ${field(vr)}`).join('')}</div>` : '<p class="cmd-novars">This template has no variables — copy it as-is.</p>'}
    <label class="cmd-flbl">Filled prompt</label>
    <pre id="cmdFilledOut">${esc(p.body || '')}</pre>
    <div class="btns">
      <button class="btn primary" onclick="cmdCopy('cmdFilledOut')"><span aria-hidden="true">⧉</span> Copy Prompt</button>
      <button class="btn" onclick="closeModal()">Close</button>
    </div>`);
}
function cmdRenderFilled(id) {
  const p = (J.prompts || []).find(x => x.id === id); if (!p) return;
  const vals = {};
  document.querySelectorAll('.cmd-varin').forEach(el => { vals[el.dataset.var] = (el.value || '').trim(); });
  $('cmdFilledOut').textContent = cmdFillBody(p.body || '', vals);
}
// Replace {name} tokens; an unfilled var stays as its {name} so it's obvious.
function cmdFillBody(body, vals) {
  return body.replace(/\{(\w+)\}/g, (m, name) => (vals[name] != null && vals[name] !== '') ? vals[name] : m);
}

/* ── add / edit / delete templates → persisted via savePrompts ──────────── */
function cmdEditPrompt(id) {
  const editing = id ? (J.prompts || []).find(x => x.id === id) : null;
  const p = editing || { id: '', title: '', body: '', vars: [] };
  // vars edited as a simple one-per-line mini-syntax:  name | Label | kind
  const varsText = (p.vars || []).map(vr => [vr.name, vr.label || '', vr.kind || 'text'].join(' | ')).join('\n');
  modal(`<h2>${editing ? 'Edit Template' : 'Add Template'}</h2>
    <p>Use <code>{name}</code> tokens in the body. List variables below — one per line as
       <code>name | Label | kind</code> (kind = <code>text</code> or <code>ticket</code>; a ticket var offers a dropdown of your tickets).</p>
    <label class="cmd-flbl" for="cmdEdTitle">Title</label>
    <input id="cmdEdTitle" value="${esc(p.title)}" placeholder="e.g. Investigate a ticket end-to-end" autocomplete="off">
    <label class="cmd-flbl" for="cmdEdBody">Body</label>
    <textarea id="cmdEdBody" class="cmd-bodyta" placeholder="Investigate {ticket}: read its handoff and run the full pipeline.">${esc(p.body)}</textarea>
    <label class="cmd-flbl" for="cmdEdVars">Variables (one per line: name | Label | kind)</label>
    <textarea id="cmdEdVars" class="cmd-varsta" placeholder="ticket | Ticket | ticket&#10;area | Area to improve | text">${esc(varsText)}</textarea>
    <div class="btns">
      <button class="btn primary" onclick="cmdSavePrompt('${editing ? esc(id) : ''}')">${editing ? 'Save Changes' : 'Add Template'}</button>
      <button class="btn" onclick="closeModal()">Cancel</button>
    </div>`);
  setTimeout(() => { const el = $('cmdEdTitle'); if (el) el.focus(); }, 30);
}
function cmdParseVars(text) {
  return (text || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const [name, label, kind] = l.split('|').map(s => (s || '').trim());
    if (!name || !/^\w+$/.test(name)) return null;
    return { name, label: label || name, kind: kind === 'ticket' ? 'ticket' : 'text' };
  }).filter(Boolean);
}
async function cmdSavePrompt(id) {
  const title = ($('cmdEdTitle').value || '').trim();
  const body = ($('cmdEdBody').value || '').trim();
  if (!title) { toast('title required', 'err'); $('cmdEdTitle').focus(); return; }
  if (!body)  { toast('body required', 'err'); $('cmdEdBody').focus(); return; }
  const vars = cmdParseVars($('cmdEdVars').value);
  const list = (J.prompts || []).slice();
  if (id) {
    const i = list.findIndex(x => x.id === id);
    if (i >= 0) list[i] = Object.assign({}, list[i], { title, body, vars });
  } else {
    // id = title slug + short suffix; keep it stable + collision-safe client-side
    const base = (title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)) || 'prompt';
    let nid = base, n = 2; while (list.some(x => x.id === nid)) nid = base + '-' + (n++);
    list.push({ id: nid, title, body, vars });
  }
  try {
    await action('savePrompts', { list });
    J.prompts = list;            // optimistic local mirror (server returns ok+count)
    closeModal(); toast('templates saved', 'ok'); viewPrompts();
  } catch (e) {}                 // action() toasted the rejection
}
function cmdDeletePrompt(id) {
  const p = (J.prompts || []).find(x => x.id === id); if (!p) return;
  modal(`<h2>Delete template?</h2>
    <p>Remove <b>${esc(p.title)}</b> from your prompt library. This rewrites
       <code>mission-control/prompts.json</code>.</p>
    <div class="btns">
      <button class="btn danger" onclick="cmdConfirmDelete('${esc(id)}')">Delete</button>
      <button class="btn" onclick="closeModal()">Cancel</button>
    </div>`);
}
async function cmdConfirmDelete(id) {
  const list = (J.prompts || []).filter(x => x.id !== id);
  try { await action('savePrompts', { list }); J.prompts = list; closeModal(); toast('template deleted', 'ok'); viewPrompts(); } catch (e) {}
}

/* ── shared command-deck helpers ────────────────────────────────────────── */
// The two-tab header (Agents | Prompts). Title Case throughout.
function cmdHeader(active) {
  return `<header class="cmd-head">
    <div>
      <h1>Command Deck</h1>
      <p class="subtitle">Deploy the agents that drive slyght — and the reusable mission prompts that brief them.</p>
    </div>
    <div class="cmd-tabs" role="tablist">
      <a class="cmd-tab ${active === 'agents' ? 'on' : ''}" role="tab" aria-selected="${active === 'agents'}" href="#/command">Agent Library</a>
      <a class="cmd-tab ${active === 'prompts' ? 'on' : ''}" role="tab" aria-selected="${active === 'prompts'}" href="#/command/prompts">Prompt Library</a>
    </div>
  </header>`;
}
// Copy helper — same pattern as jarvisTake/goDeeper (reads a <pre> by id).
function cmdCopy(elId) {
  const el = $(elId); if (!el) return;
  navigator.clipboard.writeText(el.textContent).then(() => toast('copied', 'ok'), () => toast('copy failed', 'err'));
}

/* ════════════════════════ KNOWLEDGE (the doc knowledge base) ════════════════════
 * A browsable index of slyght's security + governance + reference docs. The list/grid
 * uses the full ultrawide width; opening a doc reads it via the allowlisted
 * /api/read?name=<key> endpoint (read-only, path-jailed server-side) and renders the
 * markdown at a comfortable ~860px reading column. esc()-first renderer — every text
 * node is escaped before any inline formatting is applied, so doc content can never
 * inject markup. State lives on J.kb = { open, content, loading, error }.
 * ──────────────────────────────────────────────────────────────────────────────── */
const KB_DOCS = [
  // group · key (must match server READS) · title · one-line description · icon
  { group: 'Security & Governance', key: 'security',       title: 'Security',               desc: "slyght's security decision-log — phase order, the live phase, what's committed next.", icon: '🛡️' },
  { group: 'Security & Governance', key: 'mc-security',     title: 'Mission Control Security', desc: 'The seven hard rules behind this cockpit — localhost-only, allowlisted, path-jailed.', icon: '🔐' },
  { group: 'Security & Governance', key: 'pipeline',        title: 'Pipeline',               desc: 'The standing six-tier development pipeline every session, bundle, and commit runs through.', icon: '🧭' },
  { group: 'Security & Governance', key: 'rules',           title: 'Mission Rules',          desc: 'The operating rules for mission-control work — what gates, what ships, what stops.', icon: '📐' },

  { group: 'The Contract',          key: 'invariants',      title: 'Financial Invariants',   desc: 'The mathematical contract slyght must satisfy — every INV the money math is held to.', icon: '∑' },
  { group: 'The Contract',          key: 'featuremap',      title: 'Feature Map',            desc: 'The atlas of surfaces, canonical writers, and state fields — where everything lives.', icon: '🗺️' },

  { group: 'Project',               key: 'openbugs',        title: 'Open Bugs',              desc: "The current substrate state — what's known broken right now, in priority order.", icon: '🐞' },
  { group: 'Project',               key: 'john-knowledge',  title: 'John Knowledge',         desc: "John's working frontier — Demonstrated vs Building, to calibrate every explanation.", icon: '👤' },
  { group: 'Project',               key: 'coverage',        title: 'Coverage Map',           desc: 'The walk-and-judge coverage map — which surfaces are traced and which still have gaps.', icon: '✅' },
];
const KB_GROUPS = ['Security & Governance', 'The Contract', 'Project'];
const KB_GROUP_SUB = {
  'Security & Governance': 'How slyght is kept safe and how the work is governed.',
  'The Contract':          'The mathematical and structural promises the app must keep.',
  'Project':               'The living state of the project — bugs, frontier, and coverage.',
};
const kbDoc = key => KB_DOCS.find(d => d.key === key);

// J.kb holds the view state; initialise lazily so we never assume it on the shared J.
function kbState() { return (J.kb = J.kb || { open: null, content: '', loading: false, error: '' }); }

async function viewKnowledge(key) {
  const v = $('view'); v.className = 'view maxw';
  const s = kbState();
  s.open = key || null;

  if (!s.open) { v.innerHTML = kbIndexHTML(); return; }   // ── the list / card grid ──

  // ── a single doc — fetch via the allowlisted, path-jailed read, then render md ──
  const meta = kbDoc(s.open);
  if (!meta) { location.hash = '#/knowledge'; return; }   // unknown key → back to the index
  s.loading = true; s.error = ''; s.content = '';
  v.innerHTML = kbDocShellHTML(meta, '<div class="kb-loading">Loading ' + esc(meta.title) + '…</div>');
  try {
    const r = await api('/api/read?name=' + encodeURIComponent(s.open));
    if (r && typeof r.content === 'string') { s.content = r.content; }
    else { s.error = (r && r.error) || 'Could not read this document.'; }
  } catch (e) { s.error = 'Could not reach the read endpoint — is the mission-control server running?'; }
  s.loading = false;
  // re-render only if the user is still on this doc (guards against fast nav)
  if (s.open !== (meta && meta.key)) return;
  const body = s.error
    ? `<div class="kb-error"><div class="kb-error-ic">⚠</div><div><div class="kb-error-h">Couldn't load this document</div><div class="kb-error-b">${esc(s.error)}</div></div></div>`
    : `<article class="kb-doc">${renderMarkdown(s.content)}</article>`;
  v.innerHTML = kbDocShellHTML(meta, body);
}

// ── the index: full-width grouped card grid ──────────────────────────────────────
function kbIndexHTML() {
  const card = d => `
    <a class="kb-card" href="#/knowledge/${d.key}" aria-label="Open ${esc(d.title)}">
      <span class="kb-card-ic" aria-hidden="true">${esc(d.icon)}</span>
      <span class="kb-card-body">
        <span class="kb-card-title">${esc(d.title)}</span>
        <span class="kb-card-desc">${esc(d.desc)}</span>
      </span>
      <span class="kb-card-go" aria-hidden="true">→</span>
    </a>`;
  const groups = KB_GROUPS.map(g => {
    const docs = KB_DOCS.filter(d => d.group === g);
    if (!docs.length) return '';
    return `
      <section class="kb-group">
        <div class="kb-group-h">
          <h2 class="kb-group-title">${esc(g)}</h2>
          <p class="kb-group-sub">${esc(KB_GROUP_SUB[g] || '')}</p>
        </div>
        <div class="kb-grid">${docs.map(card).join('')}</div>
      </section>`;
  }).join('');
  return `
    <header class="kb-head">
      <div>
        <h1>Knowledge</h1>
        <p class="subtitle">The security, governance, and reference docs for slyght — one browsable place. Open a document to read it; everything here is read-only.</p>
      </div>
      <span class="kb-head-count">${KB_DOCS.length} documents</span>
    </header>
    ${groups}`;
}

// ── the doc shell: back link + header + the rendered body slot ────────────────────
function kbDocShellHTML(meta, bodyHTML) {
  return `
    <a class="kb-back" href="#/knowledge">‹ All documents</a>
    <header class="kb-dochead">
      <span class="kb-dochead-ic" aria-hidden="true">${esc(meta.icon)}</span>
      <div class="kb-dochead-text">
        <span class="kb-dochead-group">${esc(meta.group)}</span>
        <h1 class="kb-dochead-title">${esc(meta.title)}</h1>
        <p class="kb-dochead-desc">${esc(meta.desc)}</p>
      </div>
    </header>
    <div class="kb-docwrap">${bodyHTML}</div>`;
}

/* ── renderMarkdown — a compact, escape-FIRST markdown→HTML renderer ──────────────
 * Supports the constructs the slyght docs actually use: ATX headings (# … ######),
 * bold/italic, inline code + fenced code blocks, unordered + ordered lists,
 * blockquotes, horizontal rules, links, and paragraphs. NOT a full CommonMark
 * engine — deliberately small and predictable for a known doc corpus.
 *
 * Safety: every raw text run is esc()'d BEFORE any tag is introduced. Inline
 * formatting only ever wraps already-escaped text, and link hrefs are sanitised
 * (http/https/# only), so document content can never inject markup or script.
 * ──────────────────────────────────────────────────────────────────────────────── */
function renderMarkdown(src) {
  if (!src) return '';
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  let listType = null;          // 'ul' | 'ol' | null — currently open list
  let para = [];                // buffered paragraph lines
  let quote = [];               // buffered blockquote lines

  const flushPara = () => {
    if (para.length) { out.push('<p>' + mdInline(para.join(' ')) + '</p>'); para = []; }
  };
  const closeList = () => { if (listType) { out.push('</' + listType + '>'); listType = null; } };
  const flushQuote = () => {
    if (quote.length) {
      out.push('<blockquote>' + quote.map(q => '<p>' + mdInline(q) + '</p>').join('') + '</blockquote>');
      quote = [];
    }
  };
  const flushAll = () => { flushPara(); flushQuote(); closeList(); };

  while (i < lines.length) {
    const line = lines[i];

    // fenced code block ``` … ```
    const fence = line.match(/^\s*```+\s*([\w.+-]*)\s*$/);
    if (fence) {
      flushAll();
      const lang = fence[1] || '';
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```+\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // consume the closing fence (or run off the end)
      out.push('<pre class="kb-pre"' + (lang ? ' data-lang="' + esc(lang) + '"' : '') + '><code>' + esc(buf.join('\n')) + '</code></pre>');
      continue;
    }

    // blank line — paragraph / quote separator
    if (/^\s*$/.test(line)) { flushPara(); flushQuote(); i++; continue; }

    // horizontal rule
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flushAll(); out.push('<hr>'); i++; continue; }

    // ATX heading  # … ######
    const h = line.match(/^\s*(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) { flushAll(); const lvl = h[1].length; out.push('<h' + lvl + '>' + mdInline(h[2]) + '</h' + lvl + '>'); i++; continue; }

    // blockquote  > …
    const bq = line.match(/^\s*>\s?(.*)$/);
    if (bq) { flushPara(); closeList(); quote.push(bq[1]); i++; continue; }

    // unordered list  - / * / +
    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    if (ul) { flushPara(); flushQuote(); if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; } out.push('<li>' + mdInline(ul[1]) + '</li>'); i++; continue; }

    // ordered list  1. / 1)
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ol) { flushPara(); flushQuote(); if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; } out.push('<li>' + mdInline(ol[1]) + '</li>'); i++; continue; }

    // anything else — paragraph text
    flushQuote(); closeList(); para.push(line.trim()); i++;
  }
  flushAll();
  return out.join('\n');
}

// inline formatting — runs on raw markdown text. esc() FIRST so the text is safe,
// then re-introduce a fixed, known set of inline tags. Code spans are extracted
// before other rules so their contents aren't double-formatted.
function mdInline(text) {
  if (text == null) return '';
  // 1) protect inline code spans `…` — escape contents, swap in a placeholder
  const codes = [];
  let s = String(text).replace(/`([^`]+)`/g, (_, c) => {
    codes.push('<code class="kb-code">' + esc(c) + '</code>');
    return ' ' + (codes.length - 1) + ' ';
  });
  // 2) escape the remaining text (placeholders survive — they contain no &<>)
  s = esc(s);
  // 3) links [label](href) — sanitise href to http/https/# only
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => {
    const safe = /^(https?:\/\/|#|\/)/i.test(href);
    if (!safe) return label;
    const ext = /^https?:/i.test(href);
    return '<a href="' + esc(href) + '"' + (ext ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + label + '</a>';
  });
  // 4) bold **…** / __…__  then italic *…* / _…_  (bold first so ** isn't eaten by *)
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
       .replace(/__([^_]+)__/g, '<strong>$1</strong>')
       .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>')
       .replace(/(^|[^_\w])_([^_\s][^_]*?)_(?=$|[^_\w])/g, '$1<em>$2</em>');
  // 5) restore the code spans
  s = s.replace(/ (\d+) /g, (_, n) => codes[+n]);
  return s;
}

/* ── placeholder views (sequenced next) ───────────────────────────────── */
function viewSoon(title, body) {
  $('view').className = 'view maxw';
  $('view').innerHTML = `<h1>${title}</h1><p class="subtitle">${body}</p>
    <div class="card"><p class="summary" style="margin:0">Built next in the sequence — the core loop comes first (per the brief). The data model already reserves what this view needs, so it won't be a retrofit.</p></div>`;
}

/* ════════════════════════ COMMAND PALETTE (⌘K / Ctrl-K) ══════════════════
 * Global jump-and-act. One key opens a centered, blurred overlay; fuzzy-search
 * across TICKETS · VIEWS · SURFACES · ACTIONS; ↑↓ to move, ↵ to activate, Esc to
 * close; hover + click too. Built ONCE (own #cpScrim/#cpPanel — independent of the
 * #scrim/#modal ticket dialogs). Every result either navigates (location.hash),
 * opens a ticket, runs newTicket(), or runs a real walk (action('runWalk') + the
 * same /api/walklog poll app.js uses). Honest labels — nothing fake.
 * State is local module-scope (CP), never touches the shared J literal.
 * ──────────────────────────────────────────────────────────────────────── */

// The fixed, navigable VIEWS. Hashes match the router; titles + keywords feed fuzzy
// search.
const CP_VIEWS = [
  { title: 'Overview',  hash: '#/overview',         icon: '◎', kw: 'home dashboard start whole story' },
  { title: 'Board',     hash: '#/board',            icon: '▦', kw: 'tickets list worklist kanban' },
  { title: 'App Map',   hash: '#/map',              icon: '◇', kw: 'surfaces graph relationship flows wiring' },
  { title: 'Insights',  hash: '#/insights',         icon: '◑', kw: 'analytics charts trends metrics' },
  { title: 'Command',   hash: '#/command',          icon: '⌁', kw: 'agents deploy walk drone deck' },
  { title: 'Deploy',    hash: '#/deploy',           icon: '⬆', kw: 'deploy push git ship prod release origin go live last mile' },
  { title: 'Prompts',   hash: '#/command/prompts',  icon: '⌨', kw: 'prompt library templates mission' },
  { title: 'Knowledge', hash: '#/knowledge',        icon: '▣', kw: 'docs security invariants feature map rules reference' },
  { title: 'Roadmap',   hash: '#/roadmap',          icon: '◈', kw: 'plan releases bundles future' },
  { title: 'Recommends', hash: '#/recommend', icon: '✦', kw: 'jarvis recommend next ship leverage priority what should i do attention' },
  { title: 'Calendar',  hash: '#/calendar',         icon: '▦', kw: 'month dates due target schedule' },
  { title: 'Planning',  hash: '#/planning',         icon: '◈', kw: 'roadmap features candidates releases' },
];

// The 9 real surfaces (mirror of the App-Map roster ids). Each → #/map/<id>. Label =
// Title Case; id = the surface key the map detail view expects.
const CP_SURFACES = [
  { id: 'dashboard', title: 'Dashboard', kw: 'cash hub balance home' },
  { id: 'bills',     title: 'Bills',     kw: 'due paid recurring' },
  { id: 'savings',   title: 'Savings',   kw: 'goals buckets envelopes' },
  { id: 'plan',      title: 'Plan',      kw: 'payday allocate canvas lock' },
  { id: 'analysis',  title: 'Analysis',  kw: 'ledger trend net worth where money went' },
  { id: 'debts',     title: 'Debts',     kw: 'pay down kia loan mum' },
  { id: 'ai',        title: 'AI',        kw: 'chat assistant agent state' },
  { id: 'settings',  title: 'Settings',  kw: 'config preferences' },
  { id: 'nav',       title: 'Navigation', kw: 'boot routing frame' },
];

// ACTIONS — the verbs. `run()` is called on activate. Walk runs for real; New Ticket
// opens the real modal. Both close the palette first.
const CP_ACTIONS = [
  { title: 'New Ticket', icon: '＋', kw: 'create add open bug feature task',
    run: () => { closePalette(); newTicket(); } },
  { title: 'Run Walk', icon: '▶', kw: 'walk drone deploy capture screenshot run all runnable',
    run: () => { closePalette(); cpRunWalk(); } },
];

// Palette module state (never on the shared J).
const CP = { open: false, items: [], sel: 0, built: false, walking: false, walkPoll: null };

/* ── build the DOM once + register the global keydown ───────────────────── */
function setupPalette() {
  if (!CP.built) {
    const scrim = document.createElement('div');
    scrim.className = 'cp-scrim';
    scrim.id = 'cpScrim';
    scrim.innerHTML = `
      <div class="cp-panel" id="cpPanel" role="dialog" aria-modal="true" aria-label="Command palette">
        <div class="cp-searchwrap">
          <svg class="cp-searchic" viewBox="0 0 20 20" aria-hidden="true"><path d="M9 3.5a5.5 5.5 0 1 0 3.4 9.83l3.13 3.14a1 1 0 0 0 1.42-1.42l-3.14-3.13A5.5 5.5 0 0 0 9 3.5Zm0 2a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z"/></svg>
          <input id="cpInput" class="cp-input" type="text" placeholder="Search tickets, views, surfaces, actions…"
                 autocomplete="off" autocorrect="off" spellcheck="false" aria-label="Search" aria-controls="cpResults">
          <kbd class="cp-esc">esc</kbd>
        </div>
        <div class="cp-results" id="cpResults" role="listbox" aria-label="Results"></div>
        <div class="cp-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
          <span class="cp-foot-brand">Jarvis ⌘K</span>
        </div>
      </div>`;
    document.body.appendChild(scrim);

    // click the backdrop (not the panel) closes
    scrim.addEventListener('click', e => { if (e.target === scrim) closePalette(); });

    const input = $('cpInput');
    input.addEventListener('input', () => cpSearch(input.value));
    // navigation keys live on the input so it keeps focus the whole time
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown')      { e.preventDefault(); cpMove(1); }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); cpMove(-1); }
      else if (e.key === 'Enter')     { e.preventDefault(); cpActivate(CP.sel); }
      else if (e.key === 'Escape')    { e.preventDefault(); closePalette(); }
      // Home/End for long lists
      else if (e.key === 'Home')      { e.preventDefault(); cpSelect(0); }
      else if (e.key === 'End')       { e.preventDefault(); cpSelect(CP.items.length - 1); }
    });
    CP.built = true;
  }

  // global trigger — ⌘K (mac) / Ctrl-K (win/linux). Capture so it beats the browser
  // (some browsers map Ctrl-K to the address bar). Toggle: open if closed, close if open.
  document.addEventListener('keydown', e => {
    const isK = (e.key === 'k' || e.key === 'K');
    if (isK && (e.metaKey || e.ctrlKey) && !e.altKey) {
      e.preventDefault();
      CP.open ? closePalette() : openPalette();
    }
  }, true);
}

/* ── open / close ───────────────────────────────────────────────────────── */
function openPalette() {
  if (!CP.built) setupPalette();
  const scrim = $('cpScrim'); if (!scrim) return;
  CP.open = true;
  scrim.classList.add('on');
  document.body.classList.add('cp-lock');      // freeze background scroll
  const input = $('cpInput');
  input.value = '';
  cpSearch('');                                 // show the default (everything, grouped)
  // focus after paint so the caret lands and the entrance animation is smooth
  requestAnimationFrame(() => { input.focus(); input.select(); });
}
function closePalette() {
  const scrim = $('cpScrim'); if (!scrim) return;
  CP.open = false;
  scrim.classList.remove('on');
  document.body.classList.remove('cp-lock');
}

/* ── fuzzy search across the four sources ───────────────────────────────── */
// Lightweight subsequence fuzzy match — returns a score (higher = better) or -1.
// Rewards: exact substring > word-boundary start > contiguous run > earliest match.
function cpFuzzy(query, text) {
  if (!query) return 0;                          // empty query = everything, neutral score
  const q = query.toLowerCase(), t = text.toLowerCase();
  const idx = t.indexOf(q);
  if (idx !== -1) {                              // substring hit — strongest
    let s = 1000 - idx;
    if (idx === 0 || /\W/.test(t[idx - 1])) s += 300;   // word-boundary bonus
    return s;
  }
  // subsequence fallback — all query chars appear in order
  let ti = 0, score = 0, run = 0, last = -1;
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi];
    let found = -1;
    for (; ti < t.length; ti++) { if (t[ti] === c) { found = ti; break; } }
    if (found === -1) return -1;                 // a query char never appeared → no match
    if (found === last + 1) { run++; score += 12 + run * 4; } else { run = 0; score += 4; }
    if (found === 0 || /\W/.test(t[found - 1])) score += 8;  // landed on a boundary
    last = found; ti = found + 1;
  }
  return score;
}

// Build the flat candidate list (each carries a haystack + an activate()), score
// against the query, sort within group by score, then render grouped.
function cpSearch(query) {
  const q = (query || '').trim();

  const cand = [];
  // ACTIONS — verbs first; they're the highest-intent on an empty query
  CP_ACTIONS.forEach(a => cand.push({
    group: 'Actions', icon: a.icon, title: a.title, sub: a.title === 'Run Walk' ? 'Deploys the walk drone — runs for real' : 'Open a new ticket',
    hay: a.title + ' ' + a.kw, run: a.run,
  }));
  // VIEWS
  CP_VIEWS.forEach(v => cand.push({
    group: 'Views', icon: v.icon, title: v.title, sub: v.hash,
    hay: v.title + ' ' + v.hash + ' ' + v.kw, run: () => { closePalette(); location.hash = v.hash; },
  }));
  // SURFACES → App Map detail
  CP_SURFACES.forEach(s => cand.push({
    group: 'Surfaces', icon: '◇', title: s.title, sub: 'App Map → ' + s.id,
    hay: s.title + ' ' + s.id + ' ' + s.kw + ' surface map', run: () => { closePalette(); location.hash = '#/map/' + s.id; },
  }));
  // TICKETS — title + id, badged with severity + surface
  (J.tickets || []).forEach(t => {
    const surface = t.group || t.surface || '';
    cand.push({
      group: 'Tickets', icon: 'ticket', title: t.title, id: t.id,
      severity: t.severity, surface, status: t.state && t.state.status,
      hay: t.title + ' ' + t.id + ' ' + surface + ' ' + (t.summary || '') + ' ' + t.severity,
      run: () => { closePalette(); location.hash = '#/ticket/' + t.id; },
    });
  });

  // score + filter
  const scored = [];
  for (const c of cand) {
    const sc = cpFuzzy(q, c.hay);
    if (sc >= 0) scored.push(Object.assign({ _score: sc }, c));
  }

  // group order; within a group sort by score (desc), then title
  const ORDER = ['Actions', 'Views', 'Surfaces', 'Tickets'];
  scored.sort((a, b) =>
    (ORDER.indexOf(a.group) - ORDER.indexOf(b.group)) ||
    (b._score - a._score) ||
    a.title.localeCompare(b.title));

  // cap tickets so the list stays instant; keep all of the small fixed groups
  const counts = {};
  CP.items = scored.filter(c => {
    counts[c.group] = (counts[c.group] || 0) + 1;
    return c.group !== 'Tickets' || counts.Tickets <= 8;
  });

  CP.sel = 0;
  cpRender(q);
}

/* ── render the grouped list ────────────────────────────────────────────── */
function cpRender(q) {
  const box = $('cpResults'); if (!box) return;
  if (!CP.items.length) {
    box.innerHTML = `<div class="cp-empty">No matches for “${esc(q)}”. Try a view, a surface, or a ticket id.</div>`;
    return;
  }
  let html = '', lastGroup = null, i = 0;
  for (const it of CP.items) {
    if (it.group !== lastGroup) { html += `<div class="cp-grouph">${esc(it.group)}</div>`; lastGroup = it.group; }
    html += cpRow(it, i); i++;
  }
  box.innerHTML = html;
  // delegated mouse handlers (set once per render — innerHTML wiped the old ones)
  box.querySelectorAll('.cp-row').forEach(el => {
    const idx = +el.dataset.i;
    el.addEventListener('mousemove', () => cpSelect(idx));   // hover follows the pointer
    el.addEventListener('click', () => cpActivate(idx));
  });
  cpSelect(0);
}

function cpRow(it, i) {
  // ticket rows carry severity + surface badges; everything else a glyph + subtitle
  const isTicket = it.group === 'Tickets';
  const icon = isTicket
    ? `<span class="cp-ic cp-ic-ticket" aria-hidden="true">▤</span>`
    : `<span class="cp-ic" aria-hidden="true">${esc(it.icon || '›')}</span>`;
  const meta = isTicket
    ? `<span class="cp-badges">
         <span class="pill sm ${sevCls(it.severity)}">${esc(it.severity)}</span>
         ${it.surface ? `<span class="cp-surface">${esc(it.surface)}</span>` : ''}
         ${it.status ? `<span class="pill sm s-${it.status}">${esc(STATUS_LABEL[it.status] || it.status)}</span>` : ''}
       </span>`
    : `<span class="cp-sub">${esc(it.sub || '')}</span>`;
  const trail = isTicket ? `<span class="cp-id">${esc(it.id)}</span>` : `<span class="cp-enter" aria-hidden="true">↵</span>`;
  return `<div class="cp-row" data-i="${i}" role="option" aria-selected="false" id="cpRow${i}">
      ${icon}
      <span class="cp-rowmain">
        <span class="cp-title">${esc(it.title)}</span>
        ${meta}
      </span>
      ${trail}
    </div>`;
}

/* ── selection + activation ─────────────────────────────────────────────── */
function cpSelect(idx) {
  if (!CP.items.length) return;
  CP.sel = Math.max(0, Math.min(idx, CP.items.length - 1));
  const box = $('cpResults'); if (!box) return;
  box.querySelectorAll('.cp-row').forEach(el => {
    const on = +el.dataset.i === CP.sel;
    el.classList.toggle('on', on);
    el.setAttribute('aria-selected', on ? 'true' : 'false');
    if (on) el.scrollIntoView({ block: 'nearest' });
  });
  const active = box.querySelector('.cp-row.on');
  const input = $('cpInput'); if (input && active) input.setAttribute('aria-activedescendant', active.id);
}
function cpMove(delta) {
  if (!CP.items.length) return;
  const n = CP.items.length;
  cpSelect((CP.sel + delta + n) % n);            // wrap top↔bottom
}
function cpActivate(idx) {
  const it = CP.items[idx]; if (!it || typeof it.run !== 'function') return;
  it.run();
}

/* ── Run Walk — real, mirrors app.js / Command Deck (/api/walklog poll) ──── */
async function cpRunWalk() {
  if (CP.walking) { toast('a walk is already running', 'err'); return; }
  try {
    const r = await action('runWalk', {});       // {} = all runnable surfaces
    if (!r.started) { toast(r.reason || 'a walk is already running', 'err'); return; }
  } catch (e) { return; }                          // action() already toasted the rejection
  CP.walking = true;
  toast('Walk drone deployed — all runnable surfaces', 'ok');
  clearInterval(CP.walkPoll);
  CP.walkPoll = setInterval(async () => {
    let j; try { j = await api('/api/walklog'); } catch (_) { return; }
    if (!j.running) {
      clearInterval(CP.walkPoll); CP.walkPoll = null; CP.walking = false;
      const lines = j.lines || [];
      const exit = (lines.find(l => l.startsWith('@@WALK_EXIT')) || '').split(' ')[1];
      toast(`Walk complete${exit && exit !== '0' ? ` (exit ${exit})` : ''} — captures in tests/walker-out`, 'ok');
    }
  }, 700);
}

/* ════════════════════════ AGENTS FLEET — live drone tracking ════════════════
 * Built for a heavy day: every running + recent CC drone across all tickets, sweeps in
 * progress, and today's usage. The "Running now" list is the hero (pulsing, ticking clocks).
 * Reads the J.ccjobs / J.sweeps / J.ccspend caches kept fresh by the poll (+1s clock tick). */
const FLEET_STEP_LABEL = { gather: 'Gathering — root cause + surface', fix: 'Proposing fix', conformance: 'Checking conformance', audit: 'Auditing', redig: 'Targeted re-dig', complete: 'Complete' };
function viewAgentsFleet() {
  const v = $('view'); v.className = 'view maxw';
  const all = Object.values(J.ccjobs || {});
  const running = all.filter(j => j.status === 'running').sort((a, b) => (a.started || 0) - (b.started || 0));
  const done = all.filter(j => j.status === 'done');
  const failed = all.filter(j => j.status === 'failed');
  const sweepsRunning = Object.entries(J.sweeps || {}).map(([id, s]) => ({ id, ...s })).filter(s => s.status === 'running');
  const todayUsd = (+(J.ccspend || {}).today_usd || 0).toFixed(2);
  const clockOf = j => { const ms = j.started ? Date.now() - j.started : 0; return Math.floor(ms / 60000) + ':' + String(Math.floor((ms % 60000) / 1000)).padStart(2, '0'); };
  const taskLbl = t => TASK_LABEL[t] || t || 'investigate';
  const stat = (n, label, tone) => `<div class="fleet-stat fleet-${tone}"><div class="fleet-stat-n">${n}</div><div class="fleet-stat-l">${label}</div></div>`;

  // The Walk Drone is a separate mechanism (J.walk via /api/walklog) — surface it here as a drone too.
  const walkRunning = !!(J.walk && J.walk.deploying);
  const walkRow = walkRunning ? `
    <div class="fleet-row fleet-runrow">
      <span class="fleet-dot" aria-hidden="true"></span>
      <a class="fleet-tkt" href="#/command">Walk</a>
      <span class="fleet-task">Walk Drone · ${esc(J.walk.scope || 'all')}</span>
      <span class="fleet-meta">${(J.walk.lineCount || 0)} lines${J.walk.lastLine ? ' · ' + esc(String(J.walk.lastLine).replace(/^@@/, '').slice(0, 36)) : ''}</span>
      <span class="fleet-clock">live</span>
    </div>` : '';
  const runCount = running.length + (walkRunning ? 1 : 0);
  const runRows = runCount ? (walkRow + running.map(j => `
    <div class="fleet-row fleet-runrow">
      <span class="fleet-dot" aria-hidden="true"></span>
      <a class="fleet-tkt" href="${esc(agentHref(j.id))}">${esc(j.id)}</a>
      <span class="fleet-task">${esc(taskLbl(j.task))}</span>
      <span class="fleet-meta">${j.model === 'opus' ? 'Opus' : 'Sonnet'}${j.turns != null ? ' · ' + j.turns + ' turns' : ''}</span>
      <span class="fleet-clock">${clockOf(j)}</span>
    </div>`).join('')) : `<div class="fleet-empty">No drones in the air right now.</div>`;

  const recent = done.concat(failed).sort((a, b) => (b.started || 0) - (a.started || 0)).slice(0, 20);
  const recentRows = recent.length ? recent.map(j => `
    <div class="fleet-row">
      <a class="fleet-tkt" href="${esc(agentHref(j.id))}">${esc(j.id)}</a>
      <span class="fleet-task">${esc(taskLbl(j.task))}</span>
      <span class="fleet-meta">${j.turns != null ? j.turns + ' turns' : ''}${j.durationMs != null ? ' · ' + (j.durationMs / 60000).toFixed(1) + ' min' : ''}</span>
      <span class="pill sm ${j.status === 'done' ? 's-ConfirmedLive' : 'p-p0'}">${j.status === 'done' ? 'done' : 'failed'}</span>
    </div>`).join('') : `<div class="fleet-empty">No runs yet this session.</div>`;

  const sweepRows = sweepsRunning.map(s => `
    <div class="fleet-sweep">
      <a class="fleet-tkt" href="#/ticket/${esc(s.id)}">${esc(s.id)}</a>
      <span class="fleet-sweep-step"><span class="cf-spin" aria-hidden="true"></span> ${esc(FLEET_STEP_LABEL[s.step] || s.step)}${s.cycle ? ' · audit ' + s.cycle : ''}</span>
    </div>`).join('');

  v.innerHTML = `
    <header class="cmd-head"><div><h1>Drone Fleet</h1><p class="subtitle">Live and recent CC drones across every ticket — what's in the air, and what's landed.</p></div></header>
    <section class="fleet-stats">
      ${stat(runCount, 'In the air', 'run')}
      ${stat(done.length, 'Landed (session)', 'done')}
      ${stat(failed.length, 'Failed', failed.length ? 'fail' : 'mute')}
      ${stat('$' + todayUsd, 'Est. usage today', 'mute')}
    </section>
    ${sweepsRunning.length ? `<div class="card fleet-card"><div class="label">Building the case — sweeps in progress</div>${sweepRows}</div>` : ''}
    <div class="card fleet-card">
      <div class="label">Running now ${runCount ? `<span class="fleet-live">● live</span>` : ''}</div>
      <div class="fleet-list">${runRows}</div>
    </div>
    <div class="card fleet-card">
      <div class="label">Recent runs</div>
      <div class="fleet-list">${recentRows}</div>
    </div>`;
}

/* ════════════════════════ ARCHITECTURE & ROADMAP ════════════════════════
 * Now (ARCHITECTURE.md) · Going-to (tickets grouped by bundle) · New-initiative
 * (creates a feature ticket that flows through the same gather/sweep machinery). */
function viewArchitecture() {
  const v = $('view'); v.className = 'view maxw';
  const ts = J.tickets || [];
  const byBundle = {};
  ts.forEach(t => { if (t.bundle) (byBundle[t.bundle] = byBundle[t.bundle] || []).push(t); });
  const bundles = Object.keys(byBundle).sort();
  const roadmapHtml = bundles.length
    ? bundles.map(b => `<div class="arch-bundle"><div class="arch-bundle-h">${esc(b)} <span class="arch-bundle-n">${byBundle[b].length}</span></div>${byBundle[b].map(t => `<a class="arch-tkt" href="#/ticket/${t.id}"><span class="pill sm s-${(t.state || {}).status}">${STATUS_LABEL[(t.state || {}).status] || (t.state || {}).status}</span> ${esc(t.title)}</a>`).join('')}</div>`).join('')
    : `<div class="arch-empty">No bundles assigned yet — set a <b>Bundle</b> on tickets (in the ticket sidebar) to plan releases here. <a href="#/roadmap">Open the Roadmap →</a></div>`;

  v.innerHTML = `
    <header class="cmd-head"><div><h1>Architecture &amp; Roadmap</h1><p class="subtitle">Where slyght is now, where it's going, and where to start a new layer.</p></div></header>
    <section class="arch-bands">
      <div class="card arch-band">
        <div class="cf-cardhead"><div class="label">Now — current architecture</div><a class="btn sm" href="#/map">App Map →</a></div>
        <div id="archDoc" class="arch-doc"><div class="fleet-empty">Loading ARCHITECTURE.md…</div></div>
      </div>
      <div class="card arch-band">
        <div class="cf-cardhead"><div class="label">Going to — bundles &amp; layers</div><a class="btn sm" href="#/roadmap">Roadmap →</a></div>
        <div class="arch-roadmap">${roadmapHtml}</div>
      </div>
      <div class="card arch-band">
        <div class="cf-cardhead"><div class="label">System health — ruthless audit</div>
          ${(J.ccjobs && J.ccjobs['SYSTEM#audit'] && J.ccjobs['SYSTEM#audit'].status === 'running') ? `<span class="cf-running"><span class="cf-spin" aria-hidden="true"></span> auditing…</span>` : `<button class="btn sm primary" onclick="runSystemAudit()">Run system audit</button>`}
        </div>
        <div id="sysAuditBody" class="arch-audit"><div class="fleet-empty">Loading…</div></div>
      </div>
      <div class="card arch-band arch-initiative">
        <div class="cf-cardhead"><div class="label">New initiative — start a layer / feature / concept</div></div>
        <p class="arch-init-note">Scope a new layer or concept as a ticket — it flows through the same gather → case-file → Build-the-case machinery as everything else.</p>
        <button class="btn primary" onclick="newInitiative()"><span aria-hidden="true">✦</span> Plan a new initiative</button>
      </div>
    </section>`;
  api('/api/read?name=architecture')
    .then(r => { const el = $('archDoc'); if (el) el.innerHTML = (r && r.content) ? `<div class="txt md arch-md">${mdToHtml(r.content)}</div>` : '<div class="fleet-empty">ARCHITECTURE.md not found.</div>'; })
    .catch(() => { const el = $('archDoc'); if (el) el.innerHTML = '<div class="fleet-empty">Could not load ARCHITECTURE.md.</div>'; });
  api('/api/system-audit').then(renderSystemAuditBody).catch(() => {});
}
function renderSystemAuditBody(rec) {
  const el = $('sysAuditBody'); if (!el) return;
  if (!rec || rec.empty) { el.innerHTML = '<div class="fleet-empty">No system audit yet — run one to check cloud-sync, cross-surface coherence, and financial ↔ AI ↔ Jarvis reconciliation.</div>'; return; }
  const p = rec.parsed;
  if (!p) { el.innerHTML = `<div class="arch-audit-meta">Last run ${when(rec.ts)} · couldn't parse structured output</div><div class="txt md">${mdToHtml(rec.raw || '')}</div>`; return; }
  const lens = (name, l) => l ? `<div class="sa-lens sa-${esc(String(l.verdict || '').toLowerCase())}"><div class="sa-lens-top"><span class="sa-lens-name">${esc(name)}</span><span class="sa-lens-v">${esc(l.verdict || '?')}</span></div><ul>${(l.findings || []).slice(0, 5).map(f => `<li>${esc(String(f).slice(0, 220))}</li>`).join('')}</ul></div>` : '';
  el.innerHTML = `<div class="arch-audit-meta">Last run ${when(rec.ts)}${rec.turns ? ` · ${rec.turns} turns` : ''}</div>
    ${p.summary ? `<div class="cf-merged">${esc(p.summary)}</div>` : ''}
    ${lens('Cloud-sync integrity', (p.lenses || {}).cloudSync)}
    ${lens('Story coherence', (p.lenses || {}).storyCoherence)}
    ${lens('Financial ↔ AI ↔ Jarvis', (p.lenses || {}).financialAiJarvis)}
    ${(p.topRisks || []).length ? `<div class="sa-risks-h">Top risks <span class="cf-spinoff-hint">— log any as a ticket; logged ones clear</span></div>${p.topRisks.slice(0, 8).map((r, i) => r.loggedTicket
        ? `<div class="sa-risk-row sa-risk-logged"><div class="sa-risk-main"><b>${esc(r.what || '')}</b> ${r.where ? `<span class="sa-risk-where">${esc(r.where)}</span>` : ''}</div><a class="sa-risk-tkt" href="#/ticket/${esc(r.loggedTicket)}">✓ ${esc(r.loggedTicket)} →</a></div>`
        : `<div class="sa-risk-row"><div class="sa-risk-main"><b>${esc(r.what || '')}</b> ${r.where ? `<span class="sa-risk-where">${esc(r.where)}</span>` : ''}<div class="sa-risk-why">${esc(r.why || '')}</div></div><button class="btn sm" onclick="logAuditFinding(${i})">Log as ticket</button></div>`).join('')}` : ''}`;
  J._auditRisks = p.topRisks || [];   // referenced by index in logAuditFinding
}
// Log a system-audit top-risk as a ticket. Jarvis-categorize for v1 = a smart default (P1 bug) that
// John adjusts in the modal; he can Ask Jarvis on the created ticket to refine scope/severity.
function logAuditFinding(idx) {
  const r = ((J._auditRisks) || [])[idx]; if (!r) { toast('finding not found', 'err'); return; }
  J._auditLogIdx = idx;   // remembered so doLogAuditFinding can stamp the risk as cleared
  const title = String(r.what || 'System-audit finding').slice(0, 120);
  const summary = `[From system audit ${new Date().toISOString().slice(0, 10)}]\n\n${r.what || ''}\n\nWhere: ${r.where || '(unspecified)'}\n\nWhy: ${r.why || ''}`;
  modal(`<h2>Log audit finding as a ticket</h2>
    <p>Creates a ticket from this system-audit risk. The detail below is for CC; tune the category, then create.</p>
    <div class="label">Title</div><input id="afTitle" value="${esc(title)}" maxlength="200">
    <div class="label" style="margin-top:10px">Detail (for CC)</div><textarea id="afSummary">${esc(summary)}</textarea>
    <div class="dsp-tunes" style="margin-top:10px">
      <div class="dsp-tune"><label class="dsp-tune-lbl" for="afType">Type</label><div class="dsp-selwrap"><select id="afType" class="dsp-sel"><option value="bug" selected>Bug</option><option value="task">Task</option></select></div></div>
      <div class="dsp-tune"><label class="dsp-tune-lbl" for="afSev">Severity</label><div class="dsp-selwrap"><select id="afSev" class="dsp-sel"><option value="P1" selected>P1</option><option value="P0">P0</option><option value="P2">P2</option></select></div></div>
    </div>
    <div class="btns"><button class="btn primary" onclick="doLogAuditFinding()">Create ticket</button><button class="btn" onclick="closeModal()">Cancel</button></div>`);
}
async function doLogAuditFinding() {
  const title = ($('afTitle').value || '').trim(); if (!title) { toast('title required', 'err'); return; }
  const summary = ($('afSummary').value || '').trim();
  const type = $('afType') ? $('afType').value : 'bug'; const severity = $('afSev') ? $('afSev').value : 'P1';
  try {
    const r = await action('createTicket', { title, summary, type, severity });
    // Stamp the audit risk as logged so the ruthless-audit list clears it next render.
    if (J._auditLogIdx != null) { try { await action('markAuditLogged', { idx: J._auditLogIdx, ticketId: r.id }); } catch (_) {} J._auditLogIdx = null; }
    closeModal(); toast(`Created ${r.id} from the system audit — finding cleared`, 'ok');
    await load(); location.hash = '#/ticket/' + r.id;
  } catch (e) { /* action() already toasted */ }
}
async function runSystemAudit() {
  try {
    await action('systemAudit', { confirm: true });
    toast('System audit dispatched — ~few min', 'ok');
    if ('Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (_) {} }
    J.ccjobs = J.ccjobs || {};
    J.ccjobs['SYSTEM#audit'] = { status: 'running', id: 'SYSTEM', task: 'system-audit', mode: 'gather', model: 'sonnet', started: Date.now() };
    J.dspWatch = 'SYSTEM';
    dspStartPoll('SYSTEM'); dspRenderTopbar(); dspEnsureBannerTimer();
    if ((location.hash || '').includes('architecture')) viewArchitecture();
  } catch (e) { /* action() already toasted */ }
}
function newInitiative() {
  modal(`<h2><span aria-hidden="true">✦</span> Plan a new initiative</h2>
    <p>Creates a <b>feature</b> ticket for a new layer/concept. Investigate or Build-the-case on it like any ticket.</p>
    <div class="label">Name</div><input id="niTitle" placeholder="e.g. Cloud state sync (Bundle 23)" maxlength="200">
    <div class="label" style="margin-top:10px">What is it / why</div><textarea id="niSummary" placeholder="The layer, the goal, the rough shape…"></textarea>
    <div class="label" style="margin-top:10px">Surface (optional)</div><input id="niSurface" placeholder="e.g. settings, savings — or blank for planning">
    <div class="btns"><button class="btn primary" onclick="doNewInitiative()">Create initiative</button><button class="btn" onclick="closeModal()">Cancel</button></div>`);
}
async function doNewInitiative() {
  const title = ($('niTitle').value || '').trim(); if (!title) { toast('name it first', 'err'); return; }
  const summary = ($('niSummary').value || '').trim();
  const surface = ($('niSurface').value || '').trim() || null;
  try {
    const r = await action('createTicket', { title, summary, type: 'feature', severity: 'P2', surface });
    closeModal(); toast(`Created ${r.id}`, 'ok');
    await load(); location.hash = '#/ticket/' + r.id;
  } catch (e) { /* action() already toasted */ }
}

/* ════════════════════════ COMMAND CENTRE — the orbital drone deck ════════════════
 * The one page that breaks the light skin: a dark, glowing command deck for deploying the
 * headless-Claude drone fleet. No copy-paste prompts — every agent is a one-click deploy against
 * a selected target. Live fleet with a radar sweep. Full keyboard control. */
const CC_AGENTS = [
  { id: 'build',          ic: '⚡', name: 'Build the Case',   role: 'Full parallel sweep → fills the whole case file + auditor', needs: 'ticket', hero: true },
  { id: 'root-cause',     ic: '⌖', name: 'Root-cause Dig',   role: 'Trace mechanism + root cause + every file:line',            needs: 'ticket' },
  { id: 'locate-surface', ic: '◇', name: 'Locate Surface',   role: 'Map the ticket to its App-Map surface',                     needs: 'ticket' },
  { id: 'fix-proposal',   ic: '⟐', name: 'Fix Proposal',     role: 'Design the minimal fix + invariants (needs root cause)',    needs: 'ticket' },
  { id: 'conformance',    ic: '⊟', name: 'Conformance',      role: 'FIT checks: mapped · labelled · canonical · invariants',    needs: 'ticket' },
  { id: 'auditor',        ic: '✓', name: 'Auditor',          role: 'Verify the case · merge · COMPLETE or one targeted re-dig',  needs: 'ticket' },
  { id: 'walk',           ic: '◎', name: 'Walk Drone',       role: 'Walk the surface live in a browser, map gaps',              needs: 'surface' },
  { id: 'jarvis',         ic: '✦', name: 'Ask Jarvis',       role: 'Conversational advisor — opens the ticket to ask',          needs: 'ticket' },
  { id: 'system',         ic: '⊕', name: 'System Auditor',   role: 'Whole-app health: sync · story · money↔AI↔Jarvis',          needs: 'none' },
];
let ccSel = 0;   // keyboard selection index across the deck
function viewCommandCentre() {
  const v = $('view'); v.className = 'view cmd-centre';
  const ts = J.tickets || [];
  const target = J._ccTarget && ts.find(t => t.id === J._ccTarget) ? J._ccTarget : '';
  const jobs = J.ccjobs || {};
  const running = Object.values(jobs).filter(j => j.status === 'running');
  const walkRunning = !!(J.walk && J.walk.deploying);
  const online = running.length + (walkRunning ? 1 : 0);
  const sp = J.ccspend || {};
  const targetable = ts.filter(t => !(t.state && t.state.status === 'Shipped')).sort((a, b) => SEVRANK[a.severity] - SEVRANK[b.severity]);

  const cards = CC_AGENTS.map((a, i) => {
    const liveOnTarget = target && jobs[target + '#' + a.id] && jobs[target + '#' + a.id].status === 'running';
    const disabled = (a.needs === 'ticket' && !target);
    return `<button class="cc-card${a.hero ? ' cc-hero' : ''}${i === ccSel ? ' cc-on' : ''}${disabled ? ' cc-dim' : ''}" data-i="${i}"
        ${liveOnTarget ? 'data-live="1"' : ''} onclick="ccDeploy(${i})" onmouseenter="ccHover(${i})">
      <span class="cc-card-ic">${a.ic}</span>
      <span class="cc-card-name">${esc(a.name)}</span>
      <span class="cc-card-role">${esc(a.role)}</span>
      <span class="cc-card-foot">${liveOnTarget ? '<span class="cc-pulse"></span> DEPLOYED' : (disabled ? 'SELECT TARGET' : 'DEPLOY ▸')}</span>
    </button>`;
  }).join('');

  const fleetRows = ccFleetHtml();   // built once; live updates go through renderCCFleet() (no full re-render = no flashing)

  v.innerHTML = `
    <div class="cc-bg" aria-hidden="true"></div>
    <header class="cc-head">
      <div class="cc-title"><span class="cc-title-glow">COMMAND</span> CENTRE</div>
      <div class="cc-telemetry">
        <span class="cc-tm"><b class="cc-tm-n ${online ? 'cc-tm-live' : ''}" id="ccOnline">${online}</b> drone${online === 1 ? '' : 's'} online</span>
        <span class="cc-tm"><b class="cc-tm-n">${(+sp.count || 0)}</b> ops total</span>
        <span class="cc-tm"><b class="cc-tm-n">~$${(+sp.today_usd || 0).toFixed(2)}</b> today</span>
      </div>
    </header>
    <button class="cc-triage" onclick="askJarvisTriage()" title="Jarvis reads the whole backlog, deploys drones, and reports back">
      <span class="cc-triage-ic">✦</span>
      <span class="cc-triage-txt"><b>What are my issues?</b><small>Jarvis triages the whole backlog with full context — then deploys drones and briefs you back</small></span>
      <span class="cc-triage-go">ASK JARVIS ▸</span>
    </button>
    <div class="cc-targetbar">
      <span class="cc-target-lbl">▸ TARGET</span>
      <select class="cc-target-sel" onchange="ccSetTarget(this.value)">
        <option value="">— select a ticket —</option>
        ${targetable.map(t => `<option value="${t.id}"${t.id === target ? ' selected' : ''}>${esc(t.id + ' · ' + String(t.title || '').slice(0, 48))}</option>`).join('')}
      </select>
      ${target ? `<a class="cc-target-open" href="#/ticket/${esc(target)}">open ${esc(target)} →</a>` : '<span class="cc-target-hint">ticket-scoped drones need a target · ←→ to pick an agent, Enter to deploy</span>'}
    </div>
    <div class="cc-layout">
      <section class="cc-deck">
        <div class="cc-deck-h">Agent Roster</div>
        <div class="cc-deck-grid">${cards}<button class="cc-card cc-new" onclick="ccNewAgent()"><span class="cc-card-ic">+</span><span class="cc-card-name">New Agent</span><span class="cc-card-role">Design a custom drone with Opus</span><span class="cc-card-foot">DESIGN ▸</span></button></div>
      </section>
      <aside class="cc-fleet">
        <div class="cc-fleet-h" id="ccFleetH"><span class="cc-radar"></span> Live Fleet${online ? ` · ${online}` : ''}</div>
        <div class="cc-fleet-list" id="ccFleetList">${fleetRows}</div>
      </aside>
    </div>`;
  ccBindKeys();
}
function ccSetTarget(id) { J._ccTarget = id || ''; viewCommandCentre(); }
function ccHover(i) { ccSel = i; document.querySelectorAll('.cc-card').forEach((el, n) => el.classList.toggle('cc-on', n === i)); }
function ccDeploy(i) {
  const a = CC_AGENTS[i]; if (!a) return;
  const target = J._ccTarget;
  if (a.needs === 'ticket' && !target) { toast('select a target ticket first', 'err'); return; }
  if (a.id === 'system') return doRunSystemAudit();
  if (a.id === 'build') return buildCase(target);
  if (a.id === 'jarvis') { location.hash = '#/ticket/' + target; setTimeout(() => toast('ask Jarvis from the ticket composer', 'ok'), 300); return; }
  if (a.id === 'walk') { const t = get(target); return goWalkDrone(t ? t.group : ''); }
  return digScoped(target, a.id);   // root-cause / locate-surface / fix-proposal / conformance / auditor
}
async function doRunSystemAudit() { if (typeof runSystemAudit === 'function') return runSystemAudit(); }
function ccFleetHtml() {
  const jobs = J.ccjobs || {};
  const running = Object.values(jobs).filter(j => j.status === 'running');
  const walkRunning = !!(J.walk && J.walk.deploying);
  const liveRows = (walkRunning ? `<div class="cc-fleet-row"><span class="cc-fleet-dot"></span><span class="cc-fleet-id">WALK</span><span class="cc-fleet-task">${esc((J.walk.scope) || 'all')}</span><span class="cc-fleet-clock">live</span></div>` : '')
    + running.map(j => { const ms = j.started ? Date.now() - j.started : 0; const clk = Math.floor(ms / 60000) + ':' + String(Math.floor((ms % 60000) / 1000)).padStart(2, '0'); return `<div class="cc-fleet-row"><span class="cc-fleet-dot"></span><a class="cc-fleet-id" href="${esc(agentHref(j.id))}">${esc(j.id)}</a><span class="cc-fleet-task">${esc(TASK_LABEL[j.task] || j.task || 'investigate')}</span><span class="cc-fleet-clock">${clk}</span></div>`; }).join('');
  const recent = Object.values(jobs).filter(j => j.status === 'done' || j.status === 'failed').sort((a, b) => (b.started || 0) - (a.started || 0)).slice(0, 8);
  const recentRows = recent.length ? `<div class="cc-fleet-sub">RECENT OPS</div>` + recent.map(j => `<div class="cc-fleet-row cc-fleet-done"><span class="cc-fleet-dot cc-dot-${j.status === 'done' ? 'ok' : 'bad'}"></span><a class="cc-fleet-id" href="${esc(agentHref(j.id))}">${esc(j.id)}</a><span class="cc-fleet-task">${esc(TASK_LABEL[j.task] || j.task || '—')}</span><span class="cc-fleet-clock">${j.status === 'done' ? '✓' : '✕'}</span></div>`).join('') : '';
  return (running.length || walkRunning) ? liveRows + recentRows : (recentRows || `<div class="cc-fleet-idle">No drones in the air. Select a target and deploy — agents you launch show here, live.</div>`);
}
// Update ONLY the fleet panel + telemetry in place — never a full re-render, so the deck never flashes.
function renderCCFleet() {
  const list = document.getElementById('ccFleetList'); if (!list) return;
  list.innerHTML = ccFleetHtml();
  const online = Object.values(J.ccjobs || {}).filter(j => j.status === 'running').length + ((J.walk && J.walk.deploying) ? 1 : 0);
  const h = document.getElementById('ccFleetH'); if (h) h.innerHTML = `<span class="cc-radar"></span> Live Fleet${online ? ` · ${online}` : ''}`;
  const o = document.getElementById('ccOnline'); if (o) { o.textContent = online; o.className = 'cc-tm-n' + (online ? ' cc-tm-live' : ''); }
}
let ccKeyHandler = null;
function ccBindKeys() {
  if (ccKeyHandler) document.removeEventListener('keydown', ccKeyHandler);
  ccKeyHandler = (e) => {
    if (!(location.hash || '').startsWith('#/command')) { document.removeEventListener('keydown', ccKeyHandler); ccKeyHandler = null; return; }
    if ($('scrim') && $('scrim').classList.contains('on')) return;   // a dialog is open
    const n = CC_AGENTS.length;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); ccSel = (ccSel + 1) % n; ccHover(ccSel); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); ccSel = (ccSel - 1 + n) % n; ccHover(ccSel); }
    else if (e.key === 'Enter') { e.preventDefault(); ccDeploy(ccSel); }
    else if (/^[1-9]$/.test(e.key) && +e.key <= n) { e.preventDefault(); ccSel = +e.key - 1; ccHover(ccSel); }
  };
  document.addEventListener('keydown', ccKeyHandler);
}
// New agent — describe it, an Opus drone drafts the spec (always Opus reasoning per John).
function ccNewAgent() {
  modal(`<h2><span aria-hidden="true">✦</span> Design a new agent</h2>
    <p>Describe the drone you want. <b>Opus</b> drafts its scope + prompt; you review before it joins the roster.</p>
    <div class="label">What should this agent do?</div>
    <textarea id="ccNaDesc" placeholder="e.g. a 'dependency mapper' that lists every reader/writer of a given S field with file:line"></textarea>
    <div class="btns"><button class="btn primary" onclick="doCcNewAgent()"><span aria-hidden="true">✦</span> Draft with Opus</button><button class="btn" onclick="closeModal()">Cancel</button></div>`);
  setTimeout(() => { const el = $('ccNaDesc'); if (el) el.focus(); }, 30);
}
async function doCcNewAgent() {
  const desc = ($('ccNaDesc').value || '').trim(); if (!desc) { toast('describe the agent first', 'err'); return; }
  try { await action('designAgent', { desc, confirm: true }); closeModal(); toast('Opus is drafting the agent — check the Knowledge tab when it lands', 'ok'); } catch (e) {}
}

/* ════════════════════════ JARVIS BRIEFING — autonomous triage ════════════════════
 * "Hey Jarvis, what are my issues?" — Jarvis reads the WHOLE backlog with full context
 * (architecture · financial invariants · live state · every open ticket), ranks the real
 * issues, AUTO-SWEEPS the top few, and reports back in plain English while teaching John.
 * Foundation for future voice. Backend: triageWorkload → triage-report.json. Lives in the
 * Command Centre's neon world, but calmer + readable. See AUTONOMOUS-TRIAGE.md. */

// Fire a fresh triage from anywhere (the CC hero today; voice later) and route to the Briefing.
async function askJarvisTriage() {
  try {
    await action('triageWorkload', { confirm: true });
    if ('Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (_) {} }
    J.ccjobs = J.ccjobs || {};
    J.ccjobs['SYSTEM#triage'] = { status: 'running', id: 'SYSTEM', task: 'triage', mode: 'gather', model: 'opus', started: Date.now() };
    J._triage = { status: 'running', plan: null };          // optimistic — the Briefing shows "thinking"
    J.dspWatch = 'SYSTEM';
    dspStartPoll('SYSTEM'); dspRenderTopbar(); dspEnsureBannerTimer();
    location.hash = '#/briefing';
    toast('Jarvis is triaging your backlog — Opus is reading everything', 'ok');
  } catch (e) { /* action() already toasted */ }
}

// BRIEFING CHAT — Phase 1: the conversational front door. Talk to Jarvis in plain English; Jarvis
// names actions; the server-side executor fires them (low-risk only this phase). The OLD viewBriefing
// (loadBriefing/renderBriefing below) is dead code — left intact so future surfaces could reuse the
// triage-rendering pattern if needed.
async function viewBriefing() {
  const v = $('view'); v.className = 'view bc';
  v.innerHTML = `
    <header class="bc-head">
      <h1 class="bc-h1"><span class="brief-glow">JARVIS</span> BRIEFING</h1>
      <p class="bc-sub">Talk to Jarvis. Plain English in, plain English out — Jarvis conducts the fleet.</p>
    </header>
    <div id="bcThread" class="bc-thread"><div class="bc-empty">Loading conversation…</div></div>
    <form class="bc-form" onsubmit="event.preventDefault();sendBriefingChat();return false;">
      <textarea id="bcInput" class="bc-input" rows="2" placeholder="Talk to Jarvis — try &quot;what matters in my backlog?&quot;, &quot;organize SLY-30&quot;, &quot;log a ticket: payday countdown is wrong&quot;…" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendBriefingChat()}"></textarea>
      <button class="btn primary bc-send" id="bcSend" type="submit">Send <kbd>&#8629;</kbd></button>
    </form>`;
  await loadBriefingChat();
  setTimeout(() => { const el = $('bcInput'); if (el) el.focus(); }, 50);
}
async function loadBriefingChat() {
  let chat; try { chat = await api('/api/briefing-chat'); } catch (_) { chat = { turns: [] }; }
  J._chat = chat || { turns: [] };
  renderBriefingChat();
}
function renderBriefingChat() {
  const thread = $('bcThread'); if (!thread) return;
  const turns = (J._chat && J._chat.turns) || [];
  if (!turns.length) {
    thread.innerHTML = `<div class="bc-empty">
      <div class="bc-empty-h">Start the conversation</div>
      <div class="bc-empty-sub">Try: <i>"what matters in my backlog?"</i> &middot; <i>"organize SLY-30"</i> &middot; <i>"log a ticket: payday countdown is wrong"</i> &middot; <i>"what would auto-log right now?"</i></div>
    </div>`;
    return;
  }
  thread.innerHTML = turns.map((t, i) => renderBriefingTurn(t, i)).join('');
  thread.scrollTop = thread.scrollHeight;
}
function renderBriefingTurn(t, ti) {
  const who = t.author === 'john' ? 'john' : t.author === 'jarvis' ? 'jarvis' : 'system';
  const acts = (t.actions || []).length ? `<div class="bc-acts">${t.actions.map((a, ai) => renderBriefingActionResult(a, ti, ai)).join('')}</div>` : '';
  const text = t._placeholder ? '<span class="bc-thinking">Jarvis is thinking…</span>' : esc(String(t.text || '')).replace(/\n/g, '<br>');
  return `<div class="bc-turn bc-${who}${t._placeholder ? ' bc-pending' : ''}">
    <div class="bc-author">${who === 'john' ? 'You' : who === 'jarvis' ? '<span class="bc-jarvis-glow">&#10022;</span> Jarvis' : '—'}<span class="bc-ts">${esc(when(t.ts) || '')}</span></div>
    <div class="bc-text">${text}</div>
    ${acts}
  </div>`;
}
function renderBriefingActionResult(a, turnIdx, actIdx) {
  const v = a.verdict;
  // PENDING_CONFIRM gets the typed-CONFIRM card (Phase 2 — the gate the entire risk-tier model rests on)
  if (v === 'PENDING_CONFIRM') {
    const argsPreview = JSON.stringify(a.args || {}, null, 2).slice(0, 300);
    return `<div class="bc-act bc-act-pending">
      <div class="bc-act-h"><code>${esc(a.name)}</code><span class="bc-act-v">&#9888; Awaiting your CONFIRM</span></div>
      ${a.why ? `<div class="bc-act-why">${esc(a.why)}</div>` : ''}
      <div class="bc-act-args"><b>Args:</b> <pre>${esc(argsPreview)}</pre></div>
      <div class="bc-act-reason">${esc(a.reason || 'High-risk — type CONFIRM exactly to fire.')}</div>
      <div class="bc-confirm-row">
        <input class="bc-confirm-input" id="bcConfirm-${turnIdx}-${actIdx}" placeholder="Type CONFIRM exactly to authorize" autocomplete="off">
        <button class="btn danger" onclick="chatConfirm(${turnIdx},${actIdx})">Confirm &amp; fire</button>
        <button class="btn" onclick="chatDismiss(${turnIdx},${actIdx})">Cancel</button>
      </div>
    </div>`;
  }
  const cls = v === 'FIRED' ? 'bc-act-ok' : v === 'BLOCKED' ? 'bc-act-block' : v === 'REJECTED' ? 'bc-act-no' : v === 'CANCELLED' ? 'bc-act-no' : 'bc-act-err';
  const label = v === 'FIRED' ? '&check; Fired' : v === 'BLOCKED' ? '&#9940; Blocked' : v === 'REJECTED' ? '&times; Rejected' : v === 'CANCELLED' ? '&times; Cancelled' : '&#9888; Error';
  let resultLine = '';
  if (a.result) {
    if (a.result.id && a.name === 'createTicket') resultLine = `Created <a href="#/ticket/${esc(a.result.id)}">${esc(a.result.id)}</a>${a.result.surface ? ' &middot; surface: ' + esc(a.result.surface) : ''}${a.result.enriching ? ' &middot; Jarvis is enriching…' : ''}`;
    else if (a.result.dispatched) resultLine = 'Dispatched: <code>' + esc(a.result.dispatched) + '</code>';
    else if (typeof a.result.wouldLog === 'number') resultLine = `Would auto-log: <b>${a.result.wouldLog}</b> &middot; skipped: ${a.result.skipped} &middot; <a href="#/dedupe">review</a>`;
    else if (typeof a.result.count === 'number') resultLine = `Merged ${a.result.count} into ${esc(a.result.into || '?')}`;
    else if (a.result.ok) resultLine = '&check;';
  }
  return `<div class="bc-act ${cls}">
    <div class="bc-act-h"><code>${esc(a.name)}</code><span class="bc-act-v">${label}</span></div>
    ${a.why ? `<div class="bc-act-why">${esc(a.why)}</div>` : ''}
    ${a.reason ? `<div class="bc-act-reason">${esc(a.reason)}</div>` : ''}
    ${resultLine ? `<div class="bc-act-result">${resultLine}</div>` : ''}
  </div>`;
}
// PHASE 2 — typed-CONFIRM gate. The exact text must be 'CONFIRM' (server checks case-sensitively too).
async function chatConfirm(turnIdx, actIdx) {
  const el = document.getElementById('bcConfirm-' + turnIdx + '-' + actIdx);
  const text = (el && el.value || '').trim();
  if (text !== 'CONFIRM') { toast('Type CONFIRM exactly (case-sensitive) to fire', 'err'); if (el) el.focus(); return; }
  try { await action('confirmChatAction', { turnIndex: turnIdx, actionIndex: actIdx, confirmText: text }); await loadBriefingChat(); }
  catch (e) {}
}
async function chatDismiss(turnIdx, actIdx) {
  try { await action('dismissChatAction', { turnIndex: turnIdx, actionIndex: actIdx }); await loadBriefingChat(); } catch (e) {}
}
async function sendBriefingChat() {
  const input = $('bcInput'); const send = $('bcSend');
  const msg = ((input && input.value) || '').trim(); if (!msg) return;
  if (input) input.value = ''; if (send) { send.disabled = true; send.textContent = 'Thinking…'; }
  J._chat = J._chat || { turns: [] };
  J._chat.turns.push({ author: 'john', text: msg, ts: new Date().toISOString() });
  J._chat.turns.push({ author: 'jarvis', text: '', ts: new Date().toISOString(), _placeholder: true });
  renderBriefingChat();
  try {
    await action('briefingChatTurn', { message: msg });
    await loadBriefingChat();   // server-truth thread (includes Jarvis's real reply + executed actions)
  } catch (e) {
    if (J._chat.turns.length && J._chat.turns[J._chat.turns.length - 1]._placeholder) J._chat.turns.pop();
    J._chat.turns.push({ author: 'system', text: 'Failed: ' + (e.message || 'unknown error'), ts: new Date().toISOString() });
    renderBriefingChat();
  } finally {
    if (send) { send.disabled = false; send.innerHTML = 'Send <kbd>&#8629;</kbd>'; }
    setTimeout(() => { if (input) input.focus(); }, 30);
  }
}
// Old triage-render briefing (dead since chat replaced it; kept harmless).
function viewBriefing_legacy() {
  const v = $('view'); v.className = 'view brief';
  J._briefAnimated = false;
  v.innerHTML = `
    <div class="cc-bg" aria-hidden="true"></div>
    <header class="brief-head">
      <div class="brief-title"><span class="brief-glow">JARVIS</span> BRIEFING</div>
      <button class="brief-rerun" onclick="askJarvisTriage()" title="Re-triage — the backlog has moved"><span class="brief-rerun-ic">↻</span> ask again</button>
    </header>
    <div id="briefBody" class="brief-body"><div class="brief-thinking"><span class="brief-orbit"></span> loading…</div></div>`;
  loadBriefing();
}

// Fetch the latest triage report, cache it, paint the body in place.
async function loadBriefing() {
  let rec; try { rec = await api('/api/triage'); } catch (_) { rec = J._triage; }
  if (rec && !rec.empty) J._triage = rec;
  renderBriefing();
}

// In-place render of #briefBody from the cached plan + LIVE sweep/case-file state. Poll-safe (no flash).
function renderBriefing() {
  const el = $('briefBody'); if (!el) return;
  const rec = J._triage;
  const triageRunning = (J.ccjobs || {})['SYSTEM#triage'] && J.ccjobs['SYSTEM#triage'].status === 'running';

  // never triaged
  if ((!rec || rec.empty) && !triageRunning) {
    el.innerHTML = `<div class="brief-empty">
      <div class="brief-empty-ic">✦</div>
      <h2>What are my issues?</h2>
      <p>Jarvis reads your whole backlog — the architecture, the financial contract, your live numbers, and every open ticket — then names the real issues, deploys drones on the top few, and reports back in plain English.</p>
      <button class="brief-cta" onclick="askJarvisTriage()">Ask Jarvis →</button>
    </div>`;
    return;
  }
  // commander still thinking
  if (triageRunning && (!rec || !rec.plan)) {
    el.innerHTML = `<div class="brief-thinking"><span class="brief-orbit"></span> Jarvis is reading the architecture, your invariants, your live state, and the whole backlog…<span class="brief-thinking-sub">Opus — a minute or two</span></div>`;
    return;
  }
  const plan = (rec && rec.plan) || null;
  if (!plan) {
    el.innerHTML = `<div class="brief-empty"><p>Jarvis returned no structured plan. <button class="brief-cta sm" onclick="askJarvisTriage()">Try again</button></p>${rec && rec.raw ? `<div class="txt md brief-raw">${mdToHtml(rec.raw)}</div>` : ''}</div>`;
    return;
  }

  const tix = {}; (J.tickets || []).forEach(t => tix[t.id] = t);
  const sweeps = J.sweeps || {};
  const dispatched = new Set(rec.dispatched || plan.investigateNow || []);
  const sevClass = (s) => 'sev-' + String(s || 'P2');

  const liveStatus = (id) => {
    const sw = sweeps[id]; const t = tix[id];
    const audited = t && t.caseFile && t.caseFile.audit && t.caseFile.audit.verdict;
    if (sw && sw.status === 'running') return { k: 'investigating', label: 'investigating · ' + (sw.step || 'gather') };
    if (audited || (sw && sw.status === 'done')) return { k: 'done', label: 'findings in' };
    if (dispatched.has(id)) return { k: 'queued', label: 'queued' };
    return null;
  };
  // The Briefing is JOHN'S reading surface — keep it plain (his standing rule: technical detail lives
  // on the ticket, not here). The auditor's converged one-paragraph case is the most readable single
  // summary; the raw mechanism / fix file:line dump stays on the ticket behind "open ticket →".
  const digest = (id) => {
    const t = tix[id]; if (!t || !t.caseFile) return '';
    const cf = t.caseFile;
    if (cf.audit && cf.audit.merged) {
      const m = String(cf.audit.merged); const short = m.length > 320 ? m.slice(0, 320).replace(/\s+\S*$/, '') + '…' : m;
      return `<div class="brief-digest"><div class="brief-find"><span class="brief-find-k">Drones found</span> ${esc(short)}</div></div>`;
    }
    if (cf.rootCause && cf.rootCause.rootCause) return `<div class="brief-digest"><div class="brief-find brief-find-progress">Root cause located — <a href="#/ticket/${esc(id)}">open the ticket</a> for the full case.</div></div>`;
    return '';
  };

  const issues = plan.issues || [];
  const issueIds = new Set(issues.map(i => i.ticketId));
  const bench = (plan.watchlist || []).filter(id => !issueIds.has(id)).map(id => tix[id]).filter(Boolean);

  // Split the ranked issues into "in the air / findings landed" (DEPLOYED NOW) vs "recommended
  // next, deploy to investigate" (DO NEXT) — the to-do list John asked for.
  const deployedNow = [], doNext = [];
  issues.forEach((iss, i) => { const ls = liveStatus(iss.ticketId); (ls ? deployedNow : doNext).push({ iss, rank: i + 1, ls }); });

  // SITREP live counts — the one-glance "what's going on right now".
  let nAir = 0, nQ = 0, nReady = 0;
  deployedNow.forEach(d => { if (d.ls.k === 'investigating') nAir++; else if (d.ls.k === 'queued') nQ++; else if (d.ls.k === 'done') nReady++; });

  // Stagger the card entrance only ONCE (first render) — re-renders from the poll sig-block must NOT
  // replay it (that's the Command-Centre flash class). The flag resets when the view is opened fresh.
  const anim = !J._briefAnimated && issues.length;
  if (anim) J._briefAnimated = true;

  const tile = (n, label, tone) => `<div class="brief-tile brief-tile-${tone}${n ? ' on' : ''}"><b class="brief-tile-n">${n}</b><span class="brief-tile-l">${label}</span></div>`;
  const card = (d, deployable) => {
    const iss = d.iss, id = iss.ticketId, t = tix[id], ls = d.ls;
    return `<div class="brief-card ${ls ? 'brief-live' : ''}" style="animation-delay:${(d.rank - 1) * 45}ms">
      <div class="brief-card-top">
        <span class="brief-rank">#${d.rank}</span>
        <a class="brief-tkt" href="#/ticket/${esc(id)}">${esc(id)}</a>
        <span class="brief-sev ${sevClass(iss.severity)}">${esc(iss.severity || '?')}</span>
        ${iss.confidence ? `<span class="brief-conf">${esc(iss.confidence)} confidence</span>` : ''}
        ${ls ? `<span class="brief-status brief-st-${ls.k}">${esc(ls.label)}</span>` : ''}
      </div>
      <div class="brief-card-title">${esc((t && t.title) || id)}</div>
      ${iss.why ? `<div class="brief-why">${esc(iss.why)}</div>` : ''}
      ${iss.learnForJohn ? `<div class="brief-learn"><span class="brief-learn-ic">◆</span> ${esc(iss.learnForJohn)}</div>` : ''}
      ${digest(id)}
      <div class="brief-card-foot">
        <a class="btn sm" href="#/ticket/${esc(id)}">open ticket →</a>
        ${deployable ? `<button class="btn sm brief-deploy" onclick="briefInvestigate('${esc(id)}')">⚡ deploy drones</button>` : ''}
      </div>
    </div>`;
  };

  el.innerHTML = `
    ${plan.summaryForJohn ? `<div class="brief-summary"><span class="brief-summary-k">Jarvis's read</span>${esc(plan.summaryForJohn)}</div>` : ''}
    <div class="brief-sitrep">
      ${tile(nAir, 'in the air', 'air')}
      ${tile(nQ, 'queued', 'q')}
      ${tile(nReady, 'ready for you', 'ready')}
      ${tile(doNext.length, 'do next', 'next')}
      ${tile(bench.length, 'on the bench', 'bench')}
    </div>
    <div class="brief-meta">${rec.status === 'running' ? '<span class="brief-orbit sm"></span> still triaging…' : `triaged ${issues.length} issue${issues.length === 1 ? '' : 's'}`}${rec.model ? ' · ' + esc(rec.model) : ''}${rec.ts ? ' · ' + when(rec.ts) : ''} · <button class="brief-link" onclick="askJarvisTriage()">re-triage</button></div>

    ${deployedNow.length ? `<section class="brief-sec brief-sec-air${anim ? ' brief-anim' : ''}">
      <div class="brief-sec-h"><span class="brief-radar"></span> DEPLOYED NOW <small>drones investigating — findings land here live</small></div>
      ${deployedNow.map(d => card(d, false)).join('')}
    </section>` : ''}

    ${doNext.length ? `<section class="brief-sec brief-sec-next${anim ? ' brief-anim' : ''}">
      <div class="brief-sec-h">DO NEXT <small>recommended — deploy drones to investigate</small></div>
      ${doNext.map(d => card(d, true)).join('')}
    </section>` : ''}

    ${bench.length ? `<section class="brief-sec">
      <div class="brief-sec-h">ON THE BENCH <small>real, but not now</small></div>
      <div class="brief-watch">${bench.map(t => `<div class="brief-watch-row"><a class="brief-watch-main" href="#/ticket/${t.id}"><span class="brief-sev ${sevClass(t.severity)}">${esc(t.severity || '?')}</span> <b>${esc(t.id)}</b> ${esc(String(t.title || '').slice(0, 72))}</a><button class="btn sm" onclick="briefInvestigate('${esc(t.id)}')">deploy</button></div>`).join('')}</div>
    </section>` : ''}

    ${!issues.length ? '<div class="brief-empty"><p>Jarvis found no real issues right now — clean backlog.</p></div>' : ''}`;
}

// "Investigate now" on a briefing card — kick a sweep on a watchlisted / not-yet-dispatched issue.
async function briefInvestigate(id) {
  try {
    await action('buildCase', { id, confirm: true });
    toast(`Drones deployed on ${id}`, 'ok');
    J.dspWatch = id; dspStartPoll(id); dspEnsureBannerTimer();
    renderBriefing();
  } catch (e) { /* action() already toasted */ }
}

/* ── router ───────────────────────────────────────────────────────────── */
function route() {
  // Nav history — remember where we came from so Back returns to the page you were just on
  // (not just raw browser-back). J._navBack suppresses the push when WE triggered the navigation.
  const _cur = location.hash || '#/overview';
  if (J._navBack) J._navBack = false;
  else if (J._lastHash && J._lastHash !== _cur) {
    J._navStack = J._navStack || [];
    if (J._navStack[J._navStack.length - 1] !== J._lastHash) J._navStack.push(J._lastHash);
    if (J._navStack.length > 50) J._navStack.shift();
  }
  J._lastHash = _cur;
  const raw = (location.hash || '#/overview').slice(1);
  const [pathPart, queryPart] = raw.split('?');
  // Overview stat cards deep-link via a query suffix (#/board?status=… / ?sev=…).
  // Parse it into J.filter BEFORE dispatch so the Board lands pre-filtered.
  // The Overview uses meta-group statuses 'needs'/'flight' (Open+Discussing /
  // Aligned+Investigating); the premium Board models those as saved VIEWS
  // (judgment/flight), so map them onto J.filter.view and clear the literal
  // status filter. A literal STATUS name (e.g. Shipped) sets J.filter.status and
  // selects the matching saved view where one exists.
  if (queryPart) {
    const q = new URLSearchParams(queryPart);
    const STATUS_VIEW = { needs: 'judgment', flight: 'flight', Shipped: 'shipped', ConfirmedLive: 'live' };
    if (q.has('status')) {
      const s = q.get('status');
      if (s === 'needs' || s === 'flight') { J.filter.view = STATUS_VIEW[s]; J.filter.status = ''; }
      else { J.filter.status = s; J.filter.view = STATUS_VIEW[s] || 'all'; }
    }
    if (q.has('sev'))    { J.filter.severity = q.get('sev'); if (q.get('sev') === 'P0') J.filter.view = 'p0'; }
    if (q.has('surface'))J.filter.surface = q.get('surface');
    if (q.has('type'))   J.filter.type = q.get('type');
  }
  const parts = pathPart.split('/').filter(Boolean);
  const r = parts[0] || 'overview';
  document.querySelectorAll('.rail a').forEach(a => a.classList.toggle('on', a.dataset.r === r));
  if (r === 'ticket' && parts[1]) viewTicket(parts[1]);
  else if (r === 'board') viewBoard();
  else if (r === 'dedupe') viewDedupe();
  else if (r === 'map') { if (parts[1]) viewMap(parts[1]); else viewGraphMap(); }
  else if (r === 'knowledge') viewKnowledge(parts[1]);
  else if (r === 'calendar') viewCalendar();
  else if (r === 'planning') viewPlanning();
  else if (r === 'insights') viewInsights();
  // Retired tabs (consolidated into Board / Command Centre) — routes kept as redirects so old links + the
  // Now bar don't dead-end. Roadmap → Board grouped by status; Recommends → Board sorted by leverage.
  else if (r === 'roadmap') { J.filter = { surface: '', severity: '', type: '', status: '', search: '', sort: 'activity', view: 'all', group: 'status' }; location.hash = '#/board'; return; }
  else if (r === 'recommend') { J.filter = { surface: '', severity: '', type: '', status: '', search: '', sort: 'leverage', view: 'all', group: '' }; location.hash = '#/board'; return; }
  else if (r === 'deploy') viewDeploy();
  else if (r === 'agents-fleet') { location.hash = '#/command'; return; }
  else if (r === 'architecture') viewArchitecture();
  else if (r === 'briefing') viewBriefing();
  else if (r === 'epic' && parts[1]) viewEpic(parts[1]);
  else if (r === 'command') { if (parts[1] === 'prompts') viewPrompts(); else viewCommandCentre(); }
  else if (r === 'overview-classic') viewOverview();   // the old stat-card overview, still reachable
  else viewFlightdeck();                                 // the management home
  renderTopbarStatus();
  renderNowBar();
  renderBackBtn();
  window.scrollTo(0, 0);
}
// Back to wherever you came from (pops the nav stack). goHash re-renders even when the target
// equals the current hash. Falls back to Overview when the stack is empty.
function goBack() {
  const stack = J._navStack || [];
  if (!stack.length) { goHash('#/overview'); return; }
  J._navBack = true;            // don't re-push the page we're leaving
  goHash(stack.pop());
}
function hashLabel(h) {
  const p = String(h || '').replace('#/', '').split('?')[0].split('/');
  const m = { overview: 'Overview', board: 'Board', recommend: 'Recommends', briefing: 'Briefing', command: 'Command Centre', 'agents-fleet': 'Fleet', architecture: 'Architecture', map: 'App Map', planning: 'Planning', calendar: 'Calendar', insights: 'Insights', roadmap: 'Roadmap', knowledge: 'Knowledge', deploy: 'Deploy', ticket: (p[1] || 'ticket'), epic: 'epic ' + (p[1] || '') };
  return m[p[0]] || p[0] || 'back';
}
function renderBackBtn() {
  const host = $('navBack'); if (!host) return;
  const stack = J._navStack || [];
  host.innerHTML = stack.length
    ? `<button class="nav-back" onclick="goBack()" title="Back to ${esc(hashLabel(stack[stack.length - 1]))}"><span aria-hidden="true">‹</span> Back</button>`
    : '';
}
$('scrim').addEventListener('click', e => { if (e.target === $('scrim')) closeModal(); });
// Escape closes the shared ticket-style modal (Deploy / Create / Delete / Align / Dispatch /
// prompt forms). Bails when the ⌘K palette owns the keypress (it has its own #cpScrim + Esc),
// and only acts when the #scrim is actually open — so it can't fire spuriously.
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (CP && CP.open) return;                                   // palette owns Esc when it's open
  if (!$('scrim').classList.contains('on')) return;            // no ticket modal is up
  e.preventDefault();
  closeModal();
});
window.addEventListener('hashchange', route);
(async function boot() { await load(); renderTopbarStatus(); if (!location.hash) location.hash = '#/overview'; route(); setupPalette(); dspBootPoll(); })();
