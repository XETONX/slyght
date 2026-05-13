// Diagnostic — Mission #45a banner DOM capture (untracked, gitignored)
// Replicates Mission V's fixture-load harness so MI-13 actually fires.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const FIXTURE_PATH = path.resolve(__dirname, 'state-snapshot.json');
const FROZEN_ISO = '2026-05-05T22:00:00+10:00';

function buildSlyghtV5(fx) {
  const S = Object.assign({}, fx.S || {});
  if (fx.paidBills && !S.paidBills) S.paidBills = fx.paidBills;
  return { S, BILLS: fx.BILLS || [] };
}

(async () => {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
  const seed = buildSlyghtV5(fixture);

  // start serve.js
  const server = spawn('node', [path.join(__dirname, 'scripts/serve.js'), '4567'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise(r => setTimeout(r, 1500));

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 3,
  });
  const page = await ctx.newPage();

  await page.clock.install({ time: new Date(FROZEN_ISO) });

  await ctx.addInitScript((args) => {
    try { localStorage.setItem('slyght_v5', JSON.stringify(args.seed)); } catch (_) {}
    try { localStorage.setItem('slyght_seeded_v13', '1'); } catch (_) {}
    try { localStorage.setItem('slyght_seeded_v12', '1'); } catch (_) {}
    try { localStorage.setItem('slyght_seeded_v11', '1'); } catch (_) {}
    try { localStorage.setItem('slyght_bills_reset_month', args.monthKey); } catch (_) {}
  }, { seed, monthKey: '2026-5' });

  await page.goto('http://localhost:4567/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  // Dismiss splash
  await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page.waitForSelector('#splash-screen', { state: 'hidden' }).catch(() => {});
  await page.waitForTimeout(800);

  const result = await page.evaluate(() => {
    const b = document.getElementById('math-invariant-banner');
    if (!b) return { exists: false };
    const cs = getComputedStyle(b);
    return {
      exists: true,
      visible: cs.display !== 'none',
      display: cs.display,
      childrenCount: b.children.length,
      bannerRect: b.getBoundingClientRect(),
      mibMsgText: (document.getElementById('mib-msg') || {}).textContent || '',
      children: Array.from(b.children).map(c => ({
        tag: c.tagName,
        id: c.id || null,
        text: (c.textContent || '').slice(0, 80),
        display: getComputedStyle(c).display,
        visibility: getComputedStyle(c).visibility,
        position: getComputedStyle(c).position,
        opacity: getComputedStyle(c).opacity,
        rect: c.getBoundingClientRect(),
      })),
      // Also check what MathInvariants.check() returns
      lastViolations: (typeof MathInvariants !== 'undefined' && MathInvariants._lastViolations)
        ? MathInvariants._lastViolations.map(v => ({ name: v.name, tier: v.tier, dismissPolicy: v.dismissPolicy }))
        : null,
    };
  });
  console.log(JSON.stringify(result, null, 2));

  await page.screenshot({ path: 'banner-actual.png', fullPage: false });
  console.log('---');
  console.log('Screenshot saved to banner-actual.png');

  await browser.close();
  server.kill();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
