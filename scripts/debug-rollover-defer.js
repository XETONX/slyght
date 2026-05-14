// Verify the C-01 rollover defer fix: openPaydayPlan twice with work
// in the plan should preserve lockedAt + ticks across both opens, even
// when ageHours > 12.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'state-snapshot.json'), 'utf8'));
  const seed = { S: fixture.S || fixture, BILLS: fixture.BILLS || [] };

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark',
  });
  const page = await ctx.newPage();
  await ctx.addInitScript((args) => {
    try { localStorage.setItem('slyght_v5', JSON.stringify(args.seed)); } catch (_) {}
    try { localStorage.setItem('slyght_payday_canvas_seen', '1'); } catch (_) {}
  }, { seed });

  await page.goto('http://localhost:4567/slyght/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page.waitForSelector('#splash-screen', { state: 'hidden' }).catch(() => {});
  await page.waitForTimeout(500);

  // Open canvas, lock + tick, capture state
  await page.evaluate(() => { openPaydayPlan(); });
  await page.waitForTimeout(400);
  const afterLock = await page.evaluate(() => {
    S.activePlan.lockedAt = Date.now();
    const bills = BRAIN.bills.getThisCycle();
    bills.forEach(b => BRAIN.plan.tickItem('bill', b.name, BRAIN.SOURCES.PLAN_BILLS_TICK));
    save();
    return {
      lockedAt: S.activePlan.lockedAt,
      ticks: Object.keys((S.activePlan.ticks && S.activePlan.ticks.bill) || {}).length,
      ageHours: (Date.now() - new Date(S.activePlan.cycleEndDate).getTime()) / 3600000,
    };
  });
  console.log('AFTER lock + tick:', JSON.stringify(afterLock));

  // Close + re-open
  await page.evaluate(() => { if (typeof _paydayExitToTab === 'function') _paydayExitToTab('pg-dash'); });
  await page.waitForTimeout(400);
  await page.evaluate(() => { openPaydayPlan(); });
  await page.waitForTimeout(400);
  const afterReopen = await page.evaluate(() => ({
    lockedAt: S.activePlan ? S.activePlan.lockedAt : null,
    ticks: S.activePlan && S.activePlan.ticks && S.activePlan.ticks.bill ? Object.keys(S.activePlan.ticks.bill).length : 0,
    ageHours: S.activePlan && S.activePlan.cycleEndDate ? (Date.now() - new Date(S.activePlan.cycleEndDate).getTime()) / 3600000 : null,
    rolloverResult: BRAIN.plan.rolloverIfNeeded(),
  }));
  console.log('AFTER re-open:', JSON.stringify(afterReopen));

  // VERDICT
  const ok = afterReopen.lockedAt === afterLock.lockedAt && afterReopen.ticks === afterLock.ticks;
  console.log('\n=== C-01 VERIFY ===');
  console.log(ok ? '✅ PASS — lock+ticks survived re-open' : '❌ FAIL — lock or ticks were wiped');
  console.log('Expected lockedAt:', afterLock.lockedAt, 'Got:', afterReopen.lockedAt);
  console.log('Expected ticks:', afterLock.ticks, 'Got:', afterReopen.ticks);
  console.log('Rollover result:', JSON.stringify(afterReopen.rolloverResult));

  await browser.close();
  process.exit(ok ? 0 : 1);
})();
