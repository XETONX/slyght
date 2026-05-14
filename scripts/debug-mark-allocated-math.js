// Trace what changes when user taps "Mark as allocated" on a trip.
// Specifically: does "Your free money this cycle" change? Bank balance?
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'state-snapshot.json'), 'utf8'));
  const seed = { S: fixture.S || fixture, BILLS: fixture.BILLS || [] };

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 3.5, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await ctx.addInitScript((args) => {
    if (!localStorage.getItem('slyght_v5')) {
      localStorage.setItem('slyght_v5', JSON.stringify(args.seed));
    }
    localStorage.setItem('slyght_payday_canvas_seen', '1');
  }, { seed });

  await page.goto('http://localhost:4567/slyght/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page.waitForTimeout(800);
  await page.evaluate(() => openPaydayPlan());
  await page.waitForTimeout(500);

  // Step 1: set up $800 allocation to Darwin + lock
  const setup = await page.evaluate(() => {
    BRAIN.plan.setOverride('savings', 'trip-darwin-2026', 800, {}, BRAIN.SOURCES.PLAN_OVERRIDE_SET);
    S.activePlan.lockedAt = Date.now();
    save();
    const snap = BRAIN.plan.getSnapshot();
    const essentials = snap.bills.total + snap.debts.total + snap.dailyLiving.plannedTotal + (typeof PLAN !== 'undefined' && PLAN.getTotalProvisions ? PLAN.getTotalProvisions() : 0);
    return {
      bal: S.bal,
      totalToPlan: snap.totalToPlan,
      essentials,
      remainder: snap.totalToPlan - essentials,
      savingsTotal: snap.savings.total,
      stillFree: (snap.totalToPlan - essentials) - snap.savings.total - snap.knownUpcoming.total,
      darwinOverride: S.activePlan.overrides['savings:trip-darwin-2026']?.thisCycleAmount,
      ticked: !!(S.activePlan.ticks?.savings?.['trip-darwin-2026']),
    };
  });
  console.log('AFTER lock + $800 allocation to Darwin:');
  Object.entries(setup).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  // Step 2: mark as allocated (tick)
  const after = await page.evaluate(() => {
    const r = BRAIN.plan.tickItem('savings', 'trip-darwin-2026', BRAIN.SOURCES.PLAN_SAVINGS_TICK);
    if (!r.ok) return { error: r.reason };
    const snap = BRAIN.plan.getSnapshot();
    const essentials = snap.bills.total + snap.debts.total + snap.dailyLiving.plannedTotal + (typeof PLAN !== 'undefined' && PLAN.getTotalProvisions ? PLAN.getTotalProvisions() : 0);
    return {
      tickResult: 'ok',
      bal: S.bal,
      totalToPlan: snap.totalToPlan,
      essentials,
      remainder: snap.totalToPlan - essentials,
      savingsTotal: snap.savings.total,
      stillFree: (snap.totalToPlan - essentials) - snap.savings.total - snap.knownUpcoming.total,
      darwinOverride: S.activePlan.overrides['savings:trip-darwin-2026']?.thisCycleAmount,
      ticked: !!(S.activePlan.ticks?.savings?.['trip-darwin-2026']),
    };
  });
  console.log('\nAFTER tick "Mark as allocated":');
  Object.entries(after).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  console.log('\n=== DELTAS ===');
  console.log(`  Bank balance:           $${setup.bal.toFixed(2)} → $${after.bal.toFixed(2)}   (Δ ${(after.bal - setup.bal).toFixed(2)})`);
  console.log(`  Your free money cycle:  $${setup.remainder.toFixed(2)} → $${after.remainder.toFixed(2)}   (Δ ${(after.remainder - setup.remainder).toFixed(2)})`);
  console.log(`  snap.savings.total:     $${setup.savingsTotal.toFixed(2)} → $${after.savingsTotal.toFixed(2)}   (Δ ${(after.savingsTotal - setup.savingsTotal).toFixed(2)})`);
  console.log(`  Still free after alloc: $${setup.stillFree.toFixed(2)} → $${after.stillFree.toFixed(2)}   (Δ ${(after.stillFree - setup.stillFree).toFixed(2)})`);

  await browser.close();
})();
