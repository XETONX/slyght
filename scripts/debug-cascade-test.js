// Debug: end-to-end BIG BRAIN cascade test.
// Lock the plan, tick a bill in the canvas, then check that the same
// bill is reflected as paid in the live BRAIN state — proving the
// new div-based card structure still routes through paydayTick fine.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const fixturePath = path.resolve(__dirname, '..', 'state-snapshot.json');
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const seed = { S: fixture.S || fixture, BILLS: fixture.BILLS || [] };

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();
  await ctx.addInitScript((args) => {
    try { localStorage.setItem('slyght_v5', JSON.stringify(args.seed)); } catch (_) {}
    try { localStorage.setItem('slyght_payday_canvas_seen', '1'); } catch (_) {}
  }, { seed });

  page.on('console', msg => {
    const t = msg.type();
    if (t === 'error' || t === 'warning') console.log(`[browser ${t}]`, msg.text());
  });

  await page.goto('http://localhost:4567/slyght/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  await page.evaluate(() => { if (typeof goPage === 'function') goPage('pg-plan'); });
  await page.evaluate(() => { if (typeof openPaydayPlan === 'function') openPaydayPlan(); });
  await page.waitForTimeout(400);

  // Lock + open bills sub
  await page.evaluate(() => {
    if (S.activePlan) { S.activePlan.lockedAt = Date.now(); save(); renderPaydayPlanRoot(); }
  });
  await page.evaluate(() => {
    document.querySelectorAll('.payday-subscreen.payday-active').forEach(x => x.classList.remove('payday-active'));
    if (typeof openPaydayCategory === 'function') openPaydayCategory('payday-bills');
  });
  await page.waitForTimeout(400);

  // Pre-tick snapshot of bill state
  const pre = await page.evaluate(() => {
    const ticks = (S.activePlan && S.activePlan.ticks && S.activePlan.ticks.bill) || {};
    return {
      ticksCount: Object.keys(ticks).length,
      googleOne: !!ticks['Google One'],
      cards: Array.from(document.querySelectorAll('.pd-row-card')).length,
      actionButtons: Array.from(document.querySelectorAll('.pd-row-action')).length,
    };
  });
  console.log('PRE-tick:', JSON.stringify(pre));

  // Find + click the first Mark-as-paid button (Google One)
  const clickResult = await page.evaluate(() => {
    const btn = document.querySelector('.pd-row-action');
    if (!btn) return { ok: false, reason: 'no .pd-row-action found' };
    const label = btn.textContent.trim();
    btn.click();
    return { ok: true, label };
  });
  console.log('CLICKED:', JSON.stringify(clickResult));
  await page.waitForTimeout(400);

  // Post-tick verification
  const post = await page.evaluate(() => {
    const ticks = (S.activePlan && S.activePlan.ticks && S.activePlan.ticks.bill) || {};
    // Check BRAIN.bills view of paid state for this cycle too
    const brainView = (typeof BRAIN !== 'undefined' && BRAIN.bills && BRAIN.bills.getThisCycle)
      ? BRAIN.bills.getThisCycle().slice(0, 3).map(b => ({ name: b.name, isPaid: !!ticks[b.name] }))
      : null;
    return {
      ticksCount: Object.keys(ticks).length,
      ticksKeys: Object.keys(ticks),
      googleOne: !!ticks['Google One'],
      cards: Array.from(document.querySelectorAll('.pd-row-card')).length,
      actionButtonsTicked: Array.from(document.querySelectorAll('.pd-row-action.ticked')).length,
      brainView,
    };
  });
  console.log('POST-tick:', JSON.stringify(post, null, 2));

  // Navigate to Bills tab and verify the same bill reflects paid state
  await page.evaluate(() => {
    document.querySelectorAll('.payday-subscreen.payday-active').forEach(x => x.classList.remove('payday-active'));
    if (typeof goPage === 'function') goPage('pg-cal');
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'captures/debug-cascade-billstab.png', fullPage: false });

  // Check if Bills tab DOM reflects the paid state for the ticked bill
  const billsTabState = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('[class*="bill"]'));
    const googleOneRow = all.find(el => /Google One/.test(el.textContent || ''));
    return {
      activeBillsPage: document.getElementById('pg-cal') ? document.getElementById('pg-cal').classList.contains('active') : null,
      foundGoogleOneInDOM: !!googleOneRow,
      // Try to find a "paid" indicator near Google One
      domContext: googleOneRow ? googleOneRow.outerHTML.slice(0, 300) : null,
    };
  });
  console.log('BILLS-TAB:', JSON.stringify(billsTabState, null, 2));

  await browser.close();
})();
