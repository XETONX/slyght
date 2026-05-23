// Net-worth Option C regression test — .nw-line hides when hero is coral,
// shows otherwise.
//
// Drone M / Ledger Walk session 2026-05-23: the static "+$X Liquid net worth"
// tile rendered directly under the coral hero softens the urgency. Option C
// (John's pick) hides .nw-line only when hero is coral (_heroIsHeadroom &&
// _heroNumber < 0). NW remains reachable via NW modal, #strip-networth
// footer, and Analysis tab.
//
// Pinned oracle: live-2026-05-23.json (headroom negative → hero coral by
// default; override S.bal to test the green-hero path).

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ORACLE_PATH = path.resolve(__dirname, '../state-dump/live-2026-05-23.json');
const FROZEN_ISO = '2026-05-23T22:00:00+10:00';
const oracle = JSON.parse(fs.readFileSync(ORACLE_PATH, 'utf8'));

function buildSlyghtV5(fx) {
  const S = Object.assign({}, fx.S || {});
  if (fx.paidBills && !S.paidBills) S.paidBills = fx.paidBills;
  return { S, BILLS: fx.BILLS || [] };
}

const SETTLE_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
  }
`;

async function boot(page, context) {
  await page.clock.install({ time: new Date(FROZEN_ISO) });
  await context.addInitScript((args) => {
    try { localStorage.setItem('slyght_v5', JSON.stringify(args.seed)); } catch (_) {}
    for (let i = 0; i < 40; i++) {
      try { localStorage.setItem('slyght_seeded_v' + i, '1'); } catch (_) {}
    }
    try { localStorage.setItem('slyght_bills_reset_month', args.monthKey); } catch (_) {}
  }, { seed: buildSlyghtV5(oracle), monthKey: '2026-5' });
  await page.goto(process.env.SMOKE_BASE_URL || '/');
  await page.addStyleTag({ content: SETTLE_CSS });
  await page.waitForFunction(() => typeof renderAll === 'function'
    && typeof BRAIN !== 'undefined' && BRAIN.plan, { timeout: 5000 });
  await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page.evaluate(() => {
    const modal = document.getElementById('eod-recon-modal');
    if (modal && modal.classList.contains('open') && typeof eodReconAccept === 'function') eodReconAccept();
  });
}

test.describe('Net-worth Option C — conditional hide on coral hero', () => {
  test.beforeEach(({ page, context }) => boot(page, context));

  // Case 1 — fixture has negative headroom by default → hero coral → .nw-line hidden.
  test('Case 1: .nw-line hidden when hero is coral (negative headroom)', async ({ page }) => {
    const result = await page.evaluate(() => {
      renderAll();
      const snap = BRAIN.plan.getSnapshot();
      const headroom = snap?.derived?.safeToSpendHeadroom;
      const nwLine = document.querySelector('.hero-section .nw-line');
      const computedDisplay = nwLine ? window.getComputedStyle(nwLine).display : null;
      const inlineDisplay = nwLine ? nwLine.style.display : null;
      return {
        headroom,
        nwLineExists: !!nwLine,
        computedDisplay,
        inlineDisplay,
      };
    });

    // Headroom must actually be negative for this case to be meaningful
    expect(result.headroom).toBeLessThan(0);
    expect(result.nwLineExists).toBe(true);
    // The tile is hidden when hero is coral
    expect(result.inlineDisplay).toBe('none');
    expect(result.computedDisplay).toBe('none');
  });

  // Case 2 — bump S.bal so headroom > 0 → hero not coral → .nw-line visible.
  test('Case 2: .nw-line visible when hero is not coral (positive headroom)', async ({ page }) => {
    const result = await page.evaluate(() => {
      // Bump bal high enough to flip headroom positive
      S.bal = 10000;
      if (typeof save === 'function') save();
      renderAll();
      const snap = BRAIN.plan.getSnapshot();
      const headroom = snap?.derived?.safeToSpendHeadroom;
      const nwLine = document.querySelector('.hero-section .nw-line');
      const computedDisplay = nwLine ? window.getComputedStyle(nwLine).display : null;
      const inlineDisplay = nwLine ? nwLine.style.display : null;
      return {
        headroom,
        nwLineExists: !!nwLine,
        computedDisplay,
        inlineDisplay,
      };
    });

    // Headroom flipped positive
    expect(result.headroom).toBeGreaterThan(0);
    expect(result.nwLineExists).toBe(true);
    // The tile is visible (empty inline display = inherits stylesheet 'flex' or 'block')
    expect(result.inlineDisplay).toBe('');
    expect(result.computedDisplay).not.toBe('none');
  });
});
