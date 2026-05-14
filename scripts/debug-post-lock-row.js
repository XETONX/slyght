// Debug: capture a post-lock sub-screen to verify the new Mark-as-paid buttons.
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
    deviceScaleFactor: 3.5,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();
  await ctx.addInitScript((args) => {
    try { localStorage.setItem('slyght_v5', JSON.stringify(args.seed)); } catch (_) {}
    try { localStorage.setItem('slyght_payday_canvas_seen', '1'); } catch (_) {}
  }, { seed });

  await page.goto('http://localhost:4567/slyght/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  await page.evaluate(() => { if (typeof goPage === 'function') goPage('pg-plan'); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { if (typeof openPaydayPlan === 'function') openPaydayPlan(); });
  await page.waitForTimeout(600);

  // Lock AFTER opening so rolloverIfNeeded has run + cycleId is fresh
  const lockInfo = await page.evaluate(() => {
    if (!S.activePlan) return { ok: false, reason: 'no activePlan' };
    S.activePlan.lockedAt = Date.now();
    if (typeof save === 'function') save();
    if (typeof renderPaydayPlanRoot === 'function') renderPaydayPlanRoot();
    return { ok: true, cycleId: S.activePlan.cycleId, lockedAt: S.activePlan.lockedAt };
  });
  console.log('Lock applied:', JSON.stringify(lockInfo));
  await page.waitForTimeout(300);

  // Open each sub-screen post-lock + capture
  const subs = ['payday-bills', 'payday-debts', 'payday-savings', 'payday-upcoming'];
  for (const sub of subs) {
    await page.evaluate((s) => {
      document.querySelectorAll('.payday-subscreen.payday-active').forEach(x => x.classList.remove('payday-active'));
      if (typeof openPaydayCategory === 'function') openPaydayCategory(s);
    }, sub);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `captures/debug-postlock-${sub}.png`, fullPage: false });
    console.log(`Captured ${sub}`);
  }

  await browser.close();
})();
