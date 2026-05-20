// Bundle 32 Phase A — device-token auth + KV namespacing smoke.
//
// Five categories per SECURITY.md Phase A spec:
//   1. TOKEN_GEN_CORRECTNESS — generation, format, persistence, no regen
//   2. AUTH_ENFORCEMENT     — missing/malformed/unknown/empty tokens → 401
//   3. NAMESPACE_ISOLATION  — two devices, two namespaces, no cross-read
//   4. MIGRATION_ONE_SHOT   — legacy state migrates to bootstrap, idempotent
//   5. GRACEFUL_DEGRADATION — worker 401 / unreachable / token corruption
//
// Tests via a stateful mock worker installed in Playwright `page.route`
// that emulates the real worker's auth + KV behaviour. No worker deploy
// required for smoke. Mock worker is the canonical reference for the
// worker behaviour spec — if it ever diverges from the deployed worker,
// the integration is broken.
//
// Run: npm run smoke

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

// Install a stateful mock worker. Returns the kv/state objects so tests
// can inspect after-effects. Mock worker behaviour mirrors the real
// worker (slyght-worker/src/index.js) one-for-one.
async function installMockWorker(page, opts = {}) {
  const kv = new Map();
  const migratedDevices = new Set();
  const callLog = [];
  // Optional pre-seed: simulate legacy pre-Phase-A KV state for the
  // bootstrap migration test (case 4.1).
  if (opts.preSeedLegacy) {
    kv.set('state', JSON.stringify({ bal: 99, lastSync: '2026-05-18T00:00:00Z' }));
    kv.set('state-full-snapshot', JSON.stringify({ S: { bal: 99, txns: [{ts:1}] }, BILLS: [{name:'legacy-bill'}] }));
    kv.set('state-full-meta', JSON.stringify({ lastPushedAt: '2026-05-18T00:00:00Z', byteSize: 999 }));
    kv.set('push_subscription', JSON.stringify({ endpoint: 'https://example/p', keys: { p256dh: 'a', auth: 'b' } }));
    kv.set('dismissed', JSON.stringify({ test: '2026-05-18T00:00:00Z' }));
  }

  await page.route('**/' + WORKER_HOST + '/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    const headers = req.headers();
    const auth = headers.authorization || '';
    callLog.push({ path, method, auth: auth.slice(0, 30) });

    // Auth: extract Bearer token (mirror worker's requireDevice)
    const m = auth.match(/^Bearer\s+([A-Za-z0-9_-]{20,})$/);
    if (!m) {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'auth: missing or malformed Bearer token' }),
      });
    }
    const token = m[1];
    const hash = sha256Hex(token);
    const ns = `device:${hash}:`;

    // Migration: first auth from this device's hash copies legacy keys
    // if this is the first device ever (devices:registered empty).
    if (!migratedDevices.has(hash)) {
      const idxRaw = kv.get('devices:registered');
      let idx = [];
      try { idx = idxRaw ? JSON.parse(idxRaw) : []; } catch (_) { idx = []; }
      const isBootstrap = idx.length === 0;
      if (!idx.includes(hash)) {
        idx.push(hash);
        kv.set('devices:registered', JSON.stringify(idx));
      }
      const legacyKeys = ['state', 'state-full-snapshot', 'state-full-meta', 'push_subscription', 'dismissed'];
      const copiedKeys = [];
      if (isBootstrap) {
        for (const k of legacyKeys) {
          const v = kv.get(k);
          if (v !== undefined) {
            kv.set(ns + k, v);
            copiedKeys.push(k);
          }
        }
      }
      kv.set(ns + 'phase_a_migrated_v1', JSON.stringify({
        migratedAt: new Date().toISOString(),
        isBootstrap,
        copiedKeys,
      }));
      migratedDevices.add(hash);
    }

    // Endpoint dispatch
    if (path === '/sync' && method === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      kv.set(ns + 'state', JSON.stringify({ ...body, lastSync: new Date().toISOString() }));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
    if (path === '/push-full-state' && method === 'POST') {
      const raw = req.postData() || '{}';
      let body;
      try { body = JSON.parse(raw); } catch (e) {
        return route.fulfill({ status: 400, body: JSON.stringify({ error: 'bad json' }) });
      }
      if (!body || !body.S || !Array.isArray(body.BILLS)) {
        return route.fulfill({ status: 400, body: JSON.stringify({ error: 'expected {S, BILLS}' }) });
      }
      kv.set(ns + 'state-full-snapshot', raw);
      kv.set(ns + 'state-full-meta', JSON.stringify({ lastPushedAt: new Date().toISOString(), byteSize: raw.length }));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
    if (path === '/pull-full-state' && method === 'GET') {
      const v = kv.get(ns + 'state-full-snapshot');
      if (!v) {
        return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'no state' }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: v });
    }
    if (path === '/subscribe' && method === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      kv.set(ns + 'push_subscription', JSON.stringify(body));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
    if (path === '/unsubscribe' && method === 'POST') {
      kv.delete(ns + 'push_subscription');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
    // Default — generic 200
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });

  return { kv, migratedDevices, callLog };
}

test.describe('Bundle 32 Phase A — device-token auth + KV namespacing', () => {
  test.beforeEach(async ({ page, context }) => {
    await page.clock.install({ time: new Date(FROZEN_ISO) });
    await context.addInitScript((args) => {
      try { localStorage.setItem('slyght_v5', JSON.stringify(args.seed)); } catch (_) {}
      try { localStorage.setItem('slyght_seeded_v13', '1'); } catch (_) {}
      try { localStorage.setItem('slyght_seeded_v12', '1'); } catch (_) {}
      try { localStorage.setItem('slyght_seeded_v11', '1'); } catch (_) {}
      try { localStorage.setItem('slyght_bills_reset_month', args.monthKey); } catch (_) {}
    }, { seed: buildSlyghtV5(fixture), monthKey: '2026-5' });
  });

  // ── 1. TOKEN_GEN_CORRECTNESS ──────────────────────────────────────────

  test('1a: token generated on first call is 256-bit base64url (43 chars)', async ({ page }) => {
    await installMockWorker(page);
    await page.goto(process.env.SMOKE_BASE_URL || '/');
    await page.addStyleTag({ content: SETTLE_CSS });
    await page.waitForFunction(() => typeof getDeviceToken === 'function', { timeout: 5000 });
    await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
    const r = await page.evaluate(() => {
      localStorage.removeItem('slyght_device_token');
      const t = getDeviceToken();
      return { t, regex: /^[A-Za-z0-9_-]{43}$/.test(t), len: t.length };
    });
    expect(r.regex).toBe(true);
    expect(r.len).toBe(43);
  });

  test('1b: token persists across reloads (no regen on subsequent gets)', async ({ page }) => {
    await installMockWorker(page);
    await page.goto(process.env.SMOKE_BASE_URL || '/');
    await page.waitForFunction(() => typeof getDeviceToken === 'function', { timeout: 5000 });
    const t1 = await page.evaluate(() => getDeviceToken());
    await page.reload();
    await page.waitForFunction(() => typeof getDeviceToken === 'function', { timeout: 5000 });
    const t2 = await page.evaluate(() => getDeviceToken());
    expect(t1).toBe(t2);  // CRITICAL: regenerate would silently wipe KV namespace
  });

  test('1c: corrupted token (wrong charset) triggers silent regeneration', async ({ page }) => {
    await installMockWorker(page);
    await page.goto(process.env.SMOKE_BASE_URL || '/');
    await page.waitForFunction(() => typeof getDeviceToken === 'function', { timeout: 5000 });
    const r = await page.evaluate(() => {
      localStorage.setItem('slyght_device_token', 'not-a-valid-token!!!');  // bad chars
      const t = getDeviceToken();
      return { t, regex: /^[A-Za-z0-9_-]{43}$/.test(t), wasReplaced: t !== 'not-a-valid-token!!!' };
    });
    expect(r.wasReplaced).toBe(true);
    expect(r.regex).toBe(true);
  });

  test('1d: short/empty token regenerates (length check)', async ({ page }) => {
    await installMockWorker(page);
    await page.goto(process.env.SMOKE_BASE_URL || '/');
    await page.waitForFunction(() => typeof getDeviceToken === 'function', { timeout: 5000 });
    const r = await page.evaluate(() => {
      const cases = ['', 'abc', 'a'.repeat(42), 'a'.repeat(44)];
      return cases.map(c => {
        localStorage.setItem('slyght_device_token', c);
        const t = getDeviceToken();
        return { input: c, len: t.length, regen: t !== c };
      });
    });
    for (const c of r) {
      expect(c.regen).toBe(true);
      expect(c.len).toBe(43);
    }
  });

  // ── 2. AUTH_ENFORCEMENT ──────────────────────────────────────────────

  test('2a: missing Authorization header → 401', async ({ page }) => {
    await installMockWorker(page);
    await page.goto(process.env.SMOKE_BASE_URL || '/');
    await page.waitForFunction(() => typeof PUSH !== 'undefined', { timeout: 5000 });
    const status = await page.evaluate(async () => {
      const res = await fetch('https://slyght-worker.johndounas.workers.dev/push-full-state', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ S: { bal: 1, txns: [] }, BILLS: [] }),
      });
      return res.status;
    });
    expect(status).toBe(401);
  });

  test('2b: malformed Authorization header → 401', async ({ page }) => {
    await installMockWorker(page);
    await page.goto(process.env.SMOKE_BASE_URL || '/');
    await page.waitForFunction(() => typeof PUSH !== 'undefined', { timeout: 5000 });
    const statuses = await page.evaluate(async () => {
      const bad = ['Bearer ', 'Bearer abc', 'Basic xxx', 'xxx', 'Bearer ' + 'a'.repeat(10)];
      const out = [];
      for (const h of bad) {
        const res = await fetch('https://slyght-worker.johndounas.workers.dev/push-full-state', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': h },
          body: JSON.stringify({ S: { bal: 1, txns: [] }, BILLS: [] }),
        });
        out.push(res.status);
      }
      return out;
    });
    for (const s of statuses) expect(s).toBe(401);
  });

  test('2c: valid Bearer token → 200 (auth roundtrip works)', async ({ page }) => {
    await installMockWorker(page);
    await page.goto(process.env.SMOKE_BASE_URL || '/');
    await page.waitForFunction(() => typeof PUSH !== 'undefined' && typeof getAuthHeader === 'function', { timeout: 5000 });
    await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
    const status = await page.evaluate(async () => {
      const res = await fetch('https://slyght-worker.johndounas.workers.dev/push-full-state', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': getAuthHeader() },
        body: JSON.stringify({ S: { bal: 1, txns: [] }, BILLS: [] }),
      });
      return res.status;
    });
    expect(status).toBe(200);
  });

  // ── 3. NAMESPACE_ISOLATION ────────────────────────────────────────────

  test('3a: two different tokens write to two different KV namespaces (cannot cross-read)', async ({ page }) => {
    const { kv } = await installMockWorker(page);
    await page.goto(process.env.SMOKE_BASE_URL || '/');
    await page.waitForFunction(() => typeof PUSH !== 'undefined' && typeof getAuthHeader === 'function', { timeout: 5000 });
    await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
    const r = await page.evaluate(async () => {
      // Use Device A
      localStorage.setItem('slyght_device_token', 'A'.repeat(43));
      const tA = localStorage.getItem('slyght_device_token');
      let res = await fetch('https://slyght-worker.johndounas.workers.dev/push-full-state', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tA },
        body: JSON.stringify({ S: { bal: 111, txns: [{n:'A'}] }, BILLS: [] }),
      });
      const pushA = res.status;
      // Pull as A — should get A's data
      res = await fetch('https://slyght-worker.johndounas.workers.dev/pull-full-state', {
        headers: { 'Authorization': 'Bearer ' + tA },
      });
      const pulledA = await res.json();
      // Switch to Device B (different token, different namespace)
      localStorage.setItem('slyght_device_token', 'B'.repeat(43));
      const tB = localStorage.getItem('slyght_device_token');
      // Pull as B — must NOT see A's data (404 because B has no state)
      res = await fetch('https://slyght-worker.johndounas.workers.dev/pull-full-state', {
        headers: { 'Authorization': 'Bearer ' + tB },
      });
      const pullBStatus = res.status;
      return { pushA, pulledABal: pulledA.S.bal, pullBStatus };
    });
    expect(r.pushA).toBe(200);
    expect(r.pulledABal).toBe(111);
    expect(r.pullBStatus).toBe(404);  // CRITICAL — B cannot read A's namespace
  });

  test('3b: KV keys are prefixed device:{hash}: not bare', async ({ page }) => {
    const { kv } = await installMockWorker(page);
    await page.goto(process.env.SMOKE_BASE_URL || '/');
    await page.waitForFunction(() => typeof PUSH !== 'undefined' && typeof getAuthHeader === 'function', { timeout: 5000 });
    await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
    await page.evaluate(async () => {
      await PUSH.pushFullState();
    });
    // Inspect mock KV — keys should be device:HASH:state-full-snapshot, not bare
    const keys = Array.from(kv.keys());
    const deviceKeys = keys.filter(k => k.startsWith('device:'));
    const bareStateKeys = keys.filter(k => k === 'state-full-snapshot' || k === 'state');
    expect(deviceKeys.length).toBeGreaterThan(0);
    expect(bareStateKeys.length).toBe(0);  // no bare writes from auth'd app
  });

  // ── 4. MIGRATION_ONE_SHOT ─────────────────────────────────────────────

  test('4a: bootstrap device migrates pre-Phase-A KV state on first push', async ({ page }) => {
    const { kv } = await installMockWorker(page, { preSeedLegacy: true });
    await page.goto(process.env.SMOKE_BASE_URL || '/');
    await page.waitForFunction(() => typeof PUSH !== 'undefined' && typeof getAuthHeader === 'function', { timeout: 5000 });
    await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
    // Trigger one authenticated call — fires migration as side effect
    await page.evaluate(() => PUSH.pushFullState());
    // Migration flag set + device namespace populated
    const keys = Array.from(kv.keys());
    const deviceKeys = keys.filter(k => k.startsWith('device:'));
    const flagKey = deviceKeys.find(k => k.endsWith(':phase_a_migrated_v1'));
    expect(flagKey).toBeTruthy();
    // Bootstrap copied legacy keys into the device namespace
    const ns = flagKey.replace(':phase_a_migrated_v1', ':');
    expect(kv.has(ns + 'state')).toBe(true);
    expect(kv.has(ns + 'push_subscription')).toBe(true);
    expect(kv.has(ns + 'dismissed')).toBe(true);
    // Pre-Phase-A keys still present (NOT deleted per Phase A scope)
    expect(kv.has('state')).toBe(true);
    expect(kv.has('push_subscription')).toBe(true);
  });

  test('4b: migration is idempotent (running twice is a no-op)', async ({ page }) => {
    const { kv } = await installMockWorker(page, { preSeedLegacy: true });
    await page.goto(process.env.SMOKE_BASE_URL || '/');
    await page.waitForFunction(() => typeof PUSH !== 'undefined' && typeof getAuthHeader === 'function', { timeout: 5000 });
    await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
    await page.evaluate(() => PUSH.pushFullState());
    const flagKey1 = Array.from(kv.keys()).find(k => k.endsWith(':phase_a_migrated_v1'));
    const ns1 = flagKey1.replace(':phase_a_migrated_v1', ':');
    const stateAfterFirst = kv.get(ns1 + 'state-full-snapshot');
    // Second push from same device — migration must NOT re-copy legacy state
    // (which would clobber the new push). Set bare 'state' to differ, then
    // verify the namespaced state was NOT re-overwritten by migration.
    kv.set('state', JSON.stringify({ bal: 555 }));  // mutate legacy
    await page.evaluate(() => PUSH.pushFullState());
    const stateAfterSecond = kv.get(ns1 + 'state-full-snapshot');
    // The namespaced state reflects the SECOND push body, NOT a re-migrated legacy
    expect(stateAfterSecond).toBe(stateAfterFirst);  // unchanged because mock body is identical
    // Most importantly: migration flag stays set; no re-migration happened
    const flag = JSON.parse(kv.get(flagKey1));
    expect(flag.isBootstrap).toBe(true);
  });

  test('4c: second device authenticates but does NOT inherit bootstrap data', async ({ page }) => {
    const { kv } = await installMockWorker(page, { preSeedLegacy: true });
    await page.goto(process.env.SMOKE_BASE_URL || '/');
    await page.waitForFunction(() => typeof PUSH !== 'undefined' && typeof getAuthHeader === 'function', { timeout: 5000 });
    await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
    // Device A registers (bootstrap) via app's getDeviceToken
    await page.evaluate(() => PUSH.pushFullState());
    // Device B (different token) authenticates — must NOT see A's state
    const r = await page.evaluate(async () => {
      localStorage.setItem('slyght_device_token', 'X'.repeat(43));
      const res = await fetch('https://slyght-worker.johndounas.workers.dev/pull-full-state', {
        headers: { 'Authorization': 'Bearer ' + 'X'.repeat(43) },
      });
      return { status: res.status };
    });
    expect(r.status).toBe(404);  // B's namespace empty (bootstrap inheritance limited to first device)
  });

  // ── 5. GRACEFUL_DEGRADATION ───────────────────────────────────────────

  test('5a: worker unreachable does not break save() flow', async ({ page }) => {
    // No mock worker installed → all fetches fail with net::ERR_*
    await page.goto(process.env.SMOKE_BASE_URL || '/');
    await page.waitForFunction(() => typeof save === 'function' && typeof PUSH !== 'undefined', { timeout: 5000 });
    await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
    const r = await page.evaluate(() => {
      let threw = null;
      try { save(); } catch (e) { threw = e.message; }
      return { threw, balPresent: typeof S.bal === 'number' };
    });
    expect(r.threw).toBeNull();
    expect(r.balPresent).toBe(true);
  });

  test('5b: worker 401 (e.g. revoked token) — pushFullState returns ok:false without throwing', async ({ page }) => {
    // Mock worker that always 401s
    await page.route('**/' + WORKER_HOST + '/**', route =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'auth' }) })
    );
    await page.goto(process.env.SMOKE_BASE_URL || '/');
    await page.waitForFunction(() => typeof PUSH !== 'undefined' && typeof PUSH.pushFullState === 'function', { timeout: 5000 });
    await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
    const r = await page.evaluate(async () => {
      let threw = null;
      try {
        const res = await PUSH.pushFullState();
        return { threw: null, ok: res.ok, status: res.status };
      } catch (e) {
        return { threw: e.message };
      }
    });
    expect(r.threw).toBeNull();
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
  });

  test('5c: token corruption mid-session recovers cleanly + does NOT nuke user state', async ({ page }) => {
    await installMockWorker(page);
    await page.goto(process.env.SMOKE_BASE_URL || '/');
    await page.waitForFunction(() => typeof getDeviceToken === 'function' && typeof S !== 'undefined', { timeout: 5000 });
    await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
    const r = await page.evaluate(() => {
      const balBefore = S.bal;
      const txnsBefore = S.txns.length;
      localStorage.setItem('slyght_device_token', '!!!corrupted!!!');
      const t = getDeviceToken();  // triggers regen
      // User state must be intact
      return {
        balAfter: S.bal, balBefore,
        txnsAfter: S.txns.length, txnsBefore,
        tokenValid: /^[A-Za-z0-9_-]{43}$/.test(t),
      };
    });
    expect(r.balAfter).toBe(r.balBefore);
    expect(r.txnsAfter).toBe(r.txnsBefore);
    expect(r.tokenValid).toBe(true);
  });
});
