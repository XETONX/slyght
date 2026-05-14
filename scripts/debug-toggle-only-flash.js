// Reproduce the flash that happens during TOGGLE FLIP (not save).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, '..', 'captures', 'bonus-flash-toggle');
fs.mkdirSync(OUT, { recursive: true });
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

  page.on('console', m => { const t = m.text(); if (!t.includes('ERR_FAILED')) console.log('[browser]', t); });

  await page.goto('http://localhost:4567/slyght/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page.waitForTimeout(500);

  // Suppress EOD recon modal so we can see if there's a bonus-modal-specific flash
  await page.evaluate(() => {
    // Dismiss EOD by marking today's check accepted
    try { S.eodLastAccepted = Date.now(); save(); } catch (_) {}
    // Also try forcibly hiding the eod-recon-modal if it pops
    const eod = document.getElementById('eod-recon-modal');
    if (eod) eod.style.display = 'none !important';
  });

  await page.evaluate(() => openPaydayPlan());
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    if (S.activePlan && S.activePlan.income && S.activePlan.income.bonus) {
      S.activePlan.income.bonus.included = false;
      S.activePlan.income.bonus.amount = 0;
      save();
      renderPaydayPlanRoot();
    }
  });
  await page.waitForTimeout(300);

  // Install observer + event log
  await page.evaluate(() => {
    window.__events = [];
    const log = (label, extra) => window.__events.push({ ts: performance.now(), label, extra });
    const orig1 = renderPaydayPlanRoot; window.renderPaydayPlanRoot = function(...a) { log('renderPaydayPlanRoot'); return orig1.apply(this, a); };
    const orig2 = renderAll; window.renderAll = function(...a) { log('renderAll'); return orig2.apply(this, a); };
    const orig3 = EDIT_MODAL.close; EDIT_MODAL.close = function() { log('EDIT_MODAL.close'); return orig3.call(this); };
    const orig4 = BRAIN.plan.setBonus; BRAIN.plan.setBonus = function(p, s) { log('setBonus', JSON.stringify(p)); return orig4.call(this, p, s); };
    const root = document.getElementById('payday-root-content');
    if (root) {
      const obs = new MutationObserver((muts) => { log('MUT canvas-root', muts.length); });
      obs.observe(root, { childList: true, subtree: true });
    }
    const modal = document.getElementById('edit-modal');
    if (modal) {
      const obs2 = new MutationObserver((muts) => {
        muts.forEach(m => { if (m.attributeName === 'class') log('MUT edit-modal class', modal.className); });
      });
      obs2.observe(modal, { attributes: true });
    }
    // Also observe ALL modal-class elements to catch other modals popping
    document.querySelectorAll('.recon-overlay, .modal-overlay, .edit-modal').forEach(el => {
      const id = el.id;
      const obs3 = new MutationObserver((muts) => {
        muts.forEach(m => { if (m.attributeName === 'class' || m.attributeName === 'style') log('MUT ' + id, m.attributeName + '=' + (el.className || el.style.display)); });
      });
      obs3.observe(el, { attributes: true });
    });
  });

  await page.evaluate(() => openEditPaydayBonus());
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.__events = []; });

  console.log('Bonus modal open. Now flipping toggle in 50ms...');
  const t0 = Date.now();
  // Rapid capture during the toggle flip
  const captureLoop = (async () => {
    for (let i = 0; i < 20; i++) {
      const t = Date.now() - t0;
      try {
        await page.screenshot({ path: path.join(OUT, `frame-${String(i).padStart(2,'0')}-${String(t).padStart(4,'0')}ms.png`), fullPage: false });
      } catch (e) {}
    }
  })();

  setTimeout(() => {
    page.evaluate(() => {
      const toggle = document.getElementById('bonus-include');
      if (!toggle) return;
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
    }).catch(() => {});
  }, 10);

  await captureLoop;

  console.log('\n=== Events during toggle flip ===');
  const events = await page.evaluate(() => window.__events.slice());
  events.forEach(e => console.log(`  +${e.ts.toFixed(1)}ms  ${e.label}  ${e.extra || ''}`));

  await browser.close();
})();
