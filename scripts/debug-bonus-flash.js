// Reproduce John's bonus-toggle flash bug: open bonus modal, toggle
// included=true, watch for any MutationObserver fire on #payday-root-content,
// .edit-modal, or anything that could explain seeing the dashboard.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

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
  page.on('console', m => console.log('[browser]', m.text()));

  await page.goto('http://localhost:4567/slyght/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page.waitForTimeout(500);

  // Install instrumentation: wrap renderPaydayPlanRoot, EDIT_MODAL.open/close,
  // BRAIN.plan.setBonus to log every call. Also mutation-observe the canvas.
  await page.evaluate(() => {
    window.__events = [];
    const log = (label, extra) => window.__events.push({ ts: performance.now(), label, extra });
    if (typeof renderPaydayPlanRoot === 'function') {
      const orig = renderPaydayPlanRoot;
      window.renderPaydayPlanRoot = function (...a) { log('renderPaydayPlanRoot.call'); return orig.apply(this, a); };
    }
    if (typeof renderAll === 'function') {
      const orig = renderAll;
      window.renderAll = function (...a) { log('renderAll.call'); return orig.apply(this, a); };
    }
    const origOpen = EDIT_MODAL.openCustom;
    EDIT_MODAL.openCustom = function (cfg) { log('EDIT_MODAL.openCustom', cfg.title); return origOpen.call(this, cfg); };
    const origClose = EDIT_MODAL.close;
    EDIT_MODAL.close = function () { log('EDIT_MODAL.close'); return origClose.call(this); };
    const origSetBonus = BRAIN.plan.setBonus;
    BRAIN.plan.setBonus = function (p, s) { log('BRAIN.plan.setBonus', JSON.stringify(p)); return origSetBonus.call(this, p, s); };

    // Mutation observer on the canvas root
    const root = document.getElementById('payday-root-content');
    if (root) {
      const obs = new MutationObserver((muts) => {
        log('MUTATION canvas-root', muts.length + ' mutations');
      });
      obs.observe(root, { childList: true, subtree: true, attributes: true });
    }
    // Class observer on edit-modal
    const modal = document.getElementById('edit-modal');
    if (modal) {
      const obs2 = new MutationObserver((muts) => {
        muts.forEach(m => {
          if (m.attributeName === 'class') {
            log('MUTATION edit-modal class', modal.className);
          }
        });
      });
      obs2.observe(modal, { attributes: true });
    }
  });

  // Open the payday plan canvas
  await page.evaluate(() => openPaydayPlan());
  await page.waitForTimeout(500);

  // Make sure bonus is OFF in initial state so we can flip it on
  await page.evaluate(() => {
    if (S.activePlan && S.activePlan.income && S.activePlan.income.bonus) {
      S.activePlan.income.bonus.included = false;
      S.activePlan.income.bonus.amount = 0;
      save();
      renderPaydayPlanRoot();
    }
    window.__events = [];  // reset
  });
  await page.waitForTimeout(300);

  // Open the bonus modal
  await page.evaluate(() => openEditPaydayBonus());
  await page.waitForTimeout(500);

  console.log('\n=== Pre-flip events ===');
  const preEvents = await page.evaluate(() => window.__events.slice());
  preEvents.forEach(e => console.log(`  +${e.ts.toFixed(1)}ms  ${e.label}  ${e.extra || ''}`));
  await page.evaluate(() => { window.__events = []; });

  // Flip the toggle
  console.log('\n=== Flipping bonus-include checkbox ===');
  const flipResult = await page.evaluate(() => {
    const toggle = document.getElementById('bonus-include');
    if (!toggle) return { ok: false, reason: 'no toggle' };
    toggle.checked = true;
    toggle.dispatchEvent(new Event('input', { bubbles: true }));
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, toggleChecked: toggle.checked };
  });
  console.log('Flip:', flipResult);

  await page.waitForTimeout(200);

  console.log('\n=== Events DURING flip (200ms window) ===');
  const flipEvents = await page.evaluate(() => window.__events.slice());
  flipEvents.forEach(e => console.log(`  +${e.ts.toFixed(1)}ms  ${e.label}  ${e.extra || ''}`));

  // ALSO try the SAVE flow
  console.log('\n=== Tapping SAVE ===');
  await page.evaluate(() => { window.__events = []; });
  await page.evaluate(() => EDIT_MODAL.attemptSave());
  await page.waitForTimeout(300);
  const saveEvents = await page.evaluate(() => window.__events.slice());
  saveEvents.forEach(e => console.log(`  +${e.ts.toFixed(1)}ms  ${e.label}  ${e.extra || ''}`));

  await browser.close();
})();
