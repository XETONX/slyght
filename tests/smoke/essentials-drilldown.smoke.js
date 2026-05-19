// Bundle 32.4 drilldown UI — essentials sub-screen render-truth conservation smoke.
//
// Why: the drilldown surfaces 4 component amounts (bills, debts, dailyLiving,
// provisions) + a total. The footer renders a conservation "receipt":
//   $TOTAL = $A + $B + $C + $D
// THIS IS THE RENDER-TRUTH INVARIANT MADE VISIBLE. If the displayed total
// disagrees with displayed parts, the user sees the contradiction. If
// the displayed values disagree with the underlying snap.derived values,
// trust breaks silently. This spec asserts:
//   1. displayed component values == snap.derived.essentialsBreakdown[key]
//   2. displayed total == snap.derived.essentialsTotal
//   3. displayed total == sum of displayed components (receipt holds)
//   4. each per-category expansion can be toggled (state-of-screen)
//
// Run: npm run smoke

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const FIXTURE_PATH = path.resolve(__dirname, '../../state-snapshot.json');
const FROZEN_ISO = '2026-05-05T22:00:00+10:00';
const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

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

// Parse "$1,234" / "$1,234.56" → numeric. Returns NaN on failure.
function dollarsFrom(text) {
  if (!text) return NaN;
  const m = String(text).replace(/[^\d.\-]/g, '');
  return parseFloat(m);
}

test.describe('Bundle 32.4 drilldown UI — render-truth conservation', () => {
  test.beforeEach(async ({ page, context }) => {
    await page.clock.install({ time: new Date(FROZEN_ISO) });
    await context.addInitScript((args) => {
      try { localStorage.setItem('slyght_v5', JSON.stringify(args.seed)); } catch (_) {}
      try { localStorage.setItem('slyght_seeded_v13', '1'); } catch (_) {}
      try { localStorage.setItem('slyght_seeded_v12', '1'); } catch (_) {}
      try { localStorage.setItem('slyght_seeded_v11', '1'); } catch (_) {}
      try { localStorage.setItem('slyght_bills_reset_month', args.monthKey); } catch (_) {}
    }, { seed: buildSlyghtV5(fixture), monthKey: '2026-5' });

    await page.goto(process.env.SMOKE_BASE_URL || '/');
    await page.addStyleTag({ content: SETTLE_CSS });
    await page.waitForFunction(() => typeof BRAIN !== 'undefined'
      && BRAIN.plan && BRAIN.plan.getSnapshot
      && typeof openEssentialsDetail === 'function'
      && typeof renderEssentialsDetail === 'function', { timeout: 5000 });
    await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
    await page.evaluate(() => {
      const modal = document.getElementById('eod-recon-modal');
      if (modal && modal.classList.contains('open') && typeof eodReconAccept === 'function') eodReconAccept();
    });
  });

  test('Drilldown receipt: displayed total === sum of displayed parts === snap.derived.essentialsTotal', async ({ page }) => {
    // Open the drilldown screen
    await page.evaluate(() => openEssentialsDetail());
    await page.waitForTimeout(150);

    // Capture snap-tier truth + DOM-tier truth simultaneously
    const data = await page.evaluate(() => {
      const snap = BRAIN.plan.getSnapshot();
      const eb = snap.derived.essentialsBreakdown;
      const screen = document.getElementById('pg-essentials-detail');
      const receipt = document.querySelector('[data-essentials-sum-line]');
      const receiptText = receipt ? receipt.textContent : null;
      return {
        screenActive: !!(screen && screen.classList.contains('active')),
        snapEssentialsTotal: snap.derived.essentialsTotal,
        snapBreakdown: {
          bills: +eb.bills || 0,
          debts: +eb.debts || 0,
          dailyLiving: +eb.dailyLiving || 0,
          provisions: +eb.provisions || 0,
        },
        receiptText,
      };
    });

    expect(data.screenActive, 'drilldown screen must be active after openEssentialsDetail()').toBe(true);
    expect(data.receiptText, 'receipt footer line must be rendered').toBeTruthy();

    // Parse receipt: "$1,234 = $500 + $300 + $200 + $234"
    const partsMatch = data.receiptText.split('=');
    expect(partsMatch.length).toBe(2);
    const displayedTotal = dollarsFrom(partsMatch[0]);
    const displayedParts = partsMatch[1].split('+').map(s => dollarsFrom(s));

    // Conservation assertion #1 — receipt holds: displayed total == sum of displayed parts
    const sumOfDisplayedParts = displayedParts.reduce((s, n) => s + (isNaN(n) ? 0 : n), 0);
    expect(Math.abs(displayedTotal - sumOfDisplayedParts), `receipt broken: $${displayedTotal} != Σparts $${sumOfDisplayedParts}`).toBeLessThan(2);

    // Conservation assertion #2 — displayed total tracks snap.derived.essentialsTotal (rounded $)
    const snapTotalRounded = Math.round(data.snapEssentialsTotal);
    expect(Math.abs(displayedTotal - snapTotalRounded), `displayed total $${displayedTotal} != snap.derived.essentialsTotal $${snapTotalRounded}`).toBeLessThan(2);

    // Conservation assertion #3 — Σ snap parts also matches snap total (sanity — already asserted by Bundle 32.4 substrate smoke; re-checked here against drilldown's view)
    const snapSum = Math.round(data.snapBreakdown.bills + data.snapBreakdown.debts + data.snapBreakdown.dailyLiving + data.snapBreakdown.provisions);
    expect(Math.abs(snapSum - snapTotalRounded)).toBeLessThan(2);
  });

  test('Drilldown per-category card amounts match snap.derived components exactly', async ({ page }) => {
    await page.evaluate(() => openEssentialsDetail());
    await page.waitForTimeout(150);
    const data = await page.evaluate(() => {
      const eb = BRAIN.plan.getSnapshot().derived.essentialsBreakdown;
      const cards = Array.from(document.querySelectorAll('[data-ess-cat]'));
      const cardsByKey = {};
      for (const card of cards) {
        const key = card.dataset.essCat;
        // Per-card displayed amount lives in the right-aligned mono div
        const amtEl = card.querySelector('div[style*="font-family:var(--mono)"]');
        if (amtEl) {
          const amt = parseFloat(amtEl.textContent.replace(/[^\d.\-]/g, ''));
          cardsByKey[key] = amt;
        }
      }
      return { snapBreakdown: eb, cardsByKey };
    });

    const components = ['bills', 'debts', 'dailyLiving', 'provisions'];
    for (const key of components) {
      const snapAmt = Math.round(+data.snapBreakdown[key] || 0);
      const displayed = data.cardsByKey[key];
      // Cards with $0 components are skipped in render (per the if (c.amt === 0) continue guard).
      // So we only assert when snap value > 0.
      if (snapAmt > 0) {
        expect(displayed, `card for ${key} missing from drilldown despite snap=$${snapAmt}`).toBeDefined();
        expect(Math.abs(displayed - snapAmt), `card ${key} displayed $${displayed} != snap $${snapAmt}`).toBeLessThan(2);
      }
    }
  });

  test('Per-category expansion toggles state-of-screen (no navigation)', async ({ page }) => {
    await page.evaluate(() => openEssentialsDetail());
    await page.waitForTimeout(100);
    // Pick a category that has data (bills almost certainly does in this fixture)
    const result = await page.evaluate(() => {
      const card = document.querySelector('[data-ess-cat="bills"]');
      if (!card) return { skip: true, reason: 'no-bills-card' };
      const expand = document.querySelector('[data-ess-expand="bills"]');
      const before = expand ? expand.style.display : null;
      // Trigger toggle
      toggleEssentialsCat('bills');
      const after1 = expand ? expand.style.display : null;
      toggleEssentialsCat('bills');
      const after2 = expand ? expand.style.display : null;
      const screenStillActive = document.getElementById('pg-essentials-detail').classList.contains('active');
      return { skip: false, before, after1, after2, screenStillActive };
    });
    if (result.skip) test.skip(true, result.reason);
    expect(result.before).toBe('none');
    expect(result.after1).toBe('block');   // first toggle opens
    expect(result.after2).toBe('none');    // second toggle closes
    expect(result.screenStillActive).toBe(true);  // no navigation — same screen
  });

  test('Tile on Analysis tab opens the drilldown when tapped', async ({ page }) => {
    // Navigate to Analysis tab, find the Essentials tile, click it
    const result = await page.evaluate(() => {
      if (typeof goPage === 'function') goPage('pg-spend');
      if (typeof renderAnalysisTab === 'function') renderAnalysisTab();
      const tile = Array.from(document.querySelectorAll('button[onclick*="openEssentialsDetail"]'))[0];
      const tileFound = !!tile;
      if (tile) tile.click();
      const detailScreen = document.getElementById('pg-essentials-detail');
      const detailActive = !!(detailScreen && detailScreen.classList.contains('active'));
      const contentEl = document.getElementById('essentials-detail-content');
      const hasContent = !!(contentEl && contentEl.innerHTML.length > 100);
      return { tileFound, detailActive, hasContent };
    });
    expect(result.tileFound, 'essentials drilldown tile must exist on Analysis tab').toBe(true);
    expect(result.detailActive, 'tile click must navigate to drilldown screen').toBe(true);
    expect(result.hasContent, 'drilldown content must render').toBe(true);
  });
});
