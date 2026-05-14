# SDD-2026-05-14-intent-driven-goal-subtitle

**Author:** Claude (Opus 4.7 1M-context) · **Date:** 2026-05-14 · **Bundle:** 28 round 72+ · **Status:** approved (R1 quick-fix scope), in-flight

## Problem

Canvas Savings sub-screen (`renderPaydaySavings` L10989) iterates `BRAIN.savings.getBuckets()` and renders by bucket name. John's two primary goals — **Property Deposit** and **Freedom Buffer** — are either not visible or mislabeled:

- `S.goalDefs[freedom-buffer]` (name "Freedom buffer", target $9,000) is linked via intent to bucket "Rainy Day Fund" → renders as "Rainy Day Fund" with bucket goal $2,000.
- `S.goalDefs[apartment]` (name "Property Deposit", target $50,000) is linked via intent to synthetic token `__mum-account__` → not rendered (no matching bucket).

PLAN-tab Goals tile already renders these correctly via `PLAN.getGoals()`. The mother surface works; the canvas mirror doesn't.

R1 is the quick-fix variant for tonight. Full Tier-3 redesign (intent-driven everything) queued for Bundle 29.

Audit trace: AUDIT-PLAN-MODE-2026-05-14.md Surface 5 + Cross-cut §A.

## Surfaces touched

- `renderPaydaySavings` (L10989) — Bucket section enrichment.
- `openEditPaydaySavings` (L10016) — modal title gets goal-context.
- `openAddBucketModal` — no change.
- Helper: new lightweight `_findIntentForBucket(bucketName)` to reverse-lookup the intent (`BRAIN.plan.intent.byBucket` already exists ✓).
- Special-case helper for the `__mum-account__` token (no real bucket; intent only).
- Artifacts: BUNDLE-28-NOTES + CHANGELOG + FEATURE-MAP.

## Proposed change

### 1. Bucket-section row builder enrichment

In `renderPaydaySavings`, after the existing `buckets` filter (L11001), reverse-lookup each bucket's linked intent so we can render the goal name as primary + bucket as subline:

```js
// R1 quick-fix: enrich each bucket row with intent-linked goal context
// so user-facing labels match S.goalDefs names (Freedom Buffer not
// Rainy Day Fund). Full intent-driven redesign is queued Bundle 29.
const _intentByBucket = (bName) => {
  try {
    if (!BRAIN.plan.intent || !BRAIN.plan.intent.byBucket) return null;
    const list = BRAIN.plan.intent.byBucket(bName) || [];
    // Prefer kind='goal' linkage; fall back to trip if no goal links here.
    return list.find(i => i && i.kind === 'goal') || null;
  } catch (_) { return null; }
};
```

Then update the row builder loop (L11058–11081) to use goal context when available:

```js
buckets.forEach(b => {
  const key = 'savings:' + b.name;
  const ov = overrides[key];
  const amt = ov ? ov.thisCycleAmount : (+planSavings[b.name] || 0);
  const saved = (+b.saved || 0);
  const target = (+b.goal || 0);
  // R1: reverse-lookup goal intent so primary label is "Freedom Buffer",
  // not "Rainy Day Fund". Bucket name becomes context-subtitle.
  const intent = _intentByBucket(b.name);
  const goalDef = intent ? (S.goalDefs || []).find(g => g.id === intent.id) : null;
  const displayName = goalDef ? goalDef.name : b.name;
  const goalTarget = goalDef ? (+goalDef.target || 0) : 0;
  const displayTarget = goalTarget > 0 ? goalTarget : target;
  const subParts = [];
  if (displayTarget > 0) {
    const pct = Math.round(saved / displayTarget * 100);
    subParts.push('$' + Math.round(saved).toLocaleString() + ' of $' + Math.round(displayTarget).toLocaleString() + ' goal (' + pct + '%)');
  } else {
    subParts.push('$' + Math.round(saved).toLocaleString() + ' saved');
  }
  if (goalDef && b.name !== goalDef.name) {
    subParts.push('stored in ' + b.name);
  }
  const bucketEmoji = goalDef && goalDef.emoji
    ? goalDef.emoji
    : (/china/i.test(b.name) ? '🌏' : /rainy/i.test(b.name) ? '🌧️' : /freedom/i.test(b.name) ? '🛡️' : /property|deposit|mum/i.test(b.name) ? '🏠' : /gift/i.test(b.name) ? '🎁' : '💰');
  html += _paydayRow({
    ticked: !!ticks[b.name],
    icon: bucketEmoji,
    name: displayName,
    sub: subParts.join(' · '),
    value: fmtC2(amt),
    onTap: "openEditPaydaySavings('" + b.name.replace(/'/g, "\\'") + "')",
    onTickTap: "paydayTick('savings', '" + b.name.replace(/'/g, "\\'") + "', BRAIN.SOURCES.PLAN_SAVINGS_TICK)",
  });
});
```

### 2. Synthetic-bucket goal row (Property Deposit case)

After the buckets-loop, render any goal-kind intents whose bucketId is a synthetic token (e.g. `__mum-account__`) and which haven't been rendered yet. These need a special row since they have no backing bucket:

```js
// R1: render goal-only entries (intents linked to synthetic accounts like
// __mum-account__ that don't have a real S.savingsBuckets entry).
// Property Deposit lives here — its "bucket" is Mum-managed savings.
try {
  const allGoalIntents = (BRAIN.plan.intent.byKind ? BRAIN.plan.intent.byKind('goal') : []) || [];
  const renderedBucketNames = new Set(buckets.map(b => b.name));
  const syntheticGoals = allGoalIntents.filter(i => {
    if (!i || !i.bucketId) return false;
    // Already-rendered: backed by a real bucket we just iterated
    if (renderedBucketNames.has(i.bucketId)) return false;
    // Synthetic token (starts with __ or is __mum-account__)
    return /^__/.test(i.bucketId);
  });
  if (syntheticGoals.length) {
    syntheticGoals.forEach(intent => {
      const goalDef = (S.goalDefs || []).find(g => g.id === intent.id);
      if (!goalDef) return;
      const saved = +goalDef.saved || 0;
      const target = +goalDef.target || 0;
      const pct = target > 0 ? Math.round(saved / target * 100) : 0;
      const subParts = [];
      if (target > 0) subParts.push('$' + Math.round(saved).toLocaleString() + ' of $' + Math.round(target).toLocaleString() + ' goal (' + pct + '%)');
      else subParts.push('$' + Math.round(saved).toLocaleString() + ' saved');
      // Special-case label for __mum-account__
      const accountLabel = intent.bucketId === '__mum-account__' ? 'via Mum-managed savings' : 'via ' + intent.bucketId.replace(/^__|__$/g, '');
      subParts.push(accountLabel);
      html += _paydayRow({
        ticked: false,
        icon: goalDef.emoji || '🎯',
        name: goalDef.name,
        sub: subParts.join(' · '),
        value: '', // synthetic goals don't have per-cycle override slot in current schema
        onTap: "editGoal('" + intent.id + "')",
      });
    });
  }
} catch (_) {}
```

Note: synthetic-bucket goals don't currently have per-cycle override slots in the canvas overrides schema. Tapping opens `editGoal` (the existing Goals-tile editor) instead of `openEditPaydaySavings`. This is intentional — Property Deposit's per-cycle flow happens via the Rent + Deposit Savings bill closed-loop (r70), NOT via Savings sub-screen allocation. The row exists for VISIBILITY, not for re-allocation here.

### 3. openEditPaydaySavings modal title with goal-context

In `openEditPaydaySavings` (L10016), if the bucket is linked to a goal intent, prepend goal name to title:

```js
const _intent = (BRAIN.plan.intent && BRAIN.plan.intent.byBucket)
  ? (BRAIN.plan.intent.byBucket(bucketName) || []).find(i => i && i.kind === 'goal')
  : null;
const _goalDef = _intent ? (S.goalDefs || []).find(g => g.id === _intent.id) : null;
const _modalTitle = _goalDef && _goalDef.name !== bucketName
  ? (_goalDef.emoji || '🎯') + ' ' + _goalDef.name + ' — this cycle'
  : '💰 ' + bucketName + ' — this cycle';
EDIT_MODAL.openCustom({
  title: _modalTitle,
  // ... existing body
});
```

## Invariants that must hold after

- All existing override keys (`savings:<bucketName>`) keep resolving — no schema migration needed.
- Cycle-allocation override flow unchanged (still writes via `BRAIN.plan.setOverride('savings', bucketName, …)`).
- All math invariants unchanged (savings.total computation is bucket-iteration; goal-name relabeling is presentational).
- Trips section, KIA extra section, Provisions note, footer 3-button row — all unchanged.
- PLAN-tab Goals tile unchanged.
- Synthetic-goal rows do NOT participate in `savings.total` math (they have no bucket entries to sum). ✓ correct — Property Deposit's per-cycle flow is the Rent bill closed-loop.

## How I'll verify

- Visual: open canvas Savings sub → "Freedom Buffer · stored in Rainy Day Fund" appears in place of "Rainy Day Fund" alone. "Property Deposit · via Mum-managed savings" appears as a synthetic row.
- Tap a goal-named row → modal title reads "🛡️ Freedom Buffer — this cycle" not "Rainy Day Fund — this cycle".
- Tap Property Deposit synthetic row → opens Goals-tile editor (editGoal).
- `BRAIN.plan.getSnapshot().savings.total` numerically identical pre/post (sanity check — no math change).
- Layer V capture post-fix.

## Rollback plan

All additions to `renderPaydaySavings` are within the existing bucket loop. Revert by reverting the changed lines + removing the synthetic-goal block + removing `_intentByBucket` helper. Override schema untouched.

## Surface to John before code?

NO — R1 approved by John 2026-05-14. R3 SDD draft for Bundle 29 lives in audit doc §E (full Tier-3 redesign).
