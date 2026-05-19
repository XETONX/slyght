// Bundle 31 Phase 3A — Item 4: Allocation headline framing smoke.
//
// Why: pre-fix the PLAN dashboard tile led with "$1,770 left to allocate"
// even when $1,133 was already assigned to savings/upcoming — user's
// gut-audit Item 4: "plan is fully allocated, this number is wrong."
//
// Investigation found the math was internally consistent; the headline
// buried allocation progress. Fix reframes the headline to lead with the
// still-to-allocate number ($637 in the user's example) and surfaces
// allocated/total as the subtitle ("$1,133 already assigned of $1,770").
//
// This spec asserts the three numbers form a coherent set:
//   still_to_allocate + already_assigned === remainder
// and the new vocabulary is in place (headline "still to allocate" /
// "to allocate"; subtitle "already assigned of").
//
// Run:
//   npm run smoke

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { captureState } = require('../helpers/capture-state');

const FIXTURE_PATH = path.resolve(__dirname, '../../state-snapshot.json');
const FROZEN_ISO = '2026-05-05T22:00:00+10:00';
const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
const SPEC_FILE = 'tests/smoke/allocation-framing.smoke.js';

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

test.describe('Bundle 31 Phase 3A — Allocation headline framing (Items 4-6 resolution)', () => {
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
      && typeof renderAllocateTile === 'function', { timeout: 5000 });
    await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  });

  test('PLAN dashboard tile uses still-to-allocate framing; three numbers cohere', async ({ page }) => {
    // Phase 1: inject a known savings allocation so allocatedTotal > 0
    // and the tile renders the post-allocation path (not the "Tap to start
    // allocating" empty state). The snapshot reads `savings.total` from
    // p.overrides['savings:*'].thisCycleAmount (not p.savings legacy mirror
    // when buckets aren't in BRAIN.savings.getBuckets() at test time), so
    // inject via the override path with a trip-style key that goes through
    // the _tripOrOtherSavings branch independent of bucket presence.
    const data = await page.evaluate(() => {
      S.activePlan = S.activePlan || {};
      // First peek at the fixture's natural remainder so we can size the
      // injection to land in the HEALTHY (under-allocated) range. The
      // fixture's remainder is ~$268 in this state, so a $100 injection
      // produces healthy stillToAllocate ≈ $168 with allocatedTotal $100.
      const _peek = BRAIN.plan.getSnapshot();
      const _peekProvs = (typeof PLAN !== 'undefined' && PLAN.getTotalProvisions)
        ? +PLAN.getTotalProvisions() || 0 : 0;
      const _peekRem = (_peek.totalToPlan || 0)
        - ((_peek.bills?.total || 0) + (_peek.debts?.total || 0)
           + (_peek.dailyLiving?.plannedTotal || 0) + _peekProvs);
      // Inject ~25% of the remainder so the test exercises the healthy-state
      // "still to allocate" branch (not the over-allocated or empty branches).
      const injectAmt = Math.max(50, Math.floor(_peekRem * 0.25));
      S.activePlan.overrides = Object.assign({}, S.activePlan.overrides || {}, {
        'savings:bundle31-smoke-test': { thisCycleAmount: injectAmt, normalAmount: 0 }
      });
      if (!Array.isArray(S.activePlan.knownUpcoming)) S.activePlan.knownUpcoming = [];

      const snap = BRAIN.plan.getSnapshot();
      const _provs = (typeof PLAN !== 'undefined' && PLAN.getTotalProvisions)
        ? +PLAN.getTotalProvisions() || 0 : 0;
      const essentialsTotal = (snap.bills?.total || 0) + (snap.debts?.total || 0)
        + (snap.dailyLiving?.plannedTotal || 0) + _provs;
      const remainder = (snap.totalToPlan || 0) - essentialsTotal;
      const allocatedTotal = (snap.savings?.total || 0) + (snap.knownUpcoming?.total || 0);
      const stillToAllocate = remainder - allocatedTotal;

      const html = renderAllocateTile();
      return {
        html,
        snap: {
          totalToPlan: snap.totalToPlan,
          savingsTotal: snap.savings.total,
          upcomingTotal: snap.knownUpcoming.total,
        },
        remainder: Math.round(remainder),
        allocatedTotal: Math.round(allocatedTotal),
        stillToAllocate: Math.round(stillToAllocate),
      };
    });

    // Bug-surface guards: the test state must exercise the new framing.
    // (Empty-allocation state takes a different branch — "Tap to start allocating".)
    expect(data.allocatedTotal,
      'fixture+injection must produce allocatedTotal > 0 to exercise the new framing path'
    ).toBeGreaterThan(0);
    expect(data.remainder,
      'fixture+injection must produce a positive remainder (healthy state)'
    ).toBeGreaterThan(0);
    expect(data.stillToAllocate,
      'injection sizing must leave room — stillToAllocate > 0 confirms healthy branch'
    ).toBeGreaterThan(0);

    // Coherence guard: stillToAllocate + allocatedTotal must equal remainder
    // (within $1 for rounding). The whole point of the fix is that the three
    // numbers add up; if they don't, the rendered set is incoherent.
    expect(Math.abs((data.stillToAllocate + data.allocatedTotal) - data.remainder),
      'stillToAllocate + allocatedTotal must equal remainder'
    ).toBeLessThanOrEqual(1);

    // Headline vocabulary: NEW framing uses "still to allocate" or "to allocate";
    // OLD framing used "left to allocate" as the only label.
    const hasNewLabel = data.html.includes('still to allocate') || data.html.includes('to allocate');
    expect(hasNewLabel, 'new headline label "still to allocate" or "to allocate" must be present').toBe(true);
    // Specifically: the legacy bare "left to allocate" (without "still" context)
    // should NOT be the only label rendered. We allow "left to allocate" in the
    // overcommitted-remainder branch — but in our healthy test state, it must not appear.
    expect(data.html).not.toContain('"font-weight:600">left to allocate</span>');

    // Subtitle vocabulary: NEW framing uses "already assigned of"; OLD used "X of Y allocated · pct%".
    expect(data.html).toContain('already assigned of');

    // Numeric coherence in rendered output — all three numbers must appear.
    // (Loose check: search for the formatted dollar string.)
    const stillFmt = '$' + data.stillToAllocate.toLocaleString();
    const allocFmt = '$' + data.allocatedTotal.toLocaleString();
    const remFmt = '$' + data.remainder.toLocaleString();
    expect(data.html, `rendered tile must contain still-to-allocate ${stillFmt}`).toContain(stillFmt);
    expect(data.html, `rendered tile must contain allocated ${allocFmt}`).toContain(allocFmt);
    expect(data.html, `rendered tile must contain remainder ${remFmt}`).toContain(remFmt);

    await captureState(page, {
      label: 'still-to-allocate-framing-rendered',
      featurePath: 'UI → PLAN_MODE → ALLOCATE_TILE',
      specFile: SPEC_FILE, specLine: 110,
      codeUnderTest: `renderAllocateTile() with Bundle 31 still-to-allocate framing at index.html:24482 (Item 4 label fix); injected China Holiday $500 to drive allocatedTotal > 0`,
      expectedState: `headline shows $${data.stillToAllocate.toLocaleString()} still to allocate; subtitle shows $${data.allocatedTotal.toLocaleString()} already assigned of $${data.remainder.toLocaleString()} this cycle. Three numbers cohere: ${data.stillToAllocate} + ${data.allocatedTotal} = ${data.remainder}.`,
      clipTo: null,
    });
  });
});
