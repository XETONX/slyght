// Mission I — orchestrator.
// Spawns persona runs (configurable subset), then super brain.
// CLI flags:
//   --persona=NAME         restrict to single persona
//   --scenario=NAME        restrict to single scenario
//   --dry-run              skip Playwright + API; smoke test wiring only
//   --report-only          re-run super brain over an existing run dir
//   --report=PATH          path to existing run dir (with --report-only)
//   --no-super-brain       run personas only

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { CostTracker } = require('./cost-tracker');
const { runPersona } = require('./persona-runner');
const { runSuperBrain } = require('./super-brain');

const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORTS_ROOT = path.join(REPO_ROOT, 'test-reports');

// Priority order for the matrix. Free-explore scenario fires across all
// personas before any structured scenario, so highest-signal mode runs
// first. Within a scenario, personas execute in this priority — Nora and
// Connor first (highest signal per iteration 1), Sam (validates known
// anomalies), then Pat and Riley (lower-priority for first sweep).
const PERSONAS = ['nora', 'connor', 'sam', 'pat', 'riley'];
const SCENARIOS = ['free-explore', 'add-transaction', 'mark-bill-paid', 'export-state'];

function parseArgs(argv) {
  const args = { persona: null, scenario: null, dryRun: false, reportOnly: false, reportPath: null, noSuperBrain: false };
  for (const a of argv.slice(2)) {
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--report-only') args.reportOnly = true;
    else if (a === '--no-super-brain') args.noSuperBrain = true;
    else if (a.startsWith('--persona=')) args.persona = a.slice(10);
    else if (a.startsWith('--scenario=')) args.scenario = a.slice(11);
    else if (a.startsWith('--report=')) args.reportPath = a.slice(9);
  }
  return args;
}

function timestampDir() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function loadPersonaSystemPrompt(name) {
  const common = fs.readFileSync(path.join(__dirname, 'personas', '_common.md'), 'utf8');
  const persona = fs.readFileSync(path.join(__dirname, 'personas', name + '.md'), 'utf8');
  // Persona file ends with "Common preamble follows"; replace that section by appending the actual common preamble.
  const trimmed = persona.replace(/## Common preamble follows[\s\S]*$/m, '').trimEnd();
  return trimmed + '\n\n---\n\n' + common;
}

function loadScenario(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'scenarios', name + '.json'), 'utf8'));
}

// Spin up the static server for the duration of the run, like Mission V's webServer.
function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [path.join(REPO_ROOT, 'scripts/serve.js'), '4567'], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) { resolved = true; reject(new Error('serve.js did not start within 5s')); }
    }, 5000);
    child.stdout.on('data', (chunk) => {
      if (resolved) return;
      if (chunk.toString().includes('serving')) {
        resolved = true; clearTimeout(timer); resolve(child);
      }
    });
    child.stderr.on('data', (chunk) => { /* ignore noise */ });
    child.on('error', (e) => { if (!resolved) { resolved = true; clearTimeout(timer); reject(e); } });
  });
}

async function main() {
  const args = parseArgs(process.argv);
  console.log('[mission-i] args:', args);

  // --report-only branch: skip personas, just re-run super brain over existing dir
  if (args.reportOnly) {
    if (!args.reportPath) { console.error('--report-only requires --report=PATH'); process.exit(2); }
    const personaDir = args.reportPath;
    if (!fs.existsSync(personaDir)) { console.error('report path not found:', personaDir); process.exit(2); }
    const ct = new CostTracker({ runCap: 30, personaCap: 1, superBrainCap: 5 });
    const { reportMd } = await runSuperBrain({ personaResultsDir: personaDir, costTracker: ct, dryRun: args.dryRun });
    const outPath = path.join(personaDir, 'super-brain.md');
    fs.writeFileSync(outPath, reportMd);
    console.log('[mission-i] super-brain re-run written:', outPath);
    console.log('[mission-i] cost:', JSON.stringify(ct.summary(), null, 2));
    return;
  }

  // Build the matrix
  const personas = args.persona ? [args.persona] : PERSONAS;
  const scenarios = args.scenario ? [args.scenario] : SCENARIOS;
  for (const p of personas) if (!PERSONAS.includes(p)) { console.error('unknown persona:', p); process.exit(2); }
  for (const s of scenarios) if (!SCENARIOS.includes(s)) { console.error('unknown scenario:', s); process.exit(2); }

  const runDir = path.join(REPORTS_ROOT, timestampDir());
  fs.mkdirSync(runDir, { recursive: true });
  console.log('[mission-i] run dir:', runDir);
  console.log('[mission-i] matrix:', personas.length, 'personas x', scenarios.length, 'scenarios =', personas.length * scenarios.length, 'runs');

  // Start static server (the app runs from http://localhost:4567/index.html)
  let server = null;
  if (!args.dryRun) {
    server = await startServer();
    console.log('[mission-i] static server up');
  }

  // Run cap: $12 hard limit (per John's credit-conscious constraint).
  // Soft abort at $11.50 — leaves margin for the in-flight call to finish.
  // Per-persona $1, super-brain $5 (allowed within remaining budget).
  const ct = new CostTracker({ runCap: 12, personaCap: 1, superBrainCap: 5 });
  const SOFT_ABORT_USD = 11.5;
  const personaResults = [];
  let aborted = false;
  try {
    // Outer loop: scenarios in priority order (free-explore first).
    // Inner loop: personas in priority order (Nora > Connor > Sam > Pat > Riley).
    // This ensures free-explore × all personas fires before any structured
    // scenario, so highest-signal mode runs to completion within budget.
    outer: for (const scenarioName of scenarios) {
      const scenario = loadScenario(scenarioName);
      for (const personaName of personas) {
        if (ct.totalUsd >= SOFT_ABORT_USD) {
          console.warn('[mission-i] soft abort threshold reached ($' + ct.totalUsd.toFixed(2) + ' >= $' + SOFT_ABORT_USD + '); halting persona phase');
          aborted = true;
          break outer;
        }
        const systemPrompt = loadPersonaSystemPrompt(personaName);
        try {
          const result = await runPersona({
            personaName,
            scenarioName,
            systemPrompt,
            userGoal: scenario.user_goal,
            costTracker: ct,
            outDir: runDir,
            dryRun: args.dryRun,
          });
          personaResults.push(result);
        } catch (e) {
          console.error('[' + personaName + ':' + scenarioName + '] FAILED:', e.message);
          personaResults.push({ actor: personaName + ':' + scenarioName, error: e.message });
        }
      }
    }
  } finally {
    if (server) { try { server.kill(); } catch (_) {} }
  }
  if (aborted) {
    fs.writeFileSync(path.join(runDir, 'aborted.txt'),
      'Soft-aborted at $' + ct.totalUsd.toFixed(2) + ' / $' + ct.runCap + '. ' +
      personaResults.length + ' of ' + (personas.length * scenarios.length) + ' runs completed.\n');
  }

  // Persist persona-phase summary
  fs.writeFileSync(path.join(runDir, 'persona-results.json'), JSON.stringify(personaResults, null, 2));
  fs.writeFileSync(path.join(runDir, 'cost.json'), JSON.stringify(ct.summary(), null, 2));

  if (args.noSuperBrain) {
    console.log('[mission-i] --no-super-brain: skipping meta-review');
    console.log('[mission-i] cost so far:', JSON.stringify(ct.summary(), null, 2));
    return;
  }

  // Phase 2: Super Brain
  try {
    const { reportMd } = await runSuperBrain({ personaResultsDir: runDir, costTracker: ct, dryRun: args.dryRun });
    fs.writeFileSync(path.join(runDir, 'super-brain.md'), reportMd);
    console.log('[mission-i] super-brain report written:', path.join(runDir, 'super-brain.md'));
  } catch (e) {
    console.error('[mission-i] super-brain failed:', e.message);
    fs.writeFileSync(path.join(runDir, 'super-brain.error.txt'), e.message + '\n' + (e.stack || ''));
  }

  fs.writeFileSync(path.join(runDir, 'cost.json'), JSON.stringify(ct.summary(), null, 2));
  console.log('[mission-i] DONE');
  console.log('[mission-i] cost summary:', JSON.stringify(ct.summary(), null, 2));
  console.log('[mission-i] reports in:', runDir);
}

if (require.main === module) {
  main().catch(e => { console.error('FATAL:', e); process.exit(1); });
}
