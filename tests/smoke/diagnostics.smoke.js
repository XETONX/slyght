// Bundle 30 1.A.6 fix-forward — Diagnostics expand-button smoke test.
//
// Why this exists: phone-verify caught a click-handler bug ("View detailed
// checks" button on Math Health card did nothing on initial mount, worked
// only after PWA visibilitychange triggered renderAll). Root cause was
// duplicate-id collision from the renderAll mirror system. Fix uses
// `_toggleDetailPane(this)` relative-DOM lookup instead of getElementById.
//
// This spec is the regression guard: tap each expand button on the
// Diagnostics sub-screen, assert the next-sibling `.detail-pane` becomes
// visible within 100ms. If this fails, the click-binding bug regressed.
//
// Also satisfies CC manual §3 Deploy-check amendment (Phase 5): for any
// commit adding new interactive surfaces, CC runs Playwright smoke
// against the deployed app BEFORE asking John to phone-verify.
//
// Run: npm run visual -- diagnostics-expand.spec.js
//      (webServer auto-spawns scripts/serve.js on :4567)

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { captureState } = require('../helpers/capture-state');

const FIXTURE_PATH = path.resolve(__dirname, '../../state-snapshot.json');
const FROZEN_ISO = '2026-05-05T22:00:00+10:00';
const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
const SPEC_FILE = 'tests/smoke/diagnostics.smoke.js';

// Bundle 30.5 Phase B option (b) — fixture-artifact disclosure for Math
// Health-touching captures. state-snapshot.json predates FROZEN_ISO so
// MathInvariants flags 2 fixture FAILs (no-future-dated-txns +
// paidbills-key-not-future). These appear in every Math Health capture
// and are NOT real regressions; Phase C vision-verify should ignore.
//
// Phase C input contract: known_state_notes is array of {code, description}.
// Codes are grep-able identifiers Phase C's Haiku prompt can reference
// when telling the model what visible states to ignore.
const FIXTURE_MATH_HEALTH_NOTES = [
  {
    code: 'FIXTURE_MATH_HEALTH_FAILS',
    description: 'Math Health card shows 2 fixture-state FAIL violations (no-future-dated-txns + paidbills-key-not-future). state-snapshot.json predates FROZEN_ISO so MathInvariants flags these txns as future-dated. Not a Bundle 30 regression — ignore during Phase C verification.',
  },
];

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

test.describe('Bundle 30 1.A.6 — Diagnostics expand buttons (regression guard)', () => {
  test.beforeEach(async ({ page, context }) => {
    await page.clock.install({ time: new Date(FROZEN_ISO) });
    await context.addInitScript((args) => {
      try { localStorage.setItem('slyght_v5', JSON.stringify(args.seed)); } catch (_) {}
      try { localStorage.setItem('slyght_seeded_v13', '1'); } catch (_) {}
      try { localStorage.setItem('slyght_seeded_v12', '1'); } catch (_) {}
      try { localStorage.setItem('slyght_seeded_v11', '1'); } catch (_) {}
      try { localStorage.setItem('slyght_bills_reset_month', args.monthKey); } catch (_) {}
    }, { seed: buildSlyghtV5(fixture), monthKey: '2026-5' });

    // page.goto('/') resolves against baseURL host root (drops /slyght/ +
    // query string). When SMOKE_BASE_URL is set (deployed mode), use it as
    // the full URL. Local mode keeps the relative '/' against
    // http://localhost:4567 baseURL.
    await page.goto(process.env.SMOKE_BASE_URL || '/');
    await page.addStyleTag({ content: SETTLE_CSS });
    // Wait for boot self-test setTimeout to fire (DOMContentLoaded + 500ms),
    // which is when BRAIN.selfTest._lastRun gets populated.
    await page.waitForFunction(() => typeof BRAIN !== 'undefined'
      && BRAIN.selfTest && BRAIN.selfTest._lastRun, { timeout: 5000 });
    // Dismiss the splash screen (overlay at z-index 500 covers the app).
    // splashTap() routes to showMain() when txns exist (fixture has 16+).
    await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  });

  test('Math Health "View detailed checks" — tap expands, tap collapses', async ({ page }) => {
    // Navigate Settings → Diagnostics
    await page.evaluate(() => {
      goPage('pg-settings');
      openSettingsCategory('sub-diagnostics');
      // Force the new Bundle 30 cards to populate (renderAll fires
      // renderBootSelfTest/renderDevInspect only when settings is active)
      if (typeof renderAll === 'function') renderAll();
      if (typeof renderMathHealth === 'function') renderMathHealth();
      if (typeof renderBootSelfTest === 'function') renderBootSelfTest();
      if (typeof renderDevInspect === 'function') renderDevInspect();
    });
    // Wait for sub-diagnostics to have the settings-active class +
    // be actually visible per CSS (visibility no longer hidden).
    await page.waitForFunction(() => {
      const el = document.getElementById('sub-diagnostics');
      if (!el) return false;
      if (!el.classList.contains('settings-active')) return false;
      const cs = window.getComputedStyle(el);
      return cs.visibility !== 'hidden';
    }, { timeout: 3000 });
    // Wait for Math Health card to render with the expand button
    const expandBtn = page.locator('#sub-math-health-content button:has-text("View detailed checks")');
    await expect(expandBtn).toBeVisible({ timeout: 3000 });

    // Pane starts hidden
    const pane = page.locator('#sub-math-health-content .detail-pane').first();
    await expect(pane).toBeHidden();
    await captureState(page, {
      label: 'pre-tap',
      featurePath: 'UI → SETTINGS → DIAGNOSTICS → MATH_HEALTH_CARD → VIEW_DETAILED_CHECKS_EXPAND',
      specFile: SPEC_FILE, specLine: 96,
      codeUnderTest: 'Math Health card rendered; expand button visible; detail pane hidden (initial state)',
      expectedState: '#sub-math-health-content button has-text "View detailed checks"; .detail-pane display:none',
      clipTo: '#sub-math-health-content',
      knownStateNotes: FIXTURE_MATH_HEALTH_NOTES,
    });

    // Tap → expands within 100ms
    await expandBtn.click();
    await expect(pane).toBeVisible({ timeout: 100 });
    await captureState(page, {
      label: 'post-expand',
      featurePath: 'UI → SETTINGS → DIAGNOSTICS → MATH_HEALTH_CARD → VIEW_DETAILED_CHECKS_EXPAND',
      specFile: SPEC_FILE, specLine: 100,
      codeUnderTest: 'expandBtn.click() — _toggleDetailPane(this) fires',
      expectedState: '.detail-pane display:block; 16 invariants listed by name + tier + pass/fail',
      clipTo: '#sub-math-health-content',
      knownStateNotes: FIXTURE_MATH_HEALTH_NOTES,
    });

    // Tap again → collapses within 100ms
    await expandBtn.click();
    await expect(pane).toBeHidden({ timeout: 100 });
    await captureState(page, {
      label: 'post-collapse',
      featurePath: 'UI → SETTINGS → DIAGNOSTICS → MATH_HEALTH_CARD → VIEW_DETAILED_CHECKS_EXPAND',
      specFile: SPEC_FILE, specLine: 104,
      codeUnderTest: 'expandBtn.click() second time — toggle back to hidden',
      expectedState: '.detail-pane display:none again (toggle round-trip clean)',
      clipTo: '#sub-math-health-content',
      knownStateNotes: FIXTURE_MATH_HEALTH_NOTES,
    });
  });

  test('Boot Self-Test "View detailed checks" — tap expands, tap collapses', async ({ page }) => {
    await page.evaluate(() => {
      goPage('pg-settings');
      openSettingsCategory('sub-diagnostics');
      // Force the new Bundle 30 cards to populate (renderAll fires
      // renderBootSelfTest/renderDevInspect only when settings is active)
      if (typeof renderAll === 'function') renderAll();
      if (typeof renderMathHealth === 'function') renderMathHealth();
      if (typeof renderBootSelfTest === 'function') renderBootSelfTest();
      if (typeof renderDevInspect === 'function') renderDevInspect();
    });
    // Wait for sub-diagnostics to have the settings-active class +
    // be actually visible per CSS (visibility no longer hidden).
    await page.waitForFunction(() => {
      const el = document.getElementById('sub-diagnostics');
      if (!el) return false;
      if (!el.classList.contains('settings-active')) return false;
      const cs = window.getComputedStyle(el);
      return cs.visibility !== 'hidden';
    }, { timeout: 3000 });

    const expandBtn = page.locator('#sub-boot-test-content button:has-text("View detailed checks")');
    await expect(expandBtn).toBeVisible({ timeout: 3000 });

    const pane = page.locator('#sub-boot-test-content .detail-pane').first();
    await expect(pane).toBeHidden();
    await captureState(page, {
      label: 'pre-tap',
      featurePath: 'UI → SETTINGS → DIAGNOSTICS → BOOT_SELF_TEST_CARD → VIEW_DETAILED_CHECKS_EXPAND',
      specFile: SPEC_FILE, specLine: 132,
      codeUnderTest: 'Boot Self-Test card rendered; expand button visible; detail pane hidden',
      expectedState: 'card headline shows green checkmark with "All N boot self-test checks passing" where N is the current count of BRAIN.selfTest entries; expand button present below; detail pane hidden',
      clipTo: '#sub-boot-test-content',
    });

    await expandBtn.click();
    await expect(pane).toBeVisible({ timeout: 100 });
    await captureState(page, {
      label: 'post-expand',
      featurePath: 'UI → SETTINGS → DIAGNOSTICS → BOOT_SELF_TEST_CARD → VIEW_DETAILED_CHECKS_EXPAND',
      specFile: SPEC_FILE, specLine: 135,
      codeUnderTest: 'expandBtn.click() — _toggleDetailPane(this) fires',
      expectedState: '.detail-pane visible (display:block); boot self-test checks listed as rows each with green ✓ + check name + tier; "View detailed checks" button still present at top',
      clipTo: '#sub-boot-test-content',
    });

    await expandBtn.click();
    await expect(pane).toBeHidden({ timeout: 100 });
    await captureState(page, {
      label: 'post-collapse',
      featurePath: 'UI → SETTINGS → DIAGNOSTICS → BOOT_SELF_TEST_CARD → VIEW_DETAILED_CHECKS_EXPAND',
      specFile: SPEC_FILE, specLine: 138,
      codeUnderTest: 'expandBtn.click() second time — toggle back to hidden',
      expectedState: '.detail-pane display:none again (toggle round-trip clean)',
      clipTo: '#sub-boot-test-content',
    });
  });

  test('Dev Inspect — tappable check renders output within 100ms', async ({ page }) => {
    await page.evaluate(() => {
      goPage('pg-settings');
      openSettingsCategory('sub-diagnostics');
      // Force the new Bundle 30 cards to populate (renderAll fires
      // renderBootSelfTest/renderDevInspect only when settings is active)
      if (typeof renderAll === 'function') renderAll();
      if (typeof renderMathHealth === 'function') renderMathHealth();
      if (typeof renderBootSelfTest === 'function') renderBootSelfTest();
      if (typeof renderDevInspect === 'function') renderDevInspect();
    });
    // Wait for sub-diagnostics to have the settings-active class +
    // be actually visible per CSS (visibility no longer hidden).
    await page.waitForFunction(() => {
      const el = document.getElementById('sub-diagnostics');
      if (!el) return false;
      if (!el.classList.contains('settings-active')) return false;
      const cs = window.getComputedStyle(el);
      return cs.visibility !== 'hidden';
    }, { timeout: 3000 });

    // Find first Dev Inspect check button (renders as ▸ <name>)
    const firstCheck = page.locator('#sub-dev-inspect-buttons button').first();
    await expect(firstCheck).toBeVisible({ timeout: 3000 });

    const output = page.locator('#sub-dev-inspect-output');
    const initial = await output.textContent();
    await captureState(page, {
      label: 'pre-tap',
      featurePath: 'UI → SETTINGS → DIAGNOSTICS → DEV_INSPECT_CARD → CHECK_BUTTON_<N>',
      specFile: SPEC_FILE, specLine: 168,
      codeUnderTest: 'Dev Inspect card rendered; check buttons listed; output area shows placeholder',
      expectedState: '8 buttons (one per BRAIN.devInspect.checks entry); output area "Tap a check button..."',
      clipTo: '#sub-dev-inspect-card, .settings-group-card:has(#sub-dev-inspect-buttons)',
    });

    await firstCheck.click();
    // Output should change within 100ms (the runtime check writes synchronously)
    await expect(async () => {
      const after = await output.textContent();
      expect(after).not.toBe(initial);
      expect(after).toMatch(/→/); // result line marker
    }).toPass({ timeout: 100 });
    await captureState(page, {
      label: 'post-tap',
      featurePath: 'UI → SETTINGS → DIAGNOSTICS → DEV_INSPECT_CARD → CHECK_BUTTON_<N>',
      specFile: SPEC_FILE, specLine: 173,
      codeUnderTest: 'firstCheck.click() — runDevInspectCheck(name) → BRAIN.devInspect.run(name)',
      expectedState: '#sub-dev-inspect-output contains "[<time>] BRAIN.balance.get()\\n→ <number>"',
      clipTo: '#sub-dev-inspect-output',
    });
  });

  test('Pre-bundle-30 snapshot reachable via SNAPSHOTS.load (deploy-state sanity)', async ({ page }) => {
    // Quick check the BRAIN.balance scaffold + snapshot init actually fired.
    // If this fails, the deployed code doesn't include Phase 1 Commit 1.A.
    const found = await page.evaluate(() => {
      if (typeof SNAPSHOTS === 'undefined') return { ok: false, reason: 'SNAPSHOTS undefined' };
      const snaps = SNAPSHOTS.load() || [];
      const hit = snaps.find(s => s && s.reason === 'pre-bundle-30');
      return hit
        ? { ok: true, tagged: !!hit.tagged }
        : { ok: false, reason: 'no pre-bundle-30 snapshot found' };
    });
    expect(found.ok, found.reason || 'pre-bundle-30 snapshot missing').toBe(true);
    expect(found.tagged, 'snapshot should be pinned/tagged so eviction cannot sweep it').toBe(true);
    await captureState(page, {
      label: 'snapshot-found',
      featurePath: 'UI → SETTINGS → DATA_AND_BACKUP → SNAPSHOTS → PRE_BUNDLE_30_ENTRY',
      specFile: SPEC_FILE, specLine: 191,
      codeUnderTest: 'SNAPSHOTS.load().find(s => s.reason === "pre-bundle-30")',
      expectedState: 'snapshot entry exists with tagged:true; state_snapshot reflects pinned entry',
      clipTo: null,  // logic-only test — no UI to clip
    });
  });

  test('BRAIN.balance.get() === getLiveBal() alias contract holds', async ({ page }) => {
    const match = await page.evaluate(() => {
      if (typeof BRAIN === 'undefined' || !BRAIN.balance) return null;
      return { a: BRAIN.balance.get(), b: getLiveBal(), bal: S.bal };
    });
    expect(match, 'BRAIN.balance missing').not.toBeNull();
    expect(match.a).toBe(match.b);
    expect(match.a).toBe(match.bal);
    await captureState(page, {
      label: 'alias-contract',
      featurePath: 'BRAIN → BALANCE → GET',
      specFile: SPEC_FILE, specLine: 200,
      codeUnderTest: 'BRAIN.balance.get() === getLiveBal() === S.bal (three-way equality)',
      expectedState: 'state_snapshot.bal === BRAIN.balance.get() return value (logic-only)',
      clipTo: null,
    });
  });
});
