/* ============================================================================
 * Jarvis — slyght mission control. The ticketing platform + CC intermediary.
 * Hash router · board (kanban by status) · ticket detail (the case-view skin) ·
 * the core loop: discuss thread → "get Jarvis's take" → ALIGN gate → collate
 * handoff → CC posts back. Reads /api/tickets; writes via the allowlisted actions.
 * ==========================================================================*/
'use strict';
const TOKEN = window.MC_TOKEN;
const J = { tickets: [], filter: { surface: '', severity: '', type: '', status: '', search: '', sort: 'activity', view: 'all' }, flows: null, autotickets: null, walk: null, mapFace: 'back', mapSurface: null, cal: null, dep: null, ccspend: null };
const STATUSES = ['Open', 'Discussing', 'Aligned', 'Investigating', 'ConfirmedLive', 'Shipped'];
const STATUS_LABEL = { Open: 'Open', Discussing: 'Discussing', Aligned: 'Aligned', Investigating: 'Investigating', ConfirmedLive: 'Confirmed live', Shipped: 'Shipped' };

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
async function load() { J.tickets = (await api('/api/tickets')).tickets || []; }
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

/* ════════════════════════ OVERVIEW (the whole story) ════════════════════ */
const SEVRANK = { P0: 0, P1: 1, P2: 2 };
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
    </div>

    <div class="bd2-list" role="list">
      ${shown.length
        ? shown.map(ticketRow).join('')
        : `<div class="bd2-empty">
             <div class="bd2-empty-ic">🔍</div>
             <div class="bd2-empty-h">No tickets match these filters</div>
             <div class="bd2-empty-b">Try a different saved view, clear the search, or reset the filter bar.</div>
             ${anyFilter ? `<button class="bd2-reset solid" onclick="resetFilters()">Reset filters</button>` : ''}
           </div>`}
    </div>`;
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
  return `<div class="bd2-row" role="listitem" data-id="${t.id}" onclick="rowOpen(event,'${t.id}')">
    <label class="bd2-check" onclick="event.stopPropagation()">
      <input type="checkbox" onchange="bd2ToggleSelect('${t.id}', this.checked)">
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

/* ── board state + helpers ────────────────────────────────────────────── */
// client mirror of the server's earned-state machine (server.js TRANSITIONS)
const TRANSITIONS_CLIENT = {
  Open: ['Discussing'],
  Discussing: ['Aligned', 'Open'],
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
function renderCaseFile(t) {
  const cf = t.caseFile || {};
  const rc = cf.rootCause || {};
  const audit = cf.audit || null;
  // scoped drones running on THIS ticket right now (live), keyed by task
  const running = {}; Object.values(J.ccjobs || {}).forEach(v => { if (v.id === t.id && v.status === 'running' && v.task) running[v.task] = true; });
  const sv = (audit && audit.slots) || {};   // per-slot auditor verdicts

  const rows = [
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
  const filled = rows.filter(r => r.filled).length;

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
    auditHtml = `<span><span class="cf-audit-tag cf-v-complete">✓ Complete</span> ready to align${(audit.caveats && audit.caveats.length) ? ` · ${audit.caveats.length} caveat(s)` : ''}</span><button class="btn sm" onclick="runAudit('${t.id}')">Re-audit</button>`;
  } else {
    const nd = audit.nextDig || null;
    const ndTask = (nd && nd.drone) ? taskKeyFromDrone(nd.drone) : '';
    // The Walk Drone is a separate mechanism (not a scoped task) → route to goWalkDrone, never digScoped('walk').
    let ndBtn;
    if (ndTask === 'walk') ndBtn = `<button class="btn sm primary" onclick="goWalkDrone('${esc(t.group || '')}')">Run Walk Drone</button>`;
    else if (ndTask) ndBtn = `<button class="btn sm primary" onclick="digScoped('${t.id}','${esc(ndTask)}')">Run suggested dig</button>`;
    else ndBtn = `<button class="btn sm" onclick="runAudit('${t.id}')">Re-audit</button>`;
    auditHtml = `<span><span class="cf-audit-tag cf-v-gap">Gap</span> ${nd ? `needs <b>${esc(nd.drone || '')}</b> — ${esc(String(nd.why || nd.scope || '').slice(0, 120))}` : 'more evidence needed'}</span>` + ndBtn;
  }
  const merged = (audit && audit.verdict === 'COMPLETE' && audit.merged) ? `<div class="cf-merged">${mdToHtml(audit.merged)}</div>` : '';

  // Spin-off findings — drone openQuestions + unmappedTerritory + audit caveats. One click logs any
  // as a new ticket linked back here, so investigations breed tickets instead of dying in a comment.
  const spin = [];
  ['rootCause', 'surface', 'fix', 'conformance'].forEach(k => {
    const slot = cf[k]; if (!slot) return;
    (slot.openQuestions || []).forEach(q => { const x = String(q || '').trim(); if (x) spin.push(x); });
    (slot.unmappedTerritory || []).forEach(u => { const x = (typeof u === 'string' ? u : JSON.stringify(u)).trim(); if (x) spin.push(x); });
  });
  if (cf.audit && Array.isArray(cf.audit.caveats)) cf.audit.caveats.forEach(c => { const x = String(c || '').trim(); if (x) spin.push(x); });
  const spinUniq = [...new Set(spin)].slice(0, 8);
  J._spin = J._spin || {}; J._spin[t.id] = spinUniq;   // referenced by index in logSpinoff (avoids attr-escaping)
  const spinoffBlock = spinUniq.length ? `
    <div class="cf-spinoff">
      <div class="cf-spinoff-h">Spin-off findings <span class="cf-spinoff-hint">— log any as a new linked ticket</span></div>
      ${spinUniq.map((x, i) => `<div class="cf-spinoff-row"><span class="cf-spinoff-t">${esc(x.slice(0, 180))}</span><button class="btn sm" onclick="logSpinoff('${t.id}',${i})">Log as ticket</button></div>`).join('')}
    </div>` : '';

  const sw = (J.sweeps || {})[t.id];
  const sweepRunning = sw && sw.status === 'running';
  return `<div class="card cf-card">
    <div class="cf-cardhead">
      <div class="label">Case file — evidence</div>
      <div class="cf-headright">
        <span class="cf-progress">${filled}/5 gathered</span>
        ${sweepRunning
          ? `<span class="cf-sweep"><span class="cf-spin" aria-hidden="true"></span> Building · ${esc(sw.step)}${sw.cycle ? ` (audit ${sw.cycle})` : ''}</span>`
          : `<button class="btn sm primary" onclick="buildCase('${t.id}')">⚡ Build the case</button>`}
      </div>
    </div>
    <div class="cf-list">${rowsHtml}</div>
    <div class="cf-auditrow">${auditHtml}</div>
    ${merged}
    ${spinoffBlock}
  </div>`;
}
// Dispatch a scoped GATHER drone (light confirm — it's read-only + on your plan, no cost-cap friction).
function digScoped(id, task) {
  if (task === 'walk') { const tk = get(id); goWalkDrone(tk ? tk.group : ''); return; }   // walk isn't a scoped task
  const labels = { 'root-cause': 'Root-cause dig', 'locate-surface': 'Locate surface', 'fix-proposal': 'Fix proposal', 'conformance': 'Conformance', 'auditor': 'Auditor' };
  const lbl = labels[task] || task;
  modal(`<h2>Dispatch ${esc(lbl)} drone</h2>
    <p>Spawns a <b>read-only</b> CC drone scoped to <b>${esc(lbl.toLowerCase())}</b> on ${esc(id)}. It edits nothing, runs on your plan, takes a few minutes, and <b>auto-fills the case file</b> when done.</p>
    <div class="btns"><button class="btn primary" onclick="doDigScoped('${id}','${task}')"><span aria-hidden="true">▶</span> Dispatch</button><button class="btn" onclick="closeModal()">Cancel</button></div>`);
}
async function doDigScoped(id, task) {
  closeModal();
  try {
    await action('dispatchScoped', { id, task, confirm: true });
    toast(`${task} drone dispatched on ${id}`, 'ok');
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
  modal(`<h2><span aria-hidden="true">⚡</span> Build the case — ${esc(id)}</h2>
    <p>Fans out the scoped drones — <b>root cause + surface</b> (parallel), then <b>fix</b>, <b>conformance</b>, and the <b>auditor</b>. On a gap it runs one targeted re-dig and re-audits, then converges. Fills the whole case file so you can align in one read.</p>
    <p class="cf-sweep-note">~5–7 read-only drones · runs on your plan · ~20–30 min · converges automatically · never pushes or deploys.</p>
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
// Log a spin-off finding (by index into J._spin[parentId]) as a new ticket linked back to the parent.
function logSpinoff(parentId, idx) {
  const text = ((J._spin || {})[parentId] || [])[idx] || '';
  if (!text) { toast('finding not found', 'err'); return; }
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
    const r = await action('createTicket', { title, summary, type, severity, surface: parent ? parent.group : null, parent: parentId });
    closeModal(); toast(`Created ${r.id} — linked to ${parentId}`, 'ok');
    await load();
    if ((location.hash || '').includes('/ticket/' + parentId)) viewTicket(parentId);
  } catch (e) { /* action() already toasted */ }
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
            ${['Open', 'Discussing'].includes(status)
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
        <div class="siderail">
          <div class="sh">Details</div>
          <div class="kv"><span class="k">Status</span><span class="v"><span class="pill sm s-${status}">${STATUS_LABEL[status]}</span></span></div>
          <div class="kv"><span class="k">Assignee</span><span class="v">${assignee === 'cc' ? 'CC — investigating' : 'John — needs judgment'}</span></div>
          <div class="kv fld-kv"><span class="k">Type</span><span class="v">
            ${fldSelect(t.id, 'type', t.type, [['bug', 'Bug'], ['feature', 'Feature'], ['task', 'Task']], 'fld-type-' + t.type)}
          </span></div>
          <div class="kv fld-kv"><span class="k">Severity</span><span class="v">
            ${fldSelect(t.id, 'severity', t.severity, [['P0', 'P0 · Critical'], ['P1', 'P1 · High'], ['P2', 'P2 · Normal']], sevCls(t.severity))}
          </span></div>
          <div class="kv fld-kv"><span class="k">Due date</span><span class="v">
            <input type="date" class="fld-date${t.dueDate ? ' set' : ''}" value="${esc(t.dueDate || '')}"
              onchange="setMeta('${t.id}','dueDate',this.value)" aria-label="Due date for ${t.id}">
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
        ${(t.links || []).length ? `<div class="siderail"><div class="sh">Related</div>${t.links.map(l => `<div class="kv"><span class="k">${l.to.startsWith('SLY') ? `<a href="#/ticket/${l.to}">${esc(l.to)}</a>` : esc(l.to)}</span><span class="v" style="font-weight:400;color:var(--muted);font-size:12px;max-width:150px">${esc(l.why)}</span></div>`).join('')}</div>` : ''}
        ${sync.length ? `<div class="siderail" style="background:var(--green-bg);border-color:#a6e9c0"><div class="sh" style="color:var(--green)">Kept in sync on ship</div><div style="font-size:13px;color:#1a1d24;line-height:1.6">${sync.map(esc).join(', ')} — the reasoning stays here on the ticket.</div></div>` : ''}
        <div class="siderail">
          <div class="sh">Activity</div>
          <div class="kv"><span class="k">Opened</span><span class="v">${when(st.opened)}</span></div>
          ${st.alignment ? `<div class="kv"><span class="k">Aligned</span><span class="v">${when(st.alignment.ts)}</span></div>` : ''}
          ${ev ? `<div class="kv"><span class="k">Found by walk</span><span class="v">${esc(ev.walkDir || 'Yes')}</span></div>` : ''}
          ${st.evidence && st.evidence.kind === 'walk' ? `<div class="kv cw-confirmed"><span class="k">Confirmed-live by</span><span class="v">walk <code>${esc(st.evidence.walkDir)}</code> · ${when(st.evidence.walkedAt)}</span></div>` : ''}
          <div class="kv"><span class="k">Last activity</span><span class="v">${when(st.lastActivity)}</span></div>
        </div>
        <div class="siderail danger-rail">
          <div class="sh">Danger zone</div>
          <p class="dz-note">Permanently remove this ticket. This can't be undone.</p>
          <button class="btn danger full" onclick="askDelete('${t.id}')">Delete ticket</button>
        </div>
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
function align(id) {
  const t = get(id);
  modal(`<h2>&#10003; Aligned — hand to CC</h2>
    <p>This is the gate. Jarvis collates the rich finding + your whole thread + this decision + links + age into one package and hands it to CC. State → <b>Aligned</b>.</p>
    <div class="label" style="margin-top:8px">Your alignment decision</div>
    <textarea id="alignDec" placeholder="e.g. Agreed — fix as proposed. Or: change it — do X instead because…">Agreed with the proposed fix.</textarea>
    <div class="btns"><button class="btn green" onclick="doAlign('${id}')">Confirm — collate &amp; hand to CC</button><button class="btn" onclick="closeModal()">Cancel</button></div>`);
}
async function doAlign(id) {
  const decision = ($('alignDec').value || '').trim();
  try {
    const r = await action('alignHandoff', { id, decision });
    closeModal();
    modal(`<h2>Handed to CC → ${esc(r.handoff)}</h2>
      <p>The rich package is written. <b>This is what CC receives</b> — deeper than your summary: the finding, your full thread, your decision, links, age. Paste the kickoff to start the mission:</p>
      <pre id="kick">${esc(r.kickoff)}</pre>
      <div class="btns"><button class="btn primary" onclick="navigator.clipboard.writeText(document.getElementById('kick').textContent);toast('copied','ok')">Copy kickoff</button>
      <button class="btn" onclick="viewHandoff('${id}')">View the package</button>
      <button class="btn" onclick="closeModal()">Close</button></div>`);
    await load();
    if ((location.hash || '').includes('/ticket/' + id)) viewTicket(id);  // refresh the card behind the modal → status flips to Aligned live
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
      location.hash = '#/agents-fleet';   // show it in the Fleet, where running agents live
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
      const cur = currentTicketId();
      const rt = (location.hash || '').slice(1).split('?')[0].split('/')[1];
      if (cur) viewTicket(cur);
      else if (rt === 'agents-fleet') viewAgentsFleet();
      else if (rt === 'architecture') viewArchitecture();
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

  const walkChip = walkRunning ? `<button type="button" class="dsp-chip" title="Walk Drone · ${esc((J.walk && J.walk.scope) || 'all')} — open Command deck" onclick="location.hash='#/agents-fleet'">Walk · ${esc((J.walk && J.walk.scope) || 'all')}</button>` : '';
  const chips = walkChip + running.slice(0, 4).map(([key, v]) => {
    // chip links to the TICKET (v.id), not the id#task key; shows the scoped task when present
    const label = v.task ? `${v.id} · ${TASK_LABEL[v.task] || v.task}` : v.id;
    return `<button type="button" class="dsp-chip" title="${esc(label)} — open"
       onclick="location.hash='${esc(agentHref(v.id))}'">${esc(label)}</button>`;
  }).join('');
  const more = running.length > 4 ? `<span class="dsp-chip-more">+${running.length - 4}</span>` : '';
  host.innerHTML =
    `<span class="sys-sep"></span>` +
    `<span class="dsp-agents-wrap" title="CC drones running now">
       <span class="dsp-live-dot" aria-hidden="true"></span>
       <b class="dsp-agents-n">${count}</b>
       <span class="dsp-agents-l">Agent${count === 1 ? '' : 's'} Running</span>
       <span class="dsp-chips">${chips}${more}</span>
     </span>` +
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
const TASK_LABEL = { 'root-cause': 'Root-cause dig', 'locate-surface': 'Locate surface', 'fix-proposal': 'Fix proposal', 'conformance': 'Conformance', 'auditor': 'Auditor', 'jarvis-chat': 'Jarvis', 'system-audit': 'System audit' };
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
    if (id) dspRenderTicketBanner(id);
    else if ((location.hash || '').slice(1).split('?')[0].split('/')[1] === 'agents-fleet') viewAgentsFleet();   // tick the fleet clocks
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
  severity: 34,   // P0 vs P2 — the single biggest lever. What's actually critical.
  readiness: 28,  // how close to landing. ConfirmedLive = "ship now"; Open = needs John.
  age:       16,  // open-staleness. Older untouched tickets rot — nudge them up.
  surface:   14,  // cash-surface criticality. Money surfaces outrank cosmetic ones.
  blast:      8,  // link count / blast radius. More dependents = clear it first.
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

// BLAST intensity — number of links/dependents, saturating at 4. A ticket other
// tickets hang off is worth clearing first (it unblocks them).
function recBlastIntensity(t) {
  const n = (t.links || []).length;
  return Math.min(1, n / 4);
}

// Score one ticket. Returns { total, factors:[{key,label,pts,why}] } so the view
// can show BOTH the number and the human "why". factors are sorted by pts desc.
function scoreTicket(t) {
  const st = t.state || {};
  const cash = REC_CASH.has(t.group);
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
    { key: 'blast', label: 'Blast',
      i: recBlastIntensity(t),
      why: (t.links || []).length
        ? (t.links.length + ' link' + (t.links.length === 1 ? '' : 's') + ' hang off it')
        : 'no links' },
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
  const WORKING = ['Discussing', 'Aligned', 'Investigating'];
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
    <div class="rec-scorewrap" title="Leverage score ${scored.total} / ${maxScore}">
      <div class="rec-score-n">${scored.total}</div>
      <div class="rec-score-l">leverage</div>
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
  depRender();
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

  // ── the push button — armed only in 'ready' ──
  let pushBtn, hint;
  if (state === 'no-upstream') {
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

  body.innerHTML = `
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
  const g = J.dep || {};
  const ahead = g.ahead || 0, upstream = g.upstream || 'origin';
  if (!g.hasUpstream || ahead === 0) { toast('Nothing to push', 'err'); return; }   // guard — never arm without an upstream + commits
  modal(`<h2>Push ${ahead} commit${ahead === 1 ? '' : 's'} to GitHub</h2>
    <p>This runs <b>git push</b> from your local repo to <code>${esc(upstream)}</code> — the
       <b>one irreversible action</b>. It's the only way prod changes go live. Review the commit
       list behind this dialog first; nothing fires until you type the word below.</p>
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
      toast('Pushed to GitHub — prod is live', 'ok');
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
    ${(p.topRisks || []).length ? `<div class="sa-risks-h">Top risks</div>${p.topRisks.slice(0, 6).map(r => `<div class="sa-risk-row"><b>${esc(r.what || '')}</b> ${r.where ? `<span class="sa-risk-where">${esc(r.where)}</span>` : ''}<div class="sa-risk-why">${esc(r.why || '')}</div></div>`).join('')}` : ''}`;
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

/* ── router ───────────────────────────────────────────────────────────── */
function route() {
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
  else if (r === 'map') viewMap(parts[1]);
  else if (r === 'knowledge') viewKnowledge(parts[1]);
  else if (r === 'calendar') viewCalendar();
  else if (r === 'planning') viewPlanning();
  else if (r === 'insights') viewInsights();
  else if (r === 'roadmap') viewRoadmap();
  else if (r === 'recommend') viewRecommend();
  else if (r === 'deploy') viewDeploy();
  else if (r === 'agents-fleet') viewAgentsFleet();
  else if (r === 'architecture') viewArchitecture();
  else if (r === 'command') { if (parts[1] === 'prompts') viewPrompts(); else viewCommand(); }
  else viewOverview();
  renderTopbarStatus();
  window.scrollTo(0, 0);
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
