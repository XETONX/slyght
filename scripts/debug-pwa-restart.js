// Strongest reload test: close the browser context entirely after
// locking + ticking, open a FRESH context with the same persisted
// localStorage. This is the closest simulation to John force-quitting
// the PWA and re-opening it the next day.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'state-snapshot.json'), 'utf8'));
  const seed = { S: fixture.S || fixture, BILLS: fixture.BILLS || [] };

  const browser = await chromium.launch();

  // === SESSION 1: lock + tick + bonus + save ===
  console.log('SESSION 1: open app, lock plan, tick bill, set bonus');
  const ctx1 = await browser.newContext({
    viewport: { width: 412, height: 915 }, deviceScaleFactor: 3.5,
    isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    colorScheme: 'dark',
  });
  const page1 = await ctx1.newPage();
  await ctx1.addInitScript((args) => {
    if (!localStorage.getItem('slyght_v5')) {
      localStorage.setItem('slyght_v5', JSON.stringify(args.seed));
    }
    localStorage.setItem('slyght_payday_canvas_seen', '1');
    try {
      const data = JSON.parse(localStorage.getItem('slyght_v5'));
      data.S.lastOpenDate = new Date().toISOString().slice(0, 10);
      localStorage.setItem('slyght_v5', JSON.stringify(data));
    } catch (_) {}
  }, { seed });
  await page1.goto('http://localhost:4567/slyght/', { waitUntil: 'networkidle' });
  await page1.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page1.waitForTimeout(800);

  await page1.evaluate(() => openPaydayPlan());
  await page1.waitForTimeout(400);

  const session1State = await page1.evaluate(() => {
    // Set lockedAt directly (real user taps "Lock plan" button → lockedAt set)
    S.activePlan.lockedAt = Date.now();
    S.activePlan.income.bonus = { amount: 500, included: true, status: 'expected' };
    // Tick first 3 bills via real BRAIN tickItem
    const bills = BRAIN.bills.getThisCycle();
    const tickedNames = [];
    for (const b of bills.slice(0, 3)) {
      const r = BRAIN.plan.tickItem('bill', b.name, BRAIN.SOURCES.PLAN_BILLS_TICK);
      if (r.ok) tickedNames.push(b.name);
    }
    save();
    return {
      lockedAt: S.activePlan.lockedAt,
      tickedNames,
      ticksBill: Object.keys(S.activePlan.ticks.bill || {}).length,
      bonusIncluded: S.activePlan.income.bonus.included,
      bonusAmount: S.activePlan.income.bonus.amount,
    };
  });
  console.log('  Set state:', JSON.stringify(session1State));

  // Export the storage to replay in session 2
  const storage = await ctx1.storageState();
  console.log('  Storage origins:', storage.origins.length);
  const slyghtState = storage.origins
    .flatMap(o => o.localStorage)
    .find(item => item.name === 'slyght_v5');
  console.log('  slyght_v5 size:', slyghtState ? slyghtState.value.length : 'MISSING', 'bytes');

  // CLOSE the entire context (simulates force-quit of PWA)
  await ctx1.close();
  console.log('  → Closed session 1\n');

  // === SESSION 2: fresh context with the saved storage ===
  console.log('SESSION 2: brand-new context, replay session 1 storage');
  const ctx2 = await browser.newContext({
    viewport: { width: 412, height: 915 }, deviceScaleFactor: 3.5,
    isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    colorScheme: 'dark',
    storageState: storage,  // ← Replay session 1's localStorage
  });
  const page2 = await ctx2.newPage();
  await page2.goto('http://localhost:4567/slyght/', { waitUntil: 'networkidle' });
  await page2.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page2.waitForTimeout(1200);

  const session2State = await page2.evaluate(() => ({
    lockedAt: S.activePlan?.lockedAt,
    ticksBill: Object.keys(S.activePlan?.ticks?.bill || {}).length,
    ticksBillNames: Object.keys(S.activePlan?.ticks?.bill || {}),
    bonusIncluded: S.activePlan?.income?.bonus?.included,
    bonusAmount: S.activePlan?.income?.bonus?.amount,
    cycleId: S.activePlan?.cycleId,
    bannerShown: !!document.getElementById('plan-active-banner-dash')?.innerHTML,
  }));
  console.log('  After fresh-context restart:', JSON.stringify(session2State, null, 2));

  // SECOND restart (close ctx2, open ctx3) to test a third session
  console.log('\nSESSION 3: ANOTHER fresh context, third reopen');
  const storage2 = await ctx2.storageState();
  await ctx2.close();
  const ctx3 = await browser.newContext({
    viewport: { width: 412, height: 915 }, deviceScaleFactor: 3.5,
    isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    colorScheme: 'dark',
    storageState: storage2,
  });
  const page3 = await ctx3.newPage();
  await page3.goto('http://localhost:4567/slyght/', { waitUntil: 'networkidle' });
  await page3.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page3.waitForTimeout(1200);

  const session3State = await page3.evaluate(() => ({
    lockedAt: S.activePlan?.lockedAt,
    ticksBill: Object.keys(S.activePlan?.ticks?.bill || {}).length,
    bonusIncluded: S.activePlan?.income?.bonus?.included,
    bannerShown: !!document.getElementById('plan-active-banner-dash')?.innerHTML,
  }));
  console.log('  After THIRD fresh-context restart:', JSON.stringify(session3State, null, 2));

  console.log('\n=== VERDICT ===');
  const ok =
    session2State.lockedAt === session1State.lockedAt &&
    session2State.ticksBill === session1State.ticksBill &&
    session2State.bonusIncluded === session1State.bonusIncluded &&
    session2State.bannerShown &&
    session3State.lockedAt === session1State.lockedAt &&
    session3State.ticksBill === session1State.ticksBill &&
    session3State.bonusIncluded === session1State.bonusIncluded &&
    session3State.bannerShown;

  if (ok) {
    console.log('✅ PASS — lock + ticks + bonus survive across TWO full close-and-reopen cycles');
  } else {
    console.log('❌ FAIL — state did not survive');
    console.log('  Expected:', JSON.stringify(session1State));
    console.log('  Got session2:', JSON.stringify(session2State));
    console.log('  Got session3:', JSON.stringify(session3State));
  }

  await browser.close();
  process.exit(ok ? 0 : 1);
})();
