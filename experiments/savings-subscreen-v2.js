// ============================================================================
// slyght/experiments/savings-subscreen-v2.js
// ============================================================================
// PILOT REWRITE — "future architecture" for Bundle 28.3 Savings sub-screen.
// Not loaded by index.html. Reference implementation for Bundle 28.3 ship.
//
// What this demonstrates:
//   1. PLAN.intents canonical entity (replaces 3× duplicate China)
//   2. BRAIN.plan.intent.* writers (canonical mutation surface)
//   3. _paydayProgressBar — reusable progress component
//   4. _paydaySavingsRow — extends _paydayRow with embedded progress
//   5. _paydayCollapseStrip — collapsible section pattern
//   6. queryAllocationGhost — pure, re-callable on every keystroke
//   7. The "every number tappable" P1 principle via .explorable spans
//   8. Empty-state branches
//
// Migration target: index.html L8701-8827 (current renderPaydaySavings) and
// the BRAIN.plan namespace. See REWRITE-COMPARISON-2026-05-13.md §migration.
//
// Conventions:
//   - All writers take `source` as last arg, validated against BRAIN._SOURCE_SET
//   - All writers append to BRAIN.audit
//   - All reads are pure (no side effects)
//   - All renders return HTML strings; no direct DOM writes inside helpers
//   - Naming: BRAIN.plan.intent.{add,update,remove,get,list,byKind,byBucket}
// ============================================================================

// ─── 1. PLAN.intents schema + writers ──────────────────────────────────────
//
// One intent = one purpose. Multiple intents can share a bucket (savings pile).
// The bucket holds the money; the intent describes why it exists.
// Trips, Goals, Annual Provisions all become filtered views over intents.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Intent shape — what gets stored in S.planIntents[].
 * @typedef {Object} Intent
 * @property {string}  id            Stable kebab-case identifier (never mutates)
 * @property {string}  name          User-editable display name
 * @property {string}  emoji         User-editable
 * @property {string}  kind          'trip' | 'goal' | 'provision' | 'buffer'
 * @property {number}  targetAmount  Dollars
 * @property {string=} startDate     'YYYY-MM-DD' — optional; required for trips + dated provisions
 * @property {string=} endDate       'YYYY-MM-DD' — optional; required for trips
 * @property {string}  bucketId      FK → S.savingsBuckets[].id (or .name for legacy)
 * @property {string}  category      Free-text taxonomy (travel/vehicle/health/etc.)
 * @property {string}  notes
 * @property {number}  priority      1=high → 5=low; used by auto-allocate
 * @property {boolean} archived      Soft-delete flag
 * @property {number}  createdAt     Epoch ms
 * @property {number}  updatedAt     Epoch ms
 */

BRAIN.plan.intent = {
  // ── Reads (pure) ──

  /** Get one intent by id. Returns null if not found or archived. */
  get(id) {
    const list = S.planIntents || [];
    const i = list.find(x => x.id === id);
    return (i && !i.archived) ? i : null;
  },

  /** List intents with optional filters. Default: non-archived only. */
  list({ kind, archived = false, bucketId } = {}) {
    const list = S.planIntents || [];
    return list.filter(i =>
      (archived === null || !!i.archived === !!archived) &&
      (!kind || i.kind === kind) &&
      (!bucketId || i.bucketId === bucketId)
    );
  },

  /** Convenience: all non-archived intents of one kind. */
  byKind(kind) { return this.list({ kind }); },

  /** Convenience: all intents pulling from one bucket. */
  byBucket(bucketId) { return this.list({ bucketId }); },

  // ── Writes (canonical; every one logs to BRAIN.audit) ──

  /** Add a new intent. Returns { ok, id, reason? }. */
  add(intentLike, source) {
    if (!source || !BRAIN._SOURCE_SET.has(source)) {
      return { ok: false, reason: 'unknown-source:' + source };
    }
    const required = ['name', 'kind', 'targetAmount', 'bucketId'];
    for (const k of required) {
      if (intentLike[k] === undefined || intentLike[k] === null) {
        return { ok: false, reason: 'missing-field:' + k };
      }
    }
    if (!['trip', 'goal', 'provision', 'buffer'].includes(intentLike.kind)) {
      return { ok: false, reason: 'invalid-kind:' + intentLike.kind };
    }
    const id = intentLike.id || _slugifyName(intentLike.name);
    if (this.get(id)) return { ok: false, reason: 'id-exists:' + id };

    const now = Date.now();
    const intent = {
      id,
      name: intentLike.name,
      emoji: intentLike.emoji || _defaultEmojiForKind(intentLike.kind),
      kind: intentLike.kind,
      targetAmount: +intentLike.targetAmount,
      startDate: intentLike.startDate || null,
      endDate: intentLike.endDate || null,
      bucketId: intentLike.bucketId,
      category: intentLike.category || '',
      notes: intentLike.notes || '',
      priority: intentLike.priority || 3,
      archived: false,
      createdAt: now,
      updatedAt: now,
    };

    if (!S.planIntents) S.planIntents = [];
    S.planIntents.push(intent);

    BRAIN.audit.append({
      type: 'plan_intent_added',
      intentId: id,
      kind: intent.kind,
      targetAmount: intent.targetAmount,
      bucketId: intent.bucketId,
      src: source,
      ts: now,
    });

    try { save(); } catch (_) {}
    return { ok: true, id };
  },

  /** Patch an existing intent. Unknown fields rejected. Returns { ok, reason? }. */
  update(id, patch, source) {
    if (!source || !BRAIN._SOURCE_SET.has(source)) {
      return { ok: false, reason: 'unknown-source:' + source };
    }
    const intent = this.get(id);
    if (!intent) return { ok: false, reason: 'not-found:' + id };

    const allowed = ['name', 'emoji', 'targetAmount', 'startDate', 'endDate',
                     'bucketId', 'category', 'notes', 'priority'];
    const applied = {};
    for (const k of Object.keys(patch)) {
      if (!allowed.includes(k)) {
        return { ok: false, reason: 'unknown-field:' + k };
      }
      applied[k] = patch[k];
    }

    Object.assign(intent, applied, { updatedAt: Date.now() });

    BRAIN.audit.append({
      type: 'plan_intent_updated',
      intentId: id,
      patch: applied,
      src: source,
      ts: Date.now(),
    });

    try { save(); } catch (_) {}
    return { ok: true };
  },

  /** Soft-delete (archive). Never hard-deletes — historical reference preserved. */
  remove(id, source) {
    return this.update(id, { /* sentinel handled below */ }, source) &&
           this._archive(id, source);
  },

  _archive(id, source) {
    const intent = this.get(id);
    if (!intent) return { ok: false, reason: 'not-found:' + id };
    intent.archived = true;
    intent.updatedAt = Date.now();
    BRAIN.audit.append({
      type: 'plan_intent_archived',
      intentId: id,
      src: source,
      ts: Date.now(),
    });
    try { save(); } catch (_) {}
    return { ok: true };
  },

  /** Re-link an intent to a different bucket. Used when consolidating sinking funds. */
  setBucket(id, bucketId, source) {
    return this.update(id, { bucketId }, source);
  },
};

// Helpers (file-local).
function _slugifyName(name) {
  return String(name).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function _defaultEmojiForKind(kind) {
  return ({ trip: '✈️', goal: '🎯', provision: '🚗', buffer: '🛡️' })[kind] || '💰';
}

// ─── 2. queryAllocationGhost — pure, re-callable on every keystroke ───────
//
// When the user types an amount in the editor, the renderer wants to show:
//   - Pool shrinks by the proposed amount (live)
//   - Intent grows by the proposed amount (live)
//   - Pace projection updates ("at this rate, ready by 12 Jul")
//   - Daily-living squeeze warning if floor breached
//
// This fn is pure. It takes (intentId, proposedAmount) and returns a snapshot
// of "what would the world look like if you committed this?" — without
// committing. The renderer calls it on every `oninput` event.
// ─────────────────────────────────────────────────────────────────────────

BRAIN.plan.queryAllocationGhost = function(intentId, proposedAmount) {
  const intent = BRAIN.plan.intent.get(intentId);
  if (!intent) return { error: 'unknown-intent' };

  const snap = BRAIN.plan.getSnapshot();
  const bucket = (BRAIN.savings.getBuckets() || [])
    .find(b => b.id === intent.bucketId || b.name === intent.bucketId);

  const amt = Math.max(0, +proposedAmount || 0);
  const poolBefore = +snap.derived.freeTotal || 0;
  const poolAfter = poolBefore - amt;

  const savedBefore = +(bucket && bucket.saved) || 0;
  const savedAfter = savedBefore + amt;
  const target = +intent.targetAmount || 0;
  const pctBefore = target ? Math.round(savedBefore / target * 100) : 0;
  const pctAfter = target ? Math.round(savedAfter / target * 100) : 0;

  // Pace projection: at the current $/cycle (this proposed amount), when does
  // the intent's target get hit?
  let paceMatch = null;
  let projectedCompletionDate = null;
  if (amt > 0 && target > savedAfter) {
    const cyclesRemaining = Math.ceil((target - savedAfter) / amt);
    const daysPerCycle = +snap.daysInCycle || 14;
    const projectedMs = Date.now() + cyclesRemaining * daysPerCycle * 86400000;
    projectedCompletionDate = new Date(projectedMs).toISOString().slice(0, 10);
    if (intent.endDate) {
      paceMatch = projectedMs <= new Date(intent.endDate).getTime();
    }
  }

  // Daily-living squeeze check
  const dailyFloor = +snap.dailyLiving.floor || 30;
  const daysInCycle = +snap.daysInCycle || 14;
  const dailyAfterPool = (poolAfter / daysInCycle) | 0;
  const squeezesDailyLiving = dailyAfterPool < dailyFloor;

  return {
    poolBefore, poolAfter,
    savedBefore, savedAfter,
    pctBefore, pctAfter,
    paceMatch, projectedCompletionDate,
    squeezesDailyLiving,
    dailyAfterPool, dailyFloor,
  };
};

// ─── 3. _paydayProgressBar — reusable progress component ──────────────────
//
// Used by:
//   - Pool-to-allocate header (shrinks as user allocates)
//   - Per-intent rows (lifetime fill + optional ghost segment for pending alloc)
//
// CSS-only (no SVG). Inline styles for now; ARCHITECTURE.md candidate for
// moving to a stylesheet rule .pb-{fill,ghost} once stabilised.
// ─────────────────────────────────────────────────────────────────────────

function _paydayProgressBar(opts) {
  // opts: { saved, target, ghost = 0, color = 'var(--green)', height = 8, label }
  const target = Math.max(1, +opts.target || 0);
  const saved = Math.max(0, +opts.saved || 0);
  const ghost = Math.max(0, +opts.ghost || 0);
  const fillPct = Math.min(100, Math.round((saved / target) * 100));
  const ghostPct = Math.min(100 - fillPct, Math.round((ghost / target) * 100));
  const color = opts.color || 'var(--green)';
  const height = opts.height || 8;
  return (
    '<div class="pb-container" style="position:relative;width:100%;height:' + height +
      'px;background:var(--bg3);border-radius:' + (height / 2) + 'px;overflow:hidden;margin:4px 0">' +
      '<span class="pb-fill" style="position:absolute;left:0;top:0;height:100%;width:' + fillPct +
        '%;background:' + color + ';transition:width 0.3s ease-out"></span>' +
      (ghost > 0
        ? '<span class="pb-ghost" style="position:absolute;left:' + fillPct +
          '%;top:0;height:100%;width:' + ghostPct + '%;background:' + color +
          ';opacity:0.4;transition:width 0.15s ease-out"></span>'
        : '') +
    '</div>' +
    (opts.label ? '<div class="pb-label" style="font-size:11px;color:var(--text3);margin-top:2px">' + opts.label + '</div>' : '')
  );
}

// ─── 4. _paydaySavingsRow — extends _paydayRow with progress bar ──────────
//
// Existing _paydayRow (L8504) takes: { ticked, icon, name, sub, value, onTap, onTickTap }
// This new helper wraps _paydayRow + appends a progress bar below the row.
// ─────────────────────────────────────────────────────────────────────────

function _paydaySavingsRow(opts) {
  // opts: { intent, savedAmount, ghostThisCycle, onTap, onTickTap, ticked }
  const intent = opts.intent;
  const saved = +opts.savedAmount || 0;
  const ghost = +opts.ghostThisCycle || 0;
  const target = +intent.targetAmount || 0;
  const pct = target ? Math.round(saved / target * 100) : 0;

  // Sub-line: "$X of $Y (Z%)" · "in N days" (if endDate)
  const subParts = [];
  if (target > 0) {
    subParts.push('$' + Math.round(saved).toLocaleString() + ' of $' +
                  Math.round(target).toLocaleString() + ' (' + pct + '%)');
  }
  if (intent.endDate) {
    const days = Math.max(1, Math.round((new Date(intent.endDate).getTime() - Date.now()) / 86400000));
    subParts.push('in ' + days + ' days');
  }

  const baseRow = _paydayRow({
    ticked: !!opts.ticked,
    icon: intent.emoji,
    name: intent.name,
    sub: subParts.join(' · '),
    value: '$' + Math.round(ghost).toLocaleString(),
    onTap: opts.onTap,
    onTickTap: opts.onTickTap,
  });

  // Append the progress bar inside the row's <button>. We do this by splicing
  // before the closing </button>. (Cleaner: refactor _paydayRow to accept a
  // `belowSub` slot — see migration doc.)
  const bar = _paydayProgressBar({
    saved, target, ghost, color: 'var(--green)',
    label: ghost > 0 ? ('+' + ghost.toLocaleString() + ' ghost') : null,
  });
  return baseRow.replace('</button>', bar + '</button>');
}

// ─── 5. _paydayCollapseStrip — collapsible section ────────────────────────
//
// Used by:
//   - Bills sub-screen: paid items collapsed at bottom (Bundle 28.4)
//   - Future: "see all" toggles when section list exceeds 10
//
// Internal state stored in DOM (data-attr) — no JS state machine. Closes on
// next re-render unless the user has explicitly opened it via tap.
// ─────────────────────────────────────────────────────────────────────────

function _paydayCollapseStrip(opts) {
  // opts: { id, summary, expandedHtml, defaultOpen = false }
  const id = opts.id;
  const expandedId = id + '-content';
  const defaultOpen = !!opts.defaultOpen;
  return (
    '<div class="payday-collapse" data-open="' + defaultOpen + '" style="margin-top:8px">' +
      '<button class="settings-edit-row" onclick="_paydayCollapseToggle(\'' + id + '\')" ' +
        'style="padding:10px 14px;background:var(--bg2);width:100%;border-radius:10px">' +
        '<span class="row-multi">' +
          '<span style="font-size:13px;color:var(--text2)">' + opts.summary + '</span>' +
        '</span>' +
        '<span class="row-chevron">' + (defaultOpen ? '▾' : '▸') + '</span>' +
      '</button>' +
      '<div id="' + expandedId + '" style="display:' + (defaultOpen ? 'block' : 'none') + ';padding-top:8px">' +
        opts.expandedHtml +
      '</div>' +
    '</div>'
  );
}

function _paydayCollapseToggle(id) {
  const wrapper = document.querySelector('.payday-collapse[data-open]');
  if (!wrapper) return;
  const content = document.getElementById(id + '-content');
  const chevron = wrapper.querySelector('.row-chevron');
  if (!content) return;
  const isOpen = content.style.display !== 'none';
  content.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.textContent = isOpen ? '▸' : '▾';
  wrapper.dataset.open = String(!isOpen);
}

// ─── 6. renderPaydaySavings — rewritten ────────────────────────────────────
//
// Future shape:
//   1. Pool to allocate (with live-shrinking progress bar)
//   2. Upcoming (intents within 90 days, sorted by endDate ASC)
//   3. Long-term goals (intents without near deadline, sorted by % complete ASC)
//   4. Extra debt (KIA Extra, now with full editor)
//
// Every number tappable to a "what's this made of?" modal via .explorable span.
// Empty-state branches added.
// ─────────────────────────────────────────────────────────────────────────

function renderPaydaySavings_v2() {
  const body = document.getElementById('payday-savings-body');
  if (!body) return;

  const snap = BRAIN.plan.getSnapshot();
  const allIntents = BRAIN.plan.intent.list();   // all non-archived
  const overrides = (S.activePlan && S.activePlan.overrides) || {};
  const ticks = (S.activePlan && S.activePlan.ticks && S.activePlan.ticks.savings) || {};
  const fmtC2 = (n) => '$' + Math.abs(Math.round(n)).toLocaleString();

  // Empty-state branch
  if (!allIntents.length) {
    body.innerHTML =
      '<div class="subscreen-placeholder">' +
        '<div style="font-size:32px;margin-bottom:8px">💰</div>' +
        '<div>Nothing to allocate yet.</div>' +
        '<div style="color:var(--text3);font-size:13px;margin-top:6px">' +
          'Add a goal, trip, or annual-provision in PLAN mode.' +
        '</div>' +
      '</div>';
    return;
  }

  let html = '';

  // ── (1) Pool to allocate ──
  const freeTotal = +snap.derived.freeTotal || 0;
  const allocated = +snap.savings.total || 0;
  html += '<div class="settings-group-title">Pool to allocate</div>';
  html += '<div class="settings-group-card" style="padding:14px 16px">';
  html += '<div style="font-family:var(--mono);font-size:20px;line-height:1.2">' +
            '<span class="explorable" onclick="explainNumber(\'free-this-cycle\')">' +
              '<strong>' + fmtC2(freeTotal) + '</strong>' +
            '</span> ' +
            '<span style="font-size:13px;color:var(--text3);font-weight:normal">' +
              'left to split across goals' +
            '</span>' +
          '</div>';
  html += _paydayProgressBar({
    saved: allocated,
    target: allocated + freeTotal,
    color: 'var(--amber)',
    height: 10,
  });
  html += '<div style="font-size:13px;color:var(--text3);margin-top:6px">' +
            'Already allocated this cycle: ' +
            '<span class="explorable" onclick="explainNumber(\'allocated-this-cycle\')">' +
              '<strong style="font-family:var(--mono);color:var(--text2)">' + fmtC2(allocated) + '</strong>' +
            '</span>' +
          '</div>';
  html += '</div>';

  // ── (2) Upcoming (within 90 days) ──
  const ninetyDaysMs = 90 * 86400000;
  const now = Date.now();
  const upcoming = allIntents
    .filter(i => i.endDate && (new Date(i.endDate).getTime() - now) < ninetyDaysMs && (new Date(i.endDate).getTime() > now))
    .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());

  if (upcoming.length) {
    html += '<div class="settings-group-title">Upcoming — within 3 months</div>';
    html += '<div class="settings-group-card">';
    upcoming.forEach(intent => {
      const bucket = BRAIN.savings.getBuckets().find(b =>
        b.id === intent.bucketId || b.name === intent.bucketId);
      const saved = +(bucket && bucket.saved) || 0;
      const overrideKey = 'savings:' + intent.id;
      const ov = overrides[overrideKey];
      const ghost = ov ? +ov.thisCycleAmount : 0;

      html += _paydaySavingsRow({
        intent, savedAmount: saved, ghostThisCycle: ghost,
        ticked: !!ticks[intent.id],
        onTap: 'openEditPaydayIntent(\'' + intent.id + '\')',
        onTickTap: snap.locked
          ? 'paydayTick(\'savings\', \'' + intent.id + '\', BRAIN.SOURCES.PLAN_SAVINGS_TICK)'
          : 'alert(\'' + _PAYDAY_TICK_HINT_PRE + '\')',
      });
    });
    html += '</div>';
  }

  // ── (3) Long-term goals ──
  const longTerm = allIntents
    .filter(i => !upcoming.includes(i) && (i.kind === 'goal' || i.kind === 'trip' || i.kind === 'buffer'))
    .sort((a, b) => {
      const aBucket = BRAIN.savings.getBuckets().find(x => x.id === a.bucketId || x.name === a.bucketId);
      const bBucket = BRAIN.savings.getBuckets().find(x => x.id === b.bucketId || x.name === b.bucketId);
      const aPct = a.targetAmount ? (((aBucket && aBucket.saved) || 0) / a.targetAmount) : 0;
      const bPct = b.targetAmount ? (((bBucket && bBucket.saved) || 0) / b.targetAmount) : 0;
      return bPct - aPct;  // higher % first (closer-to-done floats up — small dopamine)
    });

  if (longTerm.length) {
    html += '<div class="settings-group-title">Long-term goals</div>';
    html += '<div class="settings-group-card">';
    longTerm.forEach(intent => {
      const bucket = BRAIN.savings.getBuckets().find(b =>
        b.id === intent.bucketId || b.name === intent.bucketId);
      const saved = +(bucket && bucket.saved) || 0;
      const ov = overrides['savings:' + intent.id];
      const ghost = ov ? +ov.thisCycleAmount : 0;

      html += _paydaySavingsRow({
        intent, savedAmount: saved, ghostThisCycle: ghost,
        ticked: !!ticks[intent.id],
        onTap: 'openEditPaydayIntent(\'' + intent.id + '\')',
        onTickTap: snap.locked
          ? 'paydayTick(\'savings\', \'' + intent.id + '\', BRAIN.SOURCES.PLAN_SAVINGS_TICK)'
          : 'alert(\'' + _PAYDAY_TICK_HINT_PRE + '\')',
      });
    });
    html += '</div>';
  }

  // ── (4) Extra debt (KIA Extra) — no longer a stub ──
  const kiaCarloan = +S.carloan || 0;
  if (kiaCarloan > 0) {
    html += '<div class="settings-group-title">Extra debt — KIA loan</div>';
    html += '<div class="settings-group-card">';
    const key = 'kia-extra:KIA';
    const ov = overrides[key];
    const ghost = ov ? +ov.thisCycleAmount : 0;
    html += _paydayRow({
      ticked: !!(((S.activePlan && S.activePlan.ticks && S.activePlan.ticks['kia-extra']) || {})['KIA']),
      icon: '🚗',
      name: 'KIA extra',
      sub: 'over the minimum · ' + Math.round(kiaCarloan).toLocaleString() + ' remaining',
      value: '$' + Math.round(ghost).toLocaleString(),
      onTap: "openEditPaydayKiaExtra()",     // ← actual editor, not alert stub
      onTickTap: "paydayTick('kia-extra', 'KIA', BRAIN.SOURCES.PLAN_KIA_EXTRA_TICK)",
    });
    html += '</div>';
  }

  body.innerHTML = html;
}

// ─── 7. KIA Extra editor — replaces alert() stub at index.html:8818 ──────

function openEditPaydayKiaExtra() {
  const ov = (S.activePlan && S.activePlan.overrides && S.activePlan.overrides['kia-extra:KIA']) || null;
  const current = ov ? +ov.thisCycleAmount : 0;
  const minimum = +S.kiaMinPayment || 200;

  EDIT_MODAL.openCustom({
    title: 'Extra payment toward KIA loan',
    inputs: [
      { id: 'kia-extra-amt', label: 'Extra amount this cycle ($)', type: 'number',
        value: String(current), placeholder: '0', min: 0 }
    ],
    onSave: (vals) => {
      const amt = +vals['kia-extra-amt'] || 0;
      if (amt === 0) {
        BRAIN.plan.clearOverride('kia-extra', 'KIA', BRAIN.SOURCES.PLAN_OVERRIDE_CLEAR);
      } else {
        BRAIN.plan.setOverride('kia-extra', 'KIA', amt, {
          source: BRAIN.SOURCES.PLAN_OVERRIDE_SET,
          normalAmount: minimum,
        });
      }
      renderPaydaySavings_v2();
    },
    onCancel: () => {},
  });
}

// ─── 8. _paydayExitToTab — replaces inline "closePaydayPlan(); goPage(...)" ─
//
// Closes the canvas, closes PLAN mode (the slide-over containing the canvas),
// then navigates. Fixes B28-3 (Go to Bills routes to Darwin Trips).
// ─────────────────────────────────────────────────────────────────────────

function _paydayExitToTab(tabId) {
  // Step 1: close any open Payday sub-screen
  document.querySelectorAll('.payday-subscreen.payday-active')
    .forEach(s => s.classList.remove('payday-active'));
  // Step 2: close the Payday Plan canvas
  if (typeof closePaydayPlan === 'function') closePaydayPlan();
  // Step 3: close PLAN mode itself
  if (typeof closePlanMode === 'function') {
    closePlanMode();
  } else {
    document.body.classList.remove('plan-mode-open');
    const pgPlan = document.getElementById('pg-plan');
    if (pgPlan) pgPlan.classList.remove('active');
  }
  // Step 4: navigate
  if (typeof goPage === 'function') goPage(tabId);
}

// ─── 9. explainNumber — P1 "every number tappable" gateway ────────────────
//
// Each `<span class="explorable" onclick="explainNumber('key')">` taps here.
// The registry below is the v1 catalog; Bundle 28.3 ships ~5 entries; future
// bundles extend.
// ─────────────────────────────────────────────────────────────────────────

const NUMBER_EXPLAINERS = {
  'free-this-cycle': () => {
    const s = BRAIN.plan.getSnapshot();
    return {
      title: '$' + Math.round(s.derived.freeTotal).toLocaleString() + ' free this cycle',
      lines: [
        'Income:           +$' + Math.round(s.income).toLocaleString(),
        'Bills:            −$' + Math.round(s.bills.total).toLocaleString(),
        'Debts (min):      −$' + Math.round(s.debts.total).toLocaleString(),
        'Daily living:     −$' + Math.round(s.dailyLiving.floor * s.daysInCycle).toLocaleString(),
        '────────────────────────────',
        'Free for savings:  $' + Math.round(s.derived.freeTotal).toLocaleString(),
      ],
    };
  },
  'allocated-this-cycle': () => {
    const s = BRAIN.plan.getSnapshot();
    const byKind = (s.savings && s.savings.byKind) || {};
    return {
      title: '$' + Math.round(s.savings.total).toLocaleString() + ' allocated this cycle',
      lines: Object.entries(byKind).map(
        ([kind, items]) => kind + ': $' + items.reduce((a, b) => a + (+b.thisCycleAmount || 0), 0).toLocaleString()
      ),
    };
  },
  // Bundle 28.3 ships ~5 entries; future bundles extend.
};

function explainNumber(key) {
  const explainer = NUMBER_EXPLAINERS[key];
  if (!explainer) {
    if (typeof showToast === 'function') showToast('No explanation registered for "' + key + '"');
    return;
  }
  const data = explainer();
  EDIT_MODAL.openInfo({
    title: data.title,
    bodyHtml: '<pre style="font-family:var(--mono);font-size:13px;line-height:1.5;margin:0">' +
              data.lines.join('\n') + '</pre>',
  });
}

// ============================================================================
// End of pilot rewrite. See REWRITE-COMPARISON-2026-05-13.md for:
//   - Direct-replacement candidates (what drops in as-is)
//   - Phased migration plan
//   - Quantified before/after (LOC, abstraction depth, AI-readability)
// ============================================================================
