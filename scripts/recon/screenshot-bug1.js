// Capture Trips-list rendering for Bug-1 verification (post-fix).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FIXTURE_PATH = path.resolve(__dirname, '..', '..', 'state-snapshot.json');
const APP_URL = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const OUT_DIR = path.resolve(__dirname, '..', '..', 'tests', 'visual-captures', 'recon');
const TODAY = '2026-05-21T10:30:00+10:00';

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
  const seed = { S: fixture.S || {}, BILLS: fixture.BILLS || [] };

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 380, height: 1500 } });
  const page = await context.newPage();
  await page.clock.install({ time: new Date(TODAY) });

  await context.addInitScript((s) => {
    try { localStorage.setItem('slyght_v5', JSON.stringify(s)); } catch (_) {}
    for (let i = 0; i < 40; i++) {
      try { localStorage.setItem('slyght_seeded_v' + i, '1'); } catch (_) {}
    }
  }, seed);

  await page.goto(APP_URL);
  await page.waitForFunction(() => typeof BRAIN !== 'undefined' && BRAIN.plan, { timeout: 10000 });
  try { await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); }); } catch (_) {}
  await page.waitForTimeout(700);

  // Try to navigate to Plan tab and trips section
  await page.evaluate(() => {
    try { if (typeof showTab === 'function') showTab('plan'); } catch(_) {}
  });
  await page.waitForTimeout(400);

  // Grab full HTML and check for "[object Object]" anywhere
  const html = await page.content();
  const obj_occurrences = (html.match(/\[object Object\]/g) || []).length;

  // Find trips by name (Darwin is the test case)
  const tripInfo = await page.evaluate(() => {
    const trips = (BRAIN.plan && BRAIN.plan.intent && BRAIN.plan.intent.byKind) ? BRAIN.plan.intent.byKind('trip') : [];
    return trips.filter(t => !t.archived).map(t => ({
      name: t.name,
      coveredCount: (t.meta && Array.isArray(t.meta.covered)) ? t.meta.covered.length : 0,
      coveredShape: (t.meta && t.meta.covered && t.meta.covered[0]) ? (typeof t.meta.covered[0] === 'object' ? 'object' : 'string') : 'empty',
      sample: (t.meta && t.meta.covered && t.meta.covered[0]) || null,
    }));
  });

  const out = path.join(OUT_DIR, 'bug-1-trip-list-post-fix.png');
  await page.screenshot({ path: out, fullPage: true });
  await browser.close();
  console.log(JSON.stringify({ object_object_occurrences: obj_occurrences, tripInfo, screenshot: out }, null, 2));
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
