// Capture the Mission Control cockpit's OWN surfaces (for the UX drone to judge) — deterministic,
// server-run. The cockpit is already live at 127.0.0.1:5050; we just drive a browser over its routes
// and screenshot, at desktop AND a narrow width (responsive). Output → mission-control/shots/cockpit/.
// Usage: node cockpit-shots.js [port]   → prints the out dir.
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PORT = process.argv[2] || '5050';
const BASE = 'http://127.0.0.1:' + PORT + '/#/';
const OUT = path.join(__dirname, '..', 'shots', 'cockpit');
// surface route → also captured narrow (the 380–600px phone-ish width the UX rules target)
const SURFACES = ['overview', 'command', 'board', 'ticket/SLY-1', 'briefing', 'deploy', 'map', 'architecture'];
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const manifest = [];
  for (const [w, tag] of [[1280, 'wide'], [600, 'narrow']]) {
    const pg = await b.newPage({ viewport: { width: w, height: 1100 } });
    for (const s of SURFACES) {
      const file = s.replace(/\//g, '_') + '.' + tag + '.png';
      try {
        await pg.goto(BASE + s, { waitUntil: 'networkidle', timeout: 20000 });
        await wait(700);
        await pg.screenshot({ path: path.join(OUT, file), fullPage: false });
        manifest.push({ surface: s, width: tag, file });
      } catch (e) { manifest.push({ surface: s, width: tag, file, error: (e && e.message || '').slice(0, 80) }); }
    }
    await pg.close();
  }
  await b.close();
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ ts: new Date().toISOString(), dir: OUT, shots: manifest }, null, 2));
  console.log(OUT);
  process.exit(0);
})().catch(e => { console.error(e && e.message); process.exit(1); });
