// Sweep capture: post-paid cascade in dark mode.
// Scenario: John locks the plan + marks every bill as paid in PLAN mode.
// Then capture Dashboard, Bills tab, Analysis tab, Payday Plan root +
// sub-screens — to see how the cascade reflects across surfaces.
//
// Output: docs/reviews/sweep-2026-05-14-post-paid-cascade/input/01-14-*.png
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.resolve(__dirname, '..', 'docs', 'reviews', 'sweep-2026-05-14-post-paid-cascade', 'input');

async function capture(page, name, scrollY) {
  if (scrollY != null) {
    // .screen has overflow-y:auto — scroll the active screen, not the window
    await page.evaluate((y) => {
      const s = document.querySelector('.screen.active');
      if (s) s.scrollTop = y;
      window.scrollTo(0, y);
    }, scrollY);
    await page.waitForTimeout(250);
  }
  const out = path.join(OUT_DIR, name);
  await page.screenshot({ path: out, fullPage: false });
  console.log('Captured', name);
}

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

  page.on('pageerror', err => console.log('[pageerror]', err.message));

  await page.goto('http://localhost:4567/slyght/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  // Dismiss splash via the proper handler
  await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page.waitForSelector('#splash-screen', { state: 'hidden' }).catch(() => {});
  await page.waitForTimeout(800);

  // Open Payday Plan + lock + tick every bill
  await page.evaluate(() => { if (typeof goPage === 'function') goPage('pg-plan'); });
  await page.evaluate(() => { if (typeof openPaydayPlan === 'function') openPaydayPlan(); });
  await page.waitForTimeout(500);

  const lockTickResult = await page.evaluate(() => {
    if (!S.activePlan) return { ok: false, reason: 'no activePlan' };
    S.activePlan.lockedAt = Date.now();
    S.activePlan.ticks = S.activePlan.ticks || {};
    S.activePlan.ticks.bill = S.activePlan.ticks.bill || {};
    // Tick every bill in this cycle using paydayTick to fire full cascade
    let tickedCount = 0;
    const bills = (typeof BRAIN !== 'undefined' && BRAIN.bills && BRAIN.bills.getThisCycle)
      ? BRAIN.bills.getThisCycle()
      : [];
    bills.forEach(b => {
      const r = (typeof BRAIN !== 'undefined' && BRAIN.plan && BRAIN.plan.tickItem)
        ? BRAIN.plan.tickItem('bill', b.name, BRAIN.SOURCES.PLAN_BILLS_TICK)
        : { ok: false };
      if (r && r.ok) tickedCount++;
    });
    if (typeof save === 'function') save();
    if (typeof renderAll === 'function') renderAll();
    if (typeof renderPaydayPlanRoot === 'function') renderPaydayPlanRoot();
    return { ok: true, totalBills: bills.length, tickedCount };
  });
  console.log('Lock + tick:', JSON.stringify(lockTickResult));

  // r74 NEW: capture payday canvas + sub-screens FIRST while the lock+ticks
  // are still alive. Re-opening the canvas later (after the dashboard/bills/
  // analysis tour) would trigger rolloverIfNeeded() because cycleEnd is today
  // and ageHours > 12 — wiping the work we just programmatically set.
  await capture(page, '10-payday-root-postpaid.png', 0);
  const subsEarly = [
    { id: 'payday-bills',    file: '11-payday-sub-bills.png' },
    { id: 'payday-debts',    file: '12-payday-sub-debts.png' },
    { id: 'payday-savings',  file: '13-payday-sub-savings.png' },
    { id: 'payday-upcoming', file: '14-payday-sub-upcoming.png' },
  ];
  for (const s of subsEarly) {
    await page.evaluate((sub) => {
      document.querySelectorAll('.payday-subscreen.payday-active').forEach(x => x.classList.remove('payday-active'));
      if (typeof openPaydayCategory === 'function') openPaydayCategory(sub);
    }, s.id);
    await page.waitForTimeout(400);
    await capture(page, s.file, 0);
  }

  // Close payday + PLAN mode cleanly via the proper helper
  await page.evaluate(() => {
    if (typeof _paydayExitToTab === 'function') _paydayExitToTab('pg-dash');
  });
  await page.waitForTimeout(600);
  const dashState = await page.evaluate(() => {
    const dash = document.getElementById('pg-dash');
    return { dashActive: dash ? dash.classList.contains('active') : null, dashOffsetHeight: dash ? dash.offsetHeight : null };
  });
  console.log('Dashboard state:', JSON.stringify(dashState));
  await capture(page, '01-dashboard-top.png', 0);
  await capture(page, '02-dashboard-mid.png', 600);
  await capture(page, '03-dashboard-bottom.png', 1200);

  // === BILLS TAB (pg-cal) ===
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    if (typeof goPage === 'function') goPage('pg-cal');
  });
  await page.waitForTimeout(600);
  await capture(page, '04-billstab-top.png', 0);
  await capture(page, '05-billstab-mid.png', 600);
  await capture(page, '06-billstab-bottom.png', 1200);

  // === ANALYSIS TAB (pg-spend) ===
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    if (typeof goPage === 'function') goPage('pg-spend');
  });
  await page.waitForTimeout(600);
  await capture(page, '07-analysis-top.png', 0);
  await capture(page, '08-analysis-mid.png', 600);
  await capture(page, '09-analysis-bottom.png', 1200);



  await browser.close();
  console.log('\n=== Sweep complete ===');
  console.log('Frames saved to:', OUT_DIR);
})();
