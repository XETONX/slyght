#!/usr/bin/env node
/* ============================================================================
 * slyght — Mission Control server
 *
 * The ONE piece that turns the read-only cockpit page into a cockpit with hands.
 * A browser page cannot write to disk (sandbox); this Node process — started by
 * John, running with his permissions — does the writing, but ONLY through a
 * fixed, named, path-jailed set of actions. Built to the seven hard security
 * rules (see mission-control/SECURITY.md):
 *
 *   1. Localhost-only      — listen on 127.0.0.1, never 0.0.0.0.
 *   2. Allowlisted actions — a FIXED menu; no arbitrary exec / writeFile(path).
 *   3. Path-jailing        — every write resolves inside the slyght repo or is rejected.
 *   4. Origin-locked + token — writes need the right Origin stamp AND the start-time token.
 *   5. Manual start/stop   — `node mission-control/server.js`; Ctrl-C kills it.
 *   6. Deploy confirm      — deploy() (git push) needs explicit confirm:true.
 *   7. Written down        — this header + SECURITY.md.
 *
 * Start:  node mission-control/server.js   →  open the printed http://127.0.0.1:5050
 * ==========================================================================*/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync, execSync } = require('child_process');

const PORT = 5050;
const HOST = '127.0.0.1';                              // RULE 1 — loopback only, hard-coded
const REPO = path.resolve(__dirname, '..');            // the slyght repo root (server lives in mission-control/)
const MC = __dirname;
// The ONLY branches a deploy push may target. slyght's live app (GitHub Pages) ships from main; the
// Mission Control cockpit lives on `mission-control`. Pushing the cockpit branch would publish the tool
// to the live finance app — so deploy HARD-REFUSES from any branch not in this list.
const DEPLOY_BRANCHES = ['main'];
// Execute-fix runs in an ISOLATED git worktree checked out on `main` — so a fix-implementing drone
// edits the real app on the deploy branch WITHOUT touching the cockpit (mission-control) checkout.
// Nothing auto-pushes; John reviews the diff in Deploy and pushes. Sibling dir, gitignored from commits.
const WORKTREE = path.resolve(__dirname, '..', '..', 'slyght-deploy');
function gitBranchOf(dir) { try { return require('child_process').execSync('git rev-parse --abbrev-ref HEAD', { cwd: dir }).toString().trim(); } catch (_) { return ''; } }
function gitHeadOf(dir) { try { return require('child_process').execSync('git rev-parse HEAD', { cwd: dir }).toString().trim().slice(0, 40); } catch (_) { return ''; } }
// Where `main` deploys (GitHub Pages). Used ONLY by the read-only deploy-status probe (deployStatus):
// a single hardcoded GET via the `curl` SUBPROCESS — the same "subprocesses do the network, the server
// process opens no sockets" posture as `git push` + the claude drones. No secrets, read-only, one URL.
const LIVE_URL = 'https://xetonx.github.io/slyght/';
const DEPLOY_LOG = path.join(MC, 'deploy-log.json');   // append-only record of pushes → live (gitignored, runtime)
function readDeployLog() { try { return JSON.parse(fs.readFileSync(DEPLOY_LOG, 'utf8')); } catch { return { deploys: [] }; } }
function writeDeployLog(d) { fs.writeFileSync(jail(path.join('mission-control', 'deploy-log.json')), JSON.stringify(d, null, 2)); }
function normHash(s) { return require('crypto').createHash('sha256').update(String(s).replace(/\r/g, '')).digest('hex'); }
function ensureWorktree() {
  try {
    const list = require('child_process').execSync('git worktree list --porcelain', { cwd: REPO }).toString();
    const norm = WORKTREE.replace(/\\/g, '/');
    if (list.includes('worktree ' + norm) || list.includes('worktree ' + WORKTREE)) { linkNodeModules(); syncWorktreeIfClean(); return { ok: true, path: WORKTREE, existed: true, branch: gitBranchOf(WORKTREE) }; }
  } catch (_) {}
  try {
    require('child_process').execSync('git worktree add ' + JSON.stringify(WORKTREE) + ' main', { cwd: REPO, stdio: 'pipe' });
    linkNodeModules();
    return { ok: true, path: WORKTREE, existed: false, branch: gitBranchOf(WORKTREE) };
  } catch (e) { return { ok: false, error: (e.stderr ? e.stderr.toString() : '') || e.message }; }
}
// The worktree has no node_modules (not committed) → Guardian/tests can't run there. Junction/symlink
// it to the main repo's node_modules so the fix + code-audit drones can run `npm run guardian` in the worktree.
// Keep the sandbox matching the LIVE app: when the worktree is CLEAN (no uncommitted edits, nothing
// unpushed), fetch + hard-reset to origin/main so each fresh fix starts from the latest SHIPPED state.
// If there's in-progress work (a pending fix), leave it untouched — never nuke unreviewed work.
function syncWorktreeIfClean() {
  try {
    const sh = (c) => execSync(c, { cwd: WORKTREE }).toString().trim();
    const dirty = sh('git status --porcelain').length > 0;
    const ahead = (sh('git rev-list --count origin/main..HEAD') || '0') !== '0';
    if (dirty || ahead) return { synced: false, reason: 'worktree has in-progress work' };
    execSync('git fetch origin main --quiet', { cwd: WORKTREE });
    execSync('git reset --hard origin/main', { cwd: WORKTREE, stdio: 'pipe' });
    return { synced: true };
  } catch (e) { return { synced: false, reason: e.message }; }
}
function linkNodeModules() {
  try {
    const wtNM = path.join(WORKTREE, 'node_modules'); const repoNM = path.join(REPO, 'node_modules');
    if (fs.existsSync(wtNM) || !fs.existsSync(repoNM)) return;
    if (process.platform === 'win32') require('child_process').execSync('mklink /J ' + JSON.stringify(wtNM) + ' ' + JSON.stringify(repoNM), { stdio: 'pipe' });
    else fs.symlinkSync(repoNM, wtNM, 'dir');
  } catch (_) { /* best-effort — Guardian just won't run in the worktree, code-audit + review still gate */ }
}
// RULE 4 — origin+token gate the write path. The token PERSISTS across restarts (cached in a
// gitignored file) so a server restart no longer rotates it out from under an open page (which
// surfaced as a confusing "missing token" on every action until refresh). Still localhost-only +
// per-machine secret; delete the file to rotate. First run generates + writes it.
const TOKEN = (() => {
  const tf = path.join(__dirname, '.mc-token');
  try { const t = fs.readFileSync(tf, 'utf8').trim(); if (/^[A-Za-z0-9_-]{16,}$/.test(t)) return t; } catch (_) {}
  const t = crypto.randomBytes(24).toString('base64url');
  try { fs.writeFileSync(tf, t); } catch (_) {}
  return t;
})();
// Resolve the DIR holding claude.cmd so we can inject it into each drone's PATH. We must spawn the
// BARE name `claude.cmd` via cmd.exe (cmd parses a bare command cleanly) — passing the ABSOLUTE .cmd
// path to `cmd.exe /c` mis-parses once later args contain spaces/parens (e.g. `Bash(git push:*)`),
// yielding "not recognized" + an instant exit-1 cascade. Bare-name needs the dir on PATH, which is
// present in some launch contexts but not others — so we add it explicitly via droneEnv().
const CLAUDE_DIR = (() => {
  if (process.platform !== 'win32') return null;
  const home = process.env.USERPROFILE || process.env.HOMEPATH || '';
  const cands = [
    path.join(process.env.APPDATA || '', 'npm'),
    home && path.join(home, 'AppData', 'Roaming', 'npm'),   // USERPROFILE-derived (APPDATA can be absent in spawned envs)
    path.join(process.env.LOCALAPPDATA || '', 'npm'),
    home && path.join(home, 'AppData', 'Local', 'npm'),
    path.join(process.env.ProgramFiles || '', 'nodejs'),
  ].filter(Boolean);
  for (const d of cands) { try { if (d && fs.existsSync(path.join(d, 'claude.cmd'))) return d; } catch (_) {} }
  return null;
})();
function droneEnv() {
  if (!CLAUDE_DIR) return process.env;
  const e = Object.assign({}, process.env);
  const pk = Object.keys(e).find(k => k.toUpperCase() === 'PATH') || 'Path';
  e[pk] = (e[pk] || '') + path.delimiter + CLAUDE_DIR;
  return e;
}
const ALLOWED_ORIGINS = new Set([`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`]);

// ── RULE 3: path-jail. Resolve the absolute target; reject anything that is not
//    inside the repo (defeats ../ climbs and absolute-path injection). ─────────
function jail(rel) {
  const t = path.resolve(REPO, rel);
  if (t !== REPO && !t.startsWith(REPO + path.sep)) throw new Error('path escape rejected: ' + rel);
  return t;
}
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'untitled';

// ── Anti-clobber: a full-file write that would shrink an existing file by >50%
//    is refused unless {force:true}. Protects the big hand-maintained docs from
//    an accidental wipe. (OPEN-BUGS never takes a full write at all — see below.)
function writeFull(abs, content, force) {
  if (fs.existsSync(abs) && !force) {
    const cur = fs.readFileSync(abs, 'utf8');
    if (content.length < cur.length * 0.5)
      throw new Error(`refused: would shrink ${path.basename(abs)} ${cur.length}→${content.length} (>50%); pass force:true to override`);
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return { ok: true, bytes: content.length, path: path.relative(REPO, abs) };
}

// ── RULE 2: the FIXED action menu. Each is a named function with a hard-coded
//    target. There is no generic exec or writeFile(anyPath). ──────────────────
let walkChild = null, walkLog = [];           // for runWalk streaming (RULE 2: fixed command)
// Dispatch-to-CC job registry. id -> {status,mode,started,out,result,exit}. RUNTIME only
// (in-memory, never persisted, never path-derived). Mirrors the walkChild pattern: one fixed,
// named spawn (the `claude` headless drone), nothing arbitrary. Polled read-only via /api/ccjobs.
const ccJobs = {};
const ACTIONS = {
  // Compose: a full brief MD lands in mission-control/briefs/<slug>.md
  writeBrief: ({ slug: s, content }) => writeFull(jail(path.join('mission-control', 'briefs', slug(s) + '.md')), String(content || ''), true),

  // Edit forms — full-content writes, path-jailed + anti-clobber guarded. The
  // page loads the real current file, appends the new entry client-side, and
  // sends the whole thing back, so existing content is preserved by construction.
  editFeatureMap: ({ content, force }) => writeFull(jail('FEATURE-MAP.md'), String(content || ''), force),
  editInvariants: ({ content, force }) => writeFull(jail('FINANCIAL-INVARIANTS.md'), String(content || ''), force),
  editRules:      ({ content, force }) => writeFull(jail('MISSION-RULES.md'), String(content || ''), force),
  editWalkSpec:   ({ name, content, force }) => writeFull(jail(path.join('docs', 'walk-and-judge', 'specs', slug(name) + '.md')), String(content || ''), force),

  // OPEN-BUGS — PROSE IS LOAD-BEARING (1064 lines of history). NEVER a full
  // rewrite. Only two surgical ops: append a new section, or replace ONE bug's
  // Status line in place. Everything else stays byte-for-byte.
  addBug: ({ block }) => {
    const abs = jail('OPEN-BUGS.md');
    const cur = fs.readFileSync(abs, 'utf8');
    const add = '\n' + String(block || '').trim() + '\n';
    fs.writeFileSync(abs, cur.replace(/\s*$/, '\n') + add);
    return { ok: true, appended: add.length };
  },
  setBugStatus: ({ bugNum, status }) => {
    const abs = jail('OPEN-BUGS.md');
    const cur = fs.readFileSync(abs, 'utf8');
    const lines = cur.split('\n');
    // find the "## <n>." heading, then the first "- **Status:**" line after it
    const head = new RegExp('^##\\s+' + String(bugNum).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.');
    let i = lines.findIndex(l => head.test(l));
    if (i < 0) throw new Error('bug #' + bugNum + ' not found');
    for (let j = i + 1; j < lines.length && !/^##\s/.test(lines[j]); j++) {
      if (/^- \*\*Status:\*\*/.test(lines[j])) {
        const old = lines[j];
        lines[j] = '- **Status:** ' + String(status || '').trim();
        fs.writeFileSync(abs, lines.join('\n'));
        return { ok: true, was: old.trim(), now: lines[j] };
      }
    }
    throw new Error('no Status line under bug #' + bugNum);
  },

  // RULE 2: fixed command. Optional group/spec scope is VALIDATED against the
  // registry — only known values become a --group=/--spec= arg, never raw input.
  runWalk: ({ group, spec } = {}) => {
    if (walkChild) return { ok: false, reason: 'a walk is already running' };
    const args = [path.join('scripts', 'walker', 'run-walk.js')];
    if (group || spec) {
      let reg = {}; try { reg = JSON.parse(fs.readFileSync(path.join(MC, 'specs.json'), 'utf8')); } catch (_) {}
      if (group && (reg.groups || []).includes(group)) args.push('--group=' + group);
      else if (spec && (reg.specs || []).some(s => s.file === spec)) args.push('--spec=' + spec);
      else return { ok: false, reason: 'unknown walk scope: ' + (group || spec) };
    }
    walkLog = [];
    walkChild = spawn(process.execPath, args, { cwd: REPO });
    const cap = (buf) => String(buf).split('\n').forEach(l => l.trim() && walkLog.push(l));
    walkChild.stdout.on('data', cap);
    walkChild.stderr.on('data', cap);
    walkChild.on('exit', (code) => { walkLog.push('@@WALK_EXIT ' + code); walkChild = null; });
    // CRITICAL: clear walkChild on spawn error too — otherwise a failed launch leaks a non-null
    // handle and every future runWalk returns "a walk is already running" until a server restart.
    walkChild.on('error', (err) => { walkLog.push('@@WALK_ERROR ' + ((err && err.message) || err)); walkChild = null; });
    return { ok: true, started: true, scope: group || spec || 'all' };
  },

  // Persist John's per-case judgment. Path-jailed to one fixed JSON; caseId is a
  // map key (validated to safe chars), never a path.
  saveThoughts: ({ caseId, text }) => {
    if (!caseId || !/^[a-z0-9-]+$/i.test(caseId)) throw new Error('bad caseId');
    const abs = jail(path.join('mission-control', 'case-notes.json'));
    let notes = {}; try { notes = JSON.parse(fs.readFileSync(abs, 'utf8')); } catch (_) {}
    notes[caseId] = { text: String(text || '').slice(0, 20000), updatedAt: new Date().toISOString() };
    fs.writeFileSync(abs, JSON.stringify(notes, null, 2));
    return { ok: true, caseId };
  },

  // ── Command Deck: the Prompt Library store. Path-jailed to ONE fixed JSON;
  //    accepts a list of templates, validates each field's type + length, and
  //    rewrites the whole file (small, fully client-managed list — like
  //    case-notes.json / tickets-manual.json, NOT load-bearing prose). No path
  //    is ever derived from input.
  savePrompts: ({ list }) => {
    if (!Array.isArray(list)) throw new Error('savePrompts: list array required');
    if (list.length > 200) throw new Error('savePrompts: too many templates (max 200)');
    const seen = new Set();
    const clean = list.map((p, i) => {
      const id = String(p && p.id || '').trim();
      if (!/^[a-z0-9-]+$/i.test(id)) throw new Error('bad prompt id at index ' + i);
      if (seen.has(id)) throw new Error('duplicate prompt id: ' + id);
      seen.add(id);
      const vars = Array.isArray(p.vars) ? p.vars.slice(0, 20).map(vr => ({
        name:  String(vr && vr.name || '').replace(/[^\w]/g, '').slice(0, 40),
        label: String(vr && vr.label || '').slice(0, 120),
        kind:  vr && vr.kind === 'ticket' ? 'ticket' : 'text',
        placeholder: String(vr && vr.placeholder || '').slice(0, 120),
      })).filter(vr => vr.name) : [];
      return {
        id,
        title: String(p.title || '').slice(0, 200),
        body:  String(p.body || '').slice(0, 8000),
        vars,
      };
    });
    const abs = jail(path.join('mission-control', 'prompts.json'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify({ prompts: clean }, null, 2));
    return { ok: true, count: clean.length };
  },

  // ── Jarvis loop actions — each path-jailed to ticket-state.json / handoffs/.
  // The comment thread (John ↔ Jarvis ↔ CC), persisted with timestamps.
  addComment: ({ id, author, text }) => {
    if (!/^SLY-\d+$/.test(id)) throw new Error('bad ticket id');
    if (!['john', 'jarvis', 'cc'].includes(author)) throw new Error('bad author');
    const st = readState(); const t = st[id]; if (!t) throw new Error('no such ticket: ' + id);
    t.thread.push({ author, text: String(text || '').slice(0, 8000), ts: new Date().toISOString() });
    const from = t.status;                                                                              // ← capture before the earn
    if (t.status === 'Open' && author === 'john') { t.status = 'Discussing'; t.assignee = 'john'; }  // first comment earns Discussing
    logTransition(id, from, t.status, author);                                                          // ← log Open→Discussing (no-op if unchanged)
    t.lastActivity = new Date().toISOString(); writeState(st);
    return { ok: true, status: t.status, comments: t.thread.length };
  },
  // Attach a file to a ticket → written to mission-control/attachments/<id>/, recorded as a
  // thread entry (optional caption = the composer text). SECURITY: extension allowlist (no
  // executables), 12MB hard cap, slug+stamp filename (no caller-controlled path), and the final
  // path is re-jailed under the attachments dir. Bytes arrive base64 in the JSON action body.
  attachFile: ({ id, name, dataB64, caption }) => {
    if (!/^SLY-\d+$/.test(id)) throw new Error('bad ticket id');
    const TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', csv: 'text/csv', txt: 'text/plain', log: 'text/plain', json: 'application/json', md: 'text/markdown', pdf: 'application/pdf' };
    const ext = (String(name || '').match(/\.([a-z0-9]{1,8})$/i) || [, ''])[1].toLowerCase();
    if (!TYPES[ext]) throw new Error('file type not allowed: .' + (ext || '?') + ' (allowed: ' + Object.keys(TYPES).join(', ') + ')');
    const data = Buffer.from(String(dataB64 || ''), 'base64');
    if (!data.length) throw new Error('empty file');
    if (data.length > 12 * 1024 * 1024) throw new Error('file too large (' + Math.round(data.length / 1048576) + 'MB; max 12MB)');
    const stamp = Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex');
    const fname = slug(String(name || 'file').replace(/\.[^.]*$/, '')) + '-' + stamp + '.' + ext;
    const attRoot = jail(path.join('mission-control', 'attachments'));
    const dir = jail(path.join('mission-control', 'attachments', id));
    const abs = path.join(dir, fname);
    if (!abs.startsWith(attRoot + path.sep)) throw new Error('path escape rejected');   // defense in depth
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(abs, data);
    const st = readState(); const t = st[id]; if (!t) throw new Error('no such ticket: ' + id);
    const from = t.status;
    t.thread.push({ author: 'john', text: String(caption || '').slice(0, 8000), attach: { name: String(name || fname).slice(0, 120), file: fname, mime: TYPES[ext], size: data.length }, ts: new Date().toISOString() });
    if (t.status === 'Open') { t.status = 'Discussing'; t.assignee = 'john'; }
    logTransition(id, from, t.status, 'john');
    t.lastActivity = new Date().toISOString(); writeState(st);
    return { ok: true, file: fname, size: data.length, comments: t.thread.length };
  },
  // earned state transition — validated against the state machine; ConfirmedLive
  // cannot be a typed label, it must carry walk evidence.
  setStatus: ({ id, to, evidence }) => {
    if (!/^SLY-\d+$/.test(id)) throw new Error('bad ticket id');
    const st = readState(); const t = st[id]; if (!t) throw new Error('no such ticket: ' + id);
    if (!(TRANSITIONS[t.status] || []).includes(to)) throw new Error(`illegal transition ${t.status} → ${to}`);
    if (to === 'ConfirmedLive' && !(evidence && String(evidence).trim())) throw new Error('ConfirmedLive must be EARNED — attach walk evidence, not a label');
    const from = t.status;                                                                              // ← capture before the change
    t.status = to; t.assignee = assigneeFor(to); if (evidence) t.evidence = String(evidence).slice(0, 4000);
    logTransition(id, from, to, 'john');                                                                // ← driven from the board dropdown (John)
    t.lastActivity = new Date().toISOString(); writeState(st);
    return { ok: true, status: to, assignee: t.assignee };
  },
  // EARNED ConfirmedLive — the brief's defining promise. NO free-text evidence param:
  // the proof is READ from the latest walk on disk. Look up the ticket's surface → the
  // walker flow(s) that exercise it → the latest walk dir → and ONLY transition if a
  // REAL, RECENT, PASSING walk for that scope exists, recording the actual walk as proof.
  // The state-machine edge is still enforced (ConfirmedLive only from Investigating /
  // Shipped per TRANSITIONS) — same guarantee as setStatus.
  confirmFromWalk: ({ id }) => {
    if (!/^SLY-\d+$/.test(id)) throw new Error('bad ticket id');
    const st = readState(); const t = st[id]; if (!t) throw new Error('no such ticket: ' + id);

    // STATE MACHINE — unchanged. ConfirmedLive must be a legal edge from the current state.
    if (!(TRANSITIONS[t.status] || []).includes('ConfirmedLive'))
      throw new Error(`illegal transition ${t.status} → ConfirmedLive`);

    // Resolve the ticket's surface → walk scope. Prefer the live spine value (surface),
    // fall back to group; both are read-only registry-validated, never paths.
    const ticket = [...TICKETS(), ...MANUAL()].find(x => x.id === id);
    const surface = (ticket && (ticket.surface || ticket.group)) || null;
    const scope = walkScopeForSurface(surface);
    const niceScope = surface || '(no surface)';

    if (!scope.group || !scope.flows.length)
      return { ok: false, reason: `no runnable walk flow maps to ${niceScope} — this surface isn't walkable yet, so ConfirmedLive can't be earned from a walk` };

    // Read the LATEST walk on disk (the same source /api/walk-latest + the App-Map use).
    const w = latestWalk();
    if (!w || !w.walk)
      return { ok: false, reason: `no walk exists yet for ${niceScope} — run the Walk Drone first` };

    // Freshness — a stale capture can't vouch for current code.
    const walkedAt = w.walk.generatedAt ? new Date(w.walk.generatedAt) : null;
    const ageDays = walkedAt ? (Date.now() - walkedAt.getTime()) / 86400000 : Infinity;
    if (!walkedAt || isNaN(ageDays))
      return { ok: false, reason: `latest walk has no timestamp — re-run the Walk Drone for ${niceScope}` };
    if (ageDays > WALK_MAX_AGE_DAYS)
      return { ok: false, reason: `latest walk is ${Math.round(ageDays)} days old (stale > ${WALK_MAX_AGE_DAYS}d) — re-run the Walk Drone for ${niceScope}` };

    // Verdict per flow in this surface's scope. At least one flow must be PRESENT and PASSING.
    const verdicts = scope.flows.map(f => flowVerdict(w.walk, f));
    const passing = verdicts.filter(v => v.found && v.passing);
    const present = verdicts.filter(v => v.found);

    if (!present.length)
      return { ok: false, reason: `the latest walk (${w.dir}) didn't cover ${niceScope} — run the Walk Drone for ${niceScope} first` };
    if (!passing.length)
      return { ok: false, reason: `the latest walk for ${niceScope} has failing step(s) — fix + re-walk before confirming live (walk ${w.dir})` };

    // ── EARNED. Record the actual walk as proof — id/timestamp/scope + the relevant step
    //    results — into ticket meta. This is STRUCTURED evidence, not a typed label. ──
    const proof = {
      kind: 'walk',
      walkDir: w.dir,
      walkedAt: w.walk.generatedAt,
      scope: scope.group,
      flows: passing.map(v => ({ flow: v.flow, title: v.title, steps: v.steps })),
      confirmedAt: new Date().toISOString(),
    };
    const from = t.status;
    t.status = 'ConfirmedLive';
    t.assignee = assigneeFor('ConfirmedLive');
    t.evidence = proof;                                   // structured proof (was a free string)
    logTransition(id, from, 'ConfirmedLive', 'jarvis');   // same audit edge as every transition

    // Proof line into the thread — the human-readable "confirmed by walk …, audit trail" record.
    const flowLine = passing.map(v => `${v.flow} (${v.steps.length} steps, all clean)`).join(', ');
    t.thread.push({
      author: 'jarvis',
      text: `✓ CONFIRMED LIVE — earned from walk \`${w.dir}\` (${(w.walk.generatedAt || '').slice(0, 16)}), scope **${scope.group}**. Passing flow(s): ${flowLine}. This is walk-attested, not a typed label.`,
      ts: proof.confirmedAt,
    });
    t.lastActivity = proof.confirmedAt;
    writeState(st);

    // PROPAGATE — same terminal-state propagation setStatus/postResult do: push the
    // status to the linked canonical record (OPEN-BUGS), reasoning stays on the ticket.
    const propagated = [];
    if (ticket && ticket.openBug) {
      try {
        ACTIONS.setBugStatus({ bugNum: ticket.openBug, status: `fix confirmed live — Jarvis ${id} (walk ${w.dir}, ${new Date().toISOString().slice(0, 10)})` });
        propagated.push('OPEN-BUGS #' + ticket.openBug);
      } catch (e) {}
    }

    return { ok: true, status: 'ConfirmedLive', assignee: t.assignee, walkDir: w.dir, scope: scope.group, flows: passing.map(v => v.flow), propagated };
  },
  // THE GATE — John's alignment collates the rich package + writes the handoff CC reads.
  alignHandoff: ({ id, decision, force }) => {
    if (!/^SLY-\d+$/.test(id)) throw new Error('bad ticket id');
    const st = readState(); const t = st[id]; if (!t) throw new Error('no such ticket: ' + id);
    const ticket = [...TICKETS(), ...MANUAL()].find(x => x.id === id); if (!ticket) throw new Error('no ticket spine for ' + id);
    if (!['Open', 'Discussing', 'Gathering'].includes(t.status)) throw new Error(`can only align from Open/Discussing/Gathering (now ${t.status})`);
    // (b) READINESS CONTRACT — case-backed + questions-answered + findings-logged. The gate GUIDES;
    // John can force-align (authoritative sign-off, logged below). Enforced here so a stale client can't bypass it.
    const rdy = ticketReadyServer(t);
    if (!rdy.ready && force !== true) return { ok: false, reason: 'not ready to align — ' + rdy.missing.join('; ') + '. Sign off anyway with force.' };
    const abs = jail(path.join('mission-control', 'handoffs', id + '.md'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, collate(ticket, t, decision), 'utf8');
    const from = t.status;                                                                              // ← capture before align (Open or Discussing)
    t.status = 'Aligned'; t.assignee = 'cc';
    logTransition(id, from, 'Aligned', 'john');                                                         // ← THE GATE — log the align edge
    if (!rdy.ready) t.thread.push({ author: 'john', text: '⚠️ FORCE-ALIGNED past the readiness gate (' + rdy.missing.join('; ') + ') — signing off on my authority.', ts: new Date().toISOString() });
    t.alignment = { decision: String(decision || 'agreed with the proposed fix').slice(0, 4000), ts: new Date().toISOString(), forced: !rdy.ready };
    t.thread.push({ author: 'john', text: '✓ ALIGNED — handed to CC. ' + t.alignment.decision, ts: t.alignment.ts });
    t.lastActivity = t.alignment.ts; writeState(st);
    return { ok: true, status: 'Aligned', handoff: path.relative(REPO, abs), kickoff: `Read ${path.relative(REPO, abs)} and investigate ${id} — post results back into the ticket, my approval before push.`, forced: !rdy.ready };
  },
  // John (or a walk) creates a ticket → manual store (never clobbered by regen). (e) INTAKE ENRICHMENT:
  // top-level tickets (no parent) get a deterministic surface-from-keywords guess (instant) + auto-fire
  // jarvisOrganize (Jarvis suggests epic/bundle/related/closesWith — posts on the ticket within a minute).
  // Spin-offs already inherit surface and epic from the parent, so they skip the drone; (d)'s auto-logged
  // sub-findings will inherit this enrichment for free.
  createTicket: ({ title, summary, surface, severity, type, parent, spinoffText, epic }) => {
    if (!title) throw new Error('title required');
    if (type && !['bug', 'feature', 'task', 'epic'].includes(type)) throw new Error('bad type');
    // deterministic surface guess from keywords — no drone, instant. Skipped when user set surface explicitly.
    const guessSurface = (tx) => {
      const s = String(tx || '').toLowerCase();
      const map = [['payday plan', 'plan'], ['quick log', 'savings'], ['bills ', 'bills'], ['savings', 'savings'], ['debts', 'debts'], ['debt ', 'debts'], ['payday', 'plan'], ['hero', 'dashboard'], ['dashboard', 'dashboard'], ['analysis', 'analysis'], ['surplus', 'analysis'], ['ai coach', 'ai'], ['ai chat', 'ai'], ['settings', 'settings'], ['onboarding', 'nav']];
      for (const [k, v] of map) if (s.includes(k)) return v;
      return null;
    };
    const finalSurface = surface || guessSurface(title + ' ' + (summary || '')) || null;
    const all = [...TICKETS(), ...MANUAL()]; const nextN = Math.max(0, ...all.map(t => +(t.id.replace('SLY-', '') || 0))) + 1; const id = 'SLY-' + nextN;
    const manualPath = jail(path.join('mission-control', 'tickets-manual.json'));
    let m = { tickets: [] }; try { m = JSON.parse(fs.readFileSync(manualPath, 'utf8')); } catch (_) {}
    const links = (parent && /^SLY-\d+$/.test(parent)) ? [{ to: parent, why: 'spun off from this investigation' }] : [];
    m.tickets.push({ id, type: type || 'task', caseId: null, title: String(title).slice(0, 200), surface: finalSurface, group: finalSurface || 'planning', severity: severity || 'P2', kind: 'manual', summary: String(summary || '').slice(0, 2000), rich: { mechanism: '', rootCause: '(manual ticket — no walk evidence yet)', fix: '', files: [], evidence: null }, openBug: null, links, epic: (epic && /^SLY-\d+$/.test(epic)) ? epic : null });
    fs.mkdirSync(path.dirname(manualPath), { recursive: true }); fs.writeFileSync(manualPath, JSON.stringify(m, null, 2));
    const stt = readState(); const now = new Date().toISOString();
    stt[id] = { status: 'Open', assignee: 'john', thread: [], alignment: null, evidence: null, opened: now, lastActivity: now };
    if (parent && /^SLY-\d+$/.test(parent) && spinoffText && stt[parent]) {
      stt[parent].caseFile = stt[parent].caseFile || {};
      const sl = stt[parent].caseFile.spinoffLogged = stt[parent].caseFile.spinoffLogged || [];
      if (!sl.includes(spinoffText)) sl.push(String(spinoffText).slice(0, 600));
    }
    writeState(stt);
    // auto-organize top-level new tickets — fire-and-forget; Jarvis posts suggestions on the ticket.
    let enriching = false;
    if (!parent) { try { ACTIONS.jarvisOrganize({ id, confirm: true }); enriching = true; } catch (_) {} }
    return { ok: true, id, spawnedFrom: parent || null, surface: finalSurface, enriching };
  },
  // John removes a ticket. MANUAL tickets (tickets-manual.json) are deleted outright;
  // GENERATED tickets (the read-only spine) can't be removed from the spine, so we
  // tombstone them with state.deleted=true and mergedTickets() filters them out.
  // Path-jailed to the same two mutable stores createTicket touches. Irreversible
  // by design (the UI gates it behind a typed confirm).
  deleteTicket: ({ id }) => {
    if (!/^SLY-\d+$/.test(id)) throw new Error('bad ticket id');
    // does it exist anywhere in the merged spine?
    const inSpine  = TICKETS().some(t => t.id === id);
    const inManual = MANUAL().some(t => t.id === id);
    if (!inSpine && !inManual) throw new Error('no such ticket: ' + id);

    let removedManual = false;
    if (inManual) {
      const manualPath = jail(path.join('mission-control', 'tickets-manual.json'));
      let m = { tickets: [] }; try { m = JSON.parse(fs.readFileSync(manualPath, 'utf8')); } catch (_) {}
      const before = m.tickets.length;
      m.tickets = m.tickets.filter(t => t.id !== id);
      removedManual = m.tickets.length < before;
      fs.mkdirSync(path.dirname(manualPath), { recursive: true });
      fs.writeFileSync(manualPath, JSON.stringify(m, null, 2));
    }

    // Tombstone the state entry. For a generated (spine) ticket this is what hides it;
    // for a manual ticket it cleans up the orphaned state row too. mergedTickets()
    // drops anything with state.deleted === true.
    const st = readState();
    if (st[id]) { st[id].deleted = true; st[id].deletedAt = new Date().toISOString(); }
    else if (inSpine) { st[id] = { deleted: true, deletedAt: new Date().toISOString() }; } // generated ticket never commented on
    writeState(st);

    return { ok: true, id, kind: removedManual ? 'manual-removed' : 'tombstoned' };
  },
  // (c) MERGE — fold duplicate / sub-finding tickets INTO a survivor, PRESERVING every key thing first
  // (the reason it was logged: summary + root cause + fix + files + links → the survivor's thread), then
  // tombstone the dupes with a mergedInto pointer. Info-preserving by contract: nothing is lost, and the
  // dupes are tombstoned (state.deleted), not purged, so a merge is recoverable. Confirm-gated.
  mergeTickets: ({ into, from, confirm }) => {
    if (!/^SLY-\d+$/.test(into)) throw new Error('bad survivor id');
    const dupes = (Array.isArray(from) ? from : [from]).filter(x => /^SLY-\d+$/.test(x) && x !== into);
    if (!dupes.length) throw new Error('no dupes to merge');
    if (confirm !== true) return { ok: false, reason: 'mergeTickets needs confirm:true' };
    const all = mergedTickets().tickets;
    const survivor = all.find(t => t.id === into);
    if (!survivor) throw new Error('no such survivor: ' + into);
    const st = readState();
    st[into] = st[into] || { status: 'Open', assignee: 'john', thread: [], opened: new Date().toISOString(), lastActivity: null };
    st[into].thread = st[into].thread || [];
    const ts = new Date().toISOString();
    const merged = [];
    for (const id of dupes) {
      const d = all.find(t => t.id === id);
      if (!d) continue;
      const r = d.rich || {};
      const block = [
        `🔗 **Merged in ${d.id}** — ${d.title}  _(was ${d.severity} · ${d.group || '—'})_`,
        `**Why it was logged:** ${d.summary || '(no summary)'}`,
        (r.rootCause && r.rootCause !== '(manual ticket — no walk evidence yet)') ? `**Root cause:** ${r.rootCause}` : '',
        r.fix ? `**Proposed fix:** ${r.fix}` : '',
        (Array.isArray(r.files) && r.files.length) ? `**Files:** ${r.files.join(', ')}` : '',
        (Array.isArray(d.links) && d.links.length) ? `**Links carried:** ${d.links.map(l => l.to + (l.why ? ' (' + l.why + ')' : '')).join(', ')}` : '',
      ].filter(Boolean).join('\n');
      st[into].thread.push({ author: 'jarvis', text: block, ts });
      st[into].mergedFrom = [...new Set([...(st[into].mergedFrom || []), d.id])];
      // tombstone the dupe (same mechanism as deleteTicket) + a pointer home
      st[id] = st[id] || { thread: [] };
      st[id].deleted = true; st[id].deletedAt = ts; st[id].mergedInto = into;
      st[id].thread = st[id].thread || [];
      st[id].thread.push({ author: 'jarvis', text: `Merged into ${into} — its key evidence was carried over.`, ts });
      merged.push(d.id);
    }
    st[into].lastActivity = ts;
    writeState(st);
    return { ok: true, into, merged, count: merged.length };
  },
  // (c) SEMANTIC CLUSTER PASS — the second half of dedupe. An Opus drone reads every active ticket's
  // title+summary and proposes merge groups by MEANING (sub-findings of the same bug that share no FR/link
  // signal, so deterministic detection is blind to them). Read-only: it only PROPOSES → cluster-report.json;
  // John merges via the same suggest→click UI. First run is dry-run (propose-only) until John marks reviewed.
  clusterBacklog: ({ confirm }) => {
    if (confirm !== true) return { ok: false, reason: 'clusterBacklog needs confirm:true' };
    const key = 'BACKLOG#cluster';
    if (ccJobs[key] && ccJobs[key].status === 'running') return { ok: false, reason: 'a cluster pass is already running' };
    ccJobs[key] = { status: 'running', id: 'BACKLOG', task: 'cluster', mode: 'gather', model: 'opus', started: Date.now() };
    const all = mergedTickets().tickets.filter(t => t.type !== 'epic' && !(t.state && t.state.status === 'Shipped'));
    const list = all.map(t => `${t.id} [${t.severity} ${t.group || '?'}] ${String(t.title || '').slice(0, 90)} :: ${String(t.summary || '').replace(/\s+/g, ' ').slice(0, 220)}`).join('\n').slice(0, 16000);
    const prompt = [
      'You are JARVIS running a DEDUPE pass on John\'s slyght backlog. MANY tickets are auto-spawned sub-findings of a few real bugs. Cluster the tickets that are THE SAME underlying issue — same root cause, same bug, or one is a sub-finding/duplicate of another. John says the REAL backlog is about a DOZEN, not ~90, so be decisive: most of these collapse into a few parents.',
      'Rules: (1) pick a SURVIVOR per group — the most canonical/complete ticket (the parent bug, not a sub-finding). (2) list the DUPES to fold in. (3) give a SHORT plain-English reason (the shared root cause). (4) a ticket appears in at most ONE group. Ground every grouping in the title+summary; do not invent links.',
      'CRITICAL — RECONCILE TO YOUR OWN COUNT: there are ~89 active tickets and you believe only ~a dozen are REAL. That means ~75 of them are sub-findings that MUST fold into a parent. Do NOT leave sub-findings as ungrouped singletons — that is the failure mode. Every ticket that is a symptom/sub-aspect/duplicate of a larger issue gets assigned to that issue\'s group. Only a genuinely-distinct, standalone top-level issue may stay ungrouped. After you draft groups, COUNT the survivors + ungrouped singletons; if that total is far above your realCount, you under-grouped — fold more. Over-grouping is safe (John reviews and declines bad merges); under-grouping is the thing to avoid.',
      '## Active tickets (id [severity surface] title :: summary)', list,
      '',
      'End with EXACTLY ONE fenced code block tagged json:',
      '{"groups":[{"survivor":"SLY-N","dupes":["SLY-M","SLY-K"],"reason":"the shared root cause, plain English"}],"realCount":<your estimate of the number of REAL distinct issues left after merging>}',
    ].join('\n');
    spawnDrone({
      key, id: 'BACKLOG', task: 'cluster', prompt, mode: 'gather', mdl: 'opus', rsn: 'think', budget: '6', maxTurns: 18,
      onResult: ({ job, resultText }) => recordClusterReport(resultText, job),
    });
    return { ok: true, dispatched: key };
  },
  // John has reviewed the dry-run semantic groups → unlock bulk merge for them (and future runs skip dry-run).
  clusterReviewed: () => {
    try { const r = JSON.parse(fs.readFileSync(jail(CLUSTER_FILE), 'utf8')); r.reviewed = true; r.dryRun = false; writeClusterReport(r); return { ok: true, reviewed: true }; }
    catch (e) { return { ok: false, reason: 'no cluster report to mark reviewed' }; }
  },
  // (d) AUTO-LOG DRY-RUN — scan all existing unmapped findings, apply policy (conf≥high & sev≥P1, cap
  // 3/parent + 10/day, dedupe-to-related at Jaccard≥0.4), write the dry-run list. NO writes. John reviews
  // the list, then autoLogEnable flips autoWrite:true so future drone completions can auto-log qualifying
  // findings. The seatbelt: nothing creates tickets until John clicks enable.
  autoLogDryRun: ({ confirm }) => {
    if (confirm !== true) return { ok: false, reason: 'autoLogDryRun needs confirm:true' };
    const policy = getAutoLogPolicy();
    const candidates = autoLogScanCandidates(policy);
    const wouldLog = candidates.filter(c => c.action === 'AUTO-LOG').length;
    const dedupes = candidates.filter(c => c.action === 'attach-as-related').length;
    const out = { ts: new Date().toISOString(), policy, candidates, summary: { total: candidates.length, wouldLog, dedupes, skipped: candidates.length - wouldLog - dedupes } };
    fs.writeFileSync(jail(AUTO_LOG_FILE), JSON.stringify(out, null, 2));
    return { ok: true, ...out.summary };
  },
  // (d) UNBUCKLE — flip autoWrite:true. Future scoped-drone completions auto-log qualifying findings.
  // Persisted to auto-log-policy.json so it survives restarts. Reversible via autoLogDisable.
  autoLogEnable: ({ confirm }) => {
    if (confirm !== true) return { ok: false, reason: 'autoLogEnable needs confirm:true' };
    const p = Object.assign(getAutoLogPolicy(), { autoWrite: true });
    fs.writeFileSync(jail(AUTO_LOG_POLICY_FILE), JSON.stringify(p, null, 2));
    return { ok: true, autoWrite: true, policy: p };
  },
  autoLogDisable: () => {
    const p = Object.assign(getAutoLogPolicy(), { autoWrite: false });
    fs.writeFileSync(jail(AUTO_LOG_POLICY_FILE), JSON.stringify(p, null, 2));
    return { ok: true, autoWrite: false };
  },
  // BRIEFING CHAT TURN — one user message → engine call → execute low-risk actions → persist john+jarvis
  // turns → return. Phase 1: low-risk only. The executor REFUSES high-risk names server-side regardless
  // of what Claude emits (Phase 2 routes them to a typed-CONFIRM card instead of fire). confirm:true is
  // set HERE on the executor — never accepted from Claude for high-risk; for low-risk it's set as the
  // underlying action requires (e.g., triageWorkload/jarvisOrganize/clusterBacklog/autoLogDryRun).
  briefingChatTurn: async ({ message }) => {
    if (!message || typeof message !== 'string') throw new Error('message required');
    const chat = readBriefingChat();
    const ts = new Date().toISOString();
    chat.turns.push({ author: 'john', text: String(message).slice(0, 2000), ts });
    writeBriefingChat(chat);
    const prompt = buildBriefingChatPrompt(message, chat.turns);
    const resultText = await claudeChatCall(prompt, 'sonnet', '2', 5);
    const parsed = extractJsonBlock(resultText);
    const reply = (parsed && parsed.reply) || String(resultText || '(Jarvis returned no reply — try again)').slice(0, 2000);
    const proposed = (parsed && Array.isArray(parsed.actions)) ? parsed.actions : [];
    const executed = [];
    const NEEDS_CONFIRM_TRUE = new Set(['triageWorkload', 'jarvisOrganize', 'clusterBacklog', 'autoLogDryRun', 'jarvisAskAll']);
    for (const a of proposed) {
      const name = a && typeof a.name === 'string' ? a.name : null;
      if (!name) continue;
      const baseArgs = Object.assign({}, a.args || {});
      // server-side strip: Claude can't ride in confirm:true for high-risk names, ever.
      if (HIGH_RISK_CHAT_NAMES.has(name)) {
        // PHASE 2 — high-risk = pending-confirm card. Strip any confirm:true Claude tried to ride in;
        // ONLY John's typed CONFIRM (via confirmChatAction) can set it. The action sits as PENDING until
        // John types CONFIRM exactly (case-sensitive) and clicks the confirm button on the card.
        delete baseArgs.confirm;
        executed.push({ name, args: baseArgs, why: a.why || '', verdict: 'PENDING_CONFIRM', reason: 'High-risk — type CONFIRM in the card below to fire (case-sensitive). Cancelling leaves nothing run.' });
        continue;
      }
      if (!LOW_RISK_CHAT_ALLOWLIST.has(name)) {
        executed.push({ name, args: baseArgs, why: a.why || '', verdict: 'REJECTED', reason: 'not on the low-risk chat allowlist' });
        continue;
      }
      // strip any confirm Claude tried to set; the executor sets it where the low-risk action requires.
      delete baseArgs.confirm;
      if (NEEDS_CONFIRM_TRUE.has(name)) baseArgs.confirm = true;
      try {
        const r = await ACTIONS[name](baseArgs);
        executed.push({ name, args: baseArgs, why: a.why || '', verdict: 'FIRED', result: r });
      } catch (e) {
        executed.push({ name, args: baseArgs, why: a.why || '', verdict: 'ERROR', reason: e.message });
      }
    }
    const jarvisTurn = { author: 'jarvis', text: reply, ts: new Date().toISOString(), actions: executed };
    chat.turns.push(jarvisTurn);
    writeBriefingChat(chat);
    return { ok: true, reply, actions: executed, threadLength: chat.turns.length };
  },
  // Clear the briefing chat thread (start fresh). No drones, no side effects beyond the file.
  briefingChatReset: ({ confirm }) => {
    if (confirm !== true) return { ok: false, reason: 'briefingChatReset needs confirm:true' };
    writeBriefingChat({ ts: new Date().toISOString(), turns: [] });
    return { ok: true };
  },
  // PHASE 2 — TYPED CONFIRM. Validates exact-case 'CONFIRM', sets confirm:true ONLY here (never from
  // Claude), fires the high-risk action, updates the pending-confirm card in the chat. Defense in depth:
  // (1) typed text must equal 'CONFIRM' exactly; (2) name must still be in HIGH_RISK_CHAT_NAMES;
  // (3) the action's verdict must still be PENDING_CONFIRM (no replays).
  confirmChatAction: async ({ turnIndex, actionIndex, confirmText }) => {
    if (confirmText !== 'CONFIRM') return { ok: false, reason: 'type CONFIRM exactly (case-sensitive)' };
    const chat = readBriefingChat();
    const turn = chat.turns[turnIndex]; if (!turn || !Array.isArray(turn.actions)) return { ok: false, reason: 'no such turn' };
    const a = turn.actions[actionIndex]; if (!a) return { ok: false, reason: 'no such action' };
    if (a.verdict !== 'PENDING_CONFIRM') return { ok: false, reason: 'action is not pending (verdict: ' + a.verdict + ')' };
    if (!HIGH_RISK_CHAT_NAMES.has(a.name)) return { ok: false, reason: 'name not in high-risk allowlist: ' + a.name };
    const args = Object.assign({}, a.args || {}, { confirm: true });   // John's CONFIRM is the ONLY thing that sets this
    try {
      const r = await ACTIONS[a.name](args);
      a.verdict = 'FIRED'; a.result = r; a.args = args; a.confirmedTs = new Date().toISOString();
      chat.turns.push({ author: 'system', text: '✓ You confirmed and fired `' + a.name + '`.', ts: new Date().toISOString() });
    } catch (e) {
      a.verdict = 'ERROR'; a.reason = e.message; a.confirmedTs = new Date().toISOString();
      chat.turns.push({ author: 'system', text: '⚠ You confirmed `' + a.name + '` but it errored: ' + e.message, ts: new Date().toISOString() });
    }
    writeBriefingChat(chat);
    return { ok: true, verdict: a.verdict, result: a.result || null };
  },
  // Cancel a pending-confirm card without firing — sets verdict to CANCELLED. Reversible only by
  // re-asking Jarvis (which will produce a new pending card if appropriate).
  dismissChatAction: ({ turnIndex, actionIndex }) => {
    const chat = readBriefingChat();
    const turn = chat.turns[turnIndex]; if (!turn || !Array.isArray(turn.actions)) return { ok: false, reason: 'no such turn' };
    const a = turn.actions[actionIndex]; if (!a) return { ok: false, reason: 'no such action' };
    if (a.verdict !== 'PENDING_CONFIRM') return { ok: false, reason: 'action is not pending' };
    a.verdict = 'CANCELLED'; a.confirmedTs = new Date().toISOString();
    writeBriefingChat(chat);
    return { ok: true };
  },
  // John edits a ticket's METADATA — type/severity/dueDate/bundle. These live on the
  // read-only spine (tickets.json), so we store OVERRIDES in ticket-state.json[id].meta
  // and mergedTickets() layers them over the spine. ONE field per call, each validated;
  // '' clears the field (falls back to the spine / no date / no bundle). Path-jailed to
  // ticket-state.json via writeState; id pinned to ^SLY-\d+$ like every other ticket action.
  setMeta: ({ id, field, value }) => {
    if (!/^SLY-\d+$/.test(id)) throw new Error('bad ticket id');
    if (!['type', 'severity', 'dueDate', 'bundle', 'epic'].includes(field)) throw new Error('bad meta field: ' + field);
    const v = String(value == null ? '' : value).trim();
    // per-field validation — reject anything that isn't a legal value (or '' to clear)
    let val = '';
    if (field === 'type') {
      if (v && !['bug', 'feature', 'task', 'epic'].includes(v)) throw new Error('bad type: ' + v);
      val = v;
    } else if (field === 'epic') {
      if (v && !/^SLY-\d+$/.test(v)) throw new Error('epic must be a ticket id (SLY-N) or empty');
      if (v === id) throw new Error('a ticket cannot be its own epic');
      val = v;
    } else if (field === 'severity') {
      if (v && !['P0', 'P1', 'P2'].includes(v)) throw new Error('bad severity: ' + v);
      val = v;
    } else if (field === 'dueDate') {
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('dueDate must be YYYY-MM-DD or empty');
      if (v) { const d = new Date(v + 'T00:00:00'); if (isNaN(d)) throw new Error('invalid date: ' + v); }
      val = v;
    } else { // bundle — short free string, capped
      if (v.length > 60) throw new Error('bundle too long (max 60 chars)');
      val = v;
    }
    // the ticket must exist somewhere in the merged spine (generated or manual)
    if (![...TICKETS(), ...MANUAL()].some(t => t.id === id)) throw new Error('no such ticket: ' + id);
    const st = readState();
    const t = st[id] || { status: 'Open', assignee: 'john', thread: [], alignment: null, evidence: null, opened: null, lastActivity: null };
    t.meta = t.meta || {};
    if (val === '') delete t.meta[field]; else t.meta[field] = val;     // '' clears → falls back to spine
    t.lastActivity = new Date().toISOString();
    st[id] = t; writeState(st);
    return { ok: true, id, field, value: val };
  },
  // Set a ticket's dependency edges (epic ordering) — meta.blockedBy = the ticket ids that must
  // complete before this one. Validated to SLY-ids (and never itself); stored like every other meta
  // override in ticket-state.json. Empty array clears it.
  setBlockedBy: ({ id, ids }) => {
    if (!/^SLY-\d+$/.test(id)) throw new Error('bad ticket id');
    const clean = [...new Set((Array.isArray(ids) ? ids : []).filter(x => /^SLY-\d+$/.test(x) && x !== id))];
    if (![...TICKETS(), ...MANUAL()].some(t => t.id === id)) throw new Error('no such ticket: ' + id);
    const st = readState();
    const t = st[id] || { status: 'Open', assignee: 'john', thread: [], alignment: null, evidence: null, opened: null, lastActivity: null };
    t.meta = t.meta || {};
    if (clean.length) t.meta.blockedBy = clean; else delete t.meta.blockedBy;
    t.lastActivity = new Date().toISOString(); st[id] = t; writeState(st);
    return { ok: true, id, blockedBy: clean };
  },
  // Set an epic's explicit child sequence — meta.childOrder = ordered ticket ids. The Epic
  // workspace writes this on reorder; mergedTickets surfaces it. Empty clears (falls back to heuristic).
  setEpicOrder: ({ id, order }) => {
    if (!/^SLY-\d+$/.test(id)) throw new Error('bad epic id');
    const clean = [...new Set((Array.isArray(order) ? order : []).filter(x => /^SLY-\d+$/.test(x)))];
    if (![...TICKETS(), ...MANUAL()].some(t => t.id === id)) throw new Error('no such ticket: ' + id);
    const st = readState();
    const t = st[id] || { status: 'Open', assignee: 'john', thread: [], alignment: null, evidence: null, opened: null, lastActivity: null };
    t.meta = t.meta || {};
    if (clean.length) t.meta.childOrder = clean; else delete t.meta.childOrder;
    t.lastActivity = new Date().toISOString(); st[id] = t; writeState(st);
    return { ok: true, id, childOrder: clean };
  },
  // CC posts results BACK into the ticket — closes the loop. Optional transition.
  postResult: ({ id, found, fixed, evidence, to, propagate }) => {
    if (!/^SLY-\d+$/.test(id)) throw new Error('bad ticket id');
    const st = readState(); const t = st[id]; if (!t) throw new Error('no such ticket: ' + id);
    t.thread.push({ author: 'cc', text: `**CC result** — Found: ${found || '—'}\nFixed: ${fixed || '—'}\nEvidence: ${evidence || '—'}`.slice(0, 8000), ts: new Date().toISOString() });
    if (to) {
      if (!(TRANSITIONS[t.status] || []).includes(to)) throw new Error(`illegal transition ${t.status} → ${to}`);
      if (to === 'ConfirmedLive' && !(evidence && String(evidence).trim())) throw new Error('ConfirmedLive needs evidence');
      const from = t.status;                                                                            // ← capture before the change
      t.status = to; t.assignee = assigneeFor(to); if (evidence) t.evidence = String(evidence).slice(0, 4000);
      logTransition(id, from, to, 'cc');                                                                // ← CC's post-back transition
    }
    t.lastActivity = new Date().toISOString(); writeState(st);
    // PROPAGATE — Jarvis is the one place: on a terminal state, push the status to
    // the linked canonical record (surgical, prose preserved). The full reasoning
    // stays IN the ticket; OPEN-BUGS just gets the status + a pointer to SLY-N.
    const propagated = [];
    if (to && ['ConfirmedLive', 'Shipped'].includes(to) && propagate !== false) {
      const ticket = [...TICKETS(), ...MANUAL()].find(x => x.id === id);
      if (ticket && ticket.openBug) {
        try { ACTIONS.setBugStatus({ bugNum: ticket.openBug, status: `${to === 'Shipped' ? 'fixed' : 'fix confirmed live'} — Jarvis ${id} (${new Date().toISOString().slice(0, 10)})` }); propagated.push('OPEN-BUGS #' + ticket.openBug); } catch (e) {}
      }
    }
    return { ok: true, status: t.status, propagated };
  },

  // ── Dispatch to CC — spawn a REAL headless Claude Code drone on a ticket's handoff
  // package, then post its result back into the ticket. SECURITY SURFACE — held to the same
  // seven rules as everything else here, plus four feature-specific guards:
  //   • confirm-gate (RULE 6 family): needs explicit confirm:true, like deploy().
  //   • single-flight: one running drone per ticket id (no fan-out / fork-bomb).
  //   • allowlisted, fixed binary + fixed args: `claude` headless, spawned WITHOUT a shell
  //     (no shell-injection surface), prompt piped via STDIN (never on argv).
  //   • no-push + cost-cap + plan-default: git push is disallowed at the tool layer, spend is
  //     capped (--max-budget-usd 1.5 / --max-turns 40), and the SAFE default is investigate-only
  //     (--permission-mode plan). 'fix' mode (acceptEdits) is opt-in from the confirm modal.
  // id is pinned to ^SLY-\d+$ like every ticket action; the handoff path is jail()'d; the only
  // thing that varies is plan-vs-fix, which maps to a fixed pair of (directive, permission-mode).
  dispatchCC: ({ id, confirm, mode, model, reasoning }) => {
    if (!/^SLY-\d+$/.test(id)) throw new Error('bad ticket id');
    if (confirm !== true) return { ok: false, reason: 'dispatch needs confirm:true' };
    if (ccJobs[id] && ccJobs[id].status === 'running') return { ok: false, reason: 'a drone is already on ' + id };

    // The drone investigates/fixes FROM the aligned handoff package — refuse if there isn't one.
    let handoff;
    try { handoff = fs.readFileSync(jail(path.join('mission-control', 'handoffs', id + '.md')), 'utf8'); }
    catch { throw new Error('No handoff yet — align the ticket first.'); }

    const m = mode === 'fix' ? 'fix' : 'plan';   // default SAFE = plan (investigate only)

    // NEW knobs — ALLOWLISTED, never raw. Each maps to a FIXED flag/string; unknown → safe default.
    //   model     ∈ {sonnet, opus}  → --model <model>          (default sonnet — fast & cheap)
    //   reasoning ∈ {off, think, deep} → fixed directive suffix (Claude Code triggers extended
    //              reasoning on prompt keywords; there is NO --reasoning flag, so we append text)
    const mdl = model === 'opus' ? 'opus' : 'sonnet';        // default SAFE/cheap = sonnet
    const rsn = ['off', 'think', 'deep'].includes(reasoning) ? reasoning : 'off';   // default off
    const REASON_SUFFIX = {
      off:   '',
      think: ' Think carefully, step by step, before answering.',
      deep:  ' Ultrathink — reason deeply and consider edge cases before acting.',
    };
    // Safety guard against a runaway drone (NOT a bill — spend rides John's plan). Raised so it
    // rarely cuts off legitimate deep work; the 40-turn cap is the real runaway stop. Opus→$6, Sonnet→$3.
    const budget = mdl === 'opus' ? '6' : '3';

    const directive = (m === 'fix'
      ? 'You are a CC drone dispatched by Jarvis on ' + id + '. Investigate AND implement the fix on the CURRENT branch. Reuse canonical writers (BRAIN.<domain>.<verb>, source tags) — never a parallel calc. When the change is complete and Guardian passes, COMMIT it with a message that STARTS with "' + id + ': " (one commit for this ticket, so Deploy can surface it). NEVER run git push or deploy — committing is allowed, pushing is not. End with a concise RESULT section: what you found, what you changed (files + the commit), and the evidence.'
      : 'You are a CC drone dispatched by Jarvis on ' + id + '. INVESTIGATE ONLY — read + analyse, propose the precise fix with file:line + evidence. Do NOT edit files. End with a concise RESULT section.')
      + REASON_SUFFIX[rsn];
    // Feed the drone the handoff CONTENT inline + its file PATH (so it can re-read the full package).
    const prompt = handoff + '\n\n---\n(This handoff package is saved at mission-control/handoffs/' + id + '.md — re-read it any time.)\n' + directive;

    const claudeBin = process.platform === 'win32' ? 'claude.cmd' : 'claude';   // bare name; droneEnv() puts its dir on PATH
    const args = ['-p', '--output-format', 'json', '--model', mdl, '--max-turns', '40', '--max-budget-usd', budget, '--permission-mode', (m === 'fix' ? 'acceptEdits' : 'plan'), '--disallowedTools', 'Bash(git push:*)', 'Bash(git push)'];

    // Spawn WITHOUT a shell (no shell-injection surface); feed the prompt via STDIN.
    // P0 WINDOWS FIX: a shell-less spawn of a `.cmd` throws EINVAL on win32 (Node refuses to
    // launch a batch file without a shell). Launch the batch via cmd.exe /c instead — still
    // shell:false (no shell-metachar interpolation of OUR args), args are fixed/validated flags,
    // and the prompt goes via STDIN, never argv → no injection vector. Non-win32 path unchanged.
    const child = process.platform === 'win32'
      ? spawn('cmd.exe', ['/c', claudeBin, ...args], { cwd: REPO, env: droneEnv() })
      : spawn(claudeBin, args, { cwd: REPO });
    child.stdin.write(prompt); child.stdin.end();

    // UTF-8 FIX: collect raw Buffer chunks and decode ONCE at exit with Buffer.concat
    // (a chunk boundary inside a multi-byte sequence — e.g. the 3-byte em-dash — must not
    // be toString()'d per chunk, or each half becomes �). `out` is filled at exit from
    // these chunks; `_chunks` is the runtime accumulator (never serialised to /api/ccjobs).
    const job = ccJobs[id] = { status: 'running', mode: m, model: mdl, reasoning: rsn, started: Date.now(), out: '', _chunks: [] };
    child.stdout.on('data', d => job._chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
    child.stderr.on('data', d => job._chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));

    child.on('exit', code => {
      job.exit = code;
      // Decode the WHOLE stream as utf8 in one shot — split multibyte chunks rejoin cleanly.
      job.out = Buffer.concat(job._chunks).toString('utf8');
      job._chunks = null;                                  // free the raw buffers
      let resultText = '';
      let costUsd = null, numTurns = null, durationMs = null;   // telemetry — degrade to null
      try {
        const j = JSON.parse(job.out);
        resultText = j.result || j.text || '';
        // Claude Code headless --output-format json returns these alongside result.
        // Defensive: any may be absent/null on some exits → stays null (UI shows "—").
        if (typeof j.total_cost_usd === 'number') costUsd = j.total_cost_usd;
        if (typeof j.num_turns === 'number') numTurns = j.num_turns;
        if (typeof j.duration_ms === 'number') durationMs = j.duration_ms;
      }
      catch (_) { resultText = job.out.slice(-4000); }
      job.result = resultText;
      job.cost = costUsd;            // number | null
      job.turns = numTurns;          // number | null
      job.durationMs = durationMs;   // number | null
      job.status = code === 0 ? 'done' : 'failed';

      // Running spend total (best-effort, jail()'d). job.spend = the post-write ledger total
      // so /api/ccjobs can expose it without a re-read; null if the ledger write failed.
      const led = recordSpend(id, costUsd, numTurns, durationMs);
      job.spend = led ? led.total_usd : null;
      job.spendCount = led ? led.count : null;

      // Telemetry suffix for the comment header — "· 10 turns · 4.5 min". Cost is intentionally
      // NOT shown per-drone (it discourages dispatch and isn't a real bill); usage lives only in
      // the topbar meter now. costUsd is still recorded to the ledger below (the meter's data).
      const turnStr = (numTurns != null) ? numTurns + ' turn' + (numTurns === 1 ? '' : 's') : null;
      const minStr  = (durationMs != null) ? (durationMs / 60000).toFixed(1) + ' min' : null;
      const telemParts = [turnStr, minStr].filter(Boolean);
      const telem = telemParts.length ? ' · ' + telemParts.join(' · ') : '';

      // post the drone's result back INTO the ticket thread (closes the loop)
      const st = readState();
      const t = st[id];
      if (t) {
        t.thread.push({ author: 'cc', text: '**CC drone — ' + m + ' mode · ' + mdl + (rsn !== 'off' ? ' · ' + rsn + '-think' : '') + telem + '**\n\n' + (resultText || '(no output)').slice(0, 9000), ts: new Date().toISOString() });
        t.lastActivity = new Date().toISOString();
        writeState(st);
      }
    });

    // On dispatch, move the ticket to Investigating if that edge is legal (Aligned→Investigating,
    // ConfirmedLive→Investigating, Shipped→Investigating per TRANSITIONS). Logged like every edge.
    const st0 = readState();
    if (st0[id] && (TRANSITIONS[st0[id].status] || []).includes('Investigating')) {
      logTransition(id, st0[id].status, 'Investigating', 'jarvis');
      st0[id].status = 'Investigating';
      st0[id].assignee = 'cc';
      st0[id].lastActivity = new Date().toISOString();
      writeState(st0);
    }

    return { ok: true, dispatched: id, mode: m, model: mdl, reasoning: rsn, budget };
  },

  // ── Scoped GATHER drone — one tightly-scoped evidence job (root-cause / locate-surface /
  // fix-proposal / conformance / auditor), keyed `<id>#<task>` so several run on one ticket
  // concurrently. Each uses a PRISTINE non-overlapping prompt (see CASE-FILE-REDESIGN.md §5),
  // returns a structured JSON block we parse into the ticket's caseFile slot (auto-fill, not
  // append), and posts a short comment. Additive — never touches the generic dispatchCC path.
  dispatchScoped: ({ id, task, confirm, model, reasoning }) => {
    if (!/^SLY-\d+$/.test(id)) throw new Error('bad ticket id');
    if (confirm !== true) return { ok: false, reason: 'dispatch needs confirm:true' };
    if (!SCOPED_TASKS[task]) throw new Error('unknown scoped task: ' + task + ' (allowed: ' + Object.keys(SCOPED_TASKS).join(', ') + ')');
    const r = launchScoped(id, task, null, { model, reasoning });
    if (!r.ok) return r;
    return { ok: true, dispatched: r.key, id, task };
  },

  // ── "Build the case" — fan out the scoped GATHER drones in a converging DAG (concurrency cap 3),
  // then the auditor; on GAP, ONE targeted re-dig + a final audit (hard-capped at cycle 2). Turns a
  // blank/thin ticket into a full case file so John aligns in one read. See CASE-FILE-REDESIGN.md §6.
  buildCase: ({ id, confirm }) => {
    if (!/^SLY-\d+$/.test(id)) throw new Error('bad ticket id');
    if (confirm !== true) return { ok: false, reason: 'build-the-case needs confirm:true' };
    return sweepCase(id);
  },

  // ── Run ONE scoped dig, then automatically re-run the auditor so the GAP verdict re-converges.
  // This is what "Run suggested dig" calls — without the re-audit, the GAP never clears (John's SLY-1 bug).
  digThenAudit: ({ id, task, confirm }) => {
    if (!/^SLY-\d+$/.test(id)) throw new Error('bad ticket id');
    if (confirm !== true) return { ok: false, reason: 'digThenAudit needs confirm:true' };
    if (!SCOPED_TASKS[task]) throw new Error('unknown scoped task: ' + task);
    const r = launchScoped(id, task, () => { launchScoped(id, 'auditor', null); });
    if (!r.ok) return r;
    return { ok: true, dispatched: r.key, id, task, thenAudit: true };
  },

  // ── System auditor — a ruthless READ-ONLY health audit across the WHOLE app (not one ticket):
  // cloud-sync integrity, cross-surface story coherence, and financial↔AI-layer↔Jarvis reconciliation.
  // Reuses the drone machinery (keyed SYSTEM#audit). Report → mission-control/system-audit.json.
  systemAudit: ({ confirm }) => {
    if (confirm !== true) return { ok: false, reason: 'system audit needs confirm:true' };
    const key = 'SYSTEM#audit';
    if (ccJobs[key] && ccJobs[key].status === 'running') return { ok: false, reason: 'a system audit is already running' };
    spawnDrone({
      key, id: 'SYSTEM', task: 'system-audit', prompt: SYSTEM_AUDIT_PROMPT, mode: 'gather',
      mdl: 'sonnet', rsn: 'think', budget: '3', maxTurns: 24,
      onResult: ({ job, resultText }) => recordSystemAudit(resultText, job),
    });
    return { ok: true, dispatched: key };
  },

  // ── Autonomous triage — "Hey Jarvis, what are my issues?" The commander (Opus, read-only) reads the
  // WHOLE backlog (context pack) + the grounding docs on disk + live S, RANKS the real issues, and
  // AUTO-SWEEPS the top ≤3 (recordTriagePlan fires sweepCase). Reuses spawnDrone (keyed SYSTEM#triage)
  // + the converging DAG. Report → triage-report.json. See AUTONOMOUS-TRIAGE.md. Confirm-gated like every drone.
  triageWorkload: ({ confirm }) => {
    if (confirm !== true) return { ok: false, reason: 'triageWorkload needs confirm:true' };
    const key = 'SYSTEM#triage';
    if (ccJobs[key] && ccJobs[key].status === 'running') return { ok: false, reason: 'a triage is already running' };
    const ctx = buildTriageContext();
    // Write a 'running' stub immediately so the Briefing surface has state to render while Opus thinks.
    writeTriageReport({ ts: new Date().toISOString(), status: 'running', plan: null, dispatched: [], backlog: ctx.open.length });
    spawnDrone({
      key, id: 'SYSTEM', task: 'triage', prompt: triageCommanderPrompt(ctx), mode: 'gather',
      mdl: 'opus', rsn: 'deep', budget: '8', maxTurns: 30,
      onResult: ({ job, resultText }) => recordTriagePlan(resultText, job),
    });
    return { ok: true, dispatched: key, backlog: ctx.open.length };
  },

  // Stamp a system-audit top-risk as logged-to-a-ticket, so the "ruthless audit" list clears it
  // (a finding with a ticket against it is tracked work, not an open risk). Path-jailed to
  // system-audit.json; idx validated to a non-negative int; ticketId pinned to ^SLY-\d+$.
  markAuditLogged: ({ idx, ticketId }) => {
    if (!/^SLY-\d+$/.test(ticketId)) throw new Error('bad ticket id');
    const i = Number(idx); if (!Number.isInteger(i) || i < 0) throw new Error('bad idx');
    const abs = jail(path.join('mission-control', 'system-audit.json'));
    const rec = JSON.parse(fs.readFileSync(abs, 'utf8'));
    if (!rec.parsed || !Array.isArray(rec.parsed.topRisks) || !rec.parsed.topRisks[i]) throw new Error('no such risk #' + i);
    rec.parsed.topRisks[i].loggedTicket = ticketId;
    fs.writeFileSync(abs, JSON.stringify(rec, null, 2));
    return { ok: true, idx: i, ticketId };
  },

  // Compose the END-OF-INVESTIGATION resolution — an Opus drone reads the COMPLETE case file and writes
  // the DUAL NARRATIVE: a plain-English story for John (problem -> cause -> the fix -> how we'll know) +
  // a technical appendix for CC (precise change, file:line, what to verify). caseFile.resolution; this is
  // the trust artifact that flows into the handoff / Deploy. Read-only, confirm-gated. See BEEFY-PLAN.md WS-5.
  composeResolution: ({ id, confirm }) => {
    if (!/^SLY-\d+$/.test(id)) throw new Error('bad ticket id');
    if (confirm !== true) return { ok: false, reason: 'composeResolution needs confirm:true' };
    const key = id + '#resolution';
    if (ccJobs[key] && ccJobs[key].status === 'running') return { ok: false, reason: 'already composing a resolution for ' + id };
    const ticket = (mergedTickets().tickets || []).find(t => t.id === id);
    if (!ticket) throw new Error('no such ticket: ' + id);
    const cf = (readState()[id] || {}).caseFile || {};
    const kind = ticket.type === 'feature' ? 'feature' : ticket.type === 'task' ? 'task' : 'bug';
    const prompt = [
      'You are Jarvis, writing the END-OF-INVESTIGATION RESOLUTION for ' + id + ' (a ' + kind + ') on slyght. The case file below is everything the drones gathered. Synthesise it into TWO layers — do NOT start a new investigation:',
      '1. A STORY for John — plain English, no jargon, real names/numbers. For a bug: what was wrong, why, the fix we will make, and how we will know it worked. For a feature: the goal, the shape we will build, what "done" looks like. For a task: what we will do and the done-when. 4-6 sentences, genuinely readable.',
      '2. A TECHNICAL appendix for CC (the engineer who implements it): the precise change/build, the file:line change-sites, the INV-NN invariants or acceptance criteria to satisfy, and exactly what to verify. Terse and exact.',
      'You MAY read the codebase to ground it; do NOT edit files.',
      '## Ticket', ticket.title, String(ticket.summary || ''),
      '## The case file (gathered evidence)', caseFileDump(ticket, cf),
      '',
      'End with EXACTLY ONE fenced json block: {"story":"the plain-English story for John","technical":"the technical appendix for CC","problem":"one line","resolution":"the fix/build in one line","verify":"how we will know it worked"}',
    ].join('\n');
    spawnDrone({
      key, id, task: 'resolution', prompt, mode: 'gather', mdl: 'opus', rsn: 'think', budget: '6', maxTurns: 14,
      onResult: ({ job, resultText }) => recordResolution(id, resultText, job),
    });
    return { ok: true, dispatched: key, id };
  },

  // The CODE-ALIGNMENT AUDITOR — the gate before Deploy. A READ-ONLY drone (Opus) reads the ticket's
  // committed fix (git show of the "<id>:" commit) and verifies it against the CANON: canonical writers
  // / BRAIN, FINANCIAL-INVARIANTS, ARCHITECTURE + roadmap, and runs Guardian. PASS/FAIL → caseFile.codeAudit,
  // surfaced in the Deploy UI so the push is informed. Confirm-gated. See PATHWAY-AND-COHERENCE.md §E.
  codeAudit: ({ id, confirm }) => {
    if (!/^SLY-\d+$/.test(id)) throw new Error('bad ticket id');
    if (confirm !== true) return { ok: false, reason: 'codeAudit needs confirm:true' };
    const key = id + '#code-audit';
    if (ccJobs[key] && ccJobs[key].status === 'running') return { ok: false, reason: 'a code audit is already running on ' + id };
    const ticket = (mergedTickets().tickets || []).find(t => t.id === id);
    if (!ticket) throw new Error('no such ticket: ' + id);
    const cf = (readState()[id] || {}).caseFile || {};
    const prompt = [
      'You are the CODE-ALIGNMENT AUDITOR for slyght — the gate before a fix ships. Ticket ' + id + '\'s fix has been implemented and committed (its commit subject starts "' + id + ':"). Verify the change is SOUND. READ-ONLY — never edit or commit.',
      'slyght: single-file index.html (~24k lines); global S persisted to localStorage; BRAIN bubbles are the canonical writers; every write carries a SOURCES tag + hits the audit log.',
      'Look at the ACTUAL change first: run `git show` on the ' + id + ' commit (find it via `git log --grep="' + id + ':" -1 --format=%H`), then run these four checks and report each with file:line evidence:',
      '1. CANONICAL WRITERS — does it mutate S only via BRAIN.<domain>.<verb> with a SOURCES tag (no direct `S.x =`, no parallel re-calc of an existing value)?',
      '2. INVARIANTS — which FINANCIAL-INVARIANTS (INV-NN) does it touch; are they preserved; any at risk? (read FINANCIAL-INVARIANTS.md)',
      '3. ARCHITECTURE + ROADMAP — does it fit ARCHITECTURE.md and NOT collide with a queued bundle? (read ARCHITECTURE.md / FEATURE-MAP.md)',
      '4. GUARDIAN — run it read-only (`npm run guardian` — or `node scripts/guardian-static.js` if the full run is slow) and report the result verbatim-ish.',
      cf.resolution ? '## The intended fix (resolution)\n' + (cf.resolution.technical || cf.resolution.resolution || '') : '',
      '',
      'End with EXACTLY ONE fenced json block: {"verdict":"PASS|RISK|FAIL","checks":{"canonical":"pass|fail|n/a — note","invariants":"...","architecture":"...","guardian":"pass|fail — note"},"blockers":["only real ship-blockers"],"summary":"one plain-English paragraph: is it safe to ship, and why"}',
    ].join('\n');
    spawnDrone({
      key, id, task: 'code-audit', prompt, mode: 'gather', mdl: 'opus', rsn: 'think', budget: '6', maxTurns: 20,
      onResult: ({ job, resultText }) => recordCodeAudit(id, resultText, job),
    });
    return { ok: true, dispatched: key, id };
  },

  // Answer ALL of a ticket's open questions in ONE Jarvis reply (vs one-by-one). Reads the
  // open-question lists across every case-file slot, asks Jarvis to work them, posts a 'jarvis' comment.
  jarvisAskAll: ({ id, confirm }) => {
    if (!/^SLY-\d+$/.test(id)) throw new Error('bad ticket id');
    if (confirm !== true) return { ok: false, reason: 'jarvisAskAll needs confirm:true' };
    const key = id + '#jarvis-chat';
    if (ccJobs[key] && ccJobs[key].status === 'running') return { ok: false, reason: 'Jarvis is already replying on ' + id };
    const ticket = (mergedTickets().tickets || []).find(t => t.id === id);
    if (!ticket) throw new Error('no such ticket: ' + id);
    const cf = (readState()[id] || {}).caseFile || {};
    const qs = [];
    ['rootCause', 'surface', 'fix', 'conformance', 'intent', 'design', 'acceptance'].forEach(k => { const s = cf[k]; if (s && Array.isArray(s.openQuestions)) s.openQuestions.forEach(q => { const x = String(q || '').trim(); if (x) qs.push(x); }); });
    const uniq = [...new Set(qs)];
    if (!uniq.length) return { ok: false, reason: 'no open questions on ' + id };
    const prompt = [
      'You are Jarvis, advising John on slyght ticket ' + id + '. The investigation surfaced these OPEN QUESTIONS. Answer ALL of them, each clearly, in plain English — your recommendation + the why. Push back where a question rests on a wrong assumption. You MAY read the codebase; do NOT edit files.',
      '## Ticket', ticket.title, String(ticket.summary || ''),
      '## Evidence', caseFileDump(ticket, cf),
      '## Open questions', uniq.map((q, i) => (i + 1) + '. ' + q).join('\n'),
      '', 'Answer each as "**Q1.** <question> — <your answer>". Plain English, no preamble.',
    ].join('\n');
    spawnDrone({ key, id, task: 'jarvis-chat', prompt, mode: 'gather', mdl: 'sonnet', rsn: 'think', budget: '3', maxTurns: 12, onResult: ({ job, resultText }) => postJarvisReply(id, resultText, job) });
    return { ok: true, dispatched: key, id, questions: uniq.length };
  },

  // ── Live Jarvis chat — a read-only headless-Claude advisor. Reads the ticket + evidence + thread
  // and replies as a 'jarvis' comment (the thread IS the chat history). Folds in the old "Go deeper".
  jarvisChat: ({ id, confirm }) => {
    if (!/^SLY-\d+$/.test(id)) throw new Error('bad ticket id');
    if (confirm !== true) return { ok: false, reason: 'jarvisChat needs confirm:true' };
    const key = id + '#jarvis-chat';
    if (ccJobs[key] && ccJobs[key].status === 'running') return { ok: false, reason: 'Jarvis is already replying on ' + id };
    const ticket = (mergedTickets().tickets || []).find(t => t.id === id);
    if (!ticket) throw new Error('no such ticket: ' + id);
    const st0 = readState();
    const cf = (st0[id] && st0[id].caseFile) || {};
    const thread = (st0[id] && st0[id].thread) || [];
    const threadTxt = thread.map(c => c.author + ': ' + String(c.text || '').replace(/\s+/g, ' ').slice(0, 800)).join('\n').slice(-6000);
    const uxRail = isUXWork(ticket) ? UX_DESIGN_PREAMBLE() + '\n\n' : '';   // UX discussions always carry the design discipline
    const prompt = [
      uxRail + 'You are Jarvis — John\'s sharp, plain-spoken engineering advisor on slyght (a single-file PWA: index.html ~24k lines; global S persisted to localStorage; BRAIN bubbles are the canonical writers).',
      'You are discussing ticket ' + id + ' with John in a thread. Answer his LATEST message directly and concisely — your take, what to watch for, your recommendation. Push back if he is wrong (he wants that, not flattery; never "great question"). You MAY read the codebase to ground your answer; do NOT edit files.',
      '',
      '## Ticket', ticket.title, String(ticket.summary || ''),
      '## Evidence gathered so far', caseFileDump(ticket, cf),
      '## Discussion thread (most recent last)', threadTxt || '(none yet)',
      '',
      'Reply as Jarvis now — direct, plain English, no preamble. Stop when you have made your point.',
    ].join('\n');
    spawnDrone({
      key, id, task: 'jarvis-chat', prompt, mode: 'gather', mdl: 'sonnet', rsn: 'off', budget: '3', maxTurns: 12,
      onResult: ({ job, resultText }) => postJarvisReply(id, resultText, job),
    });
    return { ok: true, dispatched: key, id };
  },

  // ── UX DRONE (2026-05-28) — the frontend-design specialist in the pipeline. Read-only: walks the
  // surface (FAKE-seeded) + reads the render code, judges against the frontend-design discipline (always
  // loaded via UX_DESIGN_PREAMBLE), and proposes concrete, system-respecting changes — including
  // diagnosing flash/reload/jank glitches down to the re-render path. Records caseFile.uxReview.
  uxReview: ({ id, confirm }) => {
    if (!/^SLY-\d+$/.test(id)) throw new Error('bad ticket id');
    if (confirm !== true) return { ok: false, reason: 'uxReview needs confirm:true' };
    const key = id + '#ux';
    if (ccJobs[key] && ccJobs[key].status === 'running') return { ok: false, reason: 'a UX review is already running on ' + id };
    const ticket = (mergedTickets().tickets || []).find(t => t.id === id);
    if (!ticket) throw new Error('no such ticket: ' + id);
    const wt = fs.existsSync(WORKTREE) ? WORKTREE : REPO;   // prefer the fixed worktree; else read the live app
    const prompt = [
      UX_DESIGN_PREAMBLE(),
      '',
      'You are the UX drone for ' + id + ' on slyght. You are in the app repo (single-file index.html ~24k lines + the BRAIN bubbles).',
      '## The UX concern', ticket.title, String(ticket.summary || ''), 'surface: ' + (ticket.group || '?'),
      '',
      'HOW TO WORK (read-only — propose, never patch index.html):',
      '- READ the render path: grep index.html for the view/render function(s) for this surface + how they\'re re-invoked (navigation, poll/setInterval, onStateChange, save→reload). For a flash/reload/jank glitch the cause is almost always a FULL re-render that replays enter-animations or re-paints a whole subtree on every tick/nav — find the exact function + line.',
      '- OPTIONALLY capture the surface to SEE it: you may run Playwright headless via Bash (node -e) to seed FAKE state (localStorage.slyght_v5 from state-snapshot.json), open the surface, and screenshot — then Read the PNG. Do NOT trust assumptions about how it looks.',
      '- JUDGE against the discipline above (typography/motion/spacing/contrast/anti-slop) WITHIN slyght\'s tokens + skin.',
      '',
      'End with EXACTLY ONE fenced json block: {"summary":"plain-English what\'s wrong + the feel","glitch":"the specific re-render/flash cause with file:line, or null","findings":[{"issue":"","cause":"file:line","fix":"the minimal system-respecting change","severity":"high|med|low"}],"respectsSystem":true}',
    ].join('\n');
    spawnDrone({
      key, id, task: 'ux', prompt, mode: 'gather', mdl: 'opus', rsn: 'think', budget: '6', maxTurns: 40, cwd: wt,
      onResult: ({ job, resultText }) => recordUxReview(id, resultText, job),
    });
    return { ok: true, dispatched: key, id };
  },

  // ── UX AUDIT (cockpit-wide, 2026-05-28) — the UX drone turned on Mission Control's OWN UI. Captures the
  // cockpit surfaces (cockpit-shots.js, deterministic), then a UX drone reads the screenshots + jarvis.css/js
  // and returns a prioritized VISUAL-CONSISTENCY + polish pass (cross-cutting + per-surface). Drives #31.
  uxAudit: ({ confirm }) => {
    if (confirm !== true) return { ok: false, reason: 'uxAudit needs confirm:true' };
    const key = 'COCKPIT#ux-audit';
    if (ccJobs[key] && ccJobs[key].status === 'running') return { ok: false, reason: 'a cockpit UX audit is already running' };
    ccJobs[key] = { status: 'running', id: 'COCKPIT', task: 'ux', mode: 'capture', model: '—', started: Date.now() };
    // Step 1: capture the surfaces fresh (deterministic), THEN dispatch the judging drone on exit.
    const cap = spawn(process.execPath, [path.join(MC, 'scripts', 'cockpit-shots.js'), String(PORT)], { cwd: MC });
    cap.on('exit', () => {
      const shotsDir = path.join(MC, 'shots', 'cockpit');
      const prompt = [
        UX_DESIGN_PREAMBLE(),
        '',
        'You are the UX drone auditing **Mission Control\'s OWN cockpit UI** (the ticketing/command-centre tool itself) — NOT slyght\'s index.html. The UI lives in THIS directory: `jarvis.css`, `jarvis.js`, `mission-control.html`. Fresh screenshots of every surface (wide + narrow) are in `shots/cockpit/` (see `shots/cockpit/manifest.json`).',
        'GOAL: a VISUAL-CONSISTENCY + polish pass across the whole cockpit — make it feel like one well-built product, not layers pasted together (John\'s words).',
        '',
        'HOW: READ `shots/cockpit/manifest.json`, then READ the PNGs (both wide and narrow). READ `jarvis.css` (the design system) + the relevant `jarvis.js` render functions. Judge against the discipline above. Look hard for: inconsistent spacing/padding scales, button styles that differ surface-to-surface, misalignment, typography rhythm + contrast (grey-on-grey data), color/token drift (one-off hex vs vars), anything that flashes/jumps, and narrow-width breakage. Tie each finding to a file:line and a token/class where you can.',
        '',
        'End with EXACTLY ONE fenced json block: {"summary":"the overall feel + the top theme to fix","crosscutting":[{"issue":"","fix":"the concrete CSS/JS change (name the class/var)","severity":"high|med|low"}],"surfaces":[{"surface":"command|overview|board|ticket|briefing|deploy|map|architecture","findings":[{"issue":"","cause":"jarvis.css:NN or jarvis.js:NN","fix":"","severity":"high|med|low"}]}]}',
      ].join('\n');
      spawnDrone({
        key, id: 'COCKPIT', task: 'ux', prompt, mode: 'gather', mdl: 'opus', rsn: 'think', budget: '10', maxTurns: 60, cwd: MC,
        onResult: ({ job, resultText }) => recordUxAudit(resultText, job),
      });
    });
    return { ok: true, auditing: 'COCKPIT', note: 'capturing surfaces, then the UX drone judges' };
  },

  // ── Jarvis organize — read-only drone that reads THIS ticket + the full ticket list and suggests
  // how to categorize it: epic (existing or new), bundle, related tickets, and closes-with. Stage 2d.
  jarvisOrganize: ({ id, confirm }) => {
    if (!/^SLY-\d+$/.test(id)) throw new Error('bad ticket id');
    if (confirm !== true) return { ok: false, reason: 'jarvisOrganize needs confirm:true' };
    const key = id + '#organize';
    if (ccJobs[key] && ccJobs[key].status === 'running') return { ok: false, reason: 'Jarvis is already organizing ' + id };
    const all = mergedTickets().tickets || [];
    const ticket = all.find(t => t.id === id);
    if (!ticket) throw new Error('no such ticket: ' + id);
    const open = all.filter(t => !(t.state && t.state.status === 'Shipped'));
    const list = open.map(t => `${t.id} [${t.type}${t.epic ? ' epic:' + t.epic : ''}${t.bundle ? ' bundle:' + t.bundle : ''}] ${t.severity} ${t.group || ''} — ${String(t.title || '').slice(0, 70)}`).join('\n').slice(0, 8000);
    const epics = all.filter(t => t.type === 'epic').map(t => t.id + ' — ' + t.title).join('; ') || '(none yet)';
    const prompt = [
      'You are Jarvis, organizing ticket ' + id + ' for John in Mission Control. Read THIS ticket and the FULL ticket list, then suggest how to categorize it. Do NOT edit files; respond only with the analysis + JSON.',
      '## This ticket', ticket.title, String(ticket.summary || ''), 'surface: ' + (ticket.group || '?') + ' · type: ' + ticket.type + ' · severity: ' + ticket.severity,
      '## Existing epics', epics,
      '## All open tickets', list,
      '',
      'Suggest: which EXISTING epic this belongs under (its SLY-id) OR a NEW epic name if a clear cluster exists; a bundle name; RELATED tickets (same surface/root-cause, by id); and tickets that would CLOSE when this one ships (by id). Be conservative — only real relationships.',
      'End with EXACTLY ONE fenced json block: {"epic":"SLY-N or null","newEpic":"name or null","bundle":"name or null","related":["SLY-N"],"closesWith":["SLY-N"],"reasoning":"one short paragraph"}',
    ].join('\n');
    spawnDrone({
      key, id, task: 'organize', prompt, mode: 'gather', mdl: 'sonnet', rsn: 'off', budget: '3', maxTurns: 10,
      onResult: ({ job, resultText }) => recordOrganize(id, resultText, job),
    });
    return { ok: true, dispatched: key, id };
  },

  // ── Design a new agent — an OPUS drone (deep reasoning, per John's standing rule) drafts a new
  // scoped-agent spec from a plain-English description. Draft → agent-drafts.json (read-only viewable).
  designAgent: ({ desc, confirm }) => {
    if (confirm !== true) return { ok: false, reason: 'designAgent needs confirm:true' };
    if (!desc || typeof desc !== 'string') throw new Error('desc required');
    const key = 'SYSTEM#design-agent';
    if (ccJobs[key] && ccJobs[key].status === 'running') return { ok: false, reason: 'already designing an agent' };
    const prompt = [
      'You are designing a NEW scoped drone agent for slyght Mission Control, from this request:',
      String(desc).slice(0, 1200),
      '',
      'A scoped agent has: a short label, ONE tightly-bounded job, an explicit DO-NOT list (so it never overlaps the others), and a strict JSON output schema. Existing agents you must NOT duplicate: root-cause, locate-surface, fix-proposal, conformance, auditor. The agent is read-only (it investigates, never edits).',
      'Design it carefully. End with EXACTLY ONE fenced json block: {"id":"kebab-id","label":"...","scope":"the one job in a sentence","doNot":["..."],"schema":"the json fields it should return","directive":"the full prompt directive, in the same voice as the existing Gather agents"}',
    ].join('\n');
    spawnDrone({
      key, id: 'SYSTEM', task: 'design-agent', prompt, mode: 'gather', mdl: 'opus', rsn: 'deep', budget: '6', maxTurns: 14,
      onResult: ({ job, resultText }) => recordAgentDraft(resultText, job),
    });
    return { ok: true, dispatched: key };
  },

  // EXECUTE THE FIX (safe) — the command-centre close-out John asked for. A fix-mode drone runs in an
  // ISOLATED `main` worktree (cockpit branch untouched): implements from the aligned handoff + resolution,
  // runs Guardian, COMMITS "SLY-N:" on main. NOTHING is pushed — the diff lands for John to review, then he
  // pushes from Deploy. Confirm-gated; the riskiest action, so it's the most guarded. See PATHWAY/SITE docs.
  executeFixOnMain: ({ id, confirm }) => {
    if (!/^SLY-\d+$/.test(id)) throw new Error('bad ticket id');
    if (confirm !== true) return { ok: false, reason: 'executeFixOnMain needs confirm:true' };
    const key = id + '#execute-fix';
    if (ccJobs[key] && ccJobs[key].status === 'running') return { ok: false, reason: 'a fix is already executing for ' + id };
    let handoff;
    try { handoff = fs.readFileSync(jail(path.join('mission-control', 'handoffs', id + '.md')), 'utf8'); }
    catch { throw new Error('No handoff yet — align the ticket first.'); }
    const wt = ensureWorktree();
    if (!wt.ok) throw new Error('could not prepare the main worktree: ' + wt.error);
    if (!DEPLOY_BRANCHES.includes(wt.branch)) throw new Error('worktree is on "' + wt.branch + '", expected main — refusing to fix on a non-deploy branch');
    const cf = (readState()[id] || {}).caseFile || {};
    const plan = (cf.resolution && (cf.resolution.technical || cf.resolution.resolution)) || '';
    const ticketForUx = (mergedTickets().tickets || []).find(t => t.id === id);
    const uxRail = isUXWork(ticketForUx) ? UX_DESIGN_PREAMBLE() + '\n\n---\n' : '';   // UX changes always carry the design discipline
    const prompt = [
      uxRail + handoff,
      '\n---\nYou are CC, dispatched by Jarvis to IMPLEMENT the fix for ' + id + ' on the slyght app (single-file index.html, ~24k lines).',
      'You are in an ISOLATED git worktree checked out on `main` — your edits + commit land on the deploy branch, but NOTHING is pushed (push is blocked; John reviews the diff and pushes). Work ONLY in this directory.',
      plan ? '## The approved plan (from the resolution)\n' + plan : '',
      'Implement the MINIMAL correct change. Reuse canonical writers (BRAIN.<domain>.<verb> + SOURCES tags) — never a parallel calc.',
      'If a previous PRE-SHIP GATE failed for this ticket, FIRST diagnose whether the app (index.html) or its smoke spec (tests/smoke/) is at fault. A spec that asserts something the architecture genuinely does NOT do is a WRONG SPEC — correct it to assert the real contract. (Canonical example, SLY-1: source tags live in the AUDIT LOG `S._auditLog` via record(), NOT on the txn object — 0/212 txns carry `.source`; a spec asserting `txn.source` is wrong.) NEVER weaken, skip, or delete a spec just to make it pass — the spec must still prove the fix.',
      'VERIFY before committing: run the ticket\'s smoke spec (`npx playwright test tests/smoke/<file> --config=playwright.smoke.config.js`) AND `npm run guardian`; get BOTH green (Guardian must introduce no NEW finding on the lines you touched). When green, COMMIT with a message that STARTS with "' + id + ': ". NEVER run git push.',
      'End with a RESULT section: what you changed (files + the commit), the Guardian result, and what John should phone-verify on his S23.',
    ].filter(Boolean).join('\n');
    spawnDrone({
      key, id, task: 'execute-fix', prompt, mode: 'fix', mdl: 'opus', rsn: 'think', budget: '10', maxTurns: 60, cwd: wt.path,
      onResult: ({ job, resultText }) => recordExecuteFix(id, resultText, job),
    });
    return { ok: true, dispatched: key, id, worktree: wt.path };
  },

  // CONFIRM IN SANDBOX — the walk/emulator gate before ready-to-ship. A drone runs IN the main
  // worktree (the fixed app, FAKE-seeded for safety), drives the ticket's surface / runs its smoke
  // test, captures screenshots, and JUDGES whether the fix actually works. PASS → the ticket can be
  // marked ready-to-ship; FAIL → back to fix with the reason. It may fix the test HARNESS/seed but
  // never the app (index.html) — if the fix is broken it reports, it doesn't patch. Per John's flow.
  confirmInSandbox: ({ id, confirm }) => {
    if (!/^SLY-\d+$/.test(id)) throw new Error('bad ticket id');
    if (confirm !== true) return { ok: false, reason: 'confirmInSandbox needs confirm:true' };
    const key = id + '#sandbox';
    if (ccJobs[key] && ccJobs[key].status === 'running') return { ok: false, reason: 'a sandbox confirm is already running on ' + id };
    const wt = ensureWorktree();
    if (!wt.ok) throw new Error('could not prepare the sandbox worktree: ' + wt.error);
    const ticket = (mergedTickets().tickets || []).find(t => t.id === id);
    if (!ticket) throw new Error('no such ticket: ' + id);
    const cf = (readState()[id] || {}).caseFile || {};
    const res = (cf.resolution && (cf.resolution.story || cf.resolution.resolution)) || ticket.summary || '';
    const prompt = [
      'You are CC, verifying ' + id + '\'s fix in a SANDBOX before it can ship. You are in an isolated git worktree on `main` with the fix applied — the live app (single-file index.html), seeded with FAKE data (never John\'s real money). Confirm the fix ACTUALLY WORKS; do not take anyone\'s word for it.',
      'RULES: you MAY run the app + Playwright + write/run capture or test scripts; you may fix the TEST HARNESS or seed if it won\'t boot. You must NOT edit index.html (the fix itself) — if the fix is wrong, REPORT it, do not patch it. Never git push.',
      'WHAT TO VERIFY:\n' + res,
      'HOW: run the ticket\'s smoke test if one exists (look in tests/smoke/ — e.g. `npx playwright test tests/smoke/<file> --config=playwright.smoke.config.js`). If the harness fails to boot/seed, debug + fix the HARNESS so the FAKE-seeded app runs, then re-run. Capture before/after screenshots of the fixed behaviour and READ them. Judge against the invariants the fix should satisfy (e.g. conservation: money out of cash equals money into the goal).',
      'End with EXACTLY ONE fenced json block: {"verdict":"PASS|FAIL","reason":"plain-English: does it work, and how you know","evidence":"the concrete numbers/screens you saw","smokePassed":true,"smokeOutput":"the key pass/fail lines"}',
    ].join('\n');
    spawnDrone({
      key, id, task: 'sandbox', prompt, mode: 'fix', mdl: 'opus', rsn: 'think', budget: '10', maxTurns: 50, cwd: wt.path,
      onResult: ({ job, resultText }) => recordSandboxConfirm(id, resultText, job),
    });
    return { ok: true, dispatched: key, id };
  },
  // VERIFY — the deterministic, server-run pre-ship GATE (2026-05-28). Not a drone: runs Guardian +
  // the ticket's own smoke spec in the worktree and records a trustworthy verdict to caseFile.verify.
  // This exists because confirmInSandbox trusted a drone's self-reported "smokePassed:true" and a wrong
  // assertion reached the push gate (SLY-1). markReadyToShip + deploy are now hard-gated on this result.
  verifyFix: ({ id, confirm }) => {
    if (!/^SLY-\d+$/.test(id)) throw new Error('bad ticket id');
    if (confirm !== true) return { ok: false, reason: 'verifyFix needs confirm:true' };
    if (!fs.existsSync(WORKTREE)) throw new Error('no fixed worktree yet — run execute-fix first');
    const key = id + '#verify';
    if (ccJobs[key] && ccJobs[key].status === 'running') return { ok: false, reason: 'a verification is already running on ' + id };
    ccJobs[key] = { status: 'running', id, task: 'verify', mode: 'gate', model: '—', started: Date.now() };
    const child = spawn(process.execPath, [path.join(MC, 'scripts', 'verify-fix.js'), id, WORKTREE], { cwd: MC });
    let buf = '', err = '';
    child.stdout.on('data', d => buf += d); child.stderr.on('data', d => err += d);
    child.on('exit', () => {
      let v = null; try { v = JSON.parse(buf.trim().split('\n').pop()); } catch (_) {}
      ccJobs[key].status = (v && v.ok) ? 'done' : 'failed';
      try {
        const st = readState(); const t = st[id];
        if (t) {
          t.caseFile = t.caseFile || {};
          t.caseFile.verify = v || { ok: false, error: (err.slice(0, 200) || 'verify crashed'), ts: new Date().toISOString() };
          const g = v && v.guardian, s = v && v.smoke;
          t.thread.push({
            author: 'cc',
            text: ((v && v.ok) ? '**Verification PASSED** &check; ' : '**Verification FAILED** &#10007; ') +
              'Guardian: ' + (g ? (g.newFindings.length ? g.newFindings.length + ' NEW finding(s) — ' + g.newFindings.map(f => f.rule + '@L' + f.line).join(', ') : 'no new findings (' + g.failTotal + ' pre-existing on main)') : '—') +
              ' &middot; Smoke: ' + (s ? (s.ran ? s.passed + '/' + (s.passed + s.failed) + ' passed' : (s.reason || 'did not run')) : '—'),
            ts: new Date().toISOString(),
          });
          t.lastActivity = new Date().toISOString(); writeState(st);
        }
      } catch (_) {}
    });
    return { ok: true, verifying: id };
  },

  // Mark a sandbox-confirmed fix READY TO SHIP — commit the worktree fix (so Deploy can push it) and
  // earn ConfirmedLive. Gated on BOTH the sandbox walk (PASS) AND a fresh, green Verify result. Push still John's.
  markReadyToShip: ({ id, confirm }) => {
    if (!/^SLY-\d+$/.test(id)) throw new Error('bad ticket id');
    if (confirm !== true) return { ok: false, reason: 'markReadyToShip needs confirm:true' };
    const st = readState(); const t = st[id]; if (!t) throw new Error('no such ticket: ' + id);
    const sandbox = (t.caseFile && t.caseFile.sandbox) || null;
    if (!sandbox || sandbox.verdict !== 'PASS') return { ok: false, reason: 'not sandbox-confirmed — run confirm-in-sandbox and get a PASS first' };
    // Hard gate (2026-05-28): a fresh, green Verify (Guardian no-new-findings + smoke green) is required.
    const verify = (t.caseFile && t.caseFile.verify) || null;
    if (!verify || !verify.ok) return { ok: false, reason: 'not verified — run Verify (Guardian + smoke) and get a green result first' };
    const headSha = gitHeadOf(WORKTREE);
    if (verify.sha && headSha && verify.sha !== headSha) return { ok: false, reason: 'verification is stale — it ran against ' + verify.sha.slice(0, 7) + ' but the worktree is now at ' + headSha.slice(0, 7) + '. Re-run Verify.' };
    if (!(TRANSITIONS[t.status] || []).includes('ConfirmedLive') && t.status !== 'Investigating') return { ok: false, reason: 'illegal transition ' + t.status + ' → ConfirmedLive' };
    const ticket = (mergedTickets().tickets || []).find(x => x.id === id);
    const subj = id + ': ' + String((ticket && ticket.title) || 'fix').slice(0, 80);
    // Commit the worktree fix so it's a discrete, pushable commit on main. Push remains John's (Deploy).
    let committed = false, commitErr = '';
    try { execSync('git add -A', { cwd: WORKTREE }); execSync('git commit -m ' + JSON.stringify(subj), { cwd: WORKTREE, stdio: 'pipe' }); committed = true; }
    catch (e) { commitErr = (e.stderr ? e.stderr.toString() : '') || e.message; }   // nothing to commit (already committed) is fine
    const from = t.status; t.status = 'ConfirmedLive'; t.assignee = assigneeFor('ConfirmedLive');
    t.evidence = { kind: 'sandbox', reason: sandbox.reason, ts: new Date().toISOString() };
    logTransition(id, from, 'ConfirmedLive', 'jarvis');
    t.thread.push({ author: 'jarvis', text: '**Ready to ship** — sandbox-confirmed, fix committed on the main worktree' + (committed ? '' : ' (already committed)') + '. Review the diff in Deploy and push.', ts: new Date().toISOString() });
    t.lastActivity = new Date().toISOString(); writeState(st);
    return { ok: true, status: 'ConfirmedLive', committed };
  },

  // Capture the FIXED screen for a ticket (#36) — a deterministic Playwright capture (server-run, not a
  // drone) serves the worktree's fixed app FAKE-seeded, drives the surface, screenshots it. The ticket
  // then shows "what the fixed screen looks like". Stored at mission-control/shots/<id>.png (gitignored).
  captureFixShot: ({ id, confirm }) => {
    if (!/^SLY-\d+$/.test(id)) throw new Error('bad ticket id');
    if (confirm !== true) return { ok: false, reason: 'captureFixShot needs confirm:true' };
    if (!fs.existsSync(WORKTREE)) throw new Error('no fixed worktree yet — run execute-fix first');
    const key = id + '#fixshot';
    if (ccJobs[key] && ccJobs[key].status === 'running') return { ok: false, reason: 'a capture is already running on ' + id };
    const out = jail(path.join('mission-control', 'shots', id + '.png'));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    ccJobs[key] = { status: 'running', id, task: 'fixshot', mode: 'capture', model: '—', started: Date.now() };
    const child = spawn(process.execPath, [path.join(MC, 'scripts', 'fixshot.js'), id, WORKTREE, out], { cwd: MC });
    let err = '';
    child.stderr.on('data', d => err += d);
    child.on('exit', code => {
      ccJobs[key].status = code === 0 ? 'done' : 'failed'; ccJobs[key].exit = code;
      if (code === 0 && fs.existsSync(out)) {
        try { const st = readState(); const t = st[id]; if (t) { t.caseFile = t.caseFile || {}; t.caseFile.fixShot = { ts: new Date().toISOString() }; t.thread.push({ author: 'cc', text: '**Fixed screen captured** — "what the new screen looks like" now shows on the ticket.', ts: new Date().toISOString() }); t.lastActivity = new Date().toISOString(); writeState(st); } } catch (_) {}
      }
    });
    return { ok: true, capturing: id };
  },

  // RULE 6: the one irreversible action. git push, hard-coded, and ONLY with
  // an explicit confirm:true (the UI also gates it behind a typed confirmation).
  deploy: ({ confirm }) => {
    if (confirm !== true) return { ok: false, reason: 'deploy refused: confirm:true required (UI confirm gate)' };
    // SAFETY GUARD — only ever push the DEPLOY branch (main). Push from wherever main is checked out:
    // the cockpit checkout (REPO, on mission-control) OR the execute-fix worktree (on main). The cockpit
    // branch must NEVER push to the live app, so if no main checkout is found we hard-refuse.
    let pushDir = REPO, branch = gitBranchOf(REPO);
    if (!DEPLOY_BRANCHES.includes(branch)) {
      const wb = gitBranchOf(WORKTREE);
      if (DEPLOY_BRANCHES.includes(wb)) { pushDir = WORKTREE; branch = wb; }
    }
    if (!DEPLOY_BRANCHES.includes(branch)) {
      return { ok: false, blocked: true, branch: gitBranchOf(REPO), reason: 'deploy refused: no deploy branch (' + DEPLOY_BRANCHES.join(', ') + ') is checked out. The cockpit is on "' + gitBranchOf(REPO) + '"; run Execute-fix to stage the change on a main worktree, then push.' };
    }
    // PRE-PUSH GATE (RULE 6.1, 2026-05-28) — the deterministic final guard. Never push a staged delta
    // that introduces a NEW Guardian finding or whose smoke is red / missing. Runs synchronously here so
    // the push CANNOT proceed on a red gate. This is what makes "a broken fix reaches my phone" impossible.
    {
      const g = spawnSync(process.execPath, [path.join(MC, 'scripts', 'verify-fix.js'), '--staged', pushDir], { cwd: MC, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 240000 });
      let v = null; try { v = JSON.parse((g.stdout || '').trim().split('\n').pop()); } catch (_) {}
      if (!v) return { ok: false, blocked: true, reason: 'pre-push gate could not run — refusing to push blind. ' + ((g.stderr || '').slice(0, 300) || 'no gate output') };
      if (!v.ok) {
        const why = (v.guardian && v.guardian.newFindings.length ? v.guardian.newFindings.length + ' new Guardian finding(s) (' + v.guardian.newFindings.map(f => f.rule + '@L' + f.line).join(', ') + ')' : '') +
          (v.smoke && v.smoke.failed ? (v.guardian && v.guardian.newFindings.length ? ' + ' : '') + 'smoke ' + v.smoke.failed + ' failed' : '') +
          (v.smoke && !v.smoke.ran ? 'no smoke ran (' + (v.smoke.reason || 'unknown') + ')' : '');
        return { ok: false, blocked: true, gate: v, reason: 'push refused by the pre-push gate: ' + (why || 'verification not green') + '. Fix it and re-verify before shipping to the live app.' };
      }
    }
    // Capture WHAT we're about to ship (before push: origin/main..HEAD) so the deploy record + the
    // auto-transition to Shipped name the exact tickets + commits. Replicable: no manual setStatus.
    let pushing = [];
    try { pushing = execSync('git log --format=%H%x09%s origin/main..HEAD', { cwd: pushDir, encoding: 'utf8' }).trim().split('\n').filter(Boolean).map(l => { const i = l.indexOf('\t'); return { sha: l.slice(0, i).slice(0, 40), subject: l.slice(i + 1) }; }); } catch (_) {}
    const ticketIds = [...new Set(pushing.flatMap(c => (c.subject.match(/SLY-\d+/g) || [])))];
    const headSha = gitHeadOf(pushDir);
    return new Promise((resolve) => {
      const p = spawn('git', ['push'], { cwd: pushDir });
      let out = '';
      p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
      p.on('exit', code => {
        if (code !== 0) return resolve({ ok: false, code, output: out.slice(-2000), branch, pushedFrom: pushDir === WORKTREE ? 'worktree' : 'repo' });
        // ── Record the deploy (for status tracking) + auto-transition shipped tickets ──
        const rec = { sha: headSha, ts: new Date().toISOString(), branch, tickets: ticketIds, commits: pushing.map(c => ({ sha: c.sha.slice(0, 7), subject: c.subject })), status: 'building', liveAt: null, liveUrl: LIVE_URL };
        try { const log = readDeployLog(); log.deploys = [rec, ...(log.deploys || [])].slice(0, 50); writeDeployLog(log); } catch (_) {}
        try {
          const st = readState();
          ticketIds.forEach(id => {
            const t = st[id]; if (!t) return;
            if (t.status !== 'Shipped' && (TRANSITIONS[t.status] || []).includes('Shipped')) {
              const from = t.status; t.status = 'Shipped'; t.assignee = assigneeFor('Shipped');
              t.evidence = { kind: 'deploy', sha: headSha.slice(0, 7), reason: 'Pushed to ' + branch + ' via Deploy (pre-push gate PASS); GitHub Pages building', ts: new Date().toISOString() };
              logTransition(id, from, 'Shipped', 'jarvis');
              t.thread.push({ author: 'jarvis', text: '**Shipped** &mdash; pushed to `' + branch + '` (' + headSha.slice(0, 7) + '). GitHub Pages is building; track it in Deploy. Phone-verify once the service worker refreshes.', ts: new Date().toISOString() });
              t.lastActivity = new Date().toISOString();
            }
          });
          writeState(st);
        } catch (_) {}
        resolve({ ok: true, code, output: out.slice(-2000), branch, pushedFrom: pushDir === WORKTREE ? 'worktree' : 'repo', deploy: rec, shipped: ticketIds });
      });
    });
  },

  // DEPLOY STATUS — has the last push actually gone live? Read-only probe: GET the single hardcoded Pages
  // URL via the `curl` subprocess, compare its (line-ending-normalized) bytes to the deployed commit's
  // index.html (git show <sha>:index.html — robust even after a newer fix is staged). Match → LIVE.
  // The phone still needs its service worker to refresh — that's surfaced as the final manual step.
  deployStatus: () => {
    const log = readDeployLog(); const d = (log.deploys || [])[0];
    if (!d) return { ok: true, none: true };
    const r = spawnSync('curl', ['-s', '--max-time', '25', LIVE_URL + 'index.html?cb=' + Date.now()], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    let deployedHtml = '';
    try { deployedHtml = execSync('git show ' + d.sha + ':index.html', { cwd: WORKTREE, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); } catch (_) {}
    if (r.status === 0 && r.stdout && deployedHtml) {
      const live = normHash(r.stdout) === normHash(deployedHtml);
      if (live && d.status !== 'live') { d.status = 'live'; d.liveAt = new Date().toISOString(); }
      else if (!live) { d.status = 'building'; }
      d.checkedAt = new Date().toISOString();
    } else { d.probeError = (r.stderr || 'probe failed').slice(0, 200); d.checkedAt = new Date().toISOString(); }
    try { writeDeployLog(log); } catch (_) {}
    return { ok: true, deploy: d, probe: (r.status === 0 && r.stdout) ? 'ok' : 'failed' };
  },

  // ── AUTO-TICKETING — untracked App-Map gaps → tickets ───────────────────────
  // A gap-class step (is ∈ gap/broken/dead/fires-anyway) with NO per-step ticket AND whose
  // surface has NO top-level ticket is an UNTRACKED gap. This mints one ticket per untracked
  // gap, the SAME way createTicket does (append to tickets-manual.json; next SLY-N = max+1
  // across spine+manual; seed ticket-state), and records gapKey→id in a path-jailed dedupe map
  // so re-running never duplicates. RULE 2 (allowlisted, fixed targets), RULE 3 (every write
  // jail()'d to mission-control/), RULE 6-family (confirm-gated — it creates real tickets).
  autoTicket: ({ confirm }) => {
    if (confirm !== true) return { ok: false, reason: 'autoTicket needs confirm:true' };

    // Title-Case surface names — server-side mirror of jarvis.js SURFACE_NAMES. Fixed map; any
    // surface not listed falls back to its raw id (never throws, never derives a path).
    const SURFACE_NAMES = {
      dashboard: 'Dashboard', bills: 'Bills', savings: 'Savings', plan: 'Payday Plan',
      analysis: 'Analysis', debts: 'Debts', ai: 'AI Chat', settings: 'Settings',
      nav: 'Nav / Onboarding', planning: 'Planning', tracked: 'Tracked', other: 'Other',
    };
    const niceSurfaceSrv = (id) => SURFACE_NAMES[id] || String(id || '—');
    const GAP_CLASS = new Set(['gap', 'broken', 'dead', 'fires-anyway']);

    // READ-ONLY: the App-Map data. flows.json is the same blob the client reads via /api/flows,
    // so server and client see the identical step list (consistent untracked-gap definition).
    let flows; try { flows = JSON.parse(fs.readFileSync(path.join(MC, 'flows.json'), 'utf8')); }
    catch (e) { return { ok: false, reason: 'flows.json unreadable: ' + e.message }; }

    // Dedupe store — path-jailed to ONE fixed JSON (like case-notes.json / auto-tickets are
    // runtime, gitignored). gapKey → createdTicketId.
    const dedupePath = jail(path.join('mission-control', 'auto-tickets.json'));
    let dedupe = {}; try { dedupe = JSON.parse(fs.readFileSync(dedupePath, 'utf8')) || {}; } catch (_) {}

    // Compute the next SLY-N ONCE, then increment locally as we mint (createTicket recomputes
    // per-call, but we batch — so seed from the live max across spine+manual and step it up).
    const all = [...TICKETS(), ...MANUAL()];
    let nextN = Math.max(0, ...all.map(t => +(String(t.id || '').replace('SLY-', '') || 0)));

    // Load the two mutable stores we append to (manual spine + ticket-state), write once at end.
    const manualPath = jail(path.join('mission-control', 'tickets-manual.json'));
    let m = { tickets: [] }; try { m = JSON.parse(fs.readFileSync(manualPath, 'utf8')); } catch (_) {}
    if (!Array.isArray(m.tickets)) m.tickets = [];
    const st = readState();
    const now = new Date().toISOString();

    const ids = [];
    let created = 0, skipped = 0;

    (flows.surfaces || []).forEach((surface) => {
      // surface-level ticket covers ALL of this surface's gaps → nothing untracked here.
      if (surface.ticket) return;
      (surface.steps || []).forEach((step) => {
        if (!GAP_CLASS.has(step.is)) return;     // not a gap-class step
        if (step.ticket) return;                  // already has a per-step ticket
        const gapKey = surface.id + ':' + step.n;
        if (dedupe[gapKey]) { skipped++; return; } // already minted on a prior run

        const id = 'SLY-' + (++nextN);
        const file = step.file && step.file !== '—' ? step.file : null;   // '—' = em-dash placeholder
        m.tickets.push({
          id,
          type: 'bug',
          kind: 'auto',
          caseId: null,
          title: niceSurfaceSrv(surface.id) + ': ' + String(step.title || '').slice(0, 160),
          surface: surface.id,
          group: surface.id,
          severity: (step.is === 'fires-anyway' || step.is === 'broken') ? 'P1' : 'P1',
          summary: String(step.plain || '').slice(0, 2000),
          rich: {
            mechanism: '',
            rootCause: ((step.wired || '') + ' ' + (step.file || '')).trim(),
            fix: '',
            files: file ? [file] : [],
            evidence: null,
          },
          openBug: null,
          links: [{ to: surface.id + ' map', why: 'auto-filed from an App-Map gap' }],
        });
        // Seed ticket-state exactly like createTicket (Open / john / opened now).
        st[id] = { status: 'Open', assignee: 'john', thread: [], alignment: null, evidence: null, opened: now, lastActivity: now };
        dedupe[gapKey] = id;
        ids.push(id);
        created++;
      });
    });

    if (created) {
      fs.mkdirSync(path.dirname(manualPath), { recursive: true });
      fs.writeFileSync(manualPath, JSON.stringify(m, null, 2));
      writeState(st);                                             // jail()'d inside writeState
      fs.mkdirSync(path.dirname(dedupePath), { recursive: true });
      fs.writeFileSync(dedupePath, JSON.stringify(dedupe, null, 2));
    }
    return { ok: true, created, ids, skipped };
  },
};

// ── Allowlisted READS (GET). Read-only, localhost-only — no token required, but
//    still a FIXED map (no read-any-file). Every value is jail()'d at read time
//    in the /api/read handler, so each entry is repo-root-relative and read-only. ─
const READS = {
  // Security & governance
  security:       'SECURITY.md',
  'mc-security':  'mission-control/SECURITY.md',
  pipeline:       'docs/PIPELINE.md',
  rules:          'MISSION-RULES.md',
  // The contract
  invariants:     'FINANCIAL-INVARIANTS.md',
  featuremap:     'FEATURE-MAP.md',
  architecture:   'ARCHITECTURE.md',
  // Project
  openbugs:       'OPEN-BUGS.md',
  'john-knowledge': 'docs/JOHN-KNOWLEDGE.md',
  coverage:       'docs/walk-and-judge/coverage-map-2026-05-26.md',
};

// Default Prompt-Library templates — returned by /api/prompts when prompts.json
// is missing (first run). The Command Deck's "Add Template" → savePrompts writes
// the real file, after which these are no longer used. Title Case titles.
const PROMPT_DEFAULTS = [
  {
    id: 'investigate-ticket',
    title: 'Investigate A Ticket End-To-End',
    body: 'Investigate {ticket}: read its handoff package and run the full 6-tier pipeline. Walk the ledger first (S.txns are truth), confirm the finding is live with the strongest test, fix forward with code context, gate on full Guardian + boot self-test, then post results back into {ticket}. My approval before push.',
    vars: [{ name: 'ticket', label: 'Ticket', kind: 'ticket' }],
  },
  {
    id: 'walk-surface',
    title: 'Walk A Surface And Report Gaps',
    body: 'Walk the {surface} surface and report gaps. Drive the running app, capture every step, then map IS vs SHOULD: each divergence as symptom · INV-NN touched · file:line · severity. Plain English, real names. Report the gap list — do not code.',
    vars: [{ name: 'surface', label: 'Surface', kind: 'text', placeholder: 'e.g. Savings' }],
  },
  {
    id: 'opus-design-review',
    title: 'Ask Opus — Design Review',
    body: 'Ask Opus: design-review {topic}. Frame the problem, the constraints (single-file index.html, vanilla JS, single user John, 380px phone), the options considered, and the recommendation. Surface tradeoffs before any code. Premium-feel, plain English.',
    vars: [{ name: 'topic', label: 'Topic', kind: 'text', placeholder: 'e.g. the lock-state divergence' }],
  },
  {
    id: 'improve-cc-process',
    title: 'Improve CC Process',
    body: 'Improve CC process: {area}. Name the friction, the failure class it belongs to, and a concrete amendment to CLAUDE.md / the CC manual that would prevent it recurring. One rule, testable, plain English.',
    vars: [{ name: 'area', label: 'Area', kind: 'text', placeholder: 'e.g. verification discipline' }],
  },
  {
    id: 'premium-ux-review',
    title: 'Premium UX Review Of A Surface',
    body: 'Premium UX review of the {surface} surface on a 380×660 phone. Check contrast, info-density (4-question test), 44×44 touch targets, alive micro-motion, plain-English labels with real names. Return a prioritised punch-list (P0/P1/P2) with the concrete visible outcome for each.',
    vars: [{ name: 'surface', label: 'Surface', kind: 'text', placeholder: 'e.g. Dashboard' }],
  },
];
function latestWalk() {
  const root = jail(path.join('tests', 'walker-out'));
  if (!fs.existsSync(root)) return null;
  const dirs = fs.readdirSync(root).filter(d => fs.existsSync(path.join(root, d, 'walk.json'))).sort();
  if (!dirs.length) return null;
  const dir = dirs[dirs.length - 1];
  return { dir, walk: JSON.parse(fs.readFileSync(path.join(root, dir, 'walk.json'), 'utf8')) };
}
function listWalkSpecs() {
  const d = jail(path.join('docs', 'walk-and-judge', 'specs'));
  return fs.existsSync(d) ? fs.readdirSync(d).filter(f => f.endsWith('.md')).sort() : [];
}

// ── Surface → walk scope. A ticket's surface/group maps to the walker FLOW ids that
//    exercise it, via the SAME specs.json registry runWalk() validates against. We only
//    ever look up known group ids; flow ids come from the registry, never from input. ──
function walkScopeForSurface(surface) {
  const group = String(surface || '').trim();
  if (!group) return { group: null, flows: [] };
  let reg = {};
  try { reg = JSON.parse(fs.readFileSync(path.join(MC, 'specs.json'), 'utf8')); } catch (_) {}
  const known = (reg.groups || []).includes(group);
  const flows = [];
  (reg.specs || []).forEach(s => {
    if (s.group === group && s.runnable && Array.isArray(s.flows)) {
      s.flows.forEach(f => { if (f && !flows.includes(f)) flows.push(f); });
    }
  });
  return { group: known ? group : null, flows };
}

// ── Is this flow's latest walk a real PASS? A flow PASSES when it ran (has steps) and
//    NO step carries an error (error===null on every step). We return the per-step
//    summary too, so the proof recorded on the ticket is the actual evidence, not a label.
//    `lands` is surfaced per step so the proof shows that writes actually fired.
function flowVerdict(walk, flowId) {
  const f = (walk.flows || []).find(x => x.flow === flowId);
  if (!f) return { flow: flowId, found: false, passing: false, steps: [] };
  const steps = (f.steps || []).map(s => ({
    n: s.n, id: s.id, action: s.action,
    lands: (s.lands || []).map(l => l.type),
    error: s.error || null,
  }));
  const ran = steps.length > 0;
  const errored = steps.some(s => s.error);
  return { flow: flowId, title: f.title, found: true, passing: ran && !errored, steps };
}

// Freshness gate — a walk older than this is "stale" and cannot earn ConfirmedLive.
// 14 days: long enough to align→investigate→confirm without re-walking; short enough
// that a months-old capture can't silently vouch for current code. Tunable.
const WALK_MAX_AGE_DAYS = 14;

// ── Jarvis tickets: spine (generated) + mutable state, merged for the API. ────
const TICKETS = () => { try { return JSON.parse(fs.readFileSync(path.join(MC, 'tickets.json'), 'utf8')).tickets || []; } catch { return []; } };
const MANUAL = () => { try { return JSON.parse(fs.readFileSync(path.join(MC, 'tickets-manual.json'), 'utf8')).tickets || []; } catch { return []; } };
const readState = () => { try { return JSON.parse(fs.readFileSync(path.join(MC, 'ticket-state.json'), 'utf8')); } catch { return {}; } };
const writeState = (s) => fs.writeFileSync(jail(path.join('mission-control', 'ticket-state.json')), JSON.stringify(s, null, 2));
// the earned-state machine — each transition is a legal edge, not a free text set
const TRANSITIONS = { Open: ['Gathering', 'Discussing'], Gathering: ['Discussing', 'Aligned', 'Open'], Discussing: ['Gathering', 'Aligned', 'Open'], Aligned: ['Investigating', 'Discussing'], Investigating: ['ConfirmedLive', 'Shipped', 'Aligned'], ConfirmedLive: ['Shipped', 'Investigating'], Shipped: ['Investigating'] };
const STATUSES = ['Open', 'Gathering', 'Discussing', 'Aligned', 'Investigating', 'ConfirmedLive', 'Shipped'];
const assigneeFor = (st) => (st === 'Aligned' || st === 'Investigating' || st === 'Gathering') ? 'cc' : 'john';
function mergedTickets() {
  const spine = [...TICKETS(), ...MANUAL()], state = readState();
  return {
    tickets: spine
      .filter(t => !(state[t.id] && state[t.id].deleted === true))   // tombstoned tickets are excluded everywhere
      .map(t => {
        const s = state[t.id] || { status: 'Open', assignee: 'john', thread: [], alignment: null, opened: null, lastActivity: null };
        const m = s.meta || {};                                       // editable overrides + new fields (setMeta)
        const cf = s.caseFile || {};                                  // drone-gathered evidence (dispatchScoped)
        return {
          ...t,
          type:     m.type     || t.type,          // override the read-only spine type…
          severity: m.severity || t.severity,      // …and severity, when John has set one
          dueDate:  m.dueDate  || null,            // NEW — null when unset (Calendar reads this)
          bundle:   m.bundle   || null,            // NEW — null when unset (Planning reads this)
          epic:     m.epic     || t.epic || null,  // NEW — parent epic id (meta override → spine fallback)
          blockedBy: Array.isArray(m.blockedBy) ? m.blockedBy : [],   // dependency edges (epic ordering)
          childOrder: Array.isArray(m.childOrder) ? m.childOrder : null, // explicit child sequence (on an epic)
          rich:     mergeRich(t.rich, cf),         // drone evidence overlays the spine rich (filled slots only)
          caseFile: cf,                            // raw slot-level evidence for the case-file panel
          state: s,
        };
      })
  };
}
// the COLLATE step — assemble the rich package John's alignment triggers.
function collate(ticket, state, decision) {
  const age = state.opened ? Math.round((Date.now() - new Date(state.opened)) / 86400000) : 0;
  const ev = ticket.rich.evidence; let evTxt = '_(not walked)_';
  if (ev) evTxt = `Flow \`${ev.flow}\` (walk ${ev.walkDir}):\n` + (ev.steps || []).map(s => { const d = Object.entries(s.delta || {}).map(([k, v]) => `${k}: ${v}`).join(', '); return `- ${s.step}: lands [${(s.lands || []).join(', ') || 'NONE — no-op'}]${d ? ' · ' + d : ''}${s.probe ? '\n  probe: ' + JSON.stringify(s.probe) : ''}`; }).join('\n');
  const thread = (state.thread || []).map(c => `- **${c.author}** (${(c.ts || '').slice(0, 16)}): ${c.text}`).join('\n') || '_(no discussion)_';
  const links = (ticket.links || []).map(l => `- ${l.to} — ${l.why}`).join('\n') || '_(none)_';
  return `# Handoff: ${ticket.id} — ${ticket.title}

**${ticket.severity} · ${ticket.kind}** · surface: ${ticket.group} · open ${age} day(s) · aligned ${new Date().toISOString().slice(0, 16)}

## John's alignment decision (the trigger)
${decision || 'agreed with the proposed fix'}

## Summary (what John read)
${ticket.summary}

## The finding — investigate + resolve from this
### Mechanism
${ticket.rich.mechanism || '_(see root cause)_'}
### Root cause
${ticket.rich.rootCause}
### Walk evidence (from the running app)
${evTxt}
### Proposed fix
${ticket.rich.fix}
### Files
${(ticket.rich.files || []).map(f => '- ' + f).join('\n')}

## Discussion thread
${thread}

## Links / relationships
${links}

---
You're receiving this because John ALIGNED. Investigate + resolve the complete package,
then POST BACK into ${ticket.id} (what you found / fixed / evidence). Run the full
6-tier pipeline. Conservation + Guardian green gate. §8 plain-English. My approval before push.
`;
}

// ── Time-series history (the SERIES-metric substrate — see docs/jarvis/metrics-catalog).
// Two append-only stores, each path-jailed to ONE fixed file:
//   • history.jsonl   — one transition event per line {ticketId, from, to, by, ts}
//   • snapshots.json  — one board snapshot per day {date, total, byStatus, bySeverity, gaps, ts}
// Both are RUNTIME (gitignored). logTransition is fire-and-forget: a history-write failure must
// never break the user-facing action it rides inside, so it swallows its own errors.
const HISTORY_FILE   = path.join('mission-control', 'history.jsonl');
const SNAPSHOTS_FILE = path.join('mission-control', 'snapshots.json');
// Running CC-dispatch spend ledger. RUNTIME only (gitignored), path-jailed to ONE
// fixed file — mirrors history.jsonl/snapshots.json. Records every dispatch's cost
// so the UI can show a running total. Best-effort: a ledger write must NEVER break
// the dispatch it rides inside (it swallows its own errors, like logTransition).
const SPEND_FILE = path.join('mission-control', 'cc-spend.json');

// Rough usage-budget anchors for the topbar meter. IMPORTANT: there is NO local source for
// John's real Anthropic plan quota, so these are tunable best-guess ceilings (he's on Max 20x)
// used ONLY to colour the estimated-spend gauge green→amber→red. Estimated $ are at API list
// prices — a usage awareness gauge, not a bill. Bump these freely; they don't gate anything.
const MONTH_BUDGET_USD = 600;
const DAY_BUDGET_USD = 60;
// Sum the ledger's per-run costs within the current LOCAL day / month (server runs on John's box,
// so local time = his time). Used by /api/ccjobs to drive the usage meter.
function spendWindows() {
  const led = readSpend();
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const ymd = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  const ym = ymd.slice(0, 7);
  let today = 0, month = 0;
  for (const j of led.jobs || []) {
    const c = (typeof j.cost === 'number') ? j.cost : 0;
    const d = new Date(j.ts); if (isNaN(d)) continue;
    const jymd = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    if (jymd === ymd) today += c;
    if (jymd.slice(0, 7) === ym) month += c;
  }
  return { total_usd: led.total_usd, count: led.count,
           today_usd: +today.toFixed(4), month_usd: +month.toFixed(4),
           dayBudget: DAY_BUDGET_USD, monthBudget: MONTH_BUDGET_USD };
}

// Read the spend ledger (jail()'d, missing/corrupt → empty zeroed ledger).
function readSpend() {
  try {
    const s = JSON.parse(fs.readFileSync(jail(SPEND_FILE), 'utf8'));
    if (s && typeof s === 'object') {
      return { total_usd: +s.total_usd || 0, count: +s.count || 0, jobs: Array.isArray(s.jobs) ? s.jobs : [] };
    }
  } catch (_) {}
  return { total_usd: 0, count: 0, jobs: [] };
}

// Append ONE dispatch's cost to the running total. cost may be a number or null/undefined
// (Claude omits total_cost_usd on some exits) — null contributes 0 to the total but is
// still recorded on the job row so the UI can render "—". Caps the jobs[] tail at 200 so
// the file can't grow without bound. Best-effort; never throws into the exit handler.
function recordSpend(id, cost, turns, durationMs) {
  try {
    const led = readSpend();
    const c = (typeof cost === 'number' && isFinite(cost)) ? cost : null;
    led.total_usd = +(led.total_usd + (c || 0)).toFixed(6);   // null → adds 0
    led.count += 1;
    led.jobs.push({ id, cost: c, turns: (typeof turns === 'number' ? turns : null),
                    durationMs: (typeof durationMs === 'number' ? durationMs : null),
                    ts: new Date().toISOString() });
    if (led.jobs.length > 200) led.jobs = led.jobs.slice(-200);
    const abs = jail(SPEND_FILE);                              // RULE 3 — fixed file, jailed
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(led, null, 2));       // string → utf8 by default
    return led;
  } catch (_) { return null; }   // ledger is best-effort — never break the dispatch
}

// ════════════════ SCOPED GATHER DRONES — pristine, non-overlapping prompts ════════════════
// Mirrors docs/PIPELINE.md (Tier-1 Gather discipline) + CASE-FILE-REDESIGN.md §5. Each drone owns
// ONE caseFile slot; each prompt names the OTHER drones' jobs in a DO-NOT list so nothing overlaps;
// each is fed the existing case file and told add/correct/fill only, so nothing repeats.
const REASON_SUFFIX_SC = {
  off:   '',
  think: ' Think carefully, step by step, before answering.',
  deep:  ' Ultrathink — reason deeply and consider edge cases before answering.',
};
// THE FRONTEND-DESIGN DISCIPLINE — distilled from the built-in `frontend-design` skill and ALWAYS
// prepended to any UX work in this pipeline (per John 2026-05-28). The skill's core is production-grade
// craft + anti-"AI-slop"; here it is ADAPTED for slyght, which already has an established design system —
// so the drone COHERES with + elevates it, never reskins on a whim. It also bakes in slyght's hard-won
// UX rules (the re-render flash class, contrast, touch targets, motion-must-serve).
function UX_DESIGN_PREAMBLE() {
  return [
    '## You carry the frontend-design discipline (always loaded for UX work in this pipeline).',
    'Production-grade craft, NOT generic "AI slop". But slyght/Mission Control is a LIVING product with an ESTABLISHED design system — your job is to COHERE with and ELEVATE it, never to reskin it on a whim.',
    '',
    'RESPECT THE SYSTEM: slyght (the app) is a clean data-dense PWA on CSS custom properties (--bg/--card/--accent/--text/--text2/--text3/--green/--amber/--red…). Mission Control is soft-dark + a neon command-centre surface. Reuse the existing tokens + components; introduce NO new fonts, palettes, or one-off hex. Every value should trace to a token.',
    '',
    'BRING THE CRAFT (the skill\'s pillars, applied within the system):',
    '- TYPOGRAPHY: clear hierarchy + rhythm. slyght rule: data/numbers in --text (never grey-on-grey); labels --text2; --text3 decorative only. No Inter/Roboto/Arial defaults.',
    '- MOTION: motion must SERVE, never distract — purposeful micro-interactions, high-impact moments. ⚠ CRITICAL for this app: a live/poll-updating view must NOT full-re-render every tick — that replays enter-animations and STROBES (the Command Centre flash bug; fixed by splitting build vs. in-place update). A screen that flashes / looks like it "reloads" when you navigate or when data updates is a DEFECT, not a style. Animate only what changed.',
    '- SPATIAL COMPOSITION: honest alignment + a consistent spacing scale + honest density. The REAL target is a 380px phone viewport; 44×44px minimum touch targets.',
    '- DEPTH & DETAIL: shadows/borders/transitions in the existing language; never decorative noise that hurts readability.',
    '',
    'ANTI-SLOP: no purple-on-white gradients, no default system fonts, no cookie-cutter predictable layouts, no animation for its own sake. Intentionality over intensity.',
    '',
    'DIAGNOSE CONCRETELY: name the SPECIFIC cause with file:line — for a flash/reload glitch, find the function that triggers the FULL re-render (view swap on nav, or a poll/interval re-painting the whole subtree) and propose the MINIMAL in-place-update fix within the system. Name the exact CSS/JS to change.',
  ].join('\n');
}
// Does this ticket / surface count as UX work? If so the frontend-design preamble rides along in
// execute-fix, jarvis-chat, and (always) the dedicated UX drone. Heuristic: UI-surface group OR keywords.
function isUXWork(ticket) {
  if (!ticket) return false;
  const hay = [ticket.title, ticket.summary, ticket.group, ticket.type].map(x => String(x || '').toLowerCase()).join(' ');
  return /\b(ux|ui|visual|layout|flash|glitch|flicker|strob|reload|re-render|rerender|render|animation|animate|transition|spacing|align|responsive|design|screen|style|css|theme|motion|jank|stutter)\b/.test(hay);
}
function GATHER_PREAMBLE(id, richDump) {
  return [
    'You are a Gather drone for slyght Mission Control, dispatched on ticket ' + id + ' for ONE scoped job.',
    'slyght is a single-file PWA (index.html ~24k lines; global S persisted to localStorage.slyght_v5; BRAIN bubbles are the canonical writers; every write carries a source tag and hits the audit log; S._auditLog is forensic truth).',
    '',
    'Pipeline Tier-1 Gather rules — NON-NEGOTIABLE:',
    '1. Report in assumption-shape with file:line evidence. You are GATHERING, not concluding — no policy calls, no "we should".',
    '2. Never claim a count you did not enumerate. Banned: "12+ consumers". Required: list every one with its file:line.',
    '3. Stay strictly inside your scope. Relevant-but-out-of-scope findings go in unmappedTerritory — do NOT chase them.',
    '4. Read the EXISTING CASE FILE below. Do NOT re-derive or repeat anything already established — only ADD, CORRECT (with reason), or FILL a gap. If established evidence looks wrong, flag it in one line; do not redo it.',
    '5. End with EXACTLY ONE fenced code block tagged json, matching the schema in your job. Keep prose above it under 200 words.',
    '',
    'EXISTING CASE FILE (do not repeat):',
    richDump,
  ].join('\n');
}
const SCOPED_TASKS = {
  'root-cause': {
    label: 'Root-cause dig', slot: 'rootCause + mechanism + files', mode: 'plan', model: 'sonnet', reasoning: 'think',
    directive: [
      'Find the MECHANISM (how the wrong behaviour is produced, step by step in code) and the ROOT CAUSE (why it exists), and ENUMERATE every file:line on the causal path.',
      'If this ticket touches money (balance, buckets, debts, bills, allocation, forecast): do a LEDGER WALK first — trace S.txns forward; never trust a paid/flag value the ledger does not back (paid:true + matching txn = BACKED; paid:true + no txn = ORPHAN, treat suspect). State the verdict for any flag on your path.',
      'DO NOT: propose or design a fix (that is the fix-proposal drone); assess architectural fit (conformance drone); identify the App-Map surface (locate-surface drone); run or screenshot the app (walk drone). Leave those — producing them is duplicate work.',
      'JSON schema: {"task":"root-cause","slot":"rootCause+mechanism+files","findings":{"mechanism":"...","rootCause":"...","files":[{"path":"index.html","line":0,"role":"..."}],"ledgerVerdict":"BACKED|ORPHAN|AMBIGUOUS|n/a"},"confidence":"high|medium|low","openQuestions":[],"unmappedTerritory":[]}',
    ].join('\n'),
  },
  'locate-surface': {
    label: 'Locate surface', slot: 'surface + mapVerdict', mode: 'plan', model: 'sonnet', reasoning: 'off',
    directive: [
      'Decide which App-Map surface(s) this ticket belongs to, using FEATURE-MAP.md plus the files in the case file. Return the surface id(s) with file:line evidence and whether it is mapped / orphaned / map-stale.',
      'DO NOT: investigate root cause, propose a fix, or judge conformance beyond the mapped/orphaned question.',
      'JSON schema: {"task":"locate-surface","slot":"surface+mapVerdict","findings":{"surface":"...","alsoTouches":[],"mappedInFeatureMap":true,"mapStale":false,"evidence":[{"path":"...","line":0}]},"confidence":"high|medium|low","openQuestions":[],"unmappedTerritory":[]}',
    ].join('\n'),
  },
  'fix-proposal': {
    label: 'Fix proposal', slot: 'fix + invariants', mode: 'plan', model: 'opus', reasoning: 'think',
    directive: [
      'Given the ALREADY-ESTABLISHED root cause in the case file above, design the MINIMAL correct fix: the change, before->after behaviour, the exact change-site file:lines, and which INV-NN invariants it preserves (and any it risks). Use canonical writers (BRAIN.<domain>.<verb>, source tags) — never a parallel calc.',
      'DO NOT: re-derive the root cause (it is given — if you believe it is wrong, set rootCauseDisagreement to one sentence and stop, do not re-investigate); edit or implement files; judge surface mapping.',
      'JSON schema: {"task":"fix-proposal","slot":"fix+invariants","findings":{"fix":"...","before":"...","after":"...","changeSites":[{"path":"...","line":0}],"invariantsPreserved":[],"invariantsAtRisk":[],"rootCauseDisagreement":null},"confidence":"high|medium|low","openQuestions":[],"unmappedTerritory":[]}',
    ].join('\n'),
  },
  'conformance': {
    label: 'Conformance', slot: 'conformance', mode: 'plan', model: 'opus', reasoning: 'think',
    directive: [
      'Run the Conformance (FIT) checks on the proposed fix in the case file above. Answer each with file:line evidence: Mapped? (in FEATURE-MAP) · Labelled? (vocabulary registry — no new meaning for an overloaded word) · Linked? (wired to canonical readers/writers) · Canonical-or-parallel? (reuses surplus/headroom/daily-living/isPaidInCycle, or invents a drifting parallel) · Invariant coverage? (which INV-NN; need a new one?) · Fits current + planned architecture? (collides with a queued bundle?).',
      'Severity-gate the verdict: NEW drift this fix introduces = block; distant pre-existing drift = flag; adjacent same-shape cheap drift = correct.',
      'DO NOT: re-derive root cause or re-propose the fix.',
      'JSON schema: {"task":"conformance","slot":"conformance","findings":{"mapped":true,"labelled":true,"linked":true,"canonicalOrParallel":"canonical|parallel","invariants":[],"fitsArchitecture":true,"driftVerdict":"block|flag|correct|clean","notes":"..."},"confidence":"high|medium|low","openQuestions":[],"unmappedTerritory":[]}',
    ].join('\n'),
  },
  'auditor': {
    label: 'Auditor', slot: 'audit', mode: 'plan', model: 'opus', reasoning: 'think',
    directive: [
      'You are the AUDITOR. The case file above is everything gathered so far. Do three things, nothing else:',
      '1. Verdict each slot: BACKED (evidence supports it) / THIN (present but weak) / MISSING / CONTRADICTORY (slots disagree).',
      '2. Merge and dedupe: fold overlapping findings into one coherent case. If two passes found the same issue, state it ONCE. If a later pass found an additional issue, add it — do not restate the first.',
      '3. Decide: COMPLETE (ready for John to align) or GAP — and if GAP, name EXACTLY ONE targeted follow-up. The "drone" field MUST be one of these exact scoped task ids: root-cause, locate-surface, fix-proposal, conformance (never "Gather" or a free word — the system re-runs that exact drone, then re-audits). Pick the drone that owns the MISSING/THIN slot. Never a blind full re-run; never more than one.',
      'If the case file shows a prior audit at cycle 2, you MUST return COMPLETE (with caveats for anything still thin) — convergence is mandatory, there is no cycle 3.',
      'DO NOT investigate yourself, request multiple digs, or loop.',
      'JSON schema: {"task":"auditor","cycle":1,"slots":{"rootCause":"BACKED","files":"BACKED","fix":"THIN","surface":"BACKED","conformance":"MISSING","walk":"MISSING"},"merged":"one-paragraph converged case","verdict":"COMPLETE|GAP","nextDig":null,"caveats":[]}',
    ].join('\n'),
  },
  // ── FEATURE / TASK scopes — a BUILD shape, not a diagnostic one. A feature ticket gathers
  // intent → design → acceptance (reusing locate-surface + conformance); a task just gets a breakdown.
  'intent': {
    label: 'Intent', slot: 'intent', mode: 'plan', model: 'sonnet', reasoning: 'think',
    directive: [
      'This is a FEATURE/initiative, not a bug. Capture the INTENT in plain English: who it is for (John — be specific to his daily use), the user-facing goal, why now, and what success looks like. Ground it in how slyght works today (read the relevant surface) but do NOT design the solution (that is the design drone) or write acceptance checks (acceptance drone).',
      'DO NOT: propose code, judge architecture, or enumerate steps. Just the intent + success picture.',
      'JSON schema: {"task":"intent","slot":"intent","findings":{"intent":"one-paragraph plain-English goal","forWho":"...","whyNow":"...","success":"what good looks like"},"confidence":"high|medium|low","openQuestions":[],"unmappedTerritory":[]}',
    ].join('\n'),
  },
  'design': {
    label: 'Design', slot: 'design', mode: 'plan', model: 'opus', reasoning: 'think',
    directive: [
      'Given the INTENT in the case file, design the minimal SHAPE of the build for slyght (single-file index.html; global S; BRAIN bubbles are the canonical writers). Describe the approach, the components/state involved, where it lives (file:line), the data shape, and how it fits the existing architecture WITHOUT inventing a parallel system. Reuse canonical writers + SOURCES tags.',
      'DO NOT: re-state the intent; write acceptance criteria; judge conformance (that drone does). If the intent is unclear, set intentGap to one sentence and stop.',
      'JSON schema: {"task":"design","slot":"design","findings":{"design":"the approach","components":["..."],"changeSites":[{"path":"index.html","line":0}],"dataShape":"...","intentGap":null},"confidence":"high|medium|low","openQuestions":[],"unmappedTerritory":[]}',
    ].join('\n'),
  },
  'acceptance': {
    label: 'Acceptance', slot: 'acceptance', mode: 'plan', model: 'sonnet', reasoning: 'think',
    directive: [
      'Given the intent + design in the case file, write concrete ACCEPTANCE CRITERIA: testable done-when checks (each a single observable outcome on John\'s S23 Android Chrome PWA), the edge cases to cover, and the phone-verify (Open · Do · PASS · FAIL). Plain English, real numbers/names where known.',
      'DO NOT: design the solution or judge architecture. Just the checks that prove it works.',
      'JSON schema: {"task":"acceptance","slot":"acceptance","findings":{"criteria":["testable done-when"],"edgeCases":["..."],"phoneVerify":{"open":"...","do":"...","pass":"...","fail":"..."}},"confidence":"high|medium|low","openQuestions":[],"unmappedTerritory":[]}',
    ].join('\n'),
  },
  'breakdown': {
    label: 'Breakdown', slot: 'breakdown', mode: 'plan', model: 'sonnet', reasoning: 'off',
    directive: [
      'This is a TASK — a concrete piece of work, not a bug or a feature. Break it into a short ordered list of STEPS, each a single action, with a clear DONE-WHEN for the whole task. Ground it in the actual codebase where relevant (file:line). Keep it tight — a checklist, not an essay.',
      'DO NOT: over-engineer, design a system, or pad. Just the steps + done-when.',
      'JSON schema: {"task":"breakdown","slot":"breakdown","findings":{"steps":["step 1","step 2"],"doneWhen":"the single condition that means this is finished","files":[{"path":"...","line":0}]},"confidence":"high|medium|low","openQuestions":[],"unmappedTerritory":[]}',
    ].join('\n'),
  },
};
// The per-type investigation pipeline — bug = diagnostic, feature = build, task = checklist. sweepCase
// runs `parallel` concurrently, then `chain` in sequence, then the auditor (if audit). See BEEFY-PLAN.md WS-5.
const PIPELINES = {
  bug:     { parallel: ['root-cause', 'locate-surface'], chain: ['fix-proposal', 'conformance'], audit: true },
  feature: { parallel: ['intent', 'locate-surface'], chain: ['design', 'acceptance', 'conformance'], audit: true },
  task:    { parallel: ['breakdown'], chain: [], audit: true },
};
const pipelineFor = (t) => PIPELINES[(t && t.type) === 'feature' ? 'feature' : (t && t.type) === 'task' ? 'task' : 'bug'];
// Is a given scoped task's caseFile slot already filled? (drives the sweep's skip-don't-redo behaviour)
function slotFilled(task, cf) {
  cf = cf || {};
  switch (task) {
    case 'root-cause':     return !!(cf.rootCause && cf.rootCause.rootCause);
    case 'locate-surface': return !!(cf.surface && cf.surface.surface);
    case 'fix-proposal':   return !!(cf.fix && cf.fix.fix);
    case 'conformance':    return !!(cf.conformance && cf.conformance.driftVerdict);
    case 'intent':         return !!(cf.intent && cf.intent.intent);
    case 'design':         return !!(cf.design && cf.design.design);
    case 'acceptance':     return !!(cf.acceptance && cf.acceptance.criteria);
    case 'breakdown':      return !!(cf.breakdown && cf.breakdown.steps);
    default:               return false;
  }
}

// Readable dump of a ticket's CURRENT evidence — fed to every drone so it never re-derives.
function caseFileDump(ticket, cf) {
  const rich = (ticket && ticket.rich) || {};
  const rc = cf.rootCause || {};
  const fileList = (rc.files && rc.files.length)
    ? rc.files.map(x => typeof x === 'string' ? x : (x.path + ':' + x.line)).join(', ')
    : (rich.files || []).join(', ');
  const lines = [
    '- Symptom: ' + ((ticket && ticket.summary) || '(none)'),
    '- Root cause: ' + (rc.rootCause || rich.rootCause || '(EMPTY — needs root-cause drone)'),
    '- Mechanism: ' + (rc.mechanism || rich.mechanism || '(EMPTY)'),
    '- Files: ' + (fileList || '(EMPTY)'),
    '- Surface: ' + ((cf.surface && cf.surface.surface) || (ticket && ticket.group) || '(EMPTY — needs locate-surface drone)'),
    '- Proposed fix: ' + ((cf.fix && cf.fix.fix) || rich.fix || '(EMPTY — needs fix-proposal drone)'),
    '- Conformance: ' + ((cf.conformance && cf.conformance.driftVerdict) || '(EMPTY — needs conformance drone)'),
    '- Walk evidence: ' + (rich.evidence ? 'present' : '(EMPTY — needs walk drone)'),
  ];
  // Feature / task build slots — only listed when present, so a bug case file stays lean.
  if (cf.intent && cf.intent.intent) lines.push('- Intent: ' + cf.intent.intent);
  if (cf.design && cf.design.design) lines.push('- Design: ' + cf.design.design);
  if (cf.acceptance && Array.isArray(cf.acceptance.criteria)) lines.push('- Acceptance: ' + cf.acceptance.criteria.join(' | '));
  if (cf.breakdown && Array.isArray(cf.breakdown.steps)) lines.push('- Steps: ' + cf.breakdown.steps.join(' | ') + (cf.breakdown.doneWhen ? ' (done when: ' + cf.breakdown.doneWhen + ')' : ''));
  if (cf.audit) lines.push('- Last audit: cycle ' + (cf.audit.cycle || 1) + ' -> ' + cf.audit.verdict + (cf.audit.nextDig ? ' (gap: ' + (cf.audit.nextDig.scope || cf.audit.nextDig.why || '') + ')' : ''));
  return lines.join('\n');
}

// Extract the LAST fenced ```json block (a drone may show a schema example then the real one);
// fall back to the last balanced {...}. Returns a parsed object or null (degrade, never throw).
function extractJsonBlock(text) {
  if (!text) return null;
  const fences = [...String(text).matchAll(/```json\s*([\s\S]*?)```/gi)];
  let raw = fences.length ? fences[fences.length - 1][1] : null;
  if (raw == null) { const i = String(text).lastIndexOf('{'); if (i >= 0) raw = String(text).slice(i); }
  if (raw == null) return null;
  raw = raw.trim();
  try { return JSON.parse(raw); } catch (_) {}
  try { const end = raw.lastIndexOf('}'); if (end > 0) return JSON.parse(raw.slice(0, end + 1)); } catch (_) {}
  return null;
}

// Write a scoped drone's parsed evidence into its OWNING caseFile slot (overwrite, not append) AND
// post one short thread comment — single read/modify/write. Best-effort; never throws.
function recordScopedResult(id, task, spec, parsed, job, resultText) {
  try {
    const st = readState(); const t = st[id]; if (!t) return;
    const ts = new Date().toISOString();
    t.caseFile = t.caseFile || {};
    if (parsed) {
      const f = parsed.findings || {};
      const meta = { ts, model: job.model, confidence: parsed.confidence || null, openQuestions: parsed.openQuestions || [], unmappedTerritory: parsed.unmappedTerritory || [] };
      if (task === 'root-cause') t.caseFile.rootCause = Object.assign({}, f, meta);
      else if (task === 'locate-surface') t.caseFile.surface = Object.assign({}, f, meta);
      else if (task === 'fix-proposal') t.caseFile.fix = Object.assign({}, f, meta);
      else if (task === 'conformance') t.caseFile.conformance = Object.assign({}, f, meta);
      else if (task === 'intent') t.caseFile.intent = Object.assign({}, f, meta);
      else if (task === 'design') t.caseFile.design = Object.assign({}, f, meta);
      else if (task === 'acceptance') t.caseFile.acceptance = Object.assign({}, f, meta);
      else if (task === 'breakdown') t.caseFile.breakdown = Object.assign({}, f, meta);
      else if (task === 'auditor') t.caseFile.audit = { ts, model: job.model, verdict: parsed.verdict || null, nextDig: parsed.nextDig || null, slots: parsed.slots || {}, merged: parsed.merged || '', cycle: parsed.cycle || 1, caveats: parsed.caveats || [] };
    }
    const telem = [job.turns != null ? job.turns + ' turns' : null, job.durationMs != null ? (job.durationMs / 60000).toFixed(1) + ' min' : null].filter(Boolean).join(' · ');
    const head = '**' + spec.label + ' drone — ' + job.model + (telem ? ' · ' + telem : '') + '**';
    const note = parsed ? ' -> filled ' + spec.slot : ' -> could not parse structured output; raw below';
    const detail = parsed ? scopedSummary(task, parsed) : '\n\n' + (resultText || '(no output)').slice(0, 4000);
    t.thread.push({ author: 'cc', text: head + note + (detail ? (parsed ? '\n\n' + detail : detail) : ''), ts });
    t.lastActivity = ts;
    writeState(st);
    // (d) AUTO-LOG — after the slot lands, auto-create linked sub-tickets for qualifying NEW findings
    // (no-op when policy.autoWrite is false; honors per-investigation cap, day-cap, dedupe-skip).
    if (parsed && Array.isArray(parsed.unmappedTerritory) && parsed.unmappedTerritory.length) {
      try { autoLogTrigger(id, parsed.unmappedTerritory, parsed.confidence, (t.caseFile.spinoffLogged || [])); } catch (_) {}
    }
  } catch (_) {}
}

// System-audit drone prompt — ruthless, read-only, whole-app, three lenses (see CASE-FILE-REDESIGN.md §8/#8).
const SYSTEM_AUDIT_PROMPT = [
  'You are the SYSTEM AUDITOR for slyght — a ruthless, READ-ONLY health audit across the WHOLE app, not one ticket.',
  'slyght is a single-file PWA (index.html ~24k lines; global S persisted to localStorage slyght_v5; BRAIN bubbles are the canonical writers; S._auditLog is forensic truth; a Cloudflare Worker + KV back push/sync).',
  'Report findings in ASSUMPTION-SHAPE with file:line evidence. Enumerate, never estimate counts. Do NOT edit files. Audit THREE lenses:',
  '',
  '1. CLOUD-SYNC INTEGRITY — does state actually persist + sync? Trace the push/pull paths (worker-KV, any gist/sync engine), the keepalive/pagehide push, and whether derived state can drift from the synced source. Flag any path where a save can silently fail to sync (cite file:line).',
  '2. STORY COHERENCE (cross-surface) — does every number tell ONE consistent story across surfaces? Find the same value computed two ways (parallel calcs that drift), surfaces reading stale snapshots, or a figure shown differently in two places (FR-06/FR-07 class). Cite the divergent readers file:line.',
  '3. FINANCIAL <-> AI-LAYER <-> JARVIS — do the three reconcile? The financial truth (S.txns ledger), the in-app AI layer (its update_balance / advice), and Jarvis (this cockpit). Flag where the AI layer can write a number the ledger does not back, or where the cockpit diverges from the app truth.',
  '',
  'End with EXACTLY ONE fenced code block tagged json: {"lenses":{"cloudSync":{"verdict":"ok|risk|broken","findings":["file:line — what"]},"storyCoherence":{"verdict":"...","findings":[...]},"financialAiJarvis":{"verdict":"...","findings":[...]}},"topRisks":[{"what":"...","where":"file:line","why":"..."}],"summary":"one paragraph"}',
].join('\n');

// Persist a drafted agent spec (from designAgent's Opus drone) to a fixed file. Best-effort.
function recordAgentDraft(resultText, job) {
  try {
    const parsed = extractJsonBlock(resultText);
    const abs = jail(path.join('mission-control', 'agent-drafts.json'));
    let arr = []; try { arr = JSON.parse(fs.readFileSync(abs, 'utf8')); } catch (_) {}
    if (!Array.isArray(arr)) arr = [];
    arr.push({ ts: new Date().toISOString(), model: (job && job.model) || null, draft: parsed || null, raw: String(resultText || '').slice(0, 4000) });
    if (arr.length > 50) arr = arr.slice(-50);
    fs.writeFileSync(abs, JSON.stringify(arr, null, 2));
  } catch (_) {}
}
// Persist the latest system audit (jail()'d to one fixed file). Best-effort; never throws.
function recordSystemAudit(resultText, job) {
  try {
    const parsed = extractJsonBlock(resultText);
    const rec = { ts: new Date().toISOString(), turns: (job && job.turns) || null, model: (job && job.model) || null, parsed: parsed || null, raw: String(resultText || '').slice(0, 20000) };
    fs.writeFileSync(jail(path.join('mission-control', 'system-audit.json')), JSON.stringify(rec, null, 2));
  } catch (_) {}
}

// ── Autonomous triage helpers ────────────────────────────────────────────────
const TRIAGE_FILE = path.join('mission-control', 'triage-report.json');
function writeTriageReport(rec) { try { fs.writeFileSync(jail(TRIAGE_FILE), JSON.stringify(rec, null, 2)); } catch (_) {} }
const CLUSTER_FILE = path.join('mission-control', 'cluster-report.json');
function writeClusterReport(rec) { try { fs.writeFileSync(jail(CLUSTER_FILE), JSON.stringify(rec, null, 2)); } catch (_) {} }

// Assemble the compact TICKET WORLD brief for the triage commander — the bridge that lets a drone
// reason about the whole backlog (which a per-ticket drone cannot see), then point it at the on-disk
// grounding docs. Backlog snapshot + open-bugs digest + recent session. See AUTONOMOUS-TRIAGE.md §2.
function buildTriageContext() {
  const all = mergedTickets().tickets || [];
  const open = all.filter(t => !(t.state && t.state.status === 'Shipped'));
  const slotState = (cf) => {
    cf = cf || {}; const has = [];
    if (cf.rootCause && cf.rootCause.rootCause) has.push('root');
    if (cf.surface && cf.surface.surface) has.push('surface');
    if (cf.fix && cf.fix.fix) has.push('fix');
    if (cf.conformance && cf.conformance.driftVerdict) has.push('conf');
    if (cf.audit && cf.audit.verdict) has.push('audit:' + cf.audit.verdict);
    return has.length ? has.join('+') : 'EMPTY';
  };
  const ageOf = (t) => { const o = t.state && t.state.opened; return o ? Math.round((Date.now() - new Date(o)) / 86400000) + 'd' : '?'; };
  const SEV = { P0: 0, P1: 1, P2: 2 };
  const backlog = open
    .slice().sort((a, b) => (SEV[a.severity] != null ? SEV[a.severity] : 3) - (SEV[b.severity] != null ? SEV[b.severity] : 3))
    .map(t => `${t.id} · ${t.severity || '?'} · ${(t.state && t.state.status) || 'Open'} · ${t.group || '—'} · case[${slotState(t.caseFile)}] · ${ageOf(t)} — ${String(t.title || '').slice(0, 80)}`)
    .join('\n');
  let bugs = '';
  try { bugs = fs.readFileSync(jail('OPEN-BUGS.md'), 'utf8').split('\n').slice(0, 50).join('\n'); } catch (_) {}
  let session = '';
  try {
    const dir = jail(path.join('docs', 'sessions'));
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'))
      .map(f => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.m - a.m);
    if (files.length) session = files[0].f + '\n' + fs.readFileSync(path.join(dir, files[0].f), 'utf8').split('\n').slice(0, 30).join('\n');
  } catch (_) {}
  return { open, backlog, bugs, session };
}

// The Triage Commander prompt — Jarvis's brain for the WHOLE backlog. Opus, read-only.
function triageCommanderPrompt(ctx) {
  return [
    'You are JARVIS — John\'s engineering chief of staff for slyght, running an AUTONOMOUS TRIAGE of his entire ticket backlog. John just asked: "what are my issues?" Read the backlog, ground yourself in the architecture + the financial contract + the live state, decide which tickets are the REAL issues right now, rank them, and pick the top few to investigate immediately. You COMMAND drones; you never edit code.',
    '',
    'slyght is a single-file PWA (index.html ~24k lines; global S persisted to localStorage.slyght_v5; BRAIN bubbles are the canonical writers; S._auditLog is forensic truth; a Cloudflare Worker + KV back push/sync). It is John\'s PERSONAL finance coach — ONE user. Judge issues by "does this hurt John daily or risk his money?", never by elegance.',
    '',
    'GROUND YOURSELF — read these on disk as needed (you have the Read tool; cwd is the repo root):',
    '  • ARCHITECTURE.md — the system shape',
    '  • FINANCIAL-INVARIANTS.md — the contract the app MUST satisfy (INV-NN). A ticket that breaks an invariant ranks HIGH.',
    '  • FEATURE-MAP.md — surfaces, canonical writers, state fields',
    '  • OPEN-BUGS.md — the known-broken list (digest below; read the full file for detail)',
    '  • docs/PIPELINE.md — how work is judged (Ledger Walk is Step 0: S.txns are truth, flags are derived)',
    '  • state-snapshot.json — John\'s LIVE state S (the actual numbers). For any money ticket, the ledger is truth.',
    '',
    'Discipline: plain English (John is a visual learner — no jargon, real names not categories), ground claims in file:line where you can, and for any money issue remember S.txns are truth, not derived flags. Be decisive and honest; push back on noise; do not pad the list.',
    '',
    '## THE BACKLOG (Mission Control ticket world — what you cannot see from disk)',
    'Format:  ID · severity · status · surface · case[evidence already gathered] · age — title',
    ctx.backlog || '(no open tickets)',
    '',
    '## OPEN-BUGS.md (digest — read the full file for detail)',
    ctx.bugs || '(none)',
    '',
    '## WHERE THE LAST SESSION LEFT OFF',
    ctx.session || '(no session notes found)',
    '',
    '## YOUR JOB',
    'Rank the real issues. For each, give: WHY it is a real issue and why it ranks there (plain English); its severity; your confidence; which scoped drone should investigate it FIRST (root-cause | locate-surface | fix-proposal | conformance | build); and ONE sentence of what John should LEARN from it. Then pick the top ≤3 highest-leverage tickets to investigate NOW (where a drone sweep will actually move things) → investigateNow. Real-but-not-now tickets go on the watchlist.',
    '',
    'End with EXACTLY ONE fenced code block tagged json:',
    '{"summaryForJohn":"2-3 plain-English sentences on the shape of the backlog right now","issues":[{"ticketId":"SLY-N","why":"...","severity":"P0|P1|P2","confidence":"high|medium|low","recommendedDrone":"root-cause|locate-surface|fix-proposal|conformance|build","learnForJohn":"one sentence"}],"investigateNow":["SLY-N"],"watchlist":["SLY-M"]}',
  ].join('\n');
}

// Persist the commander's plan to triage-report.json AND auto-dispatch sweepCase on the top
// investigateNow ids (cap 3, validated). The plan DECIDES; the proven converging sweep EXECUTES.
function recordTriagePlan(resultText, job) {
  const parsed = extractJsonBlock(resultText);
  const dispatched = [];
  try {
    if (parsed && Array.isArray(parsed.investigateNow)) {
      const valid = new Set((mergedTickets().tickets || []).map(t => t.id));
      parsed.investigateNow
        .filter(id => /^SLY-\d+$/.test(id) && valid.has(id)).slice(0, 3)
        .forEach(id => { try { if (sweepCase(id).ok) dispatched.push(id); } catch (_) {} });
    }
  } catch (_) {}
  writeTriageReport({
    ts: new Date().toISOString(),
    status: 'complete',
    model: (job && job.model) || null,
    turns: (job && job.turns) || null,
    plan: parsed || null,
    dispatched,                                       // ids we actually kicked sweeps on
    raw: parsed ? null : String(resultText || '').slice(0, 8000),
  });
}

// Post the execute-fix drone's result into the ticket + advance Aligned → Investigating (CC is on it).
// Flag the fix as implemented so the next-action becomes "walk it in the sandbox to confirm".
function recordExecuteFix(id, resultText, job) {
  try {
    const st = readState(); const t = st[id]; if (!t) return;
    t.thread.push({ author: 'cc', text: '**Execute-fix drone (main worktree) — ' + ((job && job.model) || '') + '**\n\n' + (resultText || '(no output)').slice(0, 9000), ts: new Date().toISOString() });
    t.caseFile = t.caseFile || {};
    t.caseFile.fixImplemented = { ts: new Date().toISOString(), worktree: true };
    delete t.caseFile.sandbox;   // a fresh implementation invalidates any prior sandbox verdict
    if (t.status === 'Aligned') { t.status = 'Investigating'; t.assignee = 'cc'; logTransition(id, 'Aligned', 'Investigating', 'cc'); }
    t.lastActivity = new Date().toISOString(); writeState(st);
  } catch (_) {}
}
// Record the sandbox-confirm verdict (PASS/FAIL) on the ticket caseFile + post the report.
function recordSandboxConfirm(id, resultText, job) {
  try {
    const parsed = extractJsonBlock(resultText);
    const st = readState(); const t = st[id]; if (!t) return;
    t.caseFile = t.caseFile || {};
    t.caseFile.sandbox = parsed
      ? Object.assign({ ts: new Date().toISOString(), model: job && job.model }, parsed)
      : { ts: new Date().toISOString(), verdict: 'FAIL', reason: 'could not parse the sandbox drone output', raw: String(resultText || '').slice(0, 4000) };
    const v = t.caseFile.sandbox.verdict;
    t.thread.push({ author: 'cc', text: '**Sandbox confirm — ' + (v || '?') + '**\n\n' + (parsed ? (parsed.reason || '') : String(resultText || '').slice(0, 1500)), ts: new Date().toISOString() });
    t.lastActivity = new Date().toISOString(); writeState(st);
  } catch (_) {}
}
// Store the UX drone's review on the ticket caseFile + post the summary. Best-effort.
function recordUxReview(id, resultText, job) {
  try {
    const parsed = extractJsonBlock(resultText);
    const st = readState(); const t = st[id]; if (!t) return;
    t.caseFile = t.caseFile || {};
    t.caseFile.uxReview = parsed
      ? Object.assign({ ts: new Date().toISOString(), model: job && job.model }, parsed)
      : { ts: new Date().toISOString(), summary: 'could not parse the UX drone output', raw: String(resultText || '').slice(0, 4000) };
    const ux = t.caseFile.uxReview;
    const fnd = Array.isArray(ux.findings) ? ux.findings : [];
    const body = (parsed
      ? (ux.summary || '') + (ux.glitch ? '\n\n**Glitch:** ' + ux.glitch : '') + (fnd.length ? '\n\n' + fnd.map(f => '- **' + (f.severity || '?') + '** ' + (f.issue || '') + (f.cause ? ' (' + f.cause + ')' : '') + (f.fix ? ' → ' + f.fix : '')).join('\n') : '')
      : String(resultText || '').slice(0, 1500));
    t.thread.push({ author: 'cc', text: '**UX review** (frontend-design discipline)\n\n' + body, ts: new Date().toISOString() });
    t.lastActivity = new Date().toISOString(); writeState(st);
  } catch (_) {}
}
// Store the cockpit-wide UX audit (visual-consistency pass) to ux-audit.json. Best-effort.
function recordUxAudit(resultText, job) {
  try {
    const parsed = extractJsonBlock(resultText);
    const out = parsed
      ? Object.assign({ ts: new Date().toISOString(), model: job && job.model }, parsed)
      : { ts: new Date().toISOString(), summary: 'could not parse the UX audit output', raw: String(resultText || '').slice(0, 8000) };
    fs.writeFileSync(jail(path.join('mission-control', 'ux-audit.json')), JSON.stringify(out, null, 2));
  } catch (_) {}
}
// Store the code-alignment audit verdict on the ticket caseFile + post the summary. Best-effort.
function recordCodeAudit(id, resultText, job) {
  try {
    const parsed = extractJsonBlock(resultText);
    const st = readState(); const t = st[id]; if (!t) return;
    t.caseFile = t.caseFile || {};
    t.caseFile.codeAudit = parsed
      ? Object.assign({ ts: new Date().toISOString(), model: job && job.model }, parsed)
      : { ts: new Date().toISOString(), raw: String(resultText || '').slice(0, 4000) };
    t.thread.push({ author: 'cc', text: '**Code-alignment audit — ' + ((parsed && parsed.verdict) || '?') + '**\n\n' + (parsed ? (parsed.summary || '(see verdict on the ticket)') : String(resultText || '').slice(0, 1500)), ts: new Date().toISOString() });
    t.lastActivity = new Date().toISOString(); writeState(st);
  } catch (_) {}
}
// Store the composed resolution (dual narrative) on the ticket caseFile + post the story to the thread.
function recordResolution(id, resultText, job) {
  try {
    const parsed = extractJsonBlock(resultText);
    const st = readState(); const t = st[id]; if (!t) return;
    t.caseFile = t.caseFile || {};
    t.caseFile.resolution = parsed
      ? Object.assign({ ts: new Date().toISOString(), model: job && job.model }, parsed)
      : { ts: new Date().toISOString(), raw: String(resultText || '').slice(0, 4000) };
    t.thread.push({ author: 'jarvis', text: '**Resolution composed**\n\n' + (parsed ? (parsed.story || '(see the resolution on the ticket)') : String(resultText || '').slice(0, 1500)), ts: new Date().toISOString() });
    t.lastActivity = new Date().toISOString(); writeState(st);
  } catch (_) {}
}
// Store Jarvis's organize suggestion on the ticket caseFile + post a short comment. Best-effort.
function recordOrganize(id, resultText, job) {
  try {
    const parsed = extractJsonBlock(resultText);
    const st = readState(); const t = st[id]; if (!t) return;
    t.caseFile = t.caseFile || {};
    t.caseFile.organize = parsed ? Object.assign({ ts: new Date().toISOString() }, parsed) : { ts: new Date().toISOString(), raw: String(resultText || '').slice(0, 2000) };
    t.thread.push({ author: 'jarvis', text: '**Jarvis — organize suggestion**\n\n' + (parsed ? (parsed.reasoning || '(see suggestions on the ticket)') : String(resultText || '').slice(0, 1500)), ts: new Date().toISOString() });
    t.lastActivity = new Date().toISOString(); writeState(st);
  } catch (_) {}
}
// (b) Server mirror of the client ticketReady() — the readiness contract, enforced at the align edge.
// case-backed (a proposed fix or a COMPLETE case) + questions-answered (0 open) + findings-logged (no
// un-logged unmappedTerritory). Shapes match the caseFile slots written by the scoped drones.
function ticketReadyServer(t) {
  const cf = (t && t.caseFile) || {};
  const caseBacked = !!(cf.fix && cf.fix.fix) || ((cf.audit && cf.audit.verdict) === 'COMPLETE');
  let openQ = 0;
  ['rootCause', 'surface', 'fix', 'conformance', 'intent', 'design', 'acceptance'].forEach(k => { const s = cf[k]; if (s && Array.isArray(s.openQuestions)) openQ += s.openQuestions.length; });
  const logged = cf.spinoffLogged || []; const find = new Set();
  ['rootCause', 'surface', 'fix', 'conformance'].forEach(k => { const s = cf[k]; if (!s) return; (s.unmappedTerritory || []).forEach(v => { const x = (typeof v === 'string' ? v : JSON.stringify(v)).trim(); if (x && !logged.includes(x)) find.add(x); }); });
  const missing = [];
  if (!caseBacked) missing.push('no proposed fix / complete case');
  if (openQ) missing.push(openQ + ' open question(s)');
  if (find.size) missing.push(find.size + ' unlogged finding(s)');
  return { ready: missing.length === 0, missing, caseBacked, openQ, unlogged: find.size };
}
// (c) Persist the semantic cluster pass → cluster-report.json. Validates ids against the live spine, drops
// empty/self groups. Preserves the `reviewed` flag across runs: the FIRST ever run is dry-run (propose-only);
// once John marks it reviewed, that and later runs are review-then-merge. The merge itself is always his click.
function recordClusterReport(resultText, job) {
  const parsed = extractJsonBlock(resultText);
  let prevReviewed = false;
  try { prevReviewed = !!JSON.parse(fs.readFileSync(jail(CLUSTER_FILE), 'utf8')).reviewed; } catch (_) {}
  const valid = new Set(mergedTickets().tickets.map(t => t.id));
  const groups = ((parsed && Array.isArray(parsed.groups)) ? parsed.groups : [])
    .map(g => ({
      survivor: g.survivor,
      dupes: [...new Set((Array.isArray(g.dupes) ? g.dupes : []).filter(x => /^SLY-\d+$/.test(x) && x !== g.survivor && valid.has(x)))],
      reason: String(g.reason || '').slice(0, 200),
    }))
    .filter(g => /^SLY-\d+$/.test(g.survivor) && valid.has(g.survivor) && g.dupes.length);
  writeClusterReport({
    ts: new Date().toISOString(),
    model: (job && job.model) || 'opus',
    groups,
    realCount: (parsed && parsed.realCount) || null,
    reviewed: prevReviewed,
    dryRun: !prevReviewed,
    raw: parsed ? null : String(resultText || '').slice(0, 4000),
  });
}
// (d) AUTO-LOG — heuristic classifier + scanner + dry-run, all behind a policy file. Drones never
// auto-write tickets unless autoWrite:true (you flip it after reviewing the dry-run list). The classifier
// is heuristic by design — no per-finding drone spend; transparent rules John can see and tune.
const AUTO_LOG_FILE = path.join('mission-control', 'auto-log-dryrun.json');
const AUTO_LOG_POLICY_FILE = path.join('mission-control', 'auto-log-policy.json');
const AUTO_LOG_POLICY_DEFAULT = { confidenceMin: 'high', severityMin: 'P1', perInvestigationCap: 3, dayCap: 10, autoWrite: false };
function getAutoLogPolicy() {
  try { return Object.assign({}, AUTO_LOG_POLICY_DEFAULT, JSON.parse(fs.readFileSync(jail(AUTO_LOG_POLICY_FILE), 'utf8'))); }
  catch (_) { return Object.assign({}, AUTO_LOG_POLICY_DEFAULT); }
}
const autoLogDayCounts = {};   // YYYY-MM-DD → count; in-memory (resets on restart — day-cap is soft)
function autoLogClassify(text) {
  const s = String(text || '');
  const hasFileLine = /\b[\w/.-]+\.(js|html|css|ts|json|md):\d+\b/.test(s);
  const hasSymbol = /\b(?:BRAIN|MODEL|SNAPSHOTS|S)\.\w+/.test(s) || /\b[a-z][a-zA-Z0-9_]{4,}\(/.test(s);
  const isShort = s.length < 30;
  const confidence = (hasFileLine || hasSymbol) ? 'high' : isShort ? 'low' : 'med';
  const sl = s.toLowerCase();
  let severity = 'P2';
  if (/\b(?:p0|critical|corrupt|silent|overshoot|race condition|data loss|invariant|fr-0[1-9])\b/.test(sl)) severity = 'P0';
  else if (/\b(?:p1|wrong|broken|fails?|bypass|cap|overflow|leak|drift|stale|gap|missing|orphan|stuck)\b/.test(sl)) severity = 'P1';
  return { confidence, severity };
}
function autoLogDedupe(findingText, openTickets) {
  const tokenize = s => new Set(String(s || '').toLowerCase().match(/\b[a-z][a-z0-9-]{3,}\b/g) || []);
  const ft = tokenize(findingText); if (ft.size < 3) return null;
  let best = null, bestScore = 0;
  for (const t of openTickets) {
    const tt = tokenize((t.title || '') + ' ' + (t.summary || '')); if (tt.size < 3) continue;
    let intersect = 0; ft.forEach(w => { if (tt.has(w)) intersect++; });
    const score = intersect / Math.min(ft.size, tt.size);
    if (score > bestScore) { bestScore = score; best = t.id; }
  }
  return bestScore >= 0.4 ? best : null;
}
function autoLogScanCandidates(policy) {
  const all = mergedTickets().tickets;
  const open = all.filter(t => !(t.state && t.state.status === 'Shipped') && t.type !== 'epic');
  const candidates = [];
  const perParentCount = {}; let dailyCount = 0;
  for (const parent of open) {
    const cf = parent.caseFile || {}; const logged = cf.spinoffLogged || [];
    const findings = new Set();
    ['rootCause', 'surface', 'fix', 'conformance'].forEach(k => { const slot = cf[k]; if (!slot) return; (slot.unmappedTerritory || []).forEach(v => { const x = (typeof v === 'string' ? v : JSON.stringify(v)).trim(); if (x && !logged.includes(x)) findings.add(x); }); });
    for (const text of findings) {
      const c = autoLogClassify(text);
      const dedupeId = autoLogDedupe(text, open.filter(o => o.id !== parent.id));
      const sevOk = ['P0', 'P1'].includes(c.severity);
      const confOk = c.confidence === 'high';
      const capOk = (perParentCount[parent.id] || 0) < policy.perInvestigationCap;
      const dayOk = dailyCount < policy.dayCap;
      let action, reason;
      if (dedupeId) { action = 'attach-as-related'; reason = 'dedupes to ' + dedupeId + ' (similarity ≥ 0.4)'; }
      else if (!sevOk) { action = 'skip'; reason = 'severity ' + c.severity + ' < ' + policy.severityMin; }
      else if (!confOk) { action = 'skip'; reason = 'confidence ' + c.confidence + ' < ' + policy.confidenceMin; }
      else if (!capOk) { action = 'skip-cap'; reason = 'per-investigation cap (' + policy.perInvestigationCap + ') reached on ' + parent.id; }
      else if (!dayOk) { action = 'skip-cap'; reason = 'daily cap (' + policy.dayCap + ') reached'; }
      else { action = 'AUTO-LOG'; reason = 'qualifies'; perParentCount[parent.id] = (perParentCount[parent.id] || 0) + 1; dailyCount++; }
      candidates.push({ parentId: parent.id, parentTitle: String(parent.title || '').slice(0, 60), text: text.slice(0, 220), confidence: c.confidence, severity: c.severity, dedupeMatchId: dedupeId, action, reason });
    }
  }
  return candidates;
}
// (d) AUTO-LOG TRIGGER — called from recordScopedResult after a scoped drone's findings land.
// Classifies each NEW unmappedTerritory item, applies the policy (sev≥P1 + conf=high + dedupe + cap),
// and fires createTicket for the qualifiers. Honors the drone's own overall confidence (low → skip all).
// Dedupe match → SKIP (the finding is already tracked elsewhere); future polish can promote dedupe to
// "attach-as-related" by adding a link from the hit ticket. Day-cap counted in-memory across the process.
function autoLogTrigger(parentId, unmappedItems, droneConfidence, loggedAlready) {
  const policy = getAutoLogPolicy(); if (!policy.autoWrite) return { fired: 0 };
  const all = mergedTickets().tickets;
  const parent = all.find(t => t.id === parentId); if (!parent) return { fired: 0 };
  const open = all.filter(t => !(t.state && t.state.status === 'Shipped') && t.type !== 'epic' && t.id !== parentId);
  const today = new Date().toISOString().slice(0, 10);
  autoLogDayCounts[today] = autoLogDayCounts[today] || 0;
  const created = []; let perParent = 0;
  for (const raw of (unmappedItems || [])) {
    const text = String(raw || '').trim(); if (!text || loggedAlready.includes(text)) continue;
    const c = autoLogClassify(text);
    const effConf = droneConfidence === 'low' ? 'low' : c.confidence;   // a low-confidence drone taints all findings
    if (!['P0', 'P1'].includes(c.severity)) continue;
    if (effConf !== 'high') continue;
    if (perParent >= policy.perInvestigationCap) break;
    if (autoLogDayCounts[today] >= policy.dayCap) break;
    if (autoLogDedupe(text, open)) continue;   // already tracked elsewhere
    const title = text.split(/[.\n]/)[0].slice(0, 120);
    try {
      const r = ACTIONS.createTicket({ title, summary: text, severity: c.severity, type: 'bug', surface: parent.group || null, epic: parent.epic || null, parent: parentId, spinoffText: text });
      if (r && r.ok && r.id) { created.push(r.id); perParent++; autoLogDayCounts[today]++; }
    } catch (_) {}
  }
  if (created.length) {
    // post a note on the parent thread so John sees what auto-logged
    try {
      const st = readState(); const t = st[parentId]; if (t) {
        t.thread = t.thread || []; t.thread.push({ author: 'jarvis', text: '🤖 **Auto-logged ' + created.length + ' sub-finding(s)** (policy: sev≥' + policy.severityMin + ' + conf=' + policy.confidenceMin + '): ' + created.join(', '), ts: new Date().toISOString() });
        t.lastActivity = new Date().toISOString(); writeState(st);
      }
    } catch (_) {}
  }
  return { fired: created.length, created };
}
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// BRIEFING CHAT — Phase 1 — the conversational front door over the built engine room.
// State: briefing-chat.json (persisted multi-turn). Engine: one Claude call per turn with Discuss
// threading + Triage Commander context + an action-plan output schema. Executor: validates names
// against a LOW-risk allowlist (Phase 1) and strips/blocks high-risk names server-side regardless
// of what Claude emits (defense in depth — Phase 2 routes high-risk to a typed-CONFIRM card).
const BRIEFING_CHAT_FILE = path.join('mission-control', 'briefing-chat.json');
// Low-risk actions Jarvis may fire DIRECTLY from a chat turn. Read-only or recoverable/proposal-style.
// Phase 3 widens to include single-field metadata edits (setMeta), policy reversals (autoLogDisable),
// and review-state flips (clusterReviewed) — all recoverable per-call, no destructive cascades.
const LOW_RISK_CHAT_ALLOWLIST = new Set(['triageWorkload', 'jarvisOrganize', 'createTicket', 'jarvisAskAll', 'autoLogDryRun', 'clusterBacklog', 'setMeta', 'autoLogDisable', 'clusterReviewed', 'setBlockedBy']);
// High-risk names — routed to a PENDING_CONFIRM card requiring John's typed CONFIRM. Claude NEVER
// sets confirm:true here (stripped server-side regardless). Includes EITHER destructive writes OR
// token-spending multi-step drone fires that produce an artifact (John 2026-05-28: dispatchDrone-tier
// belongs here — not destructive, but real work + spend → the right friction is typed CONFIRM).
const HIGH_RISK_CHAT_NAMES = new Set([
  'mergeTickets', 'executeFixOnMain', 'alignHandoff', 'autoLogEnable', 'markReadyToShip', 'deleteTicket', 'doExecuteWithPush',
  'dispatchCC', 'dispatchScoped', 'buildCase', 'composeResolution', 'designAgent', 'uxAudit',
]);
function readBriefingChat() {
  try { return JSON.parse(fs.readFileSync(jail(BRIEFING_CHAT_FILE), 'utf8')); }
  catch (_) { return { ts: new Date().toISOString(), turns: [] }; }
}
function writeBriefingChat(c) { try { fs.writeFileSync(jail(BRIEFING_CHAT_FILE), JSON.stringify(c, null, 2)); } catch (_) {} }
// Build the chat-engine prompt — Discuss-thread threading + Triage Commander's backlog/architecture
// /invariants/ledger context + the strict action-plan output schema. Naming-only: no free-form code.
function buildBriefingChatPrompt(userMessage, thread) {
  const all = mergedTickets().tickets;
  const open = all.filter(t => t.type !== 'epic' && !(t.state && t.state.status === 'Shipped'));
  const backlog = open.map(t => `${t.id} [${t.severity} ${(t.state && t.state.status) || '?'} ${t.group || '?'}] ${String(t.title || '').slice(0, 90)}`).join('\n').slice(0, 7000);
  let triageCtx = '(no triage report yet — call triageWorkload to refresh)';
  try { const p = JSON.parse(fs.readFileSync(jail(TRIAGE_FILE), 'utf8')); if (p && p.plan) triageCtx = JSON.stringify(p.plan).slice(0, 3000); } catch (_) {}
  const history = (thread || []).slice(-10).map(t => `${(t.author || 'system').toUpperCase()}: ${String(t.text || '').slice(0, 400)}`).join('\n\n').slice(0, 3500);
  return [
    'You are JARVIS — the conversational front door for John\'s Mission Control cockpit. The engine room is built (every drone, ACTIONS + /api/action + token + allowlist + confirm gates, the Discuss-thread pattern, the Triage Commander\'s context, the record* post-back paths). You conduct the fleet through plain-English conversation. You NAME actions; the executor fires them.',
    '',
    '## YOUR ALLOWED ACTIONS THIS PHASE (low-risk — fire on your call)',
    '- `triageWorkload` (args: {confirm:true}) — refresh Jarvis Triage (Opus reads backlog + ARCHITECTURE + INVARIANTS + live ledger). Slow (~minute). Use when John asks "what should I work on?" / "what matters?" / triage is stale.',
    '- `jarvisOrganize` (args: {id, confirm:true}) — suggest epic/bundle/related/closesWith for ONE ticket. Use when John asks to categorize a specific ticket.',
    '- `createTicket` (args: {title, summary, severity:"P0"|"P1"|"P2", type:"bug"|"feature"|"task"}) — log a new ticket. AUTO-ENRICHED on intake (surface guess + auto-organize fires). Use when John names a finding to log.',
    '- `jarvisAskAll` (args: {id, confirm:true}) — Jarvis answers every open question on a ticket in one threaded reply. Use when a ticket has open Qs blocking align.',
    '- `clusterBacklog` (args: {confirm:true}) — proposes dedupe merge groups (does NOT auto-merge — John reviews + clicks). Use when John asks to dedupe / "what\'s a dupe of what?"',
    '- `autoLogDryRun` (args: {confirm:true}) — scans for auto-loggable sub-findings, shows the list (no writes). Use for "what would auto-log right now?"',
    '- `setMeta` (args: {id, field:"type"|"severity"|"dueDate"|"bundle"|"epic", value}) — edit ONE field on ONE ticket. Recoverable. Use for "bump SLY-30 to P0", "set SLY-3\'s epic to SLY-37", etc.',
    '- `setBlockedBy` (args: {id, ids:[]}) — set the dependency edges (which tickets block this one). Use for "SLY-5 is blocked by SLY-2".',
    '- `autoLogDisable` (args: {}) — turn auto-write OFF (safe reverse of the high-risk autoLogEnable). Use when John says "pause auto-log".',
    '- `clusterReviewed` (args: {}) — flip the cluster dry-run to reviewed (unlocks semantic merge-all). Use when John says "I\'ve reviewed the cluster proposals".',
    '',
    '## HIGH-RISK — TYPED-CONFIRM TIER (emit when right; John types CONFIRM in the card to fire)',
    'These actions route to a PENDING_CONFIRM card — John sees your proposed name+args+why, types CONFIRM (case-sensitive exact), then fires. EMIT them when they\'re the right move. NEVER set `confirm:true` — the executor strips it server-side regardless; only John\'s typed CONFIRM can set it.',
    '- `mergeTickets` (args: {into, from:[]}) — fold dupe tickets into a keeper. Use when John names a merge.',
    '- `dispatchScoped` (args: {id, task:"root-cause"|"locate-surface"|"fix-proposal"|"conformance"|"auditor"|"intent"|"design"|"acceptance"|"breakdown"}) — fire ONE scoped investigation drone. Use when John asks for evidence on a ticket ("dig into SLY-X", "find the root cause", "propose a fix for…").',
    '- `buildCase` (args: {id}) — fire the FULL parallel sweep (multiple scoped drones at once). Use when John asks for a full case on a ticket.',
    '- `composeResolution` (args: {id}) — Opus drafts the resolution text once the case is complete. Use only when audit verdict = COMPLETE.',
    '- `designAgent` (args: {desc}) — Opus designs a NEW scoped drone from John\'s description. Use only when John explicitly asks for a new agent.',
    '- `uxAudit` (args: {}) — cockpit visual-consistency audit (runs against the cockpit itself).',
    '- `executeFixOnMain` (args: {id}) — destructive: CC writer drone implements the fix on a worktree.',
    '- `alignHandoff` (args: {id, decision, force:true}) — bypasses the readiness gate (force-align).',
    '- `markReadyToShip` (args: {id}) — commits fix on main + moves to deploy queue.',
    '- `deleteTicket` (args: {id}) — tombstones a ticket.',
    '- `autoLogEnable` (args: {}) — turns auto-write ON (the (d) seatbelt off).',
    '',
    '## DISCIPLINE',
    '- Plain English in John\'s voice (no jargon). Title Case ticket titles.',
    '- Be decisive — if he asks "what matters", emit the triage fire. If he describes a bug, emit createTicket.',
    '- Ground claims in the backlog or triage below. Don\'t invent IDs.',
    '- One action per turn is usually right. Multi-action plans only when clearly indicated ("organize these 3").',
    '',
    '## OUTPUT — STRICT JSON, ONE FENCED BLOCK AT THE END',
    '```json',
    '{"reply":"plain-English reply (what you\'re doing + why)","actions":[{"name":"<actionName>","args":{...},"why":"plain-English: what this does"}]}',
    '```',
    'No actions? `actions: []`. Don\'t describe what you would do — emit it.',
    '',
    '## CURRENT BACKLOG (' + open.length + ' active)',
    backlog || '(empty)',
    '',
    '## LATEST JARVIS TRIAGE',
    triageCtx,
    '',
    '## CHAT HISTORY (last 10 turns)',
    history || '(start of conversation)',
    '',
    '## JOHN\'S NEW MESSAGE',
    String(userMessage || '').slice(0, 2000),
  ].join('\n');
}
// Sync-style wrapper around spawnDrone for the chat engine — awaits the drone result and resolves.
function claudeChatCall(prompt, mdl, budget, maxTurns) {
  return new Promise((resolve) => {
    const key = 'CHAT#' + Date.now();
    ccJobs[key] = { status: 'running', id: 'CHAT', task: 'chat', mode: 'gather', model: mdl || 'sonnet', started: Date.now() };
    spawnDrone({
      key, id: 'CHAT', task: 'chat', prompt,
      mode: 'gather', mdl: mdl || 'sonnet', rsn: 'off', budget: budget || '2', maxTurns: maxTurns || 4,
      onResult: ({ resultText }) => resolve(String(resultText || '')),
    });
  });
}
// Post a live-Jarvis reply into the thread as a 'jarvis' comment. Best-effort; never throws.
function postJarvisReply(id, resultText, job) {
  try {
    const st = readState(); const t = st[id]; if (!t) return;
    const reply = String(resultText || '').trim() || '(Jarvis returned no reply — try again or rephrase.)';
    t.thread.push({ author: 'jarvis', text: reply.slice(0, 9000), ts: new Date().toISOString() });
    t.lastActivity = new Date().toISOString();
    writeState(st);
  } catch (_) {}
}
// One- to three-line human summary of a parsed scoped result, for the thread comment.
function scopedSummary(task, parsed) {
  const f = parsed.findings || {};
  const files = Array.isArray(f.files) ? f.files.map(x => typeof x === 'string' ? x : (x.path + ':' + x.line)).join(', ') : '';
  if (task === 'root-cause') return (f.rootCause ? '**Root cause.** ' + f.rootCause : '') + (files ? '\n\n**Files:** ' + files : '');
  if (task === 'locate-surface') return f.surface ? '**Surface:** ' + f.surface + (f.mapStale ? ' (map stale)' : '') : '';
  if (task === 'fix-proposal') return f.fix ? '**Proposed fix.** ' + f.fix : '';
  if (task === 'conformance') return f.driftVerdict ? '**Conformance:** ' + f.driftVerdict + (f.notes ? ' — ' + f.notes : '') : '';
  if (task === 'intent') return f.intent ? '**Intent.** ' + f.intent : '';
  if (task === 'design') return f.design ? '**Design.** ' + f.design + (files ? '\n\n**Change sites:** ' + files : '') : '';
  if (task === 'acceptance') return Array.isArray(f.criteria) && f.criteria.length ? '**Acceptance criteria.**\n' + f.criteria.map(c => '- ' + c).join('\n') : '';
  if (task === 'breakdown') return Array.isArray(f.steps) && f.steps.length ? '**Steps.**\n' + f.steps.map((s, i) => (i + 1) + '. ' + s).join('\n') + (f.doneWhen ? '\n\n**Done when:** ' + f.doneWhen : '') : '';
  if (task === 'auditor') return '**Audit:** ' + (parsed.verdict || '?') + (parsed.nextDig ? ' — next: ' + (parsed.nextDig.drone || '') + ' (' + (parsed.nextDig.why || '') + ')' : '') + (parsed.merged ? '\n\n' + parsed.merged : '');
  return '';
}

// Overlay drone-gathered caseFile evidence onto the spine rich (FILLED slots only — never blanks).
function mergeRich(rich, cf) {
  const r = Object.assign({}, rich || {});
  const rc = (cf && cf.rootCause) || null;
  if (rc) {
    if (rc.rootCause) r.rootCause = rc.rootCause;
    if (rc.mechanism) r.mechanism = rc.mechanism;
    if (Array.isArray(rc.files) && rc.files.length) r.files = rc.files.map(x => typeof x === 'string' ? x : (x.path + ':' + x.line + (x.role ? ' — ' + x.role : '')));
  }
  if (cf && cf.fix && cf.fix.fix) r.fix = cf.fix.fix;
  return r;
}

// Spawn ONE headless claude drone (shared by scoped tasks; mirrors dispatchCC's proven spawn +
// UTF-8 chunk handling + telemetry/spend). onResult({job,resultText,code}) does the task-specific
// post-processing and must never throw into the exit handler.
function spawnDrone({ key, id, task, prompt, mode, mdl, rsn, budget, onResult, maxTurns, cwd }) {
  const runCwd = cwd || REPO;   // execute-fix runs in an isolated `main` worktree, not the cockpit branch
  const claudeBin = process.platform === 'win32' ? 'claude.cmd' : 'claude';   // bare name; droneEnv() puts its dir on PATH
  // 'gather' = read-only investigation that MUST emit its JSON as the final result, so it uses
  // 'default' mode (NOT plan — plan mode routes the substantive output into a plan artifact and the
  // result field becomes a sign-off, which loses our structured block). Edits are blocked outright.
  const isFix = mode === 'fix';
  const permMode = isFix ? 'acceptEdits' : (mode === 'gather' ? 'default' : 'plan');
  const disallow = isFix
    ? ['Bash(git push:*)', 'Bash(git push)']
    : ['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash(git push:*)', 'Bash(git push)'];   // gather/plan: read-only
  const args = ['-p', '--output-format', 'json', '--model', mdl, '--max-turns', String(maxTurns || 40), '--max-budget-usd', budget, '--permission-mode', permMode, '--disallowedTools', ...disallow];
  const child = process.platform === 'win32'
    ? spawn('cmd.exe', ['/c', claudeBin, ...args], { cwd: runCwd, env: droneEnv() })
    : spawn(claudeBin, args, { cwd: runCwd });
  child.stdin.write(prompt); child.stdin.end();
  const job = ccJobs[key] = { status: 'running', id, task, mode, model: mdl, reasoning: rsn, started: Date.now(), out: '', _chunks: [] };
  child.stdout.on('data', d => job._chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
  child.stderr.on('data', d => job._chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
  child.on('exit', code => {
    job.exit = code;
    job.out = Buffer.concat(job._chunks).toString('utf8'); job._chunks = null;
    let resultText = '', costUsd = null, numTurns = null, durationMs = null;
    try { const j = JSON.parse(job.out); resultText = j.result || j.text || ''; if (typeof j.total_cost_usd === 'number') costUsd = j.total_cost_usd; if (typeof j.num_turns === 'number') numTurns = j.num_turns; if (typeof j.duration_ms === 'number') durationMs = j.duration_ms; }
    catch (_) { resultText = job.out.slice(-4000); }
    job.result = resultText; job.cost = costUsd; job.turns = numTurns; job.durationMs = durationMs;
    job.status = code === 0 ? 'done' : 'failed';
    const led = recordSpend(id, costUsd, numTurns, durationMs);
    job.spend = led ? led.total_usd : null; job.spendCount = led ? led.count : null;
    try { if (onResult) onResult({ job, resultText, code }); } catch (_) {}
  });
  return job;
}

// Sweep registry (RUNTIME, in-memory) — ticket id -> { status, step, cycle, startedAt, finishedAt }.
const sweeps = {};
// server-side drone-name -> scoped task key ('' for walk/unknown — those aren't launchScoped tasks).
function taskKeyFromDroneServer(d) {
  d = String(d || '').toLowerCase();
  if (d.includes('root')) return 'root-cause';
  if (d.includes('surface') || d.includes('locate')) return 'locate-surface';
  if (d.includes('fix')) return 'fix-proposal';
  if (d.includes('conform')) return 'conformance';
  if (d.includes('intent')) return 'intent';
  if (d.includes('design')) return 'design';
  if (d.includes('accept')) return 'acceptance';
  if (d.includes('breakdown') || d.includes('steps')) return 'breakdown';
  return '';   // walk (manual) or unknown
}
// Build the scoped prompt + spawn ONE gather drone; record its evidence; then optionally chain
// (afterResult — used by the sweep). Returns {ok,key} or {ok:false,reason}.
function launchScoped(id, task, afterResult, opts) {
  opts = opts || {};
  const spec = SCOPED_TASKS[task];
  if (!spec) return { ok: false, reason: 'unknown scoped task: ' + task };
  const key = id + '#' + task;
  if (ccJobs[key] && ccJobs[key].status === 'running') return { ok: false, reason: 'a ' + spec.label + ' drone is already on ' + id };
  let handoff = '';
  try { handoff = fs.readFileSync(jail(path.join('mission-control', 'handoffs', id + '.md')), 'utf8'); } catch (_) {}
  const st0 = readState();
  const cf = (st0[id] && st0[id].caseFile) || {};
  const ticket = (mergedTickets().tickets || []).find(t => t.id === id);
  if (!ticket) return { ok: false, reason: 'no such ticket: ' + id };
  // Building a case is active work — lift an Open ticket out of Open so the status reflects it
  // (and Recommends moves it into "What you're working on"). Per John 2026-05-27.
  if (st0[id] && st0[id].status === 'Open') {
    st0[id].status = 'Gathering'; st0[id].assignee = 'cc'; st0[id].lastActivity = new Date().toISOString();
    logTransition(id, 'Open', 'Gathering', 'jarvis'); writeState(st0);
  }
  // Model policy: "Sonnet finds, Opus decides" — each scoped task carries its default model
  // (spec.model: gather/enumerate = sonnet, design/judge = opus); an explicit opts.model overrides.
  const mdl = (opts.model === 'opus' || opts.model === 'sonnet') ? opts.model : (spec.model || 'sonnet');
  const rsn = ['off', 'think', 'deep'].includes(opts.reasoning) ? opts.reasoning : (spec.reasoning || 'off');
  const budget = mdl === 'opus' ? '6' : '3';
  const prompt =
    (handoff ? handoff + '\n\n---\n' : '') +
    GATHER_PREAMBLE(id, caseFileDump(ticket, cf)) +
    '\n## YOUR SCOPED JOB — ' + spec.label + '\n' + spec.directive + REASON_SUFFIX_SC[rsn];
  spawnDrone({
    key, id, task, prompt, mode: 'gather', mdl, rsn, budget,
    onResult: ({ job, resultText }) => {
      const parsed = extractJsonBlock(resultText);
      recordScopedResult(id, task, spec, parsed, job, resultText);
      if (afterResult) { try { afterResult({ job, parsed }); } catch (_) {} }
    },
  });
  return { ok: true, key };
}
// The converging DAG, PER-TYPE (PIPELINES): bug = root-cause ∥ locate-surface -> fix -> conformance;
// feature = intent ∥ locate-surface -> design -> acceptance -> conformance; task = breakdown. Then the
// auditor; GAP -> ONE targeted re-dig -> auditor(2) -> done. A failed/skipped launch still advances the
// chain so it never stalls. Filled slots are SKIPPED (John's "only Dig, not Re-dig").
function sweepCase(id) {
  if (!/^SLY-\d+$/.test(id)) return { ok: false, reason: 'bad ticket id' };
  if (sweeps[id] && sweeps[id].status === 'running') return { ok: false, reason: 'a sweep is already running on ' + id };
  const ticket0 = (mergedTickets().tickets || []).find(t => t.id === id);
  const pipe = pipelineFor(ticket0);
  const sw = sweeps[id] = { status: 'running', step: 'gather', cycle: 0, type: (ticket0 && ticket0.type) || 'bug', startedAt: Date.now(), finishedAt: null, skipped: [] };
  const launch = (task, after) => { const r = launchScoped(id, task, after); if (!r.ok && after) { try { after({ skipped: true }); } catch (_) {} } };
  // run `task` only if its slot is empty; a filled slot skips straight to `after` (no drone spawned)
  const maybe = (task, after) => { const cf = (readState()[id] || {}).caseFile || {}; if (slotFilled(task, cf)) { sw.skipped.push(task); try { after({ skipped: true }); } catch (_) {} } else { launch(task, after); } };
  const finish = () => { sw.status = 'done'; sw.step = 'complete'; sw.finishedAt = Date.now(); };
  const audit = (cycle) => {
    if (!pipe.audit) { finish(); return; }
    sw.step = 'audit'; sw.cycle = cycle;
    launch('auditor', () => {
      const st = readState();
      const a = (st[id] && st[id].caseFile && st[id].caseFile.audit) || {};
      const next = (a.verdict === 'GAP' && a.nextDig && cycle < 2) ? taskKeyFromDroneServer(a.nextDig.drone) : '';
      if (next && SCOPED_TASKS[next]) { sw.step = 'redig'; launch(next, () => audit(2)); }
      else { finish(); }
    });
  };
  // run the chain (sequential) after the parallel phase, then audit
  const runChain = (i) => {
    if (i >= pipe.chain.length) { audit(1); return; }
    sw.step = pipe.chain[i];
    maybe(pipe.chain[i], () => runChain(i + 1));
  };
  let pending = pipe.parallel.length || 1;
  const onGather = () => { if (--pending === 0) runChain(0); };
  if (pipe.parallel.length) pipe.parallel.forEach(task => maybe(task, onGather));
  else runChain(0);
  return { ok: true, swept: id, type: sw.type };
}

function logTransition(ticketId, from, to, by) {
  if (!from || !to || from === to) return;            // only real edges
  try {
    const abs = jail(HISTORY_FILE);                    // RULE 3 — fixed file, jailed
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.appendFileSync(abs, JSON.stringify({ ticketId, from, to, by: by || 'system', ts: new Date().toISOString() }) + '\n');
  } catch (_) { /* history is best-effort — never break the action it rides inside */ }
}

// Once per day, append a rolled-up board snapshot. Idempotent: if today's date is already
// the last record, do nothing. Computed from mergedTickets() (status/severity) + flows.json (gaps).
function snapshotToday() {
  try {
    const abs = jail(SNAPSHOTS_FILE);                  // RULE 3 — fixed file, jailed
    let arr = []; try { arr = JSON.parse(fs.readFileSync(abs, 'utf8')); if (!Array.isArray(arr)) arr = []; } catch (_) {}
    const date = new Date().toISOString().slice(0, 10);
    if (arr.length && arr[arr.length - 1].date === date) return { ok: true, skipped: 'already snapshotted ' + date };

    const tickets = mergedTickets().tickets;           // tombstoned already filtered out
    const byStatus = {}; STATUSES.forEach(s => byStatus[s] = 0);
    const bySeverity = { P0: 0, P1: 0, P2: 0 };
    tickets.forEach(t => {
      const st = (t.state && t.state.status) || 'Open';
      byStatus[st] = (byStatus[st] || 0) + 1;
      if (t.severity) bySeverity[t.severity] = (bySeverity[t.severity] || 0) + 1;
    });
    let gaps = 0;
    try { const f = JSON.parse(fs.readFileSync(path.join(MC, 'flows.json'), 'utf8')); gaps = (f.surfaces || []).reduce((a, s) => a + (s.counts ? s.counts.gaps : 0), 0); } catch (_) {}

    arr.push({ date, total: tickets.length, byStatus, bySeverity, gaps, ts: new Date().toISOString() });
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(arr, null, 2));
    return { ok: true, date, total: tickets.length };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ── HTTP ────────────────────────────────────────────────────────────────────
const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(Buffer.isBuffer(body) ? body : typeof body === 'string' ? body : JSON.stringify(body));
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const p = url.pathname;

  // GET — page + allowlisted reads (no token; read-only, loopback only)
  if (req.method === 'GET') {
    if (p === '/' || p === '/index.html' || p === '/mission-control.html') {
      let html = fs.readFileSync(path.join(MC, 'mission-control.html'), 'utf8');
      html = html.replace('__MC_TOKEN__', TOKEN);          // RULE 4 — inject token into the same-origin page only
      return send(res, 200, html, 'text/html; charset=utf-8');
    }
    if (/^\/[a-z0-9_-]+\.(css|js)$/i.test(p)) {                 // static assets: any .css/.js basename in MC dir (path.basename strips any traversal)
      try { return send(res, 200, fs.readFileSync(path.join(MC, path.basename(p)), 'utf8'), p.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8'); }
      catch (e) { return send(res, 404, { error: e.message }); }
    }
    if (p === '/api/attachment') {                              // serve a ticket attachment (read-only, loopback)
      const id = url.searchParams.get('id') || '';
      const name = path.basename(url.searchParams.get('name') || '');   // basename strips any traversal
      if (!/^SLY-\d+$/.test(id)) return send(res, 400, { error: 'bad id' });
      if (!/^[a-z0-9._-]+$/i.test(name)) return send(res, 400, { error: 'bad name' });
      try {
        const buf = fs.readFileSync(jail(path.join('mission-control', 'attachments', id, name)));
        const ext = (name.match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
        const T = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', csv: 'text/csv; charset=utf-8', txt: 'text/plain; charset=utf-8', log: 'text/plain; charset=utf-8', json: 'application/json', md: 'text/markdown; charset=utf-8', pdf: 'application/pdf' };
        return send(res, 200, buf, T[ext] || 'application/octet-stream');
      } catch (e) { return send(res, 404, { error: e.message }); }
    }
    if (p === '/api/cases') { try { return send(res, 200, JSON.parse(fs.readFileSync(path.join(MC, 'cases.json'), 'utf8'))); } catch (e) { return send(res, 200, { cases: [], counts: {}, error: 'run: node scripts/mc/build-cases.js' }); } }
    if (p === '/api/specs') { try { return send(res, 200, JSON.parse(fs.readFileSync(path.join(MC, 'specs.json'), 'utf8'))); } catch (e) { return send(res, 404, { error: e.message }); } }
    if (p === '/api/notes') { try { return send(res, 200, JSON.parse(fs.readFileSync(path.join(MC, 'case-notes.json'), 'utf8'))); } catch (e) { return send(res, 200, {}); } }
    if (p === '/api/prompts') {
      try { return send(res, 200, JSON.parse(fs.readFileSync(jail(path.join('mission-control', 'prompts.json')), 'utf8'))); }
      catch (e) { return send(res, 200, { prompts: PROMPT_DEFAULTS, seeded: true }); }
    }
    if (p === '/api/tickets') return send(res, 200, mergedTickets());
    if (p === '/api/fixshot') {   // the captured "fixed screen" preview for a ticket (#36)
      const id = url.searchParams.get('id') || '';
      if (!/^SLY-\d+$/.test(id)) return send(res, 400, { error: 'bad id' });
      try { const buf = fs.readFileSync(jail(path.join('mission-control', 'shots', id + '.png'))); res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }); res.end(buf); return; }
      catch (e) { return send(res, 404, { error: 'no shot' }); }
    }
    if (p === '/api/worktree') {   // the execute-fix main worktree: staged fix commits awaiting review + push
      if (!fs.existsSync(WORKTREE)) return send(res, 200, { exists: false });
      const sh = (c) => { try { return execSync(c, { cwd: WORKTREE }).toString().trim(); } catch (_) { return ''; } };
      const commits = sh('git log --oneline origin/main..HEAD').split('\n').filter(Boolean);
      const diffstat = (sh('git diff --shortstat origin/main..HEAD') || '').trim();
      return send(res, 200, { exists: true, branch: gitBranchOf(WORKTREE), ahead: commits.length, commits, diffstat, dirty: sh('git status --porcelain').split('\n').filter(Boolean).length });
    }
    if (p === '/api/deploylog') return send(res, 200, readDeployLog());   // pushes → live status (deploy-status tracking)
    if (p === '/api/ux-audit') { try { return send(res, 200, JSON.parse(fs.readFileSync(path.join(MC, 'ux-audit.json'), 'utf8'))); } catch (e) { return send(res, 200, { none: true }); } }
    if (p === '/api/handoff') { try { return send(res, 200, { id: url.searchParams.get('id'), content: fs.readFileSync(jail(path.join('mission-control', 'handoffs', path.basename(url.searchParams.get('id') || '') + '.md')), 'utf8') }); } catch (e) { return send(res, 404, { error: e.message }); } }
    if (p === '/api/flows') { try { return send(res, 200, JSON.parse(fs.readFileSync(path.join(MC, 'flows.json'), 'utf8'))); } catch (e) { return send(res, 200, { surfaces: [], roster: [], coverage: {}, error: 'run scripts/mc/build-flows.js' }); } }
    // Read-only: the already-auto-ticketed gapKeys (keys of auto-tickets.json, the server's
    // dedupe map gapKey→ticketId). Returns ONLY the keys so the client can subtract them from
    // the untracked-gap count (true badge after a run). jail()'d; missing file → [] (first run).
    if (p === '/api/autotickets') {
      try { const d = JSON.parse(fs.readFileSync(jail(path.join('mission-control', 'auto-tickets.json')), 'utf8')) || {}; return send(res, 200, { keys: Object.keys(d) }); }
      catch (e) { return send(res, 200, { keys: [] }); }
    }
    if (p === '/api/history') {
      let events = [], snapshots = [];
      try {                                                                       // history.jsonl — last 500 events, newest LAST (chronological)
        const lines = fs.readFileSync(jail(HISTORY_FILE), 'utf8').split('\n').filter(Boolean);
        events = lines.slice(-500).map(l => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
      } catch (_) {}
      try { const a = JSON.parse(fs.readFileSync(jail(SNAPSHOTS_FILE), 'utf8')); if (Array.isArray(a)) snapshots = a; } catch (_) {}
      return send(res, 200, { events, snapshots });
    }
    if (p === '/api/shot') {  // serve a walk screenshot for the App Map "front" view (path-jailed to the latest walk dir)
      const rel = url.searchParams.get('f') || '';
      if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+\.png$/i.test(rel)) return send(res, 400, { error: 'bad shot path' });
      const w = latestWalk(); if (!w) return send(res, 404, { error: 'no walk' });
      try { const png = fs.readFileSync(jail(path.join('tests', 'walker-out', w.dir, rel))); res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }); return res.end(png); }
      catch (e) { return send(res, 404, { error: e.message }); }
    }
    if (p === '/api/gitstatus') {  // read-only git info for the Deploy view (fixed args, no shell)
      const cp = require('child_process');
      // run(): trimmed stdout, '' on any failure (unchanged behaviour for the 3 legacy fields).
      const run = (a) => { try { return cp.execFileSync('git', a, { cwd: REPO }).toString().trim(); } catch (e) { return ''; } };
      // runOK(): same call, but reports success so we can DISTINGUISH "0 ahead" from "no upstream".
      const runOK = (a) => { try { return { ok: true,  out: cp.execFileSync('git', a, { cwd: REPO }).toString().trim() }; }
                             catch (e) { return { ok: false, out: '' }; } };

      const branch = run(['branch', '--show-current']);
      const dirty  = run(['status', '--porcelain']).split('\n').filter(Boolean);

      // Upstream detection — the load-bearing distinction. `@{u}` resolves ONLY when the
      // branch tracks a remote; otherwise git exits non-zero and we know there's no origin.
      const up        = runOK(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
      const hasUpstream = up.ok && !!up.out;
      const upstream    = hasUpstream ? up.out : null;          // e.g. "origin/mission-control"

      // Unpushed commits + count — only meaningful when an upstream exists. With no upstream
      // we report ahead:0 + hasUpstream:false, and the client renders the "no remote" state
      // (NOT "nothing to push").
      let unpushed = [], ahead = 0;
      if (hasUpstream) {
        const log = runOK(['log', '@{u}..HEAD', '--oneline']);
        unpushed = log.ok ? log.out.split('\n').filter(Boolean) : [];
        ahead = unpushed.length;
      }

      return send(res, 200, {
        branch,
        dirty,                       // legacy field — array of porcelain lines
        unpushed,                    // legacy field — array of "<sha> <subject>" (empty when no upstream)
        // NEW — read-only, no write surface:
        hasUpstream,                 // bool — does this branch track a remote?
        upstream,                    // string|null — the tracking ref name
        ahead,                       // int — commits ahead of origin (trust only when hasUpstream)
        clean: dirty.length === 0,   // convenience: working tree clean?
      });
    }
    if (p === '/api/walk-confirm') {
      const id = url.searchParams.get('id') || '';
      if (!/^SLY-\d+$/.test(id)) return send(res, 400, { error: 'bad ticket id' });
      const ticket = [...TICKETS(), ...MANUAL()].find(x => x.id === id);
      const surface = (ticket && (ticket.surface || ticket.group)) || null;
      const scope = walkScopeForSurface(surface);
      const cur = (readState()[id] || {}).status || null;
      const canEdge = !!(cur && (TRANSITIONS[cur] || []).includes('ConfirmedLive'));
      if (!scope.group || !scope.flows.length)
        return send(res, 200, { id, surface, scope: scope.group, canEdge, status: cur, eligible: false, reason: 'surface not walkable', flows: [] });
      const w = latestWalk();
      if (!w || !w.walk)
        return send(res, 200, { id, surface, scope: scope.group, canEdge, status: cur, eligible: false, reason: 'no walk yet', flows: [] });
      const walkedAt = w.walk.generatedAt ? new Date(w.walk.generatedAt) : null;
      const ageDays = walkedAt && !isNaN(walkedAt) ? (Date.now() - walkedAt.getTime()) / 86400000 : Infinity;
      const fresh = ageDays <= WALK_MAX_AGE_DAYS;
      const verdicts = scope.flows.map(f => flowVerdict(w.walk, f));
      const anyPresent = verdicts.some(v => v.found);
      const anyPassing = verdicts.some(v => v.found && v.passing);
      const eligible = canEdge && fresh && anyPassing;
      return send(res, 200, {
        id, surface, scope: scope.group, canEdge, status: cur,
        walkDir: w.dir, walkedAt: w.walk.generatedAt, ageDays: Math.round(ageDays), fresh,
        anyPresent, anyPassing, eligible,
        reason: !canEdge ? `can only confirm-live from Investigating/Shipped (now ${cur})`
              : !anyPresent ? 'latest walk did not cover this surface'
              : !fresh ? `latest walk is ${Math.round(ageDays)}d old (stale)`
              : !anyPassing ? 'latest walk has failing steps'
              : 'ready',
        flows: verdicts,
      });
    }
    if (p === '/api/walk-latest') { const w = latestWalk(); return send(res, 200, w || { dir: null, walk: null }); }
    if (p === '/api/walkspecs')   return send(res, 200, { specs: listWalkSpecs() });
    if (p === '/api/walkspec')    { try { return send(res, 200, { name: url.searchParams.get('name'), content: fs.readFileSync(jail(path.join('docs','walk-and-judge','specs', path.basename(url.searchParams.get('name')||''))), 'utf8') }, ); } catch (e) { return send(res, 404, { error: e.message }); } }
    if (p === '/api/walklog')     return send(res, 200, { lines: walkLog, running: !!walkChild });
    if (p === '/api/ccjobs') {
      const jobs = Object.fromEntries(Object.entries(ccJobs).map(([k, v]) => [k, {
        status: v.status, mode: v.mode, model: v.model, reasoning: v.reasoning,
        id: (v.id != null ? v.id : k.split('#')[0]),       // ticket id (back-compat: derive from key)
        task: (v.task != null ? v.task : null),            // scoped task (null for generic dispatchCC jobs)
        started: v.started, exit: v.exit,
        cost: (v.cost != null ? v.cost : null),            // number | null (per-job total_cost_usd)
        turns: (v.turns != null ? v.turns : null),         // number | null
        durationMs: (v.durationMs != null ? v.durationMs : null),
      }]));
      // Spend windows (today / month / lifetime + budget anchors) drive the topbar usage meter.
      // Computed fresh from the jail()'d ledger so a restart still reports correctly.
      const sw = Object.fromEntries(Object.entries(sweeps).map(([k, v]) => [k, { status: v.status, step: v.step, cycle: v.cycle, startedAt: v.startedAt, finishedAt: v.finishedAt }]));
      return send(res, 200, { jobs, spend: spendWindows(), sweeps: sw });
    }
    if (p === '/api/system-audit') {
      try { return send(res, 200, JSON.parse(fs.readFileSync(jail(path.join('mission-control', 'system-audit.json')), 'utf8'))); }
      catch (e) { return send(res, 200, { empty: true }); }
    }
    if (p === '/api/triage') {
      try { return send(res, 200, JSON.parse(fs.readFileSync(jail(TRIAGE_FILE), 'utf8'))); }
      catch (e) { return send(res, 200, { empty: true }); }
    }
    if (p === '/api/cluster') {
      try { return send(res, 200, JSON.parse(fs.readFileSync(jail(CLUSTER_FILE), 'utf8'))); }
      catch (e) { return send(res, 200, { empty: true }); }
    }
    if (p === '/api/briefing-chat') { return send(res, 200, readBriefingChat()); }
    if (p === '/api/read') {
      const key = url.searchParams.get('name');
      if (!READS[key]) return send(res, 400, { error: 'not an allowlisted read: ' + key });
      try { return send(res, 200, { name: key, content: fs.readFileSync(jail(READS[key]), 'utf8') }); }
      catch (e) { return send(res, 404, { error: e.message, name: key }); }
    }
    return send(res, 404, { error: 'no such read' });
  }

  // POST /api/action — the only write path. RULE 4: origin + token. RULE 2: allowlist.
  if (req.method === 'POST' && p === '/api/action') {
    const origin = req.headers.origin;
    if (origin && !ALLOWED_ORIGINS.has(origin)) return send(res, 403, { error: 'origin not allowed: ' + origin });
    let raw = '';
    // 15MB cap — base64 inflates files ~33%, so this admits ~11MB attachments (attachFile).
    // Safe to be this large: loopback-only bind + per-start token + single user.
    req.on('data', c => { raw += c; if (raw.length > 15e6) req.destroy(); });
    req.on('end', async () => {
      let body; try { body = JSON.parse(raw || '{}'); } catch { return send(res, 400, { error: 'bad json' }); }
      if (body.token !== TOKEN) return send(res, 401, { error: 'bad or missing token' });
      const fn = ACTIONS[body.name];
      if (!fn) return send(res, 400, { error: 'not an allowlisted action: ' + body.name });
      try { return send(res, 200, await fn(body.args || {})); }
      catch (e) { return send(res, 400, { error: e.message, action: body.name }); }
    });
    return;
  }
  return send(res, 404, { error: 'not found' });
});

// RULE 1 + RULE 5 — bind loopback only; runs only while John keeps it running.
server.listen(PORT, HOST, () => {
  const snap = snapshotToday();                                                   // ← daily board snapshot (idempotent per day)
  console.log('\n  slyght · mission control');
  console.log('  ──────────────────────────────────────────────');
  console.log('  open:   http://' + HOST + ':' + PORT + '   (localhost-only)');
  console.log('  token:  ' + TOKEN + '   (auto-injected into the page)');
  console.log('  claude: ' + (CLAUDE_DIR ? CLAUDE_DIR + '  (on drone PATH)' : 'UNRESOLVED — drones rely on inherited PATH'));
  console.log('  writes: allowlisted actions only, path-jailed to ' + REPO);
  console.log('  deploy: git push — needs typed confirm, never fires on its own');
  console.log('  dispatch: CC drone (claude headless) — confirm-gated, no-push, cost-capped $1.50 sonnet / $3 opus, 40-turn, plan-default');
  const _sp = readSpend();
  console.log('  cc-spend: $' + _sp.total_usd.toFixed(2) + ' lifetime (' + _sp.count + ' run' + (_sp.count === 1 ? '' : 's') + ')');
  console.log('  history:' + (snap.skipped ? ' ' + snap.skipped : snap.ok ? ' snapshot ' + snap.date + ' (' + snap.total + ' tickets)' : ' snapshot failed: ' + snap.error));
  console.log('  stop:   Ctrl-C\n');
});
