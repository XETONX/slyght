// Daily-use mock sweep: simulate John's real day-in-the-life flow + multiple
// balance scenarios. Capture every surface he touches so we can grade
// visual quality vs PLAN-mode style.
//
// Scenarios captured:
//   A. Balance scenarios — $11.72 current, $500, $1500, $4000 (Max/day reactions)
//   B. Quick Log flow — open modal, see categories
//   C. After logging 3 txns — dashboard + analysis + bills tab
//   D. Edit-txn / recategorise flow
//   E. Tap a recent-spending row for detail
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.resolve(__dirname, '..', 'docs', 'reviews', 'sweep-2026-05-14-daily-use', 'input');
fs.mkdirSync(OUT_DIR, { recursive: true });

async function shot(page, name, scrollY) {
  if (scrollY != null) {
    await page.evaluate((y) => {
      const s = document.querySelector('.screen.active');
      if (s) s.scrollTop = y;
      window.scrollTo(0, y);
    }, scrollY);
    await page.waitForTimeout(250);
  }
  await page.screenshot({ path: path.join(OUT_DIR, name), fullPage: false });
  console.log('  ✓', name);
}

async function setupPage(seed) {
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
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page.waitForSelector('#splash-screen', { state: 'hidden' }).catch(() => {});
  await page.waitForTimeout(500);
  return { browser, page };
}

(async () => {
  const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'state-snapshot.json'), 'utf8'));

  // === SCENARIO A: Balance scenarios ===
  console.log('\n[A] Balance scenarios');
  for (const [name, bal] of [['low-11', 11.72], ['mid-500', 500], ['comfortable-1500', 1500], ['flush-4000', 4000]]) {
    const seed = JSON.parse(JSON.stringify(fixture));
    seed.S = seed.S || seed;
    seed.S.bal = bal;
    const { browser, page } = await setupPage(seed);
    await page.evaluate(() => { if (typeof goPage === 'function') goPage('pg-dash'); });
    await page.waitForTimeout(500);
    await shot(page, `A1-balance-${name}-top.png`, 0);
    await shot(page, `A2-balance-${name}-mid.png`, 600);
    await browser.close();
  }

  // === SCENARIO B: Quick Log flow ===
  console.log('\n[B] Quick Log flow');
  {
    const seed = JSON.parse(JSON.stringify(fixture));
    const { browser, page } = await setupPage(seed);
    await page.evaluate(() => { if (typeof goPage === 'function') goPage('pg-dash'); });
    await page.waitForTimeout(400);
    await shot(page, 'B1-dashboard-before-log.png', 0);
    // Tap the green + (Quick Log) button — find by FAB class or onclick
    await page.evaluate(() => {
      const fab = document.querySelector('.nav-fab, [onclick*="openQuickLog"], #nav-add');
      if (fab) fab.click();
      else if (typeof openQuickLog === 'function') openQuickLog();
    });
    await page.waitForTimeout(500);
    await shot(page, 'B2-quicklog-opened.png', 0);
  }

  // === SCENARIO C: After-logging state ===
  console.log('\n[C] After-logging state');
  {
    const seed = JSON.parse(JSON.stringify(fixture));
    seed.S = seed.S || seed;
    seed.S.bal = 500;  // give him room to log
    seed.S.txns = (seed.S.txns || []).concat([
      { ts: Date.now() - 3600000, amt: 6.50, note: 'Coffee', cat: 'Food / Coffee', income: false, _balAffected: true },
      { ts: Date.now() - 2700000, amt: 45.00, note: 'Petrol top-up', cat: 'Transport', income: false, _balAffected: true },
      { ts: Date.now() - 1800000, amt: 18.99, note: 'Spotify', cat: 'Subscription', income: false, _balAffected: true },
    ]);
    const { browser, page } = await setupPage(seed);
    await page.evaluate(() => { if (typeof goPage === 'function') goPage('pg-dash'); });
    await page.waitForTimeout(500);
    await shot(page, 'C1-dashboard-after-3logs.png', 0);
    await shot(page, 'C2-dashboard-recent-spending.png', 800);
    await page.evaluate(() => { if (typeof goPage === 'function') goPage('pg-spend'); });
    await page.waitForTimeout(500);
    await shot(page, 'C3-analysis-after-logs.png', 0);
    await shot(page, 'C4-analysis-categories.png', 500);
    await page.evaluate(() => { if (typeof goPage === 'function') goPage('pg-cal'); });
    await page.waitForTimeout(500);
    await shot(page, 'C5-bills-tab-top.png', 0);
    await shot(page, 'C6-bills-tab-due.png', 700);
    await browser.close();
  }

  // === SCENARIO D: Edit txn flow ===
  console.log('\n[D] Edit txn flow');
  {
    const seed = JSON.parse(JSON.stringify(fixture));
    seed.S = seed.S || seed;
    const { browser, page } = await setupPage(seed);
    await page.evaluate(() => { if (typeof goPage === 'function') goPage('pg-dash'); });
    await page.waitForTimeout(500);
    // Find the first recent spending row + tap it
    const tapped = await page.evaluate(() => {
      const rows = document.querySelectorAll('[onclick*="openEditTxn"], [onclick*="editTxn"], .recent-txn-row');
      if (rows.length > 0) { rows[0].click(); return true; }
      return false;
    });
    console.log('  Recent row tapped:', tapped);
    await page.waitForTimeout(500);
    await shot(page, 'D1-edit-txn-modal.png', 0);
    await browser.close();
  }

  // === SCENARIO E: Survival banner across modes ===
  console.log('\n[E] Survival banner modes');
  for (const [name, bal] of [['critical', 5], ['survival', 80], ['tight', 300], ['cautious', 800], ['normal', 2500]]) {
    const seed = JSON.parse(JSON.stringify(fixture));
    seed.S = seed.S || seed;
    seed.S.bal = bal;
    const { browser, page } = await setupPage(seed);
    await page.evaluate(() => { if (typeof goPage === 'function') goPage('pg-dash'); });
    await page.waitForTimeout(500);
    await shot(page, `E-survival-${name}.png`, 0);
    await browser.close();
  }

  console.log('\n=== Daily-use sweep complete ===');
  console.log('Frames:', OUT_DIR);
})();
