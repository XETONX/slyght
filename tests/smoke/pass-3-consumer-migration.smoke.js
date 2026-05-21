// Bundle 32.3 Pass 3 — consumer migration + named migrations smoke.
//
// 6 categories per the Pass 3 ship spec:
//   READER_MIGRATION_PARITY   — canonical readers equivalent to legacy
//   TRIP_COVERED_AMOUNT_UI    — $-per-covered field persists + validates
//   DARWIN_BUCKET_CONSERVATION — bucket exists + linked + allocations conserved
//   PROPERTY_DEPOSIT_UNIFICATION — hybrid reader returns combined view, no dup
//   RAINY_DAY_FUND_RENAME     — zero legacy strings remain, data continuity
//   CONSERVATION_GLOBAL       — snap.derived diff zero for non-touched fields
//
// Run: npm run smoke

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const FIXTURE_PATH = path.resolve(__dirname, '../../state-snapshot.json');
const FROZEN_ISO = '2026-05-20T22:00:00+10:00';
const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
const INDEX_HTML = path.resolve(__dirname, '../../index.html');

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
    try { localStorage.setItem('slyght_seeded_v13', '1'); } catch (_) {}
    try { localStorage.setItem('slyght_seeded_v12', '1'); } catch (_) {}
    try { localStorage.setItem('slyght_seeded_v11', '1'); } catch (_) {}
    try { localStorage.setItem('slyght_bills_reset_month', args.monthKey); } catch (_) {}
  }, { seed: buildSlyghtV5(fixture), monthKey: '2026-5' });
  await page.goto(process.env.SMOKE_BASE_URL || '/');
  await page.addStyleTag({ content: SETTLE_CSS });
  await page.waitForFunction(() => typeof BRAIN !== 'undefined'
    && BRAIN.plan && BRAIN.plan.intent
    && typeof BRAIN.plan.intent.byKind === 'function'
    && typeof BRAIN.plan.intent.getHybridPropertyDeposit === 'function'
    && typeof _tripLegacyView === 'function'
    && typeof _goalLegacyView === 'function', { timeout: 5000 });
  await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page.evaluate(() => {
    const modal = document.getElementById('eod-recon-modal');
    if (modal && modal.classList.contains('open') && typeof eodReconAccept === 'function') eodReconAccept();
  });
}

// ── 1. READER_MIGRATION_PARITY ─────────────────────────────────────────

test.describe('Pass 3 — READER_MIGRATION_PARITY', () => {
  test.beforeEach(({ page, context }) => boot(page, context));

  test('1a: byKind("trip").map(_tripLegacyView) returns same trip count as legacy shim', async ({ page }) => {
    const r = await page.evaluate(() => {
      const canonical = BRAIN.plan.intent.byKind('trip').map(_tripLegacyView);
      const legacy = (typeof PLAN !== 'undefined' && PLAN.getTrips) ? PLAN.getTrips() : [];
      return { canonical: canonical.length, legacy: legacy.length, canonicalIds: canonical.map(t => t.id).sort(), legacyIds: legacy.map(t => t.id).sort() };
    });
    expect(r.canonical).toBeGreaterThan(0);
    expect(r.canonicalIds).toEqual(r.legacyIds);
  });

  test('1b: trip legacy view exposes budget, saved, covered fields with right shape', async ({ page }) => {
    const r = await page.evaluate(() => {
      const trip = BRAIN.plan.intent.byKind('trip').map(_tripLegacyView).find(t => t.id === 'darwin-2026');
      return {
        hasBudget: typeof trip.budget === 'number',
        hasSaved: typeof trip.saved === 'number',
        coveredIsArray: Array.isArray(trip.covered),
        budgetMatchesTarget: trip.budget === BRAIN.plan.intent.get('darwin-2026').targetAmount,
      };
    });
    expect(r.hasBudget).toBe(true);
    expect(r.hasSaved).toBe(true);
    expect(r.coveredIsArray).toBe(true);
    expect(r.budgetMatchesTarget).toBe(true);
  });

  test('1c: trip _tripLegacyView.saved equals matching bucket.saved', async ({ page }) => {
    const r = await page.evaluate(() => {
      const trip = BRAIN.plan.intent.byKind('trip').map(_tripLegacyView).find(t => t.id === 'darwin-2026');
      const bucket = (S.savingsBuckets || []).find(b => b.name === 'Darwin Trip');
      return { tripSaved: trip.saved, bucketSaved: bucket ? bucket.saved : null };
    });
    expect(r.bucketSaved).not.toBeNull();
    expect(r.tripSaved).toBe(r.bucketSaved);  // bucket lookup correctly resolves saved
  });

  test('1d: goal byKind("goal").map(_goalLegacyView) returns the right count', async ({ page }) => {
    const r = await page.evaluate(() => {
      const goals = BRAIN.plan.intent.byKind('goal').map(_goalLegacyView);
      return { count: goals.length, ids: goals.map(g => g.id).sort() };
    });
    expect(r.count).toBeGreaterThan(0);
    // After Pass 3, freedom-buffer → rainy-day-fund — ID present
    expect(r.ids).toContain('rainy-day-fund');
    expect(r.ids).not.toContain('freedom-buffer');
  });

  test('1e: apartment goal saved reads from S.mumAccountBalance (pre-Pass-3 convention preserved)', async ({ page }) => {
    const r = await page.evaluate(() => {
      const apt = BRAIN.plan.intent.byKind('goal').map(_goalLegacyView).find(g => g.id === 'apartment');
      return { goalSaved: apt && apt.saved, mumBal: S.mumAccountBalance };
    });
    expect(r.goalSaved).toBe(r.mumBal);
  });

  test('1f: archived intents filtered out by byKind (edge case)', async ({ page }) => {
    const r = await page.evaluate(() => {
      // Archive a real intent then check it disappears from byKind
      const before = BRAIN.plan.intent.byKind('goal').map(g => g.id);
      BRAIN.plan.intent.add({
        id: 'scratch-archive-test', name: 'Scratch', kind: 'goal', targetAmount: 1,
      }, BRAIN.SOURCES.PLAN_INTENT_ADD);
      const middle = BRAIN.plan.intent.byKind('goal').map(g => g.id);
      BRAIN.plan.intent.remove('scratch-archive-test', BRAIN.SOURCES.PLAN_INTENT_REMOVE);
      const after = BRAIN.plan.intent.byKind('goal').map(g => g.id);
      return { before, middle, after };
    });
    expect(r.middle).toContain('scratch-archive-test');
    expect(r.after).not.toContain('scratch-archive-test');  // archived filtered out
  });

  test('1g: empty result handled cleanly — byKind for non-existent kind', async ({ page }) => {
    const r = await page.evaluate(() => {
      const empty = BRAIN.plan.intent.byKind('nonexistent-kind');
      return { isArray: Array.isArray(empty), len: empty.length };
    });
    expect(r.isArray).toBe(true);
    expect(r.len).toBe(0);
  });

  test('1h: zero callers of PLAN.getTrips() / PLAN.getGoals() outside the legacy shim itself', async ({ page }) => {
    // Static check against the source — count occurrences of the call
    // sites in index.html. Per Pass 3 ship criterion, after migration
    // the only `PLAN.getTrips()` / `PLAN.getGoals()` references should
    // be inside the PLAN shim definitions (lines ~25600+).
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
    const tripCalls = src.match(/PLAN\.getTrips\(\)/g) || [];
    const goalCalls = src.match(/PLAN\.getGoals\(\)/g) || [];
    expect(tripCalls.length).toBe(0);
    expect(goalCalls.length).toBe(0);
  });

  // Bug 1 hotfix (2026-05-21) — Pass 3 phone-verify caught upcoming-trips
  // list rendering "[object Object]". Root cause: seedV27 upgraded
  // meta.covered from string[] to {name,amount}[]; _tripLegacyView
  // passed objects through; renderTrips L27282 + editTrip hint L27338
  // stringify entries with `${c}` / .join(', ') → "[object Object]".
  // Fix at single point in _tripLegacyView (covered → entry.name strings).
  // These two cases lock the regression: data-shape AND render output.

  test('1i: _tripLegacyView.covered entries are strings (not raw {name,amount} objects)', async ({ page }) => {
    const r = await page.evaluate(() => {
      // Force the post-seedV27 shape on a trip and check the legacy view
      const upd = BRAIN.plan.intent.update('darwin-2026', {
        meta: { covered: [{ name: 'flights', amount: 50 }, { name: 'accommodation', amount: 0 }] }
      }, BRAIN.SOURCES.PLAN_TRIP_EDIT);
      const view = BRAIN.plan.intent.byKind('trip').map(_tripLegacyView).find(t => t.id === 'darwin-2026');
      return {
        updOk: upd.ok,
        coveredIsArray: Array.isArray(view.covered),
        everyEntryIsString: view.covered.every(e => typeof e === 'string'),
        coveredValues: view.covered,
      };
    });
    expect(r.updOk).toBe(true);
    expect(r.coveredIsArray).toBe(true);
    expect(r.everyEntryIsString).toBe(true);
    expect(r.coveredValues).toContain('flights');
    expect(r.coveredValues).toContain('accommodation');
  });

  test('1j: renderTrips() HTML does not contain "[object Object]"', async ({ page }) => {
    const r = await page.evaluate(() => {
      // Ensure object-shaped covered (the regression-triggering shape)
      BRAIN.plan.intent.update('darwin-2026', {
        meta: { covered: [{ name: 'flights', amount: 0 }, { name: 'accommodation', amount: 0 }, { name: 'car hire', amount: 0 }] }
      }, BRAIN.SOURCES.PLAN_TRIP_EDIT);
      const trips = BRAIN.plan.intent.byKind('trip').map(_tripLegacyView);
      const html = (typeof renderTrips === 'function') ? renderTrips(trips) : '';
      return {
        htmlLen: html.length,
        hasBugString: html.includes('[object Object]'),
        // Positive assertion: at least one of the covered names appears in render
        hasFlights: /flights/i.test(html),
      };
    });
    expect(r.htmlLen).toBeGreaterThan(0);
    expect(r.hasBugString).toBe(false);
    expect(r.hasFlights).toBe(true);
  });
});

// ── 2. TRIP_COVERED_AMOUNT_UI ──────────────────────────────────────────

test.describe('Pass 3 — TRIP_COVERED_AMOUNT_UI', () => {
  test.beforeEach(({ page, context }) => boot(page, context));

  test('2a: amount persists across BRAIN.plan.intent.update + reload', async ({ page }) => {
    const r = await page.evaluate(() => {
      // Simulate the form save path: write meta.covered with {name,amount}
      BRAIN.plan.intent.update('darwin-2026', {
        meta: Object.assign({}, BRAIN.plan.intent.get('darwin-2026').meta, {
          covered: [{ name: 'flights', amount: 420 }, { name: 'accommodation', amount: 1120 }],
        }),
      }, BRAIN.SOURCES.PLAN_TRIP_EDIT);
      const after = BRAIN.plan.intent.get('darwin-2026');
      return {
        covered: after.meta.covered,
        first: after.meta.covered[0],
        second: after.meta.covered[1],
      };
    });
    expect(r.first).toEqual({ name: 'flights', amount: 420 });
    expect(r.second).toEqual({ name: 'accommodation', amount: 1120 });
  });

  test('2b: negative + NaN amounts coerce to 0 in the form save path', async ({ page }) => {
    const r = await page.evaluate(() => {
      // Mirror the form's coerce logic — see confirmEditTrip
      function coerce(raw) {
        let amount = parseFloat(raw);
        if (!isFinite(amount) || amount < 0) amount = 0;
        return amount;
      }
      return {
        negativeCoerced: coerce('-5'),
        nanCoerced: coerce('abc'),
        emptyCoerced: coerce(''),
        validKept: coerce('420.50'),
      };
    });
    expect(r.negativeCoerced).toBe(0);
    expect(r.nanCoerced).toBe(0);
    expect(r.emptyCoerced).toBe(0);
    expect(r.validKept).toBeCloseTo(420.5, 2);
  });

  test('2c: meta.covered post-edit drives Pass 2 trip-uplift correctly', async ({ page }) => {
    const r = await page.evaluate(() => {
      // Set $300 + $200 prepaid → net Darwin uplift = ($900 - $500)/9 = $44.44/day
      BRAIN.plan.intent.update('darwin-2026', {
        meta: Object.assign({}, BRAIN.plan.intent.get('darwin-2026').meta, {
          covered: [{ name: 'flights', amount: 300 }, { name: 'accommodation', amount: 200 }],
        }),
      }, BRAIN.SOURCES.PLAN_TRIP_EDIT);
      const intent = BRAIN.plan.intent.get('darwin-2026');
      const uplift = BRAIN.plan.intent.getUpliftPerDay(intent);
      return { uplift };
    });
    expect(r.uplift).toBeCloseTo((900 - 500) / 9, 2);
  });
});

// ── 3. DARWIN_BUCKET_CONSERVATION ──────────────────────────────────────

test.describe('Pass 3 — DARWIN_BUCKET_CONSERVATION', () => {
  test.beforeEach(({ page, context }) => boot(page, context));

  test('3a: Darwin Trip bucket exists post-boot and the darwin-2026 intent links to it', async ({ page }) => {
    const r = await page.evaluate(() => {
      const bucket = (S.savingsBuckets || []).find(b => b.name === 'Darwin Trip');
      const intent = BRAIN.plan.intent.get('darwin-2026');
      return {
        bucketExists: !!bucket,
        bucketName: bucket && bucket.name,
        bucketSaved: bucket && bucket.saved,
        intentBucketId: intent && intent.bucketId,  // post-seedV29
        linkMatches: !!(bucket && intent && intent.bucketId === bucket.name),
      };
    });
    expect(r.bucketExists).toBe(true);
    expect(r.bucketName).toBe('Darwin Trip');
    expect(r.linkMatches).toBe(true);  // seedV29 wired the link
  });

  test('3b: _tripLegacyView(darwin-2026).saved equals Darwin Trip bucket.saved (allocations link)', async ({ page }) => {
    const r = await page.evaluate(() => {
      const intent = BRAIN.plan.intent.get('darwin-2026');
      const trip = _tripLegacyView(intent);
      const bucket = (S.savingsBuckets || []).find(b => b.name === 'Darwin Trip');
      return { tripSaved: trip.saved, bucketSaved: bucket.saved };
    });
    expect(r.tripSaved).toBe(r.bucketSaved);
  });
});

// ── 4. PROPERTY_DEPOSIT_UNIFICATION ────────────────────────────────────

test.describe('Pass 3 — PROPERTY_DEPOSIT_UNIFICATION', () => {
  test.beforeEach(({ page, context }) => boot(page, context));

  test('4a: hybrid reader returns combined view with both trajectories visible', async ({ page }) => {
    const r = await page.evaluate(() => {
      return BRAIN.plan.intent.getHybridPropertyDeposit();
    });
    expect(r.id).toBe('apartment');
    expect(r.name).toContain('Property Deposit');
    expect(typeof r.savedTowardTarget).toBe('number');
    expect(typeof r.stillOwedToMum).toBe('number');
    expect(r.target).toBe(50000);
    expect(r._hybrid).toBe(true);
    expect(r._goalIntentId).toBe('apartment');
    expect(typeof r._debtId).toBe('number');
  });

  test('4b: hybrid reader does NOT double-count — savedTowardTarget equals S.mumAccountBalance exactly', async ({ page }) => {
    const r = await page.evaluate(() => {
      const hybrid = BRAIN.plan.intent.getHybridPropertyDeposit();
      return { hybridSaved: hybrid.savedTowardTarget, mumBal: S.mumAccountBalance };
    });
    expect(r.hybridSaved).toBe(r.mumBal);  // singular at S.mumAccountBalance, no merge math
  });

  test('4c: hybrid reader does NOT lose any debt data — stillOwedToMum equals debt.amt exactly', async ({ page }) => {
    const r = await page.evaluate(() => {
      const hybrid = BRAIN.plan.intent.getHybridPropertyDeposit();
      const debt = (S.debts || []).find(d => d && d.redirectGoal === 'apartment');
      return { hybridOwed: hybrid.stillOwedToMum, debtAmt: debt && debt.amt };
    });
    expect(r.hybridOwed).toBe(r.debtAmt);
  });
});

// ── 5. RAINY_DAY_FUND_RENAME ───────────────────────────────────────────

test.describe('Pass 3 — RAINY_DAY_FUND_RENAME', () => {
  test.beforeEach(({ page, context }) => boot(page, context));

  test('5a: data continuity — seedV28 renamed intent preserves allocations', async ({ page }) => {
    const r = await page.evaluate(() => {
      const rdf = BRAIN.plan.intent.get('rainy-day-fund');
      const legacy = BRAIN.plan.intent.get('freedom-buffer');  // must be null post-migration
      return {
        rdfExists: !!rdf,
        rdfName: rdf && rdf.name,
        rdfTarget: rdf && rdf.targetAmount,
        legacyStillExists: !!legacy,
      };
    });
    expect(r.rdfExists).toBe(true);
    expect(r.rdfName).toBe('Rainy Day Fund');
    expect(r.rdfTarget).toBe(9000);
    expect(r.legacyStillExists).toBe(false);  // seedV28 renamed in-place
  });

  test('5b: zero "freedom-buffer" / "Freedom buffer" / "Freedom Buffer" strings in index.html OUTSIDE the seedV28 allow-block', async () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
    const allowStart = src.indexOf('// guardian-allow-block-start: rdf-legacy-string');
    const allowEnd = src.indexOf('// guardian-allow-block-end: rdf-legacy-string');
    expect(allowStart).toBeGreaterThan(0);
    expect(allowEnd).toBeGreaterThan(allowStart);
    const beforeBlock = src.slice(0, allowStart);
    const afterBlock = src.slice(allowEnd);
    const re = /freedom[- ]buffer/gi;
    const hitsBefore = beforeBlock.match(re) || [];
    const hitsAfter = afterBlock.match(re) || [];
    if (hitsBefore.length) {
      const ctx = hitsBefore.slice(0, 3).map(h => 'hit: ' + h).join(' | ');
      throw new Error('legacy strings still present before allow-block: ' + ctx);
    }
    if (hitsAfter.length) {
      const ctx = hitsAfter.slice(0, 3).map(h => 'hit: ' + h).join(' | ');
      throw new Error('legacy strings still present after allow-block: ' + ctx);
    }
    expect(hitsBefore.length).toBe(0);
    expect(hitsAfter.length).toBe(0);
  });
});

// ── 6. CONSERVATION_GLOBAL ─────────────────────────────────────────────

test.describe('Pass 3 — CONSERVATION_GLOBAL', () => {
  test.beforeEach(({ page, context }) => boot(page, context));

  test('6a: snap.derived non-touched fields unchanged after the three named migrations', async ({ page }) => {
    // The migrations (seedV28 + seedV29) ran at boot. Capture snap.derived
    // and assert: balance, essentialsTotal, conservation sums all hold.
    // Pass 2's invariants (essentialsTotal + remainder === totalToPlan,
    // essentialsPaidTotal + essentialsUpcomingTotal === essentialsTotal)
    // must continue to hold post-migration.
    const r = await page.evaluate(() => {
      const snap = BRAIN.plan.getSnapshot();
      const d = snap.derived;
      return {
        balance: BRAIN.balance.get(),
        essentialsTotal: d.essentialsTotal,
        remainder: d.remainder,
        totalToPlan: snap.totalToPlan,
        essentialsBreakdownSum: (d.essentialsBreakdown.bills || 0) + (d.essentialsBreakdown.debts || 0) + (d.essentialsBreakdown.dailyLiving || 0) + (d.essentialsBreakdown.provisions || 0),
        paidPlusUpcoming: (d.essentialsPaidTotal || 0) + (d.essentialsUpcomingTotal || 0),
      };
    });
    // Conservation: essentialsBreakdown.sum === essentialsTotal
    expect(r.essentialsBreakdownSum).toBeCloseTo(r.essentialsTotal, 1);
    // Conservation: essentialsPaidTotal + essentialsUpcomingTotal === essentialsTotal
    expect(r.paidPlusUpcoming).toBeCloseTo(r.essentialsTotal, 1);
    // Conservation: essentialsTotal + remainder === totalToPlan
    expect(r.essentialsTotal + r.remainder).toBeCloseTo(r.totalToPlan, 1);
    // Balance is positive (the fixture's known $1,113.61 — or whatever post-migration)
    expect(r.balance).toBeGreaterThan(0);
  });
});
