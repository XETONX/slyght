// End-to-end allocation flow regression check — exact moves John will do
// tomorrow. Watches for console errors, pageerrors, missing renders.
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
  try { await page.emulateMedia({ colorScheme: 'dark' }); } catch (_) {}

  const errors = [];
  const warnings = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => {
    const t = m.text();
    if (t.includes('ERR_FAILED')) return;  // ignore service-worker fetch noise
    if (m.type() === 'error') errors.push('CONSOLE.error: ' + t);
    if (m.type() === 'warning') warnings.push('CONSOLE.warning: ' + t);
  });

  await ctx.addInitScript((args) => {
    // r79.1: GUARDED seed init — only write if NO existing state. Without
    // this guard, page.reload() would re-fire addInitScript and overwrite
    // any state the test had built up between steps, giving a false-fail.
    try {
      if (!localStorage.getItem('slyght_v5')) {
        localStorage.setItem('slyght_v5', JSON.stringify(args.seed));
        const data = JSON.parse(localStorage.getItem('slyght_v5'));
        data.S.lastOpenDate = new Date().toISOString().slice(0, 10);
        localStorage.setItem('slyght_v5', JSON.stringify(data));
      }
    } catch (_) {}
    try { localStorage.setItem('slyght_payday_canvas_seen', '1'); } catch (_) {}
  }, { seed });

  console.log('STEP 1: Load + splash dismiss');
  await page.goto('http://localhost:4567/slyght/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page.waitForTimeout(600);

  console.log('STEP 2: Open Payday Plan canvas');
  await page.evaluate(() => openPaydayPlan());
  await page.waitForTimeout(500);

  console.log('STEP 3: Open bonus modal, flip toggle ON, save');
  await page.evaluate(() => openEditPaydayBonus());
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const toggle = document.getElementById('bonus-include');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const chips = document.querySelectorAll('#quickpick-grid .quickpick');
    if (chips.length > 0) chips[0].click();
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => EDIT_MODAL.attemptSave());
  await page.waitForTimeout(500);
  const bonusState = await page.evaluate(() => {
    return {
      bonusIncluded: S.activePlan && S.activePlan.income && S.activePlan.income.bonus && S.activePlan.income.bonus.included,
      bonusAmount: S.activePlan && S.activePlan.income && S.activePlan.income.bonus && S.activePlan.income.bonus.amount,
      modalOpen: document.getElementById('edit-modal').classList.contains('open'),
      modalVis: document.getElementById('edit-modal').style.visibility,
    };
  });
  console.log('  Bonus after save:', JSON.stringify(bonusState));

  console.log('STEP 4: Lock the plan');
  await page.evaluate(() => {
    if (S.activePlan) {
      S.activePlan.lockedAt = Date.now();
      S.activePlan.streak = (S.activePlan.streak || 0) + 1;
      save();
      renderPaydayPlanRoot();
      renderAll();
    }
  });
  await page.waitForTimeout(500);

  console.log('STEP 5: Open bills sub-screen, tick a bill');
  await page.evaluate(() => openPaydayCategory('payday-bills'));
  await page.waitForTimeout(500);
  const firstBill = await page.evaluate(() => {
    const bills = BRAIN.bills.getThisCycle();
    return bills.length > 0 ? bills[0].name : null;
  });
  console.log('  First bill:', firstBill);
  await page.evaluate((name) => {
    paydayTick('bill', name, BRAIN.SOURCES.PLAN_BILLS_TICK);
  }, firstBill);
  await page.waitForTimeout(500);
  const tickState = await page.evaluate((name) => ({
    ticked: !!(S.activePlan.ticks && S.activePlan.ticks.bill && S.activePlan.ticks.bill[name]),
  }), firstBill);
  console.log('  Tick state:', JSON.stringify(tickState));

  console.log('STEP 6: Exit canvas to dashboard');
  await page.evaluate(() => _paydayExitToTab('pg-dash'));
  await page.waitForTimeout(500);

  console.log('STEP 7: Verify plan-active banner shows');
  const banner = await page.evaluate(() => {
    const el = document.getElementById('plan-active-banner-dash');
    return { exists: !!el, html: el ? el.innerHTML.slice(0, 100) : null };
  });
  console.log('  Banner:', banner.exists ? 'PRESENT' : 'MISSING', banner.html);

  console.log('STEP 8: Navigate to Bills tab');
  await page.evaluate(() => goPage('pg-cal'));
  await page.waitForTimeout(500);
  const billsState = await page.evaluate((billName) => ({
    bannerVisible: !!document.getElementById('plan-active-banner-cal')?.innerHTML,
    monthLabel: document.getElementById('cal-month-label')?.textContent,
  }), firstBill);
  console.log('  Bills tab:', JSON.stringify(billsState));

  console.log('STEP 9: Navigate to Analysis');
  await page.evaluate(() => goPage('pg-spend'));
  await page.waitForTimeout(500);

  console.log('STEP 10: Log a Quick Log transaction');
  await page.evaluate(() => { if (typeof openQuickLogModal === 'function') openQuickLogModal(); });
  await page.waitForTimeout(500);
  // Just close — no need to actually submit
  await page.evaluate(() => { const m = document.querySelector('.modal-overlay.open, .modal-overlay.show'); if (m) m.classList.remove('open', 'show'); });
  await page.waitForTimeout(300);

  console.log('STEP 11: Navigate back to dashboard, then probe localStorage BEFORE reload');
  await page.evaluate(() => goPage('pg-dash'));
  await page.waitForTimeout(300);
  const lsBefore = await page.evaluate(() => {
    const raw = localStorage.getItem('slyght_v5');
    const parsed = JSON.parse(raw);
    return {
      hasS: !!parsed.S,
      lockedAt: parsed.S?.activePlan?.lockedAt,
      ticks: Object.keys(parsed.S?.activePlan?.ticks?.bill || {}).length,
      bonusIncluded: parsed.S?.activePlan?.income?.bonus?.included,
    };
  });
  console.log('  localStorage BEFORE reload:', JSON.stringify(lsBefore));

  await page.reload({ waitUntil: 'networkidle' });
  // Install audit instrumentation BEFORE splash dismisses so we catch boot events
  await page.evaluate(() => {
    window.__rolloverCalls = [];
    if (typeof BRAIN !== 'undefined' && BRAIN.plan && BRAIN.plan.rolloverIfNeeded) {
      const orig = BRAIN.plan.rolloverIfNeeded;
      BRAIN.plan.rolloverIfNeeded = function () {
        const r = orig.apply(this, arguments);
        window.__rolloverCalls.push({
          ts: performance.now(),
          result: r,
          stack: new Error().stack.split('\n').slice(2, 5).join(' | '),
        });
        return r;
      };
    }
  });
  await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page.waitForTimeout(1500);

  const lsAfter = await page.evaluate(() => {
    const raw = localStorage.getItem('slyght_v5');
    const parsed = JSON.parse(raw);
    return {
      lockedAt: parsed.S?.activePlan?.lockedAt,
      ticks: Object.keys(parsed.S?.activePlan?.ticks?.bill || {}).length,
      bonusIncluded: parsed.S?.activePlan?.income?.bonus?.included,
    };
  });
  console.log('  localStorage AFTER reload:', JSON.stringify(lsAfter));

  const rolloverCalls = await page.evaluate(() => window.__rolloverCalls || []);
  console.log('  rolloverIfNeeded calls during boot:', rolloverCalls.length);
  rolloverCalls.forEach(c => console.log('    →', JSON.stringify(c.result), 'stack:', c.stack));

  const finalState = await page.evaluate((firstBill) => ({
    lockedAt: S.activePlan?.lockedAt,
    ticksBill: Object.keys(S.activePlan?.ticks?.bill || {}).length,
    firstBillStillTicked: !!(S.activePlan?.ticks?.bill?.[firstBill]),
    bonusIncluded: S.activePlan?.income?.bonus?.included,
    banner: !!document.getElementById('plan-active-banner-dash')?.innerHTML,
  }), firstBill);
  console.log('  S state AFTER reload:', JSON.stringify(finalState));

  console.log('\n=== REGRESSION REPORT ===');
  console.log('Errors:', errors.length);
  errors.forEach(e => console.log('  ❌', e));
  console.log('Warnings:', warnings.length);
  warnings.slice(0, 10).forEach(w => console.log('  ⚠️', w));

  const pass =
    bonusState.bonusIncluded &&
    tickState.ticked &&
    banner.exists &&
    finalState.lockedAt &&
    finalState.firstBillStillTicked &&
    finalState.bonusIncluded &&
    errors.length === 0;

  console.log('\n' + (pass ? '✅ E2E PASS' : '❌ E2E FAIL') + ' — daily allocation flow');

  await browser.close();
  process.exit(pass ? 0 : 1);
})();
