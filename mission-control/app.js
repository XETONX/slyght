/* slyght — Mission Control v2 · the translator web app.
   Hash router + 5 views + the case translation. Reads the RICH data (cases.json,
   walk.json, specs.json, the repo docs); writes via the secured server actions. */
'use strict';
const TOKEN = window.MC_TOKEN;
const S = { cases: [], counts: {}, specs: null, walk: null, notes: {}, poll: null, seen: 0 };

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
async function api(p) { const r = await fetch(p); return r.json(); }
async function action(name, args) {
  const r = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, args: args || {}, token: TOKEN }) });
  const j = await r.json(); if (!r.ok || j.ok === false) { toast(j.error || j.reason || 'failed', 'err'); throw new Error(j.error || j.reason); } return j;
}
function toast(m, k) { const t = $('toast'); t.textContent = m; t.className = 'on ' + (k || ''); setTimeout(() => t.className = k || '', 2800); }
function modal(html) { $('modal').innerHTML = html; $('scrim').classList.add('on'); }
function closeModal() { $('scrim').classList.remove('on'); }
function renderMd(md) {
  return esc(md).replace(/^#{2,4} (.*)$/gm, '<h4>$1</h4>')
    .replace(/\*\*(INV-\d+[^*]*)\*\*/g, '<span class="inv">$1</span>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<span style="color:#5dcaa5">$1</span>');
}

/* ── surfaces (map ring) ──────────────────────────────────────────────── */
const SURFACES = [
  { id: 'dash', label: 'dash', group: 'dashboard' }, { id: 'bills', label: 'bills', group: 'bills' },
  { id: 'save', label: 'savings', group: 'savings' }, { id: 'plan', label: 'plan', group: 'plan' },
  { id: 'ai', label: 'AI chat', group: 'ai' }, { id: 'debts', label: 'debts', group: 'debts' },
  { id: 'analysis', label: 'analysis', group: 'analysis' },
];
const SEV = { P0: 'p0', P1: 'p1', P2: 'p2' };   // severity → chip class
function surfaceVerdict(s) {
  const cs = S.cases.filter(c => c.surface === s.id);
  if (cs.some(c => c.status === 'confirmed')) return 'bad';
  if (cs.some(c => c.status === 'candidate')) return 'candidate';
  const runnable = S.specs && (S.specs.specs || []).some(sp => sp.group === s.group && sp.runnable);
  return runnable ? 'good' : 'pending';
}
function drawMap(elId, opts) {
  opts = opts || {};
  const cx = 175, cy = 140, R = 100, col = { bad: '#e24b4a', candidate: '#efc84a', good: '#1d9e75', pending: '#5b6472', walking: '#efc84a' };
  let edges = '', nodes = '';
  SURFACES.forEach((s, i) => {
    const a = (-90 + i * (360 / SURFACES.length)) * Math.PI / 180, x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
    const v = opts.live && s._w ? s._w : surfaceVerdict(s); const c = col[v] || col.pending;
    edges += `<line id="e-${s.id}" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${c}" stroke-width="1.5" ${v === 'bad' ? 'stroke-dasharray="5 4"' : ''}/>`;
    nodes += `<g class="node ${v}" id="n-${s.id}" onclick="location.hash='#/cases?surface=${s.id}'"><circle cx="${x}" cy="${y}" r="22" fill="#11161e" stroke="${c}" stroke-width="${v === 'bad' ? 2.6 : 1.8}"/>`
      + `<text x="${x}" y="${y + 4}" text-anchor="middle" fill="#aab0b8" style="font-size:9px">${s.label}</text></g>`;
  });
  $(elId).innerHTML = edges + nodes
    + `<g><circle cx="${cx}" cy="${cy}" r="28" fill="#0d1512" stroke="#5dcaa5" stroke-width="1.8"/>`
    + `<text x="${cx}" y="${cy - 1}" text-anchor="middle" fill="#e8eaed" style="font-size:11px">cash</text>`
    + `<text x="${cx}" y="${cy + 11}" text-anchor="middle" fill="#5dcaa5" style="font-size:8.5px">hub</text></g>`;
}

/* ── stats ────────────────────────────────────────────────────────────── */
const FRAMED = 202;
function walkStats() {
  const flows = (S.walk && S.walk.walk && S.walk.walk.flows) || [];
  const walked = flows.reduce((n, f) => n + (f.steps || []).length, 0);
  const broken = S.cases.filter(c => c.status === 'confirmed').length;
  return { framed: FRAMED, walked, broken, prog: Math.round(walked / FRAMED * 100) };
}

/* ════════════════════════ VIEWS ════════════════════════ */
function viewOverview() {
  const st = walkStats(); const v = $('view');
  const confirmed = S.cases.filter(c => c.status === 'confirmed');
  v.innerHTML = `
    <h1>Overview</h1>
    <p class="sub">Health at a glance — the translator's front door. ${S.counts.deep || 0} deep cases · walk ${S.walk && S.walk.dir || 'none'}.</p>
    <div class="stats">
      <div class="stat framed"><div class="cap">framed</div><div class="n">${st.framed}</div></div>
      <div class="stat walked"><div class="cap">walked</div><div class="n">${st.walked}</div></div>
      <div class="stat broken"><div class="cap">broken</div><div class="n">${st.broken}</div></div>
      <div class="stat prog"><div class="cap">progress</div><div class="n">${st.prog}<small>%</small></div></div>
    </div>
    <div id="progBar"><div id="progFill" style="width:${Math.min(st.prog, 100)}%"></div></div>
    <div class="grid2" style="margin-top:18px">
      <div class="panel"><div class="cap" style="margin-bottom:10px">screen map · click a surface → its cases</div>
        <svg id="ovMap" width="100%" viewBox="0 0 350 290"></svg>
        <div class="faint" style="font-size:11px;margin-top:6px">✗ confirmed · ◐ candidate · ✓ walked-clean · ⊘ not walked</div></div>
      <div class="panel"><div class="cap" style="margin-bottom:12px">confirmed findings — needing your judgment</div>
        ${confirmed.map(c => `<div class="case-row confirmed" onclick="location.hash='#/cases/${c.id}'"><div class="meta"><span class="chip ${SEV[c.severity] || 'p2'}">${c.severity}</span></div><div class="b"><div class="t">${esc(c.title)}</div></div><span class="arr">›</span></div>`).join('') || '<div class="empty">none</div>'}
        <a class="btn ghost sm" href="#/cases" style="margin-top:8px;display:inline-block">all ${S.cases.length} cases →</a>
      </div>
    </div>`;
  drawMap('ovMap');
}

function viewCases(params) {
  const v = $('view'); const filterSurface = params.get('surface');
  let cases = S.cases.slice();
  if (filterSurface) cases = cases.filter(c => c.surface === filterSurface);
  // group by group; order groups by whether they hold a confirmed case
  const groups = {}; cases.forEach(c => { (groups[c.group] = groups[c.group] || []).push(c); });
  const rank = { confirmed: 0, candidate: 1, tracked: 2 }, sev = { P0: 0, P1: 1, P2: 2 };
  const groupOrder = Object.keys(groups).sort((a, b) => Math.min(...groups[a].map(c => rank[c.status])) - Math.min(...groups[b].map(c => rank[c.status])));
  v.innerHTML = `
    <h1>Cases</h1>
    <p class="sub">Bugs and translator are one surface. Opening a case <b>is</b> entering its translation. ${filterSurface ? `Filtered: <b>${esc(filterSurface)}</b> · <a href="#/cases">clear</a>` : `${S.counts.confirmed || 0} confirmed · ${S.counts.candidate || 0} candidate · ${S.counts.tracked || 0} tracked`}</p>
    ${groupOrder.map(g => {
      const list = groups[g].sort((a, b) => (rank[a.status] - rank[b.status]) || (sev[a.severity] - sev[b.severity]));
      return `<div class="group-h">${esc(g)} <span class="ln"></span> <span class="faint">${list.length}</span></div>` + list.map(caseRow).join('');
    }).join('')}`;
}
function caseRow(c) {
  return `<div class="case-row ${c.status}" onclick="location.hash='#/cases/${c.id}'">
    <div class="meta"><span class="chip ${SEV[c.severity] || 'p2'}">${c.severity}</span><span class="chip ${c.status}">${c.status}</span></div>
    <div class="b"><div class="t">${esc(c.title)}</div><div class="p">${esc(c.plain)}</div></div>
    <span class="arr">›</span></div>`;
}

function viewCase(id) {
  const c = S.cases.find(x => x.id === id); const v = $('view');
  if (!c) { v.innerHTML = `<a class="backlink" href="#/cases">‹ cases</a><div class="empty">case not found</div>`; return; }
  const note = (S.notes[c.id] || {}).text || '';
  const ev = c.evidence;
  v.innerHTML = `
    <a class="backlink" href="#/cases">‹ all cases</a>
    <div class="case-head"><h1>${esc(c.title)}</h1></div>
    <div class="case-meta">
      <span class="chip ${SEV[c.severity] || 'p2'}">${c.severity}</span>
      <span class="chip ${c.status}">${c.status}</span>
      <span class="chip grp">${esc(c.group)}</span>
      ${c.openBug ? `<span class="chip tracked">OPEN-BUGS #${c.openBug}</span>` : ''}
      ${ev ? `<span class="chip runnable">walked: ${esc(ev.flow)}</span>` : '<span class="chip authored">not walked</span>'}
    </div>

    <div class="plain">${esc(c.plain)}</div>

    ${c.mechanism ? section('How it works (the mechanism)', `<p>${esc(c.mechanism)}</p>`) : ''}
    ${c.rootCause ? section('Root cause', `<p>${esc(c.rootCause)}</p>`) : ''}
    ${ev ? section('Walk evidence — what actually happened on the running app', renderEvidence(ev), true) : ''}
    ${c.fix ? `<details class="section fixbox" open><summary><span class="tw">▸</span> The proposed fix</summary><div class="body"><p>${esc(c.fix)}</p>${(c.files || []).map(f => `<code class="fileline">${esc(f)}</code>`).join('')}</div></details>` : ''}

    <h2>Your judgment</h2>
    <div class="panel thoughts">
      <div class="cap" style="margin-bottom:8px">your thoughts — constraints, priority, how you want it fixed</div>
      <textarea id="thoughts" placeholder="What matters here for the real app? Anything CC's missing? How should this be fixed / sequenced?">${esc(note)}</textarea>
      <div class="actions-row">
        <button class="btn primary" onclick="generate('${c.id}')">⚙ Generate deep brief</button>
        <button class="btn" onclick="saveThoughts('${c.id}')">save thoughts</button>
        <button class="btn ghost" onclick="askAbout('${c.id}')">ask CC/Opus to go deeper ↗</button>
      </div>
    </div>`;
}
function section(title, bodyHtml, open) {
  return `<details class="section"${open ? ' open' : ''}><summary><span class="tw">▸</span> ${esc(title)}</summary><div class="body">${bodyHtml}</div></details>`;
}
function renderEvidence(ev) {
  const steps = (ev.steps || []).map(s => {
    const lands = s.lands && s.lands.length ? `<span class="lands">lands: [${s.lands.join(', ')}]</span>` : '<span class="miss">lands: [] (no-op)</span>';
    const delta = Object.keys(s.delta || {}).length ? ' · <span class="delta">' + Object.entries(s.delta).map(([k, vv]) => `${k}: ${esc(vv)}`).join(' · ') + '</span>' : '';
    const probe = s.probe ? `<div class="probe">${esc(JSON.stringify(s.probe, null, 2))}</div>` : '';
    return `<div class="step"><span class="sid">${esc(s.step)}</span> — ${esc(s.action || '')}<br>${lands}${delta}${s.error ? ' · <span class="miss">ERR ' + esc(s.error) + '</span>' : ''}${probe}</div>`;
  }).join('');
  return `<div class="trace"><div class="faint" style="margin-bottom:6px">flow <b>${esc(ev.flow)}</b> · walk ${esc(ev.walkDir)} — the real audit "lands" + balance/bucket deltas captured live:</div>${steps}</div>`;
}

/* ── generate / ask / save (the translator output) ───────────────────── */
async function saveThoughts(id) {
  try { await action('saveThoughts', { caseId: id, text: $('thoughts').value }); S.notes[id] = { text: $('thoughts').value }; toast('thoughts saved', 'ok'); } catch (e) {}
}
async function generate(id) {
  const c = S.cases.find(x => x.id === id); const note = ($('thoughts').value || '').trim();
  try { await action('saveThoughts', { caseId: id, text: note }); S.notes[id] = { text: note }; } catch (e) {}
  const ev = c.evidence; let evTxt = '_(not walked)_';
  if (ev) evTxt = `Flow \`${ev.flow}\` (walk ${ev.walkDir}):\n` + (ev.steps || []).map(s => {
    const d = Object.entries(s.delta || {}).map(([k, v]) => `${k}: ${v}`).join(', ');
    return `- ${s.step}: lands [${(s.lands || []).join(', ') || 'NONE — no-op'}]${d ? ' · ' + d : ''}${s.probe ? '\n  probe: ' + JSON.stringify(s.probe) : ''}`;
  }).join('\n');
  const md = `# Fix: ${c.title}

**${c.severity} · ${c.status}** · surface: ${c.group}${c.openBug ? ` · OPEN-BUGS #${c.openBug}` : ''}

## What's wrong (plain)
${c.plain}

## Mechanism
${c.mechanism || '_(see root cause)_'}

## Root cause
${c.rootCause}

## Walk evidence (from the running app)
${evTxt}

## Proposed fix
${c.fix}

## Files
${(c.files || []).map(f => '- ' + f).join('\n')}

## John's direction
${note || '_(none added — use CC judgment, surface decisions)_'}

---
Run through the full 6-tier pipeline. Conservation + Guardian green gate.
§8 plain-English at commit. My approval before push.
`;
  try {
    const r = await action('writeBrief', { slug: 'fix-' + c.id, content: md });
    const kick = `Read ${r.path} and run it through the full pipeline — my approval before push.`;
    modal(`<h2>deep brief written → ${esc(r.path)}</h2>
      <p>Pulled the real root cause + walk evidence + your direction — not a stub. Paste this to start the mission:</p>
      <pre id="kick">${esc(kick)}</pre>
      <p class="cap" style="margin-top:14px">preview of the brief:</p><pre style="max-height:220px">${esc(md.slice(0, 1400))}…</pre>
      <div class="actions-row"><button class="btn primary" onclick="navigator.clipboard.writeText(document.getElementById('kick').textContent);toast('kickoff copied','ok')">copy kickoff</button>
      <button class="btn ghost" onclick="closeModal()">close</button></div>`);
  } catch (e) {}
}
function askAbout(id) {
  const c = S.cases.find(x => x.id === id);
  modal(`<h2>Ask CC / Opus to go deeper</h2>
    <p>On: <b>${esc(c.title)}</b>. Type your question — it'll wrap with the case context so the answer lands on the real finding.</p>
    <textarea id="askq" style="width:100%;min-height:90px;background:#0a0c10;border:1px solid #2a3340;border-radius:8px;color:#e8eaed;font-family:inherit;font-size:15px;padding:12px"></textarea>
    <div class="actions-row"><button class="btn primary" onclick="buildAsk('${id}')">build prompt</button><button class="btn ghost" onclick="closeModal()">cancel</button></div>`);
}
function buildAsk(id) {
  const c = S.cases.find(x => x.id === id); const q = ($('askq').value || '').trim() || 'Go deeper on this finding.';
  const prompt = `About the slyght finding "${c.title}" (${c.group}, ${c.severity}):\nRoot cause: ${c.rootCause}\nProposed fix: ${c.fix}\n\nMy question: ${q}`;
  modal(`<h2>prompt ready</h2><pre id="askp">${esc(prompt)}</pre>
    <div class="actions-row"><button class="btn primary" onclick="navigator.clipboard.writeText(document.getElementById('askp').textContent);toast('copied','ok')">copy</button><button class="btn ghost" onclick="closeModal()">close</button></div>`);
}

/* ── Live walk ────────────────────────────────────────────────────────── */
function viewWalk() {
  const v = $('view'); const specs = (S.specs && S.specs.specs) || [];
  const byGroup = {}; specs.forEach(s => (byGroup[s.group] = byGroup[s.group] || []).push(s));
  const runnableGroups = Object.keys(byGroup).filter(g => byGroup[g].some(s => s.runnable));
  v.innerHTML = `
    <h1>Live walk</h1>
    <p class="sub">Run by group. <b class="muted">✓ runnable</b> = a real flow walks it; <b class="faint">⊘ authored-only</b> = spec written, no flow wired yet. Run only ever covers the ✓ specs — honest scope.</p>
    <div class="grid2" style="margin-bottom:16px">
      <div class="panel"><div class="cap" style="margin-bottom:10px">screen map</div><svg id="wkMap" width="100%" viewBox="0 0 350 290"></svg></div>
      <div class="panel"><div class="cap" style="margin-bottom:8px">walk feed <span id="wkStatus" class="faint"></span></div><div id="feed"><div class="l empty">// pick a group/spec and Run</div></div></div>
    </div>
    <div class="actions-row" style="margin-bottom:16px"><button class="btn primary" id="runAll" onclick="runWalk({})">▶ run all runnable</button>
      <span class="faint">runnable groups: ${runnableGroups.join(', ') || 'none'}</span></div>
    ${Object.keys(byGroup).sort().map(g => {
      const list = byGroup[g]; const anyRun = list.some(s => s.runnable);
      return `<div class="groupcard"><div class="gh"><span class="gt">${esc(g)}</span>${anyRun ? `<button class="btn sm primary" onclick="runWalk({group:'${g}'})">run ${esc(g)}</button>` : '<span class="chip authored">authored-only</span>'}</div>`
        + list.map(s => `<div class="specrow"><span class="chip ${s.runnable ? 'runnable' : 'authored'}">${s.runnable ? '✓ runnable' : '⊘ authored'}</span><span class="t">${esc(s.title)}<div class="g">${esc(s.file)}${s.flows && s.flows.length ? ' · ' + s.flows.join(', ') : ''}</div></span>${s.runnable ? `<button class="btn sm" onclick="runWalk({spec:'${s.file}'})">run</button>` : ''}</div>`).join('') + `</div>`;
    }).join('')}`;
  drawMap('wkMap', { live: true });
}
async function runWalk(scope) {
  try { const r = await action('runWalk', scope || {}); if (!r.started) { toast(r.reason || 'busy', 'err'); return; } } catch (e) { return; }
  $('dot').className = 'live'; $('statusTxt').textContent = 'walking · live';
  SURFACES.forEach(s => s._w = 'pending'); if ($('wkMap')) drawMap('wkMap', { live: true });
  if ($('feed')) { $('feed').innerHTML = ''; feed('// walk started ' + (scope && (scope.group || scope.spec) || 'all runnable'), '#5dcaa5'); }
  if ($('wkStatus')) $('wkStatus').textContent = '· running';
  S.seen = 0;
  S.poll = setInterval(async () => {
    const j = await api('/api/walklog'); const lines = j.lines || [];
    for (; S.seen < lines.length; S.seen++) {
      const ln = lines[S.seen];
      if (ln.startsWith('@@FLOW_START')) { const id = flowSurface(ln.split(' ')[1]); if (id) { const s = SURFACES.find(x => x.id === id); if (s) { s._w = 'walking'; drawMap('wkMap', { live: true }); } } feed('→ ' + ln.split(' ')[1], '#85b7eb'); }
      else if (ln.startsWith('@@FLOW_DONE')) feed('  done ' + ln.split(' ')[1], '#6f7681');
      else if (ln.startsWith('@@WALK_SCOPE')) feed(ln.replace('@@', '// '), '#5b6472');
      else if (!ln.startsWith('@@WALK_EXIT')) feed('  ' + ln, '#6f7681');
    }
    if (!j.running) { clearInterval(S.poll); S.poll = null; await finishWalk(); }
  }, 600);
}
function flowSurface(flow) {
  const sp = (S.specs && S.specs.specs || []).find(s => (s.flows || []).includes(flow));
  if (!sp) return null; const surf = SURFACES.find(x => x.group === sp.group); return surf && surf.id;
}
function feed(t, c) { const f = $('feed'); if (!f) return; const d = document.createElement('div'); d.className = 'l'; d.style.color = c || '#888780'; d.textContent = t; f.appendChild(d); f.scrollTop = f.scrollHeight; }
async function finishWalk() {
  S.walk = await api('/api/walk-latest'); S.cases = (await api('/api/cases')).cases || S.cases; // refresh
  $('dot').className = 'done'; $('statusTxt').textContent = 'walk complete'; if ($('wkStatus')) $('wkStatus').textContent = '· complete';
  SURFACES.forEach(s => s._w = null); if ($('wkMap')) drawMap('wkMap', { live: true });
  feed('// walk complete — re-run `node scripts/mc/build-cases.js` to refresh case evidence', '#5dcaa5');
  toast('walk complete', 'ok');
}

/* ── Docs + specs ─────────────────────────────────────────────────────── */
const DOC_ADDERS = {
  featuremap: { action: 'editFeatureMap', fields: [['name', 'surface / feature'], ['path', 'BRAIN → X → Y'], ['type', 'screen/action/writer/reader'], ['lives', 'index.html:LXXXX'], ['notes', 'notes']], build: v => `\n### ${v.name}\n**Path:** \`${v.path}\`\n**Type:** ${v.type}\n**Lives in:** \`${v.lives}\`\n**Notes:** ${v.notes}\n` },
  invariants: { action: 'editInvariants', fields: [['id', 'INV-NN'], ['statement', 'the rule, plain language'], ['why', 'why it matters'], ['violated', 'symptom'], ['test', 'how a spec checks it']], build: v => `\n**${v.id}: ${v.statement}**\n- Why: ${v.why}\n- Violated when: ${v.violated}\n- Test: ${v.test}\n` },
  rules: { action: 'editRules', fields: [['title', 'rule title'], ['rule', 'the rule / directive']], build: v => `\n## ${v.title}\n${v.rule}\n` },
};
let docBuf = {};
function viewDocs(params) {
  const tab = params.get('doc') || 'featuremap';
  const v = $('view');
  v.innerHTML = `<h1>Docs + specs</h1><p class="sub">The real repo files. Edit forms append — existing content preserved (OPEN-BUGS is never regenerated).</p>
    <div class="tabs">${['featuremap', 'invariants', 'rules', 'openbugs', 'coverage', 'specs'].map(d => `<a class="tab ${d === tab ? 'on' : ''}" href="#/docs?doc=${d}">${d}</a>`).join('')}</div>
    <div id="docPanel"><div class="empty">loading…</div></div>`;
  loadDoc(tab);
}
async function loadDoc(tab) {
  if (tab === 'specs') {
    const specs = (S.specs && S.specs.specs) || [];
    $('docPanel').innerHTML = `<div class="empty">${specs.length} walk-specs — click to read</div>` + specs.map(s => `<div class="specrow"><span class="chip ${s.runnable ? 'runnable' : 'authored'}">${s.runnable ? '✓' : '⊘'}</span><span class="t" style="cursor:pointer" onclick="openSpec('${s.file}')">${esc(s.title)} <span class="g">${esc(s.file)}</span></span></div>`).join('') + `<div id="specView" style="margin-top:14px"></div>`;
    return;
  }
  const r = await api('/api/read?name=' + tab); docBuf[tab] = r.content || '';
  const add = DOC_ADDERS[tab];
  $('docPanel').innerHTML = (add ? `<button class="btn sm" onclick="document.getElementById('af-${tab}').classList.toggle('on')">+ add entry</button>
    <div class="addform" id="af-${tab}">${add.fields.map(f => `<label>${f[1]}</label><input id="fi-${tab}-${f[0]}">`).join('')}<div class="actions-row"><button class="btn primary" onclick="appendDoc('${tab}')">append + save</button><span class="faint">appends to the real file</span></div></div>` : '')
    + `<div class="docview">${renderMd(r.content || '(empty / not found)')}</div>`;
}
async function openSpec(file) {
  const r = await api('/api/walkspec?name=' + encodeURIComponent(file));
  $('specView').innerHTML = `<div class="docview">${renderMd(r.content || '')}</div>`;
}
async function appendDoc(tab) {
  const add = DOC_ADDERS[tab]; const val = {}; add.fields.forEach(f => val[f[0]] = ($('fi-' + tab + '-' + f[0]).value || '').trim());
  const updated = docBuf[tab].replace(/\s*$/, '\n') + add.build(val);
  try { await action(add.action, { content: updated }); toast('saved → ' + tab, 'ok'); loadDoc(tab); } catch (e) {}
}

/* ── Deploy ───────────────────────────────────────────────────────────── */
async function viewDeploy() {
  const v = $('view'); v.innerHTML = `<h1>Deploy</h1><p class="sub">The careful last mile. The one irreversible action — git push behind a typed confirm.</p><div class="panel" id="depPanel"><div class="empty">reading git state…</div></div>`;
  const g = await api('/api/gitstatus');
  $('depPanel').innerHTML = `
    <div class="cap">branch</div><div style="font-size:18px;margin:4px 0 16px">${esc(g.branch || '?')}</div>
    <div class="cap">unpushed commits (${(g.unpushed || []).length})</div>
    <div class="docview" style="max-height:200px;margin:6px 0 16px">${(g.unpushed || []).map(esc).join('\n') || '(none — nothing to push)'}</div>
    <div class="cap">uncommitted changes (${(g.dirty || []).length})</div>
    <div class="docview" style="max-height:160px;margin:6px 0 18px">${(g.dirty || []).map(esc).join('\n') || '(clean)'}</div>
    <button class="btn amber" onclick="openDeploy()">⇧ deploy (git push)</button>
    <span class="faint" style="margin-left:10px">requires a typed confirm + server confirm:true</span>`;
}
function openDeploy() {
  modal(`<h2>⇧ Ship to main?</h2><p>Runs <b>git push</b> on the slyght repo — the one irreversible action. Type <b>ship</b> to confirm.</p>
    <input id="depConf" placeholder="type: ship">
    <div class="actions-row"><button class="btn amber" onclick="doDeploy()">confirm deploy</button><button class="btn ghost" onclick="closeModal()">cancel</button></div>`);
}
async function doDeploy() {
  if (($('depConf').value || '').trim() !== 'ship') { toast('type "ship" to confirm', 'err'); return; }
  try { const r = await action('deploy', { confirm: true }); closeModal(); modal(`<h2>${r.ok ? '✓ pushed' : '✗ push failed'}</h2><pre>${esc(r.output || r.reason || '')}</pre><div class="actions-row"><button class="btn ghost" onclick="closeModal()">close</button></div>`); } catch (e) {}
}

/* ── router ───────────────────────────────────────────────────────────── */
function route() {
  const h = (location.hash || '#/overview').slice(1);
  const [pathPart, query] = h.split('?'); const parts = pathPart.split('/').filter(Boolean);
  const params = new URLSearchParams(query || '');
  const r = parts[0] || 'overview';
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', a.dataset.r === r));
  if (S.poll && r !== 'walk') { clearInterval(S.poll); S.poll = null; }
  if (r === 'overview') viewOverview();
  else if (r === 'cases' && parts[1]) viewCase(parts[1]);
  else if (r === 'cases') viewCases(params);
  else if (r === 'walk') viewWalk();
  else if (r === 'docs') viewDocs(params);
  else if (r === 'deploy') viewDeploy();
  else viewOverview();
  $('view').scrollTop = 0; window.scrollTo(0, 0);
}
$('scrim').addEventListener('click', e => { if (e.target === $('scrim')) closeModal(); });
window.addEventListener('hashchange', route);

(async function boot() {
  const [cases, specs, walk, notes] = await Promise.all([api('/api/cases'), api('/api/specs'), api('/api/walk-latest'), api('/api/notes')]);
  S.cases = cases.cases || []; S.counts = cases.counts || {}; S.specs = specs; S.walk = walk; S.notes = notes || {};
  const broken = S.cases.filter(c => c.status === 'confirmed').length;
  if (broken) $('navBroken').textContent = broken;
  if (!location.hash) location.hash = '#/overview';
  route();
})();
