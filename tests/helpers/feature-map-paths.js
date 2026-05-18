// Bundle 30.5 Phase A — FEATURE-MAP v2 path parser.
//
// Extracts all `**Path:** \`<path>\`` lines from FEATURE-MAP.md and returns
// them as a Set for fast validation. Used by captureState to verify that
// callers reference real architectural paths (not invented strings).
//
// Match unknown path → soft warning in captureState (Phase A scaffolding;
// tighten to hard error in Bundle 31+ once all specs are backfilled).
//
// Memoized at module-load time: the FEATURE-MAP is read once per process
// run. Smoke spec invocations within a single `npm run smoke` share the
// cache. Re-read happens on next process launch (next smoke run).

const fs = require('fs');
const path = require('path');

const FEATURE_MAP_PATH = path.resolve(__dirname, '../..', 'FEATURE-MAP.md');

let _cache = null;

function loadFeatureMapPaths() {
  if (_cache) return _cache;
  let text = '';
  try {
    text = fs.readFileSync(FEATURE_MAP_PATH, 'utf8');
  } catch (e) {
    // FEATURE-MAP unavailable — return empty set so validation becomes
    // permissive (no false negatives blocking captures during scaffolding).
    _cache = new Set();
    return _cache;
  }
  const paths = new Set();
  // Match: **Path:** `BRAIN → BALANCE → APPLY_TXN_DELTA`
  // Multi-line markdown means /m flag. Backticks bound the path.
  const re = /^\s*\*\*Path:\*\*\s*`([^`]+)`/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    paths.add(m[1].trim());
  }
  _cache = paths;
  return _cache;
}

function isKnownPath(featurePath) {
  if (!featurePath || typeof featurePath !== 'string') return false;
  return loadFeatureMapPaths().has(featurePath.trim());
}

function pathCount() {
  return loadFeatureMapPaths().size;
}

// Reset cache (used by tests that need fresh reads after FEATURE-MAP edits)
function _resetCache() {
  _cache = null;
}

module.exports = {
  loadFeatureMapPaths,
  isKnownPath,
  pathCount,
  _resetCache,
};
