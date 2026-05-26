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

/* ── data ─────────────────────────────────────────────────────────────── */
async function load() { J.tickets = (await api('/api/tickets')).tickets || []; }
const get = id => J.tickets.find(t => t.id === id);

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
    : `<span class="pill sm k-${t.kind}">${esc(t.group)}</span>`;
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
      ${bd2Select('Surface', 'surface', f.surface, surfaces.map(s => [s, s]))}
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
        <span class="bd2-surface">${esc(t.group || t.surface || '—')}</span>
        <span class="bd2-dot">·</span>
        <span class="bd2-age">opened ${ago(st.opened)}</span>
        <span class="bd2-dot">·</span>
        <span class="bd2-act">active ${ago(st.lastActivity)}</span>
        ${links ? `<span class="bd2-dot">·</span><span class="bd2-links">🔗 ${links} link${links === 1 ? '' : 's'}</span>` : ''}
        ${t.kind && t.kind !== 'manual' ? `<span class="pill sm k-${t.kind}">${esc(t.kind)}</span>` : ''}
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
        <button class="bd2-pillbtn pill sm k-${t.kind}" title="Filter by type: ${esc(t.type)}" onclick="setFilter('type','${t.type}')">${esc(t.type)}</button>
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
  const sync = [t.openBug ? `OPEN-BUGS #${t.openBug}` : null, ev ? 'feature map (' + t.group + ')' : null].filter(Boolean);
  v.className = 'view maxw';
  v.innerHTML = `
    <a class="backlink" href="#/board">‹ Board</a>
    <div class="tk-head">
      <div>
        <div class="pills">
          <span class="pill ${sevCls(t.severity)}">${t.severity}${t.severity === 'P0' ? ' · Critical' : ''}</span>
          <span class="pill s-${status}">${STATUS_LABEL[status]}</span>
          <span class="pill k-${t.kind}">${t.kind}</span>
          <span class="meta">${t.id} · ${esc(t.group)}</span>
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
          <div class="kv"><span class="k">Type</span><span class="v">${t.type}</span></div>
          <div class="kv"><span class="k">Surface</span><span class="v">${esc(t.group)}</span></div>
          <div class="kv"><span class="k">Age</span><span class="v">${ago(st.opened)}</span></div>
        </div>
        ${(t.links || []).length ? `<div class="siderail"><div class="sh">Related</div>${t.links.map(l => `<div class="kv"><span class="k">${l.to.startsWith('SLY') ? `<a href="#/ticket/${l.to}">${esc(l.to)}</a>` : esc(l.to)}</span><span class="v" style="font-weight:400;color:var(--muted);font-size:12px;max-width:150px">${esc(l.why)}</span></div>`).join('')}</div>` : ''}
        ${sync.length ? `<div class="siderail" style="background:var(--green-bg);border-color:#a6e9c0"><div class="sh" style="color:var(--green)">Kept in sync on ship</div><div style="font-size:13px;color:#1a1d24;line-height:1.6">${sync.map(esc).join(', ')} — the reasoning stays here on the ticket.</div></div>` : ''}
        <div class="siderail">
          <div class="sh">Activity</div>
          <div class="kv"><span class="k">Opened</span><span class="v">${when(st.opened)}</span></div>
          ${st.alignment ? `<div class="kv"><span class="k">Aligned</span><span class="v">${when(st.alignment.ts)}</span></div>` : ''}
          ${ev ? `<div class="kv"><span class="k">Walk-confirmed</span><span class="v">yes</span></div>` : ''}
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
    <div class="plan-card-top"><span class="pill sm k-${t.kind}">${t.type}</span><span class="pill sm ${sevCls(t.severity)}">${t.severity}</span></div>
    <div class="plan-card-t">${esc(t.title)}</div>
    <div class="plan-card-foot"><span class="meta">${t.id} · ${esc(t.group)}</span><span class="pill sm s-${t.state.status}">${STATUS_LABEL[t.state.status]}</span></div>
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
  const candidates = ts.filter(t => t.type === 'bug' && ['P0', 'P1'].includes(t.severity) && t.state.status !== 'Shipped')
    .sort((a, b) => SEVRANK_P[a.severity] - SEVRANK_P[b.severity]);
  modal(`<h2>Group Into A Release</h2>
    <p>Releases group tickets that ship together as a bundle — slyght's existing cadence (Bundle 30, 31, 32…). The ticket model doesn't carry a <code>bundle</code> field yet, so this is the honest next step rather than fake data.</p>
    <div class="label" style="margin-top:8px">What a release would group right now</div>
    <p class="meta" style="margin:0 0 6px">The ${candidates.length} highest-severity open bug${candidates.length === 1 ? '' : 's'}:</p>
    <div class="plan-modal-list">
      ${candidates.slice(0, 10).map(t => `<div class="plan-modal-row"><span class="pill sm ${sevCls(t.severity)}">${t.severity}</span><span class="tt">${esc(t.title)}</span><span class="meta">${t.id}</span></div>`).join('') || '<div class="empty">No open P0/P1 bugs.</div>'}
    </div>
    <p class="meta" style="margin-top:12px">Next step: add a <code>bundle</code> field to the ticket model, then this button writes the grouping and the Releases lane fills with planned cycles.</p>
    <div class="btns"><button class="btn" onclick="closeModal()">Close</button></div>`);
}

/* ── placeholder views (sequenced next) ───────────────────────────────── */
function viewSoon(title, body) {
  $('view').className = 'view maxw';
  $('view').innerHTML = `<h1>${title}</h1><p class="subtitle">${body}</p>
    <div class="card"><p class="summary" style="margin:0">Built next in the sequence — the core loop comes first (per the brief). The data model already reserves what this view needs, so it won't be a retrofit.</p></div>`;
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
  else if (r === 'calendar') viewCalendar();
  else if (r === 'planning') viewPlanning();
  else viewOverview();
  window.scrollTo(0, 0);
}
$('scrim').addEventListener('click', e => { if (e.target === $('scrim')) closeModal(); });
window.addEventListener('hashchange', route);
(async function boot() { await load(); if (!location.hash) location.hash = '#/overview'; route(); })();
