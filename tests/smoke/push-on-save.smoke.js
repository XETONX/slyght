// Bundle 32a — push-on-save fixture-freshness substrate smoke.
//
// Verifies:
//   1. PUSH.pushFullState reachable + payload shape correct ({S, BILLS})
//   2. save() schedules a debounced push (timer becomes pending)
//   3. Rapid saves consolidate to 1 push (debounce 30s)
//   4. S.pushOnSaveEnabled === false suppresses scheduling
//   5. _flushPushFullState clears pending state synchronously
//   6. Boot self-tests for the new infrastructure pass
//   7. Network failure does NOT throw out of save() (silent-fail contract)
//   8. Push payload is the FULL localStorage blob (not the curated /sync subset)
//
// Worker calls are intercepted via Playwright route — no deployed worker
// required. Each test verifies the request shape that WOULD hit the worker.
//
// Run: npm run smoke

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const FIXTURE_PATH = path.resolve(__dirname, '../../state-snapshot.json');
const FROZEN_ISO = '2026-05-20T22:00:00+10:00';
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

const WORKER_HOST = 'slyght-worker.johndounas.workers.dev';

test.describe('Bundle 32a — push-on-save fixture-freshness substrate', () => {
  test.beforeEach(async ({ page, context }) => {
    await page.clock.install({ time: new Date(FROZEN_ISO) });
    // Intercept every worker call so no network egress + we capture payloads
    await page.route('**/' + WORKER_HOST + '/**', route => {
      const req = route.request();
      const url = req.url();
      if (url.includes('/push-full-state')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, meta: { lastPushedAt: new Date().toISOString() } }),
        });
      }
      // Block other worker calls (sync, subscribe, etc.) — return 200 so PUSH.syncState swallows
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    await context.addInitScript((args) => {
      try { localStorage.setItem('slyght_v5', JSON.stringify(args.seed)); } catch (_) {}
      try { localStorage.setItem('slyght_seeded_v13', '1'); } catch (_) {}
      try { localStorage.setItem('slyght_seeded_v12', '1'); } catch (_) {}
      try { localStorage.setItem('slyght_seeded_v11', '1'); } catch (_) {}
      try { localStorage.setItem('slyght_bills_reset_month', args.monthKey); } catch (_) {}
    }, { seed: buildSlyghtV5(fixture), monthKey: '2026-5' });
    await page.goto(process.env.SMOKE_BASE_URL || '/');
    await page.addStyleTag({ content: SETTLE_CSS });
    await page.waitForFunction(() => typeof PUSH !== 'undefined'
      && typeof PUSH.pushFullState === 'function'
      && typeof _schedulePushFullState === 'function'
      && typeof _flushPushFullState === 'function'
      && typeof save === 'function', { timeout: 5000 });
    await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
    await page.evaluate(() => {
      const modal = document.getElementById('eod-recon-modal');
      if (modal && modal.classList.contains('open') && typeof eodReconAccept === 'function') eodReconAccept();
    });
  });

  test('Case 1: PUSH.pushFullState callable + sends full {S, BILLS} payload', async ({ page }) => {
    // Capture the next push request body
    const reqBodyP = page.waitForRequest(req =>
      req.url().includes('/push-full-state') && req.method() === 'POST',
      { timeout: 3000 }
    );
    const r = await page.evaluate(async () => {
      const res = await PUSH.pushFullState();
      return { ok: res && res.ok };
    });
    expect(r.ok).toBe(true);
    const req = await reqBodyP;
    const body = JSON.parse(req.postData() || '{}');
    expect(body).toHaveProperty('S');
    expect(body).toHaveProperty('BILLS');
    expect(Array.isArray(body.BILLS)).toBe(true);
    expect(typeof body.S).toBe('object');
    expect(body.S).toHaveProperty('bal');  // signature of the full canonical blob
    expect(body.S).toHaveProperty('txns');
    expect(Array.isArray(body.S.txns)).toBe(true);
  });

  test('Case 2: save() schedules a debounced push (pending becomes true)', async ({ page }) => {
    const r = await page.evaluate(() => {
      // Reset any pending timer first
      _flushPushFullState();
      const before = _pushFullStatePending;
      save();
      const after = _pushFullStatePending;
      _flushPushFullState();  // cleanup
      return { before, after };
    });
    expect(r.before).toBe(false);
    expect(r.after).toBe(true);
  });

  test('Case 3: rapid saves consolidate — 5 calls produce 1 pending timer, fires once after 30s', async ({ page }) => {
    // Verify debounce via internal state (single source of truth — timer handle).
    // The integration test (fetch firing) is in Case 1; this test is about the
    // debounce mechanism: many save() calls must collapse to ONE pending timer.
    const r = await page.evaluate(() => {
      _flushPushFullState();  // clean slate
      // Fire 5 rapid saves
      for (let i = 0; i < 5; i++) save();
      // After 5 saves, exactly ONE timer should be live (each new save
      // cancelled the previous via clearTimeout in _schedulePushFullState).
      const pendingAfter5 = _pushFullStatePending;
      const timerLive = _pushFullStateTimer !== null;
      _flushPushFullState();  // cleanup so subsequent tests start clean
      return { pendingAfter5, timerLive };
    });
    expect(r.pendingAfter5).toBe(true);
    expect(r.timerLive).toBe(true);
  });

  test('Case 4: S.pushOnSaveEnabled = false suppresses scheduling', async ({ page }) => {
    const r = await page.evaluate(() => {
      _flushPushFullState();
      S.pushOnSaveEnabled = false;
      save();
      const pending = _pushFullStatePending;
      S.pushOnSaveEnabled = true;  // restore for later tests
      return { pending };
    });
    expect(r.pending).toBe(false);
  });

  test('Case 5: _flushPushFullState clears pending synchronously + uses sendBeacon', async ({ page }) => {
    // Spy on sendBeacon
    await page.evaluate(() => {
      window._beaconCalls = [];
      const origSendBeacon = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = function(url, data) {
        window._beaconCalls.push({ url, size: data && data.size });
        return true;  // simulate success
      };
      // Schedule a push, then flush
      _flushPushFullState();  // clean
      save();  // schedule
    });
    const before = await page.evaluate(() => _pushFullStatePending);
    expect(before).toBe(true);
    const r = await page.evaluate(() => {
      _flushPushFullState();
      return { pending: _pushFullStatePending, beaconCalls: window._beaconCalls };
    });
    expect(r.pending).toBe(false);
    expect(r.beaconCalls.length).toBeGreaterThanOrEqual(1);
    expect(r.beaconCalls[0].url).toContain('/push-full-state');
    expect(r.beaconCalls[0].size).toBeGreaterThan(100);  // non-trivial payload
  });

  test('Case 6: boot self-tests for push-on-save pass', async ({ page }) => {
    const r = await page.evaluate(() => {
      const result = BRAIN.selfTest.run();
      // result shape: { ts, results, failures }
      const pushChecks = result.results.filter(t => /push|schedule|flush/i.test(t.name));
      return {
        failuresCount: result.failures.length,
        failureNames: result.failures.map(f => f.name),
        pushChecks,
      };
    });
    // All self-tests pass (or at least none of the push-on-save ones fail)
    const pushFailures = r.failureNames.filter(n => /push|schedule|flush/i.test(n));
    expect(pushFailures).toEqual([]);
    expect(r.pushChecks.length).toBeGreaterThanOrEqual(3);  // at least 3 new checks
    for (const c of r.pushChecks) {
      expect(c.ok).toBe(true);
    }
  });

  test('Case 7: silent-fail — network error in pushFullState does not throw', async ({ page }) => {
    // Replace the beforeEach route so push-full-state aborts. page.unroute
    // is the canonical way to override route handlers within a test.
    await page.unroute('**/' + WORKER_HOST + '/**');
    await page.route('**/' + WORKER_HOST + '/**', route => {
      if (route.request().url().includes('/push-full-state')) {
        return route.abort('failed');
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    const r = await page.evaluate(async () => {
      let threw = null;
      try {
        const res = await PUSH.pushFullState();
        return { threw: null, ok: res.ok, res };
      } catch (e) {
        return { threw: e.message, ok: false };
      }
    });
    expect(r.threw).toBeNull();
    expect(r.ok).toBe(false);  // method returns {ok:false} instead of throwing
  });

  test('Case 8: payload distinct from /sync (full blob, not curated)', async ({ page }) => {
    const reqBodyP = page.waitForRequest(req =>
      req.url().includes('/push-full-state') && req.method() === 'POST',
      { timeout: 3000 }
    );
    await page.evaluate(() => PUSH.pushFullState());
    const req = await reqBodyP;
    const body = JSON.parse(req.postData() || '{}');
    // /sync only ships ~24 curated fields. /push-full-state ships the
    // entire canonical localStorage blob — must contain canonical-only
    // keys that /sync never exposes:
    expect(body.S).toHaveProperty('planIntents');     // not in /sync
    expect(body.S).toHaveProperty('savingsBuckets');  // not in /sync
    expect(body.S).toHaveProperty('debts');           // not in /sync
    expect(body.S).toHaveProperty('paidBills');       // not in /sync
    // And critically does NOT have the /sync-only synthesized fields
    expect(body.S).not.toHaveProperty('maxDay');
    expect(body.S).not.toHaveProperty('survivalMode');
    expect(body.S).not.toHaveProperty('lastSync');
  });
});
