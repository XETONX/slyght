// Debug: investigate the mystery vertical strip on .pd-row-card cards.
// Loads the local app, opens canvas → savings sub-screen, inspects the
// DOM elements at the strip position, dumps computed styles + bounding
// rects. Run with: node scripts/debug-row-strip.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const fixturePath = path.resolve(__dirname, '..', 'state-snapshot.json');
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const seed = { S: fixture.S || fixture, BILLS: fixture.BILLS || [] };

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 3.5,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();
  await ctx.addInitScript((args) => {
    try { localStorage.setItem('slyght_v5', JSON.stringify(args.seed)); } catch (_) {}
    try { localStorage.setItem('slyght_payday_canvas_seen', '1'); } catch (_) {}
  }, { seed });

  await page.goto('http://localhost:4567/slyght/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // Open canvas + savings sub-screen
  await page.evaluate(() => {
    if (typeof goPage === 'function') goPage('pg-plan');
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    if (typeof openPaydayPlan === 'function') openPaydayPlan();
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    if (typeof openPaydayCategory === 'function') openPaydayCategory('payday-savings');
  });
  await page.waitForTimeout(500);

  // Find all pd-row-card elements + their bounding rects + computed styles
  const inspection = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.pd-row-card'));
    return rows.map((r, i) => {
      const rect = r.getBoundingClientRect();
      const cs = getComputedStyle(r);
      const before = getComputedStyle(r, '::before');
      const after = getComputedStyle(r, '::after');
      // Find any progress div inside
      const prog = r.querySelector('.pd-row-progress');
      const progRect = prog ? prog.getBoundingClientRect() : null;
      const progCs = prog ? getComputedStyle(prog) : null;
      return {
        index: i,
        text: (r.textContent || '').slice(0, 60).trim(),
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        outline: cs.outline,
        outlineStyle: cs.outlineStyle,
        outlineColor: cs.outlineColor,
        outlineWidth: cs.outlineWidth,
        border: cs.border,
        borderLeft: cs.borderLeft,
        boxShadow: cs.boxShadow,
        beforeContent: before.content,
        beforeDisplay: before.display,
        afterContent: after.content,
        afterDisplay: after.display,
        hasProgress: !!prog,
        progressRect: progRect ? { x: progRect.x, y: progRect.y, w: progRect.width, h: progRect.height } : null,
        progressBg: progCs ? progCs.background : null,
      };
    });
  });

  console.log('--- pd-row-card inspection ---');
  console.log(JSON.stringify(inspection, null, 2));

  // Probe ALL children of pd-row-card to find what's rendering as a strip
  const childInspection = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.pd-row-card')).slice(0, 3);
    return cards.map((card, i) => {
      const cardRect = card.getBoundingClientRect();
      const children = Array.from(card.children).map(c => {
        const cs = getComputedStyle(c);
        const rect = c.getBoundingClientRect();
        return {
          tag: c.tagName,
          class: c.className,
          rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
          relX: rect.x - cardRect.x,
          relY: rect.y - cardRect.y,
          display: cs.display,
          gridRow: cs.gridRow,
          gridColumn: cs.gridColumn,
          overflow: cs.overflow,
          bg: cs.backgroundColor,
        };
      });
      return { cardIndex: i, cardRect: { x: cardRect.x, y: cardRect.y, w: cardRect.width, h: cardRect.height }, children };
    });
  });
  console.log('\n--- card children inspection ---');
  console.log(JSON.stringify(childInspection, null, 2));

  // Take a focused screenshot of one card + its neighbour to see the strip
  await page.evaluate(() => {
    const card = document.querySelectorAll('.pd-row-card')[1];
    if (card) card.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'captures/debug-strip-savings.png', fullPage: false, clip: { x: 0, y: 250, width: 412, height: 500 } });
  console.log('\nScreenshot saved: captures/debug-strip-savings.png');

  // Paint-debug: add coloured outlines to suspect elements to see them
  await page.evaluate(() => {
    const css = document.createElement('style');
    css.textContent = `
      .pd-row-card { outline: 2px solid red !important; outline-offset: 0 !important; }
      .pd-row-group { outline: 2px solid lime !important; outline-offset: 0 !important; }
      .pd-row-avatar { outline: 2px dashed cyan !important; }
      .pd-row-progress { outline: 2px solid magenta !important; }
    `;
    document.head.appendChild(css);
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'captures/debug-strip-paintdebug.png', fullPage: false, clip: { x: 0, y: 250, width: 412, height: 500 } });
  console.log('Paint-debug screenshot saved: captures/debug-strip-paintdebug.png');

  // Precise pixel hit-test ON the strip. After scrollIntoView, China card is centered.
  // Sweep along the LEFT edge between cards looking for the strip element.
  const sweep = await page.evaluate(() => {
    const card = document.querySelectorAll('.pd-row-card')[1];
    if (!card) return null;
    const rect = card.getBoundingClientRect();
    // Sweep x from 0 to 30 (left-edge area), y just below card bottom
    const results = [];
    for (let x = 0; x <= 30; x += 2) {
      for (let y = rect.bottom + 2; y <= rect.bottom + 30; y += 4) {
        const el = document.elementFromPoint(x, y);
        if (!el) continue;
        const cs = getComputedStyle(el);
        // Only record if the element has visible "light" content (bg not transparent, not full-dark)
        const bg = cs.backgroundColor;
        const border = cs.borderColor;
        results.push({ x, y, tag: el.tagName, class: el.className || '', id: el.id || '', bg, borderColor: border });
      }
    }
    return results;
  });
  console.log('\n--- left-edge sweep below card[1] ---');
  // Filter to interesting results (non-transparent bg or non-zero border)
  const interesting = (sweep || []).filter(r => {
    return r.bg !== 'rgba(0, 0, 0, 0)' || (r.borderColor && r.borderColor !== 'rgba(0, 0, 0, 0)');
  });
  console.log(JSON.stringify(interesting, null, 2));

  await browser.close();
})();
