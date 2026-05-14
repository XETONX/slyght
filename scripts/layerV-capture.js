// Layer V Capture — At-Rest Visual Audit
// Galaxy S23 Ultra device profile (412x915 @ DPR 3.5).
//
// Usage:
//   node scripts/layerV-capture.js                       # defaults: today's date, GH Pages
//   node scripts/layerV-capture.js --local               # local serve on :4567 (run `npm run serve` first)
//   node scripts/layerV-capture.js --date 2026-05-12 --frozen "2026-05-12T22:00:00+10:00"
//   node scripts/layerV-capture.js --url http://other/   # explicit URL
//   Outputs: captures/slyght-layerV-<date>-NN-slug.png + manifest.json

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
function getArg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
}
const useLocal = args.includes('--local');
const todayISO = new Date().toISOString().slice(0, 10);

const FIXTURE_PATH = path.resolve(__dirname, '..', 'state-snapshot.json');
const DATE_TAG = getArg('date', todayISO);
const FROZEN_ISO = getArg('frozen', `${DATE_TAG}T22:00:00+10:00`);
const LIVE_URL = useLocal
  ? `http://localhost:${getArg('port', '4567')}/slyght/`
  : getArg('url', 'https://xetonx.github.io/slyght/');
const OUT_DIR = path.resolve(__dirname, '..', 'captures');

console.log(`Layer V — date=${DATE_TAG}  frozen=${FROZEN_ISO}  url=${LIVE_URL}`);

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

function buildSlyghtV5(fx) {
  const S = Object.assign({}, fx.S || {});
  if (fx.paidBills && !S.paidBills) S.paidBills = fx.paidBills;
  return { S, BILLS: fx.BILLS || [] };
}

const manifest = [];
// r64: UI→code attribution map. Each shoot() call also records the active
// screen's primary container + a list of buttons / clickable rows present in
// that screen. Persisted alongside manifest.json so future-me can reverse-
// lookup a capture → the elements present → the onclick handlers → grep the
// source. Saves the "where in the 24k-line file does this render?" search.
const uiCodeMap = [];

async function attributeUi(page, slug) {
  try {
    return await page.evaluate(() => {
      const summary = (el) => {
        if (!el) return null;
        return {
          tag: el.tagName,
          id: el.id || null,
          classes: typeof el.className === 'string' ? el.className.slice(0, 80) : null,
          ariaLabel: el.getAttribute && el.getAttribute('aria-label'),
          onclick: el.getAttribute && (el.getAttribute('onclick') || '').slice(0, 120),
          dataLabel: el.dataset && el.dataset.label || null,
          text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
        };
      };
      const activeScreen = document.querySelector('.screen.active') || document.body;
      const allClickables = Array.from(activeScreen.querySelectorAll('[onclick], button, a, [role="button"]'));
      return {
        activeScreenId: activeScreen.id || null,
        activeModal: (() => {
          const m = document.querySelector('.modal-overlay.show, .edit-modal.show, .recon-overlay.show');
          return m ? { id: m.id || null, classes: typeof m.className === 'string' ? m.className.slice(0, 80) : null } : null;
        })(),
        clickables: allClickables.slice(0, 40).map(summary),
        clickableCount: allClickables.length,
      };
    });
  } catch (e) {
    return { error: e.message };
  }
}

async function shoot(page, idx, slug, note = '') {
  const nn = String(idx).padStart(2, '0');
  const file = `slyght-layerV-${DATE_TAG}-${nn}-${slug}.png`;
  const fullPath = path.join(OUT_DIR, file);
  try {
    // Bundle 28.x: fullPage:true so captures show full document scrollHeight,
    // not just viewport. Fixes OPEN-BUGS #33 (Settings + Bills tail content
    // invisible to visual regression — false negatives on intentional changes).
    await page.screenshot({ path: fullPath, fullPage: true });
    const size = fs.statSync(fullPath).size;
    const attribution = await attributeUi(page, slug);
    manifest.push({ idx, slug, file, status: 'ok', size, note });
    uiCodeMap.push({ idx, slug, file, ...attribution });
    console.log(`  [${nn}] ${slug}  (${(size/1024).toFixed(0)} KB)${note ? '  — ' + note : ''}${attribution.clickableCount !== undefined ? '  · ' + attribution.clickableCount + ' tappables' : ''}`);
  } catch (e) {
    manifest.push({ idx, slug, file: null, status: 'fail', error: e.message, note });
    console.log(`  [${nn}] ${slug}  FAIL: ${e.message}`);
  }
}

// r64: zoom() screenshots a single element at higher effective DPR so detail
// is legible at desktop reading size. Use for hero subline math, debt-card
// bars, calendar legend, etc — anywhere the full-page shot is too small.
async function zoom(page, idx, slug, selector, note = '') {
  const nn = String(idx).padStart(2, '0');
  const file = `slyght-layerV-${DATE_TAG}-${nn}-zoom-${slug}.png`;
  const fullPath = path.join(OUT_DIR, file);
  try {
    const handle = await page.$(selector);
    if (!handle) throw new Error('selector not found: ' + selector);
    await handle.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    await handle.screenshot({ path: fullPath, scale: 'device' });
    const size = fs.statSync(fullPath).size;
    manifest.push({ idx, slug: 'zoom-' + slug, file, status: 'ok', size, selector, note });
    console.log(`  [${nn}z] zoom ${slug}  (${(size/1024).toFixed(0)} KB)  selector=${selector}`);
  } catch (e) {
    manifest.push({ idx, slug: 'zoom-' + slug, file: null, status: 'fail', selector, error: e.message, note });
    console.log(`  [${nn}z] zoom ${slug}  FAIL: ${e.message}`);
  }
}

async function step(name, fn) {
  try {
    await fn();
    return true;
  } catch (e) {
    console.log(`  ! step "${name}" failed: ${e.message}`);
    manifest.push({ status: 'step-fail', step: name, error: e.message });
    return false;
  }
}

(async () => {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
  const seed = buildSlyghtV5(fixture);

  console.log('Launching Chromium...');
  const browser = await chromium.launch();

  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 3.5,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date(FROZEN_ISO) });

  await ctx.addInitScript((args) => {
    try { localStorage.setItem('slyght_v5', JSON.stringify(args.seed)); } catch (_) {}
    try { localStorage.setItem('slyght_seeded_v13', '1'); } catch (_) {}
    try { localStorage.setItem('slyght_seeded_v12', '1'); } catch (_) {}
    try { localStorage.setItem('slyght_seeded_v11', '1'); } catch (_) {}
    try { localStorage.setItem('slyght_bills_reset_month', args.monthKey); } catch (_) {}
  }, { seed, monthKey: '2026-5' });

  console.log(`Navigating to ${LIVE_URL} ...`);
  await page.goto(LIVE_URL, { waitUntil: 'networkidle', timeout: 45000 });
  await page.evaluate(() => document.fonts.ready);

  // Viewport assertion + deploy/build fingerprint (per spec — STOP if wrong)
  const vp = await page.evaluate(() => {
    function sha1Of(str) {
      // tiny deterministic short-hash so two captures of "same html" produce same tag
      let h = 0; for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
      return (h >>> 0).toString(16);
    }
    const titleEl = document.querySelector('title');
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      hasPaidOnly: !!Array.from(document.styleSheets).some(s => {
        try { return Array.from(s.cssRules || []).some(r => /\.cal-day\.paid-only/.test(r.cssText || '')); }
        catch (_) { return false; }
      }),
      htmlLen: document.documentElement.outerHTML.length,
      htmlHash: sha1Of(document.documentElement.outerHTML.slice(0, 50000)),
      titleText: titleEl ? titleEl.textContent : null,
      brainPresent: typeof window.BRAIN !== 'undefined',
      brainBubbles: typeof window.BRAIN !== 'undefined' ? Object.keys(window.BRAIN || {}) : [],
    };
  });
  console.log('Viewport + build:', vp);
  manifest.push({ status: 'build-fingerprint', ...vp, frozen: FROZEN_ISO, url: LIVE_URL });
  if (vp.innerWidth !== 412) {
    console.error(`STOP: innerWidth ${vp.innerWidth} !== 412`);
    await browser.close();
    process.exit(2);
  }
  if (Math.abs(vp.devicePixelRatio - 3.5) > 0.01) {
    console.error(`STOP: devicePixelRatio ${vp.devicePixelRatio} !== 3.5`);
    await browser.close();
    process.exit(2);
  }
  if (!vp.hasPaidOnly) {
    console.warn('WARN: .cal-day.paid-only CSS not detected in styleSheets — proceeding anyway (may be inline-style only)');
  }

  // Dismiss splash
  await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page.waitForSelector('#splash-screen', { state: 'hidden' }).catch(() => {});
  await page.waitForTimeout(900);

  console.log('\n=== SECTION 1 — Dashboard ===');
  // 01 Dashboard top
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
  await shoot(page, 1, 'dashboard-top');

  // 02 Dashboard mid — find max-per-day or survival banner
  await step('scroll to mid', async () => {
    await page.evaluate(() => {
      const targets = ['#max-per-day', '#survival-banner', '#max-tile', '.max-tile', '[id*="max-day"]'];
      for (const sel of targets) {
        const el = document.querySelector(sel);
        if (el) { el.scrollIntoView({ block: 'center' }); return; }
      }
      window.scrollTo(0, 600);
    });
  });
  await page.waitForTimeout(250);
  await shoot(page, 2, 'dashboard-mid');

  // 03 Immediate debts section
  await step('scroll to debts', async () => {
    await page.evaluate(() => {
      const cands = Array.from(document.querySelectorAll('h2, h3, .card-title, .section-title, div'));
      const hit = cands.find(el => /immediate debts|debts/i.test((el.textContent || '').slice(0, 40)) && el.offsetHeight > 0);
      if (hit) hit.scrollIntoView({ block: 'start' });
      else window.scrollTo(0, 1000);
    });
  });
  await page.waitForTimeout(250);
  await shoot(page, 3, 'dashboard-immediate-debts');

  // 04 Recent spending
  await step('scroll to recent spending', async () => {
    await page.evaluate(() => {
      const cands = Array.from(document.querySelectorAll('h2, h3, .card-title, .section-title, div'));
      const hit = cands.find(el => /recent spending|recent transactions/i.test((el.textContent || '').slice(0, 60)) && el.offsetHeight > 0);
      if (hit) hit.scrollIntoView({ block: 'start' });
      else window.scrollTo(0, 1600);
    });
  });
  await page.waitForTimeout(250);
  await shoot(page, 4, 'dashboard-recent-spending');

  // 05 Bottom + nav
  await step('scroll to bottom', async () => {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  });
  await page.waitForTimeout(250);
  await shoot(page, 5, 'dashboard-bottom-nav');

  console.log('\n=== SECTION 2 — Bills ===');
  // 06 Bills calendar — May 2026
  await step('open bills tab', async () => {
    await page.evaluate(() => goPage('pg-cal'));
    await page.waitForTimeout(600);
    await page.evaluate(() => window.scrollTo(0, 0));
  });
  await page.waitForTimeout(400);
  const calLabel = await page.evaluate(() => (document.getElementById('cal-month-label') || {}).textContent || '');
  await shoot(page, 6, 'bills-calendar-may', `cal-month-label="${calLabel}"`);

  // 07 April
  await step('cal prev to april', async () => {
    await page.evaluate(() => calPrev());
    await page.waitForTimeout(400);
  });
  await shoot(page, 7, 'bills-calendar-april');

  // 08 June (from April: next twice → May, next → June)
  await step('cal next twice to june', async () => {
    await page.evaluate(() => calNext());
    await page.waitForTimeout(200);
    await page.evaluate(() => calNext());
    await page.waitForTimeout(400);
  });
  await shoot(page, 8, 'bills-calendar-june');

  // 09 Day detail — back to May, tap a day with a bill
  await step('back to may + tap bill day', async () => {
    await page.evaluate(() => calPrev());
    await page.waitForTimeout(400);
    // Find a calendar cell that has the dot (bill) and click it
    await page.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('#cal-grid .cal-day'));
      const billCell = cells.find(c => c.querySelector('.cal-day-amt') && !c.classList.contains('other-month'));
      if (billCell) billCell.click();
    });
    await page.waitForTimeout(500);
    const detail = await page.$('#cal-day-detail');
    if (detail) await detail.scrollIntoViewIfNeeded().catch(() => {});
  });
  await page.waitForTimeout(300);
  await shoot(page, 9, 'bills-calendar-day-detail');

  // 10 Bills list — Due Today
  await step('scroll to bills-grouped', async () => {
    await page.evaluate(() => {
      const el = document.getElementById('bills-grouped');
      if (el) el.scrollIntoView({ block: 'start' });
    });
  });
  await page.waitForTimeout(300);
  await shoot(page, 10, 'bills-list-due-today');

  // 11 This Week — scroll within bills-grouped
  await step('scroll to this week', async () => {
    await page.evaluate(() => window.scrollBy(0, 500));
  });
  await page.waitForTimeout(250);
  await shoot(page, 11, 'bills-list-this-week');

  // 12 Monthly Bills
  await step('scroll to monthly', async () => {
    await page.evaluate(() => {
      const headers = Array.from(document.querySelectorAll('#bills-grouped *'));
      const hit = headers.find(el => /monthly|this month|paid this month/i.test(el.textContent || ''));
      if (hit) hit.scrollIntoView({ block: 'start' });
      else window.scrollBy(0, 600);
    });
  });
  await page.waitForTimeout(250);
  await shoot(page, 12, 'bills-list-monthly');

  // 13 Dynamic Week Projection tile
  await step('scroll to projection tile', async () => {
    await page.evaluate(() => {
      const cands = Array.from(document.querySelectorAll('div, section'));
      const hit = cands.find(el => /spent so far|projected daily|week total projection|bills remaining/i.test((el.textContent || '').slice(0, 200)) && el.offsetHeight > 0 && el.offsetHeight < 500);
      if (hit) hit.scrollIntoView({ block: 'center' });
      else window.scrollBy(0, 400);
    });
  });
  await page.waitForTimeout(250);
  await shoot(page, 13, 'bills-week-projection');

  console.log('\n=== SECTION 3 — Plan mode ===');
  // 14 Plan mode top — back to dashboard, tap PLAN
  await step('open plan mode', async () => {
    await page.evaluate(() => goPage('pg-dash'));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    await page.evaluate(() => openPlanMode());
    await page.waitForTimeout(800);
  });
  await shoot(page, 14, 'plan-top');

  // 15 Provisions
  await step('scroll to provisions', async () => {
    await page.evaluate(() => {
      const cands = Array.from(document.querySelectorAll('#plan-content *'));
      const hit = cands.find(el => /provisions/i.test((el.textContent || '').slice(0, 80)) && el.offsetHeight > 0);
      if (hit) hit.scrollIntoView({ block: 'start' });
      else document.getElementById('plan-mode').scrollBy(0, 500);
    });
  });
  await page.waitForTimeout(300);
  await shoot(page, 15, 'plan-provisions');

  // 16 Goals
  await step('scroll to goals', async () => {
    await page.evaluate(() => {
      const cands = Array.from(document.querySelectorAll('#plan-content *'));
      const hit = cands.find(el => /your goals|goals/i.test((el.textContent || '').slice(0, 60)) && el.offsetHeight > 0);
      if (hit) hit.scrollIntoView({ block: 'start' });
    });
  });
  await page.waitForTimeout(300);
  await shoot(page, 16, 'plan-goals');

  // 17 Trips
  await step('scroll to trips', async () => {
    await page.evaluate(() => {
      const cands = Array.from(document.querySelectorAll('#plan-content *'));
      const hit = cands.find(el => /trips|darwin|china/i.test((el.textContent || '').slice(0, 80)) && el.offsetHeight > 0);
      if (hit) hit.scrollIntoView({ block: 'start' });
    });
  });
  await page.waitForTimeout(300);
  await shoot(page, 17, 'plan-trips');

  // 18 Add savings modal (China)
  await step('open add savings modal', async () => {
    const opened = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#plan-mode button, #plan-content button'));
      const hit = btns.find(b => /\+\s*add savings/i.test(b.textContent || ''));
      if (hit) { hit.click(); return true; }
      return false;
    });
    if (!opened) throw new Error('no "+ Add savings" button found');
    await page.waitForTimeout(700);
  });
  await shoot(page, 18, 'plan-add-savings-modal');

  // close add-savings modal before next step
  await step('close add-savings', async () => {
    const closed = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#plan-modal-overlay button, #plan-mode button'));
      const cancel = btns.find(b => /cancel|close|×/i.test((b.textContent || '').trim()));
      if (cancel) { cancel.click(); return true; }
      const overlay = document.getElementById('plan-modal-overlay');
      if (overlay) overlay.style.display = 'none';
      return false;
    });
    await page.waitForTimeout(400);
  });

  // 19 Edit trip modal — scope to trip-card context only (skip WRX edit pencil)
  await step('open edit trip modal', async () => {
    const opened = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#plan-mode button, #plan-content button'));
      const hit = btns.find(b => {
        const txt = (b.textContent || '').trim();
        if (!/edit budget|edit trip/i.test(txt)) return false;
        const ancestorHtml = (b.closest('div')?.outerHTML || '').slice(0, 600);
        if (/WRX|carsales|listed price/i.test(ancestorHtml)) return false;
        return true;
      });
      if (hit) { hit.click(); return true; }
      return false;
    });
    if (!opened) throw new Error('no edit-trip button found (after WRX-scope filter)');
    await page.waitForTimeout(700);
  });
  await shoot(page, 19, 'plan-edit-trip-modal');

  await step('close edit-trip', async () => {
    await page.evaluate(() => {
      const overlay = document.getElementById('plan-modal-overlay');
      if (overlay) overlay.style.display = 'none';
      const btns = Array.from(document.querySelectorAll('#plan-modal-overlay button'));
      const cancel = btns.find(b => /cancel|close/i.test((b.textContent || '').trim()));
      if (cancel) cancel.click();
    });
    await page.waitForTimeout(400);
  });

  // 20 Payday plan section
  await step('scroll to payday plan', async () => {
    await page.evaluate(() => {
      const cands = Array.from(document.querySelectorAll('#plan-content *, #plan-mode *'));
      const hit = cands.find(el => /lock payday|unlock and edit|payday plan/i.test((el.textContent || '').slice(0, 100)) && el.offsetHeight > 0);
      if (hit) hit.scrollIntoView({ block: 'center' });
    });
  });
  await page.waitForTimeout(300);
  await shoot(page, 20, 'plan-payday-plan');

  console.log('\n=== SECTION 4 — Chat ===');
  await step('close plan + open chat', async () => {
    await page.evaluate(() => {
      // close plan-mode panel (transform-based slide-in)
      const pm = document.getElementById('plan-mode');
      if (pm) pm.style.transform = 'translateX(100%)';
      // also try a closePlanMode if present
      if (typeof closePlanMode === 'function') closePlanMode();
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => goPage('pg-chat'));
    await page.waitForTimeout(500);
    await page.evaluate(() => window.scrollTo(0, 0));
  });
  await page.waitForTimeout(300);
  await shoot(page, 21, 'chat-fresh');

  // 22 Chat with sample — capture as-is (do NOT send a request to the LLM, that costs API)
  await page.waitForTimeout(200);
  await shoot(page, 22, 'chat-empty-or-prior', 'no auto-send to avoid API cost');

  console.log('\n=== SECTION 5 — Analysis ===');
  await step('open analysis', async () => {
    await page.evaluate(() => goPage('pg-spend'));
    await page.waitForTimeout(600);
    await page.evaluate(() => window.scrollTo(0, 0));
  });
  await page.waitForTimeout(300);
  await shoot(page, 23, 'analysis-survival-forecast');

  // 24 Character score
  await step('scroll to character score', async () => {
    await page.evaluate(() => {
      const cands = Array.from(document.querySelectorAll('*'));
      const hit = cands.find(el => /character|city2surf|discipline/i.test((el.textContent || '').slice(0, 80)) && el.offsetHeight > 0 && el.offsetHeight < 600);
      if (hit) hit.scrollIntoView({ block: 'start' });
      else window.scrollBy(0, 600);
    });
  });
  await page.waitForTimeout(300);
  await shoot(page, 24, 'analysis-character-score');

  // 25 Spending pivot
  await step('scroll to spending pivot', async () => {
    await page.evaluate(() => {
      const el = document.getElementById('spending-pivot');
      if (el) el.scrollIntoView({ block: 'start' });
      else window.scrollBy(0, 600);
    });
  });
  await page.waitForTimeout(300);
  await shoot(page, 25, 'analysis-spending-pivot');

  // 26 Spending pivot expanded — rows are inline divs with pivotToggle() onclick
  await step('expand pivot category', async () => {
    const ok = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#spending-pivot [onclick*="pivotToggle"]'));
      if (rows.length === 0) return false;
      rows[0].click();
      return true;
    });
    if (!ok) throw new Error('no pivotToggle row found in #spending-pivot');
    await page.waitForTimeout(500);
  });
  await shoot(page, 26, 'analysis-spending-pivot-expanded');

  // 27 Analysis bottom
  await step('scroll analysis bottom', async () => {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  });
  await page.waitForTimeout(300);
  await shoot(page, 27, 'analysis-bottom');

  console.log('\n=== SECTION 6 — Settings ===');
  await step('open settings', async () => {
    await page.evaluate(() => goPage('pg-settings'));
    await page.waitForTimeout(500);
    await page.evaluate(() => window.scrollTo(0, 0));
  });
  await page.waitForTimeout(300);
  await shoot(page, 28, 'settings-top');

  // Bundle 28 round 57: Bundle 22 v3 reshipped Settings as Samsung-style IA
  // with sub-screens. The old captures (29-32) scrolled inside a flat layout
  // that no longer exists — they were producing blank screens. New flow:
  // open each sub-screen via openSettingsCategory(), shoot it, then close
  // before opening the next one. Slot names follow the new IA, not the old
  // "app-controls/income-budget/debt-strategy/bottom" labels (those don't map
  // cleanly to the post-22v3 reality).
  const openSub = async (subId) => {
    await page.evaluate((id) => {
      if (typeof openSettingsCategory === 'function') openSettingsCategory(id);
    }, subId);
    await page.waitForTimeout(350);
  };
  const closeSub = async (subId) => {
    await page.evaluate((id) => {
      if (typeof closeSettingsCategory === 'function') closeSettingsCategory(id);
    }, subId);
    await page.waitForTimeout(300);
  };

  // 29 — Financial Data sub-screen (income, assets, debts surface)
  await step('open sub-financial', () => openSub('sub-financial'));
  await shoot(page, 29, 'settings-financial');
  await step('close sub-financial', () => closeSub('sub-financial'));

  // 30 — Strategies sub-screen (weekday/weekend budgets + debt payoff order)
  await step('open sub-strategies', () => openSub('sub-strategies'));
  await shoot(page, 30, 'settings-strategies');
  await step('close sub-strategies', () => closeSub('sub-strategies'));

  // 31 — Data & Backup sub-screen (snapshots, round-ups, export, import)
  await step('open sub-data', () => openSub('sub-data'));
  await shoot(page, 31, 'settings-data-backup');
  await step('close sub-data', () => closeSub('sub-data'));

  // 32 — Diagnostics sub-screen (health checks, activity log, version)
  await step('open sub-diagnostics', () => openSub('sub-diagnostics'));
  await shoot(page, 32, 'settings-diagnostics');
  await step('close sub-diagnostics', () => closeSub('sub-diagnostics'));

  // r64: previously-missing Settings sub-screens — notifications + AI assistant.
  // 32a — Notifications sub-screen (smart alerts, quiet mode)
  await step('open sub-notifications', () => openSub('sub-notifications'));
  await shoot(page, 32, 'settings-notifications', 'r64: was uncaptured');
  await step('close sub-notifications', () => closeSub('sub-notifications'));
  // 32b — AI Assistant sub-screen (API key, usage, costs)
  await step('open sub-ai', () => openSub('sub-ai'));
  await shoot(page, 32, 'settings-ai-assistant', 'r64: was uncaptured');
  await step('close sub-ai', () => closeSub('sub-ai'));

  console.log('\n=== SECTION 7 — Critical modals ===');
  // 33 Quick-log
  await step('open quick-log modal', async () => {
    await page.evaluate(() => openQuickLogModal());
    await page.waitForTimeout(500);
  });
  await shoot(page, 33, 'modal-quick-log');
  await step('close quick-log', async () => {
    await page.evaluate(() => {
      const m = document.getElementById('quick-log-modal');
      if (m) m.classList.remove('active'), m.style.display = 'none';
      if (typeof closeQuickLogModal === 'function') closeQuickLogModal();
    });
    await page.waitForTimeout(300);
  });

  // 34 Edit-bill modal
  await step('open edit-bill modal', async () => {
    await page.evaluate(() => goPage('pg-cal'));
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      // Find a bill row and open
      if (typeof openBillModal === 'function') openBillModal(0);
    });
    await page.waitForTimeout(600);
  });
  await shoot(page, 34, 'modal-edit-bill');
  await step('close edit-bill', async () => {
    await page.evaluate(() => {
      if (typeof closeBillModal === 'function') closeBillModal();
      const m = document.querySelector('.modal-overlay.active') || document.querySelector('[id$="-modal"][style*="block"]');
      if (m) m.style.display = 'none';
    });
    await page.waitForTimeout(300);
  });

  // 35 MI-13 banner detail — banner is dashboard-only, force-nav there first
  await step('open MI-13 details', async () => {
    await page.evaluate(() => { if (typeof goPage === 'function') goPage('pg-dash'); });
    await page.waitForTimeout(500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    const result = await page.evaluate(() => {
      const banner = document.getElementById('math-invariant-banner');
      const visible = banner && getComputedStyle(banner).display !== 'none';
      if (!visible) return { visible: false };
      const rule = banner.dataset.rule;
      if (typeof MathInvariants !== 'undefined' && MathInvariants.showDetails) {
        MathInvariants.showDetails(rule);
        return { visible: true, rule };
      }
      return { visible: true, rule, no_show_details: true };
    });
    if (!result.visible) throw new Error('MI-13 banner not visible — surfacing as the user noted "banner being absent is itself signal"');
    await page.waitForTimeout(700);
  });
  await shoot(page, 35, 'modal-mi13-details');
  await step('close MI-13', async () => {
    await page.evaluate(() => {
      const m = document.querySelector('.modal-overlay.active') || document.querySelector('[id*="invariant"][style*="block"]');
      if (m) m.style.display = 'none';
    });
    await page.waitForTimeout(300);
  });

  // 36 Edit-debt modal
  await step('open edit-debt modal', async () => {
    await page.evaluate(() => goPage('pg-dash'));
    await page.waitForTimeout(400);
    await page.evaluate(() => { if (typeof openDebtModal === 'function') openDebtModal(0); });
    await page.waitForTimeout(600);
  });
  await shoot(page, 36, 'modal-edit-debt');
  await step('close edit-debt', async () => {
    await page.evaluate(() => {
      if (typeof closeDebtModal === 'function') closeDebtModal();
      const m = document.querySelector('.modal-overlay.active');
      if (m) m.style.display = 'none';
    });
    await page.waitForTimeout(300);
  });

  // 37 Net worth modal
  await step('open net worth modal', async () => {
    await page.evaluate(() => { if (typeof openNetWorthModal === 'function') openNetWorthModal(); });
    await page.waitForTimeout(700);
  });
  await shoot(page, 37, 'modal-net-worth');
  await step('close net worth modal', async () => {
    await page.evaluate(() => {
      const m = document.querySelector('.modal-overlay.active') || document.querySelector('[id*="networth"][style*="block"]');
      if (m) m.style.display = 'none';
      if (m) m.classList.remove('active');
    });
    await page.waitForTimeout(300);
  });

  // ─── Bundle 28.x captures — balance-edit surfaces ────────────────────────
  // Three new captures for the balance-edit flow that this bundle fixed:
  // 38 — dashboard hero balance edit input visible
  // 39 — recon modal opened by a $1+ balance edit
  // 40 — settings balance edit modal (openSettingsBalanceEdit)

  // 38 Dashboard hero balance edit
  await step('open dashboard balance edit', async () => {
    await page.evaluate(() => { if (typeof goPage === 'function') goPage('pg-dash'); });
    await page.waitForTimeout(400);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    await page.evaluate(() => { if (typeof openHeroBalEdit === 'function') openHeroBalEdit(); });
    await page.waitForTimeout(500);
  });
  await shoot(page, 38, 'dashboard-balance-edit-input', 'hero balance in edit mode');

  // 39 Recon modal — typed a >=$1 new balance, hit confirmHeroBalEdit
  await step('trigger recon modal via hero balance', async () => {
    await page.evaluate(() => {
      const inp = document.getElementById('h-bal-input');
      if (inp) {
        const current = (typeof S !== 'undefined' && S.bal) || 100;
        inp.value = String(Math.round((current + 25) * 100) / 100);  // +$25 from current
      }
      if (typeof confirmHeroBalEdit === 'function') confirmHeroBalEdit();
    });
    await page.waitForTimeout(700);
  });
  await shoot(page, 39, 'modal-recon-balance', 'reason picker opened by $25 diff');
  await step('close recon modal', async () => {
    await page.evaluate(() => {
      const m = document.getElementById('recon-modal');
      if (m) m.classList.remove('open');
      try { if (typeof _pendingBalCorrection !== 'undefined') _pendingBalCorrection = null; } catch (_) {}
    });
    await page.waitForTimeout(300);
  });

  // capture 40 (settings-balance-edit modal) removed Bundle 28.x — Settings
  // balance edit was deleted; dashboard hero is the single edit surface.

  // 41 Add-bucket modal opened FROM INSIDE the Payday Plan canvas — captures
  // the z-index sandwich fix (commit bdda17b). Pre-fix this modal opened at
  // z-index 200 BEHIND the canvas (510) and john had to back-press 4 deep
  // to reach it. Post-fix at z-index 600 it sits ABOVE the canvas.
  await step('open add-bucket modal from inside canvas', async () => {
    await page.evaluate(() => { if (typeof goPage === 'function') goPage('pg-dash'); });
    await page.waitForTimeout(300);
    await page.evaluate(() => { if (typeof openPaydayPlan === 'function') openPaydayPlan(); });
    await page.waitForTimeout(500);
    await page.evaluate(() => { if (typeof openPaydayCategory === 'function') openPaydayCategory('payday-savings'); });
    await page.waitForTimeout(500);
    await page.evaluate(() => { if (typeof openAddBucketModal === 'function') openAddBucketModal(); });
    await page.waitForTimeout(600);
  });
  await shoot(page, 41, 'modal-add-bucket-over-canvas', 'verifies z-index sandwich fix');

  // 42 KIA Extra editor with toast firing — captures the toast layering
  // fix. We trigger the save() callback path manually so showToast fires
  // visibly. EDIT_MODAL closes; toast at z-index 800 sits above canvas (510).
  await step('open KIA Extra editor + fire toast', async () => {
    // Close any prior modal
    await page.evaluate(() => {
      const m = document.querySelector('.modal-overlay.open');
      if (m) m.classList.remove('open');
      document.querySelectorAll('.edit-modal').forEach(e => e.style.display = 'none');
    });
    await page.waitForTimeout(200);
    // Fire showToast manually while canvas is open — pure layering test
    await page.evaluate(() => {
      if (typeof showToast === 'function') showToast('✓ Layer test — toast above canvas');
    });
    await page.waitForTimeout(300);
  });
  await shoot(page, 42, 'toast-over-canvas', 'showToast at z-index 800 above canvas 510');

  // ─── SECTION 8 — Zoom captures (r64) ───────────────────────────
  // Close-ups of small-but-critical UI so detail is legible at desktop reading size.
  console.log('\n=== SECTION 8 — Zoom captures ===');
  // Hard-reset to dashboard — close any overlays AND any payday canvas (which is
  // a full-screen overlay, not a screen, so goPage doesn't kick it).
  await step('hard-reset to dashboard for zoom', async () => {
    await page.evaluate(() => {
      // Close every overlay class we've seen
      document.querySelectorAll('.modal-overlay.show, .edit-modal.show, .recon-overlay.show').forEach(m => m.classList.remove('show'));
      // Close payday canvas if it has a close API
      if (typeof closePaydayPlan === 'function') { try { closePaydayPlan(); } catch (_) {} }
      // Hide any canvas root by id
      const canv = document.getElementById('payday-canvas') || document.getElementById('payday-plan-root');
      if (canv) { canv.style.display = 'none'; canv.classList && canv.classList.remove('show', 'open', 'active'); }
      if (typeof goPage === 'function') goPage('pg-dash');
    });
    await page.waitForTimeout(400);
  });
  await zoom(page, 43, 'hero-balance', '#h-bal', 'hero balance + subline');
  await zoom(page, 44, 'hero-subline', '#h-note', 'today\'s outflow breakdown — verify $66/$283/$218 math');
  await zoom(page, 45, 'immediate-debts-grid', '#debt-grid', 'debt tiles — verify via-rent shows paid-off bar (r64)');
  await zoom(page, 46, 'persistent-strip', '#persistent-strip', 'NW · max-day · payday footer');
  await step('open bills for calendar zoom', async () => {
    await page.evaluate(() => { if (typeof goPage === 'function') goPage('pg-cal'); });
    await page.waitForTimeout(400);
  });
  await zoom(page, 47, 'bills-calendar', '#cal-grid', 'calendar — verify Google One day-1 strike-through (paidBills migration)');

  // ─── SECTION 9 — Previously-uncaptured modals (r66) ──────────────
  console.log('\n=== SECTION 9 — More modals ===');
  // Hard-reset before each modal so we don't stack overlays
  const resetToDash = async () => {
    await page.evaluate(() => {
      document.querySelectorAll('.modal-overlay.show, .edit-modal.show, .recon-overlay.show').forEach(m => m.classList.remove('show'));
      const tr = document.getElementById('tracer-overlay');
      if (tr) tr.style.display = 'none';
      if (typeof goPage === 'function') goPage('pg-dash');
    });
    await page.waitForTimeout(300);
  };

  // 49 — Max-Per-Day math tracer ("TAP FOR MATH" reveal)
  // edit-modal uses position:fixed inset:0 + CSS animation that fades from
  // opacity:0 → 1 over 150ms. On a fullPage Playwright screenshot the
  // fixed-positioned overlay anchors to document top:0; if document has scroll
  // height > viewport, the modal can appear at the very top of the screenshot
  // and be cropped above the visible bills tab body. We target the element
  // directly via zoom() rather than fullPage to capture just the modal card.
  await step('reset + open max-day math', async () => {
    await resetToDash();
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      if (typeof explainMaxPerDay === 'function') explainMaxPerDay();
    });
    await page.waitForTimeout(800);
  });
  // Force-show: some sequence is leaving the modal with inline display:none
  // overriding the .open class. Explicitly clear the inline style after open.
  await page.evaluate(() => {
    const m = document.getElementById('edit-modal');
    if (m) {
      m.style.removeProperty('display');
      m.style.display = 'flex';
    }
  });
  await page.waitForTimeout(300);
  const info = await page.evaluate(() => {
    const m = document.getElementById('edit-modal');
    if (!m) return 'no edit-modal el';
    const cs = window.getComputedStyle(m);
    const r = m.getBoundingClientRect();
    return { display: cs.display, inlineStyle: m.getAttribute('style'), rect: { w: r.width, h: r.height } };
  });
  console.log('  · max-day modal state (after force):', JSON.stringify(info));
  await page.screenshot({ path: path.join(OUT_DIR, `slyght-layerV-${DATE_TAG}-49-modal-max-day-math.png`), fullPage: false });
  manifest.push({ idx: 49, slug: 'modal-max-day-math', file: `slyght-layerV-${DATE_TAG}-49-modal-max-day-math.png`, status: 'ok', size: fs.statSync(path.join(OUT_DIR, `slyght-layerV-${DATE_TAG}-49-modal-max-day-math.png`)).size, note: 'viewport-only' });
  console.log('  [49] modal-max-day-math captured');

  // 50 — Add Debt modal (no existing debt argument → "add new")
  await step('reset + open add-debt', async () => {
    await resetToDash();
    await page.evaluate(() => { if (typeof openAddDebtModal === 'function') openAddDebtModal(); });
    await page.waitForTimeout(500);
  });
  await shoot(page, 50, 'modal-add-debt', 'add new debt — empty form');

  // 51 — Edit Goal modal (Property Deposit goal from fixture)
  await step('reset + nav plan + open edit-goal', async () => {
    await resetToDash();
    await page.evaluate(() => { if (typeof goPage === 'function') goPage('pg-plan'); });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      // editGoal expects a goalId — pick the first goal we can find
      if (typeof PLAN !== 'undefined' && PLAN.getGoals) {
        const goals = PLAN.getGoals();
        if (goals && goals.length && typeof editGoal === 'function') editGoal(goals[0].id);
      } else if (typeof editGoal === 'function') {
        // Fallback: try the canonical Property Deposit goalId from seedV25
        editGoal('property-deposit');
      }
    });
    await page.waitForTimeout(500);
  });
  await shoot(page, 51, 'modal-edit-goal', 'Property Deposit goal — edit form');

  // 52 — Add Trip modal
  await step('reset + open add-trip', async () => {
    await page.evaluate(() => {
      document.querySelectorAll('.modal-overlay.show, .edit-modal.show').forEach(m => m.classList.remove('show'));
    });
    await page.evaluate(() => { if (typeof addNewTrip === 'function') addNewTrip(); });
    await page.waitForTimeout(500);
  });
  await shoot(page, 52, 'modal-add-trip', 'new trip — empty form');

  // ─── SECTION 10 — Canvas sub-screens + canvas modals (Bundle 29 Phase 0) ─
  // Pre-Bundle-29 Layer V never navigated INTO the Payday Plan canvas. Section
  // 3 only captured the PLAN-tab tile-state (capture #20 plan-payday-plan).
  // Closes the audit cross-cut §F coverage gap John 2026-05-14 upgraded to
  // "the crux." Sub-screens via openPaydayCategory; modals via the canonical
  // openEdit*/explain*/openPaydayAutoAllocate handlers. Each capture pairs
  // with the post-Bundle-28-round-72 fixes (Mum-bubble dropped + bar legend +
  // payday-landed pill + R1 intent-driven goal subtitle).
  console.log('\n=== SECTION 10 — Canvas deep coverage ===');

  // Helper: hard-reset to canvas root open state. Closes any open modal +
  // sub-screen, navigates to PLAN, opens canvas. Used between every capture
  // so we don't leak state across surfaces.
  //
  // CRITICAL: Section 9 capture #49 uses force-display on #edit-modal with
  // inline style:flex which doesn't clear via classList.remove('show'). We
  // explicitly remove the inline display style on EVERY known modal here
  // so Section 10's first capture isn't tainted by the leftover.
  const resetToCanvasRoot = async () => {
    await page.evaluate(() => {
      // Call canonical close fns first so internal bookkeeping (scroll
      // restore, focus return) runs cleanly.
      try { if (typeof PLAN_MODAL !== 'undefined' && PLAN_MODAL.close) PLAN_MODAL.close(); } catch (_) {}
      try { if (typeof closeModal === 'function') closeModal('edit-modal-overlay', true); } catch (_) {}
      try { if (typeof closeModal === 'function') closeModal('custom-modal-overlay', true); } catch (_) {}
      try {
        if (typeof EDIT_MODAL !== 'undefined' && EDIT_MODAL.close) EDIT_MODAL.close();
      } catch (_) {}
      // Then sweep every overlay element we know about — classList only.
      // Setting inline display:none would BREAK subsequent modal opens
      // (EDIT_MODAL.openCustom uses .show class via CSS; inline display:none
      // would win on specificity). Canonical close fns above already set
      // display:none correctly for PLAN_MODAL / EDIT_MODAL.
      const overlaySelectors = [
        '.modal-overlay', '.edit-modal', '.recon-overlay',
        '#edit-modal', '#plan-modal-overlay', '#quick-log-modal',
        '#h-bal-edit', '#recon-modal', '#debt-modal', '#nw-modal',
        '#txn-edit-modal', '#add-debt-modal', '#bucket-modal',
        '#add-bucket-modal', '#cat-modal', '#mark-paid-modal',
        '#mi13-details-modal', '#bnpl-modal',
        '#custom-modal-overlay', '#edit-modal-overlay',
      ];
      overlaySelectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(m => {
          m.classList.remove('show', 'open', 'active');
        });
      });
      // ONE targeted inline-style clear: Section 9 capture #49 force-sets
      // `style.display='flex'` on #edit-modal which doesn't clear via class
      // removal. PLAN_MODAL.close handles #plan-modal-overlay separately.
      const _editModal = document.getElementById('edit-modal');
      if (_editModal) _editModal.style.removeProperty('display');
      // Sub-screens
      document.querySelectorAll('.payday-subscreen.payday-active').forEach(s => s.classList.remove('payday-active'));
      // Tracer
      const tr = document.getElementById('tracer-overlay');
      if (tr) tr.style.display = 'none';
      // Make sure the canvas itself isn't already active (clear stale state)
      const canvas = document.getElementById('pg-payday-plan');
      if (canvas) canvas.classList.remove('payday-active', 'has-active-subscreen');
      // Go to PLAN tab so openPaydayPlan can fire from the expected context
      if (typeof goPage === 'function') goPage('pg-plan');
    });
    await page.waitForTimeout(450);
    await page.evaluate(() => {
      if (typeof openPaydayPlan === 'function') openPaydayPlan();
    });
    await page.waitForTimeout(800); // canvas slide-in + render + (potential 400ms tutorial overlay defer)
    // Dismiss tutorial overlay if it fired (first-canvas-open one-time)
    await page.evaluate(() => {
      try { localStorage.setItem('slyght_payday_canvas_seen', '1'); } catch (_) {}
      document.querySelectorAll('.edit-modal.show, .edit-modal[style*="flex"]').forEach(m => {
        const isTutorial = m.textContent && m.textContent.indexOf('Welcome to Payday Plan') >= 0;
        if (isTutorial) {
          m.classList.remove('show');
          m.style.display = 'none';
        }
      });
    });
    await page.waitForTimeout(200);
  };

  // 53 — Canvas root (post-r72 visual state: no Mum-bubble · coloured-dot
  // legend · "Pay landed today?" pill OR "✓ Paid" badge per S.paydayReceived)
  await step('canvas root capture', () => resetToCanvasRoot());
  await shoot(page, 53, 'canvas-root', 'post-r72: no Mum-bubble · coloured-dot legend · payday-landed pill');

  // 54 — Canvas Bills sub-screen
  await step('open canvas-bills sub', async () => {
    await page.evaluate(() => { if (typeof openPaydayCategory === 'function') openPaydayCategory('payday-bills'); });
    await page.waitForTimeout(450);
  });
  await shoot(page, 54, 'canvas-sub-bills', 'r47 UNPAID-visible + PAID-collapsed details split');

  // 55 — Canvas Debts sub-screen
  await step('open canvas-debts sub', async () => {
    await page.evaluate(() => {
      document.querySelectorAll('.payday-subscreen.payday-active').forEach(s => s.classList.remove('payday-active'));
      if (typeof openPaydayCategory === 'function') openPaydayCategory('payday-debts');
    });
    await page.waitForTimeout(450);
  });
  await shoot(page, 55, 'canvas-sub-debts', 'r47 viaRent + autoDebit tags + r50 fmtAuDate');

  // 56 — Canvas Daily Living sub-screen
  await step('open canvas-living sub', async () => {
    await page.evaluate(() => {
      document.querySelectorAll('.payday-subscreen.payday-active').forEach(s => s.classList.remove('payday-active'));
      if (typeof openPaydayCategory === 'function') openPaydayCategory('payday-living');
    });
    await page.waitForTimeout(450);
  });
  await shoot(page, 56, 'canvas-sub-living', 'Current $/day · Floors · Status badge · About');

  // 57 — Canvas Savings sub-screen (R1 verify — Freedom Buffer + Property Deposit visible by name)
  await step('open canvas-savings sub', async () => {
    await page.evaluate(() => {
      document.querySelectorAll('.payday-subscreen.payday-active').forEach(s => s.classList.remove('payday-active'));
      if (typeof openPaydayCategory === 'function') openPaydayCategory('payday-savings');
    });
    await page.waitForTimeout(450);
  });
  await shoot(page, 57, 'canvas-sub-savings', 'R1: goal-name rendering + Other-savings-goals synthetic-bucket section');

  // 58 — Canvas Upcoming sub-screen
  await step('open canvas-upcoming sub', async () => {
    await page.evaluate(() => {
      document.querySelectorAll('.payday-subscreen.payday-active').forEach(s => s.classList.remove('payday-active'));
      if (typeof openPaydayCategory === 'function') openPaydayCategory('payday-upcoming');
    });
    await page.waitForTimeout(450);
  });
  await shoot(page, 58, 'canvas-sub-upcoming', 'Known Upcoming items OR empty-state');

  // Canvas modals — each needs canvas open + sub closed first
  const openCanvasModal = async (fnCall, label) => {
    await step('reset + open ' + label, async () => {
      await resetToCanvasRoot();
      await page.evaluate((src) => {
        try { eval(src); } catch (e) { console.error('[layerV] modal-open failed for ' + src + ':', e); }
      }, fnCall);
      await page.waitForTimeout(700);
    });
  };

  // 59 — Bonus modal (openEditPaydayBonus)
  await openCanvasModal('openEditPaydayBonus()', 'edit-bonus');
  await shoot(page, 59, 'canvas-modal-edit-bonus', 'NetPay + bonus toggle + quick-pick + status select');

  // 60 — Edit-bill modal (Rent + Deposit Savings — r49 Paid/Defer toggle)
  await openCanvasModal('openEditPaydayBill("Rent + Deposit Savings")', 'edit-bill-rent');
  await shoot(page, 60, 'canvas-modal-edit-bill-rent', 'r49 two-mode Paid/Defer toggle + late-fee preview');

  // 61 — Edit-debt modal (Michael)
  await openCanvasModal('openEditPaydayDebt("Borrowed from Michael")', 'edit-debt-michael');
  await shoot(page, 61, 'canvas-modal-edit-debt-michael', 'r49 simplified 0-100% quick-picks');

  // 62 — Edit-savings modal (Rainy Day Fund → should show "Freedom Buffer" title per R1)
  await openCanvasModal('openEditPaydaySavings("Rainy Day Fund")', 'edit-savings-freedom-buffer');
  await shoot(page, 62, 'canvas-modal-edit-savings-r1', 'R1 verify: modal title "🛡️ Freedom buffer — this cycle" not bucket name');

  // 63 — KIA Extra modal
  await openCanvasModal('openEditPaydayKiaExtra()', 'edit-kia-extra');
  await shoot(page, 63, 'canvas-modal-edit-kia-extra', 'KIA acceleration · snowball/avalanche aware');

  // 64 — Trip allocation modal (Darwin)
  await openCanvasModal('(function(){ var trips = (typeof PLAN!=="undefined" && PLAN.getTrips) ? PLAN.getTrips() : []; var darwin = trips.find(function(t){return t && /darwin/i.test(t.name||"");}); if (darwin) openEditPaydayTripAlloc(darwin.id);})()', 'edit-trip-alloc-darwin');
  await shoot(page, 64, 'canvas-modal-edit-trip-alloc-darwin', 'Darwin trip allocation — quick-pick scaled to budget');

  // 65 — Auto-allocate modal (r48 + r49d "Already covered first" + r52 NEW BUCKET tags)
  await openCanvasModal('openPaydayAutoAllocate()', 'auto-allocate');
  await shoot(page, 65, 'canvas-modal-auto-allocate', 'r49d covered-first block + r52 NEW BUCKET synthetic tags + urgency-weighted split');

  // 66 — Lock plan modal
  await openCanvasModal('openPaydayLockPlan()', 'lock-plan');
  await shoot(page, 66, 'canvas-modal-lock-plan', 'Confirmation + tight-buffer warning OR cant-lock-shortfall info');

  // 67 — explainAnnualProvisions info modal (canvas Essentials nav)
  await openCanvasModal('explainAnnualProvisions()', 'explain-annual-provisions');
  await shoot(page, 67, 'canvas-modal-explain-annual-provisions', 'r47 info modal with provision rows + monthly/annual totals');

  // 68 — explainMaxPerDay info modal (r9 rich HTML rebuild)
  await openCanvasModal('explainMaxPerDay()', 'explain-max-per-day');
  await shoot(page, 68, 'canvas-modal-explain-max-per-day', 'r9 rich-HTML hero gradient + progress bar + breakdown + timing-aware warning');

  // 69 — PLAN-tab manage-provisions modal (R2 verify — bundle 28 round 72)
  await step('reset + open manage-provisions', async () => {
    await page.evaluate(() => {
      document.querySelectorAll('.modal-overlay.show, .edit-modal.show').forEach(m => m.classList.remove('show'));
      document.querySelectorAll('.payday-subscreen.payday-active').forEach(s => s.classList.remove('payday-active'));
      const canvas = document.getElementById('pg-payday-plan');
      if (canvas) canvas.classList.remove('payday-active');
      if (typeof goPage === 'function') goPage('pg-plan');
    });
    await page.waitForTimeout(450);
    await page.evaluate(() => { if (typeof openManageProvisions === 'function') openManageProvisions(); });
    await page.waitForTimeout(500);
  });
  await shoot(page, 69, 'plan-tab-modal-manage-provisions', 'R2 verify: nav-row → editable manage modal');

  // Persist manifest + ui-code-map
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'ui-code-map.json'), JSON.stringify(uiCodeMap, null, 2));
  console.log(`\nManifest:    ${path.join(OUT_DIR, 'manifest.json')}`);
  console.log(`UI-code map: ${path.join(OUT_DIR, 'ui-code-map.json')}`);

  await browser.close();
  console.log('Done.');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
