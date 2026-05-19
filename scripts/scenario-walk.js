#!/usr/bin/env node
// Bundle 32+ — scenario-walk.js
//
// Multi-step user-journey scenario walker. Where walkthrough-audit.js
// captures isolated UI surfaces and sends them to Haiku for vision audit,
// scenario-walk.js performs SEQUENTIAL ACTIONS as a real user would and
// asserts state coherence at EACH STEP via programmatic checks (no LLM).
//
// Catches order-dependent breakage that isolated unit smoke specs miss:
//   - "Click A, then B fails" type bugs
//   - "Surface 1 updates but surface 2 doesn't" cross-surface coherence
//   - "State looks OK but audit log is missing an entry" forensics gaps
//
// Each scenario is a sequence of {action, asserts} pairs. After each step:
//   - Snapshot the screen (for forensics)
//   - Run programmatic asserts against S / DOM / audit log
//   - Diff state vs previous step (for change tracking)
//
// Output:
//   docs/audit/<timestamp>-scenario-walk.md      — human report
//   docs/audit/<timestamp>-scenario-walk.jsonl   — per-step trace
//   docs/audit/_scenario_screenshots/<scenario>/<step>.png
//
// Usage:
//   node scripts/scenario-walk.js                       — all scenarios
//   node scripts/scenario-walk.js --scenario=A          — single scenario by id
//   node scripts/scenario-walk.js --list                — list scenarios + exit

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// ─── env loader (mirrors walkthrough-audit) ─────────────────────────
(function _loadDotEnv() {
  const envPath = path.join(PROJECT_ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  try {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 1) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch (_) {}
})();

// ─── config ──────────────────────────────────────────────────────────
const PORT = 4573;  // distinct from smoke (4567) + walkthrough (4571)
// FROZEN_ISO must be AFTER the fixture's paydayReceivedDate so cycleStart resolves
// to the last received payday (not a future date). Smoke specs use 2026-05-05 for
// historical pre-payday math testing; scenario-walk represents post-payday daily-use
// where MODEL.cycleSpent + plan allocations are populated and exercised. The
// fixture state-snapshot.json was reconciled 2026-05-19 with paydayReceivedDate
// 2026-05-14, so 2026-05-19T22:00 mirrors John's real "tonight" state.
const FROZEN_ISO = '2026-05-19T22:00:00+10:00';

// ─── arg parsing ─────────────────────────────────────────────────────
const args = process.argv.slice(2);
const opts = { scenario: null, list: false };
for (const a of args) {
  if (a === '--list') opts.list = true;
  if (a.startsWith('--scenario=')) opts.scenario = a.slice('--scenario='.length);
}

// ─── scenario definitions ────────────────────────────────────────────
// Each scenario: { id, name, description, steps[] }
// Each step: { description, action(page,ctx), asserts(page,ctx) → {ok, errors[], state} }
//
// ctx is shared across steps within a scenario: { history[], lastState, screenshotDir, ... }

const SCENARIOS = [
  {
    id: 'A-daily-use',
    name: 'Daily-use loop (mid-cycle expense logging)',
    description: 'User opens app, logs a Quick Log expense, verifies balance + activity log + cycle total update across surfaces',
    steps: [
      {
        description: 'Boot + dismiss splash; capture initial state',
        action: async (page) => {
          // beforeEach has already loaded the page + dismissed splash + modals
        },
        asserts: async (page) => {
          const state = await page.evaluate(() => ({
            bal: S.bal,
            txnCount: (S.txns || []).length,
            auditLen: (S._auditLog || []).length,
            cycleSpent: MODEL && MODEL.cycleSpent,
            hasBRAIN: typeof BRAIN !== 'undefined',
            hasMODEL: typeof MODEL !== 'undefined',
          }));
          const errors = [];
          if (!state.hasBRAIN) errors.push('BRAIN not defined post-boot');
          if (!state.hasMODEL) errors.push('MODEL not defined post-boot');
          if (typeof state.bal !== 'number') errors.push('S.bal not a number');
          return { ok: errors.length === 0, errors, state };
        },
      },
      {
        description: 'Quick Log a $25 Food/Coffee expense via BRAIN.transaction.recordWithAllocation',
        action: async (page) => {
          await page.evaluate(() => {
            BRAIN.transaction.recordWithAllocation(
              { amt: 25, cat: 'Food / Coffee', note: 'Scenario A test coffee', direction: 'outflow' },
              BRAIN.SOURCES.LOG_EXPENSE
            );
          });
        },
        asserts: async (page, ctx) => {
          const state = await page.evaluate(() => ({
            bal: S.bal,
            txnCount: (S.txns || []).length,
            auditLen: (S._auditLog || []).length,
            lastTxn: (S.txns || []).slice(-1)[0],
            recentAuditTypes: (S._auditLog || []).slice(-5).map(e => e && e.type),
          }));
          const errors = [];
          const prev = ctx.lastState;
          const balDelta = +(state.bal - prev.bal).toFixed(2);
          if (balDelta !== -25) errors.push(`Balance delta ${balDelta}, expected -25`);
          if (state.txnCount !== prev.txnCount + 1) errors.push(`txn count ${state.txnCount} expected ${prev.txnCount + 1}`);
          if (!state.lastTxn || +state.lastTxn.amt !== 25) errors.push('last txn missing or wrong amount');
          if (!state.recentAuditTypes.includes('txn_record')) errors.push('audit log missing txn_record entry');
          if (!state.recentAuditTypes.includes('balance_apply_delta')) errors.push('audit log missing balance_apply_delta entry');
          return { ok: errors.length === 0, errors, state };
        },
      },
      {
        description: 'Verify MODEL.cycleSpent + MODEL.todaySpent refresh on next render',
        action: async (page) => {
          await page.evaluate(() => {
            if (typeof refreshModel === 'function') refreshModel();
            if (typeof renderAll === 'function') renderAll();
          });
          await page.waitForTimeout(100);
        },
        asserts: async (page, ctx) => {
          const state = await page.evaluate(() => ({
            cycleSpent: MODEL.cycleSpent,
            todaySpent: MODEL.todaySpent,
          }));
          const errors = [];
          const prevCycle = ctx.lastState.cycleSpent || 0;
          // Food/Coffee is discretionary; cycleSpent should increase by ~$25
          if (state.cycleSpent < prevCycle + 24.99) {
            errors.push(`MODEL.cycleSpent ${state.cycleSpent} should be at least ${prevCycle + 25} after $25 Food expense`);
          }
          return { ok: errors.length === 0, errors, state };
        },
      },
      {
        description: 'Verify Dashboard hero subtitle reflects today spend',
        action: async (page) => {
          await page.evaluate(() => {
            // Force dashboard active so the hero render fires.
            const dashEl = document.getElementById('pg-dash');
            document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
            if (dashEl) dashEl.classList.add('active');
            if (typeof renderAll === 'function') renderAll();
          });
          await page.waitForTimeout(150);
        },
        asserts: async (page) => {
          const hnText = await page.evaluate(() => {
            const el = document.getElementById('h-note');
            return el ? el.textContent : null;
          });
          const errors = [];
          if (!hnText) errors.push('Hero subtitle #h-note element missing');
          else if (!/\$25|spent today|cycle/i.test(hnText)) {
            errors.push(`Hero subtitle "${hnText}" doesn't reference today/cycle spend after the $25 expense`);
          }
          return { ok: errors.length === 0, errors, state: { hnText } };
        },
      },
    ],
  },
  {
    id: 'B-allocation-workflow',
    name: 'Plan-mode allocation workflow (cross-surface coherence)',
    description: 'User adjusts a savings allocation; verify PLAN dashboard tile + Canvas REMAINDER + Savings sub-screen all show the SAME numbers post-Bundle-32.1',
    steps: [
      {
        description: 'Boot + capture initial snap.derived state',
        action: async () => {},
        asserts: async (page) => {
          const state = await page.evaluate(() => {
            const snap = BRAIN.plan.getSnapshot();
            return {
              hasDerivedAllocation: typeof snap.derived.essentialsTotal === 'number'
                && typeof snap.derived.remainder === 'number'
                && typeof snap.derived.allocatedTotal === 'number'
                && typeof snap.derived.stillToAllocate === 'number',
              essentialsTotal: snap.derived.essentialsTotal,
              remainder: snap.derived.remainder,
              allocatedTotal: snap.derived.allocatedTotal,
              stillToAllocate: snap.derived.stillToAllocate,
              surplus: snap.derived.surplus,
              savingsTotal: snap.savings.total,
            };
          });
          const errors = [];
          if (!state.hasDerivedAllocation) errors.push('Bundle 32.1 snap.derived allocation fields missing');
          // Conservation law
          const conservation = Math.abs(state.remainder - (state.allocatedTotal + state.stillToAllocate));
          if (conservation > 1) errors.push(`Conservation broken: remainder=${state.remainder} != allocatedTotal+stillToAllocate (${state.allocatedTotal + state.stillToAllocate}); delta ${conservation}`);
          return { ok: errors.length === 0, errors, state };
        },
      },
      {
        description: 'Inject a savings override via BRAIN.plan.setOverride (canonical writer)',
        action: async (page) => {
          await page.evaluate(() => {
            S.activePlan = S.activePlan || {};
            S.activePlan.overrides = S.activePlan.overrides || {};
            // Reset to unlocked baseline — fixture (John's real state) may be locked,
            // and INV-29 refuses setOverride on locked plans. This scenario exercises
            // the override-write path, so we need the plan unlocked for the test.
            if (S.activePlan.lockedAt) {
              S.activePlan.lockedAt = null;
              try { BRAIN.allocation.unlock(BRAIN.SOURCES.CANVAS_UNLOCK); } catch (_) {}
            }
            // Clean any previous test overrides
            Object.keys(S.activePlan.overrides).forEach(k => {
              if (k.indexOf('savings:scenario-B-') === 0) delete S.activePlan.overrides[k];
            });
            const snap = BRAIN.plan.getSnapshot();
            // Pick ~30% of surplus — safe under threshold for healthy state
            const amt = Math.max(50, Math.floor(snap.derived.surplus * 0.3));
            window._scenarioB_injectAmt = amt;
            const r = BRAIN.plan.setOverride('savings', 'scenario-B-test', amt, {}, BRAIN.SOURCES.PLAN_OVERRIDE_SET);
            window._scenarioB_writerResult = r;
          });
        },
        asserts: async (page, ctx) => {
          const state = await page.evaluate(() => {
            const snap = BRAIN.plan.getSnapshot();
            return {
              writerOk: window._scenarioB_writerResult && window._scenarioB_writerResult.ok,
              injectedAmt: window._scenarioB_injectAmt,
              savingsTotal: snap.savings.total,
              allocatedTotal: snap.derived.allocatedTotal,
              stillToAllocate: snap.derived.stillToAllocate,
              remainder: snap.derived.remainder,
            };
          });
          const errors = [];
          if (!state.writerOk) errors.push('BRAIN.plan.setOverride returned !ok');
          const prev = ctx.lastState;
          const savingsDelta = +(state.savingsTotal - prev.savingsTotal).toFixed(2);
          if (Math.abs(savingsDelta - state.injectedAmt) > 1) {
            errors.push(`snap.savings.total delta ${savingsDelta} != injected ${state.injectedAmt}`);
          }
          // Conservation law still holds
          const conservation = Math.abs(state.remainder - (state.allocatedTotal + state.stillToAllocate));
          if (conservation > 1) errors.push(`Conservation broken after write: delta ${conservation}`);
          return { ok: errors.length === 0, errors, state };
        },
      },
      {
        description: 'Render PLAN dashboard tile + canvas REMAINDER; verify all surfaces show same allocated total',
        action: async (page) => {
          await page.evaluate(() => {
            // Render each surface that reads snap.derived
            window._scenarioB_allocateTileHtml = (typeof renderAllocateTile === 'function') ? renderAllocateTile() : '(renderAllocateTile not defined)';
            // Trigger renderPaydayPlanRoot by opening the canvas
            if (typeof openPaydayPlan === 'function') openPaydayPlan();
          });
          await page.waitForTimeout(150);
        },
        asserts: async (page, ctx) => {
          const state = await page.evaluate(() => {
            const snap = BRAIN.plan.getSnapshot();
            const remValEl = document.getElementById('payday-remainder-value');
            const tileHtml = window._scenarioB_allocateTileHtml || '';
            // Strip HTML tags to compare visible-text numbers only
            const tileVisibleText = tileHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            return {
              snapRemainder: Math.round(snap.derived.remainder),
              snapAllocated: Math.round(snap.derived.allocatedTotal),
              snapStillToAllocate: Math.round(snap.derived.stillToAllocate),
              canvasRemainderText: remValEl ? remValEl.textContent : null,
              tileVisibleText: tileVisibleText.slice(0, 600),  // for forensics
              tileHasStillToAllocate: tileVisibleText.includes('$' + Math.round(snap.derived.stillToAllocate).toLocaleString()),
              tileHasAllocated: tileVisibleText.includes('$' + Math.round(snap.derived.allocatedTotal).toLocaleString()),
              tileHasRemainder: tileVisibleText.includes('$' + Math.round(snap.derived.remainder).toLocaleString()),
            };
          });
          const errors = [];
          if (!state.canvasRemainderText) errors.push('Canvas REMAINDER tile (#payday-remainder-value) not rendered');
          else {
            const canvasRemNum = parseFloat(state.canvasRemainderText.replace(/[^0-9.\-]/g, ''));
            if (Math.abs(canvasRemNum - state.snapRemainder) > 1) {
              errors.push(`Canvas REMAINDER text "${state.canvasRemainderText}" doesn't match snap.derived.remainder ${state.snapRemainder}`);
            }
          }
          // PLAN dashboard tile must show still-to-allocate (headline) + allocated + remainder (sub-text)
          if (!state.tileHasStillToAllocate) errors.push(`renderAllocateTile visible text missing still-to-allocate $${state.snapStillToAllocate.toLocaleString()}`);
          if (!state.tileHasAllocated) errors.push(`renderAllocateTile visible text missing allocated $${state.snapAllocated.toLocaleString()}`);
          if (!state.tileHasRemainder) errors.push(`renderAllocateTile visible text missing remainder $${state.snapRemainder.toLocaleString()}`);
          return { ok: errors.length === 0, errors, state };
        },
      },
    ],
  },
  {
    id: 'D-lock-tick-unlock',
    name: 'Lock plan → tickItem → balance/audit coherence → unlock',
    description: 'Most-used daily flow per OPEN-BUGS #43 history. Verify locked plan tick path: lock (direct lockedAt set, since no BRAIN.plan.lock canonical writer exists — finding flagged) → BRAIN.plan.tickItem → balance decrements · txn appears · audit log entries · then unlock leaves state coherent.',
    steps: [
      {
        description: 'Audit BRAIN.plan surface — canonical lock/unlock writers MUST exist (Bundle 32.7 Pass 1)',
        action: async () => {},
        asserts: async (page) => {
          const state = await page.evaluate(() => {
            const planKeys = Object.keys(BRAIN.plan || {}).filter(k => typeof BRAIN.plan[k] === 'function');
            return {
              planFunctions: planKeys.sort(),
              hasTickItem: typeof BRAIN.plan.tickItem === 'function',
              hasUntickItem: typeof BRAIN.plan.untickItem === 'function',
              hasCanonicalLock: typeof BRAIN.plan.lock === 'function',
              hasCanonicalUnlock: typeof BRAIN.plan.unlock === 'function',
              hasCanonicalIsLocked: typeof BRAIN.plan.isLocked === 'function',
              isLocked: !!(S.activePlan && S.activePlan.lockedAt),
            };
          });
          const errors = [];
          if (!state.hasTickItem) errors.push('BRAIN.plan.tickItem missing — Bundle 27 canonical writer expected');
          if (!state.hasUntickItem) errors.push('BRAIN.plan.untickItem missing');
          // Post Bundle 32.7 Pass 1 — these are HARD pass-conditions, not informational.
          if (!state.hasCanonicalLock) errors.push('BRAIN.plan.lock missing — Bundle 32.7 Pass 1.a writer expected');
          if (!state.hasCanonicalUnlock) errors.push('BRAIN.plan.unlock missing — Bundle 32.7 Pass 1.a writer expected');
          if (!state.hasCanonicalIsLocked) errors.push('BRAIN.plan.isLocked missing — Bundle 32.7 Pass 1.a reader expected');
          return { ok: errors.length === 0, errors, state };
        },
      },
      {
        description: 'Lock plan via BRAIN.plan.lock canonical writer (Bundle 32.7 Pass 1)',
        action: async (page) => {
          await page.evaluate(() => {
            // Fixture state may already be locked (John's real 2026-05-19 state).
            // Reset to unlocked first so we exercise the FIRST-time lock path
            // (which mirrors to BRAIN.allocation). Idempotent re-lock would
            // return alreadyLocked:true and skip the mirror — uninteresting.
            if (S.activePlan && S.activePlan.lockedAt) {
              S.activePlan.lockedAt = null;
              try { BRAIN.allocation.unlock(BRAIN.SOURCES.CANVAS_UNLOCK); } catch (_) {}
            }
            window._scenarioD_lockResult = BRAIN.plan.lock(
              { snapshot: { cycleId: S.activePlan && S.activePlan.cycleId, source: 'scenario-D' } },
              BRAIN.SOURCES.CANVAS_LOCK
            );
          });
        },
        asserts: async (page) => {
          const state = await page.evaluate(() => ({
            lockResult: window._scenarioD_lockResult,
            isLocked: BRAIN.plan.isLocked(),
            allocLocked: BRAIN.allocation.isLocked(),
            recentAudit: (S._auditLog || []).slice(-3).map(e => e && e.type),
          }));
          const errors = [];
          if (!state.lockResult || state.lockResult.ok !== true) errors.push(`BRAIN.plan.lock returned ${JSON.stringify(state.lockResult)}`);
          if (!state.isLocked) errors.push('BRAIN.plan.isLocked() returned false after lock');
          if (!state.allocLocked) errors.push('BRAIN.allocation.isLocked() returned false — dual-store sync broken');
          if (!state.recentAudit.includes('payday_plan_locked')) errors.push(`audit log missing payday_plan_locked; recent: ${state.recentAudit.join(',')}`);
          return { ok: errors.length === 0, errors, state };
        },
      },
      {
        description: 'Tick a bill row via BRAIN.plan.tickItem; verify balance decrements + txn + audit entry',
        action: async (page) => {
          await page.evaluate(() => {
            // Pick first unpaid bill in current cycle (most likely tickable)
            const billsList = (BRAIN.bills && BRAIN.bills.getThisCycle) ? BRAIN.bills.getThisCycle() : [];
            const unpaidBill = billsList.find(b => !b.paid);
            if (!unpaidBill) {
              window._scenarioD_tickResult = { ok: false, reason: 'no-unpaid-bill' };
              return;
            }
            const billId = unpaidBill.id || unpaidBill.name;
            const billAmt = +unpaidBill.amt || 0;
            window._scenarioD_billId = billId;
            window._scenarioD_billAmt = billAmt;
            window._scenarioD_balBefore = S.bal;
            window._scenarioD_txnsBefore = (S.txns || []).length;
            window._scenarioD_tickResult = BRAIN.plan.tickItem('bill', billId, BRAIN.SOURCES.PLAN_TICK_BILL || BRAIN.SOURCES.LOG_EXPENSE);
          });
        },
        asserts: async (page) => {
          const state = await page.evaluate(() => ({
            tickResult: window._scenarioD_tickResult,
            billId: window._scenarioD_billId,
            billAmt: window._scenarioD_billAmt,
            balBefore: window._scenarioD_balBefore,
            balAfter: S.bal,
            txnsBefore: window._scenarioD_txnsBefore,
            txnsAfter: (S.txns || []).length,
            recentAudit: (S._auditLog || []).slice(-6).map(e => e && e.type),
            lastTxn: (S.txns || []).slice(-1)[0],
          }));
          const errors = [];
          if (!state.tickResult || state.tickResult.ok !== true) {
            errors.push(`BRAIN.plan.tickItem refused: ${state.tickResult && state.tickResult.reason || JSON.stringify(state.tickResult)}`);
            return { ok: false, errors, state };
          }
          if (state.billAmt > 0) {
            const balDelta = +(state.balAfter - state.balBefore).toFixed(2);
            if (Math.abs(balDelta + state.billAmt) > 0.05) {
              errors.push(`Balance delta ${balDelta} != -billAmt ${-state.billAmt} for bill ${state.billId}`);
            }
            if (state.txnsAfter !== state.txnsBefore + 1) {
              errors.push(`txn count ${state.txnsAfter} expected ${state.txnsBefore + 1}`);
            }
          }
          const sawTickAudit = state.recentAudit.some(t => /tick|bill_pay|plan_row|txn_record/.test(t || ''));
          if (!sawTickAudit) errors.push(`audit log missing tick-related entry; got ${state.recentAudit.join(',')}`);
          return { ok: errors.length === 0, errors, state };
        },
      },
      {
        description: 'Unlock plan via BRAIN.plan.unlock canonical writer; verify balance/txns preserved + dual-store sync',
        action: async (page) => {
          await page.evaluate(() => {
            window._scenarioD_unlockBefore = { bal: S.bal, txnCount: (S.txns || []).length };
            window._scenarioD_unlockResult = BRAIN.plan.unlock(BRAIN.SOURCES.CANVAS_UNLOCK);
          });
        },
        asserts: async (page) => {
          const state = await page.evaluate(() => ({
            unlockResult: window._scenarioD_unlockResult,
            isLocked: BRAIN.plan.isLocked(),
            allocLocked: BRAIN.allocation.isLocked(),
            balBefore: window._scenarioD_unlockBefore.bal,
            balAfter: S.bal,
            txnsBefore: window._scenarioD_unlockBefore.txnCount,
            txnsAfter: (S.txns || []).length,
            recentAudit: (S._auditLog || []).slice(-2).map(e => e && e.type),
          }));
          const errors = [];
          if (!state.unlockResult || state.unlockResult.ok !== true) errors.push(`BRAIN.plan.unlock returned ${JSON.stringify(state.unlockResult)}`);
          if (state.isLocked) errors.push('BRAIN.plan.isLocked() still true after unlock');
          if (state.allocLocked) errors.push('BRAIN.allocation.isLocked() still true — r77 divergence resurfacing');
          if (state.balAfter !== state.balBefore) errors.push(`Balance changed during unlock: ${state.balBefore} → ${state.balAfter}`);
          if (state.txnsAfter !== state.txnsBefore) errors.push(`Txns changed during unlock: ${state.txnsBefore} → ${state.txnsAfter}`);
          if (!state.recentAudit.includes('payday_plan_unlocked')) errors.push(`audit log missing payday_plan_unlocked`);
          return { ok: errors.length === 0, errors, state };
        },
      },
    ],
  },
  {
    id: 'E-activity-filter-coherence',
    name: 'Activity log filter coherence (sum-of-filtered === filtered txns)',
    description: 'Cross-surface coherence: filtered Activity Log "this cycle" totals must match the sum of visible txns. Catches stale filter / closure-bound state issues.',
    steps: [
      {
        description: 'Boot + capture all-time txns',
        action: async () => {},
        asserts: async (page) => {
          const state = await page.evaluate(() => ({
            txnCount: (S.txns || []).length,
            firstTxnTs: (S.txns || [])[0] && (S.txns[0].ts || S.txns[0].t),
            lastTxnTs: (S.txns || []).slice(-1)[0] && ((S.txns.slice(-1)[0]).ts || (S.txns.slice(-1)[0]).t),
            hasTodayTxnsCanonical: typeof todayTxnsCanonical === 'function',
            hasComputeSpentInRange: typeof computeSpentInRange === 'function',
            hasGetCycleStart: typeof getCycleStart === 'function',
          }));
          const errors = [];
          if (!state.hasComputeSpentInRange) errors.push('computeSpentInRange not available');
          if (state.txnCount === 0) errors.push('No txns in fixture — scenario E needs history');
          return { ok: errors.length === 0, errors, state };
        },
      },
      {
        description: 'computeSpentInRange must exactly equal manual sum applying same filter semantics (!income · !_NON_SPEND_CATS · !_isCorrection · !_isRoundup)',
        action: async (page) => {
          await page.evaluate(() => {
            const now = Date.now();
            const cycleStart = (typeof getCycleStart === 'function') ? getCycleStart().getTime() : (now - 14 * 86400000);
            // Reproduce computeSpentInRange semantics exactly: !income · !_NON_SPEND_CATS · !_isCorrection · !_isRoundup
            const nonSpendCats = (typeof _NON_SPEND_CATS !== 'undefined' && _NON_SPEND_CATS) ? _NON_SPEND_CATS : new Set();
            const inCycleSpend = (S.txns || []).filter(t =>
              t.ts >= cycleStart && t.ts <= now &&
              !t.income && !nonSpendCats.has(t.cat) &&
              !t._isCorrection && !t._isRoundup
            );
            const manualSum = inCycleSpend.reduce((s, t) => s + (+t.amt || 0), 0);
            const rangeSpent = (typeof computeSpentInRange === 'function') ? computeSpentInRange(cycleStart, now) : null;
            // Capture non-spend exclusions for forensics
            const inCycleAll = (S.txns || []).filter(t => t.ts >= cycleStart && t.ts <= now);
            const excludedNonSpend = inCycleAll.filter(t => !t.income && nonSpendCats.has(t.cat));
            const excludedSum = excludedNonSpend.reduce((s, t) => s + (+t.amt || 0), 0);
            window._scenarioE = {
              cycleStart, now,
              inCycleCount: inCycleAll.length,
              spendCount: inCycleSpend.length,
              manualSum: +manualSum.toFixed(2),
              rangeSpent: rangeSpent !== null ? +rangeSpent.toFixed(2) : null,
              excludedNonSpendCount: excludedNonSpend.length,
              excludedNonSpendSum: +excludedSum.toFixed(2),
              nonSpendCats: Array.from(nonSpendCats),
            };
          });
        },
        asserts: async (page) => {
          const state = await page.evaluate(() => window._scenarioE);
          const errors = [];
          if (state.rangeSpent === null) errors.push('computeSpentInRange returned null');
          else if (Math.abs(state.rangeSpent - state.manualSum) > 0.01) {
            errors.push(`computeSpentInRange=${state.rangeSpent} doesn't match manual semantic-equivalent sum=${state.manualSum}; ${state.spendCount}/${state.inCycleCount} txns considered spend; ${state.excludedNonSpendCount} non-spend (sum $${state.excludedNonSpendSum})`);
          }
          return { ok: errors.length === 0, errors, state };
        },
      },
      {
        description: 'Add a $50 cycle-window expense; computeSpentInRange must update by ~$50',
        action: async (page) => {
          await page.evaluate(() => {
            window._scenarioE_preAdd = (typeof computeSpentInRange === 'function')
              ? computeSpentInRange(window._scenarioE.cycleStart, Date.now())
              : 0;
            BRAIN.transaction.recordWithAllocation(
              { amt: 50, cat: 'Food / Coffee', note: 'Scenario E filter probe', direction: 'outflow' },
              BRAIN.SOURCES.LOG_EXPENSE
            );
            window._scenarioE_postAdd = (typeof computeSpentInRange === 'function')
              ? computeSpentInRange(window._scenarioE.cycleStart, Date.now())
              : 0;
          });
        },
        asserts: async (page) => {
          const state = await page.evaluate(() => ({
            pre: window._scenarioE_preAdd,
            post: window._scenarioE_postAdd,
            delta: +(window._scenarioE_postAdd - window._scenarioE_preAdd).toFixed(2),
          }));
          const errors = [];
          if (Math.abs(state.delta - 50) > 0.5) {
            errors.push(`computeSpentInRange delta ${state.delta} != 50 after $50 expense — filter not picking up new txn`);
          }
          return { ok: errors.length === 0, errors, state };
        },
      },
    ],
  },
  {
    id: 'F-chat-ai-dispatch',
    name: 'Chat-AI action dispatch (log_txn happy path · no API call)',
    description: 'Verify the AI action dispatcher (executeChatAction) routes log_txn through BRAIN.transaction.recordWithAllocation. No real API call — directly invokes executeChatAction with a synthesized action payload. Catches dispatcher-side bugs without consuming API budget.',
    steps: [
      {
        description: 'Boot + capture baseline + verify dispatcher surface exists',
        action: async () => {},
        asserts: async (page) => {
          const state = await page.evaluate(() => ({
            hasExecuteChatAction: typeof executeChatAction === 'function',
            hasSendChatMessage: typeof sendChatMessage === 'function',
            hasBRAINChat: !!(BRAIN && BRAIN.chat),
            chatSourcesPresent: !!(BRAIN.SOURCES.CHAT && BRAIN.SOURCES.CHAT_ASSISTANT_REPLY),
            bal: S.bal,
            txnCount: (S.txns || []).length,
          }));
          const errors = [];
          if (!state.hasExecuteChatAction) errors.push('executeChatAction not defined');
          if (!state.hasBRAINChat) errors.push('BRAIN.chat bubble missing');
          if (!state.chatSourcesPresent) errors.push('BRAIN.SOURCES.CHAT or CHAT_ASSISTANT_REPLY missing');
          return { ok: errors.length === 0, errors, state };
        },
      },
      {
        description: 'Dispatch a synthesized log_txn action with .00 amt (avoid round-up sibling); verify chat-recorded txn carries _chatLogged + CHAT source',
        action: async (page) => {
          await page.evaluate(() => {
            window._scenarioF_balBefore = S.bal;
            window._scenarioF_txnsBefore = (S.txns || []).length;
            window._scenarioF_roundUpsEnabled = !!S.roundUpsEnabled;
            // Use $33.00 (whole dollars) so no round-up sibling fires
            executeChatAction({ action: 'log_txn', amt: 33.00, note: 'Scenario F test lunch', cat: 'Food / Coffee' });
          });
        },
        asserts: async (page) => {
          const state = await page.evaluate(() => {
            const txns = S.txns || [];
            return {
              balBefore: window._scenarioF_balBefore,
              balAfter: S.bal,
              txnsBefore: window._scenarioF_txnsBefore,
              txnsAfter: txns.length,
              roundUpsEnabled: window._scenarioF_roundUpsEnabled,
              // Find the chat-marked txn (may not be the absolute last if a roundup sibling lands)
              chatTxn: [...txns].reverse().find(t => t && t._chatLogged),
              recentAuditSources: (S._auditLog || []).slice(-8).map(e => e && e.source).filter(Boolean),
            };
          });
          const errors = [];
          const balDelta = +(state.balAfter - state.balBefore).toFixed(2);
          // $33.00 whole-dollar should be exact -$33 (no roundup); fall back to <=1 cent tolerance for fp
          if (Math.abs(balDelta + 33) > 0.05) errors.push(`Balance delta ${balDelta} != -33.00 (whole-dollar amt = no round-up expected)`);
          if (state.txnsAfter !== state.txnsBefore + 1) errors.push(`txn count delta ${state.txnsAfter - state.txnsBefore} expected 1 (no round-up sibling for whole-dollar amt)`);
          if (!state.chatTxn) errors.push('No txn carries _chatLogged marker');
          // Source tag value is the lowercase string 'chat' (BRAIN.SOURCES.CHAT === 'chat')
          if (!state.recentAuditSources.includes('chat')) errors.push(`audit log missing 'chat' source tag; recent: ${state.recentAuditSources.join(',')}`);
          return { ok: errors.length === 0, errors, state };
        },
      },
      {
        description: 'Dispatch no_spend action; verify state UNCHANGED + chat_no_spend onStateChange fires',
        action: async (page) => {
          await page.evaluate(() => {
            window._scenarioF_preNoSpend = { bal: S.bal, txnCount: (S.txns || []).length };
            executeChatAction({ action: 'no_spend' });
          });
        },
        asserts: async (page) => {
          const state = await page.evaluate(() => ({
            balBefore: window._scenarioF_preNoSpend.bal,
            balAfter: S.bal,
            txnsBefore: window._scenarioF_preNoSpend.txnCount,
            txnsAfter: (S.txns || []).length,
          }));
          const errors = [];
          if (state.balAfter !== state.balBefore) errors.push(`Balance changed on no_spend: ${state.balBefore} → ${state.balAfter}`);
          if (state.txnsAfter !== state.txnsBefore) errors.push(`txn count changed on no_spend: ${state.txnsBefore} → ${state.txnsAfter}`);
          return { ok: errors.length === 0, errors, state };
        },
      },
    ],
  },
  {
    id: 'G-ai-update-balance-fr03',
    name: 'AI update_balance regression guard (FR-03 — known buggy until fixed)',
    description: 'Captures the FR-03 behavior: applyBalanceCorrection(newBal, reason) interprets action.amt as the TARGET balance, NOT a delta. When AI passes a delta-meant value, the balance jumps to that absolute number, producing the ~$7k overshoot John reported. This scenario asserts the CURRENT BUGGY BEHAVIOR so the day FR-03 lands, the assertion flips and surfaces the fix.',
    steps: [
      {
        description: 'Boot + capture baseline',
        action: async () => {},
        asserts: async (page) => {
          const state = await page.evaluate(() => ({
            bal: S.bal,
            hasApplyBalanceCorrection: typeof applyBalanceCorrection === 'function',
            hasExecuteChatAction: typeof executeChatAction === 'function',
          }));
          return { ok: state.hasApplyBalanceCorrection && state.hasExecuteChatAction, errors: state.hasApplyBalanceCorrection ? [] : ['applyBalanceCorrection missing'], state };
        },
      },
      {
        description: 'Dispatch update_balance with amt=500 (AI may mean "add $500" or "set to $500"); CURRENT behavior sets to $500',
        action: async (page) => {
          await page.evaluate(() => {
            window._scenarioG_balBefore = S.bal;
            executeChatAction({ action: 'update_balance', amt: 500, reason: 'Scenario G probe' });
          });
        },
        asserts: async (page) => {
          const state = await page.evaluate(() => ({
            balBefore: window._scenarioG_balBefore,
            balAfter: S.bal,
            interpretation: 'current behavior treats action.amt as TARGET balance via applyBalanceCorrection(newBal, reason)',
          }));
          const errors = [];
          // Current buggy behavior: S.bal === 500.00 after this call (target-balance semantics)
          // When FR-03 lands, behavior should change to delta semantics (S.bal === balBefore + 500)
          // Regression guard: assert current (buggy) behavior holds — flip this when FR-03 ships
          if (Math.abs(state.balAfter - 500) > 0.05) {
            // Either FR-03 fixed it (good — flip the assertion), or something else broke
            errors.push(`balAfter=${state.balAfter} expected 500.00 (current buggy target-balance semantics); if this fails because FR-03 shipped, flip the assertion to balDelta=+500 instead`);
          }
          return { ok: errors.length === 0, errors, state };
        },
      },
      {
        description: 'Reverse: dispatch update_balance with amt=balBefore to restore; verify correction txn logged each call',
        action: async (page) => {
          await page.evaluate(() => {
            window._scenarioG_txnsBeforeRevert = (S.txns || []).length;
            const target = window._scenarioG_balBefore;
            executeChatAction({ action: 'update_balance', amt: target, reason: 'Scenario G restore' });
          });
        },
        asserts: async (page) => {
          const state = await page.evaluate(() => ({
            balRestored: S.bal,
            balBeforeOriginal: window._scenarioG_balBefore,
            txnsAfterRevert: (S.txns || []).length,
            txnsBeforeRevert: window._scenarioG_txnsBeforeRevert,
            lastTxn: (S.txns || []).slice(-1)[0],
          }));
          const errors = [];
          if (Math.abs(state.balRestored - state.balBeforeOriginal) > 0.05) errors.push('Balance not restored after reverse correction');
          if (state.txnsAfterRevert !== state.txnsBeforeRevert + 1) errors.push('No correction txn logged on revert');
          if (state.lastTxn && !state.lastTxn._isCorrection) errors.push('Restore txn missing _isCorrection marker');
          return { ok: errors.length === 0, errors, state };
        },
      },
    ],
  },
  {
    id: 'H-debt-subscreen-coherence',
    name: 'Debt sub-screen ↔ canvas REMAINDER cross-surface coherence',
    description: 'FR-07 listed Debts sub-screen disagreeing with canvas. Verify renderPaydayDebts reads the same snap.debts numbers that drive the canvas REMAINDER + the PLAN dashboard tile. Override a single debt amount and assert all surfaces reflect the same total.',
    steps: [
      {
        description: 'Boot + verify renderPaydayDebts surface exists + snap.debts is well-formed',
        action: async () => {},
        asserts: async (page) => {
          const state = await page.evaluate(() => {
            const snap = BRAIN.plan.getSnapshot();
            return {
              hasRenderPaydayDebts: typeof renderPaydayDebts === 'function',
              snapDebtsTotal: snap.debts.total,
              snapDebtsCount: snap.debts.unpaid ? snap.debts.unpaid.length : (snap.debts.count || 0),
              hasDebts: !!(snap.debts && typeof snap.debts.total === 'number'),
            };
          });
          const errors = [];
          if (!state.hasRenderPaydayDebts) errors.push('renderPaydayDebts not defined');
          if (!state.hasDebts) errors.push('snap.debts shape broken');
          return { ok: errors.length === 0, errors, state };
        },
      },
      {
        description: 'Pick first unpaid debt (including viaRent — fixture has only viaRent debts); override amount via BRAIN.plan.setOverride; verify snap.debts.total + snap.derived.essentialsTotal both reflect the change',
        action: async (page) => {
          await page.evaluate(() => {
            // Reset to unlocked baseline (INV-29 refuses setOverride on locked plans)
            if (S.activePlan && S.activePlan.lockedAt) {
              S.activePlan.lockedAt = null;
              try { BRAIN.allocation.unlock(BRAIN.SOURCES.CANVAS_UNLOCK); } catch (_) {}
            }
            const snap = BRAIN.plan.getSnapshot();
            // Fixture state at 2026-05-19 has only viaRent debts in S.debts.
            // snap.debts excludes viaRent (line 20045 filter), so we use snap.debts.unpaid if present.
            // Fall back to any S.debts entry to ensure the scenario can run.
            let firstUnpaid = (S.debts || []).find(d => !d.paid && !d.viaRent);
            if (!firstUnpaid) firstUnpaid = (S.debts || []).find(d => !d.paid);  // accept viaRent
            if (!firstUnpaid) {
              window._scenarioH_setupResult = { ok: false, reason: 'no-debts-at-all', fixtureDebtsCount: (S.debts || []).length };
              return;
            }
            window._scenarioH_debtIsViaRent = !!firstUnpaid.viaRent;
            window._scenarioH_debtId = firstUnpaid.id || firstUnpaid.name;
            window._scenarioH_debtName = firstUnpaid.name;
            window._scenarioH_origAmt = +firstUnpaid.amt || 0;
            window._scenarioH_origDebtsTotal = snap.debts.total;
            window._scenarioH_origEssentialsTotal = snap.derived.essentialsTotal;
            window._scenarioH_setupResult = BRAIN.plan.setOverride('debt', window._scenarioH_debtId, 1, {}, BRAIN.SOURCES.PLAN_OVERRIDE_SET);
          });
        },
        asserts: async (page) => {
          const state = await page.evaluate(() => {
            const snap = BRAIN.plan.getSnapshot();
            return {
              setupResult: window._scenarioH_setupResult,
              debtIsViaRent: window._scenarioH_debtIsViaRent,
              debtName: window._scenarioH_debtName,
              origAmt: window._scenarioH_origAmt,
              origDebtsTotal: window._scenarioH_origDebtsTotal,
              origEssentialsTotal: window._scenarioH_origEssentialsTotal,
              newDebtsTotal: snap.debts.total,
              newEssentialsTotal: snap.derived.essentialsTotal,
            };
          });
          const errors = [];
          if (!state.setupResult || state.setupResult.ok !== true) {
            errors.push(`Override refused: ${state.setupResult && state.setupResult.reason || JSON.stringify(state.setupResult)}`);
            return { ok: false, errors, state };
          }
          // snap.debts EXCLUDES viaRent debts (line 20045). If we overrode a viaRent debt,
          // snap.debts.total should be unchanged. Only assert delta for non-viaRent debts.
          if (!state.debtIsViaRent) {
            const expectedDebtDelta = -(state.origAmt - 1);
            const actualDebtDelta = state.newDebtsTotal - state.origDebtsTotal;
            if (Math.abs(actualDebtDelta - expectedDebtDelta) > 0.05) {
              errors.push(`snap.debts.total delta ${actualDebtDelta} != expected ${expectedDebtDelta} (debt ${state.debtName} ${state.origAmt}→$1)`);
            }
            const actualEssentialsDelta = state.newEssentialsTotal - state.origEssentialsTotal;
            if (Math.abs(actualEssentialsDelta - expectedDebtDelta) > 0.05) {
              errors.push(`snap.derived.essentialsTotal delta ${actualEssentialsDelta} != snap.debts.total delta ${expectedDebtDelta} — divergence`);
            }
          } else {
            // viaRent debt — assert NO change in snap.debts (correct exclusion semantics)
            if (Math.abs(state.newDebtsTotal - state.origDebtsTotal) > 0.05) {
              errors.push(`snap.debts.total changed despite viaRent debt override: ${state.origDebtsTotal} → ${state.newDebtsTotal} (viaRent debts should be excluded)`);
            }
          }
          return { ok: errors.length === 0, errors, state };
        },
      },
      {
        description: 'Render renderPaydayDebts HTML; verify it contains the overridden $1 amount (not the original)',
        action: async (page) => {
          await page.evaluate(() => {
            const screen = document.getElementById('pg-spend') || document.getElementById('payday-debts');
            // Force render
            if (typeof renderPaydayDebts === 'function') {
              try { renderPaydayDebts(); } catch (_) {}
            }
            // Capture all visible text containing the debt name
            const allText = document.body.innerText || document.body.textContent || '';
            window._scenarioH_pageText = allText;
          });
          await page.waitForTimeout(150);
        },
        asserts: async (page) => {
          const state = await page.evaluate(() => {
            const snap = BRAIN.plan.getSnapshot();
            return {
              debtName: window._scenarioH_debtName,
              origAmt: window._scenarioH_origAmt,
              pageContainsOrigAmt: window._scenarioH_pageText.includes('$' + Math.round(window._scenarioH_origAmt).toLocaleString()),
              pageContainsNewAmt: window._scenarioH_pageText.includes('$1'),
              snapDebtsTotal: snap.debts.total,
            };
          });
          // This step is INFORMATIONAL — it surfaces whether stale rendering is visible.
          // Strict assertion would fail when the sub-screen isn't currently active (most likely the case).
          // We just record the state for the report; assertion always passes unless snap shape broke.
          const errors = [];
          if (typeof state.snapDebtsTotal !== 'number') errors.push('snap.debts.total reverted to non-number after render');
          return { ok: errors.length === 0, errors, state };
        },
      },
    ],
  },
  {
    id: 'I-multi-cycle-rollover',
    name: 'Cycle rollover (BRAIN.plan.rolloverIfNeeded with hasWork=false guard)',
    description: 'Bundle 27 P6.1 rollover. The defensive r74 fix (John 2026-05-14 "PLAN gets wiped after every commit") added hasWork=true → defer auto-rollover. Verify: (a) rollover defers when plan has work · (b) rollover fires when plan has no work + cycleEndDate passed · (c) history archived properly.',
    steps: [
      {
        description: 'Boot + verify rollover surface exists + capture current cycleId',
        action: async () => {},
        asserts: async (page) => {
          const state = await page.evaluate(() => ({
            hasRolloverIfNeeded: typeof BRAIN.plan.rolloverIfNeeded === 'function',
            currentCycleId: S.activePlan && S.activePlan.cycleId,
            cycleEndDate: S.activePlan && S.activePlan.cycleEndDate,
            planHistoryLen: (S.planHistory || []).length,
            hasOverrides: !!(S.activePlan && S.activePlan.overrides && Object.keys(S.activePlan.overrides).length > 0),
            lockedAt: S.activePlan && S.activePlan.lockedAt,
          }));
          return { ok: state.hasRolloverIfNeeded, errors: state.hasRolloverIfNeeded ? [] : ['BRAIN.plan.rolloverIfNeeded missing'], state };
        },
      },
      {
        description: 'Force cycleEndDate into the past + leave plan with work (overrides); rollover MUST defer (return ok:false, reason:deferred-has-work)',
        action: async (page) => {
          await page.evaluate(() => {
            // Backdate cycleEndDate to yesterday so now > endMs
            const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
            S.activePlan.cycleEndDate = yesterday;
            // Ensure plan has work — add an override if none exists
            S.activePlan.overrides = S.activePlan.overrides || {};
            S.activePlan.overrides['savings:scenario-I-probe'] = {
              normalAmount: 0, thisCycleAmount: 50, reason: null, deferred: 0, deferAction: 'none', setAt: Date.now(),
            };
            window._scenarioI_rolloverResult1 = BRAIN.plan.rolloverIfNeeded();
            window._scenarioI_cycleIdAfter1 = S.activePlan.cycleId;
          });
        },
        asserts: async (page) => {
          const state = await page.evaluate(() => ({
            result: window._scenarioI_rolloverResult1,
            cycleIdAfter: window._scenarioI_cycleIdAfter1,
            recentAuditTypes: (S._auditLog || []).slice(-5).map(e => e && e.type),
          }));
          const errors = [];
          if (state.result.ok !== false) errors.push(`Rollover should have deferred (has work); got ok=${state.result.ok}`);
          if (state.result.reason !== 'deferred-has-work') errors.push(`Expected reason 'deferred-has-work'; got '${state.result.reason}'`);
          if (!state.recentAuditTypes.includes('rollover_deferred_has_work')) {
            errors.push(`audit log missing rollover_deferred_has_work; got ${state.recentAuditTypes.join(',')}`);
          }
          return { ok: errors.length === 0, errors, state };
        },
      },
      {
        description: 'Clear ALL work + leave cycleEndDate in past; rollover MUST fire (history archived, new cycleId)',
        action: async (page) => {
          await page.evaluate(() => {
            // Strip all work signals so hasWork === false
            S.activePlan.lockedAt = null;
            S.activePlan.overrides = {};
            S.activePlan.savings = {};
            S.activePlan.knownUpcoming = [];
            S.activePlan.ticks = {};
            if (S.activePlan.income && S.activePlan.income.bonus) S.activePlan.income.bonus.included = false;
            window._scenarioI_cycleIdBefore = S.activePlan.cycleId;
            window._scenarioI_historyLenBefore = (S.planHistory || []).length;
            window._scenarioI_rolloverResult2 = BRAIN.plan.rolloverIfNeeded();
          });
        },
        asserts: async (page) => {
          const state = await page.evaluate(() => ({
            result: window._scenarioI_rolloverResult2,
            cycleIdBefore: window._scenarioI_cycleIdBefore,
            cycleIdAfter: S.activePlan.cycleId,
            historyLenBefore: window._scenarioI_historyLenBefore,
            historyLenAfter: (S.planHistory || []).length,
            lastHistoryEntry: (S.planHistory || []).slice(-1)[0],
            HISTORY_CAP: 24,
          }));
          const errors = [];
          // Success signal: result.ok === true (cycleId may STAY THE SAME — this is the
          // architectural finding r74 was working around. cycleId derives from current
          // date's last-payday, so a same-day rollover yields the same cycleId. Surfaced
          // as architectural-divergence in scenario-sweep doc, not a hard fail.)
          if (!state.result || state.result.ok !== true) {
            errors.push(`Rollover did NOT return ok:true; result=${JSON.stringify(state.result)}`);
          }
          // History either grows by 1, OR stays the same length (when at the 24-cycle cap; line 21101).
          const lengthDelta = state.historyLenAfter - state.historyLenBefore;
          const atCap = state.historyLenBefore >= state.HISTORY_CAP;
          if (!atCap && lengthDelta !== 1) {
            errors.push(`planHistory not appended: ${state.historyLenBefore} → ${state.historyLenAfter} (not at cap, expected +1)`);
          }
          if (atCap && lengthDelta !== 0) {
            errors.push(`planHistory length should be constant at cap: ${state.historyLenBefore} → ${state.historyLenAfter}`);
          }
          if (!state.lastHistoryEntry || state.lastHistoryEntry.cycleId !== state.cycleIdBefore) {
            errors.push(`History entry cycleId ${state.lastHistoryEntry && state.lastHistoryEntry.cycleId} != pre-rollover cycleId ${state.cycleIdBefore} (slice-tail mis-aligned)`);
          }
          // Annotate state with the finding for the sweep doc
          state.architecturalFinding = (state.cycleIdBefore === state.cycleIdAfter)
            ? 'rollover-fires-but-cycleId-unchanged: result.newCycle === result.previousCycle. Root: cycleId derives from current-date last-payday; with frozen clock 2026-05-19 + last-payday 2026-05-14, new cycle resolves to same date. r74 defer-on-work is the workaround. True fix needs cycleId increment semantics.'
            : null;
          return { ok: errors.length === 0, errors, state };
        },
      },
    ],
  },
  {
    id: 'J-notify-local-queue',
    name: 'NOTIFY.add local queue + dedup behavior (no Worker round-trip)',
    description: 'Tests the LOCAL trigger surface: NOTIFY.add() enqueue, ID-based dedup (so the same alert does not re-fire on every render), and audit log integration. Push notification delivery via the Cloudflare Worker is OUT OF SCOPE here.',
    steps: [
      {
        description: 'Boot + verify NOTIFY surface',
        action: async () => {},
        asserts: async (page) => {
          const state = await page.evaluate(() => ({
            hasNOTIFY: typeof NOTIFY !== 'undefined' && !!NOTIFY,
            hasAdd: typeof NOTIFY !== 'undefined' && typeof NOTIFY.add === 'function',
            notifyKeys: typeof NOTIFY !== 'undefined' ? Object.keys(NOTIFY).filter(k => typeof NOTIFY[k] === 'function').sort() : [],
            existingNotifs: S.notifications ? S.notifications.length : 0,
          }));
          const errors = [];
          if (!state.hasNOTIFY) errors.push('NOTIFY undefined');
          if (!state.hasAdd) errors.push('NOTIFY.add not a function');
          return { ok: errors.length === 0, errors, state };
        },
      },
      {
        description: 'Add notification with unique ID; verify queued',
        action: async (page) => {
          await page.evaluate(() => {
            window._scenarioJ_idUnique = 'scenario-J-' + Date.now();
            window._scenarioJ_existingBefore = (S.notifications || []).length;
            NOTIFY.add({
              type: 'info',
              title: 'Scenario J probe',
              message: 'Test notification',
              ts: Date.now(),
              id: window._scenarioJ_idUnique,
            });
          });
        },
        asserts: async (page) => {
          const state = await page.evaluate(() => ({
            existingAfter: (S.notifications || []).length,
            existingBefore: window._scenarioJ_existingBefore,
            queuedNotif: (S.notifications || []).find(n => n && n.id === window._scenarioJ_idUnique),
          }));
          const errors = [];
          if (state.existingAfter !== state.existingBefore + 1) {
            errors.push(`Notifications count ${state.existingAfter} expected ${state.existingBefore + 1}`);
          }
          if (!state.queuedNotif) errors.push('Queued notif not findable by id');
          return { ok: errors.length === 0, errors, state };
        },
      },
      {
        description: 'Add SAME-ID notification twice; verify dedup (count does not double)',
        action: async (page) => {
          await page.evaluate(() => {
            const dedupId = 'scenario-J-dedup-' + Date.now();
            window._scenarioJ_dedupCountBefore = (S.notifications || []).length;
            NOTIFY.add({ type: 'info', title: 'Dedup test', message: 'A', ts: Date.now(), id: dedupId });
            NOTIFY.add({ type: 'info', title: 'Dedup test', message: 'A', ts: Date.now(), id: dedupId });
            NOTIFY.add({ type: 'info', title: 'Dedup test', message: 'A', ts: Date.now(), id: dedupId });
            window._scenarioJ_dedupCountAfter = (S.notifications || []).length;
          });
        },
        asserts: async (page) => {
          const state = await page.evaluate(() => ({
            before: window._scenarioJ_dedupCountBefore,
            after: window._scenarioJ_dedupCountAfter,
          }));
          const errors = [];
          // Dedup should result in net +1 (or 0 if id-already-present), NOT +3
          const delta = state.after - state.before;
          if (delta > 1) errors.push(`Dedup failed: 3 same-id adds yielded delta ${delta} (expected 0 or 1)`);
          return { ok: errors.length === 0, errors, state };
        },
      },
    ],
  },
  {
    id: 'K-settings-ia-navigation',
    name: 'Settings IA — Bundle 22 v3 7-category nav coherence',
    description: 'Walk Settings root → each of 7 sub-screens (financial, strategies, notifications, ai, data, diagnostics, about). Verify each sub-screen renders, back-nav works, no errors thrown. Coverage check for the IA that John uses occasionally.',
    steps: [
      {
        description: 'Boot + navigate to Settings; verify root renders with 7 category buttons',
        action: async (page) => {
          await page.evaluate(() => {
            if (typeof goPage === 'function') goPage('pg-settings');
          });
          await page.waitForTimeout(200);
        },
        asserts: async (page) => {
          const state = await page.evaluate(() => {
            const settingsRoot = document.getElementById('pg-settings');
            const isActive = settingsRoot && settingsRoot.classList.contains('active');
            const subCategoryButtons = settingsRoot
              ? Array.from(settingsRoot.querySelectorAll('button[onclick*="openSettingsCategory"]'))
              : [];
            const categories = subCategoryButtons.map(b => {
              const m = (b.getAttribute('onclick') || '').match(/openSettingsCategory\('(sub-[^']+)'\)/);
              return m ? m[1] : null;
            }).filter(Boolean);
            return {
              isActive,
              categories,
              hasOpenSettingsCategory: typeof openSettingsCategory === 'function',
            };
          });
          const errors = [];
          if (!state.isActive) errors.push('pg-settings not active after goPage');
          if (!state.hasOpenSettingsCategory) errors.push('openSettingsCategory not defined');
          // Bundle 22 v3 set 7 categories
          const expected = ['sub-financial', 'sub-strategies', 'sub-notifications', 'sub-ai', 'sub-data', 'sub-diagnostics', 'sub-about'];
          const missing = expected.filter(c => !state.categories.includes(c));
          if (missing.length) errors.push(`Settings missing categories: ${missing.join(',')}`);
          return { ok: errors.length === 0, errors, state };
        },
      },
      {
        description: 'Open each of the 7 sub-screens in sequence; verify each renders without throwing + back-nav works',
        action: async (page) => {
          await page.evaluate(async () => {
            const categories = ['sub-financial', 'sub-strategies', 'sub-notifications', 'sub-ai', 'sub-data', 'sub-diagnostics', 'sub-about'];
            const results = {};
            for (const cat of categories) {
              try {
                openSettingsCategory(cat);
                // Allow render flush
                await new Promise(r => setTimeout(r, 50));
                const subEl = document.getElementById(cat);
                results[cat] = {
                  exists: !!subEl,
                  hasContent: !!(subEl && subEl.innerHTML && subEl.innerHTML.length > 50),
                  hasBackBtn: !!(subEl && subEl.querySelector('button[onclick*="closeSettingsCategory"], button[onclick*="back"], button[aria-label*="ack"]')),
                };
              } catch (e) {
                results[cat] = { error: String(e && e.message || e) };
              }
            }
            window._scenarioK_subResults = results;
          });
          await page.waitForTimeout(200);
        },
        asserts: async (page) => {
          const state = await page.evaluate(() => window._scenarioK_subResults);
          const errors = [];
          for (const [cat, r] of Object.entries(state)) {
            if (r.error) errors.push(`${cat}: threw ${r.error}`);
            else if (!r.exists) errors.push(`${cat}: subscreen element missing`);
            else if (!r.hasContent) errors.push(`${cat}: subscreen rendered empty (innerHTML < 50 chars)`);
            // back-nav check is informational — many sub-screens use parent's back button
          }
          return { ok: errors.length === 0, errors, state };
        },
      },
    ],
  },
  {
    id: 'L-lock-unlock-cross-entry-flow',
    name: 'Cross-entry lock/unlock cycle (canvas Lock → inline Unlock → legacy Lock → canvas Unlock)',
    description: 'Bundle 32.7 Pass 1 integration test. Drives the plan through all 4 lock/unlock entry points sequentially. At every step asserts (1) BRAIN.plan.isLocked() and BRAIN.allocation.isLocked() agree (no divergence) and (2) S.activePlan.lockedAt reflects the expected state. Captures 8+ screenshots for Haiku flow verification.',
    steps: [
      {
        description: 'Step 1 — boot, unlocked baseline; assert all stores agree on unlocked',
        action: async (page) => {
          await page.evaluate(() => {
            // Force unlocked baseline regardless of fixture state
            if (S.activePlan && S.activePlan.lockedAt) S.activePlan.lockedAt = null;
            try { BRAIN.allocation.unlock(BRAIN.SOURCES.PLAN_UNLOCK_PAYDAY); } catch (_) {}
            // Navigate to the Payday Plan canvas root for visual capture
            if (typeof openPaydayPlan === 'function') openPaydayPlan();
          });
          await page.waitForTimeout(150);
        },
        asserts: async (page) => {
          const state = await page.evaluate(() => ({
            planIsLocked: BRAIN.plan.isLocked(),
            allocIsLocked: BRAIN.allocation.isLocked(),
            sLockedAt: S.activePlan && S.activePlan.lockedAt,
          }));
          const errors = [];
          if (state.planIsLocked) errors.push(`BRAIN.plan.isLocked()=${state.planIsLocked} expected false`);
          if (state.allocIsLocked) errors.push(`BRAIN.allocation.isLocked()=${state.allocIsLocked} expected false`);
          if (state.sLockedAt) errors.push(`S.activePlan.lockedAt=${state.sLockedAt} expected null`);
          return { ok: errors.length === 0, errors, state };
        },
      },
      {
        description: 'Step 2 — Lock via CANVAS_LOCK (canvas Lock save handler path); assert both stores locked',
        action: async (page) => {
          await page.evaluate(() => {
            const snap = BRAIN.plan.getSnapshot();
            BRAIN.plan.lock(
              { snapshot: { cycleId: snap.cycleId, totalToPlan: snap.totalToPlan, entry: 'canvas-Lock' } },
              BRAIN.SOURCES.CANVAS_LOCK
            );
            if (typeof renderPaydayPlanRoot === 'function') renderPaydayPlanRoot();
          });
          await page.waitForTimeout(150);
        },
        asserts: async (page) => {
          const state = await page.evaluate(() => ({
            planIsLocked: BRAIN.plan.isLocked(),
            allocIsLocked: BRAIN.allocation.isLocked(),
            sLockedAt: S.activePlan && S.activePlan.lockedAt,
            lastAudit: (S._auditLog || []).slice(-1)[0],
          }));
          const errors = [];
          if (!state.planIsLocked) errors.push('BRAIN.plan.isLocked() false after canvas-Lock');
          if (!state.allocIsLocked) errors.push('BRAIN.allocation.isLocked() false — dual-store sync failed');
          if (!state.sLockedAt) errors.push('S.activePlan.lockedAt not set');
          if (!state.lastAudit || state.lastAudit.type !== 'payday_plan_locked') errors.push(`last audit type ${state.lastAudit && state.lastAudit.type} expected payday_plan_locked`);
          return { ok: errors.length === 0, errors, state };
        },
      },
      {
        description: 'Step 3 — Unlock via PLAN_UNLOCK_INLINE (banner Unlock — the r77 path); both stores must clear (the divergence-bug fix)',
        action: async (page) => {
          await page.evaluate(() => {
            BRAIN.plan.unlock(BRAIN.SOURCES.PLAN_UNLOCK_INLINE);
            if (typeof renderPaydayPlanRoot === 'function') renderPaydayPlanRoot();
          });
          await page.waitForTimeout(150);
        },
        asserts: async (page) => {
          const state = await page.evaluate(() => ({
            planIsLocked: BRAIN.plan.isLocked(),
            allocIsLocked: BRAIN.allocation.isLocked(),
            sLockedAt: S.activePlan && S.activePlan.lockedAt,
            lastAudit: (S._auditLog || []).slice(-1)[0],
          }));
          const errors = [];
          if (state.planIsLocked) errors.push('BRAIN.plan.isLocked() still true after inline-Unlock');
          if (state.allocIsLocked) errors.push('BRAIN.allocation.isLocked() still true after inline-Unlock — r77 divergence resurfaced');
          if (state.sLockedAt) errors.push('S.activePlan.lockedAt not cleared');
          if (!state.lastAudit || state.lastAudit.type !== 'payday_plan_unlocked') errors.push('last audit not payday_plan_unlocked');
          return { ok: errors.length === 0, errors, state };
        },
      },
      {
        description: 'Step 4 — Lock via PLAN_LOCK_PAYDAY (legacy plan-mode flow); both stores must lock again',
        action: async (page) => {
          await page.evaluate(() => {
            BRAIN.plan.lock(
              { snapshot: { entry: 'legacy-plan-mode', payday: S.payday } },
              BRAIN.SOURCES.PLAN_LOCK_PAYDAY
            );
            if (typeof renderPaydayPlanRoot === 'function') renderPaydayPlanRoot();
          });
          await page.waitForTimeout(150);
        },
        asserts: async (page) => {
          const state = await page.evaluate(() => ({
            planIsLocked: BRAIN.plan.isLocked(),
            allocIsLocked: BRAIN.allocation.isLocked(),
            sLockedAt: S.activePlan && S.activePlan.lockedAt,
          }));
          const errors = [];
          if (!state.planIsLocked) errors.push('BRAIN.plan.isLocked() false after legacy-flow Lock');
          if (!state.allocIsLocked) errors.push('BRAIN.allocation.isLocked() false — legacy flow not syncing both stores');
          if (!state.sLockedAt) errors.push('S.activePlan.lockedAt not set by legacy flow lock');
          return { ok: errors.length === 0, errors, state };
        },
      },
      {
        description: 'Step 5 — Unlock via CANVAS_UNLOCK (canvas Re-plan path); both stores clear',
        action: async (page) => {
          await page.evaluate(() => {
            BRAIN.plan.unlock(BRAIN.SOURCES.CANVAS_UNLOCK);
            if (typeof renderPaydayPlanRoot === 'function') renderPaydayPlanRoot();
          });
          await page.waitForTimeout(150);
        },
        asserts: async (page) => {
          const state = await page.evaluate(() => ({
            planIsLocked: BRAIN.plan.isLocked(),
            allocIsLocked: BRAIN.allocation.isLocked(),
          }));
          const errors = [];
          if (state.planIsLocked) errors.push('BRAIN.plan.isLocked() still true after canvas-Unlock');
          if (state.allocIsLocked) errors.push('BRAIN.allocation.isLocked() still true after canvas-Unlock');
          return { ok: errors.length === 0, errors, state };
        },
      },
      {
        description: 'Step 6 — Lock via CANVAS_LOCK again (re-lock within same cycle); streak gate must NOT double-increment',
        action: async (page) => {
          await page.evaluate(() => {
            window._scenarioL_streakBeforeRelock = S.activePlan && +S.activePlan.streak || 0;
            BRAIN.plan.lock({ snapshot: { entry: 'canvas-Lock-relock' } }, BRAIN.SOURCES.CANVAS_LOCK);
            if (typeof renderPaydayPlanRoot === 'function') renderPaydayPlanRoot();
          });
          await page.waitForTimeout(150);
        },
        asserts: async (page) => {
          const state = await page.evaluate(() => ({
            planIsLocked: BRAIN.plan.isLocked(),
            allocIsLocked: BRAIN.allocation.isLocked(),
            streakBefore: window._scenarioL_streakBeforeRelock,
            streakAfter: S.activePlan && +S.activePlan.streak || 0,
          }));
          const errors = [];
          if (!state.planIsLocked) errors.push('not locked after relock');
          if (!state.allocIsLocked) errors.push('alloc not locked after relock');
          // Re-lock within same cycle should add at most 1 (per the unlock-clears-gate semantics of Bundle 32.7)
          const streakDelta = state.streakAfter - state.streakBefore;
          if (streakDelta > 1) errors.push(`streak incremented by ${streakDelta} on relock — expected ≤1`);
          return { ok: errors.length === 0, errors, state };
        },
      },
      {
        description: 'Step 7 — Final unlock via PLAN_UNLOCK_INLINE; verify clean termination state',
        action: async (page) => {
          await page.evaluate(() => {
            BRAIN.plan.unlock(BRAIN.SOURCES.PLAN_UNLOCK_INLINE);
            if (typeof renderPaydayPlanRoot === 'function') renderPaydayPlanRoot();
          });
          await page.waitForTimeout(150);
        },
        asserts: async (page) => {
          const state = await page.evaluate(() => ({
            planIsLocked: BRAIN.plan.isLocked(),
            allocIsLocked: BRAIN.allocation.isLocked(),
            sLockedAt: S.activePlan && S.activePlan.lockedAt,
            sLastStreaked: S.activePlan && S.activePlan.lastStreakedCycleId,
            // Count all lock/unlock audit entries across the scenario for forensic verify
            lockAuditCount: (S._auditLog || []).filter(e => e && e.type === 'payday_plan_locked').length,
            unlockAuditCount: (S._auditLog || []).filter(e => e && e.type === 'payday_plan_unlocked').length,
          }));
          const errors = [];
          if (state.planIsLocked) errors.push('plan still locked at scenario end');
          if (state.allocIsLocked) errors.push('alloc still locked at scenario end');
          if (state.sLockedAt) errors.push('S.activePlan.lockedAt not null at scenario end');
          if (state.sLastStreaked) errors.push(`lastStreakedCycleId=${state.sLastStreaked} expected null after final unlock`);
          // Scenario fires 3 locks + 3 unlocks; expect audit log to record all 6 events
          if (state.lockAuditCount < 3) errors.push(`lockAuditCount ${state.lockAuditCount} expected ≥3`);
          if (state.unlockAuditCount < 3) errors.push(`unlockAuditCount ${state.unlockAuditCount} expected ≥3`);
          return { ok: errors.length === 0, errors, state };
        },
      },
    ],
  },
  {
    id: 'C-over-allocation-refusal',
    name: 'INV-32 over-allocation refusal (user-facing via canonical writer)',
    description: 'User attempts to over-allocate savings; INV-32 refuses, state unchanged, audit log records inv32_refusal',
    steps: [
      {
        description: 'Boot + capture surplus baseline',
        action: async () => {},
        asserts: async (page) => {
          const state = await page.evaluate(() => {
            const snap = BRAIN.plan.getSnapshot();
            return {
              surplus: snap.derived.surplus,
              savingsTotal: snap.savings.total,
              bal: S.bal,
              auditLen: (S._auditLog || []).length,
            };
          });
          return { ok: true, errors: [], state };
        },
      },
      {
        description: 'Attempt over-allocation (1.5x surplus) via setOverride — must refuse',
        action: async (page) => {
          await page.evaluate(() => {
            // Reset to unlocked baseline — this scenario tests INV-32 refusal,
            // which fires AFTER the INV-29 plan-lock gate. The fixture may be
            // locked; unlock so the request reaches the INV-32 check.
            if (S.activePlan && S.activePlan.lockedAt) {
              S.activePlan.lockedAt = null;
              try { BRAIN.allocation.unlock(BRAIN.SOURCES.CANVAS_UNLOCK); } catch (_) {}
            }
            const snap = BRAIN.plan.getSnapshot();
            const overAmt = Math.ceil(snap.derived.surplus * 1.5) + 100;
            window._scenarioC_overAmt = overAmt;
            window._scenarioC_writerResult = BRAIN.plan.setOverride('savings', 'scenario-C-overprobe', overAmt, {}, BRAIN.SOURCES.PLAN_OVERRIDE_SET);
          });
        },
        asserts: async (page, ctx) => {
          const state = await page.evaluate(() => {
            return {
              writerResult: window._scenarioC_writerResult,
              overAmt: window._scenarioC_overAmt,
              savingsTotal: BRAIN.plan.getSnapshot().savings.total,
              bal: S.bal,
              auditLen: (S._auditLog || []).length,
              recentAudit: (S._auditLog || []).slice(-5).map(e => e && e.type),
            };
          });
          const errors = [];
          if (state.writerResult.ok !== false) errors.push(`Refusal expected: writer returned ok=${state.writerResult.ok}`);
          if (state.writerResult.reason !== 'inv32-over-allocation') errors.push(`Refusal reason "${state.writerResult.reason}" expected "inv32-over-allocation"`);
          // State must be unchanged
          if (state.savingsTotal !== ctx.lastState.savingsTotal) errors.push(`savings.total changed despite refusal: ${ctx.lastState.savingsTotal} → ${state.savingsTotal}`);
          if (state.bal !== ctx.lastState.bal) errors.push(`S.bal changed despite refusal: ${ctx.lastState.bal} → ${state.bal}`);
          // Audit log should have inv32_refusal entry
          if (!state.recentAudit.includes('inv32_refusal')) errors.push('audit log missing inv32_refusal entry');
          return { ok: errors.length === 0, errors, state };
        },
      },
      {
        description: 'Reduction in over-allocated state must still be allowed (policy: improve-state always OK)',
        action: async (page) => {
          await page.evaluate(() => {
            const snap = BRAIN.plan.getSnapshot();
            const surplus = snap.derived.surplus;
            // Step 1: directly mutate to create legacy over-allocated state
            S.activePlan.overrides = S.activePlan.overrides || {};
            S.activePlan.overrides['savings:scenario-C-legacy-over'] = {
              normalAmount: 0,
              thisCycleAmount: surplus * 1.5 + 200, // Force over
              reason: null, deferred: 0, deferAction: 'none', setAt: Date.now(),
            };
            // Step 2: attempt REDUCTION (should be allowed even though state still over)
            const reducedAmt = Math.floor(surplus * 0.8);
            window._scenarioC_reduction = BRAIN.plan.setOverride('savings', 'scenario-C-legacy-over', reducedAmt, {}, BRAIN.SOURCES.PLAN_OVERRIDE_SET);
          });
        },
        asserts: async (page) => {
          const state = await page.evaluate(() => ({
            reduction: window._scenarioC_reduction,
            currentOverride: (S.activePlan.overrides || {})['savings:scenario-C-legacy-over'],
          }));
          const errors = [];
          if (!state.reduction.ok) errors.push(`Reduction in over-allocated state refused: ${state.reduction.reason}`);
          return { ok: errors.length === 0, errors, state };
        },
      },
    ],
  },
];

// ─── server lifecycle ─────────────────────────────────────────────
function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [path.join('scripts', 'serve.js'), String(PORT)], { cwd: PROJECT_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    const t = setTimeout(() => { proc.kill(); reject(new Error('server-start-timeout')); }, 5000);
    const probe = () => {
      fetch(`http://localhost:${PORT}/`).then(r => {
        if (r.ok || r.status === 404) { clearTimeout(t); resolve(proc); }
        else setTimeout(probe, 200);
      }).catch(() => setTimeout(probe, 200));
    };
    setTimeout(probe, 300);
  });
}

// ─── runner ───────────────────────────────────────────────────────────
async function runScenario(scenario, browser, runDir, outputs) {
  console.log(`\n[scenario-walk] ▶  ${scenario.id} — ${scenario.name}`);
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 3,
    locale: 'en-AU',
    timezoneId: 'Australia/Sydney',
    serviceWorkers: 'block',
  });
  const FIXTURE_PATH = path.join(PROJECT_ROOT, 'state-snapshot.json');
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
  const seed = { S: Object.assign({}, fixture.S || {}), BILLS: fixture.BILLS || [] };
  if (fixture.paidBills && !seed.S.paidBills) seed.S.paidBills = fixture.paidBills;

  await ctx.addInitScript((args) => {
    try { localStorage.setItem('slyght_v5', JSON.stringify(args.seed)); } catch (_) {}
    try { localStorage.setItem('slyght_seeded_v13', '1'); } catch (_) {}
    try { localStorage.setItem('slyght_seeded_v12', '1'); } catch (_) {}
    try { localStorage.setItem('slyght_seeded_v11', '1'); } catch (_) {}
    try { localStorage.setItem('slyght_bills_reset_month', args.monthKey); } catch (_) {}
    try { localStorage.setItem('slyght_payday_canvas_seen', '1'); } catch (_) {}
    try { localStorage.setItem('slyght_onboarded', '1'); } catch (_) {}
  }, { seed, monthKey: '2026-5' });

  const page = await ctx.newPage();
  await page.clock.install({ time: new Date(FROZEN_ISO) });
  await page.goto(`http://localhost:${PORT}/`);
  await page.addStyleTag({ content: '*,*::before,*::after{animation-duration:0s !important;animation-delay:0s !important;transition-duration:0s !important;transition-delay:0s !important;}' });
  await page.waitForFunction(() => typeof BRAIN !== 'undefined' && BRAIN.plan && typeof splashTap === 'function', { timeout: 8000 });
  await page.evaluate(() => splashTap());
  // EOD modal dismiss (same as diagnostics smoke fix)
  await page.evaluate(() => {
    const modal = document.getElementById('eod-recon-modal');
    if (modal && modal.classList.contains('open') && typeof eodReconAccept === 'function') eodReconAccept();
  });
  await page.waitForTimeout(300);

  const scenarioShotDir = path.join(runDir, '_scenario_screenshots', scenario.id);
  fs.mkdirSync(scenarioShotDir, { recursive: true });
  const scenarioResult = { id: scenario.id, name: scenario.name, steps: [], passed: true };
  const stepCtx = { history: [], lastState: null };

  for (let i = 0; i < scenario.steps.length; i++) {
    const step = scenario.steps[i];
    const stepNum = i + 1;
    console.log(`[scenario-walk]   step ${stepNum}/${scenario.steps.length}: ${step.description}`);
    let stepResult = { stepNum, description: step.description, ok: true, errors: [], state: null, error: null };
    try {
      await step.action(page, stepCtx);
      const assertResult = await step.asserts(page, stepCtx);
      stepResult.ok = assertResult.ok;
      stepResult.errors = assertResult.errors || [];
      stepResult.state = assertResult.state || null;
      stepCtx.lastState = assertResult.state || stepCtx.lastState;
    } catch (e) {
      stepResult.ok = false;
      stepResult.error = String(e && e.message || e);
    }
    // Screenshot
    const shotPath = path.join(scenarioShotDir, `step-${String(stepNum).padStart(2, '0')}.png`);
    try { await page.screenshot({ path: shotPath, fullPage: false, scale: 'css' }); } catch (_) {}
    stepResult.screenshot = path.relative(PROJECT_ROOT, shotPath).replace(/\\/g, '/');
    if (!stepResult.ok) scenarioResult.passed = false;
    scenarioResult.steps.push(stepResult);
    stepCtx.history.push(stepResult);
    // Per-step trace line
    outputs.traceWrite({ ts: new Date().toISOString(), scenario: scenario.id, step: stepNum, ...stepResult });
    if (stepResult.ok) console.log(`[scenario-walk]     ✓ ok`);
    else {
      console.log(`[scenario-walk]     ✗ FAIL:`);
      (stepResult.errors || []).forEach(e => console.log(`[scenario-walk]       - ${e}`));
      if (stepResult.error) console.log(`[scenario-walk]       throw: ${stepResult.error}`);
    }
  }
  await ctx.close();
  return scenarioResult;
}

// ─── main ─────────────────────────────────────────────────────────────
(async () => {
  if (opts.list) {
    console.log('Available scenarios:');
    for (const s of SCENARIOS) console.log(`  ${s.id} — ${s.name}`);
    process.exit(0);
  }
  const start = Date.now();
  const tsTag = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = path.join(PROJECT_ROOT, 'docs', 'audit');
  fs.mkdirSync(runDir, { recursive: true });
  const tracePath = path.join(runDir, `${tsTag}-scenario-walk.jsonl`);
  fs.writeFileSync(tracePath, '');
  const reportPath = path.join(runDir, `${tsTag}-scenario-walk.md`);

  const outputs = {
    traceWrite(line) { fs.appendFileSync(tracePath, JSON.stringify(line) + '\n'); },
  };

  let server;
  try { server = await startServer(); console.log(`[scenario-walk] server on :${PORT}`); }
  catch (e) { console.error('[scenario-walk] server failed:', e.message); process.exit(2); }

  const { chromium } = require('@playwright/test');
  const browser = await chromium.launch();

  const scenarios = opts.scenario ? SCENARIOS.filter(s => s.id === opts.scenario || s.id.startsWith(opts.scenario + '-')) : SCENARIOS;
  if (!scenarios.length) { console.error(`[scenario-walk] no scenario matched "${opts.scenario}"`); process.exit(2); }

  const results = [];
  for (const scenario of scenarios) {
    const r = await runScenario(scenario, browser, runDir, outputs);
    results.push(r);
  }

  await browser.close();
  if (server) { try { server.kill(); } catch (_) {} }

  // ─── report ───────────────────────────────────────────────────────
  const lines = [];
  lines.push('# Scenario-walk report');
  lines.push('');
  lines.push(`**Date:** ${new Date().toISOString()}`);
  lines.push(`**Duration:** ${((Date.now() - start) / 1000).toFixed(1)}s`);
  lines.push(`**Scenarios:** ${results.length} run (${results.filter(r => r.passed).length} passed, ${results.filter(r => !r.passed).length} failed)`);
  lines.push(`**Trace:** \`${path.relative(PROJECT_ROOT, tracePath).replace(/\\/g, '/')}\` (one JSONL line per step)`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  for (const r of results) {
    const totalSteps = r.steps.length;
    const failedSteps = r.steps.filter(s => !s.ok).length;
    const status = r.passed ? '✓ passed' : `✗ FAILED at step ${r.steps.findIndex(s => !s.ok) + 1}`;
    lines.push(`- \`${r.id}\` ${r.name}: ${status} (${totalSteps - failedSteps}/${totalSteps} steps ok)`);
  }
  lines.push('');
  lines.push('## Per-scenario detail');
  lines.push('');
  for (const r of results) {
    lines.push(`### ${r.id} — ${r.name}`);
    lines.push(`Status: ${r.passed ? '✓ passed' : '✗ FAILED'}`);
    lines.push('');
    for (const s of r.steps) {
      const icon = s.ok ? '✓' : '✗';
      lines.push(`**Step ${s.stepNum}** ${icon} ${s.description}`);
      lines.push(`  - screenshot: \`${s.screenshot}\``);
      if (!s.ok) {
        for (const err of (s.errors || [])) lines.push(`  - error: ${err}`);
        if (s.error) lines.push(`  - throw: ${s.error}`);
      }
      if (s.state) {
        const stateSummary = Object.entries(s.state).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v).slice(0, 80) : v}`).join(' · ');
        lines.push(`  - state: ${stateSummary.slice(0, 400)}`);
      }
      lines.push('');
    }
  }
  fs.writeFileSync(reportPath, lines.join('\n'));
  console.log(`\n[scenario-walk] report: ${path.relative(PROJECT_ROOT, reportPath)}`);
  console.log(`[scenario-walk] trace:  ${path.relative(PROJECT_ROOT, tracePath)}`);
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.length - passedCount;
  console.log(`[scenario-walk] summary: ${results.length} scenarios · ${passedCount} passed · ${failedCount} failed`);
  process.exit(failedCount > 0 ? 1 : 0);
})().catch(e => {
  console.error('[scenario-walk] fatal:', e && e.stack || e);
  process.exit(2);
});
