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
        description: 'Audit BRAIN.plan surface — flag missing canonical lock/unlock writers',
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
              isLocked: !!(S.activePlan && S.activePlan.lockedAt),
            };
          });
          const errors = [];
          if (!state.hasTickItem) errors.push('BRAIN.plan.tickItem missing — Bundle 27 canonical writer expected');
          if (!state.hasUntickItem) errors.push('BRAIN.plan.untickItem missing');
          // NOTE: lock/unlock canonical-writer absence is FRAMEWORK GAP, not a hard fail
          // (codebase uses direct S.activePlan.lockedAt mutation at 4+ call sites).
          // Scenario records the gap for the architecture report.
          return { ok: errors.length === 0, errors, state };
        },
      },
      {
        description: 'Lock plan via direct S.activePlan.lockedAt = Date.now() (mirrors openPaydayLockPlan codepath)',
        action: async (page) => {
          await page.evaluate(() => {
            const t = Date.now();
            S.activePlan = S.activePlan || {};
            S.activePlan.lockedAt = t;
            // Mirror the audit-log entry that the canvas Lock button emits
            if (BRAIN && BRAIN.audit && typeof BRAIN.audit.append === 'function') {
              BRAIN.audit.append({ type: 'payday_plan_locked', source: 'scenario_d_walk', ts: t });
            }
            window._scenarioD_lockedAt = t;
          });
        },
        asserts: async (page) => {
          const state = await page.evaluate(() => ({
            isLocked: !!BRAIN.plan.getSnapshot().lockedAt,
            lockedAtSeen: BRAIN.plan.getSnapshot().lockedAt,
            recentAudit: (S._auditLog || []).slice(-2).map(e => e && e.type),
          }));
          const errors = [];
          if (!state.isLocked) errors.push('snap.lockedAt not picked up after direct set');
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
        description: 'Unlock plan via direct S.activePlan.lockedAt=null; verify balance/txns preserved',
        action: async (page) => {
          await page.evaluate(() => {
            window._scenarioD_unlockBefore = { bal: S.bal, txnCount: (S.txns || []).length };
            S.activePlan.lockedAt = null;
            if (BRAIN.audit && BRAIN.audit.append) {
              BRAIN.audit.append({ type: 'payday_plan_unlocked', source: 'scenario_d_walk', ts: Date.now() });
            }
          });
        },
        asserts: async (page) => {
          const state = await page.evaluate(() => ({
            isLocked: !!BRAIN.plan.getSnapshot().lockedAt,
            balBefore: window._scenarioD_unlockBefore.bal,
            balAfter: S.bal,
            txnsBefore: window._scenarioD_unlockBefore.txnCount,
            txnsAfter: (S.txns || []).length,
            recentAudit: (S._auditLog || []).slice(-2).map(e => e && e.type),
          }));
          const errors = [];
          if (state.isLocked) errors.push('snap.lockedAt still truthy after unlock');
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
