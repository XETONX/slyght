// Test the same reload scenario but with a cycleEndDate from a week ago,
// simulating "John locked his plan, came back 5 days later".
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'state-snapshot.json'), 'utf8'));
  const seed = { S: fixture.S || fixture, BILLS: fixture.BILLS || [] };
  // Push cycleEnd 7 days in the past so this isn't a borderline test
  const aWeekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const aMonthBefore = new Date(Date.now() - 37 * 86400000).toISOString().slice(0, 10);
  seed.S.activePlan.cycleStartDate = aMonthBefore;
  seed.S.activePlan.cycleEndDate = aWeekAgo;
  seed.S.activePlan.cycleId = aMonthBefore;
  console.log('Cycle dates: start', aMonthBefore, '· end', aWeekAgo, '· today', new Date().toISOString().slice(0,10));

  const browser = await chromium.launch();

  // === SESSION 1: lock + tick + save ===
  const ctx1 = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const page1 = await ctx1.newPage();
  await ctx1.addInitScript((args) => {
    try { localStorage.setItem('slyght_v5', JSON.stringify(args.seed)); } catch (_) {}
    try { localStorage.setItem('slyght_payday_canvas_seen', '1'); } catch (_) {}
  }, { seed });
  await page1.goto('http://localhost:4567/slyght/', { waitUntil: 'networkidle' });
  await page1.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page1.waitForTimeout(500);

  await page1.evaluate(() => openPaydayPlan());
  await page1.waitForTimeout(500);
  const sess1 = await page1.evaluate(() => {
    S.activePlan.lockedAt = Date.now();
    const bills = BRAIN.bills.getThisCycle();
    bills.forEach(b => BRAIN.plan.tickItem('bill', b.name, BRAIN.SOURCES.PLAN_BILLS_TICK));
    save();
    return {
      lockedAt: S.activePlan.lockedAt,
      ticks: Object.keys(S.activePlan.ticks.bill || {}).length,
      cycleId: S.activePlan.cycleId,
      cycleEnd: S.activePlan.cycleEndDate,
      ls: localStorage.getItem('slyght_v5'),
      // Also test rollover directly
      rolloverResult: BRAIN.plan.rolloverIfNeeded(),
    };
  });
  console.log('SESSION 1:', { lockedAt: sess1.lockedAt, ticks: sess1.ticks, cycleId: sess1.cycleId, cycleEnd: sess1.cycleEnd, rollover: sess1.rolloverResult });
  await ctx1.close();

  // === SESSION 2: reload ===
  const ctx2 = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const page2 = await ctx2.newPage();
  await ctx2.addInitScript((args) => {
    try { localStorage.setItem('slyght_v5', args.lsRaw); } catch (_) {}
    try { localStorage.setItem('slyght_payday_canvas_seen', '1'); } catch (_) {}
  }, { lsRaw: sess1.ls });
  await page2.goto('http://localhost:4567/slyght/', { waitUntil: 'networkidle' });
  await page2.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page2.waitForTimeout(1000);

  // Also OPEN the canvas to see if openPaydayPlan triggers wipe
  await page2.evaluate(() => openPaydayPlan());
  await page2.waitForTimeout(500);

  const sess2 = await page2.evaluate(() => ({
    lockedAt: S.activePlan ? S.activePlan.lockedAt : null,
    ticks: S.activePlan && S.activePlan.ticks && S.activePlan.ticks.bill ? Object.keys(S.activePlan.ticks.bill).length : 0,
    cycleId: S.activePlan ? S.activePlan.cycleId : null,
    rolloverResult: BRAIN.plan.rolloverIfNeeded(),
  }));
  console.log('SESSION 2 (after reload + openPaydayPlan):', sess2);

  // Try a SECOND reload
  await page2.reload({ waitUntil: 'networkidle' });
  await page2.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page2.waitForTimeout(1000);
  await page2.evaluate(() => openPaydayPlan());
  await page2.waitForTimeout(500);
  const sess3 = await page2.evaluate(() => ({
    lockedAt: S.activePlan ? S.activePlan.lockedAt : null,
    ticks: S.activePlan && S.activePlan.ticks && S.activePlan.ticks.bill ? Object.keys(S.activePlan.ticks.bill).length : 0,
  }));
  console.log('SESSION 3 (after another reload + open):', sess3);

  console.log('\n=== VERDICT ===');
  const ok = sess1.lockedAt === sess2.lockedAt && sess2.lockedAt === sess3.lockedAt;
  console.log(ok ? '✅ PASS — lock survived 2 reloads + canvas re-open with cycle 7 days past end' : '❌ FAIL — wipe path still exists');

  await browser.close();
})();
