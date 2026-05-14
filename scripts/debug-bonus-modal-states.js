// Capture the bonus modal at each toggle state (OFF / ON) on S23 Ultra dark
// to verify the visibility fix preserves layout stability.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, '..', 'captures', 'bonus-states');
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) fs.unlinkSync(path.join(OUT, f));

(async () => {
  const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'state-snapshot.json'), 'utf8'));
  const seed = { S: fixture.S || fixture, BILLS: fixture.BILLS || [] };

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 }, deviceScaleFactor: 3.5,
    isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();
  try { await page.emulateMedia({ colorScheme: 'dark' }); } catch (_) {}
  await ctx.addInitScript((args) => {
    try { localStorage.setItem('slyght_v5', JSON.stringify(args.seed)); } catch (_) {}
    try { localStorage.setItem('slyght_payday_canvas_seen', '1'); } catch (_) {}
    try {
      const raw = localStorage.getItem('slyght_v5');
      const data = JSON.parse(raw);
      data.S.lastOpenDate = new Date().toISOString().slice(0, 10);
      localStorage.setItem('slyght_v5', JSON.stringify(data));
    } catch (_) {}
  }, { seed });

  await page.goto('http://localhost:4567/slyght/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page.waitForTimeout(600);

  await page.evaluate(() => {
    if (S.activePlan && S.activePlan.income && S.activePlan.income.bonus) {
      S.activePlan.income.bonus.included = false;
      S.activePlan.income.bonus.amount = 0;
      save();
    }
    openPaydayPlan();
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => openEditPaydayBonus());
  await page.waitForTimeout(600);

  // OFF state
  await page.screenshot({ path: path.join(OUT, 'state-1-OFF.png') });

  // Toggle ON
  await page.evaluate(() => {
    const toggle = document.getElementById('bonus-include');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'state-2-ON.png') });

  // Back to OFF
  await page.evaluate(() => {
    const toggle = document.getElementById('bonus-include');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'state-3-OFF-again.png') });

  // Toggle ON one more
  await page.evaluate(() => {
    const toggle = document.getElementById('bonus-include');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'state-4-ON-again.png') });

  // Also capture the section's computed style
  const styles = await page.evaluate(() => {
    const section = document.getElementById('bonus-amount-section');
    if (!section) return null;
    const cs = getComputedStyle(section);
    const rect = section.getBoundingClientRect();
    return {
      visibility: cs.visibility, opacity: cs.opacity, display: cs.display,
      width: rect.width, height: rect.height, top: rect.top,
    };
  });
  console.log('Section computed style after final ON:', JSON.stringify(styles));

  await browser.close();
  console.log('Captured states to:', OUT);
})();
