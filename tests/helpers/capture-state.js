// Bundle 30.5 Phase A — visual-capture helper.
//
// captureState(page, { label, featurePath, specLine, codeUnderTest,
//                      expectedState, clipTo, specFile, dpiScale,
//                      knownStateNotes })
//
// One call per "meaningful state transition" in a smoke spec. Produces:
//   - screenshot     (<safe-path>__<label>.png) — clipped to clipTo if given,
//                    else viewport (1× DPI by default per Q4 answer; opt-in
//                    via dpiScale: 3 for high-DPI debugging)
//   - DOM excerpt    (subtree if clipTo, else truncated body)
//   - S-state snap   (page.evaluate(() => S), txns truncated to last 10)
//   - audit window   (S._auditLog entries since previous capture in same spec)
//   - index entry    (everything above + assertion text, code under test,
//                    feature-path validation status)
//
// Storage layout (Q5 answer — gitignored, in tests/visual-captures/):
//   tests/visual-captures/<short-sha>[-dirty]/
//       ├── index.json
//       └── <safe-path>__<label>.png
//
// SHA detection (Q7 answer):
//   git rev-parse --short HEAD → e.g. "be675bb"
//   git status --porcelain non-empty → append "-dirty"
//
// Rotation (Q5): keep 10 most-recent SHA directories, prune older on init.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { loadFeatureMapPaths, isKnownPath } = require('./feature-map-paths');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const CAPTURES_ROOT = path.join(PROJECT_ROOT, 'tests', 'visual-captures');
const ROTATION_LIMIT = 10;
const DOM_EXCERPT_INLINE_LIMIT = 4000;   // chars stored inline in index
const TXN_TAIL = 10;                      // last N txns in state snapshot
const AUDIT_TAIL = 50;                    // last N audit entries per capture

let _sha = null;
let _capturesDir = null;
let _index = null;
const _pageAuditCounters = new WeakMap();  // per-page audit counter
                                            // (each Playwright test gets a
                                            // fresh page → fresh counter,
                                            // GC-cleaned automatically)
let _pruned = false;
let _initWarned = false;

function getSha() {
  if (_sha) return _sha;
  let short = 'no-git';
  let dirty = false;
  try {
    short = execSync('git rev-parse --short HEAD', { cwd: PROJECT_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const status = execSync('git status --porcelain', { cwd: PROJECT_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (status) dirty = true;
  } catch (e) {
    short = 'no-git';
  }
  _sha = dirty ? `${short}-dirty` : short;
  return _sha;
}

function getCapturesDir() {
  if (_capturesDir) return _capturesDir;
  const sha = getSha();
  _capturesDir = path.join(CAPTURES_ROOT, sha);
  if (!fs.existsSync(_capturesDir)) {
    fs.mkdirSync(_capturesDir, { recursive: true });
  }
  return _capturesDir;
}

function pruneOldCaptures() {
  if (_pruned) return;
  _pruned = true;
  if (!fs.existsSync(CAPTURES_ROOT)) return;
  let dirs;
  try {
    dirs = fs.readdirSync(CAPTURES_ROOT)
      .map(name => ({ name, path: path.join(CAPTURES_ROOT, name) }))
      .filter(d => {
        try { return fs.statSync(d.path).isDirectory(); } catch (_) { return false; }
      })
      .map(d => {
        try { return { ...d, mtime: fs.statSync(d.path).mtimeMs }; }
        catch (_) { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime);  // newest first
  } catch (_) {
    return;
  }
  for (let i = ROTATION_LIMIT; i < dirs.length; i++) {
    try { fs.rmSync(dirs[i].path, { recursive: true, force: true }); }
    catch (_) {}
  }
}

function _initIndex() {
  const dir = getCapturesDir();
  const indexPath = path.join(dir, 'index.json');
  if (_index) return _index;
  if (fs.existsSync(indexPath)) {
    try {
      _index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      if (!Array.isArray(_index.captures)) _index.captures = [];
      return _index;
    } catch (_) { /* fall through to fresh init */ }
  }
  _index = {
    schema_version: '1',
    sha: getSha(),
    feature_map_version: 'v2',
    feature_map_paths_count: loadFeatureMapPaths().size,
    run_started_at: new Date().toISOString(),
    captures: [],
  };
  return _index;
}

function _flushIndex() {
  const dir = getCapturesDir();
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(_index, null, 2));
}

function safePathForFile(featurePath) {
  // Convert "BRAIN → BALANCE → APPLY_TXN_DELTA" → "BRAIN__BALANCE__APPLY_TXN_DELTA"
  // and strip any chars that would break filenames.
  return (featurePath || 'UNKNOWN')
    .replace(/\s*→\s*/g, '__')
    .replace(/[^A-Z0-9_]/gi, '_')
    .slice(0, 180);                       // filename length guard
}

function safeLabel(label) {
  return (label || 'snapshot')
    .replace(/[^A-Z0-9_\-]/gi, '_')
    .slice(0, 60);
}

/**
 * Bundle 30.5 Phase C input contract — known_state_notes must be an
 * array of objects shaped as { code, description }. Plain strings are
 * accepted and auto-wrapped as { code: 'NOTE', description: <string> }
 * for backwards compat, but new callers should pass structured objects so
 * Phase C's verify-visual-state.js can parse codes reliably (e.g. tell
 * Haiku "ignore states with codes [FIXTURE_MATH_HEALTH_FAILS, ...]").
 */
function _normalizeKnownStateNotes(notes) {
  if (!notes) return [];
  const arr = Array.isArray(notes) ? notes : [notes];
  return arr.map(n => {
    if (typeof n === 'string') {
      return { code: 'NOTE', description: n };
    }
    if (n && typeof n === 'object' && typeof n.code === 'string') {
      return {
        code: n.code,
        description: String(n.description || ''),
      };
    }
    return { code: 'NOTE', description: String(n) };
  });
}

/**
 * captureState(page, opts) — call from inside a Playwright test.
 * Returns the index entry (also written to disk).
 */
async function captureState(page, opts) {
  if (!page || typeof page.screenshot !== 'function') {
    throw new Error('captureState: first arg must be a Playwright Page');
  }
  opts = opts || {};
  const {
    label = 'snapshot',
    featurePath,
    specLine = null,
    codeUnderTest = '',
    expectedState = '',
    clipTo = null,
    specFile = null,
    dpiScale = 1,             // 1× default per Q4
    knownStateNotes = [],     // Bundle 30.5 Phase B option (b) — flag
                              // fixture artifacts so Phase C vision-verify
                              // auto-flag doesn't false-positive on them
    verifyMode = null,        // Bundle 30.5 Phase C — 'visual' (Haiku
                              // compares screenshot to expected_state) |
                              // 'state' (logic-only test; Haiku skipped,
                              // capture preserves state_snapshot + audit
                              // for forensic record; auto-MATCH in report)
                              // | 'both' (Haiku PLUS state preservation)
                              // Default: clipTo present → 'visual'; clipTo
                              // null → 'state' (no UI element to verify).
                              // Caller can override explicitly.
  } = opts;
  const effectiveVerifyMode = verifyMode || (clipTo ? 'visual' : 'state');

  if (!featurePath || typeof featurePath !== 'string') {
    throw new Error('captureState: opts.featurePath is required (string)');
  }

  pruneOldCaptures();
  _initIndex();

  const pathKnown = isKnownPath(featurePath);
  if (!pathKnown && !_initWarned) {
    _initWarned = true;
    // eslint-disable-next-line no-console
    console.warn(`[captureState] feature_path not found in FEATURE-MAP.md: "${featurePath}" — capture proceeds, validation will flag in verify-visual step (Bundle 30.5 Phase C).`);
  }

  const dir = getCapturesDir();
  const safe = safePathForFile(featurePath);
  const lab = safeLabel(label);
  const shotFilename = `${safe}__${lab}.png`;
  const shotPath = path.join(dir, shotFilename);

  // Screenshot. Clipped to element if clipTo provided; else viewport.
  let screenshotOk = false;
  let screenshotError = null;
  try {
    if (clipTo) {
      const el = page.locator(clipTo).first();
      await el.screenshot({ path: shotPath, scale: dpiScale === 1 ? 'css' : 'device' });
    } else {
      await page.screenshot({ path: shotPath, fullPage: false, scale: dpiScale === 1 ? 'css' : 'device' });
    }
    screenshotOk = true;
  } catch (e) {
    screenshotError = (e && e.message) || String(e);
  }

  // DOM excerpt.
  let domExcerpt = '';
  let domExcerptError = null;
  try {
    if (clipTo) {
      domExcerpt = await page.locator(clipTo).first().innerHTML();
    } else {
      domExcerpt = await page.evaluate(() => document.body.outerHTML);
    }
  } catch (e) {
    domExcerptError = (e && e.message) || String(e);
  }

  // S-state snapshot (truncate large arrays for index size).
  let stateSnapshot = null;
  let stateError = null;
  try {
    stateSnapshot = await page.evaluate(({ txnTail }) => {
      if (typeof S === 'undefined' || S === null) return null;
      const out = {};
      for (const k of Object.keys(S)) {
        if (k === '_auditLog') continue;          // captured separately
        if (k === 'txns' && Array.isArray(S[k])) {
          out.txns = S[k].slice(-txnTail);
          out._txns_total = S[k].length;
        } else if (Array.isArray(S[k]) && S[k].length > 100) {
          out[k] = S[k].slice(-100);
          out['_' + k + '_total'] = S[k].length;
        } else if (typeof S[k] === 'function') {
          continue;
        } else {
          out[k] = S[k];
        }
      }
      return out;
    }, { txnTail: TXN_TAIL });
  } catch (e) {
    stateError = (e && e.message) || String(e);
  }

  // Audit-log slice: entries since previous capture on THIS page.
  // Per-page counter via WeakMap — Playwright creates a fresh page per
  // test, so each test starts with its own counter at 0. First capture
  // in a test sees the full boot-time audit log + any writes done before
  // captureState fired. Subsequent captures in the same test see only
  // new entries since the previous captureState call in that test.
  //
  // Phase B (per-spec counter) leaked across tests in the same spec —
  // stored counter from test 1's page was applied to test 2's page,
  // skipping early test-2 audit entries. Phase C fix: WeakMap on page
  // makes each test independently counted, regression-guarded by
  // tests/smoke/_helpers.smoke.js.
  let auditWindow = [];
  let auditError = null;
  try {
    const auditAll = await page.evaluate(() =>
      (typeof S !== 'undefined' && S && Array.isArray(S._auditLog)) ? S._auditLog : []
    );
    const since = _pageAuditCounters.get(page) || 0;
    auditWindow = auditAll.slice(since).slice(-AUDIT_TAIL);
    _pageAuditCounters.set(page, auditAll.length);
  } catch (e) {
    auditError = (e && e.message) || String(e);
  }

  const entry = {
    id: `${safe}__${lab}__${Date.now()}__${Math.random().toString(36).slice(2, 7)}`,
    feature_path: featurePath,
    feature_path_known_in_map: pathKnown,
    label: lab,
    spec_file: specFile,
    spec_line: specLine,
    code_under_test: codeUnderTest,
    expected_state: expectedState,
    clip_to: clipTo,
    dpi_scale: dpiScale,
    verify_mode: effectiveVerifyMode,
    known_state_notes: _normalizeKnownStateNotes(knownStateNotes),
    screenshot: screenshotOk ? shotFilename : null,
    screenshot_error: screenshotError,
    dom_excerpt_length: domExcerpt ? domExcerpt.length : 0,
    dom_excerpt: domExcerpt ? domExcerpt.slice(0, DOM_EXCERPT_INLINE_LIMIT) : '',
    dom_excerpt_error: domExcerptError,
    state_snapshot: stateSnapshot,
    state_error: stateError,
    audit_window: auditWindow,
    audit_error: auditError,
    captured_at: new Date().toISOString(),
  };

  _index.captures.push(entry);
  _flushIndex();
  return entry;
}

/**
 * Reset in-process state — used by tests that want a fresh run inside the
 * same Node process (rare; mainly for self-verification of the helper).
 */
function _resetState() {
  _sha = null;
  _capturesDir = null;
  _index = null;
  // _pageAuditCounters is a WeakMap; entries auto-GC when pages close.
  // No manual reset needed.
  _pruned = false;
  _initWarned = false;
}

module.exports = {
  captureState,
  getSha,
  getCapturesDir,
  pruneOldCaptures,
  safePathForFile,
  _resetState,
};
