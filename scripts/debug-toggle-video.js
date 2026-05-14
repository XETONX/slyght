// Record video while flipping the bonus toggle ON/OFF rapidly.
// Video records at native fps so any flash <100ms is captured.
// Then extract frames from the video for visual inspection.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const VIDEO_DIR = path.resolve(__dirname, '..', 'captures', 'bonus-video');
fs.mkdirSync(VIDEO_DIR, { recursive: true });
for (const f of fs.readdirSync(VIDEO_DIR)) fs.unlinkSync(path.join(VIDEO_DIR, f));

(async () => {
  const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'state-snapshot.json'), 'utf8'));
  const seed = { S: fixture.S || fixture, BILLS: fixture.BILLS || [] };

  const browser = await chromium.launch();
  // r79: match John's actual device — Galaxy S23 Ultra, Android 14, dark mode
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 3.5,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    colorScheme: 'dark',
    recordVideo: { dir: VIDEO_DIR, size: { width: 412, height: 915 } },
  });
  const page = await ctx.newPage();
  try { await page.emulateMedia({ colorScheme: 'dark' }); } catch (_) {}
  await ctx.addInitScript((args) => {
    try { localStorage.setItem('slyght_v5', JSON.stringify(args.seed)); } catch (_) {}
    try { localStorage.setItem('slyght_payday_canvas_seen', '1'); } catch (_) {}
    // Suppress EOD recon by setting lastOpenDate to today
    try {
      const raw = localStorage.getItem('slyght_v5');
      const data = JSON.parse(raw);
      data.S.lastOpenDate = new Date().toISOString().slice(0, 10);
      localStorage.setItem('slyght_v5', JSON.stringify(data));
    } catch (_) {}
  }, { seed });

  page.on('console', m => {
    const t = m.text();
    if (!t.includes('ERR_FAILED')) console.log('[browser]', t);
  });

  await page.goto('http://localhost:4567/slyght/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page.waitForTimeout(500);

  // Install heavy instrumentation BEFORE the test starts
  await page.evaluate(() => {
    window.__log = [];
    const log = (label, extra) => window.__log.push({ ts: performance.now(), label, extra: extra || '' });

    // Hook every render function
    ['renderPaydayPlanRoot', 'renderAll', 'renderSurvivalBanner', 'renderPlanActiveBanner', 'renderPlanMode'].forEach(name => {
      const orig = window[name];
      if (typeof orig === 'function') {
        window[name] = function (...args) {
          log(name + '.call', new Error().stack.split('\n')[2]);
          return orig.apply(this, args);
        };
      }
    });
    // Hook modal lifecycle
    const origOpen = EDIT_MODAL.openCustom;
    EDIT_MODAL.openCustom = function (cfg) { log('openCustom', cfg.title); return origOpen.call(this, cfg); };
    const origClose = EDIT_MODAL.close;
    EDIT_MODAL.close = function () { log('close'); return origClose.call(this); };
    const origAttempt = EDIT_MODAL.attemptSave;
    EDIT_MODAL.attemptSave = function () { log('attemptSave.start'); const r = origAttempt.call(this); log('attemptSave.end'); return r; };

    // Hook setBonus
    const origSetBonus = BRAIN.plan.setBonus;
    BRAIN.plan.setBonus = function (p, s) { log('setBonus', JSON.stringify(p)); return origSetBonus.call(this, p, s); };

    // Watch EVERY visible element for class/style changes
    const watchEl = (sel) => {
      document.querySelectorAll(sel).forEach(el => {
        const obs = new MutationObserver((muts) => {
          muts.forEach(m => {
            log('MUT ' + (el.id || el.className.slice(0, 30)),
                m.attributeName + '=' + (m.attributeName === 'class' ? el.className : (m.attributeName === 'style' ? el.style.cssText.slice(0, 80) : '?')));
          });
        });
        obs.observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
      });
    };
    watchEl('#edit-modal, #pg-payday-plan, .edit-modal-card, #payday-root-content, .recon-overlay, .modal-overlay');
    // Also watch innerHTML changes on payday-root-content
    const root = document.getElementById('payday-root-content');
    if (root) {
      const obs2 = new MutationObserver((muts) => log('MUT payday-root-content children', muts.length));
      obs2.observe(root, { childList: true, subtree: false });
    }
  });

  // Open canvas + bonus modal
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
  await page.waitForTimeout(800);

  console.log('\n=== Starting toggle hammer test (10 flips at 250ms intervals) ===\n');
  await page.evaluate(() => { window.__log = []; });

  // Flip toggle 10 times rapidly
  for (let i = 0; i < 10; i++) {
    await page.evaluate((iteration) => {
      const toggle = document.getElementById('bonus-include');
      if (!toggle) return;
      toggle.checked = !toggle.checked;
      toggle.dispatchEvent(new Event('input', { bubbles: true }));
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('TOGGLE flip #' + iteration + ' → checked=' + toggle.checked);
    }, i);
    await page.waitForTimeout(250);
  }

  console.log('\n=== Events during toggle hammer ===');
  const events = await page.evaluate(() => window.__log.slice());
  events.forEach(e => console.log(`  +${e.ts.toFixed(0).padStart(6)}ms  ${e.label.padEnd(40)}  ${e.extra}`));

  await page.waitForTimeout(500);
  await ctx.close();
  await browser.close();

  // List the video
  console.log('\nVideo saved to:', VIDEO_DIR);
  const videos = fs.readdirSync(VIDEO_DIR);
  videos.forEach(v => console.log('  ' + v + ' (' + (fs.statSync(path.join(VIDEO_DIR, v)).size / 1024).toFixed(0) + ' KB)'));
})();
