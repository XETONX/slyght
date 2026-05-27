// The pre-ship VERIFICATION GATE (server-run, deterministic — not a drone, so the verdict is trustworthy).
// Runs in the main worktree against the staged fix and answers ONE question: is this safe to ship?
//   1. Guardian (static) — does the staged change introduce any NEW finding? (Pre-existing findings on
//      main don't block; only findings on lines this work touched do.)
//   2. Smoke — does the ticket's own regression spec pass 5/5? (No spec at all = FAIL: CLAUDE.md requires
//      every fix ship paired with a spec. That rule is now enforced, not hoped-for.)
// Usage:  node verify-fix.js <SLY-N | --staged> <worktreePath>
// Emits ONE line of JSON to stdout (the server parses it). This exists because a drone's self-reported
// "smokePassed:true" let a wrong assertion reach the push gate (SLY-1, 2026-05-28). Determinism fixes that.
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const [, , TARGET, WT] = process.argv;
if (!TARGET || !WT) { console.log(JSON.stringify({ ok: false, error: 'usage: verify-fix.js <id|--staged> <worktree>' })); process.exit(0); }

function sh(cmd, extra = {}) {
  try { return execSync(cmd, { cwd: WT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024, ...extra }); }
  catch (e) { return (e.stdout || '') + (e.stderr || ''); }   // guardian/playwright exit non-zero on findings/failures — we parse output, not exit code
}

const out = { ok: false, target: TARGET, ts: new Date().toISOString() };
try {
  out.sha = sh('git rev-parse HEAD').trim().slice(0, 40);

  // ── Added-line ranges of the staged delta (origin/main..HEAD) on index.html ──
  // The worktree carries only the ticket(s) being shipped, so this delta == the fix's lines.
  const diff = sh('git diff origin/main HEAD -- index.html');
  const addedRanges = [];
  diff.split('\n').forEach(l => {
    const m = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (m) { const start = +m[1], len = m[2] === undefined ? 1 : +m[2]; addedRanges.push([start, start + len]); }
  });
  const inAdded = (ln) => addedRanges.some(([a, b]) => ln >= a && ln < b);

  // ── Guardian (static): new findings only ──
  const gOut = sh('node guardian-static.js');
  const failTotalM = gOut.match(/(\d+)\s+FAIL finding/);
  out.guardian = { failTotal: failTotalM ? +failTotalM[1] : 0, newFindings: [] };
  // FAIL findings live between the "FAIL finding(s):" header and the "WARN finding(s):" header.
  const failSection = gOut.split(/FAIL finding\(s\):/)[1];
  if (failSection) {
    const beforeWarn = failSection.split(/WARN finding\(s\):/)[0];
    const lines = beforeWarn.split('\n');
    let rule = '';
    lines.forEach(l => {
      const r = l.match(/^\s{3}([a-z0-9-]+)\s+\(anchor/);
      if (r) { rule = r[1]; return; }
      const f = l.match(/^\s+L(\d+):\d+\s+(.*)$/);
      if (f && inAdded(+f[1])) out.guardian.newFindings.push({ rule, line: +f[1], detail: f[2].trim().slice(0, 80) });
    });
  }

  // ── Smoke: the ticket's own spec (id mode) or the specs the staged delta changed (--staged mode) ──
  let specs = [];
  const smokeDir = path.join(WT, 'tests', 'smoke');
  if (TARGET === '--staged') {
    const names = sh('git diff --name-only origin/main HEAD -- tests/smoke').split('\n').map(s => s.trim()).filter(Boolean);
    specs = names.map(n => path.basename(n)).filter(n => n.endsWith('.smoke.js'));
  } else {
    // Find smoke specs that reference this ticket id (the regression guard the fix shipped with).
    try {
      for (const f of fs.readdirSync(smokeDir)) {
        if (!f.endsWith('.smoke.js')) continue;
        const txt = fs.readFileSync(path.join(smokeDir, f), 'utf8');
        if (new RegExp('\\b' + TARGET.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b').test(txt)) specs.push(f);
      }
    } catch (_) {}
  }
  specs = [...new Set(specs)];
  out.smoke = { specs, passed: 0, failed: 0, ran: false, tail: '' };

  if (specs.length === 0) {
    out.smoke.reason = 'no regression spec references ' + TARGET + ' — CLAUDE.md requires every fix ship with a spec';
  } else {
    const arg = specs.map(s => 'tests/smoke/' + s).join(' ');
    const sOut = sh('npx playwright test ' + arg + ' --config=playwright.smoke.config.js', { timeout: 180000 });
    out.smoke.ran = true;
    const pM = sOut.match(/(\d+)\s+passed/); const fM = sOut.match(/(\d+)\s+failed/);
    out.smoke.passed = pM ? +pM[1] : 0;
    out.smoke.failed = fM ? +fM[1] : 0;
    out.smoke.tail = sOut.split('\n').filter(l => /passed|failed|✘|✓|ok \d|x  \d|Error:/.test(l)).slice(-8).join('\n').slice(-700);
  }

  out.ok = out.guardian.newFindings.length === 0 && out.smoke.ran && out.smoke.failed === 0 && out.smoke.passed > 0;
} catch (e) {
  out.error = (e && e.message) || String(e);
}
console.log(JSON.stringify(out));
process.exit(0);
