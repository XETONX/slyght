// P0-3a regression test — local-ISO date helpers prevent Sydney TZ off-by-one.
//
// Before fix: `new Date(year, month, day).toISOString().slice(0,10)` produces
// the UTC calendar day, which is the PREVIOUS day in Sydney AEST (UTC+10) for
// any local-midnight date — local 2026-05-15 00:00 AEST = UTC 2026-05-14 14:00
// → ISO slice = "2026-05-14". Cycle dates land off-by-one.
//
// After fix: toLocalISODate(d) reads d.getFullYear/getMonth/getDate directly,
// encoding the local calendar day without UTC round-trip.
//
// Pinned oracle: live-2026-05-23.json. Time frozen to local 2026-05-23 22:00
// AEST (UTC 12:00 same day) — guarantees the UTC shift bug is reproducible
// against a known-correct expected day.

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

// Force Sydney TZ on the browser context so local-midnight dates exhibit
// the off-by-one (or correctly avoid it post-fix).
test.use({
  timezoneId: 'Australia/Sydney',
  locale: 'en-AU',
});

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
  await page.waitForFunction(() => typeof toLocalISODate === 'function'
    && typeof _isoToday === 'function'
    && typeof _emptyActivePlan === 'function', { timeout: 5000 });
  await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page.evaluate(() => {
    const modal = document.getElementById('eod-recon-modal');
    if (modal && modal.classList.contains('open') && typeof eodReconAccept === 'function') eodReconAccept();
  });
}

test.describe('P0-3a — local-ISO date helpers (no Sydney TZ off-by-one)', () => {
  test.beforeEach(({ page, context }) => boot(page, context));

  // Case 1 — toLocalISODate directly: known-input → known-output, no TZ shift.
  test('Case 1: toLocalISODate encodes local calendar day, not UTC', async ({ page }) => {
    const result = await page.evaluate(() => ({
      may15: toLocalISODate(new Date(2026, 4, 15)),        // local 2026-05-15 00:00 AEST
      jun15: toLocalISODate(new Date(2026, 5, 15)),        // local 2026-06-15 00:00 AEST
      jan01: toLocalISODate(new Date(2026, 0, 1)),         // local 2026-01-01 00:00 AEDT
      dec31: toLocalISODate(new Date(2026, 11, 31)),       // local 2026-12-31 00:00 AEDT
      twoDigitMonth: toLocalISODate(new Date(2026, 8, 5)),  // local 2026-09-05 (Sep)
      twoDigitDay: toLocalISODate(new Date(2026, 4, 3)),    // local 2026-05-03
    }));
    expect(result.may15).toBe('2026-05-15');
    expect(result.jun15).toBe('2026-06-15');
    expect(result.jan01).toBe('2026-01-01');
    expect(result.dec31).toBe('2026-12-31');
    expect(result.twoDigitMonth).toBe('2026-09-05'); // zero-padded month
    expect(result.twoDigitDay).toBe('2026-05-03');   // zero-padded day
  });

  // Case 2 — _isoToday matches the local calendar day in Sydney at the frozen
  // time (2026-05-23 22:00 AEST). Pre-fix would be UTC = "2026-05-23" anyway
  // because 22:00 + 10 hours = 08:00 UTC next day... no wait, 22:00 AEST IS
  // UTC 12:00 same day, so no shift here. Use Case 3 for the off-by-one anchor.
  test('Case 2: _isoToday returns local day in Sydney at 22:00 AEST', async ({ page }) => {
    const today = await page.evaluate(() => _isoToday());
    expect(today).toBe('2026-05-23');
  });

  // Case 3 — _emptyActivePlan cycle dates use local calendar day (the bug anchor).
  // At frozen 2026-05-23 22:00 AEST, _resolvePreviousPayday returns local
  // 2026-05-15 00:00 AEST. Pre-fix: toISOString().slice(0,10) = "2026-05-14"
  // (UTC shift). Post-fix: toLocalISODate = "2026-05-15" (correct).
  test('Case 3: _emptyActivePlan cycle dates encode local day, no UTC shift', async ({ page }) => {
    const plan = await page.evaluate(() => _emptyActivePlan());
    expect(plan.cycleStartDate).toBe('2026-05-15');
    expect(plan.cycleEndDate).toBe('2026-06-15');
    expect(plan.cycleId).toBe('2026-05-15');

    // Negative — none of these are the pre-fix shifted form
    expect(plan.cycleStartDate).not.toBe('2026-05-14');
    expect(plan.cycleEndDate).not.toBe('2026-06-14');
  });

  // Case 4 — guard against future regression: the raw .toISOString().slice(0,10)
  // pattern would have produced shifted dates; assert the helper produces
  // a strictly different output for any local-midnight Date constructed via
  // (year, month, day).
  test('Case 4: helper and raw-iso-slice diverge on local-midnight dates', async ({ page }) => {
    const result = await page.evaluate(() => {
      const d = new Date(2026, 4, 15); // local 2026-05-15 00:00 AEST
      return {
        local: toLocalISODate(d),
        rawIso: d.toISOString().slice(0, 10),
      };
    });
    // Local helper produces correct day; raw ISO slice is one day earlier
    expect(result.local).toBe('2026-05-15');
    expect(result.rawIso).toBe('2026-05-14');
    expect(result.local).not.toBe(result.rawIso);
  });
});
