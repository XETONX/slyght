// Mission I — Super Brain meta-reviewer.
// Loads all persona transcripts + fixture + git log + OPEN-BUGS + STATE-AUDIT,
// then makes a single API call with the super-brain system prompt and the
// full context. Output is the run's headline report.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { callApi, DEFAULT_MODEL } = require('./anthropic-client');

const REPO_ROOT = path.resolve(__dirname, '../..');

function readFileSafe(p, max = 80000) {
  try {
    const txt = fs.readFileSync(p, 'utf8');
    if (txt.length > max) return txt.slice(0, max) + '\n[... truncated ' + (txt.length - max) + ' bytes ...]';
    return txt;
  } catch (_) { return '[file not found: ' + path.basename(p) + ']'; }
}

function readGitLog() {
  try {
    return execSync('git log --oneline -n 20', { cwd: REPO_ROOT, encoding: 'utf8' });
  } catch (_) { return '[git log unavailable]'; }
}

function readFixtureSummary() {
  try {
    const fx = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'state-snapshot.json'), 'utf8'));
    const S = fx.S || {};
    return {
      bal: S.bal,
      payday: S.payday,
      paydayReceived: !!S.paydayReceived,
      txnCount: (S.txns || []).length,
      debtsActive: (S.debts || []).filter(d => !d.paid && !d.viaRent).map(d => ({ name: d.name, amt: d.amt, delayDate: d.delayDate })),
      paidBillsKeys: Object.keys(S.paidBills || {}),
      savingsBuckets: (S.savingsBuckets || []).map(b => ({ name: b.name, saved: b.saved, goal: b.goal })),
      BILLS: (fx.BILLS || []).map(b => ({ name: b.name, amt: b.amt, day: b.day, freq: b.freq, recurring: b.recurring, dueMonth: b.dueMonth })),
    };
  } catch (e) { return { error: e.message }; }
}

function readPersonaTranscripts(personaResultsDir) {
  const transcripts = [];
  for (const sub of fs.readdirSync(personaResultsDir)) {
    const tPath = path.join(personaResultsDir, sub, 'transcript.json');
    if (!fs.existsSync(tPath)) continue;
    try {
      const t = JSON.parse(fs.readFileSync(tPath, 'utf8'));
      // Strip image bytes from tool_results to keep context lean.
      // We pass actor + result + findings, plus a compact action log.
      transcripts.push({
        actor: t.actor,
        persona: t.result.persona,
        scenario: t.result.scenario,
        endReason: t.result.endReason,
        turns: t.result.turns,
        findings: t.result.findings,
        actions: (t.result.actions || []).map(a => ({
          name: a.name,
          input: typeof a.input === 'object' ? a.input : a.input,
          // Compress result: keep ok/error/path/count, drop base64
          result: a.result && typeof a.result === 'object'
            ? { ok: a.result.ok, error: a.result.error, value: a.result.value, strategy: a.result.strategy, recorded: a.result.recorded ? a.result.recorded.summary : undefined }
            : a.result,
        })),
        pageErrors: t.result.pageErrors,
      });
    } catch (e) { console.warn('failed to read transcript ' + tPath + ':', e.message); }
  }
  return transcripts;
}

async function runSuperBrain({ personaResultsDir, costTracker, dryRun = false, verbose = true }) {
  const log = (...args) => verbose && console.log('[super-brain]', ...args);
  log('start');

  if (dryRun) {
    log('DRY RUN — skipping API call');
    return { reportMd: '# Super Brain DRY RUN\n\nWould have analysed transcripts in ' + personaResultsDir + '\n', cost: 0 };
  }

  const systemPrompt = readFileSafe(path.join(__dirname, 'personas', 'super-brain.md'));

  const transcripts = readPersonaTranscripts(personaResultsDir);
  const fixtureSummary = readFixtureSummary();
  const gitLog = readGitLog();
  const openBugs = readFileSafe(path.join(REPO_ROOT, 'OPEN-BUGS.md'), 60000);
  const stateAudit = readFileSafe(path.join(REPO_ROOT, 'STATE-AUDIT-2026-05-05.md'), 30000);

  const userMessage = [
    '# Mission I run — your inputs',
    '',
    '## Frozen date',
    '2026-05-05T22:00:00+10:00',
    '',
    '## Fixture summary',
    '```json',
    JSON.stringify(fixtureSummary, null, 2),
    '```',
    '',
    '## Recent git log (last 20)',
    '```',
    gitLog,
    '```',
    '',
    '## OPEN-BUGS.md',
    openBugs,
    '',
    '## STATE-AUDIT-2026-05-05.md',
    stateAudit,
    '',
    '## Persona transcripts (' + transcripts.length + ' runs)',
    '```json',
    JSON.stringify(transcripts, null, 2),
    '```',
    '',
    'Now produce the report per the output structure in your system prompt. Tight prose. Mission scaffolds for every HARD_FAIL and every convergence ≥ 2 finding. Verification commands in every scaffold. Be specific about evidence — cite persona, scenario, finding text, state values.',
  ].join('\n');

  costTracker.assertWithinCaps('super-brain', 'super-brain');
  const resp = await callApi({
    model: DEFAULT_MODEL,
    system: systemPrompt,
    messages: [{ role: 'user', content: [{ type: 'text', text: userMessage }] }],
    tools: [],
    max_tokens: 8000,
    temperature: 0.4,
  });
  costTracker.record('super-brain', DEFAULT_MODEL, resp.usage?.input_tokens || 0, resp.usage?.output_tokens || 0);

  const reportMd = (resp.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n\n');
  const cost = costTracker.summary().byActor['super-brain'] || { usd: 0 };
  log('end:', cost.usd, 'USD,', resp.usage?.input_tokens, 'in /', resp.usage?.output_tokens, 'out');
  return { reportMd, cost: cost.usd };
}

module.exports = { runSuperBrain };
