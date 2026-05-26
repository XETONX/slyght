import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:5050';
const OUT = 'C:/Users/admin/slyght/docs/jarvis/qa-shots';
const log = (...a) => console.log(...a);
const results = [];
const errors = [];

function rec(area, control, status, note) { results.push({ area, control, status, note }); log(`[${status}] ${area} :: ${control} — ${note || ''}`); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 2300, height: 1320 } });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));

async function goto(hash) {
  await page.goto(BASE + '/' + hash, { waitUntil: 'load' });
  await page.waitForTimeout(600);
}
const exists = async sel => (await page.locator(sel).count()) > 0;
async function modalOpen() { return await page.locator('#scrim.on, #scrim.show, .modal:visible, #scrim >> .modal').first().isVisible().catch(() => false); }
async function closeAnyModal() {
  // click a Cancel/Close button if present, else clear scrim class
  const btn = page.locator('.modal .btn', { hasText: /^(Cancel|Close)$/ }).first();
  if (await btn.count()) { await btn.click().catch(()=>{}); await page.waitForTimeout(200); }
  await page.evaluate(() => { try { closeModal(); } catch(e){} });
  await page.waitForTimeout(150);
}
async function scrimVisible() {
  return await page.evaluate(() => {
    const s = document.getElementById('scrim');
    if (!s) return false;
    const cs = getComputedStyle(s);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && (s.className.includes('on')||s.className.includes('show')|| cs.opacity !== '0');
  });
}
async function modalHTML() {
  return await page.evaluate(() => { const m = document.querySelector('#scrim .modal, .modal'); return m ? m.innerHTML : ''; });
}
async function modalText() {
  return await page.evaluate(() => { const m = document.querySelector('#scrim .modal, .modal'); return m ? m.innerText : ''; });
}

/* ════════ TICKET DETAIL — SLY-1 ════════ */
await goto('#/ticket/SLY-1');
await page.screenshot({ path: OUT + '/01-ticket-sly1.png', fullPage: true });

// header / title present
const h1 = await page.locator('.tk-head h1').first().innerText().catch(()=>'');
rec('SLY-1', 'header render', h1 ? 'PASS' : 'FAIL', `h1="${h1}"`);

// Type select
{
  const sel = page.locator('.fld-selwrap select.fld-sel').first();
  const cnt = await sel.count();
  let opts = [];
  if (cnt) opts = await sel.locator('option').allInnerTexts();
  rec('SLY-1 right-rail', 'Type select', cnt ? 'PASS' : 'FAIL', `options=[${opts.join(', ')}]`);
}
// Severity select (2nd fld-sel)
{
  const sels = page.locator('.fld-selwrap select.fld-sel');
  const n = await sels.count();
  let opts = [];
  if (n >= 2) opts = await sels.nth(1).locator('option').allInnerTexts();
  rec('SLY-1 right-rail', 'Severity select', n >= 2 ? 'PASS' : 'FAIL', `count=${n} options=[${opts.join(', ')}]`);
}
// Due date input
{
  const d = page.locator('input.fld-date');
  const cnt = await d.count();
  const type = cnt ? await d.first().getAttribute('type') : null;
  rec('SLY-1 right-rail', 'Due date input', cnt && type === 'date' ? 'PASS' : 'FAIL', `type=${type}`);
}
// Bundle input + datalist
{
  const b = page.locator('input.fld-bundle');
  const cnt = await b.count();
  const list = cnt ? await b.first().getAttribute('list') : null;
  const dl = await page.locator('#fld-bundles').count();
  const dlOpts = dl ? await page.locator('#fld-bundles option').count() : 0;
  rec('SLY-1 right-rail', 'Bundle input+datalist', cnt && list === 'fld-bundles' ? 'PASS' : 'FAIL', `list=${list} datalist#opts=${dlOpts}`);
}
// Related links
{
  const rel = page.locator('.siderail', { hasText: 'Related' });
  const has = await rel.count();
  let linkInfo = '';
  if (has) {
    const a = rel.first().locator('a[href^="#/ticket/"]');
    const an = await a.count();
    linkInfo = `ticket-links=${an}`;
    // SLY-1 link is to OPEN-BUGS (non-SLY) per data, so may be plain text
    linkInfo += ' | text=' + (await rel.first().innerText()).replace(/\n/g,' ').slice(0,80);
  }
  rec('SLY-1 right-rail', 'Related links', has ? 'PASS' : 'WARN', linkInfo || 'no Related rail (no links)');
}
// View on App Map link (only if group is a real surface)
{
  const ml = page.locator('.ticketmain a.btn[href^="#/map/"]');
  const cnt = await ml.count();
  const href = cnt ? await ml.first().getAttribute('href') : null;
  rec('SLY-1 main', 'View on App Map link', cnt ? 'PASS' : 'WARN', `href=${href}`);
}
// Technical-depth expander
{
  const det = page.locator('details.deep');
  const cnt = await det.count();
  if (cnt) {
    await det.first().locator('summary').click();
    await page.waitForTimeout(250);
    const open = await det.first().evaluate(d => d.open);
    const bodyVisible = await det.first().locator('.dbody').isVisible();
    rec('SLY-1 main', 'Technical-depth expander', open && bodyVisible ? 'PASS' : 'FAIL', `open=${open} bodyVisible=${bodyVisible}`);
    await page.screenshot({ path: OUT + '/02-sly1-depth-open.png', fullPage: true });
    // trace render inside
    const traceN = await det.first().locator('.trace .st').count();
    rec('SLY-1 main', 'Walk-evidence trace render', traceN ? 'PASS' : 'WARN', `trace steps=${traceN}`);
  } else rec('SLY-1 main', 'Technical-depth expander', 'WARN', 'no details.deep (no rootCause?)');
}
// Activity thread render
{
  const thread = page.locator('#thread');
  const has = await thread.count();
  const cmts = has ? await thread.locator('.cmt').count() : 0;
  const emptyTxt = has ? await thread.locator('.empty').count() : 0;
  rec('SLY-1 discuss', 'Activity thread render', has ? 'PASS' : 'FAIL', `comments=${cmts} empty=${emptyTxt}`);
}
// Comment button (present + textarea)
{
  const c = page.locator('button.btn', { hasText: 'Comment' });
  const ta = page.locator('#cmt');
  rec('SLY-1 discuss', 'Comment button + composer', (await c.count()) && (await ta.count()) ? 'PASS' : 'FAIL', `btn=${await c.count()} textarea=${await ta.count()}`);
}
// Get Jarvis's take -> opens modal
{
  await page.locator('button.btn', { hasText: "Get Jarvis's take" }).first().click();
  await page.waitForTimeout(300);
  const vis = await scrimVisible();
  const txt = await modalText();
  const hasPrompt = /Jarvis discussion on SLY-1/.test(await modalHTML());
  const hasCopy = /Copy prompt/.test(txt);
  const hasPost = /Post as Jarvis/.test(txt);
  rec('SLY-1 discuss', "Get Jarvis's take modal", vis && hasPrompt ? 'PASS' : 'FAIL', `copy=${hasCopy} postAsJarvis=${hasPost}`);
  await page.screenshot({ path: OUT + '/03-sly1-jarvis-take.png' });
  await closeAnyModal();
}
// Go deeper -> opens modal
{
  await page.locator('button.btn', { hasText: 'Go deeper' }).first().click();
  await page.waitForTimeout(300);
  const vis = await scrimVisible();
  const hasPrompt = /Go deeper on slyght SLY-1/.test(await modalHTML());
  rec('SLY-1 discuss', 'Go deeper modal', vis && hasPrompt ? 'PASS' : 'FAIL', `visible=${vis} prompt=${hasPrompt}`);
  await closeAnyModal();
}
// Aligned — hand to CC (Open status shows this, NOT Dispatch)
{
  const al = page.locator('button.btn', { hasText: 'Aligned' });
  const cnt = await al.count();
  if (cnt) {
    await al.first().click();
    await page.waitForTimeout(300);
    const vis = await scrimVisible();
    const txt = await modalText();
    const hasDec = await page.locator('#alignDec').count();
    rec('SLY-1 discuss', 'Aligned-hand-to-CC modal', vis && hasDec ? 'PASS' : 'FAIL', `gate-text="${txt.slice(0,60).replace(/\n/g,' ')}"`);
    await page.screenshot({ path: OUT + '/04-sly1-align.png' });
    await closeAnyModal();   // DO NOT confirm
  } else rec('SLY-1 discuss', 'Aligned-hand-to-CC button', 'FAIL', 'not present at Open status');
}
// Dispatch button presence at Open status
{
  const dsp = page.locator('button.dsp-btn');
  rec('SLY-1 discuss', 'Dispatch button visible at Open?', (await dsp.count()) ? 'INFO' : 'INFO', `count=${await dsp.count()} (expected 0 — only on aligned/in-flight tickets)`);
}
// View handoff button presence at Open
{
  const vh = page.locator('button.btn', { hasText: 'View handoff package' });
  rec('SLY-1 discuss', 'View handoff button at Open?', 'INFO', `count=${await vh.count()} (expected 0 at Open)`);
}
// Dispatch modal — open it directly (non-destructive; write only on doDispatch which we DON'T call)
{
  await page.evaluate(() => dispatchToCC('SLY-1'));
  await page.waitForTimeout(300);
  const vis = await scrimVisible();
  const txt = await modalText();
  const html = await modalHTML();
  const hasInvestigate = /Investigate/.test(txt);
  const hasFix = /Fix on branch/.test(txt);
  const hasCost = /\$1\.50|40\s*turns|costs tokens/.test(txt);
  const hasTypedConfirm = (await page.locator('#dspConfirm').count()) > 0;
  const goDisabled = await page.locator('#dspGo').isDisabled().catch(()=>null);
  // MODEL / REASONING probes
  const hasModelPick = /\bmodel\b/i.test(txt) || (await page.locator('#scrim select, .modal select').count()) > 0;
  const hasReasoning = /reasoning|thinking|effort/i.test(txt);
  rec('SLY-1 dispatch', 'Dispatch modal opens', vis ? 'PASS' : 'FAIL', `visible=${vis}`);
  rec('SLY-1 dispatch', 'Investigate/Fix toggle', hasInvestigate && hasFix ? 'PASS' : 'FAIL', `investigate=${hasInvestigate} fix=${hasFix}`);
  rec('SLY-1 dispatch', 'Cost note', hasCost ? 'PASS' : 'FAIL', `cost text present=${hasCost}`);
  rec('SLY-1 dispatch', 'Typed-confirm gate', hasTypedConfirm ? 'PASS' : 'FAIL', `input#dspConfirm present, Go disabled=${goDisabled}`);
  rec('SLY-1 dispatch', 'Model picker present?', hasModelPick ? 'PRESENT' : 'MISSING', `select count=${await page.locator('#scrim select, .modal select').count()}`);
  rec('SLY-1 dispatch', 'Reasoning/thinking option present?', hasReasoning ? 'PRESENT' : 'MISSING', `keyword scan of modal text`);
  await page.screenshot({ path: OUT + '/05-sly1-dispatch-modal.png' });
  // test mode toggle interactivity
  await page.locator('#dspModeFix').click().catch(()=>{});
  await page.waitForTimeout(150);
  const fixChecked = await page.locator('#dspModeFix').getAttribute('aria-checked').catch(()=>null);
  rec('SLY-1 dispatch', 'Fix-mode toggle wired', fixChecked === 'true' ? 'PASS' : 'FAIL', `aria-checked after click=${fixChecked}`);
  // typed confirm enables button
  await page.locator('#dspConfirm').fill('dispatch');
  await page.waitForTimeout(150);
  const goNow = await page.locator('#dspGo').isDisabled().catch(()=>null);
  rec('SLY-1 dispatch', 'Typed-confirm enables Dispatch', goNow === false ? 'PASS' : 'FAIL', `Go disabled after typing 'dispatch'=${goNow}`);
  await closeAnyModal();   // DO NOT click Dispatch Drone
}
// Delete (danger zone) -> typed-confirm modal
{
  await page.locator('button.btn.danger.full', { hasText: 'Delete ticket' }).first().click();
  await page.waitForTimeout(300);
  const vis = await scrimVisible();
  const hasInput = await page.locator('#delConfirm').count();
  const goDisabled = await page.locator('#delGo').isDisabled().catch(()=>null);
  // typing wrong then right
  await page.locator('#delConfirm').fill('wrong');
  await page.waitForTimeout(120);
  const stillDisabled = await page.locator('#delGo').isDisabled().catch(()=>null);
  await page.locator('#delConfirm').fill('SLY-1');
  await page.waitForTimeout(120);
  const enabled = await page.locator('#delGo').isDisabled().catch(()=>null);
  rec('SLY-1 danger', 'Delete typed-confirm modal', vis && hasInput ? 'PASS' : 'FAIL', `initialDisabled=${goDisabled} wrong->disabled=${stillDisabled} exact->disabled=${enabled}`);
  await page.screenshot({ path: OUT + '/06-sly1-delete-confirm.png' });
  await closeAnyModal();   // DO NOT confirm delete
}

/* ════════ TICKET DETAIL — SLY-26 (skim) ════════ */
await goto('#/ticket/SLY-26');
await page.screenshot({ path: OUT + '/07-ticket-sly26.png', fullPage: true });
{
  const h = await page.locator('.tk-head h1').first().innerText().catch(()=>'');
  const selN = await page.locator('select.fld-sel').count();
  const date = await page.locator('input.fld-date').count();
  const bundle = await page.locator('input.fld-bundle').count();
  const rel = await page.locator('.siderail', { hasText: 'Related' }).count();
  const relLinks = rel ? await page.locator('.siderail a[href^="#/ticket/"]').count() : 0;
  const del = await page.locator('button.btn.danger.full').count();
  rec('SLY-26', 'detail renders + controls', h && selN>=2 && date && bundle && del ? 'PASS' : 'FAIL',
    `h1="${h.slice(0,40)}" selects=${selN} date=${date} bundle=${bundle} relatedRail=${rel} relatedTicketLinks=${relLinks} delete=${del}`);
}

/* ════════ APP MAP — #/map ════════ */
await goto('#/map');
await page.waitForTimeout(800);
await page.screenshot({ path: OUT + '/08-map.png', fullPage: true });
{
  const svg = page.locator('#apptree');
  const nodeN = await svg.locator('g.te-node').count();
  const edgeN = await svg.locator('path.te-edge').count();
  const labelN = await svg.locator('g.te-lab text').count();
  rec('Map', 'drawAppTree renders', nodeN >= 8 && edgeN >= 10 ? 'PASS' : 'FAIL', `nodes=${nodeN} edges=${edgeN} labels=${labelN}`);
  // node click -> surface
  const before = page.url();
  await svg.locator('g.te-node').first().click();
  await page.waitForTimeout(500);
  const after = page.url();
  rec('Map', 'node click → surface', after.includes('#/map/') && after !== before ? 'PASS' : 'FAIL', `→ ${after.split('#')[1]}`);
  await goto('#/map');
  await page.waitForTimeout(600);
  // auto-ticket button + count
  const at = page.locator('button.at-btn');
  const atTxt = await at.first().innerText().catch(()=>'');
  const atN = await page.locator('.at-btn-n').first().innerText().catch(()=>'');
  const disabled = await at.first().isDisabled().catch(()=>null);
  // compute untracked from API to compare
  const apiUntracked = await page.evaluate(async () => {
    const f = await (await fetch('/api/flows')).json();
    const GAP = new Set(['gap','broken','fires-anyway','dead']);
    return (f.surfaces||[]).reduce((n,s)=> s.ticket ? n : n + (s.steps||[]).filter(st=>GAP.has(st.is) && !st.ticket).length, 0);
  });
  rec('Map', 'Auto-Ticket button + count', at ? 'PASS' : 'FAIL', `label="${atTxt.replace(/\n/g,' ')}" badge=${atN} disabled=${disabled} apiUntracked=${apiUntracked}`);
  if (String(atN).trim() !== String(apiUntracked)) rec('Map', 'Auto-Ticket count correctness', 'WARN', `UI badge=${atN} vs computed=${apiUntracked}`);
  else rec('Map', 'Auto-Ticket count correctness', 'PASS', `badge=${atN} matches computed`);
  // open auto-ticket modal if enabled (non-destructive — cancel)
  if (!disabled && Number(atN) > 0) {
    await at.first().click();
    await page.waitForTimeout(300);
    const vis = await scrimVisible();
    rec('Map', 'Auto-Ticket confirm modal opens', vis ? 'PASS' : 'FAIL', `text="${(await modalText()).slice(0,60).replace(/\n/g,' ')}"`);
    await page.screenshot({ path: OUT + '/09-map-autoticket.png' });
    await closeAnyModal();   // DO NOT confirm
  } else {
    rec('Map', 'Auto-Ticket confirm modal', 'INFO', `button disabled (count=${atN}) — no untracked gaps to ticket`);
  }
}

/* ════════ MAP SURFACE — savings (3 faces) ════════ */
async function testSurface(id, file) {
  await goto('#/map/' + id);
  await page.waitForTimeout(700);
  const tabs = await page.locator('.facetoggle .ftab').count();
  rec('Map/' + id, '3 face toggles render', tabs === 3 ? 'PASS' : 'FAIL', `ftab count=${tabs}`);
  // Flow (back) — default
  const ladRows = await page.locator('.ladrow').count();
  rec('Map/' + id, 'Flow face (ladder)', ladRows ? 'PASS' : 'FAIL', `ladder rows=${ladRows}`);
  await page.screenshot({ path: OUT + '/' + file + '-flow.png', fullPage: true });
  // Touchpoints
  await page.locator('.facetoggle .ftab', { hasText: 'Touchpoints' }).click();
  await page.waitForTimeout(500);
  const tpmap = await page.locator('#tpmap').count();
  const tpNodes = await page.locator('#tpmap g.tp-node').count();
  const ticketCol = await page.locator('.tp-side .siderail').count();
  const tpTickets = await page.locator('.tpticket').count();
  rec('Map/' + id, 'Touchpoints face (wiring graph)', tpmap && tpNodes ? 'PASS' : 'FAIL', `svg=${tpmap} dataNodes=${tpNodes} ticketCol=${ticketCol} tickets=${tpTickets}`);
  await page.screenshot({ path: OUT + '/' + file + '-touch.png', fullPage: true });
  // Screen (front)
  await page.locator('.facetoggle .ftab', { hasText: 'Screen' }).click();
  await page.waitForTimeout(700);
  const shots = await page.locator('.shots img.shot').count();
  const emptyShot = await page.locator('.nowafter .shots .empty, #faceBody .empty').count();
  const afterCard = await page.locator('.aftercard').count();
  rec('Map/' + id, 'Screen face', (shots || emptyShot || afterCard) ? 'PASS' : 'FAIL', `screenshots=${shots} placeholder=${emptyShot} afterCard=${afterCard}`);
  await page.screenshot({ path: OUT + '/' + file + '-screen.png', fullPage: true });
  // gap->ticket link on this surface
  const gapLink = await page.locator('a.gaplink, a[href^="#/ticket/"]').count();
  rec('Map/' + id, 'gap→ticket links', gapLink ? 'PASS' : 'WARN', `ticket links on surface=${gapLink}`);
}
await testSurface('savings', '10-savings');
await testSurface('ai', '11-ai');

log('\n========== RESULTS JSON ==========');
log(JSON.stringify({ results, errors }, null, 2));

await browser.close();
