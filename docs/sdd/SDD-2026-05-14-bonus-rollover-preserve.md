# SDD-2026-05-14-bonus-rollover-preserve

**Author:** Claude (Opus 4.7 1M-context) · **Date:** 2026-05-14 · **Bundle:** 28 round 72+ · **Status:** approved by John, in-flight

## Problem

`BRAIN.plan.rolloverIfNeeded()` (L17940–18009) fires on every `openPaydayPlan` call when `now >= cycleEndDate`. Today (2026-05-14) IS cycleEndDate — so every canvas open today triggers a fresh cycle creation via `_emptyActivePlan()`. The new plan preserves `dailyLivingFloor`, `bufferFloor`, `driftSensitivity`, `streak` from the previous plan — but NOT `income.bonus`. Result: any bonus John added before cycle-end is silently dropped. This is the root cause of John's recurring "I added a bonus, navigated away, came back, it was gone" complaint.

Audit trace: AUDIT-PLAN-MODE-2026-05-14.md Surface 1 8-grep + Cross-cut §G.

## Surfaces touched

- `BRAIN.plan.rolloverIfNeeded` (L17940–18009) — the only mutation site.
- `BRAIN.SOURCES` enum + `_SOURCE_SET` literal — add new tag for the audit-log event.
- Boot self-test array (L11743+) — add functional verification.
- `BUNDLE-28-NOTES.md` + `CHANGELOG.md` + `FEATURE-MAP.md` — artifact updates.

## Proposed change

In `rolloverIfNeeded`, between L17983 (preserve streak) and L17984 (carry items loop), add:

```js
// Bundle 28 round 72+: preserve EXPECTED bonus across cycle rollover.
// Status='expected' = forward-looking intent (user anticipates future income).
// Status='confirmed' = past-cycle accounting; don't carry (it's history).
// Without this preserve, the user's pre-rollover bonus is silently dropped.
const prevBonus = prevPlan.income && prevPlan.income.bonus;
if (prevBonus && prevBonus.included && prevBonus.status === 'expected' && (+prevBonus.amount || 0) > 0) {
  newPlan.income = newPlan.income || { netPay: +S.income || 0, bonus: { amount: 0, included: false, status: 'expected' } };
  newPlan.income.bonus = { amount: +prevBonus.amount, included: true, status: 'expected' };
  BRAIN.audit.append({
    type: 'plan_bonus_carried_to_new_cycle',
    amount: +prevBonus.amount,
    previousCycle: prevPlan.cycleId,
    newCycle: newPlan.cycleId,
    ts: Date.now(),
  });
}
```

Then in the success return path (L18004 area), include bonus-carry info in the return envelope so the caller (openPaydayPlan L9442) can surface a toast:

```js
return {
  ok: true,
  previousCycle: prevPlan.cycleId,
  newCycle: newPlan.cycleId,
  carried: carryItems,
  bonusCarried: prevBonus && prevBonus.included && prevBonus.status === 'expected' && (+prevBonus.amount || 0) > 0
    ? { amount: +prevBonus.amount } : null,
};
```

In `openPaydayPlan` L9443-9444, extend the toast logic to mention bonus carry-forward when `r.bonusCarried` is set:

```js
if (r && r.ok) {
  const msgs = [];
  if (r.carried && r.carried.length) msgs.push(r.carried.length + ' deferred item(s) carried over');
  if (r.bonusCarried) msgs.push('$' + Math.round(r.bonusCarried.amount).toLocaleString() + ' bonus carried forward');
  if (msgs.length && typeof showToast === 'function') {
    showToast('🔁 New cycle started — ' + msgs.join(' · '));
  }
}
```

**No new SOURCES tag needed.** Rollover events don't carry a source (see L18000-18007 existing pattern); the new event type `plan_bonus_carried_to_new_cycle` is sufficient for audit-log traceability.

## Invariants that must hold after

- `BRAIN.plan.getSnapshot()` reflects carried bonus IFF prior cycle had `bonus.included && status==='expected'` AND amount > 0.
- `S.activePlan.income.bonus` has the canonical shape `{amount, included, status}` after rollover regardless of carry.
- Audit log includes `plan_cycle_rollover` AND (when carry happens) `plan_bonus_carried_to_new_cycle` for the same rollover event.
- `confirmed` and `included:false` bonuses do NOT carry — only forward-looking expected bonuses.
- All 13 math invariants stay green.
- 51 runtime checks stay green.

## How I'll verify

- **Manual unit test:** Build a fixture with `S.activePlan.cycleEndDate` = yesterday, `income.bonus = {amount: 1500, included: true, status: 'expected'}`. Open canvas → assert `S.activePlan.income.bonus.amount === 1500` AND new `cycleEndDate` is post-payday-next. Repeat with `status: 'confirmed'` → assert bonus does NOT carry. Repeat with `included: false` → no carry.
- **Boot self-test entry:** `'BRAIN.plan.rolloverIfNeeded preserves expected bonus' — callable + carries on synthetic state`.
- **Layer V `--local` capture:** after fix, open canvas with bonus state → capture should show bonus pill labelled with carried amount.
- **Tests:** `npm run runtime` + `npm test` green.

## Rollback plan

Single block addition to `rolloverIfNeeded` + envelope extension + openPaydayPlan toast extension — all isolated. Revert: remove the inserted block + revert envelope + revert toast logic. Pre-existing rollover path remains untouched at all other touch-points.

## Surface to John before code?

NO — already approved as P0.1 in audit Summary; John gave "go for fix sprint." Proceed.
