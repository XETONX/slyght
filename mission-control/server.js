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
const { spawn } = require('child_process');

const PORT = 5050;
const HOST = '127.0.0.1';                              // RULE 1 — loopback only, hard-coded
const REPO = path.resolve(__dirname, '..');            // the slyght repo root (server lives in mission-control/)
const MC = __dirname;
const TOKEN = crypto.randomBytes(24).toString('base64url'); // RULE 4 — fresh per start
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

  // RULE 6: the one irreversible action. git push, hard-coded, and ONLY with
  // an explicit confirm:true (the UI also gates it behind a typed confirmation).
  deploy: ({ confirm }) => {
    if (confirm !== true) return { ok: false, reason: 'deploy refused: confirm:true required (UI confirm gate)' };
    return new Promise((resolve) => {
      const p = spawn('git', ['push'], { cwd: REPO });
      let out = '';
      p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
      p.on('exit', code => resolve({ ok: code === 0, code, output: out.slice(-2000) }));
    });
  },
};

// ── Allowlisted READS (GET). Read-only, localhost-only — no token required, but
//    still a FIXED map (no read-any-file). ────────────────────────────────────
const READS = {
  openbugs:   'OPEN-BUGS.md',
  featuremap: 'FEATURE-MAP.md',
  invariants: 'FINANCIAL-INVARIANTS.md',
  rules:      'MISSION-RULES.md',
  coverage:   'docs/walk-and-judge/coverage-map-2026-05-26.md',
};
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

// ── HTTP ────────────────────────────────────────────────────────────────────
const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
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
    if (p === '/app.js' || p === '/app.css') {                 // v2 split assets (fixed names, served from MC dir)
      try { return send(res, 200, fs.readFileSync(path.join(MC, p.slice(1)), 'utf8'), p.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8'); }
      catch (e) { return send(res, 404, { error: e.message }); }
    }
    if (p === '/api/cases') { try { return send(res, 200, JSON.parse(fs.readFileSync(path.join(MC, 'cases.json'), 'utf8'))); } catch (e) { return send(res, 200, { cases: [], counts: {}, error: 'run: node scripts/mc/build-cases.js' }); } }
    if (p === '/api/specs') { try { return send(res, 200, JSON.parse(fs.readFileSync(path.join(MC, 'specs.json'), 'utf8'))); } catch (e) { return send(res, 404, { error: e.message }); } }
    if (p === '/api/notes') { try { return send(res, 200, JSON.parse(fs.readFileSync(path.join(MC, 'case-notes.json'), 'utf8'))); } catch (e) { return send(res, 200, {}); } }
    if (p === '/api/gitstatus') {  // read-only git info for the Deploy view (fixed args, no shell)
      const run = (a) => { try { return require('child_process').execFileSync('git', a, { cwd: REPO }).toString().trim(); } catch (e) { return ''; } };
      return send(res, 200, {
        branch: run(['branch', '--show-current']),
        dirty: run(['status', '--porcelain']).split('\n').filter(Boolean),
        unpushed: run(['log', '@{u}..HEAD', '--oneline']).split('\n').filter(Boolean),
      });
    }
    if (p === '/api/walk-latest') { const w = latestWalk(); return send(res, 200, w || { dir: null, walk: null }); }
    if (p === '/api/walkspecs')   return send(res, 200, { specs: listWalkSpecs() });
    if (p === '/api/walkspec')    { try { return send(res, 200, { name: url.searchParams.get('name'), content: fs.readFileSync(jail(path.join('docs','walk-and-judge','specs', path.basename(url.searchParams.get('name')||''))), 'utf8') }, ); } catch (e) { return send(res, 404, { error: e.message }); } }
    if (p === '/api/walklog')     return send(res, 200, { lines: walkLog, running: !!walkChild });
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
    req.on('data', c => { raw += c; if (raw.length > 2e6) req.destroy(); });
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
  console.log('\n  slyght · mission control');
  console.log('  ──────────────────────────────────────────────');
  console.log('  open:   http://' + HOST + ':' + PORT + '   (localhost-only)');
  console.log('  token:  ' + TOKEN + '   (auto-injected into the page)');
  console.log('  writes: allowlisted actions only, path-jailed to ' + REPO);
  console.log('  deploy: git push — needs typed confirm, never fires on its own');
  console.log('  stop:   Ctrl-C\n');
});
