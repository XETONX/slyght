// R5 finding T6 + T2 regression test — PUSH.pushFullState redaction + size cap.
//
// Before fix: PUSH.pushFullState sent raw localStorage to /push-full-state
// including S.apiKey (Anthropic sk-ant-* key landed in worker-KV plaintext).
// After fix: NEVER_SYNC fields (apiKey, _prevState, chatHistory, pin, pinHash)
// stripped before push; 500kB size cap matches worker.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ORACLE_PATH = path.resolve(__dirname, '../state-dump/live-2026-05-23.json');
const FROZEN_ISO = '2026-05-23T22:00:00+10:00';
const oracle = JSON.parse(fs.readFileSync(ORACLE_PATH, 'utf8'));

function buildSlyghtV5(fx) {
  const S = Object.assign({}, fx.S || {});
  if (fx.paidBills && !S.paidBills) S.paidBills = fx.paidBills;
  // Inject NEVER_SYNC fields for the test to verify they get stripped
  S.apiKey = 'sk-ant-TEST-SHOULD-NOT-BE-SYNCED-1234567890abcdef';
  S.pin = '1234';
  S.pinHash = 'sha256-fake-hash-deadbeef';
  S.chatHistory = [{ role: 'user', content: 'private message' }];
  S._prevState = '{"S":{"old":"state"}}';
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
    for (let i = 0; i < 40; i++) {
      try { localStorage.setItem('slyght_seeded_v' + i, '1'); } catch (_) {}
    }
    try { localStorage.setItem('slyght_bills_reset_month', args.monthKey); } catch (_) {}
  }, { seed: buildSlyghtV5(oracle), monthKey: '2026-5' });
  await page.goto(process.env.SMOKE_BASE_URL || '/');
  await page.addStyleTag({ content: SETTLE_CSS });
  await page.waitForFunction(() => typeof PUSH !== 'undefined'
    && typeof PUSH.pushFullState === 'function', { timeout: 5000 });
  await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page.evaluate(() => {
    const modal = document.getElementById('eod-recon-modal');
    if (modal && modal.classList.contains('open') && typeof eodReconAccept === 'function') eodReconAccept();
  });
}

test.describe('R5 T6+T2 — PUSH.pushFullState redaction + size cap', () => {
  test.beforeEach(({ page, context }) => boot(page, context));

  // Case 1 — captured request body MUST NOT contain any NEVER_SYNC field.
  test('Case 1: NEVER_SYNC fields stripped from pushed body', async ({ page }) => {
    let capturedBuf = null;
    await page.route('**/push-full-state', async route => {
      capturedBuf = route.request().postDataBuffer();
      await route.fulfill({ status: 200, body: JSON.stringify({ ok: true, meta: {} }) });
    });

    const result = await page.evaluate(async () => await PUSH.pushFullState({}));

    expect(result.ok).toBe(true);
    expect(capturedBuf).toBeTruthy();
    // push-reliability fix 2026-05-26: the body is now gzipped — inflate it
    // before asserting redaction (gzip magic bytes 0x1f 0x8b).
    const zlib = require('zlib');
    const parsed = JSON.parse(
      (capturedBuf[0] === 0x1f && capturedBuf[1] === 0x8b)
        ? zlib.gunzipSync(capturedBuf).toString('utf8')
        : capturedBuf.toString('utf8')
    );
    expect(parsed.S).toBeTruthy();

    // The forbidden fields MUST NOT appear
    expect(parsed.S.apiKey).toBeUndefined();
    expect(parsed.S.pin).toBeUndefined();
    expect(parsed.S.pinHash).toBeUndefined();
    expect(parsed.S.chatHistory).toBeUndefined();
    expect(parsed.S._prevState).toBeUndefined();

    // Also verify legitimate fields ARE still present
    expect(parsed.S.bal).toBeDefined();
    expect(parsed.S.txns).toBeDefined();
    expect(parsed.BILLS).toBeDefined();
  });

  // Case 2 — original localStorage unchanged after push (redaction is push-side only)
  test('Case 2: localStorage retains NEVER_SYNC fields (redaction is push-only)', async ({ page }) => {
    await page.route('**/push-full-state', async route => {
      await route.fulfill({ status: 200, body: JSON.stringify({ ok: true, meta: {} }) });
    });

    const result = await page.evaluate(async () => {
      await PUSH.pushFullState({});
      // After push, localStorage should still have apiKey (push is non-destructive)
      const raw = localStorage.getItem('slyght_v5');
      const parsed = JSON.parse(raw);
      return {
        hasApiKeyLocally: !!parsed.S.apiKey,
        hasPinLocally: !!parsed.S.pin,
      };
    });

    expect(result.hasApiKeyLocally).toBe(true);
    expect(result.hasPinLocally).toBe(true);
  });

  // Case 3 — oversized payload short-circuits with size error, no network call
  test('Case 3: body >500kB returns {ok:false, reason:"too-large"} without fetch', async ({ page }) => {
    let networkCalled = false;
    await page.route('**/push-full-state', async route => {
      networkCalled = true;
      await route.fulfill({ status: 200, body: '{"ok":true}' });
    });

    const result = await page.evaluate(async () => {
      // Inflate state with a giant note to exceed 500kB
      S.txns.push({ ts: Date.now(), amt: 1, note: 'X'.repeat(600000), cat: 'Test' });
      if (typeof save === 'function') save();
      return await PUSH.pushFullState({});
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('too-large');
    expect(result.size).toBeGreaterThan(500000);
    expect(networkCalled).toBe(false);
  });
});
