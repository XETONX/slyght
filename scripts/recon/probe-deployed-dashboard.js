// Render the DEPLOYED slyght dashboard against John's live state.
// Closest proxy to "what John sees on his phone." Captures screenshots
// at 380px (his Galaxy S23 Ultra logical width) at boot + after settle,
// plus the snap.derived numbers + survivalMode trace, to determine
// whether the phone-symptom is a cache race (resolves on hard refresh)
// or a real persistence/state bug.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ORACLE_PATH = path.resolve(__dirname, '..', '..', 'tests', 'state-dump', 'live-2026-05-21.json');
const DEPLOYED_URL = 'https://xetonx.github.io/slyght/index.html';
const OUT_DIR = path.resolve(__dirname, '..', '..', 'tests', 'visual-captures', 'recon');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

(async () => {
  const oracle = JSON.parse(fs.readFileSync(ORACLE_PATH, 'utf8'));
  const seed = { S: oracle.S || {}, BILLS: oracle.BILLS || [] };

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 380, height: 800 },
    deviceScaleFactor: 3,
    serviceWorkers: 'block',  // don't let sw.js interfere with this probe
  });
  const page = await context.newPage();

  await context.addInitScript((s) => {
    try { localStorage.setItem('slyght_v5', JSON.stringify(s)); } catch (_) {}
    for (let i = 0; i < 40; i++) {
      try { localStorage.setItem('slyght_seeded_v' + i, '1'); } catch (_) {}
    }
    try { localStorage.setItem('slyght_bills_reset_month', '2026-5'); } catch (_) {}
  }, seed);

  // Capture early render (before MODEL fully computes — to catch any flash)
  await page.goto(DEPLOYED_URL, { waitUntil: 'domcontentloaded' });

  // Capture during boot — t+200ms (after splash but possibly before MODEL settle)
  await page.waitForTimeout(200);
  try { await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); }); } catch (_) {}
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT_DIR, 'deployed-boot-t500.png'), fullPage: false });

  const earlyState = await page.evaluate(() => {
    return {
      survivalMode: (typeof S !== 'undefined') ? S.survivalMode : null,
      survivalBanner: document.querySelector('#sv-mode-banner, .sv-banner, [data-survival-mode]')?.textContent || null,
      heroText: document.querySelector('#h-bal, .hero-balance, [data-hero]')?.textContent || null,
      modelDefined: typeof MODEL !== 'undefined',
      brainDefined: typeof BRAIN !== 'undefined',
      isPaidInCyclePresent: typeof BRAIN !== 'undefined' && BRAIN.bills && typeof BRAIN.bills.isPaidInCycle === 'function',
      safeToSpendPresent: (() => {
        try { const snap = BRAIN.plan.getSnapshot(); return typeof snap.derived?.safeToSpendHeadroom === 'number'; }
        catch (_) { return false; }
      })(),
    };
  });

  // Wait for full settle
  await page.waitForFunction(() =>
    typeof BRAIN !== 'undefined' && BRAIN.plan && typeof BRAIN.plan.getSnapshot === 'function'
    && BRAIN.bills && typeof BRAIN.bills.isPaidInCycle === 'function',
    { timeout: 10000 }
  );
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT_DIR, 'deployed-settled-t1500.png'), fullPage: false });

  const settled = await page.evaluate(() => {
    const snap = BRAIN.plan.getSnapshot();
    return {
      survivalMode: S.survivalMode,
      bal: S.bal,
      snapBillsUnpaid: snap.bills.unpaidTotal,
      snapDailyLivingTotal: snap.dailyLiving.plannedTotal,
      safeToSpendHeadroom: snap.derived.safeToSpendHeadroom,
      cashflowReceipt: snap.derived.cashflowReceipt,
      // Hero element — what user sees
      heroText: document.querySelector('#h-bal, .hero-balance')?.textContent || 'no-hero-element',
      bodyTextSample: document.body.textContent?.slice(0, 500),
    };
  });

  // Fullpage screenshot
  await page.screenshot({ path: path.join(OUT_DIR, 'deployed-dashboard-full.png'), fullPage: true });

  await browser.close();

  console.log(JSON.stringify({
    deployedURL: DEPLOYED_URL,
    oracleFile: ORACLE_PATH,
    earlyState,
    settled: {
      survivalMode: settled.survivalMode,
      bal: settled.bal,
      snapBillsUnpaid: settled.snapBillsUnpaid,
      snapDailyLivingTotal: settled.snapDailyLivingTotal,
      safeToSpendHeadroom: settled.safeToSpendHeadroom,
      cashflowReceipt: settled.cashflowReceipt,
      heroDisplayed: settled.heroText,
    },
    screenshots: [
      path.join(OUT_DIR, 'deployed-boot-t500.png'),
      path.join(OUT_DIR, 'deployed-settled-t1500.png'),
      path.join(OUT_DIR, 'deployed-dashboard-full.png'),
    ],
  }, null, 2));
})().catch(err => { console.error(err); process.exit(1); });
