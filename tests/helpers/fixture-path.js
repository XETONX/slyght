/*
 * Shared fixture resolver — the "safe room" seed-selection flag for QA walks.
 * Part of the Walk-and-Judge capability (scoped 2026-05-26).
 *
 * THE RULE (John's non-negotiable): live WALK harnesses must default to the
 * SYNTHETIC fixture, never John's real state. Code-truth smoke specs keep
 * defaulting to the real fixture (they assert invariants on real data).
 *
 *   loadFixture()                 → real  (state-snapshot.json)   — smoke default
 *   loadFixture({ preferFake:true}) → fake (state-snapshot.fake.json) — WALK default
 *
 * Env overrides (highest precedence first):
 *   SLYGHT_FIXTURE=<path>   explicit file (relative to repo root or absolute)
 *   SLYGHT_REAL_FIXTURE=1   force real even in a walk harness
 *   SLYGHT_FAKE_FIXTURE=1   force fake even in a smoke spec
 *
 * No app state, no money logic, no network. Test-infra only.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const REAL = path.join(ROOT, 'state-snapshot.json');
const FAKE = path.join(ROOT, 'state-snapshot.fake.json');

function fixturePath(opts = {}) {
  if (process.env.SLYGHT_FIXTURE) return path.resolve(ROOT, process.env.SLYGHT_FIXTURE);
  if (process.env.SLYGHT_REAL_FIXTURE === '1') return REAL;
  if (process.env.SLYGHT_FAKE_FIXTURE === '1') return FAKE;
  if (opts.preferFake) return FAKE;
  return REAL;
}

function loadFixture(opts = {}) {
  const p = fixturePath(opts);
  if (!fs.existsSync(p)) {
    throw new Error('[fixture-path] fixture not found: ' + p +
      (opts.preferFake ? ' — fake fixture missing; run/commit state-snapshot.fake.json' : ''));
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// The seed shape every harness writes into localStorage['slyght_v5'].
// Mirrors the duplicated buildSlyghtV5() in each harness — consolidate onto this.
function buildSlyghtV5(fx) {
  const S = Object.assign({}, fx.S || {});
  if (fx.paidBills && !S.paidBills) S.paidBills = fx.paidBills;
  return { S, BILLS: fx.BILLS || [] };
}

function isFake(opts = {}) { return fixturePath(opts) === FAKE; }

module.exports = { fixturePath, loadFixture, buildSlyghtV5, isFake, PROJECT_ROOT: ROOT, REAL, FAKE };
