#!/usr/bin/env node
/*
 * Feature-graph extractor — first-pass STATIC scan of index.html.
 * Part of the Walk-and-Judge capability (scoped 2026-05-26).
 *
 * Purpose: make the surface atlas "generated, not hand-drawn." Emits a
 * generated feature-graph from the code itself + a staleness report diffing
 * code-reality against FEATURE-MAP.md. The generated file is ground-truth-
 * from-code; FEATURE-MAP.md stays the curated layer reconciled against it.
 *
 * READ-ONLY. Touches no app state, no money logic. Run:
 *   node scripts/feature-graph/extract.js
 *
 * Limitation: regex over a single 28k-line file. Dead-handler flags are
 * CANDIDATES (verify), not conclusions — conservative to avoid false positives.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const INDEX = path.join(ROOT, 'index.html');
const FMAP = path.join(ROOT, 'FEATURE-MAP.md');
const OUT_DIR = path.join(ROOT, 'docs', 'feature-graph');

const html = fs.readFileSync(INDEX, 'utf8');
const lines = html.split(/\r?\n/);
const fmap = fs.existsSync(FMAP) ? fs.readFileSync(FMAP, 'utf8') : '';

// ---- 1. defined function / handler names (generous, to minimise false dead-flags) ----
const defined = new Set();
const defPatterns = [
  /function\s+([A-Za-z_$][\w$]*)\s*\(/g,
  /\b([A-Za-z_$][\w$]*)\s*=\s*function\b/g,
  /\b([A-Za-z_$][\w$]*)\s*=\s*async\s+function\b/g,
  /\b([A-Za-z_$][\w$]*)\s*=\s*\([^)]*\)\s*=>/g,
  /\b([A-Za-z_$][\w$]*)\s*=\s*async\s*\([^)]*\)\s*=>/g,
  /\b([A-Za-z_$][\w$]*)\s*:\s*function\b/g,
  /\b([A-Za-z_$][\w$]*)\s*:\s*async\s+function\b/g,
  /window\.([A-Za-z_$][\w$]*)\s*=/g,
];
for (const re of defPatterns) { let m; while ((m = re.exec(html))) defined.add(m[1]); }

// global objects whose .method() calls we never flag as dead
const KNOWN_OBJECTS = new Set(['BRAIN','EDIT_MODAL','PLAN_MODAL','PLAN','SNAPSHOTS','AUDITOR',
  'NOTIFY','RESET_FLOW','MathInvariants','UX','PUSH','MODEL','WEATHER','S','SLYGHT_SCORE',
  'document','window','console','localStorage','sessionStorage','Math','JSON','Object','Array',
  'event','this','navigator']);
const STMT_KW = new Set(['function','if','for','while','return','switch','catch','typeof','await','new']);
// bare-callable DOM/global builtins — never flag these as missing app handlers
const BUILTINS = new Set(['stepUp','stepDown','dispatchEvent','Event','CustomEvent','replace','setTimeout',
  'setInterval','clearTimeout','remove','parseFloat','parseInt','$','click','focus','blur','select',
  'preventDefault','stopPropagation','scrollIntoView','querySelector','querySelectorAll','getElementById',
  'alert','confirm','prompt','String','Number','Boolean','Date','requestAnimationFrame','vibrate',
  'toFixed','trim','toLowerCase','toUpperCase','push','splice','filter','map','forEach','add','toggle']);

// ---- 2. screens + modals/overlays (with line numbers) ----
const screens = [];
const modals = [];
lines.forEach((ln, i) => {
  const lineNo = i + 1;
  let m;
  const reScreen = /id="(pg-[\w-]+)"/g;
  while ((m = reScreen.exec(ln))) screens.push({ id: m[1], line: lineNo });
  const reModal = /id="([\w-]+(?:-modal|-overlay|-screen|-subscreen))"/g;
  while ((m = reModal.exec(ln))) modals.push({ id: m[1], line: lineNo });
});

// ---- 3. interactive handlers ----
const handlers = [];
const reHandler = /on(click|change|input|keydown|keyup|submit)\s*=\s*"([^"]*)"/gi;
lines.forEach((ln, i) => {
  let m;
  while ((m = reHandler.exec(ln))) {
    const event = m[1].toLowerCase();
    const expr = m[2].trim();
    const calls = [...expr.matchAll(/([A-Za-z_$][\w$.]*)\s*\(/g)].map(c => c[1]);
    calls.forEach(call => {
      const top = call.split('.')[0];
      const isMethod = call.includes('.');
      const isDefined = isMethod ? (KNOWN_OBJECTS.has(top) || defined.has(top)) : defined.has(call);
      handlers.push({ event, expr, fn: call, line: i + 1, isMethod, isDefined });
    });
  }
});

// candidate dead/missing handlers: bare global call, not defined, not a keyword
const deadMap = new Map();
handlers.forEach(h => {
  if (!h.isMethod && !h.isDefined && !STMT_KW.has(h.fn) && !BUILTINS.has(h.fn)) {
    if (!deadMap.has(h.fn)) deadMap.set(h.fn, h.line);
  }
});
const deadCandidates = [...deadMap.entries()].map(([fn, line]) => ({ fn, line }));

// ---- 4. render functions ----
const renderFns = [...html.matchAll(/function\s+(render[A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]).sort();

// ---- 5. FEATURE-MAP paths + planned-status sections ----
const mappedPaths = [...fmap.matchAll(/\*\*Path:\*\*\s*`([^`]+)`/g)].map(m => m[1].trim());
const plannedSections = [...fmap.matchAll(/\|\s*([^|]+?)\s*\|\s*[^|]*planned[^|]*\|/gi)]
  .map(m => m[1].trim()).filter(s => s && !/Section/i.test(s));

// ---- assemble ----
const handlerByScreenless = {};
const uniqHandlerFns = [...new Set(handlers.map(h => h.fn))].sort();
const totalSurfaces = screens.length + modals.length;

fs.mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString();

// 5a. generated atlas
let md = `# FEATURE-GRAPH (generated)\n\n`;
md += `> **Generated by \`scripts/feature-graph/extract.js\` — do NOT hand-edit.**\n`;
md += `> Static scan of \`index.html\`. Regenerate after surface changes.\n`;
md += `> Generated: ${stamp}\n\n`;
md += `## Counts\n\n`;
md += `- Screens (\`pg-*\`): **${screens.length}**\n`;
md += `- Modals/overlays/subscreens: **${modals.length}**\n`;
md += `- Total interactive surfaces: **${totalSurfaces}**\n`;
md += `- Distinct handler call-targets: **${uniqHandlerFns.length}**\n`;
md += `- Render functions (\`render*\`): **${renderFns.length}**\n`;
md += `- FEATURE-MAP \`**Path:**\` entries: **${mappedPaths.length}**\n`;
md += `- Candidate missing-handler call-targets: **${deadCandidates.length}**\n\n`;

md += `## Screens\n\n`;
screens.sort((a,b)=>a.id.localeCompare(b.id)).forEach(s => { md += `- \`${s.id}\` — index.html:${s.line}\n`; });
md += `\n## Modals / overlays / subscreens\n\n`;
modals.sort((a,b)=>a.id.localeCompare(b.id)).forEach(m => { md += `- \`#${m.id}\` — index.html:${m.line}\n`; });
md += `\n## Render functions\n\n`;
renderFns.forEach(f => { md += `- \`${f}()\`\n`; });
md += `\n## Distinct handler call-targets\n\n`;
uniqHandlerFns.forEach(f => { md += `- \`${f}\`\n`; });
fs.writeFileSync(path.join(OUT_DIR, 'FEATURE-GRAPH.generated.md'), md);

// 5b. staleness report
let stale = `# Feature-graph staleness report (generated)\n\n`;
stale += `> Diff of code-reality vs FEATURE-MAP.md. Generated: ${stamp}\n\n`;
stale += `## Coverage gap\n\n`;
stale += `- Interactive surfaces in code: **${totalSurfaces}** (screens ${screens.length} + modals ${modals.length})\n`;
stale += `- \`**Path:**\` entries in FEATURE-MAP.md: **${mappedPaths.length}**\n`;
stale += `- Net unmapped surfaces (rough): **${Math.max(0, totalSurfaces - mappedPaths.length)}**\n\n`;
stale += `## FEATURE-MAP sections still marked "planned"\n\n`;
stale += `(Surface render fns may already exist — verify each against the render-fn list.)\n\n`;
[...new Set(plannedSections)].forEach(s => { stale += `- ${s}\n`; });
stale += `\n## Candidate missing-handler call-targets (VERIFY — not conclusions)\n\n`;
if (deadCandidates.length === 0) stale += `_None found._\n`;
else deadCandidates.sort((a,b)=>a.line-b.line).forEach(d => { stale += `- \`${d.fn}()\` — first seen index.html:${d.line} (no definition found by static scan)\n`; });
fs.writeFileSync(path.join(OUT_DIR, 'feature-graph-staleness.md'), stale);

// 5c. machine-readable
fs.writeFileSync(path.join(OUT_DIR, 'feature-graph.json'), JSON.stringify({
  generated: stamp, screens, modals, renderFns,
  handlerTargets: uniqHandlerFns, deadCandidates,
  mappedPathCount: mappedPaths.length, plannedSections: [...new Set(plannedSections)],
}, null, 2));

// console summary
console.log('=== Feature-graph extractor ===');
console.log(`Screens: ${screens.length} | Modals/overlays: ${modals.length} | Total surfaces: ${totalSurfaces}`);
console.log(`Render fns: ${renderFns.length} | Handler targets: ${uniqHandlerFns.length}`);
console.log(`FEATURE-MAP Path entries: ${mappedPaths.length} | rough unmapped: ${Math.max(0, totalSurfaces - mappedPaths.length)}`);
console.log(`Candidate missing handlers: ${deadCandidates.length}`);
if (deadCandidates.length) console.log('  ' + deadCandidates.slice(0,20).map(d=>d.fn).join(', '));
console.log(`Output → docs/feature-graph/ (FEATURE-GRAPH.generated.md, feature-graph-staleness.md, feature-graph.json)`);
