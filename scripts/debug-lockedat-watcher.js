// Find EXACTLY where lockedAt becomes null on reload.
// Inject early script that defines getter/setter on S.activePlan.lockedAt.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

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
  await ctx.addInitScript((args) => {
    try { localStorage.setItem('slyght_v5', JSON.stringify(args.seed)); } catch (_) {}
    try { localStorage.setItem('slyght_payday_canvas_seen', '1'); } catch (_) {}
    try {
      const data = JSON.parse(localStorage.getItem('slyght_v5'));
      data.S.lastOpenDate = new Date().toISOString().slice(0, 10);
      // Pre-set lockedAt + ticks so we can observe what wipes them
      data.S.activePlan.lockedAt = Date.now();
      data.S.activePlan.ticks = data.S.activePlan.ticks || {};
      data.S.activePlan.ticks.bill = data.S.activePlan.ticks.bill || {};
      data.S.activePlan.ticks.bill['Google One'] = { tickedAt: Date.now(), txnTs: null };
      data.S.activePlan.income.bonus = { amount: 500, included: true, status: 'expected' };
      localStorage.setItem('slyght_v5', JSON.stringify(data));
    } catch (_) {}

    // Inject watcher AS EARLY AS POSSIBLE
    window.__lockedAtWrites = [];
    // Patch Object.defineProperty AND direct sets via Proxy isn't easy here.
    // Instead, intercept the localStorage write side. EVERY save() call writes
    // localStorage. Hook localStorage.setItem.
    const origSet = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (key, value) {
      if (key === 'slyght_v5') {
        try {
          const parsed = JSON.parse(value);
          const newLock = parsed.S && parsed.S.activePlan && parsed.S.activePlan.lockedAt;
          window.__lockedAtWrites.push({
            ts: performance.now(),
            lockedAt: newLock,
            ticks: parsed.S && parsed.S.activePlan && parsed.S.activePlan.ticks && parsed.S.activePlan.ticks.bill ? Object.keys(parsed.S.activePlan.ticks.bill).length : 0,
            bonus: parsed.S && parsed.S.activePlan && parsed.S.activePlan.income && parsed.S.activePlan.income.bonus && parsed.S.activePlan.income.bonus.included,
            stack: new Error().stack.split('\n').slice(2, 8).join(' | ').slice(0, 600),
          });
        } catch (_) {}
      }
      return origSet(key, value);
    };
  }, { seed });

  await page.goto('http://localhost:4567/slyght/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page.waitForTimeout(1500);

  const writes = await page.evaluate(() => window.__lockedAtWrites || []);
  console.log('\n=== localStorage writes during boot ===');
  writes.forEach((w, i) => {
    console.log(`#${i} +${w.ts.toFixed(0).padStart(5)}ms  lockedAt=${w.lockedAt} ticks=${w.ticks} bonus=${w.bonus}`);
    console.log(`     stack: ${w.stack}`);
  });

  await browser.close();
})();
