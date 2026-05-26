/* ============================================================================
 * Jarvis — slyght mission control. The ticketing platform + CC intermediary.
 * Hash router · board (kanban by status) · ticket detail (the case-view skin) ·
 * the core loop: discuss thread → "get Jarvis's take" → ALIGN gate → collate
 * handoff → CC posts back. Reads /api/tickets; writes via the allowlisted actions.
 * ==========================================================================*/
'use strict';
const TOKEN = window.MC_TOKEN;
const J = { tickets: [], filter: { surface: '', severity: '', type: '' }, flows: null, walk: null, mapFace: 'back', mapSurface: null };
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
  v.innerHTML = `
    <h1>Overview</h1>
    <p class="subtitle">The whole slyght project in one place — ${ts.length} tickets, ${J.flows.coverage.traced}/${J.flows.coverage.total} surfaces mapped, ${gaps} gaps. What needs you, what's in flight, what's broken.</p>
    <div class="stats">
      <div class="statcard"><div class="n">${ts.length}</div><div class="l">Tickets</div></div>
      <div class="statcard"><div class="n">${needsJohn.length}</div><div class="l">Need your judgment</div></div>
      <div class="statcard"><div class="n">${inFlight}</div><div class="l">In flight (CC)</div></div>
      <div class="statcard"><div class="n" style="color:var(--red)">${sevCount('P0')}</div><div class="l">P0 critical</div></div>
      <div class="statcard"><div class="n">${by('Shipped')}</div><div class="l">Shipped</div></div>
      <div class="statcard"><div class="n">${gaps}</div><div class="l">App-map gaps</div></div>
    </div>
    <div class="ovgrid">
      <div class="panel"><div class="label">The app at a glance — tap a surface</div><svg id="hub" viewBox="0 0 940 600" width="100%"></svg>
        <div class="hublegend" style="margin-top:8px"><span><i class="dot g"></i> clean</span><span><i class="dot a"></i> 1–2 gaps</span><span><i class="dot r"></i> 3+ gaps</span><a href="#/map" style="margin-left:auto">full map →</a></div></div>
      <div class="panel">
        <div class="label">Needs your judgment (${needsJohn.length})</div>
        ${needsJohn.slice(0, 7).map(t => ovRow(t, true)).join('') || '<div class="empty">nothing waiting on you</div>'}
        ${needsJohn.length > 7 ? `<a href="#/board" class="meta" style="display:inline-block;padding:8px 2px">+${needsJohn.length - 7} more on the Board →</a>` : ''}
        <div class="label" style="margin-top:20px">Status breakdown</div>
        ${STATUSES.map(s => { const c = by(s); return c ? `<div class="ovbar"><span class="pill sm s-${s}">${STATUS_LABEL[s]}</span><div class="bartrack"><div class="barfill" style="width:${Math.round(c / ts.length * 100)}%"></div></div><span class="meta">${c}</span></div>` : ''; }).join('')}
      </div>
    </div>
    <div class="panel" style="margin-top:16px">
      <div class="label">What the walk + map found — confirmed findings (${confirmed.length})</div>
      ${confirmed.map(t => ovRow(t, false)).join('')}
    </div>`;
  drawHub(J.flows);
}
function ovRow(t, showStatus) {
  return `<div class="ovrow" onclick="location.hash='#/ticket/${t.id}'">
    <span class="pill sm ${sevCls(t.severity)}">${t.severity}</span>
    <span class="ovt">${esc(t.title)}</span>
    ${showStatus ? `<span class="pill sm s-${t.state.status}">${STATUS_LABEL[t.state.status]}</span>` : `<span class="pill sm k-${t.kind}">${esc(t.group)}</span>`}
    <span class="meta">${t.id}</span></div>`;
}

/* ════════════════════════ BOARD ════════════════════════ */
function viewBoard() {
  const v = $('view'); const ts = J.tickets;
  const f = J.filter;
  const shown = ts.filter(t => (!f.surface || t.group === f.surface) && (!f.severity || t.severity === f.severity) && (!f.type || t.type === f.type));
  const count = s => ts.filter(t => t.state.status === s).length;
  const surfaces = [...new Set(ts.map(t => t.group))].sort();
  v.className = 'view';
  v.innerHTML = `
    <h1>Board</h1>
    <p class="subtitle">${ts.length} tickets across the slyght project. You read the summary, discuss with Jarvis, align — Jarvis hands CC the rich package, CC posts results back here.</p>
    <div class="stats">
      ${[['Open', 'Open'], ['Discussing', 'In discussion'], ['Aligned', 'Handed to CC'], ['ConfirmedLive', 'Confirmed live'], ['Shipped', 'Shipped']].map(([s, l]) => `<div class="statcard"><div class="n">${count(s)}</div><div class="l">${l}</div></div>`).join('')}
    </div>
    <div class="toolbar">
      <button class="btn primary" onclick="newTicket()">+ New ticket</button>
      <select onchange="J.filter.type=this.value;route()"><option value="">All types</option>${['bug', 'feature', 'task'].map(x => `<option ${f.type === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <select onchange="J.filter.severity=this.value;route()"><option value="">All severities</option>${['P0', 'P1', 'P2'].map(x => `<option ${f.severity === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <select onchange="J.filter.surface=this.value;route()"><option value="">All surfaces</option>${surfaces.map(x => `<option ${f.surface === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
      <span class="meta">${shown.length} shown</span>
    </div>
    <div class="kanban">
      ${STATUSES.map(s => {
        const col = shown.filter(t => t.state.status === s);
        return `<div class="col"><div class="colh"><span class="pill sm s-${s}">${STATUS_LABEL[s]}</span><span class="ct">${col.length}</span></div>
          ${col.map(ticketCard).join('') || '<div class="empty" style="font-size:12px;padding:6px 8px">—</div>'}</div>`;
      }).join('')}
    </div>`;
}
function ticketCard(t) {
  const a = t.state.assignee;
  return `<div class="tk" onclick="location.hash='#/ticket/${t.id}'">
    <div class="row"><span class="id">${t.id}</span><span class="pill sm ${sevCls(t.severity)}">${t.severity}</span><span class="pill sm k-${t.kind}">${t.type}</span></div>
    <div class="t">${esc(t.title)}</div>
    <div class="row"><span class="age">${ago(t.state.opened)}</span><span class="who">${a === 'cc' ? '→ CC' : '→ John'}</span></div>
  </div>`;
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
    <div class="card">
      <div class="tk-head">
        <div>
          <div class="pills">
            <span class="pill ${sevCls(t.severity)}">${t.severity}${t.severity === 'P0' ? ' · Critical' : ''}</span>
            <span class="pill s-${status}">${STATUS_LABEL[status]}${['Open', 'Discussing'].includes(status) ? ' · ' + ago(st.opened) : ''}</span>
            <span class="pill k-${t.kind}">${t.kind}</span>
            <span class="meta">${t.id} · ${esc(t.group)} · ${t.type} · Assignee: ${assignee === 'cc' ? 'CC (investigating)' : 'John (needs judgment)'}</span>
          </div>
          <h1>${esc(t.title)}</h1>
        </div>
      </div>

      ${(t.links || []).length ? `<div class="rel"><span class="i">&#9432;</span><div class="txt">${t.links.map(l => `Linked to <a href="${l.to.startsWith('SLY') ? '#/ticket/' + l.to : '#'}"><b>${esc(l.to)}</b></a> — ${esc(l.why)}.`).join('<br>')}</div></div>` : ''}

      <div class="label">What's happening (your summary)</div>
      <p class="summary">${esc(t.summary)}</p>

      ${cur || aft ? `<div class="twocol">
        <div class="mini cur"><div class="h">CURRENT</div><div class="b">${esc(cur)}${cur.length >= 180 ? '…' : ''}</div></div>
        <div class="mini aft"><div class="h">AFTER FIX</div><div class="b">${esc(aft)}${aft.length >= 180 ? '…' : ''}</div></div>
      </div>` : ''}

      ${sync.length ? `<div class="rel" style="background:var(--green-bg)"><span class="i" style="color:var(--green)">&#8635;</span><div class="txt" style="color:var(--green)">Kept in sync: when this ships, the post-back updates <b>${sync.map(esc).join('</b>, <b>')}</b> — the full reasoning stays here on the ticket.</div></div>` : ''}

      ${t.rich.rootCause ? `<details class="deep"><summary><span class="tw">▸</span> Technical depth — mechanism, root cause, walk evidence, files</summary><div class="dbody">
        ${t.rich.mechanism ? `<p><b>Mechanism.</b> ${esc(t.rich.mechanism)}</p>` : ''}
        <p><b>Root cause.</b> ${esc(t.rich.rootCause)}</p>
        ${ev ? `<div class="label" style="margin-top:12px">Walk evidence — ${esc(ev.flow)} (${esc(ev.walkDir)})</div>${renderTrace(ev)}` : ''}
        ${(t.rich.files || []).length ? `<div class="label" style="margin-top:12px">Files</div>${t.rich.files.map(f => `<code class="fileline">${esc(f)}</code>`).join('')}` : ''}
        ${t.rich.fix ? `<p style="margin-top:12px"><b>Proposed fix.</b> ${esc(t.rich.fix)}</p>` : ''}
      </div></details>` : ''}

      <div class="label">Discuss with Jarvis (thread) — then ALIGN to hand to CC</div>
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
          : `<button class="btn" onclick="viewHandoff('${t.id}')">View handoff package CC received</button>`}
      </div>
    </div>

    <div class="footer-meta">
      <span>Opened ${when(st.opened)}</span>
      ${st.alignment ? `<span>Aligned ${when(st.alignment.ts)}</span>` : ''}
      ${ev ? `<span>Finding confirmed by walk ${esc(ev.walkDir)}</span>` : ''}
      <span>Last activity ${when(st.lastActivity)}</span>
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
  } catch (e) {}
}
async function viewHandoff(id) {
  const r = await api('/api/handoff?id=' + id);
  modal(`<h2>Handoff package — ${id}</h2><p>The rich collated payload CC investigates from (vs the summary you read):</p>
    <pre>${esc(r.content || r.error || '(not generated — align first)')}</pre>
    <div class="btns"><button class="btn" onclick="closeModal()">Close</button></div>`);
}
function newTicket() {
  modal(`<h2>New ticket</h2>
    <div class="label">Type</div><select id="ntType"><option value="task">Task</option><option value="feature">Feature (e.g. bank integration, Opal)</option><option value="bug">Bug</option></select>
    <div class="label">Title</div><input id="ntTitle" placeholder="Short title">
    <div class="label">Summary</div><textarea id="ntSummary" placeholder="What it is, in plain terms"></textarea>
    <div class="label">Surface / area</div><input id="ntSurface" placeholder="e.g. bank, savings, planning">
    <div class="label">Severity</div><select id="ntSev"><option>P2</option><option>P1</option><option>P0</option></select>
    <div class="btns"><button class="btn primary" onclick="doCreate()">Create</button><button class="btn" onclick="closeModal()">Cancel</button></div>`);
}
async function doCreate() {
  const title = ($('ntTitle').value || '').trim(); if (!title) { toast('title required', 'err'); return; }
  try { const r = await action('createTicket', { title, summary: $('ntSummary').value, surface: $('ntSurface').value, severity: $('ntSev').value, type: $('ntType').value }); closeModal(); toast('created ' + r.id, 'ok'); await load(); location.hash = '#/ticket/' + r.id; } catch (e) {}
}

/* ════════════════════════ APP MAP (Phase 1 — IS vs SHOULD) ════════════ */
async function viewMap(surfaceId) {
  if (!J.flows) J.flows = await api('/api/flows');
  if (surfaceId) return renderSurfaceFlow(surfaceId);
  const f = J.flows, v = $('view'); v.className = 'view maxw';
  const totalGaps = (f.surfaces || []).reduce((n, s) => n + (s.counts ? s.counts.gaps : 0), 0);
  v.innerHTML = `
    <h1>App Map</h1>
    <p class="subtitle">The whole app from both sides — cash at the hub, every surface a spoke. Colour = how broken (gap count). Click a surface for its <b>what SHOULD happen</b> vs <b>what IS</b> ladder. ${f.coverage.traced || 0}/${f.coverage.total || 0} surfaces traced · ${totalGaps} gaps.</p>
    <div class="hubwrap"><svg id="hub" viewBox="0 0 940 600" width="100%"></svg></div>
    <div class="hublegend">
      <span><i class="dot g"></i> clean</span><span><i class="dot a"></i> 1–2 gaps</span><span><i class="dot r"></i> 3+ gaps</span>
      <span style="margin-left:auto" class="meta">tap any surface →</span>
    </div>`;
  drawHub(f);
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
        <button class="ftab ${face === 'front' ? 'on' : ''}" onclick="setFace('${id}','front')">Screen — now vs after fix</button>
      </div>
      <div id="faceBody"></div>
    </div>`;
  if (face === 'front') renderFront(s); else renderBack(s);
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

/* ── placeholder views (sequenced next) ───────────────────────────────── */
function viewSoon(title, body) {
  $('view').className = 'view maxw';
  $('view').innerHTML = `<h1>${title}</h1><p class="subtitle">${body}</p>
    <div class="card"><p class="summary" style="margin:0">Built next in the sequence — the core loop comes first (per the brief). The data model already reserves what this view needs, so it won't be a retrofit.</p></div>`;
}

/* ── router ───────────────────────────────────────────────────────────── */
function route() {
  const h = (location.hash || '#/overview').slice(1);
  const parts = h.split('/').filter(Boolean);
  const r = parts[0] || 'overview';
  document.querySelectorAll('.rail a').forEach(a => a.classList.toggle('on', a.dataset.r === r));
  if (r === 'ticket' && parts[1]) viewTicket(parts[1]);
  else if (r === 'board') viewBoard();
  else if (r === 'map') viewMap(parts[1]);
  else if (r === 'calendar') viewSoon('Calendar / Planning', 'Plan features (bank integration, Opal) and bundle fixes against dates and timelines. Tickets + bundles plotted on a calendar; releases group what ships together.');
  else viewOverview();
  window.scrollTo(0, 0);
}
$('scrim').addEventListener('click', e => { if (e.target === $('scrim')) closeModal(); });
window.addEventListener('hashchange', route);
(async function boot() { await load(); if (!location.hash) location.hash = '#/overview'; route(); })();
