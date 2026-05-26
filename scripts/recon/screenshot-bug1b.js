// Locate where [object Object] still appears
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FIXTURE_PATH = path.resolve(__dirname, '..', '..', 'state-snapshot.json');
const APP_URL = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
const TODAY = '2026-05-21T10:30:00+10:00';

(async () => {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
  const seed = { S: fixture.S || {}, BILLS: fixture.BILLS || [] };
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 380, height: 1500 } });
  const page = await context.newPage();
  await page.clock.install({ time: new Date(TODAY) });
  await context.addInitScript((s) => {
    try { localStorage.setItem('slyght_v5', JSON.stringify(s)); } catch (_) {}
    for (let i = 0; i < 40; i++) { try { localStorage.setItem('slyght_seeded_v' + i, '1'); } catch (_) {} }
  }, seed);
  await page.goto(APP_URL);
  await page.waitForFunction(() => typeof BRAIN !== 'undefined', { timeout: 10000 });
  try { await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); }); } catch (_) {}
  await page.waitForTimeout(500);
  await page.evaluate(() => { try { if (typeof showTab === 'function') showTab('plan'); } catch(_) {} });
  await page.waitForTimeout(400);

  const ctxs = await page.evaluate(() => {
    const out = [];
    const NEEDLE = '[object Object]';
    function walk(el) {
      if (!el) return;
      if (el.nodeType === 3) {
        if (el.textContent && el.textContent.indexOf(NEEDLE) !== -1) {
          let p = el.parentElement;
          const chain = [];
          while (p && chain.length < 4) { chain.push(p.tagName + (p.id ? '#' + p.id : '') + (p.className ? '.' + String(p.className).split(' ').slice(0,2).join('.') : '')); p = p.parentElement; }
          out.push({ text: el.textContent.trim().substring(0, 200), chain: chain.join(' < ') });
        }
        return;
      }
      for (const c of el.childNodes) walk(c);
    }
    walk(document.body);
    return out;
  });

  await browser.close();
  console.log(JSON.stringify(ctxs, null, 2));
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
