// Bundle 32 Theme G — weather proxy smoke (F7 secret migration).
//
// Pre-G: WEATHER.fetch() called OWM directly with the API key embedded
// in the query string (`&appid=7fb97ad9...&...`). The key was committed
// to the public repo and viewable in any client request.
//
// Post-G: WEATHER.fetch() calls the worker proxy at /weather, which
// reads `env.OWM_API_KEY` (wrangler secret) and returns a trimmed
// response. The smoke locks both the no-direct-OWM-call invariant and
// the trimmed-response-parsing contract.
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

async function boot(page, context, routeHandler) {
  await page.clock.install({ time: new Date(FROZEN_ISO) });
  // Mock the worker /weather endpoint before navigation. Default: return
  // a trimmed payload matching the post-G shape. Tests can override via
  // routeHandler param.
  await context.route('**/slyght-worker.johndounas.workers.dev/weather**', routeHandler || (route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'X-Slyght-Weather-Cache': 'miss' },
      body: JSON.stringify({
        temp: 19.4,
        feels_like: 18.1,
        condition: 'Clouds',
        description: 'broken clouds',
        wind_speed: 3.2,
        ts: Date.now(),
      }),
    });
  }));
  // Also install a route on the OLD direct-OWM endpoint so any leak fails
  // loudly (test FAIL with a marker URL) instead of silently hitting the
  // real OWM API.
  await context.route('**/api.openweathermap.org/**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ __DIRECT_OWM_LEAK__: true }),
    });
  });
  await context.addInitScript((args) => {
    try { localStorage.setItem('slyght_v5', JSON.stringify(args.seed)); } catch (_) {}
    try { localStorage.setItem('slyght_seeded_v13', '1'); } catch (_) {}
    try { localStorage.removeItem('slyght_weather'); } catch (_) {}
  }, { seed: buildSlyghtV5(fixture) });
  await page.goto(process.env.SMOKE_BASE_URL || '/');
  await page.waitForFunction(() => typeof WEATHER !== 'undefined'
    && typeof WEATHER.fetch === 'function', { timeout: 5000 });
  await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
}

test.describe('Bundle 32 Theme G — weather proxy (F7 secret migration)', () => {

  test('1: WEATHER object has NO apiKey field (secret migrated to worker)', async ({ page, context }) => {
    await boot(page, context);
    const keys = await page.evaluate(() => Object.keys(WEATHER));
    expect(keys).not.toContain('apiKey');
    // Positive — workerUrl IS now present
    expect(keys).toContain('workerUrl');
  });

  test('2: client makes request to worker /weather proxy, NOT direct to OWM', async ({ page, context }) => {
    const requests = [];
    page.on('request', req => {
      const u = req.url();
      if (u.includes('weather') || u.includes('openweather')) requests.push(u);
    });
    await boot(page, context);
    await page.evaluate(() => WEATHER.fetch());
    await page.waitForTimeout(200);
    expect(requests.length).toBeGreaterThan(0);
    // Every request must go to slyght-worker, not OWM direct.
    expect(requests.some(u => u.includes('slyght-worker.johndounas.workers.dev/weather'))).toBe(true);
    expect(requests.some(u => u.includes('api.openweathermap.org'))).toBe(false);
  });

  test('3: no request URL contains "appid=" (OWM key never leaves the worker)', async ({ page, context }) => {
    const requests = [];
    page.on('request', req => requests.push(req.url()));
    await boot(page, context);
    await page.evaluate(() => WEATHER.fetch());
    await page.waitForTimeout(200);
    for (const u of requests) {
      expect(u).not.toContain('appid=');
      expect(u).not.toContain('7fb97ad9');
    }
  });

  test('4: trimmed proxy response parses into WEATHER.current correctly', async ({ page, context }) => {
    await boot(page, context);
    const result = await page.evaluate(async () => {
      const cur = await WEATHER.fetch();
      return cur;
    });
    expect(result).not.toBeNull();
    expect(result.temp).toBe(19);             // 19.4 rounded
    expect(result.feels).toBe(18);            // 18.1 rounded
    expect(result.condition).toBe('Clouds');
    expect(result.description).toBe('broken clouds');
    expect(result.isRaining).toBe(false);
    expect(result.isHot).toBe(false);
    expect(result.isCold).toBe(false);        // 19.4 >= 15
    expect(result.wind).toBe(3);              // 3.2 rounded
  });

  test('5: proxy unreachable (network error) falls back to cached state, no throw', async ({ page, context }) => {
    await boot(page, context, route => route.abort());  // proxy unreachable
    await page.evaluate(() => {
      // pre-seed a cached value so the fallback has something to return
      localStorage.setItem('slyght_weather', JSON.stringify({
        temp: 22, feels: 21, condition: 'Clear', description: 'clear sky',
        isRaining: false, isHot: false, isCold: false, isPerfectRun: true,
        wind: 1, ts: Date.now() - 60000,
      }));
    });
    const result = await page.evaluate(async () => {
      try {
        const cur = await WEATHER.fetch();
        return { ok: true, temp: cur && cur.temp };
      } catch (e) { return { ok: false, err: e.message }; }
    });
    expect(result.ok).toBe(true);
    expect(result.temp).toBe(22);             // came from cache, not network
  });

  test('6: proxy returns 503 (key not configured) gracefully falls back', async ({ page, context }) => {
    await boot(page, context, route => route.fulfill({
      status: 503, contentType: 'application/json',
      body: JSON.stringify({ error: 'owm-key-not-configured' }),
    }));
    const result = await page.evaluate(async () => {
      const cur = await WEATHER.fetch();
      return { current: cur };
    });
    // No throw, current is null (no cached value, no successful fetch).
    expect(result.current).toBeNull();
  });

});
