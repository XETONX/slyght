// Bundle 31 Phase 3A — Item 3: Essential vs Discretionary cycle-bound smoke.
//
// Why: pre-fix, the Essential vs Discretionary card iterated lifetime S.txns
// and produced impossible totals (John 2026-05-19 gut-audit: $15k essential+
// discretionary on a $4,578 cycle spend). The fix at index.html:5917-5927
// scopes the iteration to MODEL.cycleStart..now. OPEN-BUGS #6 part-A.
//
// What this asserts:
//   1. The rendered card amounts MATCH a cycle-bound filter (regression-
//      locks that the fix is in effect).
//   2. Bug surface is exercised reliably — the test INJECTS a synthetic
//      pre-cycle Food/Coffee txn for $1000 so we don't depend on the
//      fixture having sizeable pre-cycle data on the essential side.
//      A reverted fix would re-include the $1000 and the rendered
//      Essential amount would balloon — caught by the negative assertion.
//
// Run:
//   npm run smoke
//   $env:SMOKE_BASE_URL="https://xetonx.github.io/slyght/?cb=<SHA>"; npm run smoke

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { captureState } = require('../helpers/capture-state');

const FIXTURE_PATH = path.resolve(__dirname, '../../state-snapshot.json');
const FROZEN_ISO = '2026-05-05T22:00:00+10:00';
const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
const SPEC_FILE = 'tests/smoke/analysis-essentials.smoke.js';

// Synthetic pre-cycle txn: dated 2026-03-05 (60 days before the frozen
// test time, well before MODEL.cycleStart for a payday-15 user starting
// May 5). Food/Coffee is in ESSENTIAL_KEYS so it lands on the Essential
// side of the breakdown. $1000 is large enough to be unambiguously
// visible against any plausible fixture noise.
const SYNTHETIC_PRECYCLE_TXN = {
  id: 999000001,
  ts: new Date('2026-03-05T10:00:00+10:00').getTime(),
  amt: 1000,
  cat: 'Food / Coffee',
  note: 'BUNDLE 31 SMOKE — synthetic pre-cycle (excluded by cycle bound)',
  income: false,
};

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

test.describe('Bundle 31 Phase 3A — Analysis Essential vs Discretionary cycle-bound', () => {
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
    await page.waitForFunction(() => typeof MODEL !== 'undefined'
      && MODEL.cycleStart
      && typeof renderAnalysisTab === 'function', { timeout: 5000 });
    await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  });

  test('Essential vs Discretionary card excludes pre-cycle synthetic txn', async ({ page }) => {
    // Phase 1: inject synthetic, then compute both lifetime and cycle-bound
    // expectations in test-space so we know exactly what the renderer should
    // produce post-fix vs pre-fix.
    const data = await page.evaluate((synthetic) => {
      // Inject synthetic txn directly (test scaffolding — bypasses canonical
      // writer because we need a specific pre-cycle timestamp).
      S.txns = S.txns || [];
      S.txns.push(synthetic);

      const ESSENTIAL_KEYS = ['Fixed','Loan','Transport / Fuel','Food / Coffee','Health','Savings'];
      const cycleStartMs = MODEL.cycleStart.getTime();
      let lifeEss = 0, lifeDisc = 0, cycleEss = 0, cycleDisc = 0;
      let preCycleCount = 0;
      (S.txns || []).forEach(t => {
        if (t.income || t.cat === 'Debt repayment') return;
        const k = t.cat || 'Other';
        const isEss = ESSENTIAL_KEYS.includes(k) || k === 'Fuel';
        if (isEss) lifeEss += t.amt; else lifeDisc += t.amt;
        if (t.ts >= cycleStartMs) {
          if (isEss) cycleEss += t.amt; else cycleDisc += t.amt;
        } else {
          preCycleCount++;
        }
      });
      return {
        lifeEss: parseFloat(lifeEss.toFixed(2)),
        lifeDisc: parseFloat(lifeDisc.toFixed(2)),
        cycleEss: parseFloat(cycleEss.toFixed(2)),
        cycleDisc: parseFloat(cycleDisc.toFixed(2)),
        cycleStartMs,
        cycleStartIso: new Date(cycleStartMs).toISOString(),
        txnTotal: S.txns.length,
        preCycleCount,
        syntheticTs: synthetic.ts,
        syntheticIso: new Date(synthetic.ts).toISOString(),
        syntheticIsPreCycle: synthetic.ts < cycleStartMs,
      };
    }, SYNTHETIC_PRECYCLE_TXN);

    // Sanity: synthetic landed pre-cycle.
    expect(data.syntheticIsPreCycle, `synthetic ts ${data.syntheticIso} should be before cycleStart ${data.cycleStartIso}`).toBe(true);
    expect(data.preCycleCount).toBeGreaterThan(0);
    // Bug surface guarantee: synthetic puts at least $1000 in lifeEss that
    // shouldn't appear in cycleEss. Pre-fix renderer would include it.
    expect(data.lifeEss - data.cycleEss).toBeGreaterThanOrEqual(999);

    // Phase 2: trigger the renderer.
    await page.evaluate(() => { renderAnalysisTab(); });

    // Phase 3: read rendered amounts from the Essential vs Discretionary card.
    const rendered = await page.evaluate(() => {
      const cards = document.querySelectorAll('#analysis-content .card');
      for (const c of cards) {
        const title = c.querySelector('.card-title');
        if (title && title.textContent.trim() === 'Essential vs Discretionary') {
          const monoEls = c.querySelectorAll('div[style*="font-family:var(--mono)"]');
          const amounts = Array.from(monoEls)
            .map(el => el.textContent.trim())
            .filter(s => /^-?\$/.test(s));
          return { found: true, amounts };
        }
      }
      return { found: false, contentLen: (document.getElementById('analysis-content') || {}).innerHTML?.length || 0 };
    });

    expect(rendered.found, 'Essential vs Discretionary card not in #analysis-content after renderAnalysisTab()').toBe(true);
    expect(rendered.amounts.length).toBeGreaterThanOrEqual(2);

    const parseFmt = s => parseFloat(s.replace(/[$,]/g, ''));
    const renderedEss = parseFmt(rendered.amounts[0]);
    const renderedDisc = parseFmt(rendered.amounts[1]);

    // Positive assertion: renderer matches cycle-bound math (synthetic excluded).
    expect(Math.abs(renderedEss - Math.round(data.cycleEss)),
      `renderedEss ${renderedEss} should match cycleEss ${Math.round(data.cycleEss)} within $1 (lifetime would have been ${Math.round(data.lifeEss)})`
    ).toBeLessThanOrEqual(1);
    expect(Math.abs(renderedDisc - Math.round(data.cycleDisc)),
      `renderedDisc ${renderedDisc} should match cycleDisc ${Math.round(data.cycleDisc)} within $1`
    ).toBeLessThanOrEqual(1);

    // Negative assertion (revert guard): renderedEss must NOT include the
    // $1000 synthetic. If someone reverts the cycle filter, this fails loud.
    expect(renderedEss,
      `renderedEss ${renderedEss} matches lifetime sum (${Math.round(data.lifeEss)}) — cycle filter may have been reverted`
    ).toBeLessThan(Math.round(data.lifeEss) - 500);

    await captureState(page, {
      label: 'cycle-bound-essentials-rendered',
      featurePath: 'UI → ANALYSIS_TAB → ESSENTIAL_VS_DISCRETIONARY_CARD',
      specFile: SPEC_FILE, specLine: 110,
      codeUnderTest: `renderAnalysisTab() with cycle-bound essentials filter at index.html:5922 (Bundle 31 Item 3); synthetic $1000 Food/Coffee txn injected at ${data.syntheticIso}, cycleStart ${data.cycleStartIso}`,
      expectedState: `Essential=$${Math.round(data.cycleEss)}, Discretionary=$${Math.round(data.cycleDisc)} — synthetic pre-cycle $1000 correctly excluded (lifetime would have been Essential=$${Math.round(data.lifeEss)}, Discretionary=$${Math.round(data.lifeDisc)})`,
      clipTo: null,
    });
  });
});
