// Bundle 32a + push-reliability fix 2026-05-26 — push-on-save smoke.
//
// Verifies the push path now delivers reliably:
//   1. pushFullState sends a GZIPPED body (Content-Encoding: gzip) that
//      inflates to the full {S, BILLS} blob and fits under the 64KB keepalive cap
//   2. save() schedules a debounced push
//   3. debounce is 5s (was 30s) + rapid saves consolidate to one timer
//   4. S.pushOnSaveEnabled === false suppresses scheduling
//   5. flushSync (pagehide path) fires a keepalive gzip fetch from the cache
//   6. boot self-tests for push infra pass
//   7. network failure does NOT throw AND records a failed outcome (no silent drop)
//   8. payload is the full canonical blob, not the curated /sync subset
//   9. observability — a successful push records {ok:true} in slyght_push_status
//
// Worker calls are intercepted via Playwright route — no deployed worker needed.
// Run: npm run smoke   (or  npm run smoke:offline)

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const FIXTURE_PATH = path.resolve(__dirname, '../../state-snapshot.json');
const FROZEN_ISO = '2026-05-20T22:00:00+10:00';
const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

function buildSlyghtV5(fx) {
  const S = Object.assign({}, fx.S || {});
  if (fx.paidBills && !S.paidBills) S.paidBills = fx.paidBills;
  return { S, BILLS: fx.BILLS || [] };
}

// Decompress a captured push request body (gzip magic 0x1f 0x8b) → parsed JSON.
function gunzipReq(req) {
  const buf = req.postDataBuffer();
  if (!buf) return null;
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    return JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
  }
  return JSON.parse(buf.toString('utf8'));
}

const SETTLE_CSS = `*, *::before, *::after { animation-duration:0s !important; animation-delay:0s !important; transition-duration:0s !important; transition-delay:0s !important; }`;
const WORKER_HOST = 'slyght-worker.johndounas.workers.dev';

test.describe('push-on-save + push-reliability fix (gzip + 5s + flushSync)', () => {
  test.beforeEach(async ({ page, context }) => {
    await page.clock.install({ time: new Date(FROZEN_ISO) });
    await page.route('**/' + WORKER_HOST + '/**', route => {
      if (route.request().url().includes('/push-full-state')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, meta: { lastPushedAt: new Date().toISOString() } }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    await context.addInitScript((args) => {
      try { localStorage.setItem('slyght_v5', JSON.stringify(args.seed)); } catch (_) {}
      ['v11', 'v12', 'v13'].forEach(v => { try { localStorage.setItem('slyght_seeded_' + v, '1'); } catch (_) {} });
      try { localStorage.setItem('slyght_bills_reset_month', args.monthKey); } catch (_) {}
    }, { seed: buildSlyghtV5(fixture), monthKey: '2026-5' });
    await page.goto(process.env.SMOKE_BASE_URL || '/');
    await page.addStyleTag({ content: SETTLE_CSS });
    await page.waitForFunction(() => typeof PUSH !== 'undefined'
      && typeof PUSH.pushFullState === 'function'
      && typeof PUSH.flushSync === 'function'
      && typeof _schedulePushFullState === 'function'
      && typeof _flushPushFullState === 'function'
      && typeof save === 'function', { timeout: 5000 });
    await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
    await page.evaluate(() => { const m = document.getElementById('eod-recon-modal'); if (m && m.classList.contains('open') && typeof eodReconAccept === 'function') eodReconAccept(); });
  });

  test('Case 1: gzipped body inflates to full {S,BILLS} and fits <64KB', async ({ page }) => {
    const reqP = page.waitForRequest(req => req.url().includes('/push-full-state') && req.method() === 'POST', { timeout: 3000 });
    const r = await page.evaluate(async () => await PUSH.pushFullState());
    expect(r.ok).toBe(true);
    const req = await reqP;
    expect((req.headers()['content-encoding'] || '').toLowerCase()).toBe('gzip');
    const compressed = req.postDataBuffer();
    expect(compressed[0]).toBe(0x1f);              // gzip magic byte 1
    expect(compressed[1]).toBe(0x8b);              // gzip magic byte 2
    expect(compressed.length).toBeLessThan(65536); // under the 64KB keepalive cap
    const body = gunzipReq(req);
    expect(body).toHaveProperty('S');
    expect(body).toHaveProperty('BILLS');
    expect(Array.isArray(body.BILLS)).toBe(true);
    expect(body.S).toHaveProperty('bal');
    expect(body.S).toHaveProperty('txns');
    expect(Array.isArray(body.S.txns)).toBe(true);
  });

  test('Case 2: save() schedules a debounced push (pending becomes true)', async ({ page }) => {
    const r = await page.evaluate(() => { _flushPushFullState(); const before = _pushFullStatePending; save(); const after = _pushFullStatePending; return { before, after }; });
    expect(r.before).toBe(false);
    expect(r.after).toBe(true);
  });

  test('Case 3: debounce is 5s + rapid saves consolidate to one timer', async ({ page }) => {
    const r = await page.evaluate(() => {
      _flushPushFullState();
      for (let i = 0; i < 5; i++) save();
      const out = { ms: _PUSH_FULL_STATE_DEBOUNCE_MS, pending: _pushFullStatePending, timerLive: _pushFullStateTimer !== null };
      _flushPushFullState();
      return out;
    });
    expect(r.ms).toBe(5000);   // push-reliability fix: 30000 -> 5000
    expect(r.pending).toBe(true);
    expect(r.timerLive).toBe(true);
  });

  test('Case 4: S.pushOnSaveEnabled = false suppresses scheduling', async ({ page }) => {
    const r = await page.evaluate(() => { _flushPushFullState(); S.pushOnSaveEnabled = false; save(); const p = _pushFullStatePending; S.pushOnSaveEnabled = true; return { p }; });
    expect(r.p).toBe(false);
  });

  test('Case 5: flushSync fires a keepalive gzip fetch from the cache', async ({ page }) => {
    const r = await page.evaluate(async () => {
      window._flushFetches = [];
      const orig = window.fetch.bind(window);
      window.fetch = function (url, init) {
        if (typeof url === 'string' && url.includes('/push-full-state')) {
          window._flushFetches.push({
            keepalive: !!(init && init.keepalive),
            method: init && init.method,
            enc: init && init.headers && (init.headers['Content-Encoding'] || init.headers['content-encoding']),
            hasAuth: !!(init && init.headers && (init.headers.Authorization || init.headers.authorization)),
            hasBody: !!(init && init.body),
          });
        }
        return orig(url, init);
      };
      await PUSH.pushFullState();    // populates the _lastGzipBody cache
      const did = PUSH.flushSync();  // synchronous keepalive flush from the cache
      return { did, fetches: window._flushFetches };
    });
    expect(r.did).toBe(true);
    const flush = r.fetches[r.fetches.length - 1];
    expect(flush.keepalive).toBe(true);
    expect(flush.method).toBe('POST');
    expect((flush.enc || '').toLowerCase()).toBe('gzip');
    expect(flush.hasAuth).toBe(true);
    expect(flush.hasBody).toBe(true);
  });

  test('Case 6: boot self-tests for push pass', async ({ page }) => {
    const r = await page.evaluate(() => { const res = BRAIN.selfTest.run(); return { failures: res.failures.map(f => f.name) }; });
    expect(r.failures.filter(n => /push|schedule|flush/i.test(n))).toEqual([]);
  });

  test('Case 7: network error does not throw AND records a failed outcome', async ({ page }) => {
    await page.unroute('**/' + WORKER_HOST + '/**');
    await page.route('**/' + WORKER_HOST + '/**', route => route.request().url().includes('/push-full-state') ? route.abort('failed') : route.fulfill({ status: 200, body: '{"ok":true}' }));
    const r = await page.evaluate(async () => {
      let threw = null, res;
      localStorage.removeItem('slyght_push_status');
      try { res = await PUSH.pushFullState(); } catch (e) { threw = e.message; }
      const status = JSON.parse(localStorage.getItem('slyght_push_status') || 'null');
      return { threw, ok: res && res.ok, status };
    });
    expect(r.threw).toBeNull();
    expect(r.ok).toBe(false);
    expect(r.status).toBeTruthy();
    expect(r.status.ok).toBe(false);   // observability: the dropped push left a trace
  });

  test('Case 8: payload is the full blob, not the /sync subset', async ({ page }) => {
    const reqP = page.waitForRequest(req => req.url().includes('/push-full-state') && req.method() === 'POST', { timeout: 3000 });
    await page.evaluate(() => PUSH.pushFullState());
    const body = gunzipReq(await reqP);
    expect(body.S).toHaveProperty('planIntents');
    expect(body.S).toHaveProperty('savingsBuckets');
    expect(body.S).toHaveProperty('debts');
    expect(body.S).toHaveProperty('paidBills');
    expect(body.S).not.toHaveProperty('maxDay');
    expect(body.S).not.toHaveProperty('survivalMode');
    expect(body.S).not.toHaveProperty('lastSync');
  });

  test('Case 9: observability — successful push records {ok:true} in slyght_push_status', async ({ page }) => {
    const r = await page.evaluate(async () => { localStorage.removeItem('slyght_push_status'); await PUSH.pushFullState(); return JSON.parse(localStorage.getItem('slyght_push_status') || 'null'); });
    expect(r).toBeTruthy();
    expect(r.ok).toBe(true);
    expect(typeof r.at).toBe('number');
  });
});
