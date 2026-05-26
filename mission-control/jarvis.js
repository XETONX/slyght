/* ============================================================================
 * Jarvis — slyght mission control. The ticketing platform + CC intermediary.
 * Hash router · board (kanban by status) · ticket detail (the case-view skin) ·
 * the core loop: discuss thread → "get Jarvis's take" → ALIGN gate → collate
 * handoff → CC posts back. Reads /api/tickets; writes via the allowlisted actions.
 * ==========================================================================*/
'use strict';
const TOKEN = window.MC_TOKEN;
const J = { tickets: [], filter: { surface: '', severity: '', type: '', status: '', search: '', sort: 'activity', view: 'all' }, flows: null, walk: null, mapFace: 'back', mapSurface: null, cal: null };
const STATUSES = ['Open', 'Discussing', 'Aligned', 'Investigating', 'ConfirmedLive', 'Shipped'];
const STATUS_LABEL = { Open: 'Open', Discussing: 'Discussing', Aligned: 'Aligned', Investigating: 'Investigating', ConfirmedLive: 'Confirmed live', Shipped: 'Shipped' };

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
async function api(p) { const r = await fetch(p); return r.json(); }
async function action(name, args) {
  const r = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, args: args || {}, token: TOKEN }) });
  const j = await r.json(); if (!r.ok || j.ok === false) { toast(j.error || j.reason || 'failed', 'err'); throw new Error(j.error || j.reason); } return j;
}
function toast(m, k) { const t = $('toast'); t.textContent = m; t.className = 'on ' + (k || ''); setTimeout(() => t.className = k || '', 2800); }
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

/* ── data ─────────────────────────────────────────────────────────────── */
async function load() { J.tickets = (await api('/api/tickets')).tickets || []; }
const get = id => J.tickets.find(t => t.id === id);

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
    (health != null ? stat(health + '%', 'Health', health >= 60 ? 'sys-green' : 'sys-amber') : '');
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
      return `<div class="gbsrow gbs-${tone}" onclick="location.hash='#/map/${s.id}'" title="Open the ${esc(shortName(s))} map">
          <span class="gbslabel">${esc(shortName(s))}</span>
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
          ${needsJohn.length > 6 ? `<button type="button" class="ov2-more" onclick="J.filter={surface:'',severity:'',type:'',status:'needs',search:'',sort:'activity',view:'all'};location.hash='#/board'">+${needsJohn.length - 6} more on the Board →</button>` : ''}
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

      <!-- TYPE — quick-filter -->
      <div class="bd2-ctrl">
        <span class="bd2-ctrl-k">Type</span>
        <button class="bd2-pillbtn pill sm k-${t.kind}" title="Filter by type: ${esc(cap(t.type))}" onclick="setFilter('type','${t.type}')">${esc(cap(t.type))}</button>
      </div>

      <!-- PRIORITY (severity) — quick-filter -->
      <div class="bd2-ctrl">
        <span class="bd2-ctrl-k">Priority</span>
        <button class="bd2-pillbtn pill sm ${sevCls(t.severity)}" title="Filter by priority: ${t.severity}" onclick="setFilter('severity','${t.severity}')">${t.severity}</button>
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
  let evidence;
  if (to === 'ConfirmedLive') {
    evidence = (window.prompt('Confirmed live is EARNED — paste the walk evidence (what proves it landed in the running app):', '') || '').trim();
    if (!evidence) { toast('Confirmed live needs evidence — not just a label', 'err'); if (sel) sel.value = t.state.status; return; }
  }
  try {
    await action('setStatus', { id, to, evidence });
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
        <div class="card">
          <div class="label">Discuss with Jarvis — then align to hand to CC</div>
          <div class="thread" id="thread">${renderThread(st.thread)}</div>
          <div class="composer">
            <textarea id="cmt" placeholder="Refine the fix, add a constraint, ask a question…"></textarea>
            <div class="summary-bubble"><div class="h">This ticket, in short</div>${esc((t.summary || '').slice(0, 200))}…</div>
          </div>
          <div class="btns">
            <button class="btn" onclick="comment('${t.id}')">Comment</button>
            <button class="btn" onclick="jarvisTake('${t.id}')">Get Jarvis's take</button>
            <button class="btn" onclick="goDeeper('${t.id}')">Go deeper</button>
            ${['Open', 'Discussing'].includes(status)
              ? `<button class="btn green" onclick="align('${t.id}')">&#10003; Aligned — hand to CC</button>`
              : `<button class="btn" onclick="viewHandoff('${t.id}')">View handoff package</button>`}
          </div>
        </div>
      </div>
      <div class="ticketside">
        <div class="siderail">
          <div class="sh">Details</div>
          <div class="kv"><span class="k">Status</span><span class="v"><span class="pill sm s-${status}">${STATUS_LABEL[status]}</span></span></div>
          <div class="kv"><span class="k">Assignee</span><span class="v">${assignee === 'cc' ? 'CC — investigating' : 'John — needs judgment'}</span></div>
          <div class="kv"><span class="k">Severity</span><span class="v">${t.severity}</span></div>
          <div class="kv"><span class="k">Type</span><span class="v">${esc(cap(t.type))}</span></div>
          <div class="kv"><span class="k">Surface</span><span class="v">${esc(niceSurface(t.group))}</span></div>
          <div class="kv"><span class="k">Age</span><span class="v">${ago(st.opened)}</span></div>
        </div>
        ${(t.links || []).length ? `<div class="siderail"><div class="sh">Related</div>${t.links.map(l => `<div class="kv"><span class="k">${l.to.startsWith('SLY') ? `<a href="#/ticket/${l.to}">${esc(l.to)}</a>` : esc(l.to)}</span><span class="v" style="font-weight:400;color:var(--muted);font-size:12px;max-width:150px">${esc(l.why)}</span></div>`).join('')}</div>` : ''}
        ${sync.length ? `<div class="siderail" style="background:var(--green-bg);border-color:#a6e9c0"><div class="sh" style="color:var(--green)">Kept in sync on ship</div><div style="font-size:13px;color:#1a1d24;line-height:1.6">${sync.map(esc).join(', ')} — the reasoning stays here on the ticket.</div></div>` : ''}
        <div class="siderail">
          <div class="sh">Activity</div>
          <div class="kv"><span class="k">Opened</span><span class="v">${when(st.opened)}</span></div>
          ${st.alignment ? `<div class="kv"><span class="k">Aligned</span><span class="v">${when(st.alignment.ts)}</span></div>` : ''}
          ${ev ? `<div class="kv"><span class="k">Walk-confirmed</span><span class="v">Yes</span></div>` : ''}
          <div class="kv"><span class="k">Last activity</span><span class="v">${when(st.lastActivity)}</span></div>
        </div>
        <div class="siderail danger-rail">
          <div class="sh">Danger zone</div>
          <p class="dz-note">Permanently remove this ticket. This can't be undone.</p>
          <button class="btn danger full" onclick="askDelete('${t.id}')">Delete ticket</button>
        </div>
      </div>
    </div>`;
}
function renderThread(thread) {
  if (!thread || !thread.length) return '<div class="empty">No discussion yet. Add a comment, or get Jarvis\'s take.</div>';
  return thread.map(c => {
    const av = c.author === 'john' ? 'J' : c.author === 'jarvis' ? 'Jv' : 'CC';
    const name = c.author === 'john' ? 'John' : c.author === 'jarvis' ? 'Jarvis' : 'CC';
    const align = /ALIGNED/.test(c.text) ? ' align' : '';
    return `<div class="cmt ${c.author}${align}"><div class="av">${av}</div><div class="bub"><span class="who">${name}<span class="ts">${when(c.ts)}</span></span><div class="txt">${esc(c.text)}</div></div></div>`;
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
async function comment(id) {
  const text = ($('cmt').value || '').trim(); if (!text) { toast('write something first', 'err'); return; }
  try { await action('addComment', { id, author: 'john', text }); toast('comment added', 'ok'); await refreshTicket(id); } catch (e) {}
}
function jarvisTake(id) {
  const t = get(id);
  const prompt = `Jarvis discussion on ${t.id} — ${t.title}\n\nSummary: ${t.summary}\nRoot cause: ${t.rich.rootCause}\nProposed fix: ${t.rich.fix}\n\nThread so far:\n${(t.state.thread || []).map(c => `${c.author}: ${c.text}`).join('\n') || '(none)'}\n\nGive your take on the fix / what to watch for.`;
  modal(`<h2>Get Jarvis's take</h2>
    <p>This routes the thread to CC/Opus (no always-on LLM, no key). Copy it, get the take, then paste the reply below — it posts back into the thread as a <b>Jarvis</b> comment. The ALIGN gate is still the formal handoff.</p>
    <pre id="jt">${esc(prompt)}</pre>
    <button class="btn" onclick="navigator.clipboard.writeText(document.getElementById('jt').textContent);toast('copied','ok')">Copy prompt</button>
    <div class="label" style="margin-top:16px">Paste Jarvis's reply to post it into the thread</div>
    <textarea id="jtReply" placeholder="Jarvis's take…"></textarea>
    <div class="btns"><button class="btn primary" onclick="postTake('${id}')">Post as Jarvis</button><button class="btn" onclick="closeModal()">Cancel</button></div>`);
}
async function postTake(id) {
  const text = ($('jtReply').value || '').trim(); if (!text) { toast('paste the reply first', 'err'); return; }
  try { await action('addComment', { id, author: 'jarvis', text }); closeModal(); toast('Jarvis comment posted', 'ok'); await refreshTicket(id); } catch (e) {}
}
function goDeeper(id) {
  const t = get(id);
  const prompt = `Go deeper on slyght ${t.id} — ${t.title}.\nRoot cause: ${t.rich.rootCause}\nFiles: ${(t.rich.files || []).join('; ')}\n\nQuestion: `;
  modal(`<h2>Go deeper</h2><p>A focused prompt to dig further on this finding. Add your question, copy, ask CC.</p>
    <pre id="gd">${esc(prompt)}</pre>
    <div class="btns"><button class="btn primary" onclick="navigator.clipboard.writeText(document.getElementById('gd').textContent);toast('copied','ok')">Copy</button><button class="btn" onclick="closeModal()">Close</button></div>`);
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
async function viewHandoff(id) {
  const r = await api('/api/handoff?id=' + id);
  modal(`<h2>Handoff package — ${id}</h2><p>The rich collated payload CC investigates from (vs the summary you read):</p>
    <pre>${esc(r.content || r.error || '(not generated — align first)')}</pre>
    <div class="btns"><button class="btn" onclick="closeModal()">Close</button></div>`);
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
  if (surfaceId) return renderSurfaceFlow(surfaceId);   // ← UNCHANGED: per-surface detail
  const f = J.flows, v = $('view'); v.className = 'view maxw';
  const totalGaps = (f.surfaces || []).reduce((n, s) => n + (s.counts ? s.counts.gaps : 0), 0);
  v.innerHTML = `
    <h1>App Map</h1>
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
const ticketDate = t => (t && t.state && (t.state.target || t.state.due)) || (t && (t.due || t.target)) || null;
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
    <p class="subtitle">Tickets and releases plotted against dates. Set a target date on a ticket and it lands on the day it's due — colour shows severity.</p>
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
  // bundles aren't in the model yet → group purely by what exists today
  const bundles = {};  // future: ts.reduce by t.bundle
  const hasBundles = Object.keys(bundles).length > 0;

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
      ${hasBundles ? '' /* future: render real bundle cards here */ : `
        <div class="plan-release-empty">
          <div class="plan-release-empty-l">
            <div class="plan-empty-t">No releases grouped yet</div>
            <div class="plan-empty-b">A release is a set of tickets that ship together (a bundle). Once you group candidates into a release, they'll show here as a planned cycle with its own card.</div>
          </div>
          <button class="btn primary" onclick="planGroupRelease()">Group Into A Release</button>
        </div>`}
    </div>`;
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
  modal(`<h2>Group Into A Release</h2>
    <p>Releases group tickets that ship together as a bundle — slyght's existing cadence (Bundle 30, 31, 32…). Only <b>ship-ready</b> tickets qualify: a ticket becomes ship-ready when its fix is <b>Confirmed Live</b> (verified in the running app). The ticket model doesn't carry a <code>bundle</code> field yet, so this is the honest next step rather than fake data.</p>
    <div class="label" style="margin-top:8px">Ship-ready tickets a release would group</div>
    ${shipReady.length
      ? `<p class="meta" style="margin:0 0 6px">The ${shipReady.length} ticket${shipReady.length === 1 ? '' : 's'} with a Confirmed Live fix, ready to ship:</p>
    <div class="plan-modal-list">
      ${shipReady.slice(0, 10).map(t => `<div class="plan-modal-row"><span class="pill sm ${sevCls(t.severity)}">${t.severity}</span><span class="tt">${esc(t.title)}</span><span class="meta">${t.id}</span></div>`).join('')}
    </div>
    <p class="meta" style="margin-top:12px">Next step: add a <code>bundle</code> field to the ticket model, then this button writes the grouping and the Releases lane fills with planned cycles.</p>`
      : `<div class="plan-empty" style="margin-top:6px"><div class="plan-empty-icon">◇</div><div class="plan-empty-t">No tickets are ship-ready yet</div><div class="plan-empty-b">A ticket becomes ship-ready when its fix is Confirmed Live — verified in the running app. Move a ticket to Confirmed Live on the Board (it's earned: it needs walk evidence), and it'll show here as part of the next release.</div></div>`}
    <div class="btns"><button class="btn" onclick="closeModal()">Close</button></div>`);
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
  { title: 'Prompts',   hash: '#/command/prompts',  icon: '⌨', kw: 'prompt library templates mission' },
  { title: 'Knowledge', hash: '#/knowledge',        icon: '▣', kw: 'docs security invariants feature map rules reference' },
  { title: 'Roadmap',   hash: '#/roadmap',          icon: '◈', kw: 'plan releases bundles future' },
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
  else if (r === 'command') { if (parts[1] === 'prompts') viewPrompts(); else viewCommand(); }
  else viewOverview();
  renderTopbarStatus();
  window.scrollTo(0, 0);
}
$('scrim').addEventListener('click', e => { if (e.target === $('scrim')) closeModal(); });
window.addEventListener('hashchange', route);
(async function boot() { await load(); renderTopbarStatus(); if (!location.hash) location.hash = '#/overview'; route(); setupPalette(); })();
