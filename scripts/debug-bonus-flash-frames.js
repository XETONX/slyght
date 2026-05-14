// Rapid-capture the bonus save flow at ~4ms intervals to catch the flash.
// John 2026-05-15: "let it take like 20 captures in ms so it captures the glitch"
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, '..', 'captures', 'bonus-flash');
fs.mkdirSync(OUT, { recursive: true });
// Clean prior
for (const f of fs.readdirSync(OUT)) fs.unlinkSync(path.join(OUT, f));

(async () => {
  const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'state-snapshot.json'), 'utf8'));
  const seed = { S: fixture.S || fixture, BILLS: fixture.BILLS || [] };

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await ctx.addInitScript((args) => {
    try { localStorage.setItem('slyght_v5', JSON.stringify(args.seed)); } catch (_) {}
    try { localStorage.setItem('slyght_payday_canvas_seen', '1'); } catch (_) {}
  }, { seed });

  await page.goto('http://localhost:4567/slyght/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page.waitForTimeout(500);

  await page.evaluate(() => openPaydayPlan());
  await page.waitForTimeout(400);

  // Reset bonus to off so we can flip + save
  await page.evaluate(() => {
    if (S.activePlan && S.activePlan.income && S.activePlan.income.bonus) {
      S.activePlan.income.bonus.included = false;
      S.activePlan.income.bonus.amount = 0;
      save();
      renderPaydayPlanRoot();
    }
  });
  await page.waitForTimeout(300);

  await page.evaluate(() => openEditPaydayBonus());
  await page.waitForTimeout(500);

  // Pre-flip: flip the toggle + pick amount via DOM
  await page.evaluate(() => {
    const toggle = document.getElementById('bonus-include');
    if (toggle) {
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
    }
    // Pick first amount chip
    const chips = document.querySelectorAll('#quickpick-grid .quickpick');
    if (chips.length > 0) chips[0].click();
  });
  await page.waitForTimeout(300);

  // Start rapid capture loop: fire attemptSave THEN poll-screenshot in tight loop
  // for ~120ms total, capturing every ~6ms (limited by browser screenshot latency).
  console.log('\nStarting rapid capture during SAVE...');
  const captureLoop = (async () => {
    const frames = [];
    const t0 = Date.now();
    for (let i = 0; i < 25; i++) {
      const t = Date.now() - t0;
      const file = `frame-${String(i).padStart(2, '0')}-${String(t).padStart(4, '0')}ms.png`;
      try {
        await page.screenshot({ path: path.join(OUT, file), fullPage: false, animations: 'allow' });
        frames.push({ i, t, file });
      } catch (e) {}
    }
    return frames;
  })();

  // Fire SAVE 5ms in so we catch the buildup + flash
  setTimeout(() => {
    page.evaluate(() => EDIT_MODAL.attemptSave()).catch(() => {});
  }, 5);

  const frames = await captureLoop;
  console.log('Captured', frames.length, 'frames');
  frames.forEach(f => console.log(`  +${String(f.t).padStart(4)}ms  ${f.file}`));

  await browser.close();
})();
