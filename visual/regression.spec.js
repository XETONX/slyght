// Mission V — visual regression spec.
//
// Determinism plumbing (must all hold for pixels to be stable):
//   1. Clock locked — page.clock.install({ time: FROZEN }) before goto.
//      Neutralizes the 184 new Date()/Date.now() callers in index.html.
//   2. Service worker blocked at the context level (playwright.config.js).
//   3. localStorage fixture seeded via addInitScript before any app
//      script runs — pre-empts the seed-from-defaults path at L6708.
//   4. Web fonts awaited via document.fonts.ready before screenshot.
//   5. Animations + transitions disabled by Playwright's screenshot mode
//      (animations: 'disabled') AND a belt-and-braces stylesheet for
//      pre-screenshot settle.
//   6. Viewport pinned to 390x844 @ DPR 2 (iPhone 13 logical).
//   7. Console errors collected per-test → page-error fold-in catches
//      "tab loads but JS exploded" regressions that pixel diff alone
//      would miss when the broken state still renders something.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const FIXTURE_PATH = path.resolve(__dirname, '../state-snapshot.json');
const FROZEN_ISO = '2026-05-05T12:00:00+10:00';   // Sydney noon — within paycycle, mid-day

const TABS = [
  { id: 'pg-dash',     name: 'dashboard' },
  { id: 'pg-spend',    name: 'analysis'  },
  { id: 'pg-cal',      name: 'calendar'  },
  { id: 'pg-settings', name: 'settings'  },
];

const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

// Build the localStorage shape the app expects from a snapshot file.
// The snapshot capture (capture-state.js) hoists S.paidBills to the top
// level; the app reads it back via S.paidBills, so fold it back in.
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
  *, input, textarea { caret-color: transparent !important; }
`;

test.describe('Mission V — Option A baseline', () => {
  for (const tab of TABS) {
    test(tab.name, async ({ page, context }) => {
      // 1. Lock the clock — must happen before navigation.
      await page.clock.install({ time: new Date(FROZEN_ISO) });

      // 3. Seed localStorage before app boot.
      await context.addInitScript((seed) => {
        try { localStorage.setItem('slyght_v5', JSON.stringify(seed)); }
        catch (_) {}
      }, buildSlyghtV5(fixture));

      // 7. Console + page errors — collect, assert at end.
      const errors = [];
      page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
      page.on('console', m => {
        if (m.type() !== 'error') return;
        const text = m.text();
        // Service-worker registration failures are expected when SW is
        // blocked at context level. Filter them out.
        if (/serviceWorker|sw\.js|Failed to register/i.test(text)) return;
        errors.push('[console.error] ' + text);
      });

      // Navigate.
      await page.goto('/index.html', { waitUntil: 'networkidle' });

      // 4. Wait for fonts to settle (Google Fonts CDN load).
      await page.evaluate(() => document.fonts.ready);

      // 5. Belt-and-braces animation kill.
      await page.addStyleTag({ content: SETTLE_CSS });

      // Splash screen — index.html always shows it on load (L9420 comment:
      // "Always show splash first"). splashTap() routes to showMain()
      // when fixture has txns/bills, which is the case for our fixture.
      await page.evaluate(() => {
        if (typeof splashTap === 'function') splashTap();
      });
      await page.waitForSelector('#splash-screen', { state: 'hidden' });

      // Switch tab if not the default (pg-dash is active on load).
      if (tab.id !== 'pg-dash') {
        await page.evaluate((id) => {
          if (typeof goPage === 'function') goPage(id);
        }, tab.id);
      }
      // Let renderAll() chain settle without yielding to timers.
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

      // Move mouse off-canvas to neutralize :hover state.
      await page.mouse.move(0, 0);

      await expect(page).toHaveScreenshot(tab.name + '.png', {
        fullPage: true,
      });

      if (errors.length) {
        throw new Error('Console errors on ' + tab.name + ':\n  ' + errors.join('\n  '));
      }
    });
  }
});
