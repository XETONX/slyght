// Simulate the actual user flow that John reports wiping the plan:
// 1. Open app, lock, tick.
// 2. CLOSE the page entirely.
// 3. Open the SAME persisted localStorage in a new context.
// 4. Verify state survived.
//
// If this fails, there's a third wipe path beyond:
//   - boot self-test (fixed c9331c7)
//   - openPaydayPlan rollover (fixed in r74)
//
// Possible candidates: load() migrations, seedV24+, normalize routines,
// renderAll side-effects, autoExpire.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'state-snapshot.json'), 'utf8'));
  const seed = { S: fixture.S || fixture, BILLS: fixture.BILLS || [] };

  const browser = await chromium.launch();

  // === SESSION 1: lock + tick + save ===
  const ctx1 = await browser.newContext({
    viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark',
  });
  const page1 = await ctx1.newPage();
  await ctx1.addInitScript((args) => {
    try { localStorage.setItem('slyght_v5', JSON.stringify(args.seed)); } catch (_) {}
    try { localStorage.setItem('slyght_payday_canvas_seen', '1'); } catch (_) {}
  }, { seed });
  await page1.goto('http://localhost:4567/slyght/', { waitUntil: 'networkidle' });
  await page1.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page1.waitForTimeout(500);

  await page1.evaluate(() => openPaydayPlan());
  await page1.waitForTimeout(400);
  const sess1 = await page1.evaluate(() => {
    S.activePlan.lockedAt = Date.now();
    const bills = BRAIN.bills.getThisCycle();
    bills.forEach(b => BRAIN.plan.tickItem('bill', b.name, BRAIN.SOURCES.PLAN_BILLS_TICK));
    save();
    return {
      lockedAt: S.activePlan.lockedAt,
      ticks: Object.keys(S.activePlan.ticks.bill).length,
      // Save the FULL localStorage so we can replay it in session 2
      ls: localStorage.getItem('slyght_v5'),
    };
  });
  console.log('SESSION 1 (locked + ticked + saved):');
  console.log('  lockedAt:', sess1.lockedAt);
  console.log('  ticks:', sess1.ticks);
  console.log('  localStorage size:', sess1.ls.length, 'bytes');

  // Parse it to verify lockedAt + ticks present
  const parsed = JSON.parse(sess1.ls);
  console.log('  parsed S.activePlan.lockedAt:', parsed.S.activePlan.lockedAt);
  console.log('  parsed S.activePlan.ticks.bill keys:', Object.keys(parsed.S.activePlan.ticks.bill || {}).length);

  await ctx1.close();

  // === SESSION 2: reload using the EXACT localStorage from session 1 ===
  const ctx2 = await browser.newContext({
    viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark',
  });
  const page2 = await ctx2.newPage();
  await ctx2.addInitScript((args) => {
    try { localStorage.setItem('slyght_v5', args.lsRaw); } catch (_) {}
    try { localStorage.setItem('slyght_payday_canvas_seen', '1'); } catch (_) {}
  }, { lsRaw: sess1.ls });
  await page2.goto('http://localhost:4567/slyght/', { waitUntil: 'networkidle' });
  await page2.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page2.waitForTimeout(1000);  // give boot self-test + migrations time

  const sess2 = await page2.evaluate(() => ({
    lockedAt: S.activePlan ? S.activePlan.lockedAt : null,
    ticks: S.activePlan && S.activePlan.ticks && S.activePlan.ticks.bill ? Object.keys(S.activePlan.ticks.bill).length : 0,
    cycleId: S.activePlan ? S.activePlan.cycleId : null,
    // Check audit log for any rollover/wipe events
    auditTrail: ((S.auditLog || []).concat((typeof BRAIN !== 'undefined' && BRAIN.audit && BRAIN.audit._log) || []))
      .slice(-30)
      .filter(e => /rollover|wipe|seed|plan|active/i.test(JSON.stringify(e)))
      .map(e => e.type || JSON.stringify(e).slice(0, 80)),
  }));
  console.log('\nSESSION 2 (after simulated reload):');
  console.log('  lockedAt:', sess2.lockedAt);
  console.log('  ticks:', sess2.ticks);
  console.log('  cycleId:', sess2.cycleId);
  console.log('  audit trail:', sess2.auditTrail);

  console.log('\n=== VERDICT ===');
  if (sess2.lockedAt === sess1.lockedAt && sess2.ticks === sess1.ticks) {
    console.log('✅ PASS — lock + ticks survived simulated reload');
  } else {
    console.log('❌ FAIL — work was wiped between sessions');
    console.log('  Expected lockedAt:', sess1.lockedAt, 'Got:', sess2.lockedAt);
    console.log('  Expected ticks:', sess1.ticks, 'Got:', sess2.ticks);
  }

  await browser.close();
})();
